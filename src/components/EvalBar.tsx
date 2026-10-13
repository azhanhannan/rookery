import type { CSSProperties } from 'react';
import type { Score } from '../engine/types';
import type { Orientation } from '../game/gameStore';
import { formatScore } from '../review/winChance';

/**
 * White's share of the bar is its win chance. Vertical beside the board from `sm` up; a thin
 * horizontal bar above it on phones, where a vertical one would squeeze the board.
 * White's end follows the board: bottom (or left) when White is at the bottom.
 */
export function EvalBar({
  white,
  score,
  label = score ? formatScore(score) : '',
  stale = false,
  orientation,
}: {
  /** White's win chance, 0-100. */
  white: number;
  /** Shown as the label ("+1.3", "M3") when no `label` is given. */
  score?: Score;
  label?: string;
  stale?: boolean;
  orientation: Orientation;
}) {
  const whiteNear = orientation === 'white'; // White's end is the bottom/left one
  const whiteAhead = white >= 50;
  // The label sits at the leading side's end, in that side's ink.
  const labelAtNear = whiteAhead === whiteNear;

  return (
    <div
      data-testid="eval-bar"
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={`${label} (White ${Math.round(white)}%)`}
      className={`relative flex h-4 overflow-hidden rounded bg-neutral-800 sm:h-auto ${
        whiteNear ? 'flex-row sm:flex-col-reverse' : 'flex-row-reverse sm:flex-col'
      } ${stale ? 'opacity-60' : ''}`}
      style={{ '--white-share': `${white}%` } as CSSProperties}
    >
      <div className="h-full w-(--white-share) bg-neutral-100 transition-all duration-300 sm:h-(--white-share) sm:w-full" />
      <span
        className={`absolute font-mono text-[10px] leading-4 sm:text-[9px] font-semibold ${
          whiteAhead ? 'text-neutral-800' : 'text-neutral-100'
        } ${
          labelAtNear
            ? 'left-1 sm:top-auto sm:bottom-1 sm:left-0 sm:w-full sm:text-center'
            : 'right-1 sm:top-1 sm:right-0 sm:w-full sm:text-center'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
