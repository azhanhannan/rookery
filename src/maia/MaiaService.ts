// The only code that talks to the Maia worker. Downloads the model (with progress), hands it to the worker,
// and runs one prediction at a time; the rest wait in a FIFO queue (an ONNX session runs one call at a time).
import { MAIA } from '../config/tunables';
import { decodePrediction, encodeFen, type MaiaPrediction } from './encoding';
import type { WorkerRequest, WorkerResponse } from './protocol';

export type MaiaTransport = {
  post(msg: WorkerRequest, transfer?: Transferable[]): void;
  onMessage(cb: (msg: WorkerResponse) => void): void;
  /** Fatal failures (worker failed to load or crashed). */
  onError(cb: (err: Error) => void): void;
  terminate(): void;
};

/** Bytes received so far over everything `load` downloads, and the expected total. */
export type LoadProgress = { loaded: number; total: number };

/** Fetches `url` whole, reporting each chunk's size. */
export type Fetcher = (url: string, onChunk: (bytes: number) => void) => Promise<ArrayBuffer>;

export type MaiaFiles = { modelUrl: string; modelBytes: number; wasmUrl: string | null; wasmBytes: number; ortBaseUrl: string };

/** Session creation after the download: compiling the WASM and the 46 MB model takes a few seconds. */
const INIT_TIMEOUT_MS = 60_000;

type Job = { start(): void; settle(msg: WorkerResponse): void; fail(err: Error): void };

export class MaiaService {
  private transport: MaiaTransport | null = null;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private listeners = new Set<(p: LoadProgress) => void>();
  private progress: LoadProgress = { loaded: 0, total: 0 };
  private queue: Job[] = [];
  private current: Job | null = null;
  private nextId = 1;
  /** Per-inference wall time of the last prediction (worker side), ms; for diagnostics. */
  lastRunMs = 0;
  /** Time the worker took to create the session, ms. */
  loadMs = 0;

  private readonly createTransport: () => MaiaTransport;
  private readonly fetcher: Fetcher;
  private readonly files: MaiaFiles;

  constructor(createTransport: () => MaiaTransport, fetcher: Fetcher, files: MaiaFiles) {
    this.createTransport = createTransport;
    this.fetcher = fetcher;
    this.files = files;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Downloads the files and starts the worker; later calls share the same attempt (and its progress).
   * A failed attempt is forgotten so the next call retries.
   */
  load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (onProgress && !this.loaded) {
      this.listeners.add(onProgress);
      if (this.loading) onProgress(this.progress);
    }
    if (!this.loading) {
      const p = this.start().then(
        () => {
          this.loaded = true;
          this.listeners.clear();
        },
        (err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          if (this.loading === p) this.shutdown(error);
          throw error;
        },
      );
      this.loading = p;
    }
    return this.loading;
  }

  /** The model's move probabilities for `fen` (legal moves only, best first). Loads the model first if needed. */
  async policy(fen: string, eloSelf: number, eloOppo: number): Promise<MaiaPrediction> {
    const tokens = encodeFen(fen);
    await this.load();
    const res = await this.enqueue((id) => ({ type: 'run', id, tokens, eloSelf, eloOppo }));
    if (res.type !== 'result') throw new Error('unexpected worker reply');
    this.lastRunMs = res.ms;
    return decodePrediction(fen, res.logitsMove, res.logitsValue);
  }

  /** Kills the worker and rejects every pending request. A later `load()` starts again. */
  terminate(): void {
    this.shutdown(new Error('Maia terminated'));
  }

