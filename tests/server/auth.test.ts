import { describe, expect, it } from 'vitest';
import { LoginThrottle } from '../../server/src/auth/throttle';
import { hashPassword, verifyPassword } from '../../server/src/auth/password';
import { sessionCookie, signup, useServer } from './helpers';

// oxlint-disable-next-line react-hooks/rules-of-hooks -- a test helper named like a hook, not a hook
const server = useServer();

describe('passwords', () => {
  it('hash verifies, wrong password does not, hashes are salted', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong horse', h)).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(h);
  });
});

describe('auth routes', () => {
  it('sign up sets a session; /me returns the user; logout ends it', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('Ana');
    expect(me.json().user).not.toHaveProperty('passwordHash');

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const cookie = await signup(server.app(), 'Ana');
    const token = cookie.split('=')[1];
    const rows = await server.db().session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
  });

  it('usernames are unique ignoring case, and validated', async () => {
    const app = server.app();
    await signup(app, 'Ana');
    const dup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'ana', password: 'password123' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'a b', password: 'password123' } });
    expect(bad.statusCode).toBe(400);
    const short = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'bob', password: 'short' } });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toMatch(/at least/);
  });

  it('login works with any username case; wrong password is 401 with the same message as unknown user', async () => {
    const app = server.app();
    await signup(app, 'Ana');
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ANA', password: 'password123' } });
    expect(ok.statusCode).toBe(200);
    expect(sessionCookie(ok.cookies)).toMatch(/^rookery_session=/);
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Ana', password: 'nope-nope' } });
    const unknown = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Nobody', password: 'nope-nope' } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error).toBe(unknown.json().error);
  });

  it('an expired session is signed out', async () => {
    const app = server.app();
    const cookie = await signup(app, 'Ana');
    await server.db().session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('LoginThrottle', () => {
  it('blocks after max failures within the window, then forgets', () => {
    const t = new LoginThrottle(3, 1000);
    for (let i = 0; i < 3; i++) t.fail('k', 0);
    expect(t.blocked('k', 500)).toBe(true);
    expect(t.blocked('other', 500)).toBe(false);
    expect(t.blocked('k', 1501)).toBe(false);
  });
});
