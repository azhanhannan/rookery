import { MAIA } from '../config/tunables';
import { sampleMove, type MaiaPrediction } from '../maia/encoding';
import { maiaLevelFor } from './maiaLevels';

/** What the human-like bot needs from MaiaService (a fake in tests). */
export type MaiaPolicy = { policy(fen: string, eloSelf: number, eloOppo: number): Promise<MaiaPrediction> };

/**
 * Picks the human-like bot's move for `fen` at `elo` (snapped to a MAIA level): asks Maia what a player of that
 * rating would play against an equal opponent, then samples from it. Returns a UCI move. Does not wait the think time.
 */
export async function chooseMaiaMove(maia: MaiaPolicy, fen: string, elo: number, rng: () => number = Math.random): Promise<string> {
  const level = maiaLevelFor(elo);
  const { policy } = await maia.policy(fen, level, level);
  if (policy.length === 0) throw new Error(`no legal moves in ${fen}`);
  return sampleMove(policy, { temperature: MAIA.temperature, topP: MAIA.topP }, rng);
}

/** Random think time inside MAIA.thinkMs, in ms. */
export function maiaThinkTime(rng: () => number = Math.random): number {
  const [lo, hi] = MAIA.thinkMs;
  return lo + (hi - lo) * rng();
}
