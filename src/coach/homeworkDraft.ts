// A coach's homework set while it is being put together, per student. Kept in localStorage so a reload
// (or stepping between the student's games to pick positions) doesn't lose it.
import { create } from 'zustand';
import type { HomeworkItem } from '../api/types';
import { COACH } from '../config/tunables';
import { positionKey } from '../puzzles/harvest';

const KEY = 'rookery.coachDraft';

type Drafts = Record<string, HomeworkItem[]>;

function read(): Drafts {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Drafts) : {};
  } catch {
    return {};
  }
}

function write(d: Drafts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // ignore: the draft just won't survive a reload
  }
}

type DraftState = {
  drafts: Drafts;
  /** Adds positions not in the draft yet (same position = same board, side, castling, en passant). Returns how many were added. */
  add: (studentId: string, items: HomeworkItem[]) => number;
  remove: (studentId: string, index: number) => void;
  clear: (studentId: string) => void;
};

export const useHomeworkDraft = create<DraftState>((set, get) => ({
  drafts: read(),
  add(studentId, items) {
    const cur = get().drafts[studentId] ?? [];
    const seen = new Set(cur.map((i) => positionKey(i.fen)));
    const fresh: HomeworkItem[] = [];
    for (const it of items) {
      if (cur.length + fresh.length >= COACH.maxHomeworkItems) break;
      const k = positionKey(it.fen);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(it);
    }
    if (fresh.length) {
      const drafts = { ...get().drafts, [studentId]: [...cur, ...fresh] };
      write(drafts);
      set({ drafts });
    }
    return fresh.length;
  },
  remove(studentId, index) {
    const drafts = { ...get().drafts, [studentId]: (get().drafts[studentId] ?? []).filter((_, i) => i !== index) };
    write(drafts);
    set({ drafts });
  },
  clear(studentId) {
    const drafts = { ...get().drafts };
    delete drafts[studentId];
    write(drafts);
    set({ drafts });
  },
}));
