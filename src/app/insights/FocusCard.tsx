// The Focus: proposed from the ledger's top eligible bucket, then pinned once started, with its re-test state
// (too early / on track / not yet / verdict) and the work done since it started.
import type { CoachFocusInfo } from '../../api/types';
import type { FocusStatus } from '../../insights/focus';
import type { GameFacts, LedgerBucket } from '../../insights/types';
import type { ReviewStyle } from '../../review/reviewStyle';
import { MascotSays } from '../../components/RookMascot';
import { LESSONS_COURSE } from '../../lessons/lessons';
import { drillById } from '../../endgames/drills';
import type { StoredFocus } from './focusStore';
import type { ProcessMeasures } from './process';
import { BucketNumbers, btn, EvidenceList, panel, Tag, TrainLink } from './parts';
import { bucketName, bucketPlain, focusStateText, plural, rate1, shortDate } from './wording';

/** "Start this focus": the proposal. */
export function FocusProposal({
  bucket,
  style,
  games,
  facts,
  onStart,
  coach,
}: {
  bucket: LedgerBucket;
  style: ReviewStyle;
  games: number;
  facts: Map<string, GameFacts>;
  onStart: () => void;
  /** Set by the player's coach: it outranks the ledger's pick. */
  coach?: CoachFocusInfo;
}) {
  const learner = style === 'learner';
  return (
    <section className={panel} data-testid="focus-card" data-state="proposed" data-coach={coach ? 'yes' : undefined}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{learner ? 'Something to work on' : `Focus: ${bucketName(bucket.id)}`}</h2>
        <Tag tone="accent">{coach ? 'Coach’s focus' : 'Focus'}</Tag>
      </div>
      {coach && <CoachNote coach={coach} />}
      {learner ? (
        <>
          <MascotSays testId="focus-says">{bucketPlain(bucket.id)}</MascotSays>
          <p className="text-xs text-muted" data-testid="focus-n">
            From your {games} reviewed games
          </p>
        </>
      ) : (
        <>
          <p className="text-sm">{bucketPlain(bucket.id)}</p>
          <BucketNumbers b={bucket} />
        </>
      )}
      <EvidenceList evidence={bucket.evidence} facts={facts} limit={learner ? 3 : 5} plain={learner} />
      <div className="flex flex-col gap-2 sm:flex-row">
        {bucket.train && <TrainLink target={bucket.train} />}
        <button className={btn} onClick={onStart} data-testid="focus-start">
          Start this focus
        </button>
      </div>
      <p className="text-xs text-muted">
        {learner
          ? 'Starting it pins it here for a few weeks, so you can see how it goes.'
          : 'Starting it pins this Focus and freezes where you start from. Only games after today count, for at least 15 games and 2 weeks.'}
      </p>
    </section>
  );
}

function CoachNote({ coach }: { coach: CoachFocusInfo }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2 text-sm" data-testid="coach-focus">
      <p>
        Set by <span className="font-semibold">{coach.coach.username}</span>, your coach, on {shortDate(coach.createdAt)}
      </p>
      {coach.note && <p className="text-muted">“{coach.note}”</p>}
    </div>
  );
}

function ProcessList({ p, plain }: { p: ProcessMeasures; plain: boolean }) {
  const items: string[] = [];
  if (p.puzzles) items.push(plural(p.puzzles, 'puzzle'));
  if (p.lessons) items.push(plural(p.lessons, 'lesson'));
  if (p.endgames) items.push(plural(p.endgames, 'endgame drill'));
  if (p.openings) items.push(plural(p.openings, 'opening drill'));
  return (
    <div className="flex flex-col gap-0.5 text-sm" data-testid="focus-process">
      <p className="text-xs font-semibold text-muted">{plain ? 'Your training so far' : 'Work done since you started'}</p>
      <p>{items.length ? items.join(' · ') : 'Nothing logged yet: the Train this button is the place to start.'}</p>
      {p.mistakes && (
        <p>
          My mistakes for this: {p.mistakes.passed} of {p.mistakes.total} passed at their one-week check
          {p.mistakes.total === 0 && <span className="text-muted"> (none yet)</span>}
        </p>
      )}
      {p.lesson && (
        <p>
          Lesson “{LESSONS_COURSE.find((l) => l.id === p.lesson!.id)?.title ?? p.lesson.id}”:{' '}
          {p.lesson.doneSince ? 'done ✓' : p.lesson.done ? 'done before you started' : 'not done yet'}
        </p>
      )}
      {p.drill && (
        <p>
          Drill “{drillById(p.drill.id)?.title ?? p.drill.id}”: {p.drill.passed ? 'passed ✓' : p.drill.triedSince ? 'tried, not passed yet' : 'not tried yet'}
        </p>
      )}
    </div>
  );
}

