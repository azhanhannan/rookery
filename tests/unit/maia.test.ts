import { describe, expect, it } from 'vitest';
import { chooseMaiaMove, maiaThinkTime } from '../../src/bots/maiaPlayer';
import { isMaiaLevel, maiaBotName, maiaLevelFor, suggestNextMaiaLevel } from '../../src/bots/maiaLevels';
import { MAIA } from '../../src/config/tunables';
import {
  decodePrediction,
  encodeFen,
  legalUcis,
  mirrorSquare,
  mirrorUci,
  moveIndex,
  PIECES,
  POLICY_SIZE,
  sampleMove,
  squareIndex,
  type PolicyEntry,
} from '../../src/maia/encoding';
import { MaiaService, type MaiaTransport } from '../../src/maia/MaiaService';
import type { WorkerRequest, WorkerResponse } from '../../src/maia/protocol';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

/** The piece index set on `square` in encoded tokens, or -1 when empty (throws on two pieces). */
function pieceAt(tokens: Float32Array, square: string): number {
  const base = squareIndex(square) * 12;
  const set = [...tokens.slice(base, base + 12)].flatMap((v, i) => (v === 1 ? [i] : []));
  if (set.length > 1) throw new Error(`two pieces on ${square}`);
  return set[0] ?? -1;
}

