// Shared bits of the coach pages (no components here, so Fast Refresh keeps working).
import { ApiError } from '../../api/client';
import type { GameRecord } from '../../game/types';

export const card = 'rounded-2xl bg-surface p-5';
export const button = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
export const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';

export function message(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The position before ply `ply` (1-based); ply 0 = the start. */
export function fenBefore(record: GameRecord, ply: number): string {
  return ply <= 1 ? record.startFen : record.moves[ply - 2].fenAfter;
}
