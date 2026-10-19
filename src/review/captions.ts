// Rule-based captions: one plain sentence about a weak move, only when a rule can prove it on the board
// (chess.js) with the engine's line as the witness. When no rule proves anything, there is no caption:
// a wrong caption is worse than none.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { COACH_MOTIFS } from '../config/tunables';
import type { Score } from '../engine/types';
import type { Color } from '../game/types';
import { findMove, other, PIECE_VALUE, see } from './brilliant';
import { discoveredWin, forkWin, material, pinWin, playLine, settledLoss, skewerWin, staysWon, trappedWin } from './tactics';
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
  /** Engine's best move before the played move (UCI), its line, and the score there (White's view). */
  bestBefore?: string;
  lineBefore?: string[];
  scoreBefore?: Score;
  /** Engine's best reply after the played move, its line, and the score there (White's view). */
  bestAfter?: string;
  lineAfter?: string[];
  scoreAfter?: Score;
};

/** What a caption rule proved, before it is put into words. `san`/`uci` is the witness move (yours or the reply). */
export type CaptionFact =
  | { kind: 'missed-mate-1'; san: string; uci: string }
  | { kind: 'missed-mate-2'; san: string; uci: string }
  | { kind: 'allowed-mate-1'; san: string; uci: string }
  | { kind: 'allowed-mate-2' }
  /** The reply takes a piece nobody defends. */
  | { kind: 'left-undefended'; piece: PieceSymbol; square: Square; san: string }
  /** Defended on paper, but no recapture is legal. */
  | { kind: 'lost-for-free'; piece: PieceSymbol; square: Square; san: string }
  | { kind: 'lost-to-cheaper'; piece: PieceSymbol; square: Square; san: string; by: PieceSymbol }
  /** `piece` on `square` attacks `targets` (king first). */
  | { kind: 'fork'; piece: PieceSymbol; square: Square; san: string; targets: PieceSymbol[] }
  | { kind: 'missed-free-piece'; piece: PieceSymbol; square: Square; san: string }
  /** Defended, but not well enough: the reply wins material anyway (static exchange, confirmed by the line). */
  | { kind: 'lost-in-exchange'; piece: PieceSymbol; square: Square; san: string }
  /**
   * A new pin of your `piece` on `square` to your king or queen (`behind`) by the `by` on `from`, and the line
   * wins the pinned piece. `san`: the reply, when the reply is the pinning move.
   */
  | { kind: 'pin'; piece: PieceSymbol; square: Square; by: PieceSymbol; from: Square; behind: 'k' | 'q'; san?: string }
  /** Your best move `san` pinned their `piece` on `square` to their king or queen, and the line won it. */
  | { kind: 'missed-pin'; piece: PieceSymbol; square: Square; by: PieceSymbol; from: Square; behind: 'k' | 'q'; san: string }
  /** The reply `san` attacks your `piece` on `square`; it steps away and the `behind` piece on `behindSquare` falls. */
  | { kind: 'skewer'; piece: PieceSymbol; square: Square; behind: PieceSymbol; behindSquare: Square; san: string }
  | { kind: 'missed-skewer'; piece: PieceSymbol; square: Square; behind: PieceSymbol; behindSquare: Square; san: string }
  /** The reply `san` uncovers the `by` on `from` onto your `piece` on `square` (the king: a discovered check). */
  | { kind: 'discovered-attack'; piece: PieceSymbol; square: Square; by: PieceSymbol; from: Square; san: string }
  | { kind: 'missed-discovered-attack'; piece: PieceSymbol; square: Square; by: PieceSymbol; from: Square; san: string }
  /** After the reply `san` your `piece` on `square` has no safe square, and the line wins it. */
  | { kind: 'trapped-piece'; piece: PieceSymbol; square: Square; san: string }
  | { kind: 'missed-trap'; piece: PieceSymbol; square: Square; san: string }
  /** The reply `san` promotes on `square` to `piece`, and it can't be won back at once. */
  | { kind: 'allowed-promotion'; piece: PieceSymbol; square: Square; san: string }
  | { kind: 'missed-promotion'; piece: PieceSymbol; square: Square; san: string }
  /** Your best move `san` forked `targets` from `square` and the line won one of them. */
  | { kind: 'missed-fork'; piece: PieceSymbol; square: Square; san: string; targets: PieceSymbol[] };

export type CaptionKind = CaptionFact['kind'];

