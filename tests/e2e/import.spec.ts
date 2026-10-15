import { expect, test } from '@playwright/test';

// Bulk import (multi-game PGN, Lichess) and the Openings report on My games. Lichess is never contacted:
// its export endpoint is answered by page.route.

const game = (white: string, black: string, date: string, moves: string, result: string, time = '12:00:00') =>
  `[Event "Rated Blitz game"]\n[Site "https://lichess.org/x"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n` +
  `[Result "${result}"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n[Variant "Standard"]\n[TimeControl "180+2"]\n\n` +
  `${moves} ${result}\n`;

const SICILIAN_WIN = '1. e4 { [%clk 0:03:00] } 1... c5 { [%clk 0:03:00] } 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#';
const FOOLS = '1. f3 e5 2. g4 Qh4#';

const MULTI = [
  game('Ana', 'Ben', '2026.10.01', SICILIAN_WIN, '1-0'),
  game('Cy', 'Ana', '2026.10.02', FOOLS, '0-1'),
  game('Ana', 'Dee', '2026.10.03', '1. e4 e5', '*'),
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('a single pasted game still goes to the board', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByLabel('PGN', { exact: true }).fill(game('Ana', 'Ben', '2026.10.01', FOOLS, '0-1'));
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page).toHaveURL(/#\/play$/);
});

test('a multi-game paste imports finished games, skips duplicates and reports failures', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByLabel('PGN', { exact: true }).fill(MULTI);
  await expect(page.getByTestId('pgn-count')).toHaveText('3 games');
  await page.getByRole('button', { name: 'Import 3 games' }).click();
  const summary = page.getByTestId('import-summary');
  await expect(summary).toContainText('2 imported');
  await expect(summary).toContainText('0 duplicates skipped');
  await expect(summary).toContainText('1 failed');
  await expect(summary).toContainText('Played as "Ana"');

  await page.getByRole('button', { name: 'Import 3 games' }).click();
  await expect(summary).toContainText('0 imported');
  await expect(summary).toContainText('2 duplicates skipped');

  await page.goto('/#/games');
  await expect(page.getByTestId('game-row')).toHaveCount(2);
  await expect(page.getByTestId('game-row').first()).toContainText('Won');

  await page.getByRole('tab', { name: 'Openings' }).click();
  const report = page.getByTestId('openings-report');
  await expect(report.getByRole('region', { name: 'As White' })).toContainText('Sicilian Defense');
  await expect(report.getByRole('region', { name: 'As Black' })).toBeVisible();
  await report.getByRole('region', { name: 'As White' }).getByRole('button', { name: 'Show games' }).click();
  await expect(page.getByTestId('opening-filter')).toContainText('Sicilian Defense');
  await expect(page.getByTestId('game-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear opening filter' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(2);
});

test('From Lichess: fetches with the PGN header, finds the player side, and Lichess errors are readable', async ({ page }) => {
  let asked: { url: string; accept?: string } | null = null;
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    const req = route.request();
    asked = { url: req.url(), accept: req.headers()['accept'] };
    if (req.url().includes('/nobody')) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-chess-pgn', 'access-control-allow-origin': '*' },
      body: [game('Hannan', 'Opp', '2026.10.05', SICILIAN_WIN, '1-0', '10:00:00'), game('Opp', 'hannan', '2026.10.04', FOOLS, '0-1')].join('\n'),
    });
  });
  await page.goto('/#/import');
  await page.getByLabel('Lichess username').fill('nobody');
  await page.getByRole('button', { name: 'Fetch games' }).click();
  await expect(page.getByRole('alert')).toContainText('no player called "nobody"');

  await page.getByLabel('Lichess username').fill('Hannan');
  await page.getByLabel('How many games').selectOption('10');
  await page.getByLabel('Speed').selectOption('blitz');
  await page.getByRole('button', { name: 'Fetch games' }).click();
  await expect(page.getByTestId('import-summary')).toContainText('2 imported');
  expect(asked!.accept).toBe('application/x-chess-pgn');
  expect(asked!.url).toContain('max=10');
  expect(asked!.url).toContain('perfType=blitz');

  const sides = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('rookery.games') ?? '[]') as { userColor?: string }[]).map((g) => g.userColor),
  );
  expect(sides).toEqual(['w', 'b']);
  await expect(page.getByRole('button', { name: /Review all 2/ })).toBeEnabled();
});

test('Review all reviews the imported games in the background, across pages', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/#/import');
  await page.getByLabel('PGN', { exact: true }).fill(MULTI);
  await page.getByRole('button', { name: 'Import 3 games' }).click();
  await page.getByRole('button', { name: 'Review all 2 (fast)' }).click();
  await expect(page.getByTestId('batch-review')).toContainText('Reviewing game');
  // Leaving the page does not stop it; My games shows the same run.
  await page.getByRole('navigation').getByRole('link', { name: 'Play' }).click();
  await page.goto('/#/games');
  await expect(page.getByTestId('batch-review')).toContainText('Review all finished', { timeout: 150_000 });
  await expect(page.getByTestId('batch-review')).toContainText('2 reviewed');
  await expect(page.getByTestId('game-row').filter({ hasText: 'Reviewed' })).toHaveCount(2);
  await page.getByRole('tab', { name: 'Openings' }).click();
  await expect(page.getByTestId('openings-report')).toContainText(/reviewed/);
});
