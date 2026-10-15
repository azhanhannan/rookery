// Hand-drawn marks on a board, Lichess style. Right-drag draws an arrow (react-chessboard does that itself; we only
// set its colours), right-click circles a square. Colour by modifier: none green, Shift red, Alt blue, Ctrl yellow.
// Everything clears on the next move (new position) or a left click.
import { useState, type CSSProperties, type MouseEvent } from 'react';
import { usePlaySettings, type PlaySettings } from '../settings/playSettings';

export const MARK_COLORS = {
  green: 'rgba(21, 120, 27, 0.8)',
  red: 'rgba(136, 32, 32, 0.8)',
  blue: 'rgba(0, 48, 136, 0.8)',
  yellow: 'rgba(230, 143, 0, 0.8)',
};

type Modifiers = { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey?: boolean };

/** Lichess's modifier colours (Alt wins over Shift, Shift over Ctrl, Cmd counts as Ctrl). */
export function markColor(m: Modifiers): string {
  if (m.altKey) return MARK_COLORS.blue;
  if (m.shiftKey) return MARK_COLORS.red;
  if (m.ctrlKey || m.metaKey) return MARK_COLORS.yellow;
  return MARK_COLORS.green;
}

/** react-chessboard's arrowOptions with the same colours (its order: alt, shift, ctrl, meta). */
export const ARROW_OPTIONS = {
  colors: {
    default: MARK_COLORS.green,
    shift: MARK_COLORS.red,
    ctrl: MARK_COLORS.yellow,
    alt: MARK_COLORS.blue,
    meta: MARK_COLORS.yellow,
  },
  color: MARK_COLORS.green,
  secondaryColor: MARK_COLORS.red,
  tertiaryColor: MARK_COLORS.yellow,
  arrowLengthReducerDenominator: 8,
  sameTargetArrowLengthReducerDenominator: 4,
  arrowWidthDenominator: 5,
  activeArrowWidthMultiplier: 0.9,
  opacity: 0.65,
  activeOpacity: 0.5,
  arrowStartOffset: 0,
};

/** Toggles a circle on `square`: same colour removes it, another colour recolours it. */
export function toggleCircle(circles: Record<string, string>, square: string, color: string): Record<string, string> {
  const next = { ...circles };
  if (next[square] === color) delete next[square];
  else next[square] = color;
  return next;
}

const ring = (color: string) => `radial-gradient(circle, transparent 66%, ${color} 68%, ${color} 76%, transparent 78%)`;

/**
 * The marks for a board whose position is identified by `positionKey`. Returns square styles for the circles,
 * the extra react-chessboard options, and the board's settings (so Board.tsx reads them with one hook).
 */
export function useBoardMarks(positionKey: string): {
  settings: PlaySettings;
  circleStyles: Record<string, CSSProperties>;
  options: {
    arrowOptions: typeof ARROW_OPTIONS;
    onSquareMouseDown: (args: { square: string }, e: MouseEvent) => void;
    onSquareMouseUp: (args: { square: string }, e: MouseEvent) => void;
  };
} {
  const settings = usePlaySettings();
  const [marks, setMarks] = useState<{ key: string; circles: Record<string, string> }>({ key: positionKey, circles: {} });
  const [rightDown, setRightDown] = useState<string | null>(null);
  const circles = marks.key === positionKey ? marks.circles : {};

  const circleStyles: Record<string, CSSProperties> = {};
  for (const [square, color] of Object.entries(circles)) circleStyles[square] = { backgroundImage: ring(color) };

  return {
    settings,
    circleStyles,
    options: {
      arrowOptions: ARROW_OPTIONS,
      onSquareMouseDown: ({ square }, e) => {
        if (e.button === 0 && Object.keys(circles).length) setMarks({ key: positionKey, circles: {} });
        if (e.button === 2) setRightDown(square);
      },
      onSquareMouseUp: ({ square }, e) => {
        if (e.button !== 2) return;
        if (rightDown === square) setMarks({ key: positionKey, circles: toggleCircle(circles, square, markColor(e)) });
        setRightDown(null);
      },
    },
  };
}

/** Joins background images so a circle, a check glow and a legal-move dot can share one square. */
export function mergeSquareStyles(
  base: Record<string, CSSProperties>,
  extra: Record<string, CSSProperties>,
): Record<string, CSSProperties> {
  const out = { ...base };
  for (const [sq, style] of Object.entries(extra)) {
    const prev = out[sq];
    out[sq] = prev?.backgroundImage
      ? { ...prev, ...style, backgroundImage: `${style.backgroundImage}, ${prev.backgroundImage}` }
      : { ...prev, ...style };
  }
  return out;
}
