// Bulk import (Import page): saves many PGN games to this device's history the way a single finished
// import is saved (the game archive), and queues them for upload when signed in. Also fetches a Lichess
// player's games. The parsing rules live in src/game/importBatch.ts and src/game/pgnSplit.ts.
import { queueGameUpload } from '../account/gameSync';
import { gameKey, gameLabel, guessPlayerName, colorOfPlayer, prepareGame } from '../game/importBatch';
import { archiveGames, HISTORY_LIMIT, loadHistory } from '../game/storage';
import type { GameRecord } from '../game/types';

export type ImportProgress = { done: number; total: number };

export type ImportSummary = {
  imported: number;
  duplicates: number;
  failed: { label: string; reason: string }[];
  /** Saved games, newest first. */
  importedIds: string[];
  /** The name whose side was taken as "you" (given, or the one name common to every game); null = none. */
  player: string | null;
};

export type ImportOptions = {
  /** The importing player's name in these games; when absent, the one name in every game is used. */
  player?: string;
  signal?: AbortSignal;
  onProgress?: (p: ImportProgress) => void;
};

function abortError(): DOMException {
  return new DOMException('Import cancelled', 'AbortError');
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Parses, de-duplicates and saves the games. Nothing is saved when cancelled (rejects with an AbortError).
 * Never pushes older games off this device: what doesn't fit under HISTORY_LIMIT is reported as failed.
 */
export async function importGames(texts: string[], opts: ImportOptions = {}): Promise<ImportSummary> {
  const { signal, onProgress } = opts;
  const failed: ImportSummary['failed'] = [];
  const ok: GameRecord[] = [];
  for (const [i, text] of texts.entries()) {
    if (signal?.aborted) throw abortError();
    const res = prepareGame(text, opts.player);
    if (res.ok) ok.push(res.record);
    else failed.push({ label: gameLabel(text, i), reason: res.reason });
    onProgress?.({ done: i + 1, total: texts.length });
    if (i % 5 === 4) await nextFrame();
  }
  if (signal?.aborted) throw abortError();

  const player = opts.player?.trim() || guessPlayerName(ok);
  if (player && !opts.player?.trim()) {
    for (const r of ok) {
      const side = colorOfPlayer(r, player);
      if (side) r.userColor = side;
    }
  }

  const history = loadHistory();
  const seen = new Set(history.map(gameKey));
  let duplicates = 0;
  const fresh: GameRecord[] = [];
  for (const r of ok) {
    const key = gameKey(r);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    fresh.push(r);
  }
  fresh.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const room = Math.max(0, HISTORY_LIMIT - history.length);
  const kept = fresh.slice(0, room);
  for (const r of fresh.slice(room)) {
    failed.push({
      label: `${r.white.name} vs ${r.black.name}, ${r.createdAt.slice(0, 10)}`,
      reason: `This device keeps at most ${HISTORY_LIMIT} games`,
    });
  }
  if (kept.length && !archiveGames(kept)) {
    for (const r of kept) {
      failed.push({ label: `${r.white.name} vs ${r.black.name}`, reason: "This device's storage is full" });
    }
    return { imported: 0, duplicates, failed, importedIds: [], player };
  }
  for (const r of kept) queueGameUpload(r.id);
  return { imported: kept.length, duplicates, failed, importedIds: kept.map((r) => r.id), player };
}

/**
 * Downloads a Lichess export as PGN text, reporting how many games have arrived so far.
 * Errors are written for the player to read.
 */
export async function fetchLichessPgn(
  url: string,
  username: string,
  signal: AbortSignal,
  onGames: (n: number) => void,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' }, signal });
  } catch (e) {
    if (signal.aborted) throw abortError();
    throw new Error(`Couldn't reach Lichess. Check your connection and try again. (${e instanceof Error ? e.message : String(e)})`);
  }
  if (res.status === 404) throw new Error(`Lichess has no player called "${username}".`);
  if (res.status === 429) throw new Error('Lichess is limiting requests right now. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Lichess answered with an error (${res.status}). Try again later.`);
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onGames((text.match(/^\[Event /gm) ?? []).length);
  }
  return text + decoder.decode();
}
