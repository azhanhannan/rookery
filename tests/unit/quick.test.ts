import { beforeEach, describe, expect, it } from 'vitest';
import { pickAccountRating } from '../../src/account/accountRating';
import type { RatingRow } from '../../src/api/types';
import { findTimeControl } from '../../src/game/clock';
import { loadCushionDismissed, lossStreak, saveCushionDismissed, shouldCushion } from '../../src/game/lossStreak';
import { fenFromSetup, setupFromFen } from '../../src/game/positionSetup';
import { canQueue, resolvePremove } from '../../src/game/premove';
import { START_FEN } from '../../src/game/rules';
import { sparringOpponent, timeControlLabel } from '../../src/game/sparring';
import type { GameRecord, GameResult } from '../../src/game/types';
import { accuracyNote, accuracyNotesFor, bandForAccuracy, typicalAccuracy } from '../../src/review/accuracyBand';
import { loadTimedBest, miss, nextRating, remainingMs, saveTimedBest, solve, startRun, tick } from '../../src/puzzles/timedRun';

describe('sparring opponent', () => {
  it('is the nearest Maia level strictly above the rating', () => {
    expect(sparringOpponent(1150)).toEqual({ engine: 'maia', elo: 1200, name: 'Maia 1200' });
    expect(sparringOpponent(1200)).toMatchObject({ engine: 'maia', elo: 1400 });
    expect(sparringOpponent(300)).toMatchObject({ engine: 'maia', elo: 600 });
  });

  it('defaults to 1200 when the rating is unknown', () => {
    expect(sparringOpponent(null)).toMatchObject({ engine: 'maia', elo: 1400 });
    expect(sparringOpponent(Number.NaN)).toMatchObject({ engine: 'maia', elo: 1400 });
  });

  it('falls back to the engine bot above the Maia range or when Maia is unavailable', () => {
    expect(sparringOpponent(2650)).toEqual({ engine: 'stockfish', elo: 2800, name: 'Bot 2800' });
    expect(sparringOpponent(1150, false)).toEqual({ engine: 'stockfish', elo: 1200, name: 'Bot 1200' });
    expect(sparringOpponent(5000)).toEqual({ engine: 'stockfish', elo: 3200, name: 'Bot Max' });
  });

  it('labels and clocks the 10+5 time control', () => {
    expect(timeControlLabel('600+5')).toBe('10+5');
    const tc = findTimeControl('600+5');
    expect(tc).toMatchObject({ id: '600+5', baseMs: 600_000, incMs: 5_000 });
    expect(findTimeControl('180+2')?.label).toBe('3+2');
    expect(findTimeControl('unlimited')).toBeUndefined();
    expect(findTimeControl('0+0')).toBeUndefined();
  });
});

function game(id: string, result: GameResult, opts: { bot?: 'w' | 'b' | null; engine?: 'maia' } = {}): GameRecord {
  const bot = opts.bot === undefined ? 'b' : opts.bot;
  const botInfo = { name: 'Bot 800', isBot: true, elo: 800, ...(opts.engine ? { engine: opts.engine } : {}) };
  const human = { name: 'You', isBot: false };
  return {
    id,
    startFen: START_FEN,
    moves: [],
    white: bot === 'w' ? botInfo : human,
    black: bot === 'b' ? botInfo : human,
    result,
    createdAt: '2026-10-16T00:00:00Z',
  };
}

describe('losing streak', () => {
  beforeEach(() => localStorage.clear());

  it('counts losses against bots in a row, newest first, skipping games between people', () => {
    const history = [
      game('g5', '0-1'), // bot is Black and won
      game('g4', '1-0', { bot: null }), // friend game: skipped
      game('g3', '1-0', { bot: 'w' }),
      game('g2', '0-1'),
      game('g1', '1-0'), // a win ends the streak
      game('g0', '0-1'),
    ];
    const s = lossStreak(history);
    expect(s.count).toBe(3);
    expect(s.startId).toBe('g2');
    expect(s.lastBot?.elo).toBe(800);
  });

  it('a draw or an unfinished game at the top: no streak', () => {
    expect(lossStreak([game('a', '1/2-1/2'), game('b', '0-1')]).count).toBe(0);
    expect(lossStreak([]).count).toBe(0);
  });

  it('shows at the threshold until that streak is dismissed', () => {
    const three = lossStreak([game('c', '0-1'), game('b', '0-1'), game('a', '0-1')]);
    expect(shouldCushion(three, null)).toBe(true);
    expect(shouldCushion(three, null, 4)).toBe(false);
    saveCushionDismissed('a');
    expect(loadCushionDismissed()).toBe('a');
    expect(shouldCushion(three, loadCushionDismissed())).toBe(false);
    // The same streak growing stays dismissed; a new streak (new first loss) shows again.
    const four = lossStreak([game('d', '0-1'), game('c', '0-1'), game('b', '0-1'), game('a', '0-1')]);
    expect(shouldCushion(four, 'a')).toBe(false);
    const fresh = lossStreak([game('g', '0-1'), game('f', '0-1'), game('e', '0-1'), game('d', '1-0')]);
    expect(shouldCushion(fresh, 'a')).toBe(true);
  });
});

