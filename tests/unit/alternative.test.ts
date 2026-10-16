import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISTAKES } from '../../src/config/tunables';
import type { AnalysisResult, Score } from '../../src/engine/types';
import { checkAlternative, judgeAlternative } from '../../src/puzzles/alternative';
import { harvestMistakes } from '../../src/puzzles/harvest';
import { usePuzzleStore } from '../../src/puzzles/puzzleStore';
import { loadSchedule } from '../../src/puzzles/spacedRepetition';
import type { GameReview, MoveReview, PositionReview } from '../../src/review/types';
import { play } from './helpers';

// --- a fake engine: scores by position (White's point of view), {cp: 0} for anything else -------------

const scores = new Map<string, Score>();
const analyze = vi.fn(async (fen: string): Promise<AnalysisResult> => {
  const score = scores.get(fen.split(' ').slice(0, 4).join(' ')) ?? { cp: 0 };
  return { fen, depth: 14, lines: [{ rank: 1, move: '0000', score, pv: [], depth: 14 }] };
});
const engine = { analyze };
vi.mock('../../src/engine/EngineService', () => ({ getEngine: () => Promise.resolve(engine) }));

function after(fen: string, ...ucis: string[]): string {
  const c = new Chess(fen);
  for (const u of ucis) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c.fen().split(' ').slice(0, 4).join(' ');
}
const setScore = (fen: string, uci: string, score: Score) => scores.set(after(fen, uci), score);

beforeEach(() => {
  scores.clear();
  analyze.mockClear();
});

describe('judgeAlternative', () => {
  const cfg = { ...MISTAKES.alternative, marginCp: 50, mateSlack: 2 };

  it('accepts a move within the margin of the best, from either side', () => {
    expect(judgeAlternative({ cp: 300 }, { cp: 260 }, 'w', cfg)).toBe(true);
    expect(judgeAlternative({ cp: 300 }, { cp: 240 }, 'w', cfg)).toBe(false);
    // Black: White-POV scores, lower is better for Black.
    expect(judgeAlternative({ cp: -300 }, { cp: -260 }, 'b', cfg)).toBe(true);
    expect(judgeAlternative({ cp: -300 }, { cp: -200 }, 'b', cfg)).toBe(false);
    // Better than the stored move is fine too.
    expect(judgeAlternative({ cp: 50 }, { cp: 400 }, 'w', cfg)).toBe(true);
  });

  it('a mate found by a different move counts; a slow mate or no mate does not', () => {
    expect(judgeAlternative({ mate: 2 }, { mate: 3 }, 'w', cfg)).toBe(true);
    expect(judgeAlternative({ mate: 2 }, { mate: 4 }, 'w', cfg)).toBe(true);
    expect(judgeAlternative({ mate: 2 }, { mate: 5 }, 'w', cfg)).toBe(false);
    expect(judgeAlternative({ mate: 2 }, { cp: 900 }, 'w', cfg)).toBe(false);
    expect(judgeAlternative({ mate: -2 }, { mate: -3 }, 'b', cfg)).toBe(true);
    // Mate delivered at once (mate 0) beats anything.
    expect(judgeAlternative({ mate: 3 }, { mate: 0 }, 'w', cfg)).toBe(true);
    expect(judgeAlternative({ cp: 200 }, { mate: 6 }, 'w', cfg)).toBe(true);
  });

  it('getting mated is never as good', () => {
    expect(judgeAlternative({ cp: -500 }, { mate: -3 }, 'w', cfg)).toBe(false);
  });
});

