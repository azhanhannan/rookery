// Board keyboard shortcuts: X flips the board; the list the "?" sheet shows (KeyboardShortcuts.tsx).
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

/** Keys typed into a field, or with Ctrl/Cmd/Alt held, are never board shortcuts. */
function ignoreKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return e.ctrlKey || e.metaKey || e.altKey || !!t?.closest?.('input, textarea, select, [contenteditable]');
}

/** "X" flips the board (Play, Review, Puzzles). */
export function useFlipKey(onFlip: () => void): void {
  const latest = useRef(onFlip);
  useEffect(() => {
    latest.current = onFlip;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'x' && e.key !== 'X') || ignoreKey(e)) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** A flip for a page that keeps its orientation in React state. */
export function flipOrientation(set: Dispatch<SetStateAction<'white' | 'black'>>): () => void {
  return () => set((o) => (o === 'white' ? 'black' : 'white'));
}

export type ShortcutPage = 'play' | 'review' | 'puzzles';

const MOVES: [string, string][] = [
  ['← →', 'Previous / next move'],
  ['Home End', 'First / last move'],
];
const COMMON: [string, string][] = [
  ['X', 'Flip board'],
  ['F', 'Full screen on / off'],
  ['Right-drag', 'Draw an arrow'],
  ['Right-click', 'Circle a square'],
  ['Shift · Alt · Ctrl', 'Red · blue · yellow marks'],
  ['?', 'This list'],
];

export function shortcutsFor(page: ShortcutPage): [string, string][] {
  if (page === 'puzzles') return COMMON;
  if (page === 'review') return [...MOVES, ['Esc', 'Leave the best line'], ['← → Esc', 'Coach walkthrough: back / next / close'], ...COMMON];
  return [...MOVES, ...COMMON];
}

