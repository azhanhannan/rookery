# Chess Platform: Build Spec for Claude Code

Oct 13, 2026 · @anan

## Overview

Build a browser-based chess web app where a player can play bots at chosen Elo levels, then get a Chess.com-style Game Review with move labels, accuracy and an estimated game rating. Everything in the MVP runs in the browser with no server; accounts and player ratings come later.

**MVP scope (Phases 1 to 4):**

- Play chess on a board with full rules (local two-player and vs bot)
- Bots at Elo levels from about 400 to 3000
- Game Review: per-move labels (Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder, Miss, Great, Brilliant), evaluation bar, eval graph, best-move arrows, accuracy per player
- Estimated game rating per player, shown as a range
- Import a game by pasting PGN, export the current game as PGN

**Later (Phase 5+):** user accounts, saved game history, Glicko-2 player ratings, online play between players, human-like Maia bots, puzzles.

**Out of scope:** copying Chess.com's name, logo, design, bot characters or private formulas. The app needs its own name and look.

**How to use this doc with Claude Code:** export it as Markdown, save it in the project root as `SPEC.md`, then ask Claude Code to read `SPEC.md` and implement one phase at a time, starting with Phase 1. Each phase has acceptance criteria to check before moving on. Numbers marked *tunable* are starting values, not final; keep them in one config file.

## Tech stack

Use a Vite + React + TypeScript single-page app, with Stockfish compiled to WebAssembly running in a Web Worker.

