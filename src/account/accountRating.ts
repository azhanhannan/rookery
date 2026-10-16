// The signed-in player's server ratings (the same /profile answer the Profile page shows), fetched once per
// account and again after a rated game. Used for defaults (Review style, the Spar button); never required.
import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../api/client';
import type { RatingCategory, RatingRow } from '../api/types';
import { useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';

type State = {
  /** Whose ratings `rows` are, and after how many rated results this session. */
  key: string | null;
  rows: RatingRow[] | null;
};

const useAccountRatingStore = create<State>(() => ({ key: null, rows: null }));

/**
 * The rating to use for `category`: that category's when the player has one, else the category with the most
 * games. Null when there are no rated games at all.
 */
export function pickAccountRating(rows: RatingRow[] | null, category?: RatingCategory | null): number | null {
  if (!rows || rows.length === 0) return null;
  const exact = category ? rows.find((r) => r.category === category) : undefined;
  if (exact) return exact.rating;
  return [...rows].sort((a, b) => b.games - a.games)[0].rating;
}

/** The latest rating change in `category` this session (the server's answer to a rated game), if any. */
export function useSessionCategoryRating(category: RatingCategory | null): number | null {
  return useSyncStore((s) => {
    let last: number | null = null;
    for (const r of Object.values(s.byId)) if (r.rating && (!category || r.rating.category === category)) last = r.rating.after;
    return last;
  });
}

/** The signed-in player's rating rows; null while signed out, offline, loading, or when the server failed. */
export function useAccountRatings(): RatingRow[] | null {
  const username = useAuthStore((s) => (s.status === 'signed-in' ? (s.user?.username ?? null) : null));
  const rated = useSyncStore((s) => Object.values(s.byId).filter((r) => r.rating).length);
  const key = username ? `${username}:${rated}` : null;
  const rows = useAccountRatingStore((s) => (s.key !== null && username && s.key.startsWith(`${username}:`) ? s.rows : null));

  useEffect(() => {
    if (!key || !username || useAccountRatingStore.getState().key === key) return;
    useAccountRatingStore.setState({ key });
    api
      .profile(username)
      .then((p) => {
        if (useAccountRatingStore.getState().key === key) useAccountRatingStore.setState({ rows: p.ratings });
      })
      .catch(() => {
        // Server down: callers fall back to their usual default.
      });
  }, [key, username]);

  return rows;
}
