import { useEffect, useState } from 'react';
import { describeRatingChange } from '../account/syncStore';
import type { RatingChange } from '../api/types';
import { POLISH } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import type { GameRecord } from '../game/types';
import { prefersReducedMotion, usePlaySettings } from '../settings/playSettings';
import { countUpValue } from './countUp';

// Games that finished while the app was open: only these celebrate (a reload of a finished game stays quiet).
const justEnded = new Set<string>();
const celebrated = new Set<string>();
useGameStore.subscribe((s, prev) => {
  if (s.record.id === prev.record.id && prev.record.result === '*' && s.record.result !== '*') justEnded.add(s.record.id);
});

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  return { dx: Math.round(Math.cos(angle) * 70), dy: Math.round(Math.sin(angle) * 34), hue: (i * 47) % 360, delay: (i % 4) * 40 };
});

/** Rating change, counting up from 0 on a fresh win. */
function RatingLine({ change, animate }: { change: RatingChange; animate: boolean }) {
  const [counted, setShown] = useState(0);
  const shown = animate ? counted : change.delta;
  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const v = countUpValue(change.delta, now - start, POLISH.celebrationMs);
      setShown(v);
      if (v !== change.delta) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, change.delta]);
  return (
    <div data-testid="rating-change" className="rounded-lg bg-surface p-3 text-center text-sm font-semibold tabular-nums">
      {describeRatingChange({ ...change, after: change.before + shown, delta: shown })}
    </div>
  );
}

/**
 * Play's end of game: a win gets a short, skippable celebration and the rating counting up; a loss or draw gets
 * a kind word and a prominent "Review this game". Ratings are left out while "Hide ratings" is on.
 */
export function EndScreen({
  record,
  outcome,
  rating,
}: {
  record: GameRecord;
  /** The human's result against a bot; null between two people. */
  outcome: 'win' | 'loss' | 'draw' | null;
  rating?: RatingChange;
}) {
  const { hideRating } = usePlaySettings();
  const [celebrate, setCelebrate] = useState(
    () => outcome === 'win' && justEnded.has(record.id) && !celebrated.has(record.id) && !prefersReducedMotion(),
  );
  // The count-up runs once per game, when the rating first arrives after a fresh win.
  const [countUp] = useState(() => celebrate);

  useEffect(() => {
    if (!celebrate) return;
    celebrated.add(record.id);
    const t = setTimeout(() => setCelebrate(false), POLISH.celebrationMs);
    const skip = () => setCelebrate(false);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [celebrate, record.id]);

  const kind = outcome === 'loss' || outcome === 'draw';

  return (
    <>
      {outcome && (
        <div
          data-testid="end-message"
          className="relative overflow-hidden rounded-lg bg-surface p-3 text-center text-sm"
          onClick={() => setCelebrate(false)}
        >
          {outcome === 'win' ? (
            <span className="font-semibold">You won. Well played!</span>
          ) : outcome === 'draw' ? (
            <span>Good fight: a draw. The review shows where it could have tipped.</span>
          ) : (
            <span>Good fight. Every loss has a lesson in it, so have a look.</span>
          )}
          {celebrate && (
            <span aria-hidden data-testid="celebration" className="pointer-events-none absolute inset-0">
              <style>{`@keyframes rookery-burst{0%{transform:translate(-50%,-50%) scale(.4);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1);opacity:0}}`}</style>
              {PARTICLES.map((p, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
                  style={
                    {
                      background: `hsl(${p.hue} 70% 55%)`,
                      '--dx': `${p.dx}px`,
                      '--dy': `${p.dy}px`,
                      animation: `rookery-burst ${POLISH.celebrationMs - p.delay}ms ease-out ${p.delay}ms both`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          )}
        </div>
      )}

      <a
        href={`#/review/${record.id}`}
        className={`rounded-lg bg-accent px-3 text-center font-semibold text-accent-ink ${kind ? 'py-3 text-base' : 'py-2 text-sm'}`}
        data-testid="game-review-link"
      >
        {kind ? 'Review this game' : 'Game Review'}
      </a>

      {rating && !hideRating && <RatingLine change={rating} animate={countUp} />}
    </>
  );
}
