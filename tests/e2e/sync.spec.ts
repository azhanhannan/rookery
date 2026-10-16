import { expect, test, type Page } from '@playwright/test';

// Account sync of settings and training state: two browser contexts stand in for a phone and a laptop.
const PASSWORD = 'correct-horse-9';
const nav = (page: Page) => page.getByRole('navigation');
const boardDark = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--board-dark').trim());

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test('a board theme and trained days picked on one device show up on another after logging in', async ({ browser }) => {
  test.setTimeout(90_000);
  const username = `sync_${Date.now()}`;

  const phone = await (await browser.newContext()).newPage();
  await fresh(phone);
  await phone.goto('/#/account');
  await expect(phone.getByTestId('sync-note')).toContainText('Saved on this device only');

  await nav(phone).getByRole('link', { name: 'Sign up' }).click();
  await phone.getByLabel('Username').fill(username);
  await phone.getByLabel('Password').fill(PASSWORD);
  await phone.getByRole('button', { name: 'Create account' }).click();
  await expect(nav(phone).getByRole('link', { name: username })).toBeVisible();

  await phone.goto('/#/account');
  await expect(phone.getByTestId('sync-note')).toContainText('Saved to your account');
  await phone.getByRole('radiogroup', { name: 'Board theme' }).getByRole('radio', { name: 'Brown' }).click();
  await phone.evaluate(() => {
    const days = JSON.parse(localStorage.getItem('rookery.trainedDays') ?? '[]') as string[];
    localStorage.setItem('rookery.trainedDays', JSON.stringify([...days, '2026-01-02'].sort()));
  });
  // Wait for the debounced push.
  await expect
    .poll(async () => (await phone.request.get('/api/state')).json().then((r: { items: Record<string, { value: unknown }> }) => r.items), {
      timeout: 15_000,
    })
    .toMatchObject({ 'rookery.boardTheme': { value: 'wood' }, 'rookery.trainedDays': { value: expect.arrayContaining(['2026-01-02']) } });

  const laptop = await (await browser.newContext()).newPage();
  await fresh(laptop);
  await laptop.evaluate(() => localStorage.setItem('rookery.trainedDays', JSON.stringify(['2026-01-01'])));
  expect(await boardDark(laptop)).not.toBe('#b58863');
  await nav(laptop).getByRole('link', { name: 'Log in', exact: true }).click();
  await laptop.getByLabel('Username').fill(username);
  await laptop.getByLabel('Password').fill(PASSWORD);
  await laptop.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(nav(laptop).getByRole('link', { name: username })).toBeVisible();

  // Applied without a reload, and the trained days are a union of both devices.
  await expect.poll(() => boardDark(laptop), { timeout: 15_000 }).toBe('#b58863');
  await expect
    .poll(() => laptop.evaluate(() => JSON.parse(localStorage.getItem('rookery.trainedDays') ?? '[]') as string[]))
    .toEqual(expect.arrayContaining(['2026-01-01', '2026-01-02']));

  // Logging out keeps the device's copy.
  await nav(laptop).getByRole('button', { name: /log out/i }).click().catch(() => {});
  await laptop.reload();
  expect(await boardDark(laptop)).toBe('#b58863');
});
