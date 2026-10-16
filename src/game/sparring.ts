// The Spar button: one click to a rated game against a bot a little stronger than the player. Pure.
import { levelLabel } from '../bots/botLevels';
import { BOT_LEVELS, MAIA, QUICK } from '../config/tunables';
import type { BotEngine } from './types';

export type SparOpponent = { engine: BotEngine; elo: number; name: string };

/**
 * The bot one level above `rating`: the nearest human-like (Maia) level strictly above it, else (rating at or
 * past the top Maia level, or `maiaAvailable` false) the nearest engine level above it, else the strongest one.
 */
export function sparringOpponent(rating: number | null | undefined, maiaAvailable = true): SparOpponent {
  const r = typeof rating === 'number' && Number.isFinite(rating) ? rating : QUICK.sparDefaultRating;
  const maia = maiaAvailable ? MAIA.levels.find((l) => l > r) : undefined;
  if (maia !== undefined) return { engine: 'maia', elo: maia, name: `Maia ${maia}` };
  const level = BOT_LEVELS.find((l) => l.elo > r) ?? BOT_LEVELS[BOT_LEVELS.length - 1];
  return { engine: 'stockfish', elo: level.elo, name: `Bot ${levelLabel(level)}` };
}

/** "10+5" for "600+5". */
export function timeControlLabel(id: string): string {
  const m = /^(\d+)\+(\d+)$/.exec(id);
  if (!m) return id;
  const minutes = Number(m[1]) / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}+${m[2]}`;
}
