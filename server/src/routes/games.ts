import type { FastifyInstance } from 'fastify';
import { Prisma, type Game } from '../../generated/prisma/client';
import { RATINGS } from '../../../src/config/tunables';
import {
  GAME_FILTERS,
  type GameFilter,
  type GameIdsResponse,
  type GameStats,
  type GameListResponse,
  type GameResponse,
  type RatingCategory,
  type SaveGameRequest,
  type SaveGameResponse,
} from '../../../src/api/types';
import type { GameRecord } from '../../../src/game/types';
import { isProvisional, rateGame, ratedCategoryFor, ratingIneligibleReason, scoreFor } from '../../../src/rating/glicko';
import { requireUser } from '../auth/session';
import type { Db } from '../db';
import { opponentNameFor, storedRecord, toSummary } from '../games/summary';
import { validateSaveRequest } from '../games/validate';

type Params = { clientId: string };

const WON: Prisma.GameWhereInput[] = [
  { userColor: 'w', result: '1-0' },
  { userColor: 'b', result: '0-1' },
];
const LOST: Prisma.GameWhereInput[] = [
  { userColor: 'w', result: '0-1' },
  { userColor: 'b', result: '1-0' },
];

function filterWhere(filter: GameFilter): Prisma.GameWhereInput {
  switch (filter) {
    case 'won':
      return { OR: WON };
    case 'lost':
      return { OR: LOST };
    case 'drawn':
      return { result: '1/2-1/2', userColor: { not: null } };
    case 'rated':
      return { rated: true };
    case 'casual':
      return { rated: false };
    default:
      return {};
  }
}

async function gameStats(db: Db, userId: string): Promise<GameStats> {
  const count = (where: Prisma.GameWhereInput) => db.game.count({ where: { userId, ...where } });
  const [total, won, lost, drawn] = await Promise.all([
    count({}),
    count(filterWhere('won')),
    count(filterWhere('lost')),
    count(filterWhere('drawn')),
  ]);
  return { total, won, lost, drawn };
}

