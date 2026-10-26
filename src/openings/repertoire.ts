// Opening repertoires (pure): a repertoire is a variation tree for one side. Every position in it where that
// side is to move and the tree has a reply is a card, drilled with spaced repetition (keyed by EPD, so the same
// position reached by two move orders is one card). Storage lives in ./repertoireStore.
import { Chess } from 'chess.js';
import { OPENING_TRAINER } from '../config/tunables';
import type { Color } from '../game/types';
import { START_FEN } from '../game/rules';
import { addMove, createTree, getNode, pathTo, splitComment, type VariationTree } from '../game/variationTree';
import { addDays, daysBetween, isDayKey } from '../puzzles/days';
import { isDue, type CardState } from '../puzzles/spacedRepetition';
import { toEpd } from './openings';

export type Repertoire = {
  id: string;
  name: string;
  /** The side the user plays in this repertoire. */
  color: Color;
  tree: VariationTree;
  createdAt: string;
  updatedAt: string;
  /** Resting since this day: nothing is asked and the cards' clock is frozen until it resumes. */
  restedOn?: string;
  /** The library entry it was added from (`LibraryOpening.id`), so the library can tell it's already there. */
  libraryId?: string;
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

/** A repertoire with moves to review today (the Play page and the header remind the user). */
export type DueRepertoire = { id: string; name: string; color: Color; due: number };

/**
 * The moves the repertoire plays from each of its cards (EPD → sorted UCIs joined by spaces). Two same-colour
 * repertoires with the same EPD and the same moves share that card: it is asked and counted once.
 */
export function cardMoves(rep: Pick<Repertoire, 'tree' | 'color'>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, ids] of userCards(rep)) {
    const ucis = new Set<string>();
    for (const id of ids) for (const c of rep.tree.nodes[id].children) ucis.add(rep.tree.nodes[c].uci ?? '');
    out.set(key, [...ucis].sort().join(' '));
  }
  return out;
}

/**
 * Moves due on or before `day` across the awake repertoires, a position shared by same-colour repertoires (same
 * moves) counted once.
 */
export function dueTotal(data: Pick<RepertoireData, 'repertoires' | 'cards'>, day: string): number {
  const seenKeys = new Set<string>();
  for (const rep of data.repertoires) {
    if (rep.restedOn) continue;
    const cards = data.cards[rep.id] ?? {};
    for (const [key, moves] of cardMoves(rep)) if (isCardDue(cards[key], day)) seenKeys.add(`${rep.color}|${key}|${moves}`);
  }
  return seenKeys.size;
}

/** The repertoires with at least one card due on `today`, in the user's order. */
export function dueToday(data: Pick<RepertoireData, 'repertoires' | 'cards'>, today: string): DueRepertoire[] {
  const out: DueRepertoire[] = [];
  for (const rep of data.repertoires) {
    if (rep.restedOn) continue;
    const cards = data.cards[rep.id] ?? {};
    let due = 0;
    for (const key of userCards(rep).keys()) if (isCardDue(cards[key], today)) due++;
    if (due > 0) out.push({ id: rep.id, name: rep.name, color: rep.color, due });
  }
  return out;
}

export type DrillMode = 'due' | 'learn' | 'practice' | 'weak';

/**
 * The next line to drill, or null when there is nothing for the mode.
 * 'due': lines with due cards; the longest overdue first, then the one whose first due move comes earliest in the game,
 *   then the most due cards, then the least practised.
 * 'learn': lines with never-answered cards, the one whose first new move comes earliest first (breadth before depth),
 *   then tree order.
 * 'practice': extra practice off the schedule; lines with a learned position, in tree order.
 * 'weak': lines through a position missed before, the worst miss rate first.
 * `skip` (leaf ids of lines already played this session, last one last) is avoided while another line qualifies;
 * when every line has been played, only the last one is avoided, so "Next line" goes round again.
 */
