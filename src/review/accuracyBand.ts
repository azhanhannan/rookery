// Review's friendly accuracy line: what an accuracy means for a player's level. Pure.
import { ACCURACY_BANDS, RATING } from '../config/tunables';
import type { Color, GameRecord } from '../game/types';

type Bands = typeof ACCURACY_BANDS;

/** Typical accuracy at `rating`, linear between bands and flat past the ends (an estimate, see tunables). */
export function typicalAccuracy(rating: number, cfg: Bands = ACCURACY_BANDS): number {
  const b = cfg.bands;
  if (rating <= b[0].rating) return b[0].accuracy;
  for (let i = 1; i < b.length; i++) {
    if (rating <= b[i].rating) {
      const t = (rating - b[i - 1].rating) / (b[i].rating - b[i - 1].rating);
      return b[i - 1].accuracy + t * (b[i].accuracy - b[i - 1].accuracy);
    }
  }
  return b[b.length - 1].accuracy;
}

/** The band whose typical accuracy is closest to `accuracy` (ties go to the lower band). */
export function bandForAccuracy(accuracy: number, cfg: Bands = ACCURACY_BANDS): number {
  let best = cfg.bands[0];
  for (const band of cfg.bands) if (Math.abs(band.accuracy - accuracy) < Math.abs(best.accuracy - accuracy)) best = band;
  return best.rating;
}

/**
 * One plain line next to an accuracy: against the player's own rating when known ("Strong for your level"),
 * else the rating it is typical for ("Typical for ~600"). Null without an accuracy.
 */
export function accuracyNote(accuracy: number | null, rating: number | null | undefined, cfg: Bands = ACCURACY_BANDS): string | null {
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return `Typical for ~${bandForAccuracy(accuracy, cfg)}`;
  const diff = accuracy - typicalAccuracy(rating, cfg);
  if (diff > cfg.margin) return 'Strong for your level';
  if (diff < -cfg.margin) return 'A tough game for your level';
  return 'About your level';
}

/**
 * Notes for both summary cards. The player's side (record.userColor, else the non-bot side) is compared with
 * `playerRating`; another human side gets "Typical for ~N"; a bot side gets nothing.
 */
export function accuracyNotesFor(
  record: Pick<GameRecord, 'white' | 'black' | 'userColor'> & { moves?: readonly unknown[] },
  accuracy: { w: number | null; b: number | null },
  playerRating: number | null | undefined,
  minMoves: number = RATING.minMoves,
): { w: string | null; b: string | null } {
  const bot = record.white.isBot ? 'w' : record.black.isBot ? 'b' : null;
  const you: Color | null = record.userColor ?? (bot ? (bot === 'w' ? 'b' : 'w') : null);
  // Too few moves to say anything about level (a 2-move resignation is "100% accurate"): same floor as Game rating.
  const plies = record.moves?.length;
  const movesBy = (c: Color) => (plies === undefined ? Infinity : c === 'w' ? Math.ceil(plies / 2) : Math.floor(plies / 2));
  const note = (c: Color) => {
    if (bot === c) return null;
    if (movesBy(c) < minMoves) return null;
    return accuracyNote(accuracy[c], c === you ? playerRating : null);
  };
  return { w: note('w'), b: note('b') };
}
