import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../account/authStore';
import { RATINGS } from '../config/tunables';

/** Signup rules checked before the request; the server checks them again. */
function signupProblem(username: string, password: string): string | null {
  if (!RATINGS.usernamePattern.test(username)) {
    return 'Username must be 3 to 20 characters: letters, digits, _ or -.';
  }
  if (password.length < RATINGS.minPasswordLength) {
    return `Password must be at least ${RATINGS.minPasswordLength} characters.`;
  }
  return null;
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = mode === 'login';
  const title = login ? 'Log in' : 'Create account';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    const problem = login ? (name && password ? null : 'Enter your username and password.') : signupProblem(name, password);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const auth = useAuthStore.getState();
      await (login ? auth.login(name, password) : auth.signup(name, password));
      location.hash = '#/play';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'signed-in' && user) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <div className="rounded-2xl bg-surface p-5 text-center">
          <p className="mb-4">
            You're signed in as <strong>{user.username}</strong>.
          </p>
          <a href="#/play" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
            Go to Play
          </a>
        </div>
      </div>
    );
  }

  const input =
    'w-full rounded-lg border border-surface-2 bg-bg px-3 py-2 text-base outline-none focus:border-accent';

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <form onSubmit={submit} className="rounded-2xl bg-surface p-5" noValidate>
        <h1 className="mb-4 text-lg font-semibold">{title}</h1>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-muted">Username</span>
          <input
            className={input}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-muted">Password</span>
          <input
            className={input}
            type="password"
            name="password"
            autoComplete={login ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {!login && (
          <p className="mb-4 text-xs text-muted">
            Username: 3 to 20 letters, digits, _ or -. Password: at least {RATINGS.minPasswordLength} characters.
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
        >
          {login ? 'Log in' : 'Create account'}
        </button>

        {status === 'offline' && (
          <p className="mt-3 text-xs text-muted">The server can't be reached right now. You can still play; games stay on this device.</p>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          {login ? (
            <>
              New here? <a href="#/signup" className="text-accent hover:underline">Create an account</a>
            </>
          ) : (
            <>
              Already have an account? <a href="#/login" className="text-accent hover:underline">Go to login</a>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
