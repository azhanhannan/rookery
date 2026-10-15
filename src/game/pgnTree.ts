// Lossless PGN for the Analysis board: comments, nested variations, NAGs and the [%cal]/[%csl]/[%eval]/[%clk]
// commands inside comments all survive an import/export round trip. Play and Import keep using pgn.ts.
import { Chess } from 'chess.js';
import { START_FEN } from './rules';
import { addMove, createTree, getNode, type VariationTree } from './variationTree';

type Token =
  | { t: 'tag'; name: string; value: string }
  | { t: 'comment'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'nag'; n: number }
  | { t: 'move'; san: string }
  | { t: 'result'; value: string };

const GLYPHS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const GLYPH_OF: Record<number, string> = Object.fromEntries(Object.entries(GLYPHS).map(([g, n]) => [n, g]));
const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
const SEVEN_TAGS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = text.length;
  let lineStart = true;
  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      lineStart = true;
      i++;
      continue;
    }
    // "%" in the first column escapes the whole line.
    if (c === '%' && lineStart) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    lineStart = false;
    if (/\s/.test(c)) {
      i++;
    } else if (c === '[') {
      const end = findTagEnd(text, i);
      const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/s.exec(text.slice(i, end + 1));
      if (!m) throw new Error(`Couldn't read the tag ${text.slice(i, Math.min(end + 1, i + 40))}`);
      out.push({ t: 'tag', name: m[1], value: m[2].replace(/\\(.)/g, '$1') });
      i = end + 1;
    } else if (c === '{') {
      const end = text.indexOf('}', i);
      if (end < 0) throw new Error('A comment is missing its closing }');
      out.push({ t: 'comment', text: text.slice(i + 1, end).trim() });
      i = end + 1;
    } else if (c === ';') {
      let end = text.indexOf('\n', i);
      if (end < 0) end = n;
      out.push({ t: 'comment', text: text.slice(i + 1, end).trim() });
      i = end;
    } else if (c === '(') {
      out.push({ t: 'open' });
      i++;
    } else if (c === ')') {
      out.push({ t: 'close' });
      i++;
    } else if (c === '$') {
      const m = /^\$(\d+)/.exec(text.slice(i));
      if (!m) throw new Error('A $ without a number');
      out.push({ t: 'nag', n: Number(m[1]) });
      i += m[0].length;
    } else {
      let j = i;
      while (j < n && !/[\s(){};[$]/.test(text[j])) j++;
      wordTokens(text.slice(i, j), out);
      i = j;
    }
  }
  return out;
}

function findTagEnd(text: string, from: number): number {
  let inString = false;
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i];
    if (inString && c === '\\') i++;
    else if (c === '"') inString = !inString;
    else if (c === ']' && !inString) return i;
  }
  throw new Error('A tag is missing its closing ]');
}

/** One whitespace-free word of movetext: "12.", "12...Nf6", "e4!?", "1-0", "!". */
function wordTokens(word: string, out: Token[]) {
  if (RESULTS.includes(word)) {
    out.push({ t: 'result', value: word });
    return;
  }
  let w = word.replace(/^\d+\.*/, '');
  if (!w) return;
  if (w in GLYPHS) {
    out.push({ t: 'nag', n: GLYPHS[w] });
    return;
  }
  const glyph = /[!?]{1,2}$/.exec(w);
  if (glyph) w = w.slice(0, -glyph[0].length);
  if (w === '--' || w === 'Z0') throw new Error('Null moves (--) are not supported');
  // Some programs write castling with zeros.
  w = w.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
  out.push({ t: 'move', san: w });
  if (glyph && glyph[0] in GLYPHS) out.push({ t: 'nag', n: GLYPHS[glyph[0]] });
}

function append(a: string | undefined, b: string): string {
  if (!b) return a ?? '';
  return a ? `${a} ${b}` : b;
}

/**
 * Parses the first game of a PGN into a variation tree. Throws an Error with a readable message on bad input
 * (an illegal move names the move and where it is).
 */
