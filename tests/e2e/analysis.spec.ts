import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

const square = (page: Page, sq: string) => page.getByTestId('board').locator(`[data-square="${sq}"]`).first();

async function move(page: Page, from: string, to: string) {
  await square(page, from).click();
  await square(page, to).click();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('a different move makes a side line; promote it; engine shows lines', async ({ page }) => {
  await page.goto('/#/analysis');
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await page.keyboard.press('ArrowLeft');
  await move(page, 'c7', 'c5');
  const list = page.getByTestId('analysis-move-list');
  await expect(list.getByTestId('variation')).toHaveCount(1);
  await expect(list.getByTestId('variation')).toContainText('c5');

  await list.getByRole('button', { name: /c5/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Make main line' }).click();
  await expect(list.getByTestId('variation')).toContainText('e5');

  await page.getByLabel('Engine lines').selectOption('3');
  await expect(page.getByTestId('engine-lines').locator('li')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId('line-eval').first()).toHaveText(/^([+-]\d+\.\d\d|0\.00|#-?\d+)$/);
});

test('PGN import keeps comments, variations and NAGs; FEN errors are shown', async ({ page }) => {
  await page.goto('/#/analysis');
  await page.getByLabel('PGN').fill('1. e4 e5 (1... c5 {Sicilian [%cal Gc7c5]} 2. Nf3) 2. Nf3! Nc6 *');
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  const list = page.getByTestId('analysis-move-list');
  await expect(list).toContainText('Sicilian');
  await expect(list).toContainText('Nf3!');

  await page.getByLabel('FEN').fill('not a fen');
  await page.getByRole('button', { name: 'Load FEN', exact: true }).click();
  await expect(page.getByTestId('fen-error')).toContainText('Not a valid FEN');

  await page.getByLabel('FEN').fill('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  await page.getByRole('button', { name: 'Load FEN', exact: true }).click();
  await expect(page.getByTestId('current-fen')).toHaveText('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
});

test('Review hands the game over with "Analyse from here"', async ({ page }) => {
  await page.evaluate((r) => {
    localStorage.setItem(
      'rookery.current',
      JSON.stringify({ record: r, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
    );
  }, SAMPLE_REVIEWED_RECORD);
  await page.goto(`/#/review/${SAMPLE_REVIEWED_RECORD.id}`);
  await page.reload();
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.getByTestId('analyse-from-here').click();
  await expect(page).toHaveURL(/#\/analysis$/);
  await expect(page.getByTestId('analysis-move-list').locator('[aria-current="step"]')).toHaveCount(1);
  await expect(page.getByTestId('current-fen')).toHaveText(SAMPLE_REVIEWED_RECORD.moves[1].fenAfter);
});
