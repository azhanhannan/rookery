/** SPEC "Accuracy" (Lichess's formula): 0 loss is ~100, 10 is ~63.6, 20 is ~40.0. Clamped to 0-100. */
export function moveAccuracy(loss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Mean of the arithmetic and harmonic means of a player's move accuracies; null with no moves.
 * The harmonic part floors each value at 1: one 0% move would otherwise make it 0 (or divide by
 * zero), whatever the rest of the game was.
 */
export function gameAccuracy(accuracies: number[]): number | null {
  if (accuracies.length === 0) return null;
  const n = accuracies.length;
  const mean = accuracies.reduce((a, b) => a + b, 0) / n;
  const harmonic = n / accuracies.reduce((sum, a) => sum + 1 / Math.max(1, a), 0);
  return (mean + harmonic) / 2;
}
