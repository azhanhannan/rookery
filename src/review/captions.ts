// Rule-based captions: one plain sentence about a weak move, only when a rule can prove it on the board
// (chess.js) with the engine's line as the witness. When no rule proves anything, there is no caption:
// a wrong caption is worse than none.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Score } from '../engine/types';
import type { Color } from '../game/types';
import { findMove, other, PIECE_VALUE, see } from './brilliant';
import type { GameReview, MoveLabel } from './types';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** Labels that get a caption; good moves don't need one. */
const CAPTIONED: ReadonlySet<MoveLabel> = new Set(['Inaccuracy', 'Mistake', 'Blunder', 'Miss']);

/** What a caption reads: the move, and the engine's view of the positions before and after it. */
export type CaptionInput = {
  label: MoveLabel;
  /** Position before the move. */
  fenBefore: string;
  /** Played move, UCI. */
  uci: string;
  /** Engine's best move before the played move (UCI), and the score there (White's view). */
  bestBefore?: string;
  scoreBefore?: Score;
  /** Engine's best reply after the played move, its line, and the score there (White's view). */
  bestAfter?: string;
  lineAfter?: string[];
  scoreAfter?: Score;
};

function mateFor(score: Score | undefined, color: Color): number | null {
  if (!score || !('mate' in score)) return null;
  const mine = color === 'w' ? score.mate > 0 : score.mate < 0;
  return mine ? Math.abs(score.mate) : null;
}

/** Moves that checkmate at once (chess.js SAN ends in "#"). */
function matingMoves(fen: string): Move[] {
  return new Chess(fen).moves({ verbose: true }).filter((m) => m.san.endsWith('#'));
}

/**
 * True when `first` forces mate in exactly 2 from `fen`: it doesn't mate at once, every reply exists and
 * leaves a mate in 1, and there is no mate in 1 in `fen` at all (so "in 2" is the shortest).
 */
function forcesMateIn2(fen: string, first: string): boolean {
  if (matingMoves(fen).length > 0) return false;
  const m = findMove(fen, first);
  if (!m) return false;
  const after = new Chess(m.after);
  const replies = after.moves({ verbose: true });
  if (replies.length === 0) return false;
  return replies.every((r) => matingMoves(r.after).length > 0);
}

/** "the king and rook", "the king, queen and rook". */
function listPieces(pieces: PieceSymbol[]): string {
  const names = pieces.map((p) => PIECE_NAME[p]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) for (const p of row) if (p) sum += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  return sum;
}

/** Mate rules. Returns a caption, `null` for "no mate story", or `'unprovable'` to silence every other rule. */
function mateCaption(i: CaptionInput, played: Move, me: Color): string | null | 'unprovable' {
  const them = other(me);
  // You missed a mate.
  if (!played.san.endsWith('#') && mateFor(i.scoreAfter, me) === null) {
    const mates = matingMoves(i.fenBefore);
    if (mates.length > 0) {
      const shown = mates.find((m) => m.from + m.to + (m.promotion ?? '') === i.bestBefore?.toLowerCase()) ?? mates[0];
      return `You missed mate in 1 (${shown.san}).`;
    }
    const n = mateFor(i.scoreBefore, me);
    if (n !== null) {
      if (n === 2 && i.bestBefore && forcesMateIn2(i.fenBefore, i.bestBefore)) {
        return `You missed mate in 2, starting with ${findMove(i.fenBefore, i.bestBefore)!.san}.`;
      }
      return 'unprovable';
    }
  }
  // This allowed a mate the opponent didn't have before.
  if (played.san.endsWith('#') || mateFor(i.scoreBefore, them) !== null) return null;
  const theirMates = matingMoves(played.after);
  if (theirMates.length > 0) {
    const shown = theirMates.find((m) => m.from + m.to + (m.promotion ?? '') === i.bestAfter?.toLowerCase()) ?? theirMates[0];
    return `This allowed mate in 1 (${shown.san}).`;
  }
  const n = mateFor(i.scoreAfter, them);
  if (n !== null) {
    if (n === 2 && i.bestAfter && forcesMateIn2(played.after, i.bestAfter)) return 'This allowed mate in 2.';
    return 'unprovable';
  }
  return null;
}

/**
 * The engine's reply takes one of your pieces and you can't get the material back: "This left your knight
 * on f6 undefended — Bxf6 wins it." The net material over the move, the reply and any recapture (static
 * exchange) must be a real loss, so trades (Bxf6 gxf6) never read as a hung piece.
 */