describe('accuracy bands', () => {
  it('interpolates typical accuracy and clamps at the ends', () => {
    expect(typicalAccuracy(600)).toBe(62);
    expect(typicalAccuracy(700)).toBeCloseTo(64.5);
    expect(typicalAccuracy(100)).toBe(55);
    expect(typicalAccuracy(3000)).toBe(92);
  });

  it('finds the band an accuracy is typical for', () => {
    expect(bandForAccuracy(62)).toBe(600);
    expect(bandForAccuracy(30)).toBe(400);
    expect(bandForAccuracy(99)).toBe(2500);
  });

  it('words it against the player rating when known', () => {
    expect(accuracyNote(62.4, null)).toBe('Typical for ~600');
    expect(accuracyNote(85, 1000)).toBe('Strong for your level');
    expect(accuracyNote(72, 1000)).toBe('About your level');
    expect(accuracyNote(50, 1000)).toBe('A tough game for your level');
    expect(accuracyNote(null, 1000)).toBeNull();
  });

  it('notes the player side against their rating, other people by band, bots not at all', () => {
    const vsBot = game('x', '0-1');
    expect(accuracyNotesFor(vsBot, { w: 85, b: 90 }, 1000)).toEqual({ w: 'Strong for your level', b: null });
    const imported = { ...game('y', '1-0', { bot: null }), userColor: 'b' as const };
    expect(accuracyNotesFor(imported, { w: 62, b: 72 }, 1000)).toEqual({ w: 'Typical for ~600', b: 'About your level' });
  });
});

describe('timed puzzle run', () => {
  beforeEach(() => localStorage.clear());
  const cfg = { durationMs: 180_000, missPenaltyMs: 10_000, maxMisses: 3, startRating: 600, step: 50 };

  it('counts down, and a miss costs time', () => {
    let run = startRun(0);
    expect(remainingMs(run, 1_000, cfg)).toBe(179_000);
    run = miss(run, 1_000, cfg);
    expect(run.misses).toBe(1);
    expect(remainingMs(run, 1_000, cfg)).toBe(169_000);
  });

  it('climbs from the start rating with every puzzle tried', () => {
    let run = startRun(0);
    expect(nextRating(run, cfg)).toBe(600);
    run = solve(run, 10, cfg);
    run = miss(run, 20, cfg);
    expect(run.solved).toBe(1);
    expect(nextRating(run, cfg)).toBe(700);
  });

  it('ends on the third miss', () => {
    let run = startRun(0);
    run = miss(miss(run, 1, cfg), 2, cfg);
    expect(run.status).toBe('running');
    run = miss(run, 3, cfg);
    expect(run).toMatchObject({ status: 'over', endedBy: 'misses', misses: 3 });
    // Over is final: more results change nothing, and the clock stops.
    expect(solve(run, 4, cfg)).toBe(run);
    expect(remainingMs(run, 100_000, cfg)).toBe(remainingMs(run, 3, cfg));
  });

  it('ends when time runs out, and a late solve does not count', () => {
    let run = solve(startRun(0), 1_000, cfg);
    expect(tick(run, 100_000, cfg).status).toBe('running');
    run = solve(run, 180_000, cfg);
    expect(run).toMatchObject({ status: 'over', endedBy: 'time', solved: 1 });
    // Penalties can end it early.
    const penalised = miss(miss(startRun(0), 0, cfg), 0, cfg);
    expect(tick(penalised, 160_000, cfg).status).toBe('over');
  });

  it('keeps the best score per device', () => {
    expect(loadTimedBest()).toBe(0);
    expect(saveTimedBest(5)).toBe(true);
    expect(saveTimedBest(3)).toBe(false);
    expect(loadTimedBest()).toBe(5);
    expect(localStorage.getItem('rookery.timedBest')).toBe('5');
  });
});

describe('premove resolution', () => {
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('queues only the player own pieces', () => {
    expect(canQueue(afterE4, 'w', 'g1', 'f3')).toBe(true);
    expect(canQueue(afterE4, 'w', 'e7', 'e5')).toBe(false);
    expect(canQueue(afterE4, 'w', 'e3', 'e4')).toBe(false);
    expect(canQueue(afterE4, 'w', 'g1', 'g1')).toBe(false);
  });

  it('plays the premove when legal on the player turn, else cancels', () => {
    const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(resolvePremove(afterE5, 'w', { from: 'g1', to: 'f3' })).toEqual({ from: 'g1', to: 'f3' });
    // The pawn is now blocked.
    expect(resolvePremove(afterE5, 'w', { from: 'e4', to: 'e5' })).toBeNull();
    // Still the opponent's turn.
    expect(resolvePremove(afterE4, 'w', { from: 'g1', to: 'f3' })).toBeNull();
  });

  it('promotes to a queen', () => {
    const fen = '7k/P7/8/8/8/8/8/K7 w - - 0 1';
    expect(resolvePremove(fen, 'w', { from: 'a7', to: 'a8' })).toEqual({ from: 'a7', to: 'a8', promotion: 'q' });
  });
});

describe('position editor move number', () => {
  it('keeps the FEN full-move number and writes it back', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 23';
    expect(setupFromFen(fen).fullmove).toBe(23);
    expect(fenFromSetup(setupFromFen(fen))).toBe(fen);
    expect(fenFromSetup({ ...setupFromFen(START_FEN), fullmove: 0 })).toBe(START_FEN);
    expect(fenFromSetup({ ...setupFromFen(START_FEN), fullmove: undefined })).toBe(START_FEN);
  });
});

describe('account rating', () => {
  const row = (category: RatingRow['category'], rating: number, games: number): RatingRow => ({
    category,
    rating,
    rd: 80,
    games,
    provisional: false,
  });

  it('uses the category asked for, else the one with the most games', () => {
    const rows = [row('blitz', 1300, 20), row('rapid', 1450, 5)];
    expect(pickAccountRating(rows, 'rapid')).toBe(1450);
    expect(pickAccountRating(rows, 'bullet')).toBe(1300);
    expect(pickAccountRating(rows)).toBe(1300);
    expect(pickAccountRating([], 'rapid')).toBeNull();
    expect(pickAccountRating(null)).toBeNull();
  });
});
