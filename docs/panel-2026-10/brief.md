# Rookery — what exists today (15 Oct 2026)

Rookery is a personal, browser-based chess web app (React + TypeScript, Stockfish 19 WASM and Maia-3 in the browser, small Node API + Postgres for accounts). Source: C:\laragon\www\chess (SPEC.md describes the plan). Running locally at http://localhost:5173.

Pages and features already built:
- **Play** (#/play): full rules; play vs Stockfish bots at Elo levels ~400–3000, or vs human-like Maia-3 bots (600–2600); local two-player on one device; New game dialog with colour choice and time controls (clocks); flip board; resign; step back/forward through moves; sound on/off; copy/download PGN; board fits the screen; full-screen mode (F key).
- **Game Review** (#/review/...): Chess.com-style move labels (Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder, Miss, Great, Brilliant), eval bar, eval graph, best-move arrows, accuracy per player, opening name, estimated game rating as a range, and "Style rating" (which Maia level plays most like you).
- **Import** (#/import): paste one PGN.
- **Puzzles** (#/puzzles): Lichess puzzle database, puzzle rating (Glicko-2), hints.
- **My games** (#/games): history with stats card, filters (wins/losses/etc.), day groups, mini-board thumbnails, rating change per game.
- **Profile**: Glicko-2 player rating from rated bot games.
- **Account/Settings**: sign up with password or Google; 26 board themes (13 flat colours, 13 textures), 16 piece styles, live preview; saved per device.
- **About**: credits and licences.

NOT built yet: online play vs other people, takebacks/undo vs bot, premoves, hints during a game, opening explorer/trainer, free analysis board (set up any position), puzzle streak/rush modes, lessons, achievements, daily puzzle, coach explanations in plain words, mobile app, sound packs, saving appearance to the account, friends/clubs.

Constraints: one-person hobby project; everything compute-heavy runs in the browser; must not copy Chess.com's name, logo, design, bot characters or private formulas; non-commercial assets are avoided so it could go public later.
