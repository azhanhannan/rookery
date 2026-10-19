// Line story: play the stored engine line out and say what provably happens. Contract in ./why.ts.
// Pure (chess.js) and bounded: only the first WHY_STORY.horizon plies of a line are walked, the move itself
// included, and nothing past them is claimed. Each section reports, in order: a mate in the line (which says
// it all), a promotion that stands (said before the material it makes), the material balance at the last quiet
// point, a double attack (better move only), a run of checks (when no material changed hands), and a piece left en prise when the line runs out.
// Nothing provable means no sentence: silence beats a vague claim. The win-chance drop is not a sentence here
// (the UI already shows it).
//
// Wording convention: sides are always named "White" / "Black", never "you". The Why? panel is shown for
// any move of the review, the opponent's too, so "you" would be wrong half the time; side names read the
// same whoever looks. Moves are SAN; Club and Analyst number them ("14...Bxf3 15.gxf3"), Learner doesn't.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { WHY_STORY } from '../config/tunables';
import type { Color } from '../game/types';
import { findMove, other, PIECE_VALUE, see } from './brilliant';
import type { ReviewStyle } from './reviewStyle';
import { playLine } from './tactics';
import type { LineStory, LineStoryInput, WhySentence } from './why';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};
const SIDE: Record<Color, string> = { w: 'White', b: 'Black' };
const COUNT_WORD = ['', 'a', 'two', 'three'];
const ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

/**
 * A line walked from `start`. `moves`: at most the horizon (stops at the first illegal move); only these are
 * narrated or claimed. `full`: the stored line further on (up to WHY_STORY.confirmPlies), read only to judge
 * quiet points and to stay silent when the material comes back later. `ended`: nothing legal is stored after
 * `full`. `from`: the index narration starts at (moves before it are already on the board in the UI).
 */
type Walk = { start: string; moves: Move[]; full: Move[]; ended: boolean; from: number };

function walk(start: string, ucis: string[], from: number): Walk {
  const full = playLine(start, ucis, WHY_STORY.confirmPlies);
  const ended = full.length < WHY_STORY.confirmPlies || ucis.length <= WHY_STORY.confirmPlies;
  return { start, moves: full.slice(0, WHY_STORY.horizon), full, ended, from };
}

/** "14.Nf3" / "14...Bxf3": a move with its number. */
function numbered(m: Move): string {
  const n = m.before.split(' ')[5] ?? '1';
  return m.color === 'w' ? `${n}.${m.san}` : `${n}...${m.san}`;
}

/**
 * The moves `moves[from..to)` in SAN for this style. Longer than the style spells out: Club and Analyst show
 * the first and last ("10...d5 … 12.Bxd5"), Learner gets null (the sentence is told without moves).
 */
function narrate(moves: Move[], from: number, to: number, style: ReviewStyle): string | null {
  const seq = moves.slice(from, to);
  if (seq.length === 0) return null;
  if (seq.length > WHY_STORY.maxMoves[style]) {
    return style === 'learner' ? null : `${numbered(seq[0])} … ${numbered(seq[seq.length - 1])}`;
  }
  if (style === 'learner') return seq.map((m) => m.san).join(' and ');
  return seq.map((m, i) => (m.color === 'w' || i === 0 ? numbered(m) : m.san)).join(' ');
}

/** The sentence's `line` (UCI) and the FEN it starts from: `moves[from..to)`. */
function lineOf(w: Walk, from: number, to: number): Pick<WhySentence, 'line' | 'fromFen'> {
  return { line: w.moves.slice(from, to).map((m) => m.lan), fromFen: from === 0 ? w.start : w.moves[from - 1].after };
}

type Counts = Record<Color, Record<PieceSymbol, number>>;

function counts(fen: string): Counts {
  const zero = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });
  const c: Counts = { w: zero(), b: zero() };
  for (const row of new Chess(fen).board()) for (const p of row) if (p) c[p.color][p.type]++;
  return c;
}

function balance(c: Counts, color: Color): number {
  let sum = 0;
  for (const t of ORDER) sum += (c[color][t] - c[other(color)][t]) * PIECE_VALUE[t];
  return sum;
}

/** "a knight", "two pawns", "a rook and a pawn"; null when it takes more than two kinds of piece. */
function pieceList(types: PieceSymbol[]): string | null {
  const groups = ORDER.filter((t) => types.includes(t)).map((t) => {
    const n = types.filter((x) => x === t).length;
    return n === 1 ? `a ${PIECE_NAME[t]}` : n < COUNT_WORD.length ? `${COUNT_WORD[n]} ${PIECE_NAME[t]}s` : null;
  });
  if (groups.length === 0 || groups.length > 2 || groups.includes(null)) return null;
  return groups.join(' and ');
}

