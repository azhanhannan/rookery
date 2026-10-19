import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// Coach walkthrough on the stored sample review (no engine needed): Rookie walks through the key moments.

async function loadReview(page: Page, prefs: Record<string, unknown>) {
  await page.goto('/');
  await page.evaluate(
    ([r, p]) => {
      localStorage.clear();
      localStorage.setItem(
        'rookery.current',
        JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
      );
      localStorage.setItem('rookery.games', '[]');
      localStorage.setItem('rookery.reviewPrefs', JSON.stringify(p));
    },
    [SAMPLE_REVIEWED_RECORD, prefs] as const,
  );
  await page.goto('/#/review/sample-review-game');
  await page.reload();
}

test('Learner: the walkthrough opens by itself; arrow keys step it, not the moves; Escape closes it', async ({ page }) => {
  await loadReview(page, { style: 'learner', selfReview: 'off' });
  const coach = page.getByTestId('coach-walkthrough');
  await expect(coach).toBeVisible();
  await expect(coach.getByTestId('coach-line').first()).toHaveText('You lost with White.');
  await expect(coach).toContainText('4 moments decided this game.');

  // → goes to the first moment and shows the position before it (after 6... Qc7), not the next ply.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('coach-title')).toHaveText('Moment 1 of 4 · 7. O-O');
  await expect(page.getByTestId('move-panel')).toContainText('6... Qc7');
  // Learner: words, no numbers.
  await expect(coach).toContainText('you were about even');
  await expect(coach).not.toContainText('%');

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('coach-title')).toHaveText('Coach walkthrough');

  // "Find the better move" reuses Retry for just that move.
  await page.keyboard.press('ArrowRight');
  await coach.getByRole('button', { name: 'Find the better move' }).click();
  await expect(page.getByTestId('retry-panel')).toBeVisible();
  await page.getByTestId('retry-panel').getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('retry-result')).toHaveText('The best move was Nb5.');
  await page.getByTestId('retry-panel').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('retry-panel')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(coach).toHaveCount(0);
  await expect(page.getByTestId('coach-open')).toBeVisible();
});

test('Club: opened from the button; the proven caption, Show me, and Train this at the end', async ({ page }) => {
  await loadReview(page, { style: 'club' });
  const coach = page.getByTestId('coach-walkthrough');
  await expect(coach).toHaveCount(0);
  await page.getByTestId('coach-open').click();
  await expect(coach).toContainText('Your accuracy was');

  const next = coach.getByRole('button', { name: 'Next' });
  for (let i = 0; i < 4; i++) await next.click();
  await expect(page.getByTestId('coach-title')).toHaveText('Moment 4 of 4 · 10. Nxd4');
  await expect(coach).toContainText('This allowed mate in 1 (Qh2#).');
  await expect(coach).toContainText('% win chance');

  await coach.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByTestId('line-panel')).toContainText('Best line instead of 10. Nxd4');

  await next.click();
  await expect(page.getByTestId('coach-title')).toHaveText('The takeaway');
  await expect(coach).toContainText('Your biggest mistake was 9. h3');
  await expect(page.getByTestId('coach-train')).toHaveAttribute('href', /^#\//);
  await coach.getByRole('button', { name: 'Done' }).click();
  await expect(coach).toHaveCount(0);
});
