import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const moveButtons = (page: Page) => page.getByTestId('move-list').getByRole('button');

async function openBotDialog(page: Page) {
  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog', { name: 'New game' });
  await dialog.getByRole('button', { name: 'Bot', exact: true }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('human-like bot (Maia) replies to 1.e4 with a legal move, and the style is remembered', async ({ page }) => {
  // First load downloads ~60 MB from the dev server and compiles it.
  test.setTimeout(120_000);
  const dialog = await openBotDialog(page);
  const style = dialog.getByRole('group', { name: 'Style' });
  await expect(style.getByRole('button', { name: 'Engine' })).toHaveAttribute('aria-pressed', 'true');
  await style.getByRole('button', { name: 'Human-like' }).click();
  await expect(style.getByRole('button', { name: 'Human-like' })).toHaveAttribute('aria-pressed', 'true');

  await dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: '1400', exact: true }).click();
  await dialog.getByRole('button', { name: 'White', exact: true }).click();
  await dialog.getByRole('button', { name: 'Unlimited', exact: true }).click();
  // Picking Human-like starts the download: Start reads "Loading…" until the model is ready.
  await dialog.getByRole('button', { name: 'Start', exact: true }).click({ timeout: 90_000 });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Maia 1400')).toBeVisible();

  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 30_000 });

  const reply = (await moveButtons(page).nth(1).textContent())?.trim() ?? '';
  const chess = new Chess();
  chess.move('e4');
  expect(chess.moves()).toContain(reply);

  // The style and level come back next time.
  const again = await openBotDialog(page);
  await expect(again.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Human-like' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(again.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: '1400', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a failed download offers the engine bot instead', async ({ page }) => {
  await page.route('**/maia/maia3_simplified.onnx', (route) => route.fulfill({ status: 404, body: 'missing' }));
  const dialog = await openBotDialog(page);
  await dialog.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Human-like' }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText("couldn't load", { timeout: 30_000 });
  await alert.getByRole('button', { name: 'Use the engine bot instead' }).click();
  await expect(dialog.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Engine' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: 'Max', exact: true })).toBeVisible();
});
