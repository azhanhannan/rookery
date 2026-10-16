// Opening explorer: move statistics for a position from Lichess's masters and Lichess-games databases.
//
// What the API looked like when this was written (checked 16 Oct 2026 with real requests):
// - Host is `explorer.lichess.org` (the old `explorer.lichess.ovh` still answers, the same way). Endpoints
//   `/masters` and `/lichess`, query `fen=`, plus `moves`, `topGames` (masters ≤ 15, lichess ≤ 4),
//   `recentGames`, and for `/lichess` `ratings=` (groups 0,1000,1200,…,2200,2500) and `speeds=`.
// - Both endpoints now NEED a Lichess OAuth token: without one nginx answers 401 "Authorization Required"
//   (the OpenAPI spec lists `security: OAuth2: []`, i.e. any token, no scope needed). A personal API token
//   from lichess.org/account/oauth/token works; it goes in an `Authorization: Bearer …` header, which the
//   server's CORS allows from any origin, so the browser calls Lichess directly and Rookery's server never
//   sees the token.
// - Rate limits: Lichess asks for one request at a time; a 429 means wait a full minute before retrying.
//   Here: requests are debounced (useExplorer), one shared request per key, and after a 429 every lookup
//   returns 'rate-limited' for EXPLORER.backoffMs without touching the network (cached answers still show).
// - Answer: { opening: {eco,name}|null, white, draws, black, moves: [{uci, san, averageRating, white, draws,
//   black, game, opening}], topGames: [{uci, id, winner, white:{name,rating}, black:{…}, year, month}],
//   recentGames?, history? }.
//
// Network only, best effort, in the style of src/engine/tablebase.ts: failures give a status, never a throw,
// and only successful answers are cached.
import { EXPLORER } from '../config/tunables';

export type ExplorerSource = 'masters' | 'lichess';

export const SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;
export type ExplorerSpeed = (typeof SPEEDS)[number];
/** Lichess rating groups: each runs from its value to the next one's (2500 = 2500 and up). */
export const RATING_GROUPS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export type ExplorerFilters = {
  /** Lichess database only: rating groups (values from RATING_GROUPS). Empty = all. */
  ratings: number[];
  /** Lichess database only. Empty = all. */
  speeds: ExplorerSpeed[];
};

export type ExplorerPlayer = { name: string; rating: number | null };

export type ExplorerGame = {
  id: string;
  /** The move played from this position in that game, when Lichess says. */
  uci: string | null;
  winner: 'white' | 'black' | null;
  white: ExplorerPlayer;
  black: ExplorerPlayer;
  year: number | null;
};

export type ExplorerMove = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  averageRating: number | null;
  /** The only game with this move, when there is just one. */
  game: ExplorerGame | null;
};

export type ExplorerResult = {
  fen: string;
  source: ExplorerSource;
  opening: { eco: string; name: string } | null;
  white: number;
  draws: number;
  black: number;
  total: number;
  /** Most played first, as Lichess orders them. */
  moves: ExplorerMove[];
  topGames: ExplorerGame[];
};

export type ExplorerOutcome =
  | { status: 'ok'; result: ExplorerResult }
  | { status: 'no-token' }
  /** 401/403 with a token: it is wrong, expired or revoked. */
  | { status: 'bad-token' }
  | { status: 'rate-limited'; retryAt: number }
  | { status: 'offline' }
  | { status: 'error' };

export function defaultFilters(): ExplorerFilters {
  return {
    ratings: EXPLORER.defaultRatings.filter((r) => (RATING_GROUPS as readonly number[]).includes(r)),
    speeds: EXPLORER.defaultSpeeds.filter((s): s is ExplorerSpeed => (SPEEDS as readonly string[]).includes(s)),
  };
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

function player(v: unknown): ExplorerPlayer {
  const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    name: typeof p.name === 'string' && p.name ? p.name : '?',
    rating: typeof p.rating === 'number' && Number.isFinite(p.rating) ? p.rating : null,
  };
}

