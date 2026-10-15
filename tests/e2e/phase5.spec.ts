import { expect, test, type Page } from '@playwright/test';

// Runs against the throwaway API server playwright.config.ts starts on 5182 (proxied by Vite).
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const moveButtons = (page: Page) => page.getByTestId('move-list').getByRole('button');
const nav = (page: Page) => page.getByRole('navigation');

const PASSWORD = 'correct-horse-9';

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

test('sign up, play a rated blitz game, see it in My games and on the profile, log out and back in', async ({ page }) => {
  test.setTimeout(120_000);
  const username = `e2e_${Date.now()}`;

  // Sign up.
  await nav(page).getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(nav(page).getByRole('link', { name: username })).toBeVisible();

  // A rated 3+2 (blitz) game against the 400 bot.
  await page.goto('/#/play');
  const dialog = await openBotDialog(page);
  await dialog.getByRole('group', { name: 'Bot level' }).getByRole('button', { name: '400', exact: true }).click();
  await dialog.getByRole('button', { name: 'White', exact: true }).click();
  await dialog.getByRole('button', { name: '3+2', exact: true }).click();
  const rated = dialog.getByTestId('game-mode').getByRole('button', { name: 'Rated', exact: true });
  await rated.click();
  await expect(rated).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('game-mode-note')).toContainText('Changes your');
  await dialog.getByRole('button', { name: 'Start', exact: true }).click();

  // Two full moves (the minimum for a rated game), each answered by the bot.
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await square(page, 'd2').click();
  await square(page, 'd4').click();
  await expect(moveButtons(page)).toHaveCount(4, { timeout: 15_000 });

  await page.getByRole('button', { name: /^Resign/ }).click();
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByTestId('status')).toHaveText('Black wins by resignation');
  await expect(page.getByTestId('rating-change')).toContainText('→', { timeout: 15_000 });

  // My games lists it as rated.
  await nav(page).getByRole('link', { name: 'My games' }).click();
  await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
  const row = page.getByTestId('game-row').first();
  await expect(row).toContainText('Rated');
  await expect(row).toContainText('Blitz');
  await expect(row).toContainText('Lost');
  await expect(row).toContainText('Bot 400');

  // The profile shows the blitz rating and the history graph.
  await nav(page).getByRole('link', { name: username }).click();
  await expect(page.getByRole('heading', { name: username })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('rating-cards')).toContainText('Blitz');
  await expect(page.getByTestId('rating-graph')).toBeVisible();
  await expect(page.getByTestId('rating-graph').locator('svg').first()).toBeVisible();

  // Log out, then back in with the same credentials.
  await nav(page).getByRole('button', { name: 'Log out' }).click();
  await expect(nav(page).getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: username })).toBeHidden();
  await nav(page).getByRole('link', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(nav(page).getByRole('link', { name: username })).toBeVisible();

  // A saved game opens in review from the server even when it is not on this device.
  await page.evaluate(() => localStorage.clear());
  await nav(page).getByRole('link', { name: 'My games' }).click();
  await page.getByTestId('game-row').first().click();
  await expect(page.getByRole('heading', { name: /vs Bot 400$/ })).toBeVisible({ timeout: 15_000 });
});

test('signed out: nav offers Log in and the bot dialog says Rated needs a sign-in', async ({ page }) => {
  await expect(nav(page).getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  const dialog = await openBotDialog(page);
  await dialog.getByRole('button', { name: '3+2', exact: true }).click();
  await dialog.getByTestId('game-mode').getByRole('button', { name: 'Rated', exact: true }).click();
  await expect(dialog.getByTestId('game-mode-note')).toContainText('Sign in to get a rating');
});

test('My games asks a signed-out player to log in; an unknown profile says so', async ({ page }) => {
  await page.goto('/#/games');
  await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await page.goto('/#/profile/nobody_here_123');
  await expect(page.getByRole('alert')).toHaveText('No player called nobody_here_123');
});

test('"offline" clears by itself once the server can be reached', async ({ page }) => {
  const api = (u: URL) => u.pathname.startsWith('/api/');
  await page.route(api, (r) => r.abort());
  await page.goto('/#/play');
  await expect(page.getByText('offline')).toBeVisible();
  await page.unroute(api);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('offline')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
});

test('Continue with Google creates an account, which can be renamed and signed back into', async ({ page }) => {
  // The e2e server runs a fake Google (ROOKERY_FAKE_GOOGLE=1): the round trip stays on localhost.
  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/#\/account$/);
  await expect(page.getByText(/Welcome! Your account was created with Google/)).toBeVisible();
  await expect(page.getByText(/none \(this account signs in with Google\)/)).toBeVisible();
  await expect(page.getByText('fake.player@example.com')).toBeVisible();

  const newName = `g_${Date.now().toString(36)}`;
  await page.getByLabel('Username').fill(newName);
  await page.getByRole('button', { name: 'Save username' }).click();
  await expect(page.getByText('Username saved.')).toBeVisible();
  await expect(page.getByRole('link', { name: newName })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByRole('link', { name: newName })).toBeVisible();
});
