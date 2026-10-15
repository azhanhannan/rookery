// Phase 3 contract shared by the review pipeline (analysis, classification, openings) and the review UI.
import type { AnalysisResult, Score } from '../engine/types';
import type { Color } from '../game/types';

export type MoveLabel =
  | 'Book'
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'
  | 'Miss';

export const MOVE_LABELS: MoveLabel[] = [
  'Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder',
];

/** Opening facts for a game, from the openings dataset. */
export type BookInfo = {
  /** Plies from the start that are book: ply i (1-based) is Book when i <= bookPlies. 0 = none. */
  bookPlies: number;
  eco?: string;
  /** Name of the deepest book position reached, e.g. "Sicilian Defense: Najdorf Variation". */
  name?: string;
};

/** One analysed position of the game (index 0 = start position, index N = after ply N). */
export type PositionReview = {
  fen: string;
  /** White's point of view. Absent for positions with no legal moves (see `winWhite`). */
  score?: Score;
  /** White's win chance 0-100 (mate/stalemate positions resolved from the rules: 0, 50 or 100). */
  winWhite: number;
  /** Engine's best move here, UCI; absent when there are no legal moves. */
  bestMove?: string;
  /** Engine's principal variation from here, UCI. */
  bestLine: string[];
  /** Search depth of this position when it differs from the review's (after "Analyse deeper here"). */
  depth?: number;
};

export type MoveReview = {
  /** 1-based ply: the move that leads from positions[ply - 1] to positions[ply]. */
  ply: number;
  color: Color;
  san: string;
  uci: string;
  label: MoveLabel;
  /** Mover's win chance (0-100) before the move, from the best line. */
  winBefore: number;
  /** Mover's win chance after the move actually played. */
  winAfter: number;
  /** max(0, winBefore - winAfter): win chance the move gave away. */
  loss: number;
  /** Move accuracy 0-100 (SPEC "Accuracy"). */
  accuracy: number;
  /** Engine's best move in the position before, UCI and SAN. */
  bestMove?: string;
  bestSan?: string;
  /** One line, template-generated, e.g. "Blunder: this lost your knight. Best was Nf5." */
  explanation: string;
};

export type PlayerSummary = {
  /** Game accuracy 0-100; null when the player made no moves. */
  accuracy: number | null;
  moves: number;
  counts: Record<MoveLabel, number>;
};

export type GameReview = {
  version: 1;
  depth: number;
  createdAt: string;
  positions: PositionReview[];
  moves: MoveReview[];
  opening?: BookInfo;
  white: PlayerSummary;
  black: PlayerSummary;
};

/** What the review runner hands to `buildReview`: one analysis per position, index-aligned with the game. */
export type ReviewInput = {
  startFen: string;
  moves: { san: string; uci: string; fenAfter: string }[];
  /** analyses[i] = analysis of the position after ply i (analyses[0] = start). Length = moves.length + 1. */
  analyses: AnalysisResult[];
  book: BookInfo;
  depth: number;
};
