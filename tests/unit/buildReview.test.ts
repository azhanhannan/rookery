import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, Score } from '../../src/engine/types';
import { moveAccuracy } from '../../src/review/accuracy';
import { buildReview } from '../../src/review/buildReview';
import { MOVE_LABELS, type ReviewInput } from '../../src/review/types';
import { winChance } from '../../src/review/winChance';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** 1.e4 e5 2.Nf3, Black to move. */
const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

type Line = [move: string, score: Score, pv?: string[]];

function analysis(fen: string, ...lines: Line[]): AnalysisResult {
  return {
    fen,
    depth: 16,
    lines: lines.map(([move, score, pv], i) => ({ rank: i + 1, move, score, pv: pv ?? [move], depth: 16 })),
  };
}

/** Plays `ucis` from `startFen` and pairs each position with the analysis `lines[i]`. */
function game(startFen: string, ucis: string[], lines: Line[][], bookPlies = 0): ReviewInput {
  const chess = new Chess(startFen);
  const moves = ucis.map((uci) => {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { san: m.san, uci, fenAfter: chess.fen() };
  });
  const fens = [startFen, ...moves.map((m) => m.fenAfter)];
  return {
    startFen,
    moves,
    analyses: fens.map((fen, i) => analysis(fen, ...lines[i])),
    book: { bookPlies },
    depth: 16,
  };
}

describe('buildReview: 2...Qh4?? 3.Nc3??', () => {
  const input = game(AFTER_NF3, ['d8h4', 'b1c3'], [
    [['b8c6', { cp: 30 }, ['b8c6', 'f1b5']], ['g8f6', { cp: 35 }]],
    [['f3h4', { cp: 900 }, ['f3h4', 'g8f6']], ['b1c3', { cp: 60 }]],
    [['h4h5', { cp: 60 }, ['h4h5', 'd2d4']], ['h4d8', { cp: 70 }]],
  ]);
  const review = buildReview(input);
  const [qh4, nc3] = review.moves;

  it('keeps one position per analysis, White POV', () => {
    expect(review.positions).toHaveLength(3);
    expect(review.positions[1]).toEqual({
      fen: input.moves[0].fenAfter,
      score: { cp: 900 },
      winWhite: winChance({ cp: 900 }),
      bestMove: 'f3h4',
      bestLine: ['f3h4', 'g8f6'],
      second: { move: 'b1c3', score: { cp: 60 } },
    });
  });

  it('is a version 2 review: each position keeps the second line (move and score), not only the best', () => {
    expect(review.version).toBe(2);
    expect(review.positions.map((p) => p.second?.move)).toEqual(['g8f6', 'b1c3', 'h4d8']);
  });

  it('measures Black\'s loss from Black\'s side', () => {
    expect(qh4.color).toBe('b');
    expect(qh4.ply).toBe(1);
    expect(qh4.san).toBe('Qh4');
    expect(qh4.winBefore).toBeCloseTo(100 - winChance({ cp: 30 }), 10);
    expect(qh4.winAfter).toBeCloseTo(100 - winChance({ cp: 900 }), 10);
    expect(qh4.loss).toBeCloseTo(winChance({ cp: 900 }) - winChance({ cp: 30 }), 10);
    expect(qh4.accuracy).toBeCloseTo(moveAccuracy(qh4.loss), 10);
  });

  it('labels the hung queen a Blunder and names it', () => {
    expect(qh4.label).toBe('Blunder');
    expect(qh4.bestMove).toBe('b8c6');
    expect(qh4.bestSan).toBe('Nc6');
    expect(qh4.explanation).toBe('Blunder: this lost your queen. Best was Nc6.');
  });

  it('labels the failure to take it a Miss', () => {
    expect(nc3.color).toBe('w');
    expect(nc3.label).toBe('Miss');
    expect(nc3.bestSan).toBe('Nxh4');
    expect(nc3.explanation).toBe('Miss: you missed the chance to win a queen. Best was Nxh4.');
  });

  it('summarises each player with every label counted', () => {
    expect(Object.keys(review.black.counts).sort()).toEqual([...MOVE_LABELS].sort());
    expect(review.black.moves).toBe(1);
    expect(review.black.counts.Blunder).toBe(1);
    expect(review.black.counts.Best).toBe(0);
    expect(review.black.accuracy).toBeCloseTo(qh4.accuracy, 10);
    expect(review.white.counts.Miss).toBe(1);
    expect(review.white.moves).toBe(1);
  });

  it('has no opening without book plies or a name', () => {
    expect(review.opening).toBeUndefined();
    expect(review.version).toBe(2);
    expect(review.depth).toBe(16);
  });
});

