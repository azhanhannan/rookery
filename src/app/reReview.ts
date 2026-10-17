// One-off re-review of shallow reviews (insights decision 1, 18 Oct 2026): saved games whose review is
// shallower than the normal review depth (e.g. the old depth-12 "Review all") are reviewed again at that depth,
// once. It runs on the batch review runner as a low-priority run: it waits while the engine is wanted elsewhere,
// and a run that was started keeps going after a reload until it is done or cancelled.
import { REVIEW } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import { botColor } from '../game/rules';
import { loadHistory } from '../game/storage';
import type { GameRecord } from '../game/types';
import { reviewFits } from '../review/reviewView';
import { NAV_ITEMS, isCurrent } from './nav';
import { useBatchReview } from './batchReview';

/** Set while a re-review run is unfinished, so the next page load picks it up again. */
const RESUME_KEY = 'rookery.reReview';

/** The depth a re-review brings shallow reviews up to. */
export const reReviewDepth = (): number => REVIEW.depth.normal;

/** Ids (in saved order, newest first) of finished games whose fitting review is shallower than `depth`. */
export function shallowReviewIds(games: GameRecord[], depth = reReviewDepth()): string[] {
  return games
    .filter((g) => g.result !== '*' && g.moves.length > 0 && reviewFits(g, g.review) && g.review.depth < depth)
    .map((g) => g.id);
}

/** Pages that use the engine for themselves (Play is handled apart: only a game in progress counts). */
const ENGINE_PAGES = ['#/analysis', '#/review', '#/endgames', '#/puzzles'];

/**
 * Whether a low-priority run should wait: the player is on a page that wants the engine now. Play counts only
 * with a bot game in progress (the bot must never wait behind a background search).
 */
export function engineWantedElsewhere(hash: string, record: GameRecord): boolean {
  if (ENGINE_PAGES.some((p) => hash === p || hash.startsWith(`${p}/`))) return true;
  const play = NAV_ITEMS.find((i) => i.href === '#/play');
  const onPlay = !!play && isCurrent(play, hash);
  return onPlay && record.result === '*' && botColor(record) !== null;
}

function setResume(on: boolean): void {
  try {
    if (on) localStorage.setItem(RESUME_KEY, '1');
    else localStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore: the run just won't resume after a reload
  }
}

function resumePending(): boolean {
  try {
    return localStorage.getItem(RESUME_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Starts re-reviewing every shallow review on this device. Returns false (and starts nothing) when there is
 * none or another batch run is going.
 */
export function startReReview(): boolean {
  const batch = useBatchReview.getState();
  if (batch.status === 'running') return false;
  const ids = shallowReviewIds(loadHistory());
  if (ids.length === 0) {
    setResume(false);
    return false;
  }
  setResume(true);
  batch.start(ids, reReviewDepth(), {
    kind: 'deepen',
    yieldWhile: () => engineWantedElsewhere(location.hash, useGameStore.getState().record),
    // Done, cancelled or stopped: don't come back on the next load (the offer stays for games still shallow).
    onEnd: () => setResume(false),
  });
  return true;
}

/** At start-up: continues a re-review that a reload interrupted. */
export function resumeReReview(): void {
  if (resumePending()) startReReview();
}
