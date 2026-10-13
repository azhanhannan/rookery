import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const moveButtons = (page: Page) => page.getByTestId('move-list').getByRole('button');

const LEVELS = ['400', '600', '800', '1000', '1200', '1400', '1600', '1800', '2000', '2200', '2400', '2600', '2800', '3000', 'Max'];

async function startBotGame(page: Page, level: string, side: 'White' | 'Black') {
  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog', { name: 'New game' });
  await dialog.getByRole('button', { name: 'Bot', exact: true }).click();
  await dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: level, exact: true }).click();
  await dialog.getByRole('button', { name: side, exact: true }).click();
  await dialog.getByRole('button', { name: 'Unlimited', exact: true }).click();
  await dialog.getByRole('button', { name: 'Start', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('bot replies, UI stays responsive while it thinks, eval bar shows and toggles', async ({ page }) => {
  await startBotGame(page, '1600', 'White');
  await square(page, 'e2').click();
  await square(page, 'e4').click();

  // The engine runs in a Worker: the page still responds while the bot thinks.
  await expect(page.getByTestId('bot-thinking')).toBeVisible();
  await page.getByRole('button', { name: 'Flip board' }).click();
  await page.getByRole('button', { name: 'Flip board' }).click();

  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('bot-thinking')).toBeHidden();

  const bar = page.getByTestId('eval-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuetext', /White \d+%/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Eval bar on' }).click();
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Eval bar off' }).click();
  await expect(page.getByTestId('eval-bar')).toBeVisible();
});

test('bot cannot be moved by the human, and resigning suggests a level', async ({ page }) => {
  await startBotGame(page, '800', 'White');
  // Black's pieces are the bot's: clicking them selects nothing, so no move happens.
  await square(page, 'e7').click();
  await square(page, 'e5').click();
  await expect(page.getByTestId('move-list')).toContainText('No moves yet');

  await page.getByRole('button', { name: /^Resign/ }).click();
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByTestId('status')).toHaveText('Black wins by resignation');
  await expect(page.getByTestId('next-level')).toContainText('600');
  await page.getByTestId('next-level').getByRole('button').click();
  await expect(page.getByTestId('move-list')).toContainText('No moves yet');
  await expect(page.getByText('Bot 600')).toBeVisible();
});

test('every bot level can be chosen and plays a legal first move', async ({ page }) => {
  test.setTimeout(180_000);
  for (const level of LEVELS) {
    await startBotGame(page, level, 'Black');
    // Bot is White and moves first; a move in the list means it was legal (illegal moves are never recorded).
    await expect(moveButtons(page), `level ${level}`).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText(`Bot ${level}`)).toBeVisible();
  }
});

test('a refresh while the bot is to move resumes the bot', async ({ page }) => {
  await startBotGame(page, '1200', 'White');
  await square(page, 'd2').click();
  await square(page, 'd4').click();
  await page.reload();
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
});
