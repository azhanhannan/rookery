import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clockAfterTakeback, nullMoveFen, takebackPlies, isPractice, canTakeBack } from '../../src/game/practice';
import { applyMove, newRecord } from '../../src/game/rules';
import type { GameRecord } from '../../src/game/types';

function botGame(ucis: string[], humanWhite = true, extra: Partial<GameRecord> = {}): GameRecord {
  const you = { name: 'You', isBot: false };
  const bot = { name: 'Bot', isBot: true, elo: 800 };
  let record: GameRecord = { ...newRecord({ white: humanWhite ? you : bot, black: humanWhite ? bot : you }), ...extra };
  for (const uci of ucis) {
    const res = applyMove(record, { from: uci.slice(0, 2), to: uci.slice(2, 4) }, 1000 * (record.moves.length + 1));
    if (!res) throw new Error(uci);
    record = res.record;
  }
  return record;
}

describe('takebackPlies', () => {
  it('nothing to take back at the start', () => {
    expect(takebackPlies(botGame([]), 'w')).toBe(0);
  });
  it("only the human's move while the bot is still thinking", () => {
    expect(takebackPlies(botGame(['e2e4']), 'w')).toBe(1);
  });
  it("the human's move and the bot's reply", () => {
    expect(takebackPlies(botGame(['e2e4', 'e7e5']), 'w')).toBe(2);
  });
  it('as black, the bot\'s opening move alone cannot be taken back', () => {
    expect(takebackPlies(botGame(['e2e4'], false), 'b')).toBe(0);
    expect(takebackPlies(botGame(['e2e4', 'e7e5', 'g1f3'], false), 'b')).toBe(2);
  });
  it('a game starting with black to move', () => {
    const record = newRecord({
      white: { name: 'Bot', isBot: true },
      black: { name: 'You', isBot: false },
      startFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    });
    const after = applyMove(record, { from: 'e7', to: 'e5' })!.record;
    expect(takebackPlies(after, 'b')).toBe(1);
  });
});

describe('practice flag', () => {
  it('older games without the field are not practice', () => {
    expect(isPractice({})).toBe(false);
    expect(isPractice({ practice: true })).toBe(true);
  });
  it('takebacks only in practice games in progress', () => {
    expect(canTakeBack(botGame(['e2e4', 'e7e5']))).toBe(false);
    expect(canTakeBack(botGame(['e2e4', 'e7e5'], true, { practice: true }))).toBe(true);
    expect(canTakeBack({ ...botGame(['e2e4', 'e7e5'], true, { practice: true }), result: '0-1' })).toBe(false);
  });
});

describe('clockAfterTakeback', () => {
  const clock = { w: 50, b: 60, incMs: 0, running: 'w' as const, turnStartedAt: 5 };
  it('restores each side to its last kept move and runs the side to move', () => {
    const record = botGame(['e2e4', 'e7e5', 'g1f3', 'b8c6'], true, { timeControl: '300+0' });
    const c = clockAfterTakeback(clock, record, 2, 999);
    expect(c).toMatchObject({ w: 1000, b: 2000, running: 'w', turnStartedAt: 999 });
  });
  it('back to the start: base time, nothing running', () => {
    const record = botGame(['e2e4', 'e7e5'], true, { timeControl: '300+0' });
    expect(clockAfterTakeback(clock, record, 0, 999)).toMatchObject({ w: 300_000, b: 300_000, running: null, turnStartedAt: null });
  });
});

describe('nullMoveFen', () => {
  it('passes the move to the other side and clears en passant', () => {
    expect(nullMoveFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    );
  });
  it('is null when the side to move is in check', () => {
    expect(nullMoveFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeNull();
  });
  it('is null for garbage', () => {
    expect(nullMoveFen('nope')).toBeNull();
  });
});

describe('takeBack (store)', () => {
  beforeEach(() => localStorage.clear());

  async function fresh() {
    vi.resetModules();
    const { useGameStore } = await import('../../src/game/gameStore');
    const practice = await import('../../src/game/practice');
    return { useGameStore, ...practice };
  }

  it('undoes the human move and the bot reply in a practice game; never rated', async () => {
    const { useGameStore, takeBack } = await fresh();
    useGameStore.getState().newGame({ side: 'w', timeControlId: '300+0', opponent: 'bot', botElo: 800, rated: true, practice: true });
    const s = useGameStore.getState();
    expect(s.record.practice).toBe(true);
    expect(s.record.rated).toBeUndefined();
    s.move({ from: 'e2', to: 'e4' });
    s.move({ from: 'e7', to: 'e5' }); // stands in for the bot
    expect(takeBack()).toBe(true);
    expect(useGameStore.getState().record.moves).toHaveLength(0);
    expect(useGameStore.getState().viewPly).toBe(0);
    expect(useGameStore.getState().clock?.running).toBeNull();
  });

  it('is impossible in a rated game', async () => {
    const { useGameStore, takeBack } = await fresh();
    useGameStore.getState().newGame({ side: 'w', timeControlId: '300+0', opponent: 'bot', botElo: 800, rated: true });
    useGameStore.getState().move({ from: 'e2', to: 'e4' });
    expect(useGameStore.getState().record.rated).toBe(true);
    expect(takeBack()).toBe(false);
    expect(useGameStore.getState().record.moves).toHaveLength(1);
  });

  it('local two-player games are never practice', async () => {
    const { useGameStore } = await fresh();
    useGameStore.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'friend', practice: true });
    expect(useGameStore.getState().record.practice).toBeUndefined();
  });

  it('remembers the Rated / Practice choice', async () => {
    const { loadGameMode, saveGameMode } = await fresh();
    expect(loadGameMode()).toBeNull();
    saveGameMode('practice');
    expect(loadGameMode()).toBe('practice');
  });
});

describe('practiceIdsOnDevice', () => {
  beforeEach(() => localStorage.clear());
  it('finds the practice games among the given ids', async () => {
    vi.resetModules();
    const { practiceIdsOnDevice } = await import('../../src/game/practice');
    const base = botGame(['e2e4'], true);
    localStorage.setItem(
      'rookery.games',
      JSON.stringify([
        { ...base, id: 'a', practice: true },
        { ...base, id: 'b' },
        { ...base, id: 'c', practice: true },
      ]),
    );
    expect([...practiceIdsOnDevice(['a', 'b', 'x'])]).toEqual(['a']);
  });
});
