// Light self-review: before the engine's verdict, one question. Tap a move or skip; skipping costs nothing.
import { useEffect, useRef, useState } from 'react';
import type { Orientation } from '../game/gameStore';
import type { GameReview, MoveReview } from '../review/types';
import { Board } from './Board';
import { BoardColumn } from './BoardColumn';

const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';

/** Same numbering as the review screen's move panel. */
function title(m: MoveReview) {
  const no = Math.ceil(m.ply / 2);
  return m.color === 'w' ? `${no}. ${m.san}` : `${no}... ${m.san}`;
}

/** Board plus a plain move list (no labels, no numbers). `onDone(ply)` with the pick, or null for Skip. */
export function SelfReviewGate({
  review,
  orientation,
  onDone,
}: {
  review: GameReview;
  orientation: Orientation;
  onDone: (ply: number | null) => void;
}) {
  const [ply, setPly] = useState(0);
  const selected = ply > 0 ? review.moves[ply - 1] : undefined;
  const lastMove = selected ? { from: selected.uci.slice(0, 2), to: selected.uci.slice(2, 4) } : null;
  const listRef = useRef<HTMLOListElement>(null);
  const last = review.moves.length;

  // Same keys as the review screen: ← → step through the moves, Home/End jump to the ends.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      const next: Record<string, (p: number) => number> = {
        ArrowLeft: (p) => p - 1,
        ArrowRight: (p) => p + 1,
        Home: () => 0,
        End: () => last,
      };
      const step = next[e.key];
      if (step) {
        e.preventDefault();
        setPly((p) => Math.max(0, Math.min(last, step(p))));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn board={<Board id="self-review-board" position={review.positions[ply].fen} orientation={orientation} lastMove={lastMove} arrows={[]} />} />
      <aside className="flex min-w-0 flex-col gap-3" data-testid="self-review">
        <div className="rounded-lg bg-surface p-3">
          <h2 className="font-semibold">Where do you think it went wrong?</h2>
          <p className="text-sm text-muted">Tap the move you're least sure about, then see what the engine thinks. ← → step through the moves.</p>
        </div>
        <ol ref={listRef} className="flex max-h-72 flex-wrap gap-1 overflow-y-auto rounded-lg bg-surface p-2 font-mono text-sm">
          {review.moves.map((m) => (
            <li key={m.ply}>
              <button
                className={`rounded px-1.5 py-0.5 ${m.ply === ply ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
                aria-pressed={m.ply === ply}
                onClick={() => setPly(m.ply)}
              >
                {title(m)}
              </button>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <button className={primary} disabled={!selected} onClick={() => onDone(ply)}>
            {selected ? `It was ${title(selected)}` : 'Tap a move'}
          </button>
          <button className={btn} onClick={() => onDone(null)}>Skip</button>
        </div>
      </aside>
    </div>
  );
}
