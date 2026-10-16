// The endgame drills (#/endgames). Every position is a textbook-standard one, set up here from the theory
// (no course material copied), and was checked against the Lichess Syzygy tablebase on 2026-10-16: the stated
// goal is what perfect play gives. tests/unit/endgameDrills.test.ts checks each FEN is legal and fits its goal's
// basic shape. The user plays `side`; Stockfish defends the other side at full strength.
import type { Color } from '../game/types';

export type DrillGoal = 'win' | 'draw';

export type Drill = {
  id: string;
  level: DrillLevel;
  title: string;
  fen: string;
  goal: DrillGoal;
  /** The side the user plays. When the other side is to move, Stockfish moves first. */
  side: Color;
  /**
   * Win drills: 'mate' = deliver mate; 'convert' = win the pawn race to a queen (or reduce the defender to a bare
   * king against a rook or queen) while the tablebase still says win. Unused for draw drills.
   */
  winBy?: 'mate' | 'convert';
  /** Win drills: finish within this many of your moves. Draw drills: hold for this many of your moves. */
  moves: number;
  /** One or two plain-words sentences, shown on request. */
  tip: string;
};

export type DrillLevel = 'Basic mates' | 'King and pawn' | 'Rook endgames';

export const DRILL_LEVELS: DrillLevel[] = ['Basic mates', 'King and pawn', 'Rook endgames'];

