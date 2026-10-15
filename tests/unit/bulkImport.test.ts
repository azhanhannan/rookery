import { beforeEach, describe, expect, it } from 'vitest';
import { importGames } from '../../src/app/bulkImport';
import { splitPgn } from '../../src/game/pgnSplit';
import { HISTORY_LIMIT } from '../../src/game/storage';
import type { GameRecord } from '../../src/game/types';

const history = (): GameRecord[] => JSON.parse(localStorage.getItem('rookery.games') ?? '[]');

function pgn(white: string, black: string, date: string, moves: string, result: string): string {
  return `[White "${white}"]\n[Black "${black}"]\n[Date "${date}"]\n[Result "${result}"]\n\n${moves} ${result}`;
}

const MATE = '1. f3 e5 2. g4 Qh4#';
const SCHOLAR = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#';

describe('importGames', () => {
  beforeEach(() => localStorage.clear());

  it('saves finished games newest first, skips duplicates and lists failures', async () => {
    const texts = splitPgn(
      [
        pgn('Ana', 'Ben', '2026.10.01', MATE, '0-1'),
        pgn('Cy', 'Ana', '2026.10.03', SCHOLAR, '1-0'),
        pgn('Ana', 'Ben', '2026.10.01', MATE, '0-1'), // duplicate within the batch
        pgn('Ana', 'Dee', '2026.10.02', '1. e4 e5', '*'), // unfinished
        '[White "Ana"]\n[Black "Eve"]\n\n1. e4 e5 2. Ke3 1-0', // illegal
      ].join('\n\n'),
    );
    const progress: number[] = [];
    const s = await importGames(texts, { onProgress: (p) => progress.push(p.done) });
    expect(s.imported).toBe(2);
    expect(s.duplicates).toBe(1);
    expect(s.failed.map((f) => f.reason)).toEqual(['Not finished', expect.stringContaining("Couldn't read")]);
    expect(progress.at(-1)).toBe(5);
    // "Ana" is in every game that parsed, so her side is taken as the player's.
    expect(s.player).toBe('Ana');
    const saved = history();
    expect(saved.map((g) => g.createdAt.slice(0, 10))).toEqual(['2026-10-03', '2026-10-01']);
    expect(saved.map((g) => g.userColor)).toEqual(['b', 'w']);
    expect(s.importedIds).toEqual(saved.map((g) => g.id));

    // The same file again: all duplicates of what is now saved.
    const again = await importGames(texts);
    expect(again).toMatchObject({ imported: 0, duplicates: 3 });
    expect(history()).toHaveLength(2);
  });

  it('uses the given player name for the side', async () => {
    const texts = [pgn('Ana', 'Ben', '2026.10.01', MATE, '0-1'), pgn('Ben', 'Ana', '2026.10.02', MATE, '0-1')];
    const s = await importGames(texts, { player: 'ben' });
    expect(s.player).toBe('ben');
    expect(history().map((g) => g.userColor)).toEqual(['w', 'b']);
  });

  it('never pushes saved games off the device: what does not fit fails', async () => {
    const old = Array.from({ length: HISTORY_LIMIT - 1 }, (_, i) => ({ id: `old${i}`, white: { name: 'x' }, black: { name: 'y' }, result: '1-0', createdAt: '2020-01-01T00:00:00Z', startFen: 'x', moves: [] }));
    localStorage.setItem('rookery.games', JSON.stringify(old));
    const texts = [pgn('Ana', 'Ben', '2026.10.01', MATE, '0-1'), pgn('Ana', 'Ben', '2026.10.02', SCHOLAR, '1-0')];
    const s = await importGames(texts);
    expect(s.imported).toBe(1);
    expect(s.failed[0].reason).toContain(`at most ${HISTORY_LIMIT}`);
    expect(history()).toHaveLength(HISTORY_LIMIT);
    expect(history()[0].createdAt.slice(0, 10)).toBe('2026-10-02'); // the newest one was kept
  });

  it('saves nothing when cancelled', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(importGames([pgn('Ana', 'Ben', '2026.10.01', MATE, '0-1')], { signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(history()).toHaveLength(0);
  });
});
