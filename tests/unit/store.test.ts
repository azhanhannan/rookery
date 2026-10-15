import { beforeEach, describe, expect, it, vi } from 'vitest';

async function freshStore() {
  vi.resetModules();
  return (await import('../../src/game/gameStore')).useGameStore;
}

describe('game store', () => {
  beforeEach(() => localStorage.clear());

  it('a refresh mid-game restores the game', async () => {
    let store = await freshStore();
    store.getState().newGame({ side: 'b', timeControlId: '300+0' });
    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]) {
      expect(store.getState().move({ from, to })).toBe(true);
    }
    const before = store.getState();

    store = await freshStore(); // simulates a page reload
    const after = store.getState();
    expect(after.record).toEqual(before.record);
    expect(after.orientation).toBe('black');
    expect(after.viewPly).toBe(3);
    expect(after.clock?.running).toBe('b');
    expect(after.clock?.b).toBe(before.clock?.b);
  });

  it('starts fresh when storage holds garbage', async () => {
    localStorage.setItem('rookery.current', '{not json');
    const store = await freshStore();
    expect(store.getState().record.moves).toEqual([]);
  });

  it('resign ends the game for the side to move and archives it', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited' });
    store.getState().move({ from: 'e2', to: 'e4' });
    store.getState().resign(); // Black is to move, so Black resigns
    expect(store.getState().record.result).toBe('1-0');
    expect(store.getState().move({ from: 'e7', to: 'e5' })).toBe(false);
    const archived = JSON.parse(localStorage.getItem('rookery.games')!);
    expect(archived[0].id).toBe(store.getState().record.id);
  });

  it('flag ends the game on time', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: '60+0' });
    store.getState().move({ from: 'e2', to: 'e4' });
    store.getState().flag('b');
    expect(store.getState().record).toMatchObject({ result: '1-0', termination: 'timeout' });
    expect(store.getState().clock?.running).toBeNull();
  });

  it('step and goTo stay within the game', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited' });
    store.getState().move({ from: 'e2', to: 'e4' });
    store.getState().move({ from: 'e7', to: 'e5' });
    store.getState().step(-5);
    expect(store.getState().viewPly).toBe(0);
    store.getState().goTo(99);
    expect(store.getState().viewPly).toBe(2);
  });

  it('import then export gives the same moves and result', async () => {
    const store = await freshStore();
    store.getState().importPgn('[Event "x"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    store.getState().importPgn(store.getState().exportPgn());
    const r = store.getState().record;
    expect(r.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(r.result).toBe('0-1');
  });

  it('an import can say which side the player played', async () => {
    const store = await freshStore();
    store.getState().importPgn('[White "Opp"]\n[Black "Me"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0', 'b');
    expect(store.getState().record.userColor).toBe('b');
    expect(store.getState().orientation).toBe('black');
    store.getState().importPgn('[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    expect(store.getState().record.userColor).toBeUndefined();
  });

  it('a friend game is the default and names both players', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited' });
    const r = store.getState().record;
    expect(r.white).toEqual({ name: 'Player 2', isBot: false });
    expect(r.black).toEqual({ name: 'Player 1', isBot: false });
  });
});

describe('game store, bot games', () => {
  beforeEach(() => localStorage.clear());

  it('names the human "You" and the bot by its level, with its Elo', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 1200 });
    const r = store.getState().record;
    expect(r.white).toEqual({ name: 'You', isBot: false });
    expect(r.black).toEqual({ name: 'Bot 1200', isBot: true, elo: 1200 });
    expect(store.getState().orientation).toBe('white');
  });

  it('labels the full-strength bot Max', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 3200 });
    const r = store.getState().record;
    expect(r.white).toMatchObject({ name: 'Bot Max', isBot: true });
    expect(r.black.name).toBe('You');
    expect(store.getState().orientation).toBe('black');
  });

  it('exports WhiteElo/BlackElo for the bot only', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 600 });
    const pgn = store.getState().exportPgn();
    expect(pgn).toContain('[White "Bot 600"]');
    expect(pgn).toContain('[WhiteElo "600"]');
    expect(pgn).toContain('[Black "You"]');
    expect(pgn).not.toContain('BlackElo');
  });

  it("resign is the human resigning, even on the bot's turn", async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    store.getState().move({ from: 'e2', to: 'e4' }); // now the bot (Black) is to move
    store.getState().resign();
    expect(store.getState().record).toMatchObject({ result: '0-1', termination: 'resignation' });
  });

  it('resign as Black against a bot gives White the win', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    store.getState().resign(); // the bot (White) is to move
    expect(store.getState().record.result).toBe('1-0');
  });

  it('keeps the setup across a refresh, for "Play again"', async () => {
    let store = await freshStore();
    const setup = { side: 'random', timeControlId: '180+2', opponent: 'bot', botElo: 1000 } as const;
    store.getState().newGame(setup);
    store = await freshStore();
    expect(store.getState().setup).toEqual(setup);
    expect(store.getState().record.timeControl).toBe('180+2');
    expect(store.getState().clock?.w).toBe(180_000);
  });
});
