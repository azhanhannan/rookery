import { RATING } from '../config/tunables';
import type { PlayerSummary } from '../review/types';
import calibration from './calibration.json';

export type CalibrationPoint = { accuracy: number; rating: number };

export type Calibration = {
  calibrated: boolean;
  /** Median absolute error of the fitted curve, in rating points; null until calibrated. */
  typicalError: number | null;
  points: CalibrationPoint[];
};

export type RatingEstimate =
  | { kind: 'estimate'; rating: number; low: number; high: number; calibrated: boolean }
  | { kind: 'not-enough-moves' };

/** Linear interpolation on the curve; accuracies outside it take the nearest end's rating. */
export function ratingForAccuracy(accuracy: number, points: CalibrationPoint[]): number {
  const sorted = [...points].sort((a, b) => a.accuracy - b.accuracy);
  if (accuracy <= sorted[0].accuracy) return sorted[0].rating;
  const last = sorted[sorted.length - 1];
  if (accuracy >= last.accuracy) return last.rating;
  const i = sorted.findIndex((p) => p.accuracy >= accuracy);
  const [a, b] = [sorted[i - 1], sorted[i]];
  return a.rating + ((accuracy - a.accuracy) / (b.accuracy - a.accuracy)) * (b.rating - a.rating);
}

/** SPEC Feature 4, MVP method. Recomputed on every view, so a new calibration also applies to old reviews. */
export function estimateRating(summary: PlayerSummary, cal: Calibration = calibration as Calibration): RatingEstimate {
  if (summary.accuracy === null || summary.moves < RATING.minMoves) return { kind: 'not-enough-moves' };

  const extraBlunders = Math.max(0, summary.counts.Blunder - RATING.freeBlunders);
  const rating = Math.max(RATING.floor, ratingForAccuracy(summary.accuracy, cal.points) - extraBlunders * RATING.blunderPenalty);

  const base = cal.typicalError ?? RATING.range;
  const half = summary.moves < RATING.shortGameMoves ? base + (RATING.shortGameRange - RATING.range) : base;
  const round = (n: number) => Math.round(n / 50) * 50;
  return {
    kind: 'estimate',
    rating: round(rating),
    low: Math.max(RATING.floor, round(rating - half)),
    high: round(rating + half),
    calibrated: cal.calibrated,
  };
}
