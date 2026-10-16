import { describe, expect, it } from 'vitest';
import type { StateItem } from '../../src/api/types';
import type { CardState, Schedule } from '../../src/puzzles/spacedRepetition';
import { schedule } from '../../src/puzzles/spacedRepetition';
import { SYNC_KEYS, syncKind } from '../../src/sync/keys';
import {
  emptyValue,
  mergeDaily,
  mergeItem,
  mergeSchedules,
  mergeTrainedDays,
  normalizeValue,
  pickCard,
  reconcile,
  reviewedOn,
} from '../../src/sync/merge';

const IV = [1, 3, 7, 21];
const card = (stage: number, due: string, retired = false): CardState => ({ stage, due, retired });
const item = (value: unknown, updatedAt: number): StateItem => ({ value, updatedAt });

describe('keys', () => {
  it('allowlists preferences and training state, never device caches', () => {
    for (const k of ['rookery.boardTheme', 'rookery.pieceSet', 'rookery.playSettings', 'rookery.reviewPrefs', 'rookery.gameMode', 'rookery.hangingGlow'])
      expect(syncKind(k)).toBe('pref');
    expect(syncKind('rookery.mistakes')).toBe('mistakes');
    expect(syncKind('rookery.trainedDays')).toBe('trainedDays');
    expect(syncKind('rookery.daily')).toBe('daily');
    for (const k of ['rookery.current', 'rookery.games', 'rookery.analysis', 'rookery.unsynced', 'rookery.puzzles', 'rookery.muted', 'rookery.sync', 'toString', '__proto__'])
      expect(syncKind(k), k).toBeNull();
  });
});

describe('normalizeValue', () => {
  it('preferences are strings or null', () => {
    expect(normalizeValue('pref', 'green')).toBe('green');
    expect(normalizeValue('pref', null)).toBeNull();
    expect(normalizeValue('pref', 3)).toBeUndefined();
    expect(normalizeValue('pref', {})).toBeUndefined();
    expect(normalizeValue('pref', 'x'.repeat(5000))).toBeUndefined();
  });

  it('schedules: sorted ids, bad cards dropped, extra fields stripped', () => {
    const v = normalizeValue('mistakes', {
      z: { stage: 1, due: '2026-10-17', retired: false, extra: 1 },
      a: { stage: 0, due: '2026-10-18', retired: false },
      bad1: { stage: -1, due: '2026-10-18', retired: false },
      bad2: { stage: 1, due: 'soon', retired: false },
      bad3: null,
    });
    expect(Object.keys(v as Schedule)).toEqual(['a', 'z']);
    expect((v as Schedule).z).toEqual(card(1, '2026-10-17'));
    expect(normalizeValue('mistakes', [])).toBeUndefined();
    expect(normalizeValue('mistakes', 'x')).toBeUndefined();
  });

  it('trained days: valid, unique, sorted, capped', () => {
    expect(normalizeValue('trainedDays', ['2026-10-16', 'nope', '2026-10-14', '2026-10-16', 5])).toEqual(['2026-10-14', '2026-10-16']);
    expect(normalizeValue('trainedDays', {})).toBeUndefined();
  });

  it('daily: a record or null', () => {
    expect(normalizeValue('daily', { day: '2026-10-16', id: 'p', solved: 1 })).toEqual({ day: '2026-10-16', id: 'p', solved: false });
    expect(normalizeValue('daily', null)).toBeNull();
    expect(normalizeValue('daily', { day: 'x', id: 'p' })).toBeUndefined();
  });

  it('empty values', () => {
    expect(emptyValue('pref')).toBeNull();
    expect(emptyValue('mistakes')).toEqual({});
    expect(emptyValue('trainedDays')).toEqual([]);
    expect(emptyValue('daily')).toBeNull();
  });
});

