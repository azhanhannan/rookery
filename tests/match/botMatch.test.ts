// Phase 2 acceptance: over 20 games, a 400 bot loses to a 1200 bot in most games, and a 1200 bot
// loses to a 2000 bot in most games. Run with `npm run test:bots`.
import { appendFileSync, mkdirSync } from 'node:fs';
import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { chooseMove } from '../../src/bots/botPlayer';
import { levelFor } from '../../src/bots/botLevels';
import { EngineService } from '../../src/engine/EngineService';
import { nodeTransport } from '../../src/engine/nodeTransport';
import { detectEnd } from '../../src/game/rules';
import type { BotLevel } from '../../src/engine/types';

const GAMES = 20;
/** Games still going after this many plies are scored as draws. */
const MAX_PLIES = 300;
/** Engine time per move for limit/full levels. Shorter than play's think time so the match finishes in minutes. */
const MATCH_MOVETIME_MS = 200;

const engines: EngineService[] = [];
afterAll(() => engines.forEach((e) => e.terminate()));

async function newEngine(): Promise<EngineService> {
  const e = new EngineService(() => nodeTransport());
  await e.init();
  engines.push(e);
  return e;
}

function forMatch(level: BotLevel): BotLevel {
  return { ...level, thinkMs: [MATCH_MOVETIME_MS, MATCH_MOVETIME_MS] };
}

type Score = { strong: number; weak: number; draws: number; adjudicated: number };

async function playGame(white: [EngineService, BotLevel], black: [EngineService, BotLevel]): Promise<'w' | 'b' | 'draw' | 'adjudicated'> {
  const chess = new Chess();
  await Promise.all([white[0].newGame(), black[0].newGame()]);
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const [engine, level] = chess.turn() === 'w' ? white : black;
    const uci = await chooseMove(engine, chess.fen(), level);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    const end = detectEnd(chess);
    if (end) return end.result === '1-0' ? 'w' : end.result === '0-1' ? 'b' : 'draw';
  }
  return 'adjudicated';
}

async function match(strongElo: number, weakElo: number): Promise<Score> {
  const strong = forMatch(levelFor(strongElo));
  const weak = forMatch(levelFor(weakElo));
  const [es, ew] = [await newEngine(), await newEngine()];
  const score: Score = { strong: 0, weak: 0, draws: 0, adjudicated: 0 };
  for (let g = 0; g < GAMES; g++) {
    const strongIsWhite = g % 2 === 0;
    const r = await playGame(strongIsWhite ? [es, strong] : [ew, weak], strongIsWhite ? [ew, weak] : [es, strong]);
    if (r === 'draw') score.draws++;
    else if (r === 'adjudicated') score.adjudicated++;
    else if ((r === 'w') === strongIsWhite) score.strong++;
    else score.weak++;
  }
  // Written to a file because Vitest doesn't reliably show console output of passing tests.
  mkdirSync('test-results', { recursive: true });
  appendFileSync('test-results/bot-match.txt', `${new Date().toISOString()} ${strongElo} vs ${weakElo}, ${GAMES} games: ${JSON.stringify(score)}
`);
  return score;
}

describe('bot strength ordering', () => {
  it('1200 beats 400 in most games', async () => {
    const s = await match(1200, 400);
    expect(s.strong).toBeGreaterThan(GAMES / 2);
  });

  it('2000 beats 1200 in most games', async () => {
    const s = await match(2000, 1200);
    expect(s.strong).toBeGreaterThan(GAMES / 2);
  });
});
