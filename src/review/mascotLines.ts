// The one positive line the coach mascot may say on the "Good fight" end screen. Pure. It only speaks a
// fact the review proves (the engine labelled one of your moves Brilliant, Great or Best); otherwise nothing.
import type { Color } from '../game/types';
import type { GameReview, MoveLabel, MoveReview } from './types';

const PRAISE: { label: MoveLabel; words: string }[] = [
  { label: 'Brilliant', words: 'a brilliant move' },
  { label: 'Great', words: 'a great find' },
  { label: 'Best', words: 'the best move' },
];

/** Your best-labelled move (Brilliant > Great > Best; the latest of equals, as the game got harder), or null. */
export function bestOwnMove(review: GameReview, colors: Color[]): MoveReview | null {
  for (const { label } of PRAISE) {
    const mine = review.moves.filter((m) => colors.includes(m.color) && m.label === label);
    if (mine.length) return mine[mine.length - 1];
  }
  return null;
}

/** "23. Nf5 was a great find. Nice!" for your best-labelled move, or null when there isn't one. */
export function goodFightLine(review: GameReview, colors: Color[], fmt: (san: string) => string = (s) => s): string | null {
  const m = bestOwnMove(review, colors);
  if (!m) return null;
  const words = PRAISE.find((p) => p.label === m.label)!.words;
  const no = Math.ceil(m.ply / 2);
  const title = m.color === 'w' ? `${no}. ${fmt(m.san)}` : `${no}... ${fmt(m.san)}`;
  return `${title} was ${words}. Nice!`;
}
