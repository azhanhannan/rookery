// The user's opening repertoires and their spaced-repetition cards, kept per device in one localStorage key
// (`rookery.repertoires`, a single JSON value with an `updatedAt`, so account sync can carry it as is).
import { create } from 'zustand';
import { mergeTombstones } from '../sync/merge';
import type { Color } from '../game/types';
import { createTree, type VariationTree } from '../game/variationTree';
import {
  answerCard,
  emptyData,
  mergeTrees,
  parseRepertoireData,
  pruneCards,
  type CardRecord,
  type Repertoire,
  type RepertoireData,
} from './repertoire';

export const REPERTOIRES_KEY = 'rookery.repertoires';

function read(): RepertoireData {
  try {
    return parseRepertoireData(localStorage.getItem(REPERTOIRES_KEY));
  } catch {
    return emptyData();
  }
}

function write(data: RepertoireData): void {
  try {
    localStorage.setItem(REPERTOIRES_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable: the change lasts until the page is closed
  }
}

export type RepertoireState = {
  data: RepertoireData;
  /** Creates a repertoire (from `tree`, or empty) and returns its id. */
  create(name: string, color: Color, tree?: VariationTree): string;
  rename(id: string, name: string): void;
  remove(id: string): void;
  /** Replaces a repertoire's tree (an edit, e.g. a deleted line); cards for positions that left are dropped. */
  setTree(id: string, tree: VariationTree): void;
  /** Adds the lines of `tree` to a repertoire. Throws when it starts from another position. */
  addLines(id: string, tree: VariationTree): void;
  /** Records an answer on a card and returns the card's new state. */
  answer(id: string, key: string, clean: boolean, today: string): CardRecord;
  /** Re-reads storage (another tab, or account sync, changed it). */
  reload(): void;
};

const now = () => new Date().toISOString();

export const useRepertoireStore = create<RepertoireState>((set, get) => {
  const commit = (data: Omit<RepertoireData, 'updatedAt' | 'version'>) => {
    // Delete markers ride along with every change (only `remove` adds one).
    const deleted = data.deleted ?? get().data.deleted;
    const next: RepertoireData = { version: 1, updatedAt: now(), ...data, ...(deleted ? { deleted } : {}) };
    set({ data: next });
    write(next);
  };
  const patchRep = (id: string, f: (r: Repertoire) => Repertoire) => {
    const { repertoires, cards } = get().data;
    commit({ repertoires: repertoires.map((r) => (r.id === id ? { ...f(r), updatedAt: now() } : r)), cards });
  };
  const withTree = (id: string, tree: VariationTree) => {
    const { repertoires, cards } = get().data;
    const rep = repertoires.find((r) => r.id === id);
    if (!rep) return;
    const updated = { ...rep, tree, updatedAt: now() };
    commit({
      repertoires: repertoires.map((r) => (r.id === id ? updated : r)),
      cards: { ...cards, [id]: pruneCards(updated, cards[id] ?? {}) },
    });
  };
  return {
    data: read(),
    create(name, color, tree) {
      const id = crypto.randomUUID();
      const t = now();
      const rep: Repertoire = { id, name: name.trim() || 'My repertoire', color, tree: tree ?? createTree(), createdAt: t, updatedAt: t };
      const { repertoires, cards } = get().data;
      commit({ repertoires: [...repertoires, rep], cards });
      return id;
    },
    rename(id, name) {
      if (name.trim()) patchRep(id, (r) => ({ ...r, name: name.trim() }));
    },
    remove(id) {
      const { repertoires, cards } = get().data;
      const rest = { ...cards };
      delete rest[id];
      // A delete marker, so account sync removes it on other devices too instead of bringing it back.
      const deleted = mergeTombstones(get().data.deleted, { [id]: now() }) ?? {};
      commit({ repertoires: repertoires.filter((r) => r.id !== id), cards: rest, deleted });
    },
    setTree(id, tree) {
      withTree(id, tree);
    },
    addLines(id, tree) {
      const rep = get().data.repertoires.find((r) => r.id === id);
      if (rep) withTree(id, mergeTrees(rep.tree, tree));
    },
    answer(id, key, clean, today) {
      const { repertoires, cards } = get().data;
      const book = cards[id] ?? {};
      const card = answerCard(book[key], clean, today);
      commit({ repertoires, cards: { ...cards, [id]: { ...book, [key]: card } } });
      return card;
    },
    reload() {
      set({ data: read() });
    },
  };
});

// Another tab (or the account sync writing the key) changed the repertoires.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === REPERTOIRES_KEY) useRepertoireStore.getState().reload();
  });
}
