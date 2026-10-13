# CLAUDE.md

Read `SPEC.md` before any feature work. Build one phase at a time and meet that phase's
acceptance criteria (in `SPEC.md`) before starting the next; `README.md` records which phases are done.

- Numbers the spec marks *tunable* go in `src/config/tunables.ts`, nowhere else.
- Game logic stays pure in `src/game/` (no React); components only read the store and send move attempts.
- `localStorage` access is always wrapped in try/catch.
- Stockfish (Phase 2) is GPL-3.0: keep it as a separate worker file in `public/stockfish/` with its `COPYING`, never bundled into app code. See SPEC.md "Licensing and legal".
- All engine access goes through `EngineService` / `getEngine()`; never post to the worker directly.
- Before calling a phase done: `npx tsc -b`, `npm test`, `npm run test:e2e`, `npm run build` all pass
  (plus `npm run test:bots` when bot levels or bot logic change).