describe('checkAlternative (engine mocked)', () => {
  // Black to move after 1.e4 e5 2.Qh5 Nc6 3.Bc4: Qxf7# is threatened; g6, Qe7 and Qf6 all stop it.
  const FEN = new Chess();
  for (const u of ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4']) FEN.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
  const fen = FEN.fen();

  it('accepts an equally good defence and names the engine move', async () => {
    setScore(fen, 'g7g6', { cp: 40 });
    setScore(fen, 'd8e7', { cp: 70 });
    expect(await checkAlternative(engine, fen, 'd8e7', 'g7g6')).toEqual({ accepted: true, bestSan: 'g6' });
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it('rejects a move that loses', async () => {
    setScore(fen, 'g7g6', { cp: 40 });
    setScore(fen, 'a7a6', { mate: 1 });
    expect(await checkAlternative(engine, fen, 'a7a6', 'g7g6')).toEqual({ accepted: false });
  });

  it('an engine failure is a plain "no"', async () => {
    analyze.mockRejectedValueOnce(new Error('worker died'));
    expect(await checkAlternative(engine, fen, 'd8e7', 'g7g6')).toEqual({ accepted: false });
  });

  it('in a mating puzzle, a slower forced mate within the slack counts; a merely winning move does not', async () => {
    // White mates in 2 with 1.Re8+ (scores mocked: only the comparison is under test).
    const mateFen = 'r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1';
    setScore(mateFen, 'e2e8', { mate: 2 });
    setScore(mateFen, 'e2e7', { mate: 4 });
    setScore(mateFen, 'h2h3', { cp: 700 });
    expect(await checkAlternative(engine, mateFen, 'e2e7', 'e2e8')).toEqual({ accepted: true, bestSan: 'Re8+' });
    expect(await checkAlternative(engine, mateFen, 'h2h3', 'e2e8')).toEqual({ accepted: false });
  });

  it('a move that mates at once needs no engine', async () => {
    const mateFen = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
    setScore(mateFen, 'e1d1', { mate: 1 }); // pretend the stored move was a slower mate
    expect(await checkAlternative(engine, mateFen, 'e1e8', 'e1d1')).toEqual({ accepted: true, bestSan: 'Rd1' });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});

// --- the store, My-mistakes mode ----------------------------------------------------------------

const SCHOLAR = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];

/** The scholar's mate game with Black's ...Nf6?? reviewed as a Blunder (best: ...g6). */
function scholarGame() {
  const base = play(SCHOLAR);
  const fens = [base.startFen, ...base.moves.map((m) => m.fenAfter)];
  const positions: PositionReview[] = fens.map((f, i) => ({
    fen: f,
    winWhite: 50,
    score: { cp: 0 },
    bestMove: i === 5 ? 'g7g6' : (SCHOLAR[i] ?? ''),
    bestLine: i === 5 ? ['g7g6'] : SCHOLAR[i] ? [SCHOLAR[i]] : [],
  }));
  const moves: MoveReview[] = base.moves.map((m, i) => ({
    ply: i + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san: m.san,
    uci: m.uci,
    label: i === 5 ? 'Blunder' : 'Best',
    loss: i === 5 ? 40 : 0,
  })) as MoveReview[];
  const review = { version: 1, depth: 12, positions, moves, accuracy: { w: 90, b: 50 } } as unknown as GameReview;
  return { ...base, id: 'g1', result: '1-0', createdAt: '2026-10-10T00:00:00Z', white: { name: 'Bot', isBot: true, elo: 800 }, black: { name: 'Me', isBot: false }, review } as never;
}

describe('puzzle store: My mistakes accepts an equally good move', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 10));
  });
  afterEach(() => {
    usePuzzleStore.getState().stop();
    vi.useRealTimers();
  });

  function start() {
    const [p] = harvestMistakes([scholarGame()]);
    expect(p).toBeTruthy();
    usePuzzleStore.getState().play(p, 'mistakes');
    vi.runAllTimers(); // the set-up move
    expect(usePuzzleStore.getState().phase).toBe('solver');
    return p;
  }

  it('...Qe7 instead of ...g6: solved, with the engine move named', async () => {
    const p = start();
    expect(usePuzzleStore.getState().move({ from: 'd8', to: 'e7' })).toBe(true);
    expect(usePuzzleStore.getState().phase).toBe('opponent'); // checking
    await vi.runAllTimersAsync();
    const s = usePuzzleStore.getState();
    expect(s.phase).toBe('ended');
    expect(s.session?.status).toBe('solved');
    expect(s.feedback).toEqual({ kind: 'good', text: 'Also good — the engine preferred g6' });
    expect(loadSchedule()[p.id]).toEqual({ stage: 1, due: '2026-10-16', retired: false });
  });

  it('a losing move is still wrong after the check', async () => {
    const p = start();
    const fen = usePuzzleStore.getState().session!.fen;
    setScore(fen, 'a7a6', { mate: 1 });
    usePuzzleStore.getState().move({ from: 'a7', to: 'a6' });
    await vi.runAllTimersAsync();
    const s = usePuzzleStore.getState();
    expect(s.feedback).toEqual({ kind: 'bad', text: 'Not the move' });
    expect(s.phase).toBe('ended');
    expect(loadSchedule()[p.id]).toEqual({ stage: 0, due: '2026-10-16', retired: false });
  });

  it('repeating the game move is wrong at once, without the engine', () => {
    start();
    usePuzzleStore.getState().move({ from: 'g8', to: 'f6' });
    expect(usePuzzleStore.getState().feedback).toEqual({ kind: 'bad', text: 'Not the move' });
    expect(analyze).not.toHaveBeenCalled();
  });
});
