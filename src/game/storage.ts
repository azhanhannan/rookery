import type { ClockState } from './clock';
import type { GameRecord } from './types';

const CURRENT_KEY = 'rookery.current';
const HISTORY_KEY = 'rookery.games';
const HISTORY_LIMIT = 100;

export type SavedSession = {
  record: GameRecord;
  clock: ClockState | null;
  orientation: 'white' | 'black';
};

// Storage can be missing or throw (private mode, blocked site data); the app must work without it.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage full or unavailable
  }
}

export function loadSession(): SavedSession | null {
  const s = read<SavedSession>(CURRENT_KEY);
  if (!s || !s.record || !Array.isArray(s.record.moves)) return null;
  return s;
}

export function saveSession(session: SavedSession): void {
  write(CURRENT_KEY, session);
}

export function loadHistory(): GameRecord[] {
  return read<GameRecord[]>(HISTORY_KEY) ?? [];
}

/** Adds or replaces a finished game in the saved list, newest first. */
export function archiveGame(record: GameRecord): void {
  const rest = loadHistory().filter((g) => g.id !== record.id);
  write(HISTORY_KEY, [record, ...rest].slice(0, HISTORY_LIMIT));
}
