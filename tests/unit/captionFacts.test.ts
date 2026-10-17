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
