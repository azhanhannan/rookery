// What Insights says, in words (pure). Plain names for buckets and motifs, the Learner sentence for a Focus,
// the Focus states, and how numbers are written (always with their n and interval).
import { drillById } from '../../endgames/drills';
import { LESSONS_COURSE } from '../../lessons/lessons';
import type { Estimate } from '../../insights/stats';
import type { BucketId, Motif, Phase, Speed, TrainTarget } from '../../insights/types';
import type { FocusStatus } from '../../insights/focus';

export const PHASE_NAME: Record<Phase, string> = { O: 'Opening', M: 'Middlegame', E: 'Endgame' };

export const MOTIF_NAME: Record<Motif, string> = {
  hanging: 'Pieces left hanging',
  fork: 'Forks allowed or missed',
  'missed-free-piece': 'Missed free pieces',
  'missed-mate': 'Missed checkmates',
  'allowed-mate': 'Allowed checkmates',
  'back-rank': 'Back-rank mates allowed',
  'ignored-threat': 'Threats left unanswered',
  stalemate: 'Stalemate given away',
  pin: 'Pins allowed or missed',
  skewer: 'Skewers allowed or missed',
  'discovered-attack': 'Discovered attacks allowed or missed',
  other: 'Other slips (no rule explains them)',
};

/** Learner's one sentence: what keeps happening, with no numbers. */
const MOTIF_PLAIN: Record<Motif, string> = {
  hanging: 'you leave a piece where it can be taken for free',
  fork: 'one piece attacks two at once — against you, or a fork you could have played',
  'missed-free-piece': 'you miss a piece you could take for free',
  'missed-mate': 'you miss a checkmate you could play',
  'allowed-mate': 'you leave your king open to a quick checkmate',
  'back-rank': 'your king gets mated on its back row',
  'ignored-threat': 'your opponent attacks something and you don’t answer it',
  stalemate: 'a winning game turns into stalemate',
  pin: 'a piece gets pinned to the king or queen — yours, or one of theirs you could have pinned',
  skewer: 'a line attack goes through one piece to win the one behind it — against you, or one you missed',
  'discovered-attack': 'a piece moves out of the way and uncovers an attack — against you, or one you missed',
  other: 'a move gives away part of your advantage',
};

export function bucketName(id: BucketId): string {
  if (id === 'time-trouble') return 'Moves in time trouble';
  if (id === 'conversion') return 'Winning positions not converted';
  const [phase, motif] = id.split(':') as [Phase, Motif];
  return `${MOTIF_NAME[motif]} · ${PHASE_NAME[phase].toLowerCase()}`;
}

/** Learner's Focus sentence. */
export function bucketPlain(id: BucketId): string {
  if (id === 'time-trouble') return 'Your moves get worse when your clock runs low.';
  if (id === 'conversion') return 'You get winning positions, and then they slip away.';
  const [phase, motif] = id.split(':') as [Phase, Motif];
  const when = phase === 'O' ? 'early in the game' : phase === 'E' ? 'in the endgame' : 'in the middle of the game';
  return `Most often, ${when}, ${MOTIF_PLAIN[motif]}.`;
}

export const SPEED_NAME: Record<Speed | 'all', string> = {
  all: 'All speeds',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  untimed: 'Untimed',
};

export function trainLabel(t: TrainTarget): string {
  switch (t.kind) {
    case 'mistakes':
      return `My mistakes: ${MOTIF_NAME[t.motif].toLowerCase()}`;
    case 'calculation':
      return 'Puzzles';
    case 'lesson':
      return `Lesson: ${LESSONS_COURSE.find((l) => l.id === t.lessonId)?.title ?? t.lessonId}`;
    case 'endgames':
      return t.drillId ? `Endgame drill: ${drillById(t.drillId)?.title ?? t.drillId}` : 'Endgame drills';
    case 'openings':
      return 'Opening trainer';
    case 'drills':
      return 'Drills';
  }
}

// --- numbers ---------------------------------------------------------------------------------------

export const pts = (x: number) => x.toFixed(2);
export const rate1 = (x: number) => x.toFixed(1);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1.2 (0.8–1.9)" with a chosen formatter. */
export function withInterval(e: Estimate, f: (x: number) => string): string {
  return `${f(e.value)} (${f(e.lo)}–${f(e.hi)})`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The Focus state as a headline and one honest line. "Improved" only on the verdict. */
export function focusStateText(s: FocusStatus, plain: boolean): { headline: string; line: string } {
  const since = `${plural(s.events, 'time')} in ${plural(s.games, 'game')}`;
  if (!s.comparable) {
    return { headline: 'Rules changed', line: 'Rookery’s rules changed since this focus started, so before and after can’t be compared. End it and start again.' };
  }
  switch (s.state) {
    case 'too-early':
      return {
        headline: 'Too early to tell',
        line: plain
          ? 'Keep playing and reviewing games. Rookie needs a few more before saying anything.'
          : `${since} since you started. Too few games to read anything into yet.`,
      };
    case 'on-track':
      return {
        headline: 'On track',
        line: plain
          ? 'So far it’s happening less often than before. Not a result yet: keep going.'
          : `${since} (${rate1(s.rate.value)} per 100 moves). Likely below where you started (${pct(s.pBelow)} sure); not a result until the window ends.`,
      };
    case 'not-yet':
      return {
        headline: 'Not yet',
        line: plain
          ? 'No clear drop yet. The training counts; results take longer.'
          : `${since} (${rate1(s.rate.value)} per 100 moves). No clear drop from where you started yet.`,
      };
    case 'verdict':
      if (s.verdict === 'improved') {
        return {
          headline: 'Improved',
          line: plain ? 'It happens less often than when you started. Well done!' : `${since}: fewer than when you started (${pct(s.pBelow)} sure).`,
        };
      }
      if (s.verdict === 'worse') {
        return { headline: 'More often than before', line: plain ? 'It happened more often than before. Keep training it.' : `${since}: more than when you started (${pct(s.pAbove)} sure).` };
      }
      return { headline: 'No clear change yet', line: plain ? 'No clear change yet. You can keep this focus or pick the next one.' : `${since}: no clear change from where you started.` };
  }
}
