// Insights facts cache: one ~1 KB GameFacts per reviewed game in IndexedDB, keyed by game id + review time +
// side + INSIGHTS.factsVersion, so a re-review or a rules change simply misses the cache (rebuilt, never
// migrated). Every call may fail (private mode, blocked storage, no IndexedDB): callers fall back to computing.
import { INSIGHTS } from '../../config/tunables';
import type { Color, GameRecord } from '../../game/types';
import type { GameFacts } from '../../insights/types';

export type FactsCache = {
  /** Every cached entry, by key. */
  getAll(): Promise<Map<string, GameFacts>>;
  put(entries: [key: string, facts: GameFacts][]): Promise<void>;
  /** Drops every entry whose key is not in `keep`. */
  prune(keep: ReadonlySet<string>): Promise<void>;
};

/** The cache key for a game's facts, or null when it has no review. */
export function factsKey(record: GameRecord, color: Color | null): string | null {
  if (!record.review) return null;
  return `${record.id}|${record.review.createdAt}|${color ?? '-'}|v${INSIGHTS.factsVersion}`;
}

/** In memory (tests, and a fallback that lasts the page visit). */
export function memoryFactsCache(): FactsCache {
  const map = new Map<string, GameFacts>();
  return {
    getAll: async () => new Map(map),
    put: async (entries) => {
      for (const [k, f] of entries) map.set(k, f);
    },
    prune: async (keep) => {
      for (const k of [...map.keys()]) if (!keep.has(k)) map.delete(k);
    },
  };
}

const DB_NAME = 'rookery-insights';
const STORE = 'facts';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((e: unknown) => {
    opening = null;
    throw e;
  });
  return opening;
}

/** The browser's IndexedDB cache, or null where IndexedDB doesn't exist. */
export function idbFactsCache(): FactsCache | null {
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB) return null;
  } catch {
    return null;
  }
  return {
    async getAll() {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      const out = new Map<string, GameFacts>();
      keys.forEach((k, i) => {
        if (typeof k === 'string') out.set(k, values[i] as GameFacts);
      });
      return out;
    },
    async put(entries) {
      if (entries.length === 0) return;
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [k, f] of entries) store.put(f, k);
      await done(tx);
    },
    async prune(keep) {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const keys = await request(store.getAllKeys());
      for (const k of keys) if (typeof k !== 'string' || !keep.has(k)) store.delete(k);
      await done(tx);
    },
  };
}
