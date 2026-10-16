import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LessonsPage } from '../../src/app/LessonsPage';
import { LESSONS_COURSE } from '../../src/lessons/lessons';
import { emptyLessonsProgress, LESSONS_KEY, markDone } from '../../src/lessons/progress';

describe('LessonsPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('shows progress from storage and opens a lesson at its first screen, then the practice', () => {
    localStorage.setItem(LESSONS_KEY, JSON.stringify(markDone(emptyLessonsProgress(), 'pins', true)));
    render(createElement(LessonsPage));
    expect(screen.getByTestId('lessons-progress').textContent).toContain(`1/${LESSONS_COURSE.length}`);
    expect(screen.getByTestId('lesson-pins').textContent).toContain('Done');

    const forks = LESSONS_COURSE.find((l) => l.id === 'forks')!;
    fireEvent.click(screen.getByTestId('lesson-forks'));
    expect(screen.getByTestId('lesson-screen').textContent).toContain(forks.screens[0].title);
    for (let i = 0; i < forks.screens.length; i++) fireEvent.click(screen.getByTestId('lesson-next'));
    expect(screen.getByTestId('lesson-prompt').textContent).toBe(forks.puzzles[0].prompt);
    expect(screen.getByTestId('lesson-step').textContent).toContain(`1 of ${forks.puzzles.length}`);
    // No "Show me" before any wrong try.
    expect(screen.queryByTestId('lesson-show')).toBeNull();
  });
});
