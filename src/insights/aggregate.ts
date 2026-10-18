// Insights over many games (pure): the points-lost ledger and Focus pick, phase error rates, conversion and
// saves, clock pressure, the after-loss line and opening rows. Every number carries its n and a 90% interval.
import { INSIGHTS } from '../config/tunables';
import { openingFamily, UNKNOWN_OPENING } from '../account/openingsReport';
import { bucketGames, CELL_IDS, OVERLAY_IDS, priorsOf, qualifies, summariseBucket } from './buckets';
import { bayesSlope, diffOfMeans, medianOf, poissonRate, rateRatio, shrink, wilson } from './stats';
import { CONVERSION_TARGET, OPENINGS_TARGET, trainForPhase } from './train';
import {
  HUMAN_LIKE,
  PHASES,
  type AfterLossLine,
  type BucketId,
  type ClockCard,
  type Episode,
  type EpisodeCard,
  type EpisodeStat,
  type EvidenceRef,
  type GameFacts,
  type InsightCard,
  type InsightsModel,
  type InsightsOptions,
  type Ledger,
  type LedgerBucket,
  type ModelWindow,
  type Motif,
  type MoveFact,
  type OpeningRow,
  type OpponentFilter,
  type OpponentType,
  type PhaseRate,
  type ThreatStat,
  type Trend,
} from './types';

type EpisodeOf = (f: GameFacts) => Episode | undefined;

const byPlayed = (a: GameFacts, b: GameFacts) => a.playedAt.localeCompare(b.playedAt) || a.gameId.localeCompare(b.gameId);
const rank = (a: LedgerBucket, b: LedgerBucket) => b.lowerBound - a.lowerBound || b.pointsPerGame.value - a.pointsPerGame.value;

/** Whether a game against `type` passes the opponent filter ('bot' = Maia and Stockfish bots). */
export function opponentMatches(type: OpponentType, filter: OpponentFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'bot') return type !== 'human';
  return type === filter;
}

/** The facts the filters keep, oldest first. */
export function filterFacts(facts: GameFacts[], options: Pick<InsightsOptions, 'speed' | 'opponent'>): GameFacts[] {
  const speed = options.speed ?? 'all';
  const opponent = options.opponent ?? 'all';
  return facts
    .filter((f) => f.factsVersion === INSIGHTS.factsVersion)
    .filter((f) => (speed === 'all' || f.speed === speed) && opponentMatches(f.opponent, opponent))
    .sort(byPlayed);
}

export function buildLedger(facts: GameFacts[]): Ledger {
  const priors = priorsOf(facts);
  const cells = CELL_IDS.map((id) => summariseBucket(facts, id, priors)).sort(rank);
  const overlays = OVERLAY_IDS.map((id) => summariseBucket(facts, id, priors)).sort(rank);
  const games = facts.filter((f) => !f.clockOnly).length;
  const total = cells.reduce((s, c) => s + c.rawPointsPerGame, 0);
  const other = cells.filter((c) => c.motif === 'other').reduce((s, c) => s + c.rawPointsPerGame, 0);
  return { games, pointsPerGame: total, otherShare: total > 0 ? other / total : 0, cells, overlays };
}

/** The top eligible bucket (cells and overlays), or null. */
export function pickFocus(ledger: Ledger): LedgerBucket | null {
  return [...ledger.cells, ...ledger.overlays].filter((b) => b.eligible).sort(rank)[0] ?? null;
}

/** Long-term trend of a bucket's points lost per game: Bayesian slope over game order. */
export function trendFor(facts: GameFacts[], id: BucketId): Trend {
  const rows = bucketGames(facts, id);
  const slope = bayesSlope(rows.map((_, i) => i), rows.map((r) => r.points), INSIGHTS.trendPriorSd);
  const shown = rows.length >= INSIGHTS.minSample.trendGames;
  const direction = !shown ? 'no-clear-change' : slope.hi < 0 ? 'improving' : slope.lo > 0 ? 'worsening' : 'no-clear-change';
  return { bucketId: id, games: rows.length, slope: { value: slope.value, lo: slope.lo, hi: slope.hi }, shown, direction };
}

