// @vitest-environment node
// Real Stockfish (lite, single-threaded WASM) in Node. jsdom would make the engine think it is in a browser.
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineService, type EngineTransport } from '../../src/engine/EngineService';
import { nodeTransport } from '../../src/engine/nodeTransport';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const WHITE_MATES_IN_1 = '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1';
const BLACK_MATES_IN_1 = '5q2/8/8/8/8/6k1/8/7K b - - 0 1';
/** White has no queen, Black to move. */
const BLACK_WINNING = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 1';
/** Fool's mate: White is checkmated. */
const WHITE_MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

function isLegal(fen: string, uci: string): boolean {
  const moves = new Chess(fen).moves({ verbose: true });
  return moves.some((m) => m.from + m.to + (m.promotion ?? '') === uci);
}

/** nodeTransport that also records every command sent. */
function recording(sent: string[]): () => EngineTransport {
  return () => {
    const t = nodeTransport();
    return { ...t, send: (line) => (sent.push(line), t.send(line)) };
  };
}

describe('EngineService on real Stockfish', () => {
  const engine = new EngineService(() => nodeTransport());

  beforeAll(() => engine.init());
  afterAll(() => engine.terminate());

  it('reports the UCI_Elo range after init', () => {
    const range = engine.eloRange();
    expect(range?.min).toBeGreaterThanOrEqual(1300);
    expect(range?.min).toBeLessThanOrEqual(1400);
    expect(range!.max).toBeGreaterThan(3000);
  });

  it('analyses the start position to depth 10', async () => {
    const r = await engine.analyze(START, { depth: 10 });
    expect(r.fen).toBe(START);
    expect(r.depth).toBe(10);
    expect(r.lines).toHaveLength(1);
    expect(isLegal(START, r.lines[0].move)).toBe(true);
    expect(r.lines[0].pv[0]).toBe(r.lines[0].move);
    expect('cp' in r.lines[0].score).toBe(true);
  });

  it('returns three distinct ranked lines with multiPV 3', async () => {
    const r = await engine.analyze(START, { depth: 10, multiPV: 3 });
    expect(r.lines.map((l) => l.rank)).toEqual([1, 2, 3]);
    expect(new Set(r.lines.map((l) => l.move)).size).toBe(3);
    for (const l of r.lines) expect(isLegal(START, l.move)).toBe(true);
  });

  it('scores mates from White: +1 when White mates, -1 when Black mates', async () => {
    const white = await engine.analyze(WHITE_MATES_IN_1, { depth: 8 });
    expect(white.lines[0].score).toEqual({ mate: 1 });
    expect(white.lines[0].move).toBe('f1f8');
    const black = await engine.analyze(BLACK_MATES_IN_1, { depth: 8 });
    expect(black.lines[0].score).toEqual({ mate: -1 });
    expect(black.lines[0].move).toBe('f8f1');
  });

  it('gives a negative cp when Black, to move, is winning', async () => {
    const r = await engine.analyze(BLACK_WINNING, { depth: 10 });
    const score = r.lines[0].score;
    expect('cp' in score && score.cp < -500).toBe(true);
  });

  it('returns no lines for a checkmated position, and goMovetime rejects', async () => {
    const r = await engine.analyze(WHITE_MATED, { depth: 10 });
    expect(r.lines).toEqual([]);
    await expect(engine.goMovetime(WHITE_MATED, 100)).rejects.toThrow(/No legal moves/);
  });

  it('goMovetime returns a legal move', async () => {
    const move = await engine.goMovetime(BLACK_WINNING, 200);
    expect(isLegal(BLACK_WINNING, move)).toBe(true);
  });

  it('stop() cuts a long search short and the promise still resolves', async () => {
    const t0 = Date.now();
    const pending = engine.analyze(START, { depth: 40 });
    setTimeout(() => engine.stop(), 300);
    const r = await pending;
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.lines.length).toBe(1);
    expect(isLegal(START, r.lines[0].move)).toBe(true);
  });

  it('serialises concurrent requests', async () => {
    const [a, b, m] = await Promise.all([
      engine.analyze(START, { depth: 8, multiPV: 2 }),
      engine.analyze(BLACK_WINNING, { depth: 8 }),
      engine.goMovetime(WHITE_MATES_IN_1, 100),
    ]);
    expect(a.fen).toBe(START);
    expect(a.lines).toHaveLength(2);
    expect(a.lines.every((l) => isLegal(START, l.move))).toBe(true);
    expect(b.fen).toBe(BLACK_WINNING);
    expect(b.lines).toHaveLength(1);
    expect(isLegal(BLACK_WINNING, b.lines[0].move)).toBe(true);
    expect(m).toBe('f1f8');
  });

  it('newGame resolves between searches', async () => {
    await engine.newGame();
    const r = await engine.analyze(START, { depth: 4 });
    expect(r.lines).toHaveLength(1);
  });

  it('rejects analyze with neither depth nor movetime', async () => {
    await expect(engine.analyze(START, {})).rejects.toThrow(/depth or a movetime/);
  });
});

