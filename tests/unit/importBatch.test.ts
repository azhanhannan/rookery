import { describe, expect, it } from 'vitest';
import {
  colorOfPlayer,
  gameKey,
  gameLabel,
  guessPlayerName,
  isLichessUsername,
  lichessGamesUrl,
  prepareGame,
} from '../../src/game/importBatch';
import type { GameRecord } from '../../src/game/types';

const LICHESS = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2026.10.14"]
[White "Hannan"]
[Black "opponent99"]
[Result "0-1"]
[UTCDate "2026.10.14"]
[UTCTime "13:45:10"]
[WhiteElo "1500"]
[BlackElo "1520"]
[Variant "Standard"]
[TimeControl "180+2"]
[ECO "C20"]
[Opening "King's Pawn Game"]

1. f3 { [%clk 0:03:00] } 1... e5 { [%clk 0:03:00] } 2. g4 { [%clk 0:02:59] } 2... Qh4# { [%clk 0:02:58] } 0-1`;

function ok(text: string, player?: string): GameRecord {
  const res = prepareGame(text, player);
  if (!res.ok) throw new Error(res.reason);
  return res.record;
}

describe('prepareGame', () => {
  it('makes a finished record with the UTC start time and the player side', () => {
    const r = ok(LICHESS, 'hannan');
    expect(r.result).toBe('0-1');
    expect(r.createdAt).toBe('2026-10-14T13:45:10.000Z');
    expect(r.userColor).toBe('w');
    expect(r.white.elo).toBe(1500);
    expect(r.moves[0].clockMs).toBe(180_000);
  });

  it('leaves userColor unset when the name matches no side', () => {
    expect(ok(LICHESS, 'someone').userColor).toBeUndefined();
    expect(ok(LICHESS).userColor).toBeUndefined();
  });

  it('refuses unfinished, empty, invalid and variant games with a reason', () => {
    expect(prepareGame('[Result "*"]\n\n1. e4 e5 *')).toEqual({ ok: false, reason: 'Not finished' });
    expect(prepareGame('[White "A"]\n[Result "1-0"]\n\n1-0')).toEqual({ ok: false, reason: 'No moves' });
    expect(prepareGame('1. e4 e5 2. Ke3 1-0').ok).toBe(false);
    expect(prepareGame('[Variant "Crazyhouse"]\n\n1. e4 e5 1-0')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Crazyhouse'),
    });
  });

  it('takes the result from the board when the Result tag is missing', () => {
    expect(ok('1. f3 e5 2. g4 Qh4#').result).toBe('0-1');
  });
});

describe('gameKey', () => {
  it('is the same for the same game imported twice and ignores id, clocks and time of day', () => {
    const a = ok(LICHESS);
    const b = ok(LICHESS.replace('13:45:10', '20:00:00').replaceAll('0:02:58', '0:01:00'));
    expect(a.id).not.toBe(b.id);
    expect(gameKey(a)).toBe(gameKey(b));
  });

  it('ignores name case but tells apart other players, days, results and moves', () => {
    const a = ok(LICHESS);
    expect(gameKey(ok(LICHESS.replace('"Hannan"', '"HANNAN"')))).toBe(gameKey(a));
    expect(gameKey(ok(LICHESS.replace('"Hannan"', '"Other"')))).not.toBe(gameKey(a));
    expect(gameKey(ok(LICHESS.replaceAll('2026.10.14', '2026.10.15')))).not.toBe(gameKey(a));
    expect(gameKey(ok(LICHESS.replace('2... Qh4#', '2... Qh4#').replace('1. f3', '1. f4')))).not.toBe(gameKey(a));
  });
});

describe('players', () => {
  const rec = (white: string, black: string) =>
    ({ white: { name: white, isBot: false }, black: { name: black, isBot: false } }) as Pick<GameRecord, 'white' | 'black'>;

  it('colorOfPlayer matches either side, case-insensitively', () => {
    expect(colorOfPlayer(rec('Ana', 'Ben'), 'ana')).toBe('w');
    expect(colorOfPlayer(rec('Ana', 'Ben'), ' BEN ')).toBe('b');
    expect(colorOfPlayer(rec('Ana', 'Ben'), 'Cy')).toBeNull();
    expect(colorOfPlayer(rec('Ana', 'Ana'), 'Ana')).toBeNull();
    expect(colorOfPlayer(rec('Ana', 'Ben'), '')).toBeNull();
  });

  it('guessPlayerName finds the one name in every game', () => {
    expect(guessPlayerName([rec('Ana', 'Ben'), rec('Cy', 'ana'), rec('ANA', 'Dee')])).toBe('Ana');
    expect(guessPlayerName([rec('Ana', 'Ben'), rec('Ben', 'Ana')])).toBeNull(); // two candidates
    expect(guessPlayerName([rec('Ana', 'Ben')])).toBeNull(); // one game says nothing
    expect(guessPlayerName([rec('White', 'Ana'), rec('White', 'Ben')])).toBeNull(); // placeholder names
  });
});

describe('helpers', () => {
  it('gameLabel names a game for the failure list', () => {
    expect(gameLabel('[White "Ana"]\n[Black "Ben"]\n[Date "2026.10.14"]', 0)).toBe('Ana vs Ben, 2026.10.14');
    expect(gameLabel('1. e4 *', 2)).toBe('Game 3');
  });

  it('builds the Lichess URL; "any" asks for the standard speeds only', () => {
    const url = new URL(lichessGamesUrl('Hannan', 50, 'any'));
    expect(url.origin + url.pathname).toBe('https://lichess.org/api/games/user/Hannan');
    expect(url.searchParams.get('max')).toBe('50');
    expect(url.searchParams.get('clocks')).toBe('true');
    expect(url.searchParams.get('opening')).toBe('true');
    expect(url.searchParams.get('perfType')).toBe('bullet,blitz,rapid,classical,correspondence');
    expect(new URL(lichessGamesUrl('x_y', 10, 'blitz')).searchParams.get('perfType')).toBe('blitz');
  });

  it('validates Lichess usernames', () => {
    expect(isLichessUsername('Hannan_99')).toBe(true);
    expect(isLichessUsername('a')).toBe(false);
    expect(isLichessUsername('bad name')).toBe(false);
    expect(isLichessUsername('../x')).toBe(false);
  });
});
