import { useState } from 'react';
import { TIME_CONTROLS, UNLIMITED } from '../game/clock';
import { useGameStore, type SideChoice } from '../game/gameStore';

const SIDES: { id: SideChoice; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
];

export function NewGameDialog({ onClose }: { onClose: () => void }) {
  const newGame = useGameStore((s) => s.newGame);
  const [side, setSide] = useState<SideChoice>('w');
  const [tc, setTc] = useState<string>(UNLIMITED);

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="New game"
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">New game</h2>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-muted">Opponent</legend>
          <div className="grid grid-cols-2 gap-2">
            <button className={pill(true)}>Friend, same screen</button>
            <button className={`${pill(false)} cursor-not-allowed opacity-50`} disabled title="Bots arrive in Phase 2">
              Bot (soon)
            </button>
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-muted">Player 1 plays</legend>
          <div className="grid grid-cols-3 gap-2">
            {SIDES.map((s) => (
              <button key={s.id} className={pill(side === s.id)} onClick={() => setSide(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-5">
          <legend className="mb-2 text-sm text-muted">Time control (minutes + seconds per move)</legend>
          <div className="grid grid-cols-3 gap-2">
            {TIME_CONTROLS.map((t) => (
              <button key={t.id} className={pill(tc === t.id)} onClick={() => setTc(t.id)}>
                {t.label}
              </button>
            ))}
            <button className={pill(tc === UNLIMITED)} onClick={() => setTc(UNLIMITED)}>
              Unlimited
            </button>
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
            onClick={() => {
              newGame({ side, timeControlId: tc });
              onClose();
            }}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
