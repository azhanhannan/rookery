import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { chooseMove, thinkTime } from '../../src/bots/botPlayer';
import { adjacentLevel, levelFor, levelLabel, suggestNextLevel } from '../../src/bots/botLevels';
import { BOT_LEVELS, MAX_LEVEL_LABEL } from '../../src/config/tunables';
import type { BotLevel } from '../../src/engine/types';
import { FakeEngine, line, seq } from './fakeEngine';

// White: Ra8# available. Black: ...Ra1# available.
const WHITE_MATE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
const BLACK_MATE = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';
const PROMO = '8/P7/8/8/8/8/k7/6K1 w - - 0 1';

const level = (elo: number) => BOT_LEVELS.find((l) => l.elo === elo)!;
const legal = (fen: string) => new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));

// Mate sits at rank 2 so "take the top line" and "take the mate" give different answers.
function whiteMateEngine() {
  const e = new FakeEngine();
  e.lines = [line(1, 'a1a2', { cp: 50 }), line(2, 'a1a8', { mate: 1 }), line(3, 'g1f1', { cp: 0 })];
  return e;
}

describe('weakened mode (Mode B)', () => {
  it('takes a mate-in-1 at 800 even when the rolls would pick another move', async () => {
    const e = whiteMateEngine();
    expect(await chooseMove(e, WHITE_MATE, level(800), seq(0.99, 0))).toBe('a1a8');
    expect(e.setOptions).toEqual([['UCI_LimitStrength', false]]);
    expect(e.analyzeCalls[0][1]).toEqual({ depth: 3, multiPV: 4 });
  });

  it('does not force the mate below 800', async () => {
    expect(await chooseMove(whiteMateEngine(), WHITE_MATE, level(600), seq(0.99, 0))).toBe('a1a2');
  });

  it('detects mate-in-1 for Black with mate === -1, and ignores mate === 1', async () => {
    const e = new FakeEngine();
    e.lines = [line(1, 'a8a2', { cp: -50 }), line(2, 'a8a1', { mate: -1 })];
    expect(await chooseMove(e, BLACK_MATE, level(1000), seq(0.99, 0))).toBe('a8a1');

    const wrongSign = new FakeEngine();
    wrongSign.lines = [line(1, 'a8a2', { cp: -50 }), line(2, 'a8a1', { mate: 1 })];
    expect(await chooseMove(wrongSign, BLACK_MATE, level(1000), seq(0.99, 0))).toBe('a8a2');
  });

  it('blunder path returns a legal move', async () => {
    for (const r of [0, 0.37, 0.999]) {
      const move = await chooseMove(whiteMateEngine(), WHITE_MATE, level(400), seq(0, r));
      expect(legal(WHITE_MATE)).toContain(move);
    }
  });

  it('pBest path returns line 1', async () => {
    expect(await chooseMove(whiteMateEngine(), WHITE_MATE, level(400), seq(0.99, 0.29))).toBe('a1a2');
  });

  it('non-best path only returns lines 2..k, weighted toward line 2', async () => {
    const lines = [line(1, 'a1a2', { cp: 50 }), line(2, 'a1a3', { cp: 40 }), line(3, 'a1a4', { cp: 30 }), line(4, 'g1f1', { cp: 0 })];
    const seen = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const e = new FakeEngine();
      e.lines = lines;
      const move = await chooseMove(e, WHITE_MATE, level(400), seq(0.99, 0.99, i / 100));
      seen.set(move, (seen.get(move) ?? 0) + 1);
    }
    expect(seen.has('a1a2')).toBe(false);
    expect([...seen.keys()].sort()).toEqual(['a1a3', 'a1a4', 'g1f1']);
    expect(seen.get('a1a3')!).toBeGreaterThan(seen.get('a1a4')!);
    expect(seen.get('a1a4')!).toBeGreaterThan(seen.get('g1f1')!);
  });

  it('works with fewer lines than asked, and throws on none', async () => {
    const e = new FakeEngine();
    e.lines = [line(1, 'g1f1', { cp: 0 })];
    expect(await chooseMove(e, WHITE_MATE, level(400), seq(0.99, 0.99))).toBe('g1f1');

    const empty = new FakeEngine();
    await expect(chooseMove(empty, WHITE_MATE, level(400), seq(0.99, 0.99))).rejects.toThrow();
  });

  it('skips an illegal top line, and plays a random legal move when no line is legal', async () => {
    const e = new FakeEngine();
    e.lines = [line(1, 'e2e5', { cp: 900 }), line(2, 'g1f1', { cp: 0 })];
    expect(await chooseMove(e, WHITE_MATE, level(400), seq(0.99, 0))).toBe('g1f1');

    const garbage = new FakeEngine();
    garbage.lines = [line(1, 'e2e5', { cp: 900 }), line(2, 'zzzz', { cp: 0 })];
    expect(legal(WHITE_MATE)).toContain(await chooseMove(garbage, WHITE_MATE, level(400), seq(0.5)));
  });

  it('requires the promotion letter', async () => {
    const e = new FakeEngine();
    e.lines = [line(1, 'a7a8q', { cp: 900 })];
    expect(await chooseMove(e, PROMO, level(1200), seq(0.99, 0))).toBe('a7a8q');

    const bare = new FakeEngine();
    bare.lines = [line(1, 'a7a8', { cp: 900 })];
    const move = await chooseMove(bare, PROMO, level(1200), seq(0.5));
    expect(move).not.toBe('a7a8');
    expect(legal(PROMO)).toContain(move);
  });
});