describe('spaced repetition merge', () => {
  it('works the review day back from the schedule', () => {
    // These agree with the scheduler itself.
    const today = '2026-10-16';
    expect(reviewedOn(schedule(undefined, false, today, IV), IV)).toBe(today);
    let c = schedule(undefined, true, today, IV);
    expect(reviewedOn(c, IV)).toBe(today);
    c = schedule(c, true, today, IV);
    expect(reviewedOn(c, IV)).toBe(today);
    for (let i = 0; i < 5; i++) c = schedule(c, true, today, IV);
    expect(c.retired).toBe(true);
    expect(reviewedOn(c, IV)).toBe(today);
  });

  it('the later review wins, even when it was a fail', () => {
    const passedEarlier = card(2, '2026-10-20'); // reviewed 10-17 (3-day gap)
    const failedLater = card(0, '2026-10-19'); // reviewed 10-18
    expect(pickCard(passedEarlier, failedLater, IV)).toBe(failedLater);
    expect(pickCard(failedLater, passedEarlier, IV)).toBe(failedLater);
  });

  it('same review day: retired, then higher stage, then later due', () => {
    expect(pickCard(card(4, '2026-10-16', true), card(0, '2026-10-17'), IV).retired).toBe(true);
    expect(pickCard(card(1, '2026-10-17'), card(2, '2026-10-19'), IV).stage).toBe(2);
    expect(pickCard(card(1, '2026-10-17'), card(1, '2026-10-17'), IV)).toEqual(card(1, '2026-10-17'));
  });

  it('unions puzzles and is commutative and idempotent', () => {
    const a: Schedule = { p1: card(2, '2026-10-20'), p2: card(0, '2026-10-17') };
    const b: Schedule = { p1: card(0, '2026-10-19'), p3: card(1, '2026-10-18', false) };
    const ab = mergeSchedules(a, b, IV);
    expect(ab).toEqual({ p1: card(0, '2026-10-19'), p2: card(0, '2026-10-17'), p3: card(1, '2026-10-18') });
    expect(mergeSchedules(b, a, IV)).toEqual(ab);
    expect(mergeSchedules(ab, ab, IV)).toEqual(ab);
    expect(mergeSchedules(ab, a, IV)).toEqual(ab);
    expect(mergeSchedules({}, {}, IV)).toEqual({});
  });
});

describe('trained days and daily', () => {
  it('trained days: union, sorted, capped to the newest', () => {
    expect(mergeTrainedDays(['2026-10-14', '2026-10-16'], ['2026-10-15', '2026-10-16'])).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(mergeTrainedDays(['2026-10-01', '2026-10-03'], ['2026-10-02'], 2)).toEqual(['2026-10-02', '2026-10-03']);
    expect(mergeTrainedDays([], [])).toEqual([]);
  });

  it('daily: later day wins; same puzzle keeps a solve', () => {
    const d = (day: string, id: string, solved = false) => ({ day, id, solved });
    expect(mergeDaily(d('2026-10-15', 'a', true), d('2026-10-16', 'b'))).toEqual(d('2026-10-16', 'b'));
    expect(mergeDaily(d('2026-10-16', 'a', true), d('2026-10-16', 'a'))).toEqual(d('2026-10-16', 'a', true));
    expect(mergeDaily(d('2026-10-16', 'a'), d('2026-10-16', 'a', true))).toEqual(d('2026-10-16', 'a', true));
    expect(mergeDaily(null, d('2026-10-16', 'a'))).toEqual(d('2026-10-16', 'a'));
    expect(mergeDaily(d('2026-10-16', 'a'), null)).toEqual(d('2026-10-16', 'a'));
    // Different picks on the same day: the solved one, else the smaller id, whichever order.
    expect(mergeDaily(d('2026-10-16', 'b', true), d('2026-10-16', 'a'))).toEqual(d('2026-10-16', 'b', true));
    expect(mergeDaily(d('2026-10-16', 'b'), d('2026-10-16', 'a'))).toEqual(d('2026-10-16', 'a'));
    expect(mergeDaily(d('2026-10-16', 'a'), d('2026-10-16', 'b'))).toEqual(d('2026-10-16', 'a'));
  });
});

