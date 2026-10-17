// The Focus re-test (analytics round 2 §2), pure. The baseline is frozen and shrunk when the Focus starts, so
// picking the worst bucket (which regresses toward the mean on its own) can't pass for improvement. Only games
// played after the start count; the verdict waits for the window to close.
import { INSIGHTS } from '../config/tunables';
import { bucketGames, priorsOf, summariseBucket } from './buckets';
import { gammaPosteriorBelow, poissonRate, type Estimate } from './stats';
import type { BucketId, GameFacts } from './types';

/** User state (synced as `rookery.focus` later): what was pre-registered when the Focus started. */
export type Focus = {
  bucketId: BucketId;
  startedAt: string;
  /** Shrunk events per 100 qualifying moves at the start. */
  baselineRate: number;
  unit: 'per100moves';
  /** baselineRate × INSIGHTS.focus.targetFactor. */
  target: number;
  minGames: number;
  minDays: number;
  factsVersion: number;
  setBy?: 'self' | 'coach';
};

export type FocusVerdict = 'improved' | 'no-clear-change' | 'worse';
export type FocusState = 'too-early' | 'on-track' | 'not-yet' | 'verdict';

export type FocusStatus = {
  state: FocusState;
  /** Only when state is 'verdict'. */
  verdict?: FocusVerdict;
  /** New games, qualifying moves and events since the start, and the raw rate per 100 moves. */
  games: number;
  moves: number;
  events: number;
  rate: Estimate;
  /** P(new rate < baseline), and P(new rate > baseline). */
  pBelow: number;
  pAbove: number;
  gamesLeft: number;
  daysLeft: number;
  /** False when the facts rules changed since the start: before/after aren't comparable. */
  comparable: boolean;
};

const DAY_MS = 86_400_000;

/** Pre-registers a Focus on `bucketId` from all facts on file (the long window). */
export function startFocus(facts: GameFacts[], bucketId: BucketId, now: Date = new Date(), setBy: Focus['setBy'] = 'self'): Focus {
  const baselineRate = summariseBucket(facts, bucketId, priorsOf(facts)).shrunkRate;
  return {
    bucketId,
    startedAt: now.toISOString(),
    baselineRate,
    unit: 'per100moves',
    target: baselineRate * INSIGHTS.focus.targetFactor,
    minGames: INSIGHTS.focus.minGames,
    minDays: INSIGHTS.focus.minDays,
    factsVersion: INSIGHTS.factsVersion,
    setBy,
  };
}

/**
 * Where the Focus stands after the games played since it started (`facts` may hold older games too; they are
 * ignored). too-early: < 5 games or < 150 moves; on-track: P(rate < baseline) ≥ 0.8; not-yet otherwise; at the
 * window's end (≥ minGames and ≥ minDays) a verdict: improved needs P ≥ 0.95, worse needs P(higher) ≥ 0.95.
 */
export function focusStatus(focus: Focus, facts: GameFacts[], now: Date = new Date()): FocusStatus {
  const since = facts.filter((f) => f.playedAt > focus.startedAt && f.factsVersion === focus.factsVersion);
  const rows = bucketGames(since, focus.bucketId);
  const games = rows.length;
  const moves = rows.reduce((s, r) => s + r.moves, 0);
  const events = rows.reduce((s, r) => s + r.events, 0);
  const exposure = moves / 100;
  const pBelow = gammaPosteriorBelow(events, exposure, focus.baselineRate, focus.baselineRate);
  const pAbove = 1 - pBelow;
  const days = (now.getTime() - Date.parse(focus.startedAt)) / DAY_MS;
  const t = INSIGHTS.focus;
  const base = {
    games,
    moves,
    events,
    rate: poissonRate(events, exposure),
    pBelow,
    pAbove,
    gamesLeft: Math.max(0, focus.minGames - games),
    daysLeft: Math.max(0, Math.ceil(focus.minDays - days)),
    comparable: focus.factsVersion === INSIGHTS.factsVersion,
  };
  if (games >= focus.minGames && days >= focus.minDays && moves >= t.earlyMoves) {
    const verdict: FocusVerdict = pBelow >= t.verdictP ? 'improved' : pAbove >= t.verdictP ? 'worse' : 'no-clear-change';
    return { ...base, state: 'verdict', verdict };
  }
  if (games < t.earlyGames || moves < t.earlyMoves) return { ...base, state: 'too-early' };
  return { ...base, state: pBelow >= t.onTrackP ? 'on-track' : 'not-yet' };
}
