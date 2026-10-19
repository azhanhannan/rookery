// Spaced repetition for "My mistakes" (pure scheduler + per-device storage in `rookery.mistakes`).
// A clean solve moves a puzzle to the next interval (MISTAKES.intervals); a fail or a hint sends it back
// to the first. Solving it after the last interval retires it.
import { MISTAKES } from '../config/tunables';
import { addDays, isDayKey } from './days';

export type CardState = {
  /** Clean solves in a row so far. */
  stage: number;
  /** Day it is next shown (local "YYYY-MM-DD"). */
  due: string;
  retired: boolean;
  /** Day it was last answered (opening cards only; older records leave it out and it is worked back from `due`). */
  last?: string;
};

export type Schedule = Record<string, CardState>;

/** Next state after an attempt on `today`. A puzzle never tried has `prev` undefined. */
export function schedule(
  prev: CardState | undefined,
  solvedClean: boolean,
  today: string,
  intervals: number[] = MISTAKES.intervals,
): CardState {
  if (!solvedClean) return { stage: 0, due: addDays(today, intervals[0] ?? 1), retired: false };
  const stage = prev?.stage ?? 0;
  if (stage >= intervals.length) return { stage: stage + 1, due: today, retired: true };
  return { stage: stage + 1, due: addDays(today, intervals[stage]), retired: false };
}

/** New (never tried) or due on or before `today`, and not retired. */
export function isDue(state: CardState | undefined, today: string): boolean {
  if (!state) return true;
  return !state.retired && state.due <= today;
}

/** The due ones among `items`: overdue first (oldest due date), then new ones, each keeping the given order. */
export function dueItems<T extends { id: string }>(items: T[], sched: Schedule, today: string): T[] {
  const due = items.filter((p) => isDue(sched[p.id], today));
  const rank = (p: T) => sched[p.id]?.due ?? '9999-99-99';
  return due
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p).localeCompare(rank(b.p)) || a.i - b.i)
    .map((x) => x.p);
}

export type MistakeCounts = { total: number; due: number; learning: number; retired: number; nextDue: string | null };

export function mistakeCounts(items: { id: string }[], sched: Schedule, today: string): MistakeCounts {
  let due = 0;
  let retired = 0;
  let nextDue: string | null = null;
  for (const p of items) {
    const s = sched[p.id];
    if (s?.retired) retired++;
    else if (isDue(s, today)) due++;
    else if (s && (!nextDue || s.due < nextDue)) nextDue = s.due;
  }
  return { total: items.length, due, learning: items.length - due - retired, retired, nextDue };
}

/** "Next review tomorrow", "Next review in 3 days", or "Retired: you've learned this one". */
export function scheduleNote(state: CardState, today: string): string {
  if (state.retired) return 'Retired: you’ve learned this one';
  const [ty, tm, td] = today.split('-').map(Number);
  const [y, m, d] = state.due.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (days <= 0) return 'Due again today';
  return days === 1 ? 'Next review tomorrow' : `Next review in ${days} days`;
}

// --- storage ----------------------------------------------------------------------------------

const KEY = 'rookery.mistakes';

function valid(s: unknown): s is CardState {
  const c = s as CardState;
  return !!c && typeof c.stage === 'number' && isDayKey(c.due) && typeof c.retired === 'boolean';
}

export function loadSchedule(): Schedule {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Schedule = {};
    for (const [id, s] of Object.entries(parsed as Record<string, unknown>)) if (valid(s)) out[id] = s;
    return out;
  } catch {
    return {};
  }
}

/** Records an attempt and returns the puzzle's new state (also when storage is unavailable). */
export function recordMistakeAttempt(id: string, solvedClean: boolean, today: string): CardState {
  const sched = loadSchedule();
  const next = schedule(sched[id], solvedClean, today);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...sched, [id]: next }));
  } catch {
    // storage full or unavailable
  }
  return next;
}
