// The player's Lichess personal API token, used only by the opening explorer.
// Kept in this browser's localStorage under `rookery.lichessToken`, which is deliberately NOT in
// src/sync/keys.ts: it is never sent to Rookery's server, only to explorer.lichess.org as a Bearer header.
import { useSyncExternalStore } from 'react';

export const TOKEN_KEY = 'rookery.lichessToken';

const listeners = new Set<() => void>();

export function loadLichessToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY)?.trim();
    return t ? t : null;
  } catch {
    return null;
  }
}

/** Saves (or with an empty value, forgets) the token and tells every explorer panel. */
export function saveLichessToken(token: string | null): void {
  const t = token?.trim() ?? '';
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore: the token just won't survive a reload
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** The current token (null without one); re-renders when it is saved or cleared, here or in another tab. */
export function useLichessToken(): string | null {
  return useSyncExternalStore(subscribe, loadLichessToken, () => null);
}
