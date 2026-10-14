import { describePuzzleChange, prettyTheme, usePuzzleStore } from '../puzzles/puzzleStore';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

type Props = {
  themes: { theme: string; count: number }[];
  /** '' = any theme. */
  theme: string;
  onTheme: (theme: string) => void;
  onNext: () => void;
  signedOut: boolean;
};

/** The trainer's side panel: rating, prompt, feedback, controls and credits. */
export function PuzzlePanel({ themes, theme, onTheme, onNext, signedOut }: Props) {
  const rating = usePuzzleStore((s) => s.rating);
  const ratingSource = usePuzzleStore((s) => s.ratingSource);
  const puzzle = usePuzzleStore((s) => s.puzzle);
  const session = usePuzzleStore((s) => s.session);
  const phase = usePuzzleStore((s) => s.phase);
  const feedback = usePuzzleStore((s) => s.feedback);
  const record = usePuzzleStore((s) => s.record);
  const empty = usePuzzleStore((s) => s.empty);
  const { hint, showSolution, retry } = usePuzzleStore.getState();

  const solverName = puzzle?.fen.split(' ')[1] === 'w' ? 'Black' : 'White';
  const ended = phase === 'ended' || phase === 'solution' || phase === 'wrong';
  const failed = session?.status === 'failed';

  const prompt = !puzzle
    ? empty
      ? theme
        ? `No puzzles with the theme "${prettyTheme(theme)}"`
        : 'No puzzles available'
      : 'Choosing a puzzle…'
    : phase === 'setup'
      ? 'Watch the opponent’s move…'
      : phase === 'solver' || phase === 'opponent'
        ? `Your turn: find the best move for ${solverName}`
        : session?.status === 'solved'
          ? 'Puzzle complete'
          : 'Puzzle over';

  const feedbackClass =
    feedback?.kind === 'good' ? 'bg-accent text-accent-ink' : feedback?.kind === 'bad' ? 'bg-danger text-white' : 'bg-surface';

  return (
    <aside className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 rounded-lg bg-surface p-3">
        <span className="text-sm text-muted">
          Puzzle rating{ratingSource === 'local' && !signedOut ? ' (this device)' : ''}
        </span>
        <span
          data-testid="puzzle-rating"
          className="text-2xl font-bold tabular-nums"
          title={!rating || rating.provisional ? 'Provisional: the rating settles after more puzzles' : undefined}
        >
          {rating ? rating.rating : 1500}
          {(!rating || rating.provisional) && <span className="text-muted">?</span>}
        </span>
      </div>

      <h2 className="rounded-lg bg-surface p-3 text-center font-semibold">{prompt}</h2>

      <div
        role="status"
        data-testid="puzzle-feedback"
        className={`min-h-11 rounded-lg p-3 text-center font-semibold ${feedback ? feedbackClass : 'invisible'}`}
      >
        {feedback?.text}
      </div>

      {record.kind === 'done' && (
        <div data-testid="puzzle-rating-change" className="rounded-lg bg-surface p-3 text-center text-sm font-semibold tabular-nums">
          {describePuzzleChange(record.response)}
        </div>
      )}
      {record.kind === 'saving' && <p className="text-center text-xs text-muted">Saving the result…</p>}
      {record.kind === 'error' && (
        <p role="alert" className="text-center text-xs text-danger">
          The result wasn’t saved: {record.message}
        </p>
      )}
      {record.kind === 'unrated' && <p className="text-center text-xs text-muted">Retry: this attempt is not rated</p>}

      <div className="grid grid-cols-2 gap-2">
        <button className={btn} onClick={hint} disabled={phase !== 'solver'}>
          Hint
        </button>
        <button
          className={btn}
          onClick={showSolution}
          disabled={!session || session.status === 'solved' || (phase !== 'solver' && phase !== 'ended')}
        >
          Show solution
        </button>
        {failed && ended && (
          <button className={btn} onClick={retry} disabled={phase !== 'ended'}>
            Retry
          </button>
        )}
        <button
          className={`rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink ${failed && ended ? '' : 'col-span-2'}`}
          onClick={onNext}
        >
          Next puzzle
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted">Theme</span>
        <select
          className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-2 text-sm"
          value={theme}
          onChange={(e) => onTheme(e.target.value)}
        >
          <option value="">Any</option>
          {themes.map((t) => (
            <option key={t.theme} value={t.theme}>
              {prettyTheme(t.theme)}
            </option>
          ))}
        </select>
      </label>

      {puzzle && ended && (
        <p data-testid="puzzle-info" className="text-xs text-muted">
          Puzzle {puzzle.id} · rated {puzzle.rating} ·{' '}
          <a className="underline underline-offset-2 hover:text-ink" href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
            View on Lichess
          </a>
        </p>
      )}

      {signedOut && (
        <p className="text-xs text-muted">
          <a href="#/login" className="text-accent hover:underline">Sign in</a> to keep your puzzle rating on your account
        </p>
      )}

      <p className="text-xs text-muted">
        Puzzles from the{' '}
        <a className="underline underline-offset-2 hover:text-ink" href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">
          Lichess puzzle database
        </a>{' '}
        (CC0)
      </p>
    </aside>
  );
}