function hangingCaption(i: CaptionInput, played: Move, me: Color): string | null {
  if (!i.bestAfter) return null;
  const reply = findMove(played.after, i.bestAfter);
  if (!reply?.captured || reply.flags.includes('e')) return null;
  const piece = reply.captured;
  const square = reply.to as Square;

  const start = material(new Chess(i.fenBefore), me);
  const afterReply = new Chess(reply.after);
  const settle = see(afterReply, square, me);
  const net = start - material(afterReply, me) - settle;
  const needed = piece === 'p' ? 1 : 2;
  if (net < needed) return null;

  const pos = new Chess(played.after);
  const recaptures = afterReply.moves({ verbose: true }).filter((m) => m.to === square);
  const where = `your ${PIECE_NAME[piece]} on ${square}`;
  if (recaptures.length === 0) {
    if (pos.attackers(square, me).length === 0) return `This left ${where} undefended — ${reply.san} wins it.`;
    return `${reply.san} wins ${where} for free.`;
  }
  // Defended, but the attacker is cheaper: one recapture, and the opponent comes out ahead by the difference.
  const attacker = reply.piece;
  if (PIECE_VALUE[attacker] < PIECE_VALUE[piece] && see(new Chess(played.after), square, other(me)) === PIECE_VALUE[piece] - PIECE_VALUE[attacker]) {
    return `${reply.san} wins ${where} for a ${PIECE_NAME[attacker]}.`;
  }
  return null;
}

/**
 * The engine's reply is a fork: from its square the moved piece attacks two or more of your pieces that are
 * the king, worth more than it, or undefended; you can't take it; and the engine's line then has it capture
 * one of them. "This allowed a fork on e7 — Ne7+ attacks your king and rook."
 */
function forkCaption(i: CaptionInput, played: Move, me: Color): string | null {
  const line = i.lineAfter ?? [];
  if (!i.bestAfter || line.length < 3 || line[0].toLowerCase() !== i.bestAfter.toLowerCase()) return null;
  const fork = findMove(played.after, i.bestAfter);
  if (!fork) return null;
  const pos = new Chess(fork.after);
  const from = fork.to as Square;
  const forker = fork.piece;
  // You can simply take the forking piece.
  if (pos.moves({ verbose: true }).some((m) => m.to === from)) return null;

  const targets: { square: Square; type: PieceSymbol }[] = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== me || p.type === 'p') continue;
      if (!pos.attackers(p.square, other(me)).includes(from)) continue;
      const valuable = p.type === 'k' || PIECE_VALUE[p.type] > PIECE_VALUE[forker] || pos.attackers(p.square, me).length === 0;
      if (valuable) targets.push({ square: p.square, type: p.type });
    }
  }
  if (targets.length < 2) return null;

  // The witness: after your best answer the forking piece takes one of the forked pieces.
  const answer = findMove(fork.after, line[1]);
  if (!answer) return null;
  const take = findMove(answer.after, line[2]);
  if (!take?.captured || take.from !== from || take.captured === 'p') return null;
  if (!targets.some((t) => t.square === take.to && t.type === take.captured)) return null;

  const order: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n'];
  const names = targets.map((t) => t.type).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return `This allowed a fork on ${from} — ${fork.san} attacks your ${listPieces(names)}.`;
}

/** The engine's best move took a piece nobody could take back: "You missed a free rook on a8 (Bxa8)." */
function missedFreeCaption(i: CaptionInput, played: Move): string | null {
  if (!i.bestBefore) return null;
  const best = findMove(i.fenBefore, i.bestBefore);
  if (!best?.captured || best.flags.includes('e')) return null;
  if (played.captured && PIECE_VALUE[played.captured] >= PIECE_VALUE[best.captured]) return null;
  const after = new Chess(best.after);
  if (after.moves({ verbose: true }).some((m) => m.to === best.to)) return null;
  return `You missed a free ${PIECE_NAME[best.captured]} on ${best.to} (${best.san}).`;
}

/** One plain sentence explaining a weak move, or null when no rule can prove one. */
export function caption(i: CaptionInput): string | null {
  if (!CAPTIONED.has(i.label)) return null;
  const played = findMove(i.fenBefore, i.uci);
  if (!played) return null;
  const me = played.color;
  const mate = mateCaption(i, played, me);
  if (mate === 'unprovable') return null;
  if (mate) return mate;
  return hangingCaption(i, played, me) ?? forkCaption(i, played, me) ?? missedFreeCaption(i, played);
}

/** The caption for the move at `ply` of a stored review (positions[ply - 1] before, positions[ply] after). */
export function captionForMove(review: GameReview, ply: number): string | null {
  const move = review.moves[ply - 1];
  const before = review.positions[ply - 1];
  const after = review.positions[ply];
  if (!move || !before || !after) return null;
  return caption({
    label: move.label,
    fenBefore: before.fen,
    uci: move.uci,
    bestBefore: before.bestMove,
    scoreBefore: before.score,
    bestAfter: after.bestMove,
    lineAfter: after.bestLine,
    scoreAfter: after.score,
  });
}
