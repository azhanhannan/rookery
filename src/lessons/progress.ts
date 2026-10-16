// Finished lessons on this device, in localStorage under one key (a single JSON value with `updatedAt`, so
// account sync merges it whole as a 'stamped' key: src/sync/keys.ts).
export const LESSONS_KEY = 'rookery.lessons';

export type LessonRecord = {
  /** ISO time the lesson was last finished. */
  doneAt: string;
  /** How many times it's been finished. */
  times: number;
  /** Finished at least once without using "Show me". */
  clean: boolean;
};

export type LessonsProgress = { updatedAt: string; lessons: Record<string, LessonRecord> };

export function emptyLessonsProgress(): LessonsProgress {
  return { updatedAt: new Date(0).toISOString(), lessons: {} };
}

/** Pure: the progress after finishing a lesson. */
export function markDone(progress: LessonsProgress, id: string, clean: boolean, now: Date = new Date()): LessonsProgress {
  const old = progress.lessons[id];
  const at = now.toISOString();
  return {
    updatedAt: at,
    lessons: {
      ...progress.lessons,
      [id]: { doneAt: at, times: (old?.times ?? 0) + 1, clean: clean || (old?.clean ?? false) },
    },
  };
}

/** How many of `ids` are finished. */
export function doneCount(progress: LessonsProgress, ids: string[]): number {
  return ids.filter((id) => progress.lessons[id]).length;
}

/** Pure: a stored value read back; anything malformed is dropped, never thrown. */
export function parseLessonsProgress(raw: string | null): LessonsProgress {
  if (!raw) return emptyLessonsProgress();
  try {
    const v = JSON.parse(raw) as { updatedAt?: unknown; lessons?: unknown } | null;
    if (!v || typeof v !== 'object' || !v.lessons || typeof v.lessons !== 'object') return emptyLessonsProgress();
    const lessons: Record<string, LessonRecord> = {};
    for (const [id, r] of Object.entries(v.lessons as Record<string, unknown>)) {
      if (!r || typeof r !== 'object') continue;
      const rec = r as Partial<LessonRecord>;
      if (typeof rec.doneAt !== 'string') continue;
      lessons[id] = {
        doneAt: rec.doneAt,
        times: typeof rec.times === 'number' && rec.times > 0 ? Math.floor(rec.times) : 1,
        clean: rec.clean === true,
      };
    }
    return { updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(), lessons };
  } catch {
    return emptyLessonsProgress();
  }
}

export function loadLessonsProgress(): LessonsProgress {
  try {
    return parseLessonsProgress(localStorage.getItem(LESSONS_KEY));
  } catch {
    return emptyLessonsProgress();
  }
}

/** Records a finished lesson and returns the new progress. */
export function recordLessonDone(id: string, clean: boolean): LessonsProgress {
  const next = markDone(loadLessonsProgress(), id, clean);
  try {
    localStorage.setItem(LESSONS_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the tick lasts until reload
  }
  return next;
}
