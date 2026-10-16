// Keeps the synced localStorage keys (src/sync/keys.ts) in step with the signed-in account.
// localStorage stays the source of truth: the app reads and writes it exactly as before, and this module
// notices changes by looking (every SYNC.pollMs), stamps them with the time it saw them, and pushes them
// (debounced). Pulls happen at start-up, on sign-in and when the tab comes back into view. Offline or with
// the server down nothing breaks: changes keep their stamps in `rookery.sync` and go up on a later try.
// Signing out leaves everything on the device as it is.
import { create } from 'zustand';
import { ApiError, api } from '../api/client';
import type { StateItem } from '../api/types';
import { SYNC } from '../config/tunables';
import { useAuthStore } from '../account/authStore';
import { applyBoardTheme, loadBoardTheme } from '../settings/boardTheme';
import { reloadPieceSet } from '../settings/pieceSet';
import { reloadPlaySettings } from '../settings/playSettings';
import { reloadReviewPrefs } from '../settings/reviewPrefs';
import { useRepertoireStore } from '../openings/repertoireStore';
import { SYNC_KEYS, type SyncKind } from './keys';
import { emptyValue, normalizeValue, reconcile } from './merge';

/** Device bookkeeping (never synced): per key, the value last seen (canonical JSON) and when it changed. */
const META_KEY = 'rookery.sync';
type Meta = Record<string, { v: string; at: number }>;

// --- local storage ----------------------------------------------------------------------------

function readLocal(key: string, kind: SyncKind): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (kind === 'pref' || kind === 'stamped') return raw;
    const v = raw === null ? emptyValue(kind) : normalizeValue(kind, JSON.parse(raw) as unknown);
    return v === undefined ? emptyValue(kind) : v;
  } catch {
    return emptyValue(kind);
  }
}

function writeLocal(key: string, kind: SyncKind, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, kind === 'pref' || kind === 'stamped' ? String(value) : JSON.stringify(value));
  } catch {
    // Storage blocked or full: the account copy is pulled again next time.
  }
}

function loadMeta(): Meta {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Meta = {};
    for (const [k, m] of Object.entries(parsed as Record<string, { v?: unknown; at?: unknown }>))
      if (m && typeof m.v === 'string' && typeof m.at === 'number') out[k] = { v: m.v, at: m.at };
    return out;
  } catch {
    return {};
  }
}

function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // ignore: changes are stamped again when next seen
  }
}

/**
 * Compares every synced key with what was seen last and stamps changed ones with `now`. A key seen for
 * the first time gets stamp 0 (an old choice of unknown age: the account's copy beats it).
 * Returns true when something changed.
 */
export function detectChanges(now: number = Date.now()): boolean {
  const meta = loadMeta();
  let changed = false;
  let dirty = false;
  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    const v = JSON.stringify(readLocal(key, kind));
    const m = meta[key];
    if (!m) {
      meta[key] = { v, at: 0 };
      dirty = true;
    } else if (m.v !== v) {
      meta[key] = { v, at: now };
      changed = dirty = true;
    }
  }
  if (dirty) saveMeta(meta);
  return changed;
}

/** Every synced key as this device has it. */
export function localItems(): Record<string, StateItem> {
  const meta = loadMeta();
  const out: Record<string, StateItem> = {};
  for (const [key, kind] of Object.entries(SYNC_KEYS)) out[key] = { value: readLocal(key, kind), updatedAt: meta[key]?.at ?? 0 };
  return out;
}

/** Re-reads what the app caches in memory, so a pulled choice shows at once (no reload). */
const APPLY: Record<string, () => void> = {
  'rookery.boardTheme': () => applyBoardTheme(loadBoardTheme()),
  'rookery.pieceSet': reloadPieceSet,
  'rookery.playSettings': reloadPlaySettings,
  'rookery.reviewPrefs': reloadReviewPrefs,
  'rookery.repertoires': () => useRepertoireStore.getState().reload(),
};

/** Writes merged items into localStorage, skipping any key the player changed since it was last looked at. */
export function applyWrites(write: Record<string, StateItem>): string[] {
  const meta = loadMeta();
  const applied: string[] = [];
  for (const [key, item] of Object.entries(write)) {
    const kind = SYNC_KEYS[key];
    if (!kind) continue;
    const cur = JSON.stringify(readLocal(key, kind));
    if (meta[key] && meta[key].v !== cur) continue; // changed meanwhile: it is newer, it goes up next time
    const next = JSON.stringify(item.value);
    if (next !== cur) {
      writeLocal(key, kind, item.value);
      applied.push(key);
    }
    meta[key] = { v: JSON.stringify(readLocal(key, kind)), at: item.updatedAt };
  }
  saveMeta(meta);
  for (const key of applied) {
    try {
      APPLY[key]?.();
    } catch {
      // a broken applier must not stop the sync
    }
  }
  return applied;
}

// --- the sync loop ----------------------------------------------------------------------------

type SyncStatus = {
  /** 'idle' before the first sync (or signed out), 'ok' after one succeeded, 'error' while retrying. */
  state: 'idle' | 'syncing' | 'ok' | 'error';
  lastSyncedAt: number | null;
};

export const useStateSync = create<SyncStatus>(() => ({ state: 'idle', lastSyncedAt: null }));

let remote: Record<string, StateItem> | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const signedIn = () => useAuthStore.getState().status === 'signed-in';

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, ms);
}

/** Forgets the account copy, so the next sync starts with a pull. */
export function requestPull(): void {
  remote = null;
}

async function runOnce(): Promise<void> {
  detectChanges();
  if (!signedIn()) return;
  useStateSync.setState({ state: 'syncing' });
  try {
    remote ??= (await api.getState()).items;
    const { write, push } = reconcile(localItems(), remote);
    applyWrites(write);
    if (Object.keys(push).length > 0) {
      remote = (await api.putState({ items: push })).items;
      applyWrites(reconcile(localItems(), remote).write);
    }
    useStateSync.setState({ state: 'ok', lastSyncedAt: Date.now() });
  } catch (e) {
    remote = null;
    const status = e instanceof ApiError ? e.status : 0;
    useStateSync.setState({ state: 'error' });
    if (status === 401) void useAuthStore.getState().refresh();
    else schedule(SYNC.retryMs);
  }
}

/** Looks for changes and syncs now (one run at a time; a call during a run queues one more). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runOnce().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

/** Starts watching storage, the session and the tab. Call once at start-up; returns a stop function. */
export function startStateSync(): () => void {
  detectChanges();
  const poll = setInterval(() => {
    if (detectChanges()) schedule(SYNC.debounceMs);
  }, SYNC.pollMs);
  const stopAuth = useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status) return;
    if (s.status === 'signed-in') {
      requestPull();
      void syncNow();
    } else {
      requestPull();
      useStateSync.setState({ state: 'idle', lastSyncedAt: null });
    }
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      requestPull();
      void syncNow();
    } else if (detectChanges()) void syncNow(); // leaving: try to get the last change up
  };
  const onOnline = () => void syncNow();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  if (signedIn()) void syncNow();
  return () => {
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    timer = null;
    stopAuth();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