function game(v: unknown): ExplorerGame | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  if (typeof g.id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(g.id)) return null;
  return {
    id: g.id,
    uci: typeof g.uci === 'string' ? g.uci : null,
    winner: g.winner === 'white' || g.winner === 'black' ? g.winner : null,
    white: player(g.white),
    black: player(g.black),
    year: typeof g.year === 'number' && Number.isFinite(g.year) ? g.year : null,
  };
}

function opening(v: unknown): { eco: string; name: string } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && o.name ? { eco: typeof o.eco === 'string' ? o.eco : '', name: o.name } : null;
}

/** Pure: a Lichess explorer JSON answer as an ExplorerResult, or null when it isn't one. */
export function parseExplorer(json: unknown, fen: string, source: ExplorerSource): ExplorerResult | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (!Array.isArray(j.moves)) return null;
  const moves: ExplorerMove[] = [];
  for (const raw of j.moves) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m.uci)) continue;
    const white = count(m.white);
    const draws = count(m.draws);
    const black = count(m.black);
    moves.push({
      uci: m.uci,
      san: typeof m.san === 'string' && m.san ? m.san : m.uci,
      white,
      draws,
      black,
      total: white + draws + black,
      averageRating: typeof m.averageRating === 'number' && m.averageRating > 0 ? Math.round(m.averageRating) : null,
      game: game(m.game),
    });
  }
  const white = count(j.white);
  const draws = count(j.draws);
  const black = count(j.black);
  const topGames: ExplorerGame[] = [];
  if (Array.isArray(j.topGames)) for (const g of j.topGames) {
    const parsed = game(g);
    if (parsed) topGames.push(parsed);
  }
  return { fen, source, opening: opening(j.opening), white, draws, black, total: white + draws + black, moves, topGames };
}

/** Whole-number percentages of a white/draw/black split that add up to 100 (or all 0 with no games). */
export function splitPercents(s: { white: number; draws: number; black: number }): { white: number; draws: number; black: number } {
  const total = s.white + s.draws + s.black;
  if (total === 0) return { white: 0, draws: 0, black: 0 };
  const white = Math.round((s.white / total) * 100);
  const black = Math.round((s.black / total) * 100);
  return { white, draws: Math.max(0, 100 - white - black), black };
}

/** "1,234", "56k", "1.2M". */
export function formatGames(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString('en-US');
}

/** Lichess page for an explorer game (masters games are imported on lichess.org under the same id). */
export function gameUrl(id: string): string {
  return `https://lichess.org/${encodeURIComponent(id)}`;
}

/** Share (0–1) of this position's games that went on with `uci`; null when the position has no games. */
export function moveShare(result: ExplorerResult, uci: string): number | null {
  const total = result.moves.reduce((n, m) => n + m.total, 0);
  if (total === 0) return null;
  return (result.moves.find((m) => m.uci === uci)?.total ?? 0) / total;
}

/** Whether `uci` is rare in this (masters) position: under EXPLORER.rareShare of at least EXPLORER.rareMinGames games. */
export function isRareMove(result: ExplorerResult, uci: string): boolean {
  const total = result.moves.reduce((n, m) => n + m.total, 0);
  if (total < EXPLORER.rareMinGames) return false;
  const share = moveShare(result, uci);
  return share !== null && share < EXPLORER.rareShare;
}

/** Position part of the FEN (board, side, castling, en passant); the move counters don't change the answer. */
function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/** Cache key: position + database + (for the Lichess database) its filters in a stable order. */
export function explorerKey(fen: string, source: ExplorerSource, filters: ExplorerFilters): string {
  if (source === 'masters') return `masters|${positionKey(fen)}`;
  const ratings = [...filters.ratings].sort((a, b) => a - b).join(',');
  const speeds = SPEEDS.filter((s) => filters.speeds.includes(s)).join(',');
  return `lichess|${ratings}|${speeds}|${positionKey(fen)}`;
}

