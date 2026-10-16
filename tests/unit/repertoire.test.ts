import { describe, expect, it } from 'vitest';
import { parsePgnTree } from '../../src/game/pgnTree';
import { START_FEN } from '../../src/game/rules';
import type { GameRecord } from '../../src/game/types';
import { createTree, mainline, treeFromLine, type VariationTree } from '../../src/game/variationTree';
import { drillSteps, judgeMove } from '../../src/openings/drill';
import { seedRows } from '../../src/openings/fromGames';
import { toEpd } from '../../src/openings/openings';
import {
  answerCard,
  chooseLine,
  isCardDue,
  lineCards,
  lineText,
  linesOf,
  mergeTrees,
  parseRepertoireData,
  pruneCards,
  repertoireProgress,
  sanOf,
  seedFromGames,
  shouldRecord,
  trimOpponentEnds,
  userCards,
  type CardRecord,
} from '../../src/openings/repertoire';
import { play } from './helpers';

const TODAY = '2026-10-16';

// White repertoire: 1.e4 e5 2.Nf3 (Nc6 3.Bb5 {Spanish: pressure on e5}) (2...d6 3.d4) ; 1...c5 2.Nf3
const PGN = `1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5 {Pressure on e5 [%cal Gb5c6]} *`;
const rep = (tree: VariationTree = parsePgnTree(PGN)) => ({ tree, color: 'w' as const });

const nodeBySans = (tree: VariationTree, ...sans: string[]) => {
  let id = tree.rootId;
  for (const san of sans) id = tree.nodes[id].children.find((c) => tree.nodes[c].san === san)!;
  return id;
};

