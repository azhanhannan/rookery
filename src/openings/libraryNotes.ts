// A library repertoire is a copy of the library's PGN made when it was added, comments included. Its reasons are
// read from the library itself while drilling, so reasons written (or fixed) later reach repertoires added earlier,
// without touching their tree or progress.
import { parsePgnTree } from '../game/pgnTree';
import { splitComment } from '../game/variationTree';
import type { Color } from '../game/types';
import type { DrillStep } from './drill';
import { libraryEntryOf, type LibraryOpening } from './library';
import { toEpd } from './openings';

const cache = new Map<string, Map<string, string>>();

/** Position (EPD) + move (UCI) → the library's comment on that move. */
function notesOf(entry: LibraryOpening): Map<string, string> {
  let notes = cache.get(entry.id);
  if (!notes) {
    notes = new Map();
    const tree = parsePgnTree(entry.pgn);
    for (const n of Object.values(tree.nodes)) {
      const text = splitComment(n.comment).text.trim();
      if (n.parentId && n.uci && text) notes.set(`${toEpd(tree.nodes[n.parentId].fen)}|${n.uci}`, text);
    }
    cache.set(entry.id, notes);
  }
  return notes;
}

/** `steps` with the library's comments where the repertoire came from the library; unchanged otherwise. */
export function withLibraryNotes(steps: DrillStep[], rep: { libraryId?: string; name: string; color: Color }): DrillStep[] {
  const entry = libraryEntryOf(rep);
  if (!entry) return steps;
  const notes = notesOf(entry);
  return steps.map((s) => ({ ...s, plan: notes.get(`${toEpd(s.fenBefore)}|${s.uci}`) ?? s.plan }));
}
