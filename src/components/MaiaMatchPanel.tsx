import type { MaiaMatchRun } from '../app/useMaiaMatchRun';
import type { GameRecord } from '../game/types';
import { matchColors, matchCost, matchPositions } from '../rating/maiaMatch';

/** Rough per-evaluation time in the browser, for the up-front estimate (measured ~0.2 s). */
const EST_MS_PER_EVAL = 250;

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

function minutes(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min === 1 ? 'about a minute' : `about ${min} minutes`;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

/**
 * Starts Maia matching for the people in the game (shown until a result is stored), with progress and Cancel.
 * The result itself appears in each player's summary card.
 */
export function MaiaMatchPanel({ record, run }: { record: GameRecord; run: MaiaMatchRun }) {
  const colors = matchColors(record);
  if (colors.length === 0 || (record.maiaMatch && run.status === 'idle')) return null;
  const evals = colors.reduce((n, c) => n + matchCost(matchPositions(record, c).length), 0);

  if (run.status === 'loading' || run.status === 'running') {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="maia-match-progress">
        {run.status === 'loading' ? (
          <Bar label="Loading the human-like model" value={run.load.loaded} max={run.load.total} />
        ) : (
          <Bar label="Comparing moves with Maia" value={run.progress.done} max={run.progress.total} />
        )}
        <button className={btn} onClick={run.cancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="maia-match-start">
      <h3 className="font-semibold">Rating from playing style</h3>
      <p className="text-sm text-muted">
        Compares each move with what the human-like Maia model would play at ratings from 600 to 2600, and finds the
        rating whose moves look most like yours. It looks at style, not only mistakes.{' '}
        {evals > 0 ? `Takes ${minutes(evals * EST_MS_PER_EVAL)}` : 'Needs at least 10 non-forced moves'}
        {evals > 0 && '; the first time it also downloads about 60 MB.'}
      </p>
      {run.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          Style matching failed{run.error ? `: ${run.error}` : '.'}
        </p>
      )}
      <button
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
        disabled={evals === 0}
        onClick={run.start}
      >
        {run.status === 'error' ? 'Retry' : 'Estimate from playing style'}
      </button>
    </div>
  );
}