export const CAPTION_KINDS: readonly CaptionKind[] = [
  'missed-mate-1', 'missed-mate-2', 'allowed-mate-1', 'allowed-mate-2',
  'left-undefended', 'lost-for-free', 'lost-to-cheaper', 'fork', 'missed-free-piece',
  'lost-in-exchange', 'pin', 'missed-pin', 'skewer', 'missed-skewer', 'discovered-attack', 'missed-discovered-attack',
  'trapped-piece', 'missed-trap', 'allowed-promotion', 'missed-promotion', 'missed-fork',
];

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

/** Mate rules. Returns a fact, `null` for "no mate story", or `'unprovable'` to silence every other rule. */
function mateFact(i: CaptionInput, played: Move, me: Color): CaptionFact | null | 'unprovable' {
  const them = other(me);
  // You missed a mate.
  if (!played.san.endsWith('#') && mateFor(i.scoreAfter, me) === null) {
    const mates = matingMoves(i.fenBefore);
    if (mates.length > 0) {
      const shown = mates.find((m) => m.from + m.to + (m.promotion ?? '') === i.bestBefore?.toLowerCase()) ?? mates[0];
      return { kind: 'missed-mate-1', san: shown.san, uci: shown.lan };
    }
    const n = mateFor(i.scoreBefore, me);
    if (n !== null) {
      if (n === 2 && i.bestBefore && forcesMateIn2(i.fenBefore, i.bestBefore)) {
        const first = findMove(i.fenBefore, i.bestBefore)!;
        return { kind: 'missed-mate-2', san: first.san, uci: first.lan };
      }
      return 'unprovable';
    }
  }
  // This allowed a mate the opponent didn't have before.
  if (played.san.endsWith('#') || mateFor(i.scoreBefore, them) !== null) return null;
  const theirMates = matingMoves(played.after);
  if (theirMates.length > 0) {
    const shown = theirMates.find((m) => m.from + m.to + (m.promotion ?? '') === i.bestAfter?.toLowerCase()) ?? theirMates[0];
    return { kind: 'allowed-mate-1', san: shown.san, uci: shown.lan };
  }
  const n = mateFor(i.scoreAfter, them);
  if (n !== null) {
    if (n === 2 && i.bestAfter && forcesMateIn2(played.after, i.bestAfter)) return { kind: 'allowed-mate-2' };
    return 'unprovable';
  }
  return null;
}

/** The engine's line after the move, when it starts with the stored best reply. */
function replyLine(i: CaptionInput, played: Move): Move[] {
  if (!i.bestAfter || i.lineAfter?.[0]?.toLowerCase() !== i.bestAfter.toLowerCase()) return [];
  return playLine(played.after, i.lineAfter);
}

/** The engine's line before the move, when it starts with the stored best move and that isn't the move played. */
function bestLine(i: CaptionInput, played: Move): Move[] {
  if (!i.bestBefore || i.lineBefore?.[0]?.toLowerCase() !== i.bestBefore.toLowerCase()) return [];
  const line = playLine(i.fenBefore, i.lineBefore);
  return line[0] && line[0].lan !== played.lan ? line : [];
}

/**
 * The engine's reply takes one of your pieces and you can't get the material back: "This left your knight
 * on f6 undefended — Bxf6 wins it." The net material over the move, the reply and any recapture (static
 * exchange) must be a real loss, so trades (Bxf6 gxf6) never read as a hung piece.
 */
function hangingFact(i: CaptionInput, played: Move, me: Color): CaptionFact | null {
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
  if (recaptures.length === 0) {
    const kind = pos.attackers(square, me).length === 0 ? 'left-undefended' : 'lost-for-free';
    return { kind, piece, square, san: reply.san };
  }
  // Defended, but the attacker is cheaper: one recapture, and the opponent comes out ahead by the difference.
  const attacker = reply.piece;
  if (PIECE_VALUE[attacker] < PIECE_VALUE[piece] && see(new Chess(played.after), square, other(me)) === PIECE_VALUE[piece] - PIECE_VALUE[attacker]) {
    return { kind: 'lost-to-cheaper', piece, square, san: reply.san, by: attacker };
  }
  // Defended, but not enough: taking back still leaves you down, and the engine's line agrees.
  if (piece !== 'p' && staysWon(i.fenBefore, replyLine(i, played), me)) return { kind: 'lost-in-exchange', piece, square, san: reply.san };
  return null;
}

/**
 * The engine's reply is a fork: from its square the moved piece attacks two or more of your pieces that are
 * the king, worth more than it, or undefended; you can't take it; and the engine's line then has it capture
 * one of them. "This allowed a fork on e7 — Ne7+ attacks your king and rook."
 */
