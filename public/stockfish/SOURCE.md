# Stockfish engine files

`stockfish-19-lite-single.js` and `stockfish-19-lite-single.wasm` are **Stockfish 19**
(lite, single-threaded WebAssembly build) from **stockfish.js 19.0.1**, unmodified, as published
in the `stockfish` npm package.

They are licensed under the GNU General Public License v3.0; the full text is in `COPYING`.
This app talks to them only through UCI messages to a Web Worker; they are not part of the app bundle.

Corresponding source:

- Stockfish: https://github.com/official-stockfish/Stockfish (Stockfish 19)
- stockfish.js (WASM build): https://github.com/nmrugg/stockfish.js (v19.0.1, https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)
