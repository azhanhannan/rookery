// Node-only (unit tests, bot-match script). Browser code must not import this: it loads the
// engine with require(). The browser path is the Worker transport in EngineService.ts.
import { createRequire } from 'node:module';
import type { EngineTransport } from './EngineService';
import type { StockfishFlavor, StockfishModule, StockfishPackage } from 'stockfish';

const require = createRequire(import.meta.url);

/**
 * Each call gets its own engine. The engine file keeps its state at module level, so the require
 * cache entry is dropped first; otherwise a second engine would share (and break) the first.
 */
export function nodeTransport(flavor: StockfishFlavor = 'lite-single'): EngineTransport {
  const pkg = require('stockfish') as StockfishPackage;
  const path = require.resolve(pkg.findEngine(flavor));
  delete require.cache[path];
  const engine = (require(path) as StockfishModule)();
  let listener: ((line: string) => void) | null = null;
  // Once loaded, the engine answers inside processCommand; deferring keeps delivery async, as in a Worker.
  engine.listener = (line) => queueMicrotask(() => listener?.(line));
  return {
    send: (line) => engine.processCommand(line),
    onLine: (cb) => {
      listener = cb;
    },
    terminate: () => {
      listener = null;
      // terminate() only stops threads; a single-threaded search would keep burning CPU.
      engine.processCommand('stop');
      engine.terminate();
    },
  };
}
