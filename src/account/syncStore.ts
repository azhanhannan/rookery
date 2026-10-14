import { create } from 'zustand';
import type { RatingChange } from '../api/types';

/** What the server said about one uploaded game. */
export type GameSyncResult = {
  status: 'saving' | 'saved' | 'failed';
  /** Present once the upload that applied the rating has answered. */
  rating?: RatingChange;
  /** Asked for rated but not rated: the server's reason. */
  unratedReason?: string;
};

type SyncState = {
  /** Keyed by GameRecord.id. Only games uploaded in this session appear here. */
  byId: Record<string, GameSyncResult>;
  update(id: string, patch: Partial<GameSyncResult>): void;
};

export const useSyncStore = create<SyncState>((set) => ({
  byId: {},
  update(id, patch) {
    set((s) => ({ byId: { ...s.byId, [id]: { ...(s.byId[id] ?? { status: 'saving' }), ...patch } } }));
  },
}));

/** "Blitz rating 1500 → 1478 (−22)", with "?" after a provisional rating. */
export function describeRatingChange(change: RatingChange): string {
  const name = change.category.charAt(0).toUpperCase() + change.category.slice(1);
  const delta = change.delta > 0 ? `+${change.delta}` : change.delta < 0 ? `−${-change.delta}` : '±0';
  return `${name} rating ${change.before} → ${change.after}${change.provisional ? '?' : ''} (${delta})`;
}
