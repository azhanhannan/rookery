import { describe, expect, it } from 'vitest';
import { formatScore, winChance } from '../../src/review/winChance';

// Expected values worked by hand: 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1).
// cp 100:  e^-0.368208 = 0.691963 -> 2 / 1.691963 = 1.182058 -> 50 + 9.1029 = 59.10
// cp 300:  e^-1.104624 = 0.331339 -> 2 / 1.331339 = 1.502247 -> 50 + 25.112 = 75.11
// cp 1000: e^-3.68208  = 0.025178 -> 2 / 1.025178 = 1.950883 -> 50 + 47.544 = 97.54
describe('winChance', () => {
  it('is 50 at an equal position', () => {
    expect(winChance({ cp: 0 })).toBe(50);
  });

  it('matches hand-computed values', () => {
    expect(winChance({ cp: 100 })).toBeCloseTo(59.10, 2);
    expect(winChance({ cp: 300 })).toBeCloseTo(75.11, 2);
    expect(winChance({ cp: 1000 })).toBeCloseTo(97.54, 2);
  });

  it('is symmetric for Black', () => {
    expect(winChance({ cp: -100 })).toBeCloseTo(100 - 59.10, 2);
    expect(winChance({ cp: -300 }) + winChance({ cp: 300 })).toBeCloseTo(100, 10);
  });

  it('clamps cp to +-1000', () => {
    expect(winChance({ cp: 5000 })).toBe(winChance({ cp: 1000 }));
    expect(winChance({ cp: -5000 })).toBe(winChance({ cp: -1000 }));
    expect(winChance({ cp: 5000 })).toBeLessThan(100);
  });

  it('scores mates as 100 for White and 0 for Black', () => {
    expect(winChance({ mate: 3 })).toBe(100);
    expect(winChance({ mate: 1 })).toBe(100);
    expect(winChance({ mate: -2 })).toBe(0);
  });
});

describe('formatScore', () => {
  it('formats centipawns in pawns with a sign', () => {
    expect(formatScore({ cp: 130 })).toBe('+1.3');
    expect(formatScore({ cp: -40 })).toBe('-0.4');
    expect(formatScore({ cp: 0 })).toBe('0.0');
    expect(formatScore({ cp: -3 })).toBe('0.0');
  });

  it('formats mates', () => {
    expect(formatScore({ mate: 3 })).toBe('M3');
    expect(formatScore({ mate: -2 })).toBe('-M2');
  });
});
