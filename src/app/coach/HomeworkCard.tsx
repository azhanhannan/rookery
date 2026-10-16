import { useCoachBadge } from '../../coach/coachStore';

/** On the puzzles page: a nudge when a coach has set homework that isn't finished. */
export function HomeworkCard() {
  const open = useCoachBadge((s) => s.homeworkOpen);
  if (open === 0) return null;
  return (
    <a
      href="#/coach"
      data-testid="homework-card"
      className="flex items-center gap-2 rounded-lg bg-surface p-3 text-sm hover:outline-1 hover:outline-accent"
    >
      <span className="font-semibold">Homework from your coach</span>
      <span className="text-muted">
        {open} set{open === 1 ? '' : 's'} to do
      </span>
      <span className="ml-auto text-accent">Open →</span>
    </a>
  );
}
