import { describe, expect, it } from 'vitest';
import { INSIGHTS } from '../../src/config/tunables';
import { summariseBucket } from '../../src/insights/buckets';
import { focusStatus, startFocus, type Focus } from '../../src/insights/focus';
import { day, fakeFacts } from '../fixtures/insights';

/** Picked as the worst bucket: two middlegame hanging pieces a game for 25 games. */
const pickWindow = Array.from({ length: 25 }, (_, i) =>
  fakeFacts({ id: `old${i}`, at: day(i), moves: [{ phase: 'M', loss: 30, motif: 'hanging' }, { phase: 'M', loss: 30, motif: 'hanging' }] }),
);
const START = new Date(day(24, 23));

/** New games from day 25 on, with `events(i)` hanging pieces each and `quietM` quiet middlegame moves. */
const after = (n: number, events: (i: number) => number, quietM = 16) =>
  Array.from({ length: n }, (_, i) =>
    fakeFacts({
      id: `new${i}`,
      at: day(25 + i),
      quiet: { M: quietM },
      moves: Array.from({ length: events(i) }, () => ({ phase: 'M' as const, loss: 30, motif: 'hanging' as const })),
    }),
  );

describe('Focus: start', () => {
  it('pre-registers a shrunk baseline, the unit, the target and the window', () => {
    const focus = startFocus(pickWindow, 'M:hanging', START);
    const raw = summariseBucket(pickWindow, 'M:hanging').rate.value;
    expect(raw).toBeCloseTo((50 / 450) * 100, 10);
    // Shrinkage takes the selection inflation out: the baseline sits below the raw rate.
    expect(focus.baselineRate).toBeLessThan(raw);
    expect(focus.baselineRate).toBeGreaterThan(5);
    expect(focus).toMatchObject({
      bucketId: 'M:hanging',
      startedAt: START.toISOString(),
      unit: 'per100moves',
      minGames: 15,
      minDays: 14,
      factsVersion: INSIGHTS.factsVersion,
      setBy: 'self',
    });
    expect(focus.target).toBeCloseTo(focus.baselineRate * 0.6, 10);
  });
});

describe('Focus: status after each game', () => {
  const focus = startFocus(pickWindow, 'M:hanging', START);

  it('too early: under 5 games or 150 moves; the raw count is still given', () => {
    const s = focusStatus(focus, [...pickWindow, ...after(3, () => 0)], new Date(day(28)));
    expect(s).toMatchObject({ state: 'too-early', games: 3, events: 0, gamesLeft: 12 });
    // 6 games but short ones: still under 150 moves.
    expect(focusStatus(focus, after(6, () => 0, 4), new Date(day(31))).state).toBe('too-early');
  });

  it('only games after the start count', () => {
    expect(focusStatus(focus, pickWindow, new Date(day(30))).games).toBe(0);
  });

  it('on track when P(rate below baseline) >= 0.8, not yet otherwise', () => {
    const good = focusStatus(focus, after(8, () => 0, 20), new Date(day(33)));
    expect(good.state).toBe('on-track');
    expect(good.pBelow).toBeGreaterThanOrEqual(0.8);
    const same = focusStatus(focus, after(8, (i) => (i % 2 ? 2 : 1), 20), new Date(day(33)));
    expect(same.state).toBe('not-yet');
  });

  it('verdict only at the end of the window (15 games and 14 days)', () => {
    const games = after(15, (i) => (i % 5 === 0 ? 1 : 0));
    // 15 games but only 10 days: progress, not a verdict.
    expect(focusStatus(focus, games, new Date(day(35))).state).toBe('on-track');
    const end = focusStatus(focus, games, new Date(day(40)));
    expect(end).toMatchObject({ state: 'verdict', verdict: 'improved', gamesLeft: 0, daysLeft: 0 });
    expect(end.pBelow).toBeGreaterThanOrEqual(0.95);
  });

  it('"worse" needs P(higher) >= 0.95 too', () => {
    const end = focusStatus(focus, after(15, () => 4), new Date(day(40)));
    expect(end).toMatchObject({ state: 'verdict', verdict: 'worse' });
  });

  it('regression to the mean is not improvement', () => {
    // The new games run at roughly the shrunk baseline (~8 per 100), well below the raw 11 that got the bucket
    // picked. A last-N vs previous-N comparison would call this a 25% drop; the re-test does not.
    const games = after(15, (i) => (i % 2 ? 2 : 1));
    const end = focusStatus(focus, games, new Date(day(40)));
    const raw = summariseBucket(pickWindow, 'M:hanging').rate.value;
    expect(end.rate.value).toBeLessThan(raw * 0.85);
    expect(end.state).toBe('verdict');
    expect(end.verdict).toBe('no-clear-change');
    expect(end.pBelow).toBeLessThan(0.8);
  });

  it('a Focus from older rules is flagged as not comparable and counts nothing', () => {
    const old: Focus = { ...focus, factsVersion: INSIGHTS.factsVersion - 1 };
    const s = focusStatus(old, after(15, () => 0), new Date(day(40)));
    expect(s.comparable).toBe(false);
    expect(s.games).toBe(0);
  });
});
