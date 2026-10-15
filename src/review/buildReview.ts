import { Chess } from 'chess.js';
import type { AnalysisResult } from '../engine/types';
import type { Color } from '../game/types';
import { gameAccuracy, moveAccuracy } from './accuracy';
import { brilliantSacrifice, findMove } from './brilliant';
import { classify, forColor, whiteWin } from './classify';
import { explain } from './explain';
import {
  MOVE_LABELS,
  type GameReview,
  type MoveLabel,
  type MoveReview,
  type PlayerSummary,
  type PositionReview,
  type ReviewInput,
} from './types';

export function toPosition(fen: string, analysis: AnalysisResult, winWhite: number): PositionReview {
  const best = analysis.lines[0];
  return { fen, score: best?.score, winWhite, bestMove: best?.move.toLowerCase(), bestLine: best?.pv ?? [] };
}

/** SAN of an engine move; undefined if the engine sent something illegal. */
function toSan(fen: string, uci: string | undefined): string | undefined {
  return uci ? findMove(fen, uci)?.san : undefined;
}

export function summarize(moves: MoveReview[], color: Color): PlayerSummary {
  const mine = moves.filter((m) => m.color === color);
  const counts = Object.fromEntries(MOVE_LABELS.map((l) => [l, 0])) as Record<MoveLabel, number>;
  for (const m of mine) counts[m.label]++;
  return { accuracy: gameAccuracy(mine.map((m) => m.accuracy)), moves: mine.length, counts };
}

export type ReviewMoveInput = {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  before: AnalysisResult;
  after: AnalysisResult;
  /** White's win chance before and after the move (whiteWin of the two analyses). */
  winWhiteBefore: number;
  winWhiteAfter: number;
  /** The previous move's loss; null on the first move. */
  prevLoss: number | null;
  inBook: boolean;
  /** Square the previous move captured on, if it captured. */
  lastCapture: string | undefined;
};

/** Pure: the review of one move from the analyses of the positions before and after it. */
export function reviewMove(i: ReviewMoveInput): MoveReview {
  const { ply, san, uci, fenBefore, before, after, prevLoss, inBook, lastCapture } = i;
  const color: Color = new Chess(fenBefore).turn();
  const winBefore = forColor(i.winWhiteBefore, color);
  const winAfter = forColor(i.winWhiteAfter, color);
  const loss = Math.max(0, winBefore - winAfter);
  const sacrifice = inBook ? null : brilliantSacrifice({ fenBefore, uci, winBefore, loss, lastCapture });
  const label = classify({ uci, color, before, winBefore, loss, prevLoss, inBook, brilliant: sacrifice !== null });
  const bestMove = before.lines[0]?.move.toLowerCase();
  const bestSan = toSan(fenBefore, bestMove);
  return {
    ply,
    color,
    san,
    uci,
    label,
    winBefore,
    winAfter,
    loss,
    accuracy: inBook ? 100 : moveAccuracy(loss),
    bestMove,
    bestSan,
    explanation: explain({ label, color, fenBefore, uci, bestMove, bestSan, before, after, sacrifice }),
  };
}

/** Pure: turns per-position engine analyses into the full review (labels, accuracy, explanations, summaries). */
export function buildReview(input: ReviewInput): GameReview {
  const { moves, analyses, book } = input;
  if (analyses.length !== moves.length + 1) {
    throw new Error(`expected ${moves.length + 1} analyses, got ${analyses.length}`);
  }
  const fens = [input.startFen, ...moves.map((m) => m.fenAfter)];
  const wins = analyses.map(whiteWin);
  const positions = analyses.map((a, i) => toPosition(fens[i], a, wins[i]));

  const reviews: MoveReview[] = [];
  let prevLoss: number | null = null;
  let lastCapture: string | undefined;
  for (let ply = 1; ply <= moves.length; ply++) {
    const { san, uci } = moves[ply - 1];
    const fenBefore = fens[ply - 1];
    reviews.push(
      reviewMove({
        ply,
        san,
        uci,
        fenBefore,
        before: analyses[ply - 1],
        after: analyses[ply],
        winWhiteBefore: wins[ply - 1],
        winWhiteAfter: wins[ply],
        prevLoss,
        inBook: ply <= book.bookPlies,
        lastCapture,
      }),
    );
    prevLoss = reviews[ply - 1].loss;
    const played = findMove(fenBefore, uci);
    lastCapture = played?.captured ? played.to : undefined;
  }

  return {
    version: 1,
    depth: input.depth,
    createdAt: new Date().toISOString(),
    positions,
    moves: reviews,
    opening: book.bookPlies > 0 || book.name ? book : undefined,
    white: summarize(reviews, 'w'),
    black: summarize(reviews, 'b'),
  };
}