describe('buildReview: book, mate and the only move', () => {
  it('scores Book moves 100 and keeps the opening', () => {
    const input = game(START, ['e2e4', 'e7e5'], [
      [['e2e4', { cp: 30 }]],
      [['e7e5', { cp: 35 }]],
      [['g1f3', { cp: 80 }]],
    ], 1);
    input.book = { bookPlies: 1, eco: 'B00', name: "King's Pawn Game" };
    const review = buildReview(input);
    expect(review.moves.map((m) => m.label)).toEqual(['Book', 'Best']);
    expect(review.moves[0].accuracy).toBe(100);
    expect(review.moves[0].explanation).toBe('Book move.');
    expect(review.opening).toEqual(input.book);
    expect(review.white.accuracy).toBe(100);
  });

  it('resolves a checkmated final position from the rules', () => {
    // 1.f3 e5 2.g4 Qh4#
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    const review = buildReview(game(fen, ['d8h4'], [[['d8h4', { mate: -1 }], ['g8f6', { cp: -300 }]], []]));
    const last = review.positions[1];
    expect(last.winWhite).toBe(0);
    expect(last.score).toBeUndefined();
    expect(last.bestMove).toBeUndefined();
    expect(last.bestLine).toEqual([]);
    const [mate] = review.moves;
    expect([mate.winBefore, mate.winAfter, mate.loss]).toEqual([100, 100, 0]);
    // Line 2 is far worse, but Black was already above greatMaxWinBefore: Best, not Great.
    expect(mate.label).toBe('Best');
    expect(mate.explanation).toBe('Best move: checkmate.');
    expect(review.white.accuracy).toBeNull();
    expect(review.white.moves).toBe(0);
  });

  it('labels the only recapture Great', () => {
    const fen = 'r2Q4/p4ppk/7p/8/8/8/P4PPP/R5K1 b - - 0 1';
    const review = buildReview(game(fen, ['a8d8'], [[['a8d8', { cp: 0 }], ['g7g6', { cp: 900 }]], [['g2g3', { cp: 10 }]]]));
    expect(review.moves[0].label).toBe('Great');
    expect(review.moves[0].explanation).toBe('Great: the only good move here.');
  });

  it('labels Legal\'s Nxe5 Brilliant', () => {
    const fen = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
    const review = buildReview(game(fen, ['f3e5'], [[['f3e5', { cp: 250 }], ['h2h3', { cp: 40 }]], [['d6e5', { cp: 250 }]]]));
    expect(review.moves[0].label).toBe('Brilliant');
    expect(review.moves[0].explanation).toBe('Brilliant: a sound sacrifice of your queen.');
  });

  it('explains a missed mate and a move that allows one', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6??: White has Qxf7# and plays 4.d3 instead.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const missed = buildReview(game(fen, ['d2d3'], [[['h5f7', { mate: 1 }], ['h5e5', { cp: 400 }]], [['d8e7', { cp: 50 }]]]));
    expect(missed.moves[0].explanation).toBe('Blunder: you missed mate in 1. Best was Qxf7#.');
    // Still +9 after the miss: mate is 100% and +9 is 96.5%, so by win chance it only cost 3.5.
    const stillWon = buildReview(game(fen, ['d2d3'], [[['h5f7', { mate: 1 }]], [['d8e7', { cp: 900 }]]]));
    expect(stillWon.moves[0].label).toBe('Good');

    const before = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const allows = buildReview(game(before, ['g8f6'], [[['g7g6', { cp: 30 }]], [['h5f7', { mate: 1 }]]]));
    expect(allows.moves[0].explanation).toBe('Blunder: this allows a forced mate. Best was g6.');
  });

  it('leaves bestSan out when the engine move is not legal', () => {
    const review = buildReview(game(START, ['e2e4'], [[['e2e5', { cp: 30 }]], [['e7e5', { cp: 30 }]]]));
    expect(review.moves[0].bestMove).toBe('e2e5');
    expect(review.moves[0].bestSan).toBeUndefined();
    expect(review.moves[0].explanation).toBe('Excellent move.');
  });

  it('rejects analyses that do not line up with the moves', () => {
    const input = game(START, ['e2e4'], [[['e2e4', { cp: 30 }]], [['e7e5', { cp: 30 }]]]);
    input.analyses.pop();
    expect(() => buildReview(input)).toThrow(/expected 2 analyses/);
  });
});

describe('buildReview: the second line', () => {
  it('one legal move (a single engine line): no second line is stored', () => {
    const review = buildReview(game(START, ['e2e4'], [[['e2e4', { cp: 30 }]], [['e7e5', { cp: 30 }]]]));
    expect(review.version).toBe(2);
    expect(review.positions[0].second).toBeUndefined();
  });
});
