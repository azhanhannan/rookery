import type { ReactNode } from 'react';
import { useFocusMode } from '../app/focusMode';

/**
 * The board column of Play, Review and Puzzles: the board plus the name bars above and below, sized so all of it
 * fits the window height on tablets and desktops (no scrolling to see the whole board) and centred. Sizes in
 * index.css (.board-column). `evalBar` sits beside the board from the sm breakpoint.
 */
export function BoardColumn({
  top,
  bottom,
  evalBar,
  board,
  children,
  bars = true,
  controlsBelow = false,
}: {
  top?: ReactNode;
  bottom?: ReactNode;
  evalBar?: ReactNode;
  board: ReactNode;
  /** Shown under the board (controls, graph); may scroll. */
  children?: ReactNode;
  /** false when there are no name bars (Puzzles), so the board can take their height too. */
  bars?: boolean;
  /** A row of buttons right under the board that should stay on screen too (Review's move buttons). */
  controlsBelow?: boolean;
}) {
  return (
    <section className="board-column flex min-w-0 flex-col gap-3" data-eval={evalBar ? '' : undefined} data-bars={bars ? '' : undefined}
      data-controls={controlsBelow ? '' : undefined}
    >
      <div>
        {top}
        {evalBar ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.5rem_minmax(0,1fr)] sm:gap-2">
            {evalBar}
            {board}
          </div>
        ) : (
          board
        )}
        {bottom}
      </div>
      {children}
    </section>
  );
}

/** Toggles full screen; shown with the board controls. */
export function FullscreenButton({ className, withText = false }: { className: string; withText?: boolean }) {
  const on = useFocusMode((s) => s.on);
  const toggle = useFocusMode((s) => s.toggle);
  return (
    <button className={className} onClick={toggle} aria-pressed={on} aria-label={on ? 'Exit full screen' : 'Full screen'} title={on ? 'Exit full screen (Esc)' : 'Full screen (F)'}>
      {on ? '⤡' : '⛶'}
      {withText && <span className="ml-1.5">{on ? 'Exit full screen' : 'Full screen'}</span>}
    </button>
  );
}
