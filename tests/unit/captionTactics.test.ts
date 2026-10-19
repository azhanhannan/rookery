// Coach motifs (factsVersion 4): the tactic caption rules and their near misses. The positives for every kind
// are in captionFacts.test.ts; here are the cases that look like a tactic but must stay silent, because a
// wrong caption is worse than none.
import { describe, expect, it } from 'vitest';
import { motifFor } from '../../src/insights/motifs';
import { trainForMotif } from '../../src/insights/train';
import { caption, captionFact, captionInputFor, type CaptionFact, type CaptionInput } from '../../src/review/captions';
import { findMove } from '../../src/review/brilliant';
import { playLine, settledLoss } from '../../src/review/tactics';
import { SAMPLE_REVIEW } from '../fixtures/sample-review';

const blunder = (fenBefore: string, uci: string, extra: Partial<CaptionInput> = {}): CaptionInput => ({
  label: 'Blunder',
  fenBefore,
  uci,
  ...extra,
});
const after = (bestAfter: string[], extra: Partial<CaptionInput> = {}) => ({ bestAfter: bestAfter[0], lineAfter: bestAfter, ...extra });
const missed = (lineBefore: string[]) => ({ label: 'Miss' as const, bestBefore: lineBefore[0], lineBefore });

describe('tactics: helpers', () => {
  it('playLine stops at the first illegal move', () => {
    expect(playLine('7k/r7/8/8/2K5/8/8/6R1 b - - 0 1', ['a7a4', 'c4d5', 'h8h9', 'a4g4']).map((m) => m.san)).toEqual(['Ra4+', 'Kd5']);
  });

  it('settledLoss counts from the start and lets the recapture settle', () => {
    // Nxe5 dxe5: a knight for a pawn is 2 down, not 3.
    const start = '6k1/8/3p4/4N3/3P4/8/8/6K1 b - - 0 1';
    const take = findMove(start, 'd6e5')!;
    expect(settledLoss(start, take, 'w')).toBe(2);
  });
});

describe('captions: pins', () => {
  it('walking a piece into an existing line names the pinner (no reply move)', () => {
    // Nd2?? steps onto the a5-e1 diagonal; e3 attacks it and it can't move.
    expect(caption(blunder('4k3/8/8/b7/4p3/8/8/1N2K3 w - - 0 1', 'b1d2', after(['e4e3', 'e1e2', 'e3d2'])))).toBe(
      'This walked into a pin — the bishop on a5 pins your knight on d2 to your king.',
    );
  });

  it('a pin that was already there before the move is not "walked into"', () => {
    expect(captionFact(blunder('4k3/8/8/b7/4p3/8/3N3P/4K3 w - - 0 1', 'h2h3', after(['e4e3', 'e1e2', 'e3d2'])))).toBeNull();
  });

  it('a pin the engine line never cashes in proves nothing', () => {
    expect(captionFact(blunder('4k3/8/8/b7/4p3/8/8/1N2K3 w - - 0 1', 'b1d2', after(['e4e3', 'e1e2', 'e8d7'])))).toBeNull();
  });

  it('missed pin: the king steps off the line, nothing is won', () => {
    expect(captionFact(blunder('4k3/8/2n5/8/3P4/8/8/4KB2 w - - 0 1', 'e1e2', missed(['f1b5', 'e8d8'])))).toBeNull();
  });
});

describe('captions: skewers', () => {
  it('the piece behind is defended: the skewer only trades, so no caption', () => {
    expect(captionFact(blunder('7k/r7/8/8/2K5/7P/8/6R1 w - - 0 1', 'g1g4', after(['a7a4', 'c4d5', 'a4g4', 'h3g4'])))).toBeNull();
  });

  it('missed skewer onto a defended rook: no caption', () => {
    expect(captionFact(blunder('8/8/7p/2k3r1/8/8/8/R6K w - - 0 1', 'h1h2', missed(['a1a5', 'c5d6', 'a5g5', 'h6g5'])))).toBeNull();
  });
});

describe('captions: discovered attacks', () => {
  it('the uncovered attack the engine does not use proves nothing', () => {
    expect(captionFact(blunder('6k1/1b6/8/8/4n3/8/6P1/3K3R w - - 0 1', 'g2g4', after(['e4c3', 'd1d2', 'c3e4'])))).toBeNull();
  });

  it('a discovered check names the king', () => {
    // Ra2?? puts the rook where the knight lands with a discovered check from the rook on d8.
    const fact = captionFact(blunder('3r2k1/8/8/3n4/8/8/8/R2K4 w - - 0 1', 'a1a2', after(['d5b4', 'd1e2', 'b4a2'])));
    expect(fact?.kind).toBe('discovered-attack');
    expect(caption(blunder('3r2k1/8/8/3n4/8/8/8/R2K4 w - - 0 1', 'a1a2', after(['d5b4', 'd1e2', 'b4a2'])))).toBe(
      'This allowed a discovered check — Nb4+ opens the rook on d8 onto your king.',
    );
  });
});

