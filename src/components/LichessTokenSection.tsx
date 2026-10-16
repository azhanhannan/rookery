import { useState, type FormEvent } from 'react';
import { saveLichessToken, useLichessToken } from '../explorer/lichessToken';

const card = 'mb-4 rounded-2xl bg-surface p-5';
const btn = 'rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/** Settings: the Lichess personal token the opening explorer needs. Stored in this browser only. */
export function LichessTokenSection() {
  const token = useLichessToken();
  const [draft, setDraft] = useState('');
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    saveLichessToken(draft);
    setDraft('');
  };
  return (
    <section className={card} aria-labelledby="lichess-token-heading" data-testid="lichess-token-settings">
      <h2 id="lichess-token-heading" className="mb-1 font-semibold">Lichess token (opening explorer)</h2>
      <p className="mb-3 text-xs text-muted">
        Lichess's opening explorer needs a token. Create a personal API token on{' '}
        <a href="https://lichess.org/account/oauth/token" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          lichess.org
        </a>{' '}
        (no permissions need ticking) and paste it here. It stays in this browser: it is sent only to Lichess, never to
        Rookery's server, and it doesn't sync to your other devices.
      </p>
      {token ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="lichess-token-status">Token saved (…{token.slice(-4)})</span>
          <button className={btn} onClick={() => saveLichessToken(null)}>Remove token</button>
        </div>
      ) : (
        <form className="flex gap-2" onSubmit={save}>
          <input
            type="password"
            autoComplete="off"
            className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 font-mono text-xs"
            placeholder="lip_…"
            aria-label="Lichess token"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className={btn} type="submit" disabled={!draft.trim()}>Save token</button>
        </form>
      )}
    </section>
  );
}
