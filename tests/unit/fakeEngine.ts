import type { AnalysisResult, AnalyzeOptions, Engine, EngineLine, Score } from '../../src/engine/types';

export function line(rank: number, move: string, score: Score): EngineLine {
  return { rank, move, score, pv: [move], depth: 1 };
}

/** Engine double: returns canned lines / moves and records every call. */
export class FakeEngine implements Engine {
  lines: EngineLine[] = [];
  bestMove = '';
  range: { min: number; max: number } | null = { min: 1320, max: 3190 };
  setOptions: [string, string | number | boolean][] = [];
  analyzeCalls: [string, AnalyzeOptions][] = [];
  movetimeCalls: [string, number][] = [];

  async init(): Promise<void> {}
  async analyze(fen: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
    this.analyzeCalls.push([fen, opts]);
    return { fen, lines: this.lines, depth: opts.depth ?? 0 };
  }
  async setOption(name: string, value: string | number | boolean): Promise<void> {
    this.setOptions.push([name, value]);
  }
  async goMovetime(fen: string, movetimeMs: number): Promise<string> {
    this.movetimeCalls.push([fen, movetimeMs]);
    return this.bestMove;
  }
  eloRange() {
    return this.range;
  }
  stop(): void {}
  async newGame(): Promise<void> {}
  terminate(): void {}
}

/** Deterministic rng: returns the given values in order and fails loudly if the code rolls more than expected. */
export function seq(...values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`rng called ${i + 1} times, only ${values.length} values given`);
    return values[i++];
  };
}
