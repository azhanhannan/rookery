// The batch runner's depth-aware skip and low-priority waiting, and the one-off re-review of shallow reviews
// (app/reReview.ts) with its resume-after-reload flag. runReview is replaced, so no engine runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRecord, GameReview } from '../../src/game/types';
import type { RunReviewOptions } from '../../src/review/reviewRunner';
import { play } from './helpers';

const mocks = vi.hoisted(() => ({
  runReview: vi.fn<(record: GameRecord, opts?: RunReviewOptions) => Promise<GameReview>>(),
  queueGameUpload: vi.fn<(id: string) => void>(),
}));

vi.mock('../../src/review/reviewRunner', () => ({ runReview: mocks.runReview }));
vi.mock('../../src/account/gameSync', () => ({ queueGameUpload: mocks.queueGameUpload }));

/** A review that fits `r`, at `depth` (current format unless `version` says otherwise). */
function reviewFor(r: GameRecord, depth: number, createdAt = new Date().toISOString(), version: 1 | 2 = 2): GameReview {
  return {
    version,
    depth,
    createdAt,
    positions: [r.startFen, ...r.moves.map((m) => m.fenAfter)].map((fen) => ({ fen })),
    moves: r.moves.map((m) => ({ uci: m.uci, san: m.san })),
  } as unknown as GameReview;
}

function finished(ucis: string[], over: Partial<GameRecord> = {}): GameRecord {
  return { ...play(ucis), result: '1-0', termination: 'resignation', ...over };
}

async function boot() {
  vi.resetModules();
  const batch = await import('../../src/app/batchReview');
  const re = await import('../../src/app/reReview');
  const storage = await import('../../src/game/storage');
  const { useGameStore } = await import('../../src/game/gameStore');
  return { ...batch, ...re, ...storage, useGameStore };
}

/** Lets the runner's awaits (and its 0 ms polls under fake timers) settle. */
async function settle(t: Awaited<ReturnType<typeof boot>>, until: () => boolean = () => t.useBatchReview.getState().status !== 'running') {
  for (let i = 0; i < 200 && !until(); i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  localStorage.clear();
  location.hash = '';
  mocks.runReview.mockReset();
  mocks.queueGameUpload.mockReset();
  mocks.runReview.mockImplementation(async (record, opts) => {
    if (opts?.beforePosition) await opts.beforePosition();
    return reviewFor(record, opts?.depth ?? 16);
  });
});

afterEach(() => vi.useRealTimers());

describe('shallowReviewIds', () => {
  it('lists finished games whose fitting review is below the depth, in saved order', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    const b = finished(['d2d4']);
    const c = finished(['c2c4']);
    const d = finished(['g1f3']);
    const games = [
      { ...a, review: reviewFor(a, 12) },
      { ...b, review: reviewFor(b, 16) },
      c, // never reviewed: not this job
      { ...d, review: reviewFor(finished(['e2e4', 'e7e5']), 12) }, // stale review for other moves
      { ...play(['e2e4']), review: reviewFor(a, 12) }, // unfinished
    ];
    expect(t.shallowReviewIds(games)).toEqual([a.id]);
    expect(t.shallowReviewIds(games, 20)).toEqual([a.id, b.id]);
    expect(t.reReviewDepth()).toBe(16);
  });

  it('unreviewedIds lists finished games with no fitting review, which shallowReviewIds leaves out', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    const c = finished(['c2c4']);
    const d = finished(['g1f3']);
    const games = [
      { ...a, review: reviewFor(a, 12) },
      c,
      { ...d, review: reviewFor(finished(['e2e4', 'e7e5']), 12) },
      play(['d2d4']), // unfinished
    ];
    expect(t.unreviewedIds(games)).toEqual([c.id, d.id]);
  });

  it('also lists version 1 reviews (no second engine line) at any depth', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    const b = finished(['d2d4']);
    const c = finished(['c2c4']);
    const games = [
      { ...a, review: reviewFor(a, 16, undefined, 1) },
      { ...b, review: reviewFor(b, 20, undefined, 1) },
      { ...c, review: reviewFor(c, 16) },
      // Stored before the field existed at all: treated as version 1.
      { ...c, id: 'no-version', review: { ...reviewFor(c, 16), version: undefined } as unknown as GameReview },
    ];
    expect(t.shallowReviewIds(games)).toEqual([a.id, b.id, 'no-version']);
    expect(t.reviewOutdated(reviewFor(c, 16))).toBe(false);
    expect(t.reviewOutdated(reviewFor(c, 16, undefined, 1))).toBe(true);
  });
});