export function chooseLine(
  rep: Pick<Repertoire, 'tree' | 'color'>,
  cards: Record<string, CardRecord>,
  mode: DrillMode,
  today: string,
  skip?: string | string[],
): string[] | null {
  type Cand = { path: string[]; due: number; oldest: string; first: number; firstFresh: number; reps: number; fresh: number; seen: number; weak: number; i: number };
  const cands: Cand[] = linesOf(rep.tree).map((path, i) => {
    const keys = lineCards(rep.tree, rep.color, path);
    const dueKeys = keys.filter((k) => isCardDue(cards[k], today));
    return {
      path,
      i,
      due: dueKeys.length,
      oldest: dueKeys.map((k) => cards[k].due).sort()[0] ?? '9999-99-99',
      first: keys.findIndex((k) => isCardDue(cards[k], today)),
      firstFresh: keys.findIndex((k) => !seen(cards[k])),
      reps: keys.reduce((s, k) => s + (cards[k]?.reps ?? 0), 0),
      fresh: keys.filter((k) => !seen(cards[k])).length,
      seen: keys.filter((k) => seen(cards[k])).length,
      weak: Math.max(0, ...keys.map((k) => (cards[k]?.fails ? cards[k].fails / cards[k].reps : 0))),
    };
  });
  let pool = cands.filter((c) =>
    mode === 'due' ? c.due > 0 : mode === 'learn' ? c.fresh > 0 : mode === 'practice' ? c.seen > 0 : c.weak > 0,
  );
  const skipped = skip === undefined ? [] : Array.isArray(skip) ? skip : [skip];
  const leaf = (c: Cand) => c.path[c.path.length - 1];
  if (pool.length > 1 && skipped.length) {
    const unplayed = pool.filter((c) => !skipped.includes(leaf(c)));
    pool = unplayed.length ? unplayed : pool.filter((c) => leaf(c) !== skipped[skipped.length - 1]);
  }
  if (!pool.length) return null;
  if (mode === 'due') pool.sort((a, b) => a.oldest.localeCompare(b.oldest) || a.first - b.first || b.due - a.due || a.reps - b.reps || a.i - b.i);
  // Breadth before depth: the line whose first new move comes earliest (the first moves of every main line first).
  if (mode === 'learn') pool.sort((a, b) => a.firstFresh - b.firstFresh || a.i - b.i);
  if (mode === 'weak') pool.sort((a, b) => b.weak - a.weak || a.i - b.i);
  return pool[0].path;
}

export type AnswerOptions = {
  intervals?: number[];
  /** Ladder steps a miss costs. */
  missDrop?: number;
  /** Spread (±share of the interval, whole days) for intervals of `spreadFrom` days or more; 0 ⇒ none. */
  spread?: number;
  spreadFrom?: number;
  /** Seeds the spread (the card's key), so every device picks the same day. */
  seed?: string;
};

/** A small whole-number hash (FNV-1a) of `s`. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** `days`, moved by up to ±spread·days (rounded), the same for the same seed and day. Short intervals stay as they are. */
export function spreadDays(days: number, seed: string, today: string, spread: number, from: number): number {
  const j = Math.round(days * spread);
  if (days < from || j <= 0) return days;
  return days + (hash(`${seed}|${today}`) % (2 * j + 1)) - j;
}

/** The day a card was last answered: stored, or worked back from its due date (older records). */
export function lastReviewed(c: CardRecord, intervals: number[] = OPENING_TRAINER.intervals): string {
  if (c.last) return c.last;
  const gap = c.stage === 0 ? (intervals[0] ?? 1) : (intervals[c.stage - 1] ?? intervals[intervals.length - 1] ?? 1);
  return addDays(c.due, -gap);
}

/**
 * The card's next state after an answer on `today`, on the 1/3/7/21-day ladder (`due` = review day + the new
 * step's interval, spread a little; `last` = today).
 * - Clean: climbs a step, or further when it was remembered after a longer gap than planned (credit for late
 *   recall: the new step is at least the longest interval he has now survived).
 * - Miss: drops `missDrop` steps and returns at that step's interval.
 * An opening card never retires: past the last interval it keeps coming back at that interval.
 */
