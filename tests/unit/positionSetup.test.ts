import { describe, expect, it } from 'vitest';
import { formatEval, pvToSan } from '../../src/game/analysisLines';
import {
  EMPTY_FEN,
  fenFromSetup,
  setupFromFen,
  toggleSquare,
  validatePosition,
} from '../../src/game/positionSetup';
import { START_FEN } from '../../src/game/rules';

describe('position setup', () => {
  it('FEN -> setup -> FEN keeps placement, side and castling', () => {
    expect(fenFromSetup(setupFromFen(START_FEN))).toBe(START_FEN);
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1';
    expect(fenFromSetup(setupFromFen(fen))).toBe(fen);
  });

  it('drops castling rights the placement no longer allows', () => {
    const s = setupFromFen(START_FEN);
    const placement = toggleSquare(s.placement, 'h1', null);
    expect(fenFromSetup({ ...s, placement })).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1');
  });

  it('toggleSquare places, replaces and removes', () => {
    let p = toggleSquare({}, 'e4', 'wQ');
    expect(p.e4).toBe('wQ');
    p = toggleSquare(p, 'e4', 'bN');
    expect(p.e4).toBe('bN');
    p = toggleSquare(p, 'e4', 'bN');
    expect(p.e4).toBeUndefined();
  });

  it('validates', () => {
    expect(validatePosition(START_FEN)).toBeNull();
    expect(validatePosition('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toBeNull();
    expect(validatePosition('garbage')).toMatch(/Not a valid FEN/);
    expect(validatePosition(EMPTY_FEN)).toMatch(/king/);
    expect(validatePosition('4k3/8/8/8/8/8/8/4KK2 w - - 0 1')).toMatch(/king/);
    expect(validatePosition('4k3/8/8/8/8/8/8/P3K3 w - - 0 1')).toMatch(/pawns/i);
    expect(validatePosition('4k3/8/8/8/8/8/8/4KR2 w - - 0 1')).toBeNull();
    expect(validatePosition('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')).toBeNull();
    // Black is in check with White to move.
    expect(validatePosition('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1')).toMatch(/Black is in check/);
  });
});

describe('engine line text', () => {
  it('formats evals', () => {
    expect(formatEval({ cp: 134 })).toBe('+1.34');
    expect(formatEval({ cp: -50 })).toBe('-0.50');
    expect(formatEval({ cp: 0 })).toBe('0.00');
    expect(formatEval({ mate: 5 })).toBe('#5');
    expect(formatEval({ mate: -3 })).toBe('#-3');
  });

  it('turns a UCI PV into numbered SAN', () => {
    expect(pvToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toBe('1. e4 e5 2. Nf3');
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(pvToSan(black, ['c7c5', 'g1f3'])).toBe('1... c5 2. Nf3');
    expect(pvToSan(START_FEN, ['e2e4', 'e2e4'])).toBe('1. e4');
  });
});
