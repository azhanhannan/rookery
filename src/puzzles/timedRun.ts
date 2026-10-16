// Timed puzzles: a 3-minute race up the rating ladder. Pure state machine (times passed in); never rated.
import { TIMED_PUZZLES } from '../config/tunables';

type Cfg = typeof TIMED_PUZZLES;

export type TimedRun = {
  status: 'running' | 'over';
  startedAt: number;
  solved: number;
  misses: number;
  /** Set when the run ended. */
  endedBy?: 'time' | 'misses';
  endedAt?: number;
};

export function startRun(now: number): TimedRun {
  return { status: 'running', startedAt: now, solved: 0, misses: 0 };
}

/** Time left: the run's length less the time spent and the miss penalties; never below 0. */
export function remainingMs(run: TimedRun, now: number, cfg: Cfg = TIMED_PUZZLES): number {
  const at = run.status === 'over' ? (run.endedAt ?? now) : now;
  return Math.max(0, cfg.durationMs - (at - run.startedAt) - run.misses * cfg.missPenaltyMs);
}

/** Ends a running run whose clock reached 0. */
export function tick(run: TimedRun, now: number, cfg: Cfg = TIMED_PUZZLES): TimedRun {
  if (run.status !== 'running' || remainingMs(run, now, cfg) > 0) return run;
  return { ...run, status: 'over', endedBy: 'time', endedAt: now };
}

export function solve(run: TimedRun, now: number, cfg: Cfg = TIMED_PUZZLES): TimedRun {
  const t = tick(run, now, cfg);
  if (t.status !== 'running') return t;
  return { ...t, solved: t.solved + 1 };
}

/** A wrong move: costs time; the last allowed miss (or running out of time) ends the run. */
export function miss(run: TimedRun, now: number, cfg: Cfg = TIMED_PUZZLES): TimedRun {
  const t = tick(run, now, cfg);
  if (t.status !== 'running') return t;
  const next = { ...t, misses: t.misses + 1 };
  if (next.misses >= cfg.maxMisses) return { ...next, status: 'over', endedBy: 'misses', endedAt: now };
  return tick(next, now, cfg);
}

/** Rating of the next puzzle: starts easy and climbs with every puzzle tried. */
export function nextRating(run: TimedRun, cfg: Cfg = TIMED_PUZZLES): number {
  return cfg.startRating + (run.solved + run.misses) * cfg.step;
}

const BEST_KEY = 'rookery.timedBest';

/** Best score on this device, 0 when none. */
export function loadTimedBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Saves `score` when it beats the stored best; returns true for a new best. */
export function saveTimedBest(score: number): boolean {
  if (score <= loadTimedBest()) return false;
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // ignore: the best just isn't kept
  }
  return true;
}
