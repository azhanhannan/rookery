import { useEffect, useState } from 'react';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { NewGameDialog } from '../components/NewGameDialog';
import { PlayerBar } from '../components/PlayerBar';
import { useGameStore } from '../game/gameStore';
import { describeEnd, replay } from '../game/rules';
import { setMuted } from '../game/sound';

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
  const { flip, resign, step, goTo, exportPgn } = useGameStore.getState();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [muted, setMutedState] = useState(readMuted);
  const [copied, setCopied] = useState(false);

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
        <Board />
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
              Confirm: {turnName} resigns
            </button>
          ) : (
            <button className={btn} onClick={() => setConfirmResign(true)} disabled={!!ended}>
              Resign ({turnName})
            </button>
          )}
          <button className={btn} onClick={() => setMutedState((m) => !m)}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
        </div>

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
