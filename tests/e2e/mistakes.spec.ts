import { Chess } from 'chess.js';
import { expect, test, type Page } from '@playwright/test';
import type { GameRecord } from '../../src/game/types';
import type { Puzzle, PuzzleSet } from '../../src/puzzles/types';

// "My mistakes", the daily puzzle and the trained-days streak. A reviewed game is seeded in localStorage:
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#, the player (Black) against a bot; the review says 3...g6 was best.
const square = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);
const pieceOn = (page: Page, sq: string, piece: string) => square(page, sq).locator(`[data-piece="${piece}"]`);

async function clickMove(page: Page, uci: string) {
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
}

function reviewedGame(): GameRecord {
  const ucis = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
  const chess = new Chess();
  const start = chess.fen();
  const moves = ucis.map((u) => {
    const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
    return { san: m.san, uci: u, fenAfter: chess.fen() };
  });
  const fens = [start, ...moves.map((m) => m.fenAfter)];
  const best = (i: number) => (i === 5 ? 'g7g6' : ucis[i]);
  return {
    id: 'e2e-mistake-game',
    startFen: start,
    moves,
    white: { name: 'Bot 1100', isBot: true, elo: 1100 },
    black: { name: 'You', isBot: false },
    result: '1-0',
    termination: 'checkmate',
    createdAt: '2026-10-12T10:00:00Z',
    review: {
      version: 1,
      depth: 12,
      createdAt: '2026-10-12T10:05:00Z',
      positions: fens.map((fen, i) => ({
        fen,
        winWhite: 50,
        score: { cp: 0 },
        bestMove: ucis[i] ? best(i) : undefined,
        bestLine: ucis[i] ? [best(i)] : [],
      })),
      moves: moves.map((m, i) => ({
        ply: i + 1,
        color: i % 2 ? 'b' : 'w',
        san: m.san,
        uci: m.uci,
        label: i === 5 ? 'Blunder' : 'Best',
        winBefore: 50,
        winAfter: 50,
        loss: 0,
        accuracy: 100,
        explanation: '',
      })),
      white: { accuracy: 100, moves: 4, counts: {} },
      black: { accuracy: 50, moves: 3, counts: {} },
    } as unknown as GameRecord['review'],
  };
}

const SCHOLARS: Puzzle = {
  id: 'e2eMate1',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  moves: ['g8f6', 'h5f7'],
  rating: 1500,
  themes: ['mateIn1'],
};

test.beforeEach(async ({ page }) => {
  const set: PuzzleSet = { source: 'e2e', builtAt: '2026-10-14', puzzles: [SCHOLARS] };
  await page.route('**/puzzles/puzzles.json', (route) => route.fulfill({ json: set }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('no reviewed games: My mistakes says to review games first', async ({ page }) => {
  await page.goto('/#/puzzles');
  await page.getByTestId('puzzle-mode-mistakes').click();
  await expect(page.getByTestId('mistakes-empty')).toContainText('Review your games first');
});

test('a mistake from a reviewed game is a puzzle; solving it schedules it and starts the streak', async ({ page }) => {
  await page.evaluate((g) => localStorage.setItem('rookery.games', JSON.stringify([g])), reviewedGame());
  await page.goto('/#/puzzles');
  await expect(page.getByTestId('training-streak')).toContainText('0');
  await expect(page.getByTestId('mistakes-due')).toHaveText('(1)');
  await page.getByTestId('puzzle-mode-mistakes').click();
  await expect(page.getByTestId('puzzle-source')).toContainText('From your game vs Bot 1100');
  await expect(page.getByTestId('puzzle-source')).toContainText('you played Nf6');
  // The bot's 3.Bc4 is the set-up move.
  await expect(pieceOn(page, 'c4', 'wB')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for Black' })).toBeVisible();
  await clickMove(page, 'g7g6');
  await expect(page.getByTestId('puzzle-feedback')).toHaveText('Solved!');
  await expect(page.getByTestId('puzzle-practice-note')).toHaveText('Solved first try: next review tomorrow');
  await expect(page.getByTestId('puzzle-rating')).toHaveText('1500?'); // unchanged
  await expect(page.getByTestId('training-streak')).toContainText('Trained today');
  await page.getByRole('button', { name: 'Done for today' }).click();
  await expect(page.getByTestId('mistakes-empty')).toContainText('All caught up');
});

test('the daily puzzle does not change the rating', async ({ page }) => {
  await page.goto('/#/puzzles');
  await page.getByTestId('puzzle-mode-daily').click();
  await expect(page.getByTestId('puzzle-source')).toContainText('Daily puzzle for');
  await expect(page.getByRole('heading', { name: 'Your turn: find the best move for White' })).toBeVisible();
  await clickMove(page, 'h5f7');
  await expect(page.getByTestId('puzzle-practice-note')).toHaveText('Daily puzzle solved');
  await expect(page.getByTestId('puzzle-rating')).toHaveText('1500?');
});
