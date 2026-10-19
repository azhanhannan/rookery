// First-time recall on graded due reviews, per day, per device (`rookery.openings.recall`): the check on whether
// the gentle rules (one-step misses, holds, late credit) keep enough in memory. If it falls under ~80% over 30 days,
// OPENING_TRAINER.missDrop should go to 2 (panel, docs/opening-trainer-2026-10). Shown only in the Analyst style.
import { OPENING_TRAINER } from '../config/tunables';
import { addDays } from '../puzzles/days';

const KEY = 'rookery.openings.recall';

/** Day → [graded due reviews, remembered first time]. */
export type RecallLog = Record<string, [number, number]>;

export function readRecall(): RecallLog {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as RecallLog;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Adds one graded due review on `today`; days older than OPENING_TRAINER.recallDays are dropped. */
export function recordRecall(today: string, clean: boolean): void {
  const log = readRecall();
  const [n, c] = log[today] ?? [0, 0];
  log[today] = [n + 1, c + (clean ? 1 : 0)];
  const oldest = addDays(today, -OPENING_TRAINER.recallDays);
  for (const day of Object.keys(log)) if (day < oldest) delete log[day];
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // not kept: the check just has less to go on
  }
}

/** Reviews and first-time share over the `days` up to `today`; null when there are none. */
export function recallRate(log: RecallLog, today: string, days = 30): { reviews: number; share: number } | null {
  const from = addDays(today, -(days - 1));
  let n = 0;
  let c = 0;
  for (const [day, [dn, dc]] of Object.entries(log)) {
    if (day < from || day > today) continue;
    n += dn;
    c += dc;
  }
  return n ? { reviews: n, share: c / n } : null;
}
