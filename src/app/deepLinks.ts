// Deep links into existing pages (pure): a Review position, one lesson, one endgame drill, My mistakes for one
// motif. Insights' "Train this" and evidence lists build them; App.tsx and the pages read them back.
import { MOTIFS, type Motif, type TrainTarget } from '../insights/types';

/** `#/review/<id>?ply=<n>`: the game's review, opened at that ply. */
export function reviewHref(gameId: string, ply?: number): string {
  return `#/review/${encodeURIComponent(gameId)}${ply !== undefined ? `?ply=${ply}` : ''}`;
}

/** `#/review/<id>[?ply=n]` back to its parts; nulls when the hash isn't a game's review. */
export function parseReviewHash(hash: string): { gameId: string | undefined; ply: number | undefined } {
  if (hash !== '#/review' && !hash.startsWith('#/review/')) return { gameId: undefined, ply: undefined };
  const rest = hash.slice('#/review/'.length);
  const q = rest.indexOf('?');
  const path = q < 0 ? rest : rest.slice(0, q);
  const params = new URLSearchParams(q < 0 ? '' : rest.slice(q + 1));
  const n = Number(params.get('ply'));
  const ply = params.has('ply') && Number.isInteger(n) && n >= 0 ? n : undefined;
  return { gameId: decodeURIComponent(path) || undefined, ply };
}

/** The part after `base/` (`#/lessons/forks` -> 'forks'); null when the hash is not below `base`. */
export function subPath(hash: string, base: string): string | null {
  if (!hash.startsWith(`${base}/`)) return null;
  const rest = hash.slice(base.length + 1);
  return rest ? decodeURIComponent(rest) : null;
}

/** `#/puzzles/mistakes/<motif>`: My mistakes, only that motif. Null for anything else (unknown motifs too). */
export function mistakesMotifFromHash(hash: string): Exclude<Motif, 'other'> | null {
  const sub = subPath(hash, '#/puzzles/mistakes');
  return sub && sub !== 'other' && (MOTIFS as readonly string[]).includes(sub) ? (sub as Exclude<Motif, 'other'>) : null;
}

/** Where a "Train this" target lands, with its ids. */
export function trainHref(t: TrainTarget): string {
  switch (t.kind) {
    case 'mistakes':
      return `#/puzzles/mistakes/${t.motif}`;
    case 'lesson':
      return `#/lessons/${encodeURIComponent(t.lessonId)}`;
    case 'endgames':
      return t.drillId ? `#/endgames/${encodeURIComponent(t.drillId)}` : '#/endgames';
    default:
      return t.href;
  }
}
