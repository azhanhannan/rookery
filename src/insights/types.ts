// Insights data model (pure types). Facts are derived from a reviewed GameRecord and rebuilt, never migrated,
// when INSIGHTS.factsVersion changes. Labels are kept for display only; rates use `loss` and the tunables.
import type { RatingCategory } from '../api/types';
import type { Color, GameResult } from '../game/types';
import type { CaptionKind } from '../review/captions';
import type { MoveLabel } from '../review/types';
import type { ReviewStyle } from '../review/reviewStyle';
import type { Estimate } from './stats';

/** Opening, middlegame, endgame (simplified Lichess Divider, `INSIGHTS.phase`). */
export type Phase = 'O' | 'M' | 'E';
export const PHASES: readonly Phase[] = ['O', 'M', 'E'];

/**
 * What a weak move is filed under. Each is proven on the board, or the move goes to 'other':
 * - hanging: the reply wins a piece (left undefended, lost for free, lost to a cheaper piece)
 * - fork, missed-free-piece, missed-mate (in 1-2), allowed-mate (in 1-2): the caption rules
 * - back-rank: an allowed mate that lands on the king's home rank, behind its own pieces
 * - ignored-threat: the opponent's last move attacked a piece (or threatened mate in 1) and this move left it
 * - stalemate: this move stalemated the opponent from a winning position
 */
export type Motif =
  | 'hanging'
  | 'fork'
  | 'missed-free-piece'
  | 'missed-mate'
  | 'allowed-mate'
  | 'back-rank'
  | 'ignored-threat'
  | 'stalemate'
  | 'other';
export const MOTIFS: readonly Motif[] = [
  'hanging', 'fork', 'missed-free-piece', 'missed-mate', 'allowed-mate', 'back-rank', 'ignored-threat', 'stalemate', 'other',
];

/**
 * Who sat opposite: a person, a Maia bot (trained on human games), or a Stockfish level (weakened bots that
 * blunder on a dice roll). Opponent-dependent traits (conversion, saves) never use Stockfish-level games.
 */
export type OpponentType = 'human' | 'maia' | 'stockfish';
export const OPPONENT_TYPES: readonly OpponentType[] = ['human', 'maia', 'stockfish'];
/** The page's opponent filter: one type, both kinds of bot, or everyone. */
export type OpponentFilter = OpponentType | 'bot' | 'all';
/** Opponent types whose games count for opponent-dependent traits (decision §4): people and Maia bots. */
export const HUMAN_LIKE: readonly OpponentType[] = ['human', 'maia'];
export type Speed = RatingCategory | 'untimed';

/** Why a game is left out of Insights. */
export type ExclusionReason =
  | 'no-side' // two people at one screen, or two bots
  | 'unfinished'
  | 'practice' // practice games, or any game with takebacks
  | 'unreviewed' // no review, or one that doesn't fit the moves
  | 'shallow-review' // review depth below INSIGHTS.minReviewDepth
  | 'too-short'; // fewer than INSIGHTS.minOwnMoves own moves

/** One own move. Win chances are the player's, 0-100. */
export type MoveFact = {
  ply: number;
  phase: Phase;
  winBefore: number;
  winAfter: number;
  /** Win chance given away (points = loss / 100). */
  loss: number;
  label: MoveLabel;
  inBook: boolean;
  /**
   * Only one move holds: the best line is at least REVIEW.greatGap (win chance) better than the second.
   * False when there was a second line within the gap, or only one legal move. Absent: a version 1 review,
   * which never stored the second line (re-review to fill it).
   */
  critical?: boolean;
  /** Own clock after the move, and time spent on it (previous own clock - this one + increment). */
  clockMs?: number;
  spentMs?: number;
  /** Clock before the move under max(30 s, 10% of base). Absent in untimed games. */
  timeTrouble?: boolean;
  /** The caption rule that proved something about this move, if any. */
  caption?: CaptionKind;
  /** Proven motif; absent = no proof (the 'other' bucket when the move lost something). */
  motif?: Exclude<Motif, 'other'>;
  /** The opponent's previous move created a threat a rule can show (a newly hanging piece, or mate in 1). */
  oppThreat: boolean;
};

/** An advantage (or disadvantage) held on consecutive own moves; one per game, at the first trigger. */
export type Episode = { startPly: number; win: number };

/** A big loss kept with its position, for evidence lists and homework. */
export type NotableMove = {
  ply: number;
  phase: Phase;
  fenBefore: string;
  san: string;
  uci: string;
  bestMove?: string;
  loss: number;
  motif: Motif;
};

