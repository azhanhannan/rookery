import { describe, expect, it } from 'vitest';
import { parsePgnTree, treeToPgn } from '../../src/game/pgnTree';
import { mainline, type VariationTree } from '../../src/game/variationTree';

const RICH = `[Event "Lesson 3"]
[Site "Club"]
[Date "2026.10.15"]
[Round "1"]
[White "Teacher"]
[Black "Student \\"S\\""]
[Result "1-0"]
[Annotator "Coach"]

{The Italian, annotated.} 1. e4 e5 2. Nf3 {[%clk 0:05:00] Develops. [%cal Gf3e5]} 2... Nc6 $1
(2... d6 {Philidor} 3. d4 (3. Bc4 Be7 (3... Bg4!? {pin}) 4. c3) 3... exd4)
(2... Nf6!? {Petroff [%eval 0.21]})
3. Bc4!! Bc5?! $14 {[%csl Rf7] f7 is weak} 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 1-0
`;

/** Structural shape of a tree, independent of node ids. */
function shape(t: VariationTree, id = t.rootId): unknown {
  const n = t.nodes[id];
  return {
    san: n.san,
    comment: n.comment,
    pre: n.preComment,
    nags: n.nags,
    children: n.children.map((c) => shape(t, c)),
  };
}

describe('lossless PGN', () => {
  it('reads comments, nested variations, NAGs and commands', () => {
    const t = parsePgnTree(RICH);
    const main = mainline(t)
      .slice(1)
      .map((id) => t.nodes[id]);
    expect(main.map((n) => n.san).slice(0, 4)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(t.nodes[t.rootId].comment).toBe('The Italian, annotated.');
    expect(main[2].comment).toBe('[%clk 0:05:00] Develops. [%cal Gf3e5]');
    expect(main[3].nags).toEqual([1]);
    expect(main[4].nags).toEqual([3]);
    expect(main[5].nags).toEqual([6, 14]);
    // 2...Nc6 has two alternatives; 2...d6 has a nested variation with another nested one.
    const nf3 = main[2];
    expect(nf3.children.map((c) => t.nodes[c].san)).toEqual(['Nc6', 'd6', 'Nf6']);
    const d6 = t.nodes[nf3.children[1]];
    expect(d6.comment).toBe('Philidor');
    expect(d6.children.map((c) => t.nodes[c].san)).toEqual(['d4', 'Bc4']);
    const bc4 = t.nodes[d6.children[1]];
    expect(bc4.children.map((c) => t.nodes[c].san)).toEqual(['Be7', 'Bg4']);
    expect(t.nodes[bc4.children[1]].nags).toEqual([5]);
    expect(t.headers.find(([h]) => h === 'Black')?.[1]).toBe('Student "S"');
    expect(t.headers.find(([h]) => h === 'Annotator')?.[1]).toBe('Coach');
  });

  it('round trip: parse -> export -> parse keeps the whole tree, and export is stable', () => {
    const t1 = parsePgnTree(RICH);
    const pgn1 = treeToPgn(t1);
    const t2 = parsePgnTree(pgn1);
    expect(shape(t2)).toEqual(shape(t1));
    expect(t2.headers).toEqual(t1.headers);
    expect(treeToPgn(t2)).toBe(pgn1);
    expect(pgn1).toContain('[%cal Gf3e5]');
    expect(pgn1).toContain('[%csl Rf7]');
    expect(pgn1).toContain('[%eval 0.21]');
    expect(pgn1).toContain('[%clk 0:05:00]');
    expect(pgn1).toContain('Bc4!!');
    expect(pgn1).toContain('Bc5?! $14');
    expect(pgn1).toContain('[Black "Student \\"S\\""]');
    expect(pgn1.trimEnd().endsWith('1-0')).toBe(true);
    for (const line of pgn1.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
  });

  it('a set-up position: FEN tag in, FEN tag out, black to move first', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const t = parsePgnTree(`[SetUp "1"]\n[FEN "${fen}"]\n\n3. Bb5 a6 (3... Nf6) *`);
    expect(t.nodes[t.rootId].fen).toBe(fen);
    const out = treeToPgn(t);
    expect(out).toContain(`[FEN "${fen}"]`);
    expect(out).toContain('3. Bb5 a6 (3... Nf6) *');
    const blackFen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    const black = parsePgnTree(`[FEN "${blackFen}"]\n\n3... a6 4. Ba4 *`);
    expect(treeToPgn(black)).toContain('3... a6 4. Ba4 *');
  });

  it('tolerates move numbers glued to moves, ; comments, % lines, 0-0 and glyph words', () => {
    const t = parsePgnTree('% skipped line\n1.e4 e5 2.Nf3 ; rest of line\nNc6 3.Bc4 Bc5 4.0-0 ! *');
    const main = mainline(t)
      .slice(1)
      .map((id) => t.nodes[id]);
    expect(main.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    expect(main[2].comment).toBe('rest of line');
    expect(main[6].nags).toEqual([1]);
  });

  it('reads only the first game of several', () => {
    const t = parsePgnTree('[Event "A"]\n\n1. e4 1-0\n\n[Event "B"]\n\n1. d4 0-1');
    expect(mainline(t)).toHaveLength(2);
    expect(t.headers).toEqual([['Event', 'A']]);
  });

  it('readable errors', () => {
    expect(() => parsePgnTree('1. e4 e5 2. Ke3')).toThrow('Illegal move "Ke3" at 2.');
    expect(() => parsePgnTree('1. e4 {open')).toThrow(/closing \}/);
    expect(() => parsePgnTree('1. e4 )')).toThrow(/without its/);
    expect(() => parsePgnTree('[FEN "nonsense"]\n\n*')).toThrow(/FEN/);
  });

  it('an empty board exports the Seven Tag Roster and *', () => {
    const out = treeToPgn(parsePgnTree(''));
    expect(out).toMatch(
      /^\[Event "Analysis"\]\n\[Site "Rookery"\]\n\[Date "\d{4}\.\d{2}\.\d{2}"\]\n\[Round "-"\]\n\[White "\?"\]\n\[Black "\?"\]\n\[Result "\*"\]\n\n\*\n$/,
    );
  });
});
