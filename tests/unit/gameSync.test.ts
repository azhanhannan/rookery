import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveGameRequest, SaveGameResponse } from '../../src/api/types';
import type { GameReview } from '../../src/game/types';
import { play } from './helpers';

// Same functions across vi.resetModules, so each test can program them.
const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    saveGame: vi.fn<(req: SaveGameRequest) => Promise<SaveGameResponse>>(),
    me: vi.fn(),
  };
});

vi.mock('../../src/api/client', () => ({
  ApiError: mocks.ApiError,
  api: { saveGame: mocks.saveGame, me: mocks.me, logout: vi.fn(), login: vi.fn(), signup: vi.fn() },
}));

const USER = { id: 'u1', username: 'hannan', createdAt: '2026-10-14T00:00:00Z' };
const REVIEW = { version: 1 } as unknown as GameReview;

function okResponse(req: SaveGameRequest, extra: Partial<SaveGameResponse> = {}): SaveGameResponse {
  return {
    game: {
      clientId: req.record.id,
      white: req.record.white.name,
      black: req.record.black.name,
      result: req.record.result,
      userColor: req.userColor,
      opponentName: 'Bot',
      rated: req.rated,
      category: null,
      moves: req.record.moves.length,
      hasReview: !!req.record.review,
      playedAt: req.record.createdAt,
    },
    ...extra,
  };
}

/** Fresh modules (simulates a page load); `signedIn` is the session state before sync starts. */
async function boot(signedIn: boolean) {
  vi.resetModules();
  const sync = await import('../../src/account/gameSync');
  const { useGameStore } = await import('../../src/game/gameStore');
  const { useAuthStore } = await import('../../src/account/authStore');
  const { useSyncStore } = await import('../../src/account/syncStore');
  useAuthStore.setState(signedIn ? { status: 'signed-in', user: USER } : { status: 'signed-out', user: null });
  const stop = sync.startGameSync();
  return { ...sync, useGameStore, useAuthStore, useSyncStore, stop };
}

/** Starts a rated blitz game against a bot as White and resigns it. Returns its id. */
function playAndResign(useGameStore: Awaited<ReturnType<typeof boot>>['useGameStore']): string {
  const s = useGameStore.getState();
  s.newGame({ side: 'w', timeControlId: '180+2', opponent: 'bot', botElo: 800, rated: true });
  useGameStore.getState().move({ from: 'e2', to: 'e4' });
  useGameStore.getState().resign();
  return useGameStore.getState().record.id;
}

describe('userColorFor', () => {
  it('is the human side of a bot game and null otherwise', async () => {
    const { userColorFor } = await import('../../src/account/gameSync');
    const base = play(['e2e4']);
    expect(userColorFor(base)).toBeNull();
    expect(userColorFor({ ...base, black: { name: 'Bot', isBot: true } })).toBe('w');
    expect(userColorFor({ ...base, white: { name: 'Bot', isBot: true } })).toBe('b');
    expect(
      userColorFor({ ...base, white: { name: 'Bot', isBot: true }, black: { name: 'Bot', isBot: true } }),
    ).toBeNull();
  });
});

