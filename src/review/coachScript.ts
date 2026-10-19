// The coach walkthrough's script (pure): a stored review and a Review style in, the steps Rookie says out.
// An opening line, one step per key moment, and a closing line. Every sentence comes from the review: the
// result, the accuracy, the engine's win chances and best move, and a proven caption when a rule has one.
// When no rule proves why a move was weak, the step says only what the engine numbers show.
import { COACH_WALKTHROUGH } from '../config/tunables';
import type { Color, GameRecord } from '../game/types';
import { phasesOf } from '../insights/facts';
import { moveMotif } from '../insights/moveMotif';
import { trainForMotif, trainForPhase } from '../insights/train';
import type { Motif, Phase, TrainTarget } from '../insights/types';
import { captionFactForMove, captionText } from './captions';
import { analystScore, biggestMistake, keyMoments, tierOf, type ReviewStyle } from './reviewStyle';
import { retryCandidates, retryColors } from './reviewView';
import type { GameReview, MoveReview } from './types';

export type CoachStep = {
  kind: 'intro' | 'moment' | 'outro';
  /** Short heading: "Moment 2 of 4 · 9. h3". */
  title: string;
  /** What Rookie says, one sentence or two per entry. */
  lines: string[];
  /** Board position to show (positions index); undefined = leave the board where it is. */
  ply?: number;
  /** The key move (1-based ply) this step is about. */
  movePly?: number;
  /** "Find the better move": index into the review screen's retry candidates, when the move is one of them. */
  retryIndex?: number;
  /** "Show me": the engine line from positions[lineBase] exists. */
  lineBase?: number;
  /** "Train this" (outro only). */
  train?: TrainTarget;
};

export type CoachInput = {
  record: GameRecord;
  review: GameReview;
  style: ReviewStyle;
  /** The accuracy notes the summary cards show ("About your level"), per colour; none for Analyst. */
  accuracyNotes?: { w: string | null; b: string | null };
};

type Band = 'winning' | 'better' | 'even' | 'worse' | 'losing';
const BAND_WORDS: Record<Band, string> = {
  winning: 'winning',
  better: 'better',
  even: 'about even',
  worse: 'worse',
  losing: 'losing',
};
const BAND_RANK: Record<Band, number> = { losing: 0, worse: 1, even: 2, better: 3, winning: 4 };

/** Plain words for a win chance (0-100, the mover's view). */
export function winBand(win: number, cfg = COACH_WALKTHROUGH.bands): Band {
  if (win >= cfg.winning) return 'winning';
  if (win >= cfg.better) return 'better';
  if (win > cfg.worse) return 'even';
  if (win > cfg.losing) return 'worse';
  return 'losing';
}

const PHASE_WORDS: Record<Phase, string> = { O: 'the opening', M: 'the middlegame', E: 'the endgame' };

/** The motif a weak move is filed under, as a short noun phrase for the closing line. */
const MOTIF_WORDS: Record<Exclude<Motif, 'other'>, string> = {
  hanging: 'a piece left where it could be taken',
  fork: 'walking into a fork',
  'missed-free-piece': 'a free piece left on the board',
  'missed-mate': 'a missed checkmate',
  'allowed-mate': 'a checkmate allowed',
  'back-rank': 'a back-rank mate allowed',
  'ignored-threat': 'a threat left unanswered',
  stalemate: 'a win given away as stalemate',
};

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black');
const pct = (x: number) => `${Math.round(x)}%`;

function moveTitle(m: MoveReview): string {
  const no = Math.ceil(m.ply / 2);
  return m.color === 'w' ? `${no}. ${m.san}` : `${no}... ${m.san}`;
}

