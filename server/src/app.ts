import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { OAuthProvider } from './auth/google';
import { userFromCookie } from './auth/session';
import type { Db } from './db';
import { fileCatalog, type PuzzleCatalog } from './puzzles/catalog';
import { authRoutes } from './routes/auth';
import { coachRoutes } from './routes/coach';
import { gameRoutes } from './routes/games';
import { insightRoutes } from './routes/insights';
import { oauthRoutes } from './routes/oauth';
import { profileRoutes } from './routes/profile';
import { puzzleRoutes } from './routes/puzzles';
import { stateRoutes } from './routes/state';

/** The HTTP API. Everything is under /api; the browser app is served separately (Vite, or any static host). */
export async function buildApp({
  db,
  logger = false,
  google = null,
  puzzles = fileCatalog(),
  trustProxy = false,
}: {
  db: Db;
  logger?: boolean;
  /** Google sign-in; null hides it (no keys configured). */
  google?: OAuthProvider | null;
  /** Puzzle id -> rating for rating attempts; defaults to public/puzzles/puzzles.json. */
  puzzles?: PuzzleCatalog;
  /** Behind a reverse proxy: take request.ip from X-Forwarded-For, so login throttling sees the real client. */
  trustProxy?: boolean;
}): Promise<FastifyInstance> {
  // A GameRecord with a full review is well over Fastify's 1 MB default.
  const app = Fastify({ logger, bodyLimit: 8 * 1024 * 1024, trustProxy });
  await app.register(cookie);

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    request.user = await userFromCookie(db, request);
  });

  app.setErrorHandler((err: { statusCode?: number; message?: string }, request, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) request.log.error(err);
    reply.code(status).send({ error: status === 500 ? 'Something went wrong on the server.' : (err.message ?? 'Bad request.') });
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { db });
      await api.register(oauthRoutes, { db, google });
      await api.register(gameRoutes, { db });
      await api.register(profileRoutes, { db });
      await api.register(puzzleRoutes, { db, puzzles });
      await api.register(stateRoutes, { db });
      await api.register(coachRoutes, { db });
      await api.register(insightRoutes, { db });
      api.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/api' },
  );
  return app;
}
