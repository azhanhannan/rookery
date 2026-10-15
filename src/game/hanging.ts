// Practice games: which of a side's pieces are "hanging" (attacked and undefended, or attacked by a cheaper piece).
// Pure chess logic; pins, x-rays and en passant are ignored on purpose (a soft hint, not an exchange evaluator).
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Color } from './types';

/** Usual piece values in pawns; the king only ever attacks or defends, it is never reported. */
export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/**
 * Squares of `color`'s pieces (kings excluded) that the opponent attacks and that are either undefended or
 * attacked by a piece worth less than them. Works whichever side is to move.
 */
export function hangingPieces(fen: string, color: Color): Square[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const opponent: Color = color === 'w' ? 'b' : 'w';
  const out: Square[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const attackers = chess.attackers(p.square, opponent);
      if (attackers.length === 0) continue;
      const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUE[chess.get(sq)!.type]));
      const defended = chess.attackers(p.square, color).length > 0;
      if (!defended || cheapest < PIECE_VALUE[p.type]) out.push(p.square);
    }
  }
  return out;
}
