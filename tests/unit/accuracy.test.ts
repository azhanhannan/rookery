import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from '../../src/review/accuracy';
import { winChance } from '../../src/review/winChance';

// Worked by hand: 103.1668 * e^(-0.04354 * loss) - 3.1669.
// loss 0:  103.1668 - 3.1669                         = 99.9999
// loss 10: e^-0.4354 = 0.647006 -> 66.7495 - 3.1669  = 63.5826
// loss 20: e^-0.8708 = 0.418617 -> 43.1873 - 3.1669  = 40.0204
// loss 50: e^-2.177  = 0.113366 -> 11.6957 - 3.1669  = 8.5288
describe('moveAccuracy', () => {
  it('matches hand-computed values', () => {
    expect(moveAccuracy(0)).toBeCloseTo(99.9999, 4);
    expect(moveAccuracy(10)).toBeCloseTo(63.58, 2);
    expect(moveAccuracy(20)).toBeCloseTo(40.02, 2);
    expect(moveAccuracy(50)).toBeCloseTo(8.53, 2);
  });

  it('clamps to 0-100', () => {
    // e^-4.354 = 0.012854 -> 1.326 - 3.167 < 0
    expect(moveAccuracy(100)).toBe(0);
    expect(moveAccuracy(-5)).toBe(100);
  });

  it('chains from win chance: White +1.00 to 0.00 is a loss of 9.10', () => {
    // winChance(100) = 59.10 (see winChance.test.ts); e^(-0.04354 * 9.1029) = 0.67290 -> 69.42 - 3.17 = 66.25
    const loss = winChance({ cp: 100 }) - winChance({ cp: 0 });
    expect(loss).toBeCloseTo(9.10, 2);
    expect(moveAccuracy(loss)).toBeCloseTo(66.25, 1);
  });
});

describe('gameAccuracy', () => {
  it('is null with no moves', () => {
    expect(gameAccuracy([])).toBeNull();
  });

  it('is the value itself for identical moves', () => {
    expect(gameAccuracy([100])).toBe(100);
    expect(gameAccuracy([70, 70, 70])).toBeCloseTo(70, 10);
  });

  it('averages the arithmetic and harmonic means', () => {
    // mean 70; harmonic 2 / (1/80 + 1/60) = 68.5714; (70 + 68.5714) / 2 = 69.2857
    expect(gameAccuracy([80, 60])).toBeCloseTo(69.2857, 4);
  });

  it('floors values at 1 for the harmonic part, so a 0% move does not zero the game', () => {
    // mean 50; harmonic 2 / (1/100 + 1/1) = 1.9802; (50 + 1.9802) / 2 = 25.9901
    expect(gameAccuracy([100, 0])).toBeCloseTo(25.9901, 4);
  });
});
