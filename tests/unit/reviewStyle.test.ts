import { describe, expect, it } from 'vitest';
import { REVIEW_STYLE } from '../../src/config/tunables';
import {
  analystEval,
  analystScore,
  biggestMistake,
  defaultStyle,
  effectiveStyle,
  evalChange,
  keyMoments,
  nagFor,
  plainLine,
  ratingHint,
  shouldSelfReview,
  threatArrowFor,
  tierOf,
} from '../../src/review/reviewStyle';
import { MOVE_LABELS } from '../../src/review/types';
import { DEFAULT_REVIEW_PREFS, parseReviewPrefs } from '../../src/settings/reviewPrefs';
import { SAMPLE_RECORD, SAMPLE_REVIEW } from '../fixtures/sample-review';

describe('review style defaults', () => {
  it('comes from the rating: Learner < 1000 <= Club < 1900 <= Analyst; unknown is Club', () => {
    expect(defaultStyle(600)).toBe('learner');
    expect(defaultStyle(REVIEW_STYLE.learnerBelow - 1)).toBe('learner');
    expect(defaultStyle(REVIEW_STYLE.learnerBelow)).toBe('club');
    expect(defaultStyle(1899)).toBe('club');
    expect(defaultStyle(REVIEW_STYLE.clubBelow)).toBe('analyst');
    expect(defaultStyle(2400)).toBe('analyst');
    expect(defaultStyle(null)).toBe('club');
    expect(defaultStyle(undefined)).toBe('club');
    expect(defaultStyle(Number.NaN)).toBe('club');
  });

  it('a saved choice beats the rating; Auto (null) uses it', () => {
    expect(effectiveStyle('analyst', 500)).toBe('analyst');
    expect(effectiveStyle(null, 500)).toBe('learner');
    expect(effectiveStyle(null, null)).toBe('club');
  });

  it('rating hint: this session first, then the human Elo in a bot game, never a guess between two humans', () => {
    expect(ratingHint(SAMPLE_RECORD, 1450)).toBe(1450);
    expect(ratingHint(SAMPLE_RECORD)).toBeNull(); // "You" has no Elo
    const withElo = { ...SAMPLE_RECORD, white: { name: 'You', isBot: false, elo: 800 } };
    expect(ratingHint(withElo)).toBe(800);
    const friends = { ...SAMPLE_RECORD, white: { name: 'A', isBot: false, elo: 800 }, black: { name: 'B', isBot: false, elo: 2000 } };
    expect(ratingHint(friends)).toBeNull();
    expect(ratingHint(null)).toBeNull();
  });

  it('self-review: Off never, Learner only in Learner style, Always always', () => {
    expect(shouldSelfReview('off', 'learner')).toBe(false);
    expect(shouldSelfReview('learner', 'learner')).toBe(true);
    expect(shouldSelfReview('learner', 'club')).toBe(false);
    expect(shouldSelfReview('always', 'analyst')).toBe(true);
  });

  it('stored prefs: defaults for missing, unknown or corrupt values', () => {
    expect(parseReviewPrefs(null)).toEqual(DEFAULT_REVIEW_PREFS);
    expect(parseReviewPrefs('not json')).toEqual(DEFAULT_REVIEW_PREFS);
    expect(parseReviewPrefs('{"style":"wizard","selfReview":"sometimes","threatArrow":"yes"}')).toEqual(DEFAULT_REVIEW_PREFS);
    expect(parseReviewPrefs('{"style":"analyst","selfReview":"off","threatArrow":false,"keyMomentsOnly":true}')).toEqual({
      ...DEFAULT_REVIEW_PREFS,
      style: 'analyst',
      selfReview: 'off',
      threatArrow: false,
      keyMomentsOnly: true,
    });
  });
});

describe('style helpers', () => {
  it('three Learner tiers and Analyst NAGs cover every label', () => {
    expect(MOVE_LABELS.map((l) => [l, tierOf(l), nagFor(l)])).toEqual([
      ['Brilliant', 'good', '!!'],
      ['Great', 'good', '!'],
      ['Best', 'good', ''],
      ['Excellent', 'good', ''],
      ['Good', 'good', ''],
      ['Book', 'good', ''],
      ['Inaccuracy', 'inaccuracy', '?!'],
      ['Mistake', 'bad', '?'],
      ['Miss', 'bad', '?'],
      ['Blunder', 'bad', '??'],
    ]);
  });

  it('formats Club eval changes and Analyst evals', () => {
    expect(evalChange({ fen: '', score: { cp: -180 }, winWhite: 30, bestLine: [] }, { fen: '', score: { cp: 30 }, winWhite: 52, bestLine: [] })).toBe(
      '−1.8 → +0.3',
    );
    expect(evalChange({ fen: '', score: { cp: 50 }, winWhite: 55, bestLine: [] }, { fen: '', winWhite: 0, bestLine: [] })).toBe('+0.5 → 0-1');
    expect(evalChange({ fen: '', winWhite: 50, bestLine: [] }, { fen: '', winWhite: 50, bestLine: [] })).toBeNull();
    expect(analystScore({ cp: 134 })).toBe('+1.34');
    expect(analystScore({ cp: -7 })).toBe('−0.07');
    expect(analystScore({ cp: 0 })).toBe('0.00');
    expect(analystScore({ mate: 5 })).toBe('#5');
    expect(analystScore({ mate: -2 })).toBe('#-2');
    expect(analystEval({ fen: '', score: { cp: 134 }, winWhite: 60, bestLine: [] }, 20)).toBe('+1.34 d20');
    expect(analystEval({ fen: '', score: { cp: 134 }, winWhite: 60, bestLine: [], depth: 24 }, 20)).toBe('+1.34 d24');
  });

  it('key moments: the biggest swings, in game order, 3 to 5 of them', () => {
    expect(keyMoments(SAMPLE_REVIEW)).toEqual([13, 14, 17, 19]);
    // Capped at `max`: the three biggest (24, 21 and 14 points), still in game order.
    expect(keyMoments(SAMPLE_REVIEW, { min: 3, max: 3, minSwing: 10 })).toEqual([13, 17, 19]);
    // Too few big swings: topped up to `min` with the next biggest.
    expect(keyMoments(SAMPLE_REVIEW, { min: 3, max: 5, minSwing: 22 })).toEqual([13, 17, 19]);
  });

  it('biggest mistake for the human side only', () => {
    expect(biggestMistake(SAMPLE_REVIEW, ['w'])?.ply).toBe(17);
    expect(biggestMistake(SAMPLE_REVIEW, ['b'])?.ply).toBe(14);
  });

  it('plain lines name the better move for weak moves', () => {
    expect(plainLine(SAMPLE_REVIEW.moves[12])).toBe('A mistake. Nb5 was better.');
    expect(plainLine(SAMPLE_REVIEW.moves[0])).toBe('A well-known opening move.');
  });

  it('threat arrow: the reply after a weak move only', () => {
    expect(threatArrowFor(SAMPLE_REVIEW, 19)).toEqual({ from: 'c7', to: 'h2' });
    expect(threatArrowFor(SAMPLE_REVIEW, 20)).toBeNull();
    expect(threatArrowFor(SAMPLE_REVIEW, 1)).toBeNull();
    expect(threatArrowFor(SAMPLE_REVIEW, 0)).toBeNull();
  });
});
