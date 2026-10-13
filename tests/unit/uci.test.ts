import { describe, expect, it } from 'vitest';
import { blackToMove, parseBestMove, parseInfo, parseSpinOption, toWhitePov } from '../../src/engine/uci';

const WHITE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('parseInfo', () => {
  it('reads depth, multipv, cp score and pv', () => {
    const line =
      'info depth 16 seldepth 25 multipv 2 score cp 25 nodes 143351 nps 121690 hashfull 57 time 1178 pv e2e4 e7e5 g1f3';
    expect(parseInfo(line, WHITE)).toEqual({ depth: 16, multipv: 2, score: { cp: 25 }, pv: ['e2e4', 'e7e5', 'g1f3'] });
  });

  it('defaults multipv to 1 when Stockfish omits it', () => {
    expect(parseInfo('info depth 3 score cp -12 pv h8g8', WHITE)?.multipv).toBe(1);
  });

  it('reads mate scores', () => {
    expect(parseInfo('info depth 4 multipv 1 score mate 1 nodes 310 pv f1f8', WHITE)?.score).toEqual({ mate: 1 });
    expect(parseInfo('info depth 4 multipv 1 score mate -3 pv a1a2', WHITE)?.score).toEqual({ mate: -3 });
  });

  it('flips cp and mate to White for Black to move', () => {
    expect(parseInfo('info depth 10 score cp 40 pv e7e5', BLACK)?.score).toEqual({ cp: -40 });
    expect(parseInfo('info depth 10 score cp -40 pv e7e5', BLACK)?.score).toEqual({ cp: 40 });
    expect(parseInfo('info depth 10 score mate 2 pv d8h4', BLACK)?.score).toEqual({ mate: -2 });
    expect(parseInfo('info depth 10 score mate -1 pv d8h4', BLACK)?.score).toEqual({ mate: 1 });
    expect(parseInfo('info depth 10 score cp 0 pv e7e5', BLACK)?.score).toEqual({ cp: 0 });
  });

  it('ignores bound, scoreless, pv-less and string lines', () => {
    expect(parseInfo('info depth 5 seldepth 8 multipv 1 score cp 23 upperbound nodes 3030 pv e2e4 e7e5', WHITE)).toBeNull();
    expect(parseInfo('info depth 5 multipv 1 score cp 23 lowerbound nodes 3030 pv e2e4', WHITE)).toBeNull();
    expect(parseInfo('info depth 12 currmove e2e4 currmovenumber 1', WHITE)).toBeNull();
    expect(parseInfo('info depth 0 score mate 0', WHITE)).toBeNull();
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue', WHITE)).toBeNull();
    expect(parseInfo('bestmove e2e4', WHITE)).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('returns the move, null for (none), undefined for other lines', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1 score cp 0 pv e2e4')).toBeUndefined();
  });
});

describe('parseSpinOption', () => {
  it('reads the UCI_Elo range', () => {
    expect(parseSpinOption('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      name: 'UCI_Elo',
      default: 1320,
      min: 1320,
      max: 3190,
    });
  });

  it('handles names with spaces and negative bounds, and rejects other option types', () => {
    expect(parseSpinOption('option name Move Overhead type spin default 10 min 0 max 5000')?.name).toBe('Move Overhead');
    expect(parseSpinOption('option name Contempt type spin default 0 min -100 max 100')?.min).toBe(-100);
    expect(parseSpinOption('option name UCI_LimitStrength type check default false')).toBeNull();
  });
});

describe('side to move', () => {
  it('reads the FEN field and leaves White-to-move scores alone', () => {
    expect(blackToMove(WHITE)).toBe(false);
    expect(blackToMove(BLACK)).toBe(true);
    expect(toWhitePov({ cp: 30 }, WHITE)).toEqual({ cp: 30 });
    expect(toWhitePov({ mate: -2 }, WHITE)).toEqual({ mate: -2 });
  });
});
