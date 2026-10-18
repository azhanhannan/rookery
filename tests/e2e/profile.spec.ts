import { expect, test, type Page } from '@playwright/test';
import { CLOSING_LINE } from '../../src/insights/profile';
import type { GameRecord } from '../../src/game/types';
import type { PuzzleSet } from '../../src/puzzles/types';
import { hangingGames, profileGames } from '../fixtures/insightsGames';

// "Your recent games" on #/insights at phone width, one test per Review style. The seeded set: 22 games that
// leave a knight hanging against a Stockfish level (the Focus: pieces left hanging, opening) and 10 wins against
// Maia from a clearly winning position (a proven strength, counted against people and Maia bots only).

test.use({ viewport: { width: 390, height: 844 } });

async function seed(page: Page, games: GameRecord[], style: 'learner' | 'club' | 'analyst') {
  await page.goto('/');
  await page.evaluate(
    ([g, s]) => {
      localStorage.clear();
      localStorage.setItem('rookery.games', JSON.stringify(g));
      localStorage.setItem('rookery.reviewPrefs', JSON.stringify({ style: s }));
    },
    [games, style] as const,
  );
  await page.goto('/#/insights');
  await page.reload();
  // The page is a lazy chunk: on a cold dev server it can take a while to compile.
  await expect(page.getByTestId('insights-page')).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  const set: PuzzleSet = { source: 'e2e', builtAt: '2026-10-14', puzzles: [] };
  await page.route('**/puzzles/puzzles.json', (route) => route.fulfill({ json: set }));
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('below 20 reviewed games: only "n of 20", with the closing line', async ({ page }) => {
  await seed(page, hangingGames(12), 'club');
  const section = page.getByTestId('profile-section');
  await expect(section).toHaveAttribute('data-status', 'locked');
  await expect(section.getByTestId('profile-locked')).toHaveText('This opens at 20 reviewed games: 12 of 20 so far.');
  await expect(section.getByTestId('profile-line')).toHaveCount(0);
  await expect(section.getByTestId('profile-closing')).toHaveText(CLOSING_LINE);
});

test('Learner: one proven strength and the Focus sentence, no numbers, no Train button', async ({ page }) => {
  await seed(page, profileGames(), 'learner');
  const section = page.getByTestId('profile-section');
  await expect(section).toHaveAttribute('data-status', 'open');
  await expect(section.getByRole('heading', { name: 'Your recent games' })).toBeVisible();
  // Under the Focus.
  const focusBox = await page.getByTestId('focus-card').boundingBox();
  const sectionBox = await section.boundingBox();
  expect(sectionBox!.y).toBeGreaterThan(focusBox!.y);

  await expect(section.getByTestId('profile-strength')).toContainText('You finish the games you get winning.');
  await expect(section.getByTestId('profile-focus-sentence')).toContainText(
    'Your Focus: Most often, early in the game, you leave a piece where it can be taken for free.',
  );
  // The openings are not clearly fine here, so no reassurance; and no habit lines or tables on Learner.
  await expect(section.getByTestId('profile-reassurance')).toHaveCount(0);
  await expect(section.getByTestId('profile-line')).toHaveCount(0);
  await expect(section.getByTestId('profile-table')).toHaveCount(0);
  await expect(section.getByRole('link')).toHaveCount(0);
  expect(await section.innerText()).not.toMatch(/\d/);
  await expect(section.getByTestId('profile-closing')).toHaveText(CLOSING_LINE);

  await section.getByRole('button', { name: 'See it above ↑' }).click();
  await expect(page.getByTestId('focus-card')).toBeInViewport();
  await noHorizontalScroll(page);
});

test('Club: clear lines with their n, leaning greyed, the Focus line says so, no Train button', async ({ page }) => {
  await seed(page, profileGames(), 'club');
  const section = page.getByTestId('profile-section');
  await expect(section.getByTestId('profile-window')).toContainText('From your 32 reviewed games');
  await expect(section.getByTestId('profile-window')).toContainText('22 vs Stockfish levels, 10 vs Maia bots');
  await expect(section.getByTestId('profile-window')).toContainText('Mostly from games against bots (32 of 32).');

  const conv = section.locator('[data-testid="profile-line"][data-line="conversion"]');
  await expect(conv).toHaveAttribute('data-state', 'clear');
  await expect(conv).toContainText('Against people and Maia bots you converted 10 of 10 clearly winning positions');
  const openings = section.locator('[data-testid="profile-line"][data-line="openings"]');
  await expect(openings).toHaveAttribute('data-state', 'leaning');
  await expect(openings).toHaveClass(/text-muted/);
  await expect(openings.getByTestId('profile-is-focus')).toHaveText('This is your Focus ↑');
  await expect(section.getByTestId('profile-is-focus')).toHaveCount(1);
  await expect(section.getByTestId('profile-style-note')).toContainText('need 40 games at one speed against people and Maia bots');
  await expect(section.getByRole('link')).toHaveCount(0);
  await expect(section.getByTestId('profile-closing')).toHaveText(CLOSING_LINE);
  await noHorizontalScroll(page);
});

test('Analyst: every line with estimate, 90% interval, state, group and evidence; what still waits', async ({ page }) => {
  await seed(page, profileGames(), 'analyst');
  const section = page.getByTestId('profile-section');
  const conv = section.locator('[data-testid="profile-line"][data-line="conversion"]');
  await expect(conv).toContainText('clear');
  await expect(conv.getByTestId('profile-numbers')).toContainText('100% (90%:');
  await expect(conv.getByTestId('profile-numbers')).toContainText('people and Maia bots');
  await expect(conv.getByTestId('profile-numbers')).toContainText('10 clearly winning positions vs people and Maia bots, 10 games');
  const openings = section.locator('[data-testid="profile-line"][data-line="openings"]');
  await expect(openings).toContainText('leaning');
  await expect(openings.getByTestId('profile-numbers')).toContainText('per 100 moves');
  await expect(openings.getByTestId('profile-numbers')).toContainText('all opponents');

  const waiting = section.getByTestId('profile-waiting');
  await expect(waiting).toContainText('Using the clock: 0 of 15 games with a clock.');
  await expect(waiting).toContainText('Saving worse games: 0 of 8 clearly losing positions vs people and Maia bots.');
  await expect(waiting).toContainText('22 clearly losing positions against Stockfish levels left out');
  // Slice 2: rushed critical moves need clocked games reviewed with two engine lines.
  await expect(waiting).toContainText('Taking time when one move holds: 0 of 15 clocked games reviewed with two engine lines.');
  // No Train button anywhere in the section: its only links are evidence positions.
  await expect(section.getByTestId('train-this')).toHaveCount(0);
  await expect(section.getByText(/Train this/)).toHaveCount(0);
  await expect(section.getByTestId('profile-closing')).toHaveText(CLOSING_LINE);
  await noHorizontalScroll(page);

  const link = conv.getByTestId('profile-evidence').getByRole('link').first();
  await expect(link).toContainText('vs Maia 1100');
  await link.click();
  await expect(page).toHaveURL(/#\/review\/maia-\d+\?ply=13$/);
});
