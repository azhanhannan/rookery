import { useEffect, useMemo, useState } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { BoardColumn, FullscreenButton } from '../components/BoardColumn';
import { RareInMasters } from '../components/ExplorerPanel';
import { OpeningLibraryPanel, type LibraryPreview } from './OpeningLibraryPanel';
import { VariationMoveList } from '../components/VariationMoveList';
import { OPENING_TRAINER } from '../config/tunables';
import { parsePgnTree } from '../game/pgnTree';
import type { MoveInput } from '../game/rules';
import { loadHistory } from '../game/storage';
import type { Color, GameRecord } from '../game/types';
import { addMove, deleteFrom, makeMainline, pathTo, promoteVariation, splitComment, type VariationTree } from '../game/variationTree';
import { useDrillStore } from '../openings/drillStore';
import { seedRows, type SeedRow } from '../openings/fromGames';
import { loadOpenings, lookupBook, openingAt } from '../openings/openings';
import { markAsked, shouldAsk } from '../openings/conflictPrompt';
import { catchUpDays, dueTotal, lineText, newMovesLeft, repertoireConflicts, repertoireProgress, reviewsLeft, seedFromGames, userCards, type DrillMode, type Repertoire, type RepertoireConflict } from '../openings/repertoire';
import { newLinesDone, newMovesDone, reviewsDone, useRepertoireStore } from '../openings/repertoireStore';
import { addDays } from '../puzzles/days';
import { readSelected, writeSelected } from '../openings/selected';
import { reviewFits } from '../review/reviewView';
import { todayKey } from '../puzzles/days';

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-40';
const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';
const ARROW = 'rgba(21, 120, 27, 0.8)';

