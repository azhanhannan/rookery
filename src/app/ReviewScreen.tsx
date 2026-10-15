import { Chess } from 'chess.js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { BoardColumn, FullscreenButton } from '../components/BoardColumn';
import { EvalGraph } from '../components/EvalGraph';
import { LABEL_STYLE } from '../components/labelStyle';
import { MoveBadge } from '../components/MoveBadge';
import { ReviewMoveList } from '../components/ReviewMoveList';
import { MaiaMatchPanel } from '../components/MaiaMatchPanel';
import { ReviewSummary } from '../components/ReviewSummary';
import type { Orientation } from '../game/gameStore';
import { botColor, tryLegalMove, type MoveInput } from '../game/rules';
import type { Color, GameRecord } from '../game/types';
import {
  bestArrowFor,
  evalLabel,
  graphData,
  isBestTry,
  lineSteps,
  moveNumber,
  retryCandidates,
} from '../review/reviewView';
import type { MaiaMatch } from '../rating/maiaMatch';
import type { GameReview, MoveReview } from '../review/types';
import { useMaiaMatchRun } from './useMaiaMatchRun';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { flipOrientation, useFlipKey } from '../components/boardKeys';
import { openInAnalysis } from '../analysis/analysisStore';

type Mode =
  | { kind: 'game' }
  /** Engine line from positions[base]; step 0 = that position, step k = after k line moves. */
  | { kind: 'line'; base: number; step: number; playing: boolean }
  | { kind: 'retry'; index: number; status: 'try' | 'wrong' | 'correct' | 'shown'; tried?: string };

const BEST_ARROW = 'rgba(79, 154, 44, 0.85)';
const LINE_STEP_MS = 900;

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';

function sideName(c: Color) {
  return c === 'w' ? 'White' : 'Black';
}

function moveTitle(m: MoveReview) {
  const no = Math.ceil(m.ply / 2);
  return m.color === 'w' ? `${no}. ${m.san}` : `${no}... ${m.san}`;
}

function NameBar({ color, record }: { color: Color; record: GameRecord }) {
  const p = color === 'w' ? record.white : record.black;
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm font-semibold">
      <span
        className={`inline-block h-3 w-3 rounded-full border border-muted ${color === 'w' ? 'bg-neutral-100' : 'bg-neutral-800'}`}
        aria-hidden
      />
      {p.name}
      {p.elo !== undefined && !p.isBot && <span className="font-normal text-muted">({p.elo})</span>}
    </div>
  );
}