function cardsFor(style: InsightsOptions['style'], ledger: Ledger, focus: LedgerBucket | null, facts: GameFacts[]): InsightCard[] {
  const count = style === 'learner' ? 1 : style === 'club' ? 2 : 3;
  const rest = [...ledger.cells, ...ledger.overlays].filter((b) => b.shown && b.motif !== 'other' && b.id !== focus?.id).sort(rank);
  const cards: InsightCard[] = [];
  if (focus) cards.push({ role: 'focus', bucket: focus });
  // Learner sees the Focus only; without one, nothing (a card that isn't a prescription doesn't help a beginner).
  if (style !== 'learner') {
    for (const b of rest) {
      if (cards.length >= count) break;
      cards.push({ role: style === 'club' ? 'watch' : 'card', bucket: b });
    }
  }
  return cards.map((c) => {
    const trend = trendFor(facts, c.bucket.id);
    return trend.shown ? { ...c, trend } : c;
  });
}

export function phaseRates(facts: GameFacts[]): PhaseRate[] {
  const chess = facts.filter((f) => !f.clockOnly);
  const per = PHASES.map((phase) => {
    let moves = 0;
    let errors = 0;
    let slips = 0;
    for (const f of chess) {
      for (const m of f.moves) {
        if (m.phase !== phase || !qualifies(m)) continue;
        moves++;
        if (m.loss >= INSIGHTS.errorLoss) errors++;
        if (m.loss >= INSIGHTS.eventLoss) slips++;
      }
    }
    return { phase, moves, errors, slips };
  });
  const totalMoves = per.reduce((s, p) => s + p.moves, 0);
  const pooled = totalMoves ? (100 * per.reduce((s, p) => s + p.errors, 0)) / totalMoves : 0;
  const g = INSIGHTS.minSample;
  return per.map((p) => {
    const rate = poissonRate(p.errors, p.moves / 100);
    const shown = p.moves >= g.cardMoves && p.errors >= g.cardEvents;
    return {
      phase: p.phase,
      moves: p.moves,
      errors: p.errors,
      rate,
      slips: p.slips,
      slipRate: poissonRate(p.slips, p.moves / 100),
      weakest: shown && rate.lo > pooled,
      shown,
      earlyRead: p.moves < g.cardMoves * g.earlyReadFactor || p.errors < g.cardEvents * g.earlyReadFactor,
      train: trainForPhase(p.phase),
    };
  });
}

function episodeStat(games: GameFacts[], overall: number, episodeOf: EpisodeOf): EpisodeStat {
  const won = games.filter((f) => f.score === 1).length;
  const drawn = games.filter((f) => f.score === 0.5).length;
  const n = games.length;
  const g = INSIGHTS.minSample;
  const starts = games.flatMap((f) => {
    const e = episodeOf(f);
    return e ? [{ gameId: f.gameId, ply: e.startPly, win: e.win }] : [];
  });
  return {
    episodes: n,
    expected: starts.length ? starts.reduce((s, e) => s + e.win, 0) / starts.length / 100 : 0,
    starts: starts.map(({ gameId, ply }) => ({ gameId, ply })),
    won,
    drawn,
    lost: n - won - drawn,
    score: wilson(won + drawn / 2, n),
    shrunkScore: shrink(won + drawn / 2, n, overall),
    shown: n >= g.episodes,
    earlyRead: n < g.episodes * g.earlyReadFactor,
    gameIds: games.map((f) => f.gameId),
  };
}

function episodeCard(facts: GameFacts[], episodeOf: EpisodeOf, strongOf?: EpisodeOf): EpisodeCard {
  const chess = facts.filter((f) => !f.clockOnly);
  const overall = chess.length ? chess.reduce((s, f) => s + f.score, 0) / chess.length : 0.5;
  const games = chess.filter((f) => !!episodeOf(f));
  const stat = (g: GameFacts[]) => episodeStat(g, overall, episodeOf);
  const card: EpisodeCard = {
    all: stat(games),
    human: stat(games.filter((f) => f.opponent === 'human')),
    maia: stat(games.filter((f) => f.opponent === 'maia')),
    stockfish: stat(games.filter((f) => f.opponent === 'stockfish')),
    humanLike: stat(games.filter((f) => HUMAN_LIKE.includes(f.opponent))),
    train: CONVERSION_TARGET,
  };
  if (strongOf) card.strong = episodeStat(chess.filter((f) => !!strongOf(f)), overall, strongOf);
  return card;
}

/** Motifs that mean "the opponent's threat went through": material or mate given away. */
export const THREAT_MOTIFS: readonly Motif[] = ['ignored-threat', 'hanging', 'allowed-mate', 'back-rank'];

const gaveAway = (m: MoveFact) => m.loss >= INSIGHTS.eventLoss && !!m.motif && THREAT_MOTIFS.includes(m.motif);

