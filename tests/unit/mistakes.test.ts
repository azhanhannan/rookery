import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISTAKES } from '../../src/config/tunables';
import type { GameRecord } from '../../src/game/types';
import { dailyPuzzle, loadDaily, pickDaily, recordDailyResult } from '../../src/puzzles/daily';
import { addDays, dayKey, daysBetween, weekStart } from '../../src/puzzles/days';
import {
  harvestMistakes,
  mistakeId,
  positionKey,
  reviewedOfLast,
  solutionLine,
  sourceText,
  userColorOf,
} from '../../src/puzzles/harvest';
import { playOpponentReply, startSession, trySolverMove } from '../../src/puzzles/session';
import {
  dueItems,
  isDue,
  loadSchedule,
  mistakeCounts,
  recordMistakeAttempt,
  schedule,
  scheduleNote,
} from '../../src/puzzles/spacedRepetition';
import { computeStreak, loadTrainedDays, recordTrainedDay } from '../../src/puzzles/streak';
import type { Puzzle } from '../../src/puzzles/types';
import { usePuzzleStore } from '../../src/puzzles/puzzleStore';
import type { Score } from '../../src/engine/types';
import type { GameReview, MoveLabel, MoveReview, PositionReview } from '../../src/review/types';
import { play } from './helpers';

// --- fixtures -----------------------------------------------------------------------------------

type Annot = { label: MoveLabel; best: string; line?: string[]; score?: Score };

/** A finished game with a hand-made review: `annots[ply]` marks a move and the best move before it. */
function reviewed(
  ucis: string[],
  annots: Record<number, Annot>,
  opts: { id?: string; createdAt?: string; white?: GameRecord['white']; black?: GameRecord['black'] } = {},
): GameRecord {
  const base = play(ucis);
  const fens = [base.startFen, ...base.moves.map((m) => m.fenAfter)];
  const positions: PositionReview[] = fens.map((fen, i) => {
    const a = annots[i + 1];
    return {
      fen,
      winWhite: 50,
      score: a?.score ?? { cp: 0 },
      bestMove: a?.best ?? ucis[i],
      bestLine: a?.line ?? (a ? [a.best] : ucis[i] ? [ucis[i]] : []),
    };
  });
  const moves: MoveReview[] = base.moves.map((m, i) => ({
    ply: i + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san: m.san,
    uci: m.uci,
    label: annots[i + 1]?.label ?? 'Best',
    winBefore: 50,
    winAfter: 50,
    loss: 0,
    accuracy: 100,
    explanation: '',
  }));
  const review = { version: 1, depth: 12, createdAt: '2026-10-12T10:00:00Z', positions, moves } as unknown as GameReview;
  return {
    ...base,
    id: opts.id ?? 'g1',
    createdAt: opts.createdAt ?? '2026-10-12T10:00:00Z',
    result: '1-0',
    white: opts.white ?? { name: 'Bot 1100', isBot: true, elo: 1100 },
    black: opts.black ?? { name: 'You', isBot: false },
    review,
  };
}

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#  — the player is Black (vs the bot).
const SCHOLAR = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
const scholarGame = (extra: Partial<Parameters<typeof reviewed>[2]> = {}) =>
  reviewed(SCHOLAR, { 6: { label: 'Blunder', best: 'g7g6' }, 7: { label: 'Mistake', best: 'h5f7' } }, extra);

/** White mates in 2: 1.Re8+ Rxe8 2.Rxe8#. */
const MATE2_FEN = 'r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1';

// --- days ---------------------------------------------------------------------------------------

