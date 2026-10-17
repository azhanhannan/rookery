import { useCallback, useEffect, useMemo, useState } from 'react';
import { BoardColumn, FullscreenButton } from '../components/BoardColumn';
import { useAuthStore } from '../account/authStore';
import { Board } from '../components/Board';
import { PuzzlePanel } from '../components/PuzzlePanel';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { useFlipKey } from '../components/boardKeys';
import { popularThemes } from '../puzzles/select';
import { errorMessage, HINT_COLOR, loadPuzzleSet, usePuzzleStore } from '../puzzles/puzzleStore';
import type { PuzzleSet } from '../puzzles/types';
import { PuzzleModeBar } from '../components/PuzzleModeBar';
import { TimedPuzzles } from '../components/TimedPuzzles';
import { TrainingStreak } from '../components/TrainingStreak';
import { loadHistory } from '../game/storage';
import { RATINGS } from '../config/tunables';
import { dailyPuzzle } from '../puzzles/daily';
import { todayKey } from '../puzzles/days';
import { harvestMistakes, sourceText, type MistakePuzzle } from '../puzzles/harvest';
import type { PuzzleMode } from '../puzzles/puzzleStore';
import { dueItems, loadSchedule, mistakeCounts } from '../puzzles/spacedRepetition';
import { useCalcMode } from '../components/CalcMode';
import { HomeworkCard } from './coach/HomeworkCard';
import type { Motif } from '../insights/types';
import { mistakesForMotif } from './insights/process';
import { MOTIF_NAME } from './insights/wording';

type DataState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; set: PuzzleSet };

/**
 * `#/puzzles`: the puzzle trainer (Lichess puzzle database, rated per player).
 * `#/puzzles/mistakes/<motif>` (`mistakesMotif`) opens My mistakes with only that motif's puzzles (Insights' Train this).
 */
