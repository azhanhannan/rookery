// Pure helpers for the review screen (no React), kept here so they can be unit-tested.
import { Chess } from 'chess.js';
import { botColor } from '../game/rules';
import type { Color, GameRecord } from '../game/types';
import type { GameReview, MoveLabel, MoveReview, PositionReview } from './types';
import { formatScore } from './winChance';

/** Labels worth a dot on the eval graph. */
export const GRAPH_MARKED: ReadonlySet<MoveLabel> = new Set(['Brilliant', 'Great', 'Miss', 'Mistake', 'Blunder']);

/** Labels Retry mode practises. */
export const RETRY_LABELS: ReadonlySet<MoveLabel> = new Set(['Mistake', 'Blunder', 'Miss']);

/** Labels where the played move was the engine's choice, so a best-move arrow adds nothing. */
const PLAYED_BEST: ReadonlySet<MoveLabel> = new Set(['Brilliant', 'Great', 'Best', 'Book']);

/** A stored review only fits the game it was made for: one position per ply plus the start. */
export function reviewFits(record: GameRecord, review: GameReview | undefined): review is GameReview {
  return (
    !!review &&
    review.moves.length === record.moves.length &&
    review.positions.length === record.moves.length + 1 &&
    review.moves.every((m, i) => m.uci === record.moves[i].uci)
  );
}

export type GraphPoint = {
  ply: number;
  /** White's win chance 0-100. */
  win: number;
  /** Label of the move that led here, when it is one the graph marks. */
  marked?: MoveLabel;
  san?: string;
};

export function graphData(review: GameReview): GraphPoint[] {
  return review.positions.map((p, ply) => {
    const move = ply > 0 ? review.moves[ply - 1] : undefined;
    return {
      ply,
      win: p.winWhite,
      marked: move && GRAPH_MARKED.has(move.label) ? move.label : undefined,
      san: move?.san,
    };
  });
}

/** Eval bar text for a reviewed position: the score, or the result once no move is left. */
export function evalLabel(pos: PositionReview): string {
  if (pos.score) return formatScore(pos.score);
  if (pos.winWhite === 50) return '½';
  return pos.winWhite > 50 ? '1-0' : '0-1';
}

/** "Analyzing move 23 of 61": positions = moves + 1, so the start position counts as move 1's. */
export function progressText(done: number, total: number): string {
  const moves = total - 1;
  if (moves <= 0) return 'Analyzing the position';
  return `Analyzing move ${Math.min(Math.max(done, 1), moves)} of ${moves}`;
}

/** The colours whose moves Retry mode practises: the human in a bot game, both players otherwise. */
export function retryColors(record: GameRecord): Color[] {
  if (record.userColor) return [record.userColor];
  const bot = botColor(record);
  if (!bot) return ['w', 'b'];
  return [bot === 'w' ? 'b' : 'w'];
}

/** Moves to retry, in game order: Mistakes, Blunders and Misses by the practising side that have a known best move. */
export function retryCandidates(record: GameRecord, review: GameReview): MoveReview[] {
  const colors = retryColors(record);
  return review.moves.filter((m) => RETRY_LABELS.has(m.label) && colors.includes(m.color) && !!m.bestMove);
}

/** Whether a move tried on the board is the engine's best move (UCI, promotion letter included). */
export function isBestTry(tryUci: string, bestMove: string | undefined): boolean {
  if (!bestMove) return false;
  // A promotion with no piece chosen is the board's queen default.
  const normal = (u: string) => (u.length === 4 ? u : u.slice(0, 4) + u[4].toLowerCase());
  return normal(tryUci) === normal(bestMove);
}

/** The best-move arrow for a selected move, or null when the move played was the best one. */
export function bestArrowFor(move: MoveReview | undefined): { from: string; to: string } | null {
  if (!move?.bestMove || PLAYED_BEST.has(move.label) || move.bestMove === move.uci) return null;
  return { from: move.bestMove.slice(0, 2), to: move.bestMove.slice(2, 4) };
}

export type LineStep = { fen: string; san: string; uci: string };

/** Plays a UCI line from a position; stops at the first move that isn't legal (a stale or cut-off line). */
export function lineSteps(fen: string, line: string[]): LineStep[] {
  const chess = new Chess(fen);
  const steps: LineStep[] = [];
  for (const uci of line) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      steps.push({ fen: chess.fen(), san: m.san, uci });
    } catch {
      break;
    }
  }
  return steps;
}

/** Move number prefix for a SAN in a line or list: "12." for White, "12..." for Black. */
export function moveNumber(fen: string): string {
  const [, turn, , , , full] = fen.split(' ');
  return turn === 'w' ? `${full}.` : `${full}...`;
}

/** Depth to suggest for a re-run: one step deeper than the stored review, capped at the deepest. */
export function nextDepth(current: number, depths: { fast: number; normal: number; deep: number }): number {
  const options = [depths.fast, depths.normal, depths.deep].sort((a, b) => a - b);
  return options.find((d) => d > current) ?? options[options.length - 1];
}

/** Finished games to offer for review, newest first, without duplicates. */
export function reviewableGames(current: GameRecord, history: GameRecord[], limit = 10): GameRecord[] {
  const seen = new Set<string>();
  const out: GameRecord[] = [];
  for (const g of [current, ...history]) {
    if (g.result === '*' || g.moves.length === 0 || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out.slice(0, limit);
}
