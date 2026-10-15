import { expect, test, type Page } from '@playwright/test';

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

test('rated bot games have no helpers', async ({ page }) => {
  await startBotGame(page, 'Rated');
  await expect(page.getByTestId('practice-panel')).toHaveCount(0);
  await expect(page.getByTestId('takeback')).toHaveCount(0);
});

test('practice: tag, takeback, hint, threat, and the choice is remembered', async ({ page }) => {
  await startBotGame(page, 'Practice');
  await expect(page.getByTestId('practice-panel')).toBeVisible();
  await expect(page.getByTestId('practice-tag').first()).toBeVisible();
  await expect(page.getByTestId('takeback')).toBeDisabled();

  await play(page, 'e2', 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await page.getByTestId('takeback').click();
  await expect(page.getByTestId('move-list')).toContainText('No moves yet');

  // Hint outlines one of White's pieces; threat draws an arrow.
  await page.getByTestId('hint').click();
  await expect(page.getByText('the outlined piece is the one to move')).toBeVisible({ timeout: 15_000 });
  await play(page, 'e2', 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await page.getByTestId('show-threat').click();
  await expect(page.getByText('what your opponent threatens')).toBeVisible({ timeout: 15_000 });

  // The dialog opens on Practice next time.
  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog', { name: 'New game' });
  await expect(dialog.getByTestId('game-mode').getByRole('button', { name: 'Practice', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('practice: a hanging piece glows and the toggle turns it off', async ({ page }) => {
  await startBotGame(page, 'Practice');
  await play(page, 'e2', 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  // Bf1-a6 puts the bishop where the b7 pawn takes it: it glows until the bot answers (its think time is ~1 s).
  await play(page, 'f1', 'a6');
  await expect(page.getByTestId('hanging-note')).toBeVisible();
  await expect(square(page, 'a6').locator('div[style*="box-shadow"]')).toHaveCount(1);
  await page.getByTestId('hanging-toggle').click();
  await expect(page.getByTestId('hanging-toggle')).toHaveText('Hanging glow off');
  await expect(page.getByTestId('hanging-note')).toHaveCount(0);
});
