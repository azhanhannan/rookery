import { describe, expect, it } from 'vitest';
import { hangingPieces } from '../../src/game/hanging';

const sorted = (xs: string[]) => [...xs].sort();

describe('hangingPieces', () => {
  it('the start position has nothing hanging', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(hangingPieces(start, 'w')).toEqual([]);
    expect(hangingPieces(start, 'b')).toEqual([]);
  });

  it('flags an attacked, undefended piece', () => {
    // White knight on e5 attacked by the black queen on e7; nothing defends it.
    const fen = '4k3/4q3/8/4N3/8/8/8/4K3 w - - 0 1';
    expect(hangingPieces(fen, 'w')).toEqual(['e5']);
  });

  it('a defended piece attacked by a more valuable piece is fine', () => {
    // Knight e5 attacked by the queen e7, defended by the d4 pawn.
    const fen = '4k3/4q3/8/4N3/3P4/8/8/4K3 w - - 0 1';
    expect(hangingPieces(fen, 'w')).toEqual([]);
  });

  it('a defended piece attacked by a cheaper piece is flagged', () => {
    // Rook d5 defended by the e4 pawn but attacked by the c6 pawn.
    const fen = '4k3/8/2p5/3R4/4P3/8/8/4K3 w - - 0 1';
    expect(hangingPieces(fen, 'w')).toEqual(['d5']);
  });

  it('works for the side not to move and for black', () => {
    // Black bishop c5 attacked by the white knight a4 and undefended, with white to move; the knight is safe.
    const fen = '4k3/8/8/2b5/N7/8/8/4K3 w - - 0 1';
    expect(hangingPieces(fen, 'b')).toEqual(['c5']);
    expect(hangingPieces(fen, 'w')).toEqual([]);
  });

  it('never reports the king, even in check', () => {
    const fen = '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1';
    expect(hangingPieces(fen, 'w')).toEqual([]);
    // The rook on e2 is attacked by the king and undefended.
    expect(hangingPieces(fen, 'b')).toEqual(['e2']);
  });

  it('a piece attacked only by the king but defended is fine', () => {
    const fen = '4k3/8/8/8/8/8/r3r3/4K3 w - - 0 1'; // e2 is defended by the a2 rook
    expect(hangingPieces(fen, 'b')).toEqual([]);
  });

  it('blocked sliders do not attack', () => {
    // Rook a1 looks at a8 queen through a4 pawn: no attack.
    const fen = 'q3k3/8/8/8/P7/8/8/R3K3 w - - 0 1';
    expect(hangingPieces(fen, 'b')).toEqual([]);
  });

  it('several pieces at once', () => {
    // White queen d4 is attacked by the e5 pawn (cheaper); knight h5 attacked by the g6 pawn, undefended.
    const fen = '4k3/8/6p1/4p2N/3Q4/8/8/4K3 w - - 0 1';
    expect(sorted(hangingPieces(fen, 'w'))).toEqual(['d4', 'h5']);
  });

  it('returns nothing for an invalid FEN', () => {
    expect(hangingPieces('not a fen', 'w')).toEqual([]);
  });
});
