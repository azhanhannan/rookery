// Messages between MaiaService (main thread) and maia.worker.ts. Only MaiaService posts to the worker.

export type WorkerRequest =
  | { type: 'init'; model: ArrayBuffer; wasm: ArrayBuffer | null; ortBaseUrl: string }
  | { type: 'run'; id: number; tokens: Float32Array; eloSelf: number; eloOppo: number };

export type WorkerResponse =
  | { type: 'ready'; loadMs: number }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; logitsMove: Float32Array; logitsValue: Float32Array; ms: number }
  | { type: 'run-error'; id: number; message: string };
