import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUZZLES, RATINGS } from '../../src/config/tunables';
import { localTriedIds, loadLocalPuzzleRating, recordLocalAttempt } from '../../src/puzzles/localRating';
import { pickPuzzle, popularThemes } from '../../src/puzzles/select';
import {
  hint,
  playOpponentReply,
  showSolution,
  startSession,
  trySolverMove,
  type PuzzleSession,
} from '../../src/puzzles/session';
import type { Puzzle } from '../../src/puzzles/types';
import { rateGame } from '../../src/rating/glicko';
import {
  ALL_PUZZLES,
  FORK,
  LONG,
  MATE_IN_1,
  MATE_IN_1_WHITE,
  MATE_IN_2_ALT,
  MATE_IN_3,
  PROMOTION,
} from '../fixtures/puzzles';

/** The position after the first `n` solution moves. */
function fenAfter(p: Puzzle, n: number): string {
  const chess = new Chess(p.fen);
  for (const uci of p.moves.slice(0, n)) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return chess.fen();
}

/** Plays the whole solution as the solver would, checking each step. */
function solve(p: Puzzle): PuzzleSession {
  let s = startSession(p);
  for (let i = 1; i < p.moves.length; i += 2) {
    const r = trySolverMove(s, p.moves[i]);
    expect(r).not.toBeNull();
    const last = i === p.moves.length - 1;
    expect(r!.result).toBe(last ? 'solved' : 'correct');
    s = last ? r!.session : playOpponentReply(r!.session);
  }
  return s;
}

describe('puzzle fixtures', () => {
  it('every fixture replays and ends on the solver (even move count)', () => {
    for (const p of ALL_PUZZLES) {
      expect(p.moves.length % 2, p.id).toBe(0);
      expect(() => fenAfter(p, p.moves.length), p.id).not.toThrow();
    }
  });
});

describe('startSession', () => {
  it("plays the opponent's set-up move; the solver is the side to move after it", () => {
    const s = startSession(MATE_IN_1);
    expect(s.fen).toBe(fenAfter(MATE_IN_1, 1));
    expect(s.next).toBe(1);
    expect(s.solverColor).toBe('b');
    expect(s.status).toBe('playing');
    expect(s.lastMove).toEqual({ from: 'f2', to: 'f4' });
    expect(s.usedHelp).toBe(false);
    expect(startSession(MATE_IN_1_WHITE).solverColor).toBe('w');
  });

  it('throws on broken puzzle data', () => {
    expect(() => startSession({ ...MATE_IN_1, moves: ['a1a8', 'g5g2'] })).toThrow(/UGlI7/);
  });
});

