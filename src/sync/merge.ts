// Pure merge rules for account sync (no React, no storage). The browser and the server use the same
// functions, so a merge done on either side gives the same answer.
//
// - Preferences: the newer `updatedAt` wins; on a tie the second argument (what is already stored) wins,
//   so two devices that never changed a setting can't take turns overwriting each other.
// - My-mistakes schedule: union of puzzles; for a puzzle on both sides the later review wins, and on the
//   same review day the further-along card (retired, then higher stage, then later due date).
// - Trained days: union (the streak can only grow from merging).
// - Daily puzzle: the later day wins; on the same day a solve is kept.
// - Stamped records: the newer embedded `updatedAt` wins (else the change time, like a preference).
// - Bests (timed puzzles): the larger score per mode.
// - Training log: union of days; a day on both sides keeps, per kind, the tally with more activities.
// - Opening repertoires: union by id, the newer repertoire wins; cards merge per position like My mistakes.
//   A deleted repertoire leaves a delete marker (`deleted[id]` = when); the marker beats any copy last changed
//   before it, and markers are dropped after SYNC.tombstoneDays.
// Training merges are commutative and idempotent, so the order devices sync in doesn't matter.
import type { StateItem } from '../api/types';
import { EXTRAS, MISTAKES, OPENING_TRAINER, SYNC } from '../config/tunables';
import type { CardState, Schedule } from '../puzzles/spacedRepetition';
import type { DailyRecord } from '../puzzles/daily';
import { addDays, isDayKey } from '../puzzles/days';
import { TRAINING_KINDS, type DayLog, type Tally, type TrainingLog } from '../training/trainingLog';
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
    case 'stamped':
      if (value === null) return null;
      return typeof value === 'string' ? value : undefined;
    case 'repertoires':
      return value === null ? null : normalizeRepertoires(value);
    case 'best': {
      if (value === null) return null;
      const b = typeof value === 'string' ? parseBests(value) : undefined;
      return b && encodeBests(b);
    }
    case 'log': {
      if (value === null) return null;
      const l = typeof value === 'string' ? parseLog(value) : undefined;
      return l && JSON.stringify(l);
    }
  }
}

// --- per-mode bests (rookery.timedBest) -----------------------------------------------------------

/** The mode a plain-number best belongs to. */
export const DEFAULT_BEST_MODE = 'default';

/**
 * A stored best: a plain number (one mode), or a JSON object of mode -> score (`best` also means the default
 * mode, `updatedAt` is ignored). Undefined when it is not one.
 */
function parseBests(raw: string): Record<string, number> | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const score = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
  if (typeof v === 'number') return score(v) === null ? undefined : { [DEFAULT_BEST_MODE]: score(v)! };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'updatedAt') continue;
    const sc = score(n);
    const mode = k === 'best' ? DEFAULT_BEST_MODE : k;
    if (sc !== null) out[mode] = Math.max(out[mode] ?? 0, sc);
  }
  return out;
}

/** Back to the stored form: a plain number when only the default mode has one (what the app reads today). */
function encodeBests(b: Record<string, number>): string {
  const modes = Object.keys(b).sort();
  if (modes.length === 1 && modes[0] === DEFAULT_BEST_MODE) return String(b[DEFAULT_BEST_MODE]);
  return JSON.stringify(Object.fromEntries(modes.map((m) => [m, b[m]])));
}

/** The larger score per mode. Both strings must be normalized; null = none. */
export function mergeBests(a: string | null, b: string | null): string | null {
  const x = a === null ? undefined : parseBests(a);
  const y = b === null ? undefined : parseBests(b);
  if (!x || !y) return x ? a : y ? b : null;
  const out: Record<string, number> = { ...x };
  for (const [m, n] of Object.entries(y)) out[m] = Math.max(out[m] ?? 0, n);
  return encodeBests(out);
}

// --- training log (rookery.trainingLog) -----------------------------------------------------------

const isTally = (t: unknown): t is Tally =>
  !!t && typeof t === 'object' && [(t as Tally).n, (t as Tally).sec].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);

/** The log in canonical form (days and kinds sorted, malformed entries dropped); undefined when it is not one. */
function parseLog(raw: string): TrainingLog | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const { updatedAt, days: daysIn } = v as { updatedAt?: unknown; days?: unknown };
  const days: Record<string, DayLog> = {};
  if (daysIn && typeof daysIn === 'object' && !Array.isArray(daysIn)) {
    for (const day of Object.keys(daysIn).sort()) {
      const log = (daysIn as Record<string, unknown>)[day];
      if (!isDayKey(day) || !log || typeof log !== 'object') continue;
      const clean: DayLog = {};
      for (const k of [...TRAINING_KINDS].sort()) {
        const t = (log as Record<string, unknown>)[k];
        if (isTally(t)) clean[k] = { n: t.n, sec: t.sec };
      }
      days[day] = clean;
    }
  }
  return { days, updatedAt: typeof updatedAt === 'string' ? updatedAt : '' };
}

