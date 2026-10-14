import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ProfileResponse,
  PuzzleAttemptResponse,
  PuzzleMeResponse,
  SaveGameRequest,
} from '../../src/api/types';
import { RATINGS } from '../../src/config/tunables';
import type { GameRecord } from '../../src/game/types';
import { buildApp } from '../../server/src/app';
import { mapCatalog, parseCatalog } from '../../server/src/puzzles/catalog';
import { play } from '../unit/helpers';
import { signup, useServer } from './helpers';

const server = useServer();

// A small injected catalog: the route must use these ratings, whatever the client says.
const CATALOG = { easy: 800, even: 1500, hard: 2200, p1: 1500, p2: 1500, p3: 1500 };
let app: FastifyInstance | null = null;
beforeEach(async () => {
  if (!app) app = await buildApp({ db: server.db(), puzzles: mapCatalog(CATALOG) });
});
afterAll(async () => {
  await app?.close();
});
const api = () => app!;

async function attempt(cookie: string, id: string, solved: boolean): Promise<PuzzleAttemptResponse> {
  const res = await api().inject({ method: 'POST', url: `/api/puzzles/${id}/attempt`, headers: { cookie }, payload: { solved } });
  if (res.statusCode !== 200) throw new Error(`attempt failed: ${res.statusCode} ${res.body}`);
  return res.json<PuzzleAttemptResponse>();
}

