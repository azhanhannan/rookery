import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { BoardColumn } from '../components/BoardColumn';
import { LESSONS } from '../config/tunables';
import { LESSONS_COURSE, type Lesson, type LessonPuzzle, type LessonScreen } from '../lessons/lessons';
import { lessonSteps, puzzleSide, solutionSquares, tryPuzzleMove } from '../lessons/lessonLogic';
import { doneCount, loadLessonsProgress, recordLessonDone, type LessonsProgress } from '../lessons/progress';
import { logTraining, startTraining } from '../training/trainingLog';
import type { MoveInput } from '../game/rules';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';
const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';

const ALL_IDS = LESSONS_COURSE.map((l) => l.id);

function screenArrows(s: LessonScreen): BoardArrow[] {
  return (s.arrows ?? []).map((a) => ({
    startSquare: a.from,
    endSquare: a.to,
    color: a.kind === 'threat' ? LESSONS.threatColor : LESSONS.arrowColor,
  }));
}

function highlightStyles(squares: string[] | undefined): Record<string, CSSProperties> {
  return Object.fromEntries((squares ?? []).map((sq) => [sq, { backgroundColor: LESSONS.highlight }]));
}

/**
 * `#/lessons`: short themed lessons (a few explanation screens, then find-the-move practice).
 * `#/lessons/<id>` (`lessonId`) opens that lesson straight away; an unknown id shows the list.
 */
export function LessonsPage({ lessonId }: { lessonId?: string } = {}) {
  const [progress, setProgress] = useState<LessonsProgress>(loadLessonsProgress);
  const [selected, setSelected] = useState<string | null>(() => (lessonId && LESSONS_COURSE.some((l) => l.id === lessonId) ? lessonId : null));
  const lesson = LESSONS_COURSE.find((l) => l.id === selected);
  if (lesson) {
    const next = LESSONS_COURSE[LESSONS_COURSE.indexOf(lesson) + 1];
    return (
      <LessonView
        key={lesson.id}
        lesson={lesson}
        onBack={() => setSelected(null)}
        next={next}
        onNext={next ? () => setSelected(next.id) : undefined}
        onFinished={setProgress}
      />
    );
  }
  const done = doneCount(progress, ALL_IDS);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6" data-testid="lessons-list">
      <div>
        <h1 className="text-xl font-bold">Lessons</h1>
        <p className="text-sm text-muted">
          The tricks that win (and lose) most games under 1000. Each one is a couple of quick screens, then a few
          positions where you find the move yourself.
        </p>
      </div>
      <div className="flex flex-col gap-1" data-testid="lessons-progress">
        <p className="text-sm">
          <span className="font-semibold">
            {done}/{ALL_IDS.length}
          </span>{' '}
          {done === ALL_IDS.length ? 'done. All of them!' : 'done'}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${(100 * done) / ALL_IDS.length}%` }} />
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {LESSONS_COURSE.map((l, i) => {
          const rec = progress.lessons[l.id];
          return (
            <li key={l.id}>
              <button
                className="flex w-full flex-col gap-1 rounded-lg bg-surface p-3 text-left hover:outline-1 hover:outline-accent"
                onClick={() => setSelected(l.id)}
                data-testid={`lesson-${l.id}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted tabular-nums">{i + 1}</span>
                  <span className="font-semibold">{l.title}</span>
                  {rec && <span className="ml-auto rounded bg-accent px-1.5 text-xs font-semibold text-accent-ink">✓ Done</span>}
                </span>
                <span className="text-xs text-muted">
                  {l.blurb} · {l.puzzles.length} to try
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LessonView({
  lesson,
  onBack,
  next,
  onNext,
  onFinished,
}: {
  lesson: Lesson;
  onBack: () => void;
  next?: Lesson;
  onNext?: () => void;
  onFinished: (p: LessonsProgress) => void;
}) {
  const steps = useMemo(() => lessonSteps(lesson), [lesson]);
  const [at, setAt] = useState(0);
  // Any "Show me" this run means the finish isn't clean.
  const [helped, setHelped] = useState(false);
  const step = steps[at];

  useEffect(() => {
    startTraining('lesson');
  }, []);

  const advance = () => {
    const nextStep = steps[at + 1];
    if (nextStep?.kind === 'done') {
      onFinished(recordLessonDone(lesson.id, !helped));
      logTraining('lesson');
    }
    setAt(at + 1);
  };
  const restart = () => {
    setAt(0);
    setHelped(false);
    startTraining('lesson');
  };

  const shown = Math.min(at + 1, steps.length - 1);
  const header = (
    <div className="flex flex-col gap-2">
      <button className="self-start text-sm text-muted hover:text-ink" onClick={onBack}>← All lessons</button>
      <div>
        <h1 className="text-xl font-bold">{lesson.title}</h1>
        <p className="text-xs text-muted" data-testid="lesson-step">
          {step.kind === 'done' ? 'Finished' : `Step ${shown} of ${steps.length - 1}`}
          {step.kind === 'puzzle' ? ` · Your turn (${step.index + 1} of ${lesson.puzzles.length})` : ''}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${(100 * at) / (steps.length - 1)}%` }} />
      </div>
    </div>
  );

  if (step.kind === 'screen') {
    const s = lesson.screens[step.index];
    const lastScreen = step.index === lesson.screens.length - 1;
    return (
      <Layout
        board={
          <Board
            id="lesson-board"
            position={s.fen}
            orientation="white"
            arrows={screenArrows(s)}
            squareStyles={highlightStyles(s.highlights)}
            positionKey={`${lesson.id}:s${step.index}`}
          />
        }
      >
        {header}
        <div className={panel} data-testid="lesson-screen">
          <h2 className="font-semibold">{s.title}</h2>
          {s.text.map((t, i) => (
            <p key={i} className="text-sm">{t}</p>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => setAt(at - 1)} disabled={at === 0}>Back</button>
          <button className={primary} onClick={advance} data-testid="lesson-next">
            {lastScreen ? 'Try it yourself' : 'Next'}
          </button>
        </div>
      </Layout>
    );
  }

  if (step.kind === 'puzzle') {
    const p = lesson.puzzles[step.index];
    return (
      <PuzzleStep
        key={`${lesson.id}:${step.index}`}
        puzzle={p}
        header={header}
        last={step.index === lesson.puzzles.length - 1}
        onHelped={() => setHelped(true)}
        onNext={advance}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      {header}
      <div className={panel} data-testid="lesson-done">
        <p className="text-base font-semibold text-accent">Lesson done!</p>
        <p className="text-sm">
          {helped
            ? `That's ${lesson.title.toLowerCase()} covered. Go again some time without "Show me" and it'll stick even better.`
            : `You found every move on your own. Watch for ${lesson.title.toLowerCase()} in your next games: yours and theirs.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onNext && next && <button className={primary} onClick={onNext}>Next: {next.title}</button>}
        <button className={btn} onClick={onBack}>All lessons</button>
        <button className={btn} onClick={restart}>Go again</button>
      </div>
    </div>
  );
}

