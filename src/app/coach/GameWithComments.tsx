import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { CoachComment } from '../../api/types';
import { Board } from '../../components/Board';
import { LABEL_STYLE } from '../../components/labelStyle';
import type { Color, GameRecord } from '../../game/types';
import { reviewFits } from '../../review/reviewView';
import { COACH } from '../../config/tunables';

const moveName = (ply: number, san: string) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${san}`;

/**
 * A saved game stepped move by move, with coach comments beside it. Clicking a comment jumps to its move.
 * `onComment` (the coach) adds the comment form; `actions` renders extra controls for the shown ply.
 */
export function GameWithComments({
  record,
  comments,
  side,
  onComment,
  actions,
  initialPly,
}: {
  record: GameRecord;
  comments: CoachComment[];
  /** The student's side: the board faces it. */
  side: Color | null;
  onComment?: (body: string, ply: number | null) => Promise<void>;
  actions?: (ply: number) => ReactNode;
  /** Ply to open on (default: the final position). */
  initialPly?: number;
}) {
  const [ply, setPly] = useState(initialPly !== undefined ? Math.min(initialPly, record.moves.length) : record.moves.length);
  const review = reviewFits(record, record.review) ? record.review : undefined;
  const fen = ply === 0 ? record.startFen : record.moves[ply - 1].fenAfter;
  const last = ply > 0 ? record.moves[ply - 1] : null;
  const commented = useMemo(() => new Set(comments.map((c) => c.ply).filter((p): p is number => p !== null)), [comments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPly((p) => Math.min(record.moves.length, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record.moves.length]);

  const [draft, setDraft] = useState('');
  const [onMove, setOnMove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!onComment || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onComment(draft.trim(), onMove && ply > 0 ? ply : null);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const step = 'rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:outline-1 hover:outline-accent disabled:opacity-40';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(18rem,1fr)]">
      <div className="flex flex-col gap-2">
        <Board
          position={fen}
          orientation={side === 'b' ? 'black' : 'white'}
          lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
          movable={false}
          id="coach-board"
        />
        <div className="flex items-center gap-2">
          <button className={step} onClick={() => setPly(0)} disabled={ply === 0} aria-label="Start">⏮</button>
          <button className={step} onClick={() => setPly((p) => p - 1)} disabled={ply === 0} aria-label="Previous move">◀</button>
          <button className={step} onClick={() => setPly((p) => p + 1)} disabled={ply === record.moves.length} aria-label="Next move">▶</button>
          <button className={step} onClick={() => setPly(record.moves.length)} disabled={ply === record.moves.length} aria-label="End">⏭</button>
          <span className="ml-auto text-sm text-muted">{last ? moveName(ply, last.san) : 'Start'}</span>
        </div>
        {actions?.(ply)}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <ol className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-lg bg-surface p-2 text-sm" aria-label="Moves">
          {record.moves.map((m, i) => {
            const p = i + 1;
            const label = review?.moves[i]?.label;
            const style = label && label !== 'Best' && label !== 'Good' && label !== 'Excellent' && label !== 'Book' ? LABEL_STYLE[label] : null;
            return (
              <li key={p}>
                <button
                  onClick={() => setPly(p)}
                  className={`rounded px-1.5 py-0.5 ${p === ply ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
                  title={label}
                >
                  {p % 2 ? `${Math.ceil(p / 2)}. ` : ''}
                  {m.san}
                  {style && <span style={{ color: p === ply ? undefined : style.color }}>{style.glyph}</span>}
                  {commented.has(p) && <span aria-label="has a comment"> 💬</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <section className="rounded-lg bg-surface p-3" aria-labelledby="comments-heading">
          <h3 id="comments-heading" className="mb-2 text-sm font-semibold">Coach comments</h3>
          {comments.length === 0 ? (
            <p className="text-sm text-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="coach-comments">
              {comments.map((c) => (
                <li key={c.id} className={`rounded-lg p-2 text-sm ${c.ply === ply && ply > 0 ? 'bg-surface-2' : ''}`}>
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                    <span className="font-medium text-ink">{c.coach.username}</span>
                    {c.ply !== null && record.moves[c.ply - 1] ? (
                      <button className="text-accent hover:underline" onClick={() => setPly(c.ply!)}>
                        on {moveName(c.ply, record.moves[c.ply - 1].san)}
                      </button>
                    ) : (
                      <span>on the whole game</span>
                    )}
                    <span>{new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    {c.readAt === null && !onComment && <span className="font-semibold text-accent">new</span>}
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          {onComment && (
            <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
              <textarea
                className="min-h-20 rounded bg-surface-2 px-2 py-1.5 text-sm"
                value={draft}
                maxLength={COACH.maxCommentChars}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What should your student think about here?"
                aria-label="Comment"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={onMove && ply > 0} disabled={ply === 0} onChange={(e) => setOnMove(e.target.checked)} />
                {last ? `On ${moveName(ply, last.san)}` : 'On a move (step to one first)'}
              </label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
              >
                Add comment
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