describe('repertoire trees', () => {
  it('lists every line, main line first', () => {
    const tree = parsePgnTree(PGN);
    const lines = linesOf(tree).map((p) => p.slice(1).map((id) => tree.nodes[id].san).join(' '));
    expect(lines).toEqual(['e4 e5 Nf3 Nc6 Bb5', 'e4 e5 Nf3 d6 d4', 'e4 c5 Nf3']);
  });

  it('counts each user-to-move position with a reply as one card', () => {
    const cards = userCards(rep());
    // start, after 1...e5, after 2...Nc6, after 2...d6, after 1...c5
    expect(cards.size).toBe(5);
    expect(cards.has(toEpd(START_FEN))).toBe(true);
    // Black's cards in the same tree: after 1.e4 and after 2.Nf3
    expect(userCards({ tree: parsePgnTree(PGN), color: 'b' }).size).toBe(2);
  });

  it('lineCards lists the positions answered along one line', () => {
    const tree = parsePgnTree(PGN);
    const [main] = linesOf(tree);
    expect(lineCards(tree, 'w', main)).toHaveLength(3);
    expect(lineCards(tree, 'b', main)).toHaveLength(2);
  });

  it('merges lines without duplicating moves and keeps comments', () => {
    const base = treeFromLine(START_FEN, ['e2e4', 'e7e5', 'g1f3']);
    const merged = mergeTrees(base, parsePgnTree(PGN));
    expect(Object.keys(merged.nodes)).toHaveLength(Object.keys(parsePgnTree(PGN).nodes).length);
    expect(merged.nodes[nodeBySans(merged, 'e4', 'e5', 'Nf3', 'Nc6', 'Bb5')].comment).toContain('Pressure on e5');
    // Merging again changes nothing.
    expect(Object.keys(mergeTrees(merged, parsePgnTree(PGN)).nodes)).toHaveLength(Object.keys(merged.nodes).length);
  });

  it('refuses to merge lines from another start position', () => {
    const other = createTree('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(() => mergeTrees(createTree(), other)).toThrow(/different position/);
  });

  it('trims lines that end on an opponent move', () => {
    const tree = treeFromLine(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const trimmed = trimOpponentEnds(tree, 'w');
    expect(mainline(trimmed).map((id) => trimmed.nodes[id].san).slice(1)).toEqual(['e4', 'e5', 'Nf3']);
    expect(mainline(trimOpponentEnds(tree, 'b'))).toHaveLength(5);
  });

  it('lineText writes the moves with numbers', () => {
    const tree = parsePgnTree(PGN);
    expect(lineText(tree, nodeBySans(tree, 'e4', 'e5', 'Nf3'))).toBe('1. e4 e5 2. Nf3');
    expect(lineText(tree, tree.rootId)).toBe('');
    expect(sanOf(START_FEN, 'g1f3')).toBe('Nf3');
    expect(sanOf(START_FEN, 'e2e5')).toBeNull();
  });
});

describe('seeding from games', () => {
  const g = (...ucis: string[]) => ({ startFen: START_FEN, ucis });

  it('keeps the user’s most played move and every reply, deduped', () => {
    const tree = seedFromGames(
      [
        g('e2e4', 'e7e5', 'g1f3', 'b8c6'),
        g('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'),
        g('e2e4', 'e7e5', 'f1c4'),
        g('e2e4', 'c7c5', 'g1f3'),
        g('d2d4', 'd7d5'),
      ],
      'w',
    );
    // 1.e4 (played 4 times) beats 1.d4; after 1...e5 Nf3 (2) beats Bc4 (1); both 1...e5 and 1...c5 kept.
    expect(tree.nodes[tree.rootId].children.map((c) => tree.nodes[c].san)).toEqual(['e4']);
    const e4 = tree.nodes[tree.rootId].children[0];
    expect(tree.nodes[e4].children.map((c) => tree.nodes[c].san)).toEqual(['e5', 'c5']);
    expect(tree.nodes[nodeBySans(tree, 'e4', 'e5')].children.map((c) => tree.nodes[c].san)).toEqual(['Nf3']);
    // 2...Nc6 3.Bc4 is the only line past Nc6; nothing ends on a black move.
    const lines = linesOf(tree).map((p) => p.slice(1).map((id) => tree.nodes[id].san).join(' '));
    expect(lines).toEqual(['e4 e5 Nf3 Nc6 Bc4', 'e4 c5 Nf3']);
  });

  it('stops at the ply limit and skips games from a set-up position', () => {
    const tree = seedFromGames([g('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'), { startFen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', ucis: ['e1e2'] }], 'w', 3);
    expect(mainline(tree)).toHaveLength(4);
  });

  it('builds report rows for one side from saved games', () => {
    const a: GameRecord = { ...play(['e2e4', 'e7e5', 'g1f3']), id: 'a', userColor: 'w', result: '1-0' };
    const b: GameRecord = { ...play(['d2d4', 'd7d5']), id: 'b', userColor: 'b', result: '0-1' };
    const rows = seedRows([a, b], new Map([['a', 'King’s Pawn Game'], ['b', 'Queen’s Pawn Game']]), 'w');
    expect(rows).toHaveLength(1);
    expect(rows[0].row.name).toBe('King’s Pawn Game');
    expect(rows[0].games[0].ucis).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });
});

describe('cards and scheduling', () => {
  const card = (over: Partial<CardRecord>): CardRecord => ({ stage: 1, due: TODAY, retired: false, reps: 1, fails: 0, ...over });

  it('climbs 1/3/7/21 days and never retires', () => {
    let c = answerCard(undefined, true, TODAY);
    expect(c).toMatchObject({ stage: 1, due: '2026-10-17', reps: 1, fails: 0 });
    c = answerCard(c, true, TODAY);
    expect(c.due).toBe('2026-10-19');
    c = answerCard(c, true, TODAY);
    c = answerCard(c, true, TODAY);
    expect(c.due).toBe('2026-11-06');
    c = answerCard(c, true, TODAY);
    expect(c).toMatchObject({ retired: false, due: '2026-11-06', stage: 4 });
    c = answerCard(c, false, TODAY);
    expect(c).toMatchObject({ stage: 0, due: '2026-10-17', fails: 1, reps: 6 });
  });

  it('records a clean answer only when due, a wrong one always', () => {
    const later = card({ due: '2026-10-20' });
    expect(shouldRecord(later, true, TODAY)).toBe(false);
    expect(shouldRecord(later, false, TODAY)).toBe(true);
    expect(shouldRecord(card({}), true, TODAY)).toBe(true);
    expect(shouldRecord(undefined, true, TODAY)).toBe(true);
    expect(isCardDue(undefined, TODAY)).toBe(false);
  });

  it('chooses the line with the most due cards, and new lines in tree order', () => {
    const r = rep();
    const tree = r.tree;
    const k = (...sans: string[]) => toEpd(tree.nodes[nodeBySans(tree, ...sans)].fen);
    const start = toEpd(START_FEN);
    const cards: Record<string, CardRecord> = {
      [start]: card({ due: '2026-10-20' }),
      [k('e4', 'e5')]: card({ due: '2026-10-20' }),
      [k('e4', 'e5', 'Nf3', 'Nc6')]: card({ due: '2026-10-20' }),
      [k('e4', 'e5', 'Nf3', 'd6')]: card({ due: '2026-10-10' }),
    };
    const line = chooseLine(r, cards, 'due', TODAY)!;
    expect(tree.nodes[line[line.length - 1]].san).toBe('d4');
    // Learn: the first line with a never-answered card is 1...c5.
    const learn = chooseLine(r, cards, 'learn', TODAY)!;
    expect(tree.nodes[learn[learn.length - 1]].san).toBe('Nf3');
    expect(tree.nodes[learn[2]].san).toBe('c5');
    // Nothing due once everything is scheduled later.
    const later = Object.fromEntries(Object.entries(cards).map(([key, c]) => [key, { ...c, due: '2026-12-01' }]));
    expect(chooseLine(r, later, 'due', TODAY)).toBeNull();
  });

  it('avoids repeating the line just played when another qualifies', () => {
    const r = rep();
    const first = chooseLine(r, {}, 'learn', TODAY)!;
    const second = chooseLine(r, {}, 'learn', TODAY, first[first.length - 1])!;
    expect(second).not.toEqual(first);
  });

  it('practice picks learned lines and goes round them all before repeating', () => {
    const r = rep();
    expect(chooseLine(r, {}, 'practice', TODAY)).toBeNull();
    // Only the start position is learned, so every line qualifies (each starts there).
    const cards: Record<string, CardRecord> = { [toEpd(START_FEN)]: card({ due: '2026-12-01' }) };
    const all = linesOf(r.tree);
    const played: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const line = chooseLine(r, cards, 'practice', TODAY, played)!;
      const leaf = line[line.length - 1];
      expect(played).not.toContain(leaf);
      played.push(leaf);
    }
    // Every line has had its turn: the next one is anything but the last.
    const again = chooseLine(r, cards, 'practice', TODAY, played)!;
    expect(again[again.length - 1]).not.toBe(played[played.length - 1]);
  });

  it('weak picks the line through the worst-missed position first', () => {
    const r = rep();
    const tree = r.tree;
    const k = (...sans: string[]) => toEpd(tree.nodes[nodeBySans(tree, ...sans)].fen);
    expect(chooseLine(r, { [toEpd(START_FEN)]: card({}) }, 'weak', TODAY)).toBeNull();
    const cards: Record<string, CardRecord> = {
      [toEpd(START_FEN)]: card({ reps: 4, fails: 1 }),
      [k('e4', 'e5', 'Nf3', 'd6')]: card({ reps: 2, fails: 2 }),
    };
    const line = chooseLine(r, cards, 'weak', TODAY)!;
    expect(tree.nodes[line[line.length - 1]].san).toBe('d4');
  });

  it('reports progress and the weakest positions', () => {
    const r = rep();
    const tree = r.tree;
    const k = (...sans: string[]) => toEpd(tree.nodes[nodeBySans(tree, ...sans)].fen);
    const cards: Record<string, CardRecord> = {
      [toEpd(START_FEN)]: card({ stage: 2, due: '2026-10-19', reps: 3 }),
      [k('e4', 'e5')]: card({ stage: 0, due: TODAY, reps: 3, fails: 2 }),
      [k('e4', 'c5')]: card({ stage: 1, due: TODAY, reps: 2, fails: 1 }),
      gone: card({}),
    };
    const p = repertoireProgress(r, cards, TODAY);
    expect(p).toMatchObject({ total: 5, learned: 2, due: 2, fresh: 2, nextDue: '2026-10-19' });
    expect(p.weakest.map((w) => w.key)).toEqual([k('e4', 'e5'), k('e4', 'c5')]);
    expect(lineText(tree, p.weakest[0].nodeId)).toBe('1. e4 e5');
    expect(Object.keys(pruneCards(r, cards))).not.toContain('gone');
  });
});

describe('drill steps', () => {
  it('marks the user moves and carries the plan text without commands', () => {
    const tree = parsePgnTree(PGN);
    const steps = drillSteps(tree, 'w', linesOf(tree)[0]);
    expect(steps.map((s) => s.user)).toEqual([true, false, true, false, true]);
    expect(steps[4].plan).toBe('Pressure on e5');
    expect(steps[0].key).toBe(toEpd(START_FEN));
  });

  it('judges a move: the line’s, another repertoire move, or wrong', () => {
    const tree = parsePgnTree(`1. e4 (1. d4) *`);
    const [step] = drillSteps(tree, 'w', linesOf(tree)[0]);
    expect(judgeMove(tree, step, 'e2e4')).toBe('correct');
    expect(judgeMove(tree, step, 'd2d4')).toBe('other-line');
    expect(judgeMove(tree, step, 'c2c4')).toBe('wrong');
  });
});

describe('stored data', () => {
  it('keeps valid repertoires and cards and drops the rest', () => {
    const tree = parsePgnTree(PGN);
    const raw = JSON.stringify({
      version: 1,
      updatedAt: '2026-10-16T00:00:00.000Z',
      repertoires: [
        { id: 'r1', name: 'Spanish', color: 'w', tree, createdAt: '', updatedAt: '' },
        { id: 'bad', name: 'x', color: 'green', tree },
      ],
      cards: { r1: { a: { stage: 1, due: TODAY, retired: false, reps: 1, fails: 0 }, b: { stage: 'x' } }, bad: {} },
    });
    const d = parseRepertoireData(raw);
    expect(d.repertoires.map((r) => r.id)).toEqual(['r1']);
    expect(Object.keys(d.cards.r1)).toEqual(['a']);
    expect(d.cards.bad).toBeUndefined();
    expect(parseRepertoireData('not json').repertoires).toEqual([]);
    expect(parseRepertoireData(null).updatedAt).toBe(new Date(0).toISOString());
  });
});
