// @vitest-environment node
// The review runner on real Stockfish (lite, single-threaded WASM) in Node.
// REVIEW_BENCH=1 also times a 40-move game at depth 16 (SPEC Phase 3 acceptance); it takes minutes.
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { REVIEW } from '../../src/config/tunables';
import { EngineService } from '../../src/engine/EngineService';
import { nodeTransport } from '../../src/engine/nodeTransport';
import type { GameRecord } from '../../src/game/types';
import { clearAnalysisCache, runReview } from '../../src/review/reviewRunner';
import type { GameReview, ReviewInput } from '../../src/review/types';
import { FOOLS_MATE, play } from './helpers';

const inputs: ReviewInput[] = [];

// Records what the runner hands over; the real buildReview runs too once it is no longer a stub.
vi.mock('../../src/review/buildReview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/review/buildReview')>();
  return {
    buildReview: (input: ReviewInput): GameReview => {
      inputs.push(input);
      try {
        return actual.buildReview(input);
      } catch (err) {
        if (err instanceof Error && err.message === 'not implemented') return { depth: input.depth } as GameReview;
        throw err;
      }
    },
  };
});

function isLegal(fen: string, uci: string): boolean {
  return new Chess(fen).moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion ?? '') === uci);
}

/** 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6, agreed drawn. */
const RUY_LOPEZ = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'];

describe('runReview on real Stockfish', () => {
  const engine = new EngineService(() => nodeTransport());

  beforeAll(() => engine.init());
  afterAll(() => engine.terminate());

  it('analyses every position with ranked, legal lines and finds the book', async () => {
    clearAnalysisCache();
    const record: GameRecord = { ...play(RUY_LOPEZ), result: '1/2-1/2' };
    const progress: number[] = [];
    await runReview(record, { engine, depth: 8, onProgress: (p) => progress.push(p.done) });
    const input = inputs.at(-1)!;
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(input.analyses).toHaveLength(9);
    input.analyses.forEach((a, i) => {
      expect(a.fen).toBe(i === 0 ? record.startFen : record.moves[i - 1].fenAfter);
      expect(a.depth).toBe(8);
      expect(a.lines.map((l) => l.rank)).toEqual([1, 2].slice(0, REVIEW.multiPV));
      for (const l of a.lines) expect(isLegal(a.fen, l.move)).toBe(true);
    });
    expect(input.book.bookPlies).toBe(8);
    expect(input.book.eco).toMatch(/^C7\d$/);
  });

  it('leaves the mated final position to the rules', async () => {
    clearAnalysisCache();
    await runReview(play(FOOLS_MATE), { engine, depth: 8 });
    const { analyses } = inputs.at(-1)!;
    expect(analyses[4].lines).toEqual([]);
    expect(analyses[3].lines[0].move).toBe('d8h4');
    expect(analyses[3].lines[0].score).toEqual({ mate: -1 });
  });

  it('cancels a deep review quickly and leaves the engine usable', async () => {
    clearAnalysisCache();
    const ctrl = new AbortController();
    const t0 = Date.now();
    const run = runReview({ ...play(RUY_LOPEZ), result: '1-0' }, { engine, depth: 40, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 300);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - t0).toBeLessThan(2000);
    const r = await engine.analyze(play([]).startFen, { depth: 4 });
    expect(r.lines).toHaveLength(1);
  });

  it.runIf(import.meta.env.REVIEW_BENCH)(
    'reviews a 40-move game at depth 16',
    async () => {
      clearAnalysisCache();
      const record = await selfPlay(engine, 80);
      const t0 = performance.now();
      let last = 0;
      await runReview(record, { engine, depth: REVIEW.depth.normal, onProgress: (p) => (last = p.done) });
      const ms = performance.now() - t0;
      console.log(`review: ${record.moves.length} plies, depth ${REVIEW.depth.normal}, ${(ms / 1000).toFixed(1)} s`);
      expect(last).toBe(record.moves.length + 1);
    },
    15 * 60_000,
  );
});

/** A full-length game for timing: the engine plays itself from the Ruy Lopez, a few plies deep. */
async function selfPlay(engine: EngineService, plies: number): Promise<GameRecord> {
  const ucis = [...RUY_LOPEZ];
  const chess = new Chess();
  for (const uci of ucis) chess.move(uci);
  while (ucis.length < plies && !chess.isGameOver()) {
    const r = await engine.analyze(chess.fen(), { depth: 6, multiPV: 3 });
    // Varies the move so the game does not settle into a repetition.
    const pick = r.lines[ucis.length % r.lines.length].move;
    chess.move(pick);
    ucis.push(pick);
  }
  return { ...play(ucis), result: '1/2-1/2' };
}
