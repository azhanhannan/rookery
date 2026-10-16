// Pure merge rules for account sync (no React, no storage). The browser and the server use the same
// functions, so a merge done on either side gives the same answer.
//
// - Preferences: the newer `updatedAt` wins; on a tie the second argument (what is already stored) wins,
//   so two devices that never changed a setting can't take turns overwriting each other.
// - My-mistakes schedule: union of puzzles; for a puzzle on both sides the later review wins, and on the
//   same review day the further-along card (retired, then higher stage, then later due date).
// - Trained days: union (the streak can only grow from merging).
// - Daily puzzle: the later day wins; on the same day a solve is kept.
// Training merges are commutative and idempotent, so the order devices sync in doesn't matter.
import type { StateItem } from '../api/types';
import { MISTAKES, SYNC } from '../config/tunables';
import type { CardState, Schedule } from '../puzzles/spacedRepetition';
import type { DailyRecord } from '../puzzles/daily';
import { addDays, isDayKey } from '../puzzles/days';
import { SYNC_KEYS, type SyncKind } from './keys';

/** Longest preference string accepted (preferences are short ids or small JSON objects). */
const MAX_PREF_LENGTH = 4096;

function validCard(s: unknown): s is CardState {
  const c = s as CardState;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.stage === 'number' &&
    Number.isInteger(c.stage) &&
    c.stage >= 0 &&
    isDayKey(c.due) &&
    typeof c.retired === 'boolean'
  );
}

/**
 * A value in its canonical form (sorted keys/days, invalid entries dropped), or undefined when it isn't
 * a value of that kind at all. Canonical values compare equal with JSON.stringify.
 */
export function normalizeValue(kind: SyncKind, value: unknown): unknown {
  switch (kind) {
    case 'pref':
      if (value === null) return null;
      return typeof value === 'string' && value.length <= MAX_PREF_LENGTH ? value : undefined;
    case 'mistakes': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out: Schedule = {};
      for (const id of Object.keys(value).sort()) {
        const c = (value as Record<string, unknown>)[id];
        if (validCard(c)) out[id] = { stage: c.stage, due: c.due, retired: c.retired };
      }
      return out;
    }
    case 'trainedDays':
      if (!Array.isArray(value)) return undefined;
      return [...new Set(value.filter(isDayKey))].sort().slice(-SYNC.trainedDaysLimit);
    case 'daily': {
      if (value === null) return null;
      const d = value as Partial<DailyRecord> | undefined;
      if (!d || typeof d !== 'object' || !isDayKey(d.day) || typeof d.id !== 'string') return undefined;
      return { day: d.day, id: d.id, solved: d.solved === true } satisfies DailyRecord;
    }
  }
}

/** The empty value of a kind: what a device that never stored the key has. */
export function emptyValue(kind: SyncKind): unknown {
  return kind === 'mistakes' ? {} : kind === 'trainedDays' ? [] : null;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The day a card was last reviewed, worked back from its due date and stage. */
export function reviewedOn(card: CardState, intervals: number[] = MISTAKES.intervals): string {
  if (card.retired) return card.due; // retiring sets due to the day of the solve
  const gap = card.stage === 0 ? (intervals[0] ?? 1) : (intervals[card.stage - 1] ?? intervals[intervals.length - 1] ?? 1);
  return addDays(card.due, -gap);
}

/** The card to keep when two devices disagree about one puzzle. */
export function pickCard(a: CardState, b: CardState, intervals: number[] = MISTAKES.intervals): CardState {
  const ra = reviewedOn(a, intervals);
  const rb = reviewedOn(b, intervals);
  if (ra !== rb) return ra > rb ? a : b;
  if (a.retired !== b.retired) return a.retired ? a : b;
  if (a.stage !== b.stage) return a.stage > b.stage ? a : b;
  if (a.due !== b.due) return a.due > b.due ? a : b;
  return a;
}

export function mergeSchedules(a: Schedule, b: Schedule, intervals: number[] = MISTAKES.intervals): Schedule {
  const out: Schedule = {};
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const x = a[id];
    const y = b[id];
    const c = x && y ? pickCard(x, y, intervals) : (x ?? y);
    out[id] = { stage: c.stage, due: c.due, retired: c.retired };
  }
  return out;
}

export function mergeTrainedDays(a: string[], b: string[], limit: number = SYNC.trainedDaysLimit): string[] {
  return [...new Set([...a, ...b].filter(isDayKey))].sort().slice(-limit);
}

export function mergeDaily(a: DailyRecord | null, b: DailyRecord | null): DailyRecord | null {
  if (!a || !b) return a ?? b;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  if (a.id === b.id) return { day: a.day, id: a.id, solved: a.solved || b.solved };
  // Same day, different pick (the rating differed between devices): keep a solved one, else the smaller id.
  if (a.solved !== b.solved) return a.solved ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Merges two versions of one key. `b` is the one already stored (the server's copy on the browser, the
 * stored row on the server): it wins preference ties. Both values must be normalized.
 */
export function mergeItem(kind: SyncKind, a: StateItem | undefined, b: StateItem | undefined): StateItem | undefined {
  if (!a || !b) return a ?? b;
  const updatedAt = Math.max(a.updatedAt, b.updatedAt);
  switch (kind) {
    case 'pref':
      return a.updatedAt > b.updatedAt ? a : b;
    case 'mistakes':
      return { value: mergeSchedules(a.value as Schedule, b.value as Schedule), updatedAt };
    case 'trainedDays':
      return { value: mergeTrainedDays(a.value as string[], b.value as string[]), updatedAt };
    case 'daily':
      return { value: mergeDaily(a.value as DailyRecord | null, b.value as DailyRecord | null), updatedAt };
  }
}

export type Reconciled = {
  /** Keys whose local copy must change, with the merged item. */
  write: Record<string, StateItem>;
  /** Keys the account doesn't have yet, or has an older/narrower copy of. */
  push: Record<string, StateItem>;
};

/**
 * What a device should do after hearing the account's state: which local keys to overwrite and which
 * to send up. `local` holds every synced key (unset ones as the empty value with updatedAt 0).
 */
export function reconcile(
  local: Record<string, StateItem>,
  remote: Record<string, StateItem>,
  keys: Readonly<Record<string, SyncKind>> = SYNC_KEYS,
): Reconciled {
  const write: Record<string, StateItem> = {};
  const push: Record<string, StateItem> = {};
  for (const [key, kind] of Object.entries(keys)) {
    const l = local[key];
    const rawRemote = remote[key];
    const rv = rawRemote ? normalizeValue(kind, rawRemote.value) : undefined;
    const r = rawRemote && rv !== undefined ? { value: rv, updatedAt: rawRemote.updatedAt } : undefined;
    const merged = mergeItem(kind, l, r);
    if (!merged) continue;
    if (!l || !sameValue(merged.value, l.value) || merged.updatedAt !== l.updatedAt) write[key] = merged;
    if (r) {
      if (!sameValue(merged.value, r.value)) push[key] = merged;
    } else if (!sameValue(merged.value, emptyValue(kind)) || merged.updatedAt > 0) {
      // Nothing on the account yet: send it unless it's an untouched default.
      push[key] = merged;
    }
  }
  return { write, push };
}
