import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// The board (with its name bars, and Review's move buttons) fits a laptop screen without scrolling, stepping
// through moves never scrolls the page, and full screen hides the site header.
async function load(page: Page, hash: string) {
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem(
      'rookery.current',
      JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
    );
  }, SAMPLE_REVIEWED_RECORD);
  await page.goto(`/${hash}`);
  await page.reload();
}

async function within(page: Page, selector: string, height: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}

for (const [w, h] of [
  [1366, 768],
  [1280, 720],
] as const) {
  test(`${w}x${h}: review and play boards fit the window and stepping moves keeps the page still`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await load(page, '#/review/sample-review-game');
    await within(page, '[data-testid="board"]', h);
    await within(page, 'button[aria-label="Next move"]', h);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.getByTestId('review-move-list').getByRole('button').first().click();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await within(page, '[data-testid="board"]', h);

    await page.goto('/#/play');
    await within(page, '[data-testid="board"]', h);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test('phone: opening a finished game on Play does not scroll the board away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, '#/play');
  await within(page, '[data-testid="board"]', 844);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('full screen: the button and F hide the header and grow the board; exiting restores both', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await load(page, '#/review/sample-review-game');
  const before = (await page.getByTestId('board').first().boundingBox())!.width;
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.locator('header')).toHaveCount(0);
  const after = (await page.getByTestId('board').first().boundingBox())!.width;
  expect(after).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.locator('header')).toHaveCount(1);

  await page.keyboard.press('f');
  await expect(page.locator('header')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(page.locator('header')).toHaveCount(1);
});

test('phone: the More and Account menus never stay open together, and close on a tap outside', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/signup');
  await page.getByLabel('Username').fill(`m_${Date.now().toString(36)}`);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();

  const account = page.locator('details:has(summary[aria-label="Account"])');
  const more = page.locator('details:has(summary[aria-label="More pages"])');
  await page.getByLabel('Account').click();
  await expect(account).toHaveAttribute('open', '');
  await page.getByLabel('More pages').click();
  await expect(more).toHaveAttribute('open', '');
  await expect(account).not.toHaveAttribute('open');

  await page.getByLabel('Account').click();
  await expect(more).not.toHaveAttribute('open');
  await page.mouse.click(200, 700);
  await expect(account).not.toHaveAttribute('open');
});
