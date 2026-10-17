// Small, exact-enough statistics for Insights (pure). Every interval defaults to 90% (INSIGHTS.z).
import { INSIGHTS } from '../config/tunables';

export type Interval = { lo: number; hi: number };
export type Estimate = Interval & { value: number };

/** Two-sided level for a normal z (1.645 -> 0.9). */
export function levelForZ(z: number): number {
  return 2 * normalCdf(z) - 1;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 on erf, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Wilson score interval for x successes in n trials; value = x / n. n = 0 gives [0, 1]. */
export function wilson(x: number, n: number, z = INSIGHTS.z): Estimate {
  if (n <= 0) return { value: 0, lo: 0, hi: 1 };
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { value: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** ln Γ(x), Lanczos (g = 7, n = 9). */
export function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x) = CDF at x of Gamma(shape a, rate 1). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series.
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction (Lentz) for Q, then P = 1 - Q.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Quantile of Gamma(shape a, rate 1) by bisection. */
export function gammaQuantile(p: number, a: number): number {
  if (p <= 0) return 0;
  let lo = 0;
  let hi = Math.max(1, a);
  while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

/**
 * Exact (Garwood) Poisson interval for `events` in `exposure` units, as a rate per unit.
 * For a per-100-moves rate pass exposure = moves / 100.
 */
export function poissonRate(events: number, exposure: number, level = levelForZ(INSIGHTS.z)): Estimate {
  if (exposure <= 0) return { value: 0, lo: 0, hi: Infinity };
  const alpha = 1 - level;
  const lo = events === 0 ? 0 : gammaQuantile(alpha / 2, events) / exposure;
  const hi = gammaQuantile(1 - alpha / 2, events + 1) / exposure;
  return { value: events / exposure, lo, hi };
}

/** Shrinkage toward a prior: (sum + k·prior) / (n + k). */
export function shrink(sum: number, n: number, prior: number, k = INSIGHTS.shrinkK): number {
  return n + k > 0 ? (sum + k * prior) / (n + k) : prior;
}

/**
 * P(rate < threshold) under the Gamma posterior Gamma(a0 + events, b0 + exposure), with a weak prior of
 * `priorEvents` events centred on `priorMean` (a0 = priorEvents, b0 = priorEvents / priorMean).
 */
export function gammaPosteriorBelow(
  events: number,
  exposure: number,
  threshold: number,
  priorMean: number,
  priorEvents = INSIGHTS.focus.priorEvents,
): number {
  if (priorMean <= 0) return events === 0 ? 1 : 0;
  const shape = priorEvents + events;
  const rate = priorEvents / priorMean + exposure;
  return gammaP(shape, rate * threshold);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Sample variance (n - 1); 0 below two values. */
export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Difference of two means (a - b), normal (Welch) interval. */
export function diffOfMeans(a: number[], b: number[], z = INSIGHTS.z): Estimate {
  const value = mean(a) - mean(b);
  const se = Math.sqrt((a.length ? variance(a) / a.length : 0) + (b.length ? variance(b) / b.length : 0));
  return { value, lo: value - z * se, hi: value + z * se };
}

/** Difference of two Poisson rates (k1/m1 - k2/m2), normal interval. */
export function diffOfRates(k1: number, m1: number, k2: number, m2: number, z = INSIGHTS.z): Estimate {
  const value = k1 / m1 - k2 / m2;
  const se = Math.sqrt(k1 / (m1 * m1) + k2 / (m2 * m2));
  return { value, lo: value - z * se, hi: value + z * se };
}

/** Rate ratio (k1/m1) / (k2/m2) with a log-scale interval; 0.5 is added to empty counts. */
export function rateRatio(k1: number, m1: number, k2: number, m2: number, z = INSIGHTS.z): Estimate {
  const a = k1 === 0 || k2 === 0 ? k1 + 0.5 : k1;
  const b = k1 === 0 || k2 === 0 ? k2 + 0.5 : k2;
  const log = Math.log(a / m1 / (b / m2));
  const se = Math.sqrt(1 / a + 1 / b);
  return { value: Math.exp(log), lo: Math.exp(log - z * se), hi: Math.exp(log + z * se) };
}

/**
 * Bayesian linear slope of y on x: flat prior on the intercept, Normal(0, priorSd²) on the slope, noise
 * variance plugged in from the least-squares residuals. Returns the posterior mean and its z-interval.
 */
export function bayesSlope(xs: number[], ys: number[], priorSd: number, z = INSIGHTS.z): Estimate & { n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { value: 0, lo: -priorSd * z, hi: priorSd * z, n };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const ols = sxx > 0 ? sxy / sxx : 0;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (ys[i] - my - ols * (xs[i] - mx)) ** 2;
  const sigma2 = Math.max(rss / (n - 2), 1e-12);
  const precision = sxx / sigma2 + 1 / (priorSd * priorSd);
  const value = sxy / sigma2 / precision;
  const sd = Math.sqrt(1 / precision);
  return { value, lo: value - z * sd, hi: value + z * sd, n };
}

/** Median; null for no values. */
export function medianOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