export type GameFacts = {
  factsVersion: number;
  gameId: string;
  /** When the game ended if recorded, else when it started: the order games are compared in. */
  playedAt: string;
  createdAt: string;
  endedAt?: string;
  color: Color;
  opponent: OpponentType;
  opponentName: string;
  opponentElo?: number;
  speed: Speed;
  timeControl?: string;
  result: Exclude<GameResult, '*'>;
  /** The player's score: 1, 0.5 or 0. */
  score: number;
  termination?: string;
  reviewDepth: number;
  bookPlies: number;
  eco?: string;
  opening?: string;
  /** Player's win chance in the final position. */
  finalWin: number;
  /**
   * A flag or abandon loss where the player was not worse: a clock event, not chess. Its moves are left out
   * of every chess metric; the clock card still counts it.
   */
  clockOnly: boolean;
  /** Lost on time with at least INSIGHTS.flagBetterWin. */
  lostOnTimeWhileBetter: boolean;
  /** Any own move carries a clock reading. */
  hasClock: boolean;
  moves: MoveFact[];
  conversion?: Episode;
  /** Same at the stricter +3.0 threshold, as a check on the first. */
  conversionStrong?: Episode;
  save?: Episode;
  notable: NotableMove[];
};

/** Games considered and why the rest were left out ("reviewed X of Y"). */
export type Coverage = { total: number; included: number; excluded: Partial<Record<ExclusionReason, number>> };

/** One finished game in time order, reviewed or not: feeds "the game after a loss". */
export type HistoryEntry = { gameId: string; playedAt: string; score: number };

/**
 * Where "Train this" goes. `href` is a route that exists today; the optional ids say which part of it
 * (UI wiring for deep links is still to do: #/lessons and #/puzzles take no sub-route yet).
 */
export type TrainTarget =
  | { kind: 'mistakes'; href: '#/puzzles'; motif: Exclude<Motif, 'other'> }
  | { kind: 'calculation'; href: '#/puzzles' }
  | { kind: 'lesson'; href: '#/lessons'; lessonId: string }
  | { kind: 'endgames'; href: '#/endgames'; drillId?: string }
  | { kind: 'openings'; href: '#/openings' }
  | { kind: 'drills'; href: '#/drills' };

/** A ledger bucket: a phase × motif cell, or an overlay that cuts across them. */
export type CellId = `${Phase}:${Motif}`;
export type BucketId = CellId | 'time-trouble' | 'conversion';

/** A position that shows the bucket, best (largest loss) first. `fenBefore` when the game kept it as notable. */
export type EvidenceRef = { gameId: string; ply: number; loss: number; fenBefore?: string };

export type LedgerBucket = {
  id: BucketId;
  phase?: Phase;
  motif?: Motif;
  /** Overlays (time trouble, conversion) overlap the cells; only cells add up to the total. */
  overlay: boolean;
  games: number;
  /** Points lost per game: raw, and shrunk toward the average cell with its 90% interval. */
  rawPointsPerGame: number;
  pointsPerGame: Estimate;
  /** Ranking key: the lower end of `pointsPerGame`. */
  lowerBound: number;
  /** Qualifying moves (non-book, not already lost) and events among them. */
  moves: number;
  events: number;
  /** Events per 100 qualifying moves: raw with exact Poisson 90% interval, and shrunk. */
  rate: Estimate;
  shrunkRate: number;
  /** Expected events in the next INSIGHTS.testable.games games at the shrunk rate. */
  expectedEvents: number;
  testable: boolean;
  /** Passes the rate-card gate (moves and events). */
  shown: boolean;
  earlyRead: boolean;
  /** Can be the Focus: shown, enough games and events, testable, has a drill, not 'other'. */
  eligible: boolean;
  train?: TrainTarget;
  evidence: EvidenceRef[];
};

export type Ledger = {
  games: number;
  /** Sum over cells: total points given away per game. */
  pointsPerGame: number;
  /** Share of the cells' points that no rule explains. */
  otherShare: number;
  /** Cells, best-ranked first (lower bound, descending). */
  cells: LedgerBucket[];
  overlays: LedgerBucket[];
};

export type InsightCard = { role: 'focus' | 'watch' | 'card'; bucket: LedgerBucket; trend?: Trend };

export type PhaseRate = {
  phase: Phase;
  moves: number;
  /** Errors (loss >= INSIGHTS.errorLoss) per 100 moves, and inaccuracy-or-worse (loss >= eventLoss). */
  errors: number;
  rate: Estimate;
  slips: number;
  slipRate: Estimate;
  /** Interval lies wholly above the pooled rate. */
  weakest: boolean;
  shown: boolean;
  earlyRead: boolean;
  train: TrainTarget;
};

export type EpisodeStat = {
  episodes: number;
  won: number;
  drawn: number;
  lost: number;
  /** (won + drawn / 2) / episodes, Wilson 90%. */
  score: Estimate;
  /** Shrunk toward the player's overall score. */
  shrunkScore: number;
  shown: boolean;
  earlyRead: boolean;
  gameIds: string[];
  /** Mean win chance (0-1) at the episodes' starts: what the positions were worth on average. 0 with none. */
  expected: number;
  /** Where each episode began, in game order. */
  starts: { gameId: string; ply: number }[];
};

