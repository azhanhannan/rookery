import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { Homework } from '../../api/types';
import { Board } from '../../components/Board';
import { useCoachBadge } from '../../coach/coachStore';
import { homeworkSession } from '../../coach/homework';
import { PUZZLES } from '../../config/tunables';
import type { MoveInput } from '../../game/rules';
import { playOpponentReply, showSolution, trySolverMove, type PuzzleSession } from '../../puzzles/session';
import { button, message, primary, shortDate } from './ui';

type Phase = 'solver' | 'opponent' | 'solved' | 'failed';

/** `#/coach/homework/<id>`: the student solves a homework set position by position. */
export function HomeworkSolver({ homeworkId }: { homeworkId: string }) {
  const [hw, setHw] = useState<Homework | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [shown, setShown] = useState<{ fen: string; lastMove: { from: string; to: string; color?: string } | null } | null>(null);
  const [phase, setPhase] = useState<Phase>('solver');
  const reported = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.coach.myHomework().then(
      (r) => {
        const found = r.homework.find((h) => h.id === homeworkId);
        if (!found) return setError('This homework isn’t there any more (your coach may have removed it, or you unlinked them).');
        setHw(found);
        const first = found.progress.findIndex((p) => !p.solved);
        begin(found, first < 0 ? 0 : first);
      },
      (e: unknown) => setError(message(e)),
    );
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [homeworkId]); // eslint-disable-line react-hooks/exhaustive-deps

  function begin(h: Homework, i: number) {
    if (timer.current) window.clearTimeout(timer.current);
    const s = homeworkSession(h.items[i], `${h.id}:${i}`);
    setIndex(i);
    setSession(s);
    setShown({ fen: s.fen, lastMove: null });
    setPhase('solver');
    reported.current = false;
  }

  function report(solved: boolean) {
    if (!hw || reported.current) return;
    reported.current = true;
    api.coach.attempt(hw.id, { item: index, solved }).then(
      (r) => {
        setHw(r.homework);
        void useCoachBadge.getState().refresh();
      },
      (e: unknown) => setError(message(e)),
    );
  }

  function onMove(input: MoveInput): boolean {
    if (!session || phase !== 'solver') return false;
    const res = trySolverMove(session, `${input.from}${input.to}${input.promotion ?? ''}`);
    if (!res) return false;
    const s = res.session;
    setSession(s);
    if (res.result === 'wrong') {
      setShown({ fen: s.fen, lastMove: { from: input.from, to: input.to, color: 'rgba(199,54,43,0.5)' } });
      setPhase('failed');
      report(false);
      // Show the wrong move briefly, then the position before it again.
      timer.current = window.setTimeout(() => setShown({ fen: session.fen, lastMove: session.lastMove }), 700);
      return true;
    }
    setShown({ fen: s.fen, lastMove: s.lastMove });
    if (res.result === 'solved') {
      setPhase('solved');
      report(!s.usedHelp);
      return true;
    }
    setPhase('opponent');
    timer.current = window.setTimeout(() => {
      const replied = playOpponentReply(s);
      setSession(replied);
      setShown({ fen: replied.fen, lastMove: replied.lastMove });
      setPhase('solver');
    }, PUZZLES.opponentDelayMs);
    return true;
  }

  function solution() {
    if (!session) return;
    if (timer.current) window.clearTimeout(timer.current);
    const steps = showSolution(session);
    const end = steps.at(-1);
    if (end) {
      setSession(end);
      setShown({ fen: end.fen, lastMove: end.lastMove });
    }
    setPhase('failed');
    report(false);
  }

  if (error && !hw) return <p role="alert" className="p-6 text-center text-sm text-danger">{error}</p>;
  if (!hw || !session || !shown) return <p className="p-6 text-center text-sm text-muted">Loading homework…</p>;

  const item = hw.items[index];
  const nextOpen = hw.progress.findIndex((p, i) => i !== index && !p.solved);
  const solvedCount = hw.progress.filter((p) => p.solved).length;
  const status =
    phase === 'solved'
      ? 'Solved!'
      : phase === 'failed'
        ? 'Not the move. Try again, or see the solution.'
        : phase === 'opponent'
          ? 'Good — now the reply…'
          : `${session.solverColor === 'w' ? 'White' : 'Black'} to move: find the best line.`;

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,36rem)_minmax(18rem,1fr)]">
      <Board
        position={shown.fen}
        orientation={session.solverColor === 'w' ? 'white' : 'black'}
        lastMove={shown.lastMove}
        movable={phase === 'solver'}
        onMove={onMove}
        id="homework-board"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <a href="#/coach" className="text-sm text-muted hover:text-ink">← Coach</a>
        <div className="rounded-lg bg-surface p-3">
          <h1 className="font-semibold">{hw.title}</h1>
          <p className="text-xs text-muted">
            From {hw.coach.username} · {solvedCount}/{hw.items.length} solved{hw.dueAt ? ` · due ${shortDate(hw.dueAt)}` : ''}
            {hw.done ? ' · all done' : ''}
          </p>
        </div>
        <ol className="flex flex-wrap gap-2" aria-label="Positions">
          {hw.items.map((_, i) => (
            <li key={i}>
              <button
                onClick={() => begin(hw, i)}
                className={`rounded px-2.5 py-1 text-sm ${i === index ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                aria-label={`Position ${i + 1}${hw.progress[i].solved ? ', solved' : ''}`}
              >
                {i + 1}
                {hw.progress[i].solved ? ' ✓' : ''}
              </button>
            </li>
          ))}
        </ol>
        <p data-testid="homework-status" className={`rounded-lg bg-surface p-3 text-sm ${phase === 'solved' ? 'text-accent' : phase === 'failed' ? 'text-danger' : ''}`}>
          {status}
        </p>
        {item.note && <p className="rounded-lg bg-surface p-3 text-sm">Coach’s note: {item.note}</p>}
        {item.source && <p className="text-xs text-muted">From one of your games (move {Math.ceil(item.source.ply / 2)}).</p>}
        <div className="flex flex-wrap gap-2">
          {phase === 'failed' && <button className={button} onClick={() => begin(hw, index)}>Try again</button>}
          {phase !== 'solved' && <button className={button} onClick={solution}>Show solution</button>}
          {(phase === 'solved' || phase === 'failed') && nextOpen >= 0 && (
            <button className={primary} onClick={() => begin(hw, nextOpen)}>Next position</button>
          )}
        </div>
        <p className="text-xs text-muted">Your coach sees which positions you solved and how many tries each took.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
