// The self-review question waits for the player's rating: useReviewStyle says when the style is settled.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileResponse } from '../../src/api/types';
import { useAuthStore } from '../../src/account/authStore';
import { useReviewStyle } from '../../src/app/useReviewStyle';
import { reloadReviewPrefs } from '../../src/settings/reviewPrefs';
import { play } from './helpers';

let answer: (p: ProfileResponse) => void = () => {};
let fail: (e: Error) => void = () => {};
vi.mock('../../src/api/client', async (orig) => ({
  ...(await orig<typeof import('../../src/api/client')>()),
  api: {
    profile: () =>
      new Promise<ProfileResponse>((res, rej) => {
        answer = res;
        fail = rej;
      }),
  },
}));

const record = play(['e2e4', 'e7e5']);
const user = (name: string) => ({ id: name, username: name }) as never;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ status: 'unknown', user: null });
});

describe('useReviewStyle: settled', () => {
  it('not while the session is unknown; yes once signed out', () => {
    const { result } = renderHook(() => useReviewStyle(record));
    expect(result.current.settled).toBe(false);
    act(() => useAuthStore.setState({ status: 'signed-out' }));
    expect(result.current.settled).toBe(true);
  });

  it('signed in: only after the account ratings answer, and then with the rating-based style', async () => {
    act(() => useAuthStore.setState({ status: 'signed-in', user: user('ana') }));
    const { result } = renderHook(() => useReviewStyle(record));
    expect(result.current.settled).toBe(false);
    expect(result.current.style).toBe('club'); // the pre-rating default the old code asked with
    await act(async () => answer({ ratings: [{ category: 'rapid', rating: 800, rd: 60, games: 12 }] } as unknown as ProfileResponse));
    expect(result.current.settled).toBe(true);
    expect(result.current.style).toBe('learner');
  });

  it('a failed ratings request settles too (no rating: the default style)', async () => {
    act(() => useAuthStore.setState({ status: 'signed-in', user: user('bo') }));
    const { result } = renderHook(() => useReviewStyle(record));
    expect(result.current.settled).toBe(false);
    await act(async () => fail(new Error('down')));
    expect(result.current.settled).toBe(true);
    expect(result.current.style).toBe('club');
  });

  it('a chosen style needs no rating', () => {
    localStorage.setItem('rookery.reviewPrefs', JSON.stringify({ style: 'analyst', selfReview: 'learner' }));
    reloadReviewPrefs();
    const { result } = renderHook(() => useReviewStyle(record));
    expect(result.current.style).toBe('analyst');
    expect(result.current.settled).toBe(true);
  });
});