/** "you" when the walkthrough speaks to one player and the move is theirs, else the side's name. */
function subject(m: MoveReview, you: Color | null): { who: string; was: string; possessive: string } {
  if (you === m.color) return { who: 'you', was: 'were', possessive: 'your' };
  return { who: sideName(m.color), was: 'was', possessive: `${sideName(m.color)}'s` };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function resultLine(record: GameRecord, you: Color | null): string {
  const r = record.result;
  if (r === '*') return 'The game was not finished.';
  if (r === '1/2-1/2') return 'The game was a draw.';
  const winner: Color = r === '1-0' ? 'w' : 'b';
  if (you) return winner === you ? `You won with ${sideName(you)}.` : `You lost with ${sideName(you)}.`;
  return `${sideName(winner)} won.`;
}

function accuracyLine(input: CoachInput, you: Color | null): string | null {
  const { review, style, accuracyNotes } = input;
  const acc = { w: review.white.accuracy, b: review.black.accuracy };
  if (style === 'analyst') {
    const parts = (['w', 'b'] as Color[]).filter((c) => acc[c] !== null).map((c) => `${sideName(c)} ${acc[c]!.toFixed(1)}`);
    return parts.length ? `Accuracy: ${parts.join(', ')}.` : null;
  }
  // Learner and Club speak about the player's side only (both sides when we can't tell which is yours).
  const sides: Color[] = you ? [you] : ['w', 'b'];
  const said = sides
    .map((c) => {
      const note = accuracyNotes?.[c] ?? null;
      const a = acc[c];
      const whose = you ? 'Your accuracy' : `${sideName(c)}'s accuracy`;
      if (style === 'learner') return note ? `${whose}: ${note.charAt(0).toLowerCase()}${note.slice(1)}.` : null;
      if (a === null) return null;
      return `${whose} was ${pct(a)}${note ? ` (${note.charAt(0).toLowerCase()}${note.slice(1)})` : ''}.`;
    })
    .filter((s): s is string => s !== null);
  return said.length ? said.join(' ') : null;
}

/** What was at stake: the mover's win chance before and after, in the style's words or numbers. */
function stakeLine(m: MoveReview, review: GameReview, style: ReviewStyle, you: Color | null): string {
  const s = subject(m, you);
  const before = winBand(m.winBefore);
  const after = winBand(m.winAfter);
  if (style === 'analyst') {
    const evBefore = analystScore(review.positions[m.ply - 1]?.score);
    const evAfter = analystScore(review.positions[m.ply]?.score);
    return `${cap(s.possessive)} win chance ${pct(m.winBefore)} → ${pct(m.winAfter)} (eval ${evBefore} → ${evAfter}).`;
  }
  const num = (x: number) => (style === 'club' ? ` (${pct(x)} win chance)` : '');
  if (before === after) return `Before and after this move, ${s.who} ${s.was} ${BAND_WORDS[before]}${num(m.winAfter)}.`;
  return `Before this move, ${s.who} ${s.was} ${BAND_WORDS[before]}${num(m.winBefore)}. After it, ${s.who} ${s.was} ${BAND_WORDS[after]}${num(m.winAfter)}.`;
}

/** The engine-only sentence for a move no caption rule explains: how the bands moved, and the engine's move. */
function numbersLine(m: MoveReview, nameBest: boolean): string {
  const before = winBand(m.winBefore);
  const after = winBand(m.winAfter);
  const playedBest = !m.bestSan || m.bestMove === m.uci;
  if (playedBest) return 'The engine would have played this move too.';
  let what: string;
  if (tierOf(m.label) === 'good') what = 'A small slip';
  else if (BAND_RANK[before] >= BAND_RANK.better && BAND_RANK[after] < BAND_RANK[before]) what = 'This let the advantage slip';
  else if (BAND_RANK[after] < BAND_RANK[before]) what = 'This made the position harder';
  else what = 'This gave away some of the win chance';
  return nameBest ? `${what}: the engine preferred ${m.bestSan}.` : `${what}. The engine found a better move here.`;
}

/** A caption speaks to the mover ("your knight"); about the other side's move it's only kept when it doesn't. */
const SECOND_PERSON = /\byou(r)?\b/i;

/** The steps of the walkthrough, in order: intro, one per key moment (at most COACH_WALKTHROUGH.maxMoments), outro. */
export function coachScript(input: CoachInput): CoachStep[] {
  const { record, review, style } = input;
  const colors = retryColors(record);
  const you: Color | null = colors.length === 1 ? colors[0] : null;
  const moments = keyMoments(review).slice(0, COACH_WALKTHROUGH.maxMoments);
  const candidates = retryCandidates(record, review);
  const steps: CoachStep[] = [];

  // Opening line.
  const intro = [resultLine(record, you)];
  const acc = accuracyLine(input, you);
  if (acc) intro.push(acc);
  intro.push(
    moments.length === 0
      ? 'There were no big swings in this game.'
      : `${moments.length === 1 ? 'One moment' : `${moments.length} moments`} decided this game. Let's look at ${moments.length === 1 ? 'it' : 'them'} one at a time.`,
  );
  steps.push({ kind: 'intro', title: 'Coach walkthrough', lines: intro });

  // One step per key moment.
  moments.forEach((ply, i) => {
    const m = review.moves[ply - 1];
    if (!m) return;
    const retryIndex = candidates.findIndex((c) => c.ply === ply);
    const lineBase = review.positions[ply - 1]?.bestLine.length ? ply - 1 : undefined;
    const lines = [
      you === m.color
        ? `Move ${Math.ceil(ply / 2)}: your turn as ${sideName(m.color)}. You played ${m.san}.`
        : `Move ${Math.ceil(ply / 2)}: ${sideName(m.color)} to play, and played ${m.san}.`,
      stakeLine(m, review, style, you),
    ];
    const fact = captionFactForMove(review, ply);
    const text = fact ? captionText(fact) : null;
    // About the other side's move, a caption in the second person would read as if it were yours.
    const usable = text && (you === null || you === m.color || !SECOND_PERSON.test(text)) ? text : null;
    lines.push(usable ?? numbersLine(m, retryIndex < 0));
    steps.push({
      kind: 'moment',
      title: `Moment ${i + 1} of ${moments.length} · ${moveTitle(m)}`,
      lines,
      ply: ply - 1,
      movePly: ply,
      retryIndex: retryIndex >= 0 ? retryIndex : undefined,
      lineBase,
    });
  });

  // Closing line: the one thing to take away.
  const biggest = biggestMistake(review, colors);
  const outro: string[] = [];
  let train: TrainTarget | undefined;
  if (!biggest) {
    outro.push(you ? 'The engine found no mistakes for you in this game. Well played.' : 'The engine found no mistakes in this game.');
  } else {
    const fens = review.positions.map((p) => p.fen);
    const phase = phasesOf(fens, review.opening?.bookPlies ?? 0)[biggest.ply - 1];
    const motif = moveMotif({ ...record, review }, biggest.ply, biggest.color);
    const whose = you === biggest.color ? 'Your biggest mistake' : `${sideName(biggest.color)}'s biggest mistake`;
    outro.push(`${whose} was ${moveTitle(biggest)}${phase ? `, in ${PHASE_WORDS[phase]}` : ''}. That's the one to remember.`);
    if (motif !== 'other') outro.push(`It was ${MOTIF_WORDS[motif]}.`);
    train = (motif !== 'other' ? trainForMotif(motif) : null) ?? (phase ? trainForPhase(phase) : undefined);
  }
  steps.push({
    kind: 'outro',
    title: 'The takeaway',
    lines: outro,
    ply: biggest ? biggest.ply - 1 : undefined,
    movePly: biggest?.ply,
    train,
  });
  return steps;
}
