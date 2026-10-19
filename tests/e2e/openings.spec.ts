import { expect, test, type Page } from '@playwright/test';

// Opening trainer: build a repertoire from a PGN, learn it (shown, then from memory), and see the progress.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

test('build a repertoire from PGN and learn it', async ({ page }) => {
  await page.goto('/#/openings');
  await page.getByRole('button', { name: 'New repertoire' }).click();
  await page.getByLabel('Name').fill('Italian');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByLabel('Repertoire PGN').fill('1. e4 e5 2. Nf3 {Develop and attack e5} *');
  await page.getByRole('button', { name: 'Add PGN' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('2 new');

  await page.getByRole('button', { name: /Learn new lines/ }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play e4');
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play Nf3');
  await clickMove(page, 'g1f3');
  await expect(page.getByTestId('drill-plan')).toContainText('Develop and attack e5');

  // From memory: a wrong move shows the right one and counts as a miss.
  await expect(page.getByTestId('drill-feedback')).toContainText('Your move');
  // The board jumps back to the start for the quiz: wait for it before clicking (slow under a full parallel run).
  await expect(square(page, 'e2').locator('[data-piece]')).toHaveCount(1);
  await expect(square(page, 'f3').locator('[data-piece]')).toHaveCount(0);
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('e4 is right');
  await expect(square(page, 'e5').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'f1c4');
  await expect(page.getByTestId('drill-feedback')).toContainText('Here it is: Nf3');
  await clickMove(page, 'g1f3');
  // One more look at the missed move, from its own position, so the line ends on a right move.
  await expect(page.getByText('One more look', { exact: true })).toBeVisible();
  await expect(square(page, 'f3').locator('[data-piece]')).toHaveCount(0);
  await clickMove(page, 'g1f3');
  await expect(page.getByTestId('drill-feedback')).toContainText('1 of 2 from memory, and you fixed the other one');

  await page.getByRole('button', { name: 'Back to repertoire' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('1 learned');
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.getByTestId('weak-spot')).toHaveCount(1);
  await expect(page.getByTestId('weak-spot')).toContainText('1. e4 e5');

  // Extra practice off the schedule: any time, and the counts don't move for right answers.
  await page.getByRole('button', { name: 'Drill weakest' }).click();
  await expect(page.getByTestId('drill-off-schedule')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Practise anyway' }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('Your move');
  await expect(square(page, 'e2').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'e2e4');
  await expect(page.getByTestId('drill-feedback')).toContainText('e4 is right');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('repertoire-counts')).toContainText('1 learned');

  // Survives a reload (one localStorage key).
  await page.reload();
  await expect(page.getByTestId('repertoire-header')).toContainText('Italian');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rookery.repertoires') ?? '{}'));
  expect(stored.updatedAt).toBeTruthy();
});

test('save the Analysis board as a repertoire', async ({ page }) => {
  await page.goto('/#/analysis');
  await page.getByLabel('PGN', { exact: true }).fill('1. d4 d5 2. c4 *');
  await page.getByRole('button', { name: 'Import PGN' }).click();
  await page.getByRole('button', { name: 'Save as repertoire' }).click();
  await page.getByLabel('Repertoire name').fill('QG');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: /open the opening trainer/ }).click();
  await expect(page.getByTestId('repertoire-header')).toContainText('QG');
  await expect(page.getByTestId('repertoire-counts')).toContainText('2 positions');
});

test('add a repertoire from the library and start learning it', async ({ page }) => {
  await page.goto('/#/openings');
  await page.getByRole('button', { name: 'Browse the library' }).click();
  await expect(page.getByTestId('library-entry')).toHaveCount(11);
  await page.getByTestId('library-entry').filter({ hasText: 'Ruy Lopez' }).click();
  await expect(page.getByTestId('library-line').first()).toContainText('Ruy Lopez');
  // Picking a line shows its last position on the board.
  await page.getByTestId('library-line').filter({ hasText: 'Marshall' }).click();
  await expect(page.locator('[data-square="h3"] [data-piece]')).toHaveCount(1);
  await page.getByTestId('library-add').click();
  await expect(page.getByTestId('repertoire-header')).toContainText('Ruy Lopez');
  await expect(page.getByTestId('repertoire-counts')).toContainText('0 learned');
  await page.getByRole('button', { name: /Learn new lines/ }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play e4');
});

test('Play reminds about opening moves due today and links to that repertoire', async ({ page }) => {
  await page.goto('/#/openings');
  await page.getByRole('button', { name: 'New repertoire' }).click();
  await page.getByLabel('Name').fill('Queen pawn');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Repertoire PGN').fill('1. d4 d5 2. c4 *');
  await page.getByRole('button', { name: 'Add PGN' }).click();
  await page.getByRole('button', { name: /Learn new lines/ }).click();
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play d4');
  await clickMove(page, 'd2d4');
  await expect(page.getByTestId('drill-feedback')).toContainText('New move: play c4');
  await clickMove(page, 'c2c4');
  await expect(page.getByTestId('drill-feedback')).toContainText('Your move');
  await expect(square(page, 'd2').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'd2d4');
  await expect(page.getByTestId('drill-feedback')).toContainText('d4 is right');
  await expect(square(page, 'd5').locator('[data-piece]')).toHaveCount(1);
  await clickMove(page, 'c2c4');
  await expect(page.getByTestId('drill-feedback')).toContainText('all 2 from memory');
  await page.getByRole('button', { name: 'Back to repertoire' }).click();

  // A second repertoire becomes the selected one; nothing is due on it.
  await page.getByRole('button', { name: 'New repertoire' }).click();
  await page.getByLabel('Name').fill('Spare');
  await page.getByRole('button', { name: 'Create' }).click();

  // Nothing is due until tomorrow.
  await page.goto('/#/play');
  await expect(page.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('openings-due')).toHaveCount(0);

  // Move the answered cards' dates into the past.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('rookery.repertoires')!);
    for (const cards of Object.values(data.cards) as Record<string, { due: string }>[]) for (const c of Object.values(cards)) c.due = '2000-01-01';
    localStorage.setItem('rookery.repertoires', JSON.stringify(data));
  });
  await page.reload();
  const card = page.getByTestId('openings-due');
  await expect(card).toContainText('Queen pawn');
  await expect(card).toContainText('2 moves');
  await expect(card).not.toContainText('Spare');
  await expect(page.getByTestId('openings-due-dot')).toBeVisible();

  await card.getByRole('link', { name: /Queen pawn/ }).click();
  await expect(page.getByTestId('repertoire-header')).toContainText('Queen pawn');
  await expect(page.getByRole('button', { name: /Due now \(2\)/ })).toBeEnabled();

  // "Not today" hides the card until tomorrow; the header count stays.
  await page.goto('/#/play');
  await page.getByTestId('openings-due').getByRole('button', { name: 'Not today' }).click();
  await expect(page.getByTestId('openings-due')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('openings-due')).toHaveCount(0);
  await expect(page.getByTestId('openings-due-dot')).toBeVisible();

  // Today's reviews done (the daily cap): the trainer says so and the header count goes.
  await page.evaluate(() => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('rookery.openings.daily', JSON.stringify({ day, reviews: 12 }));
  });
  await page.goto('/#/openings');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Done for today ✓' })).toBeDisabled();
  await expect(page.getByTestId('repertoire-capped')).toContainText('about 1 day to catch up');
  await expect(page.getByTestId('openings-due-dot')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('rookery.openings.daily'));
  await page.reload();

  // Resting: nothing is asked, and the reminder leaves it out.
  await expect(page.getByRole('button', { name: 'Due now (2)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Rest', exact: true }).click();
  await expect(page.getByTestId('repertoire-resting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Due now (0)' })).toBeDisabled();
  await expect(page.getByTestId('openings-due-dot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('button', { name: 'Due now (2)' })).toBeEnabled();
});

test('two White repertoires that answer a position differently: asked once, Rest or Keep both', async ({ page }) => {
  await page.goto('/#/openings');
  for (const [name, pgn] of [
    ['Italian', '1. e4 e5 2. Nf3 Nc6 3. Bc4 *'],
    ['Ruy', '1. e4 e5 2. Nf3 Nc6 3. Bb5 *'],
  ]) {
    await page.getByRole('button', { name: 'New repertoire' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByLabel('Repertoire PGN').fill(pgn);
    await page.getByRole('button', { name: 'Add PGN' }).click();
  }
  const prompt = page.getByTestId('conflict-prompt');
  await expect(prompt).toContainText('Bc4 vs Bb5');
  await expect(prompt).toContainText('after 1. e4 e5 2. Nf3 Nc6');
  await expect(page.getByTestId('learn-note')).toContainText('Up to 6 new moves today');

  await prompt.getByRole('button', { name: 'Rest Ruy' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId('repertoire-resting')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('conflict-prompt')).toHaveCount(0);
});
