import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';
import { ANALYSIS } from '../config/tunables';
import { getEngine, type EngineService } from '../engine/EngineService';
import type { EngineLine } from '../engine/types';

export type AnalysisEngine = {
  /** Lines for the position being shown, best first; empty until the engine reports. */
  lines: EngineLine[];
  depth: number;
  /** 'done' = reached ANALYSIS.maxDepth (when one is set). */
  status: 'off' | 'loading' | 'running' | 'done' | 'error';
  error: string | null;
  /** 'mate' / 'stalemate' when the position has no legal moves (the engine isn't asked). */
  terminal: 'mate' | 'stalemate' | null;
};

/**
 * Continuous engine analysis of `fen` while `enabled`: restarts on every new position (after a short pause, so
 * stepping through moves doesn't queue searches) and stops when disabled or unmounted.
 */
export function useAnalysisEngine(fen: string, enabled: boolean, multiPV: number): AnalysisEngine {
  const [result, setResult] = useState<{ key: string; lines: EngineLine[]; depth: number } | null>(null);
  const [status, setStatus] = useState<AnalysisEngine['status']>('off');
  const [error, setError] = useState<string | null>(null);
  const key = `${fen}|${multiPV}`;

  let terminal: AnalysisEngine['terminal'] = null;
  try {
    const c = new Chess(fen);
    terminal = c.isCheckmate() ? 'mate' : c.isStalemate() ? 'stalemate' : null;
  } catch {
    terminal = null;
  }
  const run = enabled && terminal === null;

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    let engine: EngineService | null = null;
    let settled = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: { lines: EngineLine[]; depth: number } | null = null;
    const flush = () => {
      flushTimer = undefined;
      if (!cancelled && pending) setResult({ key, ...pending });
    };
    const timer = setTimeout(async () => {
      try {
        setStatus((s) => (s === 'running' ? s : 'loading'));
        const e = await Promise.resolve().then(getEngine);
        if (cancelled) return;
        engine = e;
        setStatus('running');
        setError(null);
        await e.analyzeStream(fen, { multiPV, depth: ANALYSIS.maxDepth || undefined }, (r) => {
          pending = { lines: r.lines, depth: r.depth };
          flushTimer ??= setTimeout(flush, ANALYSIS.updateMs);
        });
        settled = true;
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (!cancelled) setStatus('done');
      } catch (err) {
        settled = true;
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    }, ANALYSIS.debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (flushTimer) clearTimeout(flushTimer);
      // Only our own search can be running on this page; a later one would also stop it by queueing.
      if (engine && !settled) engine.stop();
    };
  }, [run, fen, multiPV, key]);

  const mine = result?.key === key ? result : null;
  return {
    lines: run && mine ? mine.lines : [],
    depth: run && mine ? mine.depth : 0,
    status: run ? status : 'off',
    error,
    terminal,
  };
}
