import { Glicko2 } from 'glicko2';
import { describe, expect, it } from 'vitest';
import { RATINGS } from '../../src/config/tunables';
import type { GameRecord, PlayerInfo } from '../../src/game/types';
import {
  categoryFor,
  initialRating,
  isProvisional,
  rateGame,
  ratedCategoryFor,
  ratingIneligibleReason,
  scoreFor,
} from '../../src/rating/glicko';
import { FOOLS_MATE, play } from './helpers';

const you: PlayerInfo = { name: 'You', isBot: false };
const bot = (elo: number): PlayerInfo => ({ name: `Bot ${elo}`, isBot: true, elo });

/** A finished blitz game where the player (White) beat an 800 bot after 3 moves each. */
function ratedGame(over: Partial<GameRecord> = {}): GameRecord {
  const base = play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
  return { ...base, white: you, black: bot(800), result: '1-0', termination: 'resignation', timeControl: '180+2', ...over };
}

describe('Glicko-2 wiring', () => {
  it("matches Glickman's worked example (1500/200 vs 1400/30 W, 1550/100 L, 1700/300 L, tau 0.5)", () => {
    const system = new Glicko2({ tau: 0.5 });
    const p = system.makePlayer(1500, 200, 0.06);
    const a = system.makePlayer(1400, 30, 0.06);
    const b = system.makePlayer(1550, 100, 0.06);
    const c = system.makePlayer(1700, 300, 0.06);
    system.updateRatings([[p, a, 1], [p, b, 0], [p, c, 0]]);
    expect(p.getRating()).toBeCloseTo(1464.06, 1);
    expect(p.getRd()).toBeCloseTo(151.52, 1);
    expect(p.getVol()).toBeCloseTo(0.05999, 4);
  });

  it('rateGame uses RATINGS.tau and matches the library for a single game', () => {
    expect(RATINGS.tau).toBe(0.5);
    const system = new Glicko2({ tau: RATINGS.tau });
    const p = system.makePlayer(1500, 200, 0.06);
    const o = system.makePlayer(1400, 30, 0.06);
    system.updateRatings([[p, o, 1]]);
    const got = rateGame({ rating: 1500, rd: 200, volatility: 0.06 }, { rating: 1400, rd: 30 }, 1);
    expect(got.rating).toBeCloseTo(p.getRating(), 9);
    expect(got.rd).toBeCloseTo(p.getRd(), 9);
    expect(got.volatility).toBeCloseTo(p.getVol(), 9);
  });
});

describe('rateGame', () => {
  const botAt = (rating: number) => ({ rating, rd: RATINGS.botRd });

  it('a new player beating an equal bot gains a lot; beating a much weaker bot gains little', () => {
    const equal = rateGame(initialRating(), botAt(1500), 1);
    const weak = rateGame(initialRating(), botAt(400), 1);
    expect(equal.rating - 1500).toBeGreaterThan(150);
    expect(weak.rating - 1500).toBeGreaterThan(0);
    expect(weak.rating - 1500).toBeLessThan(10);
  });

  it('losing loses rating, a draw against an equal opponent barely moves it', () => {
    expect(rateGame(initialRating(), botAt(1500), 0).rating).toBeLessThan(1350);
    expect(Math.abs(rateGame(initialRating(), botAt(1500), 0.5).rating - 1500)).toBeLessThan(1);
  });

  it('RD shrinks after a game, and an established player moves less', () => {
    const after = rateGame(initialRating(), botAt(1500), 1);
    expect(after.rd).toBeLessThan(RATINGS.start.rd);
    const settled = rateGame({ rating: 1500, rd: 60, volatility: 0.06 }, botAt(1500), 1);
    expect(settled.rating - 1500).toBeLessThan((after.rating - 1500) / 4);
  });

  it('does not mutate its inputs', () => {
    const start = initialRating();
    rateGame(start, botAt(1500), 1);
    expect(start).toEqual(RATINGS.start);
  });

  it('the 3200 Max level counts as Elo 3200', () => {
    expect(ratingIneligibleReason(ratedGame({ black: bot(3200) }), 'w')).toBeNull();
    expect(rateGame(initialRating(), botAt(3200), 0).rating).toBeGreaterThan(1490);
  });
});

describe('isProvisional', () => {
  it('is true above RATINGS.provisionalRd only', () => {
    expect(isProvisional(RATINGS.start.rd)).toBe(true);
    expect(isProvisional(RATINGS.provisionalRd + 0.1)).toBe(true);
    expect(isProvisional(RATINGS.provisionalRd)).toBe(false);
    expect(isProvisional(60)).toBe(false);
  });

  it('a new player stays provisional after one game and settles after many', () => {
    let s = initialRating();
    s = rateGame(s, { rating: 1500, rd: RATINGS.botRd }, 1);
    expect(isProvisional(s.rd)).toBe(true);
    for (let i = 0; i < 30; i++) s = rateGame(s, { rating: 1500, rd: RATINGS.botRd }, i % 2);
    expect(isProvisional(s.rd)).toBe(false);
  });
});