export function answerCard(prev: CardRecord | undefined, clean: boolean, today: string, opts: AnswerOptions = {}): CardRecord {
  const intervals = opts.intervals ?? OPENING_TRAINER.intervals;
  const missDrop = opts.missDrop ?? OPENING_TRAINER.missDrop;
  const spread = opts.spread ?? OPENING_TRAINER.spread;
  const from = opts.spreadFrom ?? OPENING_TRAINER.spreadFrom;
  const top = intervals.length;
  const reps = (prev?.reps ?? 0) + 1;
  const fails = (prev?.fails ?? 0) + (clean ? 0 : 1);
  let stage: number;
  if (!clean) {
    stage = Math.max(0, Math.min(prev?.stage ?? 0, top) - Math.max(1, missDrop));
  } else {
    stage = Math.min(top, (prev?.stage ?? 0) + 1);
    if (prev && prev.reps > 0) {
      const elapsed = daysBetween(lastReviewed(prev, intervals), today);
      for (let s2 = top; s2 > stage; s2--) {
        if (intervals[s2 - 1] <= elapsed) {
          stage = s2;
          break;
        }
      }
    }
  }
  const gap = stage === 0 ? (intervals[0] ?? 1) : intervals[stage - 1];
  const days = spreadDays(gap, opts.seed ?? '', today, spread, from);
  return { stage, due: addDays(today, days), retired: false, reps, fails, last: today };
}

/**
 * Whether an answer should change the schedule: only for a card that is due (or never answered). A miss on a card
 * that wasn't due (a due line passes through it) doesn't count against it, and nor does a clean answer.
 */
export function shouldRecord(prev: CardRecord | undefined, today: string): boolean {
  return !seen(prev) || isDue(prev, today);
}

/** Cards after resting from `restedOn` to `today`: every answered card's due date moves on by the days rested. */
export function resumeCards(cards: Record<string, CardRecord>, restedOn: string, today: string): Record<string, CardRecord> {
  const days = Math.max(0, daysBetween(restedOn, today));
  if (!days) return cards;
  return Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, seen(c) ? { ...c, due: addDays(c.due, days) } : c]));
}

/**
 * Another repertoire of `color` (not `exceptId`) that plays `uci` from the position `fen`: the user remembered a
 * move, just from the other opening. Null when none does.
 */
export function otherRepertoireWith(
  reps: Repertoire[],
  exceptId: string,
  color: Color,
  fen: string,
  uci: string,
): Repertoire | null {
  const epd = toEpd(fen);
  for (const r of reps) {
    if (r.id === exceptId || r.color !== color) continue;
    for (const n of Object.values(r.tree.nodes)) {
      if (toEpd(n.fen) !== epd) continue;
      if (n.children.some((c) => r.tree.nodes[c].uci === uci)) return r;
    }
  }
  return null;
}

/** Two awake same-colour repertoires that answer one position differently (the first such position in `a`). */
export type RepertoireConflict = {
  a: Repertoire;
  b: Repertoire;
  /** EPD of the position. */
  key: string;
  /** A node of `a` at that position (for its move list). */
  nodeId: string;
  aMoves: string[];
  bMoves: string[];
};

/** Conflicting pairs among the awake repertoires: same colour, a shared position, different moves from it. */
export function repertoireConflicts(reps: Repertoire[]): RepertoireConflict[] {
  const awake = reps.filter((r) => !r.restedOn);
  const out: RepertoireConflict[] = [];
  for (let i = 0; i < awake.length; i++) {
    for (let j = i + 1; j < awake.length; j++) {
      const a = awake[i];
      const b = awake[j];
      if (a.color !== b.color) continue;
      const bm = cardMoves(b);
      const ac = userCards(a);
      for (const [key, moves] of cardMoves(a)) {
        const other = bm.get(key);
        if (other === undefined || other === moves) continue;
        const nodeId = ac.get(key)![0];
        const fen = a.tree.nodes[nodeId].fen;
        const sans = (ucis: string) => ucis.split(' ').map((u) => sanOf(fen, u) ?? u);
        out.push({ a, b, key, nodeId, aMoves: sans(moves), bMoves: sans(other) });
        break;
      }
    }
  }
  return out;
}

/** The positions of `rep` where another awake same-colour repertoire plays something else. */
export function conflictKeys(rep: Repertoire, reps: Repertoire[]): Set<string> {
  const out = new Set<string>();
  const mine = cardMoves(rep);
  for (const r of reps) {
    if (r.id === rep.id || r.restedOn || r.color !== rep.color) continue;
    for (const [key, moves] of cardMoves(r)) if (mine.has(key) && mine.get(key) !== moves) out.add(key);
  }
  return out;
}

