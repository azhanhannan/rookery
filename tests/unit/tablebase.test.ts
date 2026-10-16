import { afterEach, describe, expect, it } from 'vitest';
import {
  categoryOutcome,
  clearTablebaseCache,
  outcomeFor,
  parseTablebase,
  pieceCount,
  probeTablebase,
  tablebaseCovers,
  tablebaseLine,
  verdictWords,
} from '../../src/engine/tablebase';
import { TB_KPK_WIN, TB_PHILIDOR } from '../fixtures/tablebase';

const KPK = '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1';
const PHILIDOR = '4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1';

afterEach(() => clearTablebaseCache());

describe('tablebase response parsing', () => {
  it('reads a win: outcome, distances and each move from the mover\'s side', () => {
    const r = parseTablebase(TB_KPK_WIN, KPK)!;
    expect(r).toMatchObject({ outcome: 'win', category: 'win', dtz: 3, dtm: 21, checkmate: false });
    expect(r.moves.map((m) => [m.san, m.outcome])).toEqual([
      ['Kd6', 'win'],
      ['Kf6', 'win'],
      ['Kd5', 'draw'],
      ['Kf5', 'draw'],
    ]);
    expect(r.moves[0]).toMatchObject({ uci: 'e6d6', dtz: -2, dtm: -20 });
    expect(verdictWords(r)).toBe('White wins');
    expect(tablebaseLine(r)).toBe('Tablebase: White wins (DTZ 3, DTM 21)');
    expect(outcomeFor(r, 'w')).toBe('win');
    expect(outcomeFor(r, 'b')).toBe('loss');
  });

  it('reads a draw with Black to move, and flags the blunders', () => {
    const r = parseTablebase(TB_PHILIDOR, PHILIDOR)!;
    expect(r.outcome).toBe('draw');
    expect(r.dtz).toBeNull();
    expect(tablebaseLine(r)).toBe('Tablebase: Draw');
    const byMove = Object.fromEntries(r.moves.map((m) => [m.san, m.outcome]));
    expect(byMove).toEqual({ Rb1: 'draw', 'Rb5+': 'draw', Kd8: 'draw', Re6: 'loss', 'Rd6+': 'loss' });
  });

  it('Black winning reads as "Black wins"', () => {
    const r = parseTablebase({ ...TB_KPK_WIN, moves: [] }, '4k3/8/4K3/4P3/8/8/8/8 b - - 0 1')!;
    expect(verdictWords(r)).toBe('Black wins');
  });

  it('maps every Lichess category, the 50-move ones to draws', () => {
    expect(['win', 'syzygy-win', 'maybe-win'].map(categoryOutcome)).toEqual(['win', 'win', 'win']);
    expect(['loss', 'syzygy-loss', 'maybe-loss'].map(categoryOutcome)).toEqual(['loss', 'loss', 'loss']);
    expect(['draw', 'cursed-win', 'blessed-loss'].map(categoryOutcome)).toEqual(['draw', 'draw', 'draw']);
    expect(categoryOutcome('unknown')).toBeNull();
    expect(categoryOutcome(undefined)).toBeNull();
  });

  it('rejects answers it can\'t use', () => {
    expect(parseTablebase(null, KPK)).toBeNull();
    expect(parseTablebase('nope', KPK)).toBeNull();
    expect(parseTablebase({ category: 'unknown', moves: [] }, KPK)).toBeNull();
    // Malformed moves are skipped, not fatal.
    const r = parseTablebase({ category: 'draw', moves: [null, { san: 'x' }, { uci: 'e2e4', category: 'draw' }] }, KPK)!;
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0].san).toBe('e2e4');
  });
});

describe('tablebase coverage', () => {
  it('counts pieces and covers up to 7 without castling rights', () => {
    expect(pieceCount(KPK)).toBe(3);
    expect(pieceCount('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(32);
    expect(tablebaseCovers(KPK)).toBe(true);
    expect(tablebaseCovers('r3k3/pppp4/8/8/8/8/8/4K3 b q - 0 1')).toBe(false);
    expect(tablebaseCovers('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false);
    expect(tablebaseCovers('8/pppp4/8/2k5/8/8/8/4K3 w - - 0 1')).toBe(true);
    expect(tablebaseCovers('8/pppppp2/8/2k5/8/8/8/4K3 w - - 0 1')).toBe(false);
  });
});

function fakeFetch(body: unknown, opts: { status?: number; fail?: boolean } = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    if (opts.fail) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(body), { status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('probeTablebase', () => {
  it('asks once per position and answers repeats from the cache', async () => {
    const f = fakeFetch(TB_KPK_WIN);
    const a = await probeTablebase(KPK, { fetchImpl: f.impl });
    const b = await probeTablebase(KPK, { fetchImpl: f.impl });
    expect(a?.outcome).toBe('win');
    expect(b).toEqual(a);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toBe(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(KPK)}`);
  });

  it('skips positions with more than 7 pieces without asking', async () => {
    const f = fakeFetch(TB_KPK_WIN);
    expect(await probeTablebase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { fetchImpl: f.impl })).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it('fails silently: network error, HTTP error, timeout; failures are not cached', async () => {
    expect(await probeTablebase(KPK, { fetchImpl: fakeFetch(null, { fail: true }).impl })).toBeNull();
    expect(await probeTablebase(KPK, { fetchImpl: fakeFetch(TB_KPK_WIN, { status: 429 }).impl })).toBeNull();
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    expect(await probeTablebase(KPK, { fetchImpl: hang, timeoutMs: 10 })).toBeNull();
    const ok = fakeFetch(TB_KPK_WIN);
    expect((await probeTablebase(KPK, { fetchImpl: ok.impl }))?.outcome).toBe('win');
    expect(ok.calls).toHaveLength(1);
  });

  it('a caller that aborts gets null at once', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await probeTablebase(KPK, { fetchImpl: fakeFetch(TB_KPK_WIN).impl, signal: ctrl.signal })).toBeNull();
  });
});
