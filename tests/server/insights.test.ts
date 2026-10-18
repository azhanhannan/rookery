import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type {
  AuthResponse,
  CoachFocusResponse,
  CoachInsightsResponse,
  CoachInviteResponse,
  InsightsFactsResponse,
} from '../../src/api/types';
import { INSIGHTS } from '../../src/config/tunables';
import { CLOSING_LINE } from '../../src/insights/profile';
import type { GameRecord } from '../../src/game/types';
import { backfillInsights } from '../../server/src/insights/store';
import { makeGame } from '../fixtures/insights';
import { signup, useServer } from './helpers';

// oxlint-disable-next-line react-hooks/rules-of-hooks -- a test helper named like a hook, not a hook
const server = useServer();

type Who = { cookie: string; id: string };
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function user(app: FastifyInstance, name: string): Promise<Who> {
  const cookie = await signup(app, name);
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  return { cookie, id: me.json<AuthResponse>().user.id };
}

const call = (app: FastifyInstance, who: Who | undefined, method: Method, url: string, payload?: object) =>
  app.inject({ method, url, headers: who ? { cookie: who.cookie } : {}, ...(payload === undefined ? {} : { payload }) });

async function link(app: FastifyInstance, coach: Who, student: Who): Promise<void> {
  const code = (await call(app, student, 'POST', '/api/coach/invite')).json<CoachInviteResponse>().code;
  expect((await call(app, coach, 'POST', '/api/coach/redeem', { code })).statusCode).toBe(200);
}

/**
 * A reviewed 24-ply game (White = the player, against a bot) in which White's 3rd move gives away 30% win
 * chance; the engine's best there was e2e4 (the knights have just gone back home, so it is the start position).
 */
function blunderGame(i: number, reviewed = true): GameRecord {
  return makeGame({
    id: `game-${String(i).padStart(3, '0')}`,
    wins: (k) => (k < 5 ? 50 : 20),
    engine: { 4: { bestMove: 'e2e4', bestLine: ['e2e4'] } },
    createdAt: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
    reviewed,
  });
}

