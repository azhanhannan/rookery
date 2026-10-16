// The header's coach badge: unread coach comments and unfinished homework for the signed-in player.
// Network only; nothing here is stored on the device.
import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../api/client';
import type { CoachUnreadResponse } from '../api/types';
import { useAuthStore } from '../account/authStore';
import { COACH } from '../config/tunables';

type CoachBadge = {
  unread: CoachUnreadResponse;
  /** Homework sets from current coaches not finished yet. */
  homeworkOpen: number;
  refresh: () => Promise<void>;
  reset: () => void;
};

const EMPTY: CoachUnreadResponse = { count: 0, games: [] };

export const useCoachBadge = create<CoachBadge>((set) => ({
  unread: EMPTY,
  homeworkOpen: 0,
  async refresh() {
    if (useAuthStore.getState().status !== 'signed-in') return;
    try {
      const [unread, hw] = await Promise.all([api.coach.unread(), api.coach.myHomework()]);
      set({ unread, homeworkOpen: hw.homework.filter((h) => !h.done).length });
    } catch {
      // The server being down just leaves the last numbers up.
    }
  },
  reset: () => set({ unread: EMPTY, homeworkOpen: 0 }),
}));

/** Keeps the badge current while signed in (on sign-in, every COACH.unreadPollMs, and on route changes). */
export function useCoachBadgePolling(): void {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    const { refresh, reset } = useCoachBadge.getState();
    if (status !== 'signed-in') {
      reset();
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), COACH.unreadPollMs);
    const onHash = () => void refresh();
    window.addEventListener('hashchange', onHash);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHash);
    };
  }, [status]);
}
