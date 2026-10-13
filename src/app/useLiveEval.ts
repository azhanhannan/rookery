import { useEffect, useRef, useState } from 'react';
import { LIVE_EVAL } from '../config/tunables';
import { getEngine } from '../engine/EngineService';
import type { Score } from '../engine/types';
import { useBotStatus } from '../game/botTurn';
import { replay } from '../game/rules';
import type { GameRecord } from '../game/types';
import { formatScore, winChance } from '../review/winChance';

function show(score: Score) {
  return { white: winChance(score), label: formatScore(score) };
}

/** Wait this long on a position before analysing it, so arrow-key stepping doesn't queue searches. */
const DEBOUNCE_MS = 200;

export type LiveEval = {
  /** White's win chance, 0-100. */
  white: number;
  label: string;
  /** True while the shown value belongs to an earlier position. */
  stale: boolean;
  engine: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
};

/**
 * Live evaluation of the position at `ply`. Shares the app's one engine with the bot: it never starts
 * a search while the bot is thinking, and the bot stops any search of ours when its turn begins.
 */
export function useLiveEval(record: GameRecord, ply: number, enabled: boolean): LiveEval {
  const thinking = useBotStatus((s) => s.thinking);
  const chess = replay(record, ply);
  const fen = chess.fen();
  // Positions with no legal moves need no engine (and the engine returns no lines for them).
  const terminal: Score | 'draw' | null = chess.isCheckmate()
    ? { mate: chess.turn() === 'w' ? -1 : 1 }
    : chess.isStalemate()
      ? 'draw'
      : null;

  const ended = terminal !== null;
  // Per-FEN cache, so stepping back through the moves is instant after the first visit.
  const [scores, setScores] = useState<{ byFen: Record<string, Score>; latest: Score | null }>({
    byFen: {},
    latest: null,
  });
  const known = fen in scores.byFen;
  const inFlight = useRef(0);
  const [engine, setEngine] = useState<LiveEval['engine']>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || ended || thinking || known) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setEngine((s) => (s === 'ready' ? s : 'loading'));
        // getEngine may throw synchronously (stub) or reject.
        const e = await Promise.resolve().then(getEngine);
        if (cancelled || useBotStatus.getState().thinking) return;
        setEngine('ready');
        setError(null);
        // Only our own older search can be running here (the bot isn't thinking): end it, it's stale.
        if (inFlight.current > 0) e.stop();
        inFlight.current++;
        try {
          const res = await e.analyze(fen, { depth: LIVE_EVAL.depth, movetime: LIVE_EVAL.movetime });
          // A search cut short (by us or by the bot) is too shallow to keep.
          if (cancelled || useBotStatus.getState().thinking || !res.lines[0]) return;
          const score = res.lines[0].score;
          setScores((s) => ({ byFen: { ...s.byFen, [fen]: score }, latest: score }));
        } finally {
          inFlight.current--;
        }
      } catch (err) {
        // A search the bot interrupted may reject; that is not an engine failure.
        if (cancelled || useBotStatus.getState().thinking) return;
        setEngine((s) => (s === 'ready' ? s : 'error'));
        setError(err instanceof Error ? err.message : String(err));
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, ended, fen, known, thinking]);

  let current: { white: number; label: string } | null = null;
  if (terminal === 'draw') current = { white: 50, label: '½' };
  else if (terminal) current = { white: winChance(terminal), label: '#' };
  else if (known) current = show(scores.byFen[fen]);

  // Until this position is analysed, keep showing the last value (dimmed) rather than jumping to 0.0.
  const fallback = scores.latest ? show(scores.latest) : { white: 50, label: '0.0' };
  return { ...(current ?? fallback), stale: !current, engine, error };
}
