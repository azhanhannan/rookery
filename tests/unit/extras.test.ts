import { beforeEach, describe, expect, it } from 'vitest';
import { EXTRAS } from '../../src/config/tunables';
import { formatSan } from '../../src/game/notation';
import { parsePlaySettings } from '../../src/settings/playSettings';
import { parseReviewPrefs } from '../../src/settings/reviewPrefs';
import { accuracy, ALL_SQUARES, answer, nextSquare, parseBests, startRun, updateBests } from '../../src/drills/squareDrill';
import {
  addActivity,
  countDatedEntries,
  EMPTY_LOG,
  isoWeek,
  loadTrainingLog,
  logTraining,
  parseTrainingLog,
  startTraining,
  weekTotals,
} from '../../src/training/trainingLog';
import {
  calcStartFen,
  checkLine,
  enterMove,
  lineComplete,
  replayPlan,
  solutionLine,
  type CalcEntry,
} from '../../src/puzzles/calculation';
import { bestOwnMove, goodFightLine } from '../../src/review/mascotLines';
import type { GameReview, MoveLabel, MoveReview } from '../../src/review/types';
import type { Puzzle } from '../../src/puzzles/types';
import { FORK, MATE_IN_1, MATE_IN_2_ALT } from '../fixtures/puzzles';

describe('formatSan', () => {
  it('keeps letters by default', () => {
    expect(formatSan('Nf3', 'letters')).toBe('Nf3');
  });
  it('turns every piece letter into a figurine, promotions included', () => {
    expect(formatSan('Nf3', 'figurines')).toBe('♘f3');
    expect(formatSan('Qxe7+', 'figurines')).toBe('♕xe7+');
    expect(formatSan('Rad1', 'figurines')).toBe('♖ad1');
    expect(formatSan('Bb5#', 'figurines')).toBe('♗b5#');
    expect(formatSan('Kxh2', 'figurines')).toBe('♔xh2');
    expect(formatSan('exd8=Q+', 'figurines')).toBe('exd8=♕+');
  });
  it('leaves pawn moves and castling alone', () => {
    expect(formatSan('e4', 'figurines')).toBe('e4');
    expect(formatSan('bxc6', 'figurines')).toBe('bxc6');
    expect(formatSan('O-O-O', 'figurines')).toBe('O-O-O');
  });
  it('is a Play setting that defaults to letters', () => {
    expect(parsePlaySettings(null).pieceSymbols).toBe('letters');
    expect(parsePlaySettings('{"pieceSymbols":"figurines"}').pieceSymbols).toBe('figurines');
    expect(parsePlaySettings('{"pieceSymbols":"hieroglyphs"}').pieceSymbols).toBe('letters');
  });
});

describe('coach mascot setting', () => {
  it('is off by default', () => {
    expect(parseReviewPrefs(null).coachMascot).toBe(false);
    expect(parseReviewPrefs('{"coachMascot":true}').coachMascot).toBe(true);
    expect(parseReviewPrefs('{"coachMascot":"yes"}').coachMascot).toBe(false);
  });
});

/** A seeded-enough sequence for rand(). */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('name-the-square drill', () => {
  it('has 64 squares and never names the same square twice in a row', () => {
    expect(ALL_SQUARES).toHaveLength(64);
    expect(new Set(ALL_SQUARES).size).toBe(64);
    for (let i = 0; i < 200; i++) {
      const prev = nextSquare();
      expect(nextSquare(Math.random, prev)).not.toBe(prev);
    }
    expect(nextSquare(() => 0.999999)).toBe('h8');
    expect(nextSquare(() => 0)).toBe('a1');
    expect(nextSquare(() => 0, 'a1')).toBe('a2');
  });

  it('scores right clicks and counts misses', () => {
    let run = startRun(seq(0));
    expect(run).toEqual({ target: 'a1', score: 0, misses: 0 });
    let r = answer(run, 'a1', seq(0));
    expect(r.correct).toBe(true);
    run = r.run;
    expect(run.score).toBe(1);
    expect(run.target).toBe('a2');
    r = answer(run, 'h8', seq(0));
    expect(r.correct).toBe(false);
    expect(r.run).toMatchObject({ score: 1, misses: 1 });
    expect(accuracy(r.run)).toBe(50);
    expect(accuracy({ score: 0, misses: 0 })).toBe(100);
  });

  it('keeps a best per side', () => {
    const start = { white: 0, black: 0 };
    expect(updateBests(start, 'white', 0)).toEqual({ bests: start, isBest: false });
    const a = updateBests(start, 'white', 12);
    expect(a).toEqual({ bests: { white: 12, black: 0 }, isBest: true });
    expect(updateBests(a.bests, 'white', 12).isBest).toBe(false);
    expect(updateBests(a.bests, 'black', 3)).toEqual({ bests: { white: 12, black: 3 }, isBest: true });
  });

  it('reads bests defensively', () => {
    expect(parseBests(null)).toEqual({ white: 0, black: 0 });
    expect(parseBests('nope')).toEqual({ white: 0, black: 0 });
    expect(parseBests('{"best":{"white":9.7,"black":-1}}')).toEqual({ white: 9, black: 0 });
  });
});

