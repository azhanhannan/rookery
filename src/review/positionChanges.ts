// What changed: measurable differences between the position before and after a move. Contract in ./why.ts.
// Pure chess.js and board geometry, no engine. Every fact is TRUE of the two positions; none is claimed as the
// cause of an evaluation drop (the UI shows them under "What changed"), so the wording only describes.
//
// Text convention (as `captionText` in ./captions.ts): mover-relative. "This" is the move, "your" is the side
// that moved it, "their" is the other side, whoever reads the review. Learner: plain words, no squares; Club:
// piece and file names; Analyst: squares too.
//
// The rules, each crisp (relative ranks: 1 = the side's back rank):
//   - king-shield: the mover's king is castled (back rank, on the a/b/c or g/h file), the opponent still has
//     WHY_CHANGES.shelter.minEnemyMaterial of pieces, and a mover pawn on a file next to or in front of the king
//     (king file ± 1) on relative rank 2 or 3 either leaves that zone forward (lands on rank 4+) or captures off
//     the file. Extra details: the file left with no pawn of the mover (half-open towards the king), and the
//     shelter squares (king file ± 1, ranks 2-3) that no mover pawn covers any more.
//   - line-opened: the mover's king did not move, and an enemy rook/bishop/queen now attacks a square next to
//     the king through `from` (the square the moved piece left); same material condition as king-shield.
//   - castling-lost: the mover had a castling right before and lost one with this move, and the move is not
//     castling (a king or rook move; a rook captured on its home square is the opponent's move, not this).
//   - passed-pawn: a pawn of either side, on relative rank WHY_CHANGES.passedMinRank or further, is passed after
//     the move (no enemy pawn ahead on its own or a neighbouring file) and was not before. The moved pawn counts
//     as new only if it was not passed on `from`. (Without the rank floor, a queen taking the last pawn on h7
//     "made" the h2-pawn passed on 1 in 25 good moves.)
//   - doubled-pawns: a mover pawn capture lands on a file where the mover had exactly one pawn.
//   - isolated-pawn: a file where the mover has pawns and no pawns on either neighbouring file, which was not
//     isolated before (a pawn that was already isolated and captured sideways stays "not new"). The opponent's
//     pawns isolated by a capture are left out: on the dev games that fired on 1 in 25 good moves, and it only
//     restates the capture.
//   - development: from move WHY_CHANGES.development.fromMove to .toMove, at least .minHome of the mover's minor
//     pieces stand on their starting squares, and the move is a quiet (no capture, no check, not out of check)
//     queen/rook/king move, a move by a knight or bishop already off its starting square, or an a/b/g/h pawn move.
//   - activity: the moved knight or bishop had at least .minBefore safe moves before and has at most .maxAfter
//     after (a safe move: legal, and the static exchange on the target square wins the opponent nothing).
//   - bishop-pair: the mover had bishops on both colours, a bishop takes a knight, and the opponent can retake.
// Backward pawns are left out: no definition was crisp enough to stay quiet on good moves.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { WHY_CHANGES } from '../config/tunables';
import type { Color } from '../game/types';
import { other, PIECE_VALUE, see } from './brilliant';
import type { ReviewStyle } from './reviewStyle';
import type { ChangeFact } from './why';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};
const FILES = 'abcdefgh';
const W = WHY_CHANGES.weight;

/** Board, side to move and castling rights: the FEN fields one move determines. */
const fenKey = (fen: string) => fen.trim().split(/\s+/).slice(0, 3).join(' ');
const fileOf = (sq: string) => FILES.indexOf(sq[0]);
const rankOf = (sq: string) => Number(sq[1]);
/** Rank counted from `color`'s side: 1 = its back rank. */
const relRank = (sq: string, color: Color) => (color === 'w' ? rankOf(sq) : 9 - rankOf(sq));
const sq = (file: number, rank: number) => (FILES[file] + rank) as Square;
const sideWord = (side: 'own' | 'opponent') => (side === 'own' ? 'your' : 'their');

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function pawnsOf(board: Chess, color: Color): Square[] {
  const out: Square[] = [];
  for (const row of board.board()) for (const p of row) if (p && p.type === 'p' && p.color === color) out.push(p.square);
  return out;
}

