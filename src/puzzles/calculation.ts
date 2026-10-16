// Calculation mode (pure): after a few seconds the pieces hide and the solver enters the whole solution
// line from memory, both sides' moves, by clicking squares. The line is then checked against the
// puzzle's solution with the trainer's own rule (the expected move, or any mate for the solver).
import { Chess } from 'chess.js';
import type { Puzzle } from './types';

export type CalcEntry = { uci: string; san: string };

/** The moves to enter: everything after the opponent's set-up move (solver first, then alternating). */
export function solutionLine(puzzle: Puzzle): string[] {
  return puzzle.moves.slice(1);
}

/** The position the solver calculates from (after the set-up move). */
export function calcStartFen(puzzle: Puzzle): string {
  const c = new Chess(puzzle.fen);
  c.move({ from: puzzle.moves[0].slice(0, 2), to: puzzle.moves[0].slice(2, 4), promotion: puzzle.moves[0][4] });
  return c.fen();
}

/** The position after the entries so far (entries are always legal, so this can't fail). */
export function fenAfter(startFen: string, entries: CalcEntry[]): string {
  const c = new Chess(startFen);
  for (const e of entries) c.move({ from: e.uci.slice(0, 2), to: e.uci.slice(2, 4), promotion: e.uci[4] });
  return c.fen();
}

/**
 * A from→to click on the hidden board after the entries so far. Pawns reaching the last rank become
 * queens. Null when that move isn't legal there (the board doesn't say why: that is the calculation).
 */
export function enterMove(startFen: string, entries: CalcEntry[], from: string, to: string): CalcEntry | null {
  const c = new Chess(fenAfter(startFen, entries));
  try {
    const m = c.move({ from, to, promotion: 'q' });
    return { uci: m.from + m.to + (m.promotion ?? ''), san: m.san };
  } catch {
    return null;
  }
}

const sameMove = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? 'q') === (b[4] ?? 'q');

/** Whether the entries are a whole line: as long as the solution, or ending in mate. */
export function lineComplete(puzzle: Puzzle, entries: CalcEntry[]): boolean {
  const last = entries[entries.length - 1];
  return entries.length >= solutionLine(puzzle).length || (!!last && last.san.endsWith('#'));
}

export type CalcCheck = {
  correct: boolean;
  /** Index (in the entered line) of the first move that's off the solution; null when correct. */
  firstWrong: number | null;
};

/**
 * Checks the entered line. Even indices are the solver's moves: right when they match the solution or
 * give mate (a mate ends the line, solved). Odd indices are the opponent's replies and must match.
 */
export function checkLine(puzzle: Puzzle, entries: CalcEntry[]): CalcCheck {
  const line = solutionLine(puzzle);
  for (let i = 0; i < line.length; i++) {
    const e = entries[i];
    if (!e) return { correct: false, firstWrong: i };
    const solver = i % 2 === 0;
    if (solver && e.san.endsWith('#')) return { correct: true, firstWrong: null };
    if (!sameMove(e.uci, line[i])) return { correct: false, firstWrong: i };
  }
  return { correct: true, firstWrong: null };
}

/**
 * How to replay the checked line on the trainer, so the attempt is judged and recorded the usual way:
 * the solver moves to play in order, then `reveal` (show the solution) when the line went wrong on an
 * opponent reply or stopped short. A wrong solver move is played as-is and the trainer marks it wrong.
 */
export function replayPlan(puzzle: Puzzle, entries: CalcEntry[]): { moves: string[]; reveal: boolean } {
  const { correct, firstWrong } = checkLine(puzzle, entries);
  const solverAt = (upTo: number) => entries.slice(0, upTo).filter((_, i) => i % 2 === 0).map((e) => e.uci);
  if (correct) {
    const mateAt = entries.findIndex((e, i) => i % 2 === 0 && e.san.endsWith('#'));
    return { moves: solverAt(mateAt >= 0 ? mateAt + 1 : entries.length), reveal: false };
  }
  const i = firstWrong!;
  if (i % 2 === 0 && entries[i]) return { moves: solverAt(i + 1), reveal: false };
  return { moves: solverAt(i), reveal: true };
}
