// Node-only typings for nodeTransport.ts. The app's tsconfig loads browser types only, and pulling
// in all of @types/node would retype globals (setTimeout etc.) for every file, so this declares
// just what nodeTransport uses. If @types/node is ever loaded too, these merge as overloads.

declare module 'node:module' {
  type LiteRequire = {
    (id: string): unknown;
    resolve(id: string): string;
    cache: Record<string, unknown>;
  };
  export function createRequire(url: string): LiteRequire;
}

/** The `stockfish` npm package (CommonJS), as nodeTransport.ts uses it. */
declare module 'stockfish' {
  export type StockfishFlavor = 'full' | 'lite' | 'single' | 'lite-single' | 'asm';
  export type StockfishEngine = {
    processCommand(line: string): void;
    listener?: (line: string) => void;
    terminate(): void;
  };
  /** What `require(<engine file>)` returns. */
  export type StockfishModule = () => StockfishEngine;
  /** What `require('stockfish')` returns. */
  export type StockfishPackage = {
    (flavor: StockfishFlavor, onLine?: (line: string) => void): StockfishEngine;
    findEngine(flavor: StockfishFlavor): string;
  };
}
