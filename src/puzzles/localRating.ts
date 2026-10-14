// Puzzle rating for signed-out players, in localStorage (`rookery.puzzles`, try/catch per CLAUDE.md).
// Same Glicko-2 as games (src/rating/glicko.ts rateGame), puzzle = fixed opponent at its rating with
// PUZZLES.puzzleRd. First attempt at a puzzle only.
import type { PuzzleAttemptResponse, PuzzleRatingRow } from '../api/types';
import { PUZZLES, RATINGS } from '../config/tunables';
import { isProvisional, rateGame, type GlickoState } from '../rating/glicko';
import type { Puzzle } from './types';

const KEY = 'rookery.puzzles';

type Stored = GlickoState & {
  attempts: number;
  solved: number;
  /** Puzzle ids tried, newest first, up to PUZZLES.recentLimit. */
  recent: string[];
};

// Storage can be missing or throw (private mode, blocked site data); puzzles must work without it.
function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Stored> | null;
    if (!s || typeof s.rating !== 'number' || typeof s.rd !== 'number' || typeof s.volatility !== 'number') return null;
    return {
      rating: s.rating,
      rd: s.rd,
      volatility: s.volatility,
      attempts: typeof s.attempts === 'number' ? s.attempts : 0,
      solved: typeof s.solved === 'number' ? s.solved : 0,
      recent: Array.isArray(s.recent) ? s.recent.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return null;
  }
}

function write(value: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // ignore: storage full or unavailable
  }
}

/** Null before the first attempt on this device. Rating and RD rounded, like the server's row. */
export function loadLocalPuzzleRating(): PuzzleRatingRow | null {
  const s = read();
  if (!s || s.attempts === 0) return null;
  return {
    rating: Math.round(s.rating),
    rd: Math.round(s.rd),
    attempts: s.attempts,
    solved: s.solved,
    provisional: isProvisional(s.rd),
  };
}

/** Ids tried on this device, newest first (up to PUZZLES.recentLimit). */
export function localTriedIds(): string[] {
  return read()?.recent ?? [];
}

/**
 * Rates the first attempt at `puzzle` on this device. A puzzle still in the recent list is a repeat:
 * {firstAttempt: false} and nothing changes. (Ids that fell off the list count as new again.)
 */
export function recordLocalAttempt(puzzle: Puzzle, solved: boolean): PuzzleAttemptResponse {
  const s = read() ?? { ...RATINGS.start, attempts: 0, solved: 0, recent: [] };
  if (s.recent.includes(puzzle.id)) return { firstAttempt: false };
  const after = rateGame(s, { rating: puzzle.rating, rd: PUZZLES.puzzleRd }, solved ? 1 : 0);
  write({
    ...after,
    attempts: s.attempts + 1,
    solved: s.solved + (solved ? 1 : 0),
    recent: [puzzle.id, ...s.recent].slice(0, PUZZLES.recentLimit),
  });
  return {
    firstAttempt: true,
    rating: {
      before: Math.round(s.rating),
      after: Math.round(after.rating),
      delta: Math.round(after.rating - s.rating),
      provisional: isProvisional(after.rd),
    },
  };
}
