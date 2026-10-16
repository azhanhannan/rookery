// The puzzle trainer's screen state: which puzzle, what the board shows, the timed opponent moves,
// and recording the attempt. Puzzle rules live in ./session (pure); this only sequences them.
import { Chess } from 'chess.js';
import { create } from 'zustand';
import { api } from '../api/client';
import type { PuzzleAttemptResponse, PuzzleRatingRow } from '../api/types';
import { PUZZLES, RATINGS } from '../config/tunables';
import type { MoveInput } from '../game/rules';
import { playSound, soundForMove, type SoundKind } from '../game/sound';
import { loadLocalPuzzleRating, localTriedIds, recordLocalAttempt } from './localRating';
import { recordDailyResult } from './daily';
import { dayKey } from './days';
import { recordMistakeAttempt, scheduleNote } from './spacedRepetition';
import { recordTrainedDay } from './streak';
import { pickPuzzle } from './select';
import { hint, playOpponentReply, showSolution, startSession, trySolverMove, type PuzzleSession } from './session';
import type { Puzzle, PuzzleSet } from './types';

/** Time each move of "Show solution" stays on the board, ms. */
export const SOLUTION_STEP_MS = 600;
/** How long a wrong move stays on the board before it snaps back, ms. */
export const WRONG_MOVE_MS = 700;

const GOOD = 'rgba(76, 175, 80, 0.55)';
const BAD = 'rgba(214, 48, 32, 0.5)';
/** The hint's from-square highlight. */
export const HINT_COLOR = 'rgba(66, 135, 245, 0.5)';

// --- data -------------------------------------------------------------------------------------

let setPromise: Promise<PuzzleSet> | null = null;

/** public/puzzles/puzzles.json, fetched once per page load (a failed fetch can be retried). */
export function loadPuzzleSet(): Promise<PuzzleSet> {
  if (!setPromise) {
    const p = fetch('/puzzles/puzzles.json').then(async (res) => {
      if (!res.ok) throw new Error(`Couldn't load the puzzles (${res.status}).`);
      return (await res.json()) as PuzzleSet;
    });
    setPromise = p;
    p.catch(() => {
      if (setPromise === p) setPromise = null;
    });
  }
  return setPromise;
}

// --- helpers ----------------------------------------------------------------------------------

export type ViewMove = { from: string; to: string; color?: string };
export type Feedback = { kind: 'good' | 'bad' | 'info'; text: string };
export type RecordState =
  | { kind: 'none' }
  | { kind: 'saving' }
  | { kind: 'done'; response: PuzzleAttemptResponse }
  /** A retry: never recorded. */
  | { kind: 'unrated' }
  /** A "My mistakes" or daily puzzle: no rating change; `note` says what happens next. */
  | { kind: 'practice'; note: string }
  | { kind: 'error'; message: string };

/**
 * 'rated': the rated trainer; 'mistakes': puzzles from the player's games (spaced repetition); 'daily': the day's
 * puzzle; 'timed': the timed run (components/TimedPuzzles, which keeps its own state and never uses this store).
 */
export type PuzzleMode = 'rated' | 'mistakes' | 'daily' | 'timed';

/** 'setup': waiting for the opponent's first move. 'opponent': waiting for a reply. 'wrong': a wrong move is on show. */
export type Phase = 'idle' | 'setup' | 'solver' | 'opponent' | 'wrong' | 'solution' | 'ended';