/** Same game: same start, same moves, same result. Anything else under one id is a different game. */
function sameGame(a: GameRecord, b: GameRecord): boolean {
  return (
    a.startFen === b.startFen &&
    a.result === b.result &&
    a.moves.length === b.moves.length &&
    a.moves.every((m, i) => m.uci === b.moves[i].uci)
  );
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Stores a game the server has not seen and, when it qualifies, applies its rating — all in one
 * transaction, so the rating is applied exactly when the Game row is created. A concurrent upload
 * of the same game fails on the (userId, clientId) unique index and returns 'exists'. The player's
 * Rating row is locked (FOR UPDATE) so two different games finishing at once can't lose an update.
 */
async function saveNew(
  db: Db,
  userId: string,
  { record, userColor, rated }: SaveGameRequest,
  playedAt: Date,
): Promise<SaveGameResponse | 'exists'> {
  const reason = rated ? ratingIneligibleReason(record, userColor) : null;
  const category: RatingCategory | null = rated && reason === null ? ratedCategoryFor(record.timeControl) : null;
  try {
    return await db.$transaction(async (tx) => {
      const game = await tx.game.create({
        data: {
          userId,
          clientId: record.id,
          record: record as unknown as Prisma.InputJsonValue,
          result: record.result,
          userColor,
          opponentName: opponentNameFor(record, userColor),
          category,
          rated: category !== null,
          playedAt,
        },
      });
      if (!category || !userColor) {
        return reason ? { game: toSummary(game), unratedReason: reason } : { game: toSummary(game) };
      }

      const { rating, rd, volatility } = RATINGS.start;
      await tx.$executeRaw`
        INSERT INTO "Rating" ("userId", "category", "rating", "rd", "volatility", "games", "updatedAt")
        VALUES (${userId}, ${category}, ${rating}, ${rd}, ${volatility}, 0, now())
        ON CONFLICT DO NOTHING`;
      const [before] = await tx.$queryRaw<{ rating: number; rd: number; volatility: number }[]>`
        SELECT "rating", "rd", "volatility" FROM "Rating"
        WHERE "userId" = ${userId} AND "category" = ${category} FOR UPDATE`;

      const bot = userColor === 'w' ? record.black : record.white;
      // ratingIneligibleReason has checked the bot's elo is a BOT_LEVELS (or, for Maia, a MAIA.levels) level.
      const after = rateGame(before, { rating: bot.elo!, rd: RATINGS.botRd }, scoreFor(record.result, userColor));
      await tx.rating.update({
        where: { userId_category: { userId, category } },
        data: { rating: after.rating, rd: after.rd, volatility: after.volatility, games: { increment: 1 } },
      });
      await tx.ratingEvent.create({
        data: { userId, gameId: game.id, category, ratingBefore: before.rating, ratingAfter: after.rating, rdAfter: after.rd },
      });
      return {
        game: toSummary(game),
        rating: {
          category,
          before: Math.round(before.rating),
          after: Math.round(after.rating),
          delta: Math.round(after.rating - before.rating),
          provisional: isProvisional(after.rd),
        },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return 'exists';
    throw err;
  }
}

/** Re-upload of a stored game: the record is replaced (e.g. now with its review), the rating never re-applied. */
async function replaceExisting(db: Db, existing: Game, record: GameRecord): Promise<SaveGameResponse | null> {
  if (!sameGame(storedRecord(existing), record)) return null;
  const game = await db.game.update({
    where: { id: existing.id },
    data: { record: record as unknown as Prisma.InputJsonValue },
  });
  return { game: toSummary(game) };
}

export async function gameRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.put<{ Params: Params }>('/games/:clientId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const v = validateSaveRequest(request.body, request.params.clientId);
    if (!v.ok) return reply.code(400).send({ error: v.error });
    const where = { userId_clientId: { userId: user.id, clientId: v.request.record.id } };

    let existing = await db.game.findUnique({ where });
    if (!existing) {
      const saved = await saveNew(db, user.id, v.request, v.playedAt);
      if (saved !== 'exists') return reply.code(201).send(saved satisfies SaveGameResponse);
      existing = await db.game.findUnique({ where });
      if (!existing) throw new Error('game vanished after a unique violation');
    }
    const replaced = await replaceExisting(db, existing, v.request.record);
    if (!replaced) {
      return reply
        .code(409)
        .send({ error: 'A different game is already saved under this id. Its moves or result cannot be changed.' });
    }
    return reply.send(replaced satisfies SaveGameResponse);
  });

  app.get('/games/ids', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const rows = await db.game.findMany({ where: { userId: user.id }, select: { clientId: true } });
    return reply.send({ clientIds: rows.map((r) => r.clientId) } satisfies GameIdsResponse);
  });

  app.get<{ Querystring: { before?: string; filter?: string } }>('/games', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const { before } = request.query;
    const beforeDate = before === undefined ? null : new Date(before);
    if (beforeDate && !Number.isFinite(beforeDate.getTime()))
      return reply.code(400).send({ error: '"before" must be a date.' });
    const filter = (request.query.filter ?? 'all') as GameFilter;
    if (!GAME_FILTERS.includes(filter))
      return reply.code(400).send({ error: `"filter" must be one of ${GAME_FILTERS.join(', ')}.` });
    const scope = { userId: user.id, ...filterWhere(filter) };

    const order = [{ playedAt: 'desc' as const }, { id: 'desc' as const }];
    const games = await db.game.findMany({
      where: { ...scope, ...(beforeDate ? { playedAt: { lt: beforeDate } } : {}) },
      orderBy: order,
      take: RATINGS.pageSize,
      include: { ratingEvent: true },
    });
    let nextBefore: string | null = null;
    const last = games.at(-1);
    if (games.length === RATINGS.pageSize && last) {
      // The cursor is a bare playedAt, so a page must never split games that share one:
      // take the rest of the last timestamp's games into this page.
      const ties = await db.game.findMany({
        where: { ...scope, playedAt: last.playedAt, id: { notIn: games.map((g) => g.id) } },
        orderBy: order,
        include: { ratingEvent: true },
      });
      games.push(...ties);
      const more = await db.game.findFirst({
        where: { ...scope, playedAt: { lt: last.playedAt } },
        select: { id: true },
      });
      if (more) nextBefore = last.playedAt.toISOString();
    }
    const stats = beforeDate ? undefined : await gameStats(db, user.id);
    return reply.send({ games: games.map(toSummary), nextBefore, ...(stats ? { stats } : {}) } satisfies GameListResponse);
  });

  app.get<{ Params: Params }>('/games/:clientId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const game = await db.game.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: request.params.clientId } },
    });
    if (!game) return reply.code(404).send({ error: 'No saved game with that id.' });
    return reply.send({ game: toSummary(game), record: storedRecord(game) } satisfies GameResponse);
  });
}
