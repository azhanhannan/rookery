// The Analysis board's move tree: pure data, immutable updates. A node is a position; its children are the moves
// played from it, children[0] being the main continuation and the rest side lines (variations).
import { Chess } from 'chess.js';
import { START_FEN, tryLegalMove, type MoveInput } from './rules';

export type TreeNode = {
  id: string;
  parentId: string | null;
  /** children[0] continues the line this node is on; children[1..] are variations. */
  children: string[];
  /** Position after this node's move (the start position for the root). */
  fen: string;
  /** Half-moves from the root. */
  ply: number;
  /** Absent on the root. */
  san?: string;
  uci?: string;
  /** Comment after the move (raw PGN text, including [%cal ...] style commands). On the root: the game comment. */
  comment?: string;
  /** Comment before the move (PGN `( {like this} 3. Nf3 )`). */
  preComment?: string;
  /** Numeric annotation glyphs, PGN `$n` (1 = !, 2 = ?, 3 = !!, 4 = ??, 5 = !?, 6 = ?!). */
  nags: number[];
};

export type VariationTree = {
  rootId: string;
  nodes: Record<string, TreeNode>;
  /** PGN tag pairs in their original order. */
  headers: [string, string][];
  /** For the next node id. */
  nextId: number;
};

export const ROOT_ID = 'root';

export function createTree(startFen: string = START_FEN, headers: [string, string][] = []): VariationTree {
  return {
    rootId: ROOT_ID,
    nodes: { [ROOT_ID]: { id: ROOT_ID, parentId: null, children: [], fen: startFen, ply: 0, nags: [] } },
    headers,
    nextId: 1,
  };
}

export function getNode(tree: VariationTree, id: string): TreeNode {
  const n = tree.nodes[id];
  if (!n) throw new Error(`No node ${id}`);
  return n;
}

/**
 * Plays `input` (a SAN string or from/to) from node `parentId`. A move that is already a child is reused (no
 * duplicate line); a new one becomes the main continuation when there was none, otherwise a new variation.
 * Returns null when the move is illegal.
 */
export function addMove(
  tree: VariationTree,
  parentId: string,
  input: MoveInput | string,
): { tree: VariationTree; id: string } | null {
  const parent = getNode(tree, parentId);
  const chess = new Chess(parent.fen);
  const move = typeof input === 'string' ? trySan(chess, input) : tryLegalMove(chess, input);
  if (!move) return null;
  const existing = parent.children.find((c) => tree.nodes[c].uci === move.lan);
  if (existing) return { tree, id: existing };
  const id = `n${tree.nextId}`;
  const node: TreeNode = {
    id,
    parentId,
    children: [],
    fen: move.after,
    ply: parent.ply + 1,
    san: move.san,
    uci: move.lan,
    nags: [],
  };
  return {
    id,
    tree: {
      ...tree,
      nextId: tree.nextId + 1,
      nodes: { ...tree.nodes, [id]: node, [parentId]: { ...parent, children: [...parent.children, id] } },
    },
  };
}

function trySan(chess: Chess, san: string) {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}

/** Builds a tree with one line of UCI moves from `startFen`. Stops at the first illegal move. */
export function treeFromLine(startFen: string, ucis: string[], headers: [string, string][] = []): VariationTree {
  let tree = createTree(startFen, headers);
  let at = tree.rootId;
  for (const uci of ucis) {
    const r = addMove(tree, at, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!r) break;
    tree = r.tree;
    at = r.id;
  }
  return tree;
}

/** Node ids from the root to `id`, both included. */
export function pathTo(tree: VariationTree, id: string): string[] {
  const path: string[] = [];
  for (let n: TreeNode | undefined = tree.nodes[id]; n; n = n.parentId ? tree.nodes[n.parentId] : undefined) {
    path.push(n.id);
  }
  return path.reverse();
}

/** Following children[0] from `fromId` (included) to the end of that line. */
export function lineFrom(tree: VariationTree, fromId: string): string[] {
  const line = [fromId];
  let n = getNode(tree, fromId);
  while (n.children.length) {
    n = tree.nodes[n.children[0]];
    line.push(n.id);
  }
  return line;
}

/** The main line: root, then children[0] all the way. */
export function mainline(tree: VariationTree): string[] {
  return lineFrom(tree, tree.rootId);
}

/** The end of the line `id` is on (following children[0]). */
export function lineEnd(tree: VariationTree, id: string): string {
  const l = lineFrom(tree, id);
  return l[l.length - 1];
}

/** Whether `id` is on the main line. */
export function isMainline(tree: VariationTree, id: string): boolean {
  const path = pathTo(tree, id);
  for (let i = 1; i < path.length; i++) if (tree.nodes[path[i - 1]].children[0] !== path[i]) return false;
  return true;
}

/** UCI moves from the root to `id`. */
export function movesTo(tree: VariationTree, id: string): string[] {
  return pathTo(tree, id)
    .slice(1)
    .map((p) => tree.nodes[p].uci!);
}

/** The siblings of `id` (its parent's children, `id` included), in order; just [id] for the root. */
export function siblings(tree: VariationTree, id: string): string[] {
  const n = getNode(tree, id);
  return n.parentId ? tree.nodes[n.parentId].children : [id];
}

/** The nearest ancestor-or-self that is not its parent's first child, i.e. where its variation branches off. */
function branchOf(tree: VariationTree, id: string): TreeNode | null {
  for (let n = getNode(tree, id); n.parentId; n = tree.nodes[n.parentId]) {
    if (tree.nodes[n.parentId].children[0] !== n.id) return n;
  }
  return null;
}

