import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePgnTree } from '../../src/game/pgnTree';
import { START_FEN } from '../../src/game/rules';
import { toEpd } from '../../src/openings/openings';

// The drill store with a fresh repertoire store per test (both read localStorage on load).
async function fresh() {
  vi.resetModules();
  const reps = await import('../../src/openings/repertoireStore');
  const drill = await import('../../src/openings/drillStore');
  return { reps: reps.useRepertoireStore, drill: drill.useDrillStore, KEY: reps.REPERTOIRES_KEY };
}

const mv = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });

describe('opening drill', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 10));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deleting a repertoire leaves a delete marker that later changes keep (for account sync)', async () => {
    const { reps, KEY } = await fresh();
    const a = reps.getState().create('A', 'w');
    const b = reps.getState().create('B', 'b');
    reps.getState().remove(a);
    reps.getState().rename(b, 'B2');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.repertoires.map((r: { id: string }) => r.id)).toEqual([b]);
    expect(Object.keys(stored.deleted)).toEqual([a]);
    expect(stored.deleted[a]).toMatch(/^2026-10-16T/);
    expect((await fresh()).reps.getState().data.deleted).toEqual(stored.deleted);
  });

  it('persists repertoires in one key with updatedAt, and edits prune cards', async () => {
    const { reps, KEY } = await fresh();
    const id = reps.getState().create('Spanish', 'w', parsePgnTree('1. e4 e5 2. Nf3 *'));
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-16');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.updatedAt).toMatch(/^2026-10-16T/);
    expect(stored.repertoires[0].name).toBe('Spanish');
    expect(Object.keys(stored.cards[id])).toHaveLength(1);
    reps.getState().rename(id, 'Ruy Lopez');
    reps.getState().setTree(id, parsePgnTree('1. d4 *'));
    const after = (await fresh()).reps.getState().data;
    expect(after.repertoires[0].name).toBe('Ruy Lopez');
    // The start position is still a card (now answered by 1.d4), so its record stays.
    expect(Object.keys(after.cards[id])).toHaveLength(1);
    reps.getState().remove(id);
    expect(JSON.parse(localStorage.getItem(KEY)!).repertoires).toEqual([]);
  });

  it('learn mode shows new moves, then asks the line from memory and schedules it', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('Italian', 'w', parsePgnTree('1. e4 e5 2. Nf3 {Develop and hit e5} *'));
    expect(drill.getState().start(id, 'learn')).toBe(true);
    expect(drill.getState()).toMatchObject({ phase: 'user', arrow: 'e2e4', pass: 'show' });
    expect(drill.getState().move(mv('e2e4'))).toBe(true);
    expect(drill.getState().phase).toBe('opponent');
    vi.runOnlyPendingTimers();
    expect(drill.getState()).toMatchObject({ phase: 'user', arrow: 'g1f3' });
    drill.getState().move(mv('g1f3'));
    expect(drill.getState().plan).toBe('Develop and hit e5');
    // Nothing recorded while being shown.
    expect(reps.getState().data.cards[id] ?? {}).toEqual({});
    vi.runOnlyPendingTimers();
    expect(drill.getState()).toMatchObject({ pass: 'quiz', phase: 'user', arrow: null, index: 0 });
    drill.getState().move(mv('e2e4'));
    vi.runOnlyPendingTimers();
    // A wrong move: the right one is shown and the card fails.
    expect(drill.getState().move(mv('f1c4'))).toBe(false);
    expect(drill.getState()).toMatchObject({ phase: 'wrong', arrow: 'g1f3' });
    expect(drill.getState().move(mv('g1f3'))).toBe(true);
    expect(drill.getState().phase).toBe('done');
    const cards = reps.getState().data.cards[id];
    expect(cards[toEpd(START_FEN)]).toMatchObject({ stage: 1, due: '2026-10-17', fails: 0 });
    const afterE5 = Object.entries(cards).find(([k]) => k !== toEpd(START_FEN))![1];
    expect(afterE5).toMatchObject({ stage: 0, fails: 1, due: '2026-10-17' });
    expect(drill.getState().feedback?.text).toBe('Line complete: 1 of 2 right first time');
  });

  it('due mode has nothing to do until a card is due', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    expect(drill.getState().start(id, 'due')).toBe(false);
    expect(drill.getState().phase).toBe('empty');
    reps.getState().answer(id, toEpd(START_FEN), false, '2026-10-15');
    expect(drill.getState().start(id, 'due')).toBe(true);
    // 1.d4 is due and asked from memory; 2.Bf4 was never learned, so it is shown.
    expect(drill.getState()).toMatchObject({ phase: 'user', arrow: null });
    drill.getState().move(mv('d2d4'));
    vi.runOnlyPendingTimers();
    expect(drill.getState()).toMatchObject({ phase: 'user', arrow: 'c1f4', shown: true });
    drill.getState().move(mv('c1f4'));
    expect(drill.getState().phase).toBe('done');
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toMatchObject({ stage: 1, reps: 2 });
    expect(Object.keys(reps.getState().data.cards[id])).toHaveLength(1);
  });

  it('practice runs a learned line off the schedule: right answers change nothing, a miss counts', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    expect(drill.getState().start(id, 'practice')).toBe(false);
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-16');
    const before = reps.getState().data.cards[id][toEpd(START_FEN)];
    expect(before.due).toBe('2026-10-17');
    expect(drill.getState().start(id, 'practice')).toBe(true);
    expect(drill.getState()).toMatchObject({ mode: 'practice', pass: 'quiz', phase: 'user', arrow: null });
    drill.getState().move(mv('d2d4'));
    vi.runOnlyPendingTimers();
    // 2.Bf4 was never learned: shown, not recorded.
    expect(drill.getState()).toMatchObject({ arrow: 'c1f4', shown: true });
    drill.getState().move(mv('c1f4'));
    expect(drill.getState().phase).toBe('done');
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toEqual(before);
    expect(Object.keys(reps.getState().data.cards[id])).toHaveLength(1);
    // Again, with a miss: that is recorded.
    expect(drill.getState().start(id, 'practice')).toBe(true);
    expect(drill.getState().move(mv('e2e4'))).toBe(false);
    drill.getState().move(mv('d2d4'));
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toMatchObject({ stage: 0, fails: 1, reps: 2 });
  });

  it('weak drills only lines with a missed position', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-15');
    expect(drill.getState().start(id, 'weak')).toBe(false);
    reps.getState().answer(id, toEpd(START_FEN), false, '2026-10-16');
    expect(drill.getState().start(id, 'weak')).toBe(true);
    expect(drill.getState()).toMatchObject({ mode: 'weak', phase: 'user', arrow: null });
  });

  it('a move from another line of the repertoire is not a mistake', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('Both', 'w', parsePgnTree('1. e4 (1. d4) *'));
    reps.getState().answer(id, toEpd(START_FEN), false, '2026-10-15');
    drill.getState().start(id, 'due');
    const line = drill.getState().steps[0].uci;
    const other = line === 'e2e4' ? 'd2d4' : 'e2e4';
    expect(drill.getState().move(mv(other))).toBe(false);
    expect(drill.getState()).toMatchObject({ phase: 'user', failed: [] });
  });
});