export type EpisodeCard = {
  all: EpisodeStat;
  human: EpisodeStat;
  maia: EpisodeStat;
  stockfish: EpisodeStat;
  /** People and Maia bots pooled: what opponent-dependent profile lines use (never Stockfish levels). */
  humanLike: EpisodeStat;
  /** Conversion only: the +3.0 check. */
  strong?: EpisodeStat;
  train: TrainTarget;
};

export type ClockCard = {
  games: number;
  troubleMoves: number;
  troubleErrors: number;
  normalMoves: number;
  normalErrors: number;
  /** Error rate in time trouble ÷ error rate otherwise, log-scale 90% interval. */
  ratio: Estimate;
  shown: boolean;
  /** The interval of the ratio excludes 1: a comparison sentence may be shown. */
  differs: boolean;
  lostOnTimeWhileBetter: string[];
  /** Needs `critical` on moves, which stored reviews don't have yet: null until then. */
  rushedCritical: null | { moves: number; rushed: number; rushedErrors: number; slowErrors: number };
};

/**
 * Checking the opponent's threats: own qualifying moves right after the opponent's move made a threat a rule can
 * show (`oppThreat`), and how often such a move gave material or mate away (loss >= eventLoss with a motif in
 * THREAT_MOTIFS); the same event on the other moves is the comparison.
 */
export type ThreatStat = {
  moves: number;
  missed: number;
  /** missed / moves, Wilson 90%. */
  share: Estimate;
  otherMoves: number;
  otherMissed: number;
  /** Rate after a threat ÷ rate on other moves, log-scale 90% interval. */
  ratio: Estimate;
  /** Passes the rate-card gate (cardMoves moves, cardEvents events). */
  shown: boolean;
  evidence: EvidenceRef[];
};

/** Which games the model covers: count, dates, and the split by opponent type and by speed. */
export type ModelWindow = {
  games: number;
  /** playedAt of the oldest and newest game; absent with no games. */
  from?: string;
  to?: string;
  opponents: Record<OpponentType, number>;
  speeds: Partial<Record<Speed, number>>;
  /** Games per speed against people and Maia bots (the style-line gate). */
  humanLikeBySpeed: Partial<Record<Speed, number>>;
};

export type AfterLossLine = {
  afterGames: number;
  otherGames: number;
  /** Mean points given away per game. */
  afterMean: number;
  otherMean: number;
  difference: Estimate;
  /** Descriptive only; never "tilt" or "because". */
  text: string;
};

export type OpeningRow = {
  name: string;
  color: Color;
  games: number;
  won: number;
  drawn: number;
  lost: number;
  score: Estimate;
  shrunkScore: number;
  /** Against rated human opponents only; null otherwise. */
  performance: number | null;
  /** Mean opening-phase points lost per game. */
  openingLoss: number;
  /** Median full-move number of the first inaccuracy-or-worse, over games that had one. */
  firstSlipMove: number | null;
  shown: boolean;
  earlyRead: boolean;
  gameIds: string[];
  train: TrainTarget;
};

export type Trend = {
  bucketId: BucketId;
  games: number;
  /** Points lost per game, change per game played; Bayesian slope with 90% interval. */
  slope: Estimate;
  shown: boolean;
  direction: 'improving' | 'worsening' | 'no-clear-change';
};

export type InsightsOptions = {
  style: ReviewStyle;
  speed?: Speed | 'all';
  opponent?: OpponentFilter;
  now?: Date;
  /** Every finished game in order (reviewed or not), for the after-loss line. Default: the facts themselves. */
  history?: HistoryEntry[];
  coverage?: Coverage;
};

export type InsightsModel = {
  factsVersion: number;
  builtAt: string;
  /** locked: fewer than minSample.pageGames games; early: fewer than earlyGames. */
  status: 'locked' | 'early' | 'ready';
  games: number;
  /** Games still needed to unlock the page (0 when unlocked). */
  needGames: number;
  coverage?: Coverage;
  filters: { speed: Speed | 'all'; opponent: OpponentFilter };
  ledger: Ledger;
  /** The top eligible bucket, or null. */
  focus: LedgerBucket | null;
  /** By Review style: learner = Focus; club = Focus + 1 watch; analyst = top 3 (plus the full ledger). */
  cards: InsightCard[];
  phaseRates: PhaseRate[];
  conversion: EpisodeCard;
  saves: EpisodeCard;
  clock: ClockCard | null;
  threats: ThreatStat;
  window: ModelWindow;
  /** Null unless the strict rules pass (and never on Learner). */
  afterLoss: AfterLossLine | null;
  openings: OpeningRow[];
};
