import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPLORER } from '../../src/config/tunables';
import {
  cachedExplorer,
  clearExplorerCache,
  defaultFilters,
  explorerCacheSize,
  explorerKey,
  explorerUrl,
  fetchExplorer,
  formatGames,
  gameUrl,
  isRareMove,
  moveShare,
  parseExplorer,
  splitPercents,
  type ExplorerFilters,
} from '../../src/explorer/explorer';
import { loadLichessToken, saveLichessToken, TOKEN_KEY } from '../../src/explorer/lichessToken';
import { loadExplorerPrefs, saveExplorerPrefs } from '../../src/explorer/useExplorer';
import { SYNC_KEYS } from '../../src/sync/keys';
import { EX_LICHESS, EX_MASTERS } from '../fixtures/explorer';

const SLAV = 'rnbqkbnr/pp2pppp/2p5/3P4/3P4/8/PP2PPPP/RNBQKBNR b KQkq - 0 3';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const NONE: ExplorerFilters = { ratings: [], speeds: [] };

function respond(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => clearExplorerCache());

describe('explorer response parsing', () => {
  it('reads moves, totals, opening and top games from a masters answer', () => {
    const r = parseExplorer(EX_MASTERS, SLAV, 'masters')!;
    expect(r).toMatchObject({ source: 'masters', white: 1927, draws: 5215, black: 1469, total: 8611 });
    expect(r.opening).toEqual({ eco: 'D10', name: 'Slav Defense: Exchange Variation' });
    expect(r.moves.map((m) => [m.san, m.total, m.averageRating])).toEqual([
      ['cxd5', 8610, 2412],
      ['Nf6', 1, 2515],
    ]);
    expect(r.moves[0].game).toBeNull();
    expect(r.moves[1].game).toMatchObject({ id: '1EErB5jc', winner: 'black', year: 2006 });
    expect(r.topGames).toHaveLength(2);
    expect(r.topGames[0]).toMatchObject({
      id: 'kN6d9l2i',
      uci: 'c6d5',
      winner: 'black',
      white: { name: 'Carlsen, M.', rating: 2881 },
      black: { name: 'Anand, V.', rating: 2785 },
    });
    expect(r.topGames[1].winner).toBeNull();
  });

  it('reads a Lichess-games answer with no opening name', () => {
    const r = parseExplorer(EX_LICHESS, START, 'lichess')!;
    expect(r.opening).toBeNull();
    expect(r.total).toBe(2000);
    expect(r.moves.map((m) => m.uci)).toEqual(['e2e4', 'd2d4']);
    expect(r.topGames).toEqual([]);
  });

  it('skips broken moves and games, and rejects answers it cannot use', () => {
    const r = parseExplorer(
      {
        moves: [{ uci: 'zz', san: '?' }, { uci: 'e7e8q', white: -3, draws: 'x', black: 2, averageRating: 0 }, null],
        topGames: [{ id: 'short' }, { id: 'abcdefgh', white: {}, black: { name: 'B' } }],
      },
      START,
      'masters',
    )!;
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0]).toMatchObject({ uci: 'e7e8q', san: 'e7e8q', white: 0, draws: 0, black: 2, total: 2, averageRating: null });
    expect(r.topGames).toEqual([{ id: 'abcdefgh', uci: null, winner: null, white: { name: '?', rating: null }, black: { name: 'B', rating: null }, year: null }]);
    expect(parseExplorer(null, START, 'masters')).toBeNull();
    expect(parseExplorer('<html>401</html>', START, 'masters')).toBeNull();
    expect(parseExplorer({ white: 1 }, START, 'masters')).toBeNull();
  });
});

