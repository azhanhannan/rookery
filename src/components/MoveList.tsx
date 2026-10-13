import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/gameStore';

export function MoveList() {
  const record = useGameStore((s) => s.record);
  const viewPly = useGameStore((s) => s.viewPly);
  const goTo = useGameStore((s) => s.goTo);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [viewPly]);

  // A game set up with Black to move starts its list on "1...".
  const blackFirst = record.startFen.split(' ')[1] === 'b';
  const firstMoveNo = Number(record.startFen.split(' ')[5]) || 1;
  const cells: ({ san: string; ply: number } | null)[] = record.moves.map((m, i) => ({ san: m.san, ply: i + 1 }));
  if (blackFirst) cells.unshift(null);
  const rows: { no: number; white: (typeof cells)[number]; black: (typeof cells)[number] }[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push({ no: firstMoveNo + i / 2, white: cells[i], black: cells[i + 1] ?? null });
  }

  const cell = (c: (typeof cells)[number]) =>
    c ? (
      <button
        ref={c.ply === viewPly ? activeRef : undefined}
        onClick={() => goTo(c.ply)}
        className={`w-full rounded px-2 py-0.5 text-left font-mono text-sm ${
          c.ply === viewPly ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'
        }`}
      >
        {c.san}
      </button>
    ) : (
      <span className="px-2 font-mono text-sm text-muted">…</span>
    );

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg bg-surface p-2 lg:max-h-[26rem]" data-testid="move-list">
      {rows.length === 0 ? (
        <p className="p-2 text-sm text-muted">No moves yet.</p>
      ) : (
        <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5">
          {rows.map((r) => (
            <li key={r.no} className="contents">
              <span className="py-0.5 pr-1 text-right font-mono text-sm text-muted">{r.no}.</span>
              {cell(r.white)}
              {r.black ? cell(r.black) : <span />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