/** The tally to keep for one kind on one day: more activities, then more seconds. */
const pickTally = (a: Tally, b: Tally): Tally => (a.n !== b.n ? (a.n > b.n ? a : b) : a.sec >= b.sec ? a : b);

/**
 * Union of two training logs (normalized strings; null = none). Each device's log holds running totals per
 * day, so a day both have is deduplicated (the larger tally per kind), never added up: merging again cannot
 * double-count. Days older than EXTRAS.logKeepDays before the newest day are dropped.
 */
export function mergeLogs(a: string | null, b: string | null, keepDays: number = EXTRAS.logKeepDays): string | null {
  const x = a === null ? undefined : parseLog(a);
  const y = b === null ? undefined : parseLog(b);
  if (!x || !y) return x ? a : y ? b : null;
  const all = [...new Set([...Object.keys(x.days), ...Object.keys(y.days)])].sort();
  const oldest = all.length ? addDays(all[all.length - 1], -keepDays) : '';
  const days: Record<string, DayLog> = {};
  for (const day of all) {
    if (day < oldest) continue;
    const p = x.days[day] ?? {};
    const q = y.days[day] ?? {};
    const out: DayLog = {};
    for (const k of [...TRAINING_KINDS].sort()) {
      const pk = p[k];
      const qk = q[k];
      const t = pk && qk ? pickTally(pk, qk) : (pk ?? qk);
      if (t) out[k] = { n: t.n, sec: t.sec };
    }
    days[day] = out;
  }
  return JSON.stringify({ days, updatedAt: x.updatedAt > y.updatedAt ? x.updatedAt : y.updatedAt });
}

/** The empty value of a kind: what a device that never stored the key has. */
export function emptyValue(kind: SyncKind): unknown {
  return kind === 'mistakes' ? {} : kind === 'trainedDays' ? [] : null;
}

// --- opening repertoires (shape of src/openings/repertoire.ts RepertoireData, kept loose here) -------

type RepCard = CardState & { reps: number; fails: number };
type RepEntry = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;
export type RepertoireValue = {
  version: 1;
  updatedAt: string;
  repertoires: RepEntry[];
  cards: Record<string, Record<string, RepCard>>;
  /** Delete markers: repertoire id → ISO time it was deleted. Absent when there are none (older values never had it). */
  deleted?: Record<string, string>;
};

/** Same data with object keys sorted at every level (Postgres jsonb reorders keys; comparisons must not care). */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const repOrder = (a: RepEntry, b: RepEntry) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function normalizeRepertoires(value: unknown): RepertoireValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as { updatedAt?: unknown; repertoires?: unknown; cards?: unknown; deleted?: unknown };
  if (!Array.isArray(v.repertoires)) return undefined;
  const reps: RepEntry[] = [];
  const seen = new Set<string>();
  for (const r of v.repertoires as unknown[]) {
    const x = r as Partial<RepEntry> | null;
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || seen.has(x.id)) continue;
    seen.add(x.id);
    reps.push(canonical({ ...x, id: x.id, createdAt: str(x.createdAt), updatedAt: str(x.updatedAt) }) as RepEntry);
  }
  reps.sort(repOrder);
  const cardsIn = v.cards && typeof v.cards === 'object' ? (v.cards as Record<string, unknown>) : {};
  const cards: RepertoireValue['cards'] = {};
  for (const r of reps) {
    const book = cardsIn[r.id];
    if (!book || typeof book !== 'object') continue;
    const out: Record<string, RepCard> = {};
    for (const k of Object.keys(book).sort()) {
      const c = (book as Record<string, unknown>)[k] as RepCard;
      if (validCard(c) && typeof c.reps === 'number' && typeof c.fails === 'number')
        out[k] = { stage: c.stage, due: c.due, retired: c.retired, reps: c.reps, fails: c.fails };
    }
    cards[r.id] = out;
  }
  const deleted = normalizeDeleted(v.deleted);
  return { version: 1, updatedAt: str(v.updatedAt), repertoires: reps, cards, ...(deleted ? { deleted } : {}) };
}

