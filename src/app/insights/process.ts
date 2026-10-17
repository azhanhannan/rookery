// Process measures for a Focus, from day one (pure): the work the player controls, read from state that
// already exists: the training log, the My-mistakes schedule, finished lessons and endgame drills.
import { MISTAKES } from '../../config/tunables';
import type { EndgamesProgress } from '../../endgames/progress';
import type { GameRecord } from '../../game/types';
import { moveMotif } from '../../insights/moveMotif';
import type { Motif, TrainTarget } from '../../insights/types';
import type { LessonsProgress } from '../../lessons/progress';
import { dayKey } from '../../puzzles/days';
import type { MistakePuzzle } from '../../puzzles/harvest';
import type { Schedule } from '../../puzzles/spacedRepetition';
import type { TrainingLog } from '../../training/trainingLog';

/** My-mistakes puzzles whose move is filed under `motif` (same rules as the Insights facts). */
export function mistakesForMotif(mistakes: MistakePuzzle[], records: GameRecord[], motif: Motif): MistakePuzzle[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  return mistakes.filter((p) => {
    const r = byId.get(p.source.gameId);
    return !!r && moveMotif(r, p.source.ply, p.source.color) === motif;
  });
}

/** Stage a card reaches by passing its 7-day review (MISTAKES.intervals = [1, 3, 7, 21]: the third clean solve schedules the 7-day gap). */
export const PASSED_WEEK_STAGE = Math.max(1, MISTAKES.intervals.indexOf(7) + 2);

export type ProcessMeasures = {
  /** Training-log activities since the Focus started (local days, inclusive). */
  puzzles: number;
  lessons: number;
  endgames: number;
  openings: number;
  /** My-mistakes cards for the Focus motif: how many, and how many passed their 7-day review (or retired). */
  mistakes: { total: number; passed: number } | null;
  /** The linked lesson: finished at all, and finished since the Focus started. */
  lesson: { id: string; done: boolean; doneSince: boolean } | null;
  /** The linked endgame drill: passed at all, and attempted since the start. */
  drill: { id: string; passed: boolean; triedSince: boolean } | null;
};

export function processMeasures(input: {
  startedAt: string;
  motif?: Motif;
  train?: TrainTarget | null;
  log: TrainingLog;
  schedule: Schedule;
  mistakes: MistakePuzzle[] | null;
  lessons: LessonsProgress;
  endgames: EndgamesProgress;
}): ProcessMeasures {
  const from = dayKey(new Date(input.startedAt));
  const sum = (kind: 'puzzle' | 'lesson' | 'endgame' | 'opening') =>
    Object.entries(input.log.days).reduce((s, [d, l]) => s + (d >= from ? (l[kind]?.n ?? 0) : 0), 0);
  let mistakes: ProcessMeasures['mistakes'] = null;
  if (input.mistakes && input.motif && input.motif !== 'other') {
    const passed = input.mistakes.filter((p) => {
      const c = input.schedule[p.id];
      return !!c && (c.retired || c.stage >= PASSED_WEEK_STAGE);
    }).length;
    mistakes = { total: input.mistakes.length, passed };
  }
  const t = input.train;
  let lesson: ProcessMeasures['lesson'] = null;
  if (t?.kind === 'lesson') {
    const rec = input.lessons.lessons[t.lessonId];
    lesson = { id: t.lessonId, done: !!rec, doneSince: !!rec && rec.doneAt >= input.startedAt };
  }
  let drill: ProcessMeasures['drill'] = null;
  if (t?.kind === 'endgames' && t.drillId) {
    const p = input.endgames.drills[t.drillId];
    drill = { id: t.drillId, passed: !!p && p.passes > 0, triedSince: !!p && p.lastAt >= input.startedAt };
  }
  return { puzzles: sum('puzzle'), lessons: sum('lesson'), endgames: sum('endgame'), openings: sum('opening'), mistakes, lesson, drill };
}
