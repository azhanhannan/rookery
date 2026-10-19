import { expect, test, type Locator, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// "Why?" in Review on the stored sample review (no engine needed). The panel's sentences come from the line story
// and position changes; the assertions hold whatever they say: the panel opens with its heading and either the
// sections or the honest "nothing more" message, and closes again.

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

/** The panel says something: at least one section, or the empty message. */
async function expectContent(panel: Locator) {
  await expect(panel.getByRole('heading', { name: 'Why?' })).toBeVisible();
  const any = panel
    .getByTestId('why-empty')
    .or(panel.getByTestId('why-played'))
    .or(panel.getByTestId('why-better'))
    .or(panel.getByTestId('why-changes'));
  await expect(any.first()).toBeVisible();
  if (await panel.getByTestId('why-empty').count()) {
    await expect(panel.getByTestId('why-empty')).toHaveText("Nothing more to add than the engine's numbers here.");
  }
}

test('Club: Why? on a blunder opens and closes; none on a good move; W toggles it; Show plays a line', async ({ page }) => {
  await loadReview(page, { style: 'club', selfReview: 'off' });
  const list = page.getByTestId('review-move-list');
  const movePanel = page.getByTestId('move-panel');

  // 8. Qe2 is Good: no Why? in Club.
  await list.getByRole('button', { name: /Qe2/ }).click();
  await expect(movePanel.getByTestId('why-button')).toHaveCount(0);

  // 9. h3 is a Blunder.
  await list.getByRole('button', { name: /h3/ }).click();
  const button = movePanel.getByTestId('why-button');
  await expect(button).toBeVisible();
  await button.click();
  const panel = movePanel.getByTestId('why-panel');
  await expect(panel).toBeVisible();
  await expectContent(panel);
  await panel.getByRole('button', { name: 'Close Why?' }).click();
  await expect(panel).toHaveCount(0);

  // W toggles it; moving to another move closes it, and the arrows still step the game.
  await page.keyboard.press('w');
  await expect(panel).toBeVisible();
  await page.keyboard.press('w');
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('w');
  await page.keyboard.press('ArrowRight');
  await expect(movePanel).toContainText('9... Nd4');
  await expect(page.getByTestId('why-panel')).toHaveCount(0);

  // "▶ Show", when a sentence offers one, plays its line in the line panel; Back to game reopens the panel.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('w');
  const show = panel.getByTestId('why-show');
  if (await show.count()) {
    await show.first().click();
    await expect(page.getByTestId('line-panel')).toContainText('Line from');
    await page.getByTestId('line-panel').getByRole('button', { name: 'Back to game' }).click();
    await expect(panel).toBeVisible();
  }
});

test('Analyst offers Why? on any move, with the facts note when there are changes', async ({ page }) => {
  await loadReview(page, { style: 'analyst', selfReview: 'off' });
  await page.getByTestId('analyst-move-list').getByRole('button', { name: /^Qe2/ }).click();
  await page.getByTestId('move-panel').getByTestId('why-button').click();
  const panel = page.getByTestId('why-panel');
  await expectContent(panel);
  if (await panel.getByTestId('why-changes').count()) {
    await expect(panel.getByTestId('why-changes')).toContainText('Facts about the position, not necessarily the reason.');
  }
});

test('Learner coach walkthrough: Why? on a key moment; W opens it, arrows still step the walkthrough', async ({ page }) => {
  await loadReview(page, { style: 'learner', selfReview: 'off' });
  const coach = page.getByTestId('coach-walkthrough');
  await expect(coach).toBeVisible();
  await expect(coach.getByTestId('why-button')).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('coach-title')).toHaveText('Moment 1 of 4 · 7. O-O');
  await expect(coach.getByTestId('why-button')).toBeVisible();
  await page.keyboard.press('w');
  const panel = coach.getByTestId('why-panel');
  await expectContent(panel);
  await expect(panel).not.toContainText('Facts about the position');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('coach-title')).toHaveText('Moment 2 of 4 · 7... Nf6');
  await expect(coach.getByTestId('why-panel')).toHaveCount(0);
});

test('the shortcuts sheet lists W', async ({ page }) => {
  await loadReview(page, { style: 'club', selfReview: 'off' });
  await page.getByTestId('shortcuts-button').click();
  await expect(page.getByTestId('shortcuts-sheet')).toContainText('Why?');
});
