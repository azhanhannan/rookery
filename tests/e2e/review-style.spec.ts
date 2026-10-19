import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// Review styles, captions, self-review and arrows on the stored sample review (no engine needed).

async function loadReview(page: Page, prefs?: Record<string, unknown>) {
  await page.goto('/');
  await page.evaluate(
    ([r, p]) => {
      localStorage.clear();
      localStorage.setItem(
        'rookery.current',
        JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
      );
      localStorage.setItem('rookery.games', '[]');
      if (p) localStorage.setItem('rookery.reviewPrefs', JSON.stringify(p));
    },
    [SAMPLE_REVIEWED_RECORD, prefs ?? null] as const,
  );
  await page.goto('/#/review/sample-review-game');
  await page.reload();
}

test('Club is the default without a rating: labels, eval change and a proven caption', async ({ page }) => {
  await loadReview(page);
  await expect(page.getByTestId('review-style').getByRole('button', { name: 'Club' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('review-move-list').getByRole('button', { name: /Nxd4/ }).click();
  await expect(page.getByTestId('move-label')).toHaveText('Blunder');
  await expect(page.getByTestId('eval-change')).toContainText('→');
  await expect(page.getByTestId('caption')).toHaveText('This allowed mate in 1 (Qh2#).');
  await expect(page.getByTestId('square-badge')).toBeVisible();
});

test('Learner: three colours, numbers behind Show details, key moments only', async ({ page }) => {
  await loadReview(page, { style: 'learner', selfReview: 'off' });
  await page.getByTestId('review-move-list').getByRole('button', { name: /O-O/ }).click();
  await expect(page.getByTestId('caption')).toHaveText('A mistake. Nb5 was better.');
  await expect(page.getByTestId('move-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show details' }).click();
  await expect(page.getByTestId('move-label')).toHaveText('Mistake');
  await page.getByLabel('Key moments only').check();
  await expect(page.getByTestId('key-moments').getByRole('button')).toHaveCount(4);
});

test('Analyst: NAGs and numbers with depth, captions off until asked', async ({ page }) => {
  await loadReview(page, { style: 'analyst' });
  const list = page.getByTestId('analyst-move-list');
  await expect(list.getByRole('button', { name: 'h3??' })).toBeVisible();
  await list.getByRole('button', { name: 'Nxd4??' }).click();
  await expect(page.getByTestId('analyst-eval')).toContainText('d16');
  await expect(page.getByTestId('caption')).toHaveCount(0);
  await page.getByRole('button', { name: 'Captions' }).click();
  await expect(page.getByTestId('caption')).toHaveText('This allowed mate in 1 (Qh2#).');
});

test('self-review: pick a move, then see it next to the biggest mistake; Skip just shows the review', async ({ page }) => {
  await loadReview(page, { style: 'learner' });
  await expect(page.getByText('Where do you think it went wrong?')).toBeVisible();
  await page.getByTestId('self-review').getByRole('button', { name: '7. O-O' }).click();
  await page.getByRole('button', { name: /It was 7\. O-O/ }).click();
  const result = page.getByTestId('self-review-result');
  await expect(result).toContainText('You picked 7. O-O');
  await expect(result).toContainText('9. h3');

  await loadReview(page, { style: 'learner' });
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('self-review-result')).toHaveCount(0);
  await expect(page.getByTestId('move-panel')).toBeVisible();
});

test('self-review: arrow keys step through the moves before picking', async ({ page }) => {
  await loadReview(page, { style: 'learner' });
  const gate = page.getByTestId('self-review');
  await expect(gate.getByRole('button', { name: 'Tap a move' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(gate.getByRole('button', { name: '1. e4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(gate.getByRole('button', { name: /It was 1\. e4/ })).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await expect(gate.getByRole('button', { name: 'Tap a move' })).toBeDisabled();
  await page.keyboard.press('End');
  await expect(gate.locator('[aria-pressed="true"]')).toHaveCount(1);
});

test('Settings has a Game Review section that saves the style', async ({ page }) => {
  await page.goto('/#/account');
  const section = page.getByTestId('review-settings');
  await section.getByRole('button', { name: 'Analyst' }).click();
  await expect(section.getByRole('button', { name: 'Analyst' })).toHaveAttribute('aria-pressed', 'true');
  const saved = await page.evaluate(() => localStorage.getItem('rookery.reviewPrefs'));
  expect(JSON.parse(saved!).style).toBe('analyst');
});
