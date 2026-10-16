// Which localStorage keys follow the account (the server's allowlist too) and how each one merges.
// Pure: imported by the browser (src/sync/stateSync.ts) and the server (server/src/routes/state.ts).
//
// Synced: choices a player makes once and expects everywhere, plus training progress.
// Not synced (device caches): rookery.current (the live game), rookery.games (games sync on their own),
// rookery.analysis (the analysis board's scratch tree), rookery.unsynced (the upload queue),
// rookery.puzzles (the signed-out puzzle rating; the account has its own), rookery.muted (where you are
// decides that: a phone in a meeting, a laptop at home), rookery.sync (this feature's own bookkeeping).
// Never synced: rookery.lichessToken (a Lichess credential; it must not reach Rookery's server), and
// rookery.explorer (opening explorer panel choices, device-only for now).

/**
 * 'pref': the raw localStorage string (null = unset); the newest change wins.
 * 'mistakes': the My-mistakes spaced-repetition schedule; merged per puzzle.
 * 'trainedDays': the streak's trained days; union.
 * 'daily': the pinned daily puzzle; the later day wins, a solve is never lost.
 * 'stamped': a raw JSON string carrying its own `updatedAt`; the newer one wins (training records whose
 *   owners keep that field current: endgame drills, finished lessons).
 * 'best': a raw string holding a best score (a plain number, or JSON `{ mode: score }` for per-mode bests);
 *   merged as the larger score per mode.
 * 'log': the raw training-log JSON (`{ updatedAt, days }`); days union, a day on both sides keeps the
 *   larger tally per activity kind.
 * 'repertoires': the opening trainer (`{version, updatedAt, repertoires, cards}`); repertoires merge by id
 *   (newer `updatedAt` wins), their cards per position like My-mistakes cards; delete markers (`deleted`)
 *   remove a repertoire everywhere and expire after SYNC.tombstoneDays.
 */
export type SyncKind = 'pref' | 'mistakes' | 'trainedDays' | 'daily' | 'stamped' | 'repertoires' | 'best' | 'log';

/** Kinds whose localStorage value is the raw string itself (not JSON the sync parses). */
export const RAW_KINDS: ReadonlySet<SyncKind> = new Set<SyncKind>(['pref', 'stamped', 'best', 'log']);

export const SYNC_KEYS: Readonly<Record<string, SyncKind>> = {
  'rookery.boardTheme': 'pref',
  'rookery.pieceSet': 'pref',
  'rookery.playSettings': 'pref',
  'rookery.reviewPrefs': 'pref',
  'rookery.gameMode': 'pref',
  'rookery.hangingGlow': 'pref',
  'rookery.analysis.engine': 'pref',
  'rookery.evalBar': 'pref',
  'rookery.botElo': 'pref',
  'rookery.botEngine': 'pref',
  'rookery.maiaElo': 'pref',
  'rookery.mistakes': 'mistakes',
  'rookery.trainedDays': 'trainedDays',
  'rookery.daily': 'daily',
  'rookery.repertoires': 'repertoires',
  'rookery.endgames': 'stamped',
  'rookery.timedBest': 'best',
  'rookery.trainingLog': 'log',
  'rookery.lessons': 'stamped',
};

export function syncKind(key: string): SyncKind | null {
  return Object.prototype.hasOwnProperty.call(SYNC_KEYS, key) ? SYNC_KEYS[key] : null;
}
