import { Chess } from 'chess.js';
import { NO_MISSED_MATE_FROM_ELO } from '../config/tunables';
import type { BotLevel, Engine, EngineLine } from '../engine/types';

function legalUcis(chess: Chess): string[] {
  return chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
}

/** Uniform pick; clamped because an rng may return exactly 1 in tests. */
function pick<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Lines 2..k weighted by 1/rank, so line 2 is twice as likely as line 4. */
function pickWeaker(lines: EngineLine[], rng: () => number): EngineLine {
  const rest = lines.slice(1);
  const weights = rest.map((l) => 1 / l.rank);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rest.length; i++) {
    roll -= weights[i];
    if (roll < 0) return rest[i];
  }
  return rest[rest.length - 1];
}

function isMateInOne(line: EngineLine, whiteToMove: boolean): boolean {
  return 'mate' in line.score && line.score.mate === (whiteToMove ? 1 : -1);
}

async function chooseWeakened(engine: Engine, fen: string, level: BotLevel, rng: () => number, legal: string[]): Promise<string> {
  await engine.setOption('UCI_LimitStrength', false);
  const result = await engine.analyze(fen, { depth: level.depth, multiPV: level.multiPV });
  if (result.lines.length === 0) throw new Error(`engine returned no lines for ${fen}`);
  // Engine output is untrusted: drop any line whose move isn't legal here.
  const lines = result.lines.filter((l) => legal.includes(l.move.toLowerCase()));
  if (lines.length === 0) return pick(legal, rng);

  const whiteToMove = fen.split(' ')[1] !== 'b';
  if (level.elo >= NO_MISSED_MATE_FROM_ELO) {
    const mate = lines.find((l) => isMateInOne(l, whiteToMove));
    if (mate) return mate.move.toLowerCase();
  }
  if (rng() < (level.pBlunder ?? 0)) return pick(legal, rng);
  if (lines.length === 1 || rng() < (level.pBest ?? 1)) return lines[0].move.toLowerCase();
  return pickWeaker(lines, rng).move.toLowerCase();
}

/** Picks the bot's move for `fen` at `level`. Returns a UCI move. Does not wait the think time. */
export async function chooseMove(engine: Engine, fen: string, level: BotLevel, rng: () => number = Math.random): Promise<string> {
  const legal = legalUcis(new Chess(fen));
  if (legal.length === 0) throw new Error(`no legal moves in ${fen}`);

  if (level.mode === 'weakened') return chooseWeakened(engine, fen, level, rng, legal);

  if (level.mode === 'limit') {
    const range = engine.eloRange();
    const elo = range ? Math.min(range.max, Math.max(range.min, level.elo)) : level.elo;
    await engine.setOption('UCI_LimitStrength', true);
    await engine.setOption('UCI_Elo', elo);
  } else {
    await engine.setOption('UCI_LimitStrength', false);
  }
  const move = (await engine.goMovetime(fen, thinkTime(level, rng))).toLowerCase();
  return legal.includes(move) ? move : pick(legal, rng);
}

/** Random think time inside the level's range, in ms. */
export function thinkTime(level: BotLevel, rng: () => number = Math.random): number {
  const [lo, hi] = level.thinkMs;
  return lo + (hi - lo) * rng();
}
