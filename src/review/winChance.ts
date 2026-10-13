import type { Score } from '../engine/types';

/** Scores beyond this many centipawns are treated as won; clamping keeps the curve's tail flat. */
const CP_CLAMP = 1000;

/** White's win chance in percent (0-100), Lichess formula (SPEC Feature 3, "Win chance"). */
export function winChance(score: Score): number {
  if ('mate' in score) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Eval label from White's point of view: "+1.3", "-0.4", "0.0", "M3", "-M2". */
export function formatScore(score: Score): string {
  if ('mate' in score) return score.mate > 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
  const pawns = score.cp / 100;
  const text = Math.abs(pawns).toFixed(1);
  if (text === '0.0') return '0.0';
  return pawns > 0 ? `+${text}` : `-${text}`;
}
