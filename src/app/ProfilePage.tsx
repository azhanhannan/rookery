import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ProfileResponse } from '../api/types';
import { CATEGORY_NAMES, CATEGORY_ORDER } from '../components/ratingCategory';
import { RatingHistoryChart } from '../components/RatingHistoryChart';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; profile: ProfileResponse };

/** `#/profile/<username>`: public ratings and rating history. App keys it by the hash, so it mounts per player. */
export function ProfilePage({ username }: { username: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    api
      .profile(username)
      .then((profile) => live && setState({ kind: 'ready', profile }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setState({ kind: 'missing' });
        else setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [username]);

  if (state.kind === 'loading') return <p className="p-6 text-center text-sm text-muted">Loading profile…</p>;
  if (state.kind === 'missing' || state.kind === 'error') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
        <h1 className="truncate text-xl font-bold">{username}</h1>
        <p role="alert" className="text-sm text-danger">
          {state.kind === 'missing' ? `No player called ${username}` : state.message}
        </p>
      </div>
    );
  }

  const { user, ratings, history, counts } = state.profile;
  const rows = [...ratings].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold">{user.username}</h1>
        <p className="text-sm text-muted">
          Member since {new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          {' · '}
          {counts.games} game{counts.games === 1 ? '' : 's'} saved, {counts.rated} rated
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-surface p-3 text-sm">No rated games yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rating-cards">
          {rows.map((r) => (
            <li key={r.category} className="rounded-lg bg-surface p-3">
              <div className="text-xs text-muted">{CATEGORY_NAMES[r.category]}</div>
              <div
                className="text-2xl font-bold tabular-nums"
                title={r.provisional ? 'Provisional: the rating settles after more rated games' : undefined}
              >
                {r.rating}
                {r.provisional && <span className="text-muted">?</span>}
              </div>
              <div className="text-xs text-muted">
                {r.games} game{r.games === 1 ? '' : 's'}
              </div>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Rating history</h2>
          <RatingHistoryChart history={history} />
        </section>
      )}
    </div>
  );
}
