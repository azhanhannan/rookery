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
  // The board jumps back to the start for the quiz: wait for it before clicking (slow under a full parallel run).
  await expect(square(page, 'e2').locator('[data-piece]')).toHaveCount(1);
  await expect(square(page, 'f3').locator('[data-piece]')).toHaveCount(0);
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

  // Extra practice off the schedule: any time, and the counts don't move for right answers.
  await page.getByRole('button', { name: 'Drill weakest' }).click();
  await expect(page.getByTestId('drill-off-schedule')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Practise anyway' }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('Your move');
  await expect(square(page, 'e2').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('e4 is right');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('1 learned');

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

test('add a repertoire from the library and start learning it', async ({ page }) => {
  await page.goto('/#/openings');
  await page.getByRole('button', { name: 'Browse the library' }).click();
  await expect(page.getByTestId('library-entry')).toHaveCount(11);
  await page.getByTestId('library-entry').filter({ hasText: 'Ruy Lopez' }).click();
  await expect(page.getByTestId('library-line').first()).toContainText('Ruy Lopez');
  // Picking a line shows its last position on the board.
  await page.getByTestId('library-line').filter({ hasText: 'Marshall' }).click();
  await expect(page.locator('[data-square="h3"] [data-piece]')).toHaveCount(1);
  await page.getByTestId('library-add').click();
  await expect(page.getByTestId('repertoire-header')).toContainText('Ruy Lopez');
  await expect(page.getByTestId('repertoire-counts')).toContainText('0 learned');
  await page.getByRole('button', { name: /Learn new lines/ }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play e4');
});
