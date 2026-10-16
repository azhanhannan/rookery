import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { PUZZLES, TIMED_PUZZLES } from '../config/tunables';
import { formatClock } from '../game/clock';
import type { MoveInput } from '../game/rules';
import { playSound } from '../game/sound';
import { pickPuzzle } from '../puzzles/select';
import { playOpponentReply, startSession, trySolverMove, type PuzzleSession } from '../puzzles/session';
import { recordTrainedDay } from '../puzzles/streak';
import { loadTimedBest, miss, nextRating, remainingMs, saveTimedBest, solve, startRun, tick, type TimedRun } from '../puzzles/timedRun';
import type { Puzzle } from '../puzzles/types';
import { Board } from './Board';
import { BoardColumn, FullscreenButton } from './BoardColumn';

const GOOD = 'rgba(76, 175, 80, 0.55)';
const BAD = 'rgba(214, 48, 32, 0.5)';
/** A wrong move stays on show this long before the next puzzle, ms. */
const WRONG_SHOW_MS = 500;
/** Pause after a solve before the next puzzle, ms. */
const SOLVED_SHOW_MS = 300;

type View = {
  puzzle: Puzzle;
  /** null while the set-up move is still to come. */
  session: PuzzleSession | null;
  fen: string;
  lastMove: { from: string; to: string; color?: string } | null;
  phase: 'setup' | 'solver' | 'opponent' | 'shown';
};

/**
 * #/puzzles → Timed: TIMED_PUZZLES.durationMs on the clock, puzzles from ~600 climbing with each one tried; a
 * miss costs time and the last allowed miss ends the run. Never changes the puzzle rating. Best score per device.
 */
