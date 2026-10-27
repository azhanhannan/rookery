// The opening library: ready-made starter repertoires to add in one click (#/openings, "Library").
// Each entry is one PGN with the main line and the replies worth knowing as variations; comments on your
// moves are the plan shown while drilling. Every line is checked against the opening book in
// tests/unit/openingLibrary.test.ts (legal, theory for its first moves, one answer per position of yours).
import type { Color } from '../game/types';

export type LibraryLevel = 'beginner' | 'club' | 'advanced';

export type LibraryOpening = {
  id: string;
  name: string;
  color: Color;
  /** What White opens with, for grouping Black's defences ('e4' / 'd4'); White's openings are 'white'. */
  against: 'white' | 'e4' | 'd4';
  level: LibraryLevel;
  /** A name in the opening book every line of this entry passes through (checked by the test). */
  family: string;
  summary: string;
  /** Two to four plain ideas to remember. */
  ideas: string[];
  pgn: string;
};

export const LIBRARY: LibraryOpening[] = [
  // ---------- White ----------
  {
    id: 'italian',
    name: 'Italian Game',
    color: 'w',
    against: 'white',
    level: 'beginner',
    family: 'Italian Game',
    summary: 'Quick development, the bishop on c4 aims at f7, then a slow build-up with c3 and d3 (or d4).',
    ideas: ['Bishop to c4 eyes f7, the square only the king defends', 'c3 prepares d4 when the moment is right', 'Castle early, then Re1 to back up e4'],
    pgn: `1. e4 {Take the centre, and open lines for your queen and light-squared bishop} e5
      2. Nf3 {Develop a piece and attack the e5 pawn} Nc6
      3. Bc4 {Develop the bishop to aim at f7, the weak square only Black's king defends}
      Bc5 {Giuoco Piano: Black's bishop aims at f2, just like yours aims at f7}
      (3... Nf6 {Two Knights Defence: the knight attacks your e4 pawn}
        4. d3 {Calm: protect e4 with a pawn and skip the wild lines} Be7
        (4... Bc5 5. c3 {Prepare d4 later, and give your bishop a safe way back to c2} d6
          6. O-O {King to safety, and the rook comes towards the centre} O-O
          7. Re1 {The rook backs up e4, ready for when the centre opens} a6
          8. a4 {Stop ...b5 from chasing your bishop})
        5. O-O {King to safety before anything else} O-O
        6. Re1 {The rook backs up e4} d6
        7. c3 {Room for the bishop on c2, and d4 later})
      4. c3 {Prepare d4, to build a big pawn centre} Nf6
      (4... d6 5. d4 {Take the centre now: Black hasn't attacked e4 yet} exd4
        6. cxd4 {Take back with the pawn: two pawns side by side in the centre} Bb6
        7. Nc3 {Develop, and defend e4 once more} Nf6
        8. O-O {King to safety: your pieces are out and the centre is yours})
      5. d3 {Giuoco Pianissimo ("very quiet"): protect e4 and build slowly} d6
      6. O-O {King to safety, and the rook comes towards the centre} O-O
      7. Re1 {The rook backs up e4, ready for when the centre opens} a6
      8. a4 {Stop ...b5 from chasing your bishop} *`,
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez (Spanish)',
    color: 'w',
    against: 'white',
    level: 'club',
    family: 'Ruy Lopez',
    summary: 'Pressure on the knight that guards e5, a long fight for the centre, and many plans to grow into.',
    ideas: ['Bb5 attacks the defender of e5, not e5 itself', 'Keep the bishop on the a2–g8 diagonal (Ba4, Bb3)', 'c3 and d4 build the centre; h3 stops ...Bg4', 'Closed Ruy: knight b1–d2–f1–g3'],
    pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 {Pressure the knight that defends e5}
      a6 (3... Nf6 {Berlin} 4. O-O {Castle: ...Nxe4 is met by Re1} Nxe4 (4... Bc5 5. c3 O-O 6. d4 Bb6 7. Re1) 5. Re1 {Win the pawn back} Nd6 6. Nxe5 Be7 7. Bf1 Nxe5 8. Rxe5 O-O 9. d4 Bf6 10. Re1)
      (3... d6 {Steinitz} 4. d4 Bd7 5. Nc3 Nf6 6. O-O Be7 7. Re1)
      4. Ba4 {Keep the pin; don't swap yet} Nf6 5. O-O {...Nxe4 now is met by Re1 or d4}
      Be7 (5... b5 6. Bb3 Bc5 7. a4 {Hit b5} Rb8 8. c3 d6 9. d4 Bb6 10. a5 {Gain space and push the bishop back})
      6. Re1 {Protect e4} b5 7. Bb3 d6
      (7... O-O 8. c3 d5 {Marshall Attack: a pawn for an attack} 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 12. d4 Bd6 13. Re1 Qh4 14. g3 Qh3 15. Be3 {Develop and defend; don't grab more})
      8. c3 O-O 9. h3 {Stop ...Bg4 pinning the knight}
      Na5 (9... Bb7 10. d4 Re8 11. Nbd2 Bf8 12. a3)
      10. Bc2 {Keep the bishop on the long diagonal} c5 11. d4 Qc7 12. Nbd2 {Closed Ruy: d2, f1, g3} *`,
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    color: 'w',
    against: 'white',
    level: 'beginner',
    family: 'Scotch Game',
    summary: 'Open the centre on move three with d4: clear plans, free pieces, fewer long theory battles.',
    ideas: ['3.d4 opens the game at once', 'After 4.Nxd4 your knight is strong in the centre', 'Against ...Nf6, Nxc6 and e5 gain space'],
    pgn: `1. e4 e5 2. Nf3 Nc6 3. d4 {Open the centre now} exd4 4. Nxd4 {A strong knight in the middle}
      Nf6 (4... Bc5 5. Be3 {Meet the bishop with a bishop} Qf6 6. c3 Nge7 7. Bc4 O-O 8. O-O)
      5. Nxc6 bxc6 6. e5 {Kick the knight} Qe7 7. Qe2 {Pin the pawn to the queen} Nd5 8. c4 {Chase the knight again} Ba6 9. b3 *`,
  },
  {
    id: 'london',
    name: 'London System',
    color: 'w',
    against: 'white',
    level: 'beginner',
    family: "Queen's Pawn Game",
    summary: 'One set-up against nearly everything: d4, Nf3, Bf4, e3, c3, Nbd2, Bd3. Few traps, easy plans.',
    ideas: ['Bishop out to f4 before e3 shuts it in', 'Pawns on c3–d4–e3 make a solid triangle', 'Keep h3 or Bg3 ready so the bishop has a home', 'Against an early ...Qb6, Qc1 guards b2'],
    pgn: `1. d4 d5 (1... Nf6 2. Nf3 g6 (2... e6 3. Bf4 {The same set-up against everything} c5 4. e3 Nc6 5. c3 d5 6. Nbd2 Bd6 7. Bg3) 3. Bf4 Bg7 4. e3 O-O 5. Be2 d6 6. h3 {A retreat square for the bishop})
      2. Nf3 Nf6 3. Bf4 {Bishop out before e3 shuts it in}
      c5 (3... e6 4. e3 Bd6 5. Bg3 {A swap on g3 opens the h-file for you} O-O 6. Bd3 c5 7. c3 Nc6 8. Nbd2)
      4. e3 Nc6 (4... Qb6 {Hits b2} 5. Qc1 {Guard b2 calmly} Nc6 6. c3 Bf5 7. Nbd2 e6 8. Be2)
      5. Nbd2 e6 6. c3 {Support d4: the pawn triangle} Bd6 7. Bg3 O-O 8. Bd3 b6 9. Qe2 {Prepare e4 or Ne5} *`,
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    color: 'w',
    against: 'white',
    level: 'club',
    family: "Queen's Gambit",
    summary: 'Offer the c-pawn to pull Black out of the centre. Covers the Declined, Accepted and Slav.',
    ideas: ['c4 attacks d5 from the side', 'Accepted: e3 and Bxc4 win the pawn back', 'Declined: Bg5 pins the knight that guards d5', 'Slav: a4 stops ...b5 holding the pawn'],
    pgn: `1. d4 d5 2. c4 {Attack d5 from the side}
      e6 (2... dxc4 {Accepted} 3. e3 {Bishop takes back on c4} Nf6 (3... b5 4. a4 {Undermine b5} c6 5. axb5 cxb5 6. Qf3 {The b-pawn left the long diagonal: hit the rook on a8}) 4. Bxc4 e6 5. Nf3 c5 6. O-O a6 7. a4 {Stop ...b5})
      (2... c6 {Slav} 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 {Stop ...b5} Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O)
      3. Nc3 Nf6 4. Bg5 {Pin the knight that guards d5} Be7 5. e3 O-O 6. Nf3
      Nbd7 (6... h6 7. Bh4 b6 {Tartakower} 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 {Pressure on the c-file})
      7. Rc1 {Rook to the file that will open} c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3 {Keep the rook active} e5 13. Qc2 *`,
  },

  // ---------- Black against 1.e4 ----------
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    color: 'b',
    against: 'e4',
    level: 'beginner',
    family: 'Caro-Kann Defense',
    summary: '...c6 then ...d5: solid, few early traps, and the light-squared bishop gets out before ...e6.',
    ideas: ['...c6 backs up ...d5', 'Bishop out to f5 (or g4) before ...e6', 'Against the Advance, ...c5 hits the pawn chain'],
    pgn: `1. e4 c6 {Prepare ...d5 with a pawn behind it} 2. d4 (2. Nc3 d5 3. Nf3 Bg4 {Pin the knight}) d5 {Hit e4}
      3. Nc3 (3. e5 {Advance} Bf5 {Bishop out before ...e6 locks it in} 4. Nf3 e6 5. Be2 c5 {Hit the chain} 6. O-O Nc6 7. c3 cxd4 8. cxd4 Nge7)
      (3. exd5 {Exchange} cxd5 4. Bd3 Nc6 5. c3 Nf6 6. Bf4 Bg4 7. Qb3 Qd7)
      (3. Nd2 dxe4 4. Nxe4 Bf5)
      3... dxe4 4. Nxe4 Bf5 {Classical: bishop first} 5. Ng3 Bg6 6. h4 h6 {Keep a home for the bishop}
      7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 12. O-O-O Be7 *`,
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defence',
    color: 'b',
    against: 'e4',
    level: 'beginner',
    family: 'Scandinavian Defense',
    summary: 'Hit e4 on move one. The queen comes out early but has a safe square on a5; quick, simple development.',
    ideas: ['...d5 at once: no long theory', 'Queen to a5, then ...c6 gives her a retreat', 'Bishop to f5 (or g4) before ...e6'],
    pgn: `1. e4 d5 {Hit e4 at once} 2. exd5 Qxd5
      3. Nc3 (3. Nf3 Bg4 4. Be2 Nc6 5. d4 O-O-O {Pressure d4})
      3... Qa5 {Safe from the knight} 4. d4 Nf6 5. Nf3 c6 {A retreat square for the queen}
      6. Bc4 Bf5 7. Bd2 e6 8. Qe2 (8. Nd5 Qd8 9. Nxf6+ Qxf6 {Fine: the trick doesn't work}) 8... Bb4 {Pin the knight} 9. O-O-O Nbd7 *`,
  },
  {
    id: 'french',
    name: 'French Defence',
    color: 'b',
    against: 'e4',
    level: 'club',
    family: 'French Defense',
    summary: '...e6 and ...d5: a solid pawn chain, counter-play with ...c5 and ...f6 against White\'s centre.',
    ideas: ['Attack the base of the chain: ...c5 against d4', 'The c8-bishop is the problem piece; trade or free it', '...Nc6 and ...Qb6 pile on d4'],
    pgn: `1. e4 e6 {Prepare ...d5} 2. d4 d5
      3. Nc3 (3. e5 {Advance} c5 {Hit the base of the chain} 4. c3 Nc6 5. Nf3 Qb6 {Pile on d4} 6. a3 c4 7. Nbd2 Na5)
      (3. exd5 exd5 4. Nf3 Nf6 5. Bd3 Bd6 6. O-O O-O)
      (3. Nd2 {Tarrasch} Nf6 4. e5 Nfd7 5. Bd3 c5 6. c3 Nc6 7. Ne2 cxd4 8. cxd4 f6 {Hit the head of the chain})
      3... Nf6 4. Bg5 (4. e5 {Steinitz} Nfd7 5. f4 c5 6. Nf3 Nc6 7. Be3 cxd4 8. Nxd4 Bc5 9. Qd2 O-O)
      4... Be7 5. e5 Nfd7 6. Bxe7 Qxe7 7. f4 O-O 8. Nf3 c5 {Strike at d4} 9. Qd2 Nc6 *`,
  },
  {
    id: 'petrov',
    name: 'Petrov Defence',
    color: 'b',
    against: 'e4',
    level: 'club',
    family: "Petrov's Defense",
    summary: 'Answer 2.Nf3 by attacking e4 straight back. Very solid; the one trap to know is on move three.',
    ideas: ['After 3.Nxe5, play ...d6 first: 3...Nxe4? 4.Qe2 hurts', 'Mirror development, castle, stay solid', 'Also ready for 2.Nc3, 2.Bc4 and 2.d4'],
    pgn: `1. e4 e5 2. Nf3 (2. Nc3 Nf6 3. f4 d5 {Strike in the centre} 4. fxe5 Nxe4 5. Nf3 Be7)
      (2. Bc4 Nf6 3. d3 c6 4. Nf3 d5 5. Bb3 Bd6)
      (2. d4 exd4 3. Qxd4 Nc6 {Develop with tempo} 4. Qe3 Nf6)
      2... Nf6 {Counter-attack e4}
      3. Nxe5 (3. d4 Nxe4 4. Bd3 d5 5. Nxe5 Nd7 6. Nxd7 Bxd7 7. O-O Bd6) (3. Nc3 Nc6 {Four Knights})
      3... d6 {Kick the knight first! 3...Nxe4? 4.Qe2 wins material} 4. Nf3 Nxe4
      5. d4 (5. Nc3 Nxc3 6. dxc3 Be7 7. Be3 Nc6 8. Qd2 Be6 9. O-O-O Qd7)
      5... d5 6. Bd3 Nc6 7. O-O Be7 8. c4 Nb4 {Hit the bishop} 9. Be2 O-O 10. Nc3 Bf5 *`,
  },

  // ---------- Black against 1.d4 ----------
  {
    id: 'qgd',
    name: "Queen's Gambit Declined",
    color: 'b',
    against: 'd4',
    level: 'club',
    family: "Queen's Gambit Declined",
    summary: '...d5 and ...e6: hold the centre, develop calmly, then free yourself with ...c5 or ...e5.',
    ideas: ['...e6 keeps d5 protected', 'Castle early, ...h6 asks the bishop to decide', 'Tartakower: ...b6 and ...Bb7, then ...c5'],
    pgn: `1. d4 d5 2. c4 (2. Nf3 Nf6 3. Bf4 c5 {Hit d4 at once} 4. e3 Nc6)
      2... e6 {Hold d5} 3. Nc3 (3. Nf3 Nf6 4. g3 {Catalan} Be7 5. Bg2 O-O 6. O-O dxc4 7. Qc2 a6)
      3... Nf6 4. Bg5 (4. cxd5 {Exchange} exd5 5. Bg5 c6 6. e3 Be7 7. Bd3 Nbd7 8. Qc2 O-O 9. Nf3 Re8)
      4... Be7 5. e3 O-O 6. Nf3 h6 {Ask the bishop to decide} 7. Bh4 b6 {Tartakower}
      8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 {Then ...c5} *`,
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defence",
    color: 'b',
    against: 'd4',
    level: 'advanced',
    family: "King's Indian Defense",
    summary: 'Let White take the centre, then hit it with ...e5 and attack on the king\'s side. Sharp and rich.',
    ideas: ['Fianchetto, castle, then ...e5', 'When White plays d5, the knight goes ...Ne7 and ...f5 follows', 'Attack the king with ...f5–f4 and ...g5'],
    pgn: `1. d4 Nf6 2. c4 (2. Nf3 g6 3. Bf4 Bg7 4. e3 d6 5. h3 O-O)
      2... g6 3. Nc3 (3. Nf3 Bg7 4. g3 O-O 5. Bg2 d6 6. O-O Nbd7 7. Nc3 e5)
      3... Bg7 4. e4 d6 5. Nf3 (5. f3 {Sämisch} O-O 6. Be3 e5 7. Nge2 c6 8. Qd2 Nbd7)
      5... O-O 6. Be2 e5 {Hit the centre} 7. O-O (7. dxe5 dxe5 8. Qxd8 Rxd8 9. Bg5 Re8)
      7... Nc6 8. d5 Ne7 {Head for the king's side} 9. Ne1 Nd7 10. Nd3 f5 {The thematic break}
      11. Bd2 Nf6 12. f3 f4 {Lock the centre, then ...g5} *`,
  },
];

/** Groups for the library list, in order. */
export const LIBRARY_GROUPS: { key: LibraryOpening['against']; title: string }[] = [
  { key: 'white', title: 'As White' },
  { key: 'e4', title: 'As Black against 1.e4' },
  { key: 'd4', title: 'As Black against 1.d4' },
];

/**
 * The library entry a repertoire came from: by `libraryId`, or, for one added before ids were kept, by name and side
 * (as the Library panel matches them). Null for the user's own repertoires.
 */
export function libraryEntryOf(rep: { libraryId?: string; name: string; color: Color }): LibraryOpening | null {
  if (rep.libraryId) return LIBRARY.find((o) => o.id === rep.libraryId) ?? null;
  return LIBRARY.find((o) => o.name === rep.name && o.color === rep.color) ?? null;
}