describe('trySolverMove', () => {
  it('mate in 1: the right move solves it', () => {
    const r = trySolverMove(startSession(MATE_IN_1), 'g5g2');
    expect(r?.result).toBe('solved');
    expect(r?.session.status).toBe('solved');
    expect(r?.session.fen).toBe(fenAfter(MATE_IN_1, 2));
    expect(r?.session.lastMove).toEqual({ from: 'g5', to: 'g2' });
  });

  it('a wrong legal move fails the puzzle and is shown on the board', () => {
    const r = trySolverMove(startSession(MATE_IN_1), 'a7a6');
    expect(r?.result).toBe('wrong');
    expect(r?.session.status).toBe('failed');
    expect(r?.session.lastMove).toEqual({ from: 'a7', to: 'a6' });
  });

  it('an illegal move returns null and changes nothing', () => {
    const s = startSession(MATE_IN_1);
    expect(trySolverMove(s, 'a7a4')).toBeNull();
    expect(trySolverMove(s, 'e2e4')).toBeNull(); // the opponent's piece
    expect(trySolverMove(s, 'zz')).toBeNull();
    expect(s).toEqual(startSession(MATE_IN_1));
  });

  it('no more moves once solved or failed', () => {
    const solved = trySolverMove(startSession(MATE_IN_1), 'g5g2')!.session;
    expect(trySolverMove(solved, 'a7a6')).toBeNull();
    const failed = trySolverMove(startSession(MATE_IN_1), 'a7a6')!.session;
    expect(trySolverMove(failed, 'g5g2')).toBeNull();
  });

  it("a right move that isn't the last is 'correct'; the opponent then replies", () => {
    const r = trySolverMove(startSession(FORK), 'g8g2');
    expect(r?.result).toBe('correct');
    expect(r?.session.status).toBe('playing');
    expect(r?.session.next).toBe(2);
    const replied = playOpponentReply(r!.session);
    expect(replied.fen).toBe(fenAfter(FORK, 3));
    expect(replied.next).toBe(3);
    expect(replied.lastMove).toEqual({ from: 'g1', to: 'h1' });
  });

  it('solves a full non-mate puzzle and a mate in 3', () => {
    expect(solve(FORK).status).toBe('solved');
    expect(solve(MATE_IN_3).status).toBe('solved');
  });

  it('long puzzle: twelve moves, ending in a promotion', () => {
    const s = solve(LONG);
    expect(s.status).toBe('solved');
    expect(s.solverColor).toBe('w');
    expect(s.fen).toBe(fenAfter(LONG, LONG.moves.length));
  });

  it('accepts promotion UCI (and upper case); an under-promotion that is not the solution is wrong', () => {
    let s = startSession(PROMOTION);
    for (const i of [1, 3, 5]) s = playOpponentReply(trySolverMove(s, PROMOTION.moves[i])!.session);
    expect(s.next).toBe(7);
    expect(trySolverMove(s, 'f2f1q')?.result).toBe('solved');
    expect(trySolverMove(s, 'F2F1Q')?.result).toBe('solved');
    expect(new Chess(trySolverMove(s, 'f2f1q')!.session.fen).get('f1')).toEqual({ type: 'q', color: 'b' });
    expect(trySolverMove(s, 'f2f1n')?.result).toBe('wrong');
  });

  it('mate in 2: an alternative checkmate on the last move counts as solved', () => {
    const r1 = trySolverMove(startSession(MATE_IN_2_ALT), 'd7d1');
    expect(r1?.result).toBe('correct');
    const s = playOpponentReply(r1!.session);
    const alt = trySolverMove(s, 'e8e1');
    expect(alt?.result).toBe('solved');
    expect(alt?.session.status).toBe('solved');
    expect(new Chess(alt!.session.fen).isCheckmate()).toBe(true);
    expect(trySolverMove(s, 'd1e1')?.result).toBe('solved');
  });
});

describe('playOpponentReply', () => {
  it("does nothing when it isn't the opponent's turn or the puzzle is over", () => {
    const s = startSession(FORK);
    expect(playOpponentReply(s)).toBe(s);
    const solved = trySolverMove(startSession(MATE_IN_1), 'g5g2')!.session;
    expect(playOpponentReply(solved)).toBe(solved);
    const failed = trySolverMove(startSession(FORK), 'a7a6')!.session;
    expect(playOpponentReply(failed)).toBe(failed);
  });
});

describe('hint', () => {
  it("names the square of the solver's next piece and marks usedHelp", () => {
    const s = startSession(FORK);
    const h = hint(s);
    expect(h.from).toBe('g8');
    expect(h.session.usedHelp).toBe(true);
    expect(h.session.fen).toBe(s.fen);
    expect(s.usedHelp).toBe(false);
  });

  it('after a wrong move, names the piece that should have moved', () => {
    const failed = trySolverMove(startSession(FORK), 'a7a6')!.session;
    expect(hint(failed).from).toBe('g8');
  });
});

describe('showSolution', () => {
  it('plays the rest of the solution step by step, failed and usedHelp', () => {
    const steps = showSolution(startSession(MATE_IN_3));
    expect(steps).toHaveLength(MATE_IN_3.moves.length - 1);
    steps.forEach((step, i) => {
      expect(step.status).toBe('failed');
      expect(step.usedHelp).toBe(true);
      expect(step.next).toBe(i + 2);
      expect(step.fen).toBe(fenAfter(MATE_IN_3, i + 2));
    });
    expect(steps.at(-1)!.lastMove).toEqual({ from: 'd3', to: 'c5' });
  });

  it('continues from where the solver is, including a pending opponent reply', () => {
    const r = trySolverMove(startSession(FORK), 'g8g2')!;
    const steps = showSolution(r.session);
    expect(steps.map((s) => s.next)).toEqual([3, 4]);
    expect(steps.at(-1)!.fen).toBe(fenAfter(FORK, 4));
  });

  it('after a wrong move, takes it back and shows the right line', () => {
    const failed = trySolverMove(startSession(FORK), 'a7a6')!.session;
    const steps = showSolution(failed);
    expect(steps[0].fen).toBe(fenAfter(FORK, 2));
    expect(steps.at(-1)!.fen).toBe(fenAfter(FORK, 4));
  });

  it('returns no steps when nothing is left', () => {
    const solved = trySolverMove(startSession(MATE_IN_1), 'g5g2')!.session;
    expect(showSolution(solved)).toEqual([]);
  });
});