/** No enemy pawn ahead of it on its own or a neighbouring file. */
function isPassed(board: Chess, square: Square, color: Color): boolean {
  const f = fileOf(square);
  const r = relRank(square, color);
  return !pawnsOf(board, other(color)).some((e) => Math.abs(fileOf(e) - f) <= 1 && relRank(e, color) > r);
}

/** Files where `color` has pawns and none on either neighbouring file. */
function isolatedFiles(board: Chess, color: Color): Set<number> {
  const files = new Set(pawnsOf(board, color).map(fileOf));
  return new Set([...files].filter((f) => !files.has(f - 1) && !files.has(f + 1)));
}

const countOnFile = (board: Chess, color: Color, file: number) => pawnsOf(board, color).filter((s) => fileOf(s) === file).length;

/** Non-pawn, non-king material of `color`, in pawns. */
function pieceMaterial(board: Chess, color: Color): number {
  let sum = 0;
  for (const row of board.board()) for (const p of row) if (p && p.color === color && p.type !== 'p') sum += PIECE_VALUE[p.type];
  return sum;
}

function kingSquare(board: Chess, color: Color): Square | null {
  for (const row of board.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

/** Castled: on the back rank, on the a/b/c or g/h file. */
function castled(king: Square, color: Color): boolean {
  return relRank(king, color) === 1 && 'abcgh'.includes(king[0]);
}

/** Squares a `color` pawn on `square` attacks. */
function pawnCover(square: Square, color: Color): Square[] {
  const f = fileOf(square);
  const r = rankOf(square) + (color === 'w' ? 1 : -1);
  if (r < 1 || r > 8) return [];
  return [f - 1, f + 1].filter((x) => x >= 0 && x < 8).map((x) => sq(x, r));
}

/** Safe moves for the piece on `from` with its side to move: legal, and the exchange on the target wins them nothing. */
function safeMoves(fen: string, from: Square): number {
  const board = new Chess(fen);
  const me = board.turn();
  let n = 0;
  for (const m of board.moves({ square: from, verbose: true })) {
    board.move(m);
    if (see(board, m.to as Square, other(me)) === 0) n++;
    board.undo();
  }
  return n;
}

/** The position after the move with the mover to move again (callers skip moves that gave check). */
function moverToMove(fenAfter: string, mover: Color): string {
  const f = fenAfter.trim().split(/\s+/);
  return [f[0], mover, f[2] ?? '-', '-', f[4] ?? '0', f[5] ?? '1'].join(' ');
}

type Ctx = { before: Chess; after: Chess; move: Move; mover: Color; them: Color; ply: number; style: ReviewStyle };
type Fact = ChangeFact;

/** king-shield (and the line it opens is folded in): a shelter pawn left the zone in front of the castled king. */
function kingShield(c: Ctx): Fact | null {
  const { move, mover, after, before } = c;
  if (move.piece !== 'p') return null;
  const king = kingSquare(after, mover);
  if (!king || !castled(king, mover)) return null;
  if (pieceMaterial(after, c.them) < WHY_CHANGES.shelter.minEnemyMaterial) return null;
  const kf = fileOf(king);
  const ff = fileOf(move.from);
  if (Math.abs(ff - kf) > 1) return null;
  const fromRank = relRank(move.from, mover);
  if (fromRank > 3) return null;
  const leftFile = fileOf(move.to) !== ff;
  if (!leftFile && relRank(move.to, mover) <= 3) return null;
  const file = move.from[0];
  const halfOpen = countOnFile(after, mover, ff) === 0;
  // Shelter squares (king file ± 1, relative ranks 2-3) covered by a mover pawn before and by none after.
  const zone: Square[] = [];
  for (let f = kf - 1; f <= kf + 1; f++) {
    if (f < 0 || f > 7) continue;
    for (const r of [2, 3]) zone.push(sq(f, mover === 'w' ? r : 9 - r));
  }
  const covered = (b: Chess) => new Set(pawnsOf(b, mover).flatMap((p) => pawnCover(p, mover)));
  const was = covered(before);
  const now = covered(after);
  const holes = zone.filter((s) => was.has(s) && !now.has(s) && after.get(s)?.color !== mover);
  let text: string;
  if (c.style === 'learner') {
    text = halfOpen
      ? 'This took a pawn away from in front of your king, so your king has less cover.'
      : 'This moved a pawn away from your king, so your king has less cover.';
  } else {
    const how = leftFile ? 'took the' : 'pushed the';
    const tail = halfOpen
      ? `, opening the ${file}-file towards it`
      : c.style === 'analyst' && holes.length > 0
        ? `, leaving ${list(holes)} without pawn cover`
        : '';
    const where = c.style === 'analyst' ? ` (${move.from}-${move.to})` : '';
    text = `This ${how} ${file}-pawn${where} out of the cover in front of your king${tail}.`;
  }
  return { kind: 'king-shield', side: 'own', weight: halfOpen ? W.kingShield + 5 : W.kingShield, text };
}

/** line-opened: an enemy slider now reaches a square next to the mover's king through the square the move left. */
function lineOpened(c: Ctx): Fact | null {
  const { move, mover, them, after, before } = c;
  if (move.piece === 'k' || move.flags.includes('k') || move.flags.includes('q')) return null;
  if (pieceMaterial(after, them) < WHY_CHANGES.shelter.minEnemyMaterial) return null;
  const king = kingSquare(after, mover);
  if (!king) return null;
  const kf = fileOf(king);
  const kr = rankOf(king);
  const from = move.from;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const f = kf + df;
      const r = kr + dr;
      if (f < 0 || f > 7 || r < 1 || r > 8) continue;
      const target = sq(f, r);
      const was = new Set(before.attackers(target, them));
      for (const a of after.attackers(target, them)) {
        if (was.has(a)) continue;
        const p = after.get(a);
        if (!p || !'rbq'.includes(p.type)) continue;
        if (!between(a, target, from)) continue;
        const diag = fileOf(a) !== fileOf(target) && rankOf(a) !== rankOf(target);
        const line = diag ? 'diagonal' : fileOf(a) === fileOf(target) ? `${a[0]}-file` : `${ordinal(Number(a[1]))} rank`;
        const text =
          c.style === 'learner'
            ? `This opened a path for their ${PIECE_NAME[p.type]} towards your king.`
            : c.style === 'club'
              ? `This opened the ${diag ? 'diagonal' : line} for their ${PIECE_NAME[p.type]} towards your king.`
              : `This opened the ${line} for their ${PIECE_NAME[p.type]} on ${a} onto ${target}, next to your king.`;
        return { kind: 'line-opened', side: 'own', weight: W.lineOpened, text };
      }
    }
  }
  return null;
}

