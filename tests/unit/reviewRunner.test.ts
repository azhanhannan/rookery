import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REVIEW } from '../../src/config/tunables';
import type { AnalysisResult, AnalyzeOptions } from '../../src/engine/types';
import type { GameRecord } from '../../src/game/types';
import { buildReview } from '../../src/review/buildReview';
import { clearAnalysisCache, runReview, type ReviewProgress } from '../../src/review/reviewRunner';
import type { GameReview, ReviewInput } from '../../src/review/types';
import { FakeEngine, line } from './fakeEngine';
import { FOOLS_MATE, play } from './helpers';

vi.mock('../../src/review/buildReview', () => ({
  buildReview: vi.fn((input: ReviewInput) => ({ depth: input.depth }) as GameReview),
}));

const built = vi.mocked(buildReview);
const lastInput = (): ReviewInput => built.mock.lastCall![0];

/** 1.e4 c5 2.Nf3 d6, a draw by agreement. */
function sicilian(): GameRecord {
  return { ...play(['e2e4', 'c7c5', 'g1f3', 'd7d6']), result: '1/2-1/2' };
}

/** FakeEngine that answers with one line per position. */
function answering(): FakeEngine {
  const engine = new FakeEngine();
  engine.lines = [line(1, 'a2a3', { cp: 10 }), line(2, 'h2h3', { cp: 0 })];
  return engine;
}

/** An engine whose searches only finish when stop() is called (or `finish` is). */
class SlowEngine extends FakeEngine {
  pending: { fen: string; resolve: (r: AnalysisResult) => void; reject: (e: Error) => void }[] = [];
  stops = 0;
  analyze(fen: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
    this.analyzeCalls.push([fen, opts]);
    return new Promise((resolve, reject) => this.pending.push({ fen, resolve, reject }));
  }
  stop(): void {
    this.stops++;
    this.pending.shift()?.resolve({ fen: '', lines: [], depth: 3 });
  }
  /** Lets the oldest search finish normally. */
  finish(): void {
    const job = this.pending.shift()!;
    job.resolve({ fen: job.fen, lines: [line(1, 'a2a3', { cp: 5 })], depth: 16 });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  clearAnalysisCache();
  built.mockClear();
});