/**
 * What `winner` won between `start` and `end`, by the pieces that left the board: "a knight for a pawn",
 * "the exchange". "material" when a promotion is involved or it takes too many words to say.
 */
function whatWon(start: Counts, end: Counts, winner: Color): string {
  const lost = (c: Color): PieceSymbol[] | null => {
    const out: PieceSymbol[] = [];
    for (const t of ORDER) {
      const d = end[c][t] - start[c][t];
      if (d > 0) return null;
      for (let i = 0; i < -d; i++) out.push(t);
    }
    return out;
  };
  const gained = lost(other(winner));
  const given = lost(winner);
  if (!gained || !given) return 'material';
  // Like for like cancels out: a knight each is not part of the story.
  for (const t of [...given]) {
    const i = gained.indexOf(t);
    if (i >= 0) {
      gained.splice(i, 1);
      given.splice(given.indexOf(t), 1);
    }
  }
  if (gained.length === 1 && gained[0] === 'r' && given.length === 1 && (given[0] === 'n' || given[0] === 'b')) return 'the exchange';
  const g = pieceList(gained);
  if (!g) return 'material';
  if (given.length === 0) return g;
  const v = pieceList(given);
  return v ? `${g} for ${v}` : 'material';
}

/**
 * True when nothing hangs after moves[k-1]: the line's next move is neither a capture nor a promotion or, when
 * the stored line ends there, the side to move can't win material by a capture (static exchange).
 */
function quietAt(w: Walk, k: number): boolean {
  const next = w.full[k];
  if (next) return !next.captured && !next.promotion;
  if (!w.ended) return false;
  const pos = new Chess(w.full[k - 1].after);
  if (pos.isGameOver()) return true;
  const stm = pos.turn();
  for (const row of pos.board()) for (const p of row) if (p && p.color !== stm && see(pos, p.square, stm) >= 1) return false;
  return true;
}

/**
 * Material: the balance (from `mover`'s side, counted from the start) at the last quiet point within the
 * horizon, narrated up to the earliest quiet point from which it stays that. Null below WHY_STORY.minMaterial.
 * The stored line is read further (never narrated): when it gives material back by its last quiet point, the
 * claim shrinks to an earlier point within the horizon that it still covers, or goes silent. "Wins a rook" must
 * not be a rook that is trapped and lost two moves past the horizon.
 */
function materialSentence(w: Walk, mover: Color, style: ReviewStyle, winnerMustBe?: Color): WhySentence | null {
  const startCounts = counts(w.start);
  const base = balance(startCounts, mover);
  const quiet: { k: number; net: number; c: Counts }[] = [];
  for (let k = Math.max(1, w.from); k <= w.moves.length; k++) {
    if (!quietAt(w, k)) continue;
    const c = counts(w.moves[k - 1].after);
    quiet.push({ k, net: balance(c, mover) - base, c });
  }
  const last = quiet[quiet.length - 1];
  if (!last || Math.abs(last.net) < WHY_STORY.minMaterial) return null;
  const dir = Math.sign(last.net);
  const winner = dir > 0 ? mover : other(mover);
  if (winnerMustBe && winner !== winnerMustBe) return null;
  // Read on past the horizon: at the line's last quiet point the winner must still be up at least minMaterial,
  // and the claim is capped at what it still has there.
  let bound = Infinity;
  for (let k = w.full.length; k > w.moves.length; k--) {
    if (!quietAt(w, k)) continue;
    const later = balance(counts(w.full[k - 1].after), mover) - base;
    if (Math.sign(later) !== dir || Math.abs(later) < WHY_STORY.minMaterial) return null;
    bound = Math.abs(later);
    break;
  }
  // The latest quiet point within the horizon whose balance fits under the cap, told from the earliest quiet
  // point that already had that balance (and kept it).
  let j = quiet.length - 1;
  while (j >= 0 && (Math.sign(quiet[j].net) !== dir || Math.abs(quiet[j].net) < WHY_STORY.minMaterial || Math.abs(quiet[j].net) > bound)) j--;
  if (j < 0) return null;
  let i = j;
  while (i > 0 && quiet[i - 1].net === quiet[j].net) i--;
  const cut = quiet[i];

  const what = whatWon(startCounts, cut.c, winner);
  const lastMove = w.moves[cut.k - 1];
  const check = lastMove.color === winner && lastMove.san.endsWith('+') ? ' and gives check' : '';
  const amount = style === 'analyst' ? ` (+${Math.abs(cut.net)})` : '';
  const seq = narrate(w.moves, w.from, cut.k, style);
  const claim = `${SIDE[winner]} wins ${what}${check}${amount}.`;
  return {
    text: seq ? `After ${seq}, ${claim}` : `With best play, ${claim}`,
    kind: winner === mover ? 'wins-material' : 'loses-material',
    ...lineOf(w, w.from, cut.k),
  };
}

