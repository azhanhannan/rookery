import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { brilliantSacrifice, findMove, findSacrifice, see } from '../../src/review/brilliant';

/** 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6: White to play Legal's 5.Nxe5, leaving the queen to Bxd1. */
const LEGAL = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';

function seeOn(fen: string, square: string, side: 'w' | 'b'): number {
  const board = new Chess(fen);
  const value = see(board, square as never, side);
  expect(board.fen()).toBe(fen); // the search restores the board
  return value;
}

describe('see', () => {
  it('wins a hanging piece', () => {
    expect(seeOn('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(3);
  });

  it('counts the recapture: pawn takes a knight a pawn defends', () => {
    expect(seeOn('4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(2);
  });

  it('declines a losing capture: queen takes a rook a pawn defends', () => {
    expect(seeOn('4k3/8/2p5/3r4/8/8/3Q4/4K3 w - - 0 1', 'd5', 'w')).toBe(0);
  });

  it('sees x-rays: the rook behind the rook joins in', () => {
    // Rxd5 Rxd5 Rxd5: White wins a rook. Without the x-ray it would look like an even trade.
    expect(seeOn('3r2k1/8/8/3r4/8/8/3R4/3RK3 w - - 0 1', 'd5', 'w')).toBe(5);
  });

  it('lets the king take only an undefended piece', () => {
    expect(seeOn('8/8/3k4/4N3/8/8/8/4K3 b - - 0 1', 'e5', 'b')).toBe(3);
    expect(seeOn('8/8/3k4/4N3/3P4/8/8/4K3 b - - 0 1', 'e5', 'b')).toBe(0);
  });

  it('is 0 on an empty square or an own piece', () => {
    expect(seeOn('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'd4', 'w')).toBe(0);
    expect(seeOn('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'e4', 'w')).toBe(0);
  });
});

describe('findSacrifice', () => {
  it('finds the piece a move leaves en prise, net of what the move took', () => {
    const s = findSacrifice(LEGAL, findMove(LEGAL, 'f3e5')!);
    // Bxd1 Kxd1 (or Nxd1): 9 - 3 = 6, minus the pawn Nxe5 took.
    expect(s).toEqual({ square: 'd1', piece: 'q', net: 5 });
  });

  it('nets out a trade: Qxd8+ Kxd8 is not a sacrifice', () => {
    const fen = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1';
    expect(findSacrifice(fen, findMove(fen, 'd1d8')!)!.net).toBe(0);
  });

  it('ignores a piece that was already en prise before the move', () => {
    const fen = '4k3/8/4p3/3N4/8/8/P7/4K3 w - - 0 1';
    expect(findSacrifice(fen, findMove(fen, 'a2a3')!)).toBeNull();
  });
});

describe('brilliantSacrifice', () => {
  const ok = { fenBefore: LEGAL, uci: 'f3e5', winBefore: 70, loss: 0 };

  it('passes Legal\'s Nxe5', () => {
    expect(brilliantSacrifice(ok)?.piece).toBe('q');
  });

  it('needs loss <= maxLoss and winBefore below maxWinBefore', () => {
    expect(brilliantSacrifice({ ...ok, loss: 2 })).not.toBeNull();
    expect(brilliantSacrifice({ ...ok, loss: 2.1 })).toBeNull();
    expect(brilliantSacrifice({ ...ok, winBefore: 89.9 })).not.toBeNull();
    expect(brilliantSacrifice({ ...ok, winBefore: 90 })).toBeNull();
  });

  it('excludes a mover who is already lost', () => {
    expect(brilliantSacrifice({ ...ok, winBefore: 4.9 })).toBeNull();
    expect(brilliantSacrifice({ ...ok, winBefore: 5 })).not.toBeNull();
  });

  it('excludes a simple recapture', () => {
    expect(brilliantSacrifice({ ...ok, lastCapture: 'e5' })).toBeNull();
    expect(brilliantSacrifice({ ...ok, lastCapture: 'd4' })).not.toBeNull();
  });

  it('excludes the only legal move', () => {
    // White is in check from b1; Ng1 is the only move, and Bxg1 wins the knight.
    const fen = 'k7/8/8/2b5/8/7N/6PP/1r5K w - - 0 1';
    expect(new Chess(fen).moves()).toEqual(['Ng1']);
    expect(findSacrifice(fen, findMove(fen, 'h3g1')!)!.net).toBe(3);
    expect(brilliantSacrifice({ fenBefore: fen, uci: 'h3g1', winBefore: 50, loss: 0 })).toBeNull();
  });

  it('is null for a quiet move or an illegal one', () => {
    expect(brilliantSacrifice({ ...ok, uci: 'a2a3' })).toBeNull();
    expect(brilliantSacrifice({ ...ok, uci: 'e1e5' })).toBeNull();
  });
});
