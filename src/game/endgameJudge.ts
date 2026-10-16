// Pure judging for the endgame drills: has the user won, held, or let it slip? The tablebase is the judge when it
// answers; an engine eval stands in when it can't (offline).
import { Chess } from 'chess.js';
import type { Score } from '../engine/types';
import { flipOutcome, type TbOutcome } from '../engine/tablebase';
import type { Color } from './types';

/** 'rules' = the game ended (mate, stalemate, repetition…), no lookup needed. */
export type Verdict = { outcome: TbOutcome; source: 'tablebase' | 'engine' | 'rules' };

export type DrillStatus = 'playing' | 'passed' | 'failed';

/** One move of the user's, with what it did to the result. Outcomes are always the user's. */
export type DrillStep = {
  /** Index of this move in the drill's move list. */
  ply: number;
  /** Full-move number the move was played on. */
  moveNo: number;
  san: string;
  uci: string;
  fenBefore: string;
  before: Verdict | null;
  after: Verdict | null;
};

const RANK: Record<TbOutcome, number> = { loss: 0, draw: 1, win: 2 };

/** An engine score (White's view) as an outcome for `user`: at least `winCp` = win, at most -`winCp` = loss. */
export function scoreOutcome(score: Score, user: Color, winCp: number): TbOutcome {
  let o: TbOutcome;
  if ('mate' in score) o = score.mate > 0 ? 'win' : 'loss';
  else o = score.cp >= winCp ? 'win' : score.cp <= -winCp ? 'loss' : 'draw';
  return user === 'w' ? o : flipOutcome(o);
}

/** The first user move that made the result worse (win to draw, draw to loss…), when both sides of it are known. */
export function findSlip(steps: DrillStep[]): DrillStep | null {
  for (const s of steps) {
    if (s.before && s.after && RANK[s.after.outcome] < RANK[s.before.outcome]) return s;
  }
  return null;
}

/** "You let it slip on move 12 (Kd5): that position went from win to draw." */
export function slipText(step: DrillStep): string {
  const from = step.before?.outcome ?? 'win';
  const to = step.after?.outcome ?? 'draw';
  const by = step.after?.source === 'engine' ? ' (engine check, tablebase unavailable)' : '';
  return `You let it slip on move ${step.moveNo} (${step.san}): that position went from ${from} to ${to}${by}.`;
}

/** Pieces of one colour, by type. */
function material(chess: Chess, color: Color): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) out[p.type] = (out[p.type] ?? 0) + 1;
  return out;
}

/**
 * A "convert" win drill is done once the user has a queen (the pawn promoted), or the defender is down to a bare
 * king against a rook or queen: from there it's one of the basic mates.
 */
export function converted(fen: string, user: Color): boolean {
  const chess = new Chess(fen);
  const mine = material(chess, user);
  const theirs = material(chess, user === 'w' ? 'b' : 'w');
  if ((mine.q ?? 0) > 0) return true;
  const bare = Object.keys(theirs).every((t) => t === 'k');
  return bare && (mine.r ?? 0) > 0;
}

/** Why a finished game is drawn, in words; null when it isn't. */
export function drawReason(chess: Chess): string | null {
  if (chess.isStalemate()) return 'Stalemate';
  if (chess.isInsufficientMaterial()) return 'Draw: not enough material to mate';
  if (chess.isThreefoldRepetition()) return 'Draw by repetition';
  if (chess.isDraw()) return 'Draw by the 50-move rule';
  return null;
}

export type JudgeInput = {
  goal: 'win' | 'draw';
  winBy?: 'mate' | 'convert';
  /** Move limit (win) or moves to hold (draw), counted in the user's moves. */
  limit: number;
  user: Color;
  /** The current position, with its history (for repetition). */
  chess: Chess;
  /** Moves the user has played so far. */
  userMoves: number;
  /** The latest known result for the user (null = unknown: no tablebase and no engine eval yet). */
  current: Verdict | null;
};

export type Judgement = { status: DrillStatus; reason: string };

/** Where the drill stands. Called after each move. */
export function judgeDrill(j: JudgeInput): Judgement {
  const { chess } = j;
  if (chess.isCheckmate()) {
    return chess.turn() === j.user
      ? { status: 'failed', reason: 'You were checkmated.' }
      : { status: 'passed', reason: 'Checkmate!' };
  }
  const draw = drawReason(chess);
  if (draw) {
    return j.goal === 'draw'
      ? { status: 'passed', reason: `${draw}: you held it.` }
      : { status: 'failed', reason: `${draw}: the win got away.` };
  }
  if (j.goal === 'win') {
    if (j.current && j.current.outcome !== 'win') {
      return { status: 'failed', reason: `That position is no longer a win (${j.current.source === 'tablebase' ? 'tablebase' : 'engine'}).` };
    }
    if (j.winBy === 'convert' && converted(chess.fen(), j.user) && j.current?.outcome !== undefined) {
      return { status: 'passed', reason: 'Converted: the rest is a basic mate.' };
    }
    if (j.userMoves >= j.limit) {
      return { status: 'failed', reason: `Not finished within ${j.limit} moves.` };
    }
    return { status: 'playing', reason: '' };
  }
  if (j.current?.outcome === 'loss') {
    return { status: 'failed', reason: `That position is lost (${j.current.source === 'tablebase' ? 'tablebase' : 'engine'}).` };
  }
  if (j.userMoves >= j.limit) {
    return { status: 'passed', reason: `Held for ${j.limit} moves.` };
  }
  return { status: 'playing', reason: '' };
}

/** Rebuilds the drill's game from its start FEN and UCI moves (keeps the history repetition needs). */
export function replayDrill(fen: string, ucis: string[]): Chess {
  const chess = new Chess(fen);
  for (const u of ucis) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return chess;
}
