// GameRecord.endedAt and GameRecord.takebacks (insights decision 3): set where games end and where practice
// takebacks happen, and kept through reloads and the PGN round trip.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromPgn, toPgn } from '../../src/game/pgn';
import { endRecord, resignationEnd } from '../../src/game/rules';
import { ratingIneligibleReason } from '../../src/rating/glicko';
import type { GameRecord } from '../../src/game/types';
import { FOOLS_MATE, play } from './helpers';

const T = new Date('2026-10-18T09:30:15.000Z');

async function fresh() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/game/gameStore');
  const practice = await import('../../src/game/practice');
  const storage = await import('../../src/game/storage');
  return { useGameStore, ...practice, ...storage };
}

describe('endedAt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());

  it('is stamped when a move ends the game on the board, and absent while it goes on', () => {
    expect(play(FOOLS_MATE.slice(0, 3)).endedAt).toBeUndefined();
    const mated = play(FOOLS_MATE);
    expect(mated.result).toBe('0-1');
    expect(mated.endedAt).toBe(T.toISOString());
  });

  it('endRecord stamps the end, and leaves a finished game (and its end time) alone', () => {
    const r = play(['e2e4']);
    const ended = endRecord(r, resignationEnd('w'), new Date('2026-10-18T10:00:00Z'));
    expect(ended).toMatchObject({ result: '0-1', termination: 'resignation', endedAt: '2026-10-18T10:00:00.000Z' });
    expect(endRecord(ended, resignationEnd('b'))).toBe(ended);
    expect(endRecord(r, resignationEnd('w')).endedAt).toBe(T.toISOString());
  });

  it('resign and flag stamp it in the store, the archive keeps it, and a reload restores it', async () => {
    let t = await fresh();
    t.useGameStore.getState().newGame({ side: 'w', timeControlId: '180+2', opponent: 'bot', botElo: 800 });
    t.useGameStore.getState().move({ from: 'e2', to: 'e4' });
    expect(t.useGameStore.getState().record.endedAt).toBeUndefined();
    t.useGameStore.getState().resign();
    const id = t.useGameStore.getState().record.id;
    expect(t.useGameStore.getState().record.endedAt).toBe(T.toISOString());
    expect(t.findArchivedGame(id)?.endedAt).toBe(T.toISOString());

    t = await fresh(); // page reload
    expect(t.useGameStore.getState().record.endedAt).toBe(T.toISOString());

    t.useGameStore.getState().newGame({ side: 'w', timeControlId: '180+2' });
    t.useGameStore.getState().move({ from: 'e2', to: 'e4' });
    vi.setSystemTime(new Date('2026-10-18T09:33:00Z'));
    t.useGameStore.getState().flag('b');
    expect(t.useGameStore.getState().record).toMatchObject({ termination: 'timeout', endedAt: '2026-10-18T09:33:00.000Z' });
  });
});

describe('takebacks', () => {
  beforeEach(() => localStorage.clear());

  it('counts each practice takeback, survives a reload, and is absent in games without any', async () => {
    let t = await fresh();
    t.useGameStore.getState().newGame({ side: 'w', timeControlId: '300+0', opponent: 'bot', botElo: 800, practice: true });
    expect(t.useGameStore.getState().record.takebacks).toBeUndefined();
    const s = t.useGameStore.getState();
    s.move({ from: 'e2', to: 'e4' });
    s.move({ from: 'e7', to: 'e5' }); // stands in for the bot
    expect(t.takeBack()).toBe(true);
    expect(t.useGameStore.getState().record.takebacks).toBe(1);
    t.useGameStore.getState().move({ from: 'd2', to: 'd4' });
    expect(t.takeBack()).toBe(true); // only the human move this time
    expect(t.takeBack()).toBe(false); // nothing left: not counted
    expect(t.useGameStore.getState().record.takebacks).toBe(2);

    t = await fresh();
    expect(t.useGameStore.getState().record.takebacks).toBe(2);
    t.useGameStore.getState().move({ from: 'e2', to: 'e4' });
    t.useGameStore.getState().resign();
    expect(t.findArchivedGame(t.useGameStore.getState().record.id)?.takebacks).toBe(2);
  });

  it('a record claiming takebacks is never rated', () => {
    const r: GameRecord = {
      ...play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'd7d6', 'b2b4', 'c5b6', 'a2a4', 'a7a6', 'e1g1', 'e8g8', 'h2h3', 'h7h6', 'f1e1', 'f8e8']),
      white: { name: 'Ana', isBot: false },
      black: { name: 'Bot 800', isBot: true, elo: 800 },
      result: '1-0',
      timeControl: '180+2',
    };
    expect(ratingIneligibleReason(r, 'w')).toBeNull();
    expect(ratingIneligibleReason({ ...r, takebacks: 1 }, 'w')).toBe('Games with takebacks are not rated');
    expect(ratingIneligibleReason({ ...r, takebacks: 0 }, 'w')).toBeNull();
  });
});

describe('PGN', () => {
  it('writes EndDate/EndTime (UTC) and Takebacks, and reads them back', () => {
    const r: GameRecord = { ...play(FOOLS_MATE), endedAt: '2026-10-18T09:30:15.250Z', takebacks: 3 };
    const pgn = toPgn(r);
    expect(pgn).toContain('[EndDate "2026.10.18"]');
    expect(pgn).toContain('[EndTime "09:30:15"]');
    expect(pgn).toContain('[Takebacks "3"]');
    const back = fromPgn(pgn);
    expect(back.endedAt).toBe('2026-10-18T09:30:15.000Z');
    expect(back.takebacks).toBe(3);
    expect(back.moves.map((m) => m.uci)).toEqual(r.moves.map((m) => m.uci));
  });

  it('writes neither tag for a game without them, and reads neither from a PGN without them', () => {
    const r = { ...play(FOOLS_MATE), endedAt: undefined };
    const pgn = toPgn(r);
    expect(pgn).not.toContain('EndDate');
    expect(pgn).not.toContain('Takebacks');
    const back = fromPgn(pgn);
    expect('endedAt' in back).toBe(false);
    expect('takebacks' in back).toBe(false);
  });

  it('ignores malformed tags, and an end time on an unfinished game', () => {
    const moves = '\n\n1. e4 e5 2. Nf3';
    const bad = fromPgn(`[Result "1-0"]\n[EndDate "2026-10-18"]\n[EndTime "9:30"]\n[Takebacks "-1"]${moves} 1-0`);
    expect(bad.endedAt).toBeUndefined();
    expect(bad.takebacks).toBeUndefined();
    const open = fromPgn(`[Result "*"]\n[EndDate "2026.10.18"]\n[EndTime "09:30:15"]${moves} *`);
    expect(open.endedAt).toBeUndefined();
    const zero = fromPgn(`[Result "1-0"]\n[Takebacks "0"]${moves} 1-0`);
    expect(zero.takebacks).toBeUndefined();
  });
});
