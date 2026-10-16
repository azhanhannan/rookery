import { expect, test, type Page } from '@playwright/test';

// Opening trainer: build a repertoire from a PGN, learn it (shown, then from memory), and see the progress.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

test('build a repertoire from PGN and learn it', async ({ page }) => {
  await page.goto('/#/openings');
  await page.getByRole('button', { name: 'New repertoire' }).click();
  await page.getByLabel('Name').fill('Italian');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByLabel('Repertoire PGN').fill('1. e4 e5 2. Nf3 {Develop and attack e5} *');
  await page.getByRole('button', { name: 'Add PGN' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('2 new');

  await page.getByRole('button', { name: /Learn new lines/ }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play e4');
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play Nf3');
  await clickMove(page, 'g1f3');
  await expect(page.getByTestId('drill-plan')).toContainText('Develop and attack e5');

  // From memory: a wrong move shows the right one and counts as a miss.
  await expect(page.getByTestId('drill-feedback')).toContainText('Your move');
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('e4 is right');
  await expect(square(page, 'e5').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'f1c4');
  await expect(page.getByTestId('drill-feedback')).toContainText('Play Nf3');
  await clickMove(page, 'g1f3');
  await expect(page.getByTestId('drill-feedback')).toContainText('1 of 2 right first time');

  await page.getByRole('button', { name: 'Back to repertoire' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('1 learned');
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.getByTestId('weak-spot')).toHaveCount(1);
  await expect(page.getByTestId('weak-spot')).toContainText('1. e4 e5');

  // Survives a reload (one localStorage key).
  await page.reload();
  await expect(page.getByTestId('repertoire-header')).toContainText('Italian');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rookery.repertoires') ?? '{}'));
  expect(stored.updatedAt).toBeTruthy();
});

test('save the Analysis board as a repertoire', async ({ page }) => {
  await page.goto('/#/analysis');
  await page.getByLabel('PGN', { exact: true }).fill('1. d4 d5 2. c4 *');
  await page.getByRole('button', { name: 'Import PGN' }).click();
  await page.getByRole('button', { name: 'Save as repertoire' }).click();
  await page.getByLabel('Repertoire name').fill('QG');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: /open the opening trainer/ }).click();
  await expect(page.getByTestId('repertoire-header')).toContainText('QG');
  await expect(page.getByTestId('repertoire-counts')).toContainText('2 positions');
});
