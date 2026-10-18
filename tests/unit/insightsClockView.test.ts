// The Analyst clock card's rushed-critical part (profile Slice 2): the counts, the ratio, and the only training
// link it carries (calculation mode on Puzzles), shown only when quick critical moves clearly go wrong more often.
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClockView } from '../../src/app/insights/parts';
import type { ClockCard, RushedCritical } from '../../src/insights/types';

afterEach(cleanup);

const clock = (rushedCritical: RushedCritical | null): ClockCard => ({
  games: 20,
  troubleMoves: 10,
  troubleErrors: 1,
  normalMoves: 300,
  normalErrors: 10,
  ratio: { value: 1, lo: 0.2, hi: 4 },
  shown: false,
  differs: false,
  lostOnTimeWhileBetter: [],
  rushedCritical,
});

const rushed = (over: Partial<RushedCritical>): RushedCritical => ({
  games: 20,
  moves: 60,
  rushed: 20,
  rushedErrors: 10,
  slowErrors: 4,
  share: { value: 1 / 3, lo: 0.24, hi: 0.44 },
  ratio: { value: 5, lo: 2, hi: 12 },
  shown: true,
  evidence: [],
  ...over,
});

describe('ClockView: rushed critical moves', () => {
  it('before any version 2 review: asks for a re-review, no link', () => {
    render(createElement(ClockView, { clock: clock(null) }));
    expect(screen.getByTestId('rushed-critical').textContent).toContain('re-review your clocked games');
    expect(screen.queryByTestId('rushed-train')).toBeNull();
  });

  it('a clear habit: counts, the ratio with its interval, and Train this: calculation mode', () => {
    render(createElement(ClockView, { clock: clock(rushed({})) }));
    const text = screen.getByTestId('rushed-critical').textContent!;
    expect(text).toContain('Where only one move held: 10 errors in 20 quick moves (under half your usual time), 4 in 40 slower moves.');
    expect(text).toContain('as frequent on the quick ones');
    expect(text).toContain('Calculation mode');
    const link = screen.getByTestId('rushed-train');
    expect(link.getAttribute('href')).toBe('#/puzzles');
    expect(link.textContent).toBe('Train this: Puzzles');
  });

  it('no clear difference, or below the gate: no link', () => {
    render(createElement(ClockView, { clock: clock(rushed({ ratio: { value: 1.2, lo: 0.5, hi: 3 } })) }));
    expect(screen.getByTestId('rushed-critical').textContent).toContain('No clear difference');
    expect(screen.queryByTestId('rushed-train')).toBeNull();
    cleanup();
    render(createElement(ClockView, { clock: clock(rushed({ shown: false, moves: 12, games: 6 })) }));
    expect(screen.getByTestId('rushed-critical').textContent).toContain('not enough yet (12 moves over 6 clocked games');
    expect(screen.queryByTestId('rushed-train')).toBeNull();
  });
});
