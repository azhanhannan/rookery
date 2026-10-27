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
    // The missed move is asked once more from its own position (not recorded), so the line ends on a right move.
    vi.runOnlyPendingTimers();
    expect(drill.getState()).toMatchObject({ pass: 'recap', phase: 'user', index: 2, arrow: null });
    expect(drill.getState().move(mv('f1c4'))).toBe(false);
    expect(drill.getState().feedback?.text).toBe('Here it is: Nf3');
    expect(drill.getState().move(mv('g1f3'))).toBe(true);
    expect(drill.getState().phase).toBe('done');
    const cards = reps.getState().data.cards[id];
    expect(cards[toEpd(START_FEN)]).toMatchObject({ stage: 1, due: '2026-10-17', fails: 0 });
    const afterE5 = Object.entries(cards).find(([k]) => k !== toEpd(START_FEN))![1];
    // Missed seconds after being shown: back tomorrow at the first step, but not counted as a miss.
    expect(afterE5).toMatchObject({ stage: 0, fails: 0, due: '2026-10-17' });
    expect(drill.getState().feedback?.text).toBe('Line complete: 1 of 2 from memory, and you fixed the other one');
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
    // The shown move is named, so the summary accounts for both of the line's moves.
    expect(drill.getState().feedback?.text).toBe('Line complete: all 1 from memory. 1 new move shown');
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toMatchObject({ stage: 1, reps: 2 });
    expect(Object.keys(reps.getState().data.cards[id])).toHaveLength(1);
  });

  it('practice runs a learned line off the schedule: nothing it does changes the cards', async () => {
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
    // Again, with a miss: still not recorded.
    expect(drill.getState().start(id, 'practice')).toBe(true);
    expect(drill.getState().move(mv('e2e4'))).toBe(false);
    drill.getState().move(mv('d2d4'));
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toEqual(before);
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

  it('a move from another repertoire of the same colour is named, not a miss', async () => {
    const { reps, drill } = await fresh();
    const ruy = reps.getState().create('Ruy Lopez', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bb5 *'));
    reps.getState().create('Italian', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bc4 *'));
    expect(drill.getState().start(ruy, 'learn')).toBe(true);
    for (const m of ['e2e4', 'g1f3', 'f1b5']) {
      drill.getState().move(mv(m));
      vi.runOnlyPendingTimers();
    }
    vi.runOnlyPendingTimers();
    expect(drill.getState().pass).toBe('quiz');
    drill.getState().move(mv('e2e4'));
    vi.runOnlyPendingTimers();
    drill.getState().move(mv('g1f3'));
    vi.runOnlyPendingTimers();
    expect(drill.getState().move(mv('f1c4'))).toBe(false);
    expect(drill.getState()).toMatchObject({ phase: 'wrong', arrow: 'f1b5', failed: [] });
    expect(drill.getState().feedback?.text).toBe("That's your Italian move. In this line it's Bb5");
    expect(drill.getState().move(mv('f1b5'))).toBe(true);
    expect(drill.getState().feedback?.text).toBe('Line complete: all 3 from memory');
  });

  it('due mode stops after the daily cap, finishing the line in progress', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    const s = reps.getState();
    s.answer(id, toEpd(START_FEN), true, '2026-10-14');
    for (let i = 0; i < 11; i++) s.countReview('2026-10-16');
    // 11 of today's 12 are done.
    expect(drill.getState().start(id, 'due')).toBe(true);
    drill.getState().move(mv('d2d4'));
    expect(reps.getState().daily).toMatchObject({ day: '2026-10-16', reviews: 12 });
    vi.runOnlyPendingTimers();
    // The line goes on (2.Bf4 is new, so shown), and then the day is done.
    expect(drill.getState()).toMatchObject({ phase: 'user', arrow: 'c1f4' });
    drill.getState().move(mv('c1f4'));
    expect(drill.getState().phase).toBe('done');
    reps.getState().answer(id, toEpd(START_FEN), false, '2026-10-15');
    expect(drill.getState().start(id, 'due')).toBe(false);
    expect(drill.getState().phase).toBe('capped');
    // Other modes still work.
    expect(drill.getState().start(id, 'practice')).toBe(true);
  });

  it('resting stops the clock: resuming moves due dates on by the days rested', async () => {
    const { reps } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-10');
    reps.getState().rest(id, '2026-10-10');
    expect(reps.getState().data.repertoires[0].restedOn).toBe('2026-10-10');
    reps.getState().resume(id, '2026-10-16');
    expect(reps.getState().data.repertoires[0].restedOn).toBeUndefined();
    expect(reps.getState().data.cards[id][toEpd(START_FEN)].due).toBe('2026-10-17');
  });

  it('Learn teaches a long line a few new moves a day, one line a day', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('Long', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6 8. a4 *'));
    expect(drill.getState().start(id, 'learn')).toBe(true);
    // 8 new moves in the line, 6 a day: it stops after the 6th (O-O).
    expect(drill.getState().steps.filter((st) => st.user).map((st) => st.san)).toEqual(['e4', 'Nf3', 'Bc4', 'c3', 'd3', 'O-O']);
    const play = () => {
      for (const st of drill.getState().steps) {
        if (!st.user) continue;
        while (drill.getState().phase !== 'user') vi.runOnlyPendingTimers();
        drill.getState().move(mv(st.uci));
      }
    };
    play();
    vi.runOnlyPendingTimers();
    play();
    expect(drill.getState().phase).toBe('done');
    expect(reps.getState().daily).toMatchObject({ newMoves: 6, newLines: 1 });
    // Today's new line is done: Learn says so, and the rest waits for tomorrow.
    expect(drill.getState().start(id, 'learn')).toBe(false);
    expect(drill.getState()).toMatchObject({ phase: 'capped', mode: 'learn' });
    vi.setSystemTime(new Date(2026, 9, 17, 10));
    expect(drill.getState().start(id, 'learn')).toBe(true);
  });

  it('a position shared by two same-colour repertoires (same move) is answered once for both', async () => {
    const { reps, drill } = await fresh();
    const a = reps.getState().create('Italian', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bc4 *'));
    const b = reps.getState().create('Ruy Lopez', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bb5 *'));
    reps.getState().answer(a, toEpd(START_FEN), true, '2026-10-15');
    expect(reps.getState().data.cards[b][toEpd(START_FEN)]).toEqual(reps.getState().data.cards[a][toEpd(START_FEN)]);
    // The clash at move 3 is named before the move.
    expect(drill.getState().start(b, 'learn')).toBe(true);
    expect(drill.getState().cue).toHaveLength(1);
  });

  it('a Hint lights the piece; the due card then holds its step and the summary says so', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 {Bishop out before e3} *'));
    const s = reps.getState();
    s.answer(id, toEpd(START_FEN), true, '2026-10-12');
    s.answer(id, toEpd(START_FEN), true, '2026-10-13');
    const before = reps.getState().data.cards[id][toEpd(START_FEN)];
    expect(before.stage).toBe(2);
    expect(drill.getState().start(id, 'due')).toBe(true);
    drill.getState().hint();
    expect(drill.getState().hintSquare).toBe('d2');
    expect(drill.getState().move(mv('d2d4'))).toBe(true);
    const held = reps.getState().data.cards[id][toEpd(START_FEN)];
    expect(held).toMatchObject({ stage: 2, fails: 0, reps: 3, last: '2026-10-16', due: '2026-10-19' });
    vi.runOnlyPendingTimers();
    drill.getState().move(mv('c1f4'));
    expect(drill.getState().phase).toBe('done');
    expect(drill.getState().feedback?.text).toBe('Line complete: 0 of 1 from memory, 1 with a hint. 1 new move shown');
  });

  it('"Why …?" is always about your move: shown with a new move, hidden while asked, given with the answer after a miss', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('Italian', 'w', parsePgnTree('1. e4 {Centre} e5 2. Nf3 {Hit e5} Nc6 {Defends e5} 3. Bc4 {Aim at f7} *'));
    expect(drill.getState().start(id, 'learn')).toBe(true);
    // Learning: the new move comes with its reason, before it is played.
    expect(drill.getState()).toMatchObject({ arrow: 'e2e4', plan: 'Centre', planSan: 'e4', planHidden: false });
    drill.getState().move(mv('e2e4'));
    vi.runOnlyPendingTimers();
    drill.getState().move(mv('g1f3'));
    vi.runOnlyPendingTimers();
    // The opponent's comment is a note on their move; the reason on show is for your next (new) move.
    expect(drill.getState()).toMatchObject({ theirNote: { san: 'Nc6', text: 'Defends e5' }, plan: 'Aim at f7', planSan: 'Bc4' });
    drill.getState().move(mv('f1c4'));
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    // From memory: asked without a reason on show.
    expect(drill.getState()).toMatchObject({ pass: 'quiz', phase: 'user', plan: '', theirNote: null });
    drill.getState().move(mv('e2e4'));
    expect(drill.getState()).toMatchObject({ plan: 'Centre', planSan: 'e4', planHidden: true });
    vi.runOnlyPendingTimers();
    expect(drill.getState()).toMatchObject({ phase: 'user', plan: '', planSan: '' });
    // A miss: the right move comes with its own reason.
    expect(drill.getState().move(mv('f1c4'))).toBe(false);
    expect(drill.getState()).toMatchObject({ phase: 'wrong', plan: 'Hit e5', planSan: 'Nf3', planHidden: false });
  });

  it("a library opening's idea is its summary, not its first move's reason", async () => {
    const { reps, drill } = await fresh();
    const { LIBRARY } = await import('../../src/openings/library');
    const italian = LIBRARY.find((o) => o.id === 'italian')!;
    const id = reps.getState().create(italian.name, 'w', parsePgnTree(italian.pgn), italian.id);
    expect(drill.getState().start(id, 'learn')).toBe(true);
    expect(drill.getState().idea).toBe(italian.summary);
    expect(drill.getState()).toMatchObject({ planSan: 'e4', plan: expect.stringContaining('Take the centre') });
  });

  it('a library repertoire added before its reasons were written gets them from the library, progress untouched', async () => {
    const { reps, drill } = await fresh();
    // The Italian as it was copied on 26 Oct: no reason on 1.e4, a line name on 3...Nf6.
    const old = '1. e4 e5 2. Nf3 {Attack e5 and develop} Nc6 3. Bc4 {Aim at f7} Bc5 (3... Nf6 {Two Knights} 4. d3) 4. c3 *';
    const id = reps.getState().create('Italian Game', 'w', parsePgnTree(old));
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-15');
    const card = reps.getState().data.cards[id][toEpd(START_FEN)];
    expect(drill.getState().start(id, 'practice')).toBe(true);
    drill.getState().move(mv('e2e4'));
    expect(drill.getState()).toMatchObject({ planSan: 'e4', plan: expect.stringContaining('Take the centre') });
    expect(reps.getState().data.cards[id][toEpd(START_FEN)]).toEqual(card);
    expect(reps.getState().data.repertoires[0].tree).toEqual(parsePgnTree(old));
  });

  it('after a move answered from memory its plan is asked for, then shown', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('London', 'w', parsePgnTree('1. d4 {Take the centre} d5 *'));
    reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-14');
    drill.getState().start(id, 'due');
    drill.getState().move(mv('d2d4'));
    expect(drill.getState()).toMatchObject({ plan: 'Take the centre', planHidden: true });
    drill.getState().revealPlan();
    expect(drill.getState().planHidden).toBe(false);
  });

  it('Learn shows the line\'s idea first', async () => {
    const { reps, drill } = await fresh();
    const id = reps.getState().create('Italian', 'w', parsePgnTree('1. e4 e5 2. Nf3 Nc6 3. Bc4 {Aim at f7} *'));
    drill.getState().start(id, 'learn');
    expect(drill.getState()).toMatchObject({ pass: 'show', idea: 'Aim at f7' });
  });

  it("today's reviews across repertoires take turns between White and Black", async () => {
    const { reps, drill } = await fresh();
    const w = reps.getState().create('London', 'w', parsePgnTree('1. d4 d5 2. Bf4 *'));
    const b = reps.getState().create('Caro', 'b', parsePgnTree('1. e4 c6 2. d4 d5 *'));
    const w2 = reps.getState().create('Other white', 'w', parsePgnTree('1. c4 e5 2. g3 *'));
    for (const id of [w, w2]) reps.getState().answer(id, toEpd(START_FEN), true, '2026-10-14');
    const e4 = parsePgnTree('1. e4 *');
    const caroKey = toEpd(e4.nodes[e4.nodes[e4.rootId].children[0]].fen);
    reps.getState().answer(b, caroKey, true, '2026-10-14');
    expect(drill.getState().startMixed()).toBe(true);
    const first = drill.getState().repId;
    expect(drill.getState().mixed).toBe(true);
    // Finish the line, then the next one comes from the other colour.
    while (drill.getState().phase !== 'done') {
      if (drill.getState().phase === 'user') drill.getState().move(mv(drill.getState().steps[drill.getState().index].uci));
      else vi.runOnlyPendingTimers();
    }
    drill.getState().startMixed();
    const second = drill.getState().repId;
    const color = (id: string | null) => reps.getState().data.repertoires.find((r) => r.id === id)!.color;
    expect(color(second)).not.toBe(color(first));
  });
});