describe('engineWantedElsewhere', () => {
  it('is true on engine pages, and on Play only with a bot game in progress', async () => {
    const t = await boot();
    const friend = play(['e2e4']);
    const vsBot = { ...friend, black: { name: 'Bot 800', isBot: true, elo: 800 } };
    const over = { ...vsBot, result: '1-0' as const };
    expect(t.engineWantedElsewhere('#/analysis', friend)).toBe(true);
    expect(t.engineWantedElsewhere('#/review/abc', friend)).toBe(true);
    expect(t.engineWantedElsewhere('#/play', vsBot)).toBe(true);
    expect(t.engineWantedElsewhere('', vsBot)).toBe(true);
    expect(t.engineWantedElsewhere('#/play', over)).toBe(false);
    expect(t.engineWantedElsewhere('#/play', friend)).toBe(false);
    expect(t.engineWantedElsewhere('#/games', vsBot)).toBe(false);
    expect(t.engineWantedElsewhere('#/import', vsBot)).toBe(false);
  });
});

describe('batch review depth', () => {
  it('skips games reviewed at the run depth or deeper, and reviews shallower ones again', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    const b = finished(['d2d4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }, { ...b, review: reviewFor(b, 20) }]);
    t.useBatchReview.getState().start([a.id, b.id], 16);
    await settle(t);
    const s = t.useBatchReview.getState();
    expect(s).toMatchObject({ status: 'done', kind: 'all', reviewed: 1, skipped: 1 });
    expect(mocks.runReview).toHaveBeenCalledTimes(1);
    expect(mocks.runReview.mock.calls[0][1]?.depth).toBe(16);
    expect(t.findArchivedGame(a.id)?.review?.depth).toBe(16);
    expect(t.findArchivedGame(b.id)?.review?.depth).toBe(20);
    expect(mocks.queueGameUpload).toHaveBeenCalledWith(a.id);
  });
});

describe('re-review of version 1 reviews', () => {
  it('a depth-16 version 1 review is not skipped: the run redoes it and leaves a version 2 review', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    const b = finished(['d2d4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 16, undefined, 1) }, { ...b, review: reviewFor(b, 16) }]);
    location.hash = '#/games';
    expect(t.startReReview()).toBe(true);
    expect(t.useBatchReview.getState().ids).toEqual([a.id]);
    await settle(t);
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'done', reviewed: 1, skipped: 0 });
    expect(t.findArchivedGame(a.id)?.review?.version).toBe(2);
    expect(t.shallowReviewIds(t.loadHistory())).toEqual([]);
  });

  it('the batch skip needs the current format as well as the depth', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    expect(t.reviewedAtLeast({ ...a, review: reviewFor(a, 20, undefined, 1) }, 16)).toBe(false);
    expect(t.reviewedAtLeast({ ...a, review: reviewFor(a, 20) }, 16)).toBe(true);
  });
});

