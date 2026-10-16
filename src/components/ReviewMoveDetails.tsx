// The selected move in the review panel, drawn per review style (Learner / Club / Analyst).
import { useMemo } from 'react';
import { captionForMove } from '../review/captions';
import { analystEval, evalChange, nagFor, plainLine, QUIET_LABELS, tierOf, type ReviewStyle } from '../review/reviewStyle';
import type { GameReview, MoveReview } from '../review/types';
import { saveReviewPrefs, type ReviewPrefs } from '../settings/reviewPrefs';
import { MoveBadge } from './MoveBadge';
import { TierBadge } from './ReviewStyleParts';
import { MascotSays } from './RookMascot';

function moveTitle(m: MoveReview) {
  const no = Math.ceil(m.ply / 2);
  return m.color === 'w' ? `${no}. ${m.san}` : `${no}... ${m.san}`;
}

const toggle = (on: boolean) =>
  `rounded-md px-2 py-0.5 text-xs font-medium ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-ink'}`;

export function ReviewMoveDetails({
  style,
  review,
  move,
  prefs,
}: {
  style: ReviewStyle;
  review: GameReview;
  move: MoveReview;
  prefs: ReviewPrefs;
}) {
  const cap = useMemo(() => captionForMove(review, move.ply), [review, move.ply]);
  const before = review.positions[move.ply - 1];
  const after = review.positions[move.ply];
  const change = evalChange(before, after);
  const playedBest = !move.bestSan || move.bestMove === move.uci;
  const weak = tierOf(move.label) !== 'good';

  if (style === 'learner') {
    return (
      <>
        <div className="flex items-center gap-2">
          <TierBadge label={move.label} size="md" />
          <span className="font-mono font-semibold">{moveTitle(move)}</span>
          {QUIET_LABELS.has(move.label) && <span className="text-xs text-muted">{move.label}</span>}
        </div>
        {cap && prefs.coachMascot ? <MascotSays testId="caption">{cap}</MascotSays> : <p className="text-sm" data-testid="caption">{cap ?? plainLine(move)}</p>}
        {cap && weak && move.bestSan && !playedBest && <p className="text-sm">{move.bestSan} was better.</p>}
        <button
          className="self-start text-xs text-muted underline hover:text-ink"
          aria-expanded={prefs.learnerDetails}
          onClick={() => saveReviewPrefs({ learnerDetails: !prefs.learnerDetails })}
        >
          {prefs.learnerDetails ? 'Hide details' : 'Show details'}
        </button>
        {prefs.learnerDetails && (
          <div className="flex flex-col gap-1 rounded bg-surface-2 p-2 text-xs" data-testid="learner-details">
            <span>
              <span data-testid="move-label">{move.label}</span>
              {change && <span className="ml-2 font-mono" data-testid="eval-change">{change}</span>}
            </span>
            <span data-testid="explanation">{move.explanation}</span>
          </div>
        )}
      </>
    );
  }

  if (style === 'analyst') {
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono font-semibold">
            {moveTitle(move)}
            {nagFor(move.label)}
          </span>
          <span className="font-mono text-sm" data-testid="analyst-eval">
            {analystEval(before, review.depth)} → {analystEval(after, review.depth)}
          </span>
        </div>
        {!playedBest && (
          <p className="font-mono text-sm text-muted">
            Best: {move.bestSan} ({analystEval(before, review.depth).split(' ')[0]})
          </p>
        )}
        <div className="flex items-center gap-2">
          <button className={toggle(prefs.analystCaptions)} aria-pressed={prefs.analystCaptions} onClick={() => saveReviewPrefs({ analystCaptions: !prefs.analystCaptions })}>
            Captions
          </button>
        </div>
        {prefs.analystCaptions && (
          <>
            {cap && (prefs.coachMascot ? <MascotSays testId="caption">{cap}</MascotSays> : <p className="text-sm" data-testid="caption">{cap}</p>)}
            <p className="text-sm text-muted" data-testid="explanation">{move.explanation}</p>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MoveBadge label={move.label} size="md" />
        <span className="font-mono font-semibold">{moveTitle(move)}</span>
        <span className="text-sm text-muted" data-testid="move-label">{move.label}</span>
        {change && <span className="ml-auto font-mono text-xs text-muted" data-testid="eval-change">{change}</span>}
      </div>
      {cap && (prefs.coachMascot ? <MascotSays testId="caption">{cap}</MascotSays> : <p className="text-sm font-medium" data-testid="caption">{cap}</p>)}
      <p className="text-sm" data-testid="explanation">{move.explanation}</p>
    </>
  );
}

/** The two arrow switches, shown under the move details. */
export function ArrowToggles({ prefs }: { prefs: ReviewPrefs }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="arrow-toggles">
      <span className="text-muted">Arrows:</span>
      <button className={toggle(prefs.threatArrow)} aria-pressed={prefs.threatArrow} onClick={() => saveReviewPrefs({ threatArrow: !prefs.threatArrow })}>
        <span aria-hidden style={{ color: prefs.threatArrow ? undefined : '#c7362b' }}>●</span> Threat
      </button>
      <button className={toggle(prefs.betterArrow)} aria-pressed={prefs.betterArrow} onClick={() => saveReviewPrefs({ betterArrow: !prefs.betterArrow })}>
        <span aria-hidden style={{ color: prefs.betterArrow ? undefined : '#4f9a2c' }}>●</span> Better move
      </button>
    </div>
  );
}
