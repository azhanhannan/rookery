import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mainline } from '../../src/game/variationTree';
import { FOOLS_MATE, play } from './helpers';

async function fresh() {
  vi.resetModules();
  const analysis = await import('../../src/analysis/analysisStore');
  const game = await import('../../src/game/gameStore');
  return { analysis, game };
}

describe('analysis store', () => {
  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
  });

  it('keeps the tree across a reload, and side lines from the keyboard position', async () => {
    let { analysis } = await fresh();
    const s = analysis.useAnalysisStore.getState();
    expect(s.play({ from: 'e2', to: 'e4' })).toBe(true);
    s.play({ from: 'e7', to: 'e5' });
    s.back();
    s.play({ from: 'c7', to: 'c5' });
    ({ analysis } = await fresh());
    const t = analysis.useAnalysisStore.getState().tree;
    expect(t.nodes[mainline(t)[1]].children).toHaveLength(2);
    expect(t.nodes[analysis.useAnalysisStore.getState().selected].san).toBe('c5');
  });

  it('openInAnalysis puts a game on the board at the given move', async () => {
    const { analysis } = await fresh();
    const record = play(FOOLS_MATE);
    analysis.openInAnalysis(record, 2);
    const s = analysis.useAnalysisStore.getState();
    expect(mainline(s.tree)).toHaveLength(record.moves.length + 1);
    expect(s.tree.nodes[s.selected].fen).toBe(record.moves[1].fenAfter);
    expect(location.hash).toBe('#/analysis');
  });

  it('Play can start a game from a set-up position', async () => {
    const { game } = await fresh();
    const fen = '4k3/8/8/8/8/8/8/4K2R b K - 0 1';
    game.useGameStore.getState().newGame({ side: 'b', timeControlId: 'unlimited', opponent: 'bot', botElo: 800, startFen: fen });
    const { record, orientation } = game.useGameStore.getState();
    expect(record.startFen).toBe(fen);
    expect(orientation).toBe('black');
    expect(game.useGameStore.getState().move({ from: 'e8', to: 'd8' })).toBe(true);
  });
});