/** The pinned Focus with its re-test state. */
export function ActiveFocus({
  focus,
  status,
  bucket,
  style,
  process,
  facts,
  proposal,
  coach,
  onEnd,
  onSwap,
}: {
  focus: StoredFocus;
  status: FocusStatus;
  /** The bucket's current ledger row (evidence, Train this), when it has one. */
  bucket: LedgerBucket | null;
  style: ReviewStyle;
  process: ProcessMeasures;
  facts: Map<string, GameFacts>;
  /** The ledger's current top pick, when it differs from the pinned Focus. */
  proposal: { bucket: LedgerBucket; coach: boolean } | null;
  /** The coach's Focus, when the pinned one is it. */
  coach?: CoachFocusInfo;
  onEnd: (reason: 'window' | 'stopped') => void;
  onSwap: (bucket: LedgerBucket, byCoach: boolean) => void;
}) {
  const learner = style === 'learner';
  const text = focusStateText(status, learner);
  const tone = status.state === 'verdict' && status.verdict === 'improved' ? 'accent' : status.state === 'on-track' ? 'accent' : 'muted';
  const windowDone = status.state === 'verdict';
  return (
    <section className={panel} data-testid="focus-card" data-state={status.state}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{learner ? 'Your focus' : `Your focus: ${bucketName(focus.bucketId)}`}</h2>
        <Tag tone="accent">Focus</Tag>
      </div>
      {coach && <CoachNote coach={coach} />}
      {learner ? <MascotSays testId="focus-says">{bucketPlain(focus.bucketId)}</MascotSays> : <p className="text-sm">{bucketPlain(focus.bucketId)}</p>}
      <div className="flex flex-col gap-1 rounded-lg bg-surface-2 p-2" data-testid="focus-status">
        <p className="flex items-center gap-2">
          <Tag tone={tone}>{text.headline}</Tag>
          <span className="text-xs text-muted">since {shortDate(focus.startedAt)}</span>
        </p>
        <p className="text-sm">{text.line}</p>
        <p className="text-xs text-muted" data-testid="focus-n">
          {windowDone
            ? `${plural(status.games, 'game')} since you started: the re-test window has closed.`
            : `${plural(status.games, 'game')} since you started · ${status.gamesLeft} more and ${plural(status.daysLeft, 'day')} to go before a verdict`}
        </p>
        {style === 'analyst' && (
          <p className="text-xs text-muted tabular-nums">
            Before: {rate1(focus.baselineRate)} per 100 moves (shrunk) · target {rate1(focus.target)} · now {rate1(status.rate.value)} ({rate1(status.rate.lo)}–
            {rate1(status.rate.hi)}) over {plural(status.moves, 'move')}
          </p>
        )}
      </div>
      <ProcessList p={process} plain={learner} />
      {bucket && <EvidenceList evidence={bucket.evidence} facts={facts} limit={learner ? 3 : 5} plain={learner} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {bucket?.train && <TrainLink target={bucket.train} />}
        {windowDone ? (
          <button className={btn} onClick={() => onEnd('window')} data-testid="focus-next">
            Finish and pick the next focus
          </button>
        ) : (
          <button className={btn} onClick={() => onEnd('stopped')} data-testid="focus-end">
            End this focus
          </button>
        )}
        {proposal && (
          <button className={btn} onClick={() => onSwap(proposal.bucket, proposal.coach)} data-testid="focus-swap">
            {proposal.coach ? 'Switch to your coach’s focus' : 'Swap to'}: {bucketName(proposal.bucket.id)}
          </button>
        )}
      </div>
    </section>
  );
}