  private async start(): Promise<void> {
    const { modelUrl, modelBytes, wasmUrl, wasmBytes, ortBaseUrl } = this.files;
    this.progress = { loaded: 0, total: modelBytes + (wasmUrl ? wasmBytes : 0) };
    this.emit();
    const onChunk = (bytes: number) => {
      this.progress = { ...this.progress, loaded: this.progress.loaded + bytes };
      this.emit();
    };
    const [model, wasm] = await Promise.all([
      this.fetcher(modelUrl, onChunk),
      wasmUrl ? this.fetcher(wasmUrl, onChunk) : Promise.resolve(null),
    ]);
    if (model.byteLength !== modelBytes)
      throw new Error(`the model file is ${model.byteLength} bytes, expected ${modelBytes} (re-run node scripts/fetch-maia.mjs)`);

    const transport = this.createTransport();
    this.transport = transport;
    transport.onMessage((msg) => {
      if (this.transport === transport) this.current?.settle(msg);
    });
    transport.onError((err) => {
      if (this.transport === transport) this.shutdown(err);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      const job: Job = {
        start: () => {
          const transfer: Transferable[] = wasm ? [model, wasm] : [model];
          transport.post({ type: 'init', model, wasm, ortBaseUrl }, transfer);
        },
        settle: (msg) => {
          if (msg.type === 'ready') {
            this.loadMs = msg.loadMs;
            this.finish(job, resolve);
          } else if (msg.type === 'init-error') {
            this.finish(job, () => reject(new Error(msg.message)));
          }
        },
        fail: reject,
      };
      // Ahead of anything queued while the download was running.
      this.queue.unshift(job);
      this.pump();
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('the human-like bot did not start in time')), INIT_TIMEOUT_MS);
    });
    return Promise.race([ready, timeout]).finally(() => clearTimeout(timer));
  }

  private enqueue(make: (id: number) => WorkerRequest): Promise<WorkerResponse> {
    if (!this.transport) return Promise.reject(new Error('Maia not loaded'));
    const transport = this.transport;
    return new Promise<WorkerResponse>((resolve, reject) => {
      const id = this.nextId++;
      const job: Job = {
        start: () => {
          const msg = make(id);
          transport.post(msg, msg.type === 'run' ? [msg.tokens.buffer] : []);
        },
        settle: (msg) => {
          if (msg.type === 'result' && msg.id === id) this.finish(job, () => resolve(msg));
          else if (msg.type === 'run-error' && msg.id === id) this.finish(job, () => reject(new Error(msg.message)));
        },
        fail: reject,
      };
      this.queue.push(job);
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
    this.current = null;
    settle();
    queueMicrotask(() => this.pump());
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.progress);
  }

  private shutdown(err: Error): void {
    const pending = [...(this.current ? [this.current] : []), ...this.queue];
    const transport = this.transport;
    this.transport = null;
    this.current = null;
    this.queue = [];
    this.loading = null;
    this.loaded = false;
    this.listeners.clear();
    transport?.terminate();
    for (const job of pending) job.fail(err);
  }
}

/** fetch with streamed progress. Rejects on HTTP errors and on the dev server's index.html fallback for missing files. */
export const fetchWithProgress: Fetcher = async (url, onChunk) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url} (HTTP ${res.status})`);
  if ((res.headers.get('content-type') ?? '').includes('text/html'))
    throw new Error(`${url} is missing on the server (run node scripts/fetch-maia.mjs)`);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onChunk(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
};

function workerTransport(): MaiaTransport {
  const worker = new Worker(new URL('./maia.worker.ts', import.meta.url), { type: 'module' });
  return {
    post: (msg, transfer = []) => worker.postMessage(msg, transfer),
    onMessage: (cb) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => cb(e.data);
    },
    onError: (cb) => {
      worker.onerror = (e: ErrorEvent) => cb(new Error(`the human-like bot's worker failed: ${e.message || 'load error'}`));
    },
    terminate: () => worker.terminate(),
  };
}

let shared: MaiaService | null = null;

/** App-wide Maia, created on first use (the download starts on the first `load()` or `policy()`). */
export function getMaia(): MaiaService {
  shared ??= new MaiaService(workerTransport, fetchWithProgress, {
    modelUrl: MAIA.modelUrl,
    modelBytes: MAIA.modelBytes,
    wasmUrl: MAIA.ortWasmUrl,
    wasmBytes: MAIA.ortWasmBytes,
    ortBaseUrl: MAIA.ortBaseUrl,
  });
  return shared;
}
