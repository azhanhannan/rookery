import { createHash, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Game } from '../../generated/prisma/client';
import { COACH } from '../../../src/config/tunables';
import type {
  CoachComment,
  CoachCommentResponse,
  CoachCommentedGame,
  CoachGameCommentsResponse,
  CoachGameResponse,
  CoachGameSummary,
  CoachGamesResponse,
  CoachInviteResponse,
  CoachLinksResponse,
  CoachRedeemResponse,
  CoachStudentRow,
  CoachStudentsResponse,
  CoachUnreadResponse,
  CoachUser,
  Homework,
  HomeworkItem,
  HomeworkListResponse,
  HomeworkResponse,
  RatingCategory,
} from '../../../src/api/types';
import { cleanHomeworkItem, homeworkItemError } from '../../../src/coach/homework';
import { isProvisional } from '../../../src/rating/glicko';
import { requireUser } from '../auth/session';
import { LoginThrottle } from '../auth/throttle';
import type { Db } from '../db';
import { storedRecord, toSummary } from '../games/summary';

/** Letters and digits that can't be misread for each other (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Upper-case, without spaces or dashes: what a typed code is compared as. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

const hashCode = (code: string) => createHash('sha256').update(normalizeCode(code)).digest('hex');

function newCode(): string {
  let raw = '';
  for (let i = 0; i < COACH.codeLength; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const half = Math.ceil(raw.length / 2);
  return `${raw.slice(0, half)}-${raw.slice(half)}`;
}

const NOT_LINKED = 'No student by that id is linked to you.';
const notFound = (reply: FastifyReply, error: string) => reply.code(404).send({ error });

type UserRow = { id: string; username: string };
const userSelect = { id: true, username: true } as const;
const toUser = (u: UserRow): CoachUser => ({ id: u.id, username: u.username });

/**
 * The authorisation check every coach route makes: the student, when `coachId` has an active link to
 * `studentId`; otherwise null. Callers answer 404 for null, so a stranger can't tell who exists.
 */
async function linkedStudent(db: Db, coachId: string, studentId: string): Promise<UserRow | null> {
  const link = await db.coachLink.findUnique({
    where: { coachId_studentId: { coachId, studentId } },
    include: { student: { select: userSelect } },
  });
  return link?.student ?? null;
}

function toComment(c: { id: string; ply: number | null; body: string; createdAt: Date; readAt: Date | null; coach: UserRow }): CoachComment {
  return {
    id: c.id,
    coach: toUser(c.coach),
    ply: c.ply,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    readAt: c.readAt ? c.readAt.toISOString() : null,
  };
}

type HomeworkRow = {
  id: string;
  title: string;
  items: Prisma.JsonValue;
  dueAt: Date | null;
  createdAt: Date;
  coach: UserRow;
  student: UserRow;
  attempts: { item: number; solved: boolean }[];
};
const homeworkInclude = {
  coach: { select: userSelect },
  student: { select: userSelect },
  attempts: { select: { item: true, solved: true } },
} as const;

function toHomework(h: HomeworkRow): Homework {
  const items = h.items as unknown as HomeworkItem[];
  const progress = items.map(() => ({ attempts: 0, solved: false }));
  for (const a of h.attempts) {
    const p = progress[a.item];
    if (!p) continue;
    p.attempts++;
    if (a.solved) p.solved = true;
  }
  return {
    id: h.id,
    coach: toUser(h.coach),
    student: toUser(h.student),
    title: h.title,
    items,
    dueAt: h.dueAt ? h.dueAt.toISOString() : null,
    createdAt: h.createdAt.toISOString(),
    progress,
    done: progress.every((p) => p.solved),
  };
}

function accuracyOf(game: Game): number | null {
  const review = storedRecord(game).review;
  if (!review || (game.userColor !== 'w' && game.userColor !== 'b')) return null;
  const acc = (game.userColor === 'w' ? review.white : review.black).accuracy;
  return typeof acc === 'number' ? Math.round(acc * 10) / 10 : null;
}

