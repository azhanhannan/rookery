// Motifs beyond the caption rules, each proven on the board (chess.js): ignored threat, back-rank mate,
// stalemate given away. As with captions, no proof means no motif: a wrong tag is worse than none.
// Tablebase-wrong moves are not here: stored reviews carry no tablebase result, and facts never call the
// network (TODO when reviews keep the tablebase verdict).
import { Chess, type Square } from 'chess.js';
import { INSIGHTS } from '../config/tunables';
import { hangingPieces } from '../game/hanging';
import type { Color } from '../game/types';
import { findMove, other } from '../review/brilliant';
import type { CaptionFact, CaptionKind } from '../review/captions';
import type { Motif } from './types';

/** What the opponent threatens in `fen` against `me`: pieces hanging, and whether they have mate in 1. */
export type Threats = { hanging: Square[]; mate: boolean };

function safeChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** The same position with the other side to move (no en passant); null when that side is in check. */
function passTurn(fen: string): string | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const swapped = parts.join(' ');
  const chess = safeChess(swapped);
  if (!chess || safeChess(fen)?.inCheck()) return null;
  return swapped;
}

function hasMateIn1(fen: string | null): boolean {
  const chess = fen ? safeChess(fen) : null;
  return !!chess && chess.moves({ verbose: true }).some((m) => m.san.endsWith('#'));
}

/** Threats against `me` in `fen`, whoever is to move. */
export function threatsAgainst(fen: string, me: Color): Threats {
  const chess = safeChess(fen);
  if (!chess) return { hanging: [], mate: false };
  const mate = hasMateIn1(chess.turn() === me ? passTurn(fen) : fen);
  return { hanging: hangingPieces(fen, me), mate };
}

/**
 * What the opponent's last move newly threatens: threats in `fenBefore` (me to move) that were not there in
 * `fenPrev` (before their move). Null when nothing new, or there is no previous position.
 */
export function newThreat(fenPrev: string | undefined, fenBefore: string, me: Color): Threats | null {
  if (!fenPrev) return null;
  const now = threatsAgainst(fenBefore, me);
  const then = threatsAgainst(fenPrev, me);
  const hanging = now.hanging.filter((s) => !then.hanging.includes(s));
  const mate = now.mate && !then.mate;
  return hanging.length > 0 || mate ? { hanging, mate } : null;
}

const HANGING_KINDS: ReadonlySet<CaptionKind> = new Set(['left-undefended', 'lost-for-free', 'lost-to-cheaper', 'lost-in-exchange']);

/**
 * The move ignored a threat the opponent's last move created: the threatened piece stayed where it was and
 * the reply wins it (a hanging caption on that square), or a new mate-in-1 threat was left and played.
 */
export function ignoredThreat(fact: CaptionFact | null, threat: Threats | null, fenBefore: string, me: Color): boolean {
  if (!fact || !threat) return false;
  if (fact.kind === 'allowed-mate-1') return threat.mate;
  if (!HANGING_KINDS.has(fact.kind) || !('square' in fact) || !('piece' in fact)) return false;
  if (!threat.hanging.includes(fact.square)) return false;
  const piece = safeChess(fenBefore)?.get(fact.square);
  return !!piece && piece.color === me && piece.type === fact.piece;
}

/**
 * A checkmate in `fen` (the mated side to move) is a back-rank mate: the king is on its home rank, every
 * checker is a rook or queen on that rank, and the squares in front of the king are all taken by its own pieces.
 */
