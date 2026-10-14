import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RATINGS } from '../../../src/config/tunables';
import type { PublicUser } from '../../../src/api/types';
import type { Db } from '../db';

export const SESSION_COOKIE = 'rookery_session';

export type SessionUser = { id: string; username: string; createdAt: Date };

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, set by the onRequest hook in app.ts; null when signed out. */
    user: SessionUser | null;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function toPublicUser(u: SessionUser): PublicUser {
  return { id: u.id, username: u.username, createdAt: u.createdAt.toISOString() };
}

/** Creates a session for `userId` and sets its cookie. Only the token's hash is stored. */
export async function startSession(db: Db, reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RATINGS.sessionDays * 86_400_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });
}

export async function endSession(db: Db, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** The user behind the request's session cookie, or null (missing, unknown or expired). */
export async function userFromCookie(db: Db, request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, username: true, createdAt: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

/** Route guard: the signed-in user, or null after replying 401 (the handler should then return). */
export function requireUser(request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (request.user) return request.user;
  reply.code(401).send({ error: 'Please log in first.' });
  return null;
}
