// Phase 5: uploads finished games to the server while the player is signed in.
// Lives in the app layer and only watches the game store, so game logic stays free of network code.
import { ApiError, api } from '../api/client';
import { useGameStore } from '../game/gameStore';
import { myColor } from '../game/myColor';
import { findArchivedGame } from '../game/storage';
import type { Color, GameRecord } from '../game/types';
import { useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';

/** Ids of finished games whose upload has not succeeded yet (offline, server error, signed out mid-way). */
const QUEUE_KEY = 'rookery.unsynced';

/** The side the signed-in player played: the human side of a bot game, null for two people at one screen. */
export function userColorFor(record: GameRecord): Color | null {
  return myColor(record);
}

/**
 * One upload per distinct finished state: the game, then again once it carries a review (again for each new
 * review, such as a deeper re-review) or a Maia match.
 */
function syncKey(record: GameRecord): string | null {
  if (record.result === '*') return null;
  const review = record.review ? `reviewed@${record.review.createdAt}` : 'plain';
  return `${record.id}:${review}${record.maiaMatch ? ':maia' : ''}`;
}

export function readQueue(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeQueue(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore: the retry just won't survive a reload
  }
}

function enqueue(id: string): void {
  const q = readQueue();
  if (!q.includes(id)) writeQueue([...q, id]);
}

function dequeue(id: string): void {
  writeQueue(readQueue().filter((x) => x !== id));
}

/** The latest version of a game: the one on the board, else the device's saved games. */
function findRecord(id: string): GameRecord | null {
  const current = useGameStore.getState().record;
  return current.id === id ? current : findArchivedGame(id);
}

const uploaded = new Set<string>();
// Uploads run one at a time, so a slow plain upload can never overwrite the reviewed one that followed it.
let chain: Promise<void> = Promise.resolve();

function upload(id: string): Promise<void> {
  chain = chain.then(() => uploadNow(id));
  return chain;
}

async function uploadNow(id: string): Promise<void> {
  if (useAuthStore.getState().status !== 'signed-in') return; // stays queued for the next sign-in
  const record = findRecord(id);
  const key = record && syncKey(record);
  if (!record || !key) {
    dequeue(id);
    return;
  }
  if (uploaded.has(key)) {
    dequeue(id);
    return;
  }
  const { update } = useSyncStore.getState();
  update(id, { status: 'saving' });
  try {
    const res = await api.saveGame({ record, userColor: userColorFor(record), rated: !!record.rated });
    uploaded.add(key);
    dequeue(id);
    update(id, {
      status: 'saved',
      ...(res.rating ? { rating: res.rating } : {}),
      ...(res.unratedReason ? { unratedReason: res.unratedReason } : {}),
    });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    update(id, { status: 'failed' });
    // 4xx other than 401 means the server will never accept this game: don't retry it forever.
    if (status >= 400 && status < 500 && status !== 401) dequeue(id);
    // 401: the session ended; the header should say so. The game stays queued until the next login.
    if (status === 401) void useAuthStore.getState().refresh();
  }
}

function retryQueue(): void {
  for (const id of readQueue()) void upload(id);
}

/**
 * Uploads a saved game that changed outside the board (bulk import, a background review) when signed in.
 * Signed out it does nothing: like the device's older history, such games are offered on My games instead.
 */
export function queueGameUpload(id: string): void {
  if (useAuthStore.getState().status !== 'signed-in') return;
  enqueue(id);
  void upload(id);
}

/** Resolves once every upload started so far has finished (tests, and anyone who needs to wait). */
export function flushGameSync(): Promise<void> {
  return chain;
}

/**
 * Starts watching the game and the session. Call once at start-up; returns a stop function.
 * Only games that finish (or get reviewed, or are imported finished) from now on are uploaded,
 * never the device's older history.
 */
export function startGameSync(): () => void {
  const stopGame = useGameStore.subscribe((s, prev) => {
    const key = syncKey(s.record);
    if (!key || key === syncKey(prev.record) || uploaded.has(key)) return;
    if (useAuthStore.getState().status !== 'signed-in') return;
    enqueue(s.record.id);
    void upload(s.record.id);
  });
  const stopAuth = useAuthStore.subscribe((s, prev) => {
    if (s.status === 'signed-in' && prev.status !== 'signed-in') retryQueue();
  });
  if (useAuthStore.getState().status === 'signed-in') retryQueue();
  return () => {
    stopGame();
    stopAuth();
  };
}