describe('EngineService option state', () => {
  const sent: string[] = [];
  const engine = new EngineService(recording(sent));
  const setoptions = () => sent.filter((l) => l.startsWith('setoption'));

  beforeAll(() => engine.init());
  afterAll(() => engine.terminate());

  it('skips setOption calls that would not change anything', async () => {
    sent.length = 0;
    await engine.setOption('UCI_Elo', 1500);
    await engine.setOption('UCI_Elo', 1500);
    await engine.setOption('UCI_Elo', '1500');
    await engine.setOption('UCI_Elo', 1600);
    expect(setoptions()).toEqual(['setoption name UCI_Elo value 1500', 'setoption name UCI_Elo value 1600']);
  });

  it('analyze turns UCI_LimitStrength off first; goMovetime keeps the limit', async () => {
    await engine.setOption('UCI_LimitStrength', true);
    sent.length = 0;
    await engine.goMovetime(START, 50);
    expect(setoptions()).not.toContain('setoption name UCI_LimitStrength value false');

    sent.length = 0;
    await engine.analyze(START, { depth: 4 });
    const off = sent.indexOf('setoption name UCI_LimitStrength value false');
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(sent.findIndex((l) => l.startsWith('go ')));

    // Recorded: a second analyze sends nothing, and the bot's next `true` is sent again.
    sent.length = 0;
    await engine.analyze(START, { depth: 4 });
    expect(setoptions()).toEqual([]);
    await engine.setOption('UCI_LimitStrength', true);
    expect(setoptions()).toEqual(['setoption name UCI_LimitStrength value true']);
  });

  it('forgets option state when the engine restarts', async () => {
    await engine.setOption('UCI_Elo', 2000);
    engine.terminate();
    expect(engine.eloRange()).toBeNull();
    await expect(engine.analyze(START, { depth: 1 })).rejects.toThrow(/init/);

    await engine.init();
    sent.length = 0;
    await engine.setOption('UCI_Elo', 2000);
    expect(setoptions()).toEqual(['setoption name UCI_Elo value 2000']);
  });

  it('rejects pending requests on terminate without leaving the engine stuck', async () => {
    const pending = engine.analyze(START, { depth: 40 });
    const queued = engine.setOption('Hash', 32);
    engine.terminate();
    await expect(pending).rejects.toThrow(/terminated/);
    await expect(queued).rejects.toThrow(/terminated/);
    await engine.init();
    const r = await engine.analyze(START, { depth: 2 });
    expect(r.lines).toHaveLength(1);
  });
});

describe('EngineService init failures', () => {
  it('rejects, then retries with a fresh transport', async () => {
    let attempts = 0;
    const engine = new EngineService(() => {
      attempts++;
      if (attempts === 1) throw new Error('worker failed to load');
      return nodeTransport();
    });
    await expect(engine.init()).rejects.toThrow(/failed to load/);
    await engine.init();
    expect(attempts).toBe(2);
    expect(engine.eloRange()).not.toBeNull();
    engine.terminate();
  });

  it('rejects when the transport reports an error during the handshake', async () => {
    const engine = new EngineService(() => {
      let fail: (err: Error) => void = () => {};
      return {
        send: () => setTimeout(() => fail(new Error('crashed')), 0),
        onLine: () => {},
        onError: (cb) => {
          fail = cb;
        },
        terminate: () => {},
      };
    });
    await expect(engine.init()).rejects.toThrow(/crashed/);
  });
});
