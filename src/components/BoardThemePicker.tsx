import { useState } from 'react';
import { defaultPieces } from 'react-chessboard';
import { BOARD_THEMES, loadBoardTheme, saveBoardTheme, type BoardTheme } from '../settings/boardTheme';
import { PIECE_SETS, pieceUrl, preloadPieceSet, savePieceSet, usePieceSet, type PieceSet } from '../settings/pieceSet';
import { Board } from './Board';

/** An Italian Game position, so the preview shows every piece type of both colours on both square colours. */
const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5';
/** The stylesheet's light-mode colours, for the default theme's swatch. */
const DEFAULT_SWATCH = { light: '#ece3cf', dark: '#7f9a8f' };

const GRID = 'grid grid-cols-4 gap-1.5 md:grid-cols-5';

const option = (on: boolean) =>
  `flex flex-col items-center gap-1 rounded-lg p-1.5 text-xs ${on ? 'bg-accent/15 outline-2 outline-accent' : 'hover:bg-surface-2'}`;

function Swatch({ theme }: { theme: BoardTheme }) {
  if (theme.image) {
    return (
      <span
        className="h-11 w-11 rounded bg-cover"
        style={{ backgroundImage: `url("${theme.image}")`, backgroundSize: '400% 400%' }}
        aria-hidden
      />
    );
  }
  const { light, dark } = theme.colors ?? DEFAULT_SWATCH;
  return (
    <span className="grid h-11 w-11 grid-cols-2 overflow-hidden rounded" aria-hidden>
      <span style={{ backgroundColor: light }} />
      <span style={{ backgroundColor: dark }} />
      <span style={{ backgroundColor: dark }} />
      <span style={{ backgroundColor: light }} />
    </span>
  );
}

/** A white and a black knight from the set, on a neutral tile. */
function PieceSample({ set }: { set: PieceSet }) {
  const piece = (key: string) =>
    set.dir ? <img src={pieceUrl(set, key)!} alt="" className="h-full w-full" draggable={false} /> : defaultPieces[key]();
  return (
    <span className="flex h-11 w-11 items-center rounded bg-surface-2" aria-hidden>
      <span className="h-6 w-6">{piece('wN')}</span>
      <span className="-ml-1 h-6 w-6">{piece('bN')}</span>
    </span>
  );
}

/**
 * Board colours and piece style, with a live preview. Both apply at once to every board and are remembered
 * on this device.
 */
export function BoardThemePicker() {
  const [theme, setTheme] = useState(loadBoardTheme);
  const pieceSet = usePieceSet();
  return (
    // Side by side on wide screens, with the preview kept in view while scrolling the options.
    <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
      <div className="pointer-events-none w-52 shrink-0 md:sticky md:top-4 md:w-60" data-testid="board-preview">
        <Board position={PREVIEW_FEN} orientation="white" id="preview-board" />
      </div>
      <div className="flex w-full min-w-0 flex-col gap-4">

      <div className="w-full">
        <h3 className="mb-1.5 text-sm font-medium">Board</h3>
        <div role="radiogroup" aria-label="Board theme" className="flex flex-col gap-2">
          {(['colour', 'texture'] as const).map((kind) => (
            <div key={kind}>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">{kind === 'colour' ? 'Colours' : 'Textures'}</p>
              <div className={GRID}>
                {BOARD_THEMES.filter((t) => t.kind === kind).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === t.id}
                    onClick={() => {
                      saveBoardTheme(t.id);
                      setTheme(t.id);
                    }}
                    className={option(theme === t.id)}
                  >
                    <Swatch theme={t} />
                    <span className="max-w-full truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full">
        <h3 className="mb-1.5 text-sm font-medium">Pieces</h3>
        <div role="radiogroup" aria-label="Piece style" className={GRID}>
          {PIECE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={pieceSet.id === s.id}
              onMouseEnter={() => preloadPieceSet(s.id)}
              onClick={() => savePieceSet(s.id)}
              className={option(pieceSet.id === s.id)}
            >
              <PieceSample set={s} />
              <span className="max-w-full truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