describe('mergeItem', () => {
  it('preferences: newer wins; a tie keeps the stored (second) one', () => {
    expect(mergeItem('pref', item('green', 2), item('blue', 1))).toEqual(item('green', 2));
    expect(mergeItem('pref', item('green', 1), item('blue', 2))).toEqual(item('blue', 2));
    expect(mergeItem('pref', item('green', 5), item('blue', 5))).toEqual(item('blue', 5));
    expect(mergeItem('pref', item(null, 9), item('blue', 5))).toEqual(item(null, 9));
    expect(mergeItem('pref', undefined, item('blue', 5))).toEqual(item('blue', 5));
    expect(mergeItem('pref', undefined, undefined)).toBeUndefined();
  });

  it('training state merges whatever the timestamps say, keeping the newer stamp', () => {
    const m = mergeItem('trainedDays', item(['2026-10-16'], 1), item(['2026-10-15'], 9));
    expect(m).toEqual(item(['2026-10-15', '2026-10-16'], 9));
  });
});

describe('reconcile', () => {
  const blank = (): Record<string, StateItem> =>
    Object.fromEntries(Object.entries(SYNC_KEYS).map(([k, kind]) => [k, item(emptyValue(kind), 0)]));

  it('a fresh device and an empty account: nothing to do', () => {
    expect(reconcile(blank(), {})).toEqual({ write: {}, push: {} });
  });

  it('first sign-in: local choices go up, untouched defaults do not', () => {
    const local = { ...blank(), 'rookery.boardTheme': item('green', 0), 'rookery.gameMode': item(null, 50) };
    const { write, push } = reconcile(local, {});
    expect(write).toEqual({});
    expect(push).toEqual({ 'rookery.boardTheme': item('green', 0), 'rookery.gameMode': item(null, 50) });
  });

  it('a new device takes the account copy over its own never-touched values', () => {
    const local = { ...blank(), 'rookery.boardTheme': item('wood', 0) };
    const remote = { 'rookery.boardTheme': item('green', 0), 'rookery.pieceSet': item('merida', 100) };
    const { write, push } = reconcile(local, remote);
    expect(write).toEqual(remote);
    expect(push).toEqual({});
  });

  it('a newer local change goes up; an older one is replaced', () => {
    const local = { ...blank(), 'rookery.boardTheme': item('green', 200), 'rookery.pieceSet': item('pixel', 100) };
    const remote = { 'rookery.boardTheme': item('blue', 100), 'rookery.pieceSet': item('merida', 200) };
    const { write, push } = reconcile(local, remote);
    expect(push).toEqual({ 'rookery.boardTheme': item('green', 200) });
    expect(write).toEqual({ 'rookery.pieceSet': item('merida', 200) });
  });

  it('training state: writes the merge locally and pushes it when the account lacks something', () => {
    const local = { ...blank(), 'rookery.trainedDays': item(['2026-10-16'], 300) };
    const remote = { 'rookery.trainedDays': item(['2026-10-15'], 100) };
    const { write, push } = reconcile(local, remote);
    expect(write['rookery.trainedDays']).toEqual(item(['2026-10-15', '2026-10-16'], 300));
    expect(push['rookery.trainedDays']).toEqual(item(['2026-10-15', '2026-10-16'], 300));
  });

  it('equal values only update the stamp, and push nothing', () => {
    const local = { ...blank(), 'rookery.boardTheme': item('green', 0) };
    const { write, push } = reconcile(local, { 'rookery.boardTheme': item('green', 70) });
    expect(write).toEqual({ 'rookery.boardTheme': item('green', 70) });
    expect(push).toEqual({});
  });

  it('ignores malformed and unknown remote entries', () => {
    const local = { ...blank(), 'rookery.trainedDays': item(['2026-10-16'], 5) };
    const { write, push } = reconcile(local, {
      'rookery.trainedDays': item('garbage', 9),
      'rookery.games': item('[]', 9),
    });
    expect(write).toEqual({});
    expect(push).toEqual({ 'rookery.trainedDays': item(['2026-10-16'], 5) });
  });

  it('converges: after the server applies the push, a second reconcile has nothing to do', () => {
    const local = {
      ...blank(),
      'rookery.boardTheme': item('green', 500),
      'rookery.mistakes': item({ p1: card(1, '2026-10-17') }, 400),
      'rookery.daily': item({ day: '2026-10-16', id: 'a', solved: true }, 400),
    };
    const remote: Record<string, StateItem> = {
      'rookery.boardTheme': item('blue', 100),
      'rookery.mistakes': item({ p2: card(0, '2026-10-17') }, 300),
      'rookery.daily': item({ day: '2026-10-16', id: 'a', solved: false }, 300),
    };
    const first = reconcile(local, remote);
    // The server stores mergeItem(incoming, stored) for each pushed key.
    const server = { ...remote };
    for (const [k, it] of Object.entries(first.push)) server[k] = mergeItem(SYNC_KEYS[k], it, server[k])!;
    const after: Record<string, StateItem> = { ...local, ...first.write };
    const second = reconcile(after, server);
    expect(second.push).toEqual({});
    expect(Object.keys(second.write).every((k) => JSON.stringify(second.write[k].value) === JSON.stringify(after[k].value))).toBe(true);
  });

  it('two devices that never changed a setting settle on one value instead of trading it', () => {
    const phone = { ...blank(), 'rookery.boardTheme': item('wood', 0) };
    const laptop = { ...blank(), 'rookery.boardTheme': item('green', 0) };
    let server: Record<string, StateItem> = {};
    for (const device of [phone, laptop, phone, laptop]) {
      const { write, push } = reconcile(device, server);
      Object.assign(device, write);
      for (const [k, it] of Object.entries(push)) server = { ...server, [k]: mergeItem(SYNC_KEYS[k], it, server[k])! };
    }
    expect(phone['rookery.boardTheme'].value).toBe('wood');
    expect(laptop['rookery.boardTheme'].value).toBe('wood');
    expect(server['rookery.boardTheme'].value).toBe('wood');
  });
});

