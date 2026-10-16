// Weekly training log: how many games, puzzles, reviews, drills and lessons, and roughly how many minutes, per day.
// Stored per device in `rookery.trainingLog` as one JSON value ({ updatedAt, days }); the aggregation by
// Monday-to-Sunday (ISO) week is pure and unit-tested.
import { EXTRAS } from '../config/tunables';
import { addDays, dayKey, isDayKey, weekStart } from '../puzzles/days';

export type TrainingKind = 'game' | 'puzzle' | 'review' | 'squares' | 'endgame' | 'opening' | 'lesson';
export const TRAINING_KINDS: TrainingKind[] = ['game', 'puzzle', 'review', 'squares', 'endgame', 'opening', 'lesson'];

/** One kind on one day: how many, and seconds spent. */
export type Tally = { n: number; sec: number };
export type DayLog = Partial<Record<TrainingKind, Tally>>;
export type TrainingLog = { updatedAt: string; days: Record<string, DayLog> };

export const EMPTY_LOG: TrainingLog = { updatedAt: '', days: {} };

const isTally = (v: unknown): v is Tally =>
  !!v &&
  typeof v === 'object' &&
  Number.isFinite((v as Tally).n) &&
  Number.isFinite((v as Tally).sec) &&
  (v as Tally).n >= 0 &&
  (v as Tally).sec >= 0;

/** Stored JSON → log; anything malformed is dropped, never thrown. */
export function parseTrainingLog(raw: string | null): TrainingLog {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return EMPTY_LOG;
    const daysIn = (v as { days?: unknown }).days;
    const days: Record<string, DayLog> = {};
    if (daysIn && typeof daysIn === 'object') {
      for (const [day, log] of Object.entries(daysIn as Record<string, unknown>)) {
        if (!isDayKey(day) || !log || typeof log !== 'object') continue;
        const clean: DayLog = {};
        for (const k of TRAINING_KINDS) {
          const t = (log as Record<string, unknown>)[k];
          if (isTally(t)) clean[k] = { n: t.n, sec: t.sec };
        }
        days[day] = clean;
      }
    }
    const updatedAt = (v as { updatedAt?: unknown }).updatedAt;
    return { updatedAt: typeof updatedAt === 'string' ? updatedAt : '', days };
  } catch {
    return EMPTY_LOG;
  }
}

/** The log with one activity added on `day` (seconds capped per kind), and days older than `keepDays` dropped. */
export function addActivity(
  log: TrainingLog,
  kind: TrainingKind,
  seconds: number,
  day: string,
  now: string,
  count = 1,
  keepDays: number = EXTRAS.logKeepDays,
): TrainingLog {
  const cap = EXTRAS.logMaxMinutes[kind] * 60;
  const sec = Math.round(Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, cap * Math.max(1, count))));
  const oldest = addDays(day, -keepDays);
  const days: Record<string, DayLog> = {};
  for (const [d, l] of Object.entries(log.days)) if (d >= oldest) days[d] = l;
  const prev = days[day]?.[kind] ?? { n: 0, sec: 0 };
  days[day] = { ...days[day], [kind]: { n: prev.n + count, sec: prev.sec + sec } };
  return { updatedAt: now, days };
}

export type WeekTotals = Record<TrainingKind, Tally>;

function emptyTotals(): WeekTotals {
  return Object.fromEntries(TRAINING_KINDS.map((k) => [k, { n: 0, sec: 0 }])) as WeekTotals;
}

/** Totals for the Monday-to-Sunday week containing `today`, and for the week before. */
export function weekTotals(log: TrainingLog, today: string): { thisWeek: WeekTotals; lastWeek: WeekTotals } {
  const thisStart = weekStart(today);
  const lastStart = addDays(thisStart, -7);
  const thisWeek = emptyTotals();
  const lastWeek = emptyTotals();
  for (const [day, l] of Object.entries(log.days)) {
    const wk = weekStart(day);
    const into = wk === thisStart ? thisWeek : wk === lastStart ? lastWeek : null;
    if (!into) continue;
    for (const k of TRAINING_KINDS) {
      const t = l[k];
      if (t) into[k] = { n: into[k].n + t.n, sec: into[k].sec + t.sec };
    }
  }
  return { thisWeek, lastWeek };
}

/** ISO 8601 week number of a day key (week 1 holds the year's first Thursday). */
export function isoWeek(day: string): number {
  const thursday = addDays(weekStart(day), 3);
  const year = Number(thursday.slice(0, 4));
  const firstThursday = addDays(weekStart(`${year}-01-04`), 3);
  const [y1, m1, d1] = thursday.split('-').map(Number);
  const [y0, m0, d0] = firstThursday.split('-').map(Number);
  const diff = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / 86_400_000);
  return diff / 7 + 1;
}

/**
 * Drill stores written by other features (`rookery.endgames`, `rookery.repertoires`), read defensively:
 * counts every timestamp found under a key that names a time (`at`, `date`, `…At`, `…Date`, `last…`)
 * in this week and last week. Unknown shapes count nothing.
 */
export function countDatedEntries(raw: string | null, today: string): { thisWeek: number; lastWeek: number } {
  const out = { thisWeek: 0, lastWeek: 0 };
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  const thisStart = weekStart(today);
  const lastStart = addDays(thisStart, -7);
  const timeKey = /^(at|date|ts|time|when)$|At$|Date$|^last[A-Z]/;
  const seen = (value: unknown) => {
    let d: Date | null = null;
    if (typeof value === 'number' && value > 1e12) d = new Date(value);
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) d = isDayKey(value) ? null : new Date(value);
    const key = typeof value === 'string' && isDayKey(value) ? value : d && !Number.isNaN(d.getTime()) ? dayKey(d) : null;
    if (!key) return;
    const wk = weekStart(key);
    if (wk === thisStart) out.thisWeek++;
    else if (wk === lastStart) out.lastWeek++;
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    for (const [k, x] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'updatedAt' && depth === 0) continue;
      if (timeKey.test(k) && (typeof x === 'string' || typeof x === 'number')) seen(x);
      else walk(x, depth + 1);
    }
  };
  walk(v, 0);
  return out;
}

// --- storage ----------------------------------------------------------------------------------

const KEY = 'rookery.trainingLog';

export function loadTrainingLog(): TrainingLog {
  try {
    return parseTrainingLog(localStorage.getItem(KEY));
  } catch {
    return EMPTY_LOG;
  }
}

/** Reads another feature's drill store; null when absent or unreadable. */
export function readDrillStore(key: 'rookery.endgames' | 'rookery.repertoires'): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// When each kind's current activity started (in memory: a reload just loses the minutes, not the count).
const started = new Map<TrainingKind, number>();

/** Marks the start of an activity (a puzzle shown, a review opened), so its minutes can be logged. */
export function startTraining(kind: TrainingKind, now: number = Date.now()): void {
  started.set(kind, now);
}

/**
 * Logs one finished activity. Seconds: `seconds` when given, else the time since `startTraining(kind)`
 * (0 without one), capped per kind (EXTRAS.logMaxMinutes).
 */
export function logTraining(kind: TrainingKind, seconds?: number, now: Date = new Date()): void {
  const from = started.get(kind);
  const sec = seconds ?? (from !== undefined ? (now.getTime() - from) / 1000 : 0);
  started.delete(kind);
  try {
    const next = addActivity(loadTrainingLog(), kind, sec, dayKey(now), now.toISOString());
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable
  }
}
