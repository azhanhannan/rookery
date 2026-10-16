// Position setup for the Analysis board: a plain square -> piece map, turned into a FEN and checked.
import { Chess, type Square } from 'chess.js';
import type { Color } from './types';

/** "wK", "bp", ... (colour + piece letter, upper case for White's letter style doesn't matter here). */
export type PieceCode = `${Color}${'K' | 'Q' | 'R' | 'B' | 'N' | 'P'}`;
export type Placement = Partial<Record<string, PieceCode>>;
export type Castling = { K: boolean; Q: boolean; k: boolean; q: boolean };
export type Setup = {
  placement: Placement;
  turn: Color;
  castling: Castling;
  /** Full-move number (the FEN's last field); absent = 1. */
  fullmove?: number;
};

export const PIECE_CODES: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
const FILES = 'abcdefgh';

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/** Reads the placement, side to move and castling rights of a FEN (assumed well-formed enough to split). */
export function setupFromFen(fen: string): Setup {
  const [board = '', turn = 'w', castle = '-', , , move = '1'] = fen.trim().split(/\s+/);
  const placement: Placement = {};
  board.split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        placement[`${FILES[f]}${8 - r}`] = `${color}${ch.toUpperCase()}` as PieceCode;
        f++;
      }
    }
  });
  return {
    placement,
    turn: turn === 'b' ? 'b' : 'w',
    castling: { K: castle.includes('K'), Q: castle.includes('Q'), k: castle.includes('k'), q: castle.includes('q') },
    fullmove: clampFullmove(Number(move)),
  };
}

/** A usable full-move number: a whole number from 1 up, else 1. */
export function clampFullmove(n: number): number {
  return Number.isFinite(n) && n >= 1 ? Math.min(9999, Math.floor(n)) : 1;
}

/** Castling rights that the placement still allows (king and rook on their home squares). */
export function possibleCastling(placement: Placement): Castling {
  return {
    K: placement.e1 === 'wK' && placement.h1 === 'wR',
    Q: placement.e1 === 'wK' && placement.a1 === 'wR',
    k: placement.e8 === 'bK' && placement.h8 === 'bR',
    q: placement.e8 === 'bK' && placement.a8 === 'bR',
  };
}

/** The FEN for a setup; castling rights the placement no longer allows are dropped. */
export function fenFromSetup({ placement, turn, castling, fullmove }: Setup): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const p = placement[`${file}${rank}`];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p[0] === 'w' ? p[1] : p[1].toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const ok = possibleCastling(placement);
  const castle = (['K', 'Q', 'k', 'q'] as const).filter((c) => castling[c] && ok[c]).join('') || '-';
  return `${rows.join('/')} ${turn} ${castle} - 0 ${clampFullmove(fullmove ?? 1)}`;
}

/** Places `piece` on `square`, or removes what is there when `piece` is null or the same piece is already there. */
export function toggleSquare(placement: Placement, square: string, piece: PieceCode | null): Placement {
  const next = { ...placement };
  if (!piece || next[square] === piece) delete next[square];
  else next[square] = piece;
  return next;
}

/**
 * Null when the FEN is a legal position to analyse, else a readable reason. chess.js validates the syntax;
 * the chess rules it doesn't check (kings, pawns on the back ranks, the side not to move in check) are checked here.
 */
export function validatePosition(fen: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fen.trim());
  } catch (e) {
    return `Not a valid FEN: ${e instanceof Error ? e.message : String(e)}`;
  }
  const kings = { w: 0, b: 0 };
  for (const row of chess.board()) {
    for (const p of row) {
      if (p?.type === 'k') kings[p.color]++;
      if (p?.type === 'p' && (p.square[1] === '1' || p.square[1] === '8')) return 'Pawns cannot stand on the first or last rank.';
    }
  }
  if (kings.w !== 1 || kings.b !== 1) return 'Each side needs exactly one king.';
  // The side that just moved can't have left its own king in check.
  const other = chess.turn() === 'w' ? 'b' : 'w';
  const otherKing = chess
    .board()
    .flat()
    .find((p) => p?.type === 'k' && p.color === other)?.square as Square;
  if (chess.isAttacked(otherKing, chess.turn())) {
    return `${other === 'w' ? 'White' : 'Black'} is in check but it is ${chess.turn() === 'w' ? 'White' : 'Black'} to move.`;
  }
  return null;
}
