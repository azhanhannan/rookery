import { Prisma } from '../../generated/prisma/client';
import { INSIGHTS } from '../../../src/config/tunables';
import type { Color, GameRecord } from '../../../src/game/types';
import { buildGameFacts, exclusionReason, historyOf } from '../../../src/insights/facts';
import type { Coverage, ExclusionReason, GameFacts, HistoryEntry } from '../../../src/insights/types';
import type { Db } from '../db';

// GameInsight rows: one per saved game, built by the same pure code the browser runs (src/insights).
// Written when a game is saved or replaced; any row missing or behind INSIGHTS.factsVersion is rebuilt
// before it is read, and once for every account when the server starts (backfillInsights).

type GameRow = { id: string; userId: string; userColor: string | null; record: Prisma.JsonValue };

const colorOf = (c: string | null): Color | null => (c === 'w' || c === 'b' ? c : null);

/** What a game's row holds. A record the facts code throws on counts as 'unreviewed' (logged), so one bad game can't break the page. */
export function insightData(record: GameRecord, userColor: Color | null, onError?: (err: unknown) => void) {
  let facts: GameFacts | null = null;
  let excluded: ExclusionReason | null;
  try {
    excluded = exclusionReason(record, userColor);
    if (!excluded) facts = buildGameFacts(record, userColor);
    if (!excluded && !facts) excluded = 'unreviewed';
  } catch (err) {
    onError?.(err);
    facts = null;
    excluded = 'unreviewed';
  }
  let history: HistoryEntry | null = null;
  try {
    history = historyOf([record], userColor)[0] ?? null;
  } catch {
    history = null;
  }
  return {
    factsVersion: INSIGHTS.factsVersion,
    facts: facts ? (facts as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    excluded,
    history: history ? (history as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

/** Writes (or replaces) the row for one game. */
export async function writeInsight(db: Db, game: GameRow, onError?: (err: unknown) => void): Promise<void> {
  const data = insightData(game.record as unknown as GameRecord, colorOf(game.userColor), onError);
  await db.gameInsight.upsert({
    where: { gameId: game.id },
    create: { gameId: game.id, userId: game.userId, ...data },
    update: data,
  });
}

/** Rows a reader must not trust: missing, or built by an older factsVersion. */
const staleWhere = (userId?: string): Prisma.GameWhereInput => ({
  ...(userId ? { userId } : {}),
  OR: [{ insight: { is: null } }, { insight: { is: { factsVersion: { not: INSIGHTS.factsVersion } } } }],
});

const BATCH = 25;

/** Rebuilds every stale row (one account, or all when `userId` is omitted); returns how many. */
export async function refreshStale(db: Db, userId?: string, onError?: (err: unknown) => void): Promise<number> {
  const stale = await db.game.findMany({ where: staleWhere(userId), select: { id: true }, orderBy: { id: 'asc' } });
  for (let i = 0; i < stale.length; i += BATCH) {
    const games = await db.game.findMany({
      where: { id: { in: stale.slice(i, i + BATCH).map((g) => g.id) } },
      select: { id: true, userId: true, userColor: true, record: true },
    });
    for (const g of games) await writeInsight(db, g, onError);
  }
  return stale.length;
}

/** Startup backfill: rows for games saved before GameInsight existed, or under an older factsVersion. */
export const backfillInsights = (db: Db, onError?: (err: unknown) => void) => refreshStale(db, undefined, onError);

export type StoredInsights = { facts: GameFacts[]; coverage: Coverage; history: HistoryEntry[] };

/** The account's facts (oldest first), coverage and history, after rebuilding anything stale. */
export async function loadInsights(db: Db, userId: string, onError?: (err: unknown) => void): Promise<StoredInsights> {
  await refreshStale(db, userId, onError);
  const rows = await db.gameInsight.findMany({
    where: { userId, factsVersion: INSIGHTS.factsVersion },
    select: { facts: true, excluded: true, history: true },
  });
  const facts: GameFacts[] = [];
  const history: HistoryEntry[] = [];
  const excluded: Coverage['excluded'] = {};
  for (const r of rows) {
    if (r.facts) facts.push(r.facts as unknown as GameFacts);
    else if (r.excluded) {
      const why = r.excluded as ExclusionReason;
      excluded[why] = (excluded[why] ?? 0) + 1;
    }
    if (r.history) history.push(r.history as unknown as HistoryEntry);
  }
  const byTime = (a: { playedAt: string }, b: { playedAt: string }) => a.playedAt.localeCompare(b.playedAt);
  facts.sort((a, b) => byTime(a, b) || a.gameId.localeCompare(b.gameId));
  history.sort((a, b) => byTime(a, b) || a.gameId.localeCompare(b.gameId));
  return { facts, history, coverage: { total: rows.length, included: facts.length, excluded } };
}
