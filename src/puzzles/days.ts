// Calendar days as local "YYYY-MM-DD" keys (pure; the streak, the daily puzzle and spaced repetition use them).

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day of `d`, e.g. "2026-10-15". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Noon on that day (noon keeps daylight-saving shifts from moving the date). */
function parse(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, n: number): string {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from `a` to `b` (b later = positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** The Monday that starts `key`'s week. */
export function weekStart(key: string): string {
  const dow = (parse(key).getDay() + 6) % 7; // Monday = 0
  return addDays(key, -dow);
}

export const isDayKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today's local day key. */
export function todayKey(): string {
  return dayKey(new Date());
}
