// Lesson content for #/lessons: a short course for players around 600-1000. Each lesson is a few explanation
// screens (a board with arrows and highlighted squares) and then practice positions where you find the move.
// Every FEN and answer here is checked by tests/unit/lessons.test.ts (legal position, legal answer, mate is
// mate, and each listed alternative really does the job). Moves are written in SAN.

/** An arrow on an explanation board: `idea` (green) for what you do, `threat` (red) for the opponent's. */
export type LessonArrow = { from: string; to: string; kind?: 'idea' | 'threat' };

export type LessonScreen = {
  title: string;
  /** Short paragraphs. */
  text: string[];
  fen: string;
  arrows?: LessonArrow[];
  /** Squares to point at. */
  highlights?: string[];
};

export type LessonPuzzle = {
  fen: string;
  /** What to look for, shown above the board. */
  prompt: string;
  /** The intended answer (SAN). */
  solution: string;
  /** Other answers that do the job just as well (SAN); each one is checked in the tests. */
  alsoAccept?: string[];
  /** Shown once you've found it: why it works. */
  explain: string;
  /** The answer is checkmate (checked in the tests). */
  mate?: boolean;
  /**
   * The point is to stop a mate in one: every accepted answer must leave the opponent with no mate in one,
   * and (checked in the tests) every other legal move must allow one.
   */
  stopsMate?: boolean;
};

export type Lesson = {
  id: string;
  title: string;
  /** One line on the list. */
  blurb: string;
  screens: LessonScreen[];
  puzzles: LessonPuzzle[];
};

