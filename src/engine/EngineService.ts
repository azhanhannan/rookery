// The only code that talks to Stockfish. One request runs at a time; the rest wait in a FIFO queue,
// because UCI is a single stream and a second `go` would silently cancel the first.
import { ENGINE_URL } from '../config/tunables';
import type { AnalysisResult, AnalyzeOptions, Engine, EngineLine } from './types';
import { parseBestMove, parseInfo, parseSpinOption, type InfoLine } from './uci';

/** A UCI text pipe: a Web Worker in the browser, the `stockfish` package in Node (nodeTransport.ts). */
export type EngineTransport = {
  send(line: string): void;
  onLine(cb: (line: string) => void): void;
  /** Fatal failures (worker failed to load or crashed). */
  onError?(cb: (err: Error) => void): void;
  terminate(): void;
};

/** Generous: the browser has to download and compile ~1.7 MB of WASM first. */
const INIT_TIMEOUT_MS = 30_000;

type Job = {
  /** Sends this job's commands. Must send last: Node may answer synchronously inside `send`. */
  start(): void;
  onLine(line: string): void;
  fail(err: Error): void;
  /** True while a `go` is outstanding, so `stop()` knows there is something to stop. */
  searching: boolean;
};

export class EngineService implements Engine {
  private transport: EngineTransport | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: Job[] = [];
  private current: Job | null = null;
  private range: { min: number; max: number } | null = null;
  /** Last value sent per option (lower-cased name), so repeat `setOption` calls cost nothing. */
  private options = new Map<string, string>();

  private readonly createTransport: () => EngineTransport;

  /** `createTransport` is called on every (re)start: first `init()`, and `init()` after `terminate()` or a crash. */
  constructor(createTransport: () => EngineTransport) {
    this.createTransport = createTransport;
  }

  init(): Promise<void> {
    if (!this.initPromise) {
      const p: Promise<void> = this.start().catch((err: unknown) => {
        // Unless terminate() already tore this attempt down, leave nothing half-started for the retry.
        if (this.initPromise === p) this.shutdown(err instanceof Error ? err : new Error(String(err)));
        throw err;
      });
      this.initPromise = p;
    }
    return this.initPromise;
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
    if (opts.depth === undefined && opts.movetime === undefined) {
      return Promise.reject(new Error('analyze needs a depth or a movetime'));
    }
    const go = ['go'];
    if (opts.depth !== undefined) go.push('depth', String(opts.depth));
    if (opts.movetime !== undefined) go.push('movetime', String(opts.movetime));
    return this.search(fen, opts.multiPV ?? 1, go.join(' '), true).then(({ lines }) => {
      const sorted = [...lines.values()].sort((a, b) => a.rank - b.rank);
      return { fen, lines: sorted, depth: sorted[0]?.depth ?? 0 };
    });
  }

  goMovetime(fen: string, movetimeMs: number): Promise<string> {
    return this.search(fen, 1, `go movetime ${movetimeMs}`, false).then(({ best }) => {
      if (best === null) throw new Error(`No legal moves in ${fen}`);
      return best;
    });
  }

  setOption(name: string, value: string | number | boolean): Promise<void> {
    // Checked when the job runs, not when it is queued: an earlier job may change the value.
    return this.enqueue<void>((done) => this.readyJob(done, () => this.sendOption(name, value)));
  }

  newGame(): Promise<void> {
    return this.enqueue<void>((done) => this.readyJob(done, () => {
        this.send('ucinewgame');
        return true;
      }));
  }

  eloRange(): { min: number; max: number } | null {
    return this.range;
  }

  /**
   * Cuts the running search short; its promise still resolves with whatever the engine had.
   * Queued requests are untouched and run afterwards: they belong to other callers.
   */
  stop(): void {
    if (this.current?.searching) this.send('stop');
  }

  /** Kills the engine and rejects every pending request. A later `init()` starts a fresh one. */
  terminate(): void {
    this.shutdown(new Error('Engine terminated'));
  }

  private async start(): Promise<void> {
    const transport = this.createTransport();
    this.transport = transport;
    this.options.clear();
    this.range = null;
    // Lines from a transport that has since been replaced are ignored.
    transport.onLine((text) => {
      if (this.transport !== transport) return;
      for (const line of text.split('\n')) if (line) this.current?.onLine(line);
    });
    transport.onError?.((err) => {
      if (this.transport === transport) this.shutdown(err);
    });
    const handshake = new Promise<void>((resolve, reject) => {
      const job: Job = {
        searching: false,
        start: () => this.send('uci'),
        onLine: (line) => {
          const opt = parseSpinOption(line);
          if (opt?.name === 'UCI_Elo') this.range = { min: opt.min, max: opt.max };
          if (line === 'uciok') this.send('isready');
          else if (line === 'readyok') this.finish(job, resolve);
        },
        fail: reject,
      };
      // Ahead of anything callers queued while init was still pending.
      this.queue.unshift(job);
      this.pump();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Engine did not answer uci/isready in time')), INIT_TIMEOUT_MS);
    });
    return Promise.race([handshake, timeout]).finally(() => clearTimeout(timer));
  }