/** Mate within the horizon: "Black mates: 20...Qxh2+ 21.Kf1 Qh1#." `null` too when it is not `by`'s mate. */
function mateSentence(w: Walk, style: ReviewStyle, by?: Color): WhySentence | null {
  const idx = w.moves.findIndex((m) => m.san.endsWith('#'));
  if (idx < 0 || (by && w.moves[idx].color !== by)) return null;
  const from = Math.min(w.from, idx);
  const mate = w.moves[idx];
  const seq = narrate(w.moves, from, idx + 1, style);
  const text = seq ? `${SIDE[mate.color]} mates: ${seq}.` : `${SIDE[mate.color]} ends it with checkmate: ${mate.san}.`;
  return { text, kind: 'mate', ...lineOf(w, from, idx + 1) };
}

/**
 * A run of at least WHY_STORY.minChecks checks in a row by `checker` that drive the king: each one answered by a
 * king move that takes nothing (a check that trades queens, or is blocked, is not a king hunt).
 */
function checkSentence(w: Walk, checker: Color, style: ReviewStyle): WhySentence | null {
  let best: [number, number, number] | null = null; // first index, last index, checks
  let run: [number, number, number] | null = null;
  for (let i = w.from; i < w.moves.length; i++) {
    const m = w.moves[i];
    if (m.color !== checker) continue;
    const answer = w.full[i + 1];
    if (m.san.endsWith('+') && (!answer || (answer.piece === 'k' && !answer.captured))) {
      run = run ? [run[0], i, run[2] + 1] : [i, i, 1];
      if (!best || run[2] > best[2]) best = run;
    } else run = null;
  }
  if (!best || best[2] < WHY_STORY.minChecks) return null;
  const seq = narrate(w.moves, best[0], best[1] + 1, style);
  const text = seq ? `${SIDE[checker]} keeps checking: ${seq}.` : `${SIDE[checker]} gives check after check.`;
  return { text, kind: 'check', ...lineOf(w, best[0], best[1] + 1) };
}

/** A promotion in the line (by `by`, when given) whose new piece is still on the board at the end of it (and not hanging there). */
function promotionSentence(w: Walk, style: ReviewStyle, by?: Color): WhySentence | null {
  for (let idx = w.from; idx < w.moves.length; idx++) {
    const p = w.moves[idx];
    if (!p.promotion || (by && p.color !== by)) continue;
    let at = p.to as Square;
    let alive = true;
    for (const m of w.full.slice(idx + 1, w.moves.length + 1)) {
      if (m.color !== p.color && m.to === at) alive = false;
      else if (m.color === p.color && m.from === at) at = m.to as Square;
    }
    const end = new Chess(w.moves[w.moves.length - 1].after);
    if (!alive || (w.full.length === w.moves.length && end.attackers(at, other(p.color)).length > 0)) continue;
    const san = narrate(w.moves, idx, idx + 1, style) ?? p.san;
    return {
      text: `${SIDE[p.color]} promotes a pawn to a ${PIECE_NAME[p.promotion]}: ${san}.`,
      kind: 'promotion',
      ...lineOf(w, w.from, idx + 1),
    };
  }
  return null;
}

/**
 * The stored line runs out (within the horizon) right after one of `mover`'s moves, leaving a piece of theirs
 * (not a pawn or the king) that the opponent, to move, wins at least WHY_STORY.hangMin by taking: undefended,
 * or attacked by something cheaper.
 */
function hangsSentence(w: Walk, mover: Color, style: ReviewStyle): WhySentence | null {
  const last = w.moves[w.moves.length - 1];
  if (!w.ended || w.full.length > w.moves.length || !last || last.color !== mover) return null;
  const pos = new Chess(last.after);
  if (pos.isGameOver()) return null;
  const them = other(mover);
  let found: { square: Square; type: PieceSymbol; by: PieceSymbol | null } | null = null;
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== mover || p.type === 'p' || p.type === 'k') continue;
      if (see(pos, p.square, them) < WHY_STORY.hangMin) continue;
      if (found && PIECE_VALUE[found.type] >= PIECE_VALUE[p.type]) continue;
      const defended = pos.attackers(p.square, mover).length > 0;
      const cheapest = pos
        .attackers(p.square, them)
        .map((s) => pos.get(s)!.type)
        .sort((a, b) => PIECE_VALUE[a] - PIECE_VALUE[b])[0];
      found = { square: p.square, type: p.type, by: defended ? cheapest : null };
    }
  }
  if (!found) return null;
  const how = found.by ? `attacked by a ${PIECE_NAME[found.by]}` : 'attacked and undefended';
  const seq = narrate(w.moves, w.from, w.moves.length, style);
  const piece = `${SIDE[mover]}'s ${PIECE_NAME[found.type]} on ${found.square}`;
  return {
    text: seq ? `After ${seq}, ${piece} is ${how}.` : `${piece[0].toUpperCase()}${piece.slice(1)} ends the line ${how}.`,
    kind: 'hangs-at-end',
    ...lineOf(w, w.from, w.moves.length),
  };
}

