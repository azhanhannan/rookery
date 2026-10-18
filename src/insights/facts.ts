// Per-game facts for Insights (pure): one small record per reviewed game, built from the stored review plus
// chess.js. No engine, no network. Rebuilt whenever INSIGHTS.factsVersion changes.
import { INSIGHTS, REVIEW } from '../config/tunables';
import { myColor } from '../game/myColor';
import type { Color, GameRecord, PlayerInfo } from '../game/types';
import { categoryFor } from '../rating/glicko';
import { captionFact, captionInputFor } from '../review/captions';
import { scoreWin } from '../review/classify';
import { reviewFits } from '../review/reviewView';
import type { GameReview, PositionReview } from '../review/types';
import { motifFor, newThreat } from './motifs';
import type { Coverage, Episode, ExclusionReason, GameFacts, HistoryEntry, MoveFact, NotableMove, OpponentType, Phase } from './types';

/** Fields another branch adds to GameRecord; read through a narrow type so this module doesn't depend on it. */
type WithMeta = GameRecord & { endedAt?: string; takebacks?: number };

const winFor = (winWhite: number, color: Color) => (color === 'w' ? winWhite : 100 - winWhite);

/** Non-pawn, non-king pieces, all men, and each side's pieces still on its home rank. */
function census(fen: string): { pieces: number; men: number; backW: number; backB: number } {
  const board = fen.split(' ')[0];
  let pieces = 0;
  let men = 0;
  const ranks = board.split('/');
  const count = (rank: string, upper: boolean) => [...rank].filter((c) => /[a-z]/i.test(c) && (c === c.toUpperCase()) === upper).length;
  for (const c of board) {
    if (!/[a-z]/i.test(c)) continue;
    men++;
    if (!'pPkK'.includes(c)) pieces++;
  }
  return { pieces, men, backW: count(ranks[7] ?? '', true), backB: count(ranks[0] ?? '', false) };
}

/**
 * Phase of each move (index ply - 1) from the positions before it. The middlegame starts at the first
 * position with ≤ `middlePieces` pieces or a back rank down to ≤ `backRankSparse` pieces, by ply
 * `openingMaxPly` at the latest; book moves are always opening. The endgame starts at the first position with
 * ≤ `endPieces` pieces or ≤ `endMen` men, and lasts.
 */
export function phasesOf(fens: string[], bookPlies: number): Phase[] {
  const t = INSIGHTS.phase;
  let middleAt = t.openingMaxPly;
  let endAt = Infinity;
  fens.forEach((fen, i) => {
    const c = census(fen);
    if (middleAt === t.openingMaxPly && i < middleAt && (c.pieces <= t.middlePieces || c.backW <= t.backRankSparse || c.backB <= t.backRankSparse)) {
      middleAt = i;
    }
    if (endAt === Infinity && (c.pieces <= t.endPieces || c.men <= t.endMen)) endAt = i;
  });
  const openingUntil = Math.max(bookPlies, middleAt);
  // Move `ply` is played from position ply - 1.
  return fens.slice(0, -1).map((_, i): Phase => (i >= endAt ? 'E' : i + 1 <= openingUntil ? 'O' : 'M'));
}

/** [base, increment] in ms for "base+inc" (seconds), or null when untimed. */
function parseTimeControl(tc: string | undefined): [number, number] | null {
  const m = tc ? /^(\d+)\+(\d+)$/.exec(tc) : null;
  return m ? [Number(m[1]) * 1000, Number(m[2]) * 1000] : null;
}

const isTimeLoss = (termination?: string) => !!termination && /time|forfeit|flag/i.test(termination) && !/insufficient/i.test(termination);
const isAbandon = (termination?: string) => !!termination && /abandon/i.test(termination);

/** Person, Maia bot, or Stockfish level. A bot side with no engine field is Stockfish (saved before Maia). */
export function opponentTypeOf(p: PlayerInfo): OpponentType {
  if (!p.isBot) return 'human';
  return p.engine === 'maia' ? 'maia' : 'stockfish';
}

