// Opening repertoires (pure): a repertoire is a variation tree for one side. Every position in it where that
// side is to move and the tree has a reply is a card, drilled with spaced repetition (keyed by EPD, so the same
// position reached by two move orders is one card). Storage lives in ./repertoireStore.
import { Chess } from 'chess.js';
import { OPENING_TRAINER } from '../config/tunables';
import type { Color } from '../game/types';
import { START_FEN } from '../game/rules';
import { addMove, createTree, getNode, pathTo, type VariationTree } from '../game/variationTree';
import { addDays, isDayKey } from '../puzzles/days';
import { isDue, schedule, type CardState } from '../puzzles/spacedRepetition';
import { toEpd } from './openings';

export type Repertoire = {
  id: string;
  name: string;
  /** The side the user plays in this repertoire. */
  color: Color;
  tree: VariationTree;
  createdAt: string;
  updatedAt: string;
};

export type CardRecord = CardState & {
  /** Times answered (clean or not). */
  reps: number;
  /** Times answered wrongly. */
  fails: number;
};

/** Per repertoire id: per EPD of a user-to-move position. */
export type CardBook = Record<string, Record<string, CardRecord>>;

export type RepertoireData = {
  version: 1;
  /** ISO time of the last change (for account sync). */
  updatedAt: string;
  repertoires: Repertoire[];
  cards: CardBook;
  /** Delete markers for account sync: repertoire id → ISO time it was deleted (src/sync/merge.ts). */
  deleted?: Record<string, string>;
};

export const emptyData = (): RepertoireData => ({ version: 1, updatedAt: new Date(0).toISOString(), repertoires: [], cards: {} });

const sideToMove = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

// ---------- tree building ----------

/**
 * Adds every move of `add` into `base` (moves already there are reused, so lines are deduped) and returns the
 * merged tree. Comments of `add` fill in where `base` has none. Throws when the two start from different positions.
 */
export function mergeTrees(base: VariationTree, add: VariationTree): VariationTree {
  const baseRoot = getNode(base, base.rootId);
  const addRoot = getNode(add, add.rootId);
  if (toEpd(baseRoot.fen) !== toEpd(addRoot.fen)) throw new Error('These lines start from a different position than the repertoire');
  let tree = base;
  if (!baseRoot.comment && addRoot.comment) tree = patchComment(tree, tree.rootId, addRoot.comment);
  const walk = (addId: string, baseId: string) => {
    for (const childId of getNode(add, addId).children) {
      const child = getNode(add, childId);
      const uci = child.uci!;
      const r = addMove(tree, baseId, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!r) continue;
      tree = r.tree;
      if (child.comment && !tree.nodes[r.id].comment) tree = patchComment(tree, r.id, child.comment);
      walk(childId, r.id);
    }
  };
  walk(add.rootId, tree.rootId);
  return tree;
}

function patchComment(tree: VariationTree, id: string, comment: string): VariationTree {
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...tree.nodes[id], comment } } };
}

/**
 * Removes lines that end on the opponent's move (nothing for the user to answer there), repeatedly, so every
 * leaf is a user move. The root is kept.
 */
export function trimOpponentEnds(tree: VariationTree, color: Color): VariationTree {
  const nodes = { ...tree.nodes };
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of Object.values(nodes)) {
      if (!n.parentId || n.children.length) continue;
      // n's move was made by the side that was to move in its parent.
      if (sideToMove(nodes[n.parentId].fen) === color) continue;
      delete nodes[n.id];
      const p = nodes[n.parentId];
      nodes[p.id] = { ...p, children: p.children.filter((c) => c !== n.id) };
      changed = true;
    }
  }
  return { ...tree, nodes };
}

export type SeedGame = { startFen: string; ucis: string[] };

/**
 * A repertoire tree from the user's own games: their first `plies` moves, merged. Where the user was to move,
 * only the move they played most often is kept (ties: the one seen first); every opponent reply is kept. Games not
 * from the standard start are skipped. Lines ending on an opponent move are trimmed.
 */
