import { useEffect, useRef } from 'react';
import { scrollWithin } from './scrollWithin';
import type { MoveReview } from '../review/types';
import { MoveBadge } from './MoveBadge';

/** The reviewed moves in two columns, each with its label badge; clicking one selects that ply. */
export function ReviewMoveList({
  moves,
  startFen,
  ply,
  onSelect,
}: {
  moves: MoveReview[];
  startFen: string;
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    scrollWithin(activeRef.current);
  }, [ply]);

  // Same layout rules as the play move list: a game set up with Black to move starts on "1...".
  const blackFirst = startFen.split(' ')[1] === 'b';
  const firstMoveNo = Number(startFen.split(' ')[5]) || 1;
  const cells: (MoveReview | null)[] = [...moves];
  if (blackFirst) cells.unshift(null);
  const rows: { no: number; white: MoveReview | null; black: MoveReview | null }[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push({ no: firstMoveNo + i / 2, white: cells[i], black: cells[i + 1] ?? null });
  }

  const cell = (m: MoveReview | null) =>
    m ? (
      <button
        ref={m.ply === ply ? activeRef : undefined}
        onClick={() => onSelect(m.ply)}
        aria-current={m.ply === ply ? 'true' : undefined}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-0.5 text-left font-mono text-sm ${
          m.ply === ply ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'
        }`}
      >
        <MoveBadge label={m.label} />
        <span className="truncate">{m.san}</span>
      </button>
    ) : (
      <span className="px-2 font-mono text-sm text-muted">…</span>
    );

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg bg-surface p-2 lg:max-h-[20rem]" data-testid="review-move-list">
      <ol className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-y-0.5">
        {rows.map((r) => (
          <li key={r.no} className="contents">
            <span className="py-0.5 pr-1 text-right font-mono text-sm text-muted">{r.no}.</span>
            {cell(r.white)}
            {r.black ? cell(r.black) : <span />}
          </li>
        ))}
      </ol>
    </div>
  );
}
