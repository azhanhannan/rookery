// The points-lost ledger's buckets (pure): which moves belong to each, its per-game numbers, shrinkage and
// ranking. Shared by the aggregate (ranking, cards) and the Focus re-test (baseline and counts).
import { INSIGHTS } from '../config/tunables';
import { mean, poissonRate, shrink, variance } from './stats';
import { trainForBucket } from './train';
import { MOTIFS, PHASES, type BucketId, type CellId, type GameFacts, type LedgerBucket, type Motif, type MoveFact, type Phase } from './types';

export const CELL_IDS: readonly CellId[] = PHASES.flatMap((p) => MOTIFS.map((m) => `${p}:${m}` as CellId));
export const OVERLAY_IDS: readonly BucketId[] = ['time-trouble', 'conversion'];

export const motifOf = (m: MoveFact): Motif => m.motif ?? 'other';

/** Moves counted in rates: not book, and the player wasn't already lost. */
export const qualifies = (m: MoveFact) => !m.inBook && m.winBefore >= INSIGHTS.lostBelow;

type Spec = {
  /** Games the bucket is measured over. */
  game: (f: GameFacts) => boolean;
  /** Moves whose loss the bucket collects (every non-book move that belongs). */
  member: (m: MoveFact) => boolean;
  event: (m: MoveFact) => boolean;
  extraPoints?: (f: GameFacts) => number;
};

const chessGame = (f: GameFacts) => !f.clockOnly;

function specFor(id: BucketId): Spec {
  if (id === 'time-trouble') {
    return {
      game: (f) => f.hasClock,
      member: (m) => !m.inBook && m.timeTrouble === true,
      event: (m) => m.loss >= INSIGHTS.errorLoss,
      extraPoints: (f) => (f.lostOnTimeWhileBetter ? f.finalWin / 100 : 0),
    };
  }
  if (id === 'conversion') {
    return {
      game: chessGame,
      member: (m) => !m.inBook && m.winBefore >= INSIGHTS.episode.winAt,
      event: (m) => m.loss >= INSIGHTS.errorLoss,
    };
  }
  const [phase, motif] = id.split(':') as [Phase, Motif];
  return {
    game: chessGame,
    member: (m) => !m.inBook && m.phase === phase && motifOf(m) === motif,
    event: (m) => m.loss >= INSIGHTS.eventLoss,
  };
}

/** One game's share of a bucket. `moves` = qualifying moves in the bucket's denominator. */
export type GameBucketStat = { gameId: string; playedAt: string; points: number; moves: number; events: number };

/**
 * Per-game numbers for a bucket. A cell's rate denominator is every qualifying move of its phase (so the
 * cells of a phase share one denominator); an overlay's is its own qualifying members.
 */
export function bucketGames(facts: GameFacts[], id: BucketId): GameBucketStat[] {
  const spec = specFor(id);
  const phase = id.includes(':') ? (id.split(':')[0] as Phase) : null;
  const out: GameBucketStat[] = [];
  for (const f of facts) {
    if (!spec.game(f)) continue;
    let points = spec.extraPoints?.(f) ?? 0;
    let moves = 0;
    let events = 0;
    if (!f.clockOnly) {
      for (const m of f.moves) {
        const member = spec.member(m);
        if (member) points += m.loss / 100;
        if (!qualifies(m)) continue;
        if (phase ? m.phase === phase : member) moves++;
        if (member && spec.event(m)) events++;
      }
    }
    out.push({ gameId: f.gameId, playedAt: f.playedAt, points, moves, events });
  }
  return out;
}

/** What each bucket is shrunk toward: the average cell (points per game, events per move). */
export type Priors = { pointsPerGame: number; cellRate: number; errorRate: number };

