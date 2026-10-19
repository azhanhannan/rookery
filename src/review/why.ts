// "Why?" for a move in Review: explanations built only from logic and the stored engine analysis (no AI).
// Two sources, both pure and both proven from the review:
//   - the line story (src/review/lineStory.ts): play the engine's line out and report what provably happens
//     (material won, checks, mate, pieces attacked) after the move played, and after the engine's better move;
//   - what changed (src/review/positionChanges.ts): measurable differences between the position before and
//     after the move (king shelter, castling rights, pawn structure, development, piece activity). These are
//     facts, never blamed for the evaluation drop: the UI shows them under "What changed", not "Why it's bad".
// This file is the shared contract; `explainMove` combines both for the UI.
import type { Color } from '../game/types';
import type { ReviewStyle } from './reviewStyle';
import type { GameReview } from './types';

/** One sentence of an explanation, with the UCI moves it talks about (the UI can play them on the board). */
export type WhySentence = {
  text: string;
  /** Machine-readable reason, e.g. 'wins-material', 'mate', 'check', 'attacks-two', 'king-shield'. */
  kind: string;
  /** UCI moves from the sentence's starting position (the line the sentence narrates), if any. */
  line?: string[];
  /** FEN the `line` starts from. */
  fromFen?: string;
};

export type LineStoryInput = {
  /** Position before the move (positions[ply - 1].fen). */
  fenBefore: string;
  /** The move played, UCI. */
  played: string;
  mover: Color;
  /** Engine line after the move played (positions[ply].bestLine), UCI. */
  lineAfter: string[];
  /** Engine line before the move (positions[ply - 1].bestLine), UCI; its first move is the engine's choice. */
  lineBefore: string[];
  /** Mover's win chance before / after (MoveReview.winBefore / winAfter). */
  winBefore: number;
  winAfter: number;
};

export type LineStory = {
  /** What the engine's line shows happens after the move played (empty when nothing provable). */
  played: WhySentence[];
  /** What the engine's better move achieves (empty when the move played was the engine's choice). */
  better: WhySentence[];
};

/** A measurable difference between the position before and after the mover's move. */
export type ChangeFact = WhySentence & {
  /** Which side the fact is about: the mover's own position, or the opponent's. */
  side: 'own' | 'opponent';
  /** Ranking among facts (higher first); the UI shows the top few. */
  weight: number;
};

export type MoveExplanation = {
  ply: number;
  story: LineStory;
  changes: ChangeFact[];
};

/** Builds the full "Why?" for review.moves[ply - 1]. Implemented once lineStory/positionChanges exist. */
export function explainMove(review: GameReview, ply: number, style: ReviewStyle): MoveExplanation {
  void style;
  void review;
  return { ply, story: { played: [], better: [] }, changes: [] };
}
