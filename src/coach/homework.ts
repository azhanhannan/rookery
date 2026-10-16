// Coach homework positions (pure, chess.js only): checked by the server on create, solved in the browser
// with the puzzle state machine (src/puzzles/session.ts).
import { Chess } from 'chess.js';
import { COACH } from '../config/tunables';
import type { HomeworkItem } from '../api/types';
import type { MistakePuzzle } from '../puzzles/harvest';
import type { PuzzleSession } from '../puzzles/session';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function play(chess: Chess, uci: string): boolean {
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Why a homework position can't be used, or null when it is fine: a legal position that isn't over,
 * a legal solution of 1..COACH.maxSolutionPlies plies that ends on a solver move.
 */
export function homeworkItemError(raw: unknown): string | null {
  const item = raw as Partial<HomeworkItem> | null;
  if (!item || typeof item !== 'object') return 'Each position needs a FEN and a solution.';
  if (typeof item.fen !== 'string' || item.fen.length > 100) return 'Each position needs a FEN.';
  let chess: Chess;
  try {
    chess = new Chess(item.fen.trim());
  } catch {
    return `"${item.fen}" is not a legal position.`;
  }
  if (chess.isGameOver()) return 'A position where the game is already over has nothing to solve.';
  const sol = item.solution;
  if (!Array.isArray(sol) || sol.length === 0) return 'Each position needs a solution move.';
  if (sol.length > COACH.maxSolutionPlies) return `A solution can be at most ${COACH.maxSolutionPlies} plies.`;
  if (sol.length % 2 === 0) return 'A solution must end on a move by the side solving it.';
  for (const m of sol) {
    if (typeof m !== 'string' || !UCI.test(m.toLowerCase()) || !play(chess, m.toLowerCase()))
      return `"${String(m)}" is not a legal move in that line.`;
  }
  if (item.note !== undefined && (typeof item.note !== 'string' || item.note.length > COACH.maxCommentChars))
    return 'A note must be text.';
  const src = item.source;
  if (
    src !== undefined &&
    (!src || typeof src.gameClientId !== 'string' || src.gameClientId.length > 200 || !Number.isInteger(src.ply) || src.ply < 1)
  )
    return 'A position source must name a game and a ply.';
  return null;
}

/** The item as stored: trimmed FEN, lowercase moves, only the known fields. */
export function cleanHomeworkItem(item: HomeworkItem): HomeworkItem {
  return {
    fen: item.fen.trim(),
    solution: item.solution.map((m) => m.toLowerCase()),
    ...(item.source ? { source: { gameClientId: item.source.gameClientId, ply: item.source.ply } } : {}),
    ...(item.note ? { note: item.note } : {}),
  };
}

/** A My-mistakes puzzle (set-up move first) as a homework position (solver to move). */
export function homeworkItemFromMistake(p: MistakePuzzle): HomeworkItem {
  const chess = new Chess(p.fen);
  play(chess, p.moves[0]);
  return { fen: chess.fen(), solution: p.moves.slice(1), source: { gameClientId: p.source.gameId, ply: p.source.ply } };
}

/** A puzzle session for a homework position: no set-up move, the solver moves first. */
export function homeworkSession(item: HomeworkItem, id: string): PuzzleSession {
  return {
    puzzle: { id, fen: item.fen, moves: item.solution, rating: 0, themes: ['homework'] },
    fen: item.fen,
    next: 0,
    solverColor: new Chess(item.fen).turn(),
    status: 'playing',
    lastMove: null,
    usedHelp: false,
  };
}

/**
 * A solution typed by a coach (moves separated by spaces or commas, SAN like "Qxf7#" or UCI like "h5f7",
 * move numbers ignored) as UCI from `fen`; or why it can't be read.
 */
export function parseSolution(fen: string, text: string): { solution: string[] } | { error: string } {
  let chess: Chess;
  try {
    chess = new Chess(fen.trim());
  } catch {
    return { error: 'That FEN is not a legal position.' };
  }
  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.replace(/^\d+\.+/, '').trim())
    .filter(Boolean);
  if (!tokens.length) return { error: 'Type the solution moves.' };
  const out: string[] = [];
  for (const t of tokens) {
    let m = null;
    try {
      m = UCI.test(t.toLowerCase())
        ? chess.move({ from: t.slice(0, 2).toLowerCase(), to: t.slice(2, 4).toLowerCase(), promotion: t[4]?.toLowerCase() })
        : chess.move(t);
    } catch {
      m = null;
    }
    if (!m) return { error: `"${t}" is not a legal move there.` };
    out.push(`${m.from}${m.to}${m.promotion ?? ''}`);
  }
  return { solution: out };
}