export function parsePgnTree(text: string): VariationTree {
  const tokens = tokenize(text);
  const headers: [string, string][] = [];
  let k = 0;
  for (; k < tokens.length && tokens[k].t === 'tag'; k++) {
    const tag = tokens[k] as Extract<Token, { t: 'tag' }>;
    headers.push([tag.name, tag.value]);
  }
  const fenTag = headers.find(([h]) => h === 'FEN')?.[1];
  let startFen = START_FEN;
  if (fenTag) {
    try {
      startFen = new Chess(fenTag).fen();
    } catch (e) {
      throw new Error(`The FEN tag isn't a valid position: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let tree = createTree(startFen, headers);
  let cur = tree.rootId;
  /** No move yet in the current line (game start, or just after "("). */
  let lineStart = true;
  let pre: string | undefined;
  const stack: string[] = [];

  const patch = (id: string, f: (n: VariationTree['nodes'][string]) => Partial<VariationTree['nodes'][string]>) => {
    const node = getNode(tree, id);
    tree = { ...tree, nodes: { ...tree.nodes, [id]: { ...node, ...f(node) } } };
  };

  for (; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'result' || tok.t === 'tag') {
      // A result ends the game; a tag means the next game has started without one.
      if (stack.length === 0) break;
      if (tok.t === 'tag') break;
      continue;
    }
    if (tok.t === 'move') {
      const r = addMove(tree, cur, tok.san);
      if (!r) {
        const node = getNode(tree, cur);
        const parts = node.fen.split(' ');
        const where = `${parts[5]}${parts[1] === 'w' ? '.' : '...'}`;
        throw new Error(`Illegal move "${tok.san}" at ${where}`);
      }
      tree = r.tree;
      cur = r.id;
      if (pre !== undefined) {
        const p = pre;
        patch(cur, (n) => ({ preComment: append(n.preComment, p) }));
        pre = undefined;
      }
      lineStart = false;
    } else if (tok.t === 'open') {
      const node = getNode(tree, cur);
      if (!node.parentId) throw new Error('A variation "(" before any move');
      stack.push(cur);
      cur = node.parentId;
      lineStart = true;
    } else if (tok.t === 'close') {
      if (!stack.length) throw new Error('A ")" without its "("');
      cur = stack.pop()!;
      lineStart = false;
      pre = undefined;
    } else if (tok.t === 'comment') {
      if (lineStart && stack.length > 0) pre = append(pre, tok.text);
      else patch(cur, (n) => ({ comment: append(n.comment, tok.text) || undefined }));
    } else if (tok.t === 'nag') {
      if (!lineStart) patch(cur, (n) => ({ nags: [...n.nags, tok.n] }));
    }
  }
  return tree;
}

// ---------- Export ----------

function escapeTag(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
}

/** The headers as exported: the tree's own (in order), the Seven Tag Roster filled in, FEN/SetUp matching the root. */
export function exportHeaders(tree: VariationTree): [string, string][] {
  const rootFen = tree.nodes[tree.rootId].fen;
  const has = (name: string) => tree.headers.some(([h]) => h === name);
  const defaults: Record<string, string> = {
    Event: 'Analysis',
    Site: 'Rookery',
    Date: today(),
    Round: '-',
    White: '?',
    Black: '?',
    Result: '*',
  };
  let out: [string, string][] = [...tree.headers];
  const missing = SEVEN_TAGS.filter((t) => !has(t)).map((t): [string, string] => [t, defaults[t]]);
  out = [...missing, ...out];
  // Roster first in its standard order when we had to add any of it.
  if (missing.length) {
    const roster = SEVEN_TAGS.map((t) => out.find(([h]) => h === t)!);
    out = [...roster, ...out.filter(([h]) => !SEVEN_TAGS.includes(h))];
  }
  if (rootFen !== START_FEN) {
    if (!has('SetUp')) out.push(['SetUp', '1']);
    out = out.filter(([h]) => h !== 'FEN');
    out.push(['FEN', rootFen]);
  } else {
    out = out.filter(([h]) => h !== 'FEN' && h !== 'SetUp');
  }
  return out;
}

/** Serialises the whole tree (all variations, comments, NAGs). */
export function treeToPgn(tree: VariationTree): string {
  const headers = exportHeaders(tree);
  const resultTag = headers.find(([h]) => h === 'Result')?.[1] ?? '*';
  const result = RESULTS.includes(resultTag) ? resultTag : '*';

  const toks: string[] = [];
  const root = tree.nodes[tree.rootId];
  if (root.comment) toks.push(`{${root.comment}}`);

  const emitMove = (id: string, force: boolean) => {
    const n = tree.nodes[id];
    if (n.preComment) toks.push(`{${n.preComment}}`);
    const parts = tree.nodes[n.parentId!].fen.split(' ');
    const no = parts[5] || '1';
    if (parts[1] === 'w') toks.push(`${no}.`);
    else if (force || n.preComment) toks.push(`${no}...`);
    let nags = n.nags;
    let san = n.san!;
    if (nags.length && GLYPH_OF[nags[0]]) {
      san += GLYPH_OF[nags[0]];
      nags = nags.slice(1);
    }
    toks.push(san);
    for (const g of nags) toks.push(`$${g}`);
    if (n.comment) toks.push(`{${n.comment}}`);
  };

  const continuation = (fromId: string, forceFirst: boolean) => {
    let p = tree.nodes[fromId];
    let force = forceFirst;
    while (p.children.length) {
      const [main, ...vars] = p.children;
      emitMove(main, force);
      force = !!tree.nodes[main].comment;
      for (const v of vars) {
        toks.push('(');
        emitMove(v, true);
        continuation(v, !!tree.nodes[v].comment);
        toks.push(')');
        force = true;
      }
      p = tree.nodes[main];
    }
  };
  continuation(tree.rootId, true);
  toks.push(result);

  // Wrap at 80 columns between tokens; "(" sticks to what follows and ")" to what precedes.
  const lines: string[] = [];
  let line = '';
  let glue = false;
  for (const t of toks) {
    if (t === ')') {
      line += ')';
      continue;
    }
    const piece = t;
    if (line && !glue && line.length + 1 + piece.length > 80) {
      lines.push(line);
      line = '';
    }
    line += line && !glue ? ` ${piece}` : piece;
    glue = t === '(';
  }
  if (line) lines.push(line);

  const head = headers.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join('\n');
  return `${head}\n\n${lines.join('\n')}\n`;
}
