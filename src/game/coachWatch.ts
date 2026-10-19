// Practice games: the Coach's check right after the player's move. Rule-based (chess.js only, no engine): it
// speaks only when the board proves the move just allowed mate in 1 or lost material, AND another legal move
// would have avoided it. A false alarm is worse than silence, so every doubtful case stays quiet.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { COACH_PRACTICE } from '../config/tunables';
import { PIECE_VALUE } from './hanging';

export type CoachWarning =
  /** After the move the opponent has a mate in 1 (`san`), and some other move didn't allow one. */
  | { kind: 'mate'; san: string }
  /**
   * The opponent's best capture (`by` takes your `piece` on `square`) wins at least `loss` pawns of material
   * over your move, their capture and your best reply; `free` = you can't take back on that square.
   */
  | { kind: 'material'; piece: PieceSymbol; square: Square; by: PieceSymbol; free: boolean; loss: number };

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** Material a move wins on the spot: the captured piece plus what a promotion adds. */
function gainOf(m: Move): number {
  return (m.captured ? PIECE_VALUE[m.captured] : 0) + (m.promotion ? PIECE_VALUE[m.promotion] - 1 : 0);
}

/** The side to move's legal captures onto `sq` (en passant left out: its target isn't on `sq`). */
function capturesOn(chess: Chess, sq: Square): Move[] {
  const out: Move[] = [];
  for (const from of chess.attackers(sq, chess.turn())) {
    for (const m of chess.moves({ square: from, verbose: true })) {
      if (m.to === sq && m.captured && !m.flags.includes('e')) out.push(m);
    }
  }
  return out;
}

/**
 * Static exchange on `sq` with legal moves only (so pinned pieces can't take): what the side to move wins by
 * capturing there with its least valuable piece, each side free to stop. Mutates `chess` and restores it.
 */
function exchange(chess: Chess, sq: Square): number {
  const caps = capturesOn(chess, sq);
  if (caps.length === 0) return 0;
  let m = caps[0];
  for (const c of caps) {
    const cheaper = PIECE_VALUE[c.piece] < PIECE_VALUE[m.piece];
    if (cheaper || (PIECE_VALUE[c.piece] === PIECE_VALUE[m.piece] && gainOf(c) > gainOf(m))) m = c;
  }
  chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  const back = exchange(chess, sq);
  chess.undo();
  return Math.max(0, gainOf(m) - back);
}

function matesInOne(chess: Chess): Move[] {
  return chess.moves({ verbose: true }).filter((m) => m.san.endsWith('#'));
}

/** The side to move's best material reply: an exchange on any square, or Infinity for a mate in 1 (`withMate`). */
function bestReply(chess: Chess, withMate: boolean): number {
  if (withMate && matesInOne(chess).length > 0) return Infinity;
  const them = chess.turn() === 'w' ? 'b' : 'w';
  let best = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== them || p.type === 'k') continue;
      best = Math.max(best, exchange(chess, p.square));
    }
  }
  return best;
}

/**
 * The opponent (side to move in `pos`) picks the capture that nets most once you've made your best reply
 * (3 plies: their capture, your reply, the exchange that follows). Returns that net and the capture.
 */
function opponentBest(pos: Chess, withMate: boolean): { net: number; capture: Move | null } {
  const mine = pos.turn() === 'w' ? 'b' : 'w';
  let net = 0;
  let capture: Move | null = null;
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== mine || p.type === 'k') continue;
      for (const c of capturesOn(pos, p.square)) {
        pos.move({ from: c.from, to: c.to, promotion: c.promotion });
        const v = gainOf(c) - bestReply(pos, withMate);
        pos.undo();
        if (v > net) [net, capture] = [v, c];
      }
    }
  }
  return { net, capture };
}

const uciOf = (m: Move) => m.from + m.to + (m.promotion ?? '');

/**
 * The Coach's warning for playing `uci` in `fenBefore`, or null when nothing is proven. Rules, in order:
 * 1. The move gives mate, stalemate or ends the game: silence.
 * 2. Mate: the opponent now has a mate in 1, and another legal move would have left none.
 * 3. The move gives check: silence (a checking sacrifice can't be told from a blunder without an engine).
 * 4. Material: the opponent's best capture nets at least COACH_PRACTICE.minLoss pawns over your move (what it
 *    took counts back), their capture, your best reply anywhere (a mate in 1 cancels it: a bait) and the legal
 *    exchange after it; and some other legal move would have lost at least minLoss less.
 */
export function coachWarning(fenBefore: string, uci: string): CoachWarning | null {
  let before: Chess;
  try {
    before = new Chess(fenBefore);
  } catch {
    return null;
  }
  const moves = before.moves({ verbose: true });
  const want = uci.toLowerCase();
  const played = moves.find((m) => uciOf(m) === want);
  if (!played) return null;
  const others = moves.filter((m) => m !== played);
  const pos = new Chess(played.after);
  if (pos.isGameOver()) return null;

  const mates = matesInOne(pos);
  if (mates.length > 0) {
    const avoidable = others.some((m) => {
      const c = new Chess(m.after);
      return c.isCheckmate() || matesInOne(c).length === 0;
    });
    return avoidable ? { kind: 'mate', san: mates[0].san } : null;
  }
  if (pos.inCheck()) return null;

  const { net, capture } = opponentBest(pos, true);
  const loss = net - gainOf(played);
  if (!capture || loss < COACH_PRACTICE.minLoss) return null;
  // Was there a better move? Alternatives are scored without the mate-reply search: that can only overstate
  // their loss, i.e. make the Coach quieter, never louder.
  const bar = loss - COACH_PRACTICE.minLoss;
  const avoidable = others.some((m) => {
    const c = new Chess(m.after);
    if (c.isCheckmate()) return true;
    return opponentBest(c, false).net - gainOf(m) <= bar;
  });
  if (!avoidable) return null;

  pos.move({ from: capture.from, to: capture.to, promotion: capture.promotion });
  const free = capturesOn(pos, capture.to).length === 0;
  return { kind: 'material', piece: capture.captured!, square: capture.to, by: capture.piece, free, loss };
}

/** The Coach's sentence: short and plain. */
export function coachWarningText(w: CoachWarning): string {
  if (w.kind === 'mate') return `Careful: that lets your opponent checkmate you in one move (${w.san}).`;
  const piece = `your ${PIECE_NAME[w.piece]} on ${w.square}`;
  if (w.free) return `Careful: ${piece} can be taken for free.`;
  if (PIECE_VALUE[w.by] < PIECE_VALUE[w.piece]) return `Careful: ${piece} can be taken by a ${PIECE_NAME[w.by]}.`;
  return `Careful: you can lose material on ${w.square} (${piece}).`;
}
