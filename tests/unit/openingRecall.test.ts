import { beforeEach, describe, expect, it } from 'vitest';
import { recallRate, readRecall, recordRecall } from '../../src/openings/recall';

describe('opening recall log', () => {
  beforeEach(() => localStorage.clear());

  it('keeps per-day first-time recall and rates the last 30 days', () => {
    recordRecall('2026-10-01', true);
    recordRecall('2026-10-16', true);
    recordRecall('2026-10-16', false);
    recordRecall('2026-10-16', true);
    expect(readRecall()['2026-10-16']).toEqual([3, 2]);
    expect(recallRate(readRecall(), '2026-10-16')).toEqual({ reviews: 4, share: 0.75 });
    expect(recallRate(readRecall(), '2026-10-16', 10)).toEqual({ reviews: 3, share: 2 / 3 });
    expect(recallRate({}, '2026-10-16')).toBeNull();
  });

  it('drops days past the kept window', () => {
    recordRecall('2026-01-01', true);
    recordRecall('2026-10-16', true);
    expect(Object.keys(readRecall())).toEqual(['2026-10-16']);
  });
});
