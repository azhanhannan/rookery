// Pure helpers for the My games page: labels, filters, stats and day groups. Shared by the server-backed
// list (signed in) and the list of games saved on this device (signed out or offline).
import type { GameFilter, GameStats, GameSummary } from '../api/types';
import { myColor } from '../game/myColor';
import type { Color, GameRecord } from '../game/types';

export type Outcome = 'won' | 'lost' | 'drawn' | 'none';

/** The account holder's outcome; 'none' for games between two people at one screen (or unfinished ones). */
export function outcomeOf(g: Pick<GameSummary, 'result' | 'userColor'>): Outcome {
  if (!g.userColor || g.result === '*') return 'none';
  if (g.result === '1/2-1/2') return 'drawn';
  return (g.result === '1-0') === (g.userColor === 'w') ? 'won' : 'lost';
}

/** Won/Lost/Draw for the player's side; the plain score for a game between two people at one screen. */
export function resultLabel(g: Pick<GameSummary, 'result' | 'userColor'>): string {
  const o = outcomeOf(g);
  if (o === 'won') return 'Won';
  if (o === 'lost') return 'Lost';
  if (o === 'drawn') return 'Draw';
  return g.result === '1/2-1/2' ? '½-½' : g.result;
}

/** "180+2" -> "3+2"; whole minutes where possible. */
export function timeControlLabel(tc?: string): string {
  if (!tc) return 'Unlimited';
  const [base, inc] = tc.split('+').map(Number);
  if (!Number.isFinite(base)) return tc;
  const minutes = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1);
  return `${minutes}+${Number.isFinite(inc) ? inc : 0}`;
}

/** "by checkmate", "on time", ... ; null when the ending isn't recorded. */
export function endedText(termination?: string): string | null {
  if (!termination) return null;
  if (termination.startsWith('timeout')) return 'on time';
  return `by ${termination}`;
}

/** Full moves from plies: 41 plies = 21 moves. */
export const fullMoves = (plies: number) => Math.ceil(plies / 2);

/** The side an imported game says the player played; else the non-bot side when exactly one side is a bot; else null. */
export function personColor(record: GameRecord): Color | null {
  return myColor(record);
}

/** A game saved on this device, shown like a saved one (no rating change: that only exists on the server). */
export function summaryFromRecord(record: GameRecord): GameSummary {
  const userColor = personColor(record);
  return {
    clientId: record.id,
    white: record.white.name,
    black: record.black.name,
    result: record.result,
    termination: record.termination,
    userColor,
    opponentName: userColor ? (userColor === 'w' ? record.black.name : record.white.name) : 'Friend at this screen',
    timeControl: record.timeControl,
    rated: false,
    category: null,
    moves: record.moves.length,
    hasReview: !!record.review,
    playedAt: record.createdAt,
    finalFen: record.moves.at(-1)?.fenAfter ?? record.startFen,
  };
}

export function matchesFilter(g: GameSummary, filter: GameFilter): boolean {
  switch (filter) {
    case 'won':
    case 'lost':
    case 'drawn':
      return outcomeOf(g) === filter;
    case 'rated':
      return g.rated;
    case 'casual':
      return !g.rated;
    default:
      return true;
  }
}

export function statsOf(games: GameSummary[]): GameStats {
  const s: GameStats = { total: games.length, won: 0, lost: 0, drawn: 0 };
  for (const g of games) {
    const o = outcomeOf(g);
    if (o !== 'none') s[o]++;
  }
  return s;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Yesterday", else e.g. "Mon, 12 Oct" (with the year when it isn't this year). Local time. */
export function dayLabel(at: Date, now: Date): string {
  if (dayKey(at) === dayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(y)) return 'Yesterday';
  return at.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Consecutive games (already newest first) grouped by local day. */
export function groupByDay(games: GameSummary[], now: Date = new Date()): { label: string; games: GameSummary[] }[] {
  const groups: { key: string; label: string; games: GameSummary[] }[] = [];
  for (const g of games) {
    const at = new Date(g.playedAt);
    const key = dayKey(at);
    const last = groups.at(-1);
    if (last?.key === key) last.games.push(g);
    else groups.push({ key, label: dayLabel(at, now), games: [g] });
  }
  return groups.map(({ label, games }) => ({ label, games }));
}
