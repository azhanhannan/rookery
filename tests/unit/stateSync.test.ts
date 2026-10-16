import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatePutRequest, StateResponse } from '../../src/api/types';

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
    getState: vi.fn<() => Promise<StateResponse>>(),
    putState: vi.fn<(req: StatePutRequest) => Promise<StateResponse>>(),
    me: vi.fn(),
  };
});

vi.mock('../../src/api/client', () => ({
  ApiError: mocks.ApiError,
  api: { getState: mocks.getState, putState: mocks.putState, me: mocks.me, logout: vi.fn(), login: vi.fn(), signup: vi.fn() },
}));

const USER = { id: 'u1', username: 'hannan', createdAt: '2026-10-14T00:00:00Z' };

async function load(signedIn: boolean) {
  vi.resetModules();
  const auth = await import('../../src/account/authStore');
  auth.useAuthStore.setState({ status: signedIn ? 'signed-in' : 'signed-out', user: signedIn ? USER : null });
  const sync = await import('../../src/sync/stateSync');
  const pieces = await import('../../src/settings/pieceSet');
  return { auth, sync, pieces };
}

/** A fake account store that merges like the server does. */
async function fakeServer(initial: StateResponse['items'] = {}) {
  const { mergeItem, normalizeValue } = await import('../../src/sync/merge');
  const { SYNC_KEYS } = await import('../../src/sync/keys');
  let items = { ...initial };
  mocks.getState.mockImplementation(async () => ({ items: { ...items } }));
  mocks.putState.mockImplementation(async (req) => {
    for (const [k, it] of Object.entries(req.items)) {
      const kind = SYNC_KEYS[k];
      const v = normalizeValue(kind, it.value);
      items = { ...items, [k]: mergeItem(kind, { value: v, updatedAt: it.updatedAt }, items[k])! };
    }
    return { items: { ...items } };
  });
  return () => items;
}

beforeEach(() => {
  localStorage.clear();
  mocks.getState.mockReset();
  mocks.putState.mockReset();
  document.documentElement.removeAttribute('style');
});

describe('stateSync', () => {
  it('signed out: nothing is sent, changes are still stamped for later', async () => {
    const { sync } = await load(false);
    sync.detectChanges(1000);
    localStorage.setItem('rookery.boardTheme', 'green');
    expect(sync.detectChanges(2000)).toBe(true);
    await sync.syncNow();
    expect(mocks.getState).not.toHaveBeenCalled();
    expect(sync.localItems()['rookery.boardTheme']).toEqual({ value: 'green', updatedAt: 2000 });
  });

  it('pulls the account copy and applies appearance at once', async () => {
    const stored = await fakeServer({
      'rookery.boardTheme': { value: 'green', updatedAt: 100 },
      'rookery.pieceSet': { value: 'merida', updatedAt: 100 },
      'rookery.trainedDays': { value: ['2026-10-15'], updatedAt: 100 },
    });
    localStorage.setItem('rookery.trainedDays', JSON.stringify(['2026-10-16']));
    const { sync, pieces } = await load(true);
    expect(pieces.loadPieceSet()).toBe('classic');
    await sync.syncNow();
    expect(localStorage.getItem('rookery.boardTheme')).toBe('green');
    expect(document.documentElement.style.getPropertyValue('--board-light')).toBe('#ebecd0');
    expect(pieces.loadPieceSet()).toBe('merida');
    // Trained days were unioned both ways.
    expect(JSON.parse(localStorage.getItem('rookery.trainedDays')!)).toEqual(['2026-10-15', '2026-10-16']);
    expect(stored()['rookery.trainedDays'].value).toEqual(['2026-10-15', '2026-10-16']);
    expect(sync.useStateSync.getState().state).toBe('ok');
  });

  it('pushes a local change made after the pull, and only what changed', async () => {
    const stored = await fakeServer({ 'rookery.boardTheme': { value: 'green', updatedAt: 100 } });
    const { sync } = await load(true);
    await sync.syncNow();
    mocks.putState.mockClear();
    localStorage.setItem('rookery.boardTheme', 'blue');
    await sync.syncNow();
    expect(mocks.putState).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.putState.mock.calls[0][0].items)).toEqual(['rookery.boardTheme']);
    expect(stored()['rookery.boardTheme'].value).toBe('blue');
    // Nothing changed: nothing sent.
    mocks.putState.mockClear();
    await sync.syncNow();
    expect(mocks.putState).not.toHaveBeenCalled();
  });

  it('server down: local data is untouched and the change goes up on a later try', async () => {
    const { sync } = await load(true);
    mocks.getState.mockRejectedValue(new mocks.ApiError(0, 'down'));
    localStorage.setItem('rookery.gameMode', 'practice');
    await sync.syncNow();
    expect(localStorage.getItem('rookery.gameMode')).toBe('practice');
    expect(sync.useStateSync.getState().state).toBe('error');

    const stored = await fakeServer();
    await sync.syncNow();
    expect(stored()['rookery.gameMode'].value).toBe('practice');
    expect(sync.useStateSync.getState().state).toBe('ok');
  });

  it('a change made while a pull is in flight is not overwritten', async () => {
    await fakeServer({ 'rookery.boardTheme': { value: 'green', updatedAt: 100 } });
    const { sync } = await load(true);
    sync.detectChanges();
    const realGet = mocks.getState.getMockImplementation()!;
    mocks.getState.mockImplementationOnce(async () => {
      const res = await realGet();
      localStorage.setItem('rookery.boardTheme', 'blue'); // the player picks a theme meanwhile
      return res;
    });
    await sync.syncNow();
    expect(localStorage.getItem('rookery.boardTheme')).toBe('blue');
  });

  it('signing out leaves local data as it is', async () => {
    await fakeServer({ 'rookery.boardTheme': { value: 'green', updatedAt: 100 } });
    const { sync, auth } = await load(true);
    const stop = sync.startStateSync();
    await sync.syncNow();
    auth.useAuthStore.setState({ status: 'signed-out', user: null });
    expect(localStorage.getItem('rookery.boardTheme')).toBe('green');
    expect(sync.useStateSync.getState().state).toBe('idle');
    stop();
  });
});