export function seedFromGames(games: SeedGame[], color: Color, plies: number = OPENING_TRAINER.seedPlies): VariationTree {
  type Trie = { count: number; order: number; children: Map<string, Trie> };
  const root: Trie = { count: 0, order: 0, children: new Map() };
  let order = 0;
  const startEpd = toEpd(START_FEN);
  for (const g of games) {
    if (toEpd(g.startFen) !== startEpd) continue;
    let t = root;
    for (const uci of g.ucis.slice(0, plies)) {
      let next = t.children.get(uci);
      if (!next) {
        next = { count: 0, order: order++, children: new Map() };
        t.children.set(uci, next);
      }
      next.count++;
      t = next;
    }
  }
  let tree = createTree(START_FEN);
  const build = (t: Trie, nodeId: string) => {
    const entries = [...t.children.entries()].sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order);
    const keep = sideToMove(tree.nodes[nodeId].fen) === color ? entries.slice(0, 1) : entries;
    for (const [uci, child] of keep) {
      const r = addMove(tree, nodeId, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!r) continue;
      tree = r.tree;
      build(child, r.id);
    }
  };
  build(root, tree.rootId);
  return trimOpponentEnds(tree, color);
}

// ---------- cards and lines ----------

/** EPD -> the nodes where the user is to move and the tree has a move to play (in tree order). */
export function userCards(rep: Pick<Repertoire, 'tree' | 'color'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const visit = (id: string) => {
    const n = rep.tree.nodes[id];
    if (n.children.length && sideToMove(n.fen) === rep.color) {
      const key = toEpd(n.fen);
      out.set(key, [...(out.get(key) ?? []), id]);
    }
    n.children.forEach(visit);
  };
  visit(rep.tree.rootId);
  return out;
}

/** Every line as node ids from the root to a leaf, main line first, then variations in tree order. */
export function linesOf(tree: VariationTree): string[][] {
  const out: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const n = tree.nodes[id];
    const p = [...path, id];
    if (!n.children.length) out.push(p);
    else n.children.forEach((c) => walk(c, p));
  };
  walk(tree.rootId, []);
  return out;
}

