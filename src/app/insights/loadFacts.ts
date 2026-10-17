// Loads Insights facts for this browser's saved games: cached facts where the game and its review are
// unchanged, built (and cached) otherwise. The cache is optional: any failure falls back to computing.
// Server facts (other devices' games) merge in by game id through `serverSource` once the server provides
// them; the browser's own facts win, because they are built from the record on this device.
import { INSIGHTS } from '../../config/tunables';
import { loadHistory } from '../../game/storage';
import type { Color, GameRecord } from '../../game/types';
import { buildGameFacts, exclusionReason, historyOf } from '../../insights';
import type { Coverage, GameFacts, HistoryEntry } from '../../insights/types';
import { userColorOf } from '../../puzzles/harvest';
import { factsKey, idbFactsCache, type FactsCache } from './factsCache';

/**
 * SEAM for the server (insights/server branch): a function returning the account's facts for games this
 * device may not hold. No fetch code lives here; the caller passes it in.
 */
export type ServerFactsSource = () => Promise<GameFacts[]>;

export type LoadFactsOptions = {
  /** Default: the saved games on this device. */
  records?: GameRecord[];
  /** Names that are "you" in imported games (e.g. the account's username). */
  userNames?: string[];
  serverSource?: ServerFactsSource;
  /** Default: IndexedDB when available. null = no cache. */
  cache?: FactsCache | null;
};

export type LoadedFacts = {
  facts: GameFacts[];
  coverage: Coverage;
  /** Every finished game in order, reviewed or not (for "the game after a loss"). */
  history: HistoryEntry[];
  /** How the facts were come by: from the cache, built now, or from the server only. */
  fromCache: number;
  built: number;
  fromServer: number;
  /** The cache failed and was skipped. */
  cacheFailed: boolean;
};

/** The player's side in a record: the import's own side, else the bot game's human, else a name match. */
export function sideOf(record: GameRecord, userNames: string[] = []): Color | null {
  return record.userColor ?? userColorOf(record, userNames);
}

/**
 * Adds server facts for games not already here (same facts version only). Pure.
 * Returns the merged list and how many came from the server.
 */
export function mergeServerFacts(local: GameFacts[], server: GameFacts[]): { facts: GameFacts[]; added: number } {
  const have = new Set(local.map((f) => f.gameId));
  const extra: GameFacts[] = [];
  for (const f of server) {
    if (!f || typeof f.gameId !== 'string' || f.factsVersion !== INSIGHTS.factsVersion || have.has(f.gameId)) continue;
    have.add(f.gameId);
    extra.push(f);
  }
  return { facts: [...local, ...extra], added: extra.length };
}

export async function loadInsightFacts(options: LoadFactsOptions = {}): Promise<LoadedFacts> {
  const records = options.records ?? loadHistory();
  const names = options.userNames ?? [];
  let cache = options.cache === undefined ? idbFactsCache() : options.cache;
  let cacheFailed = false;
  let cached = new Map<string, GameFacts>();
  if (cache) {
    try {
      cached = await cache.getAll();
    } catch {
      cache = null;
      cacheFailed = true;
    }
  }

  const facts: GameFacts[] = [];
  const excluded: Coverage['excluded'] = {};
  const keep = new Set<string>();
  const fresh: [string, GameFacts][] = [];
  const history: HistoryEntry[] = [];
  let fromCache = 0;
  for (const r of records) {
    const color = sideOf(r, names);
    history.push(...historyOf([r], color));
    const why = exclusionReason(r, color);
    if (why) {
      excluded[why] = (excluded[why] ?? 0) + 1;
      continue;
    }
    const key = factsKey(r, color);
    const hit = key ? cached.get(key) : undefined;
    if (key && hit && hit.factsVersion === INSIGHTS.factsVersion && hit.gameId === r.id) {
      facts.push(hit);
      keep.add(key);
      fromCache++;
      continue;
    }
    const f = buildGameFacts(r, color);
    if (!f) continue;
    facts.push(f);
    if (key) {
      keep.add(key);
      fresh.push([key, f]);
    }
  }
  if (cache) {
    try {
      await cache.put(fresh);
      await cache.prune(keep);
    } catch {
      cacheFailed = true;
    }
  }

  let fromServer = 0;
  let all = facts;
  if (options.serverSource) {
    try {
      const merged = mergeServerFacts(facts, await options.serverSource());
      all = merged.facts;
      fromServer = merged.added;
    } catch {
      // The server is optional: local facts stand on their own.
    }
  }
  history.sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.gameId.localeCompare(b.gameId));
  return {
    facts: all,
    coverage: { total: records.length + fromServer, included: all.length, excluded },
    history,
    fromCache,
    built: fresh.length,
    fromServer,
    cacheFailed,
  };
}
