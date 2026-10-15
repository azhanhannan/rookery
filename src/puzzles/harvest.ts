// "My mistakes": puzzles made from the player's own reviewed games (pure, chess.js only).
// The puzzle starts one move earlier, like a Lichess puzzle: the opponent's previous move is the set-up
// move, then the player finds the engine's best move where they went wrong in the game.
import { Chess } from 'chess.js';
import { MISTAKES } from '../config/tunables';
import type { Color, GameRecord } from '../game/types';
import { personColor } from '../account/gamesList';
import { reviewFits } from '../review/reviewView';
import type { MoveLabel, PositionReview } from '../review/types';
import type { Puzzle } from './types';

export type MistakeSource = {
  gameId: string;
  /** The ply of the player's move in the game (1-based). */
  ply: number;
  opponent: string;
  playedAt: string;
  /** What the player played in the game, SAN. */
  playedSan: string;
  label: MoveLabel;
  color: Color;
};

export type MistakePuzzle = Puzzle & { source: MistakeSource };

/** Board, side to move, castling and en passant: the same position whatever the move counters say. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** The spaced-repetition key: the game and the position. */
export function mistakeId(gameId: string, fen: string): string {
  return `${gameId}|${positionKey(fen)}`;
}

/**
 * The player's side in a game: the non-bot side against a bot, else the side whose name is one of
 * `userNames` (case-insensitive, e.g. the account's username). Null when it can't be told.
 */
export function userColorOf(record: GameRecord, userNames: string[] = []): Color | null {
  const vsBot = personColor(record);
  if (vsBot) return vsBot;
  const names = new Set(userNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const w = names.has(record.white.name.trim().toLowerCase());
  const b = names.has(record.black.name.trim().toLowerCase());
  if (w !== b) return w ? 'w' : 'b';
  return null;
}

function playUci(chess: Chess, uci: string): boolean {
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return true;
  } catch {
    return false;
  }
}

/** The mover can force mate from this analysed position (White-POV mate score). */
function matingFor(pos: PositionReview, color: Color): boolean {
  const s = pos.score;
  return !!s && 'mate' in s && s.mate !== 0 && (s.mate > 0) === (color === 'w');
}

/**
 * The solution from `pos` (the position before the player's move): the engine's best move, extended
 * along its line only when that line is a forced mate for the solver (clear-cut; and any mating move is accepted by the
 * session), up to MISTAKES.maxSolverMoves solver moves. Every move is checked for legality;
 * the line always ends on a solver move. Null when there is no legal best move.
 */
export function solutionLine(pos: PositionReview, color: Color): string[] | null {
  const best = pos.bestMove?.toLowerCase();
  if (!best) return null;
  const pv = pos.bestLine.map((m) => m.toLowerCase());
  const line = pv[0] === best ? pv : [best];
  const chess = new Chess(pos.fen);
  if (!playUci(chess, best)) return null;
  const out = [best];
  const mating = matingFor(pos, color);
  let solverMoves = 1;
  for (let i = 1; i + 1 < line.length && solverMoves < MISTAKES.maxSolverMoves; i += 2) {
    if (chess.isGameOver() || !mating) break;
    const probe = new Chess(chess.fen());
    if (!playUci(probe, line[i]) || probe.isGameOver() || !playUci(probe, line[i + 1])) break;
    playUci(chess, line[i]);
    playUci(chess, line[i + 1]);
    out.push(line[i], line[i + 1]);
    solverMoves++;
  }
  return out;
}

/**
 * Every Mistake / Blunder / Miss the player made in their reviewed games, as puzzles. Games are taken in
 * the order given (newest first is the usual); the same position from two games is kept once, from the
 * OLDEST game, so its key (and its spaced-repetition record) stays the same when newer games repeat it.
 */
export function harvestMistakes(games: GameRecord[], opts: { userNames?: string[] } = {}): MistakePuzzle[] {
  const labels = new Set(MISTAKES.labels);
  const byPosition = new Map<string, MistakePuzzle>();
  const ordered = [...games].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const game of ordered) {
    if (!reviewFits(game, game.review)) continue;
    const review = game.review;
    const color = userColorOf(game, opts.userNames);
    if (!color) continue;
    const opponent = color === 'w' ? game.black.name : game.white.name;
    for (const m of review.moves) {
      // ply 1 has no set-up move before it; a mistake there is an opening matter anyway.
      if (m.color !== color || !labels.has(m.label) || m.ply < 2) continue;
      const before = review.positions[m.ply - 1];
      const setupFrom = review.positions[m.ply - 2];
      const setup = game.moves[m.ply - 2]?.uci;
      if (!before || !setupFrom || !setup) continue;
      const solution = solutionLine(before, color);
      if (!solution || solution[0] === m.uci.toLowerCase()) continue;
      const key = positionKey(before.fen);
      if (byPosition.has(key)) continue;
      byPosition.set(key, {
        id: mistakeId(game.id, before.fen),
        fen: setupFrom.fen,
        moves: [setup, ...solution],
        rating: 0,
        themes: ['myMistake'],
        source: { gameId: game.id, ply: m.ply, opponent, playedAt: game.createdAt, playedSan: m.san, label: m.label, color },
      });
    }
  }
  // Newest game first, then game order.
  return [...byPosition.values()].sort(
    (a, b) => b.source.playedAt.localeCompare(a.source.playedAt) || a.source.ply - b.source.ply,
  );
}

/** "From your game vs Maia 1100, 12 Oct — you played Qxb7". */
export function sourceText(s: MistakeSource, now: Date = new Date()): string {
  const at = new Date(s.playedAt);
  const date = at.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `From your game vs ${s.opponent}, ${date} — you played ${s.playedSan}`;
}

/** Of the player's last `n` finished games (newest by date), how many carry a fitting review. */
export function reviewedOfLast(games: GameRecord[], n: number = MISTAKES.recentGames): { reviewed: number; total: number } {
  const recent = games
    .filter((g) => g.result !== '*')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
  return { reviewed: recent.filter((g) => reviewFits(g, g.review)).length, total: recent.length };
}
