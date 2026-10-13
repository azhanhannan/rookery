import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared across vi.resetModules(): the mocked modules are rebuilt per test, these fns are not.
const mocks = vi.hoisted(() => ({
  getEngine: vi.fn(),
  chooseMove: vi.fn(),
  thinkTime: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../src/engine/EngineService', () => ({ getEngine: mocks.getEngine }));
vi.mock('../../src/bots/botPlayer', () => ({ chooseMove: mocks.chooseMove, thinkTime: mocks.thinkTime }));

const fakeEngine = { stop: mocks.stop };

/** A chooseMove call that resolves when the test says so. */
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
  return { store: useGameStore, ...bot };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('bot turns', () => {
  let stopRunner: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.getEngine.mockResolvedValue(fakeEngine);
    mocks.thinkTime.mockReturnValue(1000);
  });

  afterEach(() => {
    stopRunner?.();
    stopRunner = undefined;
    vi.useRealTimers();
  });

  it('never touches the engine in a game between people', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited' });
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    expect(mocks.getEngine).not.toHaveBeenCalled();
  });

  it('replies to the human after the think time, at the bot\'s level', async () => {
    const { store, startBotTurns, useBotStatus } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 1200 });
    expect(mocks.getEngine).not.toHaveBeenCalled();

    const reply = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    expect(useBotStatus.getState().thinking).toBe(true);
    await settle();
    const [engine, fen, level] = mocks.chooseMove.mock.calls[0];
    expect(engine).toBe(fakeEngine);
    expect(fen).toBe(store.getState().record.moves[0].fenAfter);
    expect(level.elo).toBe(1200);

    // The search took 300 ms, so the bot waits the other 700 ms of its 1000 ms think time.
    await vi.advanceTimersByTimeAsync(300);
    reply('e7e5');
    await vi.advanceTimersByTimeAsync(600);
    expect(store.getState().record.moves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(useBotStatus.getState().thinking).toBe(false);
  });

  it('does not wait when the search already took longer than the think time', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 400 });
    const reply = deferredMove();
    store.getState().move({ from: 'd2', to: 'd4' });
    await vi.advanceTimersByTimeAsync(1500);
    reply('d7d5');
    await settle();
    expect(store.getState().record.moves).toHaveLength(2);
  });

  it('moves first when the human plays Black', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    mocks.chooseMove.mockResolvedValueOnce('e2e4');
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['e4']);
  });

  it('plays the bot\'s move after a refresh when it is the bot\'s turn', async () => {
    let { store } = await load();
    store.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    const loaded = await load(); // reload: the saved game has the bot to move
    store = loaded.store;
    mocks.chooseMove.mockResolvedValueOnce('g1f3');
    stopRunner = loaded.startBotTurns();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['Nf3']);
  });

  it('drops a stale result and stops the engine when a new game starts', async () => {
    const { store, startBotTurns, useBotStatus } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    const reply = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    mocks.stop.mockClear();

    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    expect(mocks.stop).toHaveBeenCalled();
    expect(useBotStatus.getState().thinking).toBe(false);

    reply('e7e5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves).toEqual([]);
  });

  it('drops a result that arrives after the game moved on (same game, different ply)', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    const reply = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    // The human resigns while the bot thinks: the game is over, so the result must not be played.
    store.getState().resign();
    reply('e7e5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves).toHaveLength(1);
    expect(store.getState().record.result).toBe('0-1');
  });

  it('drops the result and stops the engine when a game is imported', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    const reply = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    mocks.stop.mockClear();
    store.getState().importPgn('1. d4 d5 *');
    expect(mocks.stop).toHaveBeenCalled();
    reply('e7e5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves.map((m) => m.san)).toEqual(['d4', 'd5']);
  });

  it('cancels during the think-time wait as well', async () => {
    const { store, startBotTurns } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    mocks.chooseMove.mockResolvedValueOnce('e7e5');
    store.getState().move({ from: 'e2', to: 'e4' });
    await vi.advanceTimersByTimeAsync(200); // move chosen, now waiting
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves).toEqual([]);
  });

  it('stops the engine and drops the result when the runner stops (unmount)', async () => {
    const { store, startBotTurns } = await load();
    const stop = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    const reply = deferredMove();
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    mocks.stop.mockClear();
    stop();
    expect(mocks.stop).toHaveBeenCalled();
    reply('e7e5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().record.moves).toHaveLength(1);
  });

  it('reports an engine failure without breaking the game, and can retry', async () => {
    const { store, startBotTurns, useBotStatus, retryBotMove } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    mocks.getEngine.mockImplementationOnce(() => {
      throw new Error('not implemented'); // the stub throws synchronously
    });
    store.getState().move({ from: 'e2', to: 'e4' });
    await settle();
    expect(useBotStatus.getState()).toMatchObject({ thinking: false, error: expect.stringContaining('not implemented') });

    // Browsing the move list does not clear the error or retry on its own.
    store.getState().goTo(0);
    await settle();
    expect(mocks.getEngine).toHaveBeenCalledTimes(1);

    mocks.chooseMove.mockResolvedValueOnce('e7e5');
    retryBotMove();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getState().record.moves).toHaveLength(2);
    expect(useBotStatus.getState().error).toBeNull();
  });

  it('reports an illegal bot move instead of playing it', async () => {
    const { store, startBotTurns, useBotStatus } = await load();
    stopRunner = startBotTurns();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    mocks.chooseMove.mockResolvedValueOnce('e7e4');
    store.getState().move({ from: 'e2', to: 'e4' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getState().record.moves).toHaveLength(1);
    expect(useBotStatus.getState().error).toContain('illegal');
  });
});
