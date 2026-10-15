import { expect, test, type Page } from '@playwright/test';

// Settings → Play cosmetics: board toggles, hidden ratings, the flip key, the shortcuts sheet, hand-drawn marks.

async function centre(page: Page, square: string) {
  const box = (await page.locator(`#main-board-square-${square}`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('Play settings: board toggles apply to the play board and survive a reload', async ({ page }) => {
  await page.goto('/#/account');
  const section = page.getByTestId('play-settings');
  await expect(section).toBeVisible();
  await expect(section.getByRole('radio', { name: 'Classic' })).toHaveAttribute('aria-checked', 'true');
  await section.getByRole('radio', { name: 'Wood' }).click();
  await expect(section.getByRole('radio', { name: 'Wood' })).toHaveAttribute('aria-checked', 'true');
  await section.getByRole('checkbox', { name: /Legal-move dots/ }).uncheck();
  await section.getByRole('radio', { name: 'None' }).click();
  await page.reload();
  await expect(page.getByTestId('play-settings').getByRole('radio', { name: 'Wood' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('play-settings').getByRole('checkbox', { name: /Legal-move dots/ })).not.toBeChecked();

  // No dots: selecting e2 leaves e4 without a background image, and the move still works by click.
  await page.goto('/#/play');
  await page.locator('#main-board-square-e2').click();
  await expect(page.locator('#main-board-square-e4')).not.toHaveCSS('background-image', /radial-gradient/);
  await page.locator('#main-board-square-e4').click();
  await expect(page.getByTestId('status')).toHaveText('Black to move');
});

test('X flips the board, ? opens the shortcuts sheet', async ({ page }) => {
  await page.goto('/#/play');
  const a1 = async () => (await page.locator('#main-board-square-a1').boundingBox())!.y;
  const before = await a1();
  await page.keyboard.press('x');
  await expect.poll(a1).toBeLessThan(before);
  await expect(page.getByRole('button', { name: 'Flip board' })).toHaveAttribute('title', 'Flip board (X)');
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcuts-sheet')).toContainText('Flip board');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts-sheet')).toBeHidden();
});

test('right-click circles a square; a left click clears it', async ({ page }) => {
  await page.goto('/#/play');
  const e4 = await centre(page, 'e4');
  await page.mouse.move(e4.x, e4.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#main-board-square-e4')).toHaveCSS('background-image', /radial-gradient/);
  await page.mouse.click(e4.x, e4.y);
  await expect(page.locator('#main-board-square-e4')).toHaveCSS('background-image', 'none');
});

test('Hide ratings removes the player rating from Play', async ({ page }) => {
  await page.goto('/#/account');
  await page.getByTestId('play-settings').getByRole('checkbox', { name: /Hide ratings/ }).check();
  await page.goto('/#/play');
  await expect(page.getByText(/^\(\d+\)$/)).toHaveCount(0);
});
