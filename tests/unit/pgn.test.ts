import { describe, expect, it } from 'vitest';
import { fromPgn, toPgn } from '../../src/game/pgn';
import { endRecord, resignationEnd } from '../../src/game/rules';
import type { GameRecord } from '../../src/game/types';
import { FOOLS_MATE, play, SPECIAL_MOVES_GAME } from './helpers';

function sameGame(a: GameRecord, b: GameRecord) {
  expect(b.startFen).toBe(a.startFen);
  expect(b.moves.map((m) => [m.san, m.uci, m.fenAfter])).toEqual(a.moves.map((m) => [m.san, m.uci, m.fenAfter]));
  expect(b.result).toBe(a.result);
  expect(b.termination).toBe(a.termination);
}

describe('PGN round trip', () => {
  it('finished game: same moves and result', () => {
    const g = play(FOOLS_MATE);
    sameGame(g, fromPgn(toPgn(g)));
  });

  it('castling, en passant, promotion; resigned', () => {
    const g = endRecord(play(SPECIAL_MOVES_GAME), resignationEnd('b'));
    const pgn = toPgn(g);
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('cxd8=Q+');
    expect(pgn).toContain('O-O');
    sameGame(g, fromPgn(pgn));
  });

  it('game in progress keeps result *', () => {
    const g = play(['e2e4', 'e7e5']);
    const back = fromPgn(toPgn(g));
    sameGame(g, back);
    expect(back.result).toBe('*');
  });

  it('game from a set-up position', () => {
    const g = play(['f2f7'], '7k/8/6K1/8/8/8/5Q2/8 w - - 0 1');
    const pgn = toPgn(g);
    expect(pgn).toContain('[SetUp "1"]');
    sameGame(g, fromPgn(pgn));
  });

  it('writes the spec headers, including Elo when known', () => {
    const g = {
      ...play(['e2e4']),
      white: { name: 'Ana', isBot: false, elo: 1500 },
      black: { name: 'Bot', isBot: true },
    };
    const pgn = toPgn(g);
    for (const tag of ['Event', 'Date', 'White', 'Black', 'Result']) expect(pgn).toContain(`[${tag} `);
    expect(pgn).toContain('[WhiteElo "1500"]');
    expect(pgn).not.toContain('BlackElo');
    expect(fromPgn(pgn).white).toEqual({ name: 'Ana', isBot: false, elo: 1500 });
  });

  it('keeps clock times as %clk comments', () => {
    const g = play(['e2e4', 'e7e5']);
    g.moves[0].clockMs = 180_000;
    g.moves[1].clockMs = 177_000;
    const pgn = toPgn(g);
    expect(pgn).toContain('[%clk 0:03:00]');
    expect(fromPgn(pgn).moves.map((m) => m.clockMs)).toEqual([180_000, 177_000]);
  });

  it('imports a PGN pasted from elsewhere, with comments and no headers', () => {
    const g = fromPgn('1. e4 {good} e5 2. Nf3 Nc6 3. Bb5 a6 *');
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(g.result).toBe('*');
  });

  it('rejects invalid PGN with a readable error', () => {
    expect(() => fromPgn('1. e4 e5 2. Ke3 Qh4')).toThrow(/Couldn't read that PGN/);
  });
});