export function explorerUrl(fen: string, source: ExplorerSource, filters: ExplorerFilters): string {
  const q = new URLSearchParams({ fen: fen.trim(), moves: String(EXPLORER.moves) });
  if (source === 'masters') {
    q.set('topGames', String(Math.min(15, EXPLORER.topGames)));
  } else {
    q.set('variant', 'standard');
    q.set('topGames', '0');
    q.set('recentGames', '0');
    if (filters.speeds.length) q.set('speeds', SPEEDS.filter((s) => filters.speeds.includes(s)).join(','));
    if (filters.ratings.length) q.set('ratings', [...filters.ratings].sort((a, b) => a - b).join(','));
  }
  return `${EXPLORER.url}/${source}?${q.toString()}`;
}

// Least-recently-used cache: a Map keeps insertion order, so a hit is re-inserted at the end.
const cache = new Map<string, ExplorerResult>();
const inFlight = new Map<string, Promise<ExplorerOutcome>>();
let blockedUntil = 0;

function remember(key: string, result: ExplorerResult): void {
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > EXPLORER.cacheSize) cache.delete(cache.keys().next().value as string);
}

/** A cached answer without asking the network (and marks it recently used). */
export function cachedExplorer(fen: string, source: ExplorerSource, filters: ExplorerFilters): ExplorerResult | null {
  const key = explorerKey(fen, source, filters);
  const hit = cache.get(key);
  if (!hit) return null;
  remember(key, hit);
  return hit.fen === fen ? hit : { ...hit, fen };
}

export type ExplorerOptions = {
  token: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Tests inject a fake; the app uses window.fetch. */
  fetchImpl?: typeof fetch;
  /** Tests inject a clock. */
  now?: () => number;
};

/**
 * Looks `fen` up in the explorer. Never throws: the outcome says why there is no answer. A cached answer is
 * returned even without a token or while backing off after a 429.
 */
export function fetchExplorer(
  fen: string,
  source: ExplorerSource,
  filters: ExplorerFilters,
  opts: ExplorerOptions,
): Promise<ExplorerOutcome> {
  const hit = cachedExplorer(fen, source, filters);
  if (hit) return Promise.resolve({ status: 'ok', result: hit });
  if (!opts.token) return Promise.resolve({ status: 'no-token' });
  const now = (opts.now ?? Date.now)();
  if (now < blockedUntil) return Promise.resolve({ status: 'rate-limited', retryAt: blockedUntil });
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !opts.fetchImpl) {
    return Promise.resolve({ status: 'offline' });
  }
  const key = explorerKey(fen, source, filters);
  let p = inFlight.get(key);
  if (!p) {
    p = request(fen, source, filters, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  const shared = p;
  if (!opts.signal) return shared;
  // A caller that gives up gets 'error' at once; the shared request still finishes and fills the cache.
  const signal = opts.signal;
  return new Promise((resolve) => {
    if (signal.aborted) return resolve({ status: 'error' });
    const onAbort = () => resolve({ status: 'error' });
    signal.addEventListener('abort', onAbort, { once: true });
    void shared.then((r) => {
      signal.removeEventListener('abort', onAbort);
      resolve(r);
    });
  });
}

async function request(
  fen: string,
  source: ExplorerSource,
  filters: ExplorerFilters,
  opts: ExplorerOptions,
): Promise<ExplorerOutcome> {
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { status: 'error' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? EXPLORER.timeoutMs);
  try {
    const res = await doFetch(explorerUrl(fen, source, filters), {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${opts.token}` },
    });
    if (res.status === 429) {
      blockedUntil = (opts.now ?? Date.now)() + EXPLORER.backoffMs;
      return { status: 'rate-limited', retryAt: blockedUntil };
    }
    if (res.status === 401 || res.status === 403) return { status: 'bad-token' };
    if (!res.ok) return { status: 'error' };
    const result = parseExplorer(await res.json(), fen, source);
    if (!result) return { status: 'error' };
    remember(explorerKey(fen, source, filters), result);
    return { status: 'ok', result };
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return { status: offline ? 'offline' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only: forget cached answers and any 429 back-off. */
export function clearExplorerCache(): void {
  cache.clear();
  inFlight.clear();
  blockedUntil = 0;
}

/** Tests only. */
export function explorerCacheSize(): number {
  return cache.size;
}
