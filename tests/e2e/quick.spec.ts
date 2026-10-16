import { expect, test, type Page } from '@playwright/test';
import type { Puzzle, PuzzleSet } from '../../src/puzzles/types';

// Wave 2 "quick" batch: Spar button, premove setting, timed puzzles, move number in the editor, [%csl] squares.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

const SCHOLARS: Puzzle = {
  id: 'e2eMate1',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  moves: ['g8f6', 'h5f7'],
  rating: 600,
  themes: ['mateIn1', 'oneMove', 'opening'],
};

test('Play offers a one-click spar one level above an unknown (1200) rating', async ({ page }) => {
  await page.goto('/#/play');
  await expect(page.getByTestId('spar-button')).toHaveText('Spar vs Maia 1400 · 10+5');
});

test('Settings → Play has the Premoves toggle, off by default', async ({ page }) => {
  await page.goto('/#/account');
  const toggle = page.getByTestId('play-settings').getByRole('checkbox', { name: /Premoves/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});

test('timed puzzles: start, solve one, the score counts it', async ({ page }) => {
  const set: PuzzleSet = { source: 'e2e', builtAt: '2026-10-16', puzzles: [SCHOLARS] };
  await page.route('**/puzzles/puzzles.json', (route) => route.fulfill({ json: set }));
  await page.goto('/#/puzzles');
  await page.getByTestId('puzzle-mode-timed').click();
  await expect(page.getByTestId('timed-clock')).toHaveText('3:00');
  await page.getByTestId('timed-start').click();
  // The set-up move (…Nf6) arrives after a short delay, then White mates.
  await expect(square(page, 'f6').locator('[data-piece="bN"]')).toBeVisible();
  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('timed-score')).toHaveText('1');
});

test('the position editor keeps and sets the move number', async ({ page }) => {
  await page.goto('/#/analysis');
  await page.getByRole('button', { name: 'Edit position' }).click();
  const move = page.getByTestId('editor-move-number');
  await expect(move).toHaveValue('1');
  await move.fill('23');
  await expect(page.getByTestId('editor-fen')).toHaveText(/ 0 23$/);
  await page.getByRole('button', { name: 'Analyse this position' }).click();
  await expect(page.getByTestId('current-fen')).toHaveText(/ 0 23$/);
});

test('[%csl] squares from a PGN comment are drawn on the Analysis board', async ({ page }) => {
  await page.goto('/#/analysis');
  await page.getByLabel('PGN').fill('1. e4 { [%csl Gd4] } e5 *');
  await page.getByRole('button', { name: 'Import PGN' }).click();
  await page.getByRole('button', { name: 'Next move' }).click();
  const styled = page.locator('[data-square="d4"][style*="radial-gradient"], [data-square="d4"] [style*="radial-gradient"]');
  await expect(styled.first()).toBeAttached();
});