export function TimedPuzzles({ puzzles, modeBar }: { puzzles: Puzzle[]; modeBar: ReactNode }) {
  const [run, setRun] = useState<TimedRun | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [best, setBest] = useState(loadTimedBest);
  const [newBest, setNewBest] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const runRef = useRef<TimedRun | null>(null);
  const recent = useRef<Set<string>>(new Set());
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  function update(next: TimedRun) {
    const wasRunning = runRef.current?.status === 'running';
    runRef.current = next;
    setRun(next);
    if (wasRunning && next.status === 'over') {
      clearTimers();
      setView((v) => (v ? { ...v, phase: 'shown' } : v));
      playSound('end');
      if (next.solved > 0) recordTrainedDay();
      setNewBest(saveTimedBest(next.solved));
      setBest(loadTimedBest());
    }
  }

  // The clock: re-render while running and end the run at 0.
  useEffect(() => {
    if (run?.status !== 'running') return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (runRef.current) update(tick(runRef.current, t));
    }, 100);
    return () => window.clearInterval(id);
  }, [run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function nextPuzzle(r: TimedRun) {
    if (r.status !== 'running') return;
    const p = pickPuzzle(puzzles, nextRating(r), { recent: recent.current }) ?? pickPuzzle(puzzles, nextRating(r));
    if (!p) return;
    recent.current.add(p.id);
    setView({ puzzle: p, session: null, fen: p.fen, lastMove: null, phase: 'setup' });
    later(() => {
      if (runRef.current?.status !== 'running') return;
      const s = startSession(p);
      playSound('move');
      setView({ puzzle: p, session: s, fen: s.fen, lastMove: s.lastMove, phase: 'solver' });
    }, PUZZLES.opponentDelayMs);
  }

  function start() {
    clearTimers();
    recent.current = new Set();
    setNewBest(false);
    const t = Date.now();
    const r = startRun(t);
    runRef.current = r;
    setRun(r);
    setNow(t);
    nextPuzzle(r);
  }

  function onMove(input: MoveInput): boolean {
    const r = runRef.current;
    if (!view?.session || view.phase !== 'solver' || r?.status !== 'running') return false;
    const uci = `${input.from}${input.to}${input.promotion ?? ''}`;
    const res = trySolverMove(view.session, uci);
    if (!res) return false;
    const t = Date.now();
    const s = res.session;
    playSound('move');
    if (res.result === 'wrong') {
      setView({ ...view, session: s, fen: s.fen, lastMove: { from: input.from, to: input.to, color: BAD }, phase: 'shown' });
      const next = miss(r, t);
      update(next);
      later(() => nextPuzzle(next), WRONG_SHOW_MS);
      return true;
    }
    const shown: View = { ...view, session: s, fen: s.fen, lastMove: s.lastMove ? { ...s.lastMove, color: GOOD } : null };
    if (res.result === 'solved') {
      setView({ ...shown, phase: 'shown' });
      const next = solve(r, t);
      update(next);
      later(() => nextPuzzle(next), SOLVED_SHOW_MS);
      return true;
    }
    setView({ ...shown, phase: 'opponent' });
    later(() => {
      if (runRef.current?.status !== 'running') return;
      const replied = playOpponentReply(s);
      setView({ ...shown, session: replied, fen: replied.fen, lastMove: replied.lastMove, phase: 'solver' });
    }, PUZZLES.opponentDelayMs);
    return true;
  }

  const left = run ? remainingMs(run, now) : TIMED_PUZZLES.durationMs;
  const solverSide = view ? (new Chess(view.puzzle.fen).turn() === 'w' ? 'black' : 'white') : 'white';
  const running = run?.status === 'running';
  const misses = run?.misses ?? 0;

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        board={
          view ? (
            <Board
              position={view.fen}
              orientation={solverSide}
              lastMove={view.lastMove}
              movable={running && view.phase === 'solver'}
              onMove={onMove}
              id="timed-board"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface p-4 text-center text-sm text-muted">
              Press Start: {Math.round(TIMED_PUZZLES.durationMs / 60_000)} minutes, as many puzzles as you can.
            </div>
          )
        }
      >
        <FullscreenButton withText className="self-end rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:outline-1 hover:outline-accent" />
      </BoardColumn>
      <div className="flex min-w-0 flex-col gap-3">
        {modeBar}
        <div data-testid="timed-panel" className="flex flex-col gap-3 rounded-lg bg-surface p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={`font-mono text-3xl font-bold tabular-nums ${running && left < 20_000 ? 'text-danger' : ''}`}
              data-testid="timed-clock"
            >
              {formatClock(left)}
            </span>
            <span className="text-right">
              <span className="block font-mono text-3xl font-bold tabular-nums" data-testid="timed-score">
                {run?.solved ?? 0}
              </span>
              <span className="text-[10px] tracking-wide text-muted uppercase">Solved</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span aria-label={`${misses} of ${TIMED_PUZZLES.maxMisses} misses`} data-testid="timed-misses">
              {Array.from({ length: TIMED_PUZZLES.maxMisses }, (_, i) => (
                <span key={i} className={i < misses ? 'text-danger' : 'text-muted opacity-40'}>
                  ✕
                </span>
              ))}
            </span>
            <span className="text-muted" data-testid="timed-best">
              Best {best}
            </span>
          </div>
          {run?.status === 'over' && (
            <p className="text-sm" data-testid="timed-result" role="status">
              {run.endedBy === 'misses' ? `${TIMED_PUZZLES.maxMisses} misses: run over.` : 'Time is up.'} You solved{' '}
              <strong>{run.solved}</strong>.{newBest ? ' A new personal best!' : ''}
            </p>
          )}
          {!running && (
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink" onClick={start} data-testid="timed-start">
              {run ? 'Go again' : 'Start'}
            </button>
          )}
          <p className="text-xs text-muted">
            Starts easy and gets harder with every puzzle. A miss costs {TIMED_PUZZLES.missPenaltyMs / 1000} s and{' '}
            {TIMED_PUZZLES.maxMisses} misses end the run. Your puzzle rating doesn’t change.
          </p>
        </div>
      </div>
    </div>
  );
}
