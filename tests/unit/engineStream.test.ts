import { describe, expect, it } from 'vitest';
import { EngineService, type EngineTransport } from '../../src/engine/EngineService';
import type { AnalysisResult } from '../../src/engine/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A scripted UCI engine: answers the handshake, records commands, and lets the test feed `info` lines. */
function scripted() {
  const sent: string[] = [];
  let emit: (line: string) => void = () => {};
  const transport: EngineTransport = {
    send(line) {
      sent.push(line);
      if (line === 'uci') queueMicrotask(() => emit('uciok'));
      else if (line === 'isready') queueMicrotask(() => emit('readyok'));
      else if (line === 'stop') queueMicrotask(() => emit('bestmove e2e4'));
      else if (line.startsWith('go depth')) {
        queueMicrotask(() => {
          emit('info depth 5 multipv 1 score cp 20 pv d2d4');
          emit('bestmove d2d4');
        });
      }
    },
    onLine(cb) {
      emit = cb;
    },
    terminate() {},
  };
  return { sent, transport, info: (l: string) => emit(l) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('EngineService.analyzeStream', () => {
  it('streams multi-PV lines sorted by rank and resolves on stop', async () => {
    const s = scripted();
    const engine = new EngineService(() => s.transport);
    await engine.init();
    const updates: AnalysisResult[] = [];
    const done = engine.analyzeStream(START, { multiPV: 3 }, (r) => updates.push(r));
    await tick();
    expect(s.sent).toContain('setoption name MultiPV value 3');
    expect(s.sent).toContain('go infinite');
    s.info('info depth 10 multipv 2 score cp 15 pv d2d4 d7d5');
    s.info('info depth 10 multipv 1 score cp 30 pv e2e4 e7e5');
    s.info('info depth 10 currmove e2e4 currmovenumber 1');
    expect(updates).toHaveLength(2);
    expect(updates[1].lines.map((l) => l.move)).toEqual(['e2e4', 'd2d4']);
    engine.stop();
    const final = await done;
    expect(final.lines).toHaveLength(2);
    expect(final.depth).toBe(10);
  });

  it('gives way to any other request queued behind it', async () => {
    const s = scripted();
    const engine = new EngineService(() => s.transport);
    await engine.init();
    const stream = engine.analyzeStream(START, {}, () => {});
    await tick();
    const other = engine.analyze(START, { depth: 5 });
    expect(s.sent.at(-1)).toBe('stop');
    await stream;
    const r = await other;
    expect(r.lines[0].move).toBe('d2d4');
  });
});
