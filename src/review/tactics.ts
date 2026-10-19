// Tactic detectors for the caption rules (pure, chess.js). Each one reads a line of moves (the tactic's first
// move, then the engine's continuation, as stored in the review) and the side that loses material (the
// victim). It proves the pattern on the board after the first move AND that the line then wins material with
// it: net loss of at least COACH_MOTIFS.minLoss counted from `start`, after the recapture on the last square
// settles. No pattern or no win in the line means null: a wrong caption is worse than none.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { COACH_MOTIFS } from '../config/tunables';
import type { Color } from '../game/types';
import { findMove, other, PIECE_VALUE, see } from './brilliant';

/** Material balance from `color`'s side, in pawns. */
export function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) for (const p of row) if (p) sum += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  return sum;
}

/** The UCI line played from `fen`, at most `max` plies; stops at the first illegal move. */
export function playLine(fen: string, ucis: readonly string[] = [], max: number = COACH_MOTIFS.witnessPlies): Move[] {
  const out: Move[] = [];
  let cur = fen;
  for (const u of ucis.slice(0, max)) {
    const m = findMove(cur, u);
    if (!m) break;
    out.push(m);
    cur = m.after;
  }
  return out;
}

/** Material `victim` is down after `move`, counted from `start`, once the recapture on its square settles. */
export function settledLoss(start: string, move: Move, victim: Color): number {
  const after = new Chess(move.after);
  return material(new Chess(start), victim) - material(after, victim) - see(after, move.to as Square, victim);
}

const wins = (start: string, move: Move, victim: Color) => settledLoss(start, move, victim) >= COACH_MOTIFS.minLoss;

type Hit = { square: Square; type: PieceSymbol; color: Color };
type Dir = readonly [number, number];
const ORTHO: readonly Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: readonly Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function dirsFor(type: PieceSymbol): readonly Dir[] {
  if (type === 'b') return DIAG;
  if (type === 'r') return ORTHO;
  if (type === 'q') return [...ORTHO, ...DIAG];
  return [];
}

function step(sq: Square, [df, dr]: Dir): Square | null {
  const f = sq.charCodeAt(0) - 97 + df;
  const r = Number(sq[1]) + dr;
  return f >= 0 && f < 8 && r >= 1 && r <= 8 ? (`${String.fromCharCode(97 + f)}${r}` as Square) : null;
}

/** Squares walked from `from` (exclusive) in `dir`, up to and including the first two pieces met. */
function walk(chess: Chess, from: Square, dir: Dir): { empty: Square[]; hits: Hit[] } {
  const empty: Square[] = [];
  const hits: Hit[] = [];
  for (let sq = step(from, dir); sq && hits.length < 2; sq = step(sq, dir)) {
    const p = chess.get(sq);
    if (p) hits.push({ square: sq, type: p.type, color: p.color });
    else if (hits.length === 0) empty.push(sq);
  }
  return { empty, hits };
}

/** A slider of `attacker` on `from` looking through one enemy piece (`front`) at another (`back`). */
type XRay = { from: Square; by: PieceSymbol; front: Hit; back: Hit };

function xrays(chess: Chess, attacker: Color, only?: Square): XRay[] {
  const out: XRay[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== attacker || (only && p.square !== only)) continue;
      for (const dir of dirsFor(p.type)) {
        const { hits } = walk(chess, p.square, dir);
        if (hits.length === 2 && hits.every((h) => h.color !== attacker)) out.push({ from: p.square, by: p.type, front: hits[0], back: hits[1] });
      }
    }
  }
  return out;
}

/**
 * The piece on `square` (of `type`, the victim's) is captured later in the line (not by the first move), with
 * a real material win. With `mayMove` false it must stay put until then (a pinned or skewered piece).
 */
function capturedLater(start: string, moves: Move[], victim: Color, square: Square, type: PieceSymbol, mayMove: boolean): Move | null {
  let at = square;
  for (let i = 1; i < moves.length; i++) {
    const m = moves[i];
    if (m.color === victim) {
      if (m.from === at) {
        if (!mayMove) return null;
        at = m.to as Square;
      }
      continue;
    }
    if (m.to === at) return m.captured === type && wins(start, m, victim) ? m : null;
  }
  return null;
}

export type Pin = { from: Square; by: PieceSymbol; square: Square; piece: PieceSymbol; behind: 'k' | 'q' };

function isPin(x: XRay): boolean {
  if (x.front.type === 'k' || x.front.type === 'p') return false;
  return x.back.type === 'k' || (x.back.type === 'q' && x.front.type !== 'q');
}

const pinKey = (x: XRay) => `${x.from}${x.front.square}${x.back.square}`;

/**
 * A pin that was not there in `start` (to the king, or to the queen), after the line's first move, and the
 * line then captures the pinned piece where it stands. `pinnerMoved`: the first move itself must be the pinner.
 */
export function pinWin(start: string, moves: Move[], victim: Color, pinnerMoved: boolean): Pin | null {
  const first = moves[0];
  if (!first) return null;
  const attacker = other(victim);
  const old = new Set(xrays(new Chess(start), attacker).filter(isPin).map(pinKey));
  for (const x of xrays(new Chess(first.after), attacker).filter(isPin)) {
    if (old.has(pinKey(x)) || (pinnerMoved && x.from !== first.to)) continue;
    if (!capturedLater(start, moves, victim, x.front.square, x.front.type, false)) continue;
    return { from: x.from, by: x.by, square: x.front.square, piece: x.front.type, behind: x.back.type as 'k' | 'q' };
  }
  return null;
}

