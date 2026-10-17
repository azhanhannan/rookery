// Runs Stockfish over every position of a finished game (SPEC Feature 3, "Pipeline") and hands the
// analyses to buildReview. Positions are analysed one at a time, so cancelling wastes at most one search.
import { Chess } from 'chess.js';
import { REVIEW } from '../config/tunables';
import { getEngine } from '../engine/EngineService';
import type { AnalysisResult, Engine } from '../engine/types';
import type { GameRecord } from '../game/types';
import { lookupBook } from '../openings/openings';
import { buildReview } from './buildReview';
import type { BookInfo, GameReview } from './types';

export type ReviewProgress = { done: number; total: number };

export type RunReviewOptions = {
  /** Search depth; default REVIEW.depth.normal. */
  depth?: number;
  /** Defaults to the app engine (getEngine()). */
  engine?: Engine;
  /** Abort to cancel: the search is stopped and the promise rejects with an AbortError. */
  signal?: AbortSignal;
  /** Called after each analysed position: done of total (total = moves + 1). */
  onProgress?: (p: ReviewProgress) => void;
  /**
   * Awaited before each position is analysed, so a low-priority run can
   * wait while the engine is wanted elsewhere. It should settle promptly once `signal` aborts.
   */
  beforePosition?: () => Promise<void>;
};

/** Enough for dozens of games; the oldest entries go first. */
const CACHE_LIMIT = 5000;

type CacheEntry = { result: AnalysisResult; depth: number; multiPV: number };

/** FEN -> deepest analysis so far. A deeper or wider entry also answers a shallower request. */
const cache = new Map<string, CacheEntry>();

/** Forgets every cached analysis (tests; or to force a fresh run). */
export function clearAnalysisCache(): void {
  cache.clear();
}

/** Analyses every position of a finished game and builds its review. Does not modify the record. */
export async function runReview(record: GameRecord, opts: RunReviewOptions = {}): Promise<GameReview> {
  const { signal, onProgress, beforePosition } = opts;
  if (signal?.aborted) throw abortError();
  if (record.moves.length === 0) throw new Error('Cannot review a game with no moves');
  if (record.result === '*') throw new Error('Only finished games can be reviewed');

  const depth = opts.depth ?? REVIEW.depth.normal;
  const moves = record.moves.map(({ san, uci, fenAfter }) => ({ san, uci, fenAfter }));
  const fens = [record.startFen, ...moves.map((m) => m.fenAfter)];
  // Started now so the dataset loads while the engine works.
  const book = loadBook(record.startFen, moves);

  const engine = opts.engine ?? (await abortable(getEngine(), signal));
  await engine.setOption('Hash', REVIEW.hashMb);
  const analyses: AnalysisResult[] = [];
  for (const fen of fens) {
    if (beforePosition) await beforePosition();
    if (signal?.aborted) throw abortError();
    analyses.push(await analyse(engine, fen, depth, signal));
    onProgress?.({ done: analyses.length, total: fens.length });
  }
  return buildReview({ startFen: record.startFen, moves, analyses, book: await abortable(book, signal), depth });
}

async function analyse(engine: Engine, fen: string, depth: number, signal?: AbortSignal): Promise<AnalysisResult> {
  const multiPV = REVIEW.multiPV;
  const hit = cache.get(fen);
  if (hit && hit.depth >= depth && hit.multiPV >= multiPV) {
    // Re-inserted so the Map's insertion order doubles as least-recently-used order.
    cache.delete(fen);
    cache.set(fen, hit);
    return hit.result;
  }
  // The engine is never asked about a mated or stalemated side; there is nothing to search.
  const result = hasLegalMoves(fen)
    ? await abortable(engine.analyze(fen, { depth, multiPV }), signal, () => engine.stop())
    : { fen, lines: [], depth };
  remember(fen, { result, depth, multiPV });
  return result;
}

function remember(fen: string, entry: CacheEntry): void {
  cache.delete(fen);
  cache.set(fen, entry);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function hasLegalMoves(fen: string): boolean {
  return new Chess(fen).moves().length > 0;
}

/** A missing openings chunk (offline, failed deploy) costs the Book labels, not the whole review. */
function loadBook(startFen: string, moves: { fenAfter: string }[]): Promise<BookInfo> {
  return lookupBook(startFen, moves).catch((err: unknown) => {
    console.warn('Openings data failed to load; reviewing without Book moves', err);
    return { bookPlies: 0 };
  });
}

/**
 * Settles with `p`, or rejects with an AbortError as soon as `signal` aborts (after calling `onAbort`).
 * `p` keeps a handler either way, so a late rejection is never unhandled.
 */
function abortable<T>(p: Promise<T>, signal: AbortSignal | undefined, onAbort?: () => void): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort?.();
      reject(abortError());
    };
    if (signal.aborted) {
      p.catch(() => {});
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function abortError(): DOMException {
  return new DOMException('Review cancelled', 'AbortError');
}
