import { createHash, randomBytes } from 'node:crypto';

/** Who the provider says signed in. `id` is the provider's stable user id (Google's "sub"). */
export type OAuthIdentity = { id: string; email: string | null; name: string | null };

/** A sign-in provider, swappable so tests (and e2e) run without Google. */
export type OAuthProvider = {
  /** Where to send the browser to sign in. */
  authorizeUrl(state: string, codeVerifier: string): string;
  /** Trades the code from the callback for the signed-in identity. Throws on failure. */
  exchange(code: string, codeVerifier: string): Promise<OAuthIdentity>;
};

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

const codeChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/**
 * Google OpenID Connect, authorization-code flow with PKCE. The code is exchanged server-to-server
 * with the client secret, and the identity read from Google's userinfo endpoint with the resulting
 * access token, so nothing the browser sends is trusted.
 */
export function googleProvider(cfg: { clientId: string; clientSecret: string; redirectUri: string }): OAuthProvider {
  return {
    authorizeUrl(state, codeVerifier) {
      const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    },

    async exchange(code, codeVerifier) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          code_verifier: codeVerifier,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
      const { access_token } = (await tokenRes.json()) as { access_token?: string };
      if (!access_token) throw new Error('Google sent no access token');

      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${access_token}` },
      });
      if (!infoRes.ok) throw new Error(`Google userinfo failed (${infoRes.status})`);
      const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
      if (!info.sub) throw new Error('Google sent no user id');
      return { id: info.sub, email: info.email_verified ? (info.email ?? null) : null, name: info.name ?? null };
    },
  };
}

/**
 * Stand-in for Google in e2e runs (ROOKERY_FAKE_GOOGLE=1, never in production): "signing in"
 * goes straight back to the callback as the made-up user `fake-google-user`.
 */
export function fakeGoogleProvider(callbackPath = '/api/auth/google/callback'): OAuthProvider {
  return {
    authorizeUrl(state) {
      return `${callbackPath}?${new URLSearchParams({ code: 'fake-code', state })}`;
    },
    async exchange(code) {
      if (code !== 'fake-code') throw new Error('bad fake code');
      return { id: 'fake-google-user', email: 'fake.player@example.com', name: 'Fake Player' };
    },
  };
}

/** The Google provider from the environment, or null when sign-in with Google isn't configured. */
export function googleFromEnv(env: NodeJS.ProcessEnv = process.env): OAuthProvider | null {
  if (env.ROOKERY_FAKE_GOOGLE === '1' && env.NODE_ENV !== 'production') return fakeGoogleProvider();
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  if (!clientId || !clientSecret) return null;
  const redirectUri = env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5173/api/auth/google/callback';
  return googleProvider({ clientId, clientSecret, redirectUri });
}
