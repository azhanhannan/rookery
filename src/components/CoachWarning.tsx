import { useEffect, useRef } from 'react';
import type { CoachWatch } from '../app/useCoachWatch';
import { MascotSays } from './RookMascot';

/** Practice Coach: Rookie's warning about the move just played, with Take it back / Keep playing. The bot waits. */
export function CoachWarning({ coach, onTakeBack }: { coach: CoachWatch; onTakeBack(): void }) {
  const ref = useRef<HTMLElement>(null);
  // On a phone the side column sits below the board: bring the warning into view so the buttons are reachable.
  useEffect(() => {
    if (coach.warning) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [coach.warning]);
  if (!coach.warning) return null;
  const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent';
  return (
    <section ref={ref} data-testid="coach-warning" aria-label="Coach" className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div role="status" aria-live="polite">
        <MascotSays testId="coach-warning-text">{coach.warning}</MascotSays>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink" onClick={onTakeBack} data-testid="coach-takeback">
          Take it back
        </button>
        <button className={btn} onClick={coach.keepPlaying} data-testid="coach-keep-playing">
          Keep playing
        </button>
      </div>
    </section>
  );
}
