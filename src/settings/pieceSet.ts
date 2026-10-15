// Piece styles. "Classic" is react-chessboard's built-in set; the others are SVG files in public/pieces/<id>/
// (licences: public/pieces/LICENSE-NOTE.md). Saved per device, like the board theme.
import { useSyncExternalStore } from 'react';

export type PieceSet = { id: string; name: string; /** null = the board library's built-in pieces. */ dir: string | null };

export const PIECE_SETS: PieceSet[] = [
  { id: 'classic', name: 'Classic', dir: null },
  { id: 'merida', name: 'Merida', dir: '/pieces/merida' },
  { id: 'chessnut', name: 'Chessnut', dir: '/pieces/chessnut' },
  { id: 'fantasy', name: 'Fantasy', dir: '/pieces/fantasy' },
  { id: 'celtic', name: 'Celtic', dir: '/pieces/celtic' },
  { id: 'spatial', name: 'Spatial', dir: '/pieces/spatial' },
  { id: 'papercut', name: 'Papercut', dir: '/pieces/papercut' },
  { id: 'shapes', name: 'Shapes', dir: '/pieces/shapes' },
];

export const DEFAULT_PIECE_SET = 'classic';
/** react-chessboard's piece keys: colour + piece letter. */
export const PIECE_KEYS = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
const KEY = 'rookery.pieceSet';

export function findPieceSet(id: string | null | undefined): PieceSet {
  return PIECE_SETS.find((s) => s.id === id) ?? PIECE_SETS[0];
}

export function pieceUrl(set: PieceSet, key: string): string | null {
  return set.dir ? `${set.dir}/${key}.svg` : null;
}

function read(): string {
  try {
    return findPieceSet(localStorage.getItem(KEY)).id;
  } catch {
    return DEFAULT_PIECE_SET;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function loadPieceSet(): string {
  return current;
}

/** Fetches a set's images ahead of use, so boards don't flash empty squares when it is picked. */
export function preloadPieceSet(id: string): void {
  const set = findPieceSet(id);
  if (!set.dir || typeof Image === 'undefined') return;
  for (const key of PIECE_KEYS) new Image().src = pieceUrl(set, key)!;
}

export function savePieceSet(id: string): void {
  current = findPieceSet(id).id;
  try {
    if (current === DEFAULT_PIECE_SET) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, current);
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chosen piece set; components re-render when it changes. */
export function usePieceSet(): PieceSet {
  return findPieceSet(useSyncExternalStore(subscribe, loadPieceSet, loadPieceSet));
}
