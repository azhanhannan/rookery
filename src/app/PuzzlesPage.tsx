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

type DataState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; set: PuzzleSet };

/** `#/puzzles`: the puzzle trainer (Lichess puzzle database, rated per player). */
export function PuzzlesPage() {
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
    if (puzzles && ratingSource && !puzzle && !empty) next(puzzles, theme);
  }, [puzzles, ratingSource, puzzle, empty, next, theme]);

  // X flips the board for the current puzzle only; the next puzzle starts from the solver's side again.
  const [flippedFor, setFlippedFor] = useState<string | null>(null);
  const puzzleId = puzzle?.id ?? null;
  const onFlip = useCallback(() => setFlippedFor((f) => (f === puzzleId ? null : puzzleId)), [puzzleId]);
  useFlipKey(onFlip);

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

  // The solver is the side NOT to move in the stored position (the opponent plays first).
  const solverSide = puzzle?.fen.split(' ')[1] === 'w' ? 'black' : 'white';
  const orientation = flippedFor !== null && flippedFor === puzzleId ? (solverSide === 'white' ? 'black' : 'white') : solverSide;
  const shownMove = hintSquare ? { from: hintSquare, to: hintSquare, color: HINT_COLOR } : lastMove;

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        board={
          fen ? (
            <Board position={fen} orientation={orientation} lastMove={shownMove} movable={phase === 'solver'} onMove={move} id="puzzle-board" />
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
      <PuzzlePanel
        themes={themes}
        theme={theme}
        onTheme={(t) => {
          setTheme(t);
          if (puzzles) next(puzzles, t);
        }}
        onNext={() => puzzles && next(puzzles, theme)}
        signedOut={authStatus === 'signed-out'}
      />
    </div>
  );
}
