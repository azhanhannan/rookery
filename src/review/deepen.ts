// "Analyse deeper here": re-analyses the positions around one move at a higher depth and re-labels the
// moves those positions touch, so the stored review stays consistent with itself.
import { Chess } from 'chess.js';
import { REVIEW, REVIEW_STYLE } from '../config/tunables';
import { getEngine } from '../engine/EngineService';
import type { AnalysisResult, Engine } from '../engine/types';
import { findMove } from './brilliant';
import { reviewMove, summarize, toPosition } from './buildReview';
import { whiteWin } from './classify';
import type { GameReview, MoveReview, PositionReview } from './types';

/**
 * A stored position as an analysis: its best line, plus the second line's move and score when the review kept
 * it (version 2; the Great check reads it). Version 1 reviews give a one-line analysis.
 */
export function storedAnalysis(pos: PositionReview, depth: number): AnalysisResult {
  const d = pos.depth ?? depth;
  const lines =
    pos.bestMove && pos.score
      ? [
          { rank: 1, move: pos.bestMove, score: pos.score, pv: pos.bestLine, depth: d },
          ...(pos.second ? [{ rank: 2, move: pos.second.move, score: pos.second.score, pv: [pos.second.move], depth: d }] : []),
        ]
      : [];
  return { fen: pos.fen, lines, depth: d };
}

/** Positions whose analysis "Analyse deeper here" refreshes for the move at `ply` (0 = start position). */
export function deepenIndices(ply: number): number[] {
  return ply > 0 ? [ply - 1, ply] : [0];
}

/**
 * Pure: the review with fresh analyses for some positions. Every move that starts or ends on a refreshed
 * position is re-labelled, plus the move after the last of them (its Miss check reads the previous loss).
 * A re-labelled move whose "before" analysis is a stored single line (a version 1 review) can't be re-checked
 * for Great, so a Great it already had is kept rather than downgraded to Best.
 */
export function applyDeepAnalysis(review: GameReview, updates: Map<number, AnalysisResult>): GameReview {
  const positions = review.positions.map((p, i) => {
    const a = updates.get(i);
    return a ? { ...toPosition(p.fen, a, whiteWin(a)), depth: a.depth } : p;
  });
  const analysisAt = (i: number) => updates.get(i) ?? storedAnalysis(positions[i], review.depth);

  const touched = new Set<number>();
  for (const i of updates.keys()) {
    if (i >= 1 && i <= review.moves.length) touched.add(i);
    if (i + 1 <= review.moves.length) touched.add(i + 1);
  }
  if (touched.size === 0) return { ...review, positions };
  const lastTouched = Math.max(...touched);
  if (lastTouched + 1 <= review.moves.length) touched.add(lastTouched + 1);

  const moves: MoveReview[] = [...review.moves];
  for (const ply of [...touched].sort((a, b) => a - b)) {
    const old = moves[ply - 1];
    const fenBefore = positions[ply - 1].fen;
    const prevFen = ply >= 2 ? positions[ply - 2].fen : undefined;
    const prevPlayed = prevFen ? findMove(prevFen, moves[ply - 2].uci) : null;
    const next = reviewMove({
      ply,
      san: old.san,
      uci: old.uci,
      fenBefore,
      before: analysisAt(ply - 1),
      after: analysisAt(ply),
      winWhiteBefore: positions[ply - 1].winWhite,
      winWhiteAfter: positions[ply].winWhite,
      prevLoss: ply >= 2 ? moves[ply - 2].loss : null,
      inBook: old.label === 'Book',
      lastCapture: prevPlayed?.captured ? prevPlayed.to : undefined,
    });
    // A stored second line lets the Great check run again; without one (version 1) the old Great stands.
    if (old.label === 'Great' && next.label === 'Best' && !updates.has(ply - 1) && !positions[ply - 1].second) {
      next.label = 'Great';
      next.explanation = old.explanation;
    }
    moves[ply - 1] = next;
  }
  return { ...review, positions, moves, white: summarize(moves, 'w'), black: summarize(moves, 'b') };
}

export type DeepenOptions = {
  depth?: number;
  /** Defaults to the app engine (getEngine()). */
  engine?: Engine;
  signal?: AbortSignal;
  /** Engine lines per position (default REVIEW.multiPV); the extra lines are only for showing. */
  multiPV?: number;
  /** Gets each fresh analysis (all its lines) as it arrives. */
  onAnalysis?: (index: number, analysis: AnalysisResult) => void;
};

/** Analyses the positions around the move at `ply` at `depth` (default REVIEW_STYLE.deepDepth) and re-labels. */
export async function deepenReview(review: GameReview, ply: number, opts: DeepenOptions = {}): Promise<GameReview> {
  const depth = opts.depth ?? REVIEW_STYLE.deepDepth;
  const engine = opts.engine ?? (await getEngine());
  const updates = new Map<number, AnalysisResult>();
  for (const i of deepenIndices(ply)) {
    if (opts.signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const fen = review.positions[i].fen;
    if (new Chess(fen).moves().length === 0) continue;
    const onAbort = () => engine.stop();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const analysis = await engine.analyze(fen, { depth, multiPV: opts.multiPV ?? REVIEW.multiPV });
      updates.set(i, analysis);
      opts.onAnalysis?.(i, analysis);
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
  if (opts.signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
  return applyDeepAnalysis(review, updates);
}
