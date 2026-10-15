import { describe, expect, it } from 'vitest';
import {
  addMove,
  commentShapes,
  createTree,
  deleteFrom,
  isMainline,
  joinComment,
  lineEnd,
  mainline,
  makeMainline,
  moveNumberOf,
  movesTo,
  pathTo,
  promoteVariation,
  setComment,
  splitComment,
  toggleNag,
  treeFromLine,
  type VariationTree,
} from '../../src/game/variationTree';

function play(tree: VariationTree, from: string, ...sans: string[]): { tree: VariationTree; id: string } {
  let t = tree;
  let at = from;
  for (const san of sans) {
    const r = addMove(t, at, san);
    if (!r) throw new Error(`illegal ${san}`);
    t = r.tree;
    at = r.id;
  }
  return { tree: t, id: at };
}

const sans = (t: VariationTree, ids: string[]) => ids.slice(1).map((id) => t.nodes[id].san);

describe('variation tree', () => {
  it('builds a main line and reuses an existing move', () => {
    const { tree, id } = play(createTree(), 'root', 'e4', 'e5', 'Nf3');
    expect(sans(tree, mainline(tree))).toEqual(['e4', 'e5', 'Nf3']);
    const again = addMove(tree, 'root', { from: 'e2', to: 'e4' })!;
    expect(again.tree).toBe(tree);
    expect(again.id).toBe(mainline(tree)[1]);
    expect(tree.nodes[id].ply).toBe(3);
  });

  it('a different move creates a side line instead of overwriting', () => {
    let { tree } = play(createTree(), 'root', 'e4', 'e5', 'Nf3');
    const e4 = mainline(tree)[1];
    const side = play(tree, e4, 'c5', 'Nf3');
    tree = side.tree;
    expect(sans(tree, mainline(tree))).toEqual(['e4', 'e5', 'Nf3']);
    expect(tree.nodes[e4].children).toHaveLength(2);
    expect(isMainline(tree, side.id)).toBe(false);
    expect(sans(tree, pathTo(tree, side.id))).toEqual(['e4', 'c5', 'Nf3']);
    expect(movesTo(tree, side.id)).toEqual(['e2e4', 'c7c5', 'g1f3']);
  });

  it('rejects illegal moves', () => {
    expect(addMove(createTree(), 'root', 'e5')).toBeNull();
    expect(addMove(createTree(), 'root', { from: 'e2', to: 'e5' })).toBeNull();
  });

  it('promotes a variation one level, and makes a nested one the main line', () => {
    let { tree } = play(createTree(), 'root', 'e4', 'e5', 'Nf3', 'Nc6');
    const e5 = mainline(tree)[2];
    const bc4 = play(tree, e5, 'Bc4');
    tree = bc4.tree;
    const nested = play(tree, bc4.id, 'Nf6', 'd3');
    tree = nested.tree;
    const b = play(tree, tree.nodes[nested.id].parentId!, 'Nc3'); // 2. Bc4 Nf6 3. d3 (3. Nc3)
    tree = b.tree;

    const once = promoteVariation(tree, b.id);
    // Nc3 now leads the Bc4 variation; Bc4 itself is still a variation.
    expect(sans(once, pathTo(once, lineEnd(once, bc4.id)))).toEqual(['e4', 'e5', 'Bc4', 'Nf6', 'Nc3']);
    expect(isMainline(once, bc4.id)).toBe(false);

    const main = makeMainline(tree, b.id);
    expect(sans(main, mainline(main))).toEqual(['e4', 'e5', 'Bc4', 'Nf6', 'Nc3']);
    expect(isMainline(main, b.id)).toBe(true);
    // The old main line is kept as a variation.
    expect(main.nodes[e5].children).toHaveLength(2);
    expect(promoteVariation(main, b.id)).toBe(main);
  });

  it('deletes a move and everything after it', () => {
    let { tree } = play(createTree(), 'root', 'e4', 'e5', 'Nf3');
    const e4 = mainline(tree)[1];
    const side = play(tree, e4, 'c5', 'Nf3', 'd6');
    tree = side.tree;
    const c5 = tree.nodes[e4].children[1];
    const del = deleteFrom(tree, c5);
    expect(del.selected).toBe(e4);
    expect(del.tree.nodes[e4].children).toHaveLength(1);
    expect(Object.keys(del.tree.nodes)).toHaveLength(4);
    const all = deleteFrom(tree, 'root');
    expect(Object.keys(all.tree.nodes)).toEqual(['root']);
  });

  it('comments, NAGs and move numbers', () => {
    const { tree, id } = play(createTree(), 'root', 'e4', 'e5');
    let t = setComment(tree, id, '  solid } reply ');
    expect(t.nodes[id].comment).toBe('solid ) reply');
    t = setComment(t, id, '   ');
    expect(t.nodes[id].comment).toBeUndefined();
    t = toggleNag(t, id, 1);
    t = toggleNag(t, id, 14);
    t = toggleNag(t, id, 2); // replaces !
    expect(t.nodes[id].nags).toEqual([14, 2]);
    t = toggleNag(t, id, 2);
    expect(t.nodes[id].nags).toEqual([14]);
    expect(moveNumberOf(t, id)).toEqual({ no: 1, black: true });
  });

  it('builds from a UCI line (the Review hand-off), stopping at an illegal move', () => {
    const t = treeFromLine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'e2e4', 'g1f3']);
    expect(sans(t, mainline(t))).toEqual(['e4', 'e5']);
  });

  it('comment commands survive editing the text and give arrows and squares', () => {
    const raw = '[%clk 0:03:00] good move [%cal Ge2e4,Rd7d5] [%csl Yd4]';
    const { text, commands } = splitComment(raw);
    expect(text).toBe('good move');
    expect(commands).toEqual(['[%clk 0:03:00]', '[%cal Ge2e4,Rd7d5]', '[%csl Yd4]']);
    expect(joinComment('better', commands)).toBe('[%clk 0:03:00] [%cal Ge2e4,Rd7d5] [%csl Yd4] better');
    const shapes = commentShapes(raw);
    expect(shapes.arrows.map((a) => a.from + a.to)).toEqual(['e2e4', 'd7d5']);
    expect(shapes.squares.map((s) => s.square)).toEqual(['d4']);
  });
});