/**
 * Whether the move from `pos` was critical (only one move holds), from the stored second line. Undefined for a
 * version 1 review, which never kept that line: absent there must not read as "only one legal move".
 */
export function criticalAt(review: GameReview, pos: PositionReview, color: Color): boolean | undefined {
  if ((review.version ?? 1) < 2) return undefined;
  if (!pos.bestMove || !pos.score) return undefined;
  // Version 2 without a second line: one legal move, so nothing to choose.
  if (!pos.second) return false;
  return scoreWin(pos.score, color) - scoreWin(pos.second.score, color) >= REVIEW.greatGap;
}

function scoreOf(result: GameRecord['result'], color: Color): number {
  if (result === '1/2-1/2') return 0.5;
  return (result === '1-0') === (color === 'w') ? 1 : 0;
}

/** First own move (after `afterPly`) starting a run of `run` consecutive own moves that all pass `test`. */
function episodeOf(moves: MoveFact[], test: (win: number) => boolean): Episode | undefined {
  const { afterPly, run } = INSIGHTS.episode;
  let streak = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.ply <= afterPly || !test(m.winBefore)) {
      streak = 0;
      continue;
    }
    streak++;
    if (streak >= run) {
      const start = moves[i - run + 1];
      return { startPly: start.ply, win: start.winBefore };
    }
  }
  return undefined;
}

/** Why `record` is left out of Insights, or null when it qualifies. */
export function exclusionReason(record: GameRecord, userColor?: Color | null): ExclusionReason | null {
  const meta = record as WithMeta;
  if (!myColor(record, userColor)) return 'no-side';
  if (record.result === '*') return 'unfinished';
  if (record.practice || (meta.takebacks ?? 0) > 0) return 'practice';
  if (!reviewFits(record, record.review)) return 'unreviewed';
  if (record.review.depth < INSIGHTS.minReviewDepth) return 'shallow-review';
  const color = myColor(record, userColor)!;
  const own = record.review.moves.filter((m) => m.color === color).length;
  if (own < INSIGHTS.minOwnMoves) return 'too-short';
  return null;
}

