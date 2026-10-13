import type { PlayerInfo } from '../game/types';
import { MOVE_LABELS, type PlayerSummary } from '../review/types';
import { MoveBadge } from './MoveBadge';

function PlayerCard({ side, player, summary }: { side: 'White' | 'Black'; player: PlayerInfo; summary: PlayerSummary }) {
  return (
    <section className="min-w-0 rounded-lg bg-surface p-3" data-testid={`summary-${side.toLowerCase()}`} aria-label={`${side} summary`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold">
          <span
            className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-muted ${side === 'White' ? 'bg-neutral-100' : 'bg-neutral-800'}`}
            aria-hidden
          />
          {player.name}
        </h3>
        <div className="text-right">
          <div className="font-mono text-xl font-bold" data-testid="accuracy">
            {summary.accuracy === null ? '–' : summary.accuracy.toFixed(1)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Accuracy</div>
        </div>
      </div>
      {/* Phase 4 slot: estimated game rating (Feature 4). Deliberately renders nothing until then. */}
      <div data-slot="estimated-rating" />
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {MOVE_LABELS.map((label) => (
          <li key={label} className={`flex items-center gap-1.5 ${summary.counts[label] ? '' : 'opacity-45'}`}>
            <MoveBadge label={label} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="font-mono tabular-nums" data-testid={`count-${label}`}>{summary.counts[label] ?? 0}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Accuracy and label counts for both players. */
export function ReviewSummary({
  white,
  black,
  whiteSummary,
  blackSummary,
}: {
  white: PlayerInfo;
  black: PlayerInfo;
  whiteSummary: PlayerSummary;
  blackSummary: PlayerSummary;
}) {
  return (
    // Side by side where the cards get a full-width row (sm to lg); stacked on phones and in the desktop sidebar.
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" data-testid="review-summary">
      <PlayerCard side="White" player={white} summary={whiteSummary} />
      <PlayerCard side="Black" player={black} summary={blackSummary} />
    </div>
  );
}
