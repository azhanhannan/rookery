import { REVIEW } from '../config/tunables';
import type { ReviewRun } from '../app/useReviewRun';
import { progressText } from '../review/reviewView';

const DEPTHS = [
  { name: 'Fast', depth: REVIEW.depth.fast },
  { name: 'Normal', depth: REVIEW.depth.normal },
  { name: 'Deep', depth: REVIEW.depth.deep },
];

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/** Depth choice and Start; while running, the progress bar and Cancel; after a failure, the error and Retry. */
export function ReviewRunPanel({
  run,
  depth,
  onDepth,
  startLabel = 'Start review',
  onClose,
}: {
  run: ReviewRun;
  depth: number;
  onDepth: (depth: number) => void;
  startLabel?: string;
  /** Shown as "Close" next to Start when there is a stored review to go back to. */
  onClose?: () => void;
}) {
  if (run.status === 'running') {
    const { done, total } = run.progress;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="review-progress">
        <div className="flex items-baseline justify-between text-sm">
          <span>{progressText(done, total)}</span>
          <span className="font-mono text-muted">{pct}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded bg-surface-2"
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <button className={btn} onClick={run.cancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-3" data-testid="review-start">
      <div role="group" aria-label="Review depth" className="grid grid-cols-3 gap-2">
        {DEPTHS.map((d) => (
          <button
            key={d.name}
            aria-pressed={depth === d.depth}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              depth === d.depth ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'
            }`}
            onClick={() => onDepth(d.depth)}
          >
            {d.name}
            <span className="block text-[10px] font-normal opacity-75">depth {d.depth}</span>
          </button>
        ))}
      </div>
      {run.status === 'error' && (
        <p role="alert" className="text-sm text-danger" title={run.error ?? undefined}>
          The review failed{run.error ? `: ${run.error}` : '.'}
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
          onClick={() => run.start(depth)}
        >
          {run.status === 'error' ? 'Retry' : startLabel}
        </button>
        {onClose && <button className={btn} onClick={onClose}>Close</button>}
      </div>
    </div>
  );
}
