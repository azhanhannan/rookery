import { useMemo, useState } from 'react';
import { parsePgnTree } from '../game/pgnTree';
import type { Color } from '../game/types';
import type { VariationTree } from '../game/variationTree';
import { LIBRARY, LIBRARY_GROUPS, type LibraryLevel, type LibraryOpening } from '../openings/library';
import { openingAt } from '../openings/openings';
import { lineText, linesOf, userCards } from '../openings/repertoire';
import { useRepertoireStore } from '../openings/repertoireStore';

const primary = 'rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-40';
const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';

const LEVEL: Record<LibraryLevel, string> = { beginner: 'Beginner', club: 'Club', advanced: 'Advanced' };

export type LibraryPreview = { fen: string; lastMove: { from: string; to: string } | null; color: Color };

type Line = { leaf: string; text: string; name: string | null };

/** The lines of a library entry, each with the deepest opening name on it. */
function linesFor(tree: VariationTree, ready: boolean): Line[] {
  return linesOf(tree).map((path) => {
    let name: string | null = null;
    if (ready) {
      for (let i = path.length - 1; i >= 0 && !name; i--) {
        const o = openingAt(tree.nodes[path[i]].fen);
        if (o) name = o.name;
      }
    }
    const leaf = path[path.length - 1];
    return { leaf, text: lineText(tree, leaf), name };
  });
}

const previewOf = (tree: VariationTree, id: string, color: Color): LibraryPreview => {
  const n = tree.nodes[id];
  return { fen: n.fen, lastMove: n.uci ? { from: n.uci.slice(0, 2), to: n.uci.slice(2, 4) } : null, color };
};

/** The opening library: pick a ready-made repertoire, look through its lines, add it. */
export function OpeningLibraryPanel({
  openingsReady,
  onPreview,
  onAdded,
  onClose,
}: {
  openingsReady: boolean;
  onPreview: (p: LibraryPreview | null) => void;
  onAdded: (repId: string) => void;
  onClose: () => void;
}) {
  const [pickId, setPickId] = useState<string | null>(null);
  const pick = LIBRARY.find((o) => o.id === pickId) ?? null;

  const open = (o: LibraryOpening | null) => {
    setPickId(o?.id ?? null);
    if (!o) return onPreview(null);
    const tree = parsePgnTree(o.pgn);
    onPreview(previewOf(tree, linesOf(tree)[0].at(-1)!, o.color));
  };

  return (
    <div className={panel} data-testid="opening-library">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{pick ? pick.name : 'Opening library'}</span>
        <button className="text-sm text-accent hover:underline" onClick={pick ? () => open(null) : onClose}>
          {pick ? 'All openings' : 'Close'}
        </button>
      </div>
      {pick ? (
        <LibraryEntry o={pick} openingsReady={openingsReady} onPreview={onPreview} onAdded={onAdded} />
      ) : (
        <>
          <p className="text-sm text-muted">Ready-made repertoires with the main line and the replies worth knowing. Add one, then learn it a line at a time.</p>
          {LIBRARY_GROUPS.map((g) => (
            <div key={g.key} className="flex flex-col gap-1.5">
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</div>
              {LIBRARY.filter((o) => o.against === g.key).map((o) => (
                <button
                  key={o.id}
                  className="flex flex-col gap-0.5 rounded bg-surface-2 px-3 py-2 text-left hover:outline-1 hover:outline-accent"
                  onClick={() => open(o)}
                  data-testid="library-entry"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{o.name}</span>
                    <span className="shrink-0 text-xs text-muted">{LEVEL[o.level]}</span>
                  </span>
                  <span className="text-xs text-muted">{o.summary}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LibraryEntry({
  o,
  openingsReady,
  onPreview,
  onAdded,
}: {
  o: LibraryOpening;
  openingsReady: boolean;
  onPreview: (p: LibraryPreview | null) => void;
  onAdded: (repId: string) => void;
}) {
  const reps = useRepertoireStore((s) => s.data.repertoires);
  const tree = useMemo(() => parsePgnTree(o.pgn), [o.pgn]);
  const lines = useMemo(() => linesFor(tree, openingsReady), [tree, openingsReady]);
  const positions = useMemo(() => userCards({ tree, color: o.color }).size, [tree, o.color]);
  const sameSide = reps.filter((r) => r.color === o.color);
  const [into, setInto] = useState<string>('new');
  const [shown, setShown] = useState<string>(lines[0]?.leaf ?? '');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const store = useRepertoireStore.getState();
    try {
      if (into === 'new') onAdded(store.create(o.name, o.color, tree));
      else {
        store.addLines(into, tree);
        onAdded(into);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <p className="text-xs text-muted">
        {LEVEL[o.level]} · as {o.color === 'w' ? 'White' : 'Black'} · {lines.length} lines · {positions} positions to learn
      </p>
      <p className="text-sm">{o.summary}</p>
      <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
        {o.ideas.map((idea) => (
          <li key={idea}>{idea}</li>
        ))}
      </ul>
      <div className="mt-1 text-sm font-semibold">Lines</div>
      <ul className="flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l.leaf}>
            <button
              className={`w-full rounded px-2 py-1.5 text-left ${shown === l.leaf ? 'bg-surface-2 outline-1 outline-accent' : 'bg-surface-2/60 hover:bg-surface-2'}`}
              onClick={() => {
                setShown(l.leaf);
                onPreview(previewOf(tree, l.leaf, o.color));
              }}
              data-testid="library-line"
            >
              {l.name && <span className="block text-xs font-semibold">{l.name}</span>}
              <span className="block font-mono text-xs text-muted">{l.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {sameSide.length > 0 && (
          <select
            className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            aria-label="Add to"
            value={into}
            onChange={(e) => setInto(e.target.value)}
          >
            <option value="new">As a new repertoire</option>
            {sameSide.map((r) => (
              <option key={r.id} value={r.id}>
                Into "{r.name}"
              </option>
            ))}
          </select>
        )}
        <button className={primary} onClick={add} data-testid="library-add">
          Add to my repertoires
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">Then press "Learn new lines". You can delete lines you don't want from the Lines tab.</p>
    </>
  );
}