function forkFact(i: CaptionInput, played: Move, me: Color): CaptionFact | null {
  const line = replyLine(i, played);
  if (line.length < 3) return null;
  const f = forkWin(i.fenBefore, line, me, false);
  return f ? { kind: 'fork', piece: f.piece, square: f.square, san: line[0].san, targets: f.targets } : null;
}

/**
 * Tactics the engine's reply plays against you (pin, skewer, discovered attack, trapped piece, promotion),
 * each proven on the board and won in the engine's line (`src/review/tactics.ts`).
 */
function allowedTacticFact(i: CaptionInput, played: Move, me: Color): CaptionFact | null {
  const line = replyLine(i, played);
  const reply = line[0];
  if (!reply) return null;
  const pin = pinWin(i.fenBefore, line, me, false);
  if (pin) return { kind: 'pin', ...pin, ...(pin.from === reply.to ? { san: reply.san } : {}) };
  const skewer = skewerWin(i.fenBefore, line, me);
  if (skewer) return { kind: 'skewer', ...skewer, san: reply.san };
  const disc = discoveredWin(i.fenBefore, line, me);
  if (disc) return { kind: 'discovered-attack', ...disc, san: reply.san };
  const trapped = trappedWin(i.fenBefore, line, me);
  if (trapped) return { kind: 'trapped-piece', ...trapped, san: reply.san };
  if (reply.promotion && settledLoss(i.fenBefore, reply, me) >= COACH_MOTIFS.minLoss) {
    return { kind: 'allowed-promotion', piece: reply.promotion, square: reply.to as Square, san: reply.san };
  }
  return null;
}

/** The same tactics for you, missed: the engine's best move played one and its line won material. */
function missedTacticFact(i: CaptionInput, played: Move, me: Color): CaptionFact | null {
  const line = bestLine(i, played);
  const best = line[0];
  if (!best) return null;
  const them = other(me);
  if (best.promotion && !played.promotion && settledLoss(i.fenBefore, best, them) >= COACH_MOTIFS.minLoss) {
    return { kind: 'missed-promotion', piece: best.promotion, square: best.to as Square, san: best.san };
  }
  const fork = forkWin(i.fenBefore, line, them, true);
  if (fork) return { kind: 'missed-fork', ...fork, san: best.san };
  const pin = pinWin(i.fenBefore, line, them, true);
  if (pin) return { kind: 'missed-pin', ...pin, san: best.san };
  const skewer = skewerWin(i.fenBefore, line, them);
  if (skewer) return { kind: 'missed-skewer', ...skewer, san: best.san };
  const disc = discoveredWin(i.fenBefore, line, them);
  if (disc) return { kind: 'missed-discovered-attack', ...disc, san: best.san };
  const trapped = trappedWin(i.fenBefore, line, them);
  if (trapped) return { kind: 'missed-trap', ...trapped, san: best.san };
  return null;
}

/** The engine's best move took a piece nobody could take back: "You missed a free rook on a8 (Bxa8)." */
function missedFreeFact(i: CaptionInput, played: Move): CaptionFact | null {
  if (!i.bestBefore) return null;
  const best = findMove(i.fenBefore, i.bestBefore);
  if (!best?.captured || best.flags.includes('e')) return null;
  if (played.captured && PIECE_VALUE[played.captured] >= PIECE_VALUE[best.captured]) return null;
  const after = new Chess(best.after);
  if (after.moves({ verbose: true }).some((m) => m.to === best.to)) return null;
  return { kind: 'missed-free-piece', piece: best.captured, square: best.to as Square, san: best.san };
}

/** What a rule proved about a weak move, or null when no rule can prove one. */
export function captionFact(i: CaptionInput): CaptionFact | null {
  if (!CAPTIONED.has(i.label)) return null;
  const played = findMove(i.fenBefore, i.uci);
  if (!played) return null;
  const me = played.color;
  const mate = mateFact(i, played, me);
  if (mate === 'unprovable') return null;
  if (mate) return mate;
  return (
    hangingFact(i, played, me) ??
    forkFact(i, played, me) ??
    allowedTacticFact(i, played, me) ??
    missedFreeFact(i, played) ??
    missedTacticFact(i, played, me)
  );
}

