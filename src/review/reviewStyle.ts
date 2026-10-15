// Review styles (Learner / Club / Analyst) and the pure helpers each one uses. No React, no storage.
import { REVIEW_STYLE } from '../config/tunables';
import { botColor } from '../game/rules';
import type { Color, GameRecord } from '../game/types';
import type { Score } from '../engine/types';
import type { GameReview, MoveLabel, MoveReview, PositionReview } from './types';
import { formatScore } from './winChance';

export type ReviewStyle = 'learner' | 'club' | 'analyst';
export const REVIEW_STYLES: ReviewStyle[] = ['learner', 'club', 'analyst'];
export const STYLE_NAME: Record<ReviewStyle, string> = { learner: 'Learner', club: 'Club', analyst: 'Analyst' };
export const STYLE_HINT: Record<ReviewStyle, string> = {
  learner: 'Plain words, three colours, numbers on request.',
  club: 'Move labels, the eval change and a caption.',
  analyst: 'Engine numbers with depth and !/? symbols.',
};

/** When the "Where do you think it went wrong?" question comes before the review. */
export type SelfReviewSetting = 'off' | 'learner' | 'always';
export const SELF_REVIEW_NAME: Record<SelfReviewSetting, string> = {
  off: 'Off',
  learner: 'Learner style only',
  always: 'Always',
};

/** The style for a player with this rating: Learner below 1000, Club below 1900, else Analyst; unknown = Club. */
export function defaultStyle(rating: number | null | undefined): ReviewStyle {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return 'club';
  if (rating < REVIEW_STYLE.learnerBelow) return 'learner';
  if (rating < REVIEW_STYLE.clubBelow) return 'club';
  return 'analyst';
}

/** The chosen style, or the rating default when the player left it on Auto (null). */
export function effectiveStyle(chosen: ReviewStyle | null, rating: number | null | undefined): ReviewStyle {
  return chosen ?? defaultStyle(rating);
}

/**
 * The player's rating, when something says it: the latest rated result this session, else the human's
 * Elo in a game against a bot. Two humans (a friend game, an import): we can't tell which one is you.
 */
export function ratingHint(record: GameRecord | null, sessionRating?: number | null): number | null {
  if (typeof sessionRating === 'number' && Number.isFinite(sessionRating)) return sessionRating;
  if (!record) return null;
  const bot = botColor(record);
  if (!bot) return null;
  const human = bot === 'w' ? record.black : record.white;
  return typeof human.elo === 'number' ? human.elo : null;
}

export function shouldSelfReview(setting: SelfReviewSetting, style: ReviewStyle): boolean {
  return setting === 'always' || (setting === 'learner' && style === 'learner');
}

/** Learner's three colours: good, inaccuracy, and mistake/blunder/miss. */
export type Tier = 'good' | 'inaccuracy' | 'bad';
export function tierOf(label: MoveLabel): Tier {
  if (label === 'Inaccuracy') return 'inaccuracy';
  if (label === 'Mistake' || label === 'Blunder' || label === 'Miss') return 'bad';
  return 'good';
}
export const TIER_STYLE: Record<Tier, { color: string; name: string }> = {
  good: { color: '#4f9a2c', name: 'Good move' },
  inaccuracy: { color: '#d9a21b', name: 'Inaccuracy' },
  bad: { color: '#c7362b', name: 'Mistake' },
};
/** Learner shows these as a quiet badge on top of the tier colour. */
export const QUIET_LABELS: ReadonlySet<MoveLabel> = new Set(['Brilliant', 'Great']);

/** NAG-style symbols for Analyst. Labels that mean "fine" get none; no label maps to "!?". */
export function nagFor(label: MoveLabel): '' | '!!' | '!' | '!?' | '?!' | '?' | '??' {
  switch (label) {
    case 'Brilliant':
      return '!!';
    case 'Great':
      return '!';
    case 'Inaccuracy':
      return '?!';
    case 'Mistake':
    case 'Miss':
      return '?';
    case 'Blunder':
      return '??';
    default:
      return '';
  }
}