export function isBackRankMate(fen: string): boolean {
  const chess = safeChess(fen);
  if (!chess || !chess.isCheckmate()) return false;
  const me = chess.turn();
  const home = me === 'w' ? '1' : '8';
  const front = me === 'w' ? '2' : '7';
  const king = chess.findPiece({ type: 'k', color: me })[0];
  if (!king || king[1] !== home) return false;
  const checkers = chess.attackers(king, other(me));
  if (checkers.length === 0) return false;
  for (const sq of checkers) {
    const p = chess.get(sq);
    if (!p || (p.type !== 'r' && p.type !== 'q') || sq[1] !== home) return false;
  }
  const file = king.charCodeAt(0);
  for (let f = file - 1; f <= file + 1; f++) {
    if (f < 97 || f > 104) continue;
    const p = chess.get(`${String.fromCharCode(f)}${front}` as Square);
    if (!p || p.color !== me) return false;
  }
  return true;
}

/** Plays UCI moves from `fen`; null if any is illegal. */
function playLine(fen: string, ucis: string[]): string | null {
  let cur = fen;
  for (const u of ucis) {
    const m = findMove(cur, u);
    if (!m) return null;
    cur = m.after;
  }
  return cur;
}

/**
 * An allowed mate (from the caption rules) that ends as a back-rank mate. Mate in 1 is replayed from the
 * fact; mate in 2 needs the engine line after the move to end in mate.
 */
export function allowedBackRankMate(fact: CaptionFact | null, fenAfter: string, lineAfter: string[] = []): boolean {
  if (!fact) return false;
  if (fact.kind === 'allowed-mate-1') {
    const mated = playLine(fenAfter, [fact.uci]);
    return !!mated && isBackRankMate(mated);
  }
  if (fact.kind === 'allowed-mate-2' && lineAfter.length >= 3) {
    const mated = playLine(fenAfter, lineAfter.slice(0, 3));
    return !!mated && isBackRankMate(mated);
  }
  return false;
}

/** The move stalemated the opponent from a position the mover was winning. */
export function gaveAwayStalemate(fenAfter: string, winBefore: number): boolean {
  if (winBefore < INSIGHTS.stalemateFromWin) return false;
  return !!safeChess(fenAfter)?.isStalemate();
}

/** Caption kind to motif; 'other' for kinds with no drill to train them (trapped pieces, promotions). */
const CAPTION_MOTIF: Record<CaptionKind, Motif> = {
  'missed-mate-1': 'missed-mate',
  'missed-mate-2': 'missed-mate',
  'allowed-mate-1': 'allowed-mate',
  'allowed-mate-2': 'allowed-mate',
  'left-undefended': 'hanging',
  'lost-for-free': 'hanging',
  'lost-to-cheaper': 'hanging',
  fork: 'fork',
  'missed-free-piece': 'missed-free-piece',
  'lost-in-exchange': 'hanging',
  pin: 'pin',
  'missed-pin': 'pin',
  skewer: 'skewer',
  'missed-skewer': 'skewer',
  'discovered-attack': 'discovered-attack',
  'missed-discovered-attack': 'discovered-attack',
  'missed-fork': 'fork',
  'trapped-piece': 'other',
  'missed-trap': 'other',
  'allowed-promotion': 'other',
  'missed-promotion': 'other',
};

export type MotifInput = {
  fact: CaptionFact | null;
  fenBefore: string;
  fenAfter: string;
  lineAfter?: string[];
  me: Color;
  winBefore: number;
  loss: number;
  /** What the opponent's previous move newly threatened, from `newThreat`. */
  threat: Threats | null;
};

/** The one motif a move is filed under, most specific first; undefined when nothing is proven. */
export function motifFor(i: MotifInput): Exclude<Motif, 'other'> | undefined {
  if (gaveAwayStalemate(i.fenAfter, i.winBefore)) return 'stalemate';
  if (allowedBackRankMate(i.fact, i.fenAfter, i.lineAfter)) return 'back-rank';
  if (i.loss >= INSIGHTS.eventLoss && ignoredThreat(i.fact, i.threat, i.fenBefore, i.me)) return 'ignored-threat';
  const motif = i.fact ? CAPTION_MOTIF[i.fact.kind] : undefined;
  return motif === 'other' ? undefined : motif;
}
