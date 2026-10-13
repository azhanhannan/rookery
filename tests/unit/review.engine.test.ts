// @vitest-environment node
// The fixed review positions (tests/fixtures) analysed by real Stockfish, as the review runner would.
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REVIEW } from '../../src/config/tunables';
import { EngineService } from '../../src/engine/EngineService';
import { nodeTransport } from '../../src/engine/nodeTransport';
import { buildReview } from '../../src/review/buildReview';
import type { ReviewInput } from '../../src/review/types';
import { REVIEW_FIXTURES, type ReviewFixture } from '../fixtures/review-positions';

const DEPTH = 15;

async function reviewFixture(engine: EngineService, f: ReviewFixture) {
  const chess = new Chess(f.startFen);
  const moves: ReviewInput['moves'] = f.moves.map((uci) => {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { san: m.san, uci, fenAfter: chess.fen() };
  });
  const fens = [f.startFen, ...moves.map((m) => m.fenAfter)];
  // A fresh hash per fixture keeps each result independent of the order the fixtures run in.
  await engine.newGame();
  const analyses = [];
  for (const fen of fens) analyses.push(await engine.analyze(fen, { depth: DEPTH, multiPV: REVIEW.multiPV }));
  return buildReview({ startFen: f.startFen, moves, analyses, book: { bookPlies: f.bookPlies ?? 0 }, depth: DEPTH });
}

describe('review labels on fixed positions (real Stockfish)', () => {
  const engine = new EngineService(() => nodeTransport());

  beforeAll(() => engine.init());
  afterAll(() => engine.terminate());

  for (const f of REVIEW_FIXTURES) {
    it(f.name, { timeout: 30_000 }, async () => {
      const review = await reviewFixture(engine, f);
      f.expected.forEach((want, i) => {
        if (want === null) return;
        const m = review.moves[i];
        const detail = `${m.san}: ${m.label}, before ${m.winBefore.toFixed(1)}, after ${m.winAfter.toFixed(1)}, best ${m.bestSan}; ${m.explanation}`;
        expect([want].flat(), detail).toContain(m.label);
      });
    });
  }
});