/** Score with a real minus sign, White's view: "+1.3", "−0.4", "M3", "−M2". */
export function signedScore(score: Score): string {
  return formatScore(score).replace(/^-/, '−');
}

/** Club's eval change for a move, White's view: "−1.8 → +0.3". Null when a side has no score (mate on board). */
export function evalChange(before: PositionReview, after: PositionReview): string | null {
  const a = before.score ? signedScore(before.score) : null;
  const b = after.score ? signedScore(after.score) : after.winWhite === 50 ? '½' : after.winWhite > 50 ? '1-0' : '0-1';
  return a ? `${a} → ${b}` : null;
}

/** Analyst's eval: two decimals and mate as "#5" / "#-5", White's view. */
export function analystScore(score: Score | undefined): string {
  if (!score) return '–';
  if ('mate' in score) return score.mate > 0 ? `#${score.mate}` : `#-${Math.abs(score.mate)}`;
  const v = score.cp / 100;
  if (Math.abs(v) < 0.005) return '0.00';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
}

/** "+1.34 d20": the position's eval with its search depth. */
export function analystEval(pos: PositionReview, reviewDepth: number): string {
  if (!pos.score) return pos.winWhite === 50 ? '½' : pos.winWhite > 50 ? '1-0' : '0-1';
  return `${analystScore(pos.score)} d${pos.depth ?? reviewDepth}`;
}

/**
 * Key moments: the 3-5 biggest win-chance swings of the game, in game order. Moves that swing at least
 * `minSwing` all count (up to `max`); below that, the biggest remaining swings top it up to `min`.
 */
export function keyMoments(review: GameReview, cfg = REVIEW_STYLE.keyMoments): number[] {
  const byLoss = review.moves.filter((m) => m.loss > 0).sort((a, b) => b.loss - a.loss || a.ply - b.ply);
  const big = byLoss.filter((m) => m.loss >= cfg.minSwing).slice(0, cfg.max);
  const picked = big.length >= cfg.min ? big : byLoss.slice(0, cfg.min);
  return picked.map((m) => m.ply).sort((a, b) => a - b);
}

/** The move the engine thinks went most wrong for these colours (largest loss among bad tiers), or null. */
export function biggestMistake(review: GameReview, colors: Color[]): MoveReview | null {
  let best: MoveReview | null = null;
  for (const m of review.moves) {
    if (!colors.includes(m.color) || tierOf(m.label) === 'good') continue;
    if (!best || m.loss > best.loss) best = m;
  }
  return best;
}

/** One plain sentence for Learner when no rule-based caption applies; always true given the label. */
export function plainLine(m: MoveReview): string {
  const better = m.bestSan ? ` ${m.bestSan} was better.` : '';
  switch (m.label) {
    case 'Book':
      return 'A well-known opening move.';
    case 'Brilliant':
      return 'Brilliant! A sacrifice that works.';
    case 'Great':
      return 'Great find: the only good move here.';
    case 'Best':
      return 'The best move here.';
    case 'Excellent':
    case 'Good':
      return 'A good move.';
    case 'Inaccuracy':
      return `Not the best.${better}`;
    case 'Mistake':
      return `A mistake.${better}`;
    case 'Blunder':
      return `A big mistake.${better}`;
    case 'Miss':
      return `Your opponent slipped, and this missed the chance.${better}`;
  }
}

/** Opponent's best reply after a weak move: the red "punishment" arrow. Null for good-tier moves. */
export function threatArrowFor(review: GameReview, ply: number): { from: string; to: string } | null {
  const move = ply > 0 ? review.moves[ply - 1] : undefined;
  const reply = review.positions[ply]?.bestMove;
  if (!move || !reply || tierOf(move.label) === 'good') return null;
  return { from: reply.slice(0, 2), to: reply.slice(2, 4) };
}
