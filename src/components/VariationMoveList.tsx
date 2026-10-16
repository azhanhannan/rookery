import { useEffect, useRef, useState, type ReactNode } from 'react';
import { scrollWithin } from './scrollWithin';
import { useSan } from './useSan';
import { nagText } from '../game/analysisLines';
import { isMainline, splitComment, type VariationTree } from '../game/variationTree';

type Menu = { id: string; x: number; y: number };

/**
 * The analysis tree as text: the main line with side lines in brackets (nested ones inline), comments in grey.
 * Click a move to go there; right-click (or the ⋯ button under the list) for promote / delete.
 */
export function VariationMoveList({
  tree,
  selected,
  onSelect,
  onPromote,
  onMakeMain,
  onDelete,
}: {
  tree: VariationTree;
  selected: string;
  onSelect: (id: string) => void;
  onPromote: (id: string) => void;
  onMakeMain: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const fmt = useSan();

  useEffect(() => {
    scrollWithin(activeRef.current);
  }, [selected]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const comment = (raw: string | undefined, key: string) => {
    const text = splitComment(raw).text;
    return text ? (
      <span key={key} className="mx-1 font-sans text-xs text-muted italic">
        {text}
      </span>
    ) : null;
  };

  const move = (id: string, force: boolean): ReactNode[] => {
    const n = tree.nodes[id];
    const parts = tree.nodes[n.parentId!].fen.split(' ');
    const white = parts[1] === 'w';
    const number = white ? `${parts[5]}.` : force || n.preComment ? `${parts[5]}…` : '';
    const active = id === selected;
    return [
      comment(n.preComment, `${id}-pre`),
      <button
        key={id}
        ref={active ? activeRef : undefined}
        data-node={id}
        aria-current={active ? 'step' : undefined}
        onClick={() => onSelect(id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(id);
          setMenu({ id, x: e.clientX, y: e.clientY });
        }}
        className={`rounded px-1 py-0.5 font-mono text-sm ${active ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
      >
        {number && <span className={`mr-0.5 ${active ? '' : 'text-muted'}`}>{number}</span>}
        {n.san && fmt(n.san)}
        {n.nags.map((g) => nagText(g)).join('')}
      </button>,
      comment(n.comment, `${id}-c`),
    ];
  };

  /** The moves after `fromId` along children[0], with each branch's alternatives in brackets. */
  const line = (fromId: string, forceFirst: boolean, depth: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let p = tree.nodes[fromId];
    let force = forceFirst;
    while (p.children.length) {
      const [main, ...vars] = p.children;
      out.push(...move(main, force));
      force = !!tree.nodes[main].comment;
      for (const v of vars) {
        const body = [...move(v, true), ...line(v, !!tree.nodes[v].comment, depth + 1)];
        out.push(
          depth === 0 ? (
            // Side lines off the main line get their own indented row; deeper ones stay inline.
            <div key={`var-${v}`} className="my-0.5 ml-2 border-l-2 border-surface-2 pl-2 text-[0.95em]" data-testid="variation">
              <span className="text-muted">(</span>
              {body}
              <span className="text-muted">)</span>
            </div>
          ) : (
            <span key={`var-${v}`} className="text-[0.95em]" data-testid="variation">
              <span className="text-muted">(</span>
              {body}
              <span className="text-muted">)</span>{' '}
            </span>
          ),
        );
        force = true;
      }
      p = tree.nodes[main];
    }
    return out;
  };

  const root = tree.nodes[tree.rootId];
  const empty = root.children.length === 0;
  const sel = tree.nodes[selected];
  const canEdit = !!sel?.parentId;
  const inVariation = canEdit && !isMainline(tree, selected);

  const menuItems = (id: string) => {
    const side = !isMainline(tree, id);
    return [
      side && { label: 'Promote variation', run: () => onPromote(id) },
      side && { label: 'Make main line', run: () => onMakeMain(id) },
      { label: 'Delete from here', run: () => onDelete(id) },
    ].filter(Boolean) as { label: string; run: () => void }[];
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="max-h-80 overflow-y-auto rounded-lg bg-surface p-2 leading-7 lg:max-h-[24rem]"
        data-testid="analysis-move-list"
      >
        {comment(root.comment, 'root-c')}
        {empty ? <p className="p-1 text-sm text-muted">Play a move on the board, or paste a PGN or FEN below.</p> : line(root.id, true, 0)}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2 text-xs" data-testid="variation-actions">
          {inVariation && (
            <>
              <button className="rounded bg-surface-2 px-2 py-1 hover:outline-1 hover:outline-accent" onClick={() => onPromote(selected)}>
                Promote variation
              </button>
              <button className="rounded bg-surface-2 px-2 py-1 hover:outline-1 hover:outline-accent" onClick={() => onMakeMain(selected)}>
                Make main line
              </button>
            </>
          )}
          <button className="rounded bg-surface-2 px-2 py-1 hover:outline-1 hover:outline-danger" onClick={() => onDelete(selected)}>
            Delete from here
          </button>
        </div>
      )}
      {menu && tree.nodes[menu.id] && (
        <div
          role="menu"
          className="fixed z-50 flex min-w-40 flex-col rounded-lg border border-surface-2 bg-surface py-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          {menuItems(menu.id).map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="px-3 py-1.5 text-left hover:bg-surface-2"
              onClick={() => {
                item.run();
                setMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
