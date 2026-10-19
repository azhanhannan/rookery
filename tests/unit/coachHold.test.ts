import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Practice Coach holds the bot while its warning is open (game/botTurn.ts holdBot).
const mocks = vi.hoisted(() => ({
  getEngine: vi.fn(),
  chooseMove: vi.fn(),
  thinkTime: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../src/engine/EngineService', () => ({ getEngine: mocks.getEngine }));
vi.mock('../../src/bots/botPlayer', () => ({ chooseMove: mocks.chooseMove, thinkTime: mocks.thinkTime }));

async function load() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/game/gameStore');
  const bot = await import('../../src/game/botTurn');
  return { store: useGameStore, ...bot };
}

describe('holdBot', () => {
  let stopRunner: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.getEngine.mockResolvedValue({ stop: mocks.stop });
    mocks.thinkTime.mockReturnValue(500);
    mocks.chooseMove.mockResolvedValue('e7e5');
  });

  afterEach(() => {
    stopRunner?.();
    stopRunner = undefined;
    vi.useRealTimers();
  });

  it('the bot waits while held and plays a fresh search once released', async () => {
    const { store, startBotTurns, holdBot, useBotStatus } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 1200, practice: true });
    store.getState().move({ from: 'e2', to: 'e4' });
    holdBot(true);
    expect(useBotStatus.getState().thinking).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState().record.moves).toHaveLength(1);

    holdBot(false);
    expect(useBotStatus.getState().thinking).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('a takeback while held leaves the bot idle on release', async () => {
    const { store, startBotTurns, holdBot } = await load();
    const { takeBack } = await import('../../src/game/practice');
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 1200, practice: true });
    store.getState().move({ from: 'f2', to: 'f3' });
    holdBot(true);
    expect(takeBack()).toBe(true);
    holdBot(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves).toHaveLength(0);
    expect(mocks.chooseMove.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
