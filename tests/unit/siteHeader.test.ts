import { describe, expect, it } from 'vitest';
import { isCurrent, NAV_ITEMS } from '../../src/app/nav';

describe('site header', () => {
  it('keeps at most three always-shown pages (what fits at 360 px), every href unique', () => {
    expect(NAV_ITEMS.filter((i) => i.primary).length).toBeLessThanOrEqual(3);
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
  });

  it('marks the current page, including sub-routes and the start page', () => {
    const at = (hash: string) => NAV_ITEMS.filter((i) => isCurrent(i, hash)).map((i) => i.label);
    expect(at('#/review/abc')).toEqual(['Review']);
    expect(at('#/openings')).toEqual(['Openings']);
    expect(at('')).toEqual(['Play']);
    expect(at('#/reviewx')).toEqual([]);
  });
});
