import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { REVIEW } from '../../src/config/tunables';
import {
  bestArrowFor,
  evalLabel,
  graphData,
  isBestTry,
  lineSteps,
  nextDepth,
  progressText,
  retryCandidates,
  reviewableGames,
  reviewFits,
} from '../../src/review/reviewView';
import { MOVE_LABELS } from '../../src/review/types';
import { SAMPLE_RECORD, SAMPLE_REVIEW } from '../fixtures/sample-review';

const friendGame = { ...SAMPLE_RECORD, black: { name: 'Player 2', isBot: false } };

describe('sample review fixture', () => {
  it('fits its game, uses every label, and every engine move and line is legal', () => {
    expect(reviewFits(SAMPLE_RECORD, SAMPLE_REVIEW)).toBe(true);
    expect(new Set(SAMPLE_REVIEW.moves.map((m) => m.label))).toEqual(new Set(MOVE_LABELS));
    for (const p of SAMPLE_REVIEW.positions) {
      expect(lineSteps(p.fen, p.bestLine)).toHaveLength(p.bestLine.length);
    }
    const last = SAMPLE_REVIEW.positions.at(-1)!;
    expect(new Chess(last.fen).isCheckmate()).toBe(true);
  });
});

describe('review view helpers', () => {
  it('reviewFits rejects a review made for different moves', () => {
    const other = { ...SAMPLE_RECORD, moves: SAMPLE_RECORD.moves.slice(0, 10) };
    expect(reviewFits(other, SAMPLE_REVIEW)).toBe(false);
    expect(reviewFits(SAMPLE_RECORD, undefined)).toBe(false);
  });

  it('graph data has one point per position and marks only the notable labels', () => {
    const data = graphData(SAMPLE_REVIEW);
    expect(data).toHaveLength(21);
    expect(data[0]).toMatchObject({ ply: 0, win: 52, marked: undefined });
    const marked = data.filter((d) => d.marked).map((d) => [d.ply, d.marked]);
    expect(marked).toEqual([
      [13, 'Mistake'],
      [14, 'Miss'],
      [16, 'Brilliant'],
      [17, 'Blunder'],
      [18, 'Great'],
      [19, 'Blunder'],
    ]);
  });

  it('retry picks the human\'s mistakes in a bot game and both sides\' between people', () => {
    expect(retryCandidates(SAMPLE_RECORD, SAMPLE_REVIEW).map((m) => m.ply)).toEqual([13, 17, 19]);
    expect(retryCandidates(friendGame, SAMPLE_REVIEW).map((m) => m.ply)).toEqual([13, 14, 17, 19]);
  });

  it('a retry try is correct only when it is the best move', () => {
    expect(isBestTry('c3b5', 'c3b5')).toBe(true);
    expect(isBestTry('c3d5', 'c3b5')).toBe(false);
    expect(isBestTry('e7e8q', 'e7e8Q')).toBe(true);
    expect(isBestTry('e7e8n', 'e7e8q')).toBe(false);
    expect(isBestTry('c3b5', undefined)).toBe(false);
  });

  it('best-move arrow only when the played move was not the best', () => {
    expect(bestArrowFor(SAMPLE_REVIEW.moves[12])).toEqual({ from: 'c3', to: 'b5' }); // 7. O-O, Mistake
    expect(bestArrowFor(SAMPLE_REVIEW.moves[11])).toBeNull(); // 6... Qc7, Best
    expect(bestArrowFor(undefined)).toBeNull();
  });

  it('line steps stop at the first illegal move', () => {
    const start = SAMPLE_REVIEW.positions[0].fen;
    expect(lineSteps(start, ['e2e4', 'e7e5', 'e4e5', 'g1f3']).map((s) => s.san)).toEqual(['e4', 'e5']);
  });

  it('eval label shows the score, or the result when the game is over', () => {
    expect(evalLabel(SAMPLE_REVIEW.positions[19])).toBe('-M1');
    expect(evalLabel(SAMPLE_REVIEW.positions[20])).toBe('0-1');
    expect(evalLabel({ fen: '', winWhite: 50, bestLine: [] })).toBe('½');
  });

  it('progress text counts moves, not positions', () => {
    expect(progressText(0, 62)).toBe('Analyzing move 1 of 61');
    expect(progressText(23, 62)).toBe('Analyzing move 23 of 61');
    expect(progressText(62, 62)).toBe('Analyzing move 61 of 61');
    expect(progressText(0, 1)).toBe('Analyzing the position');
  });

  it('re-run suggests the next deeper depth', () => {
    expect(nextDepth(REVIEW.depth.fast, REVIEW.depth)).toBe(REVIEW.depth.normal);
    expect(nextDepth(REVIEW.depth.normal, REVIEW.depth)).toBe(REVIEW.depth.deep);
    expect(nextDepth(REVIEW.depth.deep, REVIEW.depth)).toBe(REVIEW.depth.deep);
  });

  it('reviewable games: finished only, current first, no duplicates', () => {
    const unfinished = { ...SAMPLE_RECORD, id: 'live', result: '*' as const };
    const older = { ...SAMPLE_RECORD, id: 'older' };
    expect(reviewableGames(SAMPLE_RECORD, [SAMPLE_RECORD, older]).map((g) => g.id)).toEqual(['sample-review-game', 'older']);
    expect(reviewableGames(unfinished, [older]).map((g) => g.id)).toEqual(['older']);
  });
});
