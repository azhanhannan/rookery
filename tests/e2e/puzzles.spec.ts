import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Puzzle, PuzzleSet } from '../../src/puzzles/types';

// The puzzle data request is intercepted so the puzzle on the board is known in advance.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const pieceOn = (page: Page, sq: string, piece: string) => square(page, sq).locator(`[data-piece="${piece}"]`);
const nav = (page: Page) => page.getByRole('navigation');

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

/** Black blunders 3...Nf6?? into 4.Qxf7# (the only mate; chess.js-checked). White solves. */
const SCHOLARS: Puzzle = {
  id: 'e2eMate1',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  moves: ['g8f6', 'h5f7'],
  rating: 1200,
  themes: ['mateIn1', 'oneMove', 'opening'],
};

function serve(page: Page, puzzles: Puzzle[]) {
  const set: PuzzleSet = { source: 'e2e', builtAt: '2026-10-14', puzzles };
  return page.route('**/puzzles/puzzles.json', (route) => route.fulfill({ json: set }));
}

/** The number after the arrow in "1500 → 1512? (+12)". */
async function ratingAfter(page: Page): Promise<string> {
  const text = (await page.getByTestId('puzzle-rating-change').textContent()) ?? '';
  const m = /→ (\d+)/.exec(text);
  expect(m, text).not.toBeNull();
  return m![1];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('signed out: solve a mate in 1, the rating rises and survives a reload', async ({ page }) => {
  await serve(page, [SCHOLARS]);
  await page.goto('/#/puzzles');
  await expect(page.getByText('Puzzles from the Lichess puzzle database (CC0)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
  // The opponent's set-up move is on the board.
  await expect(pieceOn(page, 'f6', 'bN')).toBeVisible();
  await expect(page.getByTestId('puzzle-rating')).toHaveText('1500?');

  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  await expect(pieceOn(page, 'f7', 'wQ')).toBeVisible();
  const change = page.getByTestId('puzzle-rating-change');
  await expect(change).toContainText('→');
  await expect(change).toContainText('+');
  const after = await ratingAfter(page);
  expect(Number(after)).toBeGreaterThan(1500);
  await expect(page.getByTestId('puzzle-rating')).toContainText(after);
  await expect(page.getByRole('link', { name: 'View on Lichess' })).toHaveAttribute('href', 'https://lichess.org/training/e2eMate1');

  await page.reload();
  await expect(page.getByTestId('puzzle-rating')).toContainText(after);
  // The only puzzle comes back as a repeat: solving it again changes nothing.
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('puzzle-rating-change')).toHaveText('Already tried: rating unchanged');
  await expect(page.getByTestId('puzzle-rating')).toContainText(after);
});

test('wrong move fails, Show solution plays it out, the rating drops, Retry is unrated', async ({ page }) => {
  await serve(page, [SCHOLARS]);
  await page.goto('/#/puzzles');
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();

  await clickMove(page, 'h5h4');
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Not the move');
  // It snaps back.
  await expect(pieceOn(page, 'h5', 'wQ')).toBeVisible();
  const change = page.getByTestId('puzzle-rating-change');
  await expect(change).toContainText('−');
  const after = await ratingAfter(page);
  expect(Number(after)).toBeLessThan(1500);

  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(pieceOn(page, 'f7', 'wQ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Puzzle over' })).toBeVisible();
  await expect(change).toContainText('−');

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
  await expect(page.getByText('Retry: this attempt is not rated')).toBeVisible();
  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  await expect(page.getByTestId('puzzle-rating-change')).toBeHidden();
  await expect(page.getByTestId('puzzle-rating')).toContainText(after);
});

test('hint highlights the piece and makes the solve count as a miss', async ({ page }) => {
  await serve(page, [SCHOLARS]);
  await page.goto('/#/puzzles');
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect.poll(() => square(page, 'h5').evaluate((el) => el.outerHTML)).toContain('66, 135, 245');
  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  await expect(page.getByTestId('puzzle-rating-change')).toContainText('−');
});

test('theme filter offers pretty names', async ({ page }) => {
  await serve(page, [SCHOLARS]);
  await page.goto('/#/puzzles');
  const select = page.getByLabel('Theme');
  await expect(select.getByRole('option', { name: 'Mate in 1' })).toHaveCount(1);
  await select.selectOption({ label: 'Mate in 1' });
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
});

function realPuzzle(match: (p: Puzzle) => boolean): Puzzle | null {
  const file = 'public/puzzles/puzzles.json';
  if (!existsSync(file)) return null;
  const set = JSON.parse(readFileSync(file, 'utf8')) as PuzzleSet;
  return set.puzzles.find(match) ?? null;
}
const noPromotion = (p: Puzzle) => p.moves.every((m) => m.length === 4);

test('phone width: a two-move puzzle plays the reply in between, with no sideways scroll', async ({ page }) => {
  const puzzle = realPuzzle((p) => p.moves.length === 4 && noPromotion(p));
  test.skip(!puzzle, 'public/puzzles/puzzles.json has no two-move puzzle yet');
  await page.setViewportSize({ width: 375, height: 800 });
  await serve(page, [puzzle!]);
  await page.goto('/#/puzzles');
  const solver = puzzle!.fen.split(' ')[1] === 'w' ? 'Black' : 'White';
  await expect(page.getByRole('heading', { name: `Your turn: find the best move for ${solver}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await clickMove(page, puzzle!.moves[1]);
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Best move!');
  // The opponent's reply lands on its square.
  await expect(square(page, puzzle!.moves[2].slice(2, 4)).locator('[data-piece]')).toBeVisible();
  await expect(square(page, puzzle!.moves[2].slice(0, 2)).locator('[data-piece]')).toHaveCount(0);
  await clickMove(page, puzzle!.moves[3]);
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  await expect(page.getByTestId('puzzle-rating-change')).toContainText('+');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// The server rates puzzles from its own copy of puzzles.json, so this one uses a real puzzle from it.
function realMateInOne(): Puzzle | null {
  return realPuzzle((p) => p.moves.length === 2 && noPromotion(p) && p.themes.includes('mateIn1'));
}

test('signed in: the attempt goes to the account and the profile shows a Puzzles card', async ({ page }) => {
  const puzzle = realMateInOne();
  test.skip(!puzzle, 'public/puzzles/puzzles.json has no mate in 1 yet');
  const username = `e2e_pz_${Date.now()}`;

  await nav(page).getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(nav(page).getByRole('link', { name: username })).toBeVisible();

  await serve(page, [puzzle!]);
  const attempt = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/api/puzzles/${puzzle!.id}/attempt`));
  await nav(page).getByRole('link', { name: 'Puzzles' }).click();
  const solver = puzzle!.fen.split(' ')[1] === 'w' ? 'Black' : 'White';
  await expect(page.getByRole('heading', { name: `Your turn: find the best move for ${solver}` })).toBeVisible();
  await clickMove(page, puzzle!.moves[1]);
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  expect((await attempt).postDataJSON()).toEqual({ solved: true });
  await expect(page.getByTestId('puzzle-rating-change')).toContainText('→');
  const after = await ratingAfter(page);

  await nav(page).getByRole('link', { name: username }).click();
  await expect(page.getByRole('heading', { name: username })).toBeVisible({ timeout: 15_000 });
  const card = page.getByTestId('puzzle-card');
  await expect(card).toContainText('Puzzles');
  await expect(card).toContainText(after);
  await expect(card).toContainText('100% solved');
});
