// "Review all": reviews saved games one after another in the background with the normal review pipeline
// (runReview), saving each review the way the review page does (useGameStore.setReview). It lives in a
// module store, so it keeps running while the player moves between pages; closing or reloading the tab stops it.
import { create } from 'zustand';
import { queueGameUpload } from '../account/gameSync';
import { useGameStore } from '../game/gameStore';
import { findArchivedGame } from '../game/storage';
import type { GameRecord } from '../game/types';
import { runReview, type ReviewProgress } from '../review/reviewRunner';
import { reviewFits } from '../review/reviewView';

export type BatchReviewState = {
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'stopped';
  ids: string[];
  /** Index in `ids` of the game being reviewed (or reached when the run ended). */
  index: number;
  /** Positions of the current game. */
  progress: ReviewProgress;
  currentTitle: string;
  reviewed: number;
  /** Already had a review that fits; left as it was. */
  skipped: number;
  failed: { title: string; reason: string }[];
  /** Why the run stopped early (status 'stopped'). */
  error: string | null;
  depth: number;

  start(ids: string[], depth: number): void;
  cancel(): void;
  /** Clears a finished run's summary. */
  dismiss(): void;
};

let controller: AbortController | null = null;

const STOP_AFTER_FAILURES = 3;

const title = (g: GameRecord) => `${g.white.name} vs ${g.black.name}`;

function findRecord(id: string): GameRecord | null {
  const current = useGameStore.getState().record;
  return current.id === id ? current : findArchivedGame(id);
}

const IDLE = {
  status: 'idle' as const,
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

  start(ids, depth) {
    if (get().status === 'running' || ids.length === 0) return;
    const ctrl = new AbortController();
    controller = ctrl;
    set({ ...IDLE, status: 'running', ids, depth });
    void run(ids, depth, ctrl);
  },

  cancel() {
    controller?.abort();
    controller = null;
    if (get().status === 'running') set({ status: 'cancelled' });
  },

  dismiss() {
    if (get().status !== 'running') set(IDLE);
  },
}));

async function run(ids: string[], depth: number, ctrl: AbortController): Promise<void> {
  const live = () => controller === ctrl && !ctrl.signal.aborted;
  const set = useBatchReview.setState;
  let failuresInARow = 0;
  for (const [index, id] of ids.entries()) {
    if (!live()) return;
    const record = findRecord(id);
    if (!record || record.result === '*' || record.moves.length === 0) {
      set((s) => ({ index, failed: [...s.failed, { title: record ? title(record) : 'A game', reason: 'No longer saved on this device' }] }));
      continue;
    }
    if (reviewFits(record, record.review)) {
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
      });
      if (!live()) return;
      useGameStore.getState().setReview(id, review);
      // The save swallows a full storage; check it really landed before going on.
      if (findRecord(id)?.review?.createdAt !== review.createdAt) {
        controller = null;
        set({ status: 'stopped', error: "This device's storage is full, so the review couldn't be saved. The rest were not reviewed." });
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
        controller = null;
        set({ status: 'stopped', error: `Stopped after ${STOP_AFTER_FAILURES} failures in a row: ${reason}` });
        return;
      }
    }
  }
  if (!live()) return;
  controller = null;
  set({ status: 'done', index: ids.length });
}