/** The Review screen's sentence for a fact. */
export function captionText(f: CaptionFact): string {
  switch (f.kind) {
    case 'missed-mate-1':
      return `You missed mate in 1 (${f.san}).`;
    case 'missed-mate-2':
      return `You missed mate in 2, starting with ${f.san}.`;
    case 'allowed-mate-1':
      return `This allowed mate in 1 (${f.san}).`;
    case 'allowed-mate-2':
      return 'This allowed mate in 2.';
    case 'left-undefended':
      return `This left your ${PIECE_NAME[f.piece]} on ${f.square} undefended — ${f.san} wins it.`;
    case 'lost-for-free':
      return `${f.san} wins your ${PIECE_NAME[f.piece]} on ${f.square} for free.`;
    case 'lost-to-cheaper':
      return `${f.san} wins your ${PIECE_NAME[f.piece]} on ${f.square} for a ${PIECE_NAME[f.by]}.`;
    case 'fork':
      return `This allowed a fork on ${f.square} — ${f.san} attacks your ${listPieces(f.targets)}.`;
    case 'missed-free-piece':
      return `You missed a free ${PIECE_NAME[f.piece]} on ${f.square} (${f.san}).`;
    case 'lost-in-exchange':
      return `${f.san} wins material — your ${PIECE_NAME[f.piece]} on ${f.square} is not defended well enough.`;
    case 'pin':
      return f.san
        ? `This walked into a pin — ${f.san} pins your ${PIECE_NAME[f.piece]} on ${f.square} to your ${PIECE_NAME[f.behind]}.`
        : `This walked into a pin — the ${PIECE_NAME[f.by]} on ${f.from} pins your ${PIECE_NAME[f.piece]} on ${f.square} to your ${PIECE_NAME[f.behind]}.`;
    case 'missed-pin':
      return `You missed a pin — ${f.san} pins the ${PIECE_NAME[f.piece]} on ${f.square} to the ${PIECE_NAME[f.behind]}.`;
    case 'skewer':
      return `This allowed a skewer — ${f.san} attacks your ${PIECE_NAME[f.piece]} and wins the ${PIECE_NAME[f.behind]} on ${f.behindSquare} behind it.`;
    case 'missed-skewer':
      return `You missed a skewer — ${f.san} attacks the ${PIECE_NAME[f.piece]} and wins the ${PIECE_NAME[f.behind]} on ${f.behindSquare} behind it.`;
    case 'discovered-attack':
      return f.piece === 'k'
        ? `This allowed a discovered check — ${f.san} opens the ${PIECE_NAME[f.by]} on ${f.from} onto your king.`
        : `This allowed a discovered attack — ${f.san} opens the ${PIECE_NAME[f.by]} on ${f.from} onto your ${PIECE_NAME[f.piece]} on ${f.square}.`;
    case 'missed-discovered-attack':
      return f.piece === 'k'
        ? `You missed a discovered check — ${f.san} opens your ${PIECE_NAME[f.by]} on ${f.from} onto the king.`
        : `You missed a discovered attack — ${f.san} opens your ${PIECE_NAME[f.by]} on ${f.from} onto the ${PIECE_NAME[f.piece]} on ${f.square}.`;
    case 'trapped-piece':
      return `This let your ${PIECE_NAME[f.piece]} on ${f.square} get trapped — after ${f.san} it has no safe square.`;
    case 'missed-trap':
      return `You missed trapping the ${PIECE_NAME[f.piece]} on ${f.square} — after ${f.san} it has no safe square.`;
    case 'allowed-promotion':
      return `This let a pawn promote — ${f.san} makes a new ${PIECE_NAME[f.piece]}.`;
    case 'missed-promotion':
      return `You missed promoting your pawn (${f.san}).`;
    case 'missed-fork':
      return `You missed a fork — ${f.san} attacks the ${listPieces(f.targets)}.`;
  }
}

/** One plain sentence explaining a weak move, or null when no rule can prove one. */
export function caption(i: CaptionInput): string | null {
  const f = captionFact(i);
  return f ? captionText(f) : null;
}

/** The caption input for the move at `ply` of a stored review (positions[ply - 1] before, positions[ply] after). */
export function captionInputFor(review: GameReview, ply: number): CaptionInput | null {
  const move = review.moves[ply - 1];
  const before = review.positions[ply - 1];
  const after = review.positions[ply];
  if (!move || !before || !after) return null;
  return {
    label: move.label,
    fenBefore: before.fen,
    uci: move.uci,
    bestBefore: before.bestMove,
    lineBefore: before.bestLine,
    scoreBefore: before.score,
    bestAfter: after.bestMove,
    lineAfter: after.bestLine,
    scoreAfter: after.score,
  };
}

/** The proven fact for the move at `ply` of a stored review. */
export function captionFactForMove(review: GameReview, ply: number): CaptionFact | null {
  const input = captionInputFor(review, ply);
  return input ? captionFact(input) : null;
}

/** The caption for the move at `ply` of a stored review. */
export function captionForMove(review: GameReview, ply: number): string | null {
  const f = captionFactForMove(review, ply);
  return f ? captionText(f) : null;
}