const fake = (id: string, rating: number, themes: string[] = []): Puzzle => ({ id, fen: '', moves: [], rating, themes });

describe('pickPuzzle', () => {
  const pool = [fake('a', 1000, ['fork']), fake('b', 1150, ['pin']), fake('c', 1350, ['fork']), fake('d', 1800, ['mateIn2'])];

  it('picks within ±window of the rating', () => {
    expect(pickPuzzle(pool, 1000, { rng: () => 0.99 })?.id).toBe('a');
    expect(pickPuzzle(pool, 1260, { rng: () => 0 })?.id).toBe('c');
  });

  it('doubles the window until something fits', () => {
    expect(PUZZLES.window).toBe(100);
    expect(pickPuzzle(pool, 1500)?.id).toBe('c'); // 150 away: fits at ±200, before 1800 (300 away) does
    expect(pickPuzzle(pool, 2550)?.id).toBe('d'); // 750 away: ±800
    expect(pickPuzzle(pool, 300)?.id).toBe('a'); // 700 away: ±800, b is 850 away
  });

  it('chooses at random among the candidates with rng', () => {
    const wide = [fake('x', 1490), fake('y', 1500), fake('z', 1510)];
    expect(pickPuzzle(wide, 1500, { rng: () => 0 })?.id).toBe('x');
    expect(pickPuzzle(wide, 1500, { rng: () => 0.5 })?.id).toBe('y');
    expect(pickPuzzle(wide, 1500, { rng: () => 0.9999 })?.id).toBe('z');
  });

  it('skips recent puzzles, widening past them', () => {
    expect(pickPuzzle(pool, 1000, { recent: new Set(['a']) })?.id).toBe('b');
  });

  it('filters by theme', () => {
    expect(pickPuzzle(pool, 1150, { theme: 'fork', rng: () => 0 })?.id).toBe('a');
    expect(pickPuzzle(pool, 1000, { theme: 'mateIn2' })?.id).toBe('d');
  });

  it('null when nothing matches at all', () => {
    expect(pickPuzzle([], 1500)).toBeNull();
    expect(pickPuzzle(pool, 1500, { theme: 'smotheredMate' })).toBeNull();
    expect(pickPuzzle(pool, 1500, { theme: 'fork', recent: new Set(['a', 'c']) })).toBeNull();
  });

  it('works on real data', () => {
    expect(pickPuzzle(ALL_PUZZLES, 640, { rng: () => 0 })?.id).toBe(MATE_IN_2_ALT.id);
    expect(pickPuzzle(ALL_PUZZLES, 1500, { theme: 'mate', rng: () => 0 })?.id).toBe(MATE_IN_3.id);
  });

  it('a NaN rating still returns a puzzle instead of looping', () => {
    expect(pickPuzzle(pool, Number.NaN, { rng: () => 0 })?.id).toBe('a');
  });
});

describe('popularThemes', () => {
  it('counts themes, most common first, ties by name, up to the limit', () => {
    expect(popularThemes(ALL_PUZZLES, 4)).toEqual([
      { theme: 'mate', count: 4 },
      { theme: 'middlegame', count: 4 },
      { theme: 'endgame', count: 3 },
      { theme: 'advancedPawn', count: 2 },
    ]);
  });

  it('leaves out length, evaluation and source tags', () => {
    const themes = popularThemes(ALL_PUZZLES).map((t) => t.theme);
    for (const meta of ['short', 'long', 'veryLong', 'oneMove', 'crushing', 'master', 'masterVsMaster'])
      expect(themes).not.toContain(meta);
    expect(themes).toContain('fork');
  });

  it('defaults to 16 and handles an empty list', () => {
    const many = Array.from({ length: 20 }, (_, i) => fake(`p${i}`, 1500, [`theme${String(i).padStart(2, '0')}`]));
    expect(popularThemes(many)).toHaveLength(16);
    expect(popularThemes([])).toEqual([]);
  });
});