function uciToInput(uci: string): MoveInput {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** The position after `uci`, and the sound it makes; null when illegal. */
function playUci(fen: string, uci: string): { fen: string; sound: SoundKind } | null {
  try {
    const chess = new Chess(fen);
    const m = chess.move(uciToInput(uci));
    const sound: SoundKind = soundForMove(m);
    return { fen: chess.fen(), sound };
  } catch {
    return null;
  }
}

function moveSound(fenBefore: string, uci: string | undefined): SoundKind {
  return (uci && playUci(fenBefore, uci)?.sound) || 'move';
}

/** "1500 → 1512 (+12)", "1500 → 1488? (−12)", or the repeat message. */
export function describePuzzleChange(r: PuzzleAttemptResponse): string {
  if (!r.firstAttempt || !r.rating) return 'Already tried: rating unchanged';
  const { before, after, delta, provisional } = r.rating;
  const d = delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '±0';
  return `${before} → ${after}${provisional ? '?' : ''} (${d})`;
}

/** camelCase Lichess theme → words: "mateIn2" → "Mate in 2", "backRankMate" → "Back rank mate". */
export function prettyTheme(theme: string): string {
  const words = theme
    .replace(/([A-Z])/g, ' $1')
    .replace(/(\d+)/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- timers -----------------------------------------------------------------------------------

// Every scheduled step belongs to one "generation"; starting another puzzle (or leaving the page)
// bumps it, so a stale opponent move can never land on the next puzzle.
let generation = 0;
const timers = new Set<number>();

function later(fn: () => void, ms: number): void {
  const gen = generation;
  const id = window.setTimeout(() => {
    timers.delete(id);
    if (gen === generation) fn();
  }, ms);
  timers.add(id);
}

function cancelTimers(): void {
  generation++;
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

// --- store ------------------------------------------------------------------------------------

type PuzzleState = {
  /** null until the rating source has answered. */
  ratingSource: 'server' | 'local' | null;
  rating: PuzzleRatingRow | null;
  /** Puzzles already tried, so they aren't offered again. */
  recent: ReadonlySet<string>;

  puzzle: Puzzle | null;
  /** null while the set-up move is still to come. */
  session: PuzzleSession | null;
  /** What the board shows (differs from the session while a wrong move is on show). */
  fen: string | null;
  lastMove: ViewMove | null;
  phase: Phase;
  feedback: Feedback | null;
  hintSquare: string | null;
  /** False for a retry. */
  rated: boolean;
  record: RecordState;
  /** Set when no puzzle matches (e.g. an empty theme). */
  empty: boolean;
  /** What the current puzzle is for; only 'rated' changes the puzzle rating. */
  mode: PuzzleMode;

  loadRating: (signedIn: boolean) => Promise<void>;
  /** Picks the next puzzle near the rating (optionally a theme) and starts it. */
  next: (puzzles: Puzzle[], theme: string) => void;
  /** Same puzzle again, unrated. */
  retry: () => void;
  move: (input: MoveInput) => boolean;
  hint: () => void;
  showSolution: () => void;
  /** Stops pending moves (leaving the page). */
  stop: () => void;
  /** Starts this puzzle in a non-rated mode (My mistakes, Daily): the result never touches the rating. */
  play: (puzzle: Puzzle, mode: Exclude<PuzzleMode, 'rated' | 'timed'>) => void;
  /** Clears the board (keeping the rating), e.g. when no mistake is due. */
  clear: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => {
  function begin(puzzle: Puzzle, rated: boolean) {
    cancelTimers();
    set({
      puzzle,
      session: null,
      fen: puzzle.fen,
      lastMove: null,
      phase: 'setup',
      feedback: null,
      hintSquare: null,
      rated,
      record: rated ? { kind: 'none' } : { kind: 'unrated' },
      empty: false,
    });
    later(() => {
      const session = startSession(puzzle);
      playSound(moveSound(puzzle.fen, puzzle.moves[0]));
      set({ session, fen: session.fen, lastMove: session.lastMove, phase: 'solver' });
    }, PUZZLES.opponentDelayMs);
  }

  /** Records the finished attempt once (never for a retry). */
  function finish(session: PuzzleSession, solved: boolean) {
    const { rated, record, ratingSource, rating, mode } = get();
    if (solved) recordTrainedDay();
    if (!rated || record.kind !== 'none') return;
    const puzzle = session.puzzle;
    const clean = solved && !session.usedHelp;
    if (mode !== 'rated') {
      const today = dayKey(new Date());
      if (mode === 'mistakes') {
        const state = recordMistakeAttempt(puzzle.id, clean, today);
        set({ record: { kind: 'practice', note: `${clean ? 'Solved first try' : 'Not this time'}: ${scheduleNote(state, today).toLowerCase()}` } });
      } else {
        recordDailyResult(today, puzzle.id, clean);
        set({ record: { kind: 'practice', note: clean ? 'Daily puzzle solved' : 'Daily puzzle: not this time. Retry it, or come back tomorrow for a new one' } });
      }
      return;
    }
    const recent = new Set(get().recent).add(puzzle.id);

    if (ratingSource === 'server') {
      set({ record: { kind: 'saving' }, recent });
      api
        .puzzleAttempt(puzzle.id, { solved: clean })
        .then((response) => {
          if (get().puzzle?.id !== puzzle.id) return;
          const after = response.rating;
          set({
            record: { kind: 'done', response },
            rating:
              response.firstAttempt && after
                ? {
                    rating: after.after,
                    rd: rating?.rd ?? RATINGS.start.rd,
                    attempts: (rating?.attempts ?? 0) + 1,
                    solved: (rating?.solved ?? 0) + (clean ? 1 : 0),
                    provisional: after.provisional,
                  }
                : get().rating,
          });
          // The exact row (RD included) from the server; the optimistic one stands if this fails.
          api
            .puzzleMe()
            .then((me) => set({ rating: me.rating ?? get().rating, recent: new Set([...me.triedIds, ...get().recent]) }))
            .catch(() => {});
        })
        .catch((e: unknown) => {
          if (get().puzzle?.id === puzzle.id) set({ record: { kind: 'error', message: errorMessage(e) } });
        });
      return;
    }

    try {
      const response = recordLocalAttempt(puzzle, clean);
      set({
        record: { kind: 'done', response },
        rating: loadLocalPuzzleRating(),
        recent: new Set([...localTriedIds(), ...recent]),
      });
    } catch (e) {
      set({ record: { kind: 'error', message: errorMessage(e) }, recent });
    }
  }

  return {
    ratingSource: null,
    rating: null,
    recent: new Set(),
    puzzle: null,
    session: null,
    fen: null,
    lastMove: null,
    phase: 'idle',
    feedback: null,
    hintSquare: null,
    rated: true,
    record: { kind: 'none' },
    empty: false,
    mode: 'rated',

    async loadRating(signedIn) {
      if (signedIn) {
        try {
          const me = await api.puzzleMe();
          set({ ratingSource: 'server', rating: me.rating, recent: new Set(me.triedIds) });
          return;
        } catch {
          // server unreachable: rate on this device instead
        }
      }
      let rating: PuzzleRatingRow | null = null;
      let tried: string[] = [];
      try {
        rating = loadLocalPuzzleRating();
        tried = localTriedIds();
      } catch {
        // no stored rating
      }
      set({ ratingSource: 'local', rating, recent: new Set(tried) });
    },

    next(puzzles, theme) {
      set({ mode: 'rated' });
      const { rating, recent, puzzle: current } = get();
      const r = rating?.rating ?? RATINGS.start.rating;
      const opts = { theme: theme || undefined };
      // Prefer untried puzzles; once a theme (or the set) is used up, repeats are fine: they're unrated.
      const p =
        pickPuzzle(puzzles, r, { ...opts, recent: current ? new Set([...recent, current.id]) : recent }) ??
        (current ? pickPuzzle(puzzles, r, { ...opts, recent: new Set([current.id]) }) : null) ??
        pickPuzzle(puzzles, r, opts);
      if (!p) {
        cancelTimers();
        set({ puzzle: null, session: null, fen: null, lastMove: null, phase: 'idle', feedback: null, hintSquare: null, empty: true });
        return;
      }
      begin(p, true);
    },

    play(puzzle, mode) {
      set({ mode });
      begin(puzzle, true);
    },

    clear() {
      cancelTimers();
      set({ puzzle: null, session: null, fen: null, lastMove: null, phase: 'idle', feedback: null, hintSquare: null, empty: false });
    },

    retry() {
      const { puzzle } = get();
      if (puzzle) begin(puzzle, false);
    },

    move(input) {
      const { session, phase } = get();
      if (!session || phase !== 'solver') return false;
      const uci = `${input.from}${input.to}${input.promotion ?? ''}`;
      const res = trySolverMove(session, uci);
      if (!res) return false;

      if (res.result === 'wrong') {
        // The session stays on the wrong move (showSolution rewinds from there); the board shows it
        // briefly, then goes back to the position before it.
        const failed = res.session;
        playSound(moveSound(session.fen, uci));
        set({
          session: failed,
          fen: failed.fen,
          lastMove: { from: input.from, to: input.to, color: BAD },
          phase: 'wrong',
          feedback: { kind: 'bad', text: 'Not the move' },
          hintSquare: null,
        });
        finish(failed, false);
        later(() => set({ fen: session.fen, lastMove: session.lastMove, phase: 'ended' }), WRONG_MOVE_MS);
        return true;
      }

      const s = res.session;
      const view = { fen: s.fen, lastMove: s.lastMove ? { ...s.lastMove, color: GOOD } : null, hintSquare: null };
      if (res.result === 'solved') {
        playSound('end');
        set({ ...view, session: s, phase: 'ended', feedback: { kind: 'good', text: 'Solved!' } });
        finish(s, true);
        return true;
      }

      playSound(moveSound(session.fen, uci));
      set({ ...view, session: s, phase: 'opponent', feedback: { kind: 'good', text: 'Best move!' } });
      later(() => {
        const cur = get().session;
        if (!cur) return;
        const replied = playOpponentReply(cur);
        playSound(moveSound(cur.fen, cur.puzzle.moves[cur.next]));
        set({ session: replied, fen: replied.fen, lastMove: replied.lastMove, phase: 'solver' });
      }, PUZZLES.opponentDelayMs);
      return true;
    },

    hint() {
      const { session, phase } = get();
      if (!session || phase !== 'solver') return;
      const h = hint(session);
      set({ session: h.session, hintSquare: h.from });
    },

    showSolution() {
      const { session, phase, feedback, fen: shownFen } = get();
      if (!session || session.status === 'solved' || (phase !== 'solver' && phase !== 'ended')) return;
      const wasPlaying = session.status === 'playing';
      const steps = showSolution(session);
      cancelTimers();
      const last = steps[steps.length - 1];
      const final: PuzzleSession = last ?? { ...session, status: 'failed', usedHelp: true };
      set({ session: final, phase: 'solution', hintSquare: null });
      if (wasPlaying) finish(final, false);
      steps.forEach((step, i) => {
        later(() => {
          const prevFen = i === 0 ? (shownFen ?? session.fen) : steps[i - 1].fen;
          playSound(moveSound(prevFen, step.puzzle.moves[step.next - 1]));
          set({ fen: step.fen, lastMove: step.lastMove });
        }, SOLUTION_STEP_MS * i + (i === 0 ? 150 : 0));
      });
      later(
        () => set({ phase: 'ended', feedback: feedback ?? { kind: 'info', text: 'Solution shown' } }),
        SOLUTION_STEP_MS * Math.max(steps.length - 1, 0) + 200,
      );
    },

    stop() {
      cancelTimers();
      set({ ratingSource: null, puzzle: null, session: null, fen: null, lastMove: null, phase: 'idle', feedback: null, hintSquare: null, empty: false });
    },
  };
});
