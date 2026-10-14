// Runs the Maia-3 ONNX model with onnxruntime-web (WASM, single thread) off the main thread.
// Loaded only by MaiaService, so onnxruntime-web lands in this worker's chunk, never in the app bundle.
import * as ort from 'onnxruntime-web/wasm';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as Worker;
let session: ort.InferenceSession | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function init(msg: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  const started = performance.now();
  try {
    // Single-threaded: threads need COOP/COEP headers (SharedArrayBuffer), which this app doesn't send.
    ort.env.wasm.numThreads = 1;
    // Absolute, so Vite's dev server serves the runtime glue as a plain file from public/ort (a root-relative
    // dynamic import gets "?import" added and is refused as a public-dir import).
    ort.env.wasm.wasmPaths = new URL(msg.ortBaseUrl, location.href).href;
    if (msg.wasm) ort.env.wasm.wasmBinary = msg.wasm;
    session = await ort.InferenceSession.create(new Uint8Array(msg.model), { executionProviders: ['wasm'] });
    post({ type: 'ready', loadMs: performance.now() - started });
  } catch (err) {
    post({ type: 'init-error', message: message(err) });
  }
}

async function run(msg: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  try {
    if (!session) throw new Error('model not loaded');
    const started = performance.now();
    const out = await session.run({
      tokens: new ort.Tensor('float32', msg.tokens, [1, 64, 12]),
      elo_self: new ort.Tensor('float32', Float32Array.of(msg.eloSelf), [1]),
      elo_oppo: new ort.Tensor('float32', Float32Array.of(msg.eloOppo), [1]),
    });
    const logitsMove = new Float32Array(out.logits_move.data as Float32Array);
    const logitsValue = new Float32Array(out.logits_value.data as Float32Array);
    post({ type: 'result', id: msg.id, logitsMove, logitsValue, ms: performance.now() - started }, [
      logitsMove.buffer,
      logitsValue.buffer,
    ]);
  } catch (err) {
    post({ type: 'run-error', id: msg.id, message: message(err) });
  }
}

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  // MaiaService sends one request at a time, so these never overlap.
  if (e.data.type === 'init') void init(e.data);
  else void run(e.data);
};
