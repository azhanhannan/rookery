// The Analysis board's state: one variation tree and the selected node. Kept in localStorage so a refresh (or a
// trip to another page) doesn't lose the analysis. The Review screen hands a game over through `openInAnalysis`.
import { create } from 'zustand';
import type { Orientation } from '../game/gameStore';
import { START_FEN, type MoveInput } from '../game/rules';
import type { GameRecord } from '../game/types';
import {
  addMove,
  createTree,
  deleteFrom,
  getNode,
  lineEnd,
  makeMainline,
  mainline,
  promoteVariation,
  setComment,
  toggleNag,
  treeFromLine,
  type VariationTree,
} from '../game/variationTree';

const KEY = 'rookery.analysis';

type Saved = { tree: VariationTree; selected: string; orientation: Orientation };

export type AnalysisState = Saved & {
  /** Plays a move from the selected node (existing move: just goes there; new one: a new line). */
  play(input: MoveInput): boolean;
  select(id: string): void;
  /** ←/→ */
  back(): void;
  forward(): void;
  /** ↑/↓: the start, and the end of the line the selected move is on. */
  toStart(): void;
  toEnd(): void;
  promote(id: string): void;
  makeMain(id: string): void;
  remove(id: string): void;
  comment(id: string, text: string): void;
  nag(id: string, nag: number): void;
  /** Replaces the whole tree (PGN import, position setup). */
  load(tree: VariationTree, selected?: string): void;
  flip(): void;
};

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!s?.tree?.nodes?.[s.tree.rootId] || !s.tree.nodes[s.selected]) return null;
    return { tree: s.tree, selected: s.selected, orientation: s.orientation === 'black' ? 'black' : 'white' };
  } catch {
    return null;
  }
}

function write(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tree: s.tree, selected: s.selected, orientation: s.orientation }));
  } catch {
    // ignore: the analysis just won't survive a reload
  }
}

function fresh(): Saved {
  const tree = createTree(START_FEN);
  return { tree, selected: tree.rootId, orientation: 'white' };
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  ...(read() ?? fresh()),

  play(input) {
    const { tree, selected } = get();
    const r = addMove(tree, selected, input);
    if (!r) return false;
    set({ tree: r.tree, selected: r.id });
    return true;
  },
  select(id) {
    if (get().tree.nodes[id]) set({ selected: id });
  },
  back() {
    const n = getNode(get().tree, get().selected);
    if (n.parentId) set({ selected: n.parentId });
  },
  forward() {
    const n = getNode(get().tree, get().selected);
    if (n.children.length) set({ selected: n.children[0] });
  },
  toStart() {
    set({ selected: get().tree.rootId });
  },
  toEnd() {
    set({ selected: lineEnd(get().tree, get().selected) });
  },
  promote(id) {
    set({ tree: promoteVariation(get().tree, id) });
  },
  makeMain(id) {
    set({ tree: makeMainline(get().tree, id) });
  },
  remove(id) {
    const { tree, selected } = get();
    const r = deleteFrom(tree, id);
    // Keep the selection when it survived the deletion.
    set({ tree: r.tree, selected: r.tree.nodes[selected] ? selected : r.selected });
  },
  comment(id, text) {
    set({ tree: setComment(get().tree, id, text) });
  },
  nag(id, n) {
    set({ tree: toggleNag(get().tree, id, n) });
  },
  load(tree, selected) {
    set({ tree, selected: selected && tree.nodes[selected] ? selected : tree.rootId });
  },
  flip() {
    set({ orientation: get().orientation === 'white' ? 'black' : 'white' });
  },
}));

useAnalysisStore.subscribe((s) => write(s));

function gameHeaders(record: GameRecord): [string, string][] {
  const h: [string, string][] = [
    ['Event', 'Casual game'],
    ['Site', 'Rookery'],
    ['Date', record.createdAt.slice(0, 10).replaceAll('-', '.')],
    ['Round', '-'],
    ['White', record.white.name],
    ['Black', record.black.name],
    ['Result', record.result],
  ];
  if (record.white.elo !== undefined) h.push(['WhiteElo', String(record.white.elo)]);
  if (record.black.elo !== undefined) h.push(['BlackElo', String(record.black.elo)]);
  return h;
}

/**
 * Opens the Analysis board on a game: its moves become the main line and the board shows the position after
 * `ply` moves. Replaces the board's current analysis.
 */
export function openInAnalysis(record: GameRecord, ply: number): void {
  const tree = treeFromLine(
    record.startFen,
    record.moves.map((m) => m.uci),
    gameHeaders(record),
  );
  const line = mainline(tree);
  const selected = line[Math.max(0, Math.min(line.length - 1, ply))];
  const bot = record.white.isBot ? 'w' : record.black.isBot ? 'b' : null;
  useAnalysisStore.setState({ tree, selected, orientation: bot === 'w' ? 'black' : 'white' });
  location.hash = '#/analysis';
}
