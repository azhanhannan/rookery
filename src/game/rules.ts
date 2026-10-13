import { Chess, DEFAULT_POSITION, type Move, type Square } from 'chess.js';
import type { Color, GameRecord, GameResult, PlayerInfo } from './types';

export const START_FEN = DEFAULT_POSITION;

export type MoveInput = { from: string; to: string; promotion?: string };

export type GameEnd = { result: Exclude<GameResult, '*'>; termination: string };

export function newRecord(opts: {
  white: PlayerInfo;
  black: PlayerInfo;
  startFen?: string;
  timeControl?: string;
}): GameRecord {
  return {
    id: crypto.randomUUID(),
    startFen: opts.startFen ?? START_FEN,
    moves: [],
    white: opts.white,
    black: opts.black,
    result: '*',
    createdAt: new Date().toISOString(),
    timeControl: opts.timeControl,
  };
}

function uciToInput(uci: string): MoveInput {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** Rebuilds the game up to `ply` (default: all moves). Replaying keeps chess.js's history, which repetition detection needs. */
export function replay(record: GameRecord, ply = record.moves.length): Chess {
  const chess = new Chess(record.startFen);
  for (const m of record.moves.slice(0, ply)) chess.move(uciToInput(m.uci));
  return chess;
}

/** Returns the legal move, or null. chess.js throws on illegal moves; callers only want a yes/no. */
export function tryLegalMove(chess: Chess, input: MoveInput): Move | null {
  try {
    return chess.move(input);
  } catch {
    return null;
  }
}

export function legalTargets(chess: Chess, square: string): string[] {
  return chess.moves({ square: square as Square, verbose: true }).map((m) => m.to);
}

export function needsPromotion(chess: Chess, from: string, to: string): boolean {
  return chess
    .moves({ square: from as Square, verbose: true })
    .some((m) => m.to === to && m.promotion !== undefined);
}

/** Board-state endings, checked in the order FIDE gives them priority (mate beats the 50-move claim). */
export function detectEnd(chess: Chess): GameEnd | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', termination: '50-move rule' };
  return null;
}

/**
 * Whether `color` still has mating material. Simplified FIDE rule: a lone king, or king plus one
 * minor piece against a lone king, cannot mate; anything else can.
 */
export function canMate(chess: Chess, color: Color): boolean {
  const own: string[] = [];
  const theirs: string[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.type === 'k') continue;
      (p.color === color ? own : theirs).push(p.type);
    }
  }
  if (own.length === 0) return false;
  if (own.length === 1 && (own[0] === 'n' || own[0] === 'b') && theirs.length === 0) return false;
  return true;
}

export function winFor(color: Color): '1-0' | '0-1' {
  return color === 'w' ? '1-0' : '0-1';
}

export function resignationEnd(resigning: Color): GameEnd {
  return { result: winFor(resigning === 'w' ? 'b' : 'w'), termination: 'resignation' };
}

export function timeoutEnd(chess: Chess, flagged: Color): GameEnd {
  const opponent = flagged === 'w' ? 'b' : 'w';
  if (!canMate(chess, opponent)) {
    return { result: '1/2-1/2', termination: 'timeout vs insufficient material' };
  }
  return { result: winFor(opponent), termination: 'timeout' };
}

/** Applies a move to a record. Returns the new record, or null when the game is over or the move is illegal. */
export function applyMove(
  record: GameRecord,
  input: MoveInput,
  clockMs?: number,
): { record: GameRecord; move: Move } | null {
  if (record.result !== '*') return null;
  const chess = replay(record);
  const move = tryLegalMove(chess, input);
  if (!move) return null;
  const next: GameRecord = {
    ...record,
    moves: [...record.moves, { san: move.san, uci: move.lan, fenAfter: move.after, clockMs }],
  };
  const end = detectEnd(chess);
  if (end) {
    next.result = end.result;
    next.termination = end.termination;
  }
  return { record: next, move };
}

export function endRecord(record: GameRecord, end: GameEnd): GameRecord {
  if (record.result !== '*') return record;
  return { ...record, result: end.result, termination: end.termination };
}

export function describeEnd(record: GameRecord): string | null {
  if (record.result === '*') return null;
  const winner =
    record.result === '1-0' ? 'White wins' : record.result === '0-1' ? 'Black wins' : 'Draw';
  return record.termination ? `${winner} by ${record.termination}` : winner;
}