describe('runReview', () => {
  it('analyses each of the M + 1 positions once, at the default depth and multiPV', async () => {
    const record = sicilian();
    const engine = answering();
    await runReview(record, { engine });
    const fens = [record.startFen, ...record.moves.map((m) => m.fenAfter)];
    expect(engine.analyzeCalls).toEqual(fens.map((fen) => [fen, { depth: REVIEW.depth.normal, multiPV: REVIEW.multiPV }]));
  });

  it('hands buildReview index-aligned analyses, the moves, the book and the depth', async () => {
    const record = sicilian();
    const before = structuredClone(record);
    const review = await runReview(record, { engine: answering(), depth: 12 });
    const input = lastInput();
    expect(review.depth).toBe(12);
    expect(input.depth).toBe(12);
    expect(input.startFen).toBe(record.startFen);
    expect(input.moves).toEqual(record.moves.map(({ san, uci, fenAfter }) => ({ san, uci, fenAfter })));
    expect(input.analyses.map((a) => a.fen)).toEqual([record.startFen, ...record.moves.map((m) => m.fenAfter)]);
    expect(input.book.bookPlies).toBe(4);
    expect(input.book.eco).toMatch(/^B5/);
    expect(record).toEqual(before);
  });

  it('reports progress after every position', async () => {
    const progress: ReviewProgress[] = [];
    await runReview(sicilian(), { engine: answering(), onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([1, 2, 3, 4, 5].map((done) => ({ done, total: 5 })));
  });

  it('does not ask the engine about a checkmated final position', async () => {
    const record = play(FOOLS_MATE);
    expect(record.result).toBe('0-1');
    const engine = answering();
    await runReview(record, { engine, depth: 10 });
    expect(engine.analyzeCalls).toHaveLength(4);
    const final = record.moves[3].fenAfter;
    expect(lastInput().analyses[4]).toEqual({ fen: final, lines: [], depth: 10 });
  });

  it('reuses cached analyses, including deeper ones for a shallower request', async () => {
    const engine = answering();
    await runReview(sicilian(), { engine, depth: 16 });
    expect(engine.analyzeCalls).toHaveLength(5);

    const progress: ReviewProgress[] = [];
    await runReview(sicilian(), { engine, depth: 16, onProgress: (p) => progress.push(p) });
    await runReview(sicilian(), { engine, depth: 12 });
    expect(engine.analyzeCalls).toHaveLength(5);
    expect(progress).toHaveLength(5);
    expect(lastInput().analyses).toHaveLength(5);

    await runReview(sicilian(), { engine, depth: 20 });
    expect(engine.analyzeCalls).toHaveLength(10);
  });

  it('shares cached positions between games', async () => {
    const engine = answering();
    await runReview(sicilian(), { engine });
    const longer = { ...play(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4']), result: '1-0' as const };
    await runReview(longer, { engine });
    expect(engine.analyzeCalls).toHaveLength(6);
  });

  it('rejects games with no moves or no result, without touching the engine', async () => {
    const engine = answering();
    await expect(runReview({ ...play([]), result: '1-0' }, { engine })).rejects.toThrow(/no moves/);
    await expect(runReview(play(['e2e4']), { engine })).rejects.toThrow(/finished/);
    expect(engine.analyzeCalls).toHaveLength(0);
  });

  it('allows a non-standard start position, with no book', async () => {
    const start = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const record = { ...play(['e2e4', 'e8d7'], start), result: '1/2-1/2' as const };
    await runReview(record, { engine: answering() });
    expect(lastInput().book).toEqual({ bookPlies: 0 });
    expect(lastInput().analyses[0].fen).toBe(start);
  });

  it('passes engine failures through', async () => {
    const engine = answering();
    engine.analyze = () => Promise.reject(new Error('Engine terminated'));
    await expect(runReview(sicilian(), { engine })).rejects.toThrow(/terminated/);
  });
});

describe('runReview cancel', () => {
  it('rejects at once for an already-aborted signal', async () => {
    const engine = new SlowEngine();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runReview(sicilian(), { engine, signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.analyzeCalls).toHaveLength(0);
    expect(engine.stops).toBe(0);
  });

  it('stops the running search, schedules nothing more, and rejects with an AbortError', async () => {
    const engine = new SlowEngine();
    const ctrl = new AbortController();
    const progress: ReviewProgress[] = [];
    const run = runReview(sicilian(), { engine, signal: ctrl.signal, onProgress: (p) => progress.push(p) });
    await flush();
    engine.finish();
    await flush();
    expect(engine.analyzeCalls).toHaveLength(2);

    ctrl.abort();
    const err = await run.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
    expect(engine.stops).toBe(1);
    await flush();
    expect(engine.analyzeCalls).toHaveLength(2);
    expect(progress).toEqual([{ done: 1, total: 5 }]);
    expect(built).not.toHaveBeenCalled();
  });

  it('does not cache the cut-short search', async () => {
    const engine = new SlowEngine();
    const ctrl = new AbortController();
    const run = runReview(sicilian(), { engine, signal: ctrl.signal });
    await flush();
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });

    const fast = answering();
    await runReview(sicilian(), { engine: fast });
    expect(fast.analyzeCalls).toHaveLength(5);
  });

  it('ignores a search that fails after the review was cancelled', async () => {
    const engine = new SlowEngine();
    engine.stop = () => engine.stops++;
    const ctrl = new AbortController();
    const run = runReview(sicilian(), { engine, signal: ctrl.signal });
    await flush();
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    // Unhandled, this would fail the test run.
    engine.pending[0].reject(new Error('Engine terminated'));
    await flush();
  });
});
