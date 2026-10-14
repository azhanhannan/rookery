// Maia matching (SPEC Feature 4): for each of a player's moves, how likely Maia-3 at a given rating was to play it.
// The rating with the highest total likelihood over the game is the estimate. Pure apart from the injected model.
import type { MaiaPolicy } from '../bots/maiaPlayer';
import { MAIA_MATCH, RATING } from '../config/tunables';
import type { Color, GameRecord } from '../game/types';
import { isBlackToMove, legalUcis } from '../maia/encoding';

/** How well Maia at `elo` predicts the player's moves. */
export type MaiaFitPoint = {
  elo: number;
  /** Average log-likelihood per move (closer to 0 = a better fit). */
  avgLogLik: number;
  /** Share of moves that were Maia's top choice. */
  top: number;
};

export type MaiaMatchPlayer =
  | {
      kind: 'estimate';
      rating: number;
      low: number;
      high: number;
      /** The best fit is at the model's lowest or highest rating, so the true rating may lie beyond it. */
      edge: 'low' | 'high' | null;
      /** Moves compared (forced moves are skipped: they say nothing about style). */
      moves: number;
      /** Share of those moves that were Maia's top choice at the evaluated rating nearest the estimate. */
      agreement: number;
      curve: MaiaFitPoint[];
    }
  | { kind: 'not-enough-moves'; moves: number };

/** Stored on the game record. Only the people in the game are matched; a bot side is absent. */
export type MaiaMatch = { version: 1; createdAt: string; white?: MaiaMatchPlayer; black?: MaiaMatchPlayer };

export type MatchPosition = { fen: string; uci: string };

/** `color`'s moves in `record` as (position before, move played), without forced moves. */
export function matchPositions(record: GameRecord, color: Color): MatchPosition[] {
  const out: MatchPosition[] = [];
  let fen = record.startFen;
  for (const m of record.moves) {
    const mover: Color = isBlackToMove(fen) ? 'b' : 'w';
    if (mover === color && legalUcis(fen).length > 1) out.push({ fen, uci: m.uci });
    fen = m.fenAfter;
  }
  return out;
}

/** Sides worth matching: the people. Bots already have a known rating. */
export function matchColors(record: GameRecord): Color[] {
  return (['w', 'b'] as Color[]).filter((c) => !(c === 'w' ? record.white : record.black).isBot);
}

/** Model evaluations a full match of `positions` makes at most (coarse pass plus two refinements). */
export function matchCost(positions: number): number {
  return positions < RATING.minMoves ? 0 : positions * (MAIA_MATCH.coarse.length + 2);
}

/** The rating at the top of the curve: a parabola through the best point and its neighbours, else the best point. */
export function peakElo(curve: MaiaFitPoint[]): number {
  const pts = [...curve].sort((a, b) => a.elo - b.elo);
  let i = 0;
  for (let k = 1; k < pts.length; k++) if (pts[k].avgLogLik > pts[i].avgLogLik) i = k;
  if (i === 0 || i === pts.length - 1) return pts[i].elo;
  const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
  // Vertex of the parabola through three points with any spacing.
  const num = (b.elo - a.elo) ** 2 * (b.avgLogLik - c.avgLogLik) - (b.elo - c.elo) ** 2 * (b.avgLogLik - a.avgLogLik);
  const den = (b.elo - a.elo) * (b.avgLogLik - c.avgLogLik) - (b.elo - c.elo) * (b.avgLogLik - a.avgLogLik);
  if (den === 0) return b.elo;
  return Math.min(c.elo, Math.max(a.elo, b.elo - num / (2 * den)));
}

