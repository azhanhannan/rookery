import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { RATINGS } from '../../src/config/tunables';
import type { GameListResponse, GameResponse, SaveGameRequest, SaveGameResponse } from '../../src/api/types';
import type { GameRecord, PlayerInfo } from '../../src/game/types';
import { FOOLS_MATE, play } from '../unit/helpers';
import { signup, useServer } from './helpers';

const server = useServer();

const you: PlayerInfo = { name: 'Ana', isBot: false };
const bot800: PlayerInfo = { name: 'Bot 800', isBot: true, elo: 800 };

/** A finished blitz game: Ana (White) beats the 800 bot by resignation after 3 moves each. */
function botWin(over: Partial<GameRecord> = {}): GameRecord {
  const base = play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
  return { ...base, white: you, black: bot800, result: '1-0', termination: 'resignation', timeControl: '180+2', ...over };
}

function put(app: FastifyInstance, cookie: string | undefined, body: SaveGameRequest, clientId = body.record.id) {
  return app.inject({
    method: 'PUT',
    url: `/api/games/${encodeURIComponent(clientId)}`,
    headers: cookie ? { cookie } : {},
    payload: body,
  });
}

const get = (app: FastifyInstance, cookie: string | undefined, url: string) =>
  app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

describe('games routes', () => {
  it('every route needs a signed-in user', async () => {
    const app = server.app();
    const record = botWin();
    expect((await put(app, undefined, { record, userColor: 'w', rated: false })).statusCode).toBe(401);
    expect((await get(app, undefined, '/api/games')).statusCode).toBe(401);
    expect((await get(app, undefined, `/api/games/${record.id}`)).statusCode).toBe(401);
  });

  it('saves, lists and returns a game', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    const res = await put(app, cookie, { record, userColor: 'w', rated: false });
    expect(res.statusCode).toBe(201);
    const body = res.json<SaveGameResponse>();
    expect(body.rating).toBeUndefined();
    expect(body.unratedReason).toBeUndefined();
    expect(body.game).toEqual({
      clientId: record.id,
      white: 'Ana',
      black: 'Bot 800',
      result: '1-0',
      termination: 'resignation',
      userColor: 'w',
      opponentName: 'Bot 800',
      timeControl: '180+2',
      rated: false,
      category: null,
      moves: 6,
      hasReview: false,
      playedAt: record.createdAt,
    });

    const list = (await get(app, cookie, '/api/games')).json<GameListResponse>();
    expect(list.games).toEqual([body.game]);
    expect(list.nextBefore).toBeNull();

    const one = await get(app, cookie, `/api/games/${record.id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json<GameResponse>()).toEqual({ game: body.game, record });
  });

  it("another user can't read your game", async () => {
    const app = server.app();
    const ana = await signup(app, 'Ana');
    const bob = await signup(app, 'Bob');
    const record = botWin();
    await put(app, ana, { record, userColor: 'w', rated: false });
    expect((await get(app, bob, `/api/games/${record.id}`)).statusCode).toBe(404);
    expect((await get(app, bob, '/api/games')).json<GameListResponse>().games).toEqual([]);
    expect((await get(app, ana, '/api/games/no-such-game')).statusCode).toBe(404);
  });

  it('a rated blitz bot game updates the rating once and records one event', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    const res = await put(app, cookie, { record, userColor: 'w', rated: true });
    expect(res.statusCode).toBe(201);
    const body = res.json<SaveGameResponse>();
    expect(body.game.rated).toBe(true);
    expect(body.game.category).toBe('blitz');
    expect(body.unratedReason).toBeUndefined();
    expect(body.rating).toMatchObject({ category: 'blitz', before: 1500, provisional: true });
    // Beating a much weaker bot: a small gain.
    expect(body.rating!.after).toBeGreaterThan(1500);
    expect(body.rating!.delta).toBe(body.rating!.after - 1500);

    const db = server.db();
    const rating = await db.rating.findMany();
    expect(rating).toHaveLength(1);
    expect(rating[0]).toMatchObject({ category: 'blitz', games: 1 });
    expect(rating[0].rd).toBeLessThan(RATINGS.start.rd);
    const events = await db.ratingEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: 'blitz', ratingBefore: 1500 });
  });

  it('a loss as Black moves the rating down', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = { ...botWin(), white: { name: 'Bot 1600', isBot: true, elo: 1600 }, black: you, result: '1-0' as const };
    const body = (await put(app, cookie, { record, userColor: 'b', rated: true })).json<SaveGameResponse>();
    expect(body.rating!.delta).toBeLessThan(0);
    expect(body.game.opponentName).toBe('Bot 1600');
  });

  it('re-uploading with a review stores it and does not re-rate', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    await put(app, cookie, { record, userColor: 'w', rated: true });
    const reviewed = { ...record, review: { depth: 16 } } as unknown as GameRecord;
    const res = await put(app, cookie, { record: reviewed, userColor: 'w', rated: true });
    expect(res.statusCode).toBe(200);
    const body = res.json<SaveGameResponse>();
    expect(body.rating).toBeUndefined();
    expect(body.game.hasReview).toBe(true);
    expect(body.game.rated).toBe(true);

    const db = server.db();
    expect(await db.ratingEvent.count()).toBe(1);
    expect((await db.rating.findFirst())?.games).toBe(1);
    expect(await db.game.count()).toBe(1);
    const stored = (await get(app, cookie, `/api/games/${record.id}`)).json<GameResponse>();
    expect(stored.record.review).toEqual({ depth: 16 });
  });

  it('re-uploading different moves or a different result under the same id is 409', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    await put(app, cookie, { record, userColor: 'w', rated: true });
    const other = { ...play(['d2d4', 'd7d5', 'c2c4', 'e7e6']), id: record.id, white: you, black: bot800, result: '1-0' as const };
    expect((await put(app, cookie, { record: other, userColor: 'w', rated: true })).statusCode).toBe(409);
    const flipped = { ...record, result: '0-1' as const };
    expect((await put(app, cookie, { record: flipped, userColor: 'w', rated: true })).statusCode).toBe(409);
    expect(await server.db().ratingEvent.count()).toBe(1);
  });

  it('the same clientId from two users is two games', async () => {
    const app = server.app();
    const record = botWin();
    expect((await put(app, await signup(app, 'Ana'), { record, userColor: 'w', rated: true })).statusCode).toBe(201);
    expect((await put(app, await signup(app, 'Bob'), { record, userColor: 'w', rated: true })).statusCode).toBe(201);
    expect(await server.db().ratingEvent.count()).toBe(2);
  });

  it('an untimed game asked to be rated is saved unrated with a reason', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const res = await put(app, cookie, { record: botWin({ timeControl: undefined }), userColor: 'w', rated: true });
    expect(res.statusCode).toBe(201);
    const body = res.json<SaveGameResponse>();
    expect(body.game.rated).toBe(false);
    expect(body.rating).toBeUndefined();
    expect(body.unratedReason).toBe('Untimed games are not rated');
    expect(await server.db().rating.count()).toBe(0);
  });

  it('a friend game (userColor null) is saved unrated', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = { ...play(FOOLS_MATE), timeControl: '180+2' };
    const res = await put(app, cookie, { record, userColor: null, rated: true });
    expect(res.statusCode).toBe(201);
    const body = res.json<SaveGameResponse>();
    expect(body.game).toMatchObject({ rated: false, userColor: null, result: '0-1', termination: 'checkmate' });
    expect(body.unratedReason).toMatch(/two people/);
    expect(await server.db().ratingEvent.count()).toBe(0);
  });

  it('rejects illegal and inconsistent moves', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    const illegal = { ...record, moves: [...record.moves, { san: 'Ke3', uci: 'e1e3', fenAfter: record.moves[5].fenAfter }] };
    const res = await put(app, cookie, { record: illegal, userColor: 'w', rated: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Move 4\. Ke3 is not legal/);

    const wrongSan = { ...record, moves: record.moves.map((m, i) => (i === 0 ? { ...m, san: 'd4' } : m)) };
    expect((await put(app, cookie, { record: wrongSan, userColor: 'w', rated: true })).statusCode).toBe(400);
    const wrongFen = { ...record, moves: record.moves.map((m, i) => (i === 2 ? { ...m, fenAfter: record.startFen } : m)) };
    expect((await put(app, cookie, { record: wrongFen, userColor: 'w', rated: true })).statusCode).toBe(400);
    expect(await server.db().game.count()).toBe(0);
  });

  it('rejects a result that contradicts checkmate, and unfinished games', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const mated = { ...play(FOOLS_MATE), white: you, black: bot800, timeControl: '180+2' };
    const lie = await put(app, cookie, { record: { ...mated, result: '1-0' }, userColor: 'w', rated: true });
    expect(lie.statusCode).toBe(400);
    expect(lie.json().error).toMatch(/checkmate/);
    const draw = await put(app, cookie, { record: { ...mated, result: '1/2-1/2' }, userColor: 'w', rated: true });
    expect(draw.statusCode).toBe(400);
    const unfinished = await put(app, cookie, { record: botWin({ result: '*' }), userColor: 'w', rated: false });
    expect(unfinished.statusCode).toBe(400);
    // The honest version is fine, and rated (two moves by the player).
    const ok = await put(app, cookie, { record: mated, userColor: 'w', rated: true });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<SaveGameResponse>().rating!.delta).toBeLessThan(0);
  });

  it('rejects malformed bodies', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    const send = (payload: unknown, id = record.id) =>
      app.inject({ method: 'PUT', url: `/api/games/${id}`, headers: { cookie }, payload: payload as object });
    expect((await send({})).statusCode).toBe(400);
    expect((await send({ record, userColor: 'x', rated: true })).statusCode).toBe(400);
    expect((await send({ record, userColor: 'w' })).statusCode).toBe(400);
    expect((await send({ record, userColor: 'w', rated: true }, 'other-id')).statusCode).toBe(400);
    expect((await send({ record: { ...record, moves: 'e4' }, userColor: 'w', rated: true })).statusCode).toBe(400);
    expect((await send({ record: { ...record, white: { name: 'A' } }, userColor: 'w', rated: true })).statusCode).toBe(400);
    expect((await send({ record: { ...record, result: 'win' }, userColor: 'w', rated: true })).statusCode).toBe(400);
    expect((await send({ record: { ...record, startFen: 'not a fen' }, userColor: 'w', rated: true })).statusCode).toBe(400);
  });

  it('falls back to now for a missing or future date', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const t0 = Date.now();
    const future = botWin({ createdAt: '2999-01-01T00:00:00.000Z' });
    const body = (await put(app, cookie, { record: future, userColor: 'w', rated: false })).json<SaveGameResponse>();
    expect(Date.parse(body.game.playedAt)).toBeGreaterThanOrEqual(t0 - 1000);
    expect(Date.parse(body.game.playedAt)).toBeLessThanOrEqual(Date.now());
    const garbage = botWin({ createdAt: 'yesterday' });
    expect((await put(app, cookie, { record: garbage, userColor: 'w', rated: false })).statusCode).toBe(201);
  });

  it('two concurrent uploads of the same new rated game rate it exactly once', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const record = botWin();
    const results = await Promise.all([1, 2, 3].map(() => put(app, cookie, { record, userColor: 'w', rated: true })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(results.filter((r) => r.json<SaveGameResponse>().rating)).toHaveLength(1);
    const db = server.db();
    expect(await db.ratingEvent.count()).toBe(1);
    expect(await db.game.count()).toBe(1);
    expect((await db.rating.findFirst())?.games).toBe(1);
  });

  it('different rated games finishing at once all count (no lost rating update)', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const records = [1, 2, 3, 4].map(() => botWin({ black: { name: 'Bot 1600', isBot: true, elo: 1600 } }));
    await Promise.all(records.map((record) => put(app, cookie, { record, userColor: 'w', rated: true })));
    const db = server.db();
    expect((await db.rating.findFirst())?.games).toBe(4);
    const events = await db.ratingEvent.findMany({ orderBy: { createdAt: 'asc' } });
    expect(events).toHaveLength(4);
    // Each game started from where the previous one left the rating: the events form one chain.
    const befores = events.map((e) => e.ratingBefore).sort((a, b) => a - b);
    const afters = events.map((e) => e.ratingAfter).sort((a, b) => a - b);
    expect(befores.slice(1)).toEqual(afters.slice(0, -1));
    expect(befores[0]).toBe(1500);
  });

  it('lists newest first in pages of RATINGS.pageSize with a nextBefore cursor', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const n = RATINGS.pageSize + 5;
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    // The oldest game on the first page shares its timestamp with the next older one.
    const tieAt = n - RATINGS.pageSize - 1;
    const times = Array.from({ length: n }, (_, i) => base + (i === tieAt ? i + 1 : i) * 60_000);
    for (const t of times) {
      await put(app, cookie, { record: botWin({ createdAt: new Date(t).toISOString() }), userColor: 'w', rated: false });
    }
    const seen: string[] = [];
    let before: string | null = null;
    let pages = 0;
    do {
      const url: string = before ? `/api/games?before=${encodeURIComponent(before)}` : '/api/games';
      const page: GameListResponse = (await get(app, cookie, url)).json<GameListResponse>();
      seen.push(...page.games.map((g) => g.playedAt));
      before = page.nextBefore;
      pages++;
    } while (before && pages < 10);
    expect(pages).toBe(2);
    expect(seen).toHaveLength(n);
    expect(seen).toEqual([...seen].sort().reverse());
    expect((await get(app, cookie, '/api/games?before=nonsense')).statusCode).toBe(400);
  });
});
