import { useEffect, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { personColor } from '../account/gamesList';
import { api } from '../api/client';
import type { CoachComment } from '../api/types';
import { useCoachBadge } from '../coach/coachStore';
import { findArchivedGame } from '../game/storage';
import type { GameRecord } from '../game/types';
import { CoachHome } from './coach/CoachHome';
import { GameWithComments } from './coach/GameWithComments';
import { HomeworkSolver } from './coach/HomeworkSolver';
import { CoachGameView, StudentView } from './coach/StudentView';
import { message } from './coach/ui';

/**
 * `#/coach…` (hash after `#/coach`):
 *   ''                              your coaches, your homework, comments on your games, your students
 *   '/student/<id>[/homework|/insights]' a student's games / homework / Insights (coach)
 *   '/student/<id>/game/<clientId>[/<ply>]' one of a student's games, to comment on (coach)
 *   '/game/<clientId>'              your own game with your coaches' comments (student)
 *   '/homework/<id>'                solve a homework set (student)
 */
export function CoachPage({ path }: { path: string }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'unknown') return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  if (status !== 'signed-in') {
    return (
      <div className="mx-auto max-w-xl px-4 py-6 text-center text-sm">
        <h1 className="mb-2 text-xl font-bold">Coach</h1>
        <p className="text-muted">
          {status === 'offline'
            ? 'The server can’t be reached, so coaching is unavailable for now.'
            : 'Link with a coach (or your students) through your account.'}
        </p>
        {status !== 'offline' && <a href="#/login" className="mt-3 inline-block text-accent hover:underline">Log in</a>}
      </div>
    );
  }

  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'student' && parts[1]) {
    if (parts[2] === 'game' && parts[3]) {
      const ply = Number(parts[4]);
      return <CoachGameView key={path} studentId={parts[1]} clientId={parts[3]} ply={Number.isInteger(ply) && ply > 0 ? ply : undefined} />;
    }
    const tab = parts[2] === 'homework' || parts[2] === 'insights' ? parts[2] : 'games';
    return <StudentView key={parts[1]} studentId={parts[1]} tab={tab} />;
  }
  if (parts[0] === 'game' && parts[1]) return <MyGameComments key={parts[1]} clientId={parts[1]} />;
  if (parts[0] === 'homework' && parts[1]) return <HomeworkSolver key={parts[1]} homeworkId={parts[1]} />;
  return <CoachHome />;
}

/** The student's own game with every coach comment on it; opening it marks them read. */
function MyGameComments({ clientId }: { clientId: string }) {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [comments, setComments] = useState<CoachComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const local = findArchivedGame(clientId);
    if (local) setRecord(local);
    else api.getGame(clientId).then((r) => live && setRecord(r.record), (e: unknown) => live && setError(message(e)));
    api.coach.myComments(clientId).then(
      (r) => {
        if (!live) return;
        setComments(r.comments);
        if (r.comments.some((c) => c.readAt === null))
          void api.coach.markRead(clientId).then(() => useCoachBadge.getState().refresh(), () => {});
      },
      (e: unknown) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [clientId]);

  if (error) return <p role="alert" className="p-6 text-center text-sm text-danger">{error}</p>;
  if (!record || !comments) return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <a href="#/coach" className="text-sm text-muted hover:text-ink">← Coach</a>
        <h1 className="text-lg font-bold">
          {record.white.name} vs {record.black.name}
        </h1>
        <a href={`#/review/${encodeURIComponent(record.id)}`} className="text-sm text-accent hover:underline">Open the review</a>
      </div>
      <GameWithComments record={record} comments={comments} side={record.userColor ?? personColor(record)} />
    </div>
  );
}
