// Maia-3 input/output encoding. Pure (no ONNX, no DOM): shared by the browser worker path and the Node test.
//
// Input `tokens` [1,64,12]: one-hot per square (a1=0 ... h8=63) over pieces 'PNBRQKpnbrqk'. The model always
// sees the side to move as White: when Black is to move the board is mirrored (rank r -> 9-r) and colours swapped.
// Output `logits_move` [1,4352]: from*64+to for normal moves; promotions (rank 7 -> 8 after mirroring) at
// 4096 + (fromFile*8 + toFile)*4 + 'qrbn'.indexOf(piece). `logits_value` [1,3]: loss/draw/win for the side to move.
import { Chess } from 'chess.js';

export const PIECES = 'PNBRQKpnbrqk';
export const POLICY_SIZE = 4352;
const PROMO_BASE = 4096;
const PROMO_PIECES = 'qrbn';

/** A move's probability under the model, best first. UCI in the real board's orientation. */
export type PolicyEntry = [uci: string, p: number];

export type MaiaPrediction = {
  policy: PolicyEntry[];
  /** Outcome probabilities for the side to move. */
  wdl: { win: number; draw: number; loss: number };
};

/** a1=0, b1=1, ... h8=63. */
export function squareIndex(square: string): number {
  return square.charCodeAt(0) - 97 + 8 * (square.charCodeAt(1) - 49);
}

export function mirrorSquare(square: string): string {
  return square[0] + String(9 - Number(square[1]));
}

/** Mirrors a UCI move's ranks (the promotion piece is kept). */
export function mirrorUci(uci: string): string {
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);
}

/** Index into logits_move for a UCI move in the model's orientation (side to move = White). */
export function moveIndex(uci: string): number {
  if (uci.length === 5) {
    const fromFile = uci.charCodeAt(0) - 97;
    const toFile = uci.charCodeAt(2) - 97;
    const piece = PROMO_PIECES.indexOf(uci[4]);
    if (piece < 0) throw new Error(`bad promotion piece in ${uci}`);
    return PROMO_BASE + (fromFile * 8 + toFile) * 4 + piece;
  }
  return squareIndex(uci.slice(0, 2)) * 64 + squareIndex(uci.slice(2, 4));
}

export const isBlackToMove = (fen: string) => fen.trim().split(/\s+/)[1] === 'b';

/** Board tokens for `fen`, Float32Array(64*12) laid out [square][piece]. Only piece placement is used. */
export function encodeFen(fen: string): Float32Array {
  const mirror = isBlackToMove(fen);
  const tokens = new Float32Array(64 * 12);
  const rows = fen.trim().split(/\s+/)[0].split('/');
  if (rows.length !== 8) throw new Error(`bad FEN placement: ${fen}`);
  for (let r = 0; r < 8; r++) {
    const rank = mirror ? r : 7 - r; // rows[0] is rank 8
    let file = 0;
    for (const c of rows[r]) {
      if (c >= '1' && c <= '8') {
        file += Number(c);
        continue;
      }
      let piece = PIECES.indexOf(c);
      if (piece < 0 || file > 7) throw new Error(`bad FEN placement: ${fen}`);
      if (mirror) piece = (piece + 6) % 12;
      tokens[(rank * 8 + file) * 12 + piece] = 1;
      file++;
    }
  }
  return tokens;
}

export function legalUcis(fen: string): string[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ''));
}

function softmax(xs: number[]): number[] {
  const max = Math.max(...xs);
  const exps = xs.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Turns raw model outputs into legal-move probabilities (softmax over the legal moves only), best first,
 * plus win/draw/loss for the side to move. `legal` defaults to the legal moves of `fen`.
 */
export function decodePrediction(
  fen: string,
  logitsMove: ArrayLike<number>,
  logitsValue: ArrayLike<number>,
  legal: string[] = legalUcis(fen),
): MaiaPrediction {
  if (logitsMove.length !== POLICY_SIZE) throw new Error(`expected ${POLICY_SIZE} move logits, got ${logitsMove.length}`);
  const mirror = isBlackToMove(fen);
  const logits = legal.map((uci) => logitsMove[moveIndex(mirror ? mirrorUci(uci) : uci)]);
  const probs = legal.length > 0 ? softmax(logits) : [];
  const policy: PolicyEntry[] = legal.map((uci, i): PolicyEntry => [uci, probs[i]]);
  policy.sort((a, b) => b[1] - a[1]);
  const [loss, draw, win] = softmax([logitsValue[0], logitsValue[1], logitsValue[2]]);
  return { policy, wdl: { win, draw, loss } };
}

export type SampleOptions = { temperature: number; topP: number };

/**
 * Picks a move from a best-first policy. Temperature reshapes it (p^(1/T), renormalised; T<=0 = the top move),
 * then only the most likely moves reaching `topP` cumulative probability are kept (always at least one).
 */
export function sampleMove(policy: PolicyEntry[], opts: SampleOptions, rng: () => number = Math.random): string {
  if (policy.length === 0) throw new Error('no moves to sample');
  const sorted = [...policy].sort((a, b) => b[1] - a[1]);
  if (opts.temperature <= 0 || sorted.length === 1) return sorted[0][0];

  const top = sorted[0][1];
  // Relative to the top move so tiny probabilities can't underflow to 0 for every move at low temperature.
  let weights = sorted.map(([, p]) => (top > 0 ? Math.pow(p / top, 1 / opts.temperature) : 1));
  let total = weights.reduce((a, b) => a + b, 0);
  weights = weights.map((w) => w / total);

  let keep = sorted.length;
  if (opts.topP < 1) {
    let cum = 0;
    for (let i = 0; i < weights.length; i++) {
      cum += weights[i];
      if (cum >= opts.topP - 1e-12) {
        keep = i + 1;
        break;
      }
    }
  }
  const kept = weights.slice(0, keep);
  total = kept.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < kept.length; i++) {
    roll -= kept[i];
    if (roll < 0) return sorted[i][0];
  }
  return sorted[keep - 1][0];
}
