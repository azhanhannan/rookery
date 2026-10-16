import type { PlayerInfo } from '../game/types';
import { estimateRating } from '../rating/estimateRating';
import type { MaiaMatch, MaiaMatchPlayer } from '../rating/maiaMatch';
import { MOVE_LABELS, type PlayerSummary } from '../review/types';
import { MoveBadge } from './MoveBadge';

function EstimatedRating({ summary }: { summary: PlayerSummary }) {
  const est = estimateRating(summary);
  return (
    <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-surface-2 pt-2" data-testid="estimated-rating">
      <span className="text-sm text-muted">Game rating</span>
      {est.kind === 'not-enough-moves' ? (
        <span className="text-sm text-muted">Not enough moves to estimate</span>
      ) : (
        <span className="text-right">
          <span className="font-mono font-semibold tabular-nums" data-testid="rating-range">
            {est.low}–{est.high}
          </span>
          {/* SPEC: the placeholder curve must not be presented as accurate. */}
          {!est.calibrated && <span className="block text-[10px] text-muted">rough estimate, not yet calibrated</span>}
        </span>
      )}
    </div>
  );
}

function StyleMatch({ match }: { match: MaiaMatchPlayer }) {
  let text: string;
  if (match.kind === 'not-enough-moves') text = 'Not enough moves';
  else if (match.edge === 'low') text = `${match.high} or below`;
  else if (match.edge === 'high') text = `${match.low} or above`;
  else text = `${match.low}–${match.high}`;
  return (
    <div className="flex items-baseline justify-between gap-2 pt-1" data-testid="style-rating">
      <span className="text-sm text-muted" title="Rating whose Maia model plays most like these moves">Style rating</span>
      <span className="text-right">
        <span className={match.kind === 'estimate' ? 'font-mono font-semibold tabular-nums' : 'text-sm text-muted'} data-testid="style-range">
          {text}
        </span>
        {match.kind === 'estimate' && (
          <span className="block text-[10px] text-muted">
            {Math.round(match.agreement * 100)}% of {match.moves} moves were Maia's top pick
            <span className="block">not yet calibrated</span>
          </span>
        )}
      </span>
    </div>
  );
}

function PlayerCard({
  side,
  player,
  summary,
  match,
  accuracyNote,
}: {
  side: 'White' | 'Black';
  player: PlayerInfo;
  summary: PlayerSummary;
  match?: MaiaMatchPlayer;
  accuracyNote?: string | null;
}) {
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
          {accuracyNote && (
            <div className="text-xs text-muted" data-testid="accuracy-note">
              {accuracyNote}
            </div>
          )}
        </div>
      </div>
      <EstimatedRating summary={summary} />
      {match && <StyleMatch match={match} />}
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
  maiaMatch,
  accuracyNotes,
}: {
  white: PlayerInfo;
  black: PlayerInfo;
  whiteSummary: PlayerSummary;
  blackSummary: PlayerSummary;
  maiaMatch?: MaiaMatch;
  /** A plain line under each accuracy ("Typical for ~600"); Learner and Club styles pass it. */
  accuracyNotes?: { w: string | null; b: string | null };
}) {
  return (
    // Side by side where the cards get a full-width row (sm to lg); stacked on phones and in the desktop sidebar.
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" data-testid="review-summary">
      <PlayerCard side="White" player={white} summary={whiteSummary} match={maiaMatch?.white} accuracyNote={accuracyNotes?.w} />
      <PlayerCard side="Black" player={black} summary={blackSummary} match={maiaMatch?.black} accuracyNote={accuracyNotes?.b} />
    </div>
  );
}
