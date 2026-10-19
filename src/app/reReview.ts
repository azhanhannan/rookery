// One-off re-review of outdated reviews (insights decision 1, 18 Oct 2026; player profile Step 0): saved games
// whose review is shallower than the normal review depth (e.g. the old depth-12 "Review all"), or older than the
// current review format (version 1 kept no second engine line, so Insights can't tell critical moves), are
// reviewed again at that depth, once. It runs on the batch review runner as a low-priority run: it waits while the engine is wanted elsewhere,
// and a run that was started keeps going after a reload until it is done or cancelled.
import { REVIEW } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import { botColor } from '../game/rules';
import { loadHistory } from '../game/storage';
import type { GameRecord } from '../game/types';
import { REVIEW_VERSION, type GameReview } from '../review/types';
import { reviewFits } from '../review/reviewView';
import { NAV_ITEMS, isCurrent } from './nav';
import { useBatchReview } from './batchReview';

/** Set while a re-review run is unfinished, so the next page load picks it up again. */
const RESUME_KEY = 'rookery.reReview';

/** The depth a re-review brings shallow reviews up to. */
export const reReviewDepth = (): number => REVIEW.depth.normal;

/** A review is outdated when it is shallower than `depth` or in an older format than REVIEW_VERSION. */
export function reviewOutdated(review: GameReview, depth = reReviewDepth()): boolean {
  return review.depth < depth || (review.version ?? 1) < REVIEW_VERSION;
}

/**
 * Ids (in saved order, newest first) of finished games whose fitting review is outdated: shallower than `depth`,
 * or a version 1 review (no second engine line), whatever its depth.
 */
export function shallowReviewIds(games: GameRecord[], depth = reReviewDepth()): string[] {
  return games
    .filter((g) => g.result !== '*' && g.moves.length > 0 && reviewFits(g, g.review) && reviewOutdated(g.review, depth))
    .map((g) => g.id);
}

/**
 * Ids (in saved order, newest first) of finished games with no review that fits their moves: never reviewed, or
 * reviewed before the moves changed. Not the re-review's job; the "Review them" offer reviews these.
 */
export function unreviewedIds(games: GameRecord[]): string[] {
  return games.filter((g) => g.result !== '*' && g.moves.length > 0 && !reviewFits(g, g.review)).map((g) => g.id);
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
 * Starts re-reviewing every outdated review on this device. Returns false (and starts nothing) when there is
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

/**
 * Reviews every finished game on this device that has no review yet, at the normal depth, as an ordinary
 * "Review all" run that waits while the engine is wanted elsewhere. A reload stops it; the offer then shows
 * what is left. Returns false when there is none or another batch run is going.
 */
export function startReviewUnreviewed(): boolean {
  const batch = useBatchReview.getState();
  if (batch.status === 'running') return false;
  const ids = unreviewedIds(loadHistory());
  if (ids.length === 0) return false;
  batch.start(ids, reReviewDepth(), {
    yieldWhile: () => engineWantedElsewhere(location.hash, useGameStore.getState().record),
  });
  return true;
}

/** At start-up: continues a re-review that a reload interrupted. */
export function resumeReReview(): void {
  if (resumePending()) startReReview();
}