/** Turns a fitted curve into the shown estimate (a range, never a single number). */
export function summariseMatch(curve: MaiaFitPoint[], moves: number): MaiaMatchPlayer {
  if (moves < RATING.minMoves || curve.length === 0) return { kind: 'not-enough-moves', moves };
  const sorted = [...curve].sort((a, b) => a.elo - b.elo);
  const peak = peakElo(sorted);
  const [lo, hi] = [sorted[0].elo, sorted[sorted.length - 1].elo];
  const half = moves < RATING.shortGameMoves ? MAIA_MATCH.shortGameRange : MAIA_MATCH.range;
  const round = (n: number) => Math.round(n / 50) * 50;
  const nearest = sorted.reduce((best, p) => (Math.abs(p.elo - peak) < Math.abs(best.elo - peak) ? p : best));
  return {
    kind: 'estimate',
    rating: round(peak),
    low: Math.max(RATING.floor, round(peak - half)),
    high: round(peak + half),
    edge: peak <= lo ? 'low' : peak >= hi ? 'high' : null,
    moves,
    agreement: nearest.top,
    curve: sorted,
  };
}

export type MatchOptions = {
  signal?: AbortSignal;
  /** Called after every model evaluation. */
  onStep?: () => void;
};

function abortError(): Error {
  const e = new Error('cancelled');
  e.name = 'AbortError';
  return e;
}

async function fitAt(maia: MaiaPolicy, positions: MatchPosition[], elo: number, opts: MatchOptions): Promise<MaiaFitPoint> {
  let sum = 0;
  let top = 0;
  for (const { fen, uci } of positions) {
    if (opts.signal?.aborted) throw abortError();
    // The opponent's strength is unknown, so Maia is asked about a game between equals (as the bots play).
    const { policy } = await maia.policy(fen, elo, elo);
    const p = policy.find(([u]) => u === uci)?.[1] ?? 0;
    sum += Math.log(Math.max(MAIA_MATCH.minProb, p));
    if (policy[0]?.[0] === uci) top++;
    opts.onStep?.();
  }
  return { elo, avgLogLik: sum / positions.length, top: top / positions.length };
}

/** Coarse pass over MAIA_MATCH.coarse, then the best rating's neighbours at refineStep. */
export async function matchPlayer(maia: MaiaPolicy, positions: MatchPosition[], opts: MatchOptions = {}): Promise<MaiaMatchPlayer> {
  if (positions.length < RATING.minMoves) return { kind: 'not-enough-moves', moves: positions.length };
  const curve: MaiaFitPoint[] = [];
  for (const elo of MAIA_MATCH.coarse) curve.push(await fitAt(maia, positions, elo, opts));
  const best = curve.reduce((a, b) => (b.avgLogLik > a.avgLogLik ? b : a)).elo;
  const [min, max] = [Math.min(...MAIA_MATCH.coarse), Math.max(...MAIA_MATCH.coarse)];
  for (const elo of [best - MAIA_MATCH.refineStep, best + MAIA_MATCH.refineStep]) {
    if (elo < min || elo > max || curve.some((p) => p.elo === elo)) continue;
    curve.push(await fitAt(maia, positions, elo, opts));
  }
  return summariseMatch(curve, positions.length);
}

export type MatchProgress = { done: number; total: number };

/** Matches every person in the game, one after the other. */
export async function runMaiaMatch(
  maia: MaiaPolicy,
  record: GameRecord,
  opts: { signal?: AbortSignal; onProgress?: (p: MatchProgress) => void } = {},
): Promise<MaiaMatch> {
  const sides = matchColors(record).map((color) => ({ color, positions: matchPositions(record, color) }));
  const total = sides.reduce((n, s) => n + matchCost(s.positions.length), 0);
  let done = 0;
  opts.onProgress?.({ done, total });
  const match: MaiaMatch = { version: 1, createdAt: new Date().toISOString() };
  for (const { color, positions } of sides) {
    const result = await matchPlayer(maia, positions, {
      signal: opts.signal,
      onStep: () => opts.onProgress?.({ done: Math.min(total, ++done), total }),
    });
    if (color === 'w') match.white = result;
    else match.black = result;
  }
  // Edge refinements are skipped, so the count can stop short of the estimate.
  opts.onProgress?.({ done: total, total });
  return match;
}
