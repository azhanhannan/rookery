import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_RECORD, SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

// The review runner is still a stub here, so these tests inject a finished review (the fixture) into the
// saved session and check the review screen around it.

const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const pieceOn = (page: Page, sq: string, piece: string) => square(page, sq).locator(`[data-piece="${piece}"]`);

async function loadSession(page: Page, record: unknown, hash = '', history: unknown[] = []) {
  await page.goto('/');
  await page.evaluate(([r, h]) => {
    localStorage.clear();
    localStorage.setItem(
      'rookery.current',
      JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
    );
    localStorage.setItem('rookery.games', JSON.stringify(h));
  }, [record, history] as const);
  await page.goto(`/${hash}`);
  await page.reload();
}

test('a finished game offers Game Review, which shows the stored review', async ({ page }) => {
  await loadSession(page, SAMPLE_REVIEWED_RECORD);
  await expect(page.getByTestId('status')).toHaveText('Black wins by checkmate');
  await page.getByRole('link', { name: 'Game Review' }).click();
  await expect(page).toHaveURL(/#\/review\/sample-review-game$/);

  await expect(page.getByTestId('opening')).toContainText('Smith-Morra Gambit');
  const list = page.getByTestId('review-move-list');
  await expect(list.getByRole('button')).toHaveCount(20);
  await expect(list.getByRole('img', { name: 'Blunder' })).toHaveCount(2);
  await expect(list.getByRole('img', { name: 'Brilliant' })).toHaveCount(1);

  // Summary: accuracy to one decimal, label counts, the empty rating slot.
  await expect(page.getByTestId('summary-white').getByTestId('accuracy')).toHaveText(/^\d+\.\d$/);
  await expect(page.getByTestId('summary-white').getByTestId('count-Blunder')).toHaveText('2');
  await expect(page.getByTestId('summary-black').getByTestId('count-Book')).toHaveText('3');

  // Selecting a move shows its label and explanation; the best move is drawn as an arrow.
  await list.getByRole('button', { name: /O-O/ }).click();
  await expect(page.getByTestId('move-label')).toHaveText('Mistake');
  await expect(page.getByTestId('explanation')).toHaveText(/Best was Nb5/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('move-label')).toHaveText('Miss');
  await page.keyboard.press('End');
  await expect(page.getByTestId('explanation')).toHaveText('Best: checkmate.');
  await expect(page.getByTestId('eval-bar')).toHaveAttribute('aria-valuenow', '0');
});

test('clicking a dot on the eval graph jumps to that move', async ({ page }) => {
  await loadSession(page, SAMPLE_REVIEWED_RECORD, '#/review');
  await page.getByTestId('graph-dot-17').click();
  await expect(page.getByTestId('move-panel')).toContainText('9. h3');
  await expect(page.getByTestId('move-label')).toHaveText('Blunder');
  await expect(pieceOn(page, 'h3', 'wP')).toBeVisible();

  // Anywhere on the graph works too: the left edge is the start position.
  const box = (await page.getByTestId('eval-graph').boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await expect(page.getByTestId('move-panel')).toContainText('Start position');
});

test('show best line plays the engine line, and Back to game returns', async ({ page }) => {
  await loadSession(page, SAMPLE_REVIEWED_RECORD, '#/review/sample-review-game');
  await page.getByTestId('review-move-list').getByRole('button', { name: /O-O/ }).click();
  await page.getByRole('button', { name: 'Show best line' }).click();
  const panel = page.getByTestId('line-panel');
  await expect(panel).toContainText('instead of 7. O-O');
  await expect(panel).toContainText('Nb5');
  // Plays itself: the knight reaches b5, then the queen goes to b8.
  await expect(pieceOn(page, 'b5', 'wN')).toBeVisible();
  await expect(pieceOn(page, 'b8', 'bQ')).toBeVisible();
  await page.getByRole('button', { name: 'Previous line move' }).click();
  await expect(pieceOn(page, 'c7', 'bQ')).toBeVisible();
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page.getByTestId('move-label')).toHaveText('Mistake');
  await expect(pieceOn(page, 'g1', 'wK')).toBeVisible();
});

test('retry: the best move is Correct!, a wrong one is Not quite', async ({ page }) => {
  await loadSession(page, SAMPLE_REVIEWED_RECORD, '#/review');
  await page.getByRole('button', { name: 'Retry mistakes (3)' }).click();
  const panel = page.getByTestId('retry-panel');
  await expect(panel).toContainText('Retry 1 of 3');
  await expect(panel).toContainText('7. O-O was a mistake');

  // A legal move that isn't the best snaps back.
  await square(page, 'a2').click();
  await square(page, 'a3').click();
  await expect(page.getByTestId('retry-result')).toHaveText("Not quite: a3 isn't the best move.");
  await expect(pieceOn(page, 'a2', 'wP')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();

  await square(page, 'c3').click();
  await square(page, 'b5').click();
  await expect(page.getByTestId('retry-result')).toHaveText('Correct! Nb5 is the best move.');
  await expect(pieceOn(page, 'b5', 'wN')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(panel).toContainText('Retry 2 of 3');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('retry-result')).toHaveText('The best move was g3.');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByTestId('move-label')).toHaveText('Blunder');
});

test('an unreviewed finished game shows the depth choice; the Review link lists finished games', async ({ page }) => {
  await loadSession(page, SAMPLE_RECORD, '#/review', [SAMPLE_RECORD]);
  await expect(page.getByRole('group', { name: 'Review depth' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Normal/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();

  await page.getByRole('link', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByText("The current game isn't finished yet")).toBeVisible();
  await page.getByTestId('review-games').getByRole('link', { name: /You vs Bot 1200/ }).click();
  await expect(page).toHaveURL(/#\/review\/sample-review-game$/);
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
});
