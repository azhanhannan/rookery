// "Why?" for one move in Review (src/review/why.ts): a button, and the compact panel it opens. Three sections,
// each only when it has something proven to say: what the engine line shows happens next, what the engine's
// move achieves instead, and what changed in the position (facts, not blame). A sentence with a line gets
// "▶ Show", which plays that line on the review board when it starts from the position before or after the move.
import { useMemo } from 'react';
import type { ReviewStyle } from '../review/reviewStyle';
import type { GameReview } from '../review/types';
import { explainMove, lineBaseFor, type WhySentence } from '../review/why';

const btn =
  'rounded-lg bg-surface-2 px-3 py-1.5 text-center text-sm font-medium hover:outline-1 hover:outline-accent';

export const WHY_EMPTY = "Nothing more to add than the engine's numbers here.";

/** The "Why?" button plus, when open, its panel, for review.moves[ply - 1]. */
export function WhySection({
  review,
  ply,
  style,
  open,
  onToggle,
  onShowLine,
}: {
  review: GameReview;
  ply: number;
  style: ReviewStyle;
  open: boolean;
  onToggle: () => void;
  /** Play `line` on the board from positions[base] (`movePly` = the move this panel explains). */
  onShowLine: (base: number, line: string[], movePly: number) => void;
}) {
  return (
    <>
      <button className={`${btn} self-start`} aria-expanded={open} onClick={onToggle} title="Why? (W)" data-testid="why-button">
        Why?
      </button>
      {open && <WhyPanel review={review} ply={ply} style={style} onShowLine={onShowLine} onClose={onToggle} />}
    </>
  );
}

function WhyPanel({
  review,
  ply,
  style,
  onShowLine,
  onClose,
}: {
  review: GameReview;
  ply: number;
  style: ReviewStyle;
  onShowLine: (base: number, line: string[], movePly: number) => void;
  onClose: () => void;
}) {
  const why = useMemo(() => explainMove(review, ply, style), [review, ply, style]);
  const sections: { title: string; items: WhySentence[]; note?: string; id: string }[] = [
    { id: 'played', title: 'What happens next', items: why.story.played },
    { id: 'better', title: 'What the engine wanted', items: why.story.better },
    {
      id: 'changes',
      title: 'What changed',
      items: why.changes,
      note: style === 'learner' ? undefined : 'Facts about the position, not necessarily the reason.',
    },
  ].filter((s) => s.items.length > 0);

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm" data-testid="why-panel" aria-label="Why?">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Why?</h3>
        <button className="text-muted hover:text-ink" onClick={onClose} aria-label="Close Why?" title="Close (W)">
          ✕
        </button>
      </div>
      {sections.length === 0 ? (
        <p className="text-muted" data-testid="why-empty">{WHY_EMPTY}</p>
      ) : (
        sections.map((s) => (
          <div key={s.id} className="flex flex-col gap-1" data-testid={`why-${s.id}`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</h4>
            {s.note && <p className="text-xs text-muted">{s.note}</p>}
            <ul className="flex flex-col gap-1">
              {s.items.map((item, i) => {
                const base = lineBaseFor(review, ply, item);
                return (
                  <li key={i} className="flex items-start justify-between gap-2" data-kind={item.kind}>
                    <span>{item.text}</span>
                    {base !== null && (
                      <button
                        className="shrink-0 rounded-md bg-surface px-2 py-0.5 text-xs font-medium hover:outline-1 hover:outline-accent"
                        onClick={() => onShowLine(base, item.line!, ply)}
                        data-testid="why-show"
                      >
                        ▶ Show
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
