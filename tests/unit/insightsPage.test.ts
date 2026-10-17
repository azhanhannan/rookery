import { describe, expect, it, vi } from 'vitest';
import { INSIGHTS } from '../../src/config/tunables';
import { buildGameFacts, buildInsights, moveMotif } from '../../src/insights';
import type { GameFacts } from '../../src/insights/types';
import { memoryFactsCache, factsKey, type FactsCache } from '../../src/app/insights/factsCache';
import { loadInsightFacts, mergeServerFacts } from '../../src/app/insights/loadFacts';
import { activeFocus, parseStoredFocus } from '../../src/app/insights/focusStore';
import { mistakesForMotif, PASSED_WEEK_STAGE, processMeasures } from '../../src/app/insights/process';
import { mistakesMotifFromHash, parseReviewHash, reviewHref, subPath, trainHref } from '../../src/app/deepLinks';
import { harvestMistakes } from '../../src/puzzles/harvest';
import { emptyLessonsProgress } from '../../src/lessons/progress';
import { emptyProgress } from '../../src/endgames/progress';
import { mergeFocus, mergeItem, normalizeValue } from '../../src/sync/merge';
import { syncKind } from '../../src/sync/keys';
import { startFocus } from '../../src/insights/focus';
import { hangingGame, hangingGames } from '../fixtures/insightsGames';
import { makeGame } from '../fixtures/insights';

// Facts for a few dozen real games (chess.js threat checks) take a few seconds under a busy parallel run.
vi.setConfig({ testTimeout: 30_000 });

describe('insights page: the seeded games', () => {
  it('each game leaves a knight hanging at ply 5, and 22 of them make it the Focus', () => {
    const f = buildGameFacts(hangingGame(0))!;
    expect(f).not.toBeNull();
    expect(f.moves.find((m) => m.ply === 5)?.motif).toBe('hanging');
    expect(moveMotif(hangingGame(0), 5, 'w')).toBe('hanging');
    expect(moveMotif(hangingGame(0), 7, 'w')).toBe('other');
    const facts = hangingGames(22).map((g) => buildGameFacts(g)!);
    const model = buildInsights(facts, { style: 'learner' });
    expect(model.focus?.id).toBe('O:hanging');
    expect(model.focus?.train).toEqual({ kind: 'mistakes', href: '#/puzzles', motif: 'hanging' });
  });
});

