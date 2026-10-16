import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, inject } from 'vitest';
import { buildApp } from '../../server/src/app';
import { createDb, type Db } from '../../server/src/db';
import { SESSION_COOKIE } from '../../server/src/auth/session';
import type { OAuthProvider } from '../../server/src/auth/google';

/**
 * Call once at the top of a server test file: one app + db for the file, every table emptied
 * before each test. Returns getters because the app is built in a hook.
 */
export function useServer(opts: { google?: OAuthProvider } = {}): { app: () => FastifyInstance; db: () => Db } {
  let app: FastifyInstance | null = null;
  let db: Db | null = null;

  beforeEach(async () => {
    if (!db) db = createDb(inject('databaseUrl'));
    if (!app) app = await buildApp({ db, google: opts.google ?? null });
    await db.$executeRawUnsafe('TRUNCATE "UserState", "PuzzleAttempt", "RatingEvent", "Rating", "Game", "Session", "OAuthAccount", "User" CASCADE');
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  return { app: () => app!, db: () => db! };
}

/** Signs up `username` (password "password123") and returns a Cookie header value for its session. */
export async function signup(app: FastifyInstance, username: string, password = 'password123'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username, password } });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
  return sessionCookie(res.cookies);
}

export function sessionCookie(cookies: { name: string; value: string }[]): string {
  const c = cookies.find((x) => x.name === SESSION_COOKIE);
  if (!c) throw new Error('no session cookie set');
  return `${SESSION_COOKIE}=${c.value}`;
}