/**
 * `path` cut so that it teaches at most `n` never-answered moves: it ends just after the user's n-th new move
 * (the rest of a long line is learned another day). Unchanged when it has n or fewer.
 */
export function trimToNew(rep: Pick<Repertoire, 'tree' | 'color'>, cards: Record<string, CardRecord>, path: string[], n: number): string[] {
  let fresh = 0;
  const asked = new Set<string>();
  for (let i = 0; i + 1 < path.length; i++) {
    const fen = rep.tree.nodes[path[i]].fen;
    if (sideToMove(fen) !== rep.color) continue;
    const key = toEpd(fen);
    if (asked.has(key) || seen(cards[key])) continue;
    asked.add(key);
    if (++fresh === n) return path.slice(0, i + 2);
  }
  return path;
}

/** New moves still to learn today: none while more than `maxBacklogDays` of reviews wait, or after today's line. */
export function newMovesLeft(
  movesDone: number,
  linesDone: number,
  waiting: number,
  t: Pick<typeof OPENING_TRAINER, 'newMovesPerDay' | 'newLinesPerDay' | 'maxBacklogDays' | 'dailyReviews'> = OPENING_TRAINER,
): number {
  if (waiting > t.maxBacklogDays * t.dailyReviews || linesDone >= t.newLinesPerDay) return 0;
  return Math.max(0, t.newMovesPerDay - movesDone);
}

/** The line's idea: its first plan comment (PGN comment without [%...] commands) along `path`; '' when none. */
export function lineIdea(tree: VariationTree, path: string[]): string {
  for (const id of path) {
    const text = splitComment(tree.nodes[id]?.comment).text.trim();
    if (text) return text;
  }
  return '';
}

/** How much the awake repertoires ask of the user: own moves per colour (shared positions once) and long lines. */
export type RepertoireSize = { white: number; black: number; total: number; longLines: number };

export function repertoireSize(reps: Repertoire[], maxDepth: number = OPENING_TRAINER.suggestedDepth): RepertoireSize {
  const keys = { w: new Set<string>(), b: new Set<string>() };
  let longLines = 0;
  for (const r of reps) {
    if (r.restedOn) continue;
    for (const [key, moves] of cardMoves(r)) keys[r.color].add(`${key}|${moves}`);
    for (const path of linesOf(r.tree)) if (lineCards(r.tree, r.color, path).length > maxDepth) longLines++;
  }
  return { white: keys.w.size, black: keys.b.size, total: keys.w.size + keys.b.size, longLines };
}

/** A coach's one or two sentences about the size, or null when it's comfortable. Advice only: nothing is enforced. */
export function sizeAdvice(size: RepertoireSize, t: Pick<typeof OPENING_TRAINER, 'suggestedMoves' | 'suggestedDepth'> = OPENING_TRAINER): string | null {
  const parts: string[] = [];
  if (size.total > t.suggestedMoves)
    parts.push(
      `You're carrying ${size.total} of your own moves. For now about ${t.suggestedMoves - 15}-${t.suggestedMoves} is plenty: one White ` +
        'opening, one answer to 1.e4 and a short setup against 1.d4. Resting the rest keeps each day small, and nothing is lost.',
    );
  if (size.longLines > 0)
    parts.push(
      `${size.longLines} ${size.longLines === 1 ? 'line goes' : 'lines go'} past your ${t.suggestedDepth}th move. At this stage the ` +
        'first moves and their ideas matter most; the deep ones can wait.',
    );
  return parts.length ? parts.join(' ') : null;
}

/** Review moves still to ask today, given how many were answered (`done`) on `today`. */
export function reviewsLeft(done: number, cap: number = OPENING_TRAINER.dailyReviews): number {
  return Math.max(0, cap - done);
}

/** About how many days of the daily cap the moves due now take (shown instead of the backlog itself). */
export function catchUpDays(due: number, cap: number = OPENING_TRAINER.dailyReviews): number {
  return due <= 0 ? 0 : Math.ceil(due / Math.max(1, cap));
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
