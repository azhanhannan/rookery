import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { CoachInviteResponse, CoachLinksResponse, CoachStudentRow, CoachUnreadResponse, Homework } from '../../api/types';
import { useCoachBadge } from '../../coach/coachStore';
import { COACH } from '../../config/tunables';
import { findArchivedGame } from '../../game/storage';
import { button, card, message, primary, shortDate } from './ui';

const CATEGORY: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', puzzle: 'Puzzles' };

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** `#/coach`: your coaches (invite code, comments, homework) and your students. */
export function CoachHome() {
  const [links, setLinks] = useState<CoachLinksResponse | null>(null);
  const [students, setStudents] = useState<CoachStudentRow[]>([]);
  const [commented, setCommented] = useState<CoachUnreadResponse | null>(null);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [l, s, c, h] = await Promise.all([api.coach.links(), api.coach.students(), api.coach.unread(), api.coach.myHomework()]);
      setLinks(l);
      setStudents(s.students);
      setCommented(c);
      setHomework(h.homework);
      void useCoachBadge.getState().refresh();
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  if (error && !links) return <p role="alert" className="p-6 text-center text-sm text-danger">{error}</p>;
  if (!links) return <p className="p-6 text-center text-sm text-muted">Loading…</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold">Coach</h1>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <MyCoaches links={links} onChange={reload} onError={setError} />
      {homework.length > 0 && <MyHomework homework={homework} />}
      {commented && commented.games.length > 0 && <MyComments data={commented} />}
      <MyStudents students={students} onChange={reload} />
    </div>
  );
}

function MyCoaches({ links, onChange, onError }: { links: CoachLinksResponse; onChange: () => void; onError: (e: string) => void }) {
  const [invite, setInvite] = useState<CoachInviteResponse | null>(null);
  async function makeCode() {
    try {
      setInvite(await api.coach.invite());
    } catch (e) {
      onError(message(e));
    }
  }
  async function unlink(id: string, name: string) {
    if (!confirm(`Unlink ${name}? They will no longer see your games or homework.`)) return;
    try {
      await api.coach.unlinkCoach(id);
      onChange();
    } catch (e) {
      onError(message(e));
    }
  }
  return (
    <section className={card} aria-labelledby="my-coaches">
      <h2 id="my-coaches" className="mb-1 font-semibold">Your coaches</h2>
      <p className="mb-3 text-sm text-muted">
        Linking a coach lets them see the games saved to your account (with their reviews and your own review notes), your
        ratings and how your homework is going. They can comment on your games and set you puzzle homework. Games you finish
        while signed in are saved to your account; older games on this device can be uploaded from{' '}
        <a href="#/games" className="text-accent hover:underline">My games</a>. You can unlink a coach at any time.
      </p>
      {links.coaches.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2" data-testid="my-coaches">
          {links.coaches.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-medium">{c.username}</span>
              <span className="text-xs text-muted">since {shortDate(c.since)}</span>
              <button className="ml-auto text-xs text-danger hover:underline" onClick={() => void unlink(c.id, c.username)}>Unlink</button>
            </li>
          ))}
        </ul>
      )}
      {invite ? (
        <div className="rounded-lg bg-surface-2 p-3 text-sm" data-testid="invite-code">
          Give your coach this code: <span className="font-mono text-lg font-bold tracking-wider">{invite.code}</span>
          <div className="text-xs text-muted">
            Works once, until {new Date(invite.expiresAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Making a new code cancels this one.
          </div>
        </div>
      ) : (
        <button className={button} onClick={() => void makeCode()}>Make an invite code</button>
      )}
    </section>
  );
}

function MyHomework({ homework }: { homework: Homework[] }) {
  return (
    <section className={card} aria-labelledby="my-homework">
      <h2 id="my-homework" className="mb-3 font-semibold">Your homework</h2>
      <ul className="flex flex-col gap-2" data-testid="my-homework">
        {homework.map((h) => {
          const solved = h.progress.filter((p) => p.solved).length;
          return (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-medium">{h.title}</span>
              <span className="text-xs text-muted">
                from {h.coach.username} · {h.done ? 'done' : `${solved}/${h.items.length} solved`}
                {h.dueAt ? ` · due ${shortDate(h.dueAt)}` : ''}
              </span>
              <a href={`#/coach/homework/${encodeURIComponent(h.id)}`} className={`ml-auto ${h.done ? button : primary}`}>
                {h.done ? 'Practise again' : 'Solve'}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MyComments({ data }: { data: CoachUnreadResponse }) {
  return (
    <section className={card} aria-labelledby="my-comments">
      <h2 id="my-comments" className="mb-3 font-semibold">
        Comments on your games {data.count > 0 && <span className="text-sm text-accent">({data.count} new)</span>}
      </h2>
      <ul className="flex flex-col gap-2">
        {data.games.map((g) => {
          const local = findArchivedGame(g.clientId);
          const name = local ? `${local.white.name} vs ${local.black.name}` : 'A saved game';
          return (
            <li key={g.clientId}>
              <a href={`#/coach/game/${encodeURIComponent(g.clientId)}`} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:outline-1 hover:outline-accent">
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted">{g.total} comment{g.total === 1 ? '' : 's'} · {shortDate(g.latestAt)}</span>
                {g.unread > 0 && <span className="ml-auto text-xs font-semibold text-accent">{g.unread} new</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MyStudents({ students, onChange }: { students: CoachStudentRow[]; onChange: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  async function redeem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.coach.redeem(code);
      setLinked(res.student.username);
      setCode('');
      onChange();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={card} aria-labelledby="my-students">
      <h2 id="my-students" className="mb-1 font-semibold">Your students</h2>
      <p className="mb-3 text-sm text-muted">Coaching someone? Ask them for an invite code (Coach page → “Make an invite code”), then enter it here.</p>
      <form className="mb-3 flex gap-2" onSubmit={redeem}>
        <input
          className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 font-mono text-sm uppercase sm:max-w-48"
          placeholder="ABCD-EFGH"
          value={code}
          maxLength={COACH.codeLength + 4}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Invite code"
        />
        <button className={primary} type="submit" disabled={busy || !code.trim()}>Link student</button>
      </form>
      {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
      {linked && <p className="mb-2 text-sm">Linked to {linked}.</p>}
      {students.length > 0 && (
        <ul className="flex flex-col divide-y divide-surface-2" data-testid="my-students">
          {students.map((s) => (
            <li key={s.id}>
              <a href={`#/coach/student/${encodeURIComponent(s.id)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-surface-2">
                <span className="font-medium">{s.username}</span>
                <span className="text-xs text-muted">
                  {s.ratings.length
                    ? s.ratings.map((r) => `${CATEGORY[r.category] ?? r.category} ${r.rating}${r.provisional ? '?' : ''}`).join(' · ')
                    : 'no ratings yet'}
                </span>
                <span className="ml-auto text-xs text-muted">
                  active {ago(s.lastActive)} · {s.games} game{s.games === 1 ? '' : 's'}
                  {s.openHomework ? ` · ${s.openHomework} homework open` : ''}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
