import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { DRILL_LEVELS, DRILLS } from '../../src/endgames/drills';
import { applyResult, emptyProgress, parseProgress } from '../../src/endgames/progress';
import { pieceCount, tablebaseCovers } from '../../src/engine/tablebase';
import {
  converted,
  findSlip,
  judgeDrill,
  replayDrill,
  scoreOutcome,
  slipText,
  type DrillStep,
  type JudgeInput,
  type Verdict,
} from '../../src/game/endgameJudge';
import { validatePosition } from '../../src/game/positionSetup';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(fen: string, color: 'w' | 'b'): number {
  let n = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p?.color === color) n += VALUE[p.type];
  return n;
}

describe('endgame drill positions', () => {
  it('every FEN is a legal, playable position the tablebase covers', () => {
    for (const d of DRILLS) {
      expect(validatePosition(d.fen), d.id).toBeNull();
      const chess = new Chess(d.fen);
      expect(chess.isGameOver(), d.id).toBe(false);
      expect(chess.moves().length, d.id).toBeGreaterThan(0);
      expect(pieceCount(d.fen), d.id).toBeLessThanOrEqual(7);
      expect(tablebaseCovers(d.fen), d.id).toBe(true);
    }
  });

  it('ids are unique, every level has drills, every drill has a tip and a sane limit', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const level of DRILL_LEVELS) expect(DRILLS.some((d) => d.level === level)).toBe(true);
    for (const d of DRILLS) {
      expect(d.tip.length, d.id).toBeGreaterThan(20);
      expect(d.moves, d.id).toBeGreaterThanOrEqual(10);
      if (d.goal === 'win') expect(d.winBy, d.id).toBeDefined();
    }
  });

  // The goals themselves were checked against the Lichess tablebase (see the comments in drills.ts). These are the
  // shape checks the theory implies, so a typo'd FEN can't silently flip a drill.
  it('win drills: the user has the extra material (a lone king can\'t win)', () => {
    for (const d of DRILLS.filter((x) => x.goal === 'win')) {
      const other = d.side === 'w' ? 'b' : 'w';
      expect(materialFor(d.fen, d.side), d.id).toBeGreaterThan(materialFor(d.fen, other));
    }
  });

  it('draw drills: the user defends against extra material', () => {
    for (const d of DRILLS.filter((x) => x.goal === 'draw')) {
      const other = d.side === 'w' ? 'b' : 'w';
      expect(materialFor(d.fen, other), d.id).toBeGreaterThan(materialFor(d.fen, d.side));
    }
  });

  it('basic mates start with no pawns, and the mating side has enough to mate', () => {
    for (const d of DRILLS.filter((x) => x.winBy === 'mate')) {
      const chess = new Chess(d.fen);
      expect(d.fen.split(' ')[0].toLowerCase().includes('p'), d.id).toBe(false);
      expect(chess.isInsufficientMaterial(), d.id).toBe(false);
    }
  });

  it('the opposition pair is the same position, only the side to move differs', () => {
    const win = DRILLS.find((d) => d.id === 'kpk-opposition-win')!;
    const hold = DRILLS.find((d) => d.id === 'kpk-opposition-hold')!;
    expect(win.fen.split(' ')[0]).toBe(hold.fen.split(' ')[0]);
    // Black to move must give way (White wins); White to move, Black keeps the opposition (draw).
    expect(win.fen.split(' ')[1]).toBe('b');
    expect(hold.fen.split(' ')[1]).toBe('w');
  });
});

const tb = (outcome: Verdict['outcome']): Verdict => ({ outcome, source: 'tablebase' });

function input(over: Partial<JudgeInput> & { fen?: string; ucis?: string[] }): JudgeInput {
  const fen = over.fen ?? '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1';
  return {
    goal: 'win',
    winBy: 'convert',
    limit: 10,
    user: 'w',
    chess: over.chess ?? replayDrill(fen, over.ucis ?? []),
    userMoves: 0,
    current: tb('win'),
    ...over,
  };
}

