// Openings report for My games (pure): the player's games grouped by opening and by the side they played,
// with results and, from reviewed games, the move where they usually first go wrong.
import { reviewFits } from '../review/reviewView';
import type { MoveLabel } from '../review/types';
import type { Color, GameRecord } from '../game/types';
import { outcomeOf, personColor } from './gamesList';

/** "Inaccuracy or worse". */
export const WRONG_LABELS: ReadonlySet<MoveLabel> = new Set(['Inaccuracy', 'Mistake', 'Miss', 'Blunder']);

export const UNKNOWN_OPENING = 'Unknown opening';

export type OpeningRow = {
  /** Opening family ("Sicilian Defense") or full name with variation, by `detail`. */
  name: string;
  color: Color;
  games: number;
  won: number;
  drawn: number;
  lost: number;
  /** (won + drawn / 2) / games, 0-100, rounded. */
  score: number;
  /** Games with a review that fits them. */
  reviewed: number;
  /** Median full-move number of the player's first Inaccuracy-or-worse, over reviewed games that had one. */
  wrongAround: number | null;
  /** Reviewed games that had such a move (the median's sample size). */
  wrongGames: number;
  gameIds: string[];
};

export type OpeningInput = {
  record: GameRecord;
  /** Detected opening name (e.g. from lookupBook), or null/undefined when none. */
  opening?: string | null;
};

/** "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(':')[0].trim();
}

/** Full-move number of `color`'s first Inaccuracy-or-worse in a fitting review; null when there is none. */
export function firstWrongMove(record: GameRecord, color: Color): number | null {
  if (!reviewFits(record, record.review)) return null;
  const m = record.review.moves.find((mv) => mv.color === color && WRONG_LABELS.has(mv.label));
  return m ? Math.ceil(m.ply / 2) : null;
}

/** Median, rounded to a whole move; null for no values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

/**
 * Groups finished games with a known side (bot games, imported games with a matched name) by opening and
 * colour; most played first. Games between two people at one screen are left out: neither side is "you".
 */
export function openingsReport(games: OpeningInput[], detail: 'family' | 'variation' = 'family'): OpeningRow[] {
  type Acc = OpeningRow & { wrong: number[] };
  const rows = new Map<string, Acc>();
  for (const { record, opening } of games) {
    if (record.result === '*') continue;
    const color = personColor(record);
    if (!color) continue;
    const name = opening ? (detail === 'family' ? openingFamily(opening) : opening) : UNKNOWN_OPENING;
    const key = `${color}|${name}`;
    let row = rows.get(key);
    if (!row) {
      row = { name, color, games: 0, won: 0, drawn: 0, lost: 0, score: 0, reviewed: 0, wrongAround: null, wrongGames: 0, gameIds: [], wrong: [] };
      rows.set(key, row);
    }
    row.games++;
    row.gameIds.push(record.id);
    const outcome = outcomeOf({ result: record.result, userColor: color });
    if (outcome === 'won' || outcome === 'drawn' || outcome === 'lost') row[outcome]++;
    if (reviewFits(record, record.review)) {
      row.reviewed++;
      const n = firstWrongMove(record, color);
      if (n !== null) row.wrong.push(n);
    }
  }
  return [...rows.values()]
    .map(({ wrong, ...r }) => ({
      ...r,
      score: Math.round(((r.won + r.drawn / 2) / r.games) * 100),
      wrongAround: median(wrong),
      wrongGames: wrong.length,
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}