describe('stamped records (endgames, timed bests, training log)', () => {
  const rec = (updatedAt: string, best: number) => JSON.stringify({ updatedAt, best });

  it('are allowlisted', () => {
    for (const k of ['rookery.endgames', 'rookery.timedBest', 'rookery.trainingLog']) expect(syncKind(k)).toBe('stamped');
    expect(syncKind('rookery.repertoires')).toBe('repertoires');
  });

  it('the newer embedded updatedAt wins, whatever the change times say', () => {
    const older = item(rec('2026-10-01T00:00:00Z', 5), 900);
    const newer = item(rec('2026-10-02T00:00:00Z', 3), 0);
    expect(mergeItem('stamped', older, newer)).toBe(newer);
    expect(mergeItem('stamped', newer, older)).toBe(newer);
    // Numeric stamps too.
    expect(mergeItem('stamped', item(JSON.stringify({ updatedAt: 5 }), 0), item(JSON.stringify({ updatedAt: 4 }), 9))!.value).toBe(
      JSON.stringify({ updatedAt: 5 }),
    );
  });

  it('without usable stamps it falls back to the change time', () => {
    expect(mergeItem('stamped', item('{"x":1}', 5), item('{"x":2}', 3))!.value).toBe('{"x":1}');
    expect(mergeItem('stamped', item(null, 5), item(rec('2026-10-02T00:00:00Z', 3), 3))!.value).toBeNull();
    expect(normalizeValue('stamped', 4)).toBeUndefined();
  });
});

