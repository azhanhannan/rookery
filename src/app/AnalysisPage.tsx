import { Chess } from 'chess.js';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAnalysisStore } from '../analysis/analysisStore';
import { useAnalysisEngine } from '../analysis/useAnalysisEngine';
import { Board, type BoardArrow } from '../components/Board';
import { BoardColumn, FullscreenButton } from '../components/BoardColumn';
import { EvalBar } from '../components/EvalBar';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { PositionEditor } from '../components/PositionEditor';
import { SaveRepertoire } from '../components/SaveRepertoire';
import { TablebasePanel } from '../components/TablebasePanel';
import { VariationMoveList } from '../components/VariationMoveList';
import { ANALYSIS, DEFAULT_BOT_ELO } from '../config/tunables';
import { formatEval, nagText, pvToSan } from '../game/analysisLines';
import { useGameStore } from '../game/gameStore';
import { parsePgnTree, treeToPgn } from '../game/pgnTree';
import { validatePosition } from '../game/positionSetup';
import { START_FEN } from '../game/rules';
import { loadBotElo } from '../game/storage';
import { commentShapes, createTree, joinComment, splitComment } from '../game/variationTree';
import { formatScore, winChance } from '../review/winChance';

const ENGINE_PREF_KEY = 'rookery.analysis.engine';
const LINE_COLORS = ['rgba(79, 154, 44, 0.85)', 'rgba(52, 120, 200, 0.5)', 'rgba(52, 120, 200, 0.32)'];
const NAGS = [1, 2, 3, 4, 5, 6];

const btn =
  'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';

