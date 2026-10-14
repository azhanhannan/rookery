import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ProfileResponse, SaveGameRequest, SaveGameResponse } from '../../src/api/types';
import type { GameRecord } from '../../src/game/types';
import { play } from '../unit/helpers';
import { signup, useServer } from './helpers';

const server = useServer();

function botGame(over: Partial<GameRecord> = {}): GameRecord {
  const base = play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
  return {
    ...base,
    white: { name: 'Ana', isBot: false },
    black: { name: 'Bot 1200', isBot: true, elo: 1200 },
    result: '1-0',
    termination: 'resignation',
    timeControl: '180+2',
    ...over,
  };
}

async function save(app: FastifyInstance, cookie: string, body: SaveGameRequest): Promise<SaveGameResponse> {
  const res = await app.inject({ method: 'PUT', url: `/api/games/${body.record.id}`, headers: { cookie }, payload: body });
  if (res.statusCode >= 300) throw new Error(`save failed: ${res.statusCode} ${res.body}`);
  return res.json<SaveGameResponse>();
}

describe('GET /profile/:username', () => {
  it('shows ratings per category, the full history oldest first, and counts — without games', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const blitz1 = await save(app, cookie, { record: botGame(), userColor: 'w', rated: true });
    const rapid = await save(app, cookie, { record: botGame({ timeControl: '600+0', result: '0-1' }), userColor: 'w', rated: true });
    const blitz2 = await save(app, cookie, { record: botGame(), userColor: 'w', rated: true });
    await save(app, cookie, { record: botGame({ timeControl: undefined }), userColor: 'w', rated: true }); // unrated
    await save(app, cookie, { record: botGame(), userColor: null, rated: false }); // unrated

    // Signed out: the profile is public.
    const res = await app.inject({ method: 'GET', url: '/api/profile/ANA' });
    expect(res.statusCode).toBe(200);
    const p = res.json<ProfileResponse>();
    expect(p.user.username).toBe('Ana');
    expect(p.counts).toEqual({ games: 5, rated: 3 });

    expect(p.ratings.map((r) => r.category)).toEqual(['blitz', 'rapid']);
    const blitz = p.ratings[0];
    expect(blitz.games).toBe(2);
    expect(blitz.rating).toBe(blitz2.rating!.after);
    expect(Number.isInteger(blitz.rating) && Number.isInteger(blitz.rd)).toBe(true);
    expect(blitz.provisional).toBe(true);
    expect(p.ratings[1]).toMatchObject({ category: 'rapid', games: 1, rating: rapid.rating!.after });
    expect(p.ratings[1].rating).toBeLessThan(1500);

    expect(p.history).toHaveLength(3);
    expect(p.history.map((h) => [h.category, h.rating, h.gameClientId])).toEqual([
      ['blitz', blitz1.rating!.after, blitz1.game.clientId],
      ['rapid', rapid.rating!.after, rapid.game.clientId],
      ['blitz', blitz2.rating!.after, blitz2.game.clientId],
    ]);
    expect(p.history.every((h) => !Number.isNaN(Date.parse(h.at)))).toBe(true);

    expect(res.body).not.toContain('e2e4');
    expect(res.body).not.toContain('passwordHash');
  });

  it('a player with no games has empty ratings and history', async () => {
    const app = server.app();
    await signup(app, 'Bob');
    const p = (await app.inject({ method: 'GET', url: '/api/profile/bob' })).json<ProfileResponse>();
    expect(p).toMatchObject({ ratings: [], history: [], counts: { games: 0, rated: 0 } });
    expect(Object.keys(p.user).sort()).toEqual(['createdAt', 'id', 'username']);
  });

  it('404s for an unknown player', async () => {
    const res = await server.app().inject({ method: 'GET', url: '/api/profile/nobody' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/No player called/);
  });
});
