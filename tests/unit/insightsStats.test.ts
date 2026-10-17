import { describe, expect, it } from 'vitest';
import {
  bayesSlope,
  diffOfMeans,
  diffOfRates,
  gammaP,
  gammaPosteriorBelow,
  gammaQuantile,
  levelForZ,
  logGamma,
  normalCdf,
  poissonRate,
  rateRatio,
  shrink,
  wilson,
} from '../../src/insights/stats';

describe('insights stats: known values', () => {
  it('normal CDF and the 90% z', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(levelForZ(1.645)).toBeCloseTo(0.9, 3);
  });

  it('Wilson 90%: 5 of 10 and 0 of 10', () => {
    const w = wilson(5, 10);
    expect(w.value).toBe(0.5);
    expect(w.lo).toBeCloseTo(0.2693, 3);
    expect(w.hi).toBeCloseTo(0.7307, 3);
    const z = wilson(0, 10);
    expect(z.lo).toBe(0);
    expect(z.hi).toBeCloseTo(0.2130, 3);
    expect(wilson(0, 0)).toEqual({ value: 0, lo: 0, hi: 1 });
  });

  it('log-gamma and the incomplete gamma', () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(gammaP(3, 2)).toBeCloseTo(1 - 5 * Math.exp(-2), 10);
    expect(gammaP(10, 15)).toBeCloseTo(0.9301, 4);
    expect(gammaQuantile(0.5, 1)).toBeCloseTo(Math.log(2), 8);
  });

  it('exact Poisson 90%: matches chi-square tables', () => {
    const five = poissonRate(5, 1);
    expect(five.lo).toBeCloseTo(1.970, 2);
    expect(five.hi).toBeCloseTo(10.513, 2);
    const zero = poissonRate(0, 1);
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeCloseTo(2.996, 2);
    // Per 100 moves: 5 errors in 250 moves.
    const per100 = poissonRate(5, 2.5);
    expect(per100.value).toBe(2);
    expect(per100.lo).toBeCloseTo(1.970 / 2.5, 2);
  });

  it('shrinkage pulls a small sample toward the prior', () => {
    expect(shrink(4, 4, 0.5, 10)).toBeCloseTo((4 + 5) / 14, 10);
    expect(shrink(0, 0, 0.3, 10)).toBe(0.3);
    expect(shrink(400, 400, 0.5, 10)).toBeCloseTo(0.9878, 3);
  });

  it('Gamma posterior: P(rate < baseline)', () => {
    // No new data: the prior is centred on the baseline, a little over half its mass is below the mean.
    expect(gammaPosteriorBelow(0, 0, 3, 3, 2)).toBeCloseTo(gammaP(2, 2), 10);
    // 1 event in 525 moves against a baseline of 3 per 100: clearly below.
    expect(gammaPosteriorBelow(1, 5.25, 3, 3, 2)).toBeGreaterThan(0.99);
    // 16 events in 525 moves (the baseline rate): no evidence either way.
    const same = gammaPosteriorBelow(16, 5.25, 3, 3, 2);
    expect(same).toBeGreaterThan(0.35);
    expect(same).toBeLessThan(0.65);
  });

  it('difference of means and rates, and the rate ratio', () => {
    const d = diffOfMeans([1, 2, 3, 4], [1, 1, 1, 1]);
    expect(d.value).toBe(1.5);
    expect(d.lo).toBeCloseTo(1.5 - 1.645 * Math.sqrt(1.6667 / 4), 3);
    const r = diffOfRates(10, 100, 5, 100);
    expect(r.value).toBeCloseTo(0.05, 10);
    expect(r.hi - r.value).toBeCloseTo(1.645 * Math.sqrt(15) / 100, 6);
    const rr = rateRatio(20, 100, 10, 100);
    expect(rr.value).toBeCloseTo(2, 10);
    expect(rr.lo).toBeCloseTo(2 * Math.exp(-1.645 * Math.sqrt(0.15)), 6);
    expect(rateRatio(0, 10, 5, 10).value).toBeCloseTo(0.5 / 5.5, 10);
  });

  it('Bayesian slope: finds a clear trend, shrinks a flat one to zero', () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const ys = xs.map((x) => 1 - 0.01 * x + (x % 2 ? 0.02 : -0.02));
    const s = bayesSlope(xs, ys, 1);
    expect(s.value).toBeCloseTo(-0.01, 3);
    expect(s.hi).toBeLessThan(0);
    const flat = bayesSlope(xs, xs.map((x) => (x % 2 ? 0.6 : 0.4)), 0.05);
    expect(flat.lo).toBeLessThan(0);
    expect(flat.hi).toBeGreaterThan(0);
  });
});