describe('local puzzle rating', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('nothing before the first attempt', () => {
    expect(loadLocalPuzzleRating()).toBeNull();
    expect(localTriedIds()).toEqual([]);
  });

  it('first attempt is rated from RATINGS.start against the puzzle at PUZZLES.puzzleRd', () => {
    const expected = rateGame(RATINGS.start, { rating: FORK.rating, rd: PUZZLES.puzzleRd }, 1);
    const r = recordLocalAttempt(FORK, true);
    expect(r.firstAttempt).toBe(true);
    expect(r.rating).toEqual({
      before: RATINGS.start.rating,
      after: Math.round(expected.rating),
      delta: Math.round(expected.rating - RATINGS.start.rating),
      provisional: true,
    });
    expect(loadLocalPuzzleRating()).toEqual({
      rating: Math.round(expected.rating),
      rd: Math.round(expected.rd),
      attempts: 1,
      solved: 1,
      provisional: true,
    });
    expect(localTriedIds()).toEqual([FORK.id]);
  });

  it('a failed first attempt lowers the rating and counts as an attempt only', () => {
    const r = recordLocalAttempt(MATE_IN_1, false);
    expect(r.rating!.delta).toBeLessThan(0);
    expect(loadLocalPuzzleRating()).toMatchObject({ attempts: 1, solved: 0 });
  });

  it('chains attempts: each starts from the stored state', () => {
    recordLocalAttempt(FORK, true);
    const stored = JSON.parse(localStorage.getItem('rookery.puzzles')!) as { rating: number; rd: number; volatility: number };
    const expected = rateGame(stored, { rating: LONG.rating, rd: PUZZLES.puzzleRd }, 0);
    const r = recordLocalAttempt(LONG, false);
    expect(r.rating!.after).toBe(Math.round(expected.rating));
    expect(localTriedIds()).toEqual([LONG.id, FORK.id]);
    expect(loadLocalPuzzleRating()).toMatchObject({ attempts: 2, solved: 1 });
  });

  it('a repeat attempt returns firstAttempt false and changes nothing', () => {
    recordLocalAttempt(FORK, false);
    const before = localStorage.getItem('rookery.puzzles');
    expect(recordLocalAttempt(FORK, true)).toEqual({ firstAttempt: false });
    expect(localStorage.getItem('rookery.puzzles')).toBe(before);
  });

  it(`keeps only the last ${PUZZLES.recentLimit} ids, newest first`, () => {
    for (let i = 0; i < PUZZLES.recentLimit + 5; i++) recordLocalAttempt(fake(`p${i}`, 1500), i % 2 === 0);
    const ids = localTriedIds();
    expect(ids).toHaveLength(PUZZLES.recentLimit);
    expect(ids[0]).toBe(`p${PUZZLES.recentLimit + 4}`);
    expect(ids).not.toContain('p0');
    expect(loadLocalPuzzleRating()!.attempts).toBe(PUZZLES.recentLimit + 5);
    expect(loadLocalPuzzleRating()!.provisional).toBe(false);
  });

  it('ignores corrupt stored data', () => {
    localStorage.setItem('rookery.puzzles', '{not json');
    expect(loadLocalPuzzleRating()).toBeNull();
    localStorage.setItem('rookery.puzzles', JSON.stringify({ rating: 'high' }));
    expect(localTriedIds()).toEqual([]);
    expect(recordLocalAttempt(FORK, true).rating!.before).toBe(RATINGS.start.rating);
  });

  it('works (unsaved) when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadLocalPuzzleRating()).toBeNull();
    expect(localTriedIds()).toEqual([]);
    const r = recordLocalAttempt(FORK, true);
    expect(r.firstAttempt).toBe(true);
    expect(r.rating!.delta).toBeGreaterThan(0);
  });
});