function Layout({ board, children }: { board: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn bars={false} board={board} />
      <aside className="flex min-w-0 flex-col gap-3">{children}</aside>
    </div>
  );
}

type Solved = { san: string; from: string; to: string; fenAfter: string; mate: boolean };

function PuzzleStep({
  puzzle,
  header,
  last,
  onHelped,
  onNext,
}: {
  puzzle: LessonPuzzle;
  header: React.ReactNode;
  last: boolean;
  onHelped: () => void;
  onNext: () => void;
}) {
  const [misses, setMisses] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [solved, setSolved] = useState<Solved | null>(null);
  const side = puzzleSide(puzzle);
  const answer = showAnswer && !solved ? solutionSquares(puzzle) : null;

  const onMove = (input: MoveInput): boolean => {
    const r = tryPuzzleMove(puzzle, input);
    if (r.kind === 'illegal') return false;
    if (r.kind === 'wrong') {
      setMisses((n) => n + 1);
      setFeedback(
        r.allowsMate
          ? `${r.san} lets your opponent play ${r.allowsMate}. Try another move.`
          : `${r.san} isn't the one. Have another look.`,
      );
      return false;
    }
    setSolved(r);
    setFeedback(null);
    return true;
  };

  return (
    <Layout
      board={
        <Board
          id="lesson-board"
          position={solved ? solved.fenAfter : puzzle.fen}
          orientation={side}
          movable={!solved}
          onMove={onMove}
          lastMove={solved ? { from: solved.from, to: solved.to, color: LESSONS.solvedColor } : null}
          arrows={answer ? [{ startSquare: answer.from, endSquare: answer.to, color: LESSONS.arrowColor }] : []}
          positionKey={`${puzzle.fen}:${solved ? 'solved' : 'open'}`}
        />
      }
    >
      {header}
      <div className={panel} data-testid="lesson-puzzle">
        <p className="text-xs text-muted">{side === 'white' ? 'White' : 'Black'} to move</p>
        <p className="text-sm font-medium" data-testid="lesson-prompt">{puzzle.prompt}</p>
      </div>
      <div className={panel} data-testid="lesson-feedback" aria-live="polite">
        {solved ? (
          <>
            <p className="text-base font-semibold text-accent">
              {solved.mate ? 'Checkmate!' : 'Yes!'} <span className="font-mono">{solved.san}</span>
            </p>
            <p className="text-sm">{puzzle.explain}</p>
          </>
        ) : (
          <>
            <p className="text-sm">{feedback ?? 'Make your move on the board.'}</p>
            {showAnswer && <p className="text-sm text-muted">The arrow shows the move. Play it on the board.</p>}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {solved ? (
          <button className={primary} onClick={onNext} data-testid="lesson-next">
            {last ? 'Finish the lesson' : 'Next position'}
          </button>
        ) : (
          misses >= LESSONS.showAnswerAfter &&
          !showAnswer && (
            <button
              className={btn}
              onClick={() => {
                setShowAnswer(true);
                onHelped();
              }}
              data-testid="lesson-show"
            >
              Show me
            </button>
          )
        )}
      </div>
    </Layout>
  );
}
