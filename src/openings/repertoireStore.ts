// The user's opening repertoires and their spaced-repetition cards, kept per device in one localStorage key
// (`rookery.repertoires`, a single JSON value with an `updatedAt`, so account sync can carry it as is).
import { create } from 'zustand';
import { OPENING_TRAINER } from '../config/tunables';
import { addDays } from '../puzzles/days';
import { mergeTombstones } from '../sync/merge';
import type { Color } from '../game/types';
import { createTree, type VariationTree } from '../game/variationTree';
import {
  answerCard,
  cardMoves,
  emptyData,
  mergeTrees,
  parseRepertoireData,
  pruneCards,
  resumeCards,
  spreadDays,
  type CardRecord,
  type Repertoire,
  type RepertoireData,
} from './repertoire';

export const REPERTOIRES_KEY = 'rookery.repertoires';
/** Today's opening work ({ day, reviews, newMoves, newLines }), per device: what the daily caps count against. */
export const DAILY_KEY = 'rookery.openings.daily';

export type DailyCount = { day: string; reviews: number; newMoves: number; newLines: number };

function readDaily(): DailyCount {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null') as Partial<DailyCount> | null;
    if (d && typeof d.day === 'string' && typeof d.reviews === 'number')
      return { day: d.day, reviews: d.reviews, newMoves: typeof d.newMoves === 'number' ? d.newMoves : 0, newLines: typeof d.newLines === 'number' ? d.newLines : 0 };
  } catch {
    // unreadable: start the day at zero
  }
  return { day: '', reviews: 0, newMoves: 0, newLines: 0 };
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
/** New moves learned and new lines started on `today`. */
export const newMovesDone = (d: DailyCount, today: string) => (d.day === today ? d.newMoves : 0);
export const newLinesDone = (d: DailyCount, today: string) => (d.day === today ? d.newLines : 0);

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
  /** Creates a repertoire (from `tree`, or empty) and returns its id. `libraryId` marks one added from the library. */
  create(name: string, color: Color, tree?: VariationTree, libraryId?: string): string;
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
  /** Counts one graded review answer, one new move learned, or one new line started, on `today`. */
  countReview(today: string): void;
  countNew(today: string): void;
  countNewLine(today: string): void;
  /**
   * A due card answered after a Hint: it holds its step (neither climbs nor counts as a miss) and comes back after
   * that step's interval.
   */
  hold(id: string, key: string, today: string): CardRecord;
  /**
   * A new card answered in Learn's from-memory pass (seconds after being shown): due tomorrow either way, a step
   * up when right, and a miss there is not counted as one (it mostly tests short-term memory).
   */
  learnCard(id: string, key: string, clean: boolean, today: string): CardRecord;
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
  /** Stores a card's new state; the same position with the same moves in another awake repertoire of this colour is the same card. */
  const setCard = (id: string, key: string, card: CardRecord): CardRecord => {
    const { repertoires, cards } = get().data;
    const rep = repertoires.find((r) => r.id === id);
    const next = { ...cards, [id]: { ...(cards[id] ?? {}), [key]: card } };
    const moves = rep ? cardMoves(rep).get(key) : undefined;
    if (rep && moves !== undefined)
      for (const r of repertoires)
        if (r.id !== id && !r.restedOn && r.color === rep.color && cardMoves(r).get(key) === moves) next[r.id] = { ...(cards[r.id] ?? {}), [key]: card };
    commit({ repertoires, cards: next });
    return card;
  };
  const bump = (today: string, field: 'reviews' | 'newMoves' | 'newLines') => {
    const d = get().daily;
    const base: DailyCount = d.day === today ? d : { day: today, reviews: 0, newMoves: 0, newLines: 0 };
    const daily = { ...base, [field]: base[field] + 1 };
    set({ daily });
    writeDaily(daily);
  };
  return {
    data: read(),
    create(name, color, tree, libraryId) {
      const id = crypto.randomUUID();
      const t = now();
      const rep: Repertoire = {
        id,
        name: name.trim() || 'My repertoire',
        color,
        tree: tree ?? createTree(),
        createdAt: t,
        updatedAt: t,
        ...(libraryId ? { libraryId } : {}),
      };
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
      bump(today, 'reviews');
    },
    countNew(today) {
      bump(today, 'newMoves');
    },
    countNewLine(today) {
      bump(today, 'newLines');
    },
    answer(id, key, clean, today) {
      return setCard(id, key, answerCard(get().data.cards[id]?.[key], clean, today, { seed: key }));
    },
    hold(id, key, today) {
      const prev = get().data.cards[id]?.[key];
      const stage = prev?.stage ?? 0;
      const gap = stage === 0 ? (OPENING_TRAINER.intervals[0] ?? 1) : OPENING_TRAINER.intervals[Math.min(stage, OPENING_TRAINER.intervals.length) - 1];
      const due = addDays(today, spreadDays(gap, key, today, OPENING_TRAINER.spread, OPENING_TRAINER.spreadFrom));
      return setCard(id, key, { stage, due, retired: false, reps: (prev?.reps ?? 0) + 1, fails: prev?.fails ?? 0, last: today });
    },
    learnCard(id, key, clean, today) {
      const prev = get().data.cards[id]?.[key];
      const due = addDays(today, OPENING_TRAINER.intervals[0] ?? 1);
      return setCard(id, key, { stage: clean ? 1 : 0, due, retired: false, reps: (prev?.reps ?? 0) + 1, fails: prev?.fails ?? 0, last: today });
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
