import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Takeback while the bot is still computing: its stale move must never land (same mocks as botTurn.test.ts).
const mocks = vi.hoisted(() => ({
  getEngine: vi.fn(),
  chooseMove: vi.fn(),
  thinkTime: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../src/engine/EngineService', () => ({ getEngine: mocks.getEngine }));
vi.mock('../../src/bots/botPlayer', () => ({ chooseMove: mocks.chooseMove, thinkTime: mocks.thinkTime }));

function deferredMove() {
  let resolve!: (uci: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  mocks.chooseMove.mockImplementationOnce(() => promise);
  return resolve;
}

async function load() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/game/gameStore');
  const bot = await import('../../src/game/botTurn');
  const { takeBack } = await import('../../src/game/practice');
  return { store: useGameStore, takeBack, ...bot };
}

describe('practice takeback vs the bot', () => {
  let stopRunner: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.getEngine.mockResolvedValue({ stop: mocks.stop });
    mocks.thinkTime.mockReturnValue(1000);
  });

  afterEach(() => {
    stopRunner?.();
    stopRunner = undefined;
    vi.useRealTimers();
  });

  it('drops the move the bot was computing, even when the human replays to the same ply count', async () => {
    const { store, startBotTurns, takeBack, useBotStatus } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 1200, practice: true });

    const stale = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    await vi.advanceTimersByTimeAsync(0);
    expect(useBotStatus.getState().thinking).toBe(true);

    expect(takeBack()).toBe(true);
    expect(store.getState().record.moves).toHaveLength(0);
    expect(useBotStatus.getState().thinking).toBe(false);
    expect(mocks.stop).toHaveBeenCalled();

    const fresh = deferredMove();
    store.getState().move({ from: 'd2', to: 'd4' });
    await vi.advanceTimersByTimeAsync(0);
    stale('e7e5'); // the old search answers late, for a position that is gone
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['d4']);

    fresh('d7d5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['d4', 'd5']);

    // Two plies back: the bot's reply and the human's move.
    expect(takeBack()).toBe(true);
    expect(store.getState().record.moves).toHaveLength(0);
  });
});
