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

Source for the GPL set: the SVG files themselves are the source (preferred form for modification), and the
originals are at https://github.com/lichess-org/lila/tree/master/public/piece/merida.

All of these allow commercial use and redistribution. Lichess sets marked "non-commercial" (CC BY-NC-SA),
"personal use only" or "freeware" were left out on purpose, so the app stays free to go public or paid.
