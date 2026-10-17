// Which side of a game is "you": the side an import names, else the non-bot side of a bot game.
import type { Color, GameRecord } from './types';

/**
 * The player's side: `userColor` when given (e.g. matched by name), else the record's `userColor` (imports),
 * else the non-bot side when exactly one side is a bot. Null for two people at one screen or two bots.
 */
export function myColor(record: Pick<GameRecord, 'white' | 'black' | 'userColor'>, userColor?: Color | null): Color | null {
  if (userColor) return userColor;
  if (record.userColor) return record.userColor;
  if (record.white.isBot === record.black.isBot) return null;
  return record.white.isBot ? 'b' : 'w';
}
