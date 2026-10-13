import { BOT_LEVELS, MAX_LEVEL_LABEL } from '../config/tunables';
import type { BotLevel } from '../engine/types';

function indexFor(elo: number): number {
  let best = 0;
  for (let i = 1; i < BOT_LEVELS.length; i++) {
    if (Math.abs(BOT_LEVELS[i].elo - elo) < Math.abs(BOT_LEVELS[best].elo - elo)) best = i;
  }
  return best;
}

/** The level with this Elo, else the nearest one (ties go to the lower level). */
export function levelFor(elo: number): BotLevel {
  return BOT_LEVELS[indexFor(elo)];
}

export function levelLabel(level: BotLevel): string {
  return level.mode === 'full' ? MAX_LEVEL_LABEL : String(level.elo);
}

/** Next level up (1) or down (-1) in BOT_LEVELS, clamped at the ends; 0 returns the nearest level. */
export function adjacentLevel(elo: number, direction: 1 | -1 | 0): BotLevel {
  const i = Math.min(BOT_LEVELS.length - 1, Math.max(0, indexFor(elo) + direction));
  return BOT_LEVELS[i];
}

/** SPEC asks for "about 100" up or down; levels step by 200, so the adjacent level is the closest fit. */
export function suggestNextLevel(botElo: number, humanResult: 'win' | 'loss' | 'draw'): BotLevel {
  const direction = humanResult === 'win' ? 1 : humanResult === 'loss' ? -1 : 0;
  return adjacentLevel(botElo, direction);
}
