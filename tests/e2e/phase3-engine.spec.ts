import { expect, test, type Page } from '@playwright/test';

// Real engine, real pipeline (runner + openings + classification). Légal's mate: 13 plies, ends in checkmate.
const LEGAL_MATE = '[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0';

async function importAndOpenReview(page: Page) {
  await page.goto('/#/import');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/import');
  await page.getByLabel('PGN').fill(LEGAL_MATE);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('status')).toHaveText('White wins by checkmate');
  await page.getByRole('link', { name: 'Game Review' }).click();
  await expect(page.getByTestId('review-start')).toBeVisible();
}

function depthButton(page: Page, name: string) {
  return page.getByRole('group', { name: 'Review depth' }).getByRole('button', { name: new RegExp(`^${name}`) });
}

test('reviews a real game with progress, labels every move, names the opening, and keeps it after reload', async ({ page }) => {
  test.setTimeout(120_000);
  await importAndOpenReview(page);
  await depthButton(page, 'Fast').click();
  await page.getByTestId('review-start').getByRole('button').last().click();

  await expect(page.getByTestId('review-progress')).toBeVisible();
  await expect(page.getByTestId('review-progress')).toContainText(/Analyzing move \d+ of 13/);

  const list = page.getByTestId('review-move-list');
  await expect(list.getByRole('button')).toHaveCount(13, { timeout: 90_000 });
  // Every move has exactly one label badge.
  await expect(list.getByRole('img')).toHaveCount(13);
  await expect(page.getByTestId('opening')).not.toBeEmpty();
  await expect(page.getByTestId('summary-white').getByTestId('accuracy')).toHaveText(/^\d+\.\d$/);
  // 7 moves by White: too few for a rating estimate (SPEC Feature 4).
  await expect(page.getByTestId('summary-white').getByTestId('estimated-rating')).toContainText('Not enough moves to estimate');

  await page.reload();
  await expect(page.getByTestId('review-move-list').getByRole('img')).toHaveCount(13);
});

test('a running review can be cancelled', async ({ page }) => {
  test.setTimeout(60_000);
  await importAndOpenReview(page);
  await depthButton(page, 'Deep').click();
  await page.getByTestId('review-start').getByRole('button').last().click();
  await expect(page.getByTestId('review-progress')).toBeVisible();
  await page.getByTestId('review-progress').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('review-start')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
