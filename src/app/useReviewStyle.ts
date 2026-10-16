import { useEffect, useRef, useState } from 'react';
import { pickAccountRating, useAccountRatings } from '../account/accountRating';
import { useAuthStore } from '../account/authStore';
import { useSyncStore } from '../account/syncStore';
import { categoryFor } from '../rating/glicko';
import type { GameRecord } from '../game/types';
import { REVIEW, REVIEW_STYLE } from '../config/tunables';
import type { AnalysisResult } from '../engine/types';
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
 * `rating` is that rating, for other level-aware text (the accuracy line). `settled` is false while the style
 * may still change because the session or the account's ratings haven't answered yet.
 */
export function useReviewStyle(record: GameRecord): { style: ReviewStyle; prefs: ReviewPrefs; rating: number | null; settled: boolean } {
  const prefs = useReviewPrefs();
  const sessionRating = useSessionRating();
  const auth = useAuthStore((s) => s.status);
  const rows = useAccountRatings();
  const accountRating = pickAccountRating(rows, categoryFor(record.timeControl));
  const rating = ratingHint(record, sessionRating ?? accountRating);
  const settled = prefs.style !== null || sessionRating !== null || auth === 'signed-out' || auth === 'offline' || rows !== null;
  return { style: effectiveStyle(prefs.style, rating), prefs, rating, settled };
}

export type DeepenRun = {
  /** Ply being analysed, or null. */
  running: number | null;
  error: string | null;
  start(ply: number, depth: number): void;
  /** The deeper check's top lines for the position before the move at `ply` (the start position for ply 0). */
  lines: { ply: number; analysis: AnalysisResult } | null;
};

/** "Analyse deeper here": one deeper search at a time; leaving the screen cancels it. */
export function useDeepen(review: GameReview, onDone: (review: GameReview) => void): DeepenRun {
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<DeepenRun['lines']>(null);
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
    setLines(null);
    const linesAt = Math.max(0, ply - 1);
    deepenReview(latest.current.review, ply, {
      depth,
      signal: ctrl.signal,
      multiPV: Math.max(REVIEW.multiPV, REVIEW_STYLE.deepLines),
      onAnalysis: (i, analysis) => {
        if (i === linesAt && current.current === ctrl) setLines({ ply, analysis });
      },
    }).then(
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

  return { running, error, start, lines };
}