async function save(app: FastifyInstance, who: Who, record: GameRecord, status = 201): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/games/${encodeURIComponent(record.id)}`,
    headers: { cookie: who.cookie },
    payload: { record, userColor: 'w', rated: false },
  });
  expect(res.statusCode, res.body).toBe(status);
}

async function saveMany(app: FastifyInstance, who: Who, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await save(app, who, blunderGame(i));
}

const facts = async (app: FastifyInstance, who: Who) => {
  const res = await call(app, who, 'GET', '/api/insights/facts');
  expect(res.statusCode).toBe(200);
  return res.json<InsightsFactsResponse>();
};

describe('insights', () => {
  it('every route needs a signed-in player', async () => {
    const app = server.app();
    for (const [method, url] of [
      ['GET', '/api/insights/facts'],
      ['GET', '/api/insights/coach-focus'],
      ['GET', '/api/coach/students/x/insights'],
      ['PUT', '/api/coach/students/x/focus'],
      ['DELETE', '/api/coach/students/x/focus'],
    ] as const) {
      expect((await call(app, undefined, method, url, method === 'PUT' ? {} : undefined)).statusCode, url).toBe(401);
    }
  });

  it('stores facts when a game is saved and when it is re-uploaded with a review; reports coverage and coach link', async () => {
    const app = server.app();
    const db = server.db();
    const ana = await user(app, 'Ana');
    await save(app, ana, blunderGame(1));
    await save(app, ana, blunderGame(2, false));
    expect(await db.gameInsight.count({ where: { userId: ana.id } })).toBe(2);

    let res = await facts(app, ana);
    expect(res.factsVersion).toBe(INSIGHTS.factsVersion);
    expect(res.facts.map((f) => f.gameId)).toEqual(['game-001']);
    expect(res.coverage).toEqual({ total: 2, included: 1, excluded: { unreviewed: 1 } });
    expect(res.history.map((h) => h.gameId)).toEqual(['game-001', 'game-002']);
    expect(res.coachLinked).toBe(false);
    const move = res.facts[0].moves.find((m) => m.ply === 5)!;
    expect(move.loss).toBe(30);

    // The same game again, now reviewed: its row is replaced.
    await save(app, ana, blunderGame(2), 200);
    res = await facts(app, ana);
    expect(res.facts.map((f) => f.gameId)).toEqual(['game-001', 'game-002']);
    expect(res.coverage).toEqual({ total: 2, included: 2, excluded: {} });

    await link(app, await user(app, 'Rahim'), ana);
    expect((await facts(app, ana)).coachLinked).toBe(true);

    // Only the player's own games.
    const bob = await user(app, 'Bob');
    expect((await facts(app, bob)).coverage.total).toBe(0);
  });

  it('rebuilds rows that are missing or behind factsVersion when they are read', async () => {
    const app = server.app();
    const db = server.db();
    const ana = await user(app, 'Ana');
    await saveMany(app, ana, 3);
    const stale = await db.game.findFirstOrThrow({ where: { clientId: 'game-001' } });
    await db.gameInsight.update({ where: { gameId: stale.id }, data: { factsVersion: INSIGHTS.factsVersion - 1, facts: { junk: true } } });
    const missing = await db.game.findFirstOrThrow({ where: { clientId: 'game-002' } });
    await db.gameInsight.delete({ where: { gameId: missing.id } });

    const res = await facts(app, ana);
    expect(res.facts.map((f) => f.gameId)).toEqual(['game-000', 'game-001', 'game-002']);
    expect(res.facts.every((f) => f.factsVersion === INSIGHTS.factsVersion)).toBe(true);
    // factsVersion 2: the three-way opponent split (a bot with no engine field is a Stockfish level).
    expect(res.facts.map((f) => f.opponent)).toEqual(['stockfish', 'stockfish', 'stockfish']);
    const rows = await db.gameInsight.findMany({ where: { userId: ana.id } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.factsVersion === INSIGHTS.factsVersion)).toBe(true);
  });

  it('backfills every account at start-up', async () => {
    const app = server.app();
    const db = server.db();
    const [ana, bob] = [await user(app, 'Ana'), await user(app, 'Bob')];
    await saveMany(app, ana, 2);
    await save(app, bob, blunderGame(7));
    await db.gameInsight.deleteMany({});
    await db.gameInsight.count().then((n) => expect(n).toBe(0));

    expect(await backfillInsights(db)).toBe(3);
    expect(await db.gameInsight.count()).toBe(3);
    expect(await backfillInsights(db)).toBe(0); // nothing left to do
  });

  it('a coach reads a linked student’s insights with evidence positions; 404 without a link', async () => {
    const app = server.app();
    const [ana, coach, stranger] = [await user(app, 'Ana'), await user(app, 'Rahim'), await user(app, 'Mallory')];
    await saveMany(app, ana, 12);

    expect((await call(app, coach, 'GET', `/api/coach/students/${ana.id}/insights`)).statusCode).toBe(404);
    await link(app, coach, ana);
    expect((await call(app, stranger, 'GET', `/api/coach/students/${ana.id}/insights`)).statusCode).toBe(404);
    expect((await call(app, coach, 'GET', `/api/coach/students/nobody/insights`)).statusCode).toBe(404);

    const res = await call(app, coach, 'GET', `/api/coach/students/${ana.id}/insights`);
    expect(res.statusCode).toBe(200);
    const body = res.json<CoachInsightsResponse>();
    expect(body.student.username).toBe('Ana');
    expect(body.insights.status).toBe('early');
    expect(body.insights.games).toBe(12);
    expect(body.insights.coverage).toEqual({ total: 12, included: 12, excluded: {} });
    expect(body.trends).toEqual([]); // fewer than 40 games
    expect(body.focus).toBeNull();
    // "Their recent games": below 20 games, only "n of 20".
    expect(body.profile).toMatchObject({ status: 'locked', games: 12, needGames: 8, lines: [], waiting: [], closing: CLOSING_LINE });

    const row = body.insights.ledger.cells.find((c) => c.id === 'O:other')!;
    expect(row.shown).toBe(true);
    const ev = body.evidence['O:other']!;
    expect(ev).toHaveLength(INSIGHTS.notableMoves);
    expect(ev[0]).toMatchObject({ ply: 5, loss: 30, san: 'Nf3', motif: 'other', phase: 'O', color: 'w', opponentName: 'Opp' });
    expect(ev[0].homework).toEqual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3',
      solution: ['e2e4'],
      source: { gameClientId: ev[0].clientId, ply: 5 },
    });

    // The positions go straight into homework and comments.
    const hw = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/homework`, {
      title: 'Opening slips',
      items: [ev[0].homework],
    });
    expect(hw.statusCode).toBe(201);
    const c = await call(app, coach, 'POST', `/api/coach/students/${ana.id}/games/${ev[0].clientId}/comments`, {
      body: 'Develop the centre first',
      ply: ev[0].ply,
    });
    expect(c.statusCode).toBe(201);
  });

  it('includes long-term trends once there are 40 games', async () => {
    const app = server.app();
    const [ana, coach] = [await user(app, 'Ana'), await user(app, 'Rahim')];
    await saveMany(app, ana, INSIGHTS.minSample.trendGames);
    await link(app, coach, ana);
    const body = (await call(app, coach, 'GET', `/api/coach/students/${ana.id}/insights`)).json<CoachInsightsResponse>();
    expect(body.insights.status).toBe('ready');
    const trend = body.trends.find((t) => t.bucketId === 'O:other');
    expect(trend).toMatchObject({ games: INSIGHTS.minSample.trendGames, shown: true, direction: 'no-clear-change' });
    expect(body.trends.every((t) => t.shown)).toBe(true);
  });

  it('a coach sees the student’s profile (people and Maia only for converting); the public profile shows none of it', async () => {
    const app = server.app();
    const [ana, coach] = [await user(app, 'Ana'), await user(app, 'Rahim')];
    // 20 wins against Maia bots from a clearly winning position (80% from ply 12 on), 3 against Stockfish levels.
    const winning = (i: number, engine: 'maia' | 'stockfish') =>
      makeGame({
        id: `${engine}-${i}`,
        wins: (k) => (k < 12 ? 50 : 80),
        result: '1-0',
        botEngine: engine,
        reviewVersion: 2,
        createdAt: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
      });
    for (let i = 0; i < 20; i++) await save(app, ana, winning(i, 'maia'));
    for (let i = 0; i < 3; i++) await save(app, ana, winning(20 + i, 'stockfish'));
    await link(app, coach, ana);
    expect((await call(app, coach, 'PUT', `/api/coach/students/${ana.id}/focus`, { bucketId: 'conversion' })).statusCode).toBe(200);

    const body = (await call(app, coach, 'GET', `/api/coach/students/${ana.id}/insights`)).json<CoachInsightsResponse>();
    const p = body.profile;
    expect(p).toMatchObject({ status: 'open', games: 23, closing: CLOSING_LINE });
    expect(p.window.opponents).toEqual({ human: 0, maia: 20, stockfish: 3 });
    expect(p.groupNote).toBe('Mostly from games against bots (23 of 23).');
    const conv = p.lines.find((l) => l.id === 'conversion')!;
    expect(conv).toMatchObject({ group: 'human-like', n: 20, tone: 'strength', state: 'clear', isFocus: true });
    expect(conv.note).toContain('3 clearly winning positions against Stockfish levels left out');
    // The coach Focus outranks the ledger's pick, and the matching line says so.
    expect(p.focus).toEqual({ id: 'conversion', lineId: 'conversion' });

    // Nothing of it on the public profile, signed out or as the coach.
    for (const who of [undefined, coach]) {
      const pub = await call(app, who, 'GET', '/api/profile/Ana');
      expect(pub.statusCode).toBe(200);
      for (const word of [CLOSING_LINE, 'recent games', '"waiting"', '"groupNote"', '"lineId"', 'converted']) expect(pub.body).not.toContain(word);
    }
    // And no link, no profile.
    const stranger = await user(app, 'Mallory');
    expect((await call(app, stranger, 'GET', `/api/coach/students/${ana.id}/insights`)).statusCode).toBe(404);
  });

  it('a coach sets and clears the student’s Focus; the student reads it; unlinking removes it', async () => {
    const app = server.app();
    const db = server.db();
    const [ana, rahim, siti, stranger] = [await user(app, 'Ana'), await user(app, 'Rahim'), await user(app, 'Siti'), await user(app, 'Mallory')];
    await link(app, rahim, ana);
    await link(app, siti, ana);
    const url = `/api/coach/students/${ana.id}/focus`;
    const studentFocus = async () => (await call(app, ana, 'GET', '/api/insights/coach-focus')).json<CoachFocusResponse>().focus;

    expect(await studentFocus()).toBeNull();
    expect((await call(app, stranger, 'PUT', url, { bucketId: 'E:hanging' })).statusCode).toBe(404);
    expect((await call(app, rahim, 'PUT', url, { bucketId: 'O:other' })).statusCode).toBe(400);
    expect((await call(app, rahim, 'PUT', url, { bucketId: 'nonsense' })).statusCode).toBe(400);
    expect((await call(app, rahim, 'PUT', url, { bucketId: 'E:hanging', note: 42 })).statusCode).toBe(400);

    const set = await call(app, rahim, 'PUT', url, { bucketId: 'E:hanging', note: ' Check every piece is guarded ' });
    expect(set.statusCode).toBe(200);
    expect(set.json<CoachFocusResponse>().focus).toMatchObject({ bucketId: 'E:hanging', note: 'Check every piece is guarded', coach: { username: 'Rahim' } });
    expect(await studentFocus()).toMatchObject({ bucketId: 'E:hanging', coach: { username: 'Rahim' } });
    const seen = (await call(app, siti, 'GET', `/api/coach/students/${ana.id}/insights`)).json<CoachInsightsResponse>();
    expect(seen.focus?.bucketId).toBe('E:hanging');

    // One active Focus per student: the latest set wins.
    expect((await call(app, siti, 'PUT', url, { bucketId: 'time-trouble' })).statusCode).toBe(200);
    expect(await studentFocus()).toMatchObject({ bucketId: 'time-trouble', note: null, coach: { username: 'Siti' } });
    expect(await db.coachFocus.count()).toBe(1);

    // Only the coach who set it can clear it.
    expect((await call(app, rahim, 'DELETE', url)).statusCode).toBe(404);
    expect((await call(app, stranger, 'DELETE', url)).statusCode).toBe(404);
    expect((await call(app, siti, 'DELETE', url)).statusCode).toBe(204);
    expect(await studentFocus()).toBeNull();

    // Unlinking (either side) deletes that coach's Focus.
    await call(app, rahim, 'PUT', url, { bucketId: 'M:fork' });
    expect((await call(app, rahim, 'DELETE', `/api/coach/students/${ana.id}`)).statusCode).toBe(204);
    expect(await studentFocus()).toBeNull();
    expect(await db.coachFocus.count()).toBe(0);
    await call(app, siti, 'PUT', url, { bucketId: 'conversion' });
    expect((await call(app, ana, 'DELETE', `/api/coach/coaches/${siti.id}`)).statusCode).toBe(204);
    expect(await db.coachFocus.count()).toBe(0);
  });
});