describe('loadInsightFacts', () => {
  it('builds facts once, then reads them from the cache; a re-review misses it', async () => {
    const cache = memoryFactsCache();
    const records = hangingGames(3);
    const first = await loadInsightFacts({ records, cache });
    expect(first).toMatchObject({ built: 3, fromCache: 0, cacheFailed: false });
    expect(first.coverage).toEqual({ total: 3, included: 3, excluded: {} });
    const second = await loadInsightFacts({ records, cache });
    expect(second).toMatchObject({ built: 0, fromCache: 3 });
    expect(second.facts).toEqual(first.facts);
    const rereviewed = [hangingGame(2, { reviewCreatedAt: '2026-10-20T00:00:00.000Z' }), ...records.slice(1)];
    const third = await loadInsightFacts({ records: rereviewed, cache });
    expect(third).toMatchObject({ built: 1, fromCache: 2 });
    // The stale entry is pruned.
    expect([...(await cache.getAll()).keys()].filter((k) => k.startsWith('hang-2|'))).toHaveLength(1);
  });

  it('keys carry the facts version, so a rules change rebuilds', () => {
    expect(factsKey(hangingGame(0), 'w')).toBe(`hang-0|2026-10-01T00:00:00.000Z|w|v${INSIGHTS.factsVersion}`);
    expect(factsKey({ ...hangingGame(0), review: undefined }, 'w')).toBeNull();
  });

  it('a cache that throws falls back to computing', async () => {
    const broken: FactsCache = {
      getAll: () => Promise.reject(new Error('blocked')),
      put: () => Promise.reject(new Error('blocked')),
      prune: () => Promise.reject(new Error('blocked')),
    };
    const r = await loadInsightFacts({ records: hangingGames(2), cache: broken });
    expect(r).toMatchObject({ built: 2, fromCache: 0, cacheFailed: true });
    expect(r.facts).toHaveLength(2);
    const writeFails: FactsCache = { ...memoryFactsCache(), put: () => Promise.reject(new Error('full')) };
    const w = await loadInsightFacts({ records: hangingGames(2), cache: writeFails });
    expect(w.facts).toHaveLength(2);
    expect(w.cacheFailed).toBe(true);
    // No cache at all (no IndexedDB here, as in jsdom).
    expect((await loadInsightFacts({ records: hangingGames(2), cache: null })).facts).toHaveLength(2);
  });

  it('counts what was left out, and keeps unreviewed games in the history', async () => {
    const unreviewed = makeGame({ id: 'u1', result: '0-1', reviewed: false, createdAt: '2026-09-01T00:00:00.000Z' });
    const shallow = makeGame({ id: 's1', depth: 12, result: '1-0', createdAt: '2026-09-02T00:00:00.000Z' });
    const r = await loadInsightFacts({ records: [hangingGame(0), unreviewed, shallow], cache: null });
    expect(r.coverage).toEqual({ total: 3, included: 1, excluded: { unreviewed: 1, 'shallow-review': 1 } });
    expect(r.history.map((h) => h.gameId)).toEqual(['u1', 's1', 'hang-0']);
  });

  it('server facts merge in by game id: local wins, other versions are dropped, failures ignored', async () => {
    const local = buildGameFacts(hangingGame(0))!;
    const remoteSame: GameFacts = { ...local, opponentName: 'from server' };
    const remoteNew: GameFacts = { ...local, gameId: 'elsewhere' };
    const remoteOld: GameFacts = { ...local, gameId: 'old', factsVersion: INSIGHTS.factsVersion - 1 };
    const m = mergeServerFacts([local], [remoteSame, remoteNew, remoteOld, remoteNew]);
    expect(m.added).toBe(1);
    expect(m.facts.map((f) => [f.gameId, f.opponentName])).toEqual([
      ['hang-0', local.opponentName],
      ['elsewhere', local.opponentName],
    ]);
    const r = await loadInsightFacts({ records: [hangingGame(0)], cache: null, serverSource: async () => ({ facts: [remoteNew] }) });
    expect(r.fromServer).toBe(1);
    expect(r.coverage).toMatchObject({ total: 2, included: 2 });
    expect(r.coachLinked).toBe(false);
    // The server's coverage and history are preferred; games only on this device add to them.
    const withMeta = await loadInsightFacts({
      records: [hangingGame(0), hangingGame(1)],
      cache: null,
      serverSource: async () => ({
        factsVersion: INSIGHTS.factsVersion,
        facts: [buildGameFacts(hangingGame(0))!, remoteNew],
        coverage: { total: 9, included: 2, excluded: { unreviewed: 7 } },
        history: [{ gameId: 'elsewhere', playedAt: '2026-09-01T00:00:00.000Z', score: 0 }],
        coachLinked: true,
      }),
    });
    expect(withMeta.coverage).toEqual({ total: 10, included: 3, excluded: { unreviewed: 7 } });
    expect(withMeta.history.map((h) => h.gameId)).toEqual(['elsewhere', 'hang-0', 'hang-1']);
    expect(withMeta.coachLinked).toBe(true);
    // A server on another facts version: none of its facts are used.
    const otherVersion = await loadInsightFacts({
      records: [hangingGame(0)],
      cache: null,
      serverSource: async () => ({ factsVersion: INSIGHTS.factsVersion + 1, facts: [remoteNew], coachLinked: true }),
    });
    expect(otherVersion.facts.map((f) => f.gameId)).toEqual(['hang-0']);
    const down = await loadInsightFacts({ records: [hangingGame(0)], cache: null, serverSource: () => Promise.reject(new Error('offline')) });
    expect(down.facts).toHaveLength(1);
  });
});

describe('Focus storage and sync', () => {
  const facts = hangingGames(22).map((g) => buildGameFacts(g)!);
  const focus = startFocus(facts, 'O:hanging', new Date('2026-11-01T00:00:00Z'));
  const raw = (f: object) => JSON.stringify(f);

  it('parses what it stored; malformed is null', () => {
    expect(parseStoredFocus(raw(focus))).toEqual(focus);
    expect(parseStoredFocus('{oops')).toBeNull();
    expect(parseStoredFocus(raw({ ...focus, baselineRate: 'x' }))).toBeNull();
    expect(activeFocus({ ...focus, endedAt: '2026-11-02T00:00:00Z' })).toBeNull();
    expect(activeFocus(focus)).toBe(focus);
  });

  it('rookery.focus is synced, and the newest startedAt wins', () => {
    expect(syncKind('rookery.focus')).toBe('focus');
    const older = raw(focus);
    const newer = raw({ ...focus, bucketId: 'M:fork', startedAt: '2026-11-05T00:00:00.000Z' });
    expect(mergeFocus(older, newer)).toBe(newer);
    expect(mergeFocus(newer, older)).toBe(newer);
    expect(mergeFocus(null, older)).toBe(older);
    expect(mergeFocus(older, null)).toBe(older);
    // Same Focus, ended on one device: ended everywhere.
    const ended = raw({ ...focus, endedAt: '2026-11-03T00:00:00.000Z', endReason: 'stopped' });
    expect(mergeFocus(older, ended)).toBe(ended);
    expect(mergeFocus(ended, older)).toBe(ended);
    // Through mergeItem, whichever device's stamp is newer.
    const item = (value: string | null, updatedAt: number) => ({ value, updatedAt });
    expect(mergeItem('focus', item(older, 900), item(newer, 100))!.value).toBe(newer);
    expect(mergeItem('focus', item(newer, 100), item(older, 900))!.value).toBe(newer);
    expect(mergeItem('focus', item(null, 900), item(older, 100))!.value).toBe(older);
  });

  it('normalizes: a Focus string passes, anything else is not a Focus', () => {
    expect(normalizeValue('focus', raw(focus))).toBe(raw(focus));
    expect(normalizeValue('focus', null)).toBeNull();
    expect(normalizeValue('focus', '{"bucketId":1}')).toBeUndefined();
    expect(normalizeValue('focus', { bucketId: 'x' })).toBeUndefined();
  });
});