/** Facts for one game, or null when it is excluded (see `exclusionReason`). */
export function buildGameFacts(record: GameRecord, userColor?: Color | null): GameFacts | null {
  if (exclusionReason(record, userColor)) return null;
  const meta = record as WithMeta;
  const review = record.review as GameReview;
  const color = myColor(record, userColor)!;
  const opponentInfo = color === 'w' ? record.black : record.white;
  const fens = review.positions.map((p) => p.fen);
  const bookPlies = review.opening?.bookPlies ?? 0;
  const phases = phasesOf(fens, bookPlies);
  const tc = parseTimeControl(record.timeControl);
  const trouble = tc ? Math.max(INSIGHTS.timeTrouble.floorMs, INSIGHTS.timeTrouble.baseShare * tc[0]) : null;

  const moves: MoveFact[] = [];
  const notable: (NotableMove & { order: number })[] = [];
  let prevClock = tc?.[0];
  for (const m of review.moves) {
    if (m.color !== color) continue;
    const i = m.ply;
    const input = captionInputFor(review, i)!;
    const fact = captionFact(input);
    const threat = newThreat(fens[i - 2], fens[i - 1], color);
    const inBook = i <= bookPlies;
    const motif = inBook
      ? undefined
      : motifFor({ fact, fenBefore: fens[i - 1], fenAfter: fens[i], lineAfter: input.lineAfter, me: color, winBefore: m.winBefore, loss: m.loss, threat });
    const mf: MoveFact = {
      ply: i,
      phase: phases[i - 1],
      winBefore: m.winBefore,
      winAfter: m.winAfter,
      loss: m.loss,
      label: m.label,
      inBook,
      oppThreat: threat !== null,
    };
    const critical = criticalAt(review, review.positions[i - 1], color);
    if (critical !== undefined) mf.critical = critical;
    if (fact) mf.caption = fact.kind;
    if (motif) mf.motif = motif;
    const clock = record.moves[i - 1]?.clockMs;
    if (tc && clock !== undefined) {
      mf.clockMs = clock;
      if (prevClock !== undefined) {
        mf.spentMs = Math.max(0, prevClock - clock + tc[1]);
        mf.timeTrouble = prevClock < trouble!;
      }
      prevClock = clock;
    }
    moves.push(mf);
    if (!inBook && m.loss >= INSIGHTS.eventLoss) {
      notable.push({
        order: m.loss,
        ply: i,
        phase: mf.phase,
        fenBefore: fens[i - 1],
        san: m.san,
        uci: m.uci,
        bestMove: m.bestMove,
        loss: m.loss,
        motif: motif ?? 'other',
      });
    }
  }

  const result = record.result as GameFacts['result'];
  const score = scoreOf(result, color);
  const finalWin = winFor(review.positions[review.positions.length - 1].winWhite, color);
  const flagLoss = score === 0 && (isTimeLoss(record.termination) || isAbandon(record.termination));
  const { winAt, loseAt, strongWinAt } = INSIGHTS.episode;
  const facts: GameFacts = {
    factsVersion: INSIGHTS.factsVersion,
    gameId: record.id,
    playedAt: meta.endedAt ?? record.createdAt,
    createdAt: record.createdAt,
    color,
    opponent: opponentTypeOf(opponentInfo),
    opponentName: opponentInfo.name,
    speed: categoryFor(record.timeControl) ?? 'untimed',
    result,
    score,
    reviewDepth: review.depth,
    bookPlies,
    finalWin,
    clockOnly: flagLoss && finalWin >= INSIGHTS.flagNotWorseWin,
    lostOnTimeWhileBetter: score === 0 && isTimeLoss(record.termination) && finalWin >= INSIGHTS.flagBetterWin,
    hasClock: moves.some((m) => m.clockMs !== undefined),
    moves,
    notable: notable
      .sort((a, b) => b.order - a.order || a.ply - b.ply)
      .slice(0, INSIGHTS.notableMoves)
      .map(({ order: _order, ...n }) => n),
  };
  if (meta.endedAt) facts.endedAt = meta.endedAt;
  if (opponentInfo.elo !== undefined) facts.opponentElo = opponentInfo.elo;
  if (record.timeControl) facts.timeControl = record.timeControl;
  if (record.termination) facts.termination = record.termination;
  if (review.opening?.eco) facts.eco = review.opening.eco;
  if (review.opening?.name) facts.opening = review.opening.name;
  const conversion = episodeOf(moves, (w) => w >= winAt);
  const strong = episodeOf(moves, (w) => w >= strongWinAt);
  const save = episodeOf(moves, (w) => w <= loseAt);
  if (conversion) facts.conversion = conversion;
  if (strong) facts.conversionStrong = strong;
  if (save) facts.save = save;
  return facts;
}

/** Facts for every qualifying game, plus what was left out and why. */
export function buildAllFacts(records: GameRecord[], userColor?: Color | null): { facts: GameFacts[]; coverage: Coverage } {
  const facts: GameFacts[] = [];
  const excluded: Coverage['excluded'] = {};
  for (const r of records) {
    const why = exclusionReason(r, userColor);
    if (why) {
      excluded[why] = (excluded[why] ?? 0) + 1;
      continue;
    }
    const f = buildGameFacts(r, userColor);
    if (f) facts.push(f);
  }
  return { facts, coverage: { total: records.length, included: facts.length, excluded } };
}

/** Every finished game with a side, in time order: for "the game after a loss" (reviews not needed). */
export function historyOf(records: GameRecord[], userColor?: Color | null): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const r of records) {
    const color = myColor(r, userColor);
    if (!color || r.result === '*') continue;
    out.push({ gameId: r.id, playedAt: (r as WithMeta).endedAt ?? r.createdAt, score: scoreOf(r.result, color) });
  }
  return out.sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