describe('re-review', () => {
  it('re-reviews shallow games at depth 16, uploads them, and clears the resume flag when done', async () => {
    const t = await boot();
    const a = finished(['e2e4'], { endedAt: '2026-10-18T09:00:00.000Z' });
    const b = finished(['d2d4']);
    const c = finished(['c2c4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }, { ...b, review: reviewFor(b, 16) }, { ...c, review: reviewFor(c, 12) }]);
    location.hash = '#/games';
    expect(t.startReReview()).toBe(true);
    expect(localStorage.getItem('rookery.reReview')).toBe('1');
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'running', kind: 'deepen', depth: 16, ids: [a.id, c.id] });
    await settle(t);
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'done', reviewed: 2 });
    expect(t.shallowReviewIds(t.loadHistory())).toEqual([]);
    expect(t.findArchivedGame(a.id)).toMatchObject({ endedAt: '2026-10-18T09:00:00.000Z', review: { depth: 16 } });
    expect(mocks.queueGameUpload.mock.calls.map((c) => c[0])).toEqual([a.id, c.id]);
    expect(localStorage.getItem('rookery.reReview')).toBeNull();
    // Nothing shallow left: nothing to start.
    t.useBatchReview.getState().dismiss();
    expect(t.startReReview()).toBe(false);
  });

  it('waits while a bot game is in progress on Play, then carries on', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }]);
    t.useGameStore.getState().newGame({ side: 'w', timeControlId: 'unlimited', opponent: 'bot', botElo: 800 });
    location.hash = '#/play';
    vi.useFakeTimers();
    t.startReReview();
    await vi.advanceTimersByTimeAsync(5 * t.YIELD_POLL_MS);
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'running', paused: true });
    expect(mocks.runReview).not.toHaveBeenCalled();

    location.hash = '#/games';
    await vi.advanceTimersByTimeAsync(2 * t.YIELD_POLL_MS);
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'done', paused: false, reviewed: 1 });
  });

  it('pauses mid-game between positions too', async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }]);
    let positions = 0;
    mocks.runReview.mockImplementation(async (record, opts) => {
      for (let i = 0; i < 3; i++) {
        await opts!.beforePosition!();
        positions++;
        if (i === 0) location.hash = '#/analysis'; // the player opens the Analysis board mid-review
      }
      return reviewFor(record, 16);
    });
    location.hash = '#/import';
    vi.useFakeTimers();
    t.startReReview();
    await vi.advanceTimersByTimeAsync(3 * t.YIELD_POLL_MS);
    expect(positions).toBe(1);
    expect(t.useBatchReview.getState().paused).toBe(true);
    location.hash = '#/import';
    await vi.advanceTimersByTimeAsync(2 * t.YIELD_POLL_MS);
    expect(positions).toBe(3);
    expect(t.useBatchReview.getState().status).toBe('done');
  });

  it('resumes after a reload, and a cancel stops it for good', async () => {
    let t = await boot();
    const a = finished(['e2e4']);
    const b = finished(['d2d4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }, { ...b, review: reviewFor(b, 12) }]);
    location.hash = '#/games';
    // The first game is reviewed, then the tab "closes" while the second one is in the engine.
    let calls = 0;
    mocks.runReview.mockImplementation(async (record) => {
      if (++calls === 2) return new Promise<GameReview>(() => {});
      return reviewFor(record, 16);
    });
    t.startReReview();
    await settle(t, () => calls === 2);
    expect(t.shallowReviewIds(t.loadHistory())).toEqual([b.id]);
    expect(localStorage.getItem('rookery.reReview')).toBe('1');

    t = await boot(); // reload
    mocks.runReview.mockImplementation(async (record) => reviewFor(record, 16));
    expect(t.useBatchReview.getState().status).toBe('idle');
    t.resumeReReview();
    expect(t.useBatchReview.getState().ids).toEqual([b.id]);
    await settle(t);
    expect(t.useBatchReview.getState()).toMatchObject({ status: 'done', reviewed: 1 });
    expect(localStorage.getItem('rookery.reReview')).toBeNull();

    // Without the flag, a load starts nothing, even with shallow games.
    const c = finished(['c2c4']);
    t.archiveGames([{ ...c, review: reviewFor(c, 12) }]);
    t = await boot();
    t.resumeReReview();
    expect(t.useBatchReview.getState().status).toBe('idle');

    // Started, then cancelled: the flag goes, so the next load doesn't pick it up.
    mocks.runReview.mockImplementation(() => new Promise<GameReview>(() => {}));
    t.startReReview();
    expect(localStorage.getItem('rookery.reReview')).toBe('1');
    t.useBatchReview.getState().cancel();
    expect(t.useBatchReview.getState().status).toBe('cancelled');
    expect(localStorage.getItem('rookery.reReview')).toBeNull();
  });

  it("doesn't start while another batch run is going", async () => {
    const t = await boot();
    const a = finished(['e2e4']);
    t.archiveGames([{ ...a, review: reviewFor(a, 12) }]);
    mocks.runReview.mockImplementation(() => new Promise<GameReview>(() => {}));
    t.useBatchReview.getState().start([a.id], 16);
    expect(t.startReReview()).toBe(false);
    expect(t.useBatchReview.getState().kind).toBe('all');
    t.useBatchReview.getState().cancel();
  });
});
