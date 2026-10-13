import { useEffect, useState } from 'react';
import { levelLabel, suggestNextLevel } from '../bots/botLevels';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { MoveList } from '../components/MoveList';
import { NewGameDialog } from '../components/NewGameDialog';
import { PlayerBar } from '../components/PlayerBar';
import { retryBotMove, startBotTurns, useBotStatus } from '../game/botTurn';
import { useGameStore } from '../game/gameStore';
import { botColor, describeEnd, replay } from '../game/rules';
import { setMuted } from '../game/sound';
import { loadEvalBarPref, saveBotElo, saveEvalBarPref } from '../game/storage';
import type { GameRecord } from '../game/types';
import { useLiveEval } from './useLiveEval';

const MUTE_KEY = 'rookery.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore: preference just won't survive a reload
  }
}

/** The human's result in a finished bot game, or null. */
function humanOutcome(record: GameRecord): 'win' | 'loss' | 'draw' | null {
  const bot = botColor(record);
  if (!bot || record.result === '*') return null;
  if (record.result === '1/2-1/2') return 'draw';
  const botWon = (record.result === '1-0') === (bot === 'w');
  return botWon ? 'loss' : 'win';
}

function downloadPgn(pgn: string, id: string) {
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rookery-${id.slice(0, 8)}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlayPage() {
  const record = useGameStore((s) => s.record);
  const viewPly = useGameStore((s) => s.viewPly);
  const orientation = useGameStore((s) => s.orientation);
  const setup = useGameStore((s) => s.setup);
  const { flip, resign, step, goTo, exportPgn, newGame } = useGameStore.getState();
  const botError = useBotStatus((s) => s.error);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [muted, setMutedState] = useState(readMuted);
  const [copied, setCopied] = useState(false);
  // null = the viewer never chose: on in bot games, off between people.
  const [evalPref, setEvalPref] = useState(loadEvalBarPref);

  // The bot plays its moves while this page is open; leaving it stops the engine.
  useEffect(() => startBotTurns(), []);

  useEffect(() => {
    setMuted(muted);
    writeMuted(muted);
  }, [muted]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        Home: () => goTo(0),
        End: () => goTo(Number.MAX_SAFE_INTEGER),
      };
      const act = actions[e.key];
      if (act) {
        e.preventDefault();
        act();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo]);

  const bot = botColor(record);
  const evalOn = evalPref ?? bot !== null;
  const liveEval = useLiveEval(record, viewPly, evalOn);
  const outcome = humanOutcome(record);
  const botElo = bot ? record[bot === 'w' ? 'white' : 'black'].elo : undefined;
  const next = outcome && botElo !== undefined ? suggestNextLevel(botElo, outcome) : null;

  const ended = describeEnd(record);
  const turn = replay(record).turn();
  const turnName = turn === 'w' ? 'White' : 'Black';
  const live = viewPly === record.moves.length;
  const top = orientation === 'white' ? 'b' : 'w';
  const bottom = orientation === 'white' ? 'w' : 'b';

  const btn =
    'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(exportPgn());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      downloadPgn(exportPgn(), record.id);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,640px)_1fr]">
      <section className="min-w-0">
        <PlayerBar color={top} />
        {evalOn ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.5rem_minmax(0,1fr)] sm:gap-2">
            <EvalBar white={liveEval.white} label={liveEval.label} stale={liveEval.stale} orientation={orientation} />
            <Board />
          </div>
        ) : (
          <Board />
        )}
        <PlayerBar color={bottom} />
      </section>

      <aside className="flex min-w-0 flex-col gap-3">
        <div
          data-testid="status"
          className={`rounded-lg p-3 text-center font-semibold ${ended ? 'bg-accent text-accent-ink' : 'bg-surface'}`}
        >
          {ended ?? `${turnName} to move`}
          {!live && (
            <div className="text-xs font-normal opacity-80">
              Viewing move {viewPly} of {record.moves.length}
            </div>
          )}
        </div>

        {ended && (
          <a
            href={`#/review/${record.id}`}
            className="rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-ink"
            data-testid="game-review-link"
          >
            Game Review
          </a>
        )}

        {botError && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-surface p-3 text-sm text-danger">
            <span>{botError}</span>
            <button className={btn} onClick={retryBotMove}>Retry</button>
          </div>
        )}

        {next && (
          <div data-testid="next-level" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
            <span className="text-sm">
              {outcome === 'win' ? 'Nice win. ' : outcome === 'loss' ? '' : 'A draw. '}
              Suggested next: <strong>Bot {levelLabel(next)}</strong>
            </span>
            <button
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
              onClick={() => {
                saveBotElo(next.elo);
                newGame({ ...setup, opponent: 'bot', botElo: next.elo });
              }}
            >
              Play again at {levelLabel(next)}
            </button>
          </div>
        )}

        <MoveList />

        <div className="grid grid-cols-4 gap-2">
          <button className={btn} onClick={() => goTo(0)} aria-label="First move" disabled={viewPly === 0}>⏮</button>
          <button className={btn} onClick={() => step(-1)} aria-label="Previous move" disabled={viewPly === 0}>◀</button>
          <button className={btn} onClick={() => step(1)} aria-label="Next move" disabled={live}>▶</button>
          <button className={btn} onClick={() => goTo(record.moves.length)} aria-label="Last move" disabled={live}>⏭</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
            onClick={() => setDialogOpen(true)}
          >
            New game
          </button>
          <button className={btn} onClick={flip}>Flip board</button>
          {confirmResign ? (
            <button
              className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                resign();
                setConfirmResign(false);
              }}
              onBlur={() => setConfirmResign(false)}
              autoFocus
            >
              {bot ? 'Confirm: resign' : `Confirm: ${turnName} resigns`}
            </button>
          ) : (
            <button className={btn} onClick={() => setConfirmResign(true)} disabled={!!ended}>
              {bot ? 'Resign' : `Resign (${turnName})`}
            </button>
          )}
          <button className={btn} onClick={() => setMutedState((m) => !m)}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button
            className={`${btn} col-span-2`}
            aria-pressed={evalOn}
            onClick={() => {
              setEvalPref(!evalOn);
              saveEvalBarPref(!evalOn);
            }}
          >
            {evalOn ? 'Eval bar on' : 'Eval bar off'}
          </button>
        </div>
        {evalOn && liveEval.engine === 'loading' && <p className="text-xs text-muted">Engine loading…</p>}
        {evalOn && liveEval.error && (
          <p className="text-xs text-danger" title={liveEval.error}>
            {liveEval.engine === 'error' ? 'Evaluation unavailable: the engine failed to load.' : 'Evaluation failed for this position.'}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button className={btn} onClick={copyPgn}>{copied ? 'Copied' : 'Copy PGN'}</button>
          <button className={btn} onClick={() => downloadPgn(exportPgn(), record.id)}>Download PGN</button>
          <a className={btn} href="#/import">Import PGN</a>
        </div>
      </aside>

      {dialogOpen && <NewGameDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
