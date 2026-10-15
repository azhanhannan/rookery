import { describe, expect, it } from 'vitest';
import { caption, captionForMove, type CaptionInput } from '../../src/review/captions';
import { SAMPLE_REVIEW } from '../fixtures/sample-review';

function c(fenBefore: string, uci: string, extra: Partial<CaptionInput> = {}): string | null {
  return caption({ label: 'Blunder', fenBefore, uci, ...extra });
}

describe('captions: mates', () => {
  it('missed mate in 1 is found on the board, whatever the engine sent', () => {
    expect(c('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a2')).toBe('You missed mate in 1 (Ra8#).');
  });

  it('allowed mate in 1: the back rank opens', () => {
    expect(c('4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a2', { bestAfter: 'e8e1' })).toBe(
      'This allowed mate in 1 (Re1#).',
    );
  });

  it('missed mate in 2 is checked move by move (rook ladder)', () => {
    expect(
      c('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', 'a2a3', { bestBefore: 'a2a7', scoreBefore: { mate: 2 }, scoreAfter: { cp: 2000 } }),
    ).toBe('You missed mate in 2, starting with Ra7.');
  });

  it('allowed mate in 2 is checked against every reply', () => {
    expect(
      c('1r4k1/r7/8/8/8/2P5/8/7K w - - 0 1', 'c3c4', { scoreBefore: { cp: -900 }, bestAfter: 'a7a2', scoreAfter: { mate: -2 } }),
    ).toBe('This allowed mate in 2.');
  });

  it('a mate the engine claims but the rules cannot confirm silences every caption', () => {
    // A free rook is there too, but the engine says mate in 3: no caption beats a half-true one.
    expect(
      c('r5k1/5ppp/8/8/4B3/8/5PPP/6K1 w - - 0 1', 'h2h3', { label: 'Mistake', bestBefore: 'e4a8', scoreBefore: { mate: 3 }, scoreAfter: { cp: 300 } }),
    ).toBeNull();
    // A wrong mate in 2 claim (the line is not a forced mate) also stays silent.
    expect(
      c('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', 'a2a3', { bestBefore: 'b1b8', scoreBefore: { mate: 2 }, scoreAfter: { cp: 2000 } }),
    ).toBeNull();
  });

  it('a mate that was already coming is not "allowed"', () => {
    expect(
      c('1r4k1/r7/8/8/8/2P5/8/7K w - - 0 1', 'c3c4', { scoreBefore: { mate: -2 }, bestAfter: 'a7a2', scoreAfter: { mate: -2 } }),
    ).toBeNull();
  });
});

describe('captions: material', () => {
  it('an undefended piece the reply takes', () => {
    expect(c('6k1/1b6/8/8/8/8/3N4/6K1 w - - 0 1', 'd2f3', { bestAfter: 'b7f3' })).toBe(
      'This left your knight on f3 undefended — Bxf3 wins it.',
    );
  });

  it('a defended piece taken by a cheaper one', () => {
    expect(c('6k1/8/3p4/8/3P4/5N2/8/6K1 w - - 0 1', 'f3e5', { bestAfter: 'd6e5' })).toBe(
      'dxe5 wins your knight on e5 for a pawn.',
    );
  });

  it('a fair trade is not a hung piece', () => {
    expect(c('6k1/6p1/5n2/8/8/8/1B6/6K1 w - - 0 1', 'b2f6', { label: 'Mistake', bestAfter: 'g7f6' })).toBeNull();
  });

  it('a piece lost after grabbing a pawn still reads as lost', () => {
    // Nxe5?: the pawn came first, but dxe5 still nets the knight for it (2 pawns down).
    expect(c('6k1/8/3p4/4p3/8/5N2/8/6K1 w - - 0 1', 'f3e5', { bestAfter: 'd6e5' })).toBe(
      'This left your knight on e5 undefended — dxe5 wins it.',
    );
  });

  it('missed a free piece', () => {
    expect(c('r5k1/5ppp/8/8/4B3/8/5PPP/6K1 w - - 0 1', 'h2h3', { label: 'Mistake', bestBefore: 'e4a8' })).toBe(
      'You missed a free rook on a8 (Bxa8).',
    );
  });

  it('a capture that can be taken back is not free', () => {
    expect(c('1r4k1/1p3ppp/8/8/4B3/8/5PPP/6K1 w - - 0 1', 'h2h3', { label: 'Mistake', bestBefore: 'e4b7' })).toBeNull();
  });
});

describe('captions: forks', () => {
  const fen = '6k1/8/8/8/3n4/8/8/R2QK3 w - - 0 1';

  it('a knight fork the engine line cashes in', () => {
    expect(c(fen, 'd1h5', { label: 'Mistake', bestAfter: 'd4c2', lineAfter: ['d4c2', 'e1d2', 'c2a1'] })).toBe(
      'This allowed a fork on c2 — Nc2+ attacks your king and rook.',
    );
  });

  it('no fork caption without the line that wins the material', () => {
    expect(c(fen, 'd1h5', { label: 'Mistake', bestAfter: 'd4c2', lineAfter: ['d4c2', 'e1d2'] })).toBeNull();
    expect(c(fen, 'd1h5', { label: 'Mistake', bestAfter: 'd4c2', lineAfter: ['d4c2', 'e1d2', 'c2e3'] })).toBeNull();
  });

  it('no fork when the forking piece can simply be taken', () => {
    // The queen on d3 now guards c2.
    expect(c(fen, 'd1d3', { label: 'Mistake', bestAfter: 'd4c2', lineAfter: ['d4c2', 'd3c2', 'g8f7'] })).toBeNull();
  });
});

describe('captions: when to stay quiet', () => {
  it('good moves get no caption', () => {
    expect(c('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a2', { label: 'Good' })).toBeNull();
    expect(c('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8', { label: 'Best' })).toBeNull();
  });

  it('a weak move no rule explains gets no caption', () => {
    expect(c('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'g7g5', { label: 'Mistake', bestBefore: 'e7e5', bestAfter: 'd2d4' })).toBeNull();
  });

  it('an illegal or unknown move gets no caption', () => {
    expect(c('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1h8')).toBeNull();
  });

  it('reads a stored review: 10.Nxd4?? allowed Qh2#', () => {
    expect(captionForMove(SAMPLE_REVIEW, 19)).toBe('This allowed mate in 1 (Qh2#).');
    expect(captionForMove(SAMPLE_REVIEW, 20)).toBeNull();
    expect(captionForMove(SAMPLE_REVIEW, 99)).toBeNull();
  });
});