describe('judging a drill', () => {
  it('engine evals stand in for the tablebase, from the user\'s side', () => {
    expect(scoreOutcome({ cp: 450 }, 'w', 300)).toBe('win');
    expect(scoreOutcome({ cp: 450 }, 'b', 300)).toBe('loss');
    expect(scoreOutcome({ cp: 120 }, 'w', 300)).toBe('draw');
    expect(scoreOutcome({ mate: -3 }, 'b', 300)).toBe('win');
    expect(scoreOutcome({ cp: -310 }, 'w', 300)).toBe('loss');
  });

  it('checkmate passes for the mating side and fails for the mated side', () => {
    const mated = new Chess('4k3/8/4K3/8/8/8/8/7Q w - - 0 1');
    mated.move('Qh8#');
    expect(judgeDrill(input({ chess: mated, goal: 'win', winBy: 'mate' }))).toEqual({ status: 'passed', reason: 'Checkmate!' });
    expect(judgeDrill(input({ chess: mated, user: 'b', goal: 'draw' })).status).toBe('failed');
  });

  it('stalemate fails a win drill and passes a draw drill', () => {
    const s2 = new Chess('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1');
    s2.move('Qg6'); // Black king h8: g8, g7, h7 all covered, no check
    expect(s2.isStalemate()).toBe(true);
    expect(judgeDrill(input({ chess: s2, winBy: 'mate' })).status).toBe('failed');
    expect(judgeDrill(input({ chess: s2, user: 'b', goal: 'draw' })).status).toBe('passed');
  });

  it('a win drill fails as soon as the position is no longer a win', () => {
    expect(judgeDrill(input({ current: tb('draw'), userMoves: 1 })).status).toBe('failed');
    expect(judgeDrill(input({ current: tb('win'), userMoves: 1 })).status).toBe('playing');
    expect(judgeDrill(input({ current: null, userMoves: 1 })).status).toBe('playing');
  });

  it('a convert drill passes once the pawn has queened and it is still a win', () => {
    const q = '4k3/8/8/8/8/8/8/Q3K3 b - - 0 5';
    expect(converted(q, 'w')).toBe(true);
    expect(judgeDrill(input({ fen: q, current: tb('win'), userMoves: 5 })).status).toBe('passed');
    // A bare king against a rook counts too (the defender gave up its rook for the pawn).
    expect(converted('8/8/8/3k4/8/8/8/R3K3 b - - 0 1', 'w')).toBe(true);
    expect(converted('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', 'w')).toBe(false);
    expect(converted('8/8/8/3k4/8/8/r7/R3K3 b - - 0 1', 'w')).toBe(false);
  });

  it('a win drill fails at the move limit; a draw drill passes there unless it is lost', () => {
    expect(judgeDrill(input({ userMoves: 10 })).status).toBe('failed');
    const hold = { fen: '4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1', goal: 'draw' as const, user: 'b' as const, limit: 15 };
    expect(judgeDrill(input({ ...hold, userMoves: 14, current: tb('draw') })).status).toBe('playing');
    expect(judgeDrill(input({ ...hold, userMoves: 15, current: tb('draw') })).status).toBe('passed');
    expect(judgeDrill(input({ ...hold, userMoves: 3, current: tb('loss') })).status).toBe('failed');
  });

  it('threefold repetition is a draw by rule', () => {
    const shuffle = ['e1d1', 'e8d8', 'd1e1', 'd8e8', 'e1d1', 'e8d8', 'd1e1', 'd8e8'];
    const chess = replayDrill('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', shuffle);
    expect(chess.isThreefoldRepetition()).toBe(true);
    expect(judgeDrill(input({ chess, winBy: 'mate' })).reason).toMatch(/repetition/);
  });

  it('finds the move where it slipped, and says so in plain words', () => {
    const step = (ply: number, before: Verdict['outcome'], after: Verdict['outcome'], san: string): DrillStep => ({
      ply,
      moveNo: ply / 2 + 1,
      san,
      uci: '',
      fenBefore: '',
      before: tb(before),
      after: tb(after),
    });
    const steps = [step(0, 'win', 'win', 'Kd6'), step(2, 'win', 'draw', 'Kd5'), step(4, 'draw', 'loss', 'Ke4')];
    const slip = findSlip(steps)!;
    expect(slip.san).toBe('Kd5');
    expect(slipText(slip)).toBe('You let it slip on move 2 (Kd5): that position went from win to draw.');
    expect(findSlip([step(0, 'win', 'win', 'Kd6')])).toBeNull();
    expect(findSlip([{ ...step(0, 'win', 'draw', 'Kd5'), after: null }])).toBeNull();
  });
});

describe('endgame progress', () => {
  const t = (s: string) => new Date(s);

  it('keeps the best result and the fewest moves', () => {
    let p = applyResult(emptyProgress(), 'kqk', false, 15, t('2026-10-16T10:00:00Z'));
    expect(p.drills.kqk).toEqual({ attempts: 1, passes: 0, best: 'failed', lastAt: '2026-10-16T10:00:00.000Z' });
    p = applyResult(p, 'kqk', true, 9, t('2026-10-16T10:05:00Z'));
    p = applyResult(p, 'kqk', true, 12, t('2026-10-16T10:10:00Z'));
    p = applyResult(p, 'kqk', false, 15, t('2026-10-16T10:15:00Z'));
    expect(p.drills.kqk).toMatchObject({ attempts: 4, passes: 2, best: 'passed', bestMoves: 9 });
    expect(p.updatedAt).toBe('2026-10-16T10:15:00.000Z');
  });

  it('reads back what it stored and shrugs off junk', () => {
    const p = applyResult(emptyProgress(), 'philidor', true, 15, t('2026-10-16T10:00:00Z'));
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
    expect(parseProgress(null).drills).toEqual({});
    expect(parseProgress('{not json').drills).toEqual({});
    expect(parseProgress('{"drills":{"x":{"nope":1}}}').drills).toEqual({});
  });
});
