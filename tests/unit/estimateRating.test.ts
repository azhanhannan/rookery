import { describe, expect, it } from 'vitest';
import { estimateRating, ratingForAccuracy, type Calibration } from '../../src/rating/estimateRating';
import { MOVE_LABELS, type MoveLabel, type PlayerSummary } from '../../src/review/types';

function summary(accuracy: number | null, moves: number, blunders = 0): PlayerSummary {
  const counts = Object.fromEntries(MOVE_LABELS.map((l) => [l, 0])) as Record<MoveLabel, number>;
  counts.Blunder = blunders;
  return { accuracy, moves, counts };
}

const PLACEHOLDER = [
  { accuracy: 40, rating: 400 },
  { accuracy: 50, rating: 600 },
  { accuracy: 60, rating: 900 },
  { accuracy: 70, rating: 1200 },
  { accuracy: 80, rating: 1600 },
  { accuracy: 85, rating: 1900 },
  { accuracy: 90, rating: 2200 },
  { accuracy: 95, rating: 2600 },
];

describe('ratingForAccuracy', () => {
  it('hits the curve points and interpolates linearly between them', () => {
    expect(ratingForAccuracy(80, PLACEHOLDER)).toBe(1600);
    expect(ratingForAccuracy(75, PLACEHOLDER)).toBe(1400);
    expect(ratingForAccuracy(87.5, PLACEHOLDER)).toBe(2050);
  });

  it('clamps outside the curve', () => {
    expect(ratingForAccuracy(20, PLACEHOLDER)).toBe(400);
    expect(ratingForAccuracy(99, PLACEHOLDER)).toBe(2600);
  });

  it('does not depend on point order', () => {
    expect(ratingForAccuracy(75, [...PLACEHOLDER].reverse())).toBe(1400);
  });
});

describe('estimateRating (shipped placeholder curve)', () => {
  it('fewer than 10 moves: not enough moves', () => {
    expect(estimateRating(summary(90, 9))).toEqual({ kind: 'not-enough-moves' });
    expect(estimateRating(summary(null, 0))).toEqual({ kind: 'not-enough-moves' });
  });

  it('20+ moves: ±200 range, marked uncalibrated', () => {
    expect(estimateRating(summary(80, 30))).toEqual({ kind: 'estimate', rating: 1600, low: 1400, high: 1800, calibrated: false });
  });

  it('10-19 moves: wider ±300 range', () => {
    expect(estimateRating(summary(80, 15))).toMatchObject({ rating: 1600, low: 1300, high: 1900 });
  });

  it('two blunders are free; each one beyond costs 100', () => {
    expect(estimateRating(summary(80, 30, 2))).toMatchObject({ rating: 1600 });
    expect(estimateRating(summary(80, 30, 3))).toMatchObject({ rating: 1500, low: 1300, high: 1700 });
    expect(estimateRating(summary(80, 30, 5))).toMatchObject({ rating: 1300 });
  });

  it('never goes below the floor', () => {
    expect(estimateRating(summary(30, 30, 9))).toMatchObject({ rating: 100, low: 100 });
  });
});

describe('estimateRating with a calibrated curve', () => {
  it("uses the calibration's typical error as the range", () => {
    const cal: Calibration = { calibrated: true, typicalError: 150, points: PLACEHOLDER };
    expect(estimateRating(summary(80, 30), cal)).toEqual({ kind: 'estimate', rating: 1600, low: 1450, high: 1750, calibrated: true });
    expect(estimateRating(summary(80, 15), cal)).toMatchObject({ low: 1350, high: 1850 });
  });
});
