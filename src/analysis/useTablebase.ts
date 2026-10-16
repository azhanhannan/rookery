import { useEffect, useState } from 'react';
import { probeTablebase, tablebaseCovers, type TablebaseResult } from '../engine/tablebase';

export type TablebaseLookup = {
  /** Whether the position is small enough for the tablebase at all. */
  covered: boolean;
  status: 'off' | 'loading' | 'done' | 'unavailable';
  result: TablebaseResult | null;
};

/** Tablebase answer for `fen` (≤7 pieces) while `enabled`; 'unavailable' when offline or the lookup fails. */
export function useTablebase(fen: string | null, enabled = true): TablebaseLookup {
  const covered = fen !== null && tablebaseCovers(fen);
  const run = enabled && covered;
  const [state, setState] = useState<{ fen: string; result: TablebaseResult | null; done: boolean } | null>(null);

  useEffect(() => {
    if (!run || fen === null) return;
    const ctrl = new AbortController();
    void probeTablebase(fen, { signal: ctrl.signal }).then((result) => {
      if (!ctrl.signal.aborted) setState({ fen, result, done: true });
    });
    return () => ctrl.abort();
  }, [run, fen]);

  if (!run) return { covered, status: 'off', result: null };
  const mine = state?.fen === fen ? state : null;
  if (!mine) return { covered, status: 'loading', result: null };
  return { covered, status: mine.result ? 'done' : 'unavailable', result: mine.result };
}