/** True when `mid` lies strictly between `a` and `b` on a straight line. */
function between(a: Square, b: Square, mid: Square): boolean {
  const [af, ar, bf, br, mf, mr] = [fileOf(a), rankOf(a), fileOf(b), rankOf(b), fileOf(mid), rankOf(mid)];
  const df = Math.sign(bf - af);
  const dr = Math.sign(br - ar);
  for (let f = af + df, r = ar + dr; f !== bf || r !== br; f += df, r += dr) if (f === mf && r === mr) return true;
  return false;
}

/** castling-lost: a king or rook move gave up a castling right the mover still had. */
function castlingLost(c: Ctx): Fact | null {
  const { move, mover, before, after } = c;
  if (move.flags.includes('k') || move.flags.includes('q')) return null;
  const had = before.getCastlingRights(mover);
  const has = after.getCastlingRights(mover);
  const lostK = had.k && !has.k;
  const lostQ = had.q && !has.q;
  if (!lostK && !lostQ) return null;
  const both = lostK && lostQ;
  const sideName = lostK ? 'kingside' : 'queenside';
  const what = move.piece === 'k' ? 'king' : PIECE_NAME[move.piece];
  const text =
    c.style === 'learner'
      ? both ? 'Your king can no longer castle after this.' : `Your king can no longer castle on the ${sideName} after this.`
      : both
        ? `This ${what} move gave up your right to castle.`
        : `This ${what} move gave up castling ${sideName} (${lostK ? 'O-O' : 'O-O-O'}).`;
  return { kind: 'castling-lost', side: 'own', weight: both ? W.castlingBoth : W.castlingOne, text };
}