describe('limit and full modes', () => {
  const limit = (elo: number): BotLevel => ({ elo, mode: 'limit', multiPV: 1, thinkMs: [1000, 3000] });

  it('limit mode sets UCI_Elo and plays with goMovetime', async () => {
    const e = new FakeEngine();
    e.bestMove = 'g1f1';
    expect(await chooseMove(e, WHITE_MATE, limit(1400), seq(0.5))).toBe('g1f1');
    expect(e.setOptions).toEqual([['UCI_LimitStrength', true], ['UCI_Elo', 1400]]);
    expect(e.movetimeCalls).toEqual([[WHITE_MATE, 2000]]);
    expect(e.analyzeCalls).toEqual([]);
  });

  it('clamps UCI_Elo to eloRange at both ends, and does not clamp without a range', async () => {
    const low = new FakeEngine();
    low.bestMove = 'g1f1';
    await chooseMove(low, WHITE_MATE, limit(1000), seq(0));
    expect(low.setOptions).toContainEqual(['UCI_Elo', 1320]);

    const high = new FakeEngine();
    high.bestMove = 'g1f1';
    await chooseMove(high, WHITE_MATE, limit(4000), seq(0));
    expect(high.setOptions).toContainEqual(['UCI_Elo', 3190]);

    const none = new FakeEngine();
    none.range = null;
    none.bestMove = 'g1f1';
    await chooseMove(none, WHITE_MATE, limit(4000), seq(0));
    expect(none.setOptions).toContainEqual(['UCI_Elo', 4000]);
  });

  it('full mode turns the limit off', async () => {
    const e = new FakeEngine();
    e.bestMove = 'a1a8';
    expect(await chooseMove(e, WHITE_MATE, level(3200), seq(0.5))).toBe('a1a8');
    expect(e.setOptions).toEqual([['UCI_LimitStrength', false]]);
    expect(e.movetimeCalls).toEqual([[WHITE_MATE, 2000]]);
  });

  it('falls back to a legal move when goMovetime returns an illegal one', async () => {
    const e = new FakeEngine();
    e.bestMove = 'e2e4';
    expect(legal(WHITE_MATE)).toContain(await chooseMove(e, WHITE_MATE, limit(2000), seq(0, 0.5)));
  });

  // The engine dedupes options (EngineService); the bot must always state the strength it wants,
  // because an eval-bar analysis in between turns the limit off.
  it('states its strength options before every move', async () => {
    const e = new FakeEngine();
    e.bestMove = 'g1f1';
    e.lines = [line(1, 'g1f1', { cp: 0 })];
    await chooseMove(e, WHITE_MATE, limit(1400), seq(0));
    await chooseMove(e, WHITE_MATE, limit(1400), seq(0));
    expect(e.setOptions).toEqual([
      ['UCI_LimitStrength', true], ['UCI_Elo', 1400],
      ['UCI_LimitStrength', true], ['UCI_Elo', 1400],
    ]);
    await chooseMove(e, WHITE_MATE, level(3200), seq(0));
    expect(e.setOptions.at(-1)).toEqual(['UCI_LimitStrength', false]);
  });
});

describe('thinkTime', () => {
  it('stays inside the level range', () => {
    expect(thinkTime(level(800), () => 0)).toBe(800);
    expect(thinkTime(level(800), () => 0.5)).toBe(1400);
    expect(thinkTime(level(3200), () => 0.7)).toBe(2000);
  });
});

describe('botLevels', () => {
  it('levelFor returns the exact level, else the nearest', () => {
    expect(levelFor(800)).toBe(level(800));
    expect(levelFor(1290)).toBe(level(1200));
    expect(levelFor(1350)).toBe(level(1400));
    expect(levelFor(0)).toBe(BOT_LEVELS[0]);
    expect(levelFor(9999)).toBe(BOT_LEVELS[BOT_LEVELS.length - 1]);
  });

  it('levelLabel shows the Elo, or the max label for full strength', () => {
    expect(levelLabel(level(400))).toBe('400');
    expect(levelLabel(level(2000))).toBe('2000');
    expect(levelLabel(level(3200))).toBe(MAX_LEVEL_LABEL);
  });

  it('adjacentLevel steps and clamps at both ends', () => {
    expect(adjacentLevel(1200, 1).elo).toBe(1400);
    expect(adjacentLevel(1400, -1).elo).toBe(1200);
    expect(adjacentLevel(1000, 0).elo).toBe(1000);
    expect(adjacentLevel(400, -1).elo).toBe(400);
    expect(adjacentLevel(3200, 1).elo).toBe(3200);
  });

  it('suggestNextLevel moves up on a win, down on a loss, stays on a draw', () => {
    expect(suggestNextLevel(800, 'win').elo).toBe(1000);
    expect(suggestNextLevel(800, 'loss').elo).toBe(600);
    expect(suggestNextLevel(800, 'draw').elo).toBe(800);
    expect(suggestNextLevel(3200, 'win').elo).toBe(3200);
    expect(suggestNextLevel(400, 'loss').elo).toBe(400);
  });
});
