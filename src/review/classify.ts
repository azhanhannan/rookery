import { Chess } from 'chess.js';
import { REVIEW } from '../config/tunables';
import type { AnalysisResult, Score } from '../engine/types';
import type { Color } from '../game/types';
import type { MoveLabel } from './types';
import { winChance } from './winChance';

/** White's win chance for an analysed position. No legal moves: checkmated side 0, stalemate 50. */
export function whiteWin(analysis: AnalysisResult): number {
  const best = analysis.lines[0];
  if (best) return winChance(best.score);
  const chess = new Chess(analysis.fen);
  if (!chess.isCheckmate()) return 50;
  return chess.turn() === 'w' ? 0 : 100;
}

/** A White-POV win chance seen from `color`'s side. */
export function forColor(white: number, color: Color): number {
  return color === 'w' ? white : 100 - white;
}

export function scoreWin(score: Score, color: Color): number {
  return forColor(winChance(score), color);
}

export type ClassifyInput = {
  /** Played move, UCI. */
  uci: string;
  color: Color;
  /** Analysis of the position before the move. */
  before: AnalysisResult;
  winBefore: number;
  loss: number;
  /** The opponent's previous move's loss; null on the first move of the game. */
  prevLoss: number | null;
  inBook: boolean;
  /** Result of the Brilliant check (brilliant.ts); passed in so the rules stay engine- and board-free. */
  brilliant: boolean;
};

/** Engine output may be upper case; promotion letters must match too ("e7e8q" is not "e7e8n"). */
export function sameMove(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function isGreat(m: ClassifyInput): boolean {
  const [first, second] = m.before.lines;
  if (!second) return false;
  const gap = scoreWin(first.score, m.color) - scoreWin(second.score, m.color);
  return gap >= REVIEW.greatGap && m.winBefore <= REVIEW.greatMaxWinBefore;
}

function byLoss(loss: number): MoveLabel {
  if (loss <= REVIEW.loss.excellent) return 'Excellent';
  if (loss <= REVIEW.loss.good) return 'Good';
  if (loss <= REVIEW.loss.inaccuracy) return 'Inaccuracy';
  if (loss <= REVIEW.loss.mistake) return 'Mistake';
  return 'Blunder';
}

/** SPEC Feature 3 "Move labels": the rules in table order, first match wins. */
export function classify(m: ClassifyInput): MoveLabel {
  if (m.inBook) return 'Book';
  if (m.brilliant) return 'Brilliant';
  const isTop = sameMove(m.uci, m.before.lines[0]?.move);
  if (isTop && isGreat(m)) return 'Great';
  if (isTop) return 'Best';
  if (m.prevLoss !== null && m.prevLoss >= REVIEW.missGift && m.loss >= REVIEW.missGiveBack) return 'Miss';
  return byLoss(m.loss);
}