describe('training log', () => {
  beforeEach(() => localStorage.clear());

  it('adds activities per day and kind, capping seconds', () => {
    let log = addActivity(EMPTY_LOG, 'puzzle', 45, '2026-10-14', 'now');
    log = addActivity(log, 'puzzle', 30, '2026-10-14', 'now');
    log = addActivity(log, 'game', 99_999, '2026-10-14', 'now');
    expect(log.days['2026-10-14']).toEqual({ puzzle: { n: 2, sec: 75 }, game: { n: 1, sec: EXTRAS.logMaxMinutes.game * 60 } });
    expect(addActivity(EMPTY_LOG, 'review', NaN, '2026-10-14', 'now').days['2026-10-14'].review).toEqual({ n: 1, sec: 0 });
    expect(addActivity(EMPTY_LOG, 'review', -5, '2026-10-14', 'now').days['2026-10-14'].review).toEqual({ n: 1, sec: 0 });
  });

  it('drops days older than the keep window', () => {
    const old = addActivity(EMPTY_LOG, 'game', 60, '2026-01-01', 'then');
    const log = addActivity(old, 'game', 60, '2026-10-14', 'now', 1, 70);
    expect(Object.keys(log.days)).toEqual(['2026-10-14']);
  });

  it('totals this Monday-Sunday week against last week', () => {
    let log = EMPTY_LOG;
    log = addActivity(log, 'game', 600, '2026-10-12', 'x'); // Monday this week
    log = addActivity(log, 'game', 300, '2026-10-18', 'x'); // Sunday this week
    log = addActivity(log, 'puzzle', 60, '2026-10-11', 'x'); // Sunday last week
    log = addActivity(log, 'review', 60, '2026-10-05', 'x'); // Monday last week
    log = addActivity(log, 'review', 60, '2026-10-04', 'x'); // two weeks ago: neither
    const { thisWeek, lastWeek } = weekTotals(log, '2026-10-16');
    expect(thisWeek.game).toEqual({ n: 2, sec: 900 });
    expect(thisWeek.puzzle).toEqual({ n: 0, sec: 0 });
    expect(lastWeek.puzzle).toEqual({ n: 1, sec: 60 });
    expect(lastWeek.review).toEqual({ n: 1, sec: 60 });
  });

  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-10-16')).toBe(42);
    expect(isoWeek('2026-01-01')).toBe(1); // a Thursday
    expect(isoWeek('2027-01-01')).toBe(53); // Friday: still 2026's week 53
    expect(isoWeek('2025-12-29')).toBe(1); // Monday of 2026's week 1
  });

  it('parses stored logs defensively', () => {
    expect(parseTrainingLog(null)).toEqual(EMPTY_LOG);
    expect(parseTrainingLog('[]')).toEqual(EMPTY_LOG);
    expect(parseTrainingLog('{bad')).toEqual(EMPTY_LOG);
    const raw = JSON.stringify({
      updatedAt: 'u',
      days: { '2026-10-14': { game: { n: 1, sec: 60 }, puzzle: { n: 'x', sec: 1 }, chess960: { n: 1, sec: 1 } }, nope: {} },
    });
    expect(parseTrainingLog(raw)).toEqual({ updatedAt: 'u', days: { '2026-10-14': { game: { n: 1, sec: 60 } } } });
  });

  it('logs to storage with the time since the activity started', () => {
    startTraining('puzzle', new Date('2026-10-16T10:00:00').getTime());
    logTraining('puzzle', undefined, new Date('2026-10-16T10:02:00'));
    logTraining('game', 300, new Date('2026-10-16T11:00:00'));
    const log = loadTrainingLog();
    expect(log.days['2026-10-16']).toEqual({ puzzle: { n: 1, sec: 120 }, game: { n: 1, sec: 300 } });
    expect(log.updatedAt).toBe(new Date('2026-10-16T11:00:00').toISOString());
    // No start: counted, no minutes.
    logTraining('puzzle', undefined, new Date('2026-10-16T12:00:00'));
    expect(loadTrainingLog().days['2026-10-16'].puzzle).toEqual({ n: 2, sec: 120 });
  });

  it('counts dated entries in drill stores of unknown shape', () => {
    const raw = JSON.stringify({
      updatedAt: '2026-10-16T09:00:00Z',
      items: [
        { id: 'a', lastPracticed: '2026-10-13T10:00:00' },
        { id: 'b', reviewedAt: Date.parse('2026-10-07T10:00:00') },
        { id: 'c', due: '2026-10-14', history: [{ at: '2026-10-15' }, { at: '2026-09-01' }] },
      ],
    });
    expect(countDatedEntries(raw, '2026-10-16')).toEqual({ thisWeek: 2, lastWeek: 1 });
    expect(countDatedEntries('not json', '2026-10-16')).toEqual({ thisWeek: 0, lastWeek: 0 });
    expect(countDatedEntries(null, '2026-10-16')).toEqual({ thisWeek: 0, lastWeek: 0 });
  });
});

