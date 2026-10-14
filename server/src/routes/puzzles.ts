import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/client';
import { PUZZLES, RATINGS } from '../../../src/config/tunables';
import type { PuzzleAttemptResponse, PuzzleMeResponse, PuzzleRatingRow } from '../../../src/api/types';
import { isProvisional, rateGame } from '../../../src/rating/glicko';
import { requireUser } from '../auth/session';
import type { Db } from '../db';
import type { PuzzleCatalog } from '../puzzles/catalog';

/** The Rating row category that holds a player's puzzle rating (never shown among game ratings). */
export const PUZZLE_CATEGORY = 'puzzle';

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** The player's puzzle rating, or null before their first attempt. */
export async function puzzleRatingRow(db: Db, userId: string): Promise<PuzzleRatingRow | null> {
  const [row, solved] = await Promise.all([
    db.rating.findUnique({ where: { userId_category: { userId, category: PUZZLE_CATEGORY } } }),
    db.puzzleAttempt.count({ where: { userId, solved: true } }),
  ]);
  if (!row) return null;
  return {
    rating: Math.round(row.rating),
    rd: Math.round(row.rd),
    attempts: row.games,
    solved,
    provisional: isProvisional(row.rd),
  };
}

/**
 * Rates a first attempt: the PuzzleAttempt row and the rating change are one transaction. A repeat
 * (or a concurrent duplicate) fails on the (userId, puzzleId) unique index and changes nothing. The
 * Rating row is locked (FOR UPDATE) so two different puzzles finishing at once can't lose an update.
 */
async function rateAttempt(
  db: Db,
  userId: string,
  puzzleId: string,
  puzzleRating: number,
  solved: boolean,
): Promise<PuzzleAttemptResponse> {
  try {
    return await db.$transaction(async (tx) => {
      const attempt = await tx.puzzleAttempt.create({
        data: { userId, puzzleId, solved, ratingBefore: 0, ratingAfter: 0 },
      });

      const { rating, rd, volatility } = RATINGS.start;
      await tx.$executeRaw`
        INSERT INTO "Rating" ("userId", "category", "rating", "rd", "volatility", "games", "updatedAt")
        VALUES (${userId}, ${PUZZLE_CATEGORY}, ${rating}, ${rd}, ${volatility}, 0, now())
        ON CONFLICT DO NOTHING`;
      const [before] = await tx.$queryRaw<{ rating: number; rd: number; volatility: number }[]>`
        SELECT "rating", "rd", "volatility" FROM "Rating"
        WHERE "userId" = ${userId} AND "category" = ${PUZZLE_CATEGORY} FOR UPDATE`;

      const after = rateGame(before, { rating: puzzleRating, rd: PUZZLES.puzzleRd }, solved ? 1 : 0);
      await tx.rating.update({
        where: { userId_category: { userId, category: PUZZLE_CATEGORY } },
        data: { rating: after.rating, rd: after.rd, volatility: after.volatility, games: { increment: 1 } },
      });
      await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: { ratingBefore: before.rating, ratingAfter: after.rating },
      });
      return {
        firstAttempt: true,
        rating: {
          before: Math.round(before.rating),
          after: Math.round(after.rating),
          delta: Math.round(after.rating - before.rating),
          provisional: isProvisional(after.rd),
        },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { firstAttempt: false };
    throw err;
  }
}

export async function puzzleRoutes(app: FastifyInstance, { db, puzzles }: { db: Db; puzzles: PuzzleCatalog }) {
  app.post<{ Params: { id: string } }>('/puzzles/:id/attempt', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body: unknown = request.body;
    if (typeof body !== 'object' || body === null || typeof (body as { solved?: unknown }).solved !== 'boolean')
      return reply.code(400).send({ error: '"solved" must be true or false.' });
    const { solved } = body as { solved: boolean };

    const puzzleId = request.params.id;
    const puzzleRating = puzzles.ratingOf(puzzleId);
    if (puzzleRating === null) return reply.code(404).send({ error: 'Unknown puzzle.' });

    return reply.send((await rateAttempt(db, user.id, puzzleId, puzzleRating, solved)) satisfies PuzzleAttemptResponse);
  });

  app.get('/puzzles/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const [rating, tried] = await Promise.all([
      puzzleRatingRow(db, user.id),
      db.puzzleAttempt.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PUZZLES.recentLimit,
        select: { puzzleId: true },
      }),
    ]);
    return reply.send({ rating, triedIds: tried.map((t) => t.puzzleId) } satisfies PuzzleMeResponse);
  });
}
