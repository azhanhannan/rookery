import { describe, expect, it } from 'vitest';
import {
  findTimeControl,
  formatClock,
  fromClk,
  newClock,
  pressClock,
  remaining,
  stopClock,
  toClk,
} from '../../src/game/clock';

describe('clock', () => {
  const tc = findTimeControl('180+2')!;

  it("White's first move is free, then each move charges the mover and adds the increment", () => {
    let c = newClock(tc);
    c = pressClock(c, 'w', 1_000);
    expect(c.w).toBe(180_000);
    expect(c.running).toBe('b');
    expect(remaining(c, 'b', 6_000)).toBe(175_000);
    c = pressClock(c, 'b', 6_000);
    expect(c.b).toBe(177_000);
    c = pressClock(c, 'w', 16_000);
    expect(c.w).toBe(172_000);
  });

  it('stop charges the time used and freezes', () => {
    let c = pressClock(newClock(tc), 'w', 0);
    c = stopClock(c, 4_000);
    expect(c.b).toBe(176_000);
    expect(c.running).toBeNull();
  });

  it('formats', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(9_450)).toBe('0:09.4');
    expect(toClk(3_725_000)).toBe('1:02:05');
    expect(fromClk('1:02:05')).toBe(3_725_000);
    expect(fromClk('0:00:09.4')).toBe(9_400);
  });
});