describe('explorer helpers', () => {
  it('percentages add up to 100', () => {
    expect(splitPercents({ white: 1, draws: 1, black: 1 })).toEqual({ white: 33, draws: 34, black: 33 });
    expect(splitPercents({ white: 0, draws: 0, black: 0 })).toEqual({ white: 0, draws: 0, black: 0 });
    expect(splitPercents({ white: 1927, draws: 5215, black: 1469 })).toEqual({ white: 22, draws: 61, black: 17 });
  });

  it('formats game counts', () => {
    expect(formatGames(1234)).toBe('1,234');
    expect(formatGames(56_789)).toBe('56,789');
    expect(formatGames(456_789)).toBe('457k');
    expect(formatGames(1_234_567)).toBe('1.2M');
    expect(formatGames(23_456_789)).toBe('23M');
  });

  it('links games to lichess.org', () => {
    expect(gameUrl('kN6d9l2i')).toBe('https://lichess.org/kN6d9l2i');
  });

  it('marks a move rare in master play only with enough games', () => {
    const r = parseExplorer(EX_MASTERS, SLAV, 'masters')!;
    expect(moveShare(r, 'c6d5')).toBeCloseTo(8610 / 8611);
    expect(moveShare(r, 'a7a6')).toBe(0);
    expect(isRareMove(r, 'g8f6')).toBe(true);
    expect(isRareMove(r, 'a7a6')).toBe(true);
    expect(isRareMove(r, 'c6d5')).toBe(false);
    const few = parseExplorer({ ...EX_MASTERS, moves: [{ uci: 'c6d5', white: 10, draws: 0, black: 0 }, { uci: 'g8f6', white: 0, draws: 0, black: 0 }] }, SLAV, 'masters')!;
    expect(isRareMove(few, 'g8f6')).toBe(false); // under EXPLORER.rareMinGames: no verdict
  });

  it('keys ignore move counters and filter order, and masters ignores filters', () => {
    const a = explorerKey(START, 'lichess', { ratings: [2000, 1600], speeds: ['rapid', 'blitz'] });
    const b = explorerKey(START.replace(' 0 1', ' 4 9'), 'lichess', { ratings: [1600, 2000], speeds: ['blitz', 'rapid'] });
    expect(a).toBe(b);
    expect(explorerKey(START, 'lichess', NONE)).not.toBe(a);
    expect(explorerKey(START, 'masters', NONE)).toBe(explorerKey(START, 'masters', defaultFilters()));
    expect(explorerKey(START, 'masters', NONE)).not.toBe(explorerKey(START, 'lichess', NONE));
  });

  it('builds the request URLs', () => {
    const m = new URL(explorerUrl(START, 'masters', defaultFilters()));
    expect(m.origin + m.pathname).toBe(`${EXPLORER.url}/masters`);
    expect(m.searchParams.get('fen')).toBe(START);
    expect(m.searchParams.get('topGames')).toBe(String(EXPLORER.topGames));
    expect(m.searchParams.has('ratings')).toBe(false);
    const l = new URL(explorerUrl(START, 'lichess', { ratings: [2200, 1800], speeds: ['classical', 'blitz'] }));
    expect(l.pathname).toBe('/lichess');
    expect(l.searchParams.get('ratings')).toBe('1800,2200');
    expect(l.searchParams.get('speeds')).toBe('blitz,classical');
    expect(l.searchParams.get('topGames')).toBe('0');
  });
});

describe('fetchExplorer (mocked fetch)', () => {
  it('without a token asks nothing and says so', async () => {
    const f = vi.fn();
    expect(await fetchExplorer(START, 'masters', NONE, { token: null, fetchImpl: f })).toEqual({ status: 'no-token' });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the token as a Bearer header, caches the answer and shares one request', async () => {
    const f = vi.fn(async () => respond(200, EX_MASTERS));
    const [a, b] = await Promise.all([
      fetchExplorer(SLAV, 'masters', NONE, { token: 'lip_abc', fetchImpl: f }),
      fetchExplorer(SLAV, 'masters', NONE, { token: 'lip_abc', fetchImpl: f }),
    ]);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/masters?');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lip_abc');
    expect(a.status).toBe('ok');
    expect(b).toEqual(a);
    // Same position with other move counters: from the cache, even with no token now.
    const again = await fetchExplorer(SLAV.replace(' 0 3', ' 2 7'), 'masters', NONE, { token: null, fetchImpl: f });
    expect(again.status).toBe('ok');
    expect(f).toHaveBeenCalledTimes(1);
    expect(cachedExplorer(SLAV, 'masters', NONE)?.total).toBe(8611);
  });

  it('a 401 is a bad token and is not cached', async () => {
    const f = vi.fn(async () => new Response('<html>401 Authorization Required</html>', { status: 401 }));
    expect(await fetchExplorer(START, 'masters', NONE, { token: 'lip_bad', fetchImpl: f })).toEqual({ status: 'bad-token' });
    expect(explorerCacheSize()).toBe(0);
  });

  it('after a 429 backs off for EXPLORER.backoffMs without asking again', async () => {
    let now = 1_000_000;
    const clock = () => now;
    const f = vi.fn(async () => respond(429));
    const first = await fetchExplorer(START, 'masters', NONE, { token: 't', fetchImpl: f, now: clock });
    expect(first).toEqual({ status: 'rate-limited', retryAt: now + EXPLORER.backoffMs });
    now += EXPLORER.backoffMs - 1;
    const during = await fetchExplorer(SLAV, 'lichess', NONE, { token: 't', fetchImpl: f, now: clock });
    expect(during.status).toBe('rate-limited');
    expect(f).toHaveBeenCalledTimes(1);
    now += 2;
    f.mockImplementation(async () => respond(200, EX_LICHESS));
    expect((await fetchExplorer(START, 'lichess', NONE, { token: 't', fetchImpl: f, now: clock })).status).toBe('ok');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('network failures, server errors and odd answers give a status, never a throw', async () => {
    const boom = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchExplorer(START, 'masters', NONE, { token: 't', fetchImpl: boom })).toEqual({ status: 'error' });
    const s500 = vi.fn(async () => respond(500));
    expect(await fetchExplorer(START, 'masters', NONE, { token: 't', fetchImpl: s500 })).toEqual({ status: 'error' });
    const odd = vi.fn(async () => respond(200, { hello: 1 }));
    expect(await fetchExplorer(START, 'masters', NONE, { token: 't', fetchImpl: odd })).toEqual({ status: 'error' });
    expect(explorerCacheSize()).toBe(0);
  });

  it('a caller that aborts gets out at once; the shared request still fills the cache', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = vi.fn(async () => {
      await gate;
      return respond(200, EX_MASTERS);
    });
    const ctrl = new AbortController();
    const p = fetchExplorer(SLAV, 'masters', NONE, { token: 't', fetchImpl: f, signal: ctrl.signal });
    ctrl.abort();
    expect((await p).status).toBe('error');
    release();
    await vi.waitFor(() => expect(cachedExplorer(SLAV, 'masters', NONE)).not.toBeNull());
  });

  it('keeps at most EXPLORER.cacheSize answers, dropping the least recently used', async () => {
    const f = vi.fn(async () => respond(200, EX_LICHESS));
    // Distinct keys come from the filters: one rating set per entry.
    const keyFilters = (n: number): ExplorerFilters => ({ ratings: [n], speeds: [] });
    for (let n = 0; n < EXPLORER.cacheSize; n++) {
      await fetchExplorer(START, 'lichess', keyFilters(n), { token: 't', fetchImpl: f });
    }
    expect(explorerCacheSize()).toBe(EXPLORER.cacheSize);
    cachedExplorer(START, 'lichess', keyFilters(0)); // touch the oldest
    await fetchExplorer(START, 'lichess', keyFilters(-1), { token: 't', fetchImpl: f });
    expect(explorerCacheSize()).toBe(EXPLORER.cacheSize);
    expect(cachedExplorer(START, 'lichess', keyFilters(0))).not.toBeNull();
    expect(cachedExplorer(START, 'lichess', keyFilters(1))).toBeNull();
  });
});

