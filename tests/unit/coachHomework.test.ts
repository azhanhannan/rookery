import { describe, expect, it } from 'vitest';
import { homeworkItemError, homeworkSession, parseSolution } from '../../src/coach/homework';
import { trySolverMove, playOpponentReply } from '../../src/puzzles/session';

const SCHOLAR = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

describe('coach homework positions', () => {
  it('reads SAN or UCI solutions, with move numbers', () => {
    expect(parseSolution(SCHOLAR, '4. Qxf7#')).toEqual({ solution: ['h5f7'] });
    expect(parseSolution(SCHOLAR, 'h5f7')).toEqual({ solution: ['h5f7'] });
    expect(parseSolution(SCHOLAR, 'Qh8')).toMatchObject({ error: expect.stringContaining('Qh8') });
    expect(parseSolution('nonsense', 'e4')).toMatchObject({ error: expect.any(String) });
  });

  it('checks the position and line', () => {
    expect(homeworkItemError({ fen: SCHOLAR, solution: ['h5f7'] })).toBeNull();
    expect(homeworkItemError({ fen: SCHOLAR, solution: [] })).toMatch(/solution/);
    expect(homeworkItemError({ fen: SCHOLAR, solution: ['h5f7', 'e8e7'] })).toMatch(/end on a move/);
    expect(homeworkItemError({ fen: SCHOLAR, solution: ['h5h8'] })).toMatch(/legal/);
    expect(homeworkItemError({ fen: 'x', solution: ['e2e4'] })).toMatch(/legal position/);
    expect(homeworkItemError(null)).toMatch(/FEN/);
  });

  it('solves with the puzzle state machine, solver first', () => {
    // A 3-ply line ending on the solver: 1.Bxf7+ Kxf7 2.Qh5+.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1';
    const s = homeworkSession({ fen, solution: ['c4f7', 'e8f7', 'd1h5'] }, 'hw:0');
    expect(s.solverColor).toBe('w');
    const first = trySolverMove(s, 'c4f7')!;
    expect(first.result).toBe('correct');
    const replied = playOpponentReply(first.session);
    expect(trySolverMove(replied, 'd1h5')!.result).toBe('solved');
    expect(trySolverMove(s, 'd1h5')!.result).toBe('wrong');
  });
});