describe('opening repertoires', () => {
  const tree = (moves: string) => ({ rootId: 'r', headers: [], nodes: { r: { moves } } });
  const rep = (id: string, updatedAt: string, moves = 'e4', createdAt = '2026-10-01T00:00:00Z') => ({
    id,
    name: id,
    color: 'w',
    tree: tree(moves),
    createdAt,
    updatedAt,
  });
  const rc = (stage: number, due: string, reps: number, fails = 0) => ({ stage, due, retired: false, reps, fails });
  const data = (updatedAt: string, repertoires: unknown[], cards: Record<string, unknown>) =>
    normalizeValue('repertoires', { version: 1, updatedAt, repertoires, cards }) as never;

  it('normalizes: drops bad cards and cards of unknown repertoires, sorts keys deeply', () => {
    const v = normalizeValue('repertoires', {
      version: 1,
      updatedAt: 'x',
      repertoires: [{ updatedAt: '2', id: 'b', createdAt: '2' }, { id: 'a', createdAt: '1', updatedAt: '1' }, { nope: 1 }],
      cards: { a: { k2: rc(1, '2026-10-17', 1), bad: { stage: 1 } }, ghost: { k: rc(1, '2026-10-17', 1) } },
    }) as { repertoires: { id: string }[]; cards: Record<string, Record<string, unknown>> };
    expect(v.repertoires.map((r) => r.id)).toEqual(['a', 'b']);
    expect(Object.keys(v.repertoires[1])).toEqual(['createdAt', 'id', 'updatedAt']);
    expect(v.cards).toEqual({ a: { k2: rc(1, '2026-10-17', 1) } });
    expect(normalizeValue('repertoires', { repertoires: 'x' })).toBeUndefined();
    expect(normalizeValue('repertoires', null)).toBeNull();
  });

  it('unions repertoires by id, the newer one wins; cards merge per position', () => {
    const phone = data('2026-10-16T10:00:00Z', [rep('a', '2026-10-16T10:00:00Z', 'e4 e5'), rep('b', '2026-10-10T00:00:00Z')], {
      a: { p1: rc(2, '2026-10-20', 2), p2: rc(0, '2026-10-17', 3, 1) },
    });
    const laptop = data('2026-10-15T00:00:00Z', [rep('a', '2026-10-15T00:00:00Z', 'e4'), rep('c', '2026-10-12T00:00:00Z', 'd4', '2026-10-12T00:00:00Z')], {
      a: { p1: rc(0, '2026-10-19', 3, 1), p3: rc(1, '2026-10-18', 1) },
      c: { q: rc(1, '2026-10-13', 1) },
    });
    const m = mergeItem('repertoires', item(phone, 2), item(laptop, 1))!.value as {
      updatedAt: string;
      repertoires: { id: string; tree: unknown }[];
      cards: Record<string, Record<string, unknown>>;
    };
    expect(m.updatedAt).toBe('2026-10-16T10:00:00Z');
    expect(m.repertoires.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(m.repertoires[0].tree).toEqual(tree('e4 e5'));
    // p1: laptop reviewed it later (failed 10-18) than the phone (passed 10-17).
    expect(m.cards.a).toEqual({ p1: rc(0, '2026-10-19', 3, 1), p2: rc(0, '2026-10-17', 3, 1), p3: rc(1, '2026-10-18', 1) });
    expect(m.cards.c).toEqual({ q: rc(1, '2026-10-13', 1) });
    // Commutative and idempotent.
    expect(mergeItem('repertoires', item(laptop, 1), item(phone, 2))!.value).toEqual(m);
    expect(JSON.stringify(mergeItem('repertoires', item(m, 2), item(phone, 2))!.value)).toBe(JSON.stringify(m));
  });

  it('a card answered more wins a schedule tie', () => {
    const a = data('t', [rep('a', 't')], { a: { p: rc(1, '2026-10-17', 4) } });
    const b = data('t', [rep('a', 't')], { a: { p: rc(1, '2026-10-17', 2) } });
    const m = (x: unknown, y: unknown) => (mergeItem('repertoires', item(x, 0), item(y, 0))!.value as { cards: Record<string, Record<string, { reps: number }>> }).cards.a.p.reps;
    expect(m(a, b)).toBe(4);
    expect(m(b, a)).toBe(4);
  });

  it('survives a jsonb key reorder without wanting to push again', () => {
    const local = data('t', [rep('a', 't')], { a: { p: rc(1, '2026-10-17', 1) } });
    const reordered = JSON.parse(JSON.stringify(local, (_k, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
    )) as unknown;
    const { push } = reconcile({ 'rookery.repertoires': item(local, 5) }, { 'rookery.repertoires': item(reordered, 5) }, { 'rookery.repertoires': 'repertoires' });
    expect(push).toEqual({});
  });
});
