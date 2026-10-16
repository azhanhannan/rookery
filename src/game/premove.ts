// Premoves: one move queued on the opponent's turn, played the moment it becomes the player's turn. Pure.
import { Chess } from 'chess.js';
import { needsPromotion, type MoveInput } from './rules';
import type { Color } from './types';

export type Premove = { from: string; to: string };

/** Whether a premove may be queued from `from`: the player's own piece, any target square but its own. */
export function canQueue(fen: string, player: Color, from: string, to: string): boolean {
  if (from === to) return false;
  try {
    const piece = new Chess(fen).get(from as Parameters<Chess['get']>[0]);
    return !!piece && piece.color === player;
  } catch {
    return false;
  }
}

/**
 * The move to play for a queued premove in `fen`, or null to cancel it: it must be the player's turn and the
 * move legal now. A pawn reaching the last rank promotes to a queen.
 */
export function resolvePremove(fen: string, player: Color, premove: Premove): MoveInput | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  if (chess.turn() !== player) return null;
  const input: MoveInput = needsPromotion(chess, premove.from, premove.to)
    ? { from: premove.from, to: premove.to, promotion: 'q' }
    : { from: premove.from, to: premove.to };
  const legal = chess.moves({ verbose: true }).some((m) => m.from === input.from && m.to === input.to);
  return legal ? input : null;
}
