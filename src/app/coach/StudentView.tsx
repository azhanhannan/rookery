import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { CoachGameResponse, CoachGameSummary, CoachUser, Homework, HomeworkItem } from '../../api/types';
import { MiniBoard } from '../../components/MiniBoard';
import { resultLabel, timeControlLabel } from '../../account/gamesList';
import { homeworkItemError, homeworkItemFromMistake, parseSolution } from '../../coach/homework';
import { useHomeworkDraft } from '../../coach/homeworkDraft';
import { COACH } from '../../config/tunables';
import { harvestMistakes, solutionLine } from '../../puzzles/harvest';
import { reviewFits } from '../../review/reviewView';
import { GameWithComments } from './GameWithComments';
import { button, card, fenBefore, message, primary, shortDate } from './ui';

const studentUrl = (id: string, tab?: 'homework') => `#/coach/student/${encodeURIComponent(id)}${tab ? `/${tab}` : ''}`;

/** `#/coach/student/<id>[/homework]`: one student's games, or their homework. */
export function StudentView({ studentId, tab }: { studentId: string; tab: 'games' | 'homework' }) {
  const [student, setStudent] = useState<CoachUser | null>(null);
  const [games, setGames] = useState<CoachGameSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (before?: string) => {
      try {
        const res = await api.coach.games(studentId, before);
        setStudent(res.student);
        setGames((g) => (before ? [...g, ...res.games] : res.games));
        setNextBefore(res.nextBefore);
      } catch (e) {
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );
  useEffect(() => void load(), [load]);

  async function unlink() {
    if (!student || !confirm(`Stop coaching ${student.username}? You will no longer see their games.`)) return;
    try {
      await api.coach.unlinkStudent(student.id);
      location.hash = '#/coach';
    } catch (e) {
      setError(message(e));
    }
  }

  if (loading) return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  if (!student) return <p role="alert" className="p-6 text-center text-sm text-danger">{error ?? 'Not found.'}</p>;

  const tabLink = (t: 'games' | 'homework', label: string) => (
    <a
      href={studentUrl(student.id, t === 'homework' ? 'homework' : undefined)}
      className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-surface-2 font-semibold' : 'text-muted hover:text-ink'}`}
    >
      {label}
    </a>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <a href="#/coach" className="text-sm text-muted hover:text-ink">← Coach</a>
        <h1 className="text-xl font-bold">{student.username}</h1>
        <a href={`#/profile/${encodeURIComponent(student.username)}`} className="text-sm text-accent hover:underline">Profile</a>
        <button className={`${button} ml-auto`} onClick={unlink}>Unlink</button>
      </div>
      <nav className="flex gap-2">{tabLink('games', 'Games')}{tabLink('homework', 'Homework')}</nav>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {tab === 'games' ? (
        <section className={card}>
          {games.length === 0 ? (
            <p className="text-sm text-muted">
              No games on {student.username}’s account yet. Games they finish while signed in are saved there; older games
              on their device can be uploaded from their My games page.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-2" data-testid="coach-games">
              {games.map((g) => (
                <li key={g.clientId}>
                  <a
                    href={`${studentUrl(student.id)}/game/${encodeURIComponent(g.clientId)}`}
                    className="flex items-center gap-3 py-2 hover:bg-surface-2"
                  >
                    <MiniBoard fen={g.finalFen} orientation={g.userColor ?? 'w'} size={48} />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="truncate font-medium">vs {g.opponentName}</div>
                      <div className="text-xs text-muted">
                        {resultLabel(g)} · {timeControlLabel(g.timeControl)} · {Math.ceil(g.moves / 2)} moves · {shortDate(g.playedAt)}
                        {g.rated ? ' · rated' : ''}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted">
                      {g.accuracy !== null ? <div className="text-sm font-semibold text-ink">{g.accuracy}%</div> : g.hasReview ? null : <div>not reviewed</div>}
                      {g.comments > 0 && <div>💬 {g.comments}</div>}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {nextBefore && (
            <button className={`${button} mt-3`} onClick={() => void load(nextBefore)}>More games</button>
          )}
        </section>
      ) : (
        <HomeworkTab student={student} />
      )}
    </div>
  );
}

/** `#/coach/student/<id>/game/<clientId>`: the coach's view of one game, with comments and "add to homework". */
export function CoachGameView({ studentId, clientId }: { studentId: string; clientId: string }) {
  const [data, setData] = useState<CoachGameResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const add = useHomeworkDraft((s) => s.add);
  const draftSize = useHomeworkDraft((s) => s.drafts[studentId]?.length ?? 0);

  useEffect(() => {
    api.coach.game(studentId, clientId).then(setData, (e: unknown) => setError(message(e)));
  }, [studentId, clientId]);

  if (error) return <p role="alert" className="p-6 text-center text-sm text-danger">{error}</p>;
  if (!data) return <p className="p-6 text-center text-sm text-muted">Loading game…</p>;
  const { record, game, student } = data;
  const side = game.userColor;
  const review = reviewFits(record, record.review) ? record.review : undefined;

  function added(n: number) {
    setNote(n ? `Added ${n} position${n === 1 ? '' : 's'} to the homework draft.` : 'Already in the draft (or the draft is full).');
  }

  const actions = (ply: number) => {
    const move = record.moves[ply - 1];
    const pos = review?.positions[ply - 1];
    const mover = fenBefore(record, ply).split(' ')[1];
    const solution = pos && side === mover ? solutionLine(pos, side) : null;
    const mistakes = review ? harvestMistakes([record], { userNames: [student.username] }) : [];
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={!move || !solution}
            title={!review ? 'Needs a reviewed game' : undefined}
            onClick={() =>
              solution && added(add(studentId, [{ fen: fenBefore(record, ply), solution, source: { gameClientId: record.id, ply } }]))
            }
          >
            Add the position before this move to homework
          </button>
          <button className={button} disabled={!mistakes.length} onClick={() => added(add(studentId, mistakes.map(homeworkItemFromMistake)))}>
            Add all {mistakes.length || ''} mistakes from this game
          </button>
        </div>
        {!review && <p className="text-xs text-muted">This game hasn’t been reviewed, so there are no engine solutions to use. You can still type a position on the Homework tab.</p>}
        {note && <p className="text-xs">{note}</p>}
        {draftSize > 0 && (
          <a className="text-xs text-accent hover:underline" href={studentUrl(studentId, 'homework')}>
            Homework draft: {draftSize} position{draftSize === 1 ? '' : 's'} — set it
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <a href={studentUrl(studentId)} className="text-sm text-muted hover:text-ink">← {student.username}</a>
        <h1 className="text-lg font-bold">
          {record.white.name} vs {record.black.name}
        </h1>
        <span className="text-sm text-muted">{record.result} · {shortDate(game.playedAt)}</span>
      </div>
      <GameWithComments
        record={record}
        comments={data.comments}
        side={side}
        actions={actions}
        onComment={async (body, ply) => {
          const res = await api.coach.comment(studentId, clientId, { body, ply });
          setData((d) => (d ? { ...d, comments: [...d.comments, res.comment] } : d));
        }}
      />
    </div>
  );
}

function HomeworkTab({ student }: { student: CoachUser }) {
  const [list, setList] = useState<Homework[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = useHomeworkDraft((s) => s.drafts[student.id] ?? []);
  const { add, remove, clear } = useHomeworkDraft.getState();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const reload = useCallback(() => {
    api.coach.studentHomework(student.id).then((r) => setList(r.homework), (e: unknown) => setError(message(e)));
  }, [student.id]);
  useEffect(reload, [reload]);

  // Typed position: FEN + solution moves.
  const [fen, setFen] = useState('');
  const [moves, setMoves] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  function addTyped(e: FormEvent) {
    e.preventDefault();
    const parsed = parseSolution(fen, moves);
    if ('error' in parsed) return setTypedError(parsed.error);
    const item: HomeworkItem = { fen: fen.trim(), solution: parsed.solution };
    const err = homeworkItemError(item);
    if (err) return setTypedError(err);
    if (!add(student.id, [item])) return setTypedError('That position is already in the draft, or the draft is full.');
    setTypedError(null);
    setFen('');
    setMoves('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.coach.setHomework(student.id, {
        title: title.trim(),
        items: draft,
        dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : null,
      });
      clear(student.id);
      setTitle('');
      setDue('');
      reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function del(h: Homework) {
    if (!confirm(`Delete “${h.title}”? ${student.username}’s attempts go with it.`)) return;
    try {
      await api.coach.deleteHomework(h.id);
      reload();
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <>
      <section className={card} aria-labelledby="hw-new">
        <h2 id="hw-new" className="mb-1 font-semibold">New homework</h2>
        <p className="mb-3 text-xs text-muted">
          Pick positions from {student.username}’s reviewed games (open a game, then “Add … to homework”), or type a FEN and
          its solution. Up to {COACH.maxHomeworkItems} positions.
        </p>
        {draft.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-3" data-testid="homework-draft">
            {draft.map((it, i) => (
              <li key={`${it.fen}-${i}`} className="flex flex-col items-center gap-1 text-xs">
                <MiniBoard fen={it.fen} orientation={it.fen.split(' ')[1] === 'b' ? 'b' : 'w'} size={88} />
                <span className="text-muted">{it.source ? `game, move ${Math.ceil(it.source.ply / 2)}` : 'typed'}</span>
                <button className="text-danger hover:underline" onClick={() => remove(student.id, i)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={addTyped}>
          <input className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 text-sm" placeholder="FEN (side to move solves)" value={fen} onChange={(e) => setFen(e.target.value)} aria-label="FEN" />
          <input className="min-w-0 rounded bg-surface-2 px-2 py-1.5 text-sm sm:w-48" placeholder="Solution, e.g. Qxf7#" value={moves} onChange={(e) => setMoves(e.target.value)} aria-label="Solution moves" />
          <button className={button} type="submit" disabled={!fen.trim() || !moves.trim()}>Add position</button>
        </form>
        {typedError && <p role="alert" className="mb-3 text-sm text-danger">{typedError}</p>}
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submit}>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Title
            <input className="rounded bg-surface-2 px-2 py-1.5" maxLength={COACH.maxTitleChars} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Check the checks" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Due (optional)
            <input type="date" className="rounded bg-surface-2 px-2 py-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <button className={primary} type="submit" disabled={busy || !title.trim() || draft.length === 0}>
            Set {draft.length || ''} position{draft.length === 1 ? '' : 's'}
          </button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </section>

      <section className={card} aria-labelledby="hw-set">
        <h2 id="hw-set" className="mb-3 font-semibold">Homework set</h2>
        {!list ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="homework-list">
            {list.map((h) => {
              const solved = h.progress.filter((p) => p.solved).length;
              const late = !h.done && h.dueAt && new Date(h.dueAt).getTime() < now;
              return (
                <li key={h.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{h.title}</span>
                    <span className={h.done ? 'text-accent' : late ? 'text-danger' : 'text-muted'}>
                      {h.done ? 'Done' : `${solved}/${h.items.length} solved`}
                      {h.dueAt ? ` · due ${shortDate(h.dueAt)}` : ''}
                    </span>
                    <button className="ml-auto text-xs text-danger hover:underline" onClick={() => void del(h)}>Delete</button>
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-2 text-xs">
                    {h.progress.map((p, i) => (
                      <li key={i} className="rounded bg-surface px-2 py-1" title={`Position ${i + 1}`}>
                        {i + 1}: {p.solved ? '✓' : '–'} {p.attempts} {p.attempts === 1 ? 'try' : 'tries'}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
