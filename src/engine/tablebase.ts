// Endgame tablebase lookups (Syzygy, up to 7 pieces) through the free Lichess tablebase API.
// Network only, best effort: any failure (offline, timeout, rate limit, odd answer) gives `null`, and the
// caller carries on without it. Answers are cached in memory for the session.
import type { Color } from '../game/types';
import { TABLEBASE } from '../config/tunables';

/** Outcome for one side with perfect play. */
export type TbOutcome = 'win' | 'draw' | 'loss';

export type TbMove = {
  uci: string;
  san: string;
  /** Outcome for the side that plays this move. */
  outcome: TbOutcome;
  /** Lichess's own category for the position after the move (the opponent's view). */
  category: string;
  /** Distance to zeroing (pawn move or capture) after the move, plies, the opponent's view (sign as Lichess gives it). */
  dtz: number | null;
  /** Distance to mate after the move, plies, the opponent's view; null when unknown. */
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
};

export type TablebaseResult = {
  fen: string;
  /** Outcome for the side to move. */
  outcome: TbOutcome;
  category: string;
  /** Plies; positive = the side to move wins. Null for draws or when unknown. */
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  insufficientMaterial: boolean;
  /** Best first, as Lichess orders them. */
  moves: TbMove[];
};

/**
 * Lichess categories, seen from the side to move. "cursed-win" / "blessed-loss" are wins and losses the 50-move
 * rule turns into draws, so they count as draws here; "maybe-*" (DTZ rounding near the 50-move limit) and
 * "syzygy-*" (no DTM) still count as the result they name. "unknown" (and anything new) is no answer.
 */
export function categoryOutcome(category: unknown): TbOutcome | null {
  switch (category) {
    case 'win':
    case 'syzygy-win':
    case 'maybe-win':
      return 'win';
    case 'loss':
    case 'syzygy-loss':
    case 'maybe-loss':
      return 'loss';
    case 'draw':
    case 'cursed-win':
    case 'blessed-loss':
      return 'draw';
    default:
      return null;
  }
}

export function flipOutcome(o: TbOutcome): TbOutcome {
  return o === 'win' ? 'loss' : o === 'loss' ? 'win' : 'draw';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Pure: a Lichess tablebase JSON answer as a TablebaseResult, or null when it isn't a usable answer. */
export function parseTablebase(json: unknown, fen: string): TablebaseResult | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const outcome = categoryOutcome(j.category);
  if (!outcome) return null;
  const moves: TbMove[] = [];
  if (Array.isArray(j.moves)) {
    for (const raw of j.moves) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;
      const after = categoryOutcome(m.category);
      if (typeof m.uci !== 'string' || !after) continue;
      moves.push({
        uci: m.uci,
        san: typeof m.san === 'string' ? m.san : m.uci,
        outcome: flipOutcome(after),
        category: String(m.category),
        dtz: num(m.dtz),
        dtm: num(m.dtm),
        checkmate: m.checkmate === true,
        stalemate: m.stalemate === true,
      });
    }
  }
  return {
    fen,
    outcome,
    category: String(j.category),
    dtz: outcome === 'draw' ? null : num(j.dtz),
    dtm: outcome === 'draw' ? null : num(j.dtm),
    checkmate: j.checkmate === true,
    stalemate: j.stalemate === true,
    insufficientMaterial: j.insufficient_material === true,
    moves,
  };
}

/** Pieces on the board (kings included). */
export function pieceCount(fen: string): number {
  const board = fen.trim().split(/\s+/)[0] ?? '';
  let n = 0;
  for (const ch of board) if (/[prnbqk]/i.test(ch)) n++;
  return n;
}

/** Whether the tablebase covers this position: at most TABLEBASE.maxPieces pieces and no castling rights. */
export function tablebaseCovers(fen: string): boolean {
  const castling = fen.trim().split(/\s+/)[2];
  return pieceCount(fen) <= TABLEBASE.maxPieces && (castling === undefined || castling === '-');
}

/** Outcome for `color` in a probed position. */
export function outcomeFor(result: TablebaseResult, color: Color): TbOutcome {
  const toMove = result.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return toMove === color ? result.outcome : flipOutcome(result.outcome);
}

/** "White wins" / "Draw" / "Black wins". */
export function verdictWords(result: TablebaseResult): string {
  const w = outcomeFor(result, 'w');
  return w === 'win' ? 'White wins' : w === 'loss' ? 'Black wins' : 'Draw';
}

/** "DTZ 3, DTM 21" (plies, sign dropped), or '' when neither is known. */
export function distanceWords(d: { dtz: number | null; dtm: number | null }): string {
  const parts: string[] = [];
  if (d.dtz !== null && d.dtz !== 0) parts.push(`DTZ ${Math.abs(d.dtz)}`);
  if (d.dtm !== null && d.dtm !== 0) parts.push(`DTM ${Math.abs(d.dtm)}`);
  return parts.join(', ');
}

/** "Tablebase: White wins (DTZ 3, DTM 21)", "Tablebase: Draw", "Tablebase: Checkmate". */
export function tablebaseLine(result: TablebaseResult): string {
  if (result.checkmate) return 'Tablebase: Checkmate';
  if (result.stalemate) return 'Tablebase: Stalemate (draw)';
  const dist = distanceWords(result);
  return `Tablebase: ${verdictWords(result)}${dist ? ` (${dist})` : ''}`;
}

/** Cache key: board, side, castling, en passant and the halfmove clock (which can turn a win into a cursed win). */
export function tablebaseKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 5).join(' ');
}

const cache = new Map<string, TablebaseResult>();
const inFlight = new Map<string, Promise<TablebaseResult | null>>();

export type ProbeOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Tests inject a fake; the app uses window.fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * Looks `fen` up in the tablebase. Null when the position isn't covered, the browser is offline, or the request
 * fails or times out. Successful answers are cached; failures are not (the next call tries again).
 */
export function probeTablebase(fen: string, opts: ProbeOptions = {}): Promise<TablebaseResult | null> {
  if (!tablebaseCovers(fen)) return Promise.resolve(null);
  const key = tablebaseKey(fen);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit.fen === fen ? hit : { ...hit, fen });
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !opts.fetchImpl) return Promise.resolve(null);
  let p = inFlight.get(key);
  if (!p) {
    p = request(fen, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  const shared = p;
  if (!opts.signal) return shared;
  // A caller that gives up gets null at once; the shared request still finishes and fills the cache.
  const signal = opts.signal;
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(null);
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    void shared.then((r) => {
      signal.removeEventListener('abort', onAbort);
      resolve(r);
    });
  });
}

async function request(fen: string, opts: ProbeOptions): Promise<TablebaseResult | null> {
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TABLEBASE.timeoutMs);
  try {
    const url = `${TABLEBASE.url}?fen=${encodeURIComponent(fen.trim())}`;
    const res = await doFetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const result = parseTablebase(await res.json(), fen);
    if (result) {
      if (cache.size >= TABLEBASE.cacheSize) cache.delete(cache.keys().next().value as string);
      cache.set(tablebaseKey(fen), result);
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only: forget cached answers. */
export function clearTablebaseCache(): void {
  cache.clear();
  inFlight.clear();
}