  private search(fen: string, multiPV: number, goCommand: string, fullStrength: boolean) {
    return this.enqueue<{ lines: Map<number, EngineLine>; best: string | null }>((done) => {
      const lines = new Map<number, EngineLine>();
      const job: Job = {
        searching: false,
        start: () => {
          // Analysis is always full strength; only goMovetime plays at the bot's limit.
          if (fullStrength && this.options.get('uci_limitstrength') === 'true') {
            this.sendOption('UCI_LimitStrength', false);
          }
          this.sendOption('MultiPV', multiPV);
          this.send(`position fen ${fen}`);
          job.searching = true;
          this.send(goCommand);
        },
        onLine: (line) => {
          const info = parseInfo(line, fen);
          if (info) {
            lines.set(info.multipv, toLine(info));
            return;
          }
          const best = parseBestMove(line);
          if (best === undefined) return;
          // A mated or stalemated side has no lines worth reporting (Stockfish still sends `info depth 0`).
          if (best === null) lines.clear();
          this.finish(job, () => done.resolve({ lines, best }));
        },
        fail: done.reject,
      };
      return job;
    });
  }

  /** Runs `before`, then `isready`, and resolves on `readyok`. `before` returning false means nothing was sent: done at once. */
  private readyJob(done: Deferred<void>, before: () => boolean): Job {
    const job: Job = {
      searching: false,
      start: () => {
        if (before()) this.send('isready');
        else this.finish(job, () => done.resolve());
      },
      onLine: (line) => {
        if (line === 'readyok') this.finish(job, () => done.resolve());
      },
      fail: done.reject,
    };
    return job;
  }

  /** Sends `setoption` unless the engine already has this value. Returns whether it sent. */
  private sendOption(name: string, value: string | number | boolean): boolean {
    const key = name.toLowerCase();
    const text = String(value);
    if (this.options.get(key) === text) return false;
    this.options.set(key, text);
    this.send(`setoption name ${name} value ${text}`);
    return true;
  }

  private enqueue<T>(makeJob: (done: Deferred<T>) => Job): Promise<T> {
    if (!this.transport) return Promise.reject(new Error('Engine not started: call init() first'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push(makeJob({ resolve, reject }));
      this.pump();
    });
  }

  private pump(): void {
    if (this.current || !this.transport) return;
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    next.start();
  }

  private finish(job: Job, settle: () => void): void {
    if (this.current !== job) return;
    job.searching = false;
    this.current = null;
    settle();
    // Deferred so a transport that answers synchronously can't recurse through the whole queue.
    queueMicrotask(() => this.pump());
  }

  private send(line: string): void {
    this.transport?.send(line);
  }

  private shutdown(err: Error): void {
    const pending = [...(this.current ? [this.current] : []), ...this.queue];
    const transport = this.transport;
    this.transport = null;
    this.current = null;
    this.queue = [];
    this.initPromise = null;
    this.options.clear();
    this.range = null;
    transport?.terminate();
    for (const job of pending) job.fail(err);
  }
}

type Deferred<T> = { resolve(value: T): void; reject(err: Error): void };

function toLine(info: InfoLine): EngineLine {
  return { rank: info.multipv, move: info.pv[0], score: info.score, pv: info.pv, depth: info.depth };
}

function workerTransport(url: string): EngineTransport {
  const worker = new Worker(url);
  return {
    send: (line) => worker.postMessage(line),
    onLine: (cb) => {
      worker.onmessage = (e: MessageEvent) => {
        // The worker also posts download-progress objects; only strings are UCI.
        if (typeof e.data === 'string') cb(e.data);
      };
    },
    onError: (cb) => {
      worker.onerror = (e: ErrorEvent) => cb(new Error(`Engine worker failed: ${e.message || url}`));
    },
    terminate: () => worker.terminate(),
  };
}

let shared: Promise<EngineService> | null = null;

/** App-wide engine, created and initialised on first use. A failed start is forgotten so the next call retries. */
export function getEngine(): Promise<EngineService> {
  if (!shared) {
    const engine = new EngineService(() => workerTransport(ENGINE_URL));
    shared = engine.init().then(
      () => engine,
      (err: unknown) => {
        shared = null;
        throw err;
      },
    );
  }
  return shared;
}
