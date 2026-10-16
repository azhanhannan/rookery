import { useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { DEFAULT_BOT_ELO, MAIA, RATINGS } from '../config/tunables';
import { findTimeControl, TIME_CONTROLS, UNLIMITED } from '../game/clock';
import { useGameStore } from '../game/gameStore';
import { loadBotElo, loadBotEngine, loadMaiaElo, saveBotElo, saveBotEngine, saveMaiaElo } from '../game/storage';
import type { BotEngine, Opponent, SideChoice } from '../game/types';
import { getMaia, type LoadProgress } from '../maia/MaiaService';
import { loadGameMode, saveGameMode, type GameMode } from '../game/practice';
import { BotPicker } from './BotPicker';

const SIDES: { id: SideChoice; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
];

type MaiaLoad =
  | { state: 'idle' }
  | { state: 'loading'; progress: LoadProgress | null }
  | { state: 'ready' }
  | { state: 'error'; message: string };

const mb = (bytes: number) => Math.round(bytes / 1e6);

function describeLoad(progress: LoadProgress | null): string {
  if (!progress) return 'Downloading human-like bot…';
  if (progress.loaded >= progress.total) return 'Starting human-like bot…';
  return `Downloading human-like bot… ${mb(progress.loaded)} / ${mb(progress.total)} MB`;
}

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
  const setupMaia = setup.botEngine === 'maia';
  const [botEngine, setBotEngine] = useState<BotEngine>(() => loadBotEngine() ?? setup.botEngine ?? 'stockfish');
  const [botElo, setBotElo] = useState<number>(() => loadBotElo() ?? (setupMaia ? undefined : setup.botElo) ?? DEFAULT_BOT_ELO);
  const [maiaElo, setMaiaElo] = useState<number>(() => loadMaiaElo() ?? (setupMaia ? setup.botElo : undefined) ?? MAIA.defaultElo);
  const [maiaLoad, setMaiaLoad] = useState<MaiaLoad>(() => (getMaia().isLoaded() ? { state: 'ready' } : { state: 'idle' }));
  const [side, setSide] = useState<SideChoice>(setup.side);
  // A time control the dialog doesn't list (the Spar button's 10+5) opens as Unlimited, which is what it shows.
  const [tc, setTc] = useState<string>(() =>
    TIME_CONTROLS.some((t) => t.id === setup.timeControlId) ? setup.timeControlId : UNLIMITED,
  );
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  // Bot games are Rated (no help, rated when it qualifies) or Practice (unrated, takebacks and helpers).
  const [mode, setMode] = useState<GameMode>(() => loadGameMode() ?? 'rated');
  const ratedChoice = mode === 'rated';
  const practice = opponent === 'bot' && mode === 'practice';
  const category = categoryName(tc);
  // A rating only changes for timed bot games while signed in.
  const canRate = signedIn && opponent === 'bot' && category !== null;
  const rated = canRate && ratedChoice;

  const humanLike = opponent === 'bot' && botEngine === 'maia';
  const loadingMaia = humanLike && maiaLoad.state === 'loading';

  /** Starts (or joins) the Maia download; resolves true when the model is ready. */
  async function loadMaia(): Promise<boolean> {
    const maia = getMaia();
    if (maia.isLoaded()) {
      setMaiaLoad({ state: 'ready' });
      return true;
    }
    setMaiaLoad({ state: 'loading', progress: null });
    try {
      await maia.load((progress) => setMaiaLoad({ state: 'loading', progress }));
      setMaiaLoad({ state: 'ready' });
      return true;
    } catch (err) {
      setMaiaLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  function chooseEngine(engine: BotEngine) {
    setBotEngine(engine);
    // Fetch the model as soon as Human-like is picked, so Start is usually instant.
    if (engine === 'maia' && maiaLoad.state !== 'loading') void loadMaia();
  }

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

  async function start() {
    if (opponent === 'bot' && botEngine === 'maia') {
      saveBotEngine('maia');
      saveMaiaElo(maiaElo);
      if (!(await loadMaia())) return;
      saveGameMode(mode);
      newGame({ side, timeControlId: tc, opponent, botElo: maiaElo, rated, botEngine: 'maia', ...(practice ? { practice } : {}) });
    } else if (opponent === 'bot') {
      saveBotEngine('stockfish');
      saveBotElo(botElo);
      saveGameMode(mode);
      newGame({ side, timeControlId: tc, opponent, botElo, rated, ...(practice ? { practice } : {}) });
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

        {opponent === 'bot' && (
          <BotPicker
            engine={botEngine}
            onEngineChange={chooseEngine}
            value={botEngine === 'maia' ? maiaElo : botElo}
            onChange={botEngine === 'maia' ? setMaiaElo : setBotElo}
          />
        )}

        {humanLike && maiaLoad.state === 'loading' && (
          <div className="mb-4" data-testid="maia-loading" role="status">
            <p className="mb-1 text-sm">{describeLoad(maiaLoad.progress)}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${maiaLoad.progress ? Math.round((100 * maiaLoad.progress.loaded) / Math.max(1, maiaLoad.progress.total)) : 0}%` }}
              />
            </div>
          </div>
        )}
        {humanLike && maiaLoad.state === 'error' && (
          <div role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="mb-2 text-danger">The human-like bot couldn't load: {maiaLoad.message}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink"
                onClick={() => setBotEngine('stockfish')}
              >
                Use the engine bot instead
              </button>
              <button className="rounded-lg px-3 py-1.5 text-sm text-accent hover:underline" onClick={() => void loadMaia()}>
                Try again
              </button>
            </div>
          </div>
        )}

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

        {opponent === 'bot' && (
          <fieldset className="mb-5" data-testid="game-mode">
            <legend className="mb-2 text-sm text-muted">Game type</legend>
            <div className="grid grid-cols-2 gap-2">
              <button className={pill(mode === 'rated')} aria-pressed={mode === 'rated'} onClick={() => setMode('rated')}>
                Rated
              </button>
              <button className={pill(mode === 'practice')} aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>
                Practice
              </button>
            </div>
            <p className="mt-1 text-xs text-muted" data-testid="game-mode-note">
              {mode === 'practice'
                ? 'Takebacks, hints and threat arrows. Never changes your rating.'
                : rated
                  ? `Changes your ${category} rating. No takebacks or hints.`
                  : !signedIn
                    ? 'No takebacks or hints. Sign in to get a rating.'
                    : 'No takebacks or hints. Untimed games are not rated.'}
            </p>
          </fieldset>
        )}

        <div className="flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            onClick={() => void start()}
            disabled={loadingMaia}
          >
            {loadingMaia ? 'Loading…' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
