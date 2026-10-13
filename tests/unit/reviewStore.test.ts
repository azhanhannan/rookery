import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_RECORD, SAMPLE_REVIEW } from '../fixtures/sample-review';

async function freshStore() {
  vi.resetModules();
  return (await import('../../src/game/gameStore')).useGameStore;
}

const history = () => JSON.parse(localStorage.getItem('rookery.games') ?? '[]');

function saveCurrent(record: typeof SAMPLE_RECORD) {
  localStorage.setItem(
    'rookery.current',
    JSON.stringify({ record, clock: null, orientation: 'white', setup: { side: 'w', timeControlId: 'unlimited' } }),
  );
}

describe('setReview', () => {
  beforeEach(() => localStorage.clear());

  it('stores the review on the current game; session and archive survive a reload', async () => {
    saveCurrent(SAMPLE_RECORD);
    let store = await freshStore();
    const saved = store.getState().setReview(SAMPLE_RECORD.id, SAMPLE_REVIEW);
    expect(saved?.review).toEqual(SAMPLE_REVIEW);
    expect(store.getState().record.review).toEqual(SAMPLE_REVIEW);

    store = await freshStore(); // reload
    expect(store.getState().record.review).toEqual(SAMPLE_REVIEW);
    expect(history()[0]).toMatchObject({ id: SAMPLE_RECORD.id, review: SAMPLE_REVIEW });
  });

  it('stores the review on a saved game in place, without touching the current game or the order', async () => {
    const older = { ...SAMPLE_RECORD, id: 'older' };
    const newer = { ...SAMPLE_RECORD, id: 'newer' };
    localStorage.setItem('rookery.games', JSON.stringify([newer, older]));
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited' });

    expect(store.getState().setReview('older', SAMPLE_REVIEW)?.review).toEqual(SAMPLE_REVIEW);
    expect(history().map((g: { id: string }) => g.id)).toEqual(['newer', 'older']);
    expect(history()[1].review).toEqual(SAMPLE_REVIEW);
    expect(store.getState().record.review).toBeUndefined();
    expect(store.getState().setReview('missing', SAMPLE_REVIEW)).toBeNull();
  });

  it('refuses a review for a game still in progress', async () => {
    const store = await freshStore();
    store.getState().newGame({ side: 'w', timeControlId: 'unlimited' });
    expect(store.getState().setReview(store.getState().record.id, SAMPLE_REVIEW)).toBeNull();
    expect(history()).toEqual([]);
  });
});
