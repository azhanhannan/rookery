import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type {
  AuthResponse,
  CoachGameResponse,
  CoachGamesResponse,
  CoachInviteResponse,
  CoachLinksResponse,
  CoachStudentsResponse,
  CoachUnreadResponse,
  CoachGameCommentsResponse,
  HomeworkItem,
  HomeworkListResponse,
  HomeworkResponse,
} from '../../src/api/types';
import type { GameRecord, PlayerInfo } from '../../src/game/types';
import { play } from '../unit/helpers';
import { signup, useServer } from './helpers';

// oxlint-disable-next-line react-hooks/rules-of-hooks -- a test helper named like a hook, not a hook
const server = useServer();

type Who = { cookie: string; id: string };

async function user(app: FastifyInstance, name: string): Promise<Who> {
  const cookie = await signup(app, name);
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  return { cookie, id: me.json<AuthResponse>().user.id };
}

const call = (app: FastifyInstance, who: Who | undefined, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: who ? { cookie: who.cookie } : {}, ...(payload === undefined ? {} : { payload }) });

async function invite(app: FastifyInstance, student: Who): Promise<string> {
  const res = await call(app, student, 'POST', '/api/coach/invite');
  expect(res.statusCode).toBe(201);
  return res.json<CoachInviteResponse>().code;
}

async function link(app: FastifyInstance, coach: Who, student: Who): Promise<void> {
  const code = await invite(app, student);
  const res = await call(app, coach, 'POST', '/api/coach/redeem', { code });
  expect(res.statusCode).toBe(200);
}

