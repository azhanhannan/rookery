import { describe, expect, it } from 'vitest';
import { parsePgnTree } from '../../src/game/pgnTree';
import { LIBRARY } from '../../src/openings/library';
import { parseIndex, toEpd } from '../../src/openings/openings';
import positions from '../../src/openings/positions.tsv?raw';
import { linesOf } from '../../src/openings/repertoire';

// The library is hand-written, so every line is checked against the opening book (lichess-org/chess-openings):
// its first moves must be theory, and the entry's main line must reach the opening it is named after.
const book = parseIndex(positions);

/** Plies of a line before it first leaves the book. */
function bookDepth(fens: string[]): number {
  let n = 0;
  for (const fen of fens.slice(1)) {
    if (!book.has(toEpd(fen)) && !book.has(toEpd(fen).replace(/ \S+$/, ' -'))) break;
    n++;
  }
  return n;
}

const nameAt = (fen: string) => book.get(toEpd(fen)) ?? book.get(toEpd(fen).replace(/ \S+$/, ' -')) ?? null;

/**
 * Every line must stay in the book this many plies (or to its end, if shorter), and the main line longer.
 * The book is named lines only, so a sound side-line can leave it early (another move order, a known trap).
 */
const MIN_BOOK_PLIES = 4;
const MIN_MAIN_BOOK_PLIES = 8;

/**
 * Entries whose every move of yours carries its reason (shown as "Why …?" while drilling). Add each entry as its
 * reasons are written; once all are, this list can go and the check apply to the whole library.
 */
const EXPLAINED = new Set(['italian']);

describe('opening library', () => {
  it('has unique ids', () => {
    expect(new Set(LIBRARY.map((o) => o.id)).size).toBe(LIBRARY.length);
  });

  for (const o of LIBRARY) {
    describe(o.name, () => {
      const tree = parsePgnTree(o.pgn);
      const lines = linesOf(tree);

      it('parses, with a summary and ideas', () => {
        expect(lines.length).toBeGreaterThan(0);
        expect(o.summary.length).toBeGreaterThan(20);
        expect(o.ideas.length).toBeGreaterThanOrEqual(2);
      });

      it('has one move of yours in each of your positions, and every line ends on your move', () => {
        for (const n of Object.values(tree.nodes)) {
          const toMove = n.fen.split(' ')[1];
          if (toMove === o.color) expect(n.children.length, `${o.id}: two answers after ${n.san ?? 'start'}`).toBeLessThanOrEqual(1);
        }
        for (const path of lines) {
          const last = tree.nodes[path[path.length - 1]];
          expect(last.fen.split(' ')[1], `${o.id}: line ends on the opponent's move ${last.san}`).not.toBe(o.color);
        }
      });

      it(`stays in the book for ${MIN_BOOK_PLIES}+ plies on every line (${MIN_MAIN_BOOK_PLIES}+ on the main line)`, () => {
        lines.forEach((path, i) => {
          const fens = path.map((id) => tree.nodes[id].fen);
          const depth = bookDepth(fens);
          const sans = path.slice(1).map((id) => tree.nodes[id].san).join(' ');
          const min = i === 0 ? MIN_MAIN_BOOK_PLIES : MIN_BOOK_PLIES;
          expect(depth, `${o.id}: leaves the book after ${depth} plies: ${sans}`).toBeGreaterThanOrEqual(Math.min(min, path.length - 1));
        });
      });

      it.runIf(EXPLAINED.has(o.id))('explains every move of yours (the "Why …?" while drilling)', () => {
        for (const n of Object.values(tree.nodes)) {
          if (!n.parentId || tree.nodes[n.parentId].fen.split(' ')[1] !== o.color) continue;
          expect(n.comment?.trim(), `${o.id}: ${n.san} has no reason`).toBeTruthy();
        }
      });

      it(`main line reaches "${o.family}"`, () => {
        const main = lines[0];
        const names = main.map((id) => nameAt(tree.nodes[id].fen)?.name).filter(Boolean);
        expect(names.some((n) => n!.startsWith(o.family)), `${o.id}: names on the main line: ${names.join(' | ')}`).toBe(true);
      });
    });
  }
});
