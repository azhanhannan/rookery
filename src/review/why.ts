// "Why?" for a move in Review: explanations built only from logic and the stored engine analysis (no AI).
// Two sources, both pure and both proven from the review:
//   - the line story (src/review/lineStory.ts): play the engine's line out and report what provably happens
//     (material won, checks, mate, pieces attacked) after the move played, and after the engine's better move;
//   - what changed (src/review/positionChanges.ts): measurable differences between the position before and
//     after the move (king shelter, castling rights, pawn structure, development, piece activity). These are
//     facts, never blamed for the evaluation drop: the UI shows them under "What changed", not "Why it's bad".
// This file is the shared contract; `explainMove` combines both for the UI.
import type { Color } from '../game/types';
import { captionForMove } from './captions';
import { lineStory } from './lineStory';
import { positionChanges } from './positionChanges';
import type { ReviewStyle } from './reviewStyle';
import type { GameReview, MoveLabel } from './types';

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

/** Labels whose moves get a "Why?" button in every style; Analyst offers it on any move. */
export const WHY_LABELS: ReadonlySet<MoveLabel> = new Set(['Inaccuracy', 'Mistake', 'Blunder', 'Miss']);

export function offersWhy(label: MoveLabel, style: ReviewStyle): boolean {
  return style === 'analyst' || WHY_LABELS.has(label);
}

const empty = (ply: number): MoveExplanation => ({ ply, story: { played: [], better: [] }, changes: [] });
/** Text compared loosely: case, spacing and the closing full stop don't make two sentences different. */
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');

/** Builds the full "Why?" for review.moves[ply - 1]: the line story, then the position changes that don't repeat it. */
export function explainMove(review: GameReview, ply: number, style: ReviewStyle): MoveExplanation {
  const move = review.moves[ply - 1];
  const before = review.positions[ply - 1];
  const after = review.positions[ply];
  if (!Number.isInteger(ply) || ply < 1 || !move || !before || !after) return empty(ply);
  const story = lineStory(
    {
      fenBefore: before.fen,
      played: move.uci,
      mover: move.color,
      lineAfter: after.bestLine,
      lineBefore: before.bestLine,
      winBefore: move.winBefore,
      winAfter: move.winAfter,
    },
    style,
  );
  // A change fact that says what the story (or the move's caption) already says is dropped.
  const told = [...story.played, ...story.better];
  const kinds = new Set(told.map((s) => s.kind));
  const texts = new Set(told.map((s) => norm(s.text)));
  const caption = captionForMove(review, ply);
  if (caption) texts.add(norm(caption));
  const changes = positionChanges(before.fen, after.fen, move.color, ply, style)
    .filter((c) => !kinds.has(c.kind) && !texts.has(norm(c.text)))
    .sort((a, b) => b.weight - a.weight);
  return { ply, story, changes };
}

/** Pieces, side to move, castling and en passant: the part of a FEN that decides which moves are legal. */
const boardKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/**
 * The game position (positions index) a sentence's line can be played from on the review board: the position
 * before or after the move, when `fromFen` is one of them. Null when the line starts anywhere else (no "Show").
 */
export function lineBaseFor(review: GameReview, ply: number, s: WhySentence): number | null {
  if (!s.line?.length || !s.fromFen) return null;
  const key = boardKey(s.fromFen);
  for (const base of [ply - 1, ply]) {
    const pos = review.positions[base];
    if (pos && boardKey(pos.fen) === key) return base;
  }
  return null;
}
