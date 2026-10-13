// One-line explanations from fixed templates (SPEC "Explanations": no free text).
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { AnalysisResult, Score } from '../engine/types';
import type { Color } from '../game/types';
import { findMove, other, PIECE_VALUE, see, type Sacrifice } from './brilliant';
import type { MoveLabel } from './types';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** Plies of the reply line followed to see what material the move cost. */
const MATERIAL_PLIES = 4;

export type ExplainInput = {
  label: MoveLabel;
  color: Color;
  fenBefore: string;
  uci: string;
  bestMove?: string;
  bestSan?: string;
  before: AnalysisResult;
  after: AnalysisResult;
  sacrifice: Sacrifice | null;
};

/** Mate in N for `color` (N >= 1), or null. */
function mateFor(score: Score | undefined, color: Color): number | null {
  if (!score || !('mate' in score)) return null;
  const mine = color === 'w' ? score.mate > 0 : score.mate < 0;
  return mine ? Math.abs(score.mate) : null;
}

function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) {
    for (const p of row) if (p) sum += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  }
  return sum;
}

/**
 * Material the mover is down after the move and the engine's reply line, and the most valuable piece
 * of theirs captured on the way. The line stops after an opponent move; a trade still in progress
 * there is settled with SEE, so "Nxd5 exd5" with a recapture to come doesn't read as a lost knight.
 */
function materialLost(i: ExplainInput): { net: number; piece?: PieceSymbol } {
  const chess = new Chess(i.fenBefore);
  const start = material(chess, i.color);
  const line = [i.uci, ...(i.after.lines[0]?.pv ?? [])].slice(0, MATERIAL_PLIES);
  let piece: PieceSymbol | undefined;
  let last: Square | undefined;
  for (const uci of line.slice(0, line.length - (line.length % 2))) {
    const move = findMove(chess.fen(), uci);
    if (!move) break;
    chess.move(move);
    last = move.to;
    if (move.captured && move.color !== i.color && (!piece || PIECE_VALUE[move.captured] > PIECE_VALUE[piece])) {
      piece = move.captured;
    }
  }
  const settle = last && chess.turn() === i.color ? see(chess, last, i.color) : 0;
  return { net: start - material(chess, i.color) - settle, piece };
}

/** The mover's most valuable piece the opponent can take for free after the move. */
function hangingPiece(i: ExplainInput): PieceSymbol | null {
  const move = findMove(i.fenBefore, i.uci);
  if (!move) return null;
  const after = new Chess(move.after);
  const capturable = new Set(after.moves({ verbose: true }).filter((m) => m.captured).map((m) => m.to));
  let best: PieceSymbol | null = null;
  for (const row of after.board()) {
    for (const p of row) {
      if (!p || p.color !== i.color || p.type === 'k' || !capturable.has(p.square)) continue;
      const free = see(after, p.square, other(i.color)) >= PIECE_VALUE[p.type];
      if (free && (!best || PIECE_VALUE[p.type] > PIECE_VALUE[best])) best = p.type;
    }
  }
  return best;
}

/** What the best move would have captured, when the played move took less. */
function missedCapture(i: ExplainInput): PieceSymbol | null {
  if (!i.bestMove) return null;
  const best = findMove(i.fenBefore, i.bestMove);
  const played = findMove(i.fenBefore, i.uci);
  if (!best?.captured) return null;
  const took = played?.captured ? PIECE_VALUE[played.captured] : 0;
  return PIECE_VALUE[best.captured] > took ? best.captured : null;
}

function article(piece: PieceSymbol): string {
  return `a ${PIECE_NAME[piece]}`;
}

/** Why a bad move was bad, most specific reason first. */
function badReason(i: ExplainInput): string {
  const mateMissed = mateFor(i.before.lines[0]?.score, i.color);
  const deliveredMate = i.after.lines.length === 0 && new Chess(i.after.fen).isCheckmate();
  if (mateMissed !== null && !deliveredMate && mateFor(i.after.lines[0]?.score, i.color) === null) {
    return `you missed mate in ${mateMissed}`;
  }
  const opponent = other(i.color);
  if (mateFor(i.after.lines[0]?.score, opponent) !== null && mateFor(i.before.lines[0]?.score, opponent) === null) {
    return 'this allows a forced mate';
  }
  const lost = materialLost(i);
  if (lost.net >= 1) {
    if (lost.piece && lost.piece !== 'p' && lost.net >= PIECE_VALUE[lost.piece] - 1) {
      return `this lost your ${PIECE_NAME[lost.piece]}`;
    }
    return lost.net === 1 ? 'this lost a pawn' : 'this lost material';
  }
  const hanging = hangingPiece(i);
  if (hanging) return `this leaves your ${PIECE_NAME[hanging]} hanging`;
  const missed = missedCapture(i);
  if (missed) return `you missed the chance to win ${article(missed)}`;
  if (i.label === 'Miss') return "you didn't punish your opponent's mistake";
  return 'there was a better move';
}

export function explain(i: ExplainInput): string {
  const best = i.bestSan ? ` Best was ${i.bestSan}.` : '';
  switch (i.label) {
    case 'Book':
      return 'Book move.';
    case 'Brilliant':
      return i.sacrifice ? `Brilliant: a sound sacrifice of your ${PIECE_NAME[i.sacrifice.piece]}.` : 'Brilliant: a sound sacrifice.';
    case 'Great':
      return 'Great: the only good move here.';
    case 'Best': {
      if (i.after.lines.length === 0 && new Chess(i.after.fen).isCheckmate()) return 'Best move: checkmate.';
      const mate = mateFor(i.after.lines[0]?.score, i.color);
      return mate !== null ? `Best move: mate in ${mate}.` : 'Best move.';
    }
    case 'Excellent':
    case 'Good':
      return `${i.label} move.${best}`;
    default:
      return `${i.label}: ${badReason(i)}.${best}`;
  }
}
