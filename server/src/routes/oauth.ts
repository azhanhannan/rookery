import type { FastifyInstance, FastifyReply } from 'fastify';
import { RATINGS } from '../../../src/config/tunables';
import type { AccountResponse, AuthProvidersResponse, AuthResponse } from '../../../src/api/types';
import { randomToken, type OAuthIdentity, type OAuthProvider } from '../auth/google';
import { requireUser, startSession, toPublicUser } from '../auth/session';
import type { Db } from '../db';

const FLOW_COOKIE = 'rookery_oauth';
const FLOW_PATH = '/api/auth/google';

type Mode = 'login' | 'link';
type Flow = { state: string; verifier: string; mode: Mode };

function readFlow(raw: string | undefined): Flow | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Flow>;
    return typeof f.state === 'string' && typeof f.verifier === 'string' && (f.mode === 'login' || f.mode === 'link')
      ? (f as Flow)
      : null;
  } catch {
    return null;
  }
}

/** Sends the browser back into the app, with a message for the page to show when something went wrong. */
function backToApp(reply: FastifyReply, route: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  return reply.redirect(`/${q ? `?${q}` : ''}#/${route}`);
}

/** A free username from the Google name or email: letters, digits, _ and - only, made unique with a number. */
export async function pickUsername(db: Db, identity: OAuthIdentity): Promise<string> {
  const source = identity.name ?? identity.email?.split('@')[0] ?? 'player';
  let base = source
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  if (base.length < 3) base = `player${base}`.slice(0, 16);
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    if (!RATINGS.usernamePattern.test(name)) continue;
    if (!(await db.user.findUnique({ where: { usernameKey: name.toLowerCase() } }))) return name;
  }
  return `player${randomToken().replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`;
}

export async function oauthRoutes(app: FastifyInstance, { db, google }: { db: Db; google: OAuthProvider | null }) {
  app.get('/auth/providers', async () => ({ google: google !== null }) satisfies AuthProvidersResponse);

  // Step 1: remember a random state + PKCE verifier in a short-lived cookie, then go to Google.
  app.get<{ Querystring: { mode?: string } }>('/auth/google', async (request, reply) => {
    const mode: Mode = request.query.mode === 'link' ? 'link' : 'login';
    if (!google) return backToApp(reply, mode === 'link' ? 'account' : 'login', { authError: 'Google sign-in is not set up on this server.' });
    if (mode === 'link' && !request.user) return backToApp(reply, 'login', { authError: 'Log in first, then link Google.' });
    const flow: Flow = { state: randomToken(), verifier: randomToken(), mode };
    reply.setCookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
      path: FLOW_PATH,
      httpOnly: true,
      // Lax still sends it on Google's top-level redirect back to the callback.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
    });
    return reply.redirect(google.authorizeUrl(flow.state, flow.verifier));
  });

  // Step 2: Google sends the browser back with ?code&state.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/auth/google/callback', async (request, reply) => {
    const flow = readFlow(request.cookies[FLOW_COOKIE]);
    reply.clearCookie(FLOW_COOKIE, { path: FLOW_PATH });
    const failRoute = flow?.mode === 'link' ? 'account' : 'login';
    const { code, state, error } = request.query;
    if (!google) return backToApp(reply, failRoute, { authError: 'Google sign-in is not set up on this server.' });
    if (error) return backToApp(reply, failRoute, { authError: 'Google sign-in was cancelled.' });
    if (!flow || !code || !state || state !== flow.state)
      return backToApp(reply, failRoute, { authError: 'That sign-in link expired. Please try again.' });

    let identity: OAuthIdentity;
    try {
      identity = await google.exchange(code, flow.verifier);
    } catch (err) {
      request.log.warn(err, 'google exchange failed');
      return backToApp(reply, failRoute, { authError: "Couldn't sign in with Google. Please try again." });
    }

    const linked = await db.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: identity.id } },
    });

    if (flow.mode === 'link') {
      const user = request.user;
      if (!user) return backToApp(reply, 'login', { authError: 'Log in first, then link Google.' });
      if (linked && linked.userId !== user.id)
        return backToApp(reply, 'account', { authError: 'That Google account is already linked to another player.' });
      if (!linked) {
        const already = await db.oAuthAccount.findUnique({ where: { userId_provider: { userId: user.id, provider: 'google' } } });
        if (already) return backToApp(reply, 'account', { authError: 'This account is already linked to a different Google account.' });
        await db.oAuthAccount.create({ data: { provider: 'google', providerUserId: identity.id, userId: user.id, email: identity.email } });
      }
      return backToApp(reply, 'account');
    }

    if (linked) {
      await startSession(db, reply, linked.userId);
      return backToApp(reply, 'play');
    }
    // First Google sign-in: a new account. Never matched to an existing one by email.
    const username = await pickUsername(db, identity);
    const user = await db.user.create({
      data: {
        username,
        usernameKey: username.toLowerCase(),
        passwordHash: null,
        oauthAccounts: { create: { provider: 'google', providerUserId: identity.id, email: identity.email } },
      },
    });
    await startSession(db, reply, user.id);
    return backToApp(reply, 'account', { welcome: '1' });
  });

  app.get('/auth/account', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, oauthAccounts: { where: { provider: 'google' }, select: { email: true } } },
    });
    const google = row.oauthAccounts[0];
    return reply.send({
      user: toPublicUser(user),
      hasPassword: row.passwordHash !== null,
      google: google ? { email: google.email } : null,
    } satisfies AccountResponse);
  });

  app.patch('/auth/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = request.body as { username?: unknown } | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    if (!RATINGS.usernamePattern.test(username))
      return reply.code(400).send({ error: 'Usernames are 3-20 letters, digits, _ or -.' });
    const usernameKey = username.toLowerCase();
    const taken = await db.user.findUnique({ where: { usernameKey } });
    if (taken && taken.id !== user.id) return reply.code(409).send({ error: 'That username is taken.' });
    const updated = await db.user
      .update({ where: { id: user.id }, data: { username, usernameKey }, select: { id: true, username: true, createdAt: true } })
      .catch(() => null); // lost a race to the same name
    if (!updated) return reply.code(409).send({ error: 'That username is taken.' });
    return reply.send({ user: toPublicUser(updated) } satisfies AuthResponse);
  });
}
