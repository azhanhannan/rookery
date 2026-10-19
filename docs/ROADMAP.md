# Rookery roadmap (after the SPEC phases)

Where the post-SPEC feature work stands, so a new session can pick it up. Last updated 19 Oct 2026 (after wave 7, Why? from logic and engine analysis).

## Status at close (19 Oct 2026)

- Waves 1-7 built and merged; all checks green on `master` (tsc, 1108 unit, 82 server, build, 97 e2e; `settings.spec` piece-image check flaked once under load, passes alone).
- Local dev DB: `man_9486` merged into `breakfastmilo` (18 Oct); the 14 Phase 5 fixture games (`seed-*`, `loc-*`)
  deleted and ratings replayed on 19 Oct: rapid 694 (11 games), blitz 759 (7), bullet removed, puzzle 1361.
  Backups and the one-off scripts (merge, cleanup) are in `.data/backups/2026-10/` (gitignored, local only).
- **Next for Hannan**: in the browser, signed in as breakfastmilo, run the re-review / Review all (depth 16, v2)
  so Insights and the profile fill in; then click through the untried lists below.
- **Next to build**: Phase 4 Lichess calibration (unblocks Maia fit by phase, rating-band comparison, style rating);
  then online play / server-side review (from SPEC).

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
| 2 | 16 Oct | Account sync (`UserState` table, `GET/PUT /api/state`, `src/sync/`) · Opening trainer `#/openings` · Endgame drills `#/endgames` + Lichess tablebase (Analysis + Review) · Spar button, loss-streak cushion, accuracy wording, Timed puzzles, premoves · Rook mascot, figurines, `#/drills` (name the square), calculation mode, weekly training log | `7d7a616`..`cee87e3` |
| 3 | 16 Oct | Opening explorer (Lichess masters + online games, token in Settings; Analysis, Review, rare-move note in the trainer) · Coach–student link `#/coach` (invite codes, coach view of games, comments per game/ply, puzzle homework, header badge) · Lessons `#/lessons` (7 lessons, checked positions) · Loose ends: sync delete markers, max/union merges, alternative moves in My mistakes, live theme picker, self-review style race, phone header with a More menu (`src/app/nav.ts`) | `5f75ea6`..`HEAD` |
| 4 | 18 Oct | Insights `#/insights` from a second panel (BA, SA, coach SME, analytics SME; [`insights-2026-10/`](insights-2026-10/), decisions in `synthesis.md`): typed caption facts + extra motifs (back-rank, ignored threat, stalemate given away, lost on time while better) · `src/insights/` facts, stats, points-lost ledger, Focus with pre-registered re-test, conversion/saves, clock, after-loss line, openings, trend · page by Review style, synced `rookery.focus`, IndexedDB facts cache, Train-this deep links · server `GameInsight`/`CoachFocus` (migration `20261018120000_insights`), full-history facts, coach Insights tab · games record `endedAt`/`takebacks`; Review all at depth 16 + one-off re-review of shallower reviews | `b238823`..`1fae0eb` |
| 5 | 18 Oct | Player profile from a third panel (coach SME, analytics SME, product + an Opus decision-maker; [`player-profile-2026-10/`](player-profile-2026-10/), ruling in `decision.md`): reviews keep the second engine line (review v2) → `MoveFact.critical`; opponents split human / maia / stockfish; factsVersion 2; re-review also offers v1 reviews · "Your recent games" under Focus on `#/insights` (`src/insights/profile.ts`): phase, threat-checking, converting & saving (people + Maia only), clock, openings incl. "not the problem"; habits not labels (banned-word test); opens at 20 games; Learner/Club/Analyst views; coach tab shows it; nothing on the public profile · slice 2: rushed critical moves (clock card + profile, critical move < 0.5× game median time) · slice 3: forcing vs quiet cost by type (people + Maia, 40 games at one speed, clustered interval, flip test; factsVersion 3) | `d426cd0`, `07134ff` |
| 6 | 19 Oct | System coach, rule-based (no AI; every line provable from the review): **Coach walkthrough** in Review (`src/review/coachScript.ts`, `CoachWalkthrough.tsx`; key moments one by one, stakes in words/%/numbers by style, Find the better move / Show me, closing take-away + Train this; ←/→/Esc; auto-opens on Learner, pref `coachAutoOpen`) · **Practice Coach** (`src/game/coachWatch.ts`, `useCoachWatch`, `CoachWarning.tsx`; Practice only: warns after a move that drops ≥ 2 pawns or allows mate in 1, Take it back / Keep playing, bot held + clock paused while open; quiet on checks, even trades, pawn drops, unavoidable losses; synced `rookery.practiceCoach`) · **Tactic captions** (`src/review/tactics.ts`: pin, skewer, discovered attack, trapped piece, promotion, lost in exchange, missed fork; allowed + missed; engine line as witness; factsVersion 4, Insights motifs pin/skewer/discovered-attack → lessons). Own mistakes explained on the dev DB: 35% → 44% · also: arrow keys on the self-review question; Insights offers to review never-reviewed games | `b645bba`, `59f14ee`, `d18e1c6` |
| 7 | 19 Oct | **Why?** for a move in Review and in each coach-walkthrough moment (logic + stored engine analysis, no AI; contract `src/review/why.ts`, `WhyPanel.tsx`, key W): *What happens next* / *What the engine wanted* (`lineStory.ts`: plays the stored line ≤ 6 plies; material once captures settle, confirmed against the rest of the line; mate, promotion, repeated checks, double attack that can't be met) and *What changed* (`positionChanges.ts`: king shelter, line opened to the king, castling rights, passed/doubled/isolated pawns, late development, piece activity, bishop pair; facts, not blamed). A material claim shows only when the engine's verdict agrees (`WHY_STORY.agreeWin` 55). ▶ Show plays a sentence's line. Own Mistake/Blunder/Miss with any explanation on the dev DB: 43% (captions) → 69% | `4ba8a4a`, `2df5130`, `54a03c4` |

Wave 2 added a migration (`20261016100000_user_state`), wave 3 another (`20261016140000_coach`); the server applies migrations on start.

## Decisions taken (change in `src/config/tunables.ts` or ask)

- Learned opening positions repeat every 21 days for ever; My-mistakes puzzles retire after the 21-day review.
- Opening library (`src/openings/library.ts`, 11 starter repertoires): every line is checked by `tests/unit/openingLibrary.test.ts`
  against the Lichess opening book (legal, theory for its first moves, one answer per own position). A one-off
  Stockfish pass (depth 16) found one bad line (QGA 6.b3, now 6.Qf3); rerun one when adding openings.
- Opening trainer extra practice ("Practise anyway", "Drill weakest"): right answers off the schedule change nothing; a miss always counts.
- Endgame win drills pass on "convert" (pawn queens, or defender left with a bare king vs R/Q) while the
  tablebase still says win; draw drills pass after N moves still drawn. Offline fallback: Stockfish ±300cp.
- First sync on a device: the account's settings win over that device's.
- Captions in Review are only shown when a rule proves them (hanging piece, missed/allowed mate in 1–2, fork,
  missed free piece; since coach motifs also pins, skewers, discovered attacks, missed forks, trapped pieces,
  promotions and pieces not defended well enough, each witnessed by the stored engine line, `src/review/tactics.ts`);
  otherwise none.
- Lichess opening explorer needs a personal Lichess token (API answers 401 without one since 2026). It is kept
  in the browser only (`rookery.lichessToken`), never synced or sent to our server.
- Coach access: linking a coach shares the games already saved to the student's account; coach routes answer
  404 (not 403) without an active link. Unlink deletes the link at once.
- My-mistakes puzzles accept another move within `MISTAKES.alternative.marginCp` of the best (or a mate no more
  than `mateSlack` moves longer), checked with local Stockfish.
- "Great move!" pop-ups during a game: rejected (praise belongs in Review). Takebacks in rated games: rejected.

## Left to do

**Panel ideas**: all built (wave 3).

**Why? (wave 7), untried by hand**
- "What happens next" says who wins material in side names (White/Black), so on your own mistake it can read
  "White wins a pawn" when White was the one who sacrificed earlier; facts good for the mover (your own passed pawn)
  can show on a mistake. Backward pawns and removing-the-defender not built. attacks-two and hangs-at-end rarely
  fire on real games. Learner wording of both modules is the agents' own.

**System coach (wave 6), untried by hand**
- Walkthrough: Rookie shows even with the `coachMascot` pref off (that pref only covers move-panel captions); Escape
  closes the walkthrough, not a line/retry under it; the opening phase can run to ~move 17, so "Train this" may
  point at the opening trainer. Learner wording for the new motifs is the agent's own.
- Practice Coach: never warns on a checking move (Qxf7+?? Kxf7 is missed); losses two moves deep aren't seen;
  a reload with a warning open leaves the bot's clock paused until it moves.
- Tactic captions: missed-* kinds never fired on the dev games (unit tests only); removing the defender /
  overloaded defender not built (not provable cleanly). Next options: AI "Explain more" grounded in engine facts
  (needs a pay-as-you-go API key), more motifs.

**Player profile (wave 5)**
- Next per `player-profile-2026-10/decision.md`: Maia fit by phase (after Phase 4). Open from slice 3: cost by type is not
  a ledger bucket / Focus candidate; sacrifices count only with a provable threat; king-side pawn pushes not forcing. Never: archetype labels, "positional", one pooled "plays like ~X".
- Untested by hand: coach tab rendering of the profile; real data (Hannan's games mostly Stockfish levels). The
  factsVersion bump turns a Focus pinned before it into "Rules changed". (`critical` and rushed critical moves came with review v2 in wave 5.)

**Insights (wave 4), untried in a real browser**
- IndexedDB facts cache across reloads; `rookery.focus` sync between two devices; the verdict / window-closed states
  (need 15 games + 2 weeks); Swap and End; the page against the real server endpoints (e2e mocks them).
- Server backfill on the real dev DB; coach cards with real named motifs; re-review pausing during a bot game; the
  re-review offer at phone width. Learner/state wording in `src/app/insights/wording.ts` is the agent's own — review it.
- Not built: tablebase-wrong motif (reviews store no tablebase result), rating-band comparison (waits for Phase 4 calibration). Time trouble has no drill, so it is never the
  ledger's Focus (a coach may still set it).
- Known: startup backfill can overwrite a row re-uploaded at the same moment (next save fixes it); Chess.com
  `EndDate`/`EndTime` assumed UTC; re-review replaces "Analyse deeper" positions.

**Wave 3, untried in a real browser** (unit/server/e2e tests pass; no human has clicked through yet)
- Explorer against Lichess with a real token, and a real 429.
- Coach pages end to end with two accounts; dragging moves on a lesson board.
- My-mistakes alternative moves with real Stockfish; sync between two real devices.
- Coach game view numbers moves assuming White moved first; the coach badge makes two API calls per route change.
- The phone footer still has Import and About, now also in the More menu.

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
