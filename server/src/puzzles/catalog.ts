import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PuzzleSet } from '../../../src/puzzles/types';

/**
 * The puzzles the server will rate, id -> puzzle rating. The rating used for an attempt always
 * comes from here, never from the client.
 */
export type PuzzleCatalog = { ratingOf(id: string): number | null };

/** A fixed catalog (tests). */
export function mapCatalog(ratings: ReadonlyMap<string, number> | Record<string, number>): PuzzleCatalog {
  const map = ratings instanceof Map ? ratings : new Map(Object.entries(ratings));
  return { ratingOf: (id) => map.get(id) ?? null };
}

/** id -> rating from a puzzles.json body; entries without a string id and a finite rating are skipped. */
export function parseCatalog(json: string): Map<string, number> {
  const set = JSON.parse(json) as Partial<PuzzleSet> | null;
  const map = new Map<string, number>();
  if (!set || !Array.isArray(set.puzzles)) return map;
  for (const p of set.puzzles as unknown[]) {
    if (typeof p !== 'object' || p === null) continue;
    const { id, rating } = p as { id?: unknown; rating?: unknown };
    if (typeof id === 'string' && typeof rating === 'number' && Number.isFinite(rating)) map.set(id, rating);
  }
  return map;
}

/**
 * public/puzzles/puzzles.json (relative to the repo root, i.e. process.cwd()), read once on first use.
 * While the file is missing the catalog is empty (every attempt is an unknown puzzle) and the file is
 * looked for again on the next lookup, so building the puzzle set doesn't need a server restart.
 */
export function fileCatalog(path = resolve(process.cwd(), 'public/puzzles/puzzles.json')): PuzzleCatalog {
  let loaded: Map<string, number> | null = null;
  const load = (): Map<string, number> | null => {
    if (loaded) return loaded;
    if (!existsSync(path)) return null;
    loaded = parseCatalog(readFileSync(path, 'utf8'));
    return loaded;
  };
  return { ratingOf: (id) => load()?.get(id) ?? null };
}
