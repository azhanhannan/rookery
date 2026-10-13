import { describe, expect, it } from 'vitest';
import { applyMove, newRecord, replay, resignationEnd, timeoutEnd, needsPromotion, legalTargets } from '../../src/game/rules';
import { FOOLS_MATE, play, SPECIAL_MOVES_GAME } from './helpers';

describe('full game on one board', () => {
  it('handles castling, en passant and promotion', () => {
    const r = play(SPECIAL_MOVES_GAME);
    expect(r.moves.map((m) => m.san)).toEqual([
      'e4', 'a6', 'e5', 'd5', 'exd6', 'Nf6', 'dxc7', 'Nc6',
      'cxd8=Q+', 'Kxd8', 'Nf3', 'Bg4', 'Bc4', 'e5', 'O-O',
    ]);
    expect(r.moves[8].uci).toBe('c7d8q');
    expect(r.result).toBe('*');
    const board = replay(r);
    expect(board.get('g1')).toEqual({ type: 'k', color: 'w' });
    expect(board.get('f1')).toEqual({ type: 'r', color: 'w' });
    expect(board.get('d5')).toBeFalsy(); // pawn taken en passant
  });

  it('rejects illegal moves and leaves the record unchanged', () => {
    const r = play(['e2e4']);
    expect(applyMove(r, { from: 'e4', to: 'e6' })).toBeNull();
    expect(applyMove(r, { from: 'e7', to: 'e4' })).toBeNull();
    expect(r.moves).toHaveLength(1);
  });

  it('lists legal targets and spots promotions', () => {
    const start = replay(newRecord({ white: { name: 'A', isBot: false }, black: { name: 'B', isBot: false } }));
    expect(legalTargets(start, 'g1').sort()).toEqual(['f3', 'h3']);
    const promo = replay(play(SPECIAL_MOVES_GAME.slice(0, 8)));
    expect(needsPromotion(promo, 'c7', 'd8')).toBe(true);
    expect(needsPromotion(promo, 'g1', 'f3')).toBe(false);
  });
});

describe('game end detection', () => {
  it('checkmate', () => {
    const r = play(FOOLS_MATE);
    expect(r.result).toBe('0-1');
    expect(r.termination).toBe('checkmate');
  });

  it('stalemate', () => {
    const r = play(['f2f7'], '7k/8/6K1/8/8/8/5Q2/8 w - - 0 1');
    expect(r.result).toBe('1/2-1/2');
    expect(r.termination).toBe('stalemate');
  });

  it('threefold repetition', () => {
    const r = play(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(r.result).toBe('1/2-1/2');
    expect(r.termination).toBe('threefold repetition');
  });

  it('50-move rule', () => {
    const r = play(['h1h2'], 'k7/8/8/8/8/8/8/K6R w - - 99 80');
    expect(r.result).toBe('1/2-1/2');
    expect(r.termination).toBe('50-move rule');
  });

  it('insufficient material', () => {
    const r = play(['a1b2'], 'k7/8/8/8/8/8/1n6/K7 w - - 0 1');
    expect(r.result).toBe('1/2-1/2');
    expect(r.termination).toBe('insufficient material');
  });

  it('no moves accepted after the game ends', () => {
    expect(applyMove(play(FOOLS_MATE), { from: 'a2', to: 'a3' })).toBeNull();
  });

  it('resignation', () => {
    expect(resignationEnd('w')).toEqual({ result: '0-1', termination: 'resignation' });
    expect(resignationEnd('b')).toEqual({ result: '1-0', termination: 'resignation' });
  });

  it('timeout: opponent wins when they can still mate', () => {
    expect(timeoutEnd(replay(play([])), 'w')).toEqual({ result: '0-1', termination: 'timeout' });
  });

  it('timeout: draw when the opponent has only a king', () => {
    const r = play([], 'k7/8/8/8/8/8/8/KQ6 w - - 0 1');
    expect(timeoutEnd(replay(r), 'w')).toEqual({ result: '1/2-1/2', termination: 'timeout vs insufficient material' });
    expect(timeoutEnd(replay(r), 'b')).toEqual({ result: '1-0', termination: 'timeout' });
  });

  it('timeout: draw when the opponent has king and one minor against a lone king', () => {
    const r = play([], 'k7/8/8/8/8/8/8/KN6 b - - 0 1');
    expect(timeoutEnd(replay(r), 'b').result).toBe('1/2-1/2');
  });
});
