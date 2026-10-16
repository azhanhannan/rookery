// One endgame drill in play: the user's moves, Stockfish's replies at full strength, and the tablebase judging.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ENDGAMES } from '../config/tunables';
import { getEngine } from '../engine/EngineService';
import { outcomeFor, probeTablebase } from '../engine/tablebase';
import type { AnalysisResult } from '../engine/types';
import {
  judgeDrill,
  replayDrill,
  scoreOutcome,
  type DrillStatus,
  type DrillStep,
  type Judgement,
  type Verdict,
} from '../game/endgameJudge';
import { tryLegalMove, type MoveInput } from '../game/rules';
import type { Drill } from './drills';
import { recordResult } from './progress';

export type DrillMove = { uci: string; san: string; by: 'user' | 'engine' };

export type DrillState = {
  moves: DrillMove[];
  steps: DrillStep[];
  /** The latest known result for the user. */
  verdict: Verdict | null;
  status: DrillStatus;
  reason: string;
  /** Stockfish is choosing its move (or the tablebase is being asked about yours). */
  thinking: boolean;
  error: string | null;
};

const INITIAL: DrillState = { moves: [], steps: [], verdict: null, status: 'playing', reason: '', thinking: false, error: null };

function userMoveCount(moves: DrillMove[]): number {
  return moves.filter((m) => m.by === 'user').length;
}

export type DrillRun = DrillState & {
  fen: string;
  lastMove: { from: string; to: string } | null;
  move(input: MoveInput): boolean;
  restart(): void;
  /** Back to the position before `step` (the slip), to try that move again. */
  retryFrom(step: DrillStep): void;
};

