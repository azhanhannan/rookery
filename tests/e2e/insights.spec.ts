import { expect, test, type Page } from '@playwright/test';
import type { GameRecord } from '../../src/game/types';
import type { PuzzleSet } from '../../src/puzzles/types';
import { hangingGames } from '../fixtures/insightsGames';

// Insights (#/insights): reviewed games are seeded in localStorage. Each one leaves a knight hanging on h4 at
// ply 5 (3.Nh4?? Qxh4), so with 20+ of them "Pieces left hanging · opening" is the Focus.

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
}

/** Opens a page fresh (a hash change alone keeps the app's in-memory copy of the review prefs). */
async function open(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  // My mistakes doesn't need the puzzle database, but the page loads it first.
  const set: PuzzleSet = { source: 'e2e', builtAt: '2026-10-14', puzzles: [] };
  await page.route('**/puzzles/puzzles.json', (route) => route.fulfill({ json: set }));
});

test('below 10 reviewed games: the gate, with Review all', async ({ page }) => {
  await seed(page, hangingGames(4), 'club');
  await open(page, '#/insights');
  const gate = page.getByTestId('insights-gate');
  await expect(gate).toContainText('Review 6 more games');
  await expect(gate.getByTestId('gate-review-all')).toHaveAttribute('href', '#/import');
  await expect(page.getByTestId('insights-coverage')).toContainText('4 of 4 saved games');
  await expect(page.getByTestId('focus-card')).toHaveCount(0);
});

test('the nav links to Insights', async ({ page }) => {
  await seed(page, [], 'club');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/#/play');
  await page.getByRole('link', { name: 'Insights' }).first().click();
  await expect(page).toHaveURL(/#\/insights$/);
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
});

test('Learner: one plain Focus card with its n; start it; Train this lands on My mistakes for the motif', async ({ page }) => {
  await seed(page, hangingGames(22), 'learner');
  await open(page, '#/insights');
  const card = page.getByTestId('focus-card');
  await expect(card).toHaveAttribute('data-state', 'proposed');
  await expect(card.getByTestId('focus-says')).toContainText('leave a piece where it can be taken');
  await expect(card.getByTestId('focus-n')).toHaveText('From your 22 reviewed games');
  // Learner: the Focus only, no numbers tables.
  await expect(page.getByTestId('ledger')).toHaveCount(0);
  await expect(page.getByTestId('watch-card')).toHaveCount(0);
  await expect(page.getByTestId('insights-filters')).toHaveCount(0);

  await card.getByTestId('focus-start').click();
  await expect(card).toHaveAttribute('data-state', 'too-early');
  await expect(card.getByTestId('focus-status')).toContainText('Too early to tell');
  await expect(card.getByTestId('focus-process')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rookery.focus') ?? 'null'));
  expect(stored).toMatchObject({ bucketId: 'O:hanging', unit: 'per100moves', minGames: 15 });
  // Pinned: still there after a reload.
  await page.reload();
  await expect(page.getByTestId('focus-card')).toHaveAttribute('data-state', 'too-early');

  await page.getByTestId('train-this').click();
  await expect(page).toHaveURL(/#\/puzzles\/mistakes\/hanging$/);
  await expect(page.getByTestId('mistakes-motif')).toContainText('pieces left hanging');
  await expect(page.getByTestId('mistakes-motif')).toContainText('1 puzzle');
  await expect(page.getByTestId('puzzle-source')).toContainText('From your game vs Bot 1100');
});

test('Analyst: Focus with n and intervals, top cards, ledger, after-loss off by default; evidence opens the review at the move', async ({ page }) => {
  await seed(page, hangingGames(22), 'analyst');
  await open(page, '#/insights');
  const card = page.getByTestId('focus-card');
  await expect(card).toContainText('Focus: Pieces left hanging · opening');
  await expect(card.getByTestId('bucket-numbers')).toContainText('22 times in');
  await expect(card.getByTestId('bucket-numbers')).toContainText('per 100 moves');
  await expect(page.getByTestId('ledger')).toBeVisible();
  await expect(page.getByTestId('ledger-row').first()).toContainText('Pieces left hanging');
  await expect(page.getByTestId('phase-rates')).toBeVisible();
  await expect(page.getByTestId('insights-filters')).toBeVisible();
  await expect(page.getByTestId('after-loss-toggle')).not.toBeChecked();
  await expect(page.getByTestId('after-loss')).toHaveCount(0);
  await page.getByTestId('after-loss-toggle').check();
  await expect(page.getByTestId('after-loss')).toBeVisible();

  // Filters: no human games, so "People" locks the page with its own message.
  await page.getByTestId('filter-opponent').selectOption('human');
  await expect(page.getByTestId('insights-gate')).toContainText('match these filters');
  await page.getByTestId('filter-opponent').selectOption('all');

  await card.getByTestId('focus-start').click();
  await expect(card.getByTestId('focus-status')).toContainText('Before:');

  await card.getByTestId('evidence-link').first().click();
  await expect(page).toHaveURL(/#\/review\/hang-\d+\?ply=5$/);
  await expect(page.getByTestId('move-panel')).toContainText('3. Nh4');
});

test('deep links: a lesson and an endgame drill open directly', async ({ page }) => {
  await seed(page, [], 'club');
  await page.goto('/#/lessons/forks');
  await expect(page.getByRole('heading', { name: 'Forks' })).toBeVisible();
  await page.goto('/#/endgames/kqk');
  await expect(page.getByTestId('drill-goal')).toContainText('Checkmate as White');
  await page.goto('/#/lessons/no-such-lesson');
  await expect(page.getByTestId('lessons-list')).toBeVisible();
});
