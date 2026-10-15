import { beforeEach, describe, expect, it } from 'vitest';
import { applyBoardTheme, BOARD_THEMES, findBoardTheme, loadBoardTheme, saveBoardTheme } from '../../src/settings/boardTheme';

const root = document.documentElement;
const vars = () => [root.style.getPropertyValue('--board-light'), root.style.getPropertyValue('--board-dark')];

beforeEach(() => {
  localStorage.clear();
  applyBoardTheme('rookery');
});

describe('board themes', () => {
  it('have unique ids, and only the default leaves the stylesheet colours', () => {
    expect(new Set(BOARD_THEMES.map((t) => t.id)).size).toBe(BOARD_THEMES.length);
    expect(BOARD_THEMES.filter((t) => !t.colors).map((t) => t.id)).toEqual(['rookery']);
  });

  it('unknown or missing ids fall back to the default', () => {
    expect(findBoardTheme('nope').id).toBe('rookery');
    expect(findBoardTheme(null).id).toBe('rookery');
    expect(loadBoardTheme()).toBe('rookery');
    localStorage.setItem('rookery.boardTheme', 'gone-theme');
    expect(loadBoardTheme()).toBe('rookery');
  });

  it('saving applies the colours to <html> and remembers them; the default removes both', () => {
    saveBoardTheme('wood');
    expect(vars()).toEqual(['#f0d9b5', '#b58863']);
    expect(loadBoardTheme()).toBe('wood');
    saveBoardTheme('rookery');
    expect(vars()).toEqual(['', '']);
    expect(localStorage.getItem('rookery.boardTheme')).toBeNull();
  });
});
