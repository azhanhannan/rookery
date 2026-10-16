// Name-the-square drill (pure, plus per-device bests in `rookery.squareDrill`): a square is named, the
// player clicks it; one run lasts EXTRAS.squareDrillMs.

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const ALL_SQUARES: string[] = FILES.flatMap((f) => RANKS.map((r) => `${f}${r}`));

export type DrillSide = 'white' | 'black';
/** What the player picked: a side, or a random one per run. */
export type DrillOrientation = DrillSide | 'random';

/** A random square, never the same as `prev` (so two clicks in a row are never the same answer). */
export function nextSquare(rand: () => number = Math.random, prev?: string): string {
  const pool = prev ? ALL_SQUARES.filter((s) => s !== prev) : ALL_SQUARES;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export type DrillRun = { target: string; score: number; misses: number };

export function startRun(rand: () => number = Math.random): DrillRun {
  return { target: nextSquare(rand), score: 0, misses: 0 };
}

/** A click: right adds a point, wrong adds a miss; either way the next square is named. */
export function answer(run: DrillRun, clicked: string, rand: () => number = Math.random): { run: DrillRun; correct: boolean } {
  const correct = clicked === run.target;
  return {
    correct,
    run: {
      target: nextSquare(rand, run.target),
      score: run.score + (correct ? 1 : 0),
      misses: run.misses + (correct ? 0 : 1),
    },
  };
}

/** Right answers out of all answers, 0-100 (100 with no answers). */
export function accuracy(run: Pick<DrillRun, 'score' | 'misses'>): number {
  const total = run.score + run.misses;
  return total === 0 ? 100 : Math.round((100 * run.score) / total);
}

export type DrillBests = Record<DrillSide, number>;

/** The bests with this run's score; `isBest` when it beat the old best (a first score above 0 counts). */
export function updateBests(bests: DrillBests, side: DrillSide, score: number): { bests: DrillBests; isBest: boolean } {
  if (score <= bests[side]) return { bests, isBest: false };
  return { bests: { ...bests, [side]: score }, isBest: true };
}

// --- storage ----------------------------------------------------------------------------------

const KEY = 'rookery.squareDrill';

export function parseBests(raw: string | null): DrillBests {
  const out: DrillBests = { white: 0, black: 0 };
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const b = v && typeof v === 'object' ? (v.best as Record<string, unknown> | undefined) : undefined;
    for (const side of ['white', 'black'] as const) {
      const n = b?.[side];
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[side] = Math.floor(n);
    }
  } catch {
    // corrupt: no bests
  }
  return out;
}

export function loadBests(): DrillBests {
  try {
    return parseBests(localStorage.getItem(KEY));
  } catch {
    return { white: 0, black: 0 };
  }
}

export function saveBests(bests: DrillBests): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ updatedAt: new Date().toISOString(), best: bests }));
  } catch {
    // storage blocked: the best lasts until reload
  }
}
