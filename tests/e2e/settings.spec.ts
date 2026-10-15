import { expect, test } from '@playwright/test';

// Board theme: picked in Settings (signed out too), applies to every board, remembered on this device.
test('board theme applies to the play board and survives a reload; Rookery restores the default', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/account');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const themes = page.getByRole('radiogroup', { name: 'Board theme' });
  await expect(themes.getByRole('radio', { name: 'Rookery' })).toHaveAttribute('aria-checked', 'true');
  await themes.getByRole('radio', { name: 'Wood' }).click();
  await expect(themes.getByRole('radio', { name: 'Wood' })).toHaveAttribute('aria-checked', 'true');

  const boardDark = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--board-dark').trim());
  expect(await boardDark()).toBe('#b58863');

  // The real board paints a dark square (a1) in the theme's colour.
  await page.goto('/#/play');
  await expect(page.locator('[data-square="a1"]')).toHaveCSS('background-color', 'rgb(181, 136, 99)');
  await page.reload();
  await expect(page.locator('[data-square="a1"]')).toHaveCSS('background-color', 'rgb(181, 136, 99)');

  await page.goto('/#/account');
  await page.getByRole('radiogroup', { name: 'Board theme' }).getByRole('radio', { name: 'Rookery' }).click();
  expect(await boardDark()).not.toBe('#b58863');
});

test('piece style applies to the play board (moves still work by drag and by click) and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/account');
  const styles = page.getByRole('radiogroup', { name: 'Piece style' });
  await expect(styles.getByRole('radio', { name: 'Classic' })).toHaveAttribute('aria-checked', 'true');
  await styles.getByRole('radio', { name: 'Merida' }).click();
  await expect(styles.getByRole('radio', { name: 'Merida' })).toHaveAttribute('aria-checked', 'true');
  // The preview board switches at once.
  await expect(page.getByTestId('board-preview').locator('img[src="/pieces/merida/wK.svg"]')).toBeVisible();

  await page.goto('/#/play');
  const sq = (s: string) => page.locator(`[data-square="${s}"]`);
  await expect(sq('a1').locator('img')).toHaveAttribute('src', '/pieces/merida/wR.svg');
  // Every image actually loaded.
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('[data-square] img')].filter((i) => !i.complete || i.naturalWidth === 0).length,
  );
  expect(broken).toBe(0);

  // A real pointer drag (the board's drag library needs intermediate moves).
  const from = (await sq('e2').boundingBox())!;
  const to = (await sq('e4').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(sq('e4').locator('img')).toHaveAttribute('src', '/pieces/merida/wP.svg');
  await page.reload();
  await expect(sq('e4').locator('img')).toHaveAttribute('src', '/pieces/merida/wP.svg');
  await sq('e7').click();
  await sq('e5').click();
  await expect(sq('e5').locator('img')).toHaveAttribute('src', '/pieces/merida/bP.svg');
});