/** Seeded rng (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('squares and move indices', () => {
  it('a1=0, h1=7, a8=56, h8=63', () => {
    expect([squareIndex('a1'), squareIndex('h1'), squareIndex('a8'), squareIndex('h8'), squareIndex('e4')]).toEqual([0, 7, 56, 63, 28]);
  });

  it('mirrors ranks only', () => {
    expect(mirrorSquare('e2')).toBe('e7');
    expect(mirrorSquare('a8')).toBe('a1');
    expect(mirrorUci('e7e5')).toBe('e2e4');
    expect(mirrorUci('b2b1q')).toBe('b7b8q');
  });

  it('normal moves are from*64+to', () => {
    expect(moveIndex('e2e4')).toBe(12 * 64 + 28);
    expect(moveIndex('a1h8')).toBe(63);
    expect(moveIndex('h8a1')).toBe(63 * 64);
    expect(moveIndex('g1f3')).toBe(6 * 64 + 21);
  });

  it('promotions are 4096 + (fromFile*8 + toFile)*4 + qrbn', () => {
    expect(moveIndex('a7a8q')).toBe(4096);
    expect(moveIndex('a7a8n')).toBe(4099);
    expect(moveIndex('a7b8r')).toBe(4096 + 1 * 4 + 1);
    expect(moveIndex('h7g8b')).toBe(4096 + (7 * 8 + 6) * 4 + 2);
    expect(moveIndex('h7h8n')).toBe(POLICY_SIZE - 1);
    expect(() => moveIndex('a7a8k')).toThrow();
  });
});

describe('encodeFen', () => {
  it('White to move: one-hot per square, a1 first', () => {
    const t = encodeFen(START);
    expect(t.length).toBe(64 * 12);
    expect(t.reduce((a, b) => a + b, 0)).toBe(32);
    expect(pieceAt(t, 'a1')).toBe(PIECES.indexOf('R'));
    expect(pieceAt(t, 'e1')).toBe(PIECES.indexOf('K'));
    expect(pieceAt(t, 'd8')).toBe(PIECES.indexOf('q'));
    expect(pieceAt(t, 'e2')).toBe(PIECES.indexOf('P'));
    expect(pieceAt(t, 'e4')).toBe(-1);
  });

  it('Black to move: ranks mirrored and colours swapped, so Black looks like White', () => {
    const t = encodeFen(AFTER_E4);
    // Black's e8 king appears as a White king on e1; White's e4 pawn as a black pawn on e5.
    expect(pieceAt(t, 'e1')).toBe(PIECES.indexOf('K'));
    expect(pieceAt(t, 'e8')).toBe(PIECES.indexOf('k'));
    expect(pieceAt(t, 'e5')).toBe(PIECES.indexOf('p'));
    expect(pieceAt(t, 'e7')).toBe(-1); // White's e-pawn left e2
    expect(pieceAt(t, 'e2')).toBe(PIECES.indexOf('P'));
    expect(pieceAt(t, 'e4')).toBe(-1);
  });

  it('a position and its colour-flipped twin encode the same', () => {
    const white = '4k3/8/8/8/8/8/4P3/R3K3 w - - 0 1';
    const black = 'r3k3/4p3/8/8/8/8/8/4K3 b - - 0 1';
    expect([...encodeFen(black)]).toEqual([...encodeFen(white)]);
  });

  it('rejects a broken placement', () => {
    expect(() => encodeFen('rnbqkbnr/pppppppp/8/8 w - - 0 1')).toThrow();
    expect(() => encodeFen('rnbqkbnx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')).toThrow();
  });
});

describe('decodePrediction', () => {
  const value = Float32Array.of(0, 0, 0);

  it('softmaxes over legal moves only, best first', () => {
    const logits = new Float32Array(POLICY_SIZE).fill(-5);
    logits[moveIndex('e2e4')] = 3;
    logits[moveIndex('d2d4')] = 2;
    logits[moveIndex('e2e5')] = 50; // illegal: must be ignored
    const { policy } = decodePrediction(START, logits, value);
    expect(policy.length).toBe(20);
    expect(policy[0][0]).toBe('e2e4');
    expect(policy[1][0]).toBe('d2d4');
    expect(policy.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 6);
    expect(policy[0][1] / policy[1][1]).toBeCloseTo(Math.E, 4);
  });

  it('Black to move: reads the mirrored index and returns real-board moves', () => {
    const logits = new Float32Array(POLICY_SIZE);
    logits[moveIndex('e2e4')] = 10; // in the model's (mirrored) view, e7e5 is "e2e4"
    const { policy } = decodePrediction(AFTER_E4, logits, value);
    expect(policy[0][0]).toBe('e7e5');
    expect(policy[0][1]).toBeGreaterThan(0.99);
  });

  it('promotions, for both colours', () => {
    const whiteFen = '8/P6k/8/8/8/8/6K1/8 w - - 0 1';
    const w = new Float32Array(POLICY_SIZE);
    w[moveIndex('a7a8n')] = 10;
    expect(decodePrediction(whiteFen, w, value).policy[0][0]).toBe('a7a8n');

    const blackFen = '8/6k1/8/8/8/8/p6K/8 b - - 0 1';
    const b = new Float32Array(POLICY_SIZE);
    b[moveIndex('a7a8r')] = 10; // a2a1r mirrored
    expect(decodePrediction(blackFen, b, value).policy[0][0]).toBe('a2a1r');
  });

  it('win/draw/loss for the side to move from [loss, draw, win] logits', () => {
    const { wdl } = decodePrediction(START, new Float32Array(POLICY_SIZE), Float32Array.of(0, Math.log(2), Math.log(5)));
    expect(wdl.loss).toBeCloseTo(1 / 8, 6);
    expect(wdl.draw).toBeCloseTo(2 / 8, 6);
    expect(wdl.win).toBeCloseTo(5 / 8, 6);
  });

  it('no legal moves gives an empty policy', () => {
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(decodePrediction(mated, new Float32Array(POLICY_SIZE), value).policy).toEqual([]);
  });

  it('rejects a wrong-size output', () => {
    expect(() => decodePrediction(START, new Float32Array(10), value)).toThrow();
  });
});

describe('sampleMove', () => {
  const policy: PolicyEntry[] = [
    ['e2e4', 0.5],
    ['d2d4', 0.3],
    ['g1f3', 0.15],
    ['a2a3', 0.05],
  ];
  const counts = (opts: { temperature: number; topP: number }, n = 20000, seed = 1) => {
    const r = rng(seed);
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const m = sampleMove(policy, opts, r);
      c[m] = (c[m] ?? 0) + 1;
    }
    return c;
  };

  it('temperature 1, no cut: frequencies follow the policy', () => {
    const c = counts({ temperature: 1, topP: 1 });
    expect(c.e2e4 / 20000).toBeCloseTo(0.5, 1);
    expect(c.d2d4 / 20000).toBeCloseTo(0.3, 1);
    expect(c.a2a3 / 20000).toBeCloseTo(0.05, 1);
  });

  it('is deterministic for a seeded rng', () => {
    const a = rng(42);
    const b = rng(42);
    const seqA = Array.from({ length: 50 }, () => sampleMove(policy, { temperature: 1, topP: 0.95 }, a));
    const seqB = Array.from({ length: 50 }, () => sampleMove(policy, { temperature: 1, topP: 0.95 }, b));
    expect(seqA).toEqual(seqB);
  });

  it('topP drops the unlikely tail: 0.95 never picks the 5% move, 0.8 keeps only the top two', () => {
    expect(counts({ temperature: 1, topP: 0.95 }).a2a3).toBeUndefined();
    const c = counts({ temperature: 1, topP: 0.8 });
    expect(Object.keys(c).sort()).toEqual(['d2d4', 'e2e4']);
    expect(c.e2e4 / 20000).toBeCloseTo(0.5 / 0.8, 1);
  });

  it('a tiny topP still keeps the top move', () => {
    expect(Object.keys(counts({ temperature: 1, topP: 0.01 }, 500))).toEqual(['e2e4']);
  });

  it('temperature 0 is always the top move; low temperature sharpens, high flattens', () => {
    expect(Object.keys(counts({ temperature: 0, topP: 1 }, 500))).toEqual(['e2e4']);
    const sharp = counts({ temperature: 0.5, topP: 1 });
    const flat = counts({ temperature: 3, topP: 1 });
    expect(sharp.e2e4).toBeGreaterThan(20000 * 0.6);
    expect(flat.e2e4).toBeLessThan(20000 * 0.4);
  });

  it('works on an unsorted policy and handles rng() === 1', () => {
    const unsorted: PolicyEntry[] = [['a2a3', 0.1], ['e2e4', 0.9]];
    expect(sampleMove(unsorted, { temperature: 1, topP: 1 }, () => 0)).toBe('e2e4');
    expect(sampleMove(unsorted, { temperature: 1, topP: 1 }, () => 1)).toBe('a2a3');
    expect(() => sampleMove([], { temperature: 1, topP: 1 })).toThrow();
  });
});

describe('Maia levels', () => {
  it('snap to the nearest level, ties down', () => {
    expect(maiaLevelFor(1200)).toBe(1200);
    expect(maiaLevelFor(1300)).toBe(1200);
    expect(maiaLevelFor(1301)).toBe(1400);
    expect(maiaLevelFor(0)).toBe(MAIA.levels[0]);
    expect(maiaLevelFor(9999)).toBe(MAIA.levels[MAIA.levels.length - 1]);
    expect(isMaiaLevel(1200)).toBe(true);
    expect(isMaiaLevel(1300)).toBe(false);
    expect(isMaiaLevel(undefined)).toBe(false);
    expect(maiaBotName(1500)).toBe('Maia 1400');
  });

  it('suggest one level up after a win, down after a loss, clamped', () => {
    expect(suggestNextMaiaLevel(1200, 'win')).toBe(1400);
    expect(suggestNextMaiaLevel(1200, 'loss')).toBe(1000);
    expect(suggestNextMaiaLevel(1200, 'draw')).toBe(1200);
    expect(suggestNextMaiaLevel(MAIA.levels[0], 'loss')).toBe(MAIA.levels[0]);
    expect(suggestNextMaiaLevel(2600, 'win')).toBe(2600);
  });

  it('levels are inside the model range 600-2600 and the default is a level', () => {
    expect(Math.min(...MAIA.levels)).toBeGreaterThanOrEqual(600);
    expect(Math.max(...MAIA.levels)).toBeLessThanOrEqual(2600);
    expect(MAIA.levels).toContain(MAIA.defaultElo);
  });
});

describe('chooseMaiaMove', () => {
  it('asks Maia at the snapped level for both sides and returns a sampled legal move', async () => {
    const calls: [string, number, number][] = [];
    const fake = {
      policy: async (fen: string, self: number, oppo: number) => {
        calls.push([fen, self, oppo]);
        return { policy: [['e2e4', 0.9], ['d2d4', 0.1]] as PolicyEntry[], wdl: { win: 0.4, draw: 0.2, loss: 0.4 } };
      },
    };
    expect(await chooseMaiaMove(fake, START, 1290, () => 0)).toBe('e2e4');
    expect(calls).toEqual([[START, 1200, 1200]]);
  });

  it('think time stays inside MAIA.thinkMs', () => {
    expect(maiaThinkTime(() => 0)).toBe(MAIA.thinkMs[0]);
    expect(maiaThinkTime(() => 1)).toBe(MAIA.thinkMs[1]);
  });
});

/** A worker stand-in: answers init with ready and every run with logits favouring `best`. */
function fakeWorker(best: () => string, opts: { failInit?: string } = {}) {
  const sent: WorkerRequest[] = [];
  let cb: ((msg: WorkerResponse) => void) | null = null;
  let concurrent = 0;
  let maxConcurrent = 0;
  const transport: MaiaTransport = {
    post(msg) {
      sent.push(msg);
      if (msg.type === 'init') {
        setTimeout(() => cb?.(opts.failInit ? { type: 'init-error', message: opts.failInit } : { type: 'ready', loadMs: 1 }), 0);
        return;
      }
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const logitsMove = new Float32Array(POLICY_SIZE);
      logitsMove[moveIndex(best())] = 20;
      setTimeout(() => {
        concurrent--;
        cb?.({ type: 'result', id: msg.id, logitsMove, logitsValue: Float32Array.of(0, 0, 0), ms: 1 });
      }, 5);
    },
    onMessage: (c) => (cb = c),
    onError: () => {},
    terminate: () => {},
  };
  return { transport, sent, maxConcurrent: () => maxConcurrent };
}

