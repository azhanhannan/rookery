import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { REVIEW } from '../config/tunables';
import type { Color } from '../game/types';

/** SPEC material values in pawns. The king is never "won", so it counts 0 as a target. */
export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/** The legal move for `uci` in `fen` with chess.js's details, or null when it is not legal there. */
export function findMove(fen: string, uci: string): Move | null {
  const want = uci.toLowerCase();
  const moves = new Chess(fen).moves({ verbose: true });
  return moves.find((m) => m.from + m.to + (m.promotion ?? '') === want) ?? null;
}

function leastAttacker(board: Chess, square: Square, side: Color): Square | null {
  let best: Square | null = null;
  let bestValue = Infinity;
  for (const from of board.attackers(square, side)) {
    const piece = board.get(from)!;
    // The king goes last: it may only take when nothing defends the square.
    const value = piece.type === 'k' ? 100 : PIECE_VALUE[piece.type];
    if (value < bestValue) [best, bestValue] = [from, value];
  }
  return best;
}

/**
 * Static exchange evaluation: material `side` wins by capturing on `square`, each side capturing
 * with its least valuable piece and free to stop when going on would lose. Attackers are recomputed
 * after every capture, so x-rays (a rook behind a rook) count. Pins and promotions are ignored.
 * Mutates `board` during the search and restores it.
 */
export function see(board: Chess, square: Square, side: Color): number {
  const target = board.get(square);
  if (!target || target.color === side || target.type === 'k') return 0;
  const from = leastAttacker(board, square, side);
  if (!from) return 0;
  const attacker = board.get(from)!;
  if (attacker.type === 'k' && board.attackers(square, other(side)).length > 0) return 0;

  board.remove(from);
  board.remove(square);
  board.put(attacker, square);
  const gain = PIECE_VALUE[target.type] - see(board, square, other(side));
  board.remove(square);
  board.put(target, square);
  board.put(attacker, from);
  return Math.max(0, gain);
}

/** Material the move itself wins: the captured piece plus what a promotion adds. */
export function moveGain(move: Move): number {
  const captured = move.captured ? PIECE_VALUE[move.captured] : 0;
  const promoted = move.promotion ? PIECE_VALUE[move.promotion] - 1 : 0;
  return captured + promoted;
}

/** Squares the side to move can legally capture on. A pinned or checked defender can't take, whatever SEE says. */
function legalCaptureSquares(board: Chess): Set<string> {
  return new Set(board.moves({ verbose: true }).filter((m) => m.captured).map((m) => m.to));
}

export type Sacrifice = { square: Square; piece: PieceSymbol; net: number };

/**
 * The mover's piece the opponent can win after `move`, with the net material lost (SEE minus what
 * the move captured), or null. Candidates: the moved piece, and any other piece the move left en
 * prise, i.e. whose SEE got worse because of the move (a piece that was already en prise before
 * doesn't count: the move didn't sacrifice it).
 */
export function findSacrifice(fenBefore: string, move: Move): Sacrifice | null {
  const before = new Chess(fenBefore);
  const after = new Chess(move.after);
  const mover = move.color;
  const opponent = other(mover);
  const capturable = legalCaptureSquares(after);
  const gained = moveGain(move);

  let found: Sacrifice | null = null;
  for (const row of after.board()) {
    for (const p of row) {
      if (!p || p.color !== mover || p.type === 'k' || !capturable.has(p.square)) continue;
      const lost = see(after, p.square, opponent);
      const isMoved = p.square === move.to;
      if (!isMoved && lost <= see(before, p.square, opponent)) continue;
      const net = lost - gained;
      if (!found || net > found.net) found = { square: p.square, piece: p.type, net };
    }
  }
  return found;
}

export type BrilliantInput = {
  fenBefore: string;
  uci: string;
  winBefore: number;
  loss: number;
  /** Where the opponent's previous move captured, if it did: taking back there is a simple recapture. */
  lastCapture?: string;
};

/**
 * SPEC "Brilliant check", plus two exclusions of our own: the only legal move (nothing was chosen),
 * and a mover already below REVIEW.brilliant.minWinBefore. Returns the sacrifice, or null when not Brilliant.
 */
export function brilliantSacrifice(b: BrilliantInput): Sacrifice | null {
  if (b.loss > REVIEW.brilliant.maxLoss) return null;
  if (b.winBefore >= REVIEW.brilliant.maxWinBefore || b.winBefore < REVIEW.brilliant.minWinBefore) return null;
  if (new Chess(b.fenBefore).moves().length <= 1) return null;
  const move = findMove(b.fenBefore, b.uci);
  if (!move) return null;
  if (move.captured && move.to === b.lastCapture) return null;
  const sacrifice = findSacrifice(b.fenBefore, move);
  return sacrifice && sacrifice.net >= REVIEW.brilliant.minSacrifice ? sacrifice : null;
}