const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');
const dateText = (key: string) => new Date(`${key}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** The deepest named opening on the way to the last FEN of `fens`; needs the dataset loaded. */
function openingName(fens: string[], ready: boolean): string | null {
  if (!ready) return null;
  for (let i = fens.length - 1; i >= 0; i--) {
    const o = openingAt(fens[i]);
    if (o) return `${o.eco} ${o.name}`;
  }
  return null;
}

type View = 'lines' | 'add' | 'progress';

/** `#/openings`: repertoires and the opening drill (spaced repetition per position). */
export function OpeningsPage() {
  const data = useRepertoireStore((s) => s.data);
  const store = useRepertoireStore.getState();
  const drill = useDrillStore();
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View>('lines');
  const [browse, setBrowse] = useState<string>('root');
  const [openingsReady, setOpeningsReady] = useState(false);
  const [library, setLibrary] = useState(false);
  const [preview, setPreview] = useState<LibraryPreview | null>(null);

  const rep = data.repertoires.find((r) => r.id === selectedId) ?? data.repertoires[0] ?? null;
  const today = todayKey();
  const progress = useMemo(() => (rep ? repertoireProgress(rep, data.cards[rep.id] ?? {}, today) : null), [rep, data.cards, today]);

  useEffect(() => {
    let live = true;
    loadOpenings()
      .then(() => live && setOpeningsReady(true))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Leaving the page (or switching repertoire) ends the drill.
  useEffect(() => () => useDrillStore.getState().stop(), []);
  useEffect(() => {
    if (useDrillStore.getState().repId && useDrillStore.getState().repId !== rep?.id) useDrillStore.getState().stop();
  }, [rep?.id]);

  const select = (id: string | null) => {
    setSelectedId(id);
    writeSelected(id);
    setBrowse('root');
    setView('lines');
  };

  const drilling = drill.phase !== 'idle' && drill.repId === rep?.id;
  const browseId = rep && rep.tree.nodes[browse] ? browse : (rep?.tree.rootId ?? 'root');

  // Board: the drill's position, or the selected position of the repertoire tree (moves played there add lines).
  let fen: string;
  let lastMove: { from: string; to: string } | null = null;
  let arrows: BoardArrow[] = [];
  let fens: string[] = [];
  let movable = false;
  let onMove: ((m: MoveInput) => boolean) | undefined;
  if (library && preview) {
    fen = preview.fen;
    lastMove = preview.lastMove;
  } else if (drilling) {
    fen = drill.fen;
    lastMove = drill.lastMove;
    if (drill.arrow) arrows = [{ startSquare: drill.arrow.slice(0, 2), endSquare: drill.arrow.slice(2, 4), color: ARROW }];
    fens = [drill.steps[0]?.fenBefore ?? drill.fen, ...drill.steps.slice(0, drill.index).map((s) => s.fenAfter)];
    movable = drill.phase === 'user' || drill.phase === 'wrong';
    onMove = drill.move;
  } else if (rep) {
    const node = rep.tree.nodes[browseId];
    fen = node.fen;
    lastMove = node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null;
    fens = pathTo(rep.tree, browseId).map((id) => rep.tree.nodes[id].fen);
    movable = true;
    onMove = (m) => {
      const r = addMove(rep.tree, browseId, m);
      if (!r) return false;
      if (r.tree !== rep.tree) store.setTree(rep.id, r.tree);
      setBrowse(r.id);
      return true;
    };
  } else {
    fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }
  const opening = openingName(fens, openingsReady);

  const openLibrary = () => {
    useDrillStore.getState().stop();
    setCreating(false);
    setPreview(null);
    setLibrary(true);
  };
  const closeLibrary = () => {
    setLibrary(false);
    setPreview(null);
  };

  const startDrill = (mode: DrillMode) => {
    if (rep) useDrillStore.getState().start(rep.id, mode);
  };

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        board={
          <Board
            id="openings-board"
            position={fen}
            orientation={(library && preview ? preview.color : rep?.color) === 'b' ? 'black' : 'white'}
            lastMove={lastMove}
            arrows={arrows}
            movable={movable}
            onMove={onMove}
            positionKey={library && preview ? `library:${preview.fen}` : drilling ? `drill:${drill.index}:${drill.pass}` : `browse:${browseId}`}
          />
        }
      >
        <FullscreenButton withText className="self-end rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:outline-1 hover:outline-accent" />
      </BoardColumn>

      <aside className="flex min-w-0 flex-col gap-3">
        <h1 className="text-xl font-bold">Opening trainer</h1>

        <RepertoirePicker reps={data.repertoires} selected={rep?.id ?? null} onSelect={select} onNew={() => setCreating(true)} onLibrary={openLibrary} />
        {creating && (
          <NewRepertoire
            onCancel={() => setCreating(false)}
            onCreate={(name, color) => {
              const id = store.create(name, color);
              setCreating(false);
              select(id);
              setView('add');
            }}
          />
        )}

        {library ? (
          <OpeningLibraryPanel
            openingsReady={openingsReady}
            onPreview={setPreview}
            onClose={closeLibrary}
            onAdded={(id) => {
              closeLibrary();
              select(id);
            }}
          />
        ) : !rep ? (
          !creating && (
            <div className={panel} data-testid="openings-empty">
              <p className="font-semibold">Build your first repertoire</p>
              <p className="text-sm text-muted">
                A repertoire is the moves you want to play in your openings. Paste a PGN, save the Analysis board, or
                seed one from the games you have played; then drill it a few minutes a day.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className={primary} onClick={openLibrary}>Browse the library</button>
                <button className={btn} onClick={() => setCreating(true)}>New repertoire</button>
              </div>
            </div>
          )
        ) : drilling ? (
          <DrillPanel opening={opening} onStop={() => useDrillStore.getState().stop()} onNext={() => startDrill(drill.mode)} nextDue={progress?.nextDue ?? null} />
        ) : (
          <>
            <ConflictPrompt rep={rep} reps={data.repertoires} />
            <RepertoireHeader rep={rep} progress={progress!} onDrill={startDrill} onDelete={() => {
              if (!window.confirm(`Delete the repertoire "${rep.name}" and its progress?`)) return;
              store.remove(rep.id);
              select(null);
            }} />
            {opening && <p className="text-sm text-muted" data-testid="opening-name">{opening}</p>}
            <div className="flex gap-1 rounded-lg bg-surface p-1 text-sm" role="tablist">
              {(['lines', 'add', 'progress'] as View[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`flex-1 rounded-md px-3 py-1.5 ${view === v ? 'bg-surface-2 font-semibold' : 'text-muted hover:text-ink'}`}
                  onClick={() => setView(v)}
                >
                  {v === 'lines' ? 'Lines' : v === 'add' ? 'Add lines' : 'Progress'}
                </button>
              ))}
            </div>
            {view === 'lines' && <LinesPanel rep={rep} selected={browseId} onSelect={setBrowse} />}
            {view === 'add' && <AddLinesPanel rep={rep} onAdded={() => setView('lines')} />}
            {view === 'progress' && progress && (
              <ProgressPanel rep={rep} progress={progress} onShow={(id) => {
                setBrowse(id);
                setView('lines');
              }} />
            )}
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * Asks (at most twice per pair, conflictPrompt.ts) about another awake repertoire of this colour that answers a
 * shared position differently: learning two answers to one position at once is the hardest way to learn.
 */
function ConflictPrompt({ rep, reps }: { rep: Repertoire; reps: Repertoire[] }) {
  // Re-read after an answer (the asked count lives in localStorage).
  const [, setTick] = useState(0);
  const c: RepertoireConflict | undefined = repertoireConflicts(reps).find(
    (x) => (x.a.id === rep.id || x.b.id === rep.id) && shouldAsk(x.a.id, x.b.id),
  );
  if (!c) return null;
  const answer = (restId: string | null) => {
    markAsked(c.a.id, c.b.id);
    if (restId) useRepertoireStore.getState().rest(restId, todayKey());
    setTick((t) => t + 1);
  };
  const where = lineText(c.a.tree, c.nodeId);
  return (
    <div className={panel} data-testid="conflict-prompt">
      <p className="text-sm">
        <span className="font-semibold">{c.a.name}</span> and <span className="font-semibold">{c.b.name}</span> answer the same
        position differently{where ? ` (after ${where})` : ''}: {c.aMoves.join(' or ')} vs {c.bMoves.join(' or ')}.
      </p>
      <p className="text-xs text-muted">
        Learning two answers to one position at the same time is the hardest way to learn them. Rest one for now? Nothing
        is lost, and you can resume it any time.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => answer(c.b.id)}>Rest {c.b.name}</button>
        <button className={btn} onClick={() => answer(c.a.id)}>Rest {c.a.name}</button>
        <button className={btn} onClick={() => answer(null)}>Keep both</button>
      </div>
    </div>
  );
}

function RepertoirePicker({ reps, selected, onSelect, onNew, onLibrary }: { reps: Repertoire[]; selected: string | null; onSelect: (id: string) => void; onNew: () => void; onLibrary: () => void }) {
  if (!reps.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
        aria-label="Repertoire"
        value={selected ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({colorName(r.color)})
          </option>
        ))}
      </select>
      <button className={btn} onClick={onNew}>New repertoire</button>
      <button className={btn} onClick={onLibrary}>Library</button>
    </div>
  );
}

function NewRepertoire({ onCreate, onCancel }: { onCreate: (name: string, color: Color) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('w');
  return (
    <form
      className={panel}
      data-testid="new-repertoire"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(name, color);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input className="rounded bg-surface-2 px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Italian as White" autoFocus />
      </label>
      <fieldset className="flex gap-4 text-sm">
        <legend className="mb-1">I play</legend>
        {(['w', 'b'] as Color[]).map((c) => (
          <label key={c} className="flex items-center gap-1.5">
            <input type="radio" name="rep-color" checked={color === c} onChange={() => setColor(c)} />
            {colorName(c)}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={primary}>Create</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function RepertoireHeader({
  rep,
  progress,
  onDrill,
  onDelete,
}: {
  rep: Repertoire;
  progress: ReturnType<typeof repertoireProgress>;
  onDrill: (m: DrillMode) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(rep.name);
  const today = todayKey();
  const daily = useRepertoireStore((s) => s.daily);
  const left = reviewsLeft(reviewsDone(daily, today));
  const data = useRepertoireStore((s) => s.data);
  const allDue = dueTotal(data, today);
  const tomorrowDue = dueTotal(data, addDays(today, 1));
  const newLeft = newMovesLeft(newMovesDone(daily, today), newLinesDone(daily, today), allDue);
  const resting = !!rep.restedOn;
  const forToday = resting ? 0 : Math.min(progress.due, left);
  const capped = !resting && progress.due > 0 && left === 0;
  return (
    <div className={panel} data-testid="repertoire-header">
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            useRepertoireStore.getState().rename(rep.id, name);
            setRenaming(false);
          }}
        >
          <input className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 text-sm" aria-label="Repertoire name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit" className={btn}>Save</button>
        </form>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-semibold">{rep.name}</span>
          <span className="shrink-0 text-xs text-muted">as {colorName(rep.color)}</span>
        </div>
      )}
      <p className="text-sm" data-testid="repertoire-counts">
        <span className="font-semibold">{progress.learned}</span> learned · <span className="font-semibold">{forToday}</span> for today ·{' '}
        <span className="font-semibold">{progress.fresh}</span> new · {progress.total} positions
      </p>
      {resting && (
        <p className="rounded bg-surface-2 p-2 text-sm" data-testid="repertoire-resting">
          Resting since {dateText(rep.restedOn!)}. Nothing is asked and your progress is kept; when you resume, the
          moves come back a few a day.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={forToday === 0} onClick={() => onDrill('due')}>
          {capped ? 'Done for today ✓' : `Due now (${forToday})`}
        </button>
        <button className={btn} disabled={progress.fresh === 0 || resting || newLeft === 0} onClick={() => onDrill('learn')}>
          Learn new lines ({progress.fresh})
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={progress.total === progress.fresh} onClick={() => onDrill('practice')}>
          Practise anyway
        </button>
        <button className={btn} disabled={progress.weakest.length === 0} onClick={() => onDrill('weak')}>
          Drill weakest
        </button>
      </div>
      {!resting && progress.fresh > 0 && (
        <p className="text-xs text-muted" data-testid="learn-note">
          {learnNote({ allDue, left, newLeft, tomorrowDue, linesDone: newLinesDone(daily, today) })}
        </p>
      )}
      {capped && (
        <p className="text-xs text-muted" data-testid="repertoire-capped">
          That's today's {OPENING_TRAINER.dailyReviews}. The rest waits for tomorrow, about {catchUpDays(allDue)}{' '}
          {catchUpDays(allDue) === 1 ? 'day' : 'days'} to catch up at this pace.
        </p>
      )}
      {!resting && progress.due === 0 && progress.nextDue && <p className="text-xs text-muted">Next review {dateText(progress.nextDue)}</p>}
      <div className="flex flex-wrap gap-3 text-xs">
        <button className="text-accent hover:underline" onClick={() => {
          setName(rep.name);
          setRenaming(!renaming);
        }}>{renaming ? 'Cancel rename' : 'Rename'}</button>
        <button className="text-accent hover:underline" onClick={() => {
          const store = useRepertoireStore.getState();
          if (resting) store.resume(rep.id, today);
          else store.rest(rep.id, today);
        }}>{resting ? 'Resume' : 'Rest'}</button>
        <button className="text-danger hover:underline" onClick={onDelete}>Delete repertoire</button>
      </div>
    </div>
  );
}

/** One calm line under Learn: whether today suits new moves, and why not when it doesn't. */
function learnNote({ allDue, left, newLeft, tomorrowDue, linesDone }: { allDue: number; left: number; newLeft: number; tomorrowDue: number; linesDone: number }): string {
  const cap = OPENING_TRAINER.dailyReviews;
  if (allDue > OPENING_TRAINER.maxBacklogDays * cap) return 'No new moves until the reviews are lighter. That keeps each day small.';
  if (newLeft === 0)
    return linesDone >= OPENING_TRAINER.newLinesPerDay ? "That's today's new line. Let it settle; more tomorrow." : "That's today's new moves. Let them settle; more tomorrow.";
  if (Math.min(allDue, left) > 0) return 'Reviews first today: new moves stick better on a light day.';
  if (tomorrowDue + newLeft > cap) return `Tomorrow already has about ${tomorrowDue} reviews; new moves would add to it. Maybe wait a day.`;
  return `Up to ${newLeft} new ${newLeft === 1 ? 'move' : 'moves'} today. Fits in your daily ${cap}.`;
}

function drillTitle(mode: DrillMode, pass: 'show' | 'quiz' | 'recap'): string {
  if (pass === 'recap') return 'One more look';
  if (mode === 'due') return 'Due now';
  if (mode === 'practice') return 'Practice';
  if (mode === 'weak') return 'Weakest lines';
  return pass === 'show' ? 'Learn: watch and play' : 'Learn: from memory';
}

function DrillPanel({ opening, onStop, onNext, nextDue }: { opening: string | null; onStop: () => void; onNext: () => void; nextDue: string | null }) {
  const d = useDrillStore();
  const userSteps = d.steps.filter((s) => s.user).length;
  const doneUser = d.steps.slice(0, d.index).filter((s) => s.user).length;
  const tone = d.feedback?.kind === 'good' ? 'text-accent' : d.feedback?.kind === 'bad' ? 'text-danger' : '';
  return (
    <div className={panel} data-testid="drill-panel">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{drillTitle(d.mode, d.pass)}</span>
        {d.phase !== 'empty' && d.phase !== 'capped' && d.pass !== 'recap' && <span className="text-xs text-muted">Move {Math.min(doneUser + 1, userSteps)} of {userSteps}</span>}
      </div>
      {opening && <p className="text-sm text-muted" data-testid="opening-name">{opening}</p>}
      {(d.mode === 'practice' || d.mode === 'weak') && (
        <p className="text-xs text-muted" data-testid="drill-off-schedule">
          Extra practice: nothing here changes your review dates.
        </p>
      )}
      {d.phase === 'capped' ? (
        <p className="text-sm" data-testid="drill-capped">
          {d.mode === 'learn'
            ? "That's today's new moves. Let them settle; more tomorrow."
            : `That's today's ${OPENING_TRAINER.dailyReviews}, well done. The rest waits for tomorrow, with no penalty.`}
        </p>
      ) : d.phase === 'empty' ? (
        <p className="text-sm" data-testid="drill-empty">
          {d.mode === 'due'
            ? `Nothing due right now.${nextDue ? ` Next review ${dateText(nextDue)}.` : ''}`
            : d.mode === 'learn'
              ? 'Every position here has been learned. Add lines to learn more.'
              : d.mode === 'practice'
                ? 'Learn a line first, then practise it here any time.'
                : 'No misses yet, so nothing is weak.'}
        </p>
      ) : (
        <>
          {d.feedback && (
            <p className={`text-sm font-medium ${tone}`} role="status" data-testid="drill-feedback">
              {d.feedback.text}
            </p>
          )}
          {d.plan && (
            <p className="rounded bg-surface-2 p-2 text-sm" data-testid="drill-plan">
              <span className="font-semibold">Plan: </span>
              {d.plan}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {d.phase === 'done' && (
          <button className={primary} onClick={onNext}>
            Next line
          </button>
        )}
        <button className={btn} onClick={onStop}>{d.phase === 'done' || d.phase === 'empty' || d.phase === 'capped' ? 'Back to repertoire' : 'Stop'}</button>
      </div>
    </div>
  );
}

function LinesPanel({ rep, selected, onSelect }: { rep: Repertoire; selected: string; onSelect: (id: string) => void }) {
  const store = useRepertoireStore.getState();
  const node = rep.tree.nodes[selected];
  const plan = splitComment(node?.comment).text;
  const parent = node?.parentId ? rep.tree.nodes[node.parentId] : undefined;
  const empty = rep.tree.nodes[rep.tree.rootId].children.length === 0;
  const setTree = (t: VariationTree) => store.setTree(rep.id, t);
  return (
    <div className="flex flex-col gap-2" data-testid="lines-panel">
      {empty ? (
        <p className="rounded-lg bg-surface p-3 text-sm text-muted">
          No lines yet. Play moves on the board to add them, or use Add lines.
        </p>
      ) : (
        <VariationMoveList
          tree={rep.tree}
          selected={selected}
          onSelect={onSelect}
          onPromote={(id) => setTree(promoteVariation(rep.tree, id))}
          onMakeMain={(id) => setTree(makeMainline(rep.tree, id))}
          onDelete={(id) => {
            const r = deleteFrom(rep.tree, id);
            setTree(r.tree);
            onSelect(r.selected);
          }}
        />
      )}
      {plan && <p className="rounded-lg bg-surface p-2 text-sm"><span className="font-semibold">Plan: </span>{plan}</p>}
      {parent && node?.uci && parent.fen.split(' ')[1] === rep.color && (
        <RareInMasters key={selected} fenBefore={parent.fen} uci={node.uci} san={node.san ?? node.uci} />
      )}
      <p className="text-xs text-muted">
        Play a move on the board to add it here. Select a move and remove its branch with the button under the list.
      </p>
    </div>
  );
}

/** Opening name per game: the review's when there is one, else from the openings dataset (as in the Openings report). */
async function openingNames(records: GameRecord[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  await Promise.all(
    records.map(async (r) => {
      const fromReview = reviewFits(r, r.review) ? r.review.opening?.name : undefined;
      if (fromReview) return void names.set(r.id, fromReview);
      const book = await lookupBook(r.startFen, r.moves);
      names.set(r.id, book.name ?? null);
    }),
  );
  return names;
}

function AddLinesPanel({ rep, onAdded }: { rep: Repertoire; onAdded: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rows, setRows] = useState<SeedRow[] | null>(null);
  const [finding, setFinding] = useState(false);

  const add = (tree: VariationTree): boolean => {
    const before = userCards(rep).size;
    try {
      useRepertoireStore.getState().addLines(rep.id, tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
    const after = useRepertoireStore.getState().data.repertoires.find((r) => r.id === rep.id);
    const added = after ? userCards(after).size - before : 0;
    setError(null);
    setNote(added > 0 ? `Added ${added} position${added === 1 ? '' : 's'} to drill` : 'Those lines were already in the repertoire');
    return true;
  };

  const addPgn = (pgn: string) => {
    try {
      const tree = parsePgnTree(pgn);
      if (add(tree)) {
        setText('');
        onAdded();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const findMine = async () => {
    setFinding(true);
    try {
      const records = loadHistory().filter((g) => g.result !== '*');
      let names: Map<string, string | null>;
      try {
        names = await openingNames(records);
      } catch {
        names = new Map();
      }
      setRows(seedRows(records, names, rep.color));
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="add-lines">
      {note && <p className="text-sm text-accent" role="status">{note}</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className={panel}>
        <div className="text-sm font-semibold">From a PGN</div>
        <textarea
          className="min-h-20 rounded bg-surface-2 p-2 font-mono text-xs"
          placeholder="Paste a PGN: variations become branches, comments become the plan"
          aria-label="Repertoire PGN"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={!text.trim()} onClick={() => addPgn(text)}>Add PGN</button>
          <label className={`${btn} cursor-pointer`}>
            Open a .pgn file
            <input
              type="file"
              accept=".pgn,text/plain,application/x-chess-pgn"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void f.text().then(addPgn, () => setError("Couldn't read that file"));
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted">
          Or build lines on the <a className="text-accent hover:underline" href="#/analysis">Analysis board</a> and use “Save as repertoire” there.
        </p>
      </div>

      <div className={panel} data-testid="from-my-games">
        <div className="text-sm font-semibold">From my games</div>
        <p className="text-xs text-muted">
          The moves you actually played as {colorName(rep.color)} in your saved games (first {OPENING_TRAINER.seedPlies / 2} moves): your usual move
          in each position and every reply you met.
        </p>
        {rows === null ? (
          <button className={`${btn} self-start`} disabled={finding} onClick={() => void findMine()}>
            {finding ? 'Finding your openings…' : 'Find my openings'}
          </button>
        ) : rows.length === 0 ? (
          <p className="text-sm">No finished games as {colorName(rep.color)} saved on this device yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map(({ row, games }) => (
              <li key={row.name} className="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1.5 text-sm" data-testid="seed-row">
                <span className="min-w-0 truncate">
                  {row.name} <span className="text-xs text-muted">· {row.games} game{row.games === 1 ? '' : 's'}</span>
                </span>
                <button className="shrink-0 text-accent hover:underline" onClick={() => add(seedFromGames(games, rep.color))}>
                  Add lines
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProgressPanel({ rep, progress, onShow }: { rep: Repertoire; progress: ReturnType<typeof repertoireProgress>; onShow: (nodeId: string) => void }) {
  const pct = progress.total ? Math.round((progress.learned / progress.total) * 100) : 0;
  return (
    <div className={panel} data-testid="progress-panel">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Learned</span>
        <span className="font-mono">{progress.learned} / {progress.total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-surface-2" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm">
        {progress.due} due now · {progress.fresh} never practised
        {progress.nextDue && progress.due === 0 && ` · next review ${dateText(progress.nextDue)}`}
      </p>
      <div className="mt-1 text-sm font-semibold">Weakest positions</div>
      {progress.weakest.length === 0 ? (
        <p className="text-sm text-muted">No misses yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {progress.weakest.map((w) => (
            <li key={w.key} className="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1.5 text-sm" data-testid="weak-spot">
              <span className="min-w-0 truncate font-mono text-xs">{lineText(rep.tree, w.nodeId) || 'Start position'}</span>
              <span className="shrink-0 text-xs text-muted">missed {w.fails} of {w.reps}</span>
              <button className="shrink-0 text-xs text-accent hover:underline" onClick={() => onShow(w.nodeId)}>Show</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
