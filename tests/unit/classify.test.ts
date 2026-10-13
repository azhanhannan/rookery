import { describe, expect, it } from 'vitest';
import { REVIEW } from '../../src/config/tunables';
import type { AnalysisResult, Score } from '../../src/engine/types';
import { classify, forColor, scoreWin, whiteWin, type ClassifyInput } from '../../src/review/classify';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The cp that gives White exactly `win` percent: the win-chance formula solved for cp. */
function cpFor(win: number): number {
  return -Math.log(100 / win - 1) / 0.00368208;
}

function analysis(...lines: [string, Score][]): AnalysisResult {
  return {
    fen: FEN,
    depth: 16,
    lines: lines.map(([move, score], i) => ({ rank: i + 1, move, score, pv: [move], depth: 16 })),
  };
}

/** White to move; top move e2e4 at `win1`, second line d2d4 at `win2`. */
function input(over: Partial<ClassifyInput> & { win1?: number; win2?: number } = {}): ClassifyInput {
  const { win1 = 50, win2 = 48, ...rest } = over;
  return {
    uci: 'e2e4',
    color: 'w',
    before: analysis(['e2e4', { cp: cpFor(win1) }], ['d2d4', { cp: cpFor(win2) }]),
    winBefore: win1,
    loss: 0,
    prevLoss: null,
    inBook: false,
    brilliant: false,
    ...rest,
  };
}

describe('mover win chances', () => {
  it('flips for Black', () => {
    expect(forColor(70, 'w')).toBe(70);
    expect(forColor(70, 'b')).toBe(30);
    expect(scoreWin({ mate: -2 }, 'b')).toBe(100);
    expect(scoreWin({ cp: 0 }, 'b')).toBe(50);
  });

  it('reads the best line, or the rules when there are no legal moves', () => {
    expect(whiteWin(analysis(['e2e4', { mate: 3 }]))).toBe(100);
    // Fool's mate: White is checkmated.
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(whiteWin({ fen: mated, lines: [], depth: 0 })).toBe(0);
    // Black king h8 has no moves and is not in check.
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    expect(whiteWin({ fen: stalemate, lines: [], depth: 0 })).toBe(50);
    const blackMated = 'k7/1Q6/1K6/8/8/8/8/8 b - - 0 1';
    expect(whiteWin({ fen: blackMated, lines: [], depth: 0 })).toBe(100);
  });
});

describe('classify', () => {
  it('Book comes first, even over a Brilliant top move', () => {
    expect(classify(input({ inBook: true, brilliant: true }))).toBe('Book');
  });

  it('Brilliant comes before Great and Best', () => {
    expect(classify(input({ brilliant: true, win2: 10 }))).toBe('Brilliant');
  });

  it('Great: top move with the second line at least greatGap worse', () => {
    expect(REVIEW.greatGap).toBe(15);
    expect(classify(input({ win1: 60, win2: 44.9 }))).toBe('Great');
    expect(classify(input({ win1: 60, win2: 45.1 }))).toBe('Best');
  });

  it('Great: not when the mover was already above greatMaxWinBefore', () => {
    expect(classify(input({ win1: 95, win2: 50 }))).toBe('Great');
    expect(classify(input({ win1: 96, win2: 50 }))).toBe('Best');
  });

  it('Great: from Black\'s side, the second line is worse for Black', () => {
    const before = analysis(['e7e5', { cp: cpFor(40) }], ['a7a6', { cp: cpFor(70) }]);
    expect(classify(input({ uci: 'e7e5', color: 'b', before, winBefore: 60 }))).toBe('Great');
  });

  it('Great needs a second line', () => {
    const before = analysis(['e2e4', { cp: 0 }]);
    expect(classify(input({ before }))).toBe('Best');
  });

  it('Best: same move as the engine, case-insensitive, promotion letter included', () => {
    const before = analysis(['E7E8Q', { cp: 500 }], ['e7e8r', { cp: 480 }]);
    expect(classify(input({ uci: 'e7e8q', before, winBefore: 80 }))).toBe('Best');
    expect(classify(input({ uci: 'e7e8n', before, winBefore: 80, loss: 1 }))).toBe('Excellent');
  });

  it('Miss: the opponent gave at least missGift and this move gives back at least missGiveBack', () => {
    const notTop = { uci: 'g1f3' };
    expect(classify(input({ ...notTop, prevLoss: 10, loss: 10 }))).toBe('Miss');
    expect(classify(input({ ...notTop, prevLoss: 40, loss: 35 }))).toBe('Miss');
    expect(classify(input({ ...notTop, prevLoss: 9.9, loss: 30 }))).toBe('Blunder');
    expect(classify(input({ ...notTop, prevLoss: 40, loss: 9.9 }))).toBe('Inaccuracy');
    expect(classify(input({ ...notTop, prevLoss: null, loss: 30 }))).toBe('Blunder');
  });

  it('Best beats Miss: the top move is never a Miss', () => {
    expect(classify(input({ prevLoss: 40, loss: 12 }))).toBe('Best');
  });

  it('labels the rest by loss, bounds inclusive', () => {
    const at = (loss: number) => classify(input({ uci: 'g1f3', loss }));
    expect(at(0)).toBe('Excellent');
    expect(at(2)).toBe('Excellent');
    expect(at(2.01)).toBe('Good');
    expect(at(5)).toBe('Good');
    expect(at(5.01)).toBe('Inaccuracy');
    expect(at(10)).toBe('Inaccuracy');
    expect(at(10.01)).toBe('Mistake');
    expect(at(20)).toBe('Mistake');
    expect(at(20.01)).toBe('Blunder');
    expect(at(100)).toBe('Blunder');
  });
});