export function PuzzlesPage({ mistakesMotif }: { mistakesMotif?: Exclude<Motif, 'other'> } = {}) {
  const authStatus = useAuthStore((s) => s.status);
  const [data, setData] = useState<DataState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState('');

  const ratingSource = usePuzzleStore((s) => s.ratingSource);
  const puzzle = usePuzzleStore((s) => s.puzzle);
  const empty = usePuzzleStore((s) => s.empty);
  const fen = usePuzzleStore((s) => s.fen);
  const lastMove = usePuzzleStore((s) => s.lastMove);
  const hintSquare = usePuzzleStore((s) => s.hintSquare);
  const phase = usePuzzleStore((s) => s.phase);
  const { loadRating, next, move, stop } = usePuzzleStore.getState();
  const [mode, setMode] = useState<PuzzleMode>(mistakesMotif ? 'mistakes' : 'rated');
  // My mistakes narrowed to one motif, until the player asks for all of them.
  const [motif, setMotif] = useState<Exclude<Motif, 'other'> | null>(mistakesMotif ?? null);
  const authUser = useAuthStore((s) => s.user);
  const record = usePuzzleStore((s) => s.record);
  const rating = usePuzzleStore((s) => s.rating);
  // Harvested when "My mistakes" opens (games and reviews change on other pages, not this one).
  const [mistakes, setMistakes] = useState<MistakePuzzle[] | null>(null);

  useEffect(() => {
    let live = true;
    loadPuzzleSet()
      .then((set) => live && setData({ kind: 'ready', set }))
      .catch((e: unknown) => live && setData({ kind: 'error', message: errorMessage(e) }));
    return () => {
      live = false;
    };
  }, [attempt]);

  // Leaving the page drops any pending opponent move.
  useEffect(() => stop, [stop]);

  // Signed in: the account's puzzle rating; otherwise (or with the server down) this device's.
  useEffect(() => {
    if (authStatus === 'unknown') return;
    void loadRating(authStatus === 'signed-in');
  }, [authStatus, loadRating]);

  const puzzles = data.kind === 'ready' ? data.set.puzzles : null;

  useEffect(() => {
    if (mode === 'rated' && puzzles && ratingSource && !puzzle && !empty) next(puzzles, theme);
  }, [mode, puzzles, ratingSource, puzzle, empty, next, theme]);

  const everyMistake = useMemo(
    () => mistakes ?? harvestMistakes(loadHistory(), { userNames: authUser ? [authUser.username] : [] }),
    [mistakes, authUser],
  );
  const allMistakes = useMemo(
    () => (motif ? mistakesForMotif(everyMistake, loadHistory(), motif) : everyMistake),
    [everyMistake, motif],
  );
  // Opened on one motif: start its first due puzzle.
  useEffect(() => {
    if (mistakesMotif) startMistake(allMistakes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  // Re-read after every result (`record` changes) so the due count stays current.
  const counts = useMemo(() => mistakeCounts(allMistakes, loadSchedule(), todayKey()), [allMistakes, record]); // eslint-disable-line react-hooks/exhaustive-deps

  function startMistake(list: MistakePuzzle[], skipId?: string) {
    const due = dueItems(list, loadSchedule(), todayKey()).filter((p) => p.id !== skipId);
    if (due[0]) usePuzzleStore.getState().play(due[0], 'mistakes');
    else usePuzzleStore.getState().clear();
  }

  function startDaily() {
    if (!puzzles) return;
    const d = dailyPuzzle(puzzles, todayKey(), rating?.rating ?? RATINGS.start.rating);
    if (d) usePuzzleStore.getState().play(d.puzzle, 'daily');
    else usePuzzleStore.getState().clear();
  }

  function switchMode(m: PuzzleMode) {
    setMode(m);
    if (m === 'rated') {
      if (puzzles && ratingSource) next(puzzles, theme);
      else usePuzzleStore.getState().clear();
    } else if (m === 'mistakes') {
      const list = harvestMistakes(loadHistory(), { userNames: authUser ? [authUser.username] : [] });
      setMistakes(list);
      setMotif(null);
      startMistake(list);
    } else if (m === 'timed') {
      // The timed run keeps its own board; the trainer's puzzle is put away.
      usePuzzleStore.getState().clear();
    } else startDaily();
  }

  const mistakeSource = mode === 'mistakes' && puzzle ? allMistakes.find((p) => p.id === puzzle.id)?.source : undefined;

  // X flips the board for the current puzzle only; the next puzzle starts from the solver's side again.
  const [flippedFor, setFlippedFor] = useState<string | null>(null);
  const puzzleId = puzzle?.id ?? null;
  const onFlip = useCallback(() => setFlippedFor((f) => (f === puzzleId ? null : puzzleId)), [puzzleId]);
  useFlipKey(onFlip);
  // Calculation mode: pieces hide after a look, the line is entered from memory.
  const calc = useCalcMode();

  const themes = useMemo(() => (puzzles ? popularThemes(puzzles) : []), [puzzles]);

  if (data.kind === 'loading') return <p className="p-6 text-center text-sm text-muted">Loading puzzles…</p>;
  if (data.kind === 'error') {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-6">
        <p role="alert" className="text-sm text-danger">{data.message}</p>
        <button
          className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent"
          onClick={() => {
            setData({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (mode === 'timed' && puzzles) {
    return <TimedPuzzles puzzles={puzzles} modeBar={<PuzzleModeBar mode={mode} due={counts.due} onMode={switchMode} />} />;
  }

  // The solver is the side NOT to move in the stored position (the opponent plays first).
  const solverSide = puzzle?.fen.split(' ')[1] === 'w' ? 'black' : 'white';
  const orientation = flippedFor !== null && flippedFor === puzzleId ? (solverSide === 'white' ? 'black' : 'white') : solverSide;
  const shownMove = hintSquare ? { from: hintSquare, to: hintSquare, color: HINT_COLOR } : lastMove;

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        board={
          fen && calc.hidden ? (
            calc.renderBoard(orientation)
          ) : fen ? (
            <Board position={fen} orientation={orientation} lastMove={shownMove} movable={phase === 'solver' && !calc.blocksMoves} onMove={move} id="puzzle-board" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface text-sm text-muted">
              {empty ? 'No puzzle to show' : 'Loading…'}
            </div>
          )
        }
      >
        <FullscreenButton withText className="self-end rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:outline-1 hover:outline-accent" />
        <KeyboardShortcuts page="puzzles" withText className="self-end rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:outline-1 hover:outline-accent" />
      </BoardColumn>
      <div className="flex min-w-0 flex-col gap-3">
      <PuzzleModeBar mode={mode} due={counts.due} onMode={switchMode} />
      <TrainingStreak key={`${record.kind}:${puzzle?.id ?? ''}`} />
      <HomeworkCard />
      {calc.toggle}
      {calc.panel}
      {mode !== 'rated' && (
        <p data-testid="puzzle-source" className="rounded-lg bg-surface p-3 text-sm">
          {mode === 'daily'
            ? `Daily puzzle for ${new Date(`${todayKey()}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · your rating doesn’t change`
            : mistakeSource
              ? `${sourceText(mistakeSource)} (${mistakeSource.label.toLowerCase()})`
              : 'Positions where you went wrong in your reviewed games · your rating doesn’t change'}
        </p>
      )}
      {mode === 'mistakes' && motif && (
        <p data-testid="mistakes-motif" className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface p-3 text-sm">
          <span>
            Only <span className="font-semibold">{MOTIF_NAME[motif].toLowerCase()}</span>: {allMistakes.length} puzzle
            {allMistakes.length === 1 ? '' : 's'} from your games
          </span>
          <button className="text-accent hover:underline" onClick={() => switchMode('mistakes')}>
            Show all my mistakes
          </button>
        </p>
      )}
      {mode === 'mistakes' && !puzzle ? (
        <div data-testid="mistakes-empty" className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm">
          {counts.total === 0 && motif ? (
            <>
              <p className="font-semibold">No puzzles for this one yet</p>
              <p className="text-muted">
                My mistakes only keeps moves the review labelled Mistake, Blunder or Miss and where the better move is
                clear. Your other mistakes are still waiting.
              </p>
            </>
          ) : counts.total === 0 ? (
            <>
              <p className="font-semibold">No mistakes to practise yet</p>
              <p className="text-muted">
                Review your games first: every Mistake, Blunder or Miss you make against a bot (or under your
                account name) becomes a puzzle here.
              </p>
              <a className="text-accent hover:underline" href="#/review/games">Review a game</a>
            </>
          ) : (
            <>
              <p className="font-semibold">All caught up</p>
              <p className="text-muted">
                {counts.learning} learning · {counts.retired} retired
                {counts.nextDue &&
                  ` · next due ${new Date(`${counts.nextDue}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
              </p>
            </>
          )}
        </div>
      ) : (
      <PuzzlePanel
        themes={themes}
        theme={theme}
        onTheme={(t) => {
          setTheme(t);
          if (puzzles) next(puzzles, t);
        }}
        onNext={() => {
          if (mode === 'mistakes') startMistake(allMistakes, puzzle?.id);
          else if (puzzles) switchMode('rated');
        }}
        signedOut={authStatus === 'signed-out'}
        nextLabel={mode === 'mistakes' ? (counts.due > 0 ? `Next mistake (${counts.due} due)` : 'Done for today') : mode === 'daily' ? 'Rated puzzles' : undefined}
        hideThemes={mode !== 'rated'}
        info={mode === 'mistakes' && mistakeSource ? <a className="text-xs text-accent hover:underline" href={`#/review/${encodeURIComponent(mistakeSource.gameId)}`}>Open the game review</a> : undefined}
      />
      )}
      </div>
    </div>
  );
}