describe('days', () => {
  it('keys, adds and diffs local days across month ends', () => {
    expect(dayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-22')).toBe(21);
    expect(weekStart('2026-10-15')).toBe('2026-10-12'); // Thursday → Monday
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday → same week
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
});

// --- harvest -----------------------------------------------------------------------------------

describe('harvestMistakes', () => {
  it("turns the player's Mistake/Blunder/Miss into puzzles, never the opponent's", () => {
    const [p, ...rest] = harvestMistakes([scholarGame()]);
    expect(rest).toEqual([]); // the bot's 4.Qxf7 "Mistake" is ignored
    expect(p.source).toMatchObject({ gameId: 'g1', ply: 6, opponent: 'Bot 1100', playedSan: 'Nf6', label: 'Blunder', color: 'b' });
    expect(p.moves).toEqual(['f1c4', 'g7g6']); // set-up move = the bot's 3.Bc4, then the best move
    expect(p.fen).toBe(play(SCHOLAR.slice(0, 4)).moves[3].fenAfter);
    expect(p.id).toBe(mistakeId('g1', play(SCHOLAR.slice(0, 5)).moves[4].fenAfter));
  });

  it('plays as a puzzle: the set-up move, then the best move solves it', () => {
    const [p] = harvestMistakes([scholarGame()]);
    const s = startSession(p);
    expect(s.solverColor).toBe('b');
    expect(trySolverMove(s, 'g8f6')?.result).toBe('wrong');
    expect(trySolverMove(s, 'g7g6')?.result).toBe('solved');
  });

  it('skips unreviewed games, stale reviews and games where the player is unknown', () => {
    const g = scholarGame();
    expect(harvestMistakes([{ ...g, review: undefined }])).toEqual([]);
    expect(harvestMistakes([{ ...g, moves: g.moves.slice(0, 5) }])).toEqual([]);
    const friends = scholarGame({ white: { name: 'Ann', isBot: false }, black: { name: 'Bob', isBot: false } });
    expect(harvestMistakes([friends])).toEqual([]);
    // ...unless the account name says which side is the player's.
    expect(harvestMistakes([friends], { userNames: ['bob'] })).toHaveLength(1);
    expect(harvestMistakes([friends], { userNames: ['ann'] })).toEqual([]); // Ann (White) made no mistake
  });

  it('dedupes the same position across games, keeping the oldest game', () => {
    const older = scholarGame({ id: 'old', createdAt: '2026-10-01T10:00:00Z' });
    const newer = scholarGame({ id: 'new', createdAt: '2026-10-10T10:00:00Z' });
    const out = harvestMistakes([newer, older]);
    expect(out).toHaveLength(1);
    expect(out[0].source.gameId).toBe('old');
  });

  it('skips a best move that is illegal or the move actually played', () => {
    const bad = reviewed(SCHOLAR, { 6: { label: 'Blunder', best: 'a1a8' } });
    expect(harvestMistakes([bad])).toEqual([]);
    const same = reviewed(SCHOLAR, { 6: { label: 'Mistake', best: 'g8f6' } });
    expect(harvestMistakes([same])).toEqual([]);
  });

  it('identifies the player: non-bot side, else a matching name', () => {
    const g = scholarGame();
    expect(userColorOf(g)).toBe('b');
    const people = { ...g, white: { name: 'Ann', isBot: false }, black: { name: 'Bob', isBot: false } };
    expect(userColorOf(people)).toBeNull();
    expect(userColorOf(people, [' ANN '])).toBe('w');
    expect(userColorOf({ ...people, black: { name: 'ann', isBot: false } }, ['ann'])).toBeNull();
  });

  it('describes the source', () => {
    const [p] = harvestMistakes([scholarGame()]);
    const text = sourceText(p.source, new Date('2026-10-15T00:00:00Z'));
    expect(text).toMatch(/^From your game vs Bot 1100, .+ — you played Nf6$/);
    expect(text).toContain('Oct');
  });

  it('positionKey ignores the move counters', () => {
    expect(positionKey('8/8/8/8/8/8/8/K6k w - - 3 40')).toBe(positionKey('8/8/8/8/8/8/8/K6k w - - 0 1'));
  });
});

describe('solutionLine', () => {
  const pos = (score: Score, line: string[]): PositionReview => ({ fen: MATE2_FEN, score, winWhite: 100, bestMove: line[0], bestLine: line });

  it('follows the line of a forced mate for the solver', () => {
    expect(solutionLine(pos({ mate: 2 }, ['e2e8', 'a8e8', 'e1e8']), 'w')).toEqual(['e2e8', 'a8e8', 'e1e8']);
  });

  it('stops at the best move when the line is not a mate for the solver', () => {
    expect(solutionLine(pos({ cp: 900 }, ['e2e8', 'a8e8', 'e1e8']), 'w')).toEqual(['e2e8']);
    expect(solutionLine(pos({ mate: -2 }, ['e2e8', 'a8e8', 'e1e8']), 'w')).toEqual(['e2e8']);
  });

  it('cuts an illegal continuation and never ends on the opponent', () => {
    expect(solutionLine(pos({ mate: 2 }, ['e2e8', 'a8e8', 'h2h8']), 'w')).toEqual(['e2e8']);
    expect(solutionLine(pos({ mate: 2 }, ['e2e8', 'a8e8']), 'w')).toEqual(['e2e8']);
  });

  it('caps the solver moves', () => {
    const line = solutionLine(pos({ mate: 2 }, ['e2e8', 'a8e8', 'e1e8']), 'w')!;
    expect(line.filter((_, i) => i % 2 === 0).length).toBeLessThanOrEqual(MISTAKES.maxSolverMoves);
  });

  it('a mate line plays through as a puzzle', () => {
    // Set-up: a black king move, then White mates in 2.
    const puzzle: Puzzle = { id: 'x', fen: 'r6k/5ppp/8/8/8/8/4RPPP/4R1K1 b - - 0 1', moves: ['h8g8', 'e2e8', 'a8e8', 'e1e8'], rating: 0, themes: [] };
    const s = startSession(puzzle);
    expect(s.fen).toBe(MATE2_FEN.replace(' 0 1', ' 1 2'));
    const r1 = trySolverMove(s, 'e2e8')!;
    expect(r1.result).toBe('correct');
    expect(trySolverMove(playOpponentReply(r1.session), 'e1e8')?.result).toBe('solved');
  });
});

describe('reviewedOfLast', () => {
  it('counts reviewed games among the last N finished ones', () => {
    const g = scholarGame();
    const games = [
      { ...g, id: 'a', createdAt: '2026-10-01T00:00:00Z' },
      { ...g, id: 'b', createdAt: '2026-10-02T00:00:00Z', review: undefined },
      { ...g, id: 'c', createdAt: '2026-10-03T00:00:00Z' },
      { ...g, id: 'd', createdAt: '2026-10-04T00:00:00Z', result: '*' as const },
    ];
    expect(reviewedOfLast(games, 5)).toEqual({ reviewed: 2, total: 3 });
    expect(reviewedOfLast(games, 2)).toEqual({ reviewed: 1, total: 2 }); // c and b
    expect(reviewedOfLast([], 5)).toEqual({ reviewed: 0, total: 0 });
  });
});

// --- spaced repetition -------------------------------------------------------------------------

describe('spaced repetition', () => {
  const T = '2026-10-15';

  it('walks the intervals on clean solves and retires after the last', () => {
    let s = schedule(undefined, true, T, [1, 3, 7, 21]);
    expect(s).toEqual({ stage: 1, due: '2026-10-16', retired: false });
    s = schedule(s, true, '2026-10-16', [1, 3, 7, 21]);
    expect(s.due).toBe('2026-10-19');
    s = schedule(s, true, '2026-10-19', [1, 3, 7, 21]);
    expect(s.due).toBe('2026-10-26');
    s = schedule(s, true, '2026-10-26', [1, 3, 7, 21]);
    expect(s.due).toBe('2026-11-16');
    expect(s.retired).toBe(false);
    s = schedule(s, true, '2026-11-16', [1, 3, 7, 21]);
    expect(s.retired).toBe(true);
    expect(isDue(s, '2027-01-01')).toBe(false);
  });

  it('a fail (or a hint) goes back to one day', () => {
    const mid = { stage: 3, due: T, retired: false };
    expect(schedule(mid, false, T, [1, 3, 7, 21])).toEqual({ stage: 0, due: '2026-10-16', retired: false });
  });

  it('new and overdue puzzles are due; overdue ones come first', () => {
    const items = [{ id: 'new' }, { id: 'later' }, { id: 'old' }, { id: 'today' }, { id: 'gone' }];
    const sched = {
      later: { stage: 1, due: '2026-10-20', retired: false },
      old: { stage: 1, due: '2026-10-01', retired: false },
      today: { stage: 2, due: T, retired: false },
      gone: { stage: 5, due: '2026-10-01', retired: true },
    };
    expect(dueItems(items, sched, T).map((p) => p.id)).toEqual(['old', 'today', 'new']);
    expect(mistakeCounts(items, sched, T)).toEqual({ total: 5, due: 3, learning: 1, retired: 1, nextDue: '2026-10-20' });
  });

  it('describes the next showing', () => {
    expect(scheduleNote({ stage: 1, due: '2026-10-16', retired: false }, T)).toBe('Next review tomorrow');
    expect(scheduleNote({ stage: 2, due: '2026-10-18', retired: false }, T)).toBe('Next review in 3 days');
    expect(scheduleNote({ stage: 5, due: T, retired: true }, T)).toMatch(/^Retired/);
  });

  describe('storage', () => {
    beforeEach(() => localStorage.clear());

    it('records attempts per id and survives junk', () => {
      expect(recordMistakeAttempt('a', true, T).due).toBe(addDays(T, MISTAKES.intervals[0]));
      recordMistakeAttempt('b', false, T);
      expect(Object.keys(loadSchedule()).sort()).toEqual(['a', 'b']);
      localStorage.setItem('rookery.mistakes', '{nope');
      expect(loadSchedule()).toEqual({});
      localStorage.setItem('rookery.mistakes', JSON.stringify({ a: { stage: 'x' }, b: { stage: 1, due: T, retired: false } }));
      expect(Object.keys(loadSchedule())).toEqual(['b']);
    });
  });
});

// --- streak ---------------------------------------------------------------------------------------

describe('computeStreak', () => {
  // 2026-10-12 is a Monday.
  const T = '2026-10-15'; // Thursday

  it('counts consecutive trained days ending today', () => {
    expect(computeStreak(['2026-10-13', '2026-10-14', T], T, 1)).toMatchObject({ days: 3, trainedToday: true, restDays: [] });
  });

  it('today not trained yet keeps the run from yesterday', () => {
    expect(computeStreak(['2026-10-13', '2026-10-14'], T, 1)).toMatchObject({ days: 2, trainedToday: false });
  });

  it('one missed day a week is a rest day', () => {
    const s = computeStreak(['2026-10-12', '2026-10-14', T], T, 1);
    expect(s).toMatchObject({ days: 3, restDays: ['2026-10-13'], restUsedThisWeek: true });
  });

  it('a second missed day in the same week ends it', () => {
    // Wed 10-14 and Mon 10-12 both missed: only one rest day this week.
    expect(computeStreak(['2026-10-11', '2026-10-13', T], T, 1)).toMatchObject({ days: 2, restDays: ['2026-10-14'] });
    // Two missed in a row always end it.
    expect(computeStreak(['2026-10-11', '2026-10-14', T], T, 1)).toMatchObject({ days: 2, restDays: [] });
  });

  it('a missed day across weeks uses each week’s rest day', () => {
    // Sat 10-10 trained, Sun 10-11 missed (last week's rest), Mon 10-12 trained, Tue 10-13 missed (this week's).
    const s = computeStreak(['2026-10-10', '2026-10-12', '2026-10-14', T], T, 1);
    expect(s.days).toBe(4);
    expect(s.restDays).toEqual(['2026-10-13', '2026-10-11']);
  });

  it('yesterday missed with today still open survives on the rest day', () => {
    const s = computeStreak(['2026-10-12', '2026-10-13'], T, 1);
    expect(s).toMatchObject({ days: 2, trainedToday: false, restDays: ['2026-10-14'] });
  });

  it('no rest days allowed, or nothing trained', () => {
    expect(computeStreak(['2026-10-12', '2026-10-14', T], T, 0).days).toBe(2);
    expect(computeStreak([], T, 1)).toMatchObject({ days: 0, restDays: [], restUsedThisWeek: false });
    expect(computeStreak(['2026-09-01'], T, 1)).toMatchObject({ days: 0, restDays: [] });
  });

  describe('storage', () => {
    beforeEach(() => localStorage.clear());

    it('records each day once', () => {
      recordTrainedDay(new Date(2026, 9, 14, 9));
      recordTrainedDay(new Date(2026, 9, 15, 9));
      recordTrainedDay(new Date(2026, 9, 15, 21));
      expect(loadTrainedDays()).toEqual(['2026-10-14', '2026-10-15']);
      localStorage.setItem('rookery.trainedDays', 'junk');
      expect(loadTrainedDays()).toEqual([]);
    });
  });
});

// --- daily -------------------------------------------------------------------------------------

describe('daily puzzle', () => {
  const set: Puzzle[] = Array.from({ length: 40 }, (_, i) => ({
    id: `p${String(i).padStart(2, '0')}`,
    fen: '8/8/8/8/8/8/8/K6k w - - 0 1',
    moves: [],
    rating: 800 + i * 50,
    themes: [],
  }));

  it('is deterministic per day and near the rating', () => {
    const a = pickDaily(set, '2026-10-15', 1500)!;
    expect(pickDaily([...set].reverse(), '2026-10-15', 1500)!.id).toBe(a.id);
    expect(Math.abs(a.rating - 1500)).toBeLessThanOrEqual(MISTAKES.dailyWindow);
    const days = Array.from({ length: 10 }, (_, i) => pickDaily(set, addDays('2026-10-01', i), 1500)!.id);
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(pickDaily([], '2026-10-15', 1500)).toBeNull();
    // Far from every puzzle: the window widens.
    expect(pickDaily(set, '2026-10-15', 4000)).not.toBeNull();
  });

  describe('storage', () => {
    beforeEach(() => localStorage.clear());

    it('pins the day’s pick and records the result', () => {
      const first = dailyPuzzle(set, '2026-10-15', 1500)!;
      // A rating change later that day keeps the same puzzle.
      expect(dailyPuzzle(set, '2026-10-15', 900)!.puzzle.id).toBe(first.puzzle.id);
      recordDailyResult('2026-10-15', first.puzzle.id, true);
      expect(dailyPuzzle(set, '2026-10-15', 1500)!.solved).toBe(true);
      recordDailyResult('2026-10-15', first.puzzle.id, false); // a later fail doesn't undo it
      expect(loadDaily()!.solved).toBe(true);
      expect(dailyPuzzle(set, '2026-10-16', 1500)!.solved).toBe(false);
    });
  });
});

// --- store: non-rated modes -------------------------------------------------------------------

describe('puzzle store: My mistakes mode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 10));
  });
  afterEach(() => {
    usePuzzleStore.getState().stop();
    vi.useRealTimers();
  });

  it('schedules the mistake, marks the day trained and leaves the rating alone', () => {
    const [p] = harvestMistakes([scholarGame()]);
    usePuzzleStore.getState().play(p, 'mistakes');
    vi.runAllTimers(); // the set-up move
    expect(usePuzzleStore.getState().phase).toBe('solver');
    expect(usePuzzleStore.getState().move({ from: 'g7', to: 'g6' })).toBe(true);
    const { record, mode } = usePuzzleStore.getState();
    expect(mode).toBe('mistakes');
    expect(record).toEqual({ kind: 'practice', note: 'Solved first try: next review tomorrow' });
    expect(loadSchedule()[p.id]).toEqual({ stage: 1, due: '2026-10-16', retired: false });
    expect(loadTrainedDays()).toEqual(['2026-10-15']);
    expect(localStorage.getItem('rookery.puzzles')).toBeNull();
  });

  it('a hint sends it back to one day', () => {
    const [p] = harvestMistakes([scholarGame()]);
    recordMistakeAttempt(p.id, true, '2026-10-10');
    recordMistakeAttempt(p.id, true, '2026-10-11');
    usePuzzleStore.getState().play(p, 'mistakes');
    vi.runAllTimers();
    usePuzzleStore.getState().hint();
    usePuzzleStore.getState().move({ from: 'g7', to: 'g6' });
    expect(loadSchedule()[p.id]).toEqual({ stage: 0, due: '2026-10-16', retired: false });
  });
});
