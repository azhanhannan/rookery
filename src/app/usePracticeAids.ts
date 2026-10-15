import { useMemo, useState, type CSSProperties } from 'react';
import type { BoardArrow } from '../components/Board';
import { PRACTICE } from '../config/tunables';
import { getEngine } from '../engine/EngineService';
import { useBotStatus } from '../game/botTurn';
import { hangingPieces } from '../game/hanging';
import { canTakeBack, humanColor, isPractice, nullMoveFen, takeBack } from '../game/practice';
import { replay } from '../game/rules';
import type { GameRecord } from '../game/types';

const GLOW_KEY = 'rookery.hangingGlow';

function readGlow(): boolean {
  try {
    const v = localStorage.getItem(GLOW_KEY);
    return v === null ? PRACTICE.hangingDefaultOn : v === '1';
  } catch {
    return PRACTICE.hangingDefaultOn;
  }
}

function writeGlow(on: boolean): void {
  try {
    localStorage.setItem(GLOW_KEY, on ? '1' : '0');
  } catch {
    // ignore: the toggle just won't survive a reload
  }
}

export type AidKind = 'threat' | 'hint';

/** One engine answer, tied to the position it was asked for (a new position hides it). */
type Aid =
  | { fen: string; kind: AidKind; state: 'pending' }
  | { fen: string; kind: AidKind; state: 'done'; from: string; to: string }
  | { fen: string; kind: AidKind; state: 'none'; message: string };

export type PracticeAids = {
  /** The live game is a practice game: helpers and the Practice tag are shown. */
  practice: boolean;
  glowOn: boolean;
  setGlowOn(on: boolean): void;
  /** Squares of the player's hanging pieces on the shown position (empty when the glow is off). */
  hanging: string[];
  canTakeBack: boolean;
  takeBack(): void;
  /** Threat and hint can be asked: practice, live position, the player's turn, bot idle. */
  canAsk: boolean;
  ask(kind: AidKind): void;
  /** The shown answer for the current position, if any. */
  aid: Aid | null;
  /** For the board: the threat arrow, or undefined so hand-drawn arrows keep working. */
  arrows: BoardArrow[] | undefined;
  squareStyles: Record<string, CSSProperties> | undefined;
};

export function usePracticeAids(record: GameRecord, viewPly: number): PracticeAids {
  const thinking = useBotStatus((s) => s.thinking);
  const practice = isPractice(record);
  const human = humanColor(record);
  const fen = useMemo(() => replay(record, viewPly).fen(), [record, viewPly]);
  const live = viewPly === record.moves.length && record.result === '*';
  const [glowOn, setGlow] = useState(readGlow);
  const [aidState, setAid] = useState<Aid | null>(null);

  const hanging = useMemo(
    () => (practice && glowOn && human ? hangingPieces(fen, human) : []),
    [practice, glowOn, human, fen],
  );

  const canAsk = practice && live && human !== null && fen.split(' ')[1] === human && !thinking;
  const aid = practice && aidState?.fen === fen ? aidState : null;

  async function ask(kind: AidKind) {
    if (!canAsk) return;
    const asked = fen;
    const target = kind === 'threat' ? nullMoveFen(asked) : asked;
    if (!target) {
      setAid({ fen: asked, kind, state: 'none', message: 'You are in check: deal with that first.' });
      return;
    }
    setAid({ fen: asked, kind, state: 'pending' });
    try {
      const e = await Promise.resolve().then(getEngine);
      const res = await e.analyze(target, PRACTICE.search);
      const best = res.lines[0]?.move;
      // The bot may have cut the search short (its turn began); the answer is then dropped with the position.
      setAid((cur) => {
        if (cur?.fen !== asked || cur.kind !== kind) return cur;
        if (!best) return { fen: asked, kind, state: 'none', message: kind === 'threat' ? 'No threat found.' : 'No move found.' };
        return { fen: asked, kind, state: 'done', from: best.slice(0, 2), to: best.slice(2, 4) };
      });
    } catch (err) {
      setAid((cur) =>
        cur?.fen === asked && cur.kind === kind
          ? { fen: asked, kind, state: 'none', message: `The engine is unavailable: ${err instanceof Error ? err.message : String(err)}` }
          : cur,
      );
    }
  }

  const arrows = useMemo<BoardArrow[] | undefined>(
    () =>
      aid?.state === 'done' && aid.kind === 'threat'
        ? [{ startSquare: aid.from, endSquare: aid.to, color: PRACTICE.threatArrow }]
        : undefined,
    [aid],
  );

  const squareStyles = useMemo(() => {
    const shadows: Record<string, string[]> = {};
    for (const sq of hanging) (shadows[sq] ??= []).push(`inset 0 0 14px 5px ${PRACTICE.hangingGlow}`);
    if (aid?.state === 'done' && aid.kind === 'hint') (shadows[aid.from] ??= []).push(`inset 0 0 0 4px ${PRACTICE.hintGlow}`);
    const keys = Object.keys(shadows);
    if (keys.length === 0) return undefined;
    return Object.fromEntries(keys.map((sq) => [sq, { boxShadow: shadows[sq].join(', ') } as CSSProperties]));
  }, [hanging, aid]);

  return {
    practice,
    glowOn,
    setGlowOn(on) {
      setGlow(on);
      writeGlow(on);
    },
    hanging,
    canTakeBack: canTakeBack(record),
    takeBack() {
      setAid(null);
      takeBack();
    },
    canAsk,
    ask: (kind) => void ask(kind),
    aid,
    arrows,
    squareStyles,
  };
}
