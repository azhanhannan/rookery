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
import { countMixup } from './conflictPrompt';
import { chooseLine, conflictKeys, dueTotal, newMovesLeft, otherRepertoireWith, reviewsLeft, shouldRecord, trimToNew, type DrillMode } from './repertoire';
import { newLinesDone, newMovesDone, reviewsDone, useRepertoireStore } from './repertoireStore';

/** 'capped': today's share is done (Due now: OPENING_TRAINER.dailyReviews; Learn: the new-move budget). */
export type DrillPhase = 'idle' | 'opponent' | 'user' | 'wrong' | 'done' | 'empty' | 'capped';
export type DrillFeedback = { kind: 'good' | 'bad' | 'info'; text: string };

type DrillData = {
  repId: string | null;
  mode: DrillMode;
  path: string[];
  steps: DrillStep[];
  /** Next step to play. */
  index: number;
  /**
   * 'show': learning a line, new moves are shown first; 'quiz': from memory, answers are recorded;
   * 'recap': after the line, each missed move is asked once more (not recorded), so a run ends on a right move.
   */
  pass: 'show' | 'quiz' | 'recap';
  /** Step indexes still to ask in the recap. */
  recap: number[];
  /** The repertoire's name, and its positions where another same-colour repertoire plays something else (named as a cue). */
  repName: string;
  cue: string[];
  /** New moves recorded in this line. */
  fresh: number;
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
  /** Leaf ids of the lines played since this mode was started ("Next line" avoids them until all are done). */
  played: string[];
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
  recap: [],
  repName: '',
  cue: [],
  fresh: 0,
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
  played: [],
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
    // New moves met outside "Learn" are shown first (and so not recorded); only learning has a from-memory pass.
    const show = isNew && (s.pass === 'show' || s.mode !== 'learn');
    set({
      phase: 'user',
      arrow: show ? step.uci : null,
      shown: show,
      feedback: show
        ? { kind: 'info', text: `New move: play ${step.san}` }
        : s.cue.includes(step.key)
          ? { kind: 'info', text: `${s.repName}: your move` }
          : s.feedback?.kind === 'good'
            ? s.feedback
            : { kind: 'info', text: 'Your move' },
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
    if (s.pass === 'quiz' && s.failed.length) {
      // One more look at each missed move, from its own position, before the line ends.
      const recap = s.failed.map((key) => s.steps.findIndex((st) => st.user && st.key === key)).filter((i) => i >= 0);
      if (recap.length) {
        set({ phase: 'opponent', arrow: null, feedback: { kind: 'info', text: recap.length === 1 ? 'One more look at the move you missed' : 'One more look at the moves you missed' } });
        timer = setTimeout(() => {
          timer = null;
          askRecap(recap);
        }, OPENING_TRAINER.opponentDelayMs * 2);
        return;
      }
    }
    done();
  };

  /** Puts the board on the first recap step's position and asks it. */
  const askRecap = (recap: number[]) => {
    const step = get().steps[recap[0]];
    set({ pass: 'recap', recap, index: recap[0], fen: step.fenBefore, lastMove: null, plan: '', arrow: null, shown: false, phase: 'user', feedback: { kind: 'info', text: 'Your move' } });
  };

  const done = () => {
    const s = get();
    if (s.fresh > 0) useRepertoireStore.getState().countNewLine(todayKey());
    if (s.answered > 0) {
      recordTrainedDay();
      logTraining('opening');
    }
    const missed = s.answered - s.clean;
    const text =
      s.answered === 0
        ? 'Line complete'
        : missed === 0
          ? `Line complete: all ${s.answered} from memory`
          : `Line complete: ${s.clean} of ${s.answered} from memory, and you fixed ${missed === 1 ? 'the other one' : `the other ${missed}`}`;
    set({ phase: 'done', pass: 'quiz', recap: [], arrow: null, feedback: { kind: 'good', text } });
  };

  return {
    ...idle,
    start(repId, mode) {
      clearTimer();
      startTraining('opening');
      const repStore = useRepertoireStore.getState();
      const rep = repStore.data.repertoires.find((r) => r.id === repId);
      const today = todayKey();
      const newLeft = newMovesLeft(newMovesDone(repStore.daily, today), newLinesDone(repStore.daily, today), dueTotal(repStore.data, today));
      if ((mode === 'due' && reviewsLeft(reviewsDone(repStore.daily, today)) === 0) || (mode === 'learn' && newLeft === 0)) {
        set({ ...idle, repId, mode, phase: 'capped', fen: rep?.tree.nodes[rep.tree.rootId].fen ?? idle.fen });
        return false;
      }
      const prev = get();
      const same = prev.repId === repId && prev.mode === mode;
      const played = same ? prev.played : prev.repId === repId && prev.path.length ? [prev.path[prev.path.length - 1]] : [];
      const repCards = repStore.data.cards[repId] ?? {};
      const chosen = rep ? chooseLine(rep, repCards, mode, today, played) : null;
      // A long new line is learned a few moves a day: the rest of it waits for another day.
      const path = rep && chosen && mode === 'learn' ? trimToNew(rep, repCards, chosen, newLeft) : chosen;
      if (!rep || !path) {
        set({ ...idle, repId, mode, phase: 'empty', fen: rep?.tree.nodes[rep.tree.rootId].fen ?? idle.fen });
        return false;
      }
      const steps = drillSteps(rep.tree, rep.color, path);
      const leaf = path[path.length - 1];
      set({
        ...idle,
        repId,
        mode,
        path,
        steps,
        repName: rep.name,
        cue: [...conflictKeys(rep, repStore.data.repertoires)],
        pass: mode === 'learn' ? 'show' : 'quiz',
        fen: rep.tree.nodes[rep.tree.rootId].fen,
        // A line chosen again means every line has had its turn: start a new round.
        played: same && !played.includes(leaf) ? [...played, leaf] : [leaf],
      });
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
      if (s.pass === 'recap') {
        if (verdict !== 'correct') {
          set({ phase: 'wrong', arrow: step.uci, feedback: { kind: 'info', text: `Here it is: ${step.san}` } });
          return false;
        }
        sound(step.fenBefore, step.uci);
        const rest = s.recap.slice(1);
        set({ fen: step.fenAfter, lastMove: moveOf(step.uci), arrow: null, plan: step.plan, feedback: { kind: 'good', text: `${step.san}, got it` } });
        if (rest.length) {
          set({ phase: 'opponent' });
          timer = setTimeout(() => {
            timer = null;
            askRecap(rest);
          }, OPENING_TRAINER.opponentDelayMs * 2);
        } else done();
        return true;
      }
      if (verdict === 'other-line') {
        set({ arrow: step.uci, feedback: { kind: 'info', text: `That's in your repertoire too, but this line continues ${step.san}` } });
        return false;
      }
      if (verdict === 'wrong') {
        // Remembered right, just from another opening: named, and not a miss.
        const other = otherRepertoireWith(useRepertoireStore.getState().data.repertoires, rep.id, rep.color, step.fenBefore, uci);
        if (other) {
          countMixup(rep.id, other.id);
          set({ phase: 'wrong', arrow: step.uci, feedback: { kind: 'info', text: `That's your ${other.name} move. In this line it's ${step.san}` } });
          return false;
        }
        const failed = s.pass === 'quiz' && !s.shown && !s.failed.includes(step.key) ? [...s.failed, step.key] : s.failed;
        set({ phase: 'wrong', arrow: step.uci, failed, feedback: { kind: 'bad', text: `Not quite. Here it is: ${step.san}` } });
        return false;
      }
      // Correct.
      let { answered, clean, fresh } = s;
      const firstTime = !s.failed.includes(step.key);
      if (s.pass === 'quiz' && !s.shown) {
        const today = todayKey();
        const prevCard = cardOf(s.repId, step.key);
        // Only Due now and Learn change the schedule, and only for a card that is due (or new): extra practice and
        // moves a due line merely passes through don't count against it.
        if ((s.mode === 'due' || s.mode === 'learn') && shouldRecord(prevCard, today)) {
          const store = useRepertoireStore.getState();
          store.answer(s.repId, step.key, firstTime, today);
          if (prevCard && prevCard.reps > 0) store.countReview(today);
          else {
            store.countNew(today);
            fresh++;
          }
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
        fresh,
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