/** passed-pawn: new passed pawns for either side; the most advanced one is reported per side. */
function passedPawns(c: Ctx): Fact[] {
  const out: Fact[] = [];
  for (const color of [c.mover, c.them]) {
    const side = color === c.mover ? 'own' : 'opponent';
    const fresh = pawnsOf(c.after, color).filter((s) => {
      if (relRank(s, color) < WHY_CHANGES.passedMinRank || !isPassed(c.after, s, color)) return false;
      if (color === c.mover && c.move.piece === 'p' && s === c.move.to) return !isPassed(c.before, c.move.from as Square, color);
      return c.before.get(s)?.type === 'p' && c.before.get(s)?.color === color && !isPassed(c.before, s, color);
    });
    if (fresh.length === 0) continue;
    const best = fresh.reduce((a, b) => (relRank(b, color) > relRank(a, color) ? b : a));
    const whose = sideWord(side);
    const text =
      c.style === 'learner'
        ? side === 'own'
          ? 'This gave you a passed pawn: no enemy pawn can stop it any more.'
          : 'This gave them a passed pawn: none of your pawns can stop it any more.'
        : c.style === 'club'
          ? `This left ${whose} ${best[0]}-pawn passed (${side === 'own' ? 'no enemy pawn' : 'none of your pawns'} ahead of it on its file or the files beside it).`
          : `This left ${whose} pawn on ${best} passed.`;
    out.push({ kind: 'passed-pawn', side, weight: side === 'own' ? W.passedOwn : W.passedOpponent + relRank(best, color), text });
  }
  return out;
}

/** doubled-pawns: a mover pawn capture lands on a file where the mover had exactly one pawn. */
function doubled(c: Ctx): Fact | null {
  const { move, mover } = c;
  if (move.piece !== 'p' || !move.captured) return null;
  const f = fileOf(move.to);
  if (countOnFile(c.before, mover, f) !== 1 || countOnFile(c.after, mover, f) !== 2) return null;
  const text =
    c.style === 'learner'
      ? 'This put two of your pawns on the same file, one behind the other.'
      : `This doubled your pawns on the ${move.to[0]}-file${c.style === 'analyst' ? ` (${pawnsOf(c.after, mover).filter((s) => fileOf(s) === f).join(' and ')})` : ''}.`;
  return { kind: 'doubled-pawns', side: 'own', weight: W.doubled, text };
}

/** isolated-pawn: files newly isolated for the mover. */
function isolated(c: Ctx): Fact | null {
  const { move, mover } = c;
  const was = isolatedFiles(c.before, mover);
  const fresh = [...isolatedFiles(c.after, mover)].filter((f) => {
    if (was.has(f)) return false;
    // An isolated pawn that captured sideways is the same isolated pawn.
    return !(move.piece === 'p' && f === fileOf(move.to) && was.has(fileOf(move.from)));
  });
  if (fresh.length === 0) return null;
  const pawns = fresh.sort((a, b) => a - b).map((f) => `${FILES[f]}-pawn`);
  const text =
    c.style === 'learner'
      ? 'This left one of your pawns alone, with no pawn beside it to protect it.'
      : `This left your ${list(pawns)} isolated${c.style === 'analyst' ? ' (no pawn of yours on a neighbouring file)' : ''}.`;
  return { kind: 'isolated-pawn', side: 'own', weight: W.isolated, text };
}

const HOME: Record<Color, { square: Square; type: PieceSymbol }[]> = {
  w: [{ square: 'b1', type: 'n' }, { square: 'g1', type: 'n' }, { square: 'c1', type: 'b' }, { square: 'f1', type: 'b' }],
  b: [{ square: 'b8', type: 'n' }, { square: 'g8', type: 'n' }, { square: 'c8', type: 'b' }, { square: 'f8', type: 'b' }],
};

