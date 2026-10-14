// Maia matching sanity check with the real model: Maia self-play games at known levels, then matching both sides.
// This is the easy case (the moves come from the model itself), so it shows the method works, not how accurate
// it is on people; that needs Lichess games (Phase 4 calibration). Run with `npm run test:bots`; several minutes.
import { existsSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import * as ort from 'onnxruntime-web';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MaiaPolicy } from '../../src/bots/maiaPlayer';
import { applyMove, newRecord } from '../../src/game/rules';
import type { GameRecord } from '../../src/game/types';
import { decodePrediction, encodeFen, sampleMove } from '../../src/maia/encoding';
import { runMaiaMatch } from '../../src/rating/maiaMatch';

const MODEL = new URL('../../public/maia/maia3_simplified.onnx', import.meta.url);
const PLIES = 60;

describe.skipIf(!existsSync(MODEL))('Maia matching on Maia self-play (real model)', () => {
  let maia: MaiaPolicy;

  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(MODEL), { executionProviders: ['wasm'] });
    maia = {
      async policy(fen, eloSelf, eloOppo) {
        const out = await session.run({
          tokens: new ort.Tensor('float32', encodeFen(fen), [1, 64, 12]),
          elo_self: new ort.Tensor('float32', Float32Array.of(eloSelf), [1]),
          elo_oppo: new ort.Tensor('float32', Float32Array.of(eloOppo), [1]),
        });
        return decodePrediction(fen, out.logits_move.data as Float32Array, out.logits_value.data as Float32Array);
      },
    };
  }, 60_000);

  async function selfPlay(white: number, black: number, seed: number): Promise<GameRecord> {
    let s = seed;
    const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let record = newRecord({ white: { name: `W${white}`, isBot: false }, black: { name: `B${black}`, isBot: false } });
    const chess = new Chess();
    while (!chess.isGameOver() && record.moves.length < PLIES) {
      const elo = chess.turn() === 'w' ? white : black;
      const { policy } = await maia.policy(chess.fen(), elo, elo);
      const uci = sampleMove(policy, { temperature: 1, topP: 0.95 }, rng);
      const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
      chess.move(move);
      record = applyMove(record, move)!.record;
    }
    return record;
  }

  it.each([
    [800, 2200, 7],
    [2200, 800, 11],
  ])('White Maia %i vs Black Maia %i: each side lands within 400 and in the right order', async (w, b, seed) => {
    const record = await selfPlay(w, b, seed);
    const match = await runMaiaMatch(maia, record);
    const est = (m: typeof match.white) => (m?.kind === 'estimate' ? m.rating : NaN);
    console.log(`W ${w} -> ${est(match.white)}, B ${b} -> ${est(match.black)} (${record.moves.length} plies)`);
    expect(Math.abs(est(match.white) - w)).toBeLessThanOrEqual(400);
    expect(Math.abs(est(match.black) - b)).toBeLessThanOrEqual(400);
    expect(Math.sign(est(match.black) - est(match.white))).toBe(Math.sign(b - w));
  });
});
