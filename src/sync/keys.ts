// Which localStorage keys follow the account (the server's allowlist too) and how each one merges.
// Pure: imported by the browser (src/sync/stateSync.ts) and the server (server/src/routes/state.ts).
//
// Synced: choices a player makes once and expects everywhere, plus training progress.
// Not synced (device caches): rookery.current (the live game), rookery.games (games sync on their own),
// rookery.analysis (the analysis board's scratch tree), rookery.unsynced (the upload queue),
// rookery.puzzles (the signed-out puzzle rating; the account has its own), rookery.muted (where you are
// decides that: a phone in a meeting, a laptop at home), rookery.sync (this feature's own bookkeeping).

/**
 * 'pref': the raw localStorage string (null = unset); the newest change wins.
 * 'mistakes': the My-mistakes spaced-repetition schedule; merged per puzzle.
 * 'trainedDays': the streak's trained days; union.
 * 'daily': the pinned daily puzzle; the later day wins, a solve is never lost.
 */
export type SyncKind = 'pref' | 'mistakes' | 'trainedDays' | 'daily';

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
};

export function syncKind(key: string): SyncKind | null {
  return Object.prototype.hasOwnProperty.call(SYNC_KEYS, key) ? SYNC_KEYS[key] : null;
}