/** Delete markers with sorted ids and ISO-time values; undefined when there are none. */
function normalizeDeleted(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const id of Object.keys(value).sort()) {
    const at = (value as Record<string, unknown>)[id];
    if (typeof at === 'string' && Number.isFinite(Date.parse(at))) out[id] = at;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Union of two marker sets (the later time per id), without markers older than SYNC.tombstoneDays before `now`. */
export function mergeTombstones(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
  now: number = Date.now(),
  keepDays: number = SYNC.tombstoneDays,
): Record<string, string> | undefined {
  const oldest = now - keepDays * 86_400_000;
  const out: Record<string, string> = {};
  for (const id of [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort()) {
    const x = a?.[id];
    const y = b?.[id];
    const at = x && y ? (Date.parse(x) >= Date.parse(y) ? x : y) : (x ?? y)!;
    if (Date.parse(at) >= oldest) out[id] = at;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A delete marker at `deletedAt` beats a copy last changed at `updatedAt` (or never: an empty stamp). */
function deletedAfter(deletedAt: string | undefined, updatedAt: string): boolean {
  if (!deletedAt) return false;
  const u = Date.parse(updatedAt);
  return !Number.isFinite(u) || Date.parse(deletedAt) >= u;
}

function pickRepCard(a: RepCard, b: RepCard): RepCard {
  const p = pickCard(a, b, OPENING_TRAINER.intervals);
  if (JSON.stringify(a) === JSON.stringify(b) || reviewedOn(a, OPENING_TRAINER.intervals) !== reviewedOn(b, OPENING_TRAINER.intervals)) return p;
  if (a.stage !== b.stage || a.retired !== b.retired || a.due !== b.due) return p;
  // Same schedule: the one that has been answered more.
  if (a.reps !== b.reps) return a.reps > b.reps ? a : b;
  return a.fails >= b.fails ? a : b;
}

export function mergeRepertoires(
  a: RepertoireValue | null,
  b: RepertoireValue | null,
  now: number = Date.now(),
): RepertoireValue | null {
  if (!a || !b) return a ?? b;
  // Every marker from both sides decides this merge; expired ones are only left out of the result.
  const markers = mergeTombstones(a.deleted, b.deleted, now, Infinity) ?? {};
  const byId = new Map<string, RepEntry>();
  for (const r of [...a.repertoires, ...b.repertoires]) {
    const cur = byId.get(r.id);
    if (!cur) byId.set(r.id, r);
    else if (r.updatedAt !== cur.updatedAt) byId.set(r.id, r.updatedAt > cur.updatedAt ? r : cur);
    else if (JSON.stringify(r) > JSON.stringify(cur)) byId.set(r.id, r); // same time, different content: any fixed rule
  }
  const repertoires = [...byId.values()].filter((r) => !deletedAfter(markers[r.id], r.updatedAt)).sort(repOrder);
  const cards: RepertoireValue['cards'] = {};
  for (const { id } of repertoires) {
    const x = a.cards[id] ?? {};
    const y = b.cards[id] ?? {};
    const book: Record<string, RepCard> = {};
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort())
      book[k] = x[k] && y[k] ? pickRepCard(x[k], y[k]) : (x[k] ?? y[k]);
    if (Object.keys(book).length || a.cards[id] || b.cards[id]) cards[id] = book;
  }
  const deleted = mergeTombstones(a.deleted, b.deleted, now);
  return {
    version: 1,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    repertoires,
    cards,
    ...(deleted ? { deleted } : {}),
  };
}

/** The `updatedAt` a stamped record carries (ISO text or ms), as ms; null when it has none. */
export function embeddedStamp(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  try {
    const at = (JSON.parse(raw) as { updatedAt?: unknown } | null)?.updatedAt;
    const ms = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
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
export function pickCard<C extends CardState>(a: C, b: C, intervals: number[] = MISTAKES.intervals): C {
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
    case 'stamped': {
      const ea = embeddedStamp(a.value);
      const eb = embeddedStamp(b.value);
      if (ea !== null && eb !== null && ea !== eb) return ea > eb ? a : b;
      return a.updatedAt > b.updatedAt ? a : b;
    }
    case 'best':
      return { value: mergeBests(a.value as string | null, b.value as string | null), updatedAt };
    case 'log':
      return { value: mergeLogs(a.value as string | null, b.value as string | null), updatedAt };
    case 'repertoires':
      return { value: mergeRepertoires(a.value as RepertoireValue | null, b.value as RepertoireValue | null), updatedAt };
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
