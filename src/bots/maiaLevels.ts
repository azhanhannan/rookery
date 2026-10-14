import { MAIA } from '../config/tunables';

function nearest(elo: number): number {
  let best = 0;
  for (let i = 1; i < MAIA.levels.length; i++) {
    if (Math.abs(MAIA.levels[i] - elo) < Math.abs(MAIA.levels[best] - elo)) best = i;
  }
  return best;
}

/** The Maia level with this Elo, else the nearest one (ties go to the lower level). */
export function maiaLevelFor(elo: number): number {
  return MAIA.levels[nearest(elo)];
}

export function isMaiaLevel(elo: number | undefined): boolean {
  return elo !== undefined && MAIA.levels.includes(elo);
}

/** Display name of the human-like bot at `elo`, e.g. "Maia 1200". */
export function maiaBotName(elo: number): string {
  return `Maia ${maiaLevelFor(elo)}`;
}

/** Next Maia level up after a win, down after a loss, the same after a draw (clamped at the ends). */
export function suggestNextMaiaLevel(botElo: number, humanResult: 'win' | 'loss' | 'draw'): number {
  const direction = humanResult === 'win' ? 1 : humanResult === 'loss' ? -1 : 0;
  const i = Math.min(MAIA.levels.length - 1, Math.max(0, nearest(botElo) + direction));
  return MAIA.levels[i];
}
