// Reminders that opening moves are due today: a card on the Play page and a count beside "Openings" in the header.
import { useMemo, useState } from 'react';
import { dueToday, reviewsLeft, type DueRepertoire } from '../openings/repertoire';
import { reviewsDone, useRepertoireStore } from '../openings/repertoireStore';
import { writeSelected } from '../openings/selected';
import { todayKey } from '../puzzles/days';

const HIDDEN_KEY = 'rookery.openings.dueHidden';

/**
 * Today's opening reviews: the repertoires with moves due, and how many moves to ask today (capped by
 * OPENING_TRAINER.dailyReviews, so the backlog itself is never shown). Nothing once today's are done.
 */
export function useOpeningsDue(): { reps: DueRepertoire[]; today: number } {
  const data = useRepertoireStore((s) => s.data);
  const daily = useRepertoireStore((s) => s.daily);
  const today = todayKey();
  return useMemo(() => {
    const left = reviewsLeft(reviewsDone(daily, today));
    const reps = left ? dueToday(data, today) : [];
    return { reps, today: Math.min(left, reps.reduce((n, r) => n + r.due, 0)) };
  }, [data, daily, today]);
}

function hiddenToday(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === todayKey();
  } catch {
    return false;
  }
}

function hideToday(): void {
  try {
    localStorage.setItem(HIDDEN_KEY, todayKey());
  } catch {
    // ignore: the card just comes back on reload
  }
}

const colorName = (c: DueRepertoire['color']) => (c === 'w' ? 'White' : 'Black');

/** Play page card: which repertoires have moves due today, each a link to the trainer. "Not today" hides it until tomorrow. */
export function OpeningsDueCard() {
  const { reps: due, today: total } = useOpeningsDue();
  const [hidden, setHidden] = useState(hiddenToday);
  if (!total || hidden) return null;
  return (
    <section data-testid="openings-due" className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Openings to review today</h2>
        <span className="text-xs text-muted">{total} {total === 1 ? 'move' : 'moves'}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {due.map((r) => (
          <li key={r.id}>
            <a
              href="#/openings"
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 hover:outline-1 hover:outline-accent"
              onClick={() => writeSelected(r.id)}
            >
              <span className="min-w-0 truncate">
                {r.name} <span className="text-muted">({colorName(r.color)})</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">A few minutes is enough. Whatever you leave waits for tomorrow, with no penalty.</p>
        <button
          className="shrink-0 text-xs text-muted hover:text-ink hover:underline"
          onClick={() => {
            hideToday();
            setHidden(true);
          }}
        >
          Not today
        </button>
      </div>
    </section>
  );
}

/** The header's count of opening moves due today (nothing when none). */
export function OpeningsDueBadge({ dot = false }: { dot?: boolean }) {
  const total = useOpeningsDue().today;
  if (!total) return null;
  if (dot) return <span data-testid="openings-due-dot" className="inline-block h-2 w-2 rounded-full bg-accent" aria-label="Opening moves due" />;
  return (
    <span data-testid="openings-due-badge" className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-ink" title={`${total} opening moves to review today`}>
      {total}
    </span>
  );
}