| Part | Tool | What it's for | License |
| --- | --- | --- | --- |
| App framework | Vite + React + TypeScript | Fast dev server, typed components | MIT |
| Chess rules | [chess.js](https://github.com/jhlywa/chess.js) | Legal moves, check/mate/draw detection, FEN and PGN read/write | BSD-2 |
| Board UI | [react-chessboard](https://github.com/Clariity/react-chessboard) | Drag-and-drop board, arrows, square highlights | MIT |
| Engine | [stockfish](https://www.npmjs.com/package/stockfish) npm package (Stockfish WASM builds) | Position evaluation, best moves, bot play | GPL-3.0 |
| Opening names | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | ECO code + opening name lookup, Book move detection | CC0 |
| Charts | Recharts | Eval graph in the review screen | MIT |
| State | Zustand | Game, bot and review state | MIT |
| Styling | Tailwind CSS | Layout and theme | MIT |
| Tests | Vitest + Playwright | Unit tests for logic, end-to-end tests for flows | MIT / Apache-2.0 |

**Engine build choice:** start with the **lite, single-threaded** Stockfish WASM build. It needs no special server headers and is small enough to load quickly. The multi-threaded build is stronger and faster but requires the page to be served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; add it later as an option.

**Why react-chessboard rather than chessground:** chessground (Lichess's board) is GPL-3.0, so using it would make the UI code subject to GPL when distributed. react-chessboard is MIT, which keeps the app's own code free of that requirement.

## Architecture and project structure

The UI never talks to Stockfish directly: all engine calls go through one `EngineService` that runs Stockfish in a Web Worker and exposes typed async functions. This keeps the page responsive while the engine thinks, and keeps the GPL engine as a separate program from the app code.

All engine work goes through one EngineService:

```
                 UI components
   (Board, eval bar, move list, review screen)
        |                 |                  |
        v                 v                  v
   Game store        Bot player        Review pipeline
 (chess.js: moves,  (Elo levels,      (labels, accuracy,
   FEN, PGN)         weakening)          rating)
                          | bot moves        | analysis
                          v                  v
                  +----------------------------------+
                  |          EngineService           |
                  | queues requests, parses UCI,     |
                  | flips scores to White            |
                  +----------------------------------+
                                  | UCI messages
                                  v
                  Stockfish worker (WASM, GPL-3.0)
                  separate file in public/stockfish
```

Bots and Game Review both ask the EngineService for analysis; only the EngineService talks to the Stockfish worker.

**Engine service API (in `src/engine/EngineService.ts`):**

- `init(): Promise<void>` loads the worker, sends `uci`, waits for `uciok`, then `isready` / `readyok`
- `analyze(fen, { depth?, movetime?, multiPV? }): Promise<AnalysisResult>` returns, per line: best move (UCI), score in centipawns or mate-in-N, principal variation, depth reached
- `bestMove(fen, botConfig): Promise<string>` for bot play
- `setOption(name, value)` wraps `setoption name X value Y`
- `stop()` and `newGame()` wrap `stop` and `ucinewgame`
- One request at a time: queue requests; a new bot move or a cancelled review sends `stop` first

**Scores:** always store scores from **White's point of view**. Stockfish reports from the side to move, so flip the sign when Black is to move. Mate scores are kept separately as `{ mate: N }` and converted only when computing win chance.

**Project structure:**

```
src/
  app/            routes and layout (Home, Play, Review, Import)
  components/     Board, EvalBar, EvalGraph, MoveList, MoveBadge, BotPicker, ReviewSummary
  engine/         EngineService.ts, engine.worker.ts, uci.ts (parse 'info' and 'bestmove' lines)
  game/           gameStore.ts (chess.js wrapper), pgn.ts
  bots/           botLevels.ts, botPlayer.ts
  review/         winChance.ts, classify.ts, accuracy.ts, brilliant.ts, reviewRunner.ts
  rating/         estimateRating.ts, calibration.json
  openings/       openings.ts (loads the openings dataset), openings.tsv
  config/         tunables.ts (all thresholds and bot parameters)
public/
  stockfish/      Stockfish WASM + JS files, COPYING (GPL text), link to source
scripts/
  calibrate/      Node scripts to fit the accuracy-to-rating curve (Phase 4)
tests/
  unit/  e2e/
```

## Feature 1: Board and rules

chess.js is the single source of truth for the game; the board component only displays its state and sends move attempts to it.

**Requirements:**

- Drag-and-drop and click-click moves; illegal moves snap back
- Legal-move dots on the selected piece's target squares
- Promotion picker (queen, rook, bishop, knight)
- Highlight last move and king in check
- Game end detection: checkmate, stalemate, threefold repetition, 50-move rule, insufficient material, resignation, and timeout when a clock is used
- Flip board; play as White, Black or random
- Move list in standard notation (SAN), clickable to jump to any position; arrow keys step back and forward
- Optional clocks: 1+0, 3+2, 5+0, 10+0, 15+10, and unlimited
- Sound for move, capture, check and game end
- Import a game by pasting PGN; export the game as PGN with headers (Event, Date, White, Black, Result, and WhiteElo/BlackElo when known)
- Save in-progress and finished games to `localStorage` so a refresh doesn't lose them (wrap in try/catch)

**Data model (`game/gameStore.ts`):**

```ts
type GameRecord = {
  id: string;
  startFen: string;
  moves: { san: string; uci: string; fenAfter: string; clockMs?: number }[];
  white: { name: string; isBot: boolean; elo?: number };
  black: { name: string; isBot: boolean; elo?: number };
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  termination?: string;
  createdAt: string;
  review?: GameReview; // filled by Feature 3
};
```

## Feature 2: Bots with Elo levels

Bots at 1320 Elo and above use Stockfish's built-in strength limit; below 1320 the app weakens Stockfish itself, because 1320 is the lowest `UCI_Elo` recent Stockfish versions accept.

**Mode A — Stockfish limit (1320 to about 3000):**

- `setoption name UCI_LimitStrength value true`
- `setoption name UCI_Elo value <target>`
- On startup, read the `uci` output and store the actual `UCI_Elo` min and max, rather than hard-coding them
- Use `go movetime <ms>` so the bot responds in a human-feeling time
- Above 3000: turn the limit off and play at full strength

**Mode B — custom weakening (below 1320):**

1. Run `go depth <d>` with `MultiPV <k>` to get the top k moves
2. With probability `pBest` play the top move; otherwise pick one of the other k moves, weighted toward the better ones
3. With probability `pBlunder` instead play a random legal move
4. Never let a weakened choice skip a mate-in-1 for the bot at levels 800+, so it feels less silly

**Starting bot table (all values *tunable*, in `config/tunables.ts`):**

| Level (Elo) | Mode | Depth | MultiPV | pBest | pBlunder | Think time |
| --- | --- | --- | --- | --- | --- | --- |
| 400 | B | 1 | 5 | 0.30 | 0.25 | 0.5–1.5 s |
| 600 | B | 2 | 5 | 0.40 | 0.15 | 0.5–1.5 s |
| 800 | B | 3 | 4 | 0.50 | 0.10 | 0.8–2 s |
| 1000 | B | 4 | 4 | 0.60 | 0.06 | 0.8–2 s |
| 1200 | B | 5 | 3 | 0.70 | 0.03 | 1–2.5 s |
| 1320–3000 | A | n/a | 1 | n/a | n/a | 1–3 s |
| Max | Full strength | n/a | 1 | n/a | n/a | 2 s |

**Bot picker UI:** a slider or list of levels in steps of 100 or 200, plus an "I don't know my level" option that starts at 800. After a game, suggest a level about 100 above or below based on the result.

**Calibration note:** Stockfish's Elo setting is calibrated against other engines at specific time controls, not against human players. Expect to adjust the table after testing; logging bot level, result and the player's accuracy per game makes this easier.

**Later — Maia bots (human-like play):** [Maia](https://github.com/CSSLab/maia-chess) is a set of neural networks trained on Lichess games, one per rating band from about 1100 to 1900. It predicts the move a human at that rating would play. Running it in the browser needs the network converted to run with ONNX Runtime Web or TensorFlow.js, so treat it as a research task in a later phase. Check the Maia repository's license before shipping it.

## Feature 3: Game Review

Game Review runs full-strength Stockfish on every position of a finished game, converts each score to a win chance, and labels every move by how much win chance it gave away.

### Pipeline (`review/reviewRunner.ts`)

1. For each position from the start to the final position, run `analyze(fen, { depth: 16, multiPV: 2 })` (*tunable*; offer "Fast" depth 12 and "Deep" depth 20)
2. Reuse each analysis twice: the position after move N is also the position before move N+1, so a game of M moves needs M + 1 analyses, not 2M
3. Show a progress bar ("Analyzing move 23 of 61") and allow cancel
4. Cache results per FEN in memory, and store the finished review in the game record

### Win chance (`review/winChance.ts`)

Use the Lichess formula, which maps a centipawn score to White's win chance as a percentage:

```latex
\text{Win\%} = 50 + 50 \cdot \left( \frac{2}{1 + e^{-0.00368208 \cdot cp}} - 1 \right)
```

Clamp `cp` to ±1000 before applying it. A mate for White scores 100, a mate for Black scores 0. For the player who moved, use the win chance from their own side: White uses Win%, Black uses 100 − Win%.

### Move labels (`review/classify.ts`)

For each move, `loss` = the mover's win chance before the move minus their win chance after it, using the best-line score before and the actual-move score after. Apply the rules in this order and stop at the first match:

| Order | Label | Rule (*tunable*) |
| --- | --- | --- |
| 1 | Book | The position after the move is in the openings dataset, and no earlier move left book |
| 2 | Brilliant | Passes the Brilliant check below |
| 3 | Great | Move equals the engine's top move, and the second-best line is at least 15 win% worse for the mover, and the mover was not already above 95% |
| 4 | Best | Move equals the engine's top move |
| 5 | Miss | Opponent's previous move gave the mover at least 10 win%, and this move gives back at least 10 win% |
| 6 | Excellent | loss ≤ 2 |
| 7 | Good | loss ≤ 5 |
| 8 | Inaccuracy | loss ≤ 10 |
| 9 | Mistake | loss ≤ 20 |
| 10 | Blunder | loss > 20 |

**Brilliant check (`review/brilliant.ts`):** a move is Brilliant when all of these hold: loss ≤ 2; the moved piece, or another piece the move leaves undefended, can be captured with a net loss of at least 2 points of material (pawn 1, knight 3, bishop 3, rook 5, queen 9), computed with a simple static exchange evaluation; the mover's win chance before the move was below 90%; and the move is not a simple recapture. Expect to tune this; it is the hardest label to get right.

### Accuracy (`review/accuracy.ts`)

Per-move accuracy, from Lichess's published formula, using that move's `loss`:

```latex
\text{MoveAccuracy} = 103.1668 \cdot e^{-0.04354 \cdot loss} - 3.1669
```

Clamp to 0–100. For the game accuracy of each player, start with the mean of (a) the plain average of their move accuracies and (b) their harmonic mean, which punishes a few big blunders more. Lichess's full method also weights moves by how volatile the position was; its source code is in the [lichess-org/lila](https://github.com/lichess-org/lila) repository and can replace the simple version later.

### Review screen

- Eval bar beside the board, animated as the player steps through moves
- Eval graph (win chance over moves) under the board; click a point to jump to that move
- Move list with a colored label icon on each move
- For each move: the label, a one-line explanation ("Blunder: this lost your knight. Best was Nf5"), and an arrow for the best move
- "Show best line" plays the engine's principal variation on the board
- Summary card per player: accuracy, count of each label, and estimated game rating (Feature 4)
- "Retry" mode: jump to each Mistake or Blunder and let the player find the best move

**Explanations:** generate them from simple templates using the data already available: material lost, piece left hanging, missed mate, missed capture. Don't attempt free-text coaching in the MVP.

## Feature 4: Estimated game rating

The MVP estimates each player's rating for one game from their accuracy using a lookup curve, shown as a range; Phase 4 replaces the placeholder curve with one fitted on real Lichess games.

### MVP method (`rating/estimateRating.ts`)

1. Take the player's game accuracy from Feature 3
2. Look it up in the curve in `rating/calibration.json`, interpolating linearly between points
3. Adjust: if the player made 3 or more Blunders, subtract 100 per blunder beyond 2; if the game had fewer than 20 moves by that player, widen the range
4. Show the result as a range, never a single number: ±200 normally, ±300 when the player made fewer than 20 moves
5. Don't show an estimate when the player made fewer than 10 moves; show "Not enough moves to estimate"

**Placeholder curve (*tunable*, replace after calibration):**

| Accuracy (%) | Estimated rating |
| --- | --- |
| 95 | 2600 |
| 90 | 2200 |
| 85 | 1900 |
| 80 | 1600 |
| 70 | 1200 |
| 60 | 900 |
| 50 | 600 |
| 40 | 400 |

These values are rough guesses to make the feature work end-to-end. They must not be presented as accurate until calibrated.

### Calibration (`scripts/calibrate/`)

1. Download one month of rated games from the [Lichess open database](https://database.lichess.org/) (PGN, compressed with zstd)
2. Keep games that already contain engine evaluations (`[%eval ...]` comments in the moves), so Stockfish doesn't need to be rerun; keep only rapid and classical games for a cleaner signal
3. Sample about 1,000 player-games per 100-point rating band from 600 to 2600
4. Compute accuracy for each player-game with the same `accuracy.ts` code the app uses
5. For each rating band, take the median accuracy, then write the resulting accuracy-to-rating points to `calibration.json`
6. Report the typical error (median absolute difference between estimated and real rating) so the range width can be set honestly

Possible improvement: fit a small regression using accuracy plus blunder count, mistake count and opponent rating, instead of accuracy alone.

### Later — Maia matching

For each move, ask each Maia model (1100 to 1900) how likely it was to play the move the human played. The rating whose model gives the highest total likelihood across the game is the estimate. This captures playing style, not only mistakes, but needs Maia running in the browser first (see Feature 2).

## Feature 5 (later): Accounts and player ratings

This is the first phase that needs a server; design the MVP so game records and reviews can later be uploaded unchanged.

**Suggested backend:** Node.js with Fastify, PostgreSQL, Prisma for the database layer, and WebSockets for live games between players.

**Rating system: Glicko-2.** Each player has a rating, a rating deviation (how uncertain the rating is) and a volatility. New players start at rating 1500, deviation 350, volatility 0.06. Deviation shrinks as they play, so ratings move fast at first and then settle. Use an existing library (for example the `glicko2` npm package) rather than writing the math by hand.

**Rules to decide before building:**

- [x] Do games against bots change a player's rating, or only games against people? *Decided: bot games are rated.*
- [x] Separate ratings per time control (bullet, blitz, rapid), as most sites do? *Decided: yes, plus classical; untimed games unrated.*
- [x] Should the first few bot games set a starting rating instead of 1500? *Decided: no, start at 1500.*

**Other pieces:** sign-up and login, profile page with rating history graph, saved games list, and server-side review using a native Stockfish binary for long or deep analyses.

## Licensing and legal

Stockfish is GPL-3.0 and the MVP sends it to players' browsers, which counts as distributing it, so the app must meet the GPL conditions for the engine files.

- [ ] Ship the GPL license text (`COPYING`) next to the Stockfish files in `public/stockfish/`
- [ ] Link to the exact Stockfish source used (the official repository and the WASM build's repository, with version), on an About or Credits page
- [ ] If the Stockfish code is modified, publish the modified source
- [ ] Credit Stockfish by name on the About page; don't present it as the app's own engine
- [ ] Keep Stockfish as a separate worker file that the app talks to through UCI messages, not merged into the app bundle
- [ ] List all other open-source libraries and their licenses on the Credits page
- [ ] Use an original name, logo and design; don't copy Chess.com's branding, bot characters or text
- [x] Check the Maia license before adding it *(Maia-3 is AGPL-3.0: shipped unmodified as a separate worker + model file, credited on About with its licence text. Get a qualified review before a public or paid launch; Maia-2 is the MIT fallback.)*

This is a practical checklist, not legal advice. Have someone qualified review it before charging money for the app.

## Build phases and acceptance criteria

Build in five phases and finish each phase's checks before starting the next.

### Phase 1 — Board and rules

- [ ] Two people can play a full game on one screen, including castling, en passant and promotion
- [ ] Every game-end type in Feature 1 is detected and shown
- [ ] PGN import and export round-trip: importing an exported game gives the same moves and result
- [ ] A refresh mid-game restores the game

### Phase 2 — Engine and bots

- [ ] Engine loads in a Web Worker; the UI stays responsive while it thinks
- [ ] Eval bar shows a live evaluation during play (toggleable)
- [ ] All bot levels in the table can be chosen and play legal moves
- [ ] Over 20 automated games, a 400 bot loses to a 1200 bot in most games, and a 1200 bot loses to a 2000 bot in most games

### Phase 3 — Game Review

- [ ] A 40-move game reviews at depth 16 with a progress bar, and can be cancelled
- [ ] Every move gets exactly one label
- [ ] Unit tests: win-chance and accuracy functions match hand-computed values; a known blunder position is labelled Blunder; a known only-move position is labelled Great
- [ ] Eval graph, best-move arrows, and "Show best line" work
- [ ] Opening name shows for common openings

### Phase 4 — Estimated rating

- [ ] Summary card shows each player's estimated rating as a range, or "Not enough moves"
- [ ] Calibration script runs on a Lichess month file and writes `calibration.json`
- [ ] The typical error from calibration is reported and used to set the range width

### Phase 5 — Accounts and ratings

- [ ] Sign up, log in, save games to the server
- [ ] Glicko-2 ratings update after each rated game
- [ ] Rating history graph on the profile page

### Testing approach

- **Unit tests (Vitest):** UCI output parsing, score sign flipping for Black, win chance, accuracy, every classification rule, rating lookup
- **Fixed test positions:** keep a small set of FEN positions with known correct labels in `tests/fixtures/` and check them on every change
- **End-to-end (Playwright):** play a short game vs a bot, open review, check labels and summary appear
- **Engine in tests:** run Stockfish in Node for unit tests so results don't depend on a browser
