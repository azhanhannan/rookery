import { expect, test } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

test('style match: estimates the person from their moves with Maia, keeps the result, leaves the bot out', async ({ page }) => {
  // Downloads ~60 MB the first time, then about 80 model calls.
  test.setTimeout(180_000);
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem(
      'rookery.current',
      JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
    );
  }, SAMPLE_REVIEWED_RECORD);
  await page.goto('/#/review/sample-review-game');
  await page.reload();

  const start = page.getByTestId('maia-match-start');
  await expect(start).toContainText('Rating from playing style');
  await start.getByRole('button', { name: 'Estimate from playing style' }).click();
  await expect(page.getByTestId('maia-match-progress')).toBeVisible();

  const white = page.getByTestId('summary-white');
  await expect(white.getByTestId('style-range')).toHaveText(/^(\d+–\d+|\d+ or (below|above))$/, { timeout: 150_000 });
  await expect(white.getByTestId('style-rating')).toContainText("Maia's top pick");
  await expect(page.getByTestId('maia-match-start')).toHaveCount(0);
  // The bot's side has a known rating, so it isn't matched.
  await expect(page.getByTestId('summary-black').getByTestId('style-rating')).toHaveCount(0);

  // Stored with the game: still there after a reload, without running again.
  await page.reload();
  await expect(white.getByTestId('style-range')).toHaveText(/\d/);
  await expect(page.getByTestId('maia-match-start')).toHaveCount(0);
});
