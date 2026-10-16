// The losing-streak cushion: after a few losses in a row against bots, Play offers an easier bot or puzzles.
import { QUICK } from '../config/tunables';
import { botColor } from './rules';
import type { GameRecord } from './types';

export type LossStreak = {
  /** Losses in a row against bots, newest game first. */
  count: number;
  /** Id of the first loss of the streak (the oldest one): a new streak has a new id. */
  startId: string | null;
  /** The bot of the newest loss, to suggest one level below it. */
  lastBot: GameRecord['white'] | null;
};

/** The human's result in a finished bot game, or null for games between people and unfinished games. */
function botGameOutcome(record: GameRecord): 'win' | 'loss' | 'draw' | null {
  const bot = botColor(record);
  if (!bot || record.result === '*') return null;
  if (record.result === '1/2-1/2') return 'draw';
  return (record.result === '1-0') === (bot === 'w') ? 'loss' : 'win';
}

/** The current run of losses against bots in `history` (newest first). Games between people are skipped. */
export function lossStreak(history: GameRecord[]): LossStreak {
  let count = 0;
  let startId: string | null = null;
  let lastBot: LossStreak['lastBot'] = null;
  for (const g of history) {
    const outcome = botGameOutcome(g);
    if (outcome === null) continue;
    if (outcome !== 'loss') break;
    if (count === 0) lastBot = g[botColor(g) === 'w' ? 'white' : 'black'];
    count++;
    startId = g.id;
  }
  return { count, startId, lastBot };
}

/** Whether the cushion shows: a long enough streak that wasn't dismissed. */
export function shouldCushion(streak: LossStreak, dismissedStartId: string | null, threshold: number = QUICK.lossStreak): boolean {
  return streak.count >= threshold && streak.startId !== null && streak.startId !== dismissedStartId;
}

const DISMISS_KEY = 'rookery.lossCushionDismissed';

/** The streak (by its first loss's id) the player waved away; it stays hidden until a new streak starts. */
export function loadCushionDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function saveCushionDismissed(startId: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, startId);
  } catch {
    // ignore: it just shows again after a reload
  }
}
