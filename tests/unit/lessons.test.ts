import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  acceptedAnswers,
  bareSan,
  lessonSteps,
  mateInOne,
  moveFromSan,
  solutionSquares,
  tryPuzzleMove,
} from '../../src/lessons/lessonLogic';
import { LESSONS_COURSE } from '../../src/lessons/lessons';
import { doneCount, emptyLessonsProgress, markDone, parseLessonsProgress } from '../../src/lessons/progress';
import { SYNC_KEYS } from '../../src/sync/keys';
import { validatePosition } from '../../src/game/positionSetup';

const SQUARE = /^[a-h][1-8]$/;

describe('lesson content', () => {
  it('has the core themes, unique ids, 2-3 screens and 3-5 practice positions each', () => {
    const ids = LESSONS_COURSE.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of ['forks', 'pins', 'skewers', 'back-rank', 'scholars-mate']) expect(ids).toContain(theme);
    for (const l of LESSONS_COURSE) {
      expect(l.screens.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.screens.length, l.id).toBeLessThanOrEqual(3);
      expect(l.puzzles.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.puzzles.length, l.id).toBeLessThanOrEqual(5);
    }
  });

  it('every explanation board is a legal position with arrows and highlights on real squares', () => {
    for (const l of LESSONS_COURSE) {
      for (const s of l.screens) {
        expect(validatePosition(s.fen), `${l.id}: ${s.title}`).toBeNull();
        for (const a of s.arrows ?? []) {
          expect(a.from, `${l.id}: ${s.title}`).toMatch(SQUARE);
          expect(a.to, `${l.id}: ${s.title}`).toMatch(SQUARE);
        }
        for (const h of s.highlights ?? []) expect(h, `${l.id}: ${s.title}`).toMatch(SQUARE);
      }
    }
  });

  for (const l of LESSONS_COURSE) {
    l.puzzles.forEach((p, i) => {
      const name = `${l.id} #${i + 1}`;
      it(`${name}: legal position, legal answers, written as chess.js writes them`, () => {
        expect(validatePosition(p.fen), name).toBeNull();
        for (const san of acceptedAnswers(p)) {
          const m = moveFromSan(p.fen, san);
          expect(m, `${name}: ${san}`).not.toBeNull();
          // The SAN in the data matches chess.js exactly (check signs included), so the text reads right.
          expect(m!.san, name).toBe(san);
        }
        // Not playable already over, and alternatives don't repeat the solution.
        expect(new Chess(p.fen).isGameOver(), name).toBe(false);
        const bare = acceptedAnswers(p).map(bareSan);
        expect(new Set(bare).size, name).toBe(bare.length);
      });

      if (p.mate) {
        it(`${name}: the answer is checkmate, and it is the only mate`, () => {
          for (const san of acceptedAnswers(p)) {
            const chess = new Chess(p.fen);
            chess.move(san);
            expect(chess.isCheckmate(), `${name}: ${san}`).toBe(true);
          }
          const chess = new Chess(p.fen);
          const mates = chess.moves().filter((san) => san.endsWith('#'));
          expect(mates.sort(), name).toEqual(acceptedAnswers(p).sort());
        });
      }

      if (p.stopsMate) {
        it(`${name}: accepted moves stop the mate, every other move allows it`, () => {
          expect(mateInOne(new Chess(p.fen).fen().replace(/ [wb] /, (t) => (t === ' w ' ? ' b ' : ' w '))), name).not.toBeNull();
          const accepted = new Set(acceptedAnswers(p));
          for (const san of new Chess(p.fen).moves()) {
            const chess = new Chess(p.fen);
            chess.move(san);
            const mate = mateInOne(chess.fen());
            if (accepted.has(san)) expect(mate, `${name}: ${san} should stop the mate`).toBeNull();
            else expect(mate, `${name}: ${san} should allow mate (or be listed)`).not.toBeNull();
          }
        });
      }
    });
  }

  it('every fork answer attacks two targets (the king, something bigger, or something loose)', () => {
    const value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const fork = LESSONS_COURSE.find((l) => l.id === 'forks')!;
    for (const p of fork.puzzles) {
      const chess = new Chess(p.fen);
      const m = chess.move(p.solution);
      const mover = value[m.piece];
      // Enemy pieces the moved piece attacks that are the king, worth more than it, or not defended.
      const enemy = m.color === 'w' ? 'b' : 'w';
      const targets = chess
        .board()
        .flat()
        .filter(
          (sq) =>
            sq &&
            sq.color === enemy &&
            sq.type !== 'p' &&
            chess.attackers(sq.square, m.color).includes(m.to) &&
            (value[sq.type] > mover || chess.attackers(sq.square, enemy).length === 0),
        );
      expect(targets.length, p.solution).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('lesson logic', () => {
  const forks = LESSONS_COURSE.find((l) => l.id === 'forks')!;
  const knightFork = forks.puzzles[0];

  it('accepts the solution from the board, with the check sign added by chess.js', () => {
    const sq = solutionSquares(knightFork)!;
    const r = tryPuzzleMove(knightFork, sq);
    expect(r.kind).toBe('right');
    if (r.kind === 'right') {
      expect(r.san).toBe('Ne7+');
      expect(r.mate).toBe(false);
    }
  });

  it('rejects a legal but wrong move and an illegal one', () => {
    expect(tryPuzzleMove(knightFork, { from: 'd5', to: 'f6' }).kind).toBe('wrong');
    expect(tryPuzzleMove(knightFork, { from: 'd5', to: 'd6' }).kind).toBe('illegal');
  });

  it('says when a wrong move allows mate', () => {
    const back = LESSONS_COURSE.find((l) => l.id === 'back-rank')!.puzzles.find((p) => p.stopsMate)!;
    const r = tryPuzzleMove(back, { from: 'a2', to: 'a3' });
    expect(r).toEqual({ kind: 'wrong', san: 'a3', allowsMate: 'Rd1#' });
  });

  it('accepts listed alternatives', () => {
    const scholar = LESSONS_COURSE.find((l) => l.id === 'scholars-mate')!.puzzles[2];
    expect(tryPuzzleMove(scholar, { from: 'd8', to: 'e7' }).kind).toBe('right');
  });

  it('steps through screens, then puzzles, then done', () => {
    const steps = lessonSteps(forks);
    expect(steps.length).toBe(forks.screens.length + forks.puzzles.length + 1);
    expect(steps[0]).toEqual({ kind: 'screen', index: 0 });
    expect(steps[forks.screens.length]).toEqual({ kind: 'puzzle', index: 0 });
    expect(steps.at(-1)).toEqual({ kind: 'done' });
  });
});

describe('lesson progress', () => {
  it('marks a lesson done, counts repeats, and keeps a clean finish', () => {
    let p = markDone(emptyLessonsProgress(), 'forks', true, new Date('2026-10-16T10:00:00Z'));
    p = markDone(p, 'forks', false, new Date('2026-10-17T10:00:00Z'));
    expect(p.lessons.forks).toEqual({ doneAt: '2026-10-17T10:00:00.000Z', times: 2, clean: true });
    expect(p.updatedAt).toBe('2026-10-17T10:00:00.000Z');
    expect(doneCount(p, ['forks', 'pins'])).toBe(1);
  });

  it('round-trips through storage and drops malformed entries', () => {
    const p = markDone(emptyLessonsProgress(), 'pins', false, new Date('2026-10-16T10:00:00Z'));
    expect(parseLessonsProgress(JSON.stringify(p))).toEqual(p);
    expect(parseLessonsProgress('not json')).toEqual(emptyLessonsProgress());
    expect(parseLessonsProgress(JSON.stringify({ lessons: { a: 1, b: { doneAt: 'x' } } })).lessons).toEqual({
      b: { doneAt: 'x', times: 1, clean: false },
    });
  });

  it('syncs to the account as a stamped key', () => {
    expect(SYNC_KEYS['rookery.lessons']).toBe('stamped');
  });
});