/** Board, eval bar, graph, move list, per-move explanation, best line, Retry and the summary for one reviewed game. */
export function ReviewScreen({
  record,
  review,
  header,
  onMaiaMatch,
}: {
  record: GameRecord;
  review: GameReview;
  header?: ReactNode;
  /** Stores a finished style match; without it the panel is hidden. */
  onMaiaMatch?: (match: MaiaMatch) => void;
}) {
  const maiaRun = useMaiaMatchRun(record, (m) => onMaiaMatch?.(m));
  const bot = botColor(record);
  const [orientation, setOrientation] = useState<Orientation>(bot === 'w' ? 'black' : 'white');
  useFlipKey(flipOrientation(setOrientation));
  const [ply, setPly] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'game' });

  const last = review.moves.length;
  const graph = useMemo(() => graphData(review), [review]);
  const candidates = useMemo(() => retryCandidates(record, review), [record, review]);
  const selected = ply > 0 ? review.moves[ply - 1] : undefined;
  // "Show best line" starts from the position before the selected move (or the start position).
  const lineBase = Math.max(0, ply - 1);
  const line = useMemo(
    () => (mode.kind === 'line' ? lineSteps(review.positions[mode.base].fen, review.positions[mode.base].bestLine) : []),
    [mode, review],
  );
  const lineAvailable = review.positions[lineBase].bestLine.length > 0;

  function goTo(p: number) {
    setPly(Math.max(0, Math.min(last, p)));
  }

  function stepLine(delta: number) {
    if (mode.kind !== 'line') return;
    setMode({ ...mode, playing: false, step: Math.max(0, Math.min(line.length, mode.step + delta)) });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || mode.kind === 'retry') return;
      const actions: Record<string, () => void> =
        mode.kind === 'line'
          ? {
              ArrowLeft: () => stepLine(-1),
              ArrowRight: () => stepLine(1),
              Home: () => stepLine(-Infinity),
              End: () => stepLine(Infinity),
              Escape: () => setMode({ kind: 'game' }),
            }
          : {
              ArrowLeft: () => goTo(ply - 1),
              ArrowRight: () => goTo(ply + 1),
              Home: () => goTo(0),
              End: () => goTo(last),
            };
      const act = actions[e.key];
      if (act) {
        e.preventDefault();
        act();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The best line plays itself one move at a time until it ends or the viewer steps manually.
  useEffect(() => {
    if (mode.kind !== 'line' || !mode.playing || mode.step >= line.length) return;
    const t = setTimeout(() => setMode({ ...mode, step: mode.step + 1 }), mode.step === 0 ? 400 : LINE_STEP_MS);
    return () => clearTimeout(t);
  }, [mode, line.length]);

  // What the board shows in each mode.
  let boardFen: string;
  let lastMove: { from: string; to: string; color?: string } | null = null;
  let arrows: BoardArrow[] = [];
  let evalPly: number;
  let movable = false;
  const retryMove = mode.kind === 'retry' ? candidates[mode.index] : undefined;

  if (mode.kind === 'line') {
    const s = mode.step > 0 ? line[mode.step - 1] : undefined;
    boardFen = s?.fen ?? review.positions[mode.base].fen;
    if (s) lastMove = { from: s.uci.slice(0, 2), to: s.uci.slice(2, 4) };
    evalPly = mode.base;
  } else if (mode.kind === 'retry' && retryMove) {
    const before = review.positions[retryMove.ply - 1].fen;
    evalPly = retryMove.ply - 1;
    boardFen = before;
    const best = retryMove.bestMove!;
    if (mode.status === 'correct') {
      boardFen = lineSteps(before, [best])[0]?.fen ?? before;
      lastMove = { from: best.slice(0, 2), to: best.slice(2, 4), color: `${LABEL_STYLE.Best.color}99` };
    } else if (mode.status === 'shown') {
      arrows = [{ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: BEST_ARROW }];
    }
    movable = mode.status === 'try' || mode.status === 'wrong';
  } else {
    boardFen = review.positions[ply].fen;
    evalPly = ply;
    if (selected) {
      lastMove = {
        from: selected.uci.slice(0, 2),
        to: selected.uci.slice(2, 4),
        color: `${LABEL_STYLE[selected.label].color}8c`,
      };
      const a = bestArrowFor(selected);
      if (a) arrows = [{ startSquare: a.from, endSquare: a.to, color: BEST_ARROW }];
    }
  }
  const evalPos = review.positions[evalPly];

  function tryMove(input: MoveInput): boolean {
    if (mode.kind !== 'retry' || !retryMove) return false;
    const chess = new Chess(review.positions[retryMove.ply - 1].fen);
    const m = tryLegalMove(chess, input);
    if (!m) return false;
    if (isBestTry(m.from + m.to + (m.promotion ?? ''), retryMove.bestMove)) {
      setMode({ ...mode, status: 'correct', tried: m.san });
      return true;
    }
    // A wrong try snaps back: the position stays for the next attempt.
    setMode({ ...mode, status: 'wrong', tried: m.san });
    return false;
  }

  function startRetry() {
    if (candidates.length) setMode({ kind: 'retry', index: 0, status: 'try' });
  }

  function nextRetry() {
    if (mode.kind !== 'retry') return;
    if (mode.index + 1 < candidates.length) {
      setMode({ kind: 'retry', index: mode.index + 1, status: 'try' });
    } else {
      // Finished: back to the game, on the last move practised.
      if (retryMove) goTo(retryMove.ply);
      setMode({ kind: 'game' });
    }
  }

  const top: Color = orientation === 'white' ? 'b' : 'w';

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        controlsBelow
        top={<NameBar color={top} record={record} />}
        bottom={<NameBar color={top === 'w' ? 'b' : 'w'} record={record} />}
        evalBar={
          <EvalBar
            white={evalPos.winWhite}
            label={evalLabel(evalPos)}
            orientation={orientation}
            stale={mode.kind === 'line' && mode.step > 0}
          />
        }
        board={
          <Board
            id="review-board"
            position={boardFen}
            orientation={orientation}
            lastMove={lastMove}
            arrows={arrows}
            movable={movable}
            onMove={tryMove}
          />
        }
      >

        {mode.kind === 'game' && (
          <div className="grid grid-cols-7 gap-2">
            <button className={btn} onClick={() => goTo(0)} aria-label="First move" disabled={ply === 0}>⏮</button>
            <button className={btn} onClick={() => goTo(ply - 1)} aria-label="Previous move" disabled={ply === 0}>◀</button>
            <button className={btn} onClick={() => goTo(ply + 1)} aria-label="Next move" disabled={ply === last}>▶</button>
            <button className={btn} onClick={() => goTo(last)} aria-label="Last move" disabled={ply === last}>⏭</button>
            <button className={btn} onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board" title="Flip board (X)">⇅</button>
            <FullscreenButton className={btn} />
            <KeyboardShortcuts page="review" className={btn} />
          </div>
        )}

        <EvalGraph
          data={graph}
          ply={mode.kind === 'game' ? ply : evalPly}
          onSelect={(p) => {
            setMode({ kind: 'game' });
            goTo(p);
          }}
        />
      </BoardColumn>

      <aside className="flex min-w-0 flex-col gap-3">
        {header}

        {review.opening?.name && (
          <p className="rounded-lg bg-surface px-3 py-2 text-sm" data-testid="opening">
            {review.opening.eco && <span className="mr-2 font-mono text-muted">{review.opening.eco}</span>}
            {review.opening.name}
          </p>
        )}

        {mode.kind === 'game' && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="move-panel">
            {selected ? (
              <>
                <div className="flex items-center gap-2">
                  <MoveBadge label={selected.label} size="md" />
                  <span className="font-mono font-semibold">{moveTitle(selected)}</span>
                  <span className="text-sm text-muted" data-testid="move-label">{selected.label}</span>
                </div>
                <p className="text-sm" data-testid="explanation">{selected.explanation}</p>
              </>
            ) : (
              <p className="text-sm text-muted">Start position. Step through the moves, or click the graph.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={btn}
                disabled={!lineAvailable}
                onClick={() => setMode({ kind: 'line', base: lineBase, step: 0, playing: true })}
              >
                Show best line
              </button>
              <button className={btn} disabled={candidates.length === 0} onClick={startRetry}>
                Retry mistakes{candidates.length ? ` (${candidates.length})` : ''}
              </button>
              <button className={`${btn} col-span-2`} onClick={() => openInAnalysis(record, ply)} data-testid="analyse-from-here">
                Analyse from here
              </button>
            </div>
          </div>
        )}

        {mode.kind === 'line' && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="line-panel">
            <div className="text-sm font-semibold">
              Best line {mode.base === 0 ? 'from the start' : `instead of ${moveTitle(review.moves[mode.base])}`}
            </div>
            <ol className="flex flex-wrap gap-1 font-mono text-sm">
              {line.map((s, i) => {
                const fenBefore = i === 0 ? review.positions[mode.base].fen : line[i - 1].fen;
                const showNo = i === 0 || fenBefore.split(' ')[1] === 'w';
                return (
                  <li key={i}>
                    <button
                      className={`rounded px-1.5 py-0.5 ${mode.step === i + 1 ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
                      aria-current={mode.step === i + 1 ? 'step' : undefined}
                      onClick={() => setMode({ ...mode, playing: false, step: i + 1 })}
                    >
                      {showNo ? `${moveNumber(fenBefore)} ` : ''}
                      {s.san}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="grid grid-cols-4 gap-2">
              <button className={btn} aria-label="Previous line move" disabled={mode.step === 0} onClick={() => stepLine(-1)}>◀</button>
              <button className={btn} aria-label="Next line move" disabled={mode.step >= line.length} onClick={() => stepLine(1)}>▶</button>
              <button className={`${primary} col-span-2`} onClick={() => setMode({ kind: 'game' })}>Back to game</button>
            </div>
          </div>
        )}

        {mode.kind === 'retry' && retryMove && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="retry-panel" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                Retry {mode.index + 1} of {candidates.length}
              </span>
              <button className="text-muted hover:text-ink" onClick={() => setMode({ kind: 'game' })}>Exit retry</button>
            </div>
            <p className="flex items-center gap-2 text-sm">
              <MoveBadge label={retryMove.label} />
              <span>
                {moveTitle(retryMove)} was a {retryMove.label.toLowerCase()}. Find a better move for {sideName(retryMove.color)}.
              </span>
            </p>
            {mode.status === 'correct' && (
              <p className="font-semibold text-accent" data-testid="retry-result">Correct! {retryMove.bestSan ?? mode.tried} is the best move.</p>
            )}
            {mode.status === 'wrong' && (
              <p className="font-semibold text-danger" data-testid="retry-result">Not quite: {mode.tried} isn't the best move.</p>
            )}
            {mode.status === 'shown' && (
              <p className="font-semibold" data-testid="retry-result">The best move was {retryMove.bestSan ?? retryMove.bestMove}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {mode.status === 'wrong' && (
                <>
                  <button className={btn} onClick={() => setMode({ ...mode, status: 'try' })}>Try again</button>
                  <button className={btn} onClick={() => setMode({ ...mode, status: 'shown' })}>Show answer</button>
                </>
              )}
              {mode.status === 'try' && (
                <button className={btn} onClick={() => setMode({ ...mode, status: 'shown' })}>Show answer</button>
              )}
              <button className={primary} onClick={nextRetry}>
                {mode.index + 1 < candidates.length ? 'Next' : 'Finish'}
              </button>
            </div>
          </div>
        )}

        <ReviewMoveList
          moves={review.moves}
          startFen={record.startFen}
          ply={mode.kind === 'game' ? ply : -1}
          onSelect={(p) => {
            setMode({ kind: 'game' });
            goTo(p);
          }}
        />

        <ReviewSummary
          white={record.white}
          black={record.black}
          whiteSummary={review.white}
          blackSummary={review.black}
          maiaMatch={record.maiaMatch}
        />
        {onMaiaMatch && <MaiaMatchPanel record={record} run={maiaRun} />}
      </aside>
    </div>
  );
}
