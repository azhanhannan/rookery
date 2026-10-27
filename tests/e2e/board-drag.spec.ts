import { expect, test, type Page } from '@playwright/test';

// On phones a tap often wobbles a few pixels, and a quick flick can start and end a drag within one frame.
// react-chessboard then never reports the drag's end and the piece stays dimmed and stuck (until a reload).
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const piece = (page: Page, sq: string) => square(page, sq).locator('[data-piece]');
const opacity = (page: Page, sq: string) => piece(page, sq).evaluate((el) => getComputedStyle(el).opacity);

async function startAsWhite(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog', { name: 'New game' });
  await dialog.getByRole('button', { name: 'Bot', exact: true }).click();
  await dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: '800', exact: true }).click();
  await dialog.getByRole('button', { name: 'White', exact: true }).click();
  await dialog.getByRole('button', { name: 'Unlimited', exact: true }).click();
  await dialog.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(piece(page, 'g1')).toBeVisible();
}

/** Touch down on `from`'s piece, move `dx` px, lift: all in one task, so React never renders in between. */
async function oneFrameGesture(page: Page, from: string, dx: number) {
  await page.evaluate(
    ([sq, dx]) => {
      const el = document.querySelector(`[data-square="${sq}"] [data-piece]`) as HTMLElement;
      const r = el.getBoundingClientRect();
      const at = (x: number, buttons: number) => ({
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons,
        clientX: r.x + r.width / 2 + x, clientY: r.y + r.height / 2,
      });
      el.dispatchEvent(new PointerEvent('pointerdown', at(0, 1)));
      document.dispatchEvent(new PointerEvent('pointermove', at(dx, 1)));
      document.dispatchEvent(new PointerEvent('pointerup', at(dx, 0)));
    },
    [from, dx] as const,
  );
}

test('a wobbly tap (3 px) stays a tap: the piece is not dimmed', async ({ page }) => {
  await startAsWhite(page);
  await oneFrameGesture(page, 'g1', 3);
  await page.waitForTimeout(300);
  expect(await opacity(page, 'g1')).toBe('1');
});

test('a drag that starts and ends in one frame is reset: the piece is not left dimmed and still moves', async ({ page }) => {
  await startAsWhite(page);
  await oneFrameGesture(page, 'g1', 12);
  await expect.poll(() => opacity(page, 'g1')).toBe('1');
  // The flick selected the knight; tapping a target plays the move.
  await square(page, 'f3').click();
  await expect(piece(page, 'f3')).toHaveAttribute('data-piece', 'wN');
});
