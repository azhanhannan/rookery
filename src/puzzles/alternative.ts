// "My mistakes" puzzles store one line (the review's best move), but a position often has another move that is
// about as good. When the solver plays something else, the engine checks it: as good as the stored move (within
// MISTAKES.alternative.marginCp, or a forced mate when the stored move mates) means the puzzle is solved too.
// Pure apart from the injected engine.
import { Chess } from 'chess.js';
import { MISTAKES } from '../config/tunables';
import type { Engine, Score } from '../engine/types';
import type { Color } from '../game/types';

/** A mate counts as this many centipawns (less the moves it takes), so mates compare with ordinary scores. */
const MATE_CP = 100_000;

type Cfg = typeof MISTAKES.alternative;

/** The score from `color`'s side in centipawns; a mate is worth MATE_CP minus its length. */
function solverCp(score: Score, color: Color): number {
  const sign = color === 'w' ? 1 : -1;
  if ('mate' in score) {
    if (score.mate === 0) return MATE_CP; // the move mated
    const m = score.mate * sign;
    return m > 0 ? MATE_CP - m : -MATE_CP - m;
  }
  return score.cp * sign;
}

/** Mate in N for `color` (N > 0; 0 = the move itself mated, only ever the solver's), or null. */
function mateFor(score: Score, color: Color): number | null {
  if (!('mate' in score)) return null;
  if (score.mate === 0) return 0;
  const m = score.mate * (color === 'w' ? 1 : -1);
  return m > 0 ? m : null;
}

/**
 * Is `played` (the position's score after the solver's move) about as good as `best` (after the stored move)?
 * Scores are White's point of view, as the engine reports them. When the stored move forces mate, only a
 * forced mate at most `mateSlack` moves longer counts; otherwise any score within `marginCp` (or a mate).
 */
export function judgeAlternative(best: Score, played: Score, color: Color, cfg: Cfg = MISTAKES.alternative): boolean {
  const bestMate = mateFor(best, color);
  const playedMate = mateFor(played, color);
  if (bestMate !== null) return playedMate !== null && playedMate <= bestMate + cfg.mateSlack;
  if (playedMate !== null) return true;
  return solverCp(played, color) >= solverCp(best, color) - cfg.marginCp;
}

/** The score of the position after `uci` from `fen` (White's point of view); null when the move is illegal. */
async function scoreAfter(engine: Pick<Engine, 'analyze'>, fen: string, uci: string, cfg: Cfg): Promise<Score | null> {
  const chess = new Chess(fen);
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  // Game over after the move: no engine line to read.
  if (chess.isCheckmate()) return { mate: 0 };
  if (chess.isDraw() || chess.isStalemate()) return { cp: 0 };
  const r = await engine.analyze(chess.fen(), { depth: cfg.depth, movetime: cfg.movetimeMs, multiPV: 1 });
  return r.lines[0]?.score ?? null;
}

export type AlternativeVerdict = { accepted: true; bestSan: string } | { accepted: false };

/**
 * Checks the solver's `played` move against the stored `best` from `fen` with the engine. Accepted when it is
 * about as good (judgeAlternative); `bestSan` names the move the engine preferred. Any engine failure: not accepted.
 */
export async function checkAlternative(
  engine: Pick<Engine, 'analyze'>,
  fen: string,
  played: string,
  best: string,
  cfg: Cfg = MISTAKES.alternative,
): Promise<AlternativeVerdict> {
  const color: Color = new Chess(fen).turn();
  let bestSan: string;
  try {
    bestSan = new Chess(fen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }).san;
  } catch {
    return { accepted: false };
  }
  try {
    const bestScore = await scoreAfter(engine, fen, best, cfg);
    const playedScore = bestScore && (await scoreAfter(engine, fen, played, cfg));
    if (!bestScore || !playedScore) return { accepted: false };
    return judgeAlternative(bestScore, playedScore, color, cfg) ? { accepted: true, bestSan } : { accepted: false };
  } catch {
    return { accepted: false };
  }
}
