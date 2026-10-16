// Lichess opening explorer answers, in the shape of the API's published examples (lichess-org/api,
// examples/openingExplorer-masters.json.yaml), trimmed. Captured from the docs, not live: the explorer needs a
// token since 2026 and none was available when this was written. Unit tests read these; they never touch the network.

/** Masters, after 1.d4 d5 2.c4 c6 3.cxd5 (Black to move). */
export const EX_MASTERS = {
  white: 1927,
  draws: 5215,
  black: 1469,
  moves: [
    { uci: 'c6d5', san: 'cxd5', averageRating: 2412, white: 1927, draws: 5215, black: 1468, game: null, opening: null },
    {
      uci: 'g8f6',
      san: 'Nf6',
      averageRating: 2515,
      white: 0,
      draws: 0,
      black: 1,
      game: {
        id: '1EErB5jc',
        winner: 'black',
        black: { name: 'Dobrov, Vladimir', rating: 2515 },
        white: { name: 'Drozdovskij, Yuri', rating: 2509 },
        year: 2006,
        month: '2006-01',
      },
      opening: { eco: 'D06', name: "Queen's Gambit Declined: Marshall Defense, Tan Gambit" },
    },
  ],
  topGames: [
    {
      uci: 'c6d5',
      id: 'kN6d9l2i',
      winner: 'black',
      black: { name: 'Anand, V.', rating: 2785 },
      white: { name: 'Carlsen, M.', rating: 2881 },
      year: 2014,
      month: '2014-06',
    },
    {
      uci: 'c6d5',
      id: 'VpWYyv3g',
      winner: null,
      black: { name: 'Carlsen, M..', rating: 2847 },
      white: { name: 'So, W..', rating: 2770 },
      year: 2021,
      month: '2021-03',
    },
  ],
  opening: { eco: 'D10', name: 'Slav Defense: Exchange Variation' },
};

/** Lichess games, start position (no top games asked for). */
export const EX_LICHESS = {
  white: 1000,
  draws: 100,
  black: 900,
  moves: [
    { uci: 'e2e4', san: 'e4', averageRating: 1810, white: 600, draws: 50, black: 550, game: null, opening: null },
    { uci: 'd2d4', san: 'd4', averageRating: 1835, white: 400, draws: 50, black: 350, game: null, opening: null },
  ],
  topGames: [],
  recentGames: [],
  opening: null,
};
