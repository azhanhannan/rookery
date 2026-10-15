// Board colour themes. Every board (play, review, puzzles, thumbnails) paints its squares from the CSS variables
// --board-light / --board-dark, so a theme only overrides those two on <html>. Saved per device.

export type BoardTheme = {
  id: string;
  name: string;
  /** null = the stylesheet's own colours (which also follow dark mode). */
  colors: { light: string; dark: string } | null;
};

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'rookery', name: 'Rookery', colors: null },
  { id: 'green', name: 'Green', colors: { light: '#ebecd0', dark: '#739552' } },
  { id: 'wood', name: 'Wood', colors: { light: '#f0d9b5', dark: '#b58863' } },
  { id: 'blue', name: 'Blue', colors: { light: '#dee3e6', dark: '#8ca2ad' } },
  { id: 'purple', name: 'Purple', colors: { light: '#e8e0f0', dark: '#8f74ac' } },
  { id: 'coral', name: 'Coral', colors: { light: '#f4e4d7', dark: '#d1876f' } },
  { id: 'slate', name: 'Slate', colors: { light: '#d9dde1', dark: '#6f7a85' } },
];

export const DEFAULT_BOARD_THEME = 'rookery';
const KEY = 'rookery.boardTheme';

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

/** Paints every board with `id`'s colours (the default theme removes the override). */
export function applyBoardTheme(id: string, root: HTMLElement = document.documentElement): void {
  const { colors } = findBoardTheme(id);
  if (colors) {
    root.style.setProperty('--board-light', colors.light);
    root.style.setProperty('--board-dark', colors.dark);
  } else {
    root.style.removeProperty('--board-light');
    root.style.removeProperty('--board-dark');
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