export function useDrill(drill: Drill, onFinished?: () => void): DrillRun {
  const [state, setState] = useState<DrillState>(INITIAL);
  const ref = useRef(state);
  const run = useRef({ id: 0 });
  const finishedCb = useRef(onFinished);
  useEffect(() => {
    finishedCb.current = onFinished;
  });

  const set = useCallback((patch: Partial<DrillState>) => {
    ref.current = { ...ref.current, ...patch };
    setState(ref.current);
  }, []);

  const tbVerdict = useCallback(
    async (fen: string): Promise<Verdict | null> => {
      const tb = await probeTablebase(fen);
      return tb ? { outcome: outcomeFor(tb, drill.side), source: 'tablebase' } : null;
    },
    [drill.side],
  );

  const judge = useCallback(
    (current: Verdict | null): Judgement => {
      const moves = ref.current.moves;
      return judgeDrill({
        goal: drill.goal,
        winBy: drill.winBy,
        limit: drill.moves,
        user: drill.side,
        chess: replayDrill(drill.fen, moves.map((m) => m.uci)),
        userMoves: userMoveCount(moves),
        current,
      });
    },
    [drill],
  );

  const finish = useCallback(
    (j: Judgement) => {
      set({ status: j.status, reason: j.reason, thinking: false });
      recordResult(drill.id, j.status === 'passed', userMoveCount(ref.current.moves));
      finishedCb.current?.();
    },
    [drill.id, set],
  );

  /** Stockfish plays the defending side. `pending` is a search of this position already under way. */
  const engineTurn = useCallback(
    async (id: number, pending?: Promise<AnalysisResult>) => {
      set({ thinking: true, error: null });
      try {
        const chess = replayDrill(drill.fen, ref.current.moves.map((m) => m.uci));
        const fen = chess.fen();
        const r = await (pending ?? getEngine().then((e) => e.analyze(fen, { movetime: ENDGAMES.engineMovetimeMs, multiPV: 1 })));
        if (run.current.id !== id) return;
        const uci = r.lines[0]?.move;
        if (!uci) throw new Error('Stockfish found no move');
        const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        set({ moves: [...ref.current.moves, { uci, san: m.san, by: 'engine' }] });
        const j = judge(ref.current.verdict);
        if (j.status !== 'playing') return finish(j);
        set({ thinking: false });
        // The result before the user's next move. Until it arrives the last one stands (Stockfish's move can't
        // make things worse for itself with perfect play, only better for the user).
        const count = ref.current.moves.length;
        const v = await tbVerdict(chess.fen());
        if (run.current.id === id && v && ref.current.moves.length === count) set({ verdict: v });
      } catch (err) {
        if (run.current.id !== id) return;
        set({ thinking: false, error: `Engine unavailable: ${err instanceof Error ? err.message : String(err)}` });
      }
    },
    [drill.fen, finish, judge, set, tbVerdict],
  );

  /** Starts run `id` from the drill position: Stockfish moves first when it's the defender's turn. */
  const begin = useCallback(
    async (id: number) => {
      // Not inside the caller's render or effect: everything here sets state.
      await Promise.resolve();
      if (run.current.id !== id) return;
      if (drill.fen.split(' ')[1] !== drill.side) void engineTurn(id);
      const v = await tbVerdict(drill.fen);
      if (run.current.id === id && v && ref.current.verdict === null) set({ verdict: v });
    },
    [drill.fen, drill.side, engineTurn, set, tbVerdict],
  );

  const restart = useCallback(() => {
    const id = ++run.current.id;
    ref.current = INITIAL;
    setState(INITIAL);
    void begin(id);
  }, [begin]);

  useEffect(() => {
    const r = run.current;
    void begin(++r.id);
    return () => {
      r.id++;
    };
  }, [begin]);

  const afterUserMove = useCallback(
    async (id: number, played: DrillStep) => {
      let step = played;
      const chess = replayDrill(drill.fen, ref.current.moves.map((m) => m.uci));
      if (chess.isGameOver()) {
        const mated = chess.isCheckmate();
        const after: Verdict = { outcome: mated ? 'win' : 'draw', source: 'rules' };
        set({ steps: [...ref.current.steps, { ...step, after }], verdict: after });
        return finish(judge(after));
      }
      const fen = chess.fen();
      // Stockfish starts on its reply while the tablebase is asked about the user's move.
      const search = getEngine().then((e) => e.analyze(fen, { movetime: ENDGAMES.engineMovetimeMs, multiPV: 1 }));
      search.catch(() => {});
      // The result before the move may still be on its way (a quick first move): ask again, it's shared/cached.
      const beforeP = step.before ? Promise.resolve(step.before) : tbVerdict(step.fenBefore);
      let after = await tbVerdict(fen);
      const before = await beforeP;
      if (run.current.id !== id) return;
      step = { ...step, before };
      if (!after) {
        // Offline: the engine's eval of the position stands in.
        const r = await search.catch(() => null);
        if (run.current.id !== id) return;
        const score = r?.lines[0]?.score;
        if (score) after = { outcome: scoreOutcome(score, drill.side, ENDGAMES.evalWinCp), source: 'engine' };
      }
      const current = after ?? ref.current.verdict;
      set({ steps: [...ref.current.steps, { ...step, after }], verdict: current });
      const j = judge(current);
      if (j.status !== 'playing') return finish(j);
      await engineTurn(id, search);
    },
    [drill.fen, drill.side, engineTurn, finish, judge, set, tbVerdict],
  );

  const move = useCallback(
    (input: MoveInput): boolean => {
      const s = ref.current;
      if (s.status !== 'playing' || s.thinking) return false;
      const chess = replayDrill(drill.fen, s.moves.map((m) => m.uci));
      if (chess.turn() !== drill.side) return false;
      const fenBefore = chess.fen();
      const m = tryLegalMove(chess, input);
      if (!m) return false;
      const san = m.san;
      const uci = m.from + m.to + (m.promotion ?? '');
      const step: DrillStep = {
        ply: s.moves.length,
        moveNo: Number(fenBefore.split(' ')[5]) || 1,
        san,
        uci,
        fenBefore,
        before: s.verdict,
        after: null,
      };
      set({ moves: [...s.moves, { uci, san, by: 'user' }], thinking: true, error: null });
      void afterUserMove(run.current.id, step);
      return true;
    },
    [afterUserMove, drill.fen, drill.side, set],
  );

  const retryFrom = useCallback(
    (step: DrillStep) => {
      run.current.id++;
      set({
        moves: ref.current.moves.slice(0, step.ply),
        steps: ref.current.steps.filter((s) => s.ply < step.ply),
        verdict: step.before,
        status: 'playing',
        reason: '',
        thinking: false,
        error: null,
      });
    },
    [set],
  );

  const chess = replayDrill(drill.fen, state.moves.map((m) => m.uci));
  const last = state.moves[state.moves.length - 1];
  return {
    ...state,
    fen: chess.fen(),
    lastMove: last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null,
    move,
    restart,
    retryFrom,
  };
}
