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