/** development: a quiet non-developing move while minor pieces still stand at home (late enough to matter). */
function development(c: Ctx): Fact | null {
  const { move, mover, ply } = c;
  const D = WHY_CHANGES.development;
  const moveNo = Math.ceil(ply / 2);
  if (moveNo < D.fromMove || moveNo > D.toMove) return null;
  if (move.captured || move.san.includes('+') || move.san.includes('#') || c.before.inCheck()) return null;
  if (move.flags.includes('k') || move.flags.includes('q')) return null;
  const homes = HOME[mover];
  const atHome = homes.filter((h) => {
    const p = c.after.get(h.square);
    return p && p.color === mover && p.type === h.type;
  });
  if (atHome.length < D.minHome) return null;
  const fromHome = homes.some((h) => h.square === move.from);
  const nonDeveloping =
    'qrk'.includes(move.piece) ||
    ('nb'.includes(move.piece) && !fromHome) ||
    (move.piece === 'p' && 'abgh'.includes(move.from[0]));
  if (!nonDeveloping) return null;
  const named = atHome.map((h) => `${PIECE_NAME[h.type]} on ${h.square}`);
  const what = move.piece === 'p' ? `${move.from[0]}-pawn` : PIECE_NAME[move.piece];
  const count = ['', 'one', 'two', 'three', 'four'][atHome.length];
  const text =
    c.style === 'learner'
      ? `${count[0].toUpperCase()}${count.slice(1)} of your pieces are still on their starting squares.`
      : c.style === 'club'
        ? `This was a ${what} move while ${count} of your knights and bishops still stand on their starting squares.`
        : `This was a ${what} move (move ${moveNo}) while your ${list(named)} still stand on their starting squares.`;
  return { kind: 'development', side: 'own', weight: W.development, text };
}

/** activity: the moved knight or bishop went from many safe moves to very few. */
function activity(c: Ctx, fenBefore: string, fenAfter: string): Fact | null {
  const { move, mover } = c;
  const A = WHY_CHANGES.activity;
  if (move.piece !== 'n' && move.piece !== 'b') return null;
  if (move.san.includes('+') || move.san.includes('#')) return null;
  const was = safeMoves(fenBefore, move.from as Square);
  if (was < A.minBefore) return null;
  const now = safeMoves(moverToMove(fenAfter, mover), move.to as Square);
  if (now > A.maxAfter) return null;
  const name = PIECE_NAME[move.piece];
  const count = now === 0 ? 'no safe squares' : now === 1 ? 'one safe square' : `only ${now} safe squares`;
  const text =
    c.style === 'learner'
      ? `Your ${name} has ${now === 0 ? 'no safe squares' : 'very few safe squares'} to go to from its new square.`
      : c.style === 'club'
        ? `Your ${name} has ${count} to move to from ${move.to}; it had ${was} before.`
        : `Your ${name} on ${move.to} has ${count} (${was} from ${move.from}).`;
  return { kind: 'activity', side: 'own', weight: W.activity, text };
}

/** bishop-pair: a bishop takes a knight that can be retaken while the mover has both bishops. */
function bishopPair(c: Ctx): Fact | null {
  const { move, mover } = c;
  if (move.piece !== 'b' || move.captured !== 'n') return null;
  const colours = new Set<number>();
  for (const row of c.before.board())
    for (const p of row) if (p && p.color === mover && p.type === 'b') colours.add((fileOf(p.square) + rankOf(p.square)) % 2);
  if (colours.size < 2) return null;
  if (!c.after.moves({ verbose: true }).some((m) => m.to === move.to)) return null;
  const text =
    c.style === 'learner'
      ? 'This trades one of your two bishops for a knight.'
      : `This gives a bishop for a knight: after a recapture on ${move.to} you no longer have the bishop pair.`;
  return { kind: 'bishop-pair', side: 'own', weight: W.bishopPair, text };
}

/** `ply` is the move's 1-based ply in the game (development facts depend on how far the game is). */
export function positionChanges(fenBefore: string, fenAfter: string, mover: Color, ply: number, style: ReviewStyle): ChangeFact[] {
  let before: Chess;
  let after: Chess;
  try {
    before = new Chess(fenBefore);
    after = new Chess(fenAfter);
  } catch {
    return [];
  }
  if (before.turn() !== mover) return [];
  const key = fenKey(fenAfter);
  const move = before.moves({ verbose: true }).find((m) => fenKey(m.after) === key);
  if (!move) return [];
  const c: Ctx = { before, after, move, mover, them: other(mover), ply, style };
  const facts: Fact[] = [];
  const add = (f: Fact | null) => {
    if (f) facts.push(f);
  };
  const shield = kingShield(c);
  add(shield);
  // A shelter pawn that opened a line is already told by king-shield.
  if (!shield) add(lineOpened(c));
  add(castlingLost(c));
  facts.push(...passedPawns(c));
  add(doubled(c));
  add(isolated(c));
  add(development(c));
  add(activity(c, fenBefore, fenAfter));
  add(bishopPair(c));
  return facts.sort((a, b) => b.weight - a.weight).slice(0, WHY_CHANGES.maxFacts[style]);
}

