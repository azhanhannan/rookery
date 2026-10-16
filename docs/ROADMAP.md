# Rookery roadmap (after the SPEC phases)

Where the post-SPEC feature work stands, so a new session can pick it up. Last updated 16 Oct 2026.

## Where the ideas came from

A four-persona panel (15 Oct 2026) reviewed Rookery and argued over what to build next:
Aina (beginner, ~600), Daniel (club, ~1500), Farid (expert, ~2250) and Coach Rahim (trainer).
Their write-ups are in [`panel-2026-10/`](panel-2026-10/): `brief.md` (what Rookery had then), `round1-*.md`
(opening views) and `round2-*.md` (replies to each other, top-5 rankings, Rahim's build order).

What all four agreed on: turn your own mistakes into spaced-repetition puzzles; no helpers in rated games;
one "Review style" setting (Learner / Club / Analyst) instead of picking words vs numbers for everyone.

## Built

| Wave | Date | Features | Merge commits |
| --- | --- | --- | --- |
| 1 | 15 Oct | Practice vs Rated (takeback, show threat, hint, hanging glow) · Analysis board (variation tree, multi-PV, position setup, lossless PGN) · Bulk + Lichess import, Review all, Openings report · Review styles, proven captions, self-review, threat/better arrows, Analyse deeper · My mistakes puzzles (1/3/7/21 days), daily puzzle, trained-days streak · Play polish (sound packs, clock, X flip, ? sheet, hide ratings, end screen, right-click marks) | `8f9d349`..`d5e4ffa` |
| 2 | 16 Oct | Account sync (`UserState` table, `GET/PUT /api/state`, `src/sync/`) · Opening trainer `#/openings` · Endgame drills `#/endgames` + Lichess tablebase (Analysis + Review) · Spar button, loss-streak cushion, accuracy wording, Timed puzzles, premoves · Rook mascot, figurines, `#/drills` (name the square), calculation mode, weekly training log | `7d7a616`..`HEAD` |

Wave 2 added a migration (`20261016100000_user_state`); the server applies migrations on start.

## Decisions taken (change in `src/config/tunables.ts` or ask)

- Learned opening positions repeat every 21 days for ever; My-mistakes puzzles retire after the 21-day review.
- Endgame win drills pass on "convert" (pawn queens, or defender left with a bare king vs R/Q) while the
  tablebase still says win; draw drills pass after N moves still drawn. Offline fallback: Stockfish ±300cp.
- First sync on a device: the account's settings win over that device's.
- Captions in Review are only shown when a rule proves them (hanging piece, missed/allowed mate in 1–2, fork,
  missed free piece); otherwise none.
- "Great move!" pop-ups during a game: rejected (praise belongs in Review). Takebacks in rated games: rejected.

## Left to do

**Panel ideas not built**
- Coach–student link (coach sees games, comments, assigns puzzle homework) — needs multi-user server work.
- Opening explorer from Lichess masters/online games — check whether the explorer API now needs a login.
- Bite-sized lessons (forks, pins, back rank, Scholar's mate defence).

**Loose ends in what's built**
- Untested in a real browser: a real Lichess username import, the low-time clock tick.
- Training-log sync dedupes a day both devices trained on by keeping the larger tally per kind, so activity
  split across two devices on one day under-counts (per-device tallies would fix it).
- A device offline longer than `SYNC.tombstoneDays` can bring a deleted repertoire back.

**From SPEC still open**
- Phase 4 calibration against Lichess data (would also calibrate the Maia style rating).
- Online play between people; server-side Stockfish review.

## How the waves were built (for the next one)

Each feature ran as a background agent in its own git worktree (`../chess-wt/<name>`, branch `feat/<name>`),
with `node_modules`, `server/generated` and `public/ort` as junctions to this repo. Rules given to every agent:
tsc + vitest + oxlint + build before committing; no e2e or servers on 5173/5180/5181/5182/54320; small additive
edits in shared files (`Board.tsx`, `App.tsx`, `AccountPage.tsx`, `tunables.ts`, …). The lead merged each branch,
resolved conflicts (nearly always "keep both blocks"), then ran e2e and server tests once on the quiet machine.

Cleanup gotchas: remove the junctions with `rmdir` **before** `git worktree remove`, and stop any vite the
agents left running (it locks the folder). Real-Stockfish unit tests time out while several agents load the CPU;
they pass on a quiet machine.

Local deploy: `npm run build`, `npm run server:start` (API :5181 + embedded Postgres :54320 in `.data/pg`),
`npx vite preview --port 5173 --strictPort --host localhost`. After a migration: stop Postgres with
`node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe stop -D .data/pg -m fast`, stop the API,
start it again (it migrates on start).
