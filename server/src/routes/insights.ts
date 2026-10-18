import type { FastifyInstance } from 'fastify';
import { COACH, INSIGHTS } from '../../../src/config/tunables';
import type {
  CoachEvidence,
  CoachFocusInfo,
  CoachFocusResponse,
  CoachInsightsResponse,
  CoachUser,
  InsightsFactsResponse,
} from '../../../src/api/types';
import { evidenceHomeworkItem, isFocusBucket } from '../../../src/coach/insights';
import type { GameRecord } from '../../../src/game/types';
import { buildInsights, filterFacts, trendFor } from '../../../src/insights/aggregate';
import { buildProfile } from '../../../src/insights/profile';
import type { BucketId, GameFacts, LedgerBucket, Trend } from '../../../src/insights/types';
import { requireUser } from '../auth/session';
import type { Db } from '../db';
import { loadInsights } from '../insights/store';
import { linkedStudent, NOT_LINKED } from './coach';

type FocusRow = { bucketId: string; note: string | null; createdAt: Date; coach: { id: string; username: string } };
const focusInclude = { coach: { select: { id: true, username: true } } } as const;

function toFocus(f: FocusRow | null): CoachFocusInfo | null {
  if (!f || !isFocusBucket(f.bucketId)) return null;
  return {
    bucketId: f.bucketId,
    note: f.note,
    coach: { id: f.coach.id, username: f.coach.username },
    createdAt: f.createdAt.toISOString(),
  };
}

/** Evidence positions with what the coach needs to act on them (the position, the move, a homework item). */
async function coachEvidence(db: Db, userId: string, facts: GameFacts[], buckets: LedgerBucket[]) {
  const ids = new Set(buckets.flatMap((b) => b.evidence.map((e) => e.gameId)));
  const games = await db.game.findMany({
    where: { userId, clientId: { in: [...ids] } },
    select: { clientId: true, record: true },
  });
  const records = new Map(games.map((g) => [g.clientId, g.record as unknown as GameRecord]));
  const factsById = new Map(facts.map((f) => [f.gameId, f]));
  const out: Partial<Record<BucketId, CoachEvidence[]>> = {};
  for (const b of buckets) {
    const list: CoachEvidence[] = [];
    for (const e of b.evidence) {
      const record = records.get(e.gameId);
      const f = factsById.get(e.gameId);
      const move = record?.review?.moves[e.ply - 1];
      const pos = record?.review?.positions[e.ply - 1];
      const fact = f?.moves.find((m) => m.ply === e.ply);
      if (!record || !f || !move || !pos || !fact) continue;
      const item: CoachEvidence = {
        clientId: e.gameId,
        ply: e.ply,
        loss: e.loss,
        fen: pos.fen,
        san: move.san,
        motif: fact.motif ?? 'other',
        phase: fact.phase,
        opponentName: f.opponentName,
        playedAt: f.playedAt,
        color: f.color,
        homework: evidenceHomeworkItem(record, e.ply, f.color),
      };
      if (move.bestSan) item.bestSan = move.bestSan;
      list.push(item);
    }
    out[b.id] = list;
  }
  return out;
}

// Insights on the server. Student routes read the signed-in player's own rows; coach routes go through
// linkedStudent() first and answer 404 without an active link (as the coach game routes do).
export async function insightRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // ---- Student ---------------------------------------------------------------------------------

  app.get('/insights/facts', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const [stored, links] = await Promise.all([
      loadInsights(db, user.id, (err) => request.log.warn({ err }, 'insights facts failed')),
      db.coachLink.count({ where: { studentId: user.id } }),
    ]);
    return reply.send({ factsVersion: INSIGHTS.factsVersion, ...stored, coachLinked: links > 0 } satisfies InsightsFactsResponse);
  });

  app.get('/insights/coach-focus', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    // Only from a coach still linked (unlinking deletes it too).
    const row = await db.coachFocus.findFirst({
      where: { studentId: user.id, coach: { coachLinks: { some: { studentId: user.id } } } },
      include: focusInclude,
    });
    return reply.send({ focus: toFocus(row) } satisfies CoachFocusResponse);
  });

  // ---- Coach -----------------------------------------------------------------------------------

  app.get<{ Params: { studentId: string } }>('/coach/students/:studentId/insights', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const student = await linkedStudent(db, user.id, request.params.studentId);
    if (!student) return reply.code(404).send({ error: NOT_LINKED });

    const [stored, focusRow] = await Promise.all([
      loadInsights(db, student.id, (err) => request.log.warn({ err }, 'insights facts failed')),
      db.coachFocus.findUnique({ where: { studentId: student.id }, include: focusInclude }),
    ]);
    const focus = toFocus(focusRow);
    const insights = buildInsights(stored.facts, { style: 'analyst', history: stored.history, coverage: stored.coverage });
    const buckets = [...insights.ledger.cells, ...insights.ledger.overlays];

    // Evidence for every bucket a coach can see on the page: shown ones, the Focus and the coach Focus.
    const wanted = buckets.filter((b) => b.shown || b.id === insights.focus?.id || b.id === focus?.bucketId);
    const evidence = await coachEvidence(db, student.id, stored.facts, wanted);

    // Long-term trends (step 8) once there are enough games; rating-band comparisons stay off.
    const current = filterFacts(stored.facts, {});
    const trends: Trend[] =
      current.length >= INSIGHTS.minSample.trendGames
        ? buckets.map((b) => trendFor(current, b.id)).filter((t) => t.shown)
        : [];

    // The student's "Your recent games", built by the same pure code as their page; the coach Focus outranks.
    const profile = buildProfile(insights, { focusId: focus?.bucketId ?? insights.focus?.id ?? null });

    const who: CoachUser = { id: student.id, username: student.username };
    return reply.send({ student: who, insights, evidence, trends, focus, profile } satisfies CoachInsightsResponse);
  });

  app.put<{ Params: { studentId: string } }>('/coach/students/:studentId/focus', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const student = await linkedStudent(db, user.id, request.params.studentId);
    if (!student) return reply.code(404).send({ error: NOT_LINKED });
    const b = (request.body ?? {}) as { bucketId?: unknown; note?: unknown };
    if (!isFocusBucket(b.bucketId))
      return reply.code(400).send({ error: 'Pick a ledger row with a named mistake type (not "other").' });
    let note: string | null = null;
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') return reply.code(400).send({ error: 'A note must be text.' });
      note = b.note.trim() || null;
      if (note && note.length > COACH.maxCommentChars)
        return reply.code(400).send({ error: `A note can be at most ${COACH.maxCommentChars} characters.` });
    }
    const data = { coachId: user.id, bucketId: b.bucketId, note, createdAt: new Date() };
    const row = await db.coachFocus.upsert({
      where: { studentId: student.id },
      create: { studentId: student.id, ...data },
      update: data,
      include: focusInclude,
    });
    return reply.send({ focus: toFocus(row) } satisfies CoachFocusResponse);
  });

  app.delete<{ Params: { studentId: string } }>('/coach/students/:studentId/focus', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const student = await linkedStudent(db, user.id, request.params.studentId);
    if (!student) return reply.code(404).send({ error: NOT_LINKED });
    const gone = await db.coachFocus.deleteMany({ where: { studentId: student.id, coachId: user.id } });
    if (!gone.count) return reply.code(404).send({ error: 'You have not set a Focus for this student.' });
    return reply.code(204).send();
  });
}