export type Skewer = { square: Square; piece: PieceSymbol; behindSquare: Square; behind: PieceSymbol };

/**
 * The first move is a slider attacking the king (or a piece worth more than the one behind it) with another
 * piece behind on the same line; the line steps the front piece away, then takes the one behind.
 */
export function skewerWin(start: string, moves: Move[], victim: Color): Skewer | null {
  const [first, answer, take] = moves;
  if (!first || !answer || !take) return null;
  for (const x of xrays(new Chess(first.after), other(victim), first.to as Square)) {
    const { front, back } = x;
    if (back.type === 'p' || back.type === 'k') continue;
    if (front.type !== 'k' && PIECE_VALUE[front.type] <= PIECE_VALUE[back.type]) continue;
    if (answer.from !== front.square || take.to !== back.square || take.captured !== back.type) continue;
    if (!wins(start, take, victim)) continue;
    return { square: front.square, piece: front.type, behindSquare: back.square, behind: back.type };
  }
  return null;
}

export type Discovered = { from: Square; by: PieceSymbol; square: Square; piece: PieceSymbol };

/**
 * The first move steps off a line and uncovers a slider's attack on the king, or on a piece that is undefended
 * or worth more than the slider; the line's next capture (after the victim's answer) wins material, either
 * the uncovered slider taking that piece or the piece that moved taking something.
 */
export function discoveredWin(start: string, moves: Move[], victim: Color): Discovered | null {
  const [first, , take] = moves;
  if (!first || !take || first.flags.includes('k') || first.flags.includes('q') || first.flags.includes('e')) return null;
  const pos = new Chess(first.after);
  const attacker = other(victim);
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== attacker || p.square === first.to) continue;
      for (const dir of dirsFor(p.type)) {
        const { empty, hits } = walk(pos, p.square, dir);
        const t = hits[0];
        if (!t || t.color !== victim || t.type === 'p' || !empty.includes(first.from as Square)) continue;
        const threatened = t.type === 'k' || PIECE_VALUE[p.type] < PIECE_VALUE[t.type] || pos.attackers(t.square, victim).length === 0;
        if (!threatened) continue;
        const slider = take.from === p.square && take.to === t.square;
        if (!(slider || take.from === first.to) || !take.captured || !wins(start, take, victim)) continue;
        return { from: p.square, by: p.type, square: t.square, piece: t.type };
      }
    }
  }
  return null;
}

export type Trapped = { square: Square; piece: PieceSymbol };

/**
 * The first move attacks a piece (not a pawn or king, not pinned) that loses material where it stands and on
 * every square it can go to (static exchange), with the victim not in check; the line then wins it, wherever
 * it went.
 */
export function trappedWin(start: string, moves: Move[], victim: Color): Trapped | null {
  const first = moves[0];
  if (!first) return null;
  const pos = new Chess(first.after);
  if (pos.inCheck()) return null;
  const attacker = other(victim);
  // A pinned piece that can't move is a pin story, not a trapped piece.
  const pinned = new Set(xrays(pos, attacker).filter(isPin).map((x) => x.front.square));
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== victim || p.type === 'p' || p.type === 'k' || pinned.has(p.square)) continue;
      if (!pos.attackers(p.square, attacker).includes(first.to as Square)) continue;
      if (see(pos, p.square, attacker) < COACH_MOTIFS.minLoss) continue;
      const escapes = pos.moves({ square: p.square, verbose: true });
      const safe = escapes.some((e) => see(new Chess(e.after), e.to as Square, attacker) - (e.captured ? PIECE_VALUE[e.captured] : 0) < COACH_MOTIFS.minLoss);
      if (safe) continue;
      if (!capturedLater(start, moves, victim, p.square, p.type, true)) continue;
      return { square: p.square, piece: p.type };
    }
  }
  return null;
}

export type Fork = { square: Square; piece: PieceSymbol; targets: PieceSymbol[] };

/**
 * The first move is a fork: from its square the moved piece attacks two or more of the victim's pieces that
 * are the king, worth more than it, or undefended; the victim can't take it; after the victim's answer it
 * takes one of them (not a pawn). `needLoss`: that capture must also win material once the dust settles.
 */
export function forkWin(start: string, moves: Move[], victim: Color, needLoss: boolean): Fork | null {
  const [fork, , take] = moves;
  if (!fork || !take) return null;
  const pos = new Chess(fork.after);
  const from = fork.to as Square;
  const forker = fork.piece;
  if (pos.moves({ verbose: true }).some((m) => m.to === from)) return null;

  const targets: { square: Square; type: PieceSymbol }[] = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== victim || p.type === 'p') continue;
      if (!pos.attackers(p.square, other(victim)).includes(from)) continue;
      const valuable = p.type === 'k' || PIECE_VALUE[p.type] > PIECE_VALUE[forker] || pos.attackers(p.square, victim).length === 0;
      if (valuable) targets.push({ square: p.square, type: p.type });
    }
  }
  if (targets.length < 2) return null;
  if (!take.captured || take.from !== from || take.captured === 'p') return null;
  if (!targets.some((t) => t.square === take.to && t.type === take.captured)) return null;
  if (needLoss && !wins(start, take, victim)) return null;

  const order: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n'];
  return { square: from, piece: forker, targets: targets.map((t) => t.type).sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
}

/** Every one of the attacker's moves in the first `plies` of the line leaves the victim down material. */
export function staysWon(start: string, moves: Move[], victim: Color, plies = 4): boolean {
  const theirs = moves.slice(0, plies).filter((m) => m.color !== victim);
  return theirs.length > 0 && theirs.every((m) => wins(start, m, victim));
}
