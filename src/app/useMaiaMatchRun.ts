import { useEffect, useRef, useState } from 'react';
import type { GameRecord } from '../game/types';
import { getMaia, type LoadProgress } from '../maia/MaiaService';
import { runMaiaMatch, type MaiaMatch, type MatchProgress } from '../rating/maiaMatch';

export type MaiaMatchRun = {
  /** 'loading' = downloading/starting the model, 'running' = comparing moves. */
  status: 'idle' | 'loading' | 'running' | 'error';
  load: LoadProgress;
  progress: MatchProgress;
  error: string | null;
  start(): void;
  /** Stops after the model call in flight; a cancel is not an error. */
  cancel(): void;
};

/** Runs Maia matching on `record`, with progress and cancel; `onDone` gets the result. Leaving the page cancels. */
export function useMaiaMatchRun(record: GameRecord, onDone: (match: MaiaMatch) => void): MaiaMatchRun {
  const [status, setStatus] = useState<MaiaMatchRun['status']>('idle');
  const [load, setLoad] = useState<LoadProgress>({ loaded: 0, total: 0 });
  const [progress, setProgress] = useState<MatchProgress>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => () => current.current?.abort(), []);

  async function start() {
    current.current?.abort();
    const ctrl = new AbortController();
    current.current = ctrl;
    const live = () => current.current === ctrl;
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const maia = getMaia();
      if (!maia.isLoaded()) {
        setStatus('loading');
        await maia.load((p) => live() && setLoad(p));
      }
      if (!live()) return;
      setStatus('running');
      const match = await runMaiaMatch(maia, record, {
        signal: ctrl.signal,
        onProgress: (p) => live() && setProgress(p),
      });
      if (!live()) return;
      current.current = null;
      setStatus('idle');
      done.current(match);
    } catch (err) {
      if (!live()) return;
      current.current = null;
      if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function cancel() {
    const ctrl = current.current;
    current.current = null;
    ctrl?.abort();
    setStatus('idle');
  }

  return { status, load, progress, error, start, cancel };
}
