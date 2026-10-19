// What changed: measurable differences between the position before and after a move. Contract in ./why.ts.
import type { Color } from '../game/types';
import type { ReviewStyle } from './reviewStyle';
import type { ChangeFact } from './why';

/** `ply` is the move's 1-based ply in the game (development facts depend on how far the game is). */
export function positionChanges(fenBefore: string, fenAfter: string, mover: Color, ply: number, style: ReviewStyle): ChangeFact[] {
  void fenBefore;
  void fenAfter;
  void mover;
  void ply;
  void style;
  return [];
}
