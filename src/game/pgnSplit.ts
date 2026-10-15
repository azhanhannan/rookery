// Splits a multi-game PGN (a file, a paste, a Lichess export) into one text per game. Pure.
//
// A new game starts at a tag line ("[White ...]") that follows movetext, or at movetext that follows a
// game result. Brace comments ({ [%clk 0:03:00] }, even across lines) and ";" rest-of-line comments are
// skipped while scanning, so brackets inside them never start a game. A missing result is fine: the next
// tag section ends the game.

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

type Game = { lines: string[]; hasMovetext: boolean; ended: boolean };

const fresh = (): Game => ({ lines: [], hasMovetext: false, ended: false });

export function splitPgn(text: string): string[] {
  const games: string[] = [];
  let game = fresh();
  let inComment = false;

  const flush = () => {
    const body = game.lines.join('\n').trim();
    if (body) games.push(body);
    game = fresh();
  };

  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    // "%" in the first column escapes the line (PGN standard 6).
    if (!inComment && raw.startsWith('%')) continue;
    const trimmed = raw.trim();
    if (!inComment && trimmed.startsWith('[')) {
      if (game.hasMovetext) flush();
      game.lines.push(trimmed);
      continue;
    }
    if (!inComment && trimmed === '') {
      game.lines.push('');
      continue;
    }

    // Movetext: scan for comments and results; a result followed by more movetext starts the next game.
    let start = 0;
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (inComment) {
        if (ch === '}') inComment = false;
        i++;
        continue;
      }
      if (ch === '{') {
        if (game.ended) {
          game.lines.push(raw.slice(start, i));
          flush();
          start = i;
        }
        inComment = true;
        game.hasMovetext = true;
        i++;
        continue;
      }
      if (ch === ';') break;
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      let j = i;
      while (j < raw.length && !/[\s{;]/.test(raw[j])) j++;
      const token = raw.slice(i, j);
      if (game.ended) {
        game.lines.push(raw.slice(start, i));
        flush();
        start = i;
      }
      game.hasMovetext = true;
      if (RESULT.test(token)) game.ended = true;
      i = j;
    }
    game.lines.push(raw.slice(start));
  }
  flush();
  return games;
}

/** The tag pairs of one game's PGN ("[White \"Ana\"]" -> White: Ana), unescaped. */
export function pgnHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;
  for (const m of text.matchAll(re)) headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  return headers;
}