describe('process measures', () => {
  it('counts training since the start, motif cards passed at their week check, the lesson and the drill', () => {
    const records = hangingGames(3);
    const mistakes = harvestMistakes(records);
    const hanging = mistakesForMotif(mistakes, records, 'hanging');
    expect(hanging.length).toBeGreaterThan(0);
    expect(mistakesForMotif(mistakes, records, 'fork')).toEqual([]);
    const id = hanging[0].id;
    const p = processMeasures({
      startedAt: '2026-11-01T12:00:00.000Z',
      motif: 'hanging',
      train: { kind: 'mistakes', href: '#/puzzles', motif: 'hanging' },
      log: { updatedAt: '', days: { '2026-10-30': { puzzle: { n: 9, sec: 1 } }, '2026-11-02': { puzzle: { n: 4, sec: 1 }, lesson: { n: 1, sec: 1 } } } },
      schedule: { [id]: { stage: PASSED_WEEK_STAGE, due: '2026-12-01', retired: false } },
      mistakes: hanging,
      lessons: emptyLessonsProgress(),
      endgames: emptyProgress(),
    });
    expect(p).toMatchObject({ puzzles: 4, lessons: 1, endgames: 0, mistakes: { total: hanging.length, passed: 1 }, lesson: null, drill: null });
    const lesson = processMeasures({
      startedAt: '2026-11-01T12:00:00.000Z',
      train: { kind: 'lesson', href: '#/lessons', lessonId: 'forks' },
      log: { updatedAt: '', days: {} },
      schedule: {},
      mistakes: null,
      lessons: { updatedAt: '', lessons: { forks: { doneAt: '2026-11-03T00:00:00.000Z', times: 1, clean: true } } },
      endgames: { updatedAt: '', drills: { kqk: { attempts: 1, passes: 1, best: 'passed', lastAt: '2026-11-04T00:00:00.000Z' } } },
    });
    expect(lesson.lesson).toEqual({ id: 'forks', done: true, doneSince: true });
    expect(PASSED_WEEK_STAGE).toBe(4);
  });
});

describe('deep links', () => {
  it('review positions round-trip', () => {
    expect(reviewHref('a b', 12)).toBe('#/review/a%20b?ply=12');
    expect(parseReviewHash('#/review/a%20b?ply=12')).toEqual({ gameId: 'a b', ply: 12 });
    expect(parseReviewHash('#/review/g1')).toEqual({ gameId: 'g1', ply: undefined });
    expect(parseReviewHash('#/review/g1?ply=x')).toEqual({ gameId: 'g1', ply: undefined });
    expect(parseReviewHash('#/review')).toEqual({ gameId: undefined, ply: undefined });
    expect(parseReviewHash('#/play')).toEqual({ gameId: undefined, ply: undefined });
  });

  it('Train this targets land on the motif, lesson or drill', () => {
    expect(trainHref({ kind: 'mistakes', href: '#/puzzles', motif: 'hanging' })).toBe('#/puzzles/mistakes/hanging');
    expect(trainHref({ kind: 'lesson', href: '#/lessons', lessonId: 'forks' })).toBe('#/lessons/forks');
    expect(trainHref({ kind: 'endgames', href: '#/endgames', drillId: 'kqk' })).toBe('#/endgames/kqk');
    expect(trainHref({ kind: 'endgames', href: '#/endgames' })).toBe('#/endgames');
    expect(trainHref({ kind: 'openings', href: '#/openings' })).toBe('#/openings');
    expect(mistakesMotifFromHash('#/puzzles/mistakes/hanging')).toBe('hanging');
    expect(mistakesMotifFromHash('#/puzzles/mistakes/other')).toBeNull();
    expect(mistakesMotifFromHash('#/puzzles/mistakes/nope')).toBeNull();
    expect(subPath('#/lessons/forks', '#/lessons')).toBe('forks');
    expect(subPath('#/lessons', '#/lessons')).toBeNull();
  });
});
