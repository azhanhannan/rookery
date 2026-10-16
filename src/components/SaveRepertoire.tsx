import { useState } from 'react';
import type { Orientation } from '../game/gameStore';
import type { Color } from '../game/types';
import type { VariationTree } from '../game/variationTree';
import { useRepertoireStore } from '../openings/repertoireStore';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/** Analysis board: "Save as repertoire" (a new one, or added to an existing one of the same start position). */
export function SaveRepertoire({ tree, orientation }: { tree: VariationTree; orientation: Orientation }) {
  const reps = useRepertoireStore((s) => s.data.repertoires);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>(orientation === 'black' ? 'b' : 'w');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasMoves = tree.nodes[tree.rootId].children.length > 0;

  const save = () => {
    const store = useRepertoireStore.getState();
    try {
      if (target === 'new') store.create(name || 'Analysis lines', color, tree);
      else store.addLines(target, tree);
      setMsg({ ok: true, text: 'Saved' });
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="save-repertoire">
        <button className={btn} disabled={!hasMoves} onClick={() => {
          setColor(orientation === 'black' ? 'b' : 'w');
          setMsg(null);
          setOpen(true);
        }}>
          Save as repertoire
        </button>
        {msg?.ok && (
          <a className="text-sm text-accent hover:underline" href="#/openings">Saved: open the opening trainer</a>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm" data-testid="save-repertoire">
      <div className="font-semibold">Save as repertoire</div>
      <select className="rounded bg-surface-2 px-2 py-1.5" aria-label="Save to" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="new">New repertoire</option>
        {reps.map((r) => (
          <option key={r.id} value={r.id}>Add to {r.name} ({r.color === 'w' ? 'White' : 'Black'})</option>
        ))}
      </select>
      {target === 'new' && (
        <>
          <input className="rounded bg-surface-2 px-2 py-1.5" aria-label="Repertoire name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-4">
            {(['w', 'b'] as Color[]).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="radio" name="save-rep-color" checked={color === c} onChange={() => setColor(c)} />
                I play {c === 'w' ? 'White' : 'Black'}
              </label>
            ))}
          </div>
        </>
      )}
      {msg && !msg.ok && <p className="text-danger" role="alert">{msg.text}</p>}
      <div className="flex gap-2">
        <button className={btn} onClick={save}>Save</button>
        <button className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
