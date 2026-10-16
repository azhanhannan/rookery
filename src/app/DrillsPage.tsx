import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SquareGrid } from '../components/SquareGrid';
import { EXTRAS } from '../config/tunables';
import {
  accuracy,
  answer,
  loadBests,
  saveBests,
  startRun,
  updateBests,
  type DrillBests,
  type DrillOrientation,
  type DrillRun,
  type DrillSide,
} from '../drills/squareDrill';
import { logTraining } from '../training/trainingLog';

const RIGHT = 'rgba(76, 175, 80, 0.75)';
const WRONG = 'rgba(214, 48, 32, 0.7)';

const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent';
const chip = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

const SIDES: { id: DrillOrientation; name: string }[] = [
  { id: 'white', name: 'White side' },
  { id: 'black', name: 'Black side' },
  { id: 'random', name: 'Surprise me' },
];

type Flash = { styles: Record<string, CSSProperties>; until: number };
type Result = { score: number; misses: number; side: DrillSide; isBest: boolean };

/** `#/drills`: Name-the-square. A square is named, you click it; 30 seconds, as many as you can. */
export function DrillsPage() {
  const [choice, setChoice] = useState<DrillOrientation>('white');
  const [side, setSide] = useState<DrillSide>('white');
  const [run, setRun] = useState<DrillRun | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<Flash | null>(null);
  const [bests, setBests] = useState<DrillBests>(loadBests);
  const [result, setResult] = useState<Result | null>(null);
  // The latest run, for the clock's callback (kept in step by the handlers that change it).
  const runRef = useRef<DrillRun | null>(null);
  const update = (r: DrillRun | null) => {
    runRef.current = r;
    setRun(r);
  };
  const running = run !== null;

  const left = run ? Math.max(0, EXTRAS.squareDrillMs - (now - startedAt)) : EXTRAS.squareDrillMs;

  // The clock: ticks while a run is on, and ends the run at zero.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      const r = runRef.current;
      if (!r || at - startedAt < EXTRAS.squareDrillMs) return;
      const { bests: next, isBest } = updateBests(bests, side, r.score);
      if (isBest) {
        setBests(next);
        saveBests(next);
      }
      setResult({ score: r.score, misses: r.misses, side, isBest });
      update(null);
      setFlash(null);
      logTraining('squares', EXTRAS.squareDrillMs / 1000);
    }, 100);
    return () => window.clearInterval(t);
  }, [running, startedAt, bests, side]);

  function start() {
    const s: DrillSide = choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : choice;
    setSide(s);
    setResult(null);
    setFlash(null);
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    update(startRun());
  }

  function click(square: string) {
    if (!run || left <= 0) return;
    const { run: next, correct } = answer(run, square);
    setFlash({
      styles: correct ? { [square]: { backgroundColor: RIGHT } } : { [square]: { backgroundColor: WRONG }, [run.target]: { backgroundColor: RIGHT } },
      until: Date.now() + (correct ? 250 : EXTRAS.squareDrillWrongMs),
    });
    update(next);
  }

  const styles = flash && flash.until > now ? flash.styles : undefined;
  const seconds = Math.ceil(left / 1000);

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,36rem)_minmax(18rem,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="relative">
          <SquareGrid orientation={side} onSquare={click} squareStyles={styles} disabled={!run} testId="drill-board" label="Drill board" />
          {!run && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/25" />
          )}
        </div>
        <p className="text-center text-xs text-muted">
          {side === 'white' ? 'White' : 'Black'} at the bottom · no letters or numbers on the board, that's the game
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold">Name that square!</h1>
          <p className="text-sm text-muted">A square's name pops up. Tap it on the board as fast as you can. You have 30 seconds.</p>
        </div>

        {run ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-4" data-testid="drill-run" aria-live="polite">
            <div className="text-sm text-muted">Find</div>
            <div className="font-mono text-6xl font-bold" data-testid="drill-target">{run.target}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${(100 * left) / EXTRAS.squareDrillMs}%` }} />
            </div>
            <div className="flex w-full justify-between text-sm tabular-nums">
              <span data-testid="drill-score">⭐ {run.score}</span>
              <span>{seconds}s</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
            {result && (
              <div className="text-center" data-testid="drill-result" aria-live="polite">
                <div className="text-4xl font-bold tabular-nums">{result.score}</div>
                <div className="text-sm">
                  {result.isBest
                    ? 'New best! 🎉'
                    : result.score === 0
                      ? 'Have another go: you’ll get the hang of it.'
                      : 'Nice run!'}
                </div>
                {result.score + result.misses > 0 && (
                  <div className="text-xs text-muted">{accuracy(result)}% right</div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which side at the bottom">
              {SIDES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={choice === s.id} className={chip(choice === s.id)} onClick={() => setChoice(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
            <button className="rounded-lg bg-accent px-3 py-3 text-base font-semibold text-accent-ink" onClick={start} data-testid="drill-start">
              {result ? 'Play again' : 'Start'}
            </button>
          </div>
        )}

        <div className="flex gap-3 rounded-lg bg-surface p-3 text-sm" data-testid="drill-bests">
          <span>Best as White: <span className="font-semibold tabular-nums">{bests.white}</span></span>
          <span>Best as Black: <span className="font-semibold tabular-nums">{bests.black}</span></span>
        </div>
        {run && (
          <button className={`${btn} self-start`} onClick={() => update(null)}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
