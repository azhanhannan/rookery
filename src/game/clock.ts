import type { Color } from './types';

export type TimeControl = { id: string; label: string; baseMs: number; incMs: number };

export const TIME_CONTROLS: TimeControl[] = [
  { id: '60+0', label: '1+0', baseMs: 60_000, incMs: 0 },
  { id: '180+2', label: '3+2', baseMs: 180_000, incMs: 2_000 },
  { id: '300+0', label: '5+0', baseMs: 300_000, incMs: 0 },
  { id: '600+0', label: '10+0', baseMs: 600_000, incMs: 0 },
  { id: '900+10', label: '15+10', baseMs: 900_000, incMs: 10_000 },
];

export const UNLIMITED = 'unlimited';

export type ClockState = {
  w: number;
  b: number;
  incMs: number;
  /** Side whose clock is running, or null before the first move and after the game ends. */
  running: Color | null;
  /** Date.now() when the running side's turn began. */
  turnStartedAt: number | null;
};

export function findTimeControl(id: string | undefined): TimeControl | undefined {
  return TIME_CONTROLS.find((t) => t.id === id);
}

export function newClock(tc: TimeControl): ClockState {
  return { w: tc.baseMs, b: tc.baseMs, incMs: tc.incMs, running: null, turnStartedAt: null };
}

/** Time left for `color` at `now`, counting the turn in progress. */
export function remaining(clock: ClockState, color: Color, now: number): number {
  const base = clock[color];
  if (clock.running !== color || clock.turnStartedAt === null) return base;
  return base - (now - clock.turnStartedAt);
}

/**
 * Charges the mover for the turn, adds the increment and starts the opponent's clock.
 * White's first move is free: the clock starts once White has moved.
 */
export function pressClock(clock: ClockState, mover: Color, now: number): ClockState {
  const next = { ...clock };
  if (clock.running === mover) next[mover] = remaining(clock, mover, now) + clock.incMs;
  next.running = mover === 'w' ? 'b' : 'w';
  next.turnStartedAt = now;
  return next;
}

/** Freezes the clock with the time used so far charged. */
export function stopClock(clock: ClockState, now: number): ClockState {
  if (!clock.running) return clock;
  return {
    ...clock,
    [clock.running]: Math.max(0, remaining(clock, clock.running, now)),
    running: null,
    turnStartedAt: null,
  };
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (clamped < 10_000) return `${m}:${String(s).padStart(2, '0')}.${Math.floor((clamped % 1000) / 100)}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** PGN %clk format, h:mm:ss. */
export function toClk(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fromClk(clk: string): number | undefined {
  const m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(clk.trim());
  if (!m) return undefined;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}
