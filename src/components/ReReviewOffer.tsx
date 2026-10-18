import { useMemo } from 'react';
import { useBatchReview } from '../app/batchReview';
import { reReviewDepth, shallowReviewIds, startReReview } from '../app/reReview';
import { loadHistory } from '../game/storage';

const btn =
  'rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/**
 * A quiet one-line offer to re-review games whose saved review is outdated: shallower than the normal depth, or
 * an older format without the second engine line. Nothing when
 * there are none, or while a batch run is going (its panel shows the progress instead).
 */
export function ReReviewOffer() {
  const status = useBatchReview((s) => s.status);
  const reviewed = useBatchReview((s) => s.reviewed);
  // Re-read storage whenever a run moves on or ends.
  const count = useMemo(
    () => shallowReviewIds(loadHistory()).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage changes as the batch saves reviews
    [status, reviewed],
  );
  if (count === 0 || status === 'running') return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-2 px-3 py-2 text-sm" data-testid="rereview-offer">
      <span className="text-muted">
        {count} game{count === 1 ? ' has' : 's have'} an older review: below depth {reReviewDepth()}, or without the engine’s
        second-best move, which Insights needs to spot critical moments.
      </span>
      <button className={btn} onClick={() => startReReview()}>
        Re-review in the background
      </button>
    </div>
  );
}
