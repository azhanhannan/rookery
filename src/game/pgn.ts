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
  };
}
