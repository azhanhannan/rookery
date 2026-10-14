import { describe, expect, it } from 'vitest';
import type { OAuthIdentity, OAuthProvider } from '../../server/src/auth/google';
import { googleFromEnv } from '../../server/src/auth/google';
import { SESSION_COOKIE } from '../../server/src/auth/session';
import { signup, useServer } from './helpers';

// Fake Google: the "code" names which identity signs in.
const IDENTITIES: Record<string, OAuthIdentity> = {
  ana: { id: 'g-ana', email: 'ana@example.com', name: 'Ana Silva' },
  bob: { id: 'g-bob', email: 'bob@example.com', name: 'Bob' },
};
const fake: OAuthProvider = {
  authorizeUrl: (state) => `https://accounts.example/auth?state=${state}`,
  async exchange(code) {
    const id = IDENTITIES[code];
    if (!id) throw new Error('bad code');
    return id;
  },
};

const server = useServer({ google: fake });

type Cookies = { name: string; value: string }[];
const header = (cookies: Cookies) => cookies.map((c) => `${c.name}=${c.value}`).join('; ');

/** Runs the redirect dance: start → (Google) → callback with `code`. Returns where the app lands and the cookies set. */
async function googleFlow(code: string, opts: { mode?: 'login' | 'link'; session?: string; tamperState?: boolean } = {}) {
  const app = server.app();
  const start = await app.inject({
    method: 'GET',
    url: `/api/auth/google?mode=${opts.mode ?? 'login'}`,
    headers: opts.session ? { cookie: opts.session } : {},
  });
  expect(start.statusCode).toBe(302);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const flowCookie = header(start.cookies as Cookies);
  const cb = await app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?code=${code}&state=${opts.tamperState ? 'nope' : state}`,
    headers: { cookie: [flowCookie, opts.session].filter(Boolean).join('; ') },
  });
  expect(cb.statusCode).toBe(302);
  const session = (cb.cookies as Cookies).find((c) => c.name === SESSION_COOKIE && c.value);
  return { location: cb.headers.location as string, session: session ? `${SESSION_COOKIE}=${session.value}` : null };
}

const authError = (location: string) => new URL(location, 'http://x').searchParams.get('authError');

async function me(session: string) {
  return (await server.app().inject({ method: 'GET', url: '/api/auth/account', headers: { cookie: session } })).json();
}

describe('Google sign-in', () => {
  it('reports the provider as configured', async () => {
    const res = await server.app().inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json()).toEqual({ google: true });
  });

  it('first sign-in creates a passwordless account named after the Google name; the second signs into it', async () => {
    const first = await googleFlow('ana');
    expect(first.location).toBe('/?welcome=1#/account');
    const account = await me(first.session!);
    expect(account.user.username).toBe('Ana_Silva');
    expect(account.hasPassword).toBe(false);
    expect(account.google).toEqual({ email: 'ana@example.com' });

    const again = await googleFlow('ana');
    expect(again.location).toBe('/#/play');
    expect((await me(again.session!)).user.id).toBe(account.user.id);
    expect(await server.db().user.count()).toBe(1);
  });

  it('a taken name gets a number; an existing password account with the same email is NOT taken over', async () => {
    await signup(server.app(), 'Ana_Silva');
    const res = await googleFlow('ana');
    const account = await me(res.session!);
    expect(account.user.username).toMatch(/^Ana_Silva\d{4}$/);
    expect(await server.db().user.count()).toBe(2);
  });

  it('a wrong state is refused (login CSRF) and no session is made', async () => {
    const res = await googleFlow('ana', { tamperState: true });
    expect(res.location).toMatch(/^\/\?authError=.+#\/login$/);
    expect(res.session).toBeNull();
  });

  it('a failed exchange comes back with an error', async () => {
    const res = await googleFlow('nobody');
    expect(authError(res.location)).toContain("Couldn't sign in with Google");
  });

  it('a Google-only account cannot log in with a password', async () => {
    await googleFlow('ana');
    const res = await server.app().inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Ana_Silva', password: 'whatever123' } });
    expect(res.statusCode).toBe(401);
  });

  it('link: a signed-in password account adds Google, then can sign in with it', async () => {
    const session = await signup(server.app(), 'Carla');
    const res = await googleFlow('bob', { mode: 'link', session });
    expect(res.location).toBe('/#/account');
    const account = await me(session);
    expect(account.hasPassword).toBe(true);
    expect(account.google).toEqual({ email: 'bob@example.com' });

    const login = await googleFlow('bob');
    expect((await me(login.session!)).user.username).toBe('Carla');
  });

  it('link: a Google account already used by another player is refused', async () => {
    await googleFlow('bob'); // creates player "Bob"
    const session = await signup(server.app(), 'Carla');
    const res = await googleFlow('bob', { mode: 'link', session });
    expect(authError(res.location)).toContain('already linked to another player');
    expect((await me(session)).google).toBeNull();
  });

  it('link needs a signed-in player', async () => {
    const start = await server.app().inject({ method: 'GET', url: '/api/auth/google?mode=link' });
    expect(start.headers.location).toMatch(/authError=.+#\/login$/);
  });
});

describe('rename', () => {
  it('changes the username with the sign-up rules', async () => {
    const app = server.app();
    const session = await signup(app, 'Ana');
    await signup(app, 'Bob');
    const ok = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie: session }, payload: { username: 'Ana2' } });
    expect(ok.json().user.username).toBe('Ana2');
    const taken = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie: session }, payload: { username: 'bob' } });
    expect(taken.statusCode).toBe(409);
    const bad = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie: session }, payload: { username: 'a b' } });
    expect(bad.statusCode).toBe(400);
    const same = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie: session }, payload: { username: 'ANA2' } });
    expect(same.statusCode).toBe(200);
  });
});

describe('googleFromEnv', () => {
  it('is off without keys, on with them, and the fake never runs in production', () => {
    expect(googleFromEnv({})).toBeNull();
    expect(googleFromEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).not.toBeNull();
    expect(googleFromEnv({ ROOKERY_FAKE_GOOGLE: '1', NODE_ENV: 'production' })).toBeNull();
    const url = googleFromEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })!.authorizeUrl('st', 'verifier');
    const q = new URL(url).searchParams;
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('redirect_uri')).toBe('http://localhost:5173/api/auth/google/callback');
    expect(q.get('scope')).toBe('openid email profile');
  });
});
