// The opening drill's screen state: the line being drilled, the board, the timed opponent moves and the feedback.
// Line choice and card scheduling are pure (./repertoire, ./drill); this only sequences them.
import { Chess } from 'chess.js';
import { create } from 'zustand';
import { OPENING_TRAINER } from '../config/tunables';
import type { MoveInput } from '../game/rules';
import { playSound, soundForMove } from '../game/sound';
import { todayKey } from '../puzzles/days';
import { recordTrainedDay } from '../puzzles/streak';
import { logTraining, startTraining } from '../training/trainingLog';
import { drillSteps, judgeMove, type DrillStep } from './drill';
import { chooseLine, shouldRecord, type DrillMode } from './repertoire';
import { useRepertoireStore } from './repertoireStore';

export type DrillPhase = 'idle' | 'opponent' | 'user' | 'wrong' | 'done' | 'empty';
export type DrillFeedback = { kind: 'good' | 'bad' | 'info'; text: string };

type DrillData = {
  repId: string | null;
  mode: DrillMode;
  path: string[];
  steps: DrillStep[];
  /** Next step to play. */
  index: number;
  /** 'show': learning a line, new moves are shown first; 'quiz': from memory, answers are recorded. */
  pass: 'show' | 'quiz';
  fen: string;
  lastMove: { from: string; to: string } | null;
  /** The move shown with an arrow (a new move being taught, or the right move after a wrong one). */
  arrow: string | null;
  /** The current step was shown before being asked, so its answer isn't recorded. */
  shown: boolean;
  phase: DrillPhase;
  /** Cards answered wrongly in this run of the line. */
  failed: string[];
  feedback: DrillFeedback | null;
  /** The plan (PGN comment) of the last move played. */
  plan: string;
  /** This line: answers recorded and how many were clean. */
  answered: number;
  clean: number;
};

export type DrillState = DrillData & {
  /** Starts the next line of `repId` for `mode` (avoiding the line just played). False when there is none. */
  start(repId: string, mode: DrillMode): boolean;
  move(input: MoveInput): boolean;
  stop(): void;
};

const idle: DrillData = {
  repId: null,
  mode: 'due',
  path: [],
  steps: [],
  index: 0,
  pass: 'quiz',
  fen: new Chess().fen(),
  lastMove: null,
  arrow: null,
  shown: false,
  phase: 'idle',
  failed: [],
  feedback: null,
  plan: '',
  answered: 0,
  clean: 0,
};

let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

function cardOf(repId: string, key: string) {
  return useRepertoireStore.getState().data.cards[repId]?.[key];
}

function sound(fen: string, uci: string) {
  try {
    playSound(soundForMove(new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })));
  } catch {
    // no sound for an unplayable move
  }
}

const moveOf = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });

