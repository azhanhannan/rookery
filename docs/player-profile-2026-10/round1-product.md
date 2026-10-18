# Player profile — round 1, product / system analyst (18 Oct 2026)

Question: can Rookery tell a player "what kind of player you are" and what to improve, and where does it fit
next to Insights (wave 4)? Short answer: **half of it is already built.** The "strengths and weaknesses" half is a
re-reading of the Insights model; the "style" half (attacker, trader, tactician) needs new facts and has no
baseline to compare against.

## 1. Capability audit

**Reusable today (no new data):**

| Need | Exists in |
| --- | --- |
| Per-move loss, phase, label, motif, clock, time trouble, ignored threat | `MoveFact` in `src/insights/types.ts`, built by `src/insights/facts.ts` |
| Weak phase (rates with 90% intervals, `weakest` flag) | `PhaseRate` in `InsightsModel` |
| Converter vs fighter | `conversion` / `saves` `EpisodeCard` (+3.0 check, human vs bot split) |
| Clock behaviour | `ClockCard` (trouble ratio, lost on time while better) |
| Opening comfort | `OpeningRow` (score, opening loss, first-slip move) |
| What to improve | Ledger + `focus` + re-test (`src/insights/focus.ts`, `src/app/insights/focusStore.ts`) |
| Wording by audience | `ReviewStyle` + `src/app/insights/wording.ts` |
| Same code on the server, coach view | `server/src/insights/store.ts` (`GameInsight`), `server/src/routes/insights.ts` |
| Playing-strength by style | `MaiaMatch` on `GameRecord.maiaMatch` (`src/rating/maiaMatch.ts`) |

**Missing:**

- **Style features.** `MoveFact` has no SAN, capture, check, trade or king-safety field. Captures/checks per move,
  queen-trade timing, castling side and ply, pawn storms, material imbalance and sacrifices (material given while
  win chance held) are all derivable from the `GameRecord` moves with chess.js — no engine — but are not stored.
- **Second line.** `PositionReview` keeps only `bestMove`/`bestLine`; `MoveFact.critical` is always absent and
  `ClockCard.rushedCritical` is null. "Plays sharp vs safe positions" and "handles only-move positions" need
  MultiPV 2 in the review (EngineService already supports it, `src/engine/EngineService.ts:177`).
- **Baselines.** No per-rating reference. "You trade early" only means something against players of your
  strength; Phase 4 calibration is still open (ROADMAP "From SPEC still open"), and the synthesis already bans
  rating-band comparisons until then.
- **Maia match is opt-in, per game, and slow** (6 coarse + 2 refine passes per own move, button in
  `ReviewScreen.tsx:553`). Most games have no `maiaMatch`; its range (±300) is itself uncalibrated.
- **Accuracy is not in facts** (`PlayerSummary.accuracy` lives on the review only). Fine — accuracy charts were
  rejected anyway.

## 2. Where it lives

- **A "Your game" section on `#/insights`**, above the ledger, below Focus. Not a new route: same facts, same
  filters (speed, human/bot), same "reviewed X of Y", same locked/early/ready status.
- **Not on `#/profile/<username>`.** That page is public (`server/src/routes/profile.ts`). A weakness profile
  is private by default; coaches see it through the existing link check (404 without a link), like Insights.
- **Focus stays the only "what to improve".** The profile describes; it never ranks a second recommendation. Its
  improve line *is* the Focus card (or "no Focus yet, need N games"). Two sources of truth would contradict each
  other within a week.
- **Review styles.** Learner: three plain sentences — one strength, one pattern, then the Focus sentence; no
  numbers, no labels. Club: strengths/weaknesses list with *n*. Analyst: the full profile table with intervals and
  links to the evidence positions.
- **End of review:** later, one line ("this game had your usual middlegame slip"), only when the game's facts hit
  the profile's top bucket. Phase 3, not MVP.

## 3. Data model and compute

- New pure module `src/insights/profile.ts`: `GameFacts[] -> PlayerProfile` (strengths, weaknesses, style
  descriptors, each with `n`, `Estimate`, `shown`, `earlyRead`). Runs in the browser and, unchanged, on the server
  for the coach tab — the pattern `store.ts` already uses.
- **Phase 1 needs no facts change**: build from `InsightsModel` (phase rates, episodes, clock, openings).
- **Phase 2 bumps `INSIGHTS.factsVersion` 1 → 2** to add a small per-game `style` block (counts, not per-move
  fields, to keep ~1 KB): own captures, checks, queen-off ply, castled side/ply, sacrifice count, opposite-side
  castling. The bump rebuilds the IndexedDB cache and the server backfills on start; no engine, so cheap.
- Thresholds go in `INSIGHTS.minSample` in `src/config/tunables.ts`, nowhere else.
- Style is **descriptive and self-relative** until baselines exist: "you trade queens before move 20 in 11 of 28
  games", never "you are a positional player". Labels wait for calibrated reference data.

## 4. Small-data reality

| Reviewed qualifying games | What the section shows |
| --- | --- |
| 0 | Locked: "Review 10 games at depth 16" + the existing re-review offer. Nothing inferred. |
| 10 | Early read: games/moves counted; at most a weak phase if its interval clears; style as raw counts. No Focus (gate 20). |
| 30 | Phase profile, conversion vs saves (likely ≥ 8 episodes), first opening rows, Focus live; style shares with *n*. |
| 100 | Trend (≥ 40), after-loss line, stable style shares; human vs bot split meaningful. Labels only if baselines landed. |

Hannan's ~30 games are mostly below depth 16, so today he is effectively at 0–10. **Step 0 is running the
re-review**, not building: the profile cannot be judged on his own data until then.

## 5. Phased plan (estimates, agent-assisted, unmeasured)

1. **Profile card from the existing model** — strengths/weaknesses + Focus link, three styles, coach tab reuse.
   ~1 day. Smallest valuable slice; zero new data.
2. **Style counters** (factsVersion 2, descriptive, self-relative). ~1.5–2 days incl. tests.
3. **Second line in reviews** (MultiPV 2) → `critical`, rushed criticals, "sharp/safe". ~2–3 days plus a review-time
   cost to measure first (MultiPV 2 slows each position; the depth-16 bulk run is already ~1.5 h/100 games, BA's
   estimate).
4. **Maia style rating across games** — background batch over reviewed games, aggregated range. ~1–2 days; CPU
   heavy; needs Phase 4 calibration to be honest.
5. **Labels vs peers** — after Phase 4 calibration. Not estimable yet.

## Open questions (Hannan)

1. Labels ("Attacker") ever, or descriptors only? Recommend descriptors until calibration.
2. Should any of it appear on the public profile, opt-in? Recommend no for weaknesses.
3. Accept the MultiPV 2 review-time cost for phase 3? Measure before deciding.
4. Is Learner shown style at all, or only strength + Focus?
