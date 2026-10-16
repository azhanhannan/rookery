// Per-drill best results on this device, in localStorage under one key (a single JSON value with `updatedAt`,
// so account sync can later merge it whole).
export const PROGRESS_KEY = 'rookery.endgames';

export type DrillProgress = {
  attempts: number;
  passes: number;
  /** Best result so far. */
  best: 'passed' | 'failed';
  /** Fewest of your moves in a passed attempt. */
  bestMoves?: number;
  /** ISO time of the last attempt. */
  lastAt: string;
};

export type EndgamesProgress = { updatedAt: string; drills: Record<string, DrillProgress> };

export function emptyProgress(): EndgamesProgress {
  return { updatedAt: new Date(0).toISOString(), drills: {} };
}

/** Pure: the progress after one finished attempt. */
export function applyResult(
  progress: EndgamesProgress,
  id: string,
  passed: boolean,
  userMoves: number,
  now: Date = new Date(),
): EndgamesProgress {
  const old = progress.drills[id];
  const at = now.toISOString();
  const next: DrillProgress = {
    attempts: (old?.attempts ?? 0) + 1,
    passes: (old?.passes ?? 0) + (passed ? 1 : 0),
    best: passed || old?.best === 'passed' ? 'passed' : 'failed',
    lastAt: at,
  };
  const bestMoves = passed ? Math.min(userMoves, old?.bestMoves ?? Infinity) : old?.bestMoves;
  if (bestMoves !== undefined) next.bestMoves = bestMoves;
  return { updatedAt: at, drills: { ...progress.drills, [id]: next } };
}

/** Pure: a stored value read back, tolerating anything malformed. */
export function parseProgress(raw: string | null): EndgamesProgress {
  if (!raw) return emptyProgress();
  try {
    const v = JSON.parse(raw) as Partial<EndgamesProgress> | null;
    if (!v || typeof v !== 'object' || !v.drills || typeof v.drills !== 'object') return emptyProgress();
    const drills: Record<string, DrillProgress> = {};
    for (const [id, d] of Object.entries(v.drills)) {
      if (!d || typeof d !== 'object' || typeof d.attempts !== 'number') continue;
      drills[id] = {
        attempts: d.attempts,
        passes: typeof d.passes === 'number' ? d.passes : 0,
        best: d.best === 'passed' ? 'passed' : 'failed',
        lastAt: typeof d.lastAt === 'string' ? d.lastAt : new Date(0).toISOString(),
        ...(typeof d.bestMoves === 'number' ? { bestMoves: d.bestMoves } : {}),
      };
    }
    return { updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(), drills };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(): EndgamesProgress {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: EndgamesProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // ignore: progress just won't survive a reload
  }
}

/** Records one finished attempt and returns the new progress. */
export function recordResult(id: string, passed: boolean, userMoves: number): EndgamesProgress {
  const next = applyResult(loadProgress(), id, passed, userMoves);
  saveProgress(next);
  return next;
}
