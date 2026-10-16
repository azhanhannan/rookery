import type { PuzzleMode } from '../puzzles/puzzleStore';

const MODES: { mode: PuzzleMode; label: string }[] = [
  { mode: 'rated', label: 'Rated' },
  { mode: 'mistakes', label: 'My mistakes' },
  { mode: 'daily', label: 'Daily' },
  { mode: 'timed', label: 'Timed' },
];

/** Rated / My mistakes (with the due count) / Daily / Timed. */
export function PuzzleModeBar({ mode, due, onMode }: { mode: PuzzleMode; due: number; onMode: (m: PuzzleMode) => void }) {
  return (
    <div role="tablist" aria-label="Puzzle mode" className="grid grid-cols-4 gap-1 rounded-lg bg-surface p-1">
      {MODES.map((m) => (
        <button
          key={m.mode}
          role="tab"
          aria-selected={mode === m.mode}
          data-testid={`puzzle-mode-${m.mode}`}
          className={`rounded-md px-2 py-1.5 text-sm font-medium ${mode === m.mode ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
          onClick={() => onMode(m.mode)}
        >
          {m.label}
          {m.mode === 'mistakes' && due > 0 && (
            <span data-testid="mistakes-due" className="ml-1 tabular-nums">
              ({due})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