/**
 * The better move attacks two of the opponent's pieces at once (each the king, undefended, or worth more than
 * the attacker), and the attacker can't just be taken. "Black can't save both" only when every legal reply
 * leaves one of them to a capture that wins material (static exchange): checked, not assumed.
 */
function doubleAttackSentence(w: Walk, style: ReviewStyle): WhySentence | null {
  const first = w.moves[0];
  if (!first) return null;
  const mover = first.color;
  const them = other(mover);
  const pos = new Chess(first.after);
  const from = first.to as Square;
  if (see(pos, from, them) > 0) return null;
  const targets: { square: Square; type: PieceSymbol }[] = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== them || p.type === 'p') continue;
      if (!pos.attackers(p.square, mover).includes(from)) continue;
      if (p.type === 'k' || PIECE_VALUE[p.type] > PIECE_VALUE[first.piece] || pos.attackers(p.square, them).length === 0) {
        targets.push({ square: p.square, type: p.type });
      }
    }
  }
  if (targets.length < 2) return null;
  targets.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const shown = targets.slice(0, 2);

  const cantSave = pos.moves({ verbose: true }).every((r) => {
    const squares = new Set(shown.filter((t) => t.type !== 'k').map((t) => (r.from === t.square ? r.to : t.square)));
    return new Chess(r.after).moves({ verbose: true }).some((m) => {
      if (!m.captured || !squares.has(m.to)) return false;
      return PIECE_VALUE[m.captured] - see(new Chess(m.after), m.to as Square, them) >= WHY_STORY.minMaterial;
    });
  });
  const san = narrate(w.moves, 0, 1, style) ?? first.san;
  const names = `${SIDE[them]}'s ${PIECE_NAME[shown[0].type]} and ${PIECE_NAME[shown[1].type]}`;
  return {
    text: `${san} attacks ${names} at once${cantSave ? `, and ${SIDE[them]} can't save both` : ''}.`,
    kind: 'attacks-two',
    ...lineOf(w, 0, 1),
  };
}

/** Drops nulls, and a vague "wins material" when a promotion sentence already tells where it came from; then the style's cap. */
function cap(sentences: (WhySentence | null)[], style: ReviewStyle): WhySentence[] {
  const out = sentences.filter((s): s is WhySentence => s !== null);
  const promoted = out.some((s) => s.kind === 'promotion');
  return out.filter((s) => !(promoted && s.text.includes(' wins material'))).slice(0, WHY_STORY.maxSentences[style]);
}

/** After the move played: the reply line. Narration starts at the reply unless the move itself took or promoted. */
function playedStory(i: LineStoryInput, style: ReviewStyle): WhySentence[] {
  const played = findMove(i.fenBefore, i.played);
  if (!played || played.color !== i.mover) return [];
  const w = walk(i.fenBefore, [i.played, ...i.lineAfter], played.captured || played.promotion ? 0 : 1);
  const mate = mateSentence(w, style);
  if (mate) return [mate];
  const material = materialSentence(w, i.mover, style);
  return cap(
    [promotionSentence(w, style), material, material ? null : checkSentence(w, other(i.mover), style), hangsSentence(w, i.mover, style)],
    style,
  );
}

/** The engine's better move and its line: only what it achieves for the mover. */
function betterStory(i: LineStoryInput, style: ReviewStyle): WhySentence[] {
  const best = i.lineBefore[0];
  if (!best || best.toLowerCase() === i.played.toLowerCase()) return [];
  const first = findMove(i.fenBefore, best);
  if (!first || first.color !== i.mover) return [];
  const w = walk(i.fenBefore, i.lineBefore, 0);
  // A line that ends in the opponent's mate achieves nothing to tell; one that mates says it all.
  if (w.moves.some((m) => m.san.endsWith('#'))) {
    const mate = mateSentence(w, style, i.mover);
    return mate ? [mate] : [];
  }
  const material = materialSentence(w, i.mover, style, i.mover);
  return cap(
    [promotionSentence(w, style, i.mover), material, doubleAttackSentence(w, style), material ? null : checkSentence(w, i.mover, style)],
    style,
  );
}

export function lineStory(input: LineStoryInput, style: ReviewStyle): LineStory {
  // A malformed FEN or line must never break the Review screen: no story is better than an error.
  let played: WhySentence[] = [];
  let better: WhySentence[] = [];
  try {
    played = playedStory(input, style);
  } catch {
    played = [];
  }
  try {
    better = betterStory(input, style);
  } catch {
    better = [];
  }
  return { played, better };
}
