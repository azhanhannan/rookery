import { expect, test, type Page } from '@playwright/test';
import { TB_KPK_WIN } from '../fixtures/tablebase';

// The Lichess tablebase is mocked: e2e never depends on the network.
const square = (page: Page, sq: string) => page.getByTestId('board').locator(`[data-square="${sq}"]`).first();

const DRAW = { category: 'draw', dtz: 0, dtm: 0, checkmate: false, stalemate: false, moves: [] };

async function mockTablebase(page: Page) {
  const asked: string[] = [];
  await page.route('https://tablebase.lichess.ovh/**', async (route) => {
    const fen = new URL(route.request().url()).searchParams.get('fen') ?? '';
    asked.push(fen);
    // After 1.Kd5 in the "king on the sixth" drill the win is gone; everything else answers as the start position.
    const body = fen.startsWith('4k3/8/8/3KP3/') ? DRAW : TB_KPK_WIN;
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  return asked;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('endgame drill: stepping back with the king lets the win slip, and the tablebase says where', async ({ page }) => {
  await mockTablebase(page);
  await page.goto('/#/endgames');
  await page.getByTestId('drill-kpk-sixth').click();
  await expect(page.getByTestId('drill-goal')).toContainText('Win as White');

  await page.getByRole('button', { name: 'Show a tip' }).click();
  await expect(page.getByTestId('drill-tip')).toContainText('Kd6 or Kf6');

  await square(page, 'e6').click();
  await square(page, 'd5').click();
  await expect(page.getByTestId('drill-slip')).toHaveText(
    'You let it slip on move 1 (Kd5): that position went from win to draw.',
  );
  await expect(page.getByTestId('drill-result')).toContainText('Kd6, Kf6');

  // The attempt is stored per device.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rookery.endgames') ?? 'null'));
  expect(stored.drills['kpk-sixth']).toMatchObject({ attempts: 1, best: 'failed' });

  await page.getByRole('button', { name: 'Try that move again' }).click();
  await expect(page.getByTestId('drill-status')).toContainText('Your move');
});

test('Analysis board shows the tablebase verdict and moves with 7 pieces or fewer', async ({ page }) => {
  await mockTablebase(page);
  await page.goto('/#/analysis');
  await page.getByLabel('FEN').fill('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1');
  await page.getByRole('button', { name: 'Load FEN', exact: true }).click();
  await expect(page.getByTestId('tablebase-verdict')).toHaveText('Tablebase: White wins (DTZ 3, DTM 21)');
  await expect(page.getByTestId('tablebase-moves').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('tablebase-moves')).toContainText('Kd6');
});
