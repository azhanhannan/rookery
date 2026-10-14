import type { FastifyInstance } from 'fastify';
import { RATINGS } from '../../../src/config/tunables';
import type { AuthRequest, AuthResponse } from '../../../src/api/types';
import { hashPassword, verifyPassword } from '../auth/password';
import { endSession, requireUser, startSession, toPublicUser } from '../auth/session';
import { LoginThrottle } from '../auth/throttle';
import type { Db } from '../db';

function readCredentials(body: unknown): AuthRequest | null {
  if (!body || typeof body !== 'object') return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  return { username: username.trim(), password };
}

// One dummy hash so a login for an unknown username costs the same time as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function authRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const throttle = new LoginThrottle();

  app.post('/auth/signup', async (request, reply) => {
    const creds = readCredentials(request.body);
    if (!creds) return reply.code(400).send({ error: 'Enter a username and a password.' });
    if (!RATINGS.usernamePattern.test(creds.username))
      return reply.code(400).send({ error: 'Usernames are 3-20 letters, digits, _ or -.' });
    if (creds.password.length < RATINGS.minPasswordLength)
      return reply.code(400).send({ error: `Passwords need at least ${RATINGS.minPasswordLength} characters.` });

    const usernameKey = creds.username.toLowerCase();
    if (await db.user.findUnique({ where: { usernameKey } }))
      return reply.code(409).send({ error: 'That username is taken.' });
    const user = await db.user
      .create({ data: { username: creds.username, usernameKey, passwordHash: await hashPassword(creds.password) } })
      .catch(() => null); // lost a race to the same name
    if (!user) return reply.code(409).send({ error: 'That username is taken.' });

    await startSession(db, reply, user.id);
    return reply.code(201).send({ user: toPublicUser(user) } satisfies AuthResponse);
  });

  app.post('/auth/login', async (request, reply) => {
    const creds = readCredentials(request.body);
    if (!creds) return reply.code(400).send({ error: 'Enter a username and a password.' });
    const usernameKey = creds.username.toLowerCase();
    const key = `${usernameKey}|${request.ip}`;
    if (throttle.blocked(key)) return reply.code(429).send({ error: 'Too many attempts. Try again in a few minutes.' });

    const user = await db.user.findUnique({ where: { usernameKey } });
    dummyHash ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(creds.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) {
      throttle.fail(key);
      return reply.code(401).send({ error: 'Wrong username or password.' });
    }
    throttle.clear(key);
    await startSession(db, reply, user.id);
    return reply.send({ user: toPublicUser(user) } satisfies AuthResponse);
  });

  app.post('/auth/logout', async (request, reply) => {
    await endSession(db, request, reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return reply.send({ user: toPublicUser(user) } satisfies AuthResponse);
  });
}
