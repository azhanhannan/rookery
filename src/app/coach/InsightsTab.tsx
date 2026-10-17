import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { insightsApi } from '../../api/insights';
import type { CoachEvidence, CoachInsightsResponse, CoachUser } from '../../api/types';
import { useAuthStore } from '../../account/authStore';
import { MiniBoard } from '../../components/MiniBoard';
import { bucketName, homeworkFromEvidence, homeworkTitleFor } from '../../coach/insights';
import { useHomeworkDraft } from '../../coach/homeworkDraft';
import { COACH, INSIGHTS } from '../../config/tunables';
import type { BucketId, LedgerBucket, Trend } from '../../insights/types';
import { button, card, message, primary, shortDate } from './ui';

const studentUrl = (id: string) => `#/coach/student/${encodeURIComponent(id)}`;
const moveName = (ply: number, san: string) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${san}`;
const pts = (x: number) => x.toFixed(2);

const TREND_TEXT: Record<Trend['direction'], string> = {
  improving: 'improving',
  worsening: 'getting worse',
  'no-clear-change': 'no clear change',
};

/** `#/coach/student/<id>/insights`: the student's ledger and Focus, with the positions behind each row. */
export function InsightsTab({ student }: { student: CoachUser }) {
  const [data, setData] = useState<CoachInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<BucketId | null>(null);
  const me = useAuthStore((s) => s.user?.id);

  const reload = useCallback(() => {
    insightsApi.coach.insights(student.id).then(setData, (e: unknown) => setError(message(e)));
  }, [student.id]);
  useEffect(reload, [reload]);

  if (error && !data) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading insights…</p>;
  const { insights, evidence, trends, focus } = data;
  const trendOf = new Map(trends.map((t) => [t.bucketId, t]));
  const cov = insights.coverage;

  async function setFocus(id: BucketId) {
    setError(null);
    try {
      const res = await insightsApi.coach.setFocus(student.id, { bucketId: id });
      setData((d) => (d ? { ...d, focus: res.focus } : d));
      setNote(`${student.username}’s Focus is now “${bucketName(id)}”.`);
    } catch (e) {
      setError(message(e));
    }
  }

  async function clearFocus() {
    setError(null);
    try {
      await insightsApi.coach.clearFocus(student.id);
      setData((d) => (d ? { ...d, focus: null } : d));
      setNote(`Cleared: ${student.username}’s own Focus applies again.`);
    } catch (e) {
      setError(message(e));
    }
  }

  async function assign(id: BucketId) {
    const items = homeworkFromEvidence(evidence[id] ?? []);
    if (!items.length) return;
    setError(null);
    try {
      await api.coach.setHomework(student.id, { title: homeworkTitleFor(id), items });
      setNote(`Set “${homeworkTitleFor(id)}”: ${items.length} position${items.length === 1 ? '' : 's'}. See the Homework tab.`);
    } catch (e) {
      setError(message(e));
    }
  }

  const bucketActions = (b: LedgerBucket) => {
    const n = homeworkFromEvidence(evidence[b.id] ?? []).length;
    const isFocus = focus?.bucketId === b.id;
    return (
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={isFocus || b.motif === 'other'} onClick={() => void setFocus(b.id)}>
          {isFocus ? 'Student’s Focus' : 'Set as student’s Focus'}
        </button>
        <button className={button} disabled={!n} onClick={() => void assign(b.id)}>
          Assign {n || ''} position{n === 1 ? '' : 's'} as homework
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="coach-insights">
      <section className={card} aria-labelledby="ins-focus">
        <h2 id="ins-focus" className="mb-2 font-semibold">Focus</h2>
        <p className="text-sm">
          {focus ? (
            <>
              <span className="font-medium">{bucketName(focus.bucketId)}</span>{' '}
              <span className="text-muted">
                set by {focus.coach.id === me ? 'you' : focus.coach.username} on {shortDate(focus.createdAt)}. It outranks{' '}
                {student.username}’s own pick{insights.focus && insights.focus.id !== focus.bucketId ? ` (${bucketName(insights.focus.id)})` : ''}.
              </span>
            </>
          ) : insights.focus ? (
            <>
              <span className="font-medium">{bucketName(insights.focus.id)}</span>{' '}
              <span className="text-muted">— the ledger’s pick (the costliest row with enough data and a drill).</span>
            </>
          ) : (
            <span className="text-muted">No Focus yet: no row has enough data to pick one.</span>
          )}
        </p>
        {focus?.coach.id === me && (
          <button className={`${button} mt-2`} onClick={() => void clearFocus()}>Clear your Focus</button>
        )}
        {note && <p className="mt-2 text-xs" role="status">{note}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </section>

      {insights.status === 'locked' ? (
        <section className={card}>
          <p className="text-sm text-muted">
            {student.username} has {insights.games} reviewed game{insights.games === 1 ? '' : 's'} that count
            {cov ? ` (of ${cov.total} saved)` : ''}. Insights need {INSIGHTS.minSample.pageGames}: games reviewed at depth{' '}
            {INSIGHTS.minReviewDepth} or more, finished, not practice, with at least {INSIGHTS.minOwnMoves} moves of theirs.
          </p>
        </section>
      ) : (
        <>
          {insights.cards.map((c) => (
            <section key={c.bucket.id} className={card} data-testid="insight-card">
              <InsightHeader bucket={c.bucket} trend={trendOf.get(c.bucket.id)} />
              <div className="mt-3">{bucketActions(c.bucket)}</div>
              <EvidenceList student={student} items={evidence[c.bucket.id] ?? []} />
            </section>
          ))}

          <section className={card} aria-labelledby="ins-ledger">
            <h2 id="ins-ledger" className="mb-1 font-semibold">Ledger</h2>
            <p className="mb-3 text-xs text-muted">
              Points given away per game by phase and mistake type, over {insights.ledger.games} games
              {cov ? ` (reviewed ${cov.included} of ${cov.total} saved)` : ''}; {Math.round(insights.ledger.otherShare * 100)}% is
              in “other” (no rule names it). Ranked by the low end of the 90% range.
              {insights.status === 'early' ? ' Early read: fewer than 20 games.' : ''}
            </p>
            <ul className="flex flex-col divide-y divide-surface-2" data-testid="insight-ledger">
              {[...insights.ledger.cells, ...insights.ledger.overlays]
                .filter((b) => b.events > 0)
                .map((b) => (
                  <li key={b.id} className="py-2">
                    <button
                      className="flex w-full items-baseline gap-3 text-left text-sm hover:text-accent"
                      onClick={() => setOpen(open === b.id ? null : b.id)}
                      aria-expanded={open === b.id}
                    >
                      <span className={`flex-1 ${b.shown ? 'font-medium' : 'text-muted'}`}>
                        {bucketName(b.id)}
                        {focus?.bucketId === b.id ? ' · Focus' : ''}
                      </span>
                      <span className="text-xs text-muted">
                        {b.events} in {b.moves} moves · {b.games} games
                      </span>
                      <span className="w-28 text-right tabular-nums">
                        {pts(b.pointsPerGame.value)} <span className="text-xs text-muted">({pts(b.pointsPerGame.lo)}–{pts(b.pointsPerGame.hi)})</span>
                      </span>
                    </button>
                    {open === b.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        <InsightHeader bucket={b} trend={trendOf.get(b.id)} compact />
                        {bucketActions(b)}
                        {evidence[b.id] ? (
                          <EvidenceList student={student} items={evidence[b.id] ?? []} />
                        ) : (
                          <p className="text-xs text-muted">Not enough data on this row to list its positions.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function InsightHeader({ bucket: b, trend, compact }: { bucket: LedgerBucket; trend?: Trend; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {!compact && <h3 className="font-semibold">{bucketName(b.id)}</h3>}
      <p className="text-sm text-muted">
        {pts(b.pointsPerGame.value)} points a game (90%: {pts(b.pointsPerGame.lo)}–{pts(b.pointsPerGame.hi)}) ·{' '}
        {b.rate.value.toFixed(1)} per 100 moves · n = {b.games} games, {b.moves} moves, {b.events} events
        {b.earlyRead ? ' · early read' : ''}
      </p>
      {trend && (
        <p className="text-xs text-muted" data-testid="insight-trend">
          Over {trend.games} games: {TREND_TEXT[trend.direction]}.
        </p>
      )}
    </div>
  );
}

function EvidenceList({ student, items }: { student: CoachUser; items: CoachEvidence[] }) {
  if (!items.length) return <p className="mt-3 text-xs text-muted">No positions to show.</p>;
  return (
    <ul className="mt-3 flex flex-col gap-3" data-testid="insight-evidence">
      {items.map((e) => (
        <EvidenceRow key={`${e.clientId}-${e.ply}`} student={student} e={e} />
      ))}
    </ul>
  );
}

function EvidenceRow({ student, e }: { student: CoachUser; e: CoachEvidence }) {
  const add = useHomeworkDraft((s) => s.add);
  const [commenting, setCommenting] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function comment(ev: FormEvent) {
    ev.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.coach.comment(student.id, e.clientId, { body: body.trim(), ply: e.ply });
      setBody('');
      setCommenting(false);
      setStatus('Comment posted on that move.');
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3 rounded-lg bg-surface-2 p-2 text-sm">
      <MiniBoard fen={e.fen} orientation={e.color} size={96} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div>
          <span className="font-medium">{moveName(e.ply, e.san)}</span>
          {e.bestSan && <span className="text-muted"> (best {e.bestSan})</span>}
          <span className="text-muted"> · −{Math.round(e.loss)}% win chance</span>
        </div>
        <div className="text-xs text-muted">
          vs {e.opponentName} · {shortDate(e.playedAt)} ·{' '}
          <a className="text-accent hover:underline" href={`${studentUrl(student.id)}/game/${encodeURIComponent(e.clientId)}/${e.ply}`}>
            Open the game
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => setCommenting((c) => !c)}>Comment</button>
          <button
            className={button}
            disabled={!e.homework}
            title={e.homework ? undefined : 'No engine line to use for this position'}
            onClick={() => {
              const n = e.homework ? add(student.id, [e.homework]) : 0;
              setStatus(n ? 'Added to the homework draft (Homework tab).' : 'Already in the draft, or the draft is full.');
            }}
          >
            Add to homework
          </button>
        </div>
        {commenting && (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={comment}>
            <input
              className="min-w-0 flex-1 rounded bg-surface px-2 py-1.5 text-sm"
              maxLength={COACH.maxCommentChars}
              value={body}
              onChange={(ev) => setBody(ev.target.value)}
              placeholder={`On ${moveName(e.ply, e.san)}`}
              aria-label="Comment on this move"
              autoFocus
            />
            <button className={primary} type="submit" disabled={busy || !body.trim()}>Post</button>
          </form>
        )}
        {status && <p className="text-xs" role="status">{status}</p>}
      </div>
    </li>
  );
}
