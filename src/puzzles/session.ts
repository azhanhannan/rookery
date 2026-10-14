// Pure puzzle-solving state machine (chess.js, no React).
import { Chess } from 'chess.js';
import type { Color } from '../game/types';
import type { Puzzle, PuzzleStatus } from './types';

export type PuzzleSession = {
  puzzle: Puzzle;
  /** Position on the board now. */
  fen: string;
  /** Index in puzzle.moves of the next move to be played (by either side). */
  next: number;
  solverColor: Color;
  status: PuzzleStatus;
  lastMove: { from: string; to: string } | null;
  /** A hint or the solution was shown: the attempt counts as not solved. */
  usedHelp: boolean;
};

/** Plays a UCI move on `fen`: the new position and the move's squares, or null when illegal. */
function play(fen: string, uci: string): { fen: string; from: string; to: string; mate: boolean } | null {
  const chess = new Chess(fen);
  try {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { fen: chess.fen(), from: m.from, to: m.to, mate: chess.isCheckmate() };
  } catch {
    return null;
  }
}

/** Plays moves[s.next]; throws if the puzzle data itself is broken (the build script replays every puzzle). */
function advance(s: PuzzleSession): PuzzleSession {
  const uci = s.puzzle.moves[s.next];
  const r = uci ? play(s.fen, uci) : null;
  if (!r) throw new Error(`puzzle ${s.puzzle.id}: move ${s.next} (${uci}) cannot be played`);
  return { ...s, fen: r.fen, next: s.next + 1, lastMove: { from: r.from, to: r.to } };
}

/** Plays the opponent's set-up move (moves[0]); the solver is then to move. */
export function startSession(puzzle: Puzzle): PuzzleSession {
  const before: PuzzleSession = {
    puzzle,
    fen: puzzle.fen,
    next: 0,
    solverColor: 'w',
    status: 'playing',
    lastMove: null,
    usedHelp: false,
  };
  const s = advance(before);
  return { ...s, solverColor: new Chess(s.fen).turn() };
}

const sameMove = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? 'q') === (b[4] ?? 'q');

/**
 * The solver's move. Right move → 'correct' (the opponent's reply is still to come: call
 * playOpponentReply after a short delay) or 'solved' when it was the last one. Any move that gives
 * checkmate also solves it (puzzles accept alternative mates). Anything else → 'wrong', status 'failed'.
 * Illegal moves return null and change nothing.
 */
export function trySolverMove(
  s: PuzzleSession,
  uci: string,
): { session: PuzzleSession; result: 'correct' | 'solved' | 'wrong' } | null {
  if (s.status !== 'playing' || s.next >= s.puzzle.moves.length) return null;
  const r = play(s.fen, uci.toLowerCase());
  if (!r) return null;
  const moved: PuzzleSession = { ...s, fen: r.fen, next: s.next + 1, lastMove: { from: r.from, to: r.to } };
  const expected = s.puzzle.moves[s.next];
  if (r.mate || sameMove(uci.toLowerCase(), expected)) {
    const last = r.mate || moved.next >= s.puzzle.moves.length;
    return last ? { session: { ...moved, status: 'solved' }, result: 'solved' } : { session: moved, result: 'correct' };
  }
  return { session: { ...moved, status: 'failed' }, result: 'wrong' };
}

/** Plays the opponent's next solution move (after a 'correct'). */
export function playOpponentReply(s: PuzzleSession): PuzzleSession {
  if (s.status !== 'playing' || s.next >= s.puzzle.moves.length) return s;
  if (new Chess(s.fen).turn() === s.solverColor) return s;
  return advance(s);
}

/** The square of the piece the solver should move next; marks usedHelp. */
export function hint(s: PuzzleSession): { session: PuzzleSession; from: string } {
  // After a wrong move, the move the solver should have played.
  const i = s.status === 'failed' ? s.next - 1 : s.next;
  const uci = s.puzzle.moves[Math.min(i, s.puzzle.moves.length - 1)];
  return { session: { ...s, usedHelp: true }, from: uci.slice(0, 2) };
}

/** Plays out the rest of the solution from where the solver is (status 'failed', usedHelp), returning each step's session for animation. */
export function showSolution(s: PuzzleSession): PuzzleSession[] {
  // After a wrong move the board is off the solution line: rewind to the position before it.
  let cur: PuzzleSession = { ...s, status: 'failed', usedHelp: true };
  if (s.status === 'failed' && s.next > 0) cur = rewind(cur, s.next - 1);
  const steps: PuzzleSession[] = [];
  while (cur.next < cur.puzzle.moves.length) {
    cur = advance(cur);
    steps.push(cur);
  }
  return steps;
}

/** The session with moves[0..next) of the solution played from the puzzle's start. */
function rewind(s: PuzzleSession, next: number): PuzzleSession {
  let cur: PuzzleSession = { ...s, fen: s.puzzle.fen, next: 0, lastMove: null };
  while (cur.next < next) cur = advance(cur);
  return cur;
}
