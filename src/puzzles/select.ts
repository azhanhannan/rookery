// Choosing the next puzzle.
import { PUZZLES } from '../config/tunables';
import type { Puzzle } from './types';

/**
 * A puzzle rated within ±PUZZLES.window of `rating` (window doubling until something fits), not in
 * `recent`, optionally with `theme`. Random among the candidates (`rng` for tests). Null when nothing
 * matches at all (e.g. a theme with every puzzle already tried).
 */
export function pickPuzzle(
  puzzles: Puzzle[],
  rating: number,
  opts: { recent?: ReadonlySet<string>; theme?: string; rng?: () => number } = {},
): Puzzle | null {
  const { recent, theme, rng = Math.random } = opts;
  const pool = puzzles.filter((p) => !recent?.has(p.id) && (!theme || p.themes.includes(theme)));
  if (pool.length === 0) return null;
  const farthest = Math.max(...pool.map((p) => Math.abs(p.rating - rating)));
  for (let window = PUZZLES.window; ; window *= 2) {
    const candidates = pool.filter((p) => Math.abs(p.rating - rating) <= window);
    if (candidates.length > 0) return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    // Only reached with a NaN rating or a zero window, which would otherwise never stop widening.
    if (!(window <= farthest) || window <= 0) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }
}

/**
 * Lichess tags that describe a puzzle's length, the evaluation swing or where the game came from rather than
 * a motif: they'd crowd the filter list (almost every puzzle is "short" or "crushing") without helping anyone train.
 */
const NOT_FILTERS = new Set(['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'equality', 'master', 'masterVsMaster', 'superGM']);

/** Themes worth offering as filters, most common first, with counts. */
export function popularThemes(puzzles: Puzzle[], limit = 16): { theme: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of puzzles)
    for (const t of p.themes) if (!NOT_FILTERS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
    .slice(0, limit);
}
