import { useBatchReview } from '../app/batchReview';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/** Progress of a "Review all" run (or a re-review), wherever it is shown; nothing when no run has started. */
export function BatchReviewPanel() {
  const s = useBatchReview();
  if (s.status === 'idle') return null;
  const total = s.ids.length;
  const deepen = s.kind === 'deepen';
  const name = deepen ? 'Re-review' : 'Review all';

  if (s.status === 'running') {
    const gamePct = s.progress.total > 0 ? s.progress.done / s.progress.total : 0;
    const pct = total > 0 ? Math.round(((s.index + gamePct) / total) * 100) : 0;
    return (
      <section className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="batch-review" aria-label={name}>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">
            {deepen ? 'Re-reviewing' : 'Reviewing'} game {Math.min(s.index + 1, total)} of {total}
            {deepen && ` at depth ${s.depth}`}
            {s.currentTitle && <span className="text-muted"> · {s.currentTitle}</span>}
          </span>
          <span className="font-mono text-muted">{pct}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded bg-surface-2"
          role="progressbar"
          aria-label={`${name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        {deepen ? (
          <p className="text-xs text-muted" data-testid="batch-review-note">
            {s.paused
              ? 'Paused while the engine is needed (a game in progress, analysis or a review). It carries on by itself.'
              : 'Runs quietly in the background and waits whenever you play. A reload picks it up where it left off.'}
          </p>
        ) : (
          <p className="text-xs text-muted">
            Keeps going while you use other pages. Closing or reloading this tab stops it; finished reviews stay saved.
          </p>
        )}
        <button className={btn} onClick={s.cancel}>Cancel</button>
      </section>
    );
  }

  const headline = `${name} ${s.status === 'done' ? 'finished' : s.status === 'cancelled' ? 'cancelled' : 'stopped'}`;
  return (
    <section className="flex flex-col gap-1 rounded-lg bg-surface p-3 text-sm" data-testid="batch-review" aria-label={name}>
      <p className="font-semibold" role="status">{headline}</p>
      <p>
        {s.reviewed} {deepen ? 're-reviewed' : 'reviewed'}
        {s.skipped > 0 && `, ${s.skipped} already reviewed`}
        {s.failed.length > 0 && `, ${s.failed.length} failed`}
        {s.status !== 'done' && total > 0 && ` (of ${total})`}.
      </p>
      {s.error && <p role="alert" className="text-danger">{s.error}</p>}
      {s.failed.length > 0 && (
        <ul className="list-inside list-disc text-xs text-muted">
          {s.failed.slice(0, 10).map((f, i) => (
            <li key={i}>{f.title}: {f.reason}</li>
          ))}
          {s.failed.length > 10 && <li>…and {s.failed.length - 10} more</li>}
        </ul>
      )}
      <div className="mt-1 flex gap-2">
        <a className={btn} href="#/games">My games</a>
        <button className={btn} onClick={s.dismiss}>Close</button>
      </div>
    </section>
  );
}