/** Checking their threats: own moves right after a threat, how often one went through, and the other moves. */
export function threatStat(facts: GameFacts[]): ThreatStat {
  let moves = 0;
  let missed = 0;
  let otherMoves = 0;
  let otherMissed = 0;
  const evidence: EvidenceRef[] = [];
  for (const f of facts) {
    if (f.clockOnly) continue;
    for (const m of f.moves) {
      if (!qualifies(m)) continue;
      const event = gaveAway(m);
      if (m.oppThreat) {
        moves++;
        if (event) {
          missed++;
          evidence.push({ gameId: f.gameId, ply: m.ply, loss: m.loss });
        }
      } else {
        otherMoves++;
        if (event) otherMissed++;
      }
    }
  }
  const g = INSIGHTS.minSample;
  return {
    moves,
    missed,
    share: wilson(missed, moves),
    otherMoves,
    otherMissed,
    ratio: moves && otherMoves ? rateRatio(missed, moves, otherMissed, otherMoves) : { value: 1, lo: 0, hi: Infinity },
    shown: moves >= g.cardMoves && missed >= g.cardEvents,
    evidence: evidence.sort((a, b) => b.loss - a.loss).slice(0, INSIGHTS.notableMoves),
  };
}

/** Which games the model covers: count, dates, and the split by opponent type and by speed. */
export function modelWindow(facts: GameFacts[]): ModelWindow {
  const opponents: Record<OpponentType, number> = { human: 0, maia: 0, stockfish: 0 };
  const speeds: ModelWindow['speeds'] = {};
  const humanLikeBySpeed: ModelWindow['humanLikeBySpeed'] = {};
  for (const f of facts) {
    opponents[f.opponent]++;
    speeds[f.speed] = (speeds[f.speed] ?? 0) + 1;
    if (HUMAN_LIKE.includes(f.opponent)) humanLikeBySpeed[f.speed] = (humanLikeBySpeed[f.speed] ?? 0) + 1;
  }
  const w: ModelWindow = { games: facts.length, opponents, speeds, humanLikeBySpeed };
  if (facts.length) {
    const times = facts.map((f) => f.playedAt).sort();
    w.from = times[0];
    w.to = times[times.length - 1];
  }
  return w;
}

export function clockCard(facts: GameFacts[]): ClockCard | null {
  const timed = facts.filter((f) => f.hasClock);
  if (timed.length === 0) return null;
  let troubleMoves = 0;
  let troubleErrors = 0;
  let normalMoves = 0;
  let normalErrors = 0;
  for (const f of timed) {
    if (f.clockOnly) continue;
    for (const m of f.moves) {
      if (!qualifies(m) || m.timeTrouble === undefined) continue;
      const error = m.loss >= INSIGHTS.errorLoss ? 1 : 0;
      if (m.timeTrouble) {
        troubleMoves++;
        troubleErrors += error;
      } else {
        normalMoves++;
        normalErrors += error;
      }
    }
  }
  const ratio = troubleMoves && normalMoves ? rateRatio(troubleErrors, troubleMoves, normalErrors, normalMoves) : { value: 1, lo: 0, hi: Infinity };
  const shown = troubleMoves >= INSIGHTS.minSample.troubleMoves;
  return {
    games: timed.length,
    troubleMoves,
    troubleErrors,
    normalMoves,
    normalErrors,
    ratio,
    shown,
    differs: shown && (ratio.lo > 1 || ratio.hi < 1),
    lostOnTimeWhileBetter: timed.filter((f) => f.lostOnTimeWhileBetter).map((f) => f.gameId),
    rushedCritical: null,
  };
}

const pts = (x: number) => x.toFixed(2);

/**
 * "In the game right after a loss…" — descriptive, strict: Club and Analyst only, enough games after a loss,
 * and the 90% interval of the difference excludes 0.
 */
export function afterLossLine(facts: GameFacts[], options: InsightsOptions): AfterLossLine | null {
  if (options.style === 'learner') return null;
  const history = options.history?.length
    ? [...options.history].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.gameId.localeCompare(b.gameId))
    : facts.map((f) => ({ gameId: f.gameId, playedAt: f.playedAt, score: f.score }));
  const afterLoss = new Set<string>();
  for (let i = 1; i < history.length; i++) if (history[i - 1].score === 0) afterLoss.add(history[i].gameId);
  const perGame = (f: GameFacts) => f.moves.reduce((s, m) => s + (m.inBook ? 0 : m.loss / 100), 0);
  const chess = facts.filter((f) => !f.clockOnly);
  const after = chess.filter((f) => afterLoss.has(f.gameId)).map(perGame);
  const others = chess.filter((f) => !afterLoss.has(f.gameId)).map(perGame);
  if (after.length < INSIGHTS.minSample.afterLossGames || others.length < 2) return null;
  const difference = diffOfMeans(after, others);
  if (difference.lo <= 0 && difference.hi >= 0) return null;
  const afterMean = after.reduce((s, x) => s + x, 0) / after.length;
  const otherMean = others.reduce((s, x) => s + x, 0) / others.length;
  return {
    afterGames: after.length,
    otherGames: others.length,
    afterMean,
    otherMean,
    difference,
    text:
      `In the game right after a loss, you gave away ${pts(afterMean)} points of win chance on average; ` +
      `in your other games, ${pts(otherMean)} (from ${after.length} and ${others.length} games).`,
  };
}

