import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// Cosmetics and training extras: coach mascot, figurine notation, the square drill, calculation mode and
// the weekly training log.

async function loadReview(page: Page, prefs: Record<string, unknown>, play?: Record<string, unknown>) {
  await page.goto('/');
  await page.evaluate(
    ([r, p, s]) => {
      localStorage.clear();
      localStorage.setItem(
        'rookery.current',
        JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
      );
      localStorage.setItem('rookery.games', '[]');
      localStorage.setItem('rookery.reviewPrefs', JSON.stringify(p));
      if (s) localStorage.setItem('rookery.playSettings', JSON.stringify(s));
    },
    [SAMPLE_REVIEWED_RECORD, prefs, play ?? null] as const,
  );
  await page.goto('/#/review/sample-review-game');
  await page.reload();
}

test('coach mascot is off by default and only speaks a proven caption', async ({ page }) => {
  await loadReview(page, { selfReview: 'off' });
  await page.getByTestId('review-move-list').getByRole('button', { name: /Nxd4/ }).click();
  await expect(page.getByTestId('caption')).toHaveText('This allowed mate in 1 (Qh2#).');
  await expect(page.getByTestId('mascot')).toHaveCount(0);

  await loadReview(page, { selfReview: 'off', coachMascot: true });
  await page.getByTestId('review-move-list').getByRole('button', { name: /Nxd4/ }).click();
  await expect(page.getByTestId('mascot')).toBeVisible();
  await expect(page.getByTestId('mascot').getByTestId('caption')).toHaveText('This allowed mate in 1 (Qh2#).');
  // A move without a proven caption: no mascot line.
  await page.getByTestId('review-move-list').getByRole('button', { name: /O-O/ }).click();
  await expect(page.getByTestId('mascot')).toHaveCount(0);
});

test('Settings toggles the mascot and figurines; move lists show ♘', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/account');
  await page.getByTestId('coach-mascot').check();
  await page.getByTestId('piece-symbols').getByRole('radio', { name: /Figurines/ }).click();
  const prefs = await page.evaluate(() => [localStorage.getItem('rookery.reviewPrefs'), localStorage.getItem('rookery.playSettings')]);
  expect(prefs[0]).toContain('"coachMascot":true');
  expect(prefs[1]).toContain('"pieceSymbols":"figurines"');

  await loadReview(page, { selfReview: 'off' }, { pieceSymbols: 'figurines' });
  await expect(page.getByTestId('review-move-list').getByRole('button', { name: /♘xd4/ })).toBeVisible();
});

test('name-the-square drill: a run scores right clicks and keeps a best', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/drills');
  await page.getByTestId('drill-start').click();
  for (let i = 0; i < 3; i++) {
    const target = (await page.getByTestId('drill-target').textContent())!.trim();
    await page.getByTestId('drill-board').locator(`[data-square="${target}"]`).click();
  }
  await expect(page.getByTestId('drill-score')).toContainText('3');
  // The run ends by itself after 30 s.
  await expect(page.getByTestId('drill-result')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('drill-bests')).toContainText('Best as White: 3');
});

test('calculation mode hides the pieces and checks the entered line', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rookery.calcMode', '1');
  });
  await page.goto('/#/puzzles');
  await page.getByTestId('puzzle-mode-daily').click();
  await expect(page.getByTestId('calc-panel')).toContainText('Look closely');
  await page.getByRole('button', { name: "I'm ready, hide them" }).click();
  await expect(page.getByTestId('calc-board')).toBeVisible();
  // Find the puzzle's solution, then retry it and enter the line from "memory".
  await page.getByRole('button', { name: 'Show solution' }).click();
  const id = (await page.getByText(/^Puzzle \w+ ·/).textContent())!.split(' ')[1];
  const moves: string[] = await page.evaluate(
    async (pid) => (await (await fetch('/puzzles/puzzles.json')).json()).puzzles.find((x: { id: string }) => x.id === pid).moves,
    id,
  );
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: "I'm ready, hide them" }).click();
  for (const u of moves.slice(1)) {
    await page.getByTestId('calc-board').locator(`[data-square="${u.slice(0, 2)}"]`).click();
    await page.getByTestId('calc-board').locator(`[data-square="${u.slice(2, 4)}"]`).click();
  }
  await page.getByTestId('calc-check').click();
  await expect(page.getByTestId('calc-result')).toHaveText('You saw the whole line from memory!');
  await expect(page.getByText('Solved!')).toBeVisible();
});