async function me(cookie: string): Promise<PuzzleMeResponse> {
  const res = await api().inject({ method: 'GET', url: '/api/puzzles/me', headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json<PuzzleMeResponse>();
}

describe('POST /puzzles/:id/attempt', () => {
  it('401s when signed out', async () => {
    const res = await api().inject({ method: 'POST', url: '/api/puzzles/easy/attempt', payload: { solved: true } });
    expect(res.statusCode).toBe(401);
    expect((await api().inject({ method: 'GET', url: '/api/puzzles/me' })).statusCode).toBe(401);
  });

  it('404s for a puzzle not in the catalog, and stores nothing', async () => {
    const cookie = await signup(api(), 'Ana');
    const res = await api().inject({ method: 'POST', url: '/api/puzzles/nope/attempt', headers: { cookie }, payload: { solved: true } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Unknown puzzle.');
    expect(await server.db().puzzleAttempt.count()).toBe(0);
    expect(await server.db().rating.count()).toBe(0);
  });

  it('400s for a missing or non-boolean "solved"', async () => {
    const cookie = await signup(api(), 'Ana');
    for (const payload of [{}, { solved: 'yes' }, { solved: 1 }, { solved: null }]) {
      const res = await api().inject({ method: 'POST', url: '/api/puzzles/easy/attempt', headers: { cookie }, payload });
      expect(res.statusCode).toBe(400);
    }
    const noBody = await api().inject({ method: 'POST', url: '/api/puzzles/easy/attempt', headers: { cookie } });
    expect(noBody.statusCode).toBe(400);
    expect(await server.db().puzzleAttempt.count()).toBe(0);
  });

  it('a solved first attempt raises the rating from the start value and is stored', async () => {
    const cookie = await signup(api(), 'Ana');
    const r = await attempt(cookie, 'even', true);
    expect(r.firstAttempt).toBe(true);
    expect(r.rating!.before).toBe(RATINGS.start.rating);
    expect(r.rating!.after).toBeGreaterThan(r.rating!.before);
    expect(r.rating!.delta).toBe(r.rating!.after - r.rating!.before);
    expect(r.rating!.provisional).toBe(true);
    for (const n of [r.rating!.before, r.rating!.after, r.rating!.delta]) expect(Number.isInteger(n)).toBe(true);

    const row = await server.db().puzzleAttempt.findFirstOrThrow();
    expect(row).toMatchObject({ puzzleId: 'even', solved: true, ratingBefore: RATINGS.start.rating });
    expect(Math.round(row.ratingAfter)).toBe(r.rating!.after);
    const rating = await server.db().rating.findFirstOrThrow();
    expect(rating).toMatchObject({ category: 'puzzle', games: 1 });
  });

  it('a failed first attempt lowers it; the catalog rating matters, not the client', async () => {
    const cookie = await signup(api(), 'Ana');
    const failEasy = await attempt(cookie, 'easy', false);
    expect(failEasy.rating!.after).toBeLessThan(RATINGS.start.rating);

    const bob = await signup(api(), 'Bob');
    // A rating sent by the client is ignored.
    const res = await api().inject({
      method: 'POST',
      url: '/api/puzzles/hard/attempt',
      headers: { cookie: bob },
      payload: { solved: false, rating: 100 },
    });
    const failHard = res.json<PuzzleAttemptResponse>();
    // Failing a 2200 puzzle costs much less than failing an 800 one.
    expect(failHard.rating!.delta).toBeLessThan(0);
    expect(Math.abs(failHard.rating!.delta)).toBeLessThan(Math.abs(failEasy.rating!.delta));
  });

  it('a repeat attempt is not a first attempt and changes nothing', async () => {
    const cookie = await signup(api(), 'Ana');
    const first = await attempt(cookie, 'even', true);
    const again = await attempt(cookie, 'even', false);
    expect(again).toEqual({ firstAttempt: false });
    const m = await me(cookie);
    expect(m.rating).toMatchObject({ rating: first.rating!.after, attempts: 1, solved: 1 });
    expect(await server.db().puzzleAttempt.count()).toBe(1);

    // Another player's first attempt at the same puzzle still counts.
    const bob = await signup(api(), 'Bob');
    expect((await attempt(bob, 'even', true)).firstAttempt).toBe(true);
  });

  it('concurrent first attempts at the same puzzle are counted exactly once', async () => {
    const cookie = await signup(api(), 'Ana');
    const results = await Promise.all([true, false, true, false].map((s) => attempt(cookie, 'even', s)));
    expect(results.filter((r) => r.firstAttempt)).toHaveLength(1);
    expect(results.filter((r) => !r.firstAttempt)).toHaveLength(3);
    const counted = results.find((r) => r.firstAttempt)!;
    const m = await me(cookie);
    expect(m.rating).toMatchObject({ attempts: 1, rating: counted.rating!.after });
    expect(m.triedIds).toEqual(['even']);
  });

  it('concurrent attempts at different puzzles all count, with no lost update', async () => {
    const cookie = await signup(api(), 'Ana');
    const results = await Promise.all(['p1', 'p2', 'p3'].map((id) => attempt(cookie, id, true)));
    expect(results.every((r) => r.firstAttempt)).toBe(true);
    const m = await me(cookie);
    expect(m.rating!.attempts).toBe(3);
    expect(m.rating!.solved).toBe(3);
    // Serialised by the row lock: each attempt started from the one before it.
    const rows = await server.db().puzzleAttempt.findMany();
    const befores = rows.map((r) => r.ratingBefore).sort((a, b) => a - b);
    const afters = rows.map((r) => r.ratingAfter).sort((a, b) => a - b);
    expect(befores[0]).toBe(RATINGS.start.rating);
    expect(befores.slice(1)).toEqual(afters.slice(0, 2));
    const stored = await server.db().rating.findFirstOrThrow({ where: { category: 'puzzle' } });
    expect(stored.rating).toBe(afters[2]);
  });
});

describe('GET /puzzles/me', () => {
  it('is null with no tried ids before any attempt', async () => {
    const cookie = await signup(api(), 'Ana');
    expect(await me(cookie)).toEqual({ rating: null, triedIds: [] });
  });

  it('returns the rating, attempts, solved count and tried ids newest first', async () => {
    const cookie = await signup(api(), 'Ana');
    await attempt(cookie, 'easy', true);
    await attempt(cookie, 'hard', false);
    const last = await attempt(cookie, 'even', true);
    const m = await me(cookie);
    expect(m.rating).toEqual({
      rating: last.rating!.after,
      rd: expect.any(Number),
      attempts: 3,
      solved: 2,
      provisional: true,
    });
    expect(Number.isInteger(m.rating!.rd)).toBe(true);
    expect(m.triedIds).toEqual(['even', 'hard', 'easy']);

    // Only your own attempts.
    const bob = await signup(api(), 'Bob');
    expect(await me(bob)).toEqual({ rating: null, triedIds: [] });
  });
});

describe('profile puzzle rating', () => {
  function botGame(): GameRecord {
    const base = play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
    return {
      ...base,
      white: { name: 'Ana', isBot: false },
      black: { name: 'Bot 1200', isBot: true, elo: 1200 },
      result: '1-0',
      termination: 'resignation',
      timeControl: '180+2',
    };
  }

  it('shows the puzzle rating separately and keeps it out of the game ratings', async () => {
    const cookie = await signup(api(), 'Ana');
    const empty = (await api().inject({ method: 'GET', url: '/api/profile/ana' })).json<ProfileResponse>();
    expect(empty.puzzle).toBeNull();

    const body: SaveGameRequest = { record: botGame(), userColor: 'w', rated: true };
    const saved = await api().inject({ method: 'PUT', url: `/api/games/${body.record.id}`, headers: { cookie }, payload: body });
    expect(saved.statusCode).toBe(201);
    const r = await attempt(cookie, 'easy', true);
    await attempt(cookie, 'hard', false);

    const p = (await api().inject({ method: 'GET', url: '/api/profile/ana' })).json<ProfileResponse>();
    expect(p.ratings.map((x) => x.category)).toEqual(['blitz']);
    expect(p.puzzle).toMatchObject({ attempts: 2, solved: 1, provisional: true });
    expect(p.puzzle!.rating).toBeLessThan(r.rating!.after);
    expect(p.counts).toEqual({ games: 1, rated: 1 });
  });
});

describe('parseCatalog', () => {
  it('maps id to rating and skips malformed entries', () => {
    const map = parseCatalog(
      JSON.stringify({ source: 'x', builtAt: 'y', puzzles: [{ id: 'a', rating: 1200 }, { id: 'b' }, { rating: 5 }, null, { id: 'c', rating: 900 }] }),
    );
    expect([...map]).toEqual([['a', 1200], ['c', 900]]);
    expect(parseCatalog('{}').size).toBe(0);
  });
});
