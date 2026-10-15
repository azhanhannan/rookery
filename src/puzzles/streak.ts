// Trained-days streak (pure + per-device storage in `rookery.trainedDays`). A day counts when a puzzle
// was solved (any mode) or a game review finished. One rest day per Monday-Sunday week
// (MISTAKES.freezesPerWeek) keeps the streak alive; two missed days in a row always end it.
import { MISTAKES } from '../config/tunables';
import { addDays, dayKey, isDayKey, weekStart } from './days';

export type Streak = {
  /** Trained days in the current run (rest days don't add). */
  days: number;
  trainedToday: boolean;
  /** Missed days the run was kept through, newest first. */
  restDays: string[];
  /** This week's rest day is already spent. */
  restUsedThisWeek: boolean;
};

export function computeStreak(trained: Iterable<string>, today: string, freezesPerWeek: number = MISTAKES.freezesPerWeek): Streak {
  const set = new Set(trained);
  const trainedToday = set.has(today);
  const oldest = [...set].sort()[0];
  const used = new Map<string, number>();
  const rest: string[] = [];
  let days = 0;
  let prevMissed = false;
  // Today isn't over: not having trained yet doesn't break anything.
  let cur = trainedToday ? today : addDays(today, -1);
  while (oldest && cur >= oldest) {
    if (set.has(cur)) {
      days++;
      prevMissed = false;
    } else {
      const wk = weekStart(cur);
      if (prevMissed || (used.get(wk) ?? 0) >= freezesPerWeek) break;
      used.set(wk, (used.get(wk) ?? 0) + 1);
      rest.push(cur);
      prevMissed = true;
    }
    cur = addDays(cur, -1);
  }
  // A rest day at the far end of the run (nothing trained before it) wasn't keeping anything alive.
  if (prevMissed) rest.pop();
  if (days === 0) rest.length = 0;
  const thisWeek = weekStart(today);
  return { days, trainedToday, restDays: rest, restUsedThisWeek: rest.some((d) => weekStart(d) === thisWeek) };
}

// --- storage ----------------------------------------------------------------------------------

const KEY = 'rookery.trainedDays';
const LIMIT = 400;

export function loadTrainedDays(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter(isDayKey) : [];
  } catch {
    return [];
  }
}

/** Marks `now`'s local day as trained. */
export function recordTrainedDay(now: Date = new Date()): void {
  const today = dayKey(now);
  const days = loadTrainedDays();
  if (days.includes(today)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...days, today].sort().slice(-LIMIT)));
  } catch {
    // storage full or unavailable
  }
}
