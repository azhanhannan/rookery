import { applyMove, newRecord } from '../../src/game/rules';
import type { GameRecord } from '../../src/game/types';

export function play(ucis: string[], startFen?: string): GameRecord {
  let record = newRecord({
    white: { name: 'A', isBot: false },
    black: { name: 'B', isBot: false },
    startFen,
  });
  for (const uci of ucis) {
    const res = applyMove(record, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!res) throw new Error(`illegal or rejected move ${uci}`);
    record = res.record;
  }
  return record;
}

/** Castling (O-O), en passant (exd6) and promotion (cxd8=Q) in one game. */
export const SPECIAL_MOVES_GAME = [
  'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6', 'g8f6', 'd6c7', 'b8c6',
  'c7d8q', 'e8d8', 'g1f3', 'c8g4', 'f1c4', 'e7e5', 'e1g1',
];

export const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
