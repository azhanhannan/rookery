import { useEffect, useState } from 'react';
import { EXPLORER } from '../config/tunables';
import {
  cachedExplorer,
  defaultFilters,
  fetchExplorer,
  RATING_GROUPS,
  SPEEDS,
  type ExplorerFilters,
  type ExplorerOutcome,
  type ExplorerSource,
  type ExplorerSpeed,
} from './explorer';
import { useLichessToken } from './lichessToken';

export type ExplorerLookup =
  | { status: 'off' }
  | { status: 'loading' }
  | ExplorerOutcome;

/**
 * Explorer answer for `fen` while `enabled`. A cached answer shows at once; otherwise the request waits
 * EXPLORER.debounceMs so stepping through moves only asks about the position you stop on.
 */
export function useExplorer(
  fen: string | null,
  source: ExplorerSource,
  filters: ExplorerFilters,
  enabled = true,
): ExplorerLookup {
  const token = useLichessToken();
  const filterKey = `${filters.ratings.join(',')}|${filters.speeds.join(',')}`;
  const reqKey = `${source}|${filterKey}|${fen ?? ''}|${token ?? ''}`;
  const [state, setState] = useState<{ key: string; outcome: ExplorerOutcome } | null>(null);
  // A failed lookup asks again once the back-off is over.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!enabled || fen === null) return;
    if (cachedExplorer(fen, source, filters)) return; // rendered straight from the cache below
    let cancelled = false;
    const ctrl = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      void fetchExplorer(fen, source, filters, { token, signal: ctrl.signal }).then((outcome) => {
        if (cancelled) return;
        setState({ key: reqKey, outcome });
        if (outcome.status === 'rate-limited') {
          retryTimer = setTimeout(() => setRetryTick((n) => n + 1), Math.max(1000, outcome.retryAt - Date.now()));
        }
      });
    }, token ? EXPLORER.debounceMs : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      ctrl.abort();
    };
    // `filters` is covered by filterKey (a new object each render would refire the effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fen, source, filterKey, token, reqKey, retryTick]);

  if (!enabled || fen === null) return { status: 'off' };
  const hit = cachedExplorer(fen, source, filters);
  if (hit) return { status: 'ok', result: hit };
  if (!token) return { status: 'no-token' };
  if (state?.key === reqKey && state.outcome.status !== 'ok') return state.outcome;
  return { status: 'loading' };
}

// Panel preferences: open/closed, database and Lichess filters. Device-only (not in src/sync/keys.ts).
const PREFS_KEY = 'rookery.explorer';

export type ExplorerPrefs = { open: boolean; source: ExplorerSource; filters: ExplorerFilters };

export function loadExplorerPrefs(): ExplorerPrefs {
  const fallback: ExplorerPrefs = { open: true, source: EXPLORER.defaultSource, filters: defaultFilters() };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<{ open: unknown; source: unknown; ratings: unknown; speeds: unknown }>;
    const ratings = Array.isArray(p.ratings)
      ? p.ratings.filter((r): r is number => (RATING_GROUPS as readonly unknown[]).includes(r))
      : fallback.filters.ratings;
    const speeds = Array.isArray(p.speeds)
      ? p.speeds.filter((s): s is ExplorerSpeed => (SPEEDS as readonly unknown[]).includes(s))
      : fallback.filters.speeds;
    return {
      open: typeof p.open === 'boolean' ? p.open : fallback.open,
      source: p.source === 'masters' || p.source === 'lichess' ? p.source : fallback.source,
      filters: { ratings, speeds },
    };
  } catch {
    return fallback;
  }
}

export function saveExplorerPrefs(p: ExplorerPrefs): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ open: p.open, source: p.source, ratings: p.filters.ratings, speeds: p.filters.speeds }),
    );
  } catch {
    // ignore: the choice just won't survive a reload
  }
}
