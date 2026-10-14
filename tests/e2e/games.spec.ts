import { expect, test, type Page } from '@playwright/test';
import type { GameRecord } from '../../src/game/types';
import { play } from '../unit/helpers';

// My games: the device's games when signed out; the account's games (filters, stats, upload) when signed in.
// SCREENS=1 also writes screenshots to test-results/.
const nav = (page: Page) => page.getByRole('navigation');
const shots = !!process.env.SCREENS;

const bot = (elo: number) => ({ name: `Bot ${elo}`, isBot: true, elo });
const you = { name: 'You', isBot: false };

/** Four finished games on this device: a win, a loss, a draw (all vs bots) and a game between two people. */
function localGames(): GameRecord[] {
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5'];
  const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const base = (id: string, h: number) => ({ ...play(moves), id, createdAt: at(h), termination: 'resignation' });
  return [
    { ...base('local-win', 1), white: you, black: bot(800), result: '1-0', timeControl: '600+0' },
    { ...base('local-loss', 2), white: bot(1200), black: you, result: '1-0', timeControl: '180+2' },
    { ...base('local-draw', 30), white: you, black: bot(1000), result: '1/2-1/2', termination: 'agreement' },
    { ...base('local-friend', 50), white: you, black: { name: 'Ben', isBot: false }, result: '0-1' },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((games) => {
    localStorage.clear();
    localStorage.setItem('rookery.games', JSON.stringify(games));
  }, localGames());
  await page.reload();
});

test('signed out: the games on this device, with the record, filters, day groups and thumbnails', async ({ page }) => {
  await page.goto('/#/games');
  await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Log in', exact: true })).toBeVisible();

  const stats = page.getByTestId('games-stats');
  await expect(stats).toContainText('4 games');
  await expect(stats).toContainText('1 won');
  await expect(stats).toContainText('1 drawn');
  await expect(stats).toContainText('1 lost');

  const rows = page.getByTestId('game-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Won');
  await expect(rows.first()).toContainText('vs Bot 800');
  await expect(rows.first()).toContainText('by resignation · 4 moves');
  await expect(rows.first()).toContainText('Review →');
  await expect(rows.nth(1)).toContainText('Lost');
  await expect(rows.nth(1)).toContainText('Black');
  await expect(rows.first().getByTestId('mini-board')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Yesterday' }).or(page.getByRole('region', { name: 'Today' })).first()).toBeVisible();

  const show = page.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'Lost' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('vs Bot 1200');
  await show.getByRole('button', { name: 'Draws' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Draw');
  await show.getByRole('button', { name: 'All' }).click();
  await expect(rows).toHaveCount(4);

  if (shots) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: 'test-results/games-signed-out-phone.png', fullPage: true });
  }

  await rows.first().click();
  await expect(page).toHaveURL(/#\/review\/local-win$/);
});

test('signed in: upload the device games, then filter the account list (server-side), with stats', async ({ page }) => {
  // A fresh password account (the fake Google user is shared with phase5's sign-in test).
  const username = `games_${Date.now()}`;
  await nav(page).getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(nav(page).getByRole('link', { name: username })).toBeVisible();

  await nav(page).getByRole('link', { name: 'My games' }).click();
  const upload = page.getByTestId('upload-local');
  await expect(upload).toContainText('4 finished games are on this device but not in your account');
  await upload.getByRole('button', { name: 'Upload them' }).click();
  await expect(upload).toContainText('Uploaded 4 of 4 games.');

  const rows = page.getByTestId('game-row');
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('games-stats')).toContainText('4 games');
  await expect(rows.first()).toContainText('Casual');

  const show = page.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'Won' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('vs Bot 800');
  await show.getByRole('button', { name: 'Rated' }).click();
  await expect(page.getByText('No games match this filter.')).toBeVisible();
  // The record counts every game, whatever the filter.
  await expect(page.getByTestId('games-stats')).toContainText('4 games');
  await show.getByRole('button', { name: 'All' }).click();
  await expect(rows).toHaveCount(4);

  // Everything is uploaded now, so the upload offer is gone after a reload.
  await page.reload();
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('upload-local')).toHaveCount(0);

  if (shots) {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.screenshot({ path: 'test-results/games-signed-in-desktop.png', fullPage: true });
  }
});
