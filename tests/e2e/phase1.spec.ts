import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('two players: castling, en passant, promotion; refresh restores; resign', async ({ page }) => {
  for (const uci of ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6', 'g8f6', 'd6c7', 'b8c6']) await clickMove(page, uci);

  // Promotion picker
  await clickMove(page, 'c7d8');
  await page.getByRole('button', { name: 'Promote to queen' }).click();
  await expect(page.getByTestId('move-list')).toContainText('cxd8=Q+');
  // Check highlight on the black king is the board's job; the status just says whose move it is.
  await expect(page.getByTestId('status')).toHaveText('Black to move');

  for (const uci of ['e8d8', 'g1f3', 'c8g4', 'f1c4', 'e7e5', 'e1g1']) await clickMove(page, uci);
  await expect(page.getByTestId('move-list')).toContainText('exd6');
  await expect(page.getByTestId('move-list')).toContainText('O-O');

  // Illegal move snaps back: nothing is added
  await clickMove(page, 'd8d4');
  await expect(page.getByTestId('move-list').getByRole('button')).toHaveCount(15);

  await page.reload();
  await expect(page.getByTestId('move-list').getByRole('button')).toHaveCount(15);
  await expect(page.getByTestId('status')).toHaveText('Black to move');

  // Arrow keys step through the game
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('status')).toContainText('Viewing move 14 of 15');
  await page.keyboard.press('End');

  await page.getByRole('button', { name: 'Resign (Black)' }).click();
  await page.getByRole('button', { name: 'Confirm: Black resigns' }).click();
  await expect(page.getByTestId('status')).toHaveText('White wins by resignation');
});

test('checkmate is detected and the PGN round-trips through import', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) await clickMove(page, uci);
  await expect(page.getByTestId('status')).toHaveText('Black wins by checkmate');

  await page.getByRole('button', { name: 'Copy PGN' }).click();
  const pgn = await page.evaluate(() => navigator.clipboard.readText());
  expect(pgn).toContain('[Result "0-1"]');

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('move-list')).toContainText('No moves yet');

  await page.goto('/#/import');
  await page.getByLabel('PGN').fill(pgn);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('status')).toHaveText('Black wins by checkmate');
  await expect(page.getByTestId('move-list')).toContainText('Qh4#');
});

test('clock: a timed game shows both clocks and a flag ends it', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: '1+0' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('clock-w')).toHaveText('1:00');
  await clickMove(page, 'e2e4');
  // Fast-forward Black's clock by rewriting the stored session, then reload.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rookery.current')!);
    s.clock.b = 1500;
    localStorage.setItem('rookery.current', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('White wins by timeout', { timeout: 5000 });
});

test('invalid PGN shows an error', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByLabel('PGN').fill('1. e4 e5 2. Ke3');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('alert')).toContainText("Couldn't read that PGN");
});
