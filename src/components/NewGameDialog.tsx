import { useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { DEFAULT_BOT_ELO, RATINGS } from '../config/tunables';
import { findTimeControl, TIME_CONTROLS, UNLIMITED } from '../game/clock';
import { useGameStore } from '../game/gameStore';
import { loadBotElo, saveBotElo } from '../game/storage';
import type { Opponent, SideChoice } from '../game/types';
import { BotPicker } from './BotPicker';

const SIDES: { id: SideChoice; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
];

/** Rating category of a time control, by estimated duration (base + 40 x increment). */
function categoryName(timeControlId: string): string | null {
  const tc = findTimeControl(timeControlId);
  if (!tc) return null;
  const seconds = (tc.baseMs + 40 * tc.incMs) / 1000;
  return RATINGS.categories.find((c) => seconds <= c.maxSeconds)?.id ?? null;
}

export function NewGameDialog({ onClose }: { onClose: () => void }) {
  const newGame = useGameStore((s) => s.newGame);
  // Opens on the choices the current game was started with; Friend stays the first-run default.
  const setup = useGameStore((s) => s.setup);
  const [opponent, setOpponent] = useState<Opponent>(setup.opponent ?? 'friend');
  const [botElo, setBotElo] = useState<number>(() => loadBotElo() ?? setup.botElo ?? DEFAULT_BOT_ELO);
  const [side, setSide] = useState<SideChoice>(setup.side);
  const [tc, setTc] = useState<string>(setup.timeControlId);
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const [ratedChoice, setRatedChoice] = useState(true);
  const category = categoryName(tc);
  // Rated is only offered for timed bot games while signed in; hidden means unrated.
  const canRate = signedIn && opponent === 'bot' && category !== null;
  const rated = canRate && ratedChoice;

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

  function start() {
    if (opponent === 'bot') {
      saveBotElo(botElo);
      newGame({ side, timeControlId: tc, opponent, botElo, rated });
    } else {
      newGame({ side, timeControlId: tc, opponent });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="New game"
        className="max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">New game</h2>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-muted">Opponent</legend>
          <div className="grid grid-cols-2 gap-2">
            <button className={pill(opponent === 'friend')} aria-pressed={opponent === 'friend'} onClick={() => setOpponent('friend')}>
              Friend, same screen
            </button>
            <button className={pill(opponent === 'bot')} aria-pressed={opponent === 'bot'} onClick={() => setOpponent('bot')}>
              Bot
            </button>
          </div>
        </fieldset>

        {opponent === 'bot' && <BotPicker value={botElo} onChange={setBotElo} />}

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-muted">{opponent === 'bot' ? 'You play' : 'Player 1 plays'}</legend>
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
            <button className={pill(!TIME_CONTROLS.some((t) => t.id === tc))} onClick={() => setTc(UNLIMITED)}>
              Unlimited
            </button>
          </div>
        </fieldset>

        {canRate && (
          <div className="mb-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={ratedChoice}
                onChange={(e) => setRatedChoice(e.target.checked)}
              />
              Rated
            </label>
            <p className="mt-1 pl-6 text-xs text-muted">
              {rated ? `Changes your ${category} rating.` : 'Saved to your account, rating unchanged.'}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink" onClick={start}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