describe('game sync', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.saveGame.mockReset();
    mocks.me.mockReset();
  });

  it('uploads a finished game once, with the player side and rated flag, and keeps the rating change', async () => {
    const t = await boot(true);
    mocks.saveGame.mockImplementation(async (req) =>
      okResponse(req, { rating: { category: 'blitz', before: 1500, after: 1478, delta: -22, provisional: true } }),
    );
    const id = playAndResign(t.useGameStore);
    await t.flushGameSync();

    expect(mocks.saveGame).toHaveBeenCalledTimes(1);
    const req = mocks.saveGame.mock.calls[0][0];
    expect(req.record.id).toBe(id);
    expect(req.record.rated).toBe(true);
    expect(req.userColor).toBe('w');
    expect(req.rated).toBe(true);
    expect(t.useSyncStore.getState().byId[id]).toMatchObject({ status: 'saved', rating: { after: 1478, delta: -22 } });
    expect(t.readQueue()).toEqual([]);

    // Unrelated store changes don't upload again.
    t.useGameStore.getState().flip();
    t.useGameStore.getState().goTo(0);
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(1);
    t.stop();
  });

  it('uploads again once the review is set, keeping the earlier rating change', async () => {
    const t = await boot(true);
    mocks.saveGame
      .mockImplementationOnce(async (req) =>
        okResponse(req, { rating: { category: 'blitz', before: 1500, after: 1520, delta: 20, provisional: false } }),
      )
      .mockImplementation(async (req) => okResponse(req));
    const id = playAndResign(t.useGameStore);
    await t.flushGameSync();
    t.useGameStore.getState().setReview(id, REVIEW);
    await t.flushGameSync();

    expect(mocks.saveGame).toHaveBeenCalledTimes(2);
    expect(mocks.saveGame.mock.calls[1][0].record.review).toBe(REVIEW);
    expect(t.useSyncStore.getState().byId[id].rating?.after).toBe(1520);
    t.stop();
  });

  it('queues a failed upload and retries it on the next sign-in and on app start', async () => {
    let t = await boot(true);
    mocks.saveGame.mockRejectedValue(new mocks.ApiError(0, "Can't reach the server."));
    const id = playAndResign(t.useGameStore);
    await t.flushGameSync();
    expect(t.readQueue()).toEqual([id]);
    expect(t.useSyncStore.getState().byId[id].status).toBe('failed');

    // Server error: still queued.
    mocks.saveGame.mockRejectedValue(new mocks.ApiError(503, 'Server error (503).'));
    t.useAuthStore.setState({ status: 'signed-out', user: null });
    t.useAuthStore.setState({ status: 'signed-in', user: USER });
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(2);
    expect(t.readQueue()).toEqual([id]);
    t.stop();

    // Page reload while signed in: the queue is retried at start.
    mocks.saveGame.mockImplementation(async (req) => okResponse(req));
    t = await boot(true);
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(3);
    expect(mocks.saveGame.mock.calls[2][0].record.id).toBe(id);
    expect(t.readQueue()).toEqual([]);
    t.stop();
  });

  it('drops a game the server rejects with 4xx', async () => {
    const t = await boot(true);
    mocks.saveGame.mockRejectedValue(new mocks.ApiError(400, 'That game is not valid.'));
    playAndResign(t.useGameStore);
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(1);
    expect(t.readQueue()).toEqual([]);
    t.stop();
  });

  it('keeps a game rejected with 401 and uploads it after the next login', async () => {
    const t = await boot(true);
    mocks.saveGame.mockRejectedValueOnce(new mocks.ApiError(401, 'Log in again.'));
    mocks.me.mockRejectedValue(new mocks.ApiError(401, 'Not signed in.'));
    const id = playAndResign(t.useGameStore);
    await t.flushGameSync();
    await vi.waitFor(() => expect(t.useAuthStore.getState().status).toBe('signed-out'));
    expect(t.readQueue()).toEqual([id]);

    mocks.saveGame.mockImplementation(async (req) => okResponse(req));
    t.useAuthStore.setState({ status: 'signed-in', user: USER });
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(2);
    expect(t.readQueue()).toEqual([]);
    t.stop();
  });

  it('does not upload or queue while signed out', async () => {
    const t = await boot(false);
    playAndResign(t.useGameStore);
    await t.flushGameSync();
    // Signing in later doesn't upload old games either (the explicit upload button does that).
    t.useAuthStore.setState({ status: 'signed-in', user: USER });
    await t.flushGameSync();
    expect(mocks.saveGame).not.toHaveBeenCalled();
    expect(t.readQueue()).toEqual([]);
    t.stop();
  });

  it('does not upload the finished game restored at app start', async () => {
    let t = await boot(false);
    playAndResign(t.useGameStore);
    t.stop();
    t = await boot(true);
    await t.flushGameSync();
    expect(mocks.saveGame).not.toHaveBeenCalled();
    t.stop();
  });

  it('uploads an imported finished game between two people with userColor null and unrated', async () => {
    const t = await boot(true);
    mocks.saveGame.mockImplementation(async (req) => okResponse(req));
    t.useGameStore.getState().importPgn('1. f3 e5 2. g4 Qh4# 0-1');
    await t.flushGameSync();
    expect(mocks.saveGame).toHaveBeenCalledTimes(1);
    expect(mocks.saveGame.mock.calls[0][0]).toMatchObject({ userColor: null, rated: false });
    t.stop();
  });
});

describe('rated flag on new games', () => {
  beforeEach(() => localStorage.clear());

  it('marks only bot games started as rated', async () => {
    vi.resetModules();
    const { useGameStore } = await import('../../src/game/gameStore');
    useGameStore.getState().newGame({ side: 'w', timeControlId: '180+2', opponent: 'bot', botElo: 800, rated: true });
    expect(useGameStore.getState().record.rated).toBe(true);
    useGameStore.getState().newGame({ side: 'w', timeControlId: '180+2', opponent: 'friend', rated: true });
    expect(useGameStore.getState().record.rated).toBeUndefined();
    useGameStore.getState().newGame({ side: 'w', timeControlId: '180+2', opponent: 'bot', botElo: 800 });
    expect(useGameStore.getState().record.rated).toBeUndefined();
  });
});

describe('describeRatingChange', () => {
  it('capitalises the category, uses a real minus sign and marks provisional ratings', async () => {
    const { describeRatingChange } = await import('../../src/account/syncStore');
    expect(describeRatingChange({ category: 'blitz', before: 1500, after: 1478, delta: -22, provisional: true })).toBe(
      'Blitz rating 1500 → 1478? (−22)',
    );
    expect(describeRatingChange({ category: 'rapid', before: 1600, after: 1612, delta: 12, provisional: false })).toBe(
      'Rapid rating 1600 → 1612 (+12)',
    );
  });
});
