import { describe, expect, it } from 'vitest';
import {
  CAPTION_KINDS,
  caption,
  captionFact,
  captionFactForMove,
  captionForMove,
  captionText,
  type CaptionInput,
  type CaptionKind,
} from '../../src/review/captions';
import { SAMPLE_REVIEW } from '../fixtures/sample-review';

const blunder = (fenBefore: string, uci: string, extra: Partial<CaptionInput> = {}): CaptionInput => ({
  label: 'Blunder',
  fenBefore,
  uci,
  ...extra,
});

// One input per kind, with the exact sentence the Review screen showed before the split.
const CASES: { kind: CaptionKind; input: CaptionInput; text: string }[] = [
  { kind: 'missed-mate-1', input: blunder('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a2'), text: 'You missed mate in 1 (Ra8#).' },
  {
    kind: 'missed-mate-2',
    input: blunder('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', 'a2a3', { bestBefore: 'a2a7', scoreBefore: { mate: 2 }, scoreAfter: { cp: 2000 } }),
    text: 'You missed mate in 2, starting with Ra7.',
  },
  {
    kind: 'allowed-mate-1',
    input: blunder('4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a2', { bestAfter: 'e8e1' }),
    text: 'This allowed mate in 1 (Re1#).',
  },
  {
    kind: 'allowed-mate-2',
    input: blunder('1r4k1/r7/8/8/8/2P5/8/7K w - - 0 1', 'c3c4', { scoreBefore: { cp: -900 }, bestAfter: 'a7a2', scoreAfter: { mate: -2 } }),
    text: 'This allowed mate in 2.',
  },
  {
    kind: 'left-undefended',
    input: blunder('6k1/1b6/8/8/8/8/3N4/6K1 w - - 0 1', 'd2f3', { bestAfter: 'b7f3' }),
    text: 'This left your knight on f3 undefended — Bxf3 wins it.',
  },
  {
    // The king "defends" f3, but the rook on f8 covers it, so Kxf3 is illegal.
    kind: 'lost-for-free',
    input: blunder('5rk1/1b6/8/8/8/5N2/P5K1/8 w - - 0 1', 'a2a3', { bestAfter: 'b7f3' }),
    text: 'Bxf3+ wins your knight on f3 for free.',
  },
  {
    kind: 'lost-to-cheaper',
    input: blunder('6k1/8/3p4/8/3P4/5N2/8/6K1 w - - 0 1', 'f3e5', { bestAfter: 'd6e5' }),
    text: 'dxe5 wins your knight on e5 for a pawn.',
  },
  {
    kind: 'fork',
    input: blunder('6k1/8/8/8/3n4/8/8/R2QK3 w - - 0 1', 'd1h5', { label: 'Mistake', bestAfter: 'd4c2', lineAfter: ['d4c2', 'e1d2', 'c2a1'] }),
    text: 'This allowed a fork on c2 — Nc2+ attacks your king and rook.',
  },
  {
    kind: 'missed-free-piece',
    input: blunder('r5k1/5ppp/8/8/4B3/8/5PPP/6K1 w - - 0 1', 'h2h3', { label: 'Mistake', bestBefore: 'e4a8' }),
    text: 'You missed a free rook on a8 (Bxa8).',
  },
  // Coach motifs (factsVersion 4). Near misses for each are in captionTactics.test.ts.
  {
    // Real game: Qc3?? Bb4 pins the queen; O-O-O Bxc3.
    kind: 'pin',
    input: blunder('r2qkb1r/p1p2ppp/np2pn2/1N1bB3/8/5Q2/PPP2PPP/R3KBNR w KQkq - 0 10', 'f3c3', {
      bestAfter: 'f8b4',
      lineAfter: ['f8b4', 'e1c1', 'b4c3', 'b5c3', 'e8g8'],
    }),
    text: 'This walked into a pin — Bb4 pins your queen on c3 to your king.',
  },
  {
    // Bb5 pins Nc6 to the king, d5 wins it.
    kind: 'missed-pin',
    input: blunder('4k3/8/2n5/8/3P4/8/8/4KB2 w - - 0 1', 'e1e2', {
      label: 'Mistake',
      bestBefore: 'f1b5',
      lineBefore: ['f1b5', 'e8d7', 'd4d5', 'd7d6', 'd5c6'],
    }),
    text: 'You missed a pin — Bb5 pins the knight on c6 to the king.',
  },
  {
    kind: 'skewer',
    input: blunder('7k/r7/8/8/2K5/8/8/6R1 w - - 0 1', 'g1g4', { bestAfter: 'a7a4', lineAfter: ['a7a4', 'c4d5', 'a4g4'] }),
    text: 'This allowed a skewer — Ra4+ attacks your king and wins the rook on g4 behind it.',
  },
  {
    kind: 'missed-skewer',
    input: blunder('8/8/8/2k3r1/8/8/8/R6K w - - 0 1', 'h1h2', { label: 'Miss', bestBefore: 'a1a5', lineBefore: ['a1a5', 'c5d6', 'a5g5'] }),
    text: 'You missed a skewer — Ra5+ attacks the king and wins the rook on g5 behind it.',
  },
  {
    // g4?? opens the long diagonal; Nc3+ uncovers the bishop on the rook.
    kind: 'discovered-attack',
    input: blunder('6k1/1b6/8/8/4n3/8/6P1/3K3R w - - 0 1', 'g2g4', { bestAfter: 'e4c3', lineAfter: ['e4c3', 'd1d2', 'b7h1'] }),
    text: 'This allowed a discovered attack — Nc3+ opens the bishop on b7 onto your rook on h1.',
  },
  {
    kind: 'missed-discovered-attack',
    input: blunder('7r/4k3/8/8/3N4/8/1B6/6K1 w - - 0 1', 'g1g2', { label: 'Miss', bestBefore: 'd4c6', lineBefore: ['d4c6', 'e7d6', 'b2h8'] }),
    text: 'You missed a discovered attack — Nc6+ opens your bishop on b2 onto the rook on h8.',
  },
  {
    // The knight on a8: b6 is covered by the a7 pawn, Nxc7 loses it to the king. Be4 attacks it.
    kind: 'trapped-piece',
    input: blunder('N2k4/p1p5/6b1/8/8/8/7P/6K1 w - - 0 1', 'h2h3', { bestAfter: 'g6e4', lineAfter: ['g6e4', 'g1f2', 'e4a8'] }),
    text: 'This let your knight on a8 get trapped — after Be4 it has no safe square.',
  },
  {
    kind: 'missed-trap',
    input: blunder('6k1/7p/8/8/8/6B1/P1P5/n2K4 w - - 0 1', 'g3h4', { label: 'Miss', bestBefore: 'g3e5', lineBefore: ['g3e5', 'g8f7', 'e5a1'] }),
    text: 'You missed trapping the knight on a1 — after Be5 it has no safe square.',
  },
  {
    // Real game: Re8?? lets the h-pawn through.
    kind: 'allowed-promotion',
    input: blunder('1R6/1PN5/5pk1/6p1/8/8/P6p/3K4 w - - 0 45', 'b8e8', {
      bestAfter: 'h2h1q',
      lineAfter: ['h2h1q', 'd1c2', 'h1b7', 'e8g8', 'g6f5'],
    }),
    text: 'This let a pawn promote — h1=Q+ makes a new queen.',
  },
  {
    kind: 'missed-promotion',
    input: blunder('6k1/1P6/8/8/8/8/8/6K1 w - - 0 1', 'g1g2', { label: 'Miss', bestBefore: 'b7b8q', lineBefore: ['b7b8q', 'g8g7'] }),
    text: 'You missed promoting your pawn (b8=Q+).',
  },
  {
    kind: 'missed-fork',
    input: blunder('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'e1e2', { label: 'Miss', bestBefore: 'b5c7', lineBefore: ['b5c7', 'e8d7', 'c7a8'] }),
    text: 'You missed a fork — Nc7+ attacks the king and rook.',
  },
  {
    // Real game: Rb1?? — attacked by the bishop and the queen behind it, defended by the knight only.
    kind: 'lost-in-exchange',
    input: blunder('rq2k2r/p4ppp/2p2bn1/2Pp1b2/8/2N1PN2/P2QK2P/R1B2BR1 w kq - 1 19', 'a1b1', {
      bestAfter: 'f5b1',
      lineAfter: ['f5b1', 'e2e1', 'e8g8', 'c3b1', 'b8b1'],
    }),
    text: 'Bxb1 wins material — your rook on b1 is not defended well enough.',
  },
];

describe('captionFact: every kind round-trips to the old sentence', () => {
  it.each(CASES)('$kind', ({ kind, input, text }) => {
    const fact = captionFact(input);
    expect(fact?.kind).toBe(kind);
    expect(captionText(fact!)).toBe(text);
    expect(caption(input)).toBe(text);
  });

  it('the cases cover every kind', () => {
    expect(new Set(CASES.map((c) => c.kind))).toEqual(new Set(CAPTION_KINDS));
  });

  it('carries the details a motif needs', () => {
    expect(captionFact(CASES[4].input)).toEqual({ kind: 'left-undefended', piece: 'n', square: 'f3', san: 'Bxf3' });
    expect(captionFact(CASES[6].input)).toEqual({ kind: 'lost-to-cheaper', piece: 'n', square: 'e5', san: 'dxe5', by: 'p' });
    expect(captionFact(CASES[7].input)).toEqual({ kind: 'fork', piece: 'n', square: 'c2', san: 'Nc2+', targets: ['k', 'r'] });
    expect(captionFact(CASES[2].input)).toEqual({ kind: 'allowed-mate-1', san: 'Re1#', uci: 'e8e1' });
  });

  it('no fact where there is no caption', () => {
    expect(captionFact(blunder('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a2', { label: 'Good' }))).toBeNull();
  });

  it('stored review: fact and sentence agree', () => {
    expect(captionFactForMove(SAMPLE_REVIEW, 19)?.kind).toBe('allowed-mate-1');
    expect(captionText(captionFactForMove(SAMPLE_REVIEW, 19)!)).toBe(captionForMove(SAMPLE_REVIEW, 19));
    expect(captionFactForMove(SAMPLE_REVIEW, 99)).toBeNull();
  });
});