/** Enters a UCI line on the hidden board, as the clicks would. */
function enter(p: Puzzle, ucis: string[]): CalcEntry[] {
  const fen = calcStartFen(p);
  const out: CalcEntry[] = [];
  for (const u of ucis) {
    const e = enterMove(fen, out, u.slice(0, 2), u.slice(2, 4));
    expect(e, u).not.toBeNull();
    out.push(e!);
  }
  return out;
}

describe('calculation mode', () => {
  it('asks for every move after the set-up move', () => {
    expect(solutionLine(FORK)).toEqual(['g8g2', 'g1h1', 'g2d2']);
  });

  it('rejects illegal clicks', () => {
    expect(enterMove(calcStartFen(FORK), [], 'a1', 'a1')).toBeNull();
    expect(enterMove(calcStartFen(FORK), [], 'e4', 'e5')).toBeNull();
  });

  it('accepts the whole line', () => {
    const entries = enter(FORK, solutionLine(FORK));
    expect(lineComplete(FORK, entries)).toBe(true);
    expect(lineComplete(FORK, entries.slice(0, 2))).toBe(false);
    expect(checkLine(FORK, entries)).toEqual({ correct: true, firstWrong: null });
    expect(replayPlan(FORK, entries)).toEqual({ moves: ['g8g2', 'g2d2'], reveal: false });
  });

  it('accepts a different mate and ends the line there', () => {
    // Mate in 1: the solution move mates.
    const m1 = enter(MATE_IN_1, solutionLine(MATE_IN_1));
    expect(m1[0].san.endsWith('#')).toBe(true);
    expect(lineComplete(MATE_IN_1, m1)).toBe(true);
    expect(checkLine(MATE_IN_1, m1).correct).toBe(true);
  });

  it('finds where a wrong solver move went off, and plays it so the trainer marks it', () => {
    const line = solutionLine(MATE_IN_2_ALT); // d7d1 e3e1 d1e1
    const fen = calcStartFen(MATE_IN_2_ALT);
    const wrongFirst = enterMove(fen, [], 'd7', 'd6');
    expect(wrongFirst).not.toBeNull();
    const entries = [wrongFirst!];
    expect(checkLine(MATE_IN_2_ALT, entries)).toEqual({ correct: false, firstWrong: 0 });
    expect(replayPlan(MATE_IN_2_ALT, entries)).toEqual({ moves: ['d7d6'], reveal: false });
    expect(line).toHaveLength(3);
  });

  it('a wrong predicted reply plays the right moves so far, then reveals', () => {
    // checkLine and replayPlan only compare moves: a mispredicted reply needn't be legal to test them.
    const entries: CalcEntry[] = [
      { uci: 'g8g2', san: 'Rxg2+' },
      { uci: 'g1f1', san: 'Kf1' },
      { uci: 'g2d2', san: 'Rxd2' },
    ];
    expect(checkLine(FORK, entries)).toEqual({ correct: false, firstWrong: 1 });
    expect(replayPlan(FORK, entries)).toEqual({ moves: ['g8g2'], reveal: true });
  });

  it('a short line reveals after the moves entered', () => {
    const entries = enter(FORK, ['g8g2', 'g1h1']);
    expect(checkLine(FORK, entries)).toEqual({ correct: false, firstWrong: 2 });
    expect(replayPlan(FORK, entries)).toEqual({ moves: ['g8g2'], reveal: true });
  });
});

const mv = (ply: number, label: MoveLabel, san = `m${ply}`): MoveReview =>
  ({ ply, color: ply % 2 === 1 ? 'w' : 'b', san, uci: 'a2a3', label, loss: 0, explanation: '' }) as unknown as MoveReview;

describe('mascot praise on the end screen', () => {
  const review = (moves: MoveReview[]) => ({ moves }) as unknown as GameReview;

  it('names your best-labelled move, never the opponent’s', () => {
    const r = review([mv(1, 'Best', 'e4'), mv(2, 'Brilliant', 'Qxh7'), mv(3, 'Great', 'Nf5'), mv(5, 'Best', 'Rd1')]);
    expect(bestOwnMove(r, ['w'])?.san).toBe('Nf5');
    expect(goodFightLine(r, ['w'])).toBe('2. Nf5 was a great find. Nice!');
    expect(goodFightLine(r, ['w'], (s) => formatSan(s, 'figurines'))).toBe('2. ♘f5 was a great find. Nice!');
    expect(goodFightLine(r, ['b'])).toBe('1... Qxh7 was a brilliant move. Nice!');
  });

  it('says nothing when no move earned praise', () => {
    expect(goodFightLine(review([mv(1, 'Good'), mv(3, 'Mistake'), mv(2, 'Best')]), ['w'])).toBeNull();
  });
});
