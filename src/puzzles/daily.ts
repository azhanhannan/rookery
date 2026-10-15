// The daily puzzle: one per calendar day, picked deterministically from the puzzle set near the player's
// rating. The pick is pinned for the day in `rookery.daily` so a rating change mid-day doesn't swap it.
import { MISTAKES } from '../config/tunables';
import { isDayKey } from './days';
import type { Puzzle } from './types';

/** FNV-1a: a stable 32-bit hash of the day key. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The day's puzzle: among puzzles within ±MISTAKES.dailyWindow of the rating (rounded to 100, widening
 * ×2 until something fits), sorted by id, the one the day's hash points at. Same day, set and rating
 * bucket → same puzzle. Null for an empty set.
 */
export function pickDaily(puzzles: Puzzle[], day: string, rating: number): Puzzle | null {
  if (puzzles.length === 0) return null;
  const r = Math.round((Number.isFinite(rating) ? rating : 1500) / 100) * 100;
  let pool: Puzzle[] = [];
  for (let w = Math.max(MISTAKES.dailyWindow, 1); pool.length === 0 && w < 10_000; w *= 2)
    pool = puzzles.filter((p) => Math.abs(p.rating - r) <= w);
  if (pool.length === 0) pool = puzzles;
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[hash(day) % sorted.length];
}

// --- storage ----------------------------------------------------------------------------------

const KEY = 'rookery.daily';

export type DailyRecord = { day: string; id: string; solved: boolean };

export function loadDaily(): DailyRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Partial<DailyRecord> | null) : null;
    if (!d || !isDayKey(d.day) || typeof d.id !== 'string') return null;
    return { day: d.day, id: d.id, solved: d.solved === true };
  } catch {
    return null;
  }
}

function saveDaily(d: DailyRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage full or unavailable
  }
}

/** Today's puzzle: the one pinned for `day` if it is still in the set, else a fresh pick (then pinned). */
export function dailyPuzzle(puzzles: Puzzle[], day: string, rating: number): { puzzle: Puzzle; solved: boolean } | null {
  const pinned = loadDaily();
  if (pinned?.day === day) {
    const p = puzzles.find((x) => x.id === pinned.id);
    if (p) return { puzzle: p, solved: pinned.solved };
  }
  const puzzle = pickDaily(puzzles, day, rating);
  if (!puzzle) return null;
  saveDaily({ day, id: puzzle.id, solved: false });
  return { puzzle, solved: false };
}

/** Marks the day's puzzle solved (only a clean solve counts). */
export function recordDailyResult(day: string, id: string, solvedClean: boolean): void {
  const cur = loadDaily();
  const solved = solvedClean || (cur?.day === day && cur.id === id && cur.solved);
  saveDaily({ day, id, solved });
}