describe('captions: trapped pieces', () => {
  it('a piece with a safe square is not trapped', () => {
    // King on e8 instead of d8: Nxc7 wins a pawn and gets out.
    expect(captionFact(blunder('N3k3/p1p5/6b1/8/8/8/7P/6K1 w - - 0 1', 'h2h3', after(['g6e4', 'g1f2', 'e4a8'])))).toBeNull();
  });
});

describe('captions: promotions', () => {
  it('a promotion that is taken back at once is not captioned', () => {
    expect(captionFact(blunder('7k/8/8/8/8/K7/6p1/1R6 w - - 0 1', 'a3a4', after(['g2g1q', 'b1g1'])))).toBeNull();
  });

  it('missed promotion onto a covered square: no caption', () => {
    expect(captionFact(blunder('6k1/1P1n4/8/8/8/8/8/6K1 w - - 0 1', 'g1g2', missed(['b7b8q', 'd7b8'])))).toBeNull();
  });
});

describe('captions: missed forks', () => {
  it('a fork whose knight can just be taken is not a fork', () => {
    expect(captionFact(blunder('r3k3/8/3b4/1N6/8/8/8/4K3 w - - 0 1', 'e1e2', missed(['b5c7', 'd6c7'])))).toBeNull();
  });
});

describe('captions: not defended well enough', () => {
  it('a pawn short of defenders is not captioned', () => {
    expect(captionFact(blunder('6k1/8/5n2/3b4/4P3/2N5/7P/6K1 w - - 0 1', 'h2h3', after(['f6e4', 'c3e4', 'd5e4'])))).toBeNull();
  });

  it('the static exchange alone is not enough: the engine line must agree', () => {
    const fen = 'rq2k2r/p4ppp/2p2bn1/2Pp1b2/8/2N1PN2/P2QK2P/R1B2BR1 w kq - 1 19';
    expect(captionFact(blunder(fen, 'a1b1', { bestAfter: 'f5b1', lineAfter: [] }))).toBeNull();
    expect(captionFact(blunder(fen, 'a1b1', after(['f5b1', 'e2e1', 'e8g8', 'c3b1', 'b8b1'])))?.kind).toBe('lost-in-exchange');
  });
});

describe('captions: stored reviews carry the line before the move', () => {
  it('captionInputFor fills lineBefore from the position before', () => {
    expect(captionInputFor(SAMPLE_REVIEW, 19)?.lineBefore).toEqual(SAMPLE_REVIEW.positions[18].bestLine);
  });
});

describe('insights: the new kinds as motifs', () => {
  const base = { fenBefore: '8/8/8/8/8/8/8/K6k w - - 0 1', fenAfter: '8/8/8/8/8/8/8/K6k b - - 0 1', me: 'w' as const, winBefore: 50, loss: 30, threat: null };
  const motif = (fact: CaptionFact) => motifFor({ ...base, fact });

  it('pins, skewers and discovered attacks get their own motif and lesson; missed forks are forks', () => {
    expect(motif({ kind: 'pin', piece: 'q', square: 'c3', by: 'b', from: 'b4', behind: 'k', san: 'Bb4' })).toBe('pin');
    expect(motif({ kind: 'missed-pin', piece: 'n', square: 'c6', by: 'b', from: 'b5', behind: 'k', san: 'Bb5' })).toBe('pin');
    expect(motif({ kind: 'skewer', piece: 'k', square: 'c4', behind: 'r', behindSquare: 'g4', san: 'Ra4+' })).toBe('skewer');
    expect(motif({ kind: 'missed-discovered-attack', piece: 'r', square: 'h8', by: 'b', from: 'b2', san: 'Nc6+' })).toBe('discovered-attack');
    expect(motif({ kind: 'missed-fork', piece: 'n', square: 'c7', san: 'Nc7+', targets: ['k', 'r'] })).toBe('fork');
    expect(motif({ kind: 'lost-in-exchange', piece: 'r', square: 'b1', san: 'Bxb1' })).toBe('hanging');
    expect(trainForMotif('pin')).toEqual({ kind: 'lesson', href: '#/lessons', lessonId: 'pins' });
    expect(trainForMotif('skewer')).toEqual({ kind: 'lesson', href: '#/lessons', lessonId: 'skewers' });
    expect(trainForMotif('discovered-attack')).toEqual({ kind: 'lesson', href: '#/lessons', lessonId: 'discovered-attacks' });
  });

  it('trapped pieces and promotions have no drill: filed under other', () => {
    expect(motif({ kind: 'trapped-piece', piece: 'n', square: 'a8', san: 'Be4' })).toBeUndefined();
    expect(motif({ kind: 'missed-promotion', piece: 'q', square: 'b8', san: 'b8=Q+' })).toBeUndefined();
  });
});