function moveChildFirst(tree: VariationTree, child: TreeNode): VariationTree {
  const parent = tree.nodes[child.parentId!];
  const children = [child.id, ...parent.children.filter((c) => c !== child.id)];
  return { ...tree, nodes: { ...tree.nodes, [parent.id]: { ...parent, children } } };
}

/** Promotes the variation `id` is in by one level: it swaps with the line it branched from. No-op on the main line. */
export function promoteVariation(tree: VariationTree, id: string): VariationTree {
  const b = branchOf(tree, id);
  return b ? moveChildFirst(tree, b) : tree;
}

/** Promotes the line through `id` all the way, so `id` ends up on the main line. */
export function makeMainline(tree: VariationTree, id: string): VariationTree {
  let t = tree;
  for (let b = branchOf(t, id); b; b = branchOf(t, id)) t = moveChildFirst(t, b);
  return t;
}

/**
 * Deletes `id` and everything after it (the root can't be deleted: it clears the moves instead).
 * Returns the new tree and the node to select (the deleted node's parent).
 */
export function deleteFrom(tree: VariationTree, id: string): { tree: VariationTree; selected: string } {
  const node = getNode(tree, id);
  if (!node.parentId) {
    const root = { ...node, children: [] };
    return { tree: { ...tree, nodes: { [root.id]: root } }, selected: root.id };
  }
  const nodes = { ...tree.nodes };
  const stack = [id];
  while (stack.length) {
    const n = nodes[stack.pop()!];
    delete nodes[n.id];
    stack.push(...n.children);
  }
  const parent = nodes[node.parentId];
  nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== id) };
  return { tree: { ...tree, nodes }, selected: parent.id };
}

/** Replaces a node's comment; an empty or blank one removes it. `}` would end a PGN comment, so it becomes `)`. */
export function setComment(tree: VariationTree, id: string, comment: string): VariationTree {
  const node = getNode(tree, id);
  const clean = comment.replaceAll('}', ')').trim();
  const next: TreeNode = { ...node };
  if (clean) next.comment = clean;
  else delete next.comment;
  return { ...tree, nodes: { ...tree.nodes, [id]: next } };
}

/** Toggles a NAG on a node. Move-quality glyphs ($1-$6) replace each other; others toggle independently. */
export function toggleNag(tree: VariationTree, id: string, nag: number): VariationTree {
  const node = getNode(tree, id);
  const isQuality = (n: number) => n >= 1 && n <= 6;
  let nags = node.nags.includes(nag) ? node.nags.filter((n) => n !== nag) : [...node.nags, nag];
  if (isQuality(nag) && !node.nags.includes(nag)) nags = nags.filter((n) => n === nag || !isQuality(n));
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, nags } } };
}

/** Sets or replaces one PGN header; an empty value removes it. */
export function setHeader(tree: VariationTree, name: string, value: string): VariationTree {
  const rest = tree.headers.filter(([k]) => k !== name);
  if (!value) return { ...tree, headers: rest };
  const i = tree.headers.findIndex(([k]) => k === name);
  const headers: [string, string][] = i < 0 ? [...rest, [name, value]] : tree.headers.map((h) => (h[0] === name ? [name, value] : h));
  return { ...tree, headers };
}

/** Move number and colour of a node's move, e.g. { no: 12, black: true } for "12... Nf6". */
export function moveNumberOf(tree: VariationTree, id: string): { no: number; black: boolean } {
  const n = getNode(tree, id);
  const parentFen = n.parentId ? tree.nodes[n.parentId].fen : n.fen;
  const parts = parentFen.split(' ');
  return { no: Number(parts[5]) || 1, black: parts[1] === 'b' };
}

// ---------- Comment commands ([%cal ...], [%csl ...], [%eval ...], [%clk ...]) ----------

const COMMAND = /\[%(\w+)\s+([^\]]*)\]/g;

/** Splits a raw PGN comment into its plain text and its `[%cmd args]` commands (kept verbatim). */
export function splitComment(raw: string | undefined): { text: string; commands: string[] } {
  if (!raw) return { text: '', commands: [] };
  const commands = [...raw.matchAll(COMMAND)].map((m) => m[0]);
  const text = raw.replace(COMMAND, ' ').replace(/\s+/g, ' ').trim();
  return { text, commands };
}

/** Joins edited text back with the commands it had, so editing a comment never drops arrows or clock times. */
export function joinComment(text: string, commands: string[]): string {
  return [...commands, text.trim()].filter(Boolean).join(' ');
}

const COLORS: Record<string, string> = {
  G: 'rgba(21, 120, 27, 0.8)',
  R: 'rgba(136, 32, 32, 0.8)',
  Y: 'rgba(230, 160, 0, 0.8)',
  B: 'rgba(0, 48, 136, 0.8)',
};

/** Arrows (`[%cal Ge2e4,Rd7d5]`) and highlighted squares (`[%csl Gd4]`) drawn by a comment. */
export function commentShapes(raw: string | undefined): {
  arrows: { from: string; to: string; color: string }[];
  squares: { square: string; color: string }[];
} {
  const arrows: { from: string; to: string; color: string }[] = [];
  const squares: { square: string; color: string }[] = [];
  for (const m of (raw ?? '').matchAll(COMMAND)) {
    for (const item of m[2].split(',').map((s) => s.trim())) {
      const color = COLORS[item[0]] ?? COLORS.G;
      if (m[1] === 'cal' && /^[RGYB][a-h][1-8][a-h][1-8]$/.test(item)) {
        arrows.push({ from: item.slice(1, 3), to: item.slice(3, 5), color });
      } else if (m[1] === 'csl' && /^[RGYB][a-h][1-8]$/.test(item)) {
        squares.push({ square: item.slice(1, 3), color });
      }
    }
  }
  return { arrows, squares };
}
