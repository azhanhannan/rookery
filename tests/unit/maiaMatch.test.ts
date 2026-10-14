import { describe, expect, it } from 'vitest';
import type { MaiaPolicy } from '../../src/bots/maiaPlayer';
import { MAIA_MATCH, RATING } from '../../src/config/tunables';
import { legalUcis, type PolicyEntry } from '../../src/maia/encoding';
import {
  matchColors,
  matchCost,
  matchPlayer,
  matchPositions,
  peakElo,
  runMaiaMatch,
  summariseMatch,
  type MaiaFitPoint,
  type MatchPosition,
} from '../../src/rating/maiaMatch';
import { play } from './helpers';

/** 24 plies of a normal game: 12 non-forced moves for each side. */
const GAME = [
  'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5',
  'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c6a5', 'b3c2', 'c7c5', 'd2d4', 'd8c7', 'b1d2', 'c8d7',
];

/**
 * A fake model whose probability for the played move peaks at `target` (a Gaussian in Elo); the rest of the
 * probability goes to another legal move. Counts its calls.
 */
function fakeMaia(positions: MatchPosition[], target: number): MaiaPolicy & { calls: number } {
  const played = new Map(positions.map((p) => [p.fen, p.uci]));
  const fake = {
    calls: 0,
    async policy(fen: string, eloSelf: number) {
      fake.calls++;
      const uci = played.get(fen)!;
      const other = legalUcis(fen).find((u) => u !== uci)!;
      const p = 0.05 + 0.9 * Math.exp(-(((eloSelf - target) / 700) ** 2));
      const policy: PolicyEntry[] = [[uci, p], [other, 1 - p]];
      policy.sort((a, b) => b[1] - a[1]);
      return { policy, wdl: { win: 0.4, draw: 0.2, loss: 0.4 } };
    },
  };
  return fake;
}

describe('matchPositions', () => {
  it("lists one side's moves with the position before each", () => {
    const record = play(GAME);
    const white = matchPositions(record, 'w');
    const black = matchPositions(record, 'b');
    expect(white).toHaveLength(12);
    expect(black).toHaveLength(12);
    expect(white[0]).toEqual({ fen: record.startFen, uci: 'e2e4' });
    expect(black[0]).toEqual({ fen: record.moves[0].fenAfter, uci: 'e7e5' });
  });

  it('skips forced moves (only one legal move)', () => {
    // White's king on a8 is in check from the queen on c6; a7 is covered by the rook, so Kb8 is the only move.
    const start = 'K7/7r/2q5/8/8/8/8/7k w - - 0 1';
    expect(legalUcis(start)).toEqual(['a8b8']);
    const record = play(['a8b8', 'h1g1'], start);
    expect(matchPositions(record, 'w')).toHaveLength(0);
    expect(matchPositions(record, 'b')).toHaveLength(1);
  });

  it('matches only the people in the game', () => {
    const record = play(GAME);
    expect(matchColors(record)).toEqual(['w', 'b']);
    expect(matchColors({ ...record, black: { name: 'Maia 1200', isBot: true, elo: 1200, engine: 'maia' } })).toEqual(['w']);
  });
});

describe('peakElo', () => {
  const curve = (pts: [number, number][]): MaiaFitPoint[] => pts.map(([elo, avgLogLik]) => ({ elo, avgLogLik, top: 0.5 }));

  it('finds the vertex of a parabola between grid points', () => {
    // -((elo - 1500)/1000)^2 sampled at 1400, 1600, 1800.
    const f = (e: number): [number, number] => [e, -(((e - 1500) / 1000) ** 2)];
    expect(peakElo(curve([f(600), f(1400), f(1600), f(1800), f(2600)]))).toBeCloseTo(1500, 6);
  });

  it('returns the end point when the best fit is at an end', () => {
    expect(peakElo(curve([[600, -1], [1000, -1.2], [1400, -1.5]]))).toBe(600);
    expect(peakElo(curve([[2200, -1.5], [2600, -1]]))).toBe(2600);
  });
});

describe('summariseMatch', () => {
  const pts = (best: number): MaiaFitPoint[] =>
    [600, 1000, 1400, 1800, 2200, 2600].map((elo) => ({ elo, avgLogLik: -Math.abs(elo - best) / 1000, top: elo === best ? 0.6 : 0.3 }));

  it('a range of ±range around the peak, and the agreement at the nearest rating', () => {
    const m = summariseMatch(pts(1400), 30);
    expect(m).toMatchObject({ kind: 'estimate', rating: 1400, low: 1400 - MAIA_MATCH.range, high: 1400 + MAIA_MATCH.range, edge: null, agreement: 0.6 });
  });

  it('wider for short games, none below minMoves', () => {
    const m = summariseMatch(pts(1400), RATING.shortGameMoves - 1);
    expect(m).toMatchObject({ low: 1400 - MAIA_MATCH.shortGameRange, high: 1400 + MAIA_MATCH.shortGameRange });
    expect(summariseMatch(pts(1400), RATING.minMoves - 1)).toEqual({ kind: 'not-enough-moves', moves: RATING.minMoves - 1 });
  });

  it('flags a best fit at the ends of the model', () => {
    expect(summariseMatch(pts(600), 30)).toMatchObject({ edge: 'low' });
    expect(summariseMatch(pts(2600), 30)).toMatchObject({ edge: 'high' });
  });
});

describe('matchPlayer', () => {
  it.each([800, 1500, 2300])('recovers a player whose moves fit Maia %i best', async (target) => {
    const positions = matchPositions(play(GAME), 'w');
    const maia = fakeMaia(positions, target);
    const m = await matchPlayer(maia, positions);
    expect(m.kind).toBe('estimate');
    if (m.kind !== 'estimate') return;
    expect(Math.abs(m.rating - target)).toBeLessThanOrEqual(100);
    // Coarse pass plus two refinements, each over every position.
    expect(maia.calls).toBeLessThanOrEqual(matchCost(positions.length));
    expect(m.curve.length).toBe(maia.calls / positions.length);
  });

  it('stops when cancelled', async () => {
    const positions = matchPositions(play(GAME), 'w');
    const ctrl = new AbortController();
    const maia = fakeMaia(positions, 1500);
    const run = matchPlayer(maia, positions, { signal: ctrl.signal, onStep: () => maia.calls === 5 && ctrl.abort() });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(maia.calls).toBe(5);
  });
});

describe('runMaiaMatch', () => {
  it('matches both people, reporting progress up to the total', async () => {
    const record = play(GAME);
    const all = [...matchPositions(record, 'w'), ...matchPositions(record, 'b')];
    const maia = fakeMaia(all, 1200);
    const seen: number[] = [];
    const match = await runMaiaMatch(maia, record, { onProgress: (p) => seen.push(p.done / p.total) });
    expect(match.white?.kind).toBe('estimate');
    expect(match.black?.kind).toBe('estimate');
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('leaves a bot side out', async () => {
    const record = { ...play(GAME), black: { name: 'Bot', isBot: true, elo: 1200 } };
    const match = await runMaiaMatch(fakeMaia(matchPositions(record, 'w'), 1200), record);
    expect(match.black).toBeUndefined();
    expect(match.white?.kind).toBe('estimate');
  });
});
