// Board themes. Every board (play, review, puzzles, thumbnails) paints its squares from CSS variables on <html>:
// --board-light / --board-dark (flat colours; also used for coordinates, swatches and thumbnails), and for textured
// themes --board-image plus transparent --board-square-light/-dark so the picture shows through. Saved per device.
import { useSyncExternalStore } from 'react';

export type BoardTheme = {
  id: string;
  name: string;
  /** null = the stylesheet's own colours (which also follow dark mode). */
  colors: { light: string; dark: string } | null;
  /** A whole-board picture (public/boards/, AGPLv3+ from Lichess); `colors` are its average square colours. */
  image?: string;
  kind: 'colour' | 'texture';
};

const flat = (id: string, name: string, light: string, dark: string): BoardTheme => ({
  id,
  name,
  colors: { light, dark },
  kind: 'colour',
});
const texture = (id: string, name: string, file: string, light: string, dark: string): BoardTheme => ({
  id,
  name,
  colors: { light, dark },
  image: `/boards/${file}`,
  kind: 'texture',
});

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'rookery', name: 'Rookery', colors: null, kind: 'colour' },
  flat('green', 'Green', '#ebecd0', '#739552'),
  // id kept as 'wood' so a saved choice survives; the textured woods are below.
  flat('wood', 'Brown', '#f0d9b5', '#b58863'),
  flat('blue', 'Blue', '#dee3e6', '#8ca2ad'),
  flat('purple', 'Purple', '#e8e0f0', '#8f74ac'),
  flat('coral', 'Coral', '#f4e4d7', '#d1876f'),
  flat('slate', 'Slate', '#d9dde1', '#6f7a85'),
  flat('sand', 'Sand', '#f5e7c9', '#c9a36b'),
  flat('ocean', 'Ocean', '#d7e8f3', '#4f86b0'),
  flat('rose', 'Rose', '#f7e3e8', '#c47d90'),
  flat('mint', 'Mint', '#e4f3eb', '#6fae8f'),
  flat('night', 'Night', '#a9b2c0', '#4a5568'),
  flat('paper', 'Paper', '#f4f4f2', '#bdbdb8'),
  texture('oak', 'Oak', 'wood.jpg', '#d8a15a', '#9b5824'),
  texture('teak', 'Teak', 'wood2.jpg', '#977c4e', '#775d2f'),
  texture('birch', 'Birch', 'wood3.jpg', '#bbaf9f', '#835f38'),
  texture('cherry', 'Cherry', 'wood4.jpg', '#bd9a64', '#865a36'),
  texture('maple', 'Maple', 'maple.jpg', '#e0be92', '#b56f3b'),
  texture('burl', 'Burl', 'maple2.jpg', '#ddc096', '#ab775a'),
  texture('marble', 'Jade', 'marble.jpg', '#7e9580', '#627961'),
  texture('blue-marble', 'Marble', 'blue-marble.jpg', '#e6e0d4', '#95a0af'),
  texture('leather', 'Leather', 'leather.jpg', '#cecec6', '#c18d12'),
  texture('metal', 'Metal', 'metal.jpg', '#b0b0b0', '#7b7b7b'),
  texture('olive', 'Olive', 'olive.jpg', '#aea795', '#847c6a'),
  texture('canvas', 'Canvas', 'canvas2.jpg', '#cbcee0', '#73839d'),
  texture('plastic', 'Plastic', 'green-plastic.png', '#f1f6b2', '#59935d'),
];

export const DEFAULT_BOARD_THEME = 'rookery';
const KEY = 'rookery.boardTheme';
const VARS = ['--board-light', '--board-dark', '--board-image', '--board-square-light', '--board-square-dark'];

export function findBoardTheme(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function loadBoardTheme(): string {
  try {
    return findBoardTheme(localStorage.getItem(KEY)).id;
  } catch {
    return DEFAULT_BOARD_THEME;
  }
}

// Whoever shows the current choice (the picker) hears about changes, including a theme pulled by account sync.
const listeners = new Set<() => void>();

/** The saved theme id, kept current when it changes (a pick, or a sync that applied a pulled one). */
export function useBoardTheme(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    loadBoardTheme,
    () => DEFAULT_BOARD_THEME,
  );
}

/** Paints every board with `id` (the default theme removes every override). */
export function applyBoardTheme(id: string, root: HTMLElement = document.documentElement): void {
  const { colors, image } = findBoardTheme(id);
  queueMicrotask(() => listeners.forEach((l) => l()));
  for (const v of VARS) root.style.removeProperty(v);
  if (colors) {
    root.style.setProperty('--board-light', colors.light);
    root.style.setProperty('--board-dark', colors.dark);
  }
  if (image) {
    root.style.setProperty('--board-image', `url("${image}")`);
    root.style.setProperty('--board-square-light', 'transparent');
    root.style.setProperty('--board-square-dark', 'transparent');
  }
}

export function saveBoardTheme(id: string): void {
  const theme = findBoardTheme(id).id;
  applyBoardTheme(theme);
  try {
    if (theme === DEFAULT_BOARD_THEME) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the theme still applies until the page is reloaded.
  }
}
