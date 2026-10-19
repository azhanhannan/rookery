// The coach walkthrough panel: Rookie reads the steps of `coachScript` one at a time, with Back / Next,
// "Find the better move" (Retry on that one move), "Show me" (the engine line), "Why?" on a weak key move
// (src/components/WhyPanel.tsx, drawn by the review screen) and "Train this" at the end.
// While it is open, ← / → move between steps and Escape closes it, ahead of the review screen's own keys.
import { useEffect, type ReactNode } from 'react';
import { trainHref } from '../app/deepLinks';
import { trainLabel } from '../app/insights/wording';
import type { CoachStep } from '../review/coachScript';
import { RookMascot } from './RookMascot';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-ink disabled:opacity-40';

export function CoachWalkthrough({
  steps,
  index,
  onIndex,
  onExit,
  onRetry,
  onShowLine,
  why,
}: {
  steps: CoachStep[];
  index: number;
  onIndex: (i: number) => void;
  onExit: () => void;
  /** Retry just this move; the index is into the review screen's retry candidates. */
  onRetry: (retryIndex: number) => void;
  /** Play the engine line from this position. */
  onShowLine: (base: number) => void;
  /** The "Why?" button and panel for this step's move, when it offers one. */
  why?: ReactNode;
}) {
  const step = steps[index];
  const first = index === 0;
  const last = index === steps.length - 1;

  // Capture phase on window: runs before the review screen's arrow keys (bubble phase) and stops them.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      // A dialog on top (the "?" sheet) keeps its own Escape.
      if (document.querySelector('[role="dialog"]')) return;
      const act: Record<string, (() => void) | undefined> = {
        ArrowRight: last ? undefined : () => onIndex(index + 1),
        ArrowLeft: first ? undefined : () => onIndex(index - 1),
        Escape: onExit,
      };
      if (!(e.key in act)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      act[e.key]?.();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, first, last, onIndex, onExit]);

  if (!step) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="coach-walkthrough" aria-label="Coach walkthrough">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold" data-testid="coach-title">{step.title}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted" data-testid="coach-progress">
            {index + 1} / {steps.length}
          </span>
          <button className="text-muted hover:text-ink" onClick={onExit} aria-label="Close walkthrough" title="Close (Esc)">
            ✕
          </button>
        </span>
      </div>
      <div className="flex items-end gap-2">
        <RookMascot />
        <div className="flex flex-1 flex-col gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
          {step.lines.map((l, i) => (
            <p key={i} data-testid="coach-line">{l}</p>
          ))}
        </div>
      </div>
      {(step.kind === 'moment' || step.train) && (
        <div className="flex flex-wrap gap-2">
          {step.kind === 'moment' && step.retryIndex !== undefined && (
            <button className={btn} onClick={() => onRetry(step.retryIndex!)}>Find the better move</button>
          )}
          {step.kind === 'moment' && step.lineBase !== undefined && (
            <button className={btn} onClick={() => onShowLine(step.lineBase!)}>Show me</button>
          )}
          {step.train && (
            <a className={primary} href={trainHref(step.train)} data-testid="coach-train">
              Train this: {trainLabel(step.train)}
            </a>
          )}
        </div>
      )}
      {step.kind === 'moment' && why}
      <div className="grid grid-cols-2 gap-2">
        <button className={btn} disabled={first} onClick={() => onIndex(index - 1)} title="Back (←)">
          Back
        </button>
        {last ? (
          <button className={primary} onClick={onExit}>Done</button>
        ) : (
          <button className={primary} onClick={() => onIndex(index + 1)} title="Next (→)">
            Next
          </button>
        )}
      </div>
    </section>
  );
}