export const LESSONS_COURSE: Lesson[] = [
  {
    id: 'free-pieces',
    title: 'Free pieces',
    blurb: 'Spot pieces nobody is guarding, yours and theirs.',
    screens: [
      {
        title: 'Nobody home',
        text: [
          "A piece that's attacked and not defended is free. Most games under 1000 are decided by free pieces, not by clever ideas.",
          "Here Black's knight on e5 is attacked by White's knight and nothing guards it. White just takes it.",
        ],
        fen: 'r1bqkb1r/pppp1ppp/5n2/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4',
        arrows: [{ from: 'f3', to: 'e5' }],
        highlights: ['e5'],
      },
      {
        title: 'Count before you grab',
        text: [
          'Now a pawn on d6 guards the knight. If White takes it, d6 takes back: a knight for a knight, nothing won.',
          'Count the attackers and the defenders. More attackers than defenders (or a cheaper piece doing the taking) means you can win something.',
        ],
        fen: 'r1bqkb1r/ppp2ppp/3p1n2/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5',
        arrows: [
          { from: 'f3', to: 'e5' },
          { from: 'd6', to: 'e5', kind: 'threat' },
        ],
        highlights: ['e5'],
      },
      {
        title: 'The two-second check',
        text: [
          'Before every move, ask two quick questions: "Is anything of mine loose?" and "Is anything of theirs loose?"',
          "That habit alone wins you more games than any opening you could learn.",
        ],
        fen: 'r1bqkb1r/ppp2ppp/3p1n2/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5',
        highlights: ['e5', 'e4'],
      },
    ],
    puzzles: [
      {
        fen: 'r4rk1/ppq2ppp/8/8/6b1/2N4P/PP3PP1/R2Q1RK1 w - - 0 1',
        prompt: "Black's bishop is attacking your queen. Something there is loose: take it.",
        solution: 'hxg4',
        alsoAccept: ['Qxg4'],
        explain: 'Nothing guards the bishop on g4, so it just falls. A whole piece for free.',
      },
      {
        fen: 'r2q1rk1/ppp2ppp/3p4/6B1/1b1P4/2N5/PP3PPP/R2Q1RK1 b - - 0 1',
        prompt: 'You can take two things. One is a trade, the other is free. Take the free one.',
        solution: 'Qxg5',
        explain: 'The bishop on g5 had no guard. Taking on c3 would only trade, because the b2 pawn takes back.',
      },
      {
        fen: 'r5k1/p1pq1ppp/3p4/4n3/8/6P1/PPP1QPBP/3R2K1 w - - 0 1',
        prompt: 'Look along the long diagonals. What is Black not guarding?',
        solution: 'Bxa8',
        explain: "The bishop's diagonal runs all the way to a8, and nothing guards that rook. Qxe5 would lose the queen to dxe5.",
      },
    ],
  },
  {
    id: 'forks',
    title: 'Forks',
    blurb: 'One piece attacks two things at once.',
    screens: [
      {
        title: 'One move, two targets',
        text: [
          'A fork is one piece attacking two things at once. Your opponent can only save one of them.',
          "Knights are the best forkers: they jump, and nobody expects them. Here the knight checks the king and hits the rook too.",
        ],
        fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1',
        arrows: [
          { from: 'c7', to: 'e8' },
          { from: 'c7', to: 'a8' },
        ],
        highlights: ['e8', 'a8'],
      },
      {
        title: 'Anything can fork',
        text: [
          "Pawns fork too, and a pawn fork is the best kind: you're trading your cheapest piece for something big.",
          'This pawn hits the knight and the bishop. One of them is lost.',
        ],
        fen: '4k3/8/2n1b3/3P4/8/8/8/4K3 b - - 0 1',
        arrows: [
          { from: 'd5', to: 'c6' },
          { from: 'd5', to: 'e6' },
        ],
        highlights: ['c6', 'e6'],
      },
      {
        title: 'How to find them',
        text: [
          'Look for two enemy pieces (or a piece and the king) that one of your pieces could hit from the same square.',
          'Checks make the best forks: they have to deal with the check first, and then you take the other thing.',
        ],
        fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1',
        arrows: [{ from: 'c7', to: 'a8' }],
        highlights: ['c7'],
      },
    ],
    puzzles: [
      {
        fen: 'r5k1/p4ppp/2q5/3N4/8/8/P4PPP/4R1K1 w - - 0 1',
        prompt: 'Your knight can check the king and hit the queen at the same time. Where?',
        solution: 'Ne7+',
        explain: 'Ne7+ checks the king and attacks the queen on c6. Once the king steps away, the queen is yours.',
      },
      {
        fen: 'r5k1/pp3ppp/2n1n3/8/3P4/2P2N1P/PP3PP1/3R2K1 w - - 0 1',
        prompt: 'A pawn can fork both knights. Push it!',
        solution: 'd5',
        explain: 'd5 attacks both knights at once. Black can only save one, so a pawn wins a knight.',
      },
      {
        fen: 'r5k1/4b1pp/p7/8/8/8/5PPP/3Q2K1 w - - 0 1',
        prompt: 'Your queen can check the king and attack the rook in the corner.',
        solution: 'Qd5+',
        explain: 'Qd5+ checks along the diagonal to g8 and hits the rook on a8 along the other one. Next comes Qxa8.',
      },
      {
        fen: '3r2k1/5ppp/8/8/3n4/8/PP3PPP/R3KB2 b - - 0 1',
        prompt: "You're Black. Find the knight fork of the king and the rook.",
        solution: 'Nc2+',
        explain: "Nc2+ checks the king and attacks the rook on a1. The king can't stay, so the rook falls.",
      },
    ],
  },
  {
    id: 'pins',
    title: 'Pins',
    blurb: "Freeze a piece that can't move without exposing something bigger.",
    screens: [
      {
        title: 'Stuck in place',
        text: [
          "A pin is when a piece can't move because something more valuable is behind it on the same line.",
          "Here the knight on c6 can't move at all: the bishop would be checking the king. That's against the rules, so the knight is frozen.",
        ],
        fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
        arrows: [{ from: 'b5', to: 'e8' }],
        highlights: ['c6', 'e8'],
      },
      {
        title: 'Pinned to the queen',
        text: [
          'If the big piece behind is a queen instead of the king, the pinned piece is allowed to move, but then the queen gets taken.',
          'The knight on f6 is pinned to the queen on d8. Moving it would cost Black the queen.',
        ],
        fen: 'r1bqkb1r/ppp2ppp/2np1n2/4p1B1/4P3/3P1N2/PPP2PPP/RN1QKB1R b KQkq - 1 5',
        arrows: [{ from: 'g5', to: 'd8' }],
        highlights: ['f6', 'd8'],
      },
      {
        title: 'Hit it again',
        text: [
          "A pinned piece can't run away, so attack it again, ideally with a pawn.",
          'Here d5 would just attack the knight a second time, and it still can’t move.',
        ],
        fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 4',
        arrows: [
          { from: 'b5', to: 'e8' },
          { from: 'd4', to: 'd5' },
        ],
        highlights: ['c6'],
      },
    ],
    puzzles: [
      {
        fen: 'r5k1/p5pp/8/3q4/8/1P6/P4PPP/R4BK1 w - - 0 1',
        prompt: "Pin Black's queen to the king.",
        solution: 'Bc4',
        explain: "Bc4 pins the queen: it can't leave the diagonal without exposing the king. If it takes the bishop, bxc4 wins it.",
      },
      {
        fen: 'r3k2r/ppp2ppp/4b3/8/3P4/8/PPP2PPP/R3R1K1 w - - 0 1',
        prompt: 'The bishop on e6 is pinned to the king. Attack it again!',
        solution: 'd5',
        explain: "d5 attacks the pinned bishop. It can't take the pawn or move off the e-file, so White wins it next move.",
      },
      {
        fen: 'r1r2bk1/5ppp/2n5/p7/8/8/PP1Q1PPP/4K1NR b - - 0 1',
        prompt: "You're Black. White's queen and king are on one diagonal. Pin the queen.",
        solution: 'Bb4',
        explain: 'Bb4 pins the queen to the king, and the a5 pawn and the c6 knight guard the bishop. White loses the queen for a bishop.',
      },
    ],
  },
  {
    id: 'skewers',
    title: 'Skewers',
    blurb: 'Attack the big piece; take the one behind it.',
    screens: [
      {
        title: 'A pin, the other way round',
        text: [
          'A skewer is a pin turned around: the valuable piece is in front. It has to move, and you take whatever was behind it.',
          'Here the rook checks the king. When the king steps aside, the rook takes the queen.',
        ],
        fen: '4q3/8/8/4k3/8/8/8/K3R3 b - - 0 1',
        arrows: [
          { from: 'e1', to: 'e5' },
          { from: 'e5', to: 'e8', kind: 'threat' },
        ],
        highlights: ['e5', 'e8'],
      },
      {
        title: 'Bishops skewer too',
        text: [
          'Any piece that moves in straight lines can skewer: rooks, bishops and queens.',
          'Look for the enemy king and another piece on the same line, with nothing in between.',
        ],
        fen: '6r1/p7/1p2k2p/8/2B5/6P1/PP5P/6K1 b - - 1 1',
        arrows: [{ from: 'c4', to: 'g8' }],
        highlights: ['e6', 'g8'],
      },
    ],
    puzzles: [
      {
        fen: '8/p7/4p3/1q3k2/8/8/5PPR/6K1 w - - 0 1',
        prompt: "Black's king and queen are on the same row. Skewer them.",
        solution: 'Rh5+',
        explain: 'Rh5+ checks the king along the fifth rank. It has to step off, and then Rxb5 takes the queen.',
      },
      {
        fen: '6r1/p7/1p2k2p/8/8/6P1/PP5P/5BK1 w - - 0 1',
        prompt: 'Your bishop can check the king and hit the rook behind it.',
        solution: 'Bc4+',
        explain: 'Bc4+ checks the king on e6. Once it moves, the bishop takes the rook on g8.',
      },
      {
        fen: 'q3k3/6Q1/8/8/8/2K5/5PPP/8 b - - 0 1',
        prompt: "You're Black. White's king and queen are on the long diagonal.",
        solution: 'Qa1+',
        explain: 'Qa1+ checks the king along the diagonal. When it steps aside, Qxg7 wins the queen.',
      },
    ],
  },
  {
    id: 'back-rank',
    title: 'Back-rank mate',
    blurb: "A king trapped behind its own pawns.",
    screens: [
      {
        title: 'Locked in by friends',
        text: [
          "The king castled and the pawns in front never moved. Cosy, until a rook lands on the back rank. The king's own pawns stop it from escaping.",
          'That is checkmate. It happens in a lot of beginner games, and in quite a few grandmaster ones.',
        ],
        fen: '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1',
        arrows: [{ from: 'd8', to: 'g8' }],
        highlights: ['f7', 'g7', 'h7'],
      },
      {
        title: 'Open a window',
        text: [
          'The fix is simple: once things calm down, push one of those pawns, h6 or g6, so the king has a square to step to.',
          'Players call it "luft", German for air. Now a check on the back rank is just a check.',
        ],
        fen: '6k1/5pp1/7p/8/8/8/5PPP/3R2K1 w - - 0 1',
        arrows: [{ from: 'g8', to: 'h7' }],
        highlights: ['h7'],
      },
      {
        title: 'Look out for it',
        text: [
          "Whenever your opponent's king has no window, check whether a rook or queen can reach the back rank.",
          "And whenever yours has none, ask what happens if one of theirs does.",
        ],
        fen: '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1',
        highlights: ['g8'],
      },
    ],
    puzzles: [
      {
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        prompt: 'Checkmate in one.',
        solution: 'Rd8#',
        mate: true,
        explain: "Rd8# - the king's own pawns block every escape square.",
      },
      {
        fen: '4r1k1/2q2ppp/8/3Q4/8/2N5/5PPP/6K1 b - - 0 1',
        prompt: "You're Black. White's king has no window. Checkmate in one.",
        solution: 'Re1#',
        mate: true,
        explain: "Re1# - nothing of White's can block on f1 or take the rook.",
      },
      {
        fen: '3r2k1/Rp3ppp/8/8/8/8/PP3PPP/6K1 w - - 0 1',
        prompt: 'Black threatens Rd1 mate. Stop it.',
        solution: 'h3',
        alsoAccept: ['h4', 'g3', 'g4', 'f3', 'f4', 'Kf1', 'Ra8'],
        stopsMate: true,
        explain:
          "A pawn move in front of the king opens a window, and that's the classic fix: now Rd1+ is only a check. (Ra8 works too, sneakily: it pins Black's rook to its own king.)",
      },
      {
        fen: '4r1k1/pp3ppp/1q6/8/8/8/4RPPP/4R1K1 w - - 0 1',
        prompt: 'Only one black piece guards the back rank. Get rid of it with check.',
        solution: 'Rxe8#',
        mate: true,
        explain: "Rxe8# - the rook on e8 was Black's only guard, and now there's nothing left to stop the mate.",
      },
    ],
  },
  {
    id: 'scholars-mate',
    title: "Scholar's mate defence",
    blurb: 'Stop the four-move checkmate, and punish it.',
    screens: [
      {
        title: 'The four-move trap',
        text: [
          "White's queen and bishop both aim at f7. Only Black's king guards that pawn.",
          'If Black ignores it, Qxf7 is checkmate. This is called Scholar’s mate.',
        ],
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
        arrows: [
          { from: 'h5', to: 'f7', kind: 'threat' },
          { from: 'c4', to: 'f7', kind: 'threat' },
        ],
        highlights: ['f7'],
      },
      {
        title: "Don't do this",
        text: [
          'Nf6 looks natural and attacks the queen. But it misses the threat: Qxf7 is mate.',
          "The king can't take the queen because the bishop on c4 guards it.",
        ],
        fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
        arrows: [{ from: 'c4', to: 'f7', kind: 'threat' }],
        highlights: ['f7', 'e8'],
      },
      {
        title: 'The calm defence',
        text: [
          'Block or guard f7, then kick the queen with your pieces. g6 does that: it stops the mate and attacks the queen.',
          "After that, an early queen is just a target. You'll get your pieces out with tempo while it runs around.",
        ],
        fen: 'r1bqkbnr/pppp1p1p/2n3p1/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
        arrows: [{ from: 'g6', to: 'h5' }],
        highlights: ['f7', 'h5'],
      },
    ],
    puzzles: [
      {
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
        prompt: 'Stop the mate on f7 and chase the queen away, in one move.',
        solution: 'g6',
        explain: 'g6 blocks the queen from f7 and attacks it. The queen has to move, and you get time.',
      },
      {
        fen: 'r1bqkbnr/pppp1p1p/2n3p1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 1 4',
        prompt: "The queen's back, aiming at f7 again. Block it with a piece that wants to come out anyway.",
        solution: 'Nf6',
        explain: 'Nf6 blocks the f-file and develops a knight. The mate threat is gone.',
      },
      {
        fen: 'rnbqk1nr/pppp1ppp/8/2b1p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
        prompt: 'Same idea, different order. Stop Qxf7 mate.',
        solution: 'Nf6',
        alsoAccept: ['Qf6', 'Qe7'],
        explain: 'Nf6 is the cleanest: it blocks the queen and develops. Qf6 or Qe7 also guard f7.',
      },
      {
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        prompt: "Black missed the threat. You're White: checkmate in one.",
        solution: 'Qxf7#',
        mate: true,
        explain: "Qxf7# - and that's why you always check what the queen and bishop are aiming at.",
      },
    ],
  },
  {
    id: 'discovered-attacks',
    title: 'Discovered attacks',
    blurb: 'Move one piece out of the way and another one strikes.',
    screens: [
      {
        title: 'Out of the way',
        text: [
          'Sometimes one of your pieces is standing in front of another one. Move the front piece, and the back one suddenly attacks.',
          "Here the bishop is in the rook's way. When the bishop moves, the rook attacks the queen on d8.",
        ],
        fen: '3q2k1/pb3ppp/1p6/8/8/3B1N2/PP3PPP/3R2K1 w - - 0 1',
        arrows: [
          { from: 'd3', to: 'h7' },
          { from: 'd1', to: 'd8' },
        ],
        highlights: ['d3', 'd8'],
      },
      {
        title: 'Two attacks for one move',
        text: [
          'The piece that moves can make its own threat, like a check or a capture. Now your opponent has two problems and one move.',
          'A discovered check is the strongest: they must answer the check, and the moving piece does what it likes.',
        ],
        fen: 'r2qk3/ppp2ppp/8/4N3/8/8/PPP2PPP/R3R1K1 w - - 0 1',
        arrows: [
          { from: 'e5', to: 'c6' },
          { from: 'e1', to: 'e8' },
        ],
        highlights: ['e8', 'd8'],
      },
    ],
    puzzles: [
      {
        fen: '3q2k1/pb3ppp/1p6/8/8/3B1N2/PP3PPP/3R2K1 w - - 0 1',
        prompt: 'Move the bishop with check, and let the rook take the queen.',
        solution: 'Bxh7+',
        explain: 'Bxh7+ takes a pawn with check. Whatever Black does about the check, Rxd8 takes the queen.',
      },
      {
        fen: 'r2qk3/ppp2ppp/8/4N3/8/8/PPP2PPP/R3R1K1 w - - 0 1',
        prompt: 'Any knight move gives check from the rook. Pick the one that also hits the queen.',
        solution: 'Nc6+',
        explain: 'Nc6+ uncovers check from the rook and attacks the queen. Black answers the check, and the queen goes.',
      },
      {
        fen: '4r1k1/5ppp/8/4n3/8/8/4QPPP/6K1 b - - 0 1',
        prompt: "You're Black. Your knight blocks the rook from White's queen. Move it with check.",
        solution: 'Nf3+',
        explain: 'Nf3+ checks the king and uncovers the rook on the queen. White deals with the check, and Rxe2 follows.',
      },
    ],
  },
];
