// Calculation mode on #/puzzles: look at the position for a few seconds, then the pieces hide and the
// whole solution line is entered from memory; then the pieces come back and the line is played on the
// trainer, which judges and records it the usual way. Pure rules: puzzles/calculation.ts.
import { Chess } from 'chess.js';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EXTRAS } from '../config/tunables';
import { calcStartFen, checkLine, enterMove, fenAfter, lineComplete, replayPlan, solutionLine, type CalcEntry } from '../puzzles/calculation';
import { usePuzzleStore } from '../puzzles/puzzleStore';
import { SquareGrid } from './SquareGrid';
import { useSan } from './useSan';

const PREF_KEY = 'rookery.calcMode';
const SELECTED = 'rgba(66, 135, 245, 0.55)';
const ENTERED = 'rgba(255, 213, 79, 0.45)';

function loadPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}
function savePref(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch {
    // storage blocked: holds until reload
  }
}

type Stage =
  | { kind: 'wait' }
  | { kind: 'look'; until: number }
  | { kind: 'enter'; entries: CalcEntry[]; from: string | null; error: string | null }
  | { kind: 'replay'; entries: CalcEntry[]; queue: string[]; reveal: boolean }
  | { kind: 'done'; entries: CalcEntry[] | null };

const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';

/** The calculation-mode switch, board and panel for the puzzle page. */
export function useCalcMode() {
  const [on, setOnState] = useState(loadPref);
  const onRef = useRef(on);
  const puzzle = usePuzzleStore((s) => s.puzzle);
  const [stage, setStage] = useState<Stage>({ kind: 'wait' });
  const [now, setNow] = useState(() => Date.now());
  const replayStop = useRef<(() => void) | null>(null);
  const fmt = useSan();

  /** A fresh solver turn (the set-up move just played) starts the look. */
  const freshTurn = (s: ReturnType<typeof usePuzzleStore.getState>) =>
    s.phase === 'solver' && s.session?.next === 1 && s.session.status === 'playing';
  const look = (): Stage => ({ kind: 'look', until: Date.now() + EXTRAS.calcHideMs });

  function setOn(v: boolean) {
    setOnState(v);
    onRef.current = v;
    savePref(v);
    replayStop.current?.();
    setNow(Date.now());
    setStage(v && freshTurn(usePuzzleStore.getState()) ? look() : { kind: 'wait' });
  }

  // Follows the trainer: a new puzzle (or retry) resets, its first solver turn starts the look, and
  // anything ending the puzzle meanwhile (Show solution) ends the calculation.
  useEffect(
    () =>
      usePuzzleStore.subscribe((s, prev) => {
        if (s.phase === prev.phase && s.puzzle === prev.puzzle) return;
        if (s.phase === 'setup' || s.phase === 'idle') {
          replayStop.current?.();
          setStage({ kind: 'wait' });
        } else if (onRef.current && freshTurn(s) && prev.phase !== 'solver') {
          setNow(Date.now());
          setStage((st) => (st.kind === 'wait' ? look() : st));
        } else if (s.phase === 'solution' || s.phase === 'ended') {
          setStage((st) => (st.kind === 'look' || st.kind === 'enter' ? { kind: 'done', entries: null } : st));
        }
      }),
    [],
  );
  useEffect(() => () => replayStop.current?.(), []);

  // The look countdown.
  useEffect(() => {
    if (stage.kind !== 'look') return;
    const tick = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= stage.until) setStage({ kind: 'enter', entries: [], from: null, error: null });
    }, 100);
    return () => window.clearInterval(tick);
  }, [stage]);

  /** Plays the entered line on the trainer: one solver move whenever it waits for one, then reveal if it went wrong. */
  function replay(entries: CalcEntry[], id: string, moves: string[], reveal: boolean) {
    const queue = [...moves];
    let unsub: () => void = () => {};
    let stopped = false;
    const stop = (next: Stage | null) => {
      if (stopped) return;
      stopped = true;
      unsub();
      replayStop.current = null;
      if (next) setStage(next);
    };
    const step = () => {
      if (stopped) return;
      const s = usePuzzleStore.getState();
      if (s.puzzle?.id !== id || s.phase === 'setup' || s.phase === 'idle') return stop({ kind: 'wait' });
      if (s.phase === 'ended' || s.phase === 'wrong' || s.phase === 'solution') return stop({ kind: 'done', entries });
      if (s.phase !== 'solver') return;
      const next = queue.shift();
      if (next) {
        if (!s.move({ from: next.slice(0, 2), to: next.slice(2, 4), promotion: next[4] })) stop({ kind: 'done', entries });
        return;
      }
      if (reveal) s.showSolution();
      stop({ kind: 'done', entries });
    };
    replayStop.current = () => stop(null);
    setStage({ kind: 'replay', entries, queue: moves, reveal });
    unsub = usePuzzleStore.subscribe(step);
    step();
  }

  const startFen = puzzle ? calcStartFen(puzzle) : null;

  function clickSquare(sq: string) {
    if (stage.kind !== 'enter' || !startFen || !puzzle || lineComplete(puzzle, stage.entries)) return;
    if (!stage.from || stage.from === sq) {
      setStage({ ...stage, from: stage.from === sq ? null : sq, error: null });
      return;
    }
    const e = enterMove(startFen, stage.entries, stage.from, sq);
    if (!e) {
      setStage({ ...stage, from: null, error: `${stage.from}–${sq} isn't a legal move there. Picture the board again.` });
      return;
    }
    setStage({ ...stage, entries: [...stage.entries, e], from: null, error: null });
  }

  function check() {
    if (stage.kind !== 'enter' || !puzzle) return;
    const plan = replayPlan(puzzle, stage.entries);
    replay(stage.entries, puzzle.id, plan.moves, plan.reveal);
  }

  const hidden = on && stage.kind === 'enter';
  const blocksMoves = on && (stage.kind === 'look' || stage.kind === 'enter' || stage.kind === 'replay');

  function renderBoard(orientation: 'white' | 'black'): ReactNode {
    if (stage.kind !== 'enter') return null;
    const styles: Record<string, CSSProperties> = {};
    const last = stage.entries[stage.entries.length - 1];
    if (last) {
      styles[last.uci.slice(0, 2)] = { backgroundColor: ENTERED };
      styles[last.uci.slice(2, 4)] = { backgroundColor: ENTERED };
    }
    if (stage.from) styles[stage.from] = { backgroundColor: SELECTED };
    return <SquareGrid orientation={orientation} onSquare={clickSquare} squareStyles={styles} testId="calc-board" label="Hidden board: enter the line" nameSquares />;
  }

  const lineLength = puzzle ? solutionLine(puzzle).length : 0;

  const toggle = (
    <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm" data-testid="calc-toggle">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <span>Calculate: pieces hide after {Math.round(EXTRAS.calcHideMs / 1000)} s</span>
    </label>
  );

  let panel: ReactNode = null;
  if (on && puzzle && stage.kind === 'look') {
    const left = Math.max(0, stage.until - now);
    panel = (
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm" data-testid="calc-panel">
        <p className="font-semibold">Look closely: the pieces hide in {Math.ceil(left / 1000)} s</p>
        <p className="text-muted">Work out the whole line in your head: your moves and the replies.</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full bg-accent" style={{ width: `${(100 * left) / EXTRAS.calcHideMs}%` }} />
        </div>
        <button className={`${btn} self-start`} onClick={() => setStage({ kind: 'enter', entries: [], from: null, error: null })}>
          I'm ready, hide them
        </button>
      </div>
    );
  } else if (on && puzzle && stage.kind === 'enter') {
    const complete = lineComplete(puzzle, stage.entries);
    const k = stage.entries.length;
    panel = (
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm" data-testid="calc-panel" aria-live="polite">
        <p className="font-semibold">
          {complete
            ? 'Line entered. Check it?'
            : `Move ${k + 1} of ${lineLength}: ${k % 2 === 0 ? 'your move' : 'their reply'}. Click the piece's square, then where it goes.`}
        </p>
        <ol className="flex flex-wrap gap-1 font-mono" data-testid="calc-line">
          {stage.entries.map((e, i) => (
            <li key={i} className={`rounded px-1.5 py-0.5 ${i % 2 === 0 ? 'bg-accent/20' : 'bg-surface-2'}`}>
              {fmt(e.san)}
            </li>
          ))}
        </ol>
        {stage.error && <p className="text-danger">{stage.error}</p>}
        <div className="flex gap-2">
          <button className={btn} disabled={k === 0} onClick={() => setStage({ ...stage, entries: stage.entries.slice(0, -1), from: null, error: null })}>
            Undo
          </button>
          <button className={primary} disabled={k === 0} onClick={check} data-testid="calc-check">
            Check my line
          </button>
        </div>
      </div>
    );
  } else if (on && puzzle && stage.kind === 'done' && stage.entries && startFen) {
    const { correct, firstWrong } = checkLine(puzzle, stage.entries);
    let expected = '';
    if (firstWrong !== null) {
      const line = solutionLine(puzzle);
      try {
        const c = new Chess(fenAfter(startFen, stage.entries.slice(0, firstWrong)));
        expected = c.move({ from: line[firstWrong].slice(0, 2), to: line[firstWrong].slice(2, 4), promotion: line[firstWrong][4] }).san;
      } catch {
        expected = '';
      }
    }
    const got = firstWrong !== null ? stage.entries[firstWrong] : undefined;
    panel = (
      <div className="flex flex-col gap-1 rounded-lg bg-surface p-3 text-sm" data-testid="calc-result">
        {correct ? (
          <p className="font-semibold text-accent">You saw the whole line from memory!</p>
        ) : (
          <p>
            <span className="font-semibold">Off at move {firstWrong! + 1}</span>
            {firstWrong! % 2 === 1 ? ' (their reply)' : ''}:{' '}
            {got ? <>you had <span className="font-mono">{fmt(got.san)}</span>, </> : ''}
            the line goes <span className="font-mono">{fmt(expected)}</span>.
          </p>
        )}
      </div>
    );
  }

  return { on, toggle, panel, hidden, blocksMoves, renderBoard };
}
