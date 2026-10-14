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
- Known gaps: a review run later on an older game (not the current one) isn't re-uploaded automatically;
  saved games keep "You" as the player name; online play (WebSockets) and native-Stockfish server review are not built.