function readEnginePref(): boolean {
  try {
    return localStorage.getItem(ENGINE_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeEnginePref(on: boolean): void {
  try {
    localStorage.setItem(ENGINE_PREF_KEY, on ? '1' : '0');
  } catch {
    // ignore: the preference just won't survive a reload
  }
}

/** Replacing an analysis with moves in it asks first. */
function confirmReplace(hasMoves: boolean): boolean {
  return !hasMoves || window.confirm('Replace the current analysis?');
}

/** The free Analysis board (#/analysis): variation tree, multi-PV engine, position setup and lossless PGN. */
export function AnalysisPage() {
  const tree = useAnalysisStore((s) => s.tree);
  const selected = useAnalysisStore((s) => s.selected);
  const orientation = useAnalysisStore((s) => s.orientation);
  const store = useAnalysisStore.getState();
  const node = tree.nodes[selected] ?? tree.nodes[tree.rootId];
  const fen = node.fen;
  const hasMoves = tree.nodes[tree.rootId].children.length > 0;

  const [engineOn, setEngineOn] = useState(readEnginePref);
  const [multiPV, setMultiPV] = useState(ANALYSIS.multiPV);
  const [editing, setEditing] = useState<string | null>(null);
  const eng = useAnalysisEngine(fen, engineOn && editing === null, multiPV);

  // Arrow keys: ←/→ step, ↑/Home to the start, ↓/End to the end of the current line.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (editing !== null || e.ctrlKey || e.metaKey || e.altKey || t?.closest('input, textarea, select, [contenteditable]')) return;
      const s = useAnalysisStore.getState();
      const actions: Record<string, () => void> = {
        ArrowLeft: s.back,
        ArrowRight: s.forward,
        ArrowUp: s.toStart,
        Home: s.toStart,
        ArrowDown: s.toEnd,
        End: s.toEnd,
      };
      const act = actions[e.key];
      if (act) {
        e.preventDefault();
        act();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const lastMove = node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null;
  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    const seen = new Set<string>();
    const add = (from: string, to: string, color: string) => {
      if (seen.has(from + to)) return;
      seen.add(from + to);
      out.push({ startSquare: from, endSquare: to, color });
    };
    eng.lines.forEach((l, i) => add(l.move.slice(0, 2), l.move.slice(2, 4), LINE_COLORS[i] ?? LINE_COLORS[2]));
    for (const a of commentShapes(node.comment).arrows) add(a.from, a.to, a.color);
    return out;
  }, [eng.lines, node.comment]);

  // `[%csl Gd4]` square highlights from the selected move's comment, drawn as a ring in the arrows' colours.
  const squareStyles = useMemo(() => {
    const out: Record<string, CSSProperties> = {};
    for (const { square, color } of commentShapes(node.comment).squares) {
      out[square] = { backgroundImage: `radial-gradient(circle, transparent 60%, ${color} 62%, ${color} 70%, transparent 72%)` };
    }
    return out;
  }, [node.comment]);

  const turn = fen.split(' ')[1];
  let evalBar: { white: number; label: string; stale: boolean } | null = null;
  if (eng.terminal === 'mate') evalBar = { white: turn === 'w' ? 0 : 100, label: '#', stale: false };
  else if (eng.terminal === 'stalemate') evalBar = { white: 50, label: '½', stale: false };
  else if (engineOn && eng.lines[0]) evalBar = { white: winChance(eng.lines[0].score), label: formatScore(eng.lines[0].score), stale: false };
  else if (engineOn) evalBar = { white: 50, label: '…', stale: true };

  function playUci(uci: string) {
    store.play({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }

  return (
    <div className="board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]">
      <BoardColumn
        bars={false}
        controlsBelow
        evalBar={
          evalBar && editing === null ? (
            <EvalBar white={evalBar.white} label={evalBar.label} stale={evalBar.stale} orientation={orientation} />
          ) : undefined
        }
        board={
          editing !== null ? (
            <PositionEditor
              initialFen={editing}
              orientation={orientation}
              onCancel={() => setEditing(null)}
              onDone={(f) => {
                store.load(createTree(f));
                setEditing(null);
              }}
            />
          ) : (
            <Board
              id="analysis-board"
              position={fen}
              orientation={orientation}
              lastMove={lastMove}
              arrows={arrows}
              squareStyles={squareStyles}
              movable
              onMove={(m) => store.play(m)}
              positionKey={selected}
            />
          )
        }
      >
        {editing === null && (
          <div className="grid grid-cols-6 gap-2">
            <button className={btn} onClick={store.toStart} aria-label="Start" disabled={!node.parentId}>⏮</button>
            <button className={btn} onClick={store.back} aria-label="Previous move" disabled={!node.parentId}>◀</button>
            <button className={btn} onClick={store.forward} aria-label="Next move" disabled={!node.children.length}>▶</button>
            <button className={btn} onClick={store.toEnd} aria-label="End of line" disabled={!node.children.length}>⏭</button>
            <button className={btn} onClick={store.flip} aria-label="Flip board">⇅</button>
            <FullscreenButton className={btn} />
          </div>
        )}
      </BoardColumn>

      <aside className="flex min-w-0 flex-col gap-3">
        <h1 className="text-xl font-bold">Analysis board</h1>

        <EnginePanel
          on={engineOn}
          onToggle={() => {
            writeEnginePref(!engineOn);
            setEngineOn(!engineOn);
          }}
          multiPV={multiPV}
          onMultiPV={setMultiPV}
          fen={fen}
          eng={eng}
          onPlay={playUci}
        />

        {editing === null && <TablebasePanel fen={fen} onPlay={playUci} />}

        {editing === null && <ExplorerPanel fen={fen} onPlay={playUci} />}

        <VariationMoveList
          tree={tree}
          selected={selected}
          onSelect={store.select}
          onPromote={store.promote}
          onMakeMain={store.makeMain}
          onDelete={store.remove}
        />

        {node.parentId && <CommentEditor key={selected} id={selected} raw={node.comment} nags={node.nags} />}

        <PositionPanel
          fen={fen}
          onLoad={(f) => {
            if (confirmReplace(hasMoves)) store.load(createTree(f));
          }}
          onEdit={(f) => setEditing(f)}
        />

        <PgnPanel hasMoves={hasMoves} />

        <SaveRepertoire tree={tree} orientation={orientation} />

        <PlayFromHere fen={fen} terminal={eng.terminal !== null} />
      </aside>
    </div>
  );
}

function EnginePanel({
  on,
  onToggle,
  multiPV,
  onMultiPV,
  fen,
  eng,
  onPlay,
}: {
  on: boolean;
  onToggle: () => void;
  multiPV: number;
  onMultiPV: (n: number) => void;
  fen: string;
  eng: ReturnType<typeof useAnalysisEngine>;
  onPlay: (uci: string) => void;
}) {
  const status =
    eng.terminal === 'mate'
      ? 'Checkmate'
      : eng.terminal === 'stalemate'
        ? 'Stalemate'
        : !on
          ? 'Off'
          : eng.status === 'off'
            ? 'Paused'
            : eng.status === 'error'
            ? 'Engine unavailable'
            : eng.lines.length
              ? `Depth ${eng.depth}${eng.status === 'done' ? '' : '…'}`
              : 'Starting…';
  return (
    <div className={panel} data-testid="engine-panel">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={`rounded-full px-3 py-1 text-sm font-semibold ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
          aria-pressed={on}
          onClick={onToggle}
        >
          Stockfish {on ? 'on' : 'off'}
        </button>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          Lines
          <select
            className="rounded bg-surface-2 px-2 py-1 text-ink"
            value={multiPV}
            onChange={(e) => onMultiPV(Number(e.target.value))}
            aria-label="Engine lines"
          >
            {Array.from({ length: ANALYSIS.maxMultiPV }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-muted" data-testid="engine-status">{status}</span>
      </div>
      {on && eng.error && <p className="text-sm text-danger">{eng.error}</p>}
      {on && eng.lines.length > 0 && (
        <ol className="flex flex-col gap-1" data-testid="engine-lines">
          {eng.lines.map((l) => (
            <li key={l.rank}>
              <button
                className="flex w-full min-w-0 items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                title="Play the first move of this line"
                onClick={() => onPlay(l.move)}
              >
                <span className="w-14 shrink-0 rounded bg-surface-2 px-1 text-center font-mono text-xs font-semibold" data-testid="line-eval">
                  {formatEval(l.score)}
                </span>
                <span className="truncate font-mono text-xs">{pvToSan(fen, l.pv, ANALYSIS.pvMoves)}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted">d{l.depth}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CommentEditor({ id, raw, nags }: { id: string; raw: string | undefined; nags: number[] }) {
  const { text, commands } = splitComment(raw);
  const [draft, setDraft] = useState(text);
  const save = () => {
    if (draft.trim() !== text) useAnalysisStore.getState().comment(id, joinComment(draft, commands));
  };
  return (
    <div className={panel} data-testid="comment-editor">
      <div className="flex flex-wrap gap-1">
        {NAGS.map((n) => (
          <button
            key={n}
            className={`min-w-9 rounded px-2 py-0.5 font-mono text-sm ${nags.includes(n) ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
            aria-pressed={nags.includes(n)}
            onClick={() => useAnalysisStore.getState().nag(id, n)}
          >
            {nagText(n)}
          </button>
        ))}
      </div>
      <textarea
        className="min-h-16 rounded bg-surface-2 p-2 text-sm"
        placeholder="Comment on this move"
        aria-label="Comment"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
      {commands.length > 0 && <p className="font-mono text-[10px] text-muted">Kept: {commands.join(' ')}</p>}
      <button className={`${btn} self-start`} onClick={save} disabled={draft.trim() === text}>
        Save comment
      </button>
    </div>
  );
}

function PositionPanel({ fen, onLoad, onEdit }: { fen: string; onLoad: (fen: string) => void; onEdit: (fen: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    const problem = validatePosition(input);
    setError(problem);
    if (problem) return;
    onLoad(new Chess(input.trim()).fen());
    setInput('');
  };
  return (
    <div className={panel} data-testid="position-panel">
      <div className="text-sm font-semibold">Position</div>
      <p className="font-mono text-xs break-all text-muted" data-testid="current-fen">{fen}</p>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 font-mono text-xs"
          placeholder="Paste a FEN"
          aria-label="FEN"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button className={btn} onClick={load} disabled={!input.trim()}>Load FEN</button>
      </div>
      {error && <p className="text-sm text-danger" role="alert" data-testid="fen-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => onLoad(START_FEN)}>Start position</button>
        <button className={btn} onClick={() => onEdit('8/8/8/8/8/8/8/8 w - - 0 1')}>Empty board</button>
        <button className={btn} onClick={() => onEdit(fen)}>Edit position</button>
      </div>
    </div>
  );
}

function PgnPanel({ hasMoves }: { hasMoves: boolean }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const importPgn = () => {
    try {
      const tree = parsePgnTree(text);
      if (!confirmReplace(hasMoves)) return;
      useAnalysisStore.getState().load(tree);
      setError(null);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const pgn = () => treeToPgn(useAnalysisStore.getState().tree);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pgn());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to the clipboard; use Download instead.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([pgn()], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis.pgn';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={panel} data-testid="pgn-panel">
      <div className="text-sm font-semibold">PGN</div>
      <textarea
        className="min-h-20 rounded bg-surface-2 p-2 font-mono text-xs"
        placeholder="Paste a PGN (comments, variations and annotations are kept)"
        aria-label="PGN"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="text-sm text-danger" role="alert" data-testid="pgn-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={importPgn} disabled={!text.trim()}>Import PGN</button>
        <button className={btn} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy PGN'}</button>
        <button className={btn} onClick={download}>Download PGN</button>
      </div>
    </div>
  );
}

function PlayFromHere({ fen, terminal }: { fen: string; terminal: boolean }) {
  const play = () => {
    const { record } = useGameStore.getState();
    if (record.result === '*' && record.moves.length > 0 && !window.confirm('Leave the game in progress on the Play page?')) return;
    const side = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    useGameStore.getState().newGame({
      side,
      timeControlId: 'unlimited',
      opponent: 'bot',
      botElo: loadBotElo() ?? DEFAULT_BOT_ELO,
      startFen: fen,
    });
    location.hash = '#/play';
  };
  return (
    <button className={btn} onClick={play} disabled={terminal} data-testid="play-from-here">
      Play this position vs bot
    </button>
  );
}