export function priorsOf(facts: GameFacts[]): Priors {
  const games = facts.filter(chessGame);
  let points = 0;
  let qualifying = 0;
  let events = 0;
  let errors = 0;
  for (const f of games) {
    for (const m of f.moves) {
      if (!m.inBook) points += m.loss / 100;
      if (!qualifies(m)) continue;
      qualifying++;
      if (m.loss >= INSIGHTS.eventLoss) events++;
      if (m.loss >= INSIGHTS.errorLoss) errors++;
    }
  }
  const cells = CELL_IDS.length;
  return {
    pointsPerGame: games.length ? points / games.length / cells : 0,
    cellRate: qualifying ? events / qualifying / MOTIFS.length : 0,
    errorRate: qualifying ? errors / qualifying : 0,
  };
}

/** Events per 100 moves, shrunk toward `priorRate` (per move) by k games' worth of moves. */
export function shrunkRatePer100(events: number, moves: number, games: number, priorRate: number): number {
  const perGame = games > 0 ? moves / games : 0;
  const weight = INSIGHTS.shrinkK * perGame;
  return moves + weight > 0 ? (100 * (events + weight * priorRate)) / (moves + weight) : 100 * priorRate;
}

/** Everything the ledger knows about one bucket, evidence included. */
export function summariseBucket(facts: GameFacts[], id: BucketId, priors: Priors = priorsOf(facts)): LedgerBucket {
  const rows = bucketGames(facts, id);
  const overlay = !id.includes(':');
  const [phase, motif] = overlay ? [undefined, undefined] : (id.split(':') as [Phase, Motif]);
  const n = rows.length;
  const xs = rows.map((r) => r.points);
  const sum = xs.reduce((s, x) => s + x, 0);
  const moves = rows.reduce((s, r) => s + r.moves, 0);
  const events = rows.reduce((s, r) => s + r.events, 0);
  const k = INSIGHTS.shrinkK;
  const value = shrink(sum, n, priors.pointsPerGame, k);
  const se = n > 1 ? Math.sqrt(n * variance(xs)) / (n + k) : 0;
  const lowerBound = value - INSIGHTS.z * se;
  const priorRate = overlay ? priors.errorRate : priors.cellRate;
  const shrunkRate = shrunkRatePer100(events, moves, n, priorRate);
  const perGame = n > 0 ? moves / n : 0;
  const expectedEvents = (shrunkRate / 100) * perGame * INSIGHTS.testable.games;
  const g = INSIGHTS.minSample;
  const shown = moves >= g.cardMoves && events >= g.cardEvents;
  const earlyRead = moves < g.cardMoves * g.earlyReadFactor || events < g.cardEvents * g.earlyReadFactor;
  const testable = expectedEvents >= INSIGHTS.testable.events;
  const train = trainForBucket(id) ?? undefined;
  const eligible = shown && motif !== 'other' && !!train && testable && n >= g.focusGames && events >= g.focusEvents;
  const bucket: LedgerBucket = {
    id,
    overlay,
    games: n,
    rawPointsPerGame: n ? mean(xs) : 0,
    pointsPerGame: { value, lo: Math.max(0, lowerBound), hi: value + INSIGHTS.z * se },
    lowerBound,
    moves,
    events,
    rate: poissonRate(events, moves / 100),
    shrunkRate,
    expectedEvents,
    testable,
    shown,
    earlyRead,
    eligible,
    evidence: evidenceFor(facts, id),
  };
  if (phase) bucket.phase = phase;
  if (motif) bucket.motif = motif;
  if (train) bucket.train = train;
  return bucket;
}

/** The bucket's worst moves across games (events only), largest loss first. */
export function evidenceFor(facts: GameFacts[], id: BucketId, limit = INSIGHTS.notableMoves): LedgerBucket['evidence'] {
  const spec = specFor(id);
  const out: LedgerBucket['evidence'] = [];
  for (const f of facts) {
    if (!spec.game(f) || f.clockOnly) continue;
    for (const m of f.moves) {
      if (!spec.member(m) || !spec.event(m)) continue;
      const fen = f.notable.find((n) => n.ply === m.ply)?.fenBefore;
      out.push(fen ? { gameId: f.gameId, ply: m.ply, loss: m.loss, fenBefore: fen } : { gameId: f.gameId, ply: m.ply, loss: m.loss });
    }
  }
  return out.sort((a, b) => b.loss - a.loss).slice(0, limit);
}
