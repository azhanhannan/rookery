import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../account/authStore';
import { takeRedirectParam, useGoogleEnabled } from '../account/redirectParams';
import { api, googleSignInUrl } from '../api/client';
import type { AccountResponse } from '../api/types';
import { BoardThemePicker } from '../components/BoardThemePicker';
import { GoogleButton } from '../components/GoogleButton';
import { PlaySettingsSection } from '../components/PlaySettingsSection';
import { RATINGS } from '../config/tunables';

const card = 'mb-4 rounded-2xl bg-surface p-5';

/** Device settings, for everyone (signed in or not). */
function BoardSection() {
  return (
    <section className={card} aria-labelledby="board-heading" data-testid="board-settings">
      <h2 id="board-heading" className="mb-1 font-semibold">Board</h2>
      <p className="mb-3 text-xs text-muted">Colours and pieces change every board at once. Saved on this device.</p>
      <BoardThemePicker />
    </section>
  );
}

/** Settings: the board theme for everyone; for a signed-in player also username and Google link. */
export function AccountPage() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const google = useGoogleEnabled();
  // Set once by the server's redirects: a brand-new Google account, or a failed link.
  const [welcome] = useState(() => takeRedirectParam('welcome') !== null);
  const [linkError] = useState(() => takeRedirectParam('authError'));
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'signed-in') return;
    api
      .account()
      .then((a) => {
        setAccount(a);
        setName(a.user.username);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [status]);

  if (status !== 'signed-in' || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold">Settings</h1>
        {linkError && (
          <p role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">
            {linkError}
          </p>
        )}
        <BoardSection />
        <PlaySettingsSection />
        <p className="text-sm">
          {status === 'unknown' ? (
            <span className="text-muted">Loading account…</span>
          ) : (
            <>
              <a href="#/login" className="text-accent hover:underline">Log in</a> to change your username and sign-in methods.
            </>
          )}
        </p>
      </div>
    );
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!RATINGS.usernamePattern.test(next)) {
      setSaveMsg({ ok: false, text: 'Username must be 3 to 20 characters: letters, digits, _ or -.' });
      return;
    }
    setBusy(true);
    try {
      await useAuthStore.getState().rename(next);
      setSaveMsg({ ok: true, text: 'Username saved.' });
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-surface-2 bg-bg px-3 py-2 text-base outline-none focus:border-accent';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>

      {welcome && (
        <p className="mb-4 rounded-2xl bg-accent/15 p-4 text-sm">
          Welcome! Your account was created with Google as <strong>{user.username}</strong>. You can change the name below.
        </p>
      )}
      {linkError && (
        <p role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">
          {linkError}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">
          {loadError}
        </p>
      )}

      <form onSubmit={rename} className={card} noValidate>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Username</span>
          <input
            className={input}
            value={name}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              setSaveMsg(null);
            }}
          />
        </label>
        <p className="mt-2 text-xs text-muted">3 to 20 letters, digits, _ or -. Your profile link changes with it.</p>
        {saveMsg && (
          <p role={saveMsg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${saveMsg.ok ? 'text-accent' : 'text-danger'}`}>
            {saveMsg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || name.trim() === user.username}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
        >
          Save username
        </button>
      </form>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Sign-in methods</h2>
        {account ? (
          <ul className="space-y-2 text-sm">
            <li>
              Password: {account.hasPassword ? 'set' : <span className="text-muted">none (this account signs in with Google)</span>}
            </li>
            <li>
              Google:{' '}
              {account.google ? (
                <>linked{account.google.email && <span className="text-muted"> ({account.google.email})</span>}</>
              ) : (
                <span className="text-muted">not linked</span>
              )}
            </li>
          </ul>
        ) : (
          !loadError && <p className="text-sm text-muted">Loading…</p>
        )}
        {account && !account.google && google && (
          <div className="mt-4">
            <GoogleButton href={googleSignInUrl('link')} label="Link Google account" />
          </div>
        )}
      </section>

      <BoardSection />
      <PlaySettingsSection />

      <a href={`#/profile/${encodeURIComponent(user.username)}`} className="text-sm text-accent hover:underline">
        View your profile
      </a>
    </div>
  );
}