function botWin(name: string): GameRecord {
  const you: PlayerInfo = { name, isBot: false };
  const bot: PlayerInfo = { name: 'Bot 800', isBot: true, elo: 800 };
  return { ...play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']), white: you, black: bot, result: '1-0', termination: 'resignation' };
}

async function saveGame(app: FastifyInstance, who: Who, record: GameRecord): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/games/${encodeURIComponent(record.id)}`,
    headers: { cookie: who.cookie },
    payload: { record, userColor: 'w', rated: false },
  });
  expect(res.statusCode).toBe(201);
}

// Scholar's-mate set-up: White to play Qxf7#.
const MATE_ITEM: HomeworkItem = {
  fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  solution: ['h5f7'],
};

/** Every coach-side read and write for `studentId` (with a game and a homework id to aim at). */
function coachRoutes(studentId: string, clientId: string): [method: 'GET' | 'POST', url: string, payload?: object][] {
  const s = `/api/coach/students/${studentId}`;
  return [
    ['GET', `${s}/games`],
    ['GET', `${s}/games/${encodeURIComponent(clientId)}`],
    ['POST', `${s}/games/${encodeURIComponent(clientId)}/comments`, { body: 'Look at move 3' }],
    ['GET', `${s}/homework`],
    ['POST', `${s}/homework`, { title: 'Mates', items: [MATE_ITEM] }],
  ];
}

describe('coach–student link', () => {
  it('every route needs a signed-in player', async () => {
    const app = server.app();
    for (const [method, url] of [
      ['POST', '/api/coach/invite'],
      ['POST', '/api/coach/redeem'],
      ['GET', '/api/coach/links'],
      ['GET', '/api/coach/students'],
      ['GET', '/api/coach/students/x/games'],
      ['GET', '/api/coach/homework'],
      ['GET', '/api/coach/comments/unread'],
    ] as const) {
      expect((await call(app, undefined, method, url, method === 'POST' ? {} : undefined)).statusCode, url).toBe(401);
    }
  });

  it('links with a code; a coach can have many students and a student many coaches', async () => {
    const app = server.app();
    const [ana, bob, coach1, coach2] = [await user(app, 'Ana'), await user(app, 'Bob'), await user(app, 'Rahim'), await user(app, 'Siti')];
    await link(app, coach1, ana);
    await link(app, coach1, bob);
    await link(app, coach2, ana);

    const anaLinks = (await call(app, ana, 'GET', '/api/coach/links')).json<CoachLinksResponse>();
    expect(anaLinks.coaches.map((c) => c.username).sort()).toEqual(['Rahim', 'Siti']);
    expect(anaLinks.students).toEqual([]);
    const students = (await call(app, coach1, 'GET', '/api/coach/students')).json<CoachStudentsResponse>().students;
    expect(students.map((s) => s.username).sort()).toEqual(['Ana', 'Bob']);
    expect(students[0].lastActive).not.toBeNull(); // signing up started a session
  });

  it('accepts a code typed in lower case without the dash', async () => {
    const app = server.app();
    const [ana, coach] = [await user(app, 'Ana'), await user(app, 'Rahim')];
    const code = await invite(app, ana);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const res = await call(app, coach, 'POST', '/api/coach/redeem', { code: code.replace('-', ' ').toLowerCase() });
    expect(res.statusCode).toBe(200);
    expect(res.json().student.username).toBe('Ana');
  });

  it('refuses a reused code, an expired code, an unknown code, a replaced code and your own code', async () => {
    const app = server.app();
    const db = server.db();
    const [ana, coach, other] = [await user(app, 'Ana'), await user(app, 'Rahim'), await user(app, 'Mallory')];

    const code = await invite(app, ana);
    expect((await call(app, ana, 'POST', '/api/coach/redeem', { code })).statusCode).toBe(400);
    expect((await call(app, coach, 'POST', '/api/coach/redeem', { code })).statusCode).toBe(200);
    const reused = await call(app, other, 'POST', '/api/coach/redeem', { code });
    expect(reused.statusCode).toBe(410);
    expect(reused.json().error).toMatch(/already been used/);
    expect((await call(app, other, 'GET', '/api/coach/students')).json<CoachStudentsResponse>().students).toEqual([]);

    const old = await invite(app, ana);
    await invite(app, ana); // a new code replaces the unused one
    expect((await call(app, other, 'POST', '/api/coach/redeem', { code: old })).statusCode).toBe(404);

    const late = await invite(app, ana);
    await db.coachInvite.updateMany({ where: { studentId: ana.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await call(app, other, 'POST', '/api/coach/redeem', { code: late });
    expect(expired.statusCode).toBe(410);
    expect(expired.json().error).toMatch(/expired/);

    expect((await call(app, other, 'POST', '/api/coach/redeem', { code: 'ABCD-EFGH' })).statusCode).toBe(404);
    expect(await db.coachLink.count({ where: { coachId: other.id } })).toBe(0);
  });

  it('pauses redeeming after too many wrong codes', async () => {
    const app = server.app();
    const coach = await user(app, 'Guesser');
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call(app, coach, 'POST', '/api/coach/redeem', { code: `ZZZZ-ZZ${i}` })).statusCode;
    expect(last).toBe(429);
  });

  it('a coach reads a linked student’s games with review accuracy, comments, and homework', async () => {
    const app = server.app();
    const [ana, coach] = [await user(app, 'Ana'), await user(app, 'Rahim')];
    const record = botWin('Ana');
    await saveGame(app, ana, record);
    await link(app, coach, ana);

    const games = (await call(app, coach, 'GET', `/api/coach/students/${ana.id}/games`)).json<CoachGamesResponse>();
    expect(games.games.map((g) => g.clientId)).toEqual([record.id]);
    expect(games.games[0].accuracy).toBeNull();
    expect(games.games[0].comments).toBe(0);

    const c = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/games/${record.id}/comments`, { body: 'Why not d4 here?', ply: 3 });
    expect(c.statusCode).toBe(201);
    expect((await call(app, coach, 'POST', `/api/coach/students/${ana.id}/games/${record.id}/comments`, { body: 'x', ply: 99 })).statusCode).toBe(400);
    const game = (await call(app, coach, 'GET', `/api/coach/students/${ana.id}/games/${record.id}`)).json<CoachGameResponse>();
    expect(game.record.id).toBe(record.id);
    expect(game.comments.map((x) => [x.ply, x.body])).toEqual([[3, 'Why not d4 here?']]);

    // The student: an unread count, the comment on that game, then read.
    const unread = (await call(app, ana, 'GET', '/api/coach/comments/unread')).json<CoachUnreadResponse>();
    expect(unread).toEqual({ count: 1, games: [{ clientId: record.id, total: 1, unread: 1, latestAt: expect.any(String) }] });
    const mine = (await call(app, ana, 'GET', `/api/coach/comments/${record.id}`)).json<CoachGameCommentsResponse>();
    expect(mine.comments[0].coach.username).toBe('Rahim');
    expect((await call(app, ana, 'POST', `/api/coach/comments/${record.id}/read`)).statusCode).toBe(204);
    const after = (await call(app, ana, 'GET', '/api/coach/comments/unread')).json<CoachUnreadResponse>();
    expect(after.count).toBe(0);
    expect(after.games[0]).toMatchObject({ clientId: record.id, total: 1, unread: 0 });

    // Homework: set, solve (one miss, then a solve), the coach sees the attempts.
    const bad = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, { title: 'Mates', items: [{ ...MATE_ITEM, solution: ['h5h8'] }] });
    expect(bad.statusCode).toBe(400);
    const even = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, { title: 'Mates', items: [{ ...MATE_ITEM, solution: ['h5f7', 'e8f7'] }] });
    expect(even.statusCode).toBe(400);
    const set = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, {
      title: 'Mates',
      items: [MATE_ITEM],
      dueAt: '2026-10-20T00:00:00.000Z',
    });
    expect(set.statusCode).toBe(201);
    const hw = set.json<HomeworkResponse>().homework;
    expect(hw.progress).toEqual([{ attempts: 0, solved: false }]);

    const listed = (await call(app, ana, 'GET', '/api/coach/homework')).json<HomeworkListResponse>().homework;
    expect(listed.map((h) => h.id)).toEqual([hw.id]);
    expect((await call(app, ana, 'POST', `/api/coach/homework/${hw.id}/attempt`, { item: 0, solved: false })).statusCode).toBe(200);
    expect((await call(app, ana, 'POST', `/api/coach/homework/${hw.id}/attempt`, { item: 5, solved: true })).statusCode).toBe(400);
    const done = (await call(app, ana, 'POST', `/api/coach/homework/${hw.id}/attempt`, { item: 0, solved: true })).json<HomeworkResponse>();
    expect(done.homework.done).toBe(true);

    const seen = (await call(app, coach, 'GET', `/api/coach/students/${ana.id}/homework`)).json<HomeworkListResponse>().homework;
    expect(seen[0].progress).toEqual([{ attempts: 2, solved: true }]);
    expect(seen[0].done).toBe(true);
    const row = (await call(app, coach, 'GET', '/api/coach/students')).json<CoachStudentsResponse>().students[0];
    expect(row.games).toBe(1);
    expect(row.openHomework).toBe(0);
  });

  describe('authorisation', () => {
    it('an unlinked coach can read or write nothing of a student’s', async () => {
      const app = server.app();
      const [ana, stranger] = [await user(app, 'Ana'), await user(app, 'Mallory')];
      const record = botWin('Ana');
      await saveGame(app, ana, record);
      for (const [method, url, payload] of coachRoutes(ana.id, record.id)) {
        const res = await call(app, stranger, method, url, payload);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.body).not.toContain(record.id);
      }
      expect(await server.db().coachComment.count()).toBe(0);
      expect(await server.db().homework.count()).toBe(0);
    });

    it('unlinking (either side) ends access at once', async () => {
      const app = server.app();
      const [ana, coach] = [await user(app, 'Ana'), await user(app, 'Rahim')];
      const record = botWin('Ana');
      await saveGame(app, ana, record);

      // The student unlinks.
      await link(app, coach, ana);
      expect((await call(app, coach, 'GET', `/api/coach/students/${ana.id}/games`)).statusCode).toBe(200);
      expect((await call(app, ana, 'DELETE', `/api/coach/coaches/${coach.id}`)).statusCode).toBe(204);
      for (const [method, url, payload] of coachRoutes(ana.id, record.id))
        expect((await call(app, coach, method, url, payload)).statusCode, `${method} ${url}`).toBe(404);
      expect((await call(app, coach, 'GET', '/api/coach/students')).json<CoachStudentsResponse>().students).toEqual([]);

      // The coach unlinks; their homework drops off the student's list and can't be attempted or deleted.
      await link(app, coach, ana);
      const hw = (await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, { title: 'Mates', items: [MATE_ITEM] })).json<HomeworkResponse>().homework;
      expect((await call(app, coach, 'DELETE', `/api/coach/students/${ana.id}`)).statusCode).toBe(204);
      for (const [method, url, payload] of coachRoutes(ana.id, record.id))
        expect((await call(app, coach, method, url, payload)).statusCode, `${method} ${url}`).toBe(404);
      expect((await call(app, coach, 'DELETE', `/api/coach/homework/${hw.id}`)).statusCode).toBe(404);
      expect((await call(app, ana, 'GET', '/api/coach/homework')).json<HomeworkListResponse>().homework).toEqual([]);
      expect((await call(app, ana, 'POST', `/api/coach/homework/${hw.id}/attempt`, { item: 0, solved: true })).statusCode).toBe(404);

      // Unlinking twice: nothing to unlink.
      expect((await call(app, coach, 'DELETE', `/api/coach/students/${ana.id}`)).statusCode).toBe(404);
      expect((await call(app, ana, 'DELETE', `/api/coach/coaches/${coach.id}`)).statusCode).toBe(404);
    });

    it('a coach linked to one student can’t reach another student through it', async () => {
      const app = server.app();
      const [ana, bob, coach] = [await user(app, 'Ana'), await user(app, 'Bob'), await user(app, 'Rahim')];
      const bobGame = botWin('Bob');
      await saveGame(app, bob, bobGame);
      await link(app, coach, ana);
      // Bob's game asked for under Ana's id, and under Bob's own.
      expect((await call(app, coach, 'GET', `/api/coach/students/${ana.id}/games/${bobGame.id}`)).statusCode).toBe(404);
      expect((await call(app, coach, 'POST', `/api/coach/students/${ana.id}/games/${bobGame.id}/comments`, { body: 'hi' })).statusCode).toBe(404);
      for (const [method, url, payload] of coachRoutes(bob.id, bobGame.id))
        expect((await call(app, coach, method, url, payload)).statusCode, `${method} ${url}`).toBe(404);
    });

    it('a student can’t read another student’s comments or homework, nor act as their coach', async () => {
      const app = server.app();
      const [ana, bob, coach] = [await user(app, 'Ana'), await user(app, 'Bob'), await user(app, 'Rahim')];
      const anaGame = botWin('Ana');
      await saveGame(app, ana, anaGame);
      await link(app, coach, ana);
      await link(app, coach, bob);
      await call(app, coach, 'POST', `/api/coach/students/${ana.id}/games/${anaGame.id}/comments`, { body: 'Private to Ana' });
      const hw = (await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, { title: 'Ana only', items: [MATE_ITEM] })).json<HomeworkResponse>().homework;

      const comments = await call(app, bob, 'GET', `/api/coach/comments/${anaGame.id}`);
      expect(comments.json<CoachGameCommentsResponse>().comments).toEqual([]);
      expect((await call(app, bob, 'GET', '/api/coach/comments/unread')).json<CoachUnreadResponse>()).toEqual({ count: 0, games: [] });
      await call(app, bob, 'POST', `/api/coach/comments/${anaGame.id}/read`);
      expect((await call(app, ana, 'GET', '/api/coach/comments/unread')).json<CoachUnreadResponse>().count).toBe(1);

      expect((await call(app, bob, 'GET', '/api/coach/homework')).json<HomeworkListResponse>().homework).toEqual([]);
      expect((await call(app, bob, 'POST', `/api/coach/homework/${hw.id}/attempt`, { item: 0, solved: true })).statusCode).toBe(404);
      expect((await call(app, bob, 'DELETE', `/api/coach/homework/${hw.id}`)).statusCode).toBe(404);
      // Sharing a coach doesn't make Bob Ana's coach.
      for (const [method, url, payload] of coachRoutes(ana.id, anaGame.id))
        expect((await call(app, bob, method, url, payload)).statusCode, `${method} ${url}`).toBe(404);
      // And the student can't unlink someone else's coach.
      expect((await call(app, bob, 'DELETE', `/api/coach/students/${ana.id}`)).statusCode).toBe(404);
      expect(await server.db().coachLink.count({ where: { studentId: ana.id } })).toBe(1);
    });

    it('one student’s coaches don’t see each other’s comments', async () => {
      const app = server.app();
      const [ana, c1, c2] = [await user(app, 'Ana'), await user(app, 'Rahim'), await user(app, 'Siti')];
      const record = botWin('Ana');
      await saveGame(app, ana, record);
      await link(app, c1, ana);
      await link(app, c2, ana);
      await call(app, c1, 'POST', `/api/coach/students/${ana.id}/games/${record.id}/comments`, { body: 'from Rahim' });
      const seen = (await call(app, c2, 'GET', `/api/coach/students/${ana.id}/games/${record.id}`)).json<CoachGameResponse>();
      expect(seen.comments).toEqual([]);
      expect((await call(app, ana, 'GET', `/api/coach/comments/${record.id}`)).json<CoachGameCommentsResponse>().comments).toHaveLength(1);
    });
  });
});
