// @vitest-environment node
// The real Maia-3 model with onnxruntime-web (WASM, single thread) in Node, through the same encode/decode code
// the browser worker uses. Skipped when the model hasn't been fetched (node scripts/fetch-maia.mjs).
import * as ort from 'onnxruntime-web';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodePrediction, encodeFen, type MaiaPrediction } from '../../src/maia/encoding';

// node:fs without @types/node (this file is type-checked with the browser app's tsconfig).
type Fs = { existsSync(path: URL): boolean; readFileSync(path: URL): Uint8Array };
const fs = (await import('node:fs' as string)) as Fs;
const MODEL = new URL('../../public/maia/maia3_simplified.onnx', import.meta.url);
const hasModel = fs.existsSync(MODEL);

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Black to move; White's queen on d4 hangs to the e5 pawn. */
const HANGING_QUEEN = 'rnbqkbnr/pppp1ppp/8/4p3/3Q4/8/PPPPPPPP/RNB1KBNR b KQkq - 0 2';
/** White to move; Black's queen on d5 hangs to the e4 pawn. */
const HANGING_QUEEN_W = 'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';

describe.skipIf(!hasModel)('Maia-3 in Node (real model)', () => {
  let session: ort.InferenceSession;

  async function predict(fen: string, elo: number): Promise<MaiaPrediction> {
    const out = await session.run({
      tokens: new ort.Tensor('float32', encodeFen(fen), [1, 64, 12]),
      elo_self: new ort.Tensor('float32', Float32Array.of(elo), [1]),
      elo_oppo: new ort.Tensor('float32', Float32Array.of(elo), [1]),
    });
    return decodePrediction(fen, out.logits_move.data as Float32Array, out.logits_value.data as Float32Array);
  }

  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(fs.readFileSync(MODEL), { executionProviders: ['wasm'] });
  }, 60_000);

  it('has the expected inputs and outputs', () => {
    expect([...session.inputNames].sort()).toEqual(['elo_oppo', 'elo_self', 'tokens']);
    expect([...session.outputNames].sort()).toEqual(['logits_move', 'logits_value']);
  });

  it('start position at 1500: e2e4 or d2d4 on top, and they are the two most likely', async () => {
    const { policy, wdl } = await predict(START, 1500);
    expect(policy).toHaveLength(20);
    expect(['e2e4', 'd2d4']).toContain(policy[0][0]);
    expect(policy.slice(0, 2).map(([u]) => u).sort()).toEqual(['d2d4', 'e2e4']);
    expect(policy.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 5);
    expect(wdl.win + wdl.draw + wdl.loss).toBeCloseTo(1, 5);
  });

  it('takes a hanging queen, as Black (mirrored) and as White', async () => {
    const black = await predict(HANGING_QUEEN, 1500);
    expect(black.policy[0][0]).toBe('e5d4');
    expect(black.policy[0][1]).toBeGreaterThan(0.5);
    const white = await predict(HANGING_QUEEN_W, 1500);
    expect(white.policy[0][0]).toBe('e4d5');
  });

  it('the rating input changes the prediction', async () => {
    const low = await predict(START, 700);
    const high = await predict(START, 2400);
    const p = (r: MaiaPrediction, uci: string) => r.policy.find(([u]) => u === uci)?.[1] ?? 0;
    const diff = r2(Math.abs(p(low, 'e2e4') - p(high, 'e2e4'))) + r2(Math.abs(p(low, 'g1f3') - p(high, 'g1f3')));
    expect(diff).toBeGreaterThan(0.01);
  });
});

const r2 = (x: number) => Math.round(x * 100) / 100;
