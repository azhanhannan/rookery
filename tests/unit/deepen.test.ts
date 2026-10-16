import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, Score } from '../../src/engine/types';
import { buildReview } from '../../src/review/buildReview';
import { applyDeepAnalysis, deepenIndices, deepenReview, storedAnalysis } from '../../src/review/deepen';
import type { ReviewInput } from '../../src/review/types';
import { FakeEngine, line } from './fakeEngine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function analysis(fen: string, move: string, score: Score, depth = 16, second?: [string, Score]): AnalysisResult {
  const lines = [{ rank: 1, move, score, pv: [move], depth }];
  if (second) lines.push({ rank: 2, move: second[0], score: second[1], pv: [second[0]], depth });
  return { fen, lines, depth };
}

/** 1.e4 e5 2.Nf3 Nc6, all about equal at depth 16. */
function smallGame(): ReviewInput {
  const chess = new Chess();
  const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
  const moves = ucis.map((uci) => {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    return { san: m.san, uci, fenAfter: chess.fen() };
  });
  const fens = [START, ...moves.map((m) => m.fenAfter)];
  const best = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
  return { startFen: START, moves, analyses: fens.map((f, i) => analysis(f, best[i], { cp: 30 })), book: { bookPlies: 0 }, depth: 16 };
}

describe('Analyse deeper here', () => {
  it('refreshes the positions around the move: before and after it', () => {
    expect(deepenIndices(0)).toEqual([0]);
    expect(deepenIndices(3)).toEqual([2, 3]);
  });

  it('a stored position reads back as a one-line analysis', () => {
    const review = buildReview(smallGame());
    expect(storedAnalysis(review.positions[1], 16)).toEqual({
      fen: review.positions[1].fen,
      depth: 16,
      lines: [{ rank: 1, move: 'e7e5', score: { cp: 30 }, pv: ['e7e5'], depth: 16 }],
    });
  });

  it('a deeper look that finds 1...e5 lost re-labels it, the next move, and the summaries', () => {
    const input = smallGame();
    const review = buildReview(input);
    expect(review.moves.map((m) => m.label)).toEqual(['Best', 'Best', 'Best', 'Best']);
    // At depth 24: Black should have played ...c5, and after 1...e5 White is +5, so e5 was a blunder.
    const before = analysis(review.positions[1].fen, 'c7c5', { cp: 30 }, 24);
    const deep = analysis(review.positions[2].fen, 'g1f3', { cp: 500 }, 24);
    const next = applyDeepAnalysis(review, new Map([[1, before], [2, deep]]));

    expect(next.positions[2]).toMatchObject({ score: { cp: 500 }, depth: 24, bestMove: 'g1f3' });
    expect(next.positions[2].winWhite).toBeGreaterThan(80);
    expect(next.moves[1]).toMatchObject({ label: 'Blunder', bestMove: 'c7c5', bestSan: 'c5' });
    expect(next.moves[1].loss).toBeGreaterThan(20);
    expect(next.black.counts.Blunder).toBe(1);
    expect(next.black.accuracy!).toBeLessThan(review.black.accuracy!);
    // 2.Nf3 starts from the refreshed position: winBefore follows it.
    expect(next.moves[2].winBefore).toBeCloseTo(next.positions[2].winWhite, 5);
    // 2...Nc6 is re-checked (its Miss rule reads 2.Nf3's loss) and comes out the same; the original is untouched.
    expect(next.moves[3]).toEqual(review.moves[3]);
    expect(review.moves[1].label).toBe('Best');
    expect(next.createdAt).toBe(review.createdAt);
  });

  it('keeps a Great it cannot re-check (the stored position has one line only)', () => {
    const input = smallGame();
    // 2.Nf3 was Great: the second line was far worse.
    input.analyses[2] = analysis(input.analyses[2].fen, 'g1f3', { cp: 30 }, 16, ['d2d4', { cp: -400 }]);
    const review = buildReview(input);
    expect(review.moves[2].label).toBe('Great');
    // Refreshing the position after 2.Nf3 re-labels 2.Nf3 from its stored (one-line) before-position.
    const deep = analysis(review.positions[3].fen, 'b8c6', { cp: 35 }, 24);
    const next = applyDeepAnalysis(review, new Map([[3, deep]]));
    expect(next.moves[2].label).toBe('Great');
  });

  it('asks the engine for the two positions at the chosen depth, full width', async () => {
    const review = buildReview(smallGame());
    const engine = new FakeEngine();
    engine.lines = [line(1, 'g1f3', { cp: 40 })];
    const next = await deepenReview(review, 2, { depth: 24, engine });
    expect(engine.analyzeCalls).toEqual([
      [review.positions[1].fen, { depth: 24, multiPV: 2 }],
      [review.positions[2].fen, { depth: 24, multiPV: 2 }],
    ]);
    expect(next.positions[1].depth).toBe(24);
    expect(next.positions[2].depth).toBe(24);
  });

  it('can ask for more lines (shown only) and hands each fresh analysis over as it arrives', async () => {
    const review = buildReview(smallGame());
    const engine = new FakeEngine();
    engine.lines = [line(1, 'g1f3', { cp: 40 }), line(2, 'd2d4', { cp: 30 }), line(3, 'c2c4', { cp: 20 })];
    const seen: [number, number][] = [];
    await deepenReview(review, 2, { depth: 24, engine, multiPV: 3, onAnalysis: (i, a) => seen.push([i, a.lines.length]) });
    expect(engine.analyzeCalls.map(([, o]) => o)).toEqual([{ depth: 24, multiPV: 3 }, { depth: 24, multiPV: 3 }]);
    expect(seen).toEqual([[1, 3], [2, 3]]);
  });

  it('a cancelled run rejects without touching the review', async () => {
    const review = buildReview(smallGame());
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(deepenReview(review, 2, { engine: new FakeEngine(), signal: ctrl.signal })).rejects.toThrow(/cancelled/);
  });
});
