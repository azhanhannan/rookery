import { Chess } from 'chess.js';
import { fromClk, toClk } from './clock';
import { detectEnd, START_FEN } from './rules';
import type { GameRecord, GameResult, MoveRecord } from './types';

const RESULTS: GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];

function pgnDate(iso: string): string {
  return iso.slice(0, 10).replaceAll('-', '.');
}

export function toPgn(record: GameRecord): string {
  const chess = new Chess(record.startFen);
  chess.setHeader('Event', 'Casual game');
  chess.setHeader('Site', 'Rookery');
  chess.setHeader('Date', pgnDate(record.createdAt));
  chess.setHeader('White', record.white.name);
  chess.setHeader('Black', record.black.name);
  chess.setHeader('Result', record.result);
  if (record.white.elo !== undefined) chess.setHeader('WhiteElo', String(record.white.elo));
  if (record.black.elo !== undefined) chess.setHeader('BlackElo', String(record.black.elo));
  chess.setHeader('TimeControl', record.timeControl ?? '-');
  if (record.termination) chess.setHeader('Termination', record.termination);
  const ended = pgnEndTime(record.endedAt);
  if (ended) {
    chess.setHeader('EndDate', ended.date);
    chess.setHeader('EndTime', ended.time);
  }
  if (record.takebacks) chess.setHeader('Takebacks', String(record.takebacks));
  if (record.startFen !== START_FEN) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', record.startFen);
  }
  for (const m of record.moves) {
    chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    if (m.clockMs !== undefined) chess.setComment(`[%clk ${toClk(m.clockMs)}]`);
  }
  return chess.pgn() + '\n';
}

/** EndDate/EndTime tags (the names Chess.com uses; written and read as UTC) for an ISO end time, or null. */
function pgnEndTime(iso: string | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const s = t.toISOString();
  return { date: pgnDate(s), time: s.slice(11, 19) };
}

/** The ISO end time from EndDate/EndTime tags (read as UTC), or undefined when they are missing or malformed. */
function parseEndTime(date: string | undefined, time: string | undefined): string | undefined {
  if (!date || !time || !/^\d{4}\.\d{2}\.\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return undefined;
  const t = new Date(`${date.replaceAll('.', '-')}T${time}Z`);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

/** A non-negative whole number tag, else undefined. */
function parseCount(v: string | undefined): number | undefined {
  return v && /^\d{1,4}$/.test(v) ? Number(v) : undefined;
}

/** PGN writes "?" for an unknown player; chess.js also fills missing tags with it. */
function playerName(tag: string | undefined, fallback: string): string {
  return tag && tag !== '?' ? tag : fallback;
}

function parseElo(v: string | undefined): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined;
  return Number(v);
}

/** Parses one PGN game. Throws an Error with a readable message when the PGN is invalid. */
export function fromPgn(text: string): GameRecord {
  const chess = new Chess();
  try {
    chess.loadPgn(text.trim());
  } catch (e) {
    throw new Error(`Couldn't read that PGN: ${e instanceof Error ? e.message : String(e)}`);
  }
  const headers = chess.getHeaders();
  const history = chess.history({ verbose: true });
  const startFen = history[0]?.before ?? headers.FEN ?? START_FEN;

  const clkByFen = new Map<string, number>();
  for (const c of chess.getComments()) {
    const clk = /\[%clk\s+([^\]]+)\]/.exec(c.comment ?? '');
    const ms = clk ? fromClk(clk[1]) : undefined;
    if (ms !== undefined) clkByFen.set(c.fen, ms);
  }

  const moves: MoveRecord[] = history.map((m) => ({
    san: m.san,
    uci: m.lan,
    fenAfter: m.after,
    clockMs: clkByFen.get(m.after),
  }));

  const end = detectEnd(chess);
  const headerResult = RESULTS.find((r) => r === headers.Result);
  const result: GameResult = headerResult ?? end?.result ?? '*';
  const termination = headers.Termination || (result !== '*' ? end?.termination : undefined);
  const date = headers.Date && /^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date)
    ? new Date(headers.Date.replaceAll('.', '-') + 'T00:00:00Z').toISOString()
    : new Date().toISOString();
  const timeControl = headers.TimeControl && headers.TimeControl !== '-' ? headers.TimeControl : undefined;
  // Only a finished game has an end time; takebacks are Rookery's own tag (practice games), kept for a round trip.
  const endedAt = result !== '*' ? parseEndTime(headers.EndDate, headers.EndTime) : undefined;
  const takebacks = parseCount(headers.Takebacks) || undefined;

  return {
    id: crypto.randomUUID(),
    startFen,
    moves,
    white: { name: playerName(headers.White, 'White'), isBot: false, elo: parseElo(headers.WhiteElo) },
    black: { name: playerName(headers.Black, 'Black'), isBot: false, elo: parseElo(headers.BlackElo) },
    result,
    termination,
    createdAt: date,
    timeControl,
    ...(endedAt ? { endedAt } : {}),
    ...(takebacks ? { takebacks } : {}),
  };
}
