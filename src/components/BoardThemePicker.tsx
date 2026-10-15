import { useState } from 'react';
import { BOARD_THEMES, loadBoardTheme, saveBoardTheme, type BoardTheme } from '../settings/boardTheme';
import { MiniBoard } from './MiniBoard';

/** An Italian Game position, so the preview shows pieces of both colours on both square colours. */
const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5';
/** The stylesheet's light-mode colours, for the default theme's swatch. */
const DEFAULT_SWATCH = { light: '#ece3cf', dark: '#7f9a8f' };

function Swatch({ theme }: { theme: BoardTheme }) {
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

/** Board colour choice: applies at once to every board and is remembered on this device. */
export function BoardThemePicker() {
  const [current, setCurrent] = useState(loadBoardTheme);
  return (
    <div className="flex flex-col items-center gap-4">
      <MiniBoard fen={PREVIEW_FEN} size={160} />
      <div role="radiogroup" aria-label="Board theme" className="grid w-full grid-cols-4 gap-1.5">
        {BOARD_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={current === t.id}
            onClick={() => {
              saveBoardTheme(t.id);
              setCurrent(t.id);
            }}
            className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-xs ${
              current === t.id ? 'bg-accent/15 outline-2 outline-accent' : 'hover:bg-surface-2'
            }`}
          >
            <Swatch theme={t} />
            <span className="max-w-full truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
