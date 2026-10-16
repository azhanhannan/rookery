// Pure lesson logic: checking a practice move against a lesson puzzle (chess.js), no React.
import { Chess, type Move } from 'chess.js';
import type { MoveInput } from '../game/rules';
import type { Lesson, LessonPuzzle } from './lessons';

/** SAN without the check/mate suffix, so "Ne7" and "Ne7+" compare equal. */
export function bareSan(san: string): string {
  return san.replace(/[+#!?]+$/, '');
}

/** Every answer the puzzle accepts (SAN), the intended one first. */
export function acceptedAnswers(p: LessonPuzzle): string[] {
  return [p.solution, ...(p.alsoAccept ?? [])];
}

/** The move a SAN names in a position, or null when it's not legal there. */
export function moveFromSan(fen: string, san: string): Move | null {
  try {
    return new Chess(fen).move(san);
  } catch {
    return null;
  }
}

/** A mating reply for the side to move in `fen` (SAN), or null when there is none. */
export function mateInOne(fen: string): string | null {
  const chess = new Chess(fen);
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return m.san;
  }
  return null;
}

export type PuzzleAttempt =
  | { kind: 'illegal' }
  | { kind: 'right'; san: string; from: string; to: string; fenAfter: string; mate: boolean }
  /** `allowsMate`: the opponent's mating reply this move allows, if any. */
  | { kind: 'wrong'; san: string; allowsMate: string | null };

/** Checks one practice move from the board. */
export function tryPuzzleMove(p: LessonPuzzle, input: MoveInput): PuzzleAttempt {
  const chess = new Chess(p.fen);
  let move: Move;
  try {
    move = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    return { kind: 'illegal' };
  }
  const san = move.san;
  if (acceptedAnswers(p).some((a) => bareSan(a) === bareSan(san))) {
    return { kind: 'right', san, from: move.from, to: move.to, fenAfter: chess.fen(), mate: chess.isCheckmate() };
  }
  return { kind: 'wrong', san, allowsMate: mateInOne(chess.fen()) };
}

/** Where the intended answer goes, for the "Show me" arrow. */
export function solutionSquares(p: LessonPuzzle): { from: string; to: string } | null {
  const m = moveFromSan(p.fen, p.solution);
  return m ? { from: m.from, to: m.to } : null;
}

/** Whose move it is in the puzzle, as the board orientation. */
export function puzzleSide(p: LessonPuzzle): 'white' | 'black' {
  return p.fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Steps through a lesson: the explanation screens, then the practice positions. */
export type LessonStep =
  | { kind: 'screen'; index: number }
  | { kind: 'puzzle'; index: number }
  | { kind: 'done' };

export function lessonSteps(lesson: Lesson): LessonStep[] {
  return [
    ...lesson.screens.map((_, index) => ({ kind: 'screen' as const, index })),
    ...lesson.puzzles.map((_, index) => ({ kind: 'puzzle' as const, index })),
    { kind: 'done' as const },
  ];
}
