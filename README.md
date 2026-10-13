# Rookery

Browser chess app: play on one board, then (from Phase 2) against bots and get a game review.
`SPEC.md` is the build spec; it is implemented one phase at a time.

"Rookery" is a working name, set in `src/config/tunables.ts`.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Board and rules | Done |
| 2 | Engine and bots | Not started |
| 3 | Game Review | Not started |
| 4 | Estimated rating | Not started |
| 5 | Accounts and ratings | Not started |

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end (Playwright, uses the installed Chrome)
npm run build
```

`SCREENS=1 npx playwright test screens` writes screenshots to `test-results/` for a visual check.

## Phase 1 notes

- chess.js is the source of truth; `src/game/rules.ts` holds the pure game logic, `gameStore.ts` the Zustand state.
- The current game is saved to `localStorage` on every change (`rookery.current`); finished games go to `rookery.games` (last 100).
- After a refresh the running clock restarts from the saved time: time spent away is not charged.
- Clocks start once White has made the first move.
- Timeout against a lone king, or king plus one minor piece against a lone king, is a draw (simplified FIDE rule).
- An imported game continues without a clock; any `%clk` times stay on its moves.
- Sounds are synthesized with Web Audio, so no audio files ship.