describe('scoreFor', () => {
  it('scores each result from each side', () => {
    expect(scoreFor('1-0', 'w')).toBe(1);
    expect(scoreFor('1-0', 'b')).toBe(0);
    expect(scoreFor('0-1', 'w')).toBe(0);
    expect(scoreFor('0-1', 'b')).toBe(1);
    expect(scoreFor('1/2-1/2', 'w')).toBe(0.5);
    expect(scoreFor('1/2-1/2', 'b')).toBe(0.5);
    expect(() => scoreFor('*', 'w')).toThrow();
  });
});

describe('categoryFor (base + 40 x increment seconds)', () => {
  it.each([
    ['60+0', 'bullet'],
    ['179+0', 'bullet'],
    ['120+1', 'bullet'], // 160
    ['180+0', 'blitz'],
    ['180+2', 'blitz'], // 260
    ['479+0', 'blitz'],
    ['300+4', 'blitz'], // 460
    ['480+0', 'rapid'],
    ['600+0', 'rapid'],
    ['900+10', 'rapid'], // 1300
    ['1499+0', 'rapid'],
    ['1500+0', 'classical'],
    ['1800+0', 'classical'],
    ['0+1', 'bullet'], // 40
  ] as const)('%s -> %s', (tc, category) => {
    expect(categoryFor(tc)).toBe(category);
  });

  it.each([undefined, 'unlimited', '', '0+0', 'abc', '180', '180+', '+2', '-60+0', '1.5+0', '180+2 '])('%s -> null', (tc) => {
    expect(categoryFor(tc)).toBeNull();
  });

  it('ratedCategoryFor matches categoryFor while untimed games are not rated', () => {
    expect(RATINGS.rateUntimed).toBe(false);
    expect(ratedCategoryFor(undefined)).toBeNull();
    expect(ratedCategoryFor('180+2')).toBe('blitz');
  });
});

describe('ratingIneligibleReason', () => {
  it('a finished, timed, standard game against a known bot qualifies, from either side', () => {
    expect(ratingIneligibleReason(ratedGame(), 'w')).toBeNull();
    expect(ratingIneligibleReason(ratedGame({ white: bot(1200), black: you, result: '0-1' }), 'b')).toBeNull();
  });

  it('needs the player to have a side', () => {
    expect(ratingIneligibleReason(ratedGame(), null)).toMatch(/two people/);
  });

  it('needs the opponent to be a bot at a known level', () => {
    expect(ratingIneligibleReason(ratedGame({ black: { name: 'Friend', isBot: false } }), 'w')).toMatch(/against a bot/);
    expect(ratingIneligibleReason(ratedGame({ black: bot(1234) }), 'w')).toMatch(/unknown bot level/);
    expect(ratingIneligibleReason(ratedGame({ black: { name: 'Bot', isBot: true } }), 'w')).toMatch(/unknown bot level/);
  });

  it("the player's own side must not be a bot", () => {
    expect(ratingIneligibleReason(ratedGame({ white: bot(800) }), 'w')).toMatch(/played by a bot/);
  });

  it('needs the standard start position', () => {
    const custom = ratedGame({ startFen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1' });
    expect(ratingIneligibleReason(custom, 'w')).toMatch(/custom position/);
  });

  it('needs a finished result', () => {
    expect(ratingIneligibleReason(ratedGame({ result: '*' }), 'w')).toMatch(/Unfinished/);
  });

  it('needs a time control with a category', () => {
    expect(ratingIneligibleReason(ratedGame({ timeControl: undefined }), 'w')).toBe('Untimed games are not rated');
    expect(ratingIneligibleReason(ratedGame({ timeControl: 'unlimited' }), 'w')).toBe('Untimed games are not rated');
    expect(ratingIneligibleReason(ratedGame({ timeControl: 'soon' }), 'w')).toMatch(/unknown time control/);
  });

  it('needs RATINGS.minMovesToRate moves by the player', () => {
    expect(RATINGS.minMovesToRate).toBe(2);
    const oneEach = { ...play(['e2e4', 'e7e5']), white: you, black: bot(800), result: '0-1' as const, timeControl: '180+2' };
    expect(ratingIneligibleReason(oneEach, 'w')).toMatch(/fewer than 2 moves/);
    // Black has made only one move after White's second.
    const threePly = { ...play(['e2e4', 'e7e5', 'g1f3']), white: bot(800), black: you, result: '1-0' as const, timeControl: '180+2' };
    expect(ratingIneligibleReason(threePly, 'b')).toMatch(/fewer than 2 moves/);
    // Fool's mate: White (the player) made two moves and lost; that still counts.
    const mated = { ...play(FOOLS_MATE), white: you, black: bot(800), timeControl: '180+2' };
    expect(ratingIneligibleReason(mated, 'w')).toBeNull();
  });
});
