// The player's Insights Focus on this device, in localStorage `rookery.focus` (synced: src/sync/keys.ts,
// merged by src/sync/merge.ts mergeFocus). An ended Focus is kept, marked `endedAt`, so ending it on one device
// ends it everywhere; starting a new one replaces it.
import { startFocus, type Focus } from '../../insights/focus';
import type { BucketId, GameFacts } from '../../insights/types';

export const FOCUS_KEY = 'rookery.focus';

export type FocusEnd = 'window' | 'swap' | 'stopped';
export type StoredFocus = Focus & { endedAt?: string; endReason?: FocusEnd };

/** Pure: a stored value read back; anything malformed is null, never thrown. */
export function parseStoredFocus(raw: string | null): StoredFocus | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredFocus> | null;
    if (!v || typeof v !== 'object') return null;
    const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
    if (typeof v.bucketId !== 'string' || typeof v.startedAt !== 'string' || !Number.isFinite(Date.parse(v.startedAt))) return null;
    if (!num(v.baselineRate) || !num(v.target) || !num(v.minGames) || !num(v.minDays) || !num(v.factsVersion)) return null;
    return v as StoredFocus;
  } catch {
    return null;
  }
}

export function loadFocus(): StoredFocus | null {
  try {
    return parseStoredFocus(localStorage.getItem(FOCUS_KEY));
  } catch {
    return null;
  }
}

export function saveFocus(focus: StoredFocus): void {
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
  } catch {
    // Storage blocked or full: the Focus lasts this visit only.
  }
}

/** The Focus in force, or null when there is none or it was ended. */
export function activeFocus(f: StoredFocus | null): StoredFocus | null {
  return f && !f.endedAt ? f : null;
}

/** Starts (and stores) a Focus on `bucketId`, pre-registered from every fact on file. */
export function beginFocus(facts: GameFacts[], bucketId: BucketId, now: Date = new Date(), setBy: Focus['setBy'] = 'self'): StoredFocus {
  const f: StoredFocus = startFocus(facts, bucketId, now, setBy);
  saveFocus(f);
  return f;
}

/** Ends (and stores) the Focus. */
export function finishFocus(focus: StoredFocus, reason: FocusEnd, now: Date = new Date()): StoredFocus {
  const f: StoredFocus = { ...focus, endedAt: now.toISOString(), endReason: reason };
  saveFocus(f);
  return f;
}
