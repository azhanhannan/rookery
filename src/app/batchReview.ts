// "Review all": reviews saved games one after another in the background with the normal review pipeline
// (runReview), saving each review the way the review page does (useGameStore.setReview). It lives in a
// module store, so it keeps running while the player moves between pages; closing or reloading the tab stops it.
//
// The same runner does the one-off "re-review" (kind 'deepen', app/reReview.ts): games whose saved review is
// shallower than the normal depth are reviewed again. That run is low priority: it waits while the engine is
// wanted elsewhere (a bot game on Play, the Analysis board), and it resumes after a reload until it finishes.
import { create } from 'zustand';
import { queueGameUpload } from '../account/gameSync';
import { useGameStore } from '../game/gameStore';
import { findArchivedGame } from '../game/storage';
import type { GameRecord } from '../game/types';
import { runReview, type ReviewProgress } from '../review/reviewRunner';
import { reviewFits } from '../review/reviewView';

/** 'all' = the Import page's Review all; 'deepen' = the one-off re-review of shallow reviews. */
export type BatchKind = 'all' | 'deepen';

export type BatchStartOptions = {
  kind?: BatchKind;
  /**
   * Low priority: checked before each game and each position; while it says true the run waits (status stays
   * 'running', `paused` true) and checks again every YIELD_POLL_MS.
   */
  yieldWhile?: () => boolean;
  /** Called once when the run ends for good (done, cancelled or stopped), not when the tab closes mid-run. */
  onEnd?: (status: 'done' | 'cancelled' | 'stopped') => void;
};

export type BatchReviewState = {
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'stopped';
  kind: BatchKind;
  /** Waiting for the engine to be free (a 'deepen' run while the player plays). */
  paused: boolean;
  ids: string[];
  /** Index in `ids` of the game being reviewed (or reached when the run ended). */
  index: number;
  /** Positions of the current game. */
  progress: ReviewProgress;
  currentTitle: string;
  reviewed: number;
  /** Already had a review that fits, at this run's depth or deeper; left as it was. */
  skipped: number;
  failed: { title: string; reason: string }[];
  /** Why the run stopped early (status 'stopped'). */
  error: string | null;
  depth: number;

  start(ids: string[], depth: number, opts?: BatchStartOptions): void;
  cancel(): void;
  /** Clears a finished run's summary. */
  dismiss(): void;
};

let controller: AbortController | null = null;
let endHook: BatchStartOptions['onEnd'];

function ended(status: 'done' | 'cancelled' | 'stopped'): void {
  const hook = endHook;
  endHook = undefined;
  hook?.(status);
}

const STOP_AFTER_FAILURES = 3;
/** How often a yielding run looks again whether the engine is free. */
export const YIELD_POLL_MS = 1000;

const title = (g: GameRecord) => `${g.white.name} vs ${g.black.name}`;

function findRecord(id: string): GameRecord | null {
  const current = useGameStore.getState().record;
  return current.id === id ? current : findArchivedGame(id);
}

const IDLE = {
  status: 'idle' as const,
  kind: 'all' as BatchKind,
  paused: false,
  ids: [],
  index: 0,
  progress: { done: 0, total: 0 },
  currentTitle: '',
  reviewed: 0,
  skipped: 0,
  failed: [],
  error: null,
  depth: 0,
};

export const useBatchReview = create<BatchReviewState>((set, get) => ({
  ...IDLE,

  start(ids, depth, opts = {}) {
    if (get().status === 'running' || ids.length === 0) return;
    const ctrl = new AbortController();
    controller = ctrl;
    endHook = opts.onEnd;
    set({ ...IDLE, status: 'running', kind: opts.kind ?? 'all', ids, depth });
    void run(ids, depth, ctrl, opts.yieldWhile);
  },

  cancel() {
    controller?.abort();
    controller = null;
    if (get().status === 'running') {
      set({ status: 'cancelled', paused: false });
      ended('cancelled');
    }
  },

  dismiss() {
    if (get().status !== 'running') set(IDLE);
  },
}));

/** True when `record` already has a review for its moves at `depth` or deeper. */
export function reviewedAtLeast(record: GameRecord, depth: number): boolean {
  return reviewFits(record, record.review) && record.review.depth >= depth;
}

async function run(
  ids: string[],
  depth: number,
  ctrl: AbortController,
  yieldWhile?: () => boolean,
): Promise<void> {
  const live = () => controller === ctrl && !ctrl.signal.aborted;
  const set = useBatchReview.setState;
  const stop = (error: string) => {
    controller = null;
    set({ status: 'stopped', paused: false, error });
    ended('stopped');
  };
  const beforePosition = yieldWhile
    ? async () => {
        if (!yieldWhile()) return;
        set({ paused: true });
        while (live() && yieldWhile()) await new Promise((r) => setTimeout(r, YIELD_POLL_MS));
        if (live()) set({ paused: false });
      }
    : undefined;
  let failuresInARow = 0;
  for (const [index, id] of ids.entries()) {
    if (beforePosition) await beforePosition();
    if (!live()) return;
    const record = findRecord(id);
    if (!record || record.result === '*' || record.moves.length === 0) {
      set((s) => ({ index, failed: [...s.failed, { title: record ? title(record) : 'A game', reason: 'No longer saved on this device' }] }));
      continue;
    }
    if (reviewedAtLeast(record, depth)) {
      set((s) => ({ index, skipped: s.skipped + 1 }));
      continue;
    }
    set({ index, currentTitle: title(record), progress: { done: 0, total: record.moves.length + 1 } });
    try {
      const review = await runReview(record, {
        depth,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (live()) set({ progress: p });
        },
        beforePosition,
      });
      if (!live()) return;
      useGameStore.getState().setReview(id, review);
      // The save swallows a full storage; check it really landed before going on.
      if (findRecord(id)?.review?.createdAt !== review.createdAt) {
        stop("This device's storage is full, so the review couldn't be saved. The rest were not reviewed.");
        return;
      }
      queueGameUpload(id);
      failuresInARow = 0;
      set((s) => ({ reviewed: s.reviewed + 1 }));
    } catch (err) {
      if (!live()) return;
      const reason = err instanceof Error ? err.message : String(err);
      set((s) => ({ failed: [...s.failed, { title: title(record), reason }] }));
      // The same error game after game (engine failed to start, say) won't fix itself.
      if (++failuresInARow >= STOP_AFTER_FAILURES) {
        stop(`Stopped after ${STOP_AFTER_FAILURES} failures in a row: ${reason}`);
        return;
      }
    }
  }
  if (!live()) return;
  controller = null;
  set({ status: 'done', paused: false, index: ids.length });
  ended('done');
}
