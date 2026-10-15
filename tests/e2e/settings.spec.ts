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
