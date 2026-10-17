// Coach side of Insights (pure, chess.js only): which buckets a coach may set as a student's Focus, the
// homework item for an evidence position, a card's homework set, and plain names for buckets.
// Used by the server (server/src/routes/insights.ts) and the coach pages (src/app/coach/InsightsTab.tsx).
import { COACH } from '../config/tunables';
import type { CoachEvidence, HomeworkItem } from '../api/types';
import type { Color, GameRecord } from '../game/types';
import { CELL_IDS, OVERLAY_IDS } from '../insights/buckets';
import type { BucketId, Motif, Phase } from '../insights/types';
import { positionKey, solutionLine } from '../puzzles/harvest';
import { reviewFits } from '../review/reviewView';
import { homeworkItemError } from './homework';

const ALL_BUCKETS: ReadonlySet<string> = new Set<string>([...CELL_IDS, ...OVERLAY_IDS]);

/** A bucket a coach can set as the Focus: a real ledger bucket, never an 'other' cell (not a prescription). */
export function isFocusBucket(id: unknown): id is BucketId {
  return typeof id === 'string' && ALL_BUCKETS.has(id) && !id.endsWith(':other');
}

/**
 * The position before the player's move at `ply` (1-based) as homework: the engine's best move (extended
 * through a forced mate, as My mistakes does), with its source. Null when the game has no fitting review,
 * the move isn't the player's, or there's no legal line.
 */
export function evidenceHomeworkItem(record: GameRecord, ply: number, color: Color): HomeworkItem | null {
  if (!reviewFits(record, record.review)) return null;
  const pos = record.review.positions[ply - 1];
  const move = record.review.moves[ply - 1];
  if (!pos || !move || move.color !== color) return null;
  const solution = solutionLine(pos, color);
  if (!solution) return null;
  const item: HomeworkItem = { fen: pos.fen, solution, source: { gameClientId: record.id, ply } };
  return homeworkItemError(item) ? null : item;
}

/** A card's evidence as one homework set: usable positions only, each position once, at most COACH.maxHomeworkItems. */
export function homeworkFromEvidence(evidence: CoachEvidence[]): HomeworkItem[] {
  const seen = new Set<string>();
  const out: HomeworkItem[] = [];
  for (const e of evidence) {
    if (!e.homework || out.length >= COACH.maxHomeworkItems) continue;
    const key = positionKey(e.homework.fen);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e.homework);
  }
  return out;
}

const PHASE_NAME: Record<Phase, string> = { O: 'Opening', M: 'Middlegame', E: 'Endgame' };
const MOTIF_NAME: Record<Motif, string> = {
  hanging: 'pieces left hanging',
  fork: 'forks allowed',
  'missed-free-piece': 'free pieces missed',
  'missed-mate': 'mates missed',
  'allowed-mate': 'mates allowed',
  'back-rank': 'back-rank mates',
  'ignored-threat': 'threats ignored',
  stalemate: 'stalemate given away',
  other: 'other losses',
};

export const phaseName = (p: Phase) => PHASE_NAME[p];
export const motifName = (m: Motif) => MOTIF_NAME[m];

/** "Endgame: pieces left hanging", "Time trouble", "Converting wins". */
export function bucketName(id: BucketId): string {
  if (id === 'time-trouble') return 'Time trouble';
  if (id === 'conversion') return 'Converting wins';
  const [phase, motif] = id.split(':') as [Phase, Motif];
  return `${PHASE_NAME[phase]}: ${MOTIF_NAME[motif]}`;
}

/** Default homework title for a card, within COACH.maxTitleChars. */
export function homeworkTitleFor(id: BucketId): string {
  return bucketName(id).slice(0, COACH.maxTitleChars);
}
