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
  resumeCards,
  type CardRecord,
  type Repertoire,
  type RepertoireData,
} from './repertoire';

export const REPERTOIRES_KEY = 'rookery.repertoires';
/** Review moves answered today ({ day, reviews }), per device: what the daily cap counts against. */
export const DAILY_KEY = 'rookery.openings.daily';

export type DailyCount = { day: string; reviews: number };

function readDaily(): DailyCount {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null') as DailyCount | null;
    if (d && typeof d.day === 'string' && typeof d.reviews === 'number') return d;
  } catch {
    // unreadable: start the day at zero
  }
  return { day: '', reviews: 0 };
}

function writeDaily(d: DailyCount): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {
    // the count lasts until the page is closed
  }
}

/** Review moves answered on `today` (0 on a new day). */
export const reviewsDone = (d: DailyCount, today: string) => (d.day === today ? d.reviews : 0);

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
  /** Starts resting a repertoire on `today`: nothing is asked and its cards' clock stops. */
  rest(id: string, today: string): void;
  /** Ends a rest: every answered card's due date moves on by the days rested. */
  resume(id: string, today: string): void;
  /** Review moves answered per day on this device (the daily cap). */
  daily: DailyCount;
  /** Counts one graded review answer on `today`. */
  countReview(today: string): void;
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
    rest(id, today) {
      patchRep(id, (r) => (r.restedOn ? r : { ...r, restedOn: today }));
    },
    resume(id, today) {
      const { repertoires, cards } = get().data;
      const rep = repertoires.find((r) => r.id === id);
      if (!rep?.restedOn) return;
      const { restedOn: since, ...awake } = rep;
      commit({
        repertoires: repertoires.map((r) => (r.id === id ? { ...awake, updatedAt: now() } : r)),
        cards: { ...cards, [id]: resumeCards(cards[id] ?? {}, since, today) },
      });
    },
    daily: readDaily(),
    countReview(today) {
      const daily = { day: today, reviews: reviewsDone(get().daily, today) + 1 };
      set({ daily });
      writeDaily(daily);
    },
    answer(id, key, clean, today) {
      const { repertoires, cards } = get().data;
      const book = cards[id] ?? {};
      const card = answerCard(book[key], clean, today);
      commit({ repertoires, cards: { ...cards, [id]: { ...book, [key]: card } } });
      return card;
    },
    reload() {
      set({ data: read(), daily: readDaily() });
    },
  };
});

// Another tab (or the account sync writing the key) changed the repertoires.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === REPERTOIRES_KEY || e.key === DAILY_KEY) useRepertoireStore.getState().reload();
  });
}