/** Opening family × colour, with honest scores. */
export function openingRows(facts: GameFacts[]): OpeningRow[] {
  const chess = facts.filter((f) => !f.clockOnly);
  const colourScore = (c: 'w' | 'b') => {
    const g = chess.filter((f) => f.color === c);
    return g.length ? g.reduce((s, f) => s + f.score, 0) / g.length : 0.5;
  };
  const groups = new Map<string, GameFacts[]>();
  for (const f of chess) {
    const name = f.opening ? openingFamily(f.opening) : UNKNOWN_OPENING;
    const key = `${f.color}|${name}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const g = INSIGHTS.minSample;
  return [...groups.entries()]
    .map(([key, games]): OpeningRow => {
      const [color, name] = key.split('|') as ['w' | 'b', string];
      const won = games.filter((f) => f.score === 1).length;
      const drawn = games.filter((f) => f.score === 0.5).length;
      const points = won + drawn / 2;
      const shrunkScore = shrink(points, games.length, colourScore(color));
      const rated = games.filter((f) => f.opponent === 'human' && f.opponentElo !== undefined);
      let performance: number | null = null;
      if (rated.length > 0) {
        const s = Math.min(0.95, Math.max(0.05, shrink(rated.reduce((a, f) => a + f.score, 0), rated.length, colourScore(color))));
        const avg = rated.reduce((a, f) => a + f.opponentElo!, 0) / rated.length;
        performance = Math.round(avg + 400 * Math.log10(s / (1 - s)));
      }
      const firstSlips = games
        .map((f) => f.moves.find((m) => !m.inBook && m.loss >= INSIGHTS.eventLoss))
        .filter((m) => m !== undefined)
        .map((m) => Math.ceil(m.ply / 2));
      const median = medianOf(firstSlips);
      return {
        name,
        color,
        games: games.length,
        won,
        drawn,
        lost: games.length - won - drawn,
        score: wilson(points, games.length),
        shrunkScore,
        performance,
        openingLoss: games.reduce((s, f) => s + f.moves.reduce((a, m) => a + (m.phase === 'O' && !m.inBook ? m.loss / 100 : 0), 0), 0) / games.length,
        firstSlipMove: median === null ? null : Math.round(median),
        shown: games.length >= g.openingGames,
        earlyRead: games.length < g.openingEarlyGames,
        gameIds: games.map((f) => f.gameId),
        train: OPENINGS_TARGET,
      };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

/** Everything the Insights page shows, from facts (see `buildAllFacts`). */
export function buildInsights(allFacts: GameFacts[], options: InsightsOptions): InsightsModel {
  const facts = filterFacts(allFacts, options);
  const g = INSIGHTS.minSample;
  const games = facts.length;
  const status = games < g.pageGames ? 'locked' : games < g.earlyGames ? 'early' : 'ready';
  const ledger = buildLedger(facts);
  const focus = status === 'locked' ? null : pickFocus(ledger);
  const model: InsightsModel = {
    factsVersion: INSIGHTS.factsVersion,
    builtAt: (options.now ?? new Date()).toISOString(),
    status,
    games,
    needGames: Math.max(0, g.pageGames - games),
    filters: { speed: options.speed ?? 'all', opponent: options.opponent ?? 'all' },
    ledger,
    focus,
    cards: status === 'locked' ? [] : cardsFor(options.style, ledger, focus, facts),
    phaseRates: phaseRates(facts),
    conversion: episodeCard(facts, (f) => f.conversion, (f) => f.conversionStrong),
    saves: episodeCard(facts, (f) => f.save),
    clock: clockCard(facts),
    threats: threatStat(facts),
    window: modelWindow(facts),
    afterLoss: status === 'locked' ? null : afterLossLine(facts, options),
    openings: openingRows(facts),
  };
  if (options.coverage) model.coverage = options.coverage;
  return model;
}
