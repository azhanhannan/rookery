import { useState } from 'react';
import { useTablebase } from '../analysis/useTablebase';
import { Board } from '../components/Board';
import { BoardColumn, FullscreenButton } from '../components/BoardColumn';
import { DRILL_LEVELS, DRILLS, type Drill } from '../endgames/drills';
import { loadProgress, type EndgamesProgress } from '../endgames/progress';
import { useDrill } from '../endgames/useDrill';
import { tablebaseLine } from '../engine/tablebase';
import { findSlip, slipText, type DrillStep } from '../game/endgameJudge';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';
const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';

function sideName(c: 'w' | 'b') {
  return c === 'w' ? 'White' : 'Black';
}

function goalText(d: Drill): string {
  if (d.goal === 'draw') return `Hold the draw as ${sideName(d.side)} for ${d.moves} moves.`;
  if (d.winBy === 'mate') return `Checkmate as ${sideName(d.side)} within ${d.moves} moves.`;
  return `Win as ${sideName(d.side)}: queen the pawn (or win the defender's last piece) within ${d.moves} moves.`;
}

/** Endgame drills (#/endgames): key positions to win or hold against Stockfish, judged by the tablebase. */
export function EndgamesPage() {
  const [progress, setProgress] = useState<EndgamesProgress>(loadProgress);
  const [selected, setSelected] = useState<string | null>(null);
  const drill = DRILLS.find((d) => d.id === selected);
  if (drill) {
    const index = DRILLS.indexOf(drill);
    const next = DRILLS[index + 1];
    return (
      <DrillScreen
        key={drill.id}
        drill={drill}
        onBack={() => setSelected(null)}
        onNext={next ? () => setSelected(next.id) : undefined}
        onFinished={() => setProgress(loadProgress())}
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6" data-testid="endgames-list">
      <div>
        <h1 className="text-xl font-bold">Endgame drills</h1>
        <p className="text-sm text-muted">
          Key positions to win or hold against Stockfish at full strength. The tablebase (perfect play, up to 7 pieces)
          is the judge, and tells you the move where a win or a draw slipped away.
        </p>
      </div>
      {DRILL_LEVELS.map((level) => (
        <section key={level} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{level}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DRILLS.filter((d) => d.level === level).map((d) => {
              const p = progress.drills[d.id];
              return (
                <li key={d.id}>
                  <button
                    className="flex w-full flex-col gap-1 rounded-lg bg-surface p-3 text-left hover:outline-1 hover:outline-accent"
                    onClick={() => setSelected(d.id)}
                    data-testid={`drill-${d.id}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{d.title}</span>
                      <span
                        className={`ml-auto rounded px-1.5 text-xs font-semibold ${d.goal === 'win' ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                      >
                        {d.goal === 'win' ? 'Win' : 'Draw'}
                      </span>
                    </span>
                    <span className="text-xs text-muted">
                      You play {sideName(d.side)}
                      {p
                        ? ` · ${p.best === 'passed' ? `✓ done${p.bestMoves !== undefined ? ` (best ${p.bestMoves} moves)` : ''}` : 'not done yet'} · ${p.attempts} ${p.attempts === 1 ? 'try' : 'tries'}`
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DrillScreen({
  drill,
  onBack,
  onNext,
  onFinished,
}: {
  drill: Drill;
  onBack: () => void;
  onNext?: () => void;
  onFinished: () => void;
}) {
  const run = useDrill(drill, onFinished);
  const [tip, setTip] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>(drill.side === 'w' ? 'white' : 'black');
  const turn = run.fen.split(' ')[1];
  const movable = run.status === 'playing' && !run.thinking && turn === drill.side;
  const slip = run.status === 'failed' ? findSlip(run.steps) : null;
  const userMoves = run.moves.filter((m) => m.by === 'user').length;

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        controlsBelow
        board={
          <Board
            id="endgame-board"
            position={run.fen}
            orientation={orientation}
            lastMove={run.lastMove}
            movable={movable}
            onMove={run.move}
            positionKey={`${drill.id}:${run.moves.length}`}
          />
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <button className={btn} onClick={run.restart}>Restart</button>
          <button className={btn} onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} aria-label="Flip board">⇅</button>
          <FullscreenButton className={btn} />
        </div>
      </BoardColumn>

      <aside className="flex min-w-0 flex-col gap-3">
        <button className="self-start text-sm text-muted hover:text-ink" onClick={onBack}>← All drills</button>
        <div>
          <h1 className="text-xl font-bold">{drill.title}</h1>
          <p className="text-sm" data-testid="drill-goal">{goalText(drill)}</p>
        </div>

        <div className={panel} data-testid="drill-status">
          {run.status === 'playing' ? (
            <p className="text-sm">
              {run.error
                ? run.error
                : run.thinking
                  ? 'Stockfish is thinking…'
                  : `Your move. ${userMoves} of ${drill.moves} played.`}
            </p>
          ) : (
            <DrillResult drill={drill} passed={run.status === 'passed'} reason={run.reason} slip={slip} onRetry={run.retryFrom} />
          )}
          {run.verdict?.source === 'engine' && run.status === 'playing' && (
            <p className="text-xs text-muted">Tablebase unavailable: judging with Stockfish's eval instead.</p>
          )}
        </div>

        <div className={panel}>
          {tip ? (
            <p className="text-sm" data-testid="drill-tip">{drill.tip}</p>
          ) : (
            <button className={`${btn} self-start`} onClick={() => setTip(true)}>Show a tip</button>
          )}
        </div>

        {run.moves.length > 0 && (
          <ol className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm" data-testid="drill-moves">
            {run.moves.map((m, i) => (
              <li key={i} className={m.by === 'user' ? '' : 'text-muted'}>
                {m.san}
              </li>
            ))}
          </ol>
        )}

        {run.status !== 'playing' && (
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={run.restart}>Try again</button>
            {onNext && <button className={btn} onClick={onNext}>Next drill</button>}
          </div>
        )}
      </aside>
    </div>
  );
}

function DrillResult({
  drill,
  passed,
  reason,
  slip,
  onRetry,
}: {
  drill: Drill;
  passed: boolean;
  reason: string;
  slip: DrillStep | null;
  onRetry: (step: DrillStep) => void;
}) {
  // The tablebase's verdict on the position before the slip names the moves that kept the result.
  const before = useTablebase(slip?.fenBefore ?? null, slip !== null);
  const keep = slip?.before?.outcome;
  const better =
    before.result && keep
      ? before.result.moves.filter((m) => m.outcome === keep).slice(0, 3).map((m) => m.san)
      : [];
  return (
    <div className="flex flex-col gap-2" data-testid="drill-result">
      <p className={`text-base font-semibold ${passed ? 'text-accent' : 'text-danger'}`}>
        {passed ? (drill.goal === 'win' ? 'Won!' : 'Held!') : 'Not this time.'} <span className="font-normal">{reason}</span>
      </p>
      {slip && (
        <>
          <p className="text-sm" data-testid="drill-slip">{slipText(slip)}</p>
          {better.length > 0 && (
            <p className="text-sm text-muted">
              {better.length === 1 ? 'The move that kept it' : 'Moves that kept it'}: {better.join(', ')}
            </p>
          )}
          {before.result && <p className="text-xs text-muted">Before your move: {tablebaseLine(before.result)}</p>}
          <button className={`${btn} self-start`} onClick={() => onRetry(slip)}>Try that move again</button>
        </>
      )}
    </div>
  );
}
