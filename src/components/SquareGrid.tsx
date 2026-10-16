import type { CSSProperties, ReactNode } from 'react';
import { FILES } from '../drills/squareDrill';

/**
 * A plain clickable board without pieces or coordinates, in the board theme's colours: the square drill and
 * calculation mode (where the pieces are hidden). `content` can put something on a square (a faded piece,
 * a move number).
 */
export function SquareGrid({
  orientation,
  onSquare,
  squareStyles,
  content,
  disabled = false,
  testId = 'square-grid',
  label,
  nameSquares = false,
}: {
  orientation: 'white' | 'black';
  onSquare: (square: string) => void;
  squareStyles?: Record<string, CSSProperties>;
  content?: Record<string, ReactNode>;
  disabled?: boolean;
  testId?: string;
  /** Accessible name for the board. */
  label: string;
  /** Give each square its name for screen readers (off in the drill, where the name is the answer). */
  nameSquares?: boolean;
}) {
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? [...FILES] : [...FILES].reverse();
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className="grid aspect-square w-full touch-manipulation grid-cols-8 grid-rows-8 overflow-hidden rounded-lg select-none"
      style={{ backgroundImage: 'var(--board-image, none)', backgroundSize: '100% 100%' }}
    >
      {ranks.flatMap((r) =>
        files.map((f) => {
          const sq = `${f}${r}`;
          const light = (FILES.indexOf(f as (typeof FILES)[number]) + r) % 2 === 0;
          return (
            <button
              key={sq}
              type="button"
              data-square={sq}
              aria-label={nameSquares ? sq : undefined}
              disabled={disabled}
              onClick={() => onSquare(sq)}
              className="relative flex items-center justify-center text-[min(5vw,1.75rem)] leading-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent"
              style={{
                backgroundColor: light
                  ? 'var(--board-square-light, var(--board-light))'
                  : 'var(--board-square-dark, var(--board-dark))',
                ...squareStyles?.[sq],
              }}
            >
              {content?.[sq]}
            </button>
          );
        }),
      )}
    </div>
  );
}
