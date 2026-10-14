# Rookery

Browser chess app: play on one board, then (from Phase 2) against bots and get a game review.
`SPEC.md` is the build spec; it is implemented one phase at a time.

"Rookery" is a working name, set in `src/config/tunables.ts`.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Board and rules | Done |
| 2 | Engine and bots | Done |
| 3 | Game Review | Done |
| 4 | Estimated rating | Partly done: estimate works on the placeholder curve; calibration not run |
| 5 | Accounts and ratings | Done (accounts, saved games, Glicko-2, profile graph); online play and server-side review not built |
| Later | Google sign-in, human-like Maia bots, puzzles, Maia matching (style rating) | Done |

## Run

```
npm install
npm run server     # API on :5181 with an embedded Postgres in .data/pg (first start ~10 s)
npm run dev        # http://localhost:5173, proxies /api to the server
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end (Playwright, uses the installed Chrome)
npm run test:bots  # bot-vs-bot strength matches, ~6 min; scores in test-results/bot-match.txt
npm run test:server  # API tests against a throwaway embedded Postgres
npm run build
```

The browser app works without the server (play, review, local history); accounts and ratings need it.
In production set `DATABASE_URL` to a real PostgreSQL and run `npm run server:start`.

`SCREENS=1 npx playwright test screens` writes screenshots to `test-results/` for a visual check.

## Phase 1 notes

- chess.js is the source of truth; `src/game/rules.ts` holds the pure game logic, `gameStore.ts` the Zustand state.
- The current game is saved to `localStorage` on every change (`rookery.current`); finished games go to `rookery.games` (last 100).
- After a refresh the running clock restarts from the saved time: time spent away is not charged.
- Clocks start once White has made the first move.
- Timeout against a lone king, or king plus one minor piece against a lone king, is a draw (simplified FIDE rule).
- An imported game continues without a clock; any `%clk` times stay on its moves.
- Sounds are synthesized with Web Audio, so no audio files ship.

## Phase 2 notes

- Stockfish 19 (stockfish.js 19.0.1, lite single-threaded) runs in a Web Worker. `predev`/`prebuild` copy it from
  `node_modules/stockfish` into `public/stockfish/` (the .js/.wasm are gitignored; `COPYING` and `SOURCE.md` are committed).
- All engine calls go through `EngineService` (one queue). It remembers option values and always analyses at full
  strength; the strength limit applies only to bot moves.
- Bot levels and the live-eval depth are in `src/config/tunables.ts`. Levels step by 200, so "suggest a level about 100
  above or below" (SPEC) is implemented as the adjacent level.
- The bot match (`tests/match/`) uses 0.2 s per engine move instead of play's 1-3 s think time, so it finishes in minutes.
- Credits and GPL links: the About page (`#/about`).

## Phase 3 notes

- Pipeline: `reviewRunner.ts` analyses each position once (M moves = M + 1 searches, depth 16, MultiPV 2, 64 MB hash,
  in-memory cache per FEN) and `buildReview.ts` turns the analyses into labels, accuracy and explanations. All
  thresholds are in `REVIEW` in `src/config/tunables.ts`.
- Timing: a 40-move (80-ply) engine self-play game took about 96 s at depth 16 in Node on an idle machine; Fast
  (depth 12) is several times quicker. `REVIEW_BENCH=1 npx vitest run tests/unit/reviewRunner.node.test.ts` re-measures.
- Openings: lichess-org/chess-openings (CC0), combined in `src/openings/openings.tsv`; `scripts/build-openings.mjs`
  regenerates the position index `positions.tsv`. Loaded only when a review runs.
- Known limit of the SPEC's win-chance formula: passing up a mate in an already winning position (say +9) costs only
  ~3.5 win% and is labelled Good or Excellent, not Miss.
- Fixed label positions: `tests/fixtures/review-positions.ts`, checked against the real engine in
  `tests/unit/review.engine.test.ts`.
- The review screen and Recharts load on first visit to `#/review`.

## Phase 4 notes

- `src/rating/estimateRating.ts` implements the SPEC's MVP method: accuracy looked up on the curve in
  `src/rating/calibration.json` (linear interpolation), -100 per blunder beyond 2, range ±200 (±300 under 20 moves),
  "Not enough moves to estimate" under 10 moves. Numbers are in `RATING` in `src/config/tunables.ts`.
- The curve is still the SPEC's placeholder (`"calibrated": false`), so the summary card says "rough estimate, not yet
  calibrated". The estimate is computed when shown, not stored, so a new calibration applies to old reviews too.
- Still to do: `scripts/calibrate/` (stream a Lichess month, keep rapid/classical games with `[%eval]`, ~1,000
  player-games per 100-point band, median accuracy per band) writes `calibration.json` with `calibrated: true` and
  `typicalError`, which then becomes the range half-width.

## Phase 5 notes

- Server: Fastify 5 + Prisma 7 (`prisma/schema.prisma`) + PostgreSQL, code in `server/`. The JSON contract is
  `src/api/types.ts`. With no `DATABASE_URL` the server starts `embedded-postgres` (real Postgres binaries from
  npm), so nothing needs installing; tests and e2e use their own throwaway instances (ports 54321, 54322).
- Accounts: username + password (no email). Passwords hashed with Node's scrypt; sessions are random
  tokens in an httpOnly SameSite=Lax cookie, stored only as a sha256 hash, 30 days. Failed logins are throttled per username+IP.
- Google sign-in: put a Google OAuth client's keys in `.env` (see `.env.example`; redirect URI
  `http://localhost:5173/api/auth/google/callback`). Without keys the button is hidden. A first Google
  sign-in creates a passwordless account; Google is linked to an existing account only from Settings while signed in.
