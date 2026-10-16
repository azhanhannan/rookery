import { useEffect, useRef, useState } from 'react';
import { pickAccountRating, useAccountRatings } from '../account/accountRating';
import { useSyncStore } from '../account/syncStore';
import { categoryFor } from '../rating/glicko';
import type { GameRecord } from '../game/types';
import { deepenReview } from '../review/deepen';
import { effectiveStyle, ratingHint, type ReviewStyle } from '../review/reviewStyle';
import type { GameReview } from '../review/types';
import { useReviewPrefs, type ReviewPrefs } from '../settings/reviewPrefs';

/** The latest rating a rated game reported this session (the server's answer), if any. */
function useSessionRating(): number | null {
  return useSyncStore((s) => {
    const ratings = Object.values(s.byId)
      .map((r) => r.rating?.after)
      .filter((r): r is number => typeof r === 'number');
    return ratings.length ? ratings[ratings.length - 1] : null;
  });
}

/**
 * The review style in force for this game: the saved choice, or Auto from the player's rating (this session's
 * latest rated result, else the signed-in account's rating for the game's category, else the game's own hint).
 * `rating` is that rating, for other level-aware text (the accuracy line).
 */
export function useReviewStyle(record: GameRecord): { style: ReviewStyle; prefs: ReviewPrefs; rating: number | null } {
  const prefs = useReviewPrefs();
  const sessionRating = useSessionRating();
  const accountRating = pickAccountRating(useAccountRatings(), categoryFor(record.timeControl));
  const rating = ratingHint(record, sessionRating ?? accountRating);
  return { style: effectiveStyle(prefs.style, rating), prefs, rating };
}

export type DeepenRun = {
  /** Ply being analysed, or null. */
  running: number | null;
  error: string | null;
  start(ply: number, depth: number): void;
};

/** "Analyse deeper here": one deeper search at a time; leaving the screen cancels it. */
export function useDeepen(review: GameReview, onDone: (review: GameReview) => void): DeepenRun {
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);
  const latest = useRef({ review, onDone });
  useEffect(() => {
    latest.current = { review, onDone };
  });
  useEffect(() => () => current.current?.abort(), []);

  function start(ply: number, depth: number) {
    current.current?.abort();
    const ctrl = new AbortController();
    current.current = ctrl;
    setRunning(ply);
    setError(null);
    deepenReview(latest.current.review, ply, { depth, signal: ctrl.signal }).then(
      (next) => {
        if (current.current !== ctrl) return;
        current.current = null;
        setRunning(null);
        latest.current.onDone(next);
      },
      (err: unknown) => {
        if (current.current !== ctrl) return;
        current.current = null;
        setRunning(null);
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      },
    );
  }

  return { running, error, start };
}
