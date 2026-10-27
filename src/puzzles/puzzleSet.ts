// Fetching the puzzle set, kept out of puzzleStore so App can start the download alongside the Puzzles page's
// own code instead of after it (one round trip less on a slow phone).
import type { PuzzleSet } from './types';

let setPromise: Promise<PuzzleSet> | null = null;

/** public/puzzles/puzzles.json, fetched once per page load (a failed fetch can be retried). */
export function loadPuzzleSet(): Promise<PuzzleSet> {
  if (!setPromise) {
    const p = fetch('/puzzles/puzzles.json').then(async (res) => {
      if (!res.ok) throw new Error(`Couldn't load the puzzles (${res.status}).`);
      return (await res.json()) as PuzzleSet;
    });
    setPromise = p;
    p.catch(() => {
      if (setPromise === p) setPromise = null;
    });
  }
  return setPromise;
}

/** Starts the download early; the page reports any failure when it asks for the set itself. */
export function prefetchPuzzleSet(): void {
  loadPuzzleSet().catch(() => {});
}