- The SPEC's three rating rules, all switchable in `RATINGS` (`src/config/tunables.ts`):
  1. Bot games are rated (the only rated games until online play exists). A bot is a fixed opponent at its
     level's Elo with RD 50; its rating never moves.
  2. Separate ratings for bullet / blitz / rapid / classical, by base + 40 x increment seconds. Untimed games are saved but not rated.
  3. Everyone starts at 1500 / RD 350 / volatility 0.06; no seeding from the first bot games. Shown as "1500?" while RD > 110.
- Glicko-2 via the `glicko2` package, one game per rating period (checked against Glickman's worked example).
  The rating is applied once, in the same transaction that stores the game; re-uploading a game (e.g. with its review) never re-rates it.
- The server replays every move with chess.js and checks the result against checkmate/stalemate, but it
  cannot know a bot game was really played against the bot: the browser could fake a win. Fine for a
  personal app; anything competitive needs server-side play.
- Finished games upload automatically while signed in; failed uploads queue in `rookery.unsynced` and retry.
  Older local games can be uploaded from My games (always unrated).
- My games (`#/games`): record (won/drawn/lost, win rate), filter chips (All/Won/Lost/Draws/Rated/Casual; server-side
  via `GET /api/games?filter=`, stats on the first page), rows grouped by day with a final-position thumbnail,
  ending, full-move count and the rating change. Signed out or offline it lists this device's games the same way.
  The upload offer only appears for device games not yet in the account (`GET /api/games/ids`).
- Known gaps: a review run later on an older game (not the current one) isn't re-uploaded automatically;
  saved games keep "You" as the player name; online play (WebSockets) and native-Stockfish server review are not built.

## Human-like bots (Maia)

- New game → Bot → Style **Human-like** plays [Maia-3](https://github.com/CSSLab/maia3) (CSSLab, AGPL-3.0) at
  levels 600–2600 (step 200, `MAIA` in `src/config/tunables.ts`). It predicts the move a Lichess player of that
  rating would play against an equal opponent; the bot samples from that prediction (temperature 1, top-p 0.95), so
  it plays human openings and makes human mistakes. **Engine** is the Stockfish bot, unchanged.
- Files: `npm run dev`/`build` run `scripts/fetch-maia.mjs`, which downloads `public/maia/maia3_simplified.onnx`
  (46 MB, sha256-checked; `MAIA_MODEL_PATH=<file>` uses a local copy) and copies the onnxruntime-web runtime into
  `public/ort/`. Both are gitignored. Offline, it only warns and the human-like bot is unavailable
  (the dialog offers "Use the engine bot instead"). Licence and citation: `public/maia/LICENSE-NOTE.md`.
- Runtime: `src/maia/` — pure encode/decode (`encoding.ts`), a module Web Worker running onnxruntime-web 1.30
  (WASM, single thread; never in the main bundle), and `getMaia()` (`MaiaService`), the only way in.
  First use downloads ~60 MB (model + runtime) with a progress bar; then ~1.5 s to start and ~150–250 ms per move.
- Games against Maia are rated (`ratingIneligibleReason` accepts `engine: 'maia'` at a `MAIA.levels` Elo); the
  bot's name is "Maia 1200" and "Play again" stays human-like. The style and level are remembered
  (`rookery.botEngine`, `rookery.maiaElo`).
- Tests: `tests/unit/maia.test.ts` (encoding, sampling, service queue), `tests/unit/maia.node.test.ts` (the real
  model in Node; skipped without the file), `tests/e2e/maia.spec.ts`.

## Maia matching (style rating)

- On the review screen, **Estimate from playing style** (opt-in; the result is stored on the game as `maiaMatch`
  and uploaded with it). For each person in the game (a bot side is skipped), every non-forced move is scored by how
  likely Maia-3 was to play it at ratings 600, 1000 … 2600, then at ±200 around the best; the peak of a parabola
  through the best three is the estimate. Shown as "Style rating" in the summary card, with the share of moves that
  were Maia's top pick. Numbers in `MAIA_MATCH` (`src/config/tunables.ts`); code in `src/rating/maiaMatch.ts`.
- Cost: about 8 model calls per move, so roughly a minute for a 30-move side in the browser.
- Maia is asked about a game between equals (the opponent's strength is set to the same rating).
- **Not calibrated.** The range (±300, ±400 under 20 moves) is a guess. The only check so far is Maia self-play
  (`tests/match/maiaMatch.test.ts`, in `npm run test:bots`): sides at 800 and 2200 come out within 400 and in the
  right order. That is the easy case; accuracy on people needs the Phase 4 Lichess games.
- Tests: `tests/unit/maiaMatch.test.ts` (fake model), `tests/e2e/maiaMatch.spec.ts` (real model).

## Puzzles

- 2,880 puzzles sampled from the Lichess puzzle database (CC0), 120 per 100-point band from 400 to 3000,
  well-played ones only (popularity, play count, rating deviation; see `PUZZLES` in tunables). Rebuild with
  `node scripts/build-puzzles.mjs` (downloads ~307 MB, streams it; `--cached` reuses `.data/`). Output:
  `public/puzzles/puzzles.json` (556 KB, 149 KB gzipped), fetched on the Puzzles page, not bundled.
- Puzzle rating: Glicko-2, each puzzle a fixed opponent at its Lichess rating. Only the first attempt at a
  puzzle counts; hints and "Show solution" count as a miss. Signed in it's stored on the server (Rating row
  `puzzle`, `PuzzleAttempt` table; the server looks up the puzzle's rating itself); signed out, in localStorage.
