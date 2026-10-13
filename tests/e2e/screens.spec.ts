import { test } from '@playwright/test';

// Not an assertion test: writes screenshots for a visual check. Run with SCREENS=1.
test.skip(!process.env.SCREENS, 'screenshots only on demand');

test('screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const sq = (s: string) => page.locator(`[data-square="${s}"]`);
  // drag-and-drop
  const drag = async (a: string, b: string) => {
    const from = (await sq(a).boundingBox())!;
    const to = (await sq(b).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
  };
  await drag('e2', 'e4');
  await drag('f7', 'f6');
  await sq('d1').click(); await sq('h5').click();
  await sq('g7').click();
  await page.screenshot({ path: 'test-results/screen-check-select.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/screen-phone.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.getByRole('button', { name: 'New game' }).click();
  await page.screenshot({ path: 'test-results/screen-dark-dialog.png' });
});

test('review screens', async ({ page }) => {
  const { SAMPLE_REVIEWED_RECORD } = await import('../fixtures/sample-review');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem('rookery.current', JSON.stringify({ record: r, clock: null, orientation: 'white' }));
  }, SAMPLE_REVIEWED_RECORD);
  await page.goto('/#/review');
  await page.reload();
  await page.getByTestId('graph-dot-13').click();
  await page.screenshot({ path: 'test-results/screen-review.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/screen-review-phone.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: /Retry mistakes/ }).click();
  await page.screenshot({ path: 'test-results/screen-review-phone-dark-retry.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`horizontal scroll at 390px: ${overflow}px`);
});