/** The cards (EPDs) the user answers along `path`, in order, each once. */
export function lineCards(tree: VariationTree, color: Color, path: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const fen = tree.nodes[path[i]].fen;
    if (sideToMove(fen) !== color) continue;
    const key = toEpd(fen);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** A card has been answered at least once. */
const seen = (c: CardRecord | undefined): c is CardRecord => !!c && c.reps > 0;

/** Seen and due on or before `today`. */
export function isCardDue(c: CardRecord | undefined, today: string): boolean {
  return seen(c) && isDue(c, today);
}

export type DrillMode = 'due' | 'learn';

/**
 * The next line to drill, or null when there is nothing for the mode.
 * 'due': lines with due cards; the most due cards first, then the oldest due date, then the least practised.
 * 'learn': lines with never-answered cards, in tree order (main line first). `skip` (a path's leaf id) is avoided
 * when another line qualifies, so "Next line" doesn't repeat the one just played.
 */
export function chooseLine(
  rep: Pick<Repertoire, 'tree' | 'color'>,
  cards: Record<string, CardRecord>,
  mode: DrillMode,
  today: string,
  skip?: string,
): string[] | null {
  type Cand = { path: string[]; due: number; oldest: string; reps: number; fresh: number; i: number };
  const cands: Cand[] = linesOf(rep.tree).map((path, i) => {
    const keys = lineCards(rep.tree, rep.color, path);
    const dueKeys = keys.filter((k) => isCardDue(cards[k], today));
    return {
      path,
      i,
      due: dueKeys.length,
      oldest: dueKeys.map((k) => cards[k].due).sort()[0] ?? '9999-99-99',
      reps: keys.reduce((s, k) => s + (cards[k]?.reps ?? 0), 0),
      fresh: keys.filter((k) => !seen(cards[k])).length,
    };
  });
  let pool = cands.filter((c) => (mode === 'due' ? c.due > 0 : c.fresh > 0));
  if (pool.length > 1 && skip) pool = pool.filter((c) => c.path[c.path.length - 1] !== skip);
  if (!pool.length) return null;
  if (mode === 'due') pool.sort((a, b) => b.due - a.due || a.oldest.localeCompare(b.oldest) || a.reps - b.reps || a.i - b.i);
  return pool[0].path;
}

/**
 * The card's next state after an answer on `today`, on the 1/3/7/21-day ladder of spacedRepetition.schedule.
 * Unlike "My mistakes", an opening card never retires: past the last interval it keeps coming back at that interval.
 */
export function answerCard(prev: CardRecord | undefined, clean: boolean, today: string, intervals: number[] = OPENING_TRAINER.intervals): CardRecord {
  const next = schedule(prev, clean, today, intervals);
  const reps = (prev?.reps ?? 0) + 1;
  const fails = (prev?.fails ?? 0) + (clean ? 0 : 1);
  if (next.retired) return { stage: intervals.length, due: addDays(today, intervals[intervals.length - 1] ?? 1), retired: false, reps, fails };
  return { ...next, reps, fails };
}

/** Whether an answer should change the schedule: always for a wrong answer, else only when the card was due. */
export function shouldRecord(prev: CardRecord | undefined, clean: boolean, today: string): boolean {
  return !clean || !seen(prev) || isDue(prev, today);
}

export type WeakSpot = { key: string; nodeId: string; fails: number; reps: number; stage: number };

export type RepertoireProgress = {
  total: number;
  /** Answered at least once and on the ladder (last answer clean). */
  learned: number;
  /** Answered before and due now. */
  due: number;
  /** Never answered. */
  fresh: number;
  nextDue: string | null;
  /** Most-failed positions first (only ones failed at least once). */
  weakest: WeakSpot[];
};

export function repertoireProgress(
  rep: Pick<Repertoire, 'tree' | 'color'>,
  cards: Record<string, CardRecord>,
  today: string,
  weakestCount: number = OPENING_TRAINER.weakest,
): RepertoireProgress {
  const all = userCards(rep);
  let learned = 0;
  let due = 0;
  let fresh = 0;
  let nextDue: string | null = null;
  const weak: WeakSpot[] = [];
  for (const [key, ids] of all) {
    const c = cards[key];
    if (!seen(c)) {
      fresh++;
      continue;
    }
    if (c.stage > 0) learned++;
    if (isDue(c, today)) due++;
    else if (!nextDue || c.due < nextDue) nextDue = c.due;
    if (c.fails > 0) weak.push({ key, nodeId: ids[0], fails: c.fails, reps: c.reps, stage: c.stage });
  }
  weak.sort((a, b) => b.fails / b.reps - a.fails / a.reps || b.fails - a.fails || a.stage - b.stage);
  return { total: all.size, learned, due, fresh, nextDue, weakest: weak.slice(0, weakestCount) };
}

/** Drops cards for positions no longer in the repertoire (after a line is deleted). */
export function pruneCards(rep: Pick<Repertoire, 'tree' | 'color'>, cards: Record<string, CardRecord>): Record<string, CardRecord> {
  const keys = userCards(rep);
  return Object.fromEntries(Object.entries(cards).filter(([k]) => keys.has(k)));
}

/** "1. e4 e5 2. Nf3 Nc6" for the moves up to `id` (the move-number style of a move list). */
export function lineText(tree: VariationTree, id: string): string {
  const parts: string[] = [];
  const path = pathTo(tree, id).slice(1);
  path.forEach((pid, i) => {
    const n = tree.nodes[pid];
    const [, turn, , , , no] = tree.nodes[n.parentId!].fen.split(' ');
    if (turn === 'w') parts.push(`${no}. ${n.san}`);
    else parts.push(i === 0 ? `${no}... ${n.san}` : n.san!);
  });
  return parts.join(' ');
}

/** The move `uci` from `fen` as SAN, or null when illegal. */
export function sanOf(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

// ---------- storage shape ----------

function validCard(c: unknown): c is CardRecord {
  const r = c as CardRecord;
  return !!r && typeof r.stage === 'number' && isDayKey(r.due) && typeof r.retired === 'boolean' && typeof r.reps === 'number' && typeof r.fails === 'number';
}

function validRepertoire(r: unknown): r is Repertoire {
  const x = r as Repertoire;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    (x.color === 'w' || x.color === 'b') &&
    !!x.tree?.nodes?.[x.tree.rootId] &&
    Array.isArray(x.tree.headers) &&
    typeof x.tree.nextId === 'number'
  );
}

/** Reads the stored JSON, dropping anything malformed; an unreadable value gives empty data. */
export function parseRepertoireData(raw: string | null): RepertoireData {
  if (!raw) return emptyData();
  try {
    const p = JSON.parse(raw) as Partial<RepertoireData>;
    if (!p || typeof p !== 'object') return emptyData();
    const repertoires = Array.isArray(p.repertoires) ? p.repertoires.filter(validRepertoire) : [];
    const cards: CardBook = {};
    for (const r of repertoires) {
      const book = p.cards?.[r.id];
      if (!book || typeof book !== 'object') continue;
      cards[r.id] = Object.fromEntries(Object.entries(book).filter(([, c]) => validCard(c)));
    }
    const deleted: Record<string, string> = {};
    if (p.deleted && typeof p.deleted === 'object')
      for (const [id, at] of Object.entries(p.deleted)) if (typeof at === 'string') deleted[id] = at;
    return {
      version: 1,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : emptyData().updatedAt,
      repertoires,
      cards,
      ...(Object.keys(deleted).length ? { deleted } : {}),
    };
  } catch {
    return emptyData();
  }
}
