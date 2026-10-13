import { useEffect, useRef, useState } from 'react';
import type { GameRecord } from '../game/types';
import { runReview, type ReviewProgress } from '../review/reviewRunner';
import type { GameReview } from '../review/types';

export type ReviewRun = {
  status: 'idle' | 'running' | 'error';
  progress: ReviewProgress;
  error: string | null;
  start(depth: number): void;
  /** Stops the run and returns to the start state; a cancel is not an error. */
  cancel(): void;
};

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof Error && err.name === 'AbortError');
}

/** Runs a review of `record`, with progress and cancel; `onDone` gets the finished review. Leaving the page cancels. */
export function useReviewRun(record: GameRecord, onDone: (review: GameReview) => void): ReviewRun {
  const [status, setStatus] = useState<ReviewRun['status']>('idle');
  const [progress, setProgress] = useState<ReviewProgress>({ done: 0, total: record.moves.length + 1 });
  const [error, setError] = useState<string | null>(null);
  // The run in flight; results from any other (cancelled or replaced) run are ignored.
  const current = useRef<AbortController | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => () => current.current?.abort(), []);

  async function start(depth: number) {
    current.current?.abort();
    const ctrl = new AbortController();
    current.current = ctrl;
    setStatus('running');
    setError(null);
    setProgress({ done: 0, total: record.moves.length + 1 });
    try {
      const review = await Promise.resolve().then(() =>
        runReview(record, {
          depth,
          signal: ctrl.signal,
          onProgress: (p) => {
            if (current.current === ctrl) setProgress(p);
          },
        }),
      );
      if (current.current !== ctrl) return;
      current.current = null;
      setStatus('idle');
      done.current(review);
    } catch (err) {
      if (current.current !== ctrl) return;
      current.current = null;
      if (isAbort(err, ctrl.signal)) {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function cancel() {
    const ctrl = current.current;
    current.current = null;
    ctrl?.abort();
    setStatus('idle');
  }

  return { status, progress, error, start, cancel };
}