export const useDrillStore = create<DrillState>((set, get) => {
  /** Plays opponent moves (after a pause) until it is the user's turn or the line ends. */
  const run = () => {
    clearTimer();
    const s = get();
    if (!s.repId) return;
    const step = s.steps[s.index];
    if (!step) return finish();
    if (!step.user) {
      set({ phase: 'opponent', arrow: null });
      timer = setTimeout(() => {
        timer = null;
        const cur = get();
        if (cur.steps[cur.index] !== step) return;
        sound(step.fenBefore, step.uci);
        set({ fen: step.fenAfter, lastMove: moveOf(step.uci), plan: step.plan, index: cur.index + 1 });
        run();
      }, OPENING_TRAINER.opponentDelayMs);
      return;
    }
    const card = cardOf(s.repId, step.key);
    const isNew = !card || card.reps === 0;
    const show = isNew && (s.pass === 'show' || s.mode === 'due');
    set({
      phase: 'user',
      arrow: show ? step.uci : null,
      shown: show,
      feedback: show ? { kind: 'info', text: `New move: play ${step.san}` } : s.feedback?.kind === 'good' ? s.feedback : { kind: 'info', text: 'Your move' },
    });
  };

  const finish = () => {
    const s = get();
    if (s.pass === 'show') {
      // Learned by watching: now the same line from memory.
      set({ phase: 'opponent', feedback: { kind: 'info', text: 'Now play the line from memory' }, arrow: null });
      timer = setTimeout(() => {
        timer = null;
        const root = s.steps[0]?.fenBefore ?? s.fen;
        set({ pass: 'quiz', index: 0, fen: root, lastMove: null, plan: '', failed: [] });
        run();
      }, OPENING_TRAINER.opponentDelayMs * 2);
      return;
    }
    if (s.answered > 0) {
      recordTrainedDay();
      logTraining('opening');
    }
    const text =
      s.answered === 0
        ? 'Line complete'
        : s.clean === s.answered
          ? `Line complete: all ${s.answered} right`
          : `Line complete: ${s.clean} of ${s.answered} right first time`;
    set({ phase: 'done', arrow: null, feedback: { kind: s.clean === s.answered ? 'good' : 'info', text } });
  };

  return {
    ...idle,
    start(repId, mode) {
      clearTimer();
      startTraining('opening');
      const rep = useRepertoireStore.getState().data.repertoires.find((r) => r.id === repId);
      const prev = get();
      const skip = prev.repId === repId && prev.path.length ? prev.path[prev.path.length - 1] : undefined;
      const path = rep ? chooseLine(rep, useRepertoireStore.getState().data.cards[repId] ?? {}, mode, todayKey(), skip) : null;
      if (!rep || !path) {
        set({ ...idle, repId, mode, phase: 'empty', fen: rep?.tree.nodes[rep.tree.rootId].fen ?? idle.fen });
        return false;
      }
      const steps = drillSteps(rep.tree, rep.color, path);
      set({ ...idle, repId, mode, path, steps, pass: mode === 'learn' ? 'show' : 'quiz', fen: rep.tree.nodes[rep.tree.rootId].fen });
      run();
      return true;
    },
    move(input) {
      const s = get();
      if (!s.repId || (s.phase !== 'user' && s.phase !== 'wrong')) return false;
      const step = s.steps[s.index];
      if (!step) return false;
      let uci: string;
      try {
        uci = new Chess(s.fen).move(input).lan;
      } catch {
        return false;
      }
      const rep = useRepertoireStore.getState().data.repertoires.find((r) => r.id === s.repId);
      if (!rep) return false;
      const verdict = judgeMove(rep.tree, step, uci);
      if (verdict === 'other-line') {
        set({ arrow: step.uci, feedback: { kind: 'info', text: `That's in your repertoire too, but this line continues ${step.san}` } });
        return false;
      }
      if (verdict === 'wrong') {
        const failed = s.pass === 'quiz' && !s.shown && !s.failed.includes(step.key) ? [...s.failed, step.key] : s.failed;
        set({ phase: 'wrong', arrow: step.uci, failed, feedback: { kind: 'bad', text: `Not your repertoire move. Play ${step.san}` } });
        return false;
      }
      // Correct.
      let { answered, clean } = s;
      const firstTime = !s.failed.includes(step.key);
      if (s.pass === 'quiz' && !s.shown) {
        const today = todayKey();
        if (shouldRecord(cardOf(s.repId, step.key), firstTime, today)) {
          useRepertoireStore.getState().answer(s.repId, step.key, firstTime, today);
        }
        answered++;
        if (firstTime) clean++;
      }
      sound(step.fenBefore, step.uci);
      set({
        fen: step.fenAfter,
        lastMove: moveOf(step.uci),
        arrow: null,
        plan: step.plan,
        index: s.index + 1,
        answered,
        clean,
        feedback: s.shown || !firstTime ? { kind: 'info', text: `${step.san}` } : { kind: 'good', text: `${step.san} is right` },
      });
      run();
      return true;
    },
    stop() {
      clearTimer();
      set({ ...idle });
    },
  };
});
