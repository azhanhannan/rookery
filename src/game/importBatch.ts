// Pure helpers for bulk import (Import page): turning PGN texts into finished game records, telling
// duplicates apart, and working out which side the importing player was.
import { Chess } from 'chess.js';
import { fromPgn } from './pgn';
import { detectEnd } from './rules';
import { pgnHeaders } from './pgnSplit';
import { toEpd } from '../openings/openings';
import type { Color, GameRecord } from './types';

/**
 * Stable identity of a game for duplicate checks: players, day played, result, start position and moves.
 * Built from record fields, so it also matches games imported or played before bulk import existed.
 */
export function gameKey(r: Pick<GameRecord, 'white' | 'black' | 'result' | 'createdAt' | 'startFen' | 'moves'>): string {
  return [
    r.white.name.trim().toLowerCase(),
    r.black.name.trim().toLowerCase(),
    r.createdAt.slice(0, 10),
    r.result,
    toEpd(r.startFen),
    r.moves.map((m) => m.uci).join(' '),
  ].join('|');
}

/** The side `name` played (case-insensitive), or null when it is neither or both. */
export function colorOfPlayer(r: Pick<GameRecord, 'white' | 'black'>, name: string): Color | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const w = r.white.name.trim().toLowerCase() === n;
  const b = r.black.name.trim().toLowerCase() === n;
  if (w === b) return null;
  return w ? 'w' : 'b';
}

/** The one player name that appears in every game (at least two games), as first written; else null. */
export function guessPlayerName(records: Pick<GameRecord, 'white' | 'black'>[]): string | null {
  if (records.length < 2) return null;
  const names = (r: Pick<GameRecord, 'white' | 'black'>) =>
    new Set([r.white.name, r.black.name].map((s) => s.trim().toLowerCase()));
  let common = names(records[0]);
  for (const r of records.slice(1)) {
    const next = names(r);
    common = new Set([...common].filter((n) => next.has(n)));
  }
  // Placeholder names from PGNs without player tags say nothing about who imported them.
  common.delete('white');
  common.delete('black');
  common.delete('?');
  if (common.size !== 1) return null;
  const [only] = common;
  const r = records[0];
  return r.white.name.trim().toLowerCase() === only ? r.white.name.trim() : r.black.name.trim();
}

export type Prepared = { ok: true; record: GameRecord } | { ok: false; reason: string };

/** "Ana vs Ben, 2026.10.14" for the failure list. */
export function gameLabel(text: string, index: number): string {
  const h = pgnHeaders(text);
  const who = h.White || h.Black ? `${h.White ?? '?'} vs ${h.Black ?? '?'}` : `Game ${index + 1}`;
  return h.Date && !h.Date.includes('?') ? `${who}, ${h.Date}` : who;
}

/**
 * One game's PGN -> a finished record ready to save, or the reason it can't be imported.
 * `player` (optional) is the importing player's name; when it matches a side, that side is stored as userColor.
 */
export function prepareGame(text: string, player?: string): Prepared {
  const h = pgnHeaders(text);
  if (h.Variant && !/^(standard|from position)$/i.test(h.Variant)) {
    return { ok: false, reason: `${h.Variant} games can't be imported (standard chess only)` };
  }
  let record: GameRecord;
  try {
    record = fromPgn(text);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (record.moves.length === 0) return { ok: false, reason: 'No moves' };
  // No result written (chess.js then reports "*"): a game that ended on the board is still finished.
  if (record.result === '*' && (!h.Result || h.Result === '*')) {
    const end = detectEnd(new Chess(record.moves[record.moves.length - 1].fenAfter));
    if (end) {
      record.result = end.result;
      record.termination ??= end.termination;
    }
  }
  if (record.result === '*') return { ok: false, reason: 'Not finished' };
  // Lichess adds the start time; keep it so games of one day sort in order.
  if (h.UTCDate && h.UTCTime && /^\d{4}\.\d{2}\.\d{2}$/.test(h.UTCDate) && /^\d{2}:\d{2}:\d{2}$/.test(h.UTCTime)) {
    const at = new Date(`${h.UTCDate.replaceAll('.', '-')}T${h.UTCTime}Z`);
    if (!Number.isNaN(at.getTime())) record.createdAt = at.toISOString();
  }
  const side = player ? colorOfPlayer(record, player) : null;
  if (side) record.userColor = side;
  return { ok: true, record };
}

/** How many recent Lichess games the Import page offers to fetch. */
export const LICHESS_COUNTS = [10, 50, 100];

export type LichessSpeed = 'any' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export const LICHESS_SPEEDS: LichessSpeed[] = ['any', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

/** Lichess usernames: 2-30 letters, digits, "_" or "-". */
export function isLichessUsername(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(name.trim());
}

/** The Lichess export URL. "any" still lists the standard speeds, so variant games are never sent. */
export function lichessGamesUrl(username: string, max: number, speed: LichessSpeed): string {
  const perf = speed === 'any' ? LICHESS_SPEEDS.filter((s) => s !== 'any').join(',') : speed;
  const q = new URLSearchParams({ max: String(max), clocks: 'true', opening: 'true', perfType: perf });
  return `https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}?${q.toString()}`;
}
