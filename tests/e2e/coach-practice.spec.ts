import { expect, test, type Page } from '@playwright/test';

// Practice Coach: a rule-proven warning right after a move that loses material, and the bot waits for it.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const moveButtons = (page: Page) => page.getByTestId('move-list').getByRole('button');

async function startBotGame(page: Page, mode: 'Rated' | 'Practice') {
  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog', { name: 'New game' });
  await dialog.getByRole('button', { name: 'Bot', exact: true }).click();
  await dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: '800', exact: true }).click();
  await dialog.getByRole('button', { name: 'White', exact: true }).click();
  await dialog.getByRole('button', { name: 'Unlimited', exact: true }).click();
  await dialog.getByTestId('game-mode').getByRole('button', { name: mode, exact: true }).click();
  await dialog.getByRole('button', { name: 'Start', exact: true }).click();
}

async function play(page: Page, from: string, to: string) {
  await square(page, from).click();
  await square(page, to).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('practice: the Coach warns about a hung bishop, the bot waits, take it back or keep playing', async ({ page }) => {
  await startBotGame(page, 'Practice');
  await expect(page.getByTestId('coach-toggle')).toHaveText('Coach on');
  await play(page, 'e2', 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('coach-warning')).toHaveCount(0);

  // Bf1-a6: the b8 knight (and the b7 pawn) can take it.
  await play(page, 'f1', 'a6');
  await expect(page.getByTestId('coach-warning-text')).toContainText('bishop on a6');
  // The bot holds its reply while the warning is open (its think time is about a second).
  await page.waitForTimeout(3000);
  await expect(moveButtons(page)).toHaveCount(3);

  await page.getByTestId('coach-takeback').click();
  await expect(page.getByTestId('coach-warning')).toHaveCount(0);
  await expect(moveButtons(page)).toHaveCount(2);

  await play(page, 'f1', 'a6');
  await expect(page.getByTestId('coach-warning')).toBeVisible();
  await page.getByTestId('coach-keep-playing').click();
  await expect(page.getByTestId('coach-warning')).toHaveCount(0);
  await expect(moveButtons(page)).toHaveCount(4, { timeout: 15_000 });

  // Turned off, it stays quiet; the choice is remembered.
  await page.getByTestId('coach-toggle').click();
  await expect(page.getByTestId('coach-toggle')).toHaveText('Coach off');
  await page.reload();
  await expect(page.getByTestId('coach-toggle')).toHaveText('Coach off');
});

test('rated games have no Coach', async ({ page }) => {
  await startBotGame(page, 'Rated');
  await expect(page.getByTestId('coach-toggle')).toHaveCount(0);
  await play(page, 'e2', 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await play(page, 'f1', 'a6');
  await expect(moveButtons(page)).toHaveCount(4, { timeout: 15_000 });
  await expect(page.getByTestId('coach-warning')).toHaveCount(0);
});