const files = { modelUrl: '/m', modelBytes: 8, wasmUrl: '/w', wasmBytes: 4, ortBaseUrl: '/ort/' };

describe('MaiaService', () => {
  it('reports download progress, loads once, and runs predictions one at a time in order', async () => {
    const worker = fakeWorker(() => 'e2e4');
    let fetches = 0;
    const service = new MaiaService(
      () => worker.transport,
      async (url, onChunk) => {
        fetches++;
        const size = url === '/m' ? 8 : 4;
        onChunk(size / 2);
        onChunk(size / 2);
        return new ArrayBuffer(size);
      },
      files,
    );
    const progress: number[] = [];
    await Promise.all([service.load((p) => progress.push(p.loaded)), service.load()]);
    expect(fetches).toBe(2);
    expect(service.isLoaded()).toBe(true);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(12);

    const results = await Promise.all([START, START, START].map((fen) => service.policy(fen, 1500, 1500)));
    expect(results.map((r) => r.policy[0][0])).toEqual(['e2e4', 'e2e4', 'e2e4']);
    expect(worker.maxConcurrent()).toBe(1);
    const runs = worker.sent.filter((m) => m.type === 'run');
    expect(runs.map((m) => m.type === 'run' && [m.eloSelf, m.eloOppo])).toEqual([[1500, 1500], [1500, 1500], [1500, 1500]]);
    expect(worker.sent.filter((m) => m.type === 'init').length).toBe(1);
  });

  it('policy() loads on demand and mirrors for Black', async () => {
    const worker = fakeWorker(() => 'e2e4');
    const service = new MaiaService(() => worker.transport, async (url) => new ArrayBuffer(url === '/m' ? 8 : 4), files);
    const r = await service.policy(AFTER_E4, 1100, 1100);
    expect(r.policy[0][0]).toBe('e7e5');
  });

  it('a failed load rejects, then a later load retries', async () => {
    let fail = true;
    const service = new MaiaService(
      () => fakeWorker(() => 'e2e4').transport,
      async (url) => {
        if (fail) throw new Error('offline');
        return new ArrayBuffer(url === '/m' ? 8 : 4);
      },
      files,
    );
    await expect(service.load()).rejects.toThrow('offline');
    expect(service.isLoaded()).toBe(false);
    fail = false;
    await service.load();
    expect(service.isLoaded()).toBe(true);
  });

  it('rejects a model of the wrong size and a worker that cannot create the session', async () => {
    const short = new MaiaService(() => fakeWorker(() => 'e2e4').transport, async () => new ArrayBuffer(3), files);
    await expect(short.load()).rejects.toThrow(/expected 8/);
    const broken = new MaiaService(
      () => fakeWorker(() => 'e2e4', { failInit: 'bad model' }).transport,
      async (url) => new ArrayBuffer(url === '/m' ? 8 : 4),
      files,
    );
    await expect(broken.load()).rejects.toThrow('bad model');
  });

  it('legal moves only, from the real position', () => {
    expect(legalUcis(START)).toHaveLength(20);
  });
});