export const DRILLS: Drill[] = [
  // --- Basic mates. K+Q vs K mates in at most 10 moves from any position, K+R vs K in at most 16,
  // K+B+B vs K in at most 19 (tablebase maxima); the limits leave room for a sound but slower method.
  {
    id: 'kqk',
    level: 'Basic mates',
    title: 'Queen mate',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', // tablebase: White mates in 7 (DTM 13 plies)
    goal: 'win',
    side: 'w',
    winBy: 'mate',
    moves: 15,
    tip: 'Use the queen a knight\'s move away from the king to shrink its box, then bring your king up. Watch out for stalemate: always leave the king a square until the mating move.',
  },
  {
    id: 'krk',
    level: 'Basic mates',
    title: 'Rook mate',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', // tablebase: White mates in 14 (DTM 27 plies)
    goal: 'win',
    side: 'w',
    winBy: 'mate',
    moves: 25,
    tip: 'The rook cuts the king off along a rank or file; your king walks up to face the other king (opposition), and then the rook checks it one line closer to the edge.',
  },
  {
    id: 'kbbk',
    level: 'Basic mates',
    title: 'Two bishops mate (bonus)',
    fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', // tablebase: White mates in 17 (DTM 33 plies)
    goal: 'win',
    side: 'w',
    winBy: 'mate',
    moves: 35,
    tip: 'Put the bishops side by side in the centre so together they make a wall, bring your king close, and push the king to any corner. Mate comes in the corner.',
  },

  // --- King and pawn vs king. Rule: with the king on the sixth rank in front of a non-rook pawn the attacker wins
  // whoever is to move; with the king one square in front of the pawn, the side with the opposition decides it.
  {
    id: 'kpk-sixth',
    level: 'King and pawn',
    title: 'King in front, on the sixth',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', // tablebase: win (only Kd6/Kf6 keep it; Kd5/Kf5 draw)
    goal: 'win',
    side: 'w',
    winBy: 'convert',
    moves: 12,
    tip: 'Keep your king in front of the pawn. Step to the side (Kd6 or Kf6), not back: the pawn walks up behind its king and queens.',
  },
  {
    id: 'kpk-opposition-win',
    level: 'King and pawn',
    title: 'Opposition: win it',
    fen: '8/4k3/8/4K3/4P3/8/8/8 b - - 0 1', // tablebase: Black to move loses (White has the opposition)
    goal: 'win',
    side: 'w',
    winBy: 'convert',
    moves: 15,
    tip: 'Black has to give way. Go round to the side with your king to reach the sixth rank (d6, e6 or f6), then push the pawn. Don\'t push it too early.',
  },
  {
    id: 'kpk-opposition-hold',
    level: 'King and pawn',
    title: 'Opposition: hold it',
    fen: '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1', // tablebase: draw, White to move (Black has the opposition)
    goal: 'draw',
    side: 'b',
    moves: 15,
    tip: 'Answer every king move by facing the white king with one square between you (the opposition). Never let it reach d6, e6 or f6. When the pawn comes, go straight back in front of it.',
  },
  {
    id: 'kpk-distant-hold',
    level: 'King and pawn',
    title: 'Pawn in front of its king: hold',
    fen: '8/4k3/8/8/4P3/4K3/8/8 w - - 0 1', // tablebase: draw; Black keeps the (distant) opposition
    goal: 'draw',
    side: 'b',
    moves: 15,
    tip: 'Keep your king in front of the pawn. When the white king steps forward, step forward to face it; when the pawn checks you, step straight back in front of it, not to the side.',
  },
  {
    id: 'kpk-rook-pawn',
    level: 'King and pawn',
    title: 'Rook pawn: hold the corner',
    fen: 'k7/8/8/8/P7/8/1K6/8 w - - 0 1', // tablebase: draw; a defending king in the corner can't be forced out
    goal: 'draw',
    side: 'b',
    moves: 12,
    tip: 'A pawn on the edge can\'t win if your king reaches the corner in front of it. Shuffle between a8, b8 and b7; the worst White can do is stalemate you.',
  },

  // --- Rook endgames.
  {
    id: 'lucena',
    level: 'Rook endgames',
    title: 'Lucena: build a bridge',
    // Lucena: attacking king on the queening square, pawn on the 7th, defending king cut off by a file.
    fen: '3K4/3P1k2/8/8/8/8/2r5/4R3 w - - 0 1', // tablebase: win (DTZ 15, DTM 37)
    goal: 'win',
    side: 'w',
    winBy: 'convert',
    moves: 20,
    tip: 'Check the king one file further away first. Then put your rook on the fourth rank: when your king walks out, the rook blocks the checks (the "bridge").',
  },
  {
    id: 'lucena-b',
    level: 'Rook endgames',
    title: 'Lucena on the b-file',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', // tablebase: win (DTZ 15, DTM 41)
    goal: 'win',
    side: 'w',
    winBy: 'convert',
    moves: 20,
    tip: 'Same idea: push the black king one more file away with a check, rook to the fourth rank, then walk your king out and block the checks with the rook.',
  },
  {
    id: 'philidor',
    level: 'Rook endgames',
    title: 'Philidor: hold the sixth',
    // Philidor: defending king on the queening square, rook on its 3rd rank (here the 6th) keeps the white king out.
    fen: '4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1', // tablebase: draw with Rb1-b5 or Kd8/Kf8; Re6/Rd6+/Rc6/Ra6/Rf6/Rb7 lose
    goal: 'draw',
    side: 'b',
    moves: 15,
    tip: 'Keep your rook on the sixth rank so the white king can\'t come up. Once the pawn moves to the sixth, swing the rook to the back and check from behind.',
  },
  {
    id: 'rook-front-of-pawn',
    level: 'Rook endgames',
    title: 'Rook in front of the a-pawn: hold',
    // White's rook stands behind the a-pawn, Black's in front of it; with the black king on g7/f7 it's a draw.
    fen: 'r7/6k1/P7/8/8/8/6K1/R7 b - - 0 1', // tablebase: draw; Kh6/Kh7/Kh8 and Rxa6 lose
    goal: 'draw',
    side: 'b',
    moves: 15,
    tip: 'Keep your rook in front of the pawn and your king on g7 or f7. On the h-file your king is one step too far away and the white king can march over to help the pawn. Don\'t take the pawn while White\'s rook guards it.',
  },
];

export function drillById(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id);
}