const latest = (...dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

async function studentRow(db: Db, coachId: string, student: UserRow, since: Date): Promise<CoachStudentRow> {
  const id = student.id;
  const [ratings, game, puzzle, session, homeworkAttempt, games, homework] = await Promise.all([
    db.rating.findMany({ where: { userId: id } }),
    db.game.aggregate({ where: { userId: id }, _max: { updatedAt: true } }),
    db.puzzleAttempt.aggregate({ where: { userId: id }, _max: { createdAt: true } }),
    db.session.aggregate({ where: { userId: id }, _max: { createdAt: true } }),
    db.homeworkAttempt.aggregate({ where: { homework: { studentId: id } }, _max: { createdAt: true } }),
    db.game.count({ where: { userId: id } }),
    db.homework.findMany({ where: { coachId, studentId: id }, include: homeworkInclude }),
  ]);
  const order = ['bullet', 'blitz', 'rapid', 'classical', 'puzzle'];
  const last = latest(game._max.updatedAt, puzzle._max.createdAt, session._max.createdAt, homeworkAttempt._max.createdAt);
  return {
    ...toUser(student),
    since: since.toISOString(),
    ratings: ratings
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
      .map((r) => ({ category: r.category as RatingCategory | 'puzzle', rating: Math.round(r.rating), provisional: isProvisional(r.rd) })),
    lastActive: last ? last.toISOString() : null,
    games,
    openHomework: homework.map(toHomework).filter((h) => !h.done).length,
  };
}

/** "<ISO playedAt>|<game id>": a cursor that never splits games sharing a timestamp. */
function parseCursor(before: string | undefined): { at: Date; id: string } | null | 'bad' {
  if (before === undefined) return null;
  const [iso, id] = before.split('|');
  const at = new Date(iso);
  if (!id || !Number.isFinite(at.getTime())) return 'bad';
  return { at, id };
}

// Coach–student link. The student's side needs only a session; every coach-side route goes through
// linkedStudent() first. See src/api/types.ts for the contract.
export async function coachRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const redeemThrottle = new LoginThrottle(COACH.redeemAttempts, COACH.redeemWindowMs);

  // ---- Linking -------------------------------------------------------------------------------

  app.post('/coach/invite', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const expiresAt = new Date(Date.now() + COACH.inviteHours * 3_600_000);
    await db.coachInvite.deleteMany({ where: { studentId: user.id, usedAt: null } });
    for (let tries = 0; ; tries++) {
      const code = newCode();
      try {
        await db.coachInvite.create({ data: { id: hashCode(code), studentId: user.id, expiresAt } });
        return reply.code(201).send({ code, expiresAt: expiresAt.toISOString() } satisfies CoachInviteResponse);
      } catch (err) {
        const clash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!clash || tries >= 4) throw err;
      }
    }
  });

  app.post('/coach/redeem', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    if (redeemThrottle.blocked(user.id))
      return reply.code(429).send({ error: 'Too many wrong codes. Try again in a few minutes.' });
    const code = (request.body as { code?: unknown } | null)?.code;
    if (typeof code !== 'string' || !code.trim() || code.length > 40)
      return reply.code(400).send({ error: 'Enter the code your student gave you.' });

    const invite = await db.coachInvite.findUnique({
      where: { id: hashCode(code) },
      include: { student: { select: userSelect } },
    });
    if (!invite) {
      redeemThrottle.fail(user.id);
      return notFound(reply, 'That code is not right. Check it with your student.');
    }
    if (invite.studentId === user.id) return reply.code(400).send({ error: 'That is your own code: give it to your coach.' });
    if (invite.usedAt) {
      redeemThrottle.fail(user.id);
      return reply.code(410).send({ error: 'That code has already been used. Ask your student for a new one.' });
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      redeemThrottle.fail(user.id);
      return reply.code(410).send({ error: 'That code has expired. Ask your student for a new one.' });
    }
    const linked = await db.$transaction(async (tx) => {
      // Only one redeem can use the code, even when two coaches send it at the same moment.
      const used = await tx.coachInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) return false;
      await tx.coachLink.upsert({
        where: { coachId_studentId: { coachId: user.id, studentId: invite.studentId } },
        create: { coachId: user.id, studentId: invite.studentId },
        update: {},
      });
      return true;
    });
    if (!linked) return reply.code(410).send({ error: 'That code has already been used. Ask your student for a new one.' });
    redeemThrottle.clear(user.id);
    return reply.send({ student: toUser(invite.student) } satisfies CoachRedeemResponse);
  });

  app.get('/coach/links', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const [asStudent, asCoach] = await Promise.all([
      db.coachLink.findMany({ where: { studentId: user.id }, include: { coach: { select: userSelect } }, orderBy: { createdAt: 'asc' } }),
      db.coachLink.findMany({ where: { coachId: user.id }, include: { student: { select: userSelect } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return reply.send({
      coaches: asStudent.map((l) => ({ ...toUser(l.coach), since: l.createdAt.toISOString() })),
      students: asCoach.map((l) => ({ ...toUser(l.student), since: l.createdAt.toISOString() })),
    } satisfies CoachLinksResponse);
  });

  app.delete<{ Params: { coachId: string } }>('/coach/coaches/:coachId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const gone = await db.coachLink.deleteMany({ where: { coachId: request.params.coachId, studentId: user.id } });
    if (!gone.count) return notFound(reply, 'That coach is not linked to you.');
    return reply.code(204).send();
  });

  app.delete<{ Params: { studentId: string } }>('/coach/students/:studentId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const gone = await db.coachLink.deleteMany({ where: { coachId: user.id, studentId: request.params.studentId } });
    if (!gone.count) return notFound(reply, NOT_LINKED);
    return reply.code(204).send();
  });

  // ---- Coach side (every route: linkedStudent first) -----------------------------------------

  app.get('/coach/students', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const links = await db.coachLink.findMany({
      where: { coachId: user.id },
      include: { student: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
    const students = await Promise.all(links.map((l) => studentRow(db, user.id, l.student, l.createdAt)));
    return reply.send({ students } satisfies CoachStudentsResponse);
  });

  app.get<{ Params: { studentId: string }; Querystring: { before?: string } }>(
    '/coach/students/:studentId/games',
    async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const student = await linkedStudent(db, user.id, request.params.studentId);
      if (!student) return notFound(reply, NOT_LINKED);
      const cursor = parseCursor(request.query.before);
      if (cursor === 'bad') return reply.code(400).send({ error: '"before" is not a page cursor.' });

      const games = await db.game.findMany({
        where: {
          userId: student.id,
          ...(cursor ? { OR: [{ playedAt: { lt: cursor.at } }, { playedAt: cursor.at, id: { lt: cursor.id } }] } : {}),
        },
        orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
        take: COACH.gamesPageSize + 1,
        include: { ratingEvent: true },
      });
      const more = games.length > COACH.gamesPageSize;
      const page = games.slice(0, COACH.gamesPageSize);
      const counts = await db.coachComment.groupBy({
        by: ['gameId'],
        where: { coachId: user.id, gameId: { in: page.map((g) => g.id) } },
        _count: { _all: true },
      });
      const byGame = new Map(counts.map((c) => [c.gameId, c._count._all]));
      const last = page.at(-1);
      return reply.send({
        student: toUser(student),
        games: page.map((g): CoachGameSummary => ({ ...toSummary(g), accuracy: accuracyOf(g), comments: byGame.get(g.id) ?? 0 })),
        nextBefore: more && last ? `${last.playedAt.toISOString()}|${last.id}` : null,
      } satisfies CoachGamesResponse);
    },
  );

  /** The student's game by clientId, only when `coachId` is linked to them. */
  async function linkedGame(coachId: string, studentId: string, clientId: string) {
    const student = await linkedStudent(db, coachId, studentId);
    if (!student) return null;
    const game = await db.game.findUnique({ where: { userId_clientId: { userId: student.id, clientId } } });
    return game ? { student, game } : null;
  }

  app.get<{ Params: { studentId: string; clientId: string } }>(
    '/coach/students/:studentId/games/:clientId',
    async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const found = await linkedGame(user.id, request.params.studentId, request.params.clientId);
      if (!found) return notFound(reply, 'No game by that id for a student linked to you.');
      // A coach sees their own comments only: one student's coaches don't read each other's notes.
      const comments = await db.coachComment.findMany({
        where: { gameId: found.game.id, coachId: user.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { coach: { select: userSelect } },
      });
      return reply.send({
        student: toUser(found.student),
        game: toSummary(found.game),
        record: storedRecord(found.game),
        comments: comments.map(toComment),
      } satisfies CoachGameResponse);
    },
  );

  app.post<{ Params: { studentId: string; clientId: string } }>(
    '/coach/students/:studentId/games/:clientId/comments',
    async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const found = await linkedGame(user.id, request.params.studentId, request.params.clientId);
      if (!found) return notFound(reply, 'No game by that id for a student linked to you.');
      const b = (request.body ?? {}) as { body?: unknown; ply?: unknown };
      const body = typeof b.body === 'string' ? b.body.trim() : '';
      if (!body) return reply.code(400).send({ error: 'Write a comment first.' });
      if (body.length > COACH.maxCommentChars)
        return reply.code(400).send({ error: `A comment can be at most ${COACH.maxCommentChars} characters.` });
      const plies = storedRecord(found.game).moves.length;
      const ply = b.ply === undefined || b.ply === null ? null : b.ply;
      if (ply !== null && (!Number.isInteger(ply) || (ply as number) < 1 || (ply as number) > plies))
        return reply.code(400).send({ error: `"ply" must be a move of this game (1-${plies}).` });
      const comment = await db.coachComment.create({
        data: { coachId: user.id, studentId: found.student.id, gameId: found.game.id, ply: ply as number | null, body },
        include: { coach: { select: userSelect } },
      });
      return reply.code(201).send({ comment: toComment(comment) } satisfies CoachCommentResponse);
    },
  );

  app.get<{ Params: { studentId: string } }>('/coach/students/:studentId/homework', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const student = await linkedStudent(db, user.id, request.params.studentId);
    if (!student) return notFound(reply, NOT_LINKED);
    const rows = await db.homework.findMany({
      where: { coachId: user.id, studentId: student.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: homeworkInclude,
    });
    return reply.send({ homework: rows.map(toHomework) } satisfies HomeworkListResponse);
  });

  app.post<{ Params: { studentId: string } }>('/coach/students/:studentId/homework', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const student = await linkedStudent(db, user.id, request.params.studentId);
    if (!student) return notFound(reply, NOT_LINKED);
    const b = (request.body ?? {}) as { title?: unknown; items?: unknown; dueAt?: unknown };
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) return reply.code(400).send({ error: 'Give the homework a title.' });
    if (title.length > COACH.maxTitleChars)
      return reply.code(400).send({ error: `A title can be at most ${COACH.maxTitleChars} characters.` });
    if (!Array.isArray(b.items) || b.items.length === 0)
      return reply.code(400).send({ error: 'Add at least one position.' });
    if (b.items.length > COACH.maxHomeworkItems)
      return reply.code(400).send({ error: `A homework set can have at most ${COACH.maxHomeworkItems} positions.` });
    for (const [i, item] of b.items.entries()) {
      const error = homeworkItemError(item);
      if (error) return reply.code(400).send({ error: `Position ${i + 1}: ${error}` });
    }
    let dueAt: Date | null = null;
    if (b.dueAt !== undefined && b.dueAt !== null) {
      dueAt = typeof b.dueAt === 'string' ? new Date(b.dueAt) : null;
      if (!dueAt || !Number.isFinite(dueAt.getTime())) return reply.code(400).send({ error: '"dueAt" must be a date.' });
    }
    const items = (b.items as HomeworkItem[]).map(cleanHomeworkItem);
    const row = await db.homework.create({
      data: { coachId: user.id, studentId: student.id, title, items: items as unknown as Prisma.InputJsonValue, dueAt },
      include: homeworkInclude,
    });
    return reply.code(201).send({ homework: toHomework(row) } satisfies HomeworkResponse);
  });

  app.delete<{ Params: { id: string } }>('/coach/homework/:id', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const hw = await db.homework.findUnique({ where: { id: request.params.id }, select: { id: true, coachId: true, studentId: true } });
    if (!hw || hw.coachId !== user.id || !(await linkedStudent(db, user.id, hw.studentId)))
      return notFound(reply, 'No homework by that id that you set.');
    await db.homework.delete({ where: { id: hw.id } });
    return reply.code(204).send();
  });

  // ---- Student side (own data only) -----------------------------------------------------------

  app.get('/coach/comments/unread', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const [all, unread] = await Promise.all([
      db.coachComment.groupBy({ by: ['gameId'], where: { studentId: user.id }, _count: { _all: true }, _max: { createdAt: true } }),
      db.coachComment.groupBy({ by: ['gameId'], where: { studentId: user.id, readAt: null }, _count: { _all: true } }),
    ]);
    const games = await db.game.findMany({
      where: { id: { in: all.map((g) => g.gameId) }, userId: user.id },
      select: { id: true, clientId: true },
    });
    const clientIds = new Map(games.map((g) => [g.id, g.clientId]));
    const unreadBy = new Map(unread.map((g) => [g.gameId, g._count._all]));
    const list: CoachCommentedGame[] = all
      .filter((g) => clientIds.has(g.gameId))
      .map((g) => ({
        clientId: clientIds.get(g.gameId)!,
        total: g._count._all,
        unread: unreadBy.get(g.gameId) ?? 0,
        latestAt: (g._max.createdAt ?? new Date(0)).toISOString(),
      }))
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    return reply.send({ count: list.reduce((n, g) => n + g.unread, 0), games: list } satisfies CoachUnreadResponse);
  });

  /** One of the signed-in player's own games (the only way the student side finds a game). */
  const ownGame = (userId: string, clientId: string) =>
    db.game.findUnique({ where: { userId_clientId: { userId, clientId } }, select: { id: true } });

  app.get<{ Params: { clientId: string } }>('/coach/comments/:clientId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const game = await ownGame(user.id, request.params.clientId);
    if (!game) return reply.send({ comments: [] } satisfies CoachGameCommentsResponse);
    const comments = await db.coachComment.findMany({
      where: { gameId: game.id, studentId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { coach: { select: userSelect } },
    });
    return reply.send({ comments: comments.map(toComment) } satisfies CoachGameCommentsResponse);
  });

  app.post<{ Params: { clientId: string } }>('/coach/comments/:clientId/read', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const game = await ownGame(user.id, request.params.clientId);
    if (game) {
      await db.coachComment.updateMany({ where: { gameId: game.id, studentId: user.id, readAt: null }, data: { readAt: new Date() } });
    }
    return reply.code(204).send();
  });

  app.get('/coach/homework', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    // Only from current coaches: unlinking a coach takes their homework off the list.
    const rows = await db.homework.findMany({
      where: { studentId: user.id, coach: { coachLinks: { some: { studentId: user.id } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: homeworkInclude,
    });
    return reply.send({ homework: rows.map(toHomework) } satisfies HomeworkListResponse);
  });

  app.post<{ Params: { id: string } }>('/coach/homework/:id/attempt', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const hw = await db.homework.findUnique({ where: { id: request.params.id }, select: { id: true, coachId: true, studentId: true, items: true } });
    const linked = hw && hw.studentId === user.id && (await linkedStudent(db, hw.coachId, user.id));
    if (!hw || !linked) return notFound(reply, 'No homework by that id for you.');
    const b = (request.body ?? {}) as { item?: unknown; solved?: unknown };
    const count = (hw.items as unknown as HomeworkItem[]).length;
    if (!Number.isInteger(b.item) || (b.item as number) < 0 || (b.item as number) >= count)
      return reply.code(400).send({ error: `"item" must be a position of this homework (0-${count - 1}).` });
    if (typeof b.solved !== 'boolean') return reply.code(400).send({ error: '"solved" must be true or false.' });
    await db.homeworkAttempt.create({ data: { homeworkId: hw.id, item: b.item as number, solved: b.solved } });
    const row = await db.homework.findUniqueOrThrow({ where: { id: hw.id }, include: homeworkInclude });
    return reply.send({ homework: toHomework(row) } satisfies HomeworkResponse);
  });
}
