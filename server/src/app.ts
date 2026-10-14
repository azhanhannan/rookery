import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { userFromCookie } from './auth/session';
import type { Db } from './db';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/games';
import { profileRoutes } from './routes/profile';

/** The HTTP API. Everything is under /api; the browser app is served separately (Vite, or any static host). */
export async function buildApp({ db, logger = false }: { db: Db; logger?: boolean }): Promise<FastifyInstance> {
  // A GameRecord with a full review is well over Fastify's 1 MB default.
  const app = Fastify({ logger, bodyLimit: 8 * 1024 * 1024 });
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
      await api.register(gameRoutes, { db });
      await api.register(profileRoutes, { db });
      api.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/api' },
  );
  return app;
}
