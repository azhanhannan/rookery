import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { StateItem, StateResponse } from '../../src/api/types';
import { SYNC } from '../../src/config/tunables';
import { signup, useServer } from './helpers';

// oxlint-disable-next-line react-hooks/rules-of-hooks -- a test helper named like a hook, not a hook
const server = useServer();

async function put(app: FastifyInstance, cookie: string | undefined, items: Record<string, unknown>) {
  return app.inject({ method: 'PUT', url: '/api/state', headers: cookie ? { cookie } : {}, payload: { items } });
}

async function get(app: FastifyInstance, cookie: string): Promise<Record<string, StateItem>> {
  const res = await app.inject({ method: 'GET', url: '/api/state', headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json<StateResponse>().items;
}

const T = Date.parse('2026-01-01T08:00:00Z');

describe('/api/state', () => {
  it('needs a signed-in player', async () => {
    const app = server.app();
    expect((await app.inject({ method: 'GET', url: '/api/state' })).statusCode).toBe(401);
    const res = await put(app, undefined, { 'rookery.boardTheme': { value: 'green', updatedAt: T } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/log in/i);
  });

  it('round-trips preferences and training state, per player', async () => {
    const app = server.app();
    const ana = await signup(app, 'Ana');
    const bob = await signup(app, 'Bob');
    expect(await get(app, ana)).toEqual({});

    const items = {
      'rookery.boardTheme': { value: 'green', updatedAt: T },
      'rookery.playSettings': { value: '{"coordinates":false}', updatedAt: T },
      'rookery.mistakes': { value: { p1: { stage: 1, due: '2026-10-17', retired: false } }, updatedAt: T },
      'rookery.trainedDays': { value: ['2026-10-16', '2026-10-15'], updatedAt: T },
      'rookery.daily': { value: { day: '2026-10-16', id: 'abc', solved: true }, updatedAt: T },
    };
    const res = await put(app, ana, items);
    expect(res.statusCode).toBe(200);
    const back = await get(app, ana);
    expect(res.json<StateResponse>().items).toEqual(back);
    expect(back['rookery.boardTheme']).toEqual({ value: 'green', updatedAt: T });
    expect(back['rookery.playSettings'].value).toBe('{"coordinates":false}');
    expect(back['rookery.mistakes'].value).toEqual({ p1: { stage: 1, due: '2026-10-17', retired: false } });
    expect(back['rookery.trainedDays'].value).toEqual(['2026-10-15', '2026-10-16']); // sorted
    expect(back['rookery.daily'].value).toEqual({ day: '2026-10-16', id: 'abc', solved: true });

    expect(await get(app, bob)).toEqual({});
  });

  it('stores a cleared preference as null', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    await put(app, c, { 'rookery.boardTheme': { value: 'green', updatedAt: T } });
    await put(app, c, { 'rookery.boardTheme': { value: null, updatedAt: T + 1 } });
    expect((await get(app, c))['rookery.boardTheme']).toEqual({ value: null, updatedAt: T + 1 });
  });

  it('preferences: the newer change wins, an older push is ignored', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    await put(app, c, { 'rookery.pieceSet': { value: 'merida', updatedAt: T + 10 } });
    const stale = await put(app, c, { 'rookery.pieceSet': { value: 'pixel', updatedAt: T } });
    expect(stale.json<StateResponse>().items['rookery.pieceSet']).toEqual({ value: 'merida', updatedAt: T + 10 });
    // A tie keeps what is stored.
    await put(app, c, { 'rookery.pieceSet': { value: 'firi', updatedAt: T + 10 } });
    expect((await get(app, c))['rookery.pieceSet'].value).toBe('merida');
    await put(app, c, { 'rookery.pieceSet': { value: 'firi', updatedAt: T + 11 } });
    expect((await get(app, c))['rookery.pieceSet'].value).toBe('firi');
  });

  it('caps a timestamp from a clock running ahead at the server time', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    const before = Date.now();
    await put(app, c, { 'rookery.gameMode': { value: 'practice', updatedAt: before + 10 * 86_400_000 } });
    const at = (await get(app, c))['rookery.gameMode'].updatedAt;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('training state merges with what is stored instead of replacing it', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    // Phone
    await put(app, c, {
      'rookery.mistakes': {
        value: { a: { stage: 2, due: '2026-10-20', retired: false }, b: { stage: 0, due: '2026-10-17', retired: false } },
        updatedAt: T,
      },
      'rookery.trainedDays': { value: ['2026-10-14', '2026-10-16'], updatedAt: T },
      'rookery.daily': { value: { day: '2026-10-16', id: 'x', solved: true }, updatedAt: T },
    });
    // Laptop, pushing an older view (an earlier timestamp must not discard anything)
    const res = await put(app, c, {
      'rookery.mistakes': {
        value: { a: { stage: 1, due: '2026-10-17', retired: false }, c: { stage: 0, due: '2026-10-18', retired: false } },
        updatedAt: T - 1000,
      },
      'rookery.trainedDays': { value: ['2026-10-15'], updatedAt: T - 1000 },
      'rookery.daily': { value: { day: '2026-10-16', id: 'x', solved: false }, updatedAt: T - 1000 },
    });
    const items = res.json<StateResponse>().items;
    expect(items['rookery.mistakes'].value).toEqual({
      a: { stage: 2, due: '2026-10-20', retired: false },
      b: { stage: 0, due: '2026-10-17', retired: false },
      c: { stage: 0, due: '2026-10-18', retired: false },
    });
    expect(items['rookery.mistakes'].updatedAt).toBe(T);
    expect(items['rookery.trainedDays'].value).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(items['rookery.daily'].value).toEqual({ day: '2026-10-16', id: 'x', solved: true });
  });

  it('rejects keys that are not on the allowlist, and changes nothing', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    for (const key of ['rookery.games', 'rookery.current', 'rookery.unsynced', 'rookery.muted', '__proto__', 'whatever']) {
      const res = await put(app, c, { 'rookery.boardTheme': { value: 'green', updatedAt: T }, [key]: { value: 'x', updatedAt: T } });
      expect(res.statusCode, key).toBe(400);
      expect(res.json().error).toBeTruthy();
    }
    expect(await get(app, c)).toEqual({});
  });

  it('rejects malformed bodies and values', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    const bad: unknown[] = [
      null,
      [],
      { 'rookery.boardTheme': 'green' },
      { 'rookery.boardTheme': { value: 'green' } },
      { 'rookery.boardTheme': { value: 'green', updatedAt: -1 } },
      { 'rookery.boardTheme': { value: 42, updatedAt: T } },
      { 'rookery.trainedDays': { value: 'nope', updatedAt: T } },
      { 'rookery.mistakes': { value: [], updatedAt: T } },
      { 'rookery.daily': { value: { day: 'today', id: 'x' }, updatedAt: T } },
    ];
    for (const items of bad) {
      const res = await app.inject({ method: 'PUT', url: '/api/state', headers: { cookie: c }, payload: { items } });
      expect(res.statusCode, JSON.stringify(items)).toBe(400);
    }
    expect(await get(app, c)).toEqual({});
  });

  it('rejects a value over the size limit with 413', async () => {
    const app = server.app();
    const c = await signup(app, 'Ana');
    const big: Record<string, unknown> = {};
    for (let i = 0; JSON.stringify(big).length <= SYNC.maxValueBytes; i++)
      big[`puzzle-${i}`] = { stage: 1, due: '2026-10-17', retired: false };
    const res = await put(app, c, { 'rookery.mistakes': { value: big, updatedAt: T } });
    expect(res.statusCode).toBe(413);
    expect(await get(app, c)).toEqual({});
  });
});
