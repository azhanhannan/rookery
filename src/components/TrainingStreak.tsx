import { loadHistory } from '../game/storage';
import { MISTAKES } from '../config/tunables';
import { todayKey } from '../puzzles/days';
import { reviewedOfLast } from '../puzzles/harvest';
import { computeStreak, loadTrainedDays } from '../puzzles/streak';

/**
 * The trained-days streak on this device (a day counts after a solved puzzle or a finished game review),
 * optionally with "reviewed X of your last 5 games". Reads storage on every render: callers re-render it
 * after something that may have counted (e.g. a puzzle result).
 */
export function TrainingStreak({ showReviewed = false }: { showReviewed?: boolean }) {
  const streak = computeStreak(loadTrainedDays(), todayKey());
  const reviewed = showReviewed ? reviewedOfLast(loadHistory()) : null;
  const status = streak.trainedToday
    ? 'Trained today'
    : streak.days > 0
      ? 'Solve a puzzle or review a game today to keep it going'
      : 'Solve a puzzle or review a game to start one';
  const rest =
    MISTAKES.freezesPerWeek > 0 && streak.days > 0
      ? streak.restUsedThisWeek
        ? 'Rest day used this week'
        : 'Rest day available this week'
      : null;
  return (
    <div data-testid="training-streak" className="flex flex-col gap-1 rounded-lg bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">Training streak</span>
        <span className="text-2xl font-bold tabular-nums">
          {streak.days} <span className="text-sm font-normal text-muted">day{streak.days === 1 ? '' : 's'}</span>
        </span>
      </div>
      <p className="text-xs text-muted">
        {status}
        {rest && ` · ${rest}`}
      </p>
      {reviewed && reviewed.total > 0 && (
        <p data-testid="reviewed-recent" className="text-xs text-muted">
          Reviewed {reviewed.reviewed} of your last {reviewed.total} game{reviewed.total === 1 ? '' : 's'}
          {reviewed.reviewed < reviewed.total && (
            <>
              {' · '}
              <a className="text-accent hover:underline" href="#/review/games">Review one</a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

