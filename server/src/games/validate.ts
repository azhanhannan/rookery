import { Chess } from 'chess.js';
import type { SaveGameRequest } from '../../../src/api/types';
import type { Color, GameRecord, GameResult, MoveRecord, PlayerInfo } from '../../../src/game/types';
import { tryLegalMove } from '../../../src/game/rules';

// Checks an uploaded game before anything is stored. The record is kept unchanged, so every field
// the server or the browser later reads is shape-checked here, and the moves are replayed so a
// rating can only come from a game that could actually have been played.

/** Longest game accepted, in plies (the longest possible game is under 6000; real ones are far shorter). */
const MAX_PLIES = 2000;
const MAX_ID = 100;
const MAX_NAME = 100;
const MAX_TEXT = 200;

export type Validated = { ok: true; request: SaveGameRequest; playedAt: Date } | { ok: false; error: string };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || isStr(v, max);
const isColor = (v: unknown): v is Color => v === 'w' || v === 'b';
const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];
const isResult = (v: unknown): v is GameResult => RESULTS.includes(v as GameResult);

function isPlayer(v: unknown): v is PlayerInfo {
  if (!isObj(v) || !isStr(v.name, MAX_NAME) || typeof v.isBot !== 'boolean') return false;
  if (v.engine !== undefined && v.engine !== 'stockfish' && v.engine !== 'maia') return false;
  return v.elo === undefined || (typeof v.elo === 'number' && Number.isFinite(v.elo));
}

function isMove(v: unknown): v is MoveRecord {
  if (!isObj(v) || !isStr(v.san, 10) || !isStr(v.uci, 5) || !isStr(v.fenAfter, MAX_TEXT)) return false;
  return v.clockMs === undefined || (typeof v.clockMs === 'number' && Number.isFinite(v.clockMs) && v.clockMs >= 0);
}

/** Shape problems in an uploaded record, or null. */
function shapeError(r: Obj): string | null {
  if (!isStr(r.id, MAX_ID)) return 'The game has no id.';
  if (!isStr(r.startFen, MAX_TEXT)) return 'The game has no start position.';
  if (!Array.isArray(r.moves) || r.moves.length > MAX_PLIES || !r.moves.every(isMove))
    return 'The game has a malformed move list.';
  if (!isPlayer(r.white) || !isPlayer(r.black)) return 'The game has malformed player details.';
  if (!isResult(r.result)) return 'The game has an unknown result.';
  if (!optStr(r.termination, MAX_TEXT)) return 'The game has a malformed ending.';
  if (typeof r.createdAt !== 'string') return 'The game has no date.';
  if (!optStr(r.timeControl, 20)) return 'The game has a malformed time control.';
  if (r.review !== undefined && !isObj(r.review)) return 'The game has a malformed review.';
  if (r.maiaMatch !== undefined && !isObj(r.maiaMatch)) return 'The game has a malformed style match.';
  if (r.rated !== undefined && typeof r.rated !== 'boolean') return 'The game has a malformed rated flag.';
  return null;
}

/** Replays every move from the start position; problems in the move list or the claimed result, or null. */
export function replayError(record: GameRecord): string | null {
  let chess: Chess;
  try {
    chess = new Chess(record.startFen);
  } catch {
    return 'The game has an invalid start position.';
  }
  for (const [i, m] of record.moves.entries()) {
    const move = tryLegalMove(chess, { from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    const label = `Move ${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} ${m.san}`;
    if (!move) return `${label} is not legal.`;
    if (move.lan !== m.uci || move.san !== m.san || move.after !== m.fenAfter)
      return `${label} does not match the position it was played in.`;
  }
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? '0-1' : '1-0';
    if (record.result !== winner) return 'The result does not match the checkmate on the board.';
  } else if (chess.isStalemate() && record.result !== '1/2-1/2') {
    return 'The result does not match the stalemate on the board.';
  }
  return null;
}

/** When the game was played: record.createdAt when it is a real date not in the future, else now. */
function playedAtFor(createdAt: string, now = new Date()): Date {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t <= now.getTime() ? new Date(t) : now;
}

/** Validates a PUT /games/:clientId body. */
export function validateSaveRequest(body: unknown, clientId: string): Validated {
  if (!isObj(body) || !isObj(body.record)) return { ok: false, error: 'Send a game record.' };
  const { record, userColor, rated } = body;
  if (userColor !== null && !isColor(userColor)) return { ok: false, error: 'userColor must be "w", "b" or null.' };
  if (typeof rated !== 'boolean') return { ok: false, error: 'rated must be true or false.' };
  const shape = shapeError(record);
  if (shape) return { ok: false, error: shape };
  const game = record as GameRecord;
  if (game.id !== clientId) return { ok: false, error: "The game's id does not match the address it was sent to." };
  if (game.result === '*') return { ok: false, error: 'Only finished games can be saved.' };
  const replay = replayError(game);
  if (replay) return { ok: false, error: replay };
  return { ok: true, request: { record: game, userColor, rated }, playedAt: playedAtFor(game.createdAt) };
}