describe('token and panel preferences', () => {
  beforeEach(() => localStorage.clear());

  it('stores the token locally, trimmed, and forgets it', () => {
    expect(loadLichessToken()).toBeNull();
    saveLichessToken('  lip_xyz  ');
    expect(loadLichessToken()).toBe('lip_xyz');
    saveLichessToken('');
    expect(loadLichessToken()).toBeNull();
  });

  it('never syncs the token to the server', () => {
    expect(Object.keys(SYNC_KEYS)).not.toContain(TOKEN_KEY);
    expect(Object.keys(SYNC_KEYS)).not.toContain('rookery.explorer');
  });

  it('round-trips panel prefs and repairs bad ones', () => {
    expect(loadExplorerPrefs()).toEqual({ open: true, source: EXPLORER.defaultSource, filters: defaultFilters() });
    saveExplorerPrefs({ open: false, source: 'lichess', filters: { ratings: [2200], speeds: ['rapid'] } });
    expect(loadExplorerPrefs()).toEqual({ open: false, source: 'lichess', filters: { ratings: [2200], speeds: ['rapid'] } });
    localStorage.setItem('rookery.explorer', JSON.stringify({ source: 'chesscom', ratings: [1234, 1800], speeds: ['nope'] }));
    expect(loadExplorerPrefs()).toMatchObject({ source: EXPLORER.defaultSource, filters: { ratings: [1800], speeds: [] } });
    localStorage.setItem('rookery.explorer', '{broken');
    expect(loadExplorerPrefs().source).toBe(EXPLORER.defaultSource);
  });
});

describe('explorer panel (static render)', () => {
  beforeEach(() => localStorage.clear());

  it('without a token points to Settings instead of asking Lichess', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { ExplorerPanel } = await import('../../src/components/ExplorerPanel');
    const html = renderToString(createElement(ExplorerPanel, { fen: START }));
    expect(html).toContain('Opening explorer');
    expect(html).toContain('Add a token in Settings');
    expect(html).toContain('href="#/account"');
  });

  it('shows a cached answer: moves, bar and top games linked to lichess.org', async () => {
    const f = vi.fn(async () => respond(200, EX_MASTERS));
    await fetchExplorer(SLAV, 'masters', NONE, { token: 't', fetchImpl: f });
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { ExplorerPanel } = await import('../../src/components/ExplorerPanel');
    const html = renderToString(createElement(ExplorerPanel, { fen: SLAV, highlightUci: 'c6d5' }));
    expect(html).toContain('cxd5');
    expect(html).toContain('Slav Defense: Exchange Variation');
    expect(html).toContain('https://lichess.org/kN6d9l2i');
    expect(html).toContain('White 22%, draw 61%, Black 17%');
  });
});
