# Piece sets

The "Classic" set is react-chessboard's built-in one. The sets in this folder were taken unchanged from the
Lichess repository (`lichess-org/lila`, commit `ad76013`, `public/piece/<set>/`) by `scripts/fetch-pieces.mjs`.
Each set keeps its own licence:

| Folder | Author | Licence |
| --- | --- | --- |
| `merida` | Armando Hernandez Marroquin | GPLv2 or later ([text](LICENSE-GPL-2.0.txt)) |
| `chessnut` | [Alexis Luengas](https://github.com/LexLuengas/chessnut-pieces) | Apache 2.0 ([text](LICENSE-Apache-2.0-chessnut.txt)) |
| `fantasy`, `celtic`, `spatial` | [Maurizio Monge](https://github.com/maurimo/chess-art) | MIT ([text](LICENSE-MIT-chess-art.txt)) |
| `papercut` | [Nikolay Anzarov](https://nikoichu.itch.io/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `shapes` | [flugsio](https://github.com/flugsio/chess_shapes) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `rhosgfx` ("Retro") | [RhosGFX](https://rhosgfx.itch.io/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `kiwen-suwi` | [neverRare](https://github.com/neverRare) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `totoy` | Kosal Sen | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `firi` | [James Faure](https://github.com/jfaure/Firi-pieceset) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `mpchess` | [Maxime Chupin](https://github.com/chupinmaxime) | GPLv3 or later ([text](LICENSE-GPL-3.0.txt)) |
| `pixel` | therealqtpi | AGPLv3 or later ([text](LICENSE-AGPL-3.0.txt)) |
| `letter` | [usolando](https://lichess.org/@/usolando) | AGPLv3 or later ([text](LICENSE-AGPL-3.0.txt)) |
| `pirouetti` | [pirouetti](https://lichess.org/@/pirouetti) | AGPLv3 or later ([text](LICENSE-AGPL-3.0.txt)) |

Source for the GPL and AGPL sets: the SVG files themselves are the source (preferred form for modification), and the
originals are at https://github.com/lichess-org/lila/tree/master/public/piece/.

The AGPL sets carry the same condition as the Maia model: if the app is ever offered to others over a network,
its source must be offered too.

All of these allow commercial use and redistribution. Lichess sets marked "non-commercial" (CC BY-NC-SA),
"personal use only" or "freeware" were left out on purpose, so the app stays free to go public or paid.
