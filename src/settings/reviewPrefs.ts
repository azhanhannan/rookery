// Game Review preferences, saved per device (like the board theme): style, self-review, arrows, toggles.
import { useSyncExternalStore } from 'react';
import { REVIEW_STYLES, type ReviewStyle, type SelfReviewSetting } from '../review/reviewStyle';

export type ReviewPrefs = {
  /** null = Auto: from the player's rating (reviewStyle.defaultStyle). */
  style: ReviewStyle | null;
  selfReview: SelfReviewSetting;
  /** Red arrow: the opponent's best reply after a weak move. */
  threatArrow: boolean;
  /** Green arrow: the better move. */
  betterArrow: boolean;
  /** Learner: list only the key moments. */
  keyMomentsOnly: boolean;
  /** Learner: show the numbers (label name, eval change). */
  learnerDetails: boolean;
  /** Analyst: show captions (off by default). */
  analystCaptions: boolean;
  /** Rookie the rook says the proven captions in a speech bubble (off by default). */
  coachMascot: boolean;
};

export const DEFAULT_REVIEW_PREFS: ReviewPrefs = {
  style: null,
  selfReview: 'learner',
  threatArrow: true,
  betterArrow: true,
  keyMomentsOnly: false,
  learnerDetails: false,
  analystCaptions: false,
  coachMascot: false,
};

const KEY = 'rookery.reviewPrefs';
const SELF_REVIEW: SelfReviewSetting[] = ['off', 'learner', 'always'];

/** Pure: stored JSON to prefs; anything unknown or malformed falls back to the default for that field. */
export function parseReviewPrefs(raw: string | null): ReviewPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // Corrupt entry: defaults.
  }
  const bool = (k: keyof ReviewPrefs) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (DEFAULT_REVIEW_PREFS[k] as boolean));
  return {
    style: REVIEW_STYLES.includes(v.style as ReviewStyle) ? (v.style as ReviewStyle) : null,
    selfReview: SELF_REVIEW.includes(v.selfReview as SelfReviewSetting)
      ? (v.selfReview as SelfReviewSetting)
      : DEFAULT_REVIEW_PREFS.selfReview,
    threatArrow: bool('threatArrow'),
    betterArrow: bool('betterArrow'),
    keyMomentsOnly: bool('keyMomentsOnly'),
    learnerDetails: bool('learnerDetails'),
    analystCaptions: bool('analystCaptions'),
    coachMascot: bool('coachMascot'),
  };
}

function read(): ReviewPrefs {
  try {
    return parseReviewPrefs(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_REVIEW_PREFS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function loadReviewPrefs(): ReviewPrefs {
  return current;
}

export function saveReviewPrefs(patch: Partial<ReviewPrefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
  listeners.forEach((l) => l());
}

/** Re-reads storage (preferences pulled from the account, or tests). */
export function reloadReviewPrefs(): void {
  current = read();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The saved review preferences; components re-render when they change. */
export function useReviewPrefs(): ReviewPrefs {
  return useSyncExternalStore(subscribe, loadReviewPrefs, loadReviewPrefs);
}
