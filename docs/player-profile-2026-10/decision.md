# Player profile — decision (18 Oct 2026)
<!-- cadence-lint: skip (chess feature decision, not IT maintenance) -->

**Verdict**
1. **Build it, small.** It is a re-reading of what Insights already computes, not a new engine.
2. **Habits, never types.** Rookery says what you *did* in recent games ("you converted 7 of 9"), never what you *are*.
3. **Focus stays the only "what to improve".** The profile gives context and points at the Focus.
4. **Opponent rule:** your own errors count against everyone; opponent-dependent traits use people + Maia bots, never Stockfish levels.
5. **Step 0 first:** store the second engine line and split Maia from Stockfish *before* the depth-16 re-review. Hannan pauses the re-review until then.

## 1. Do we have the capability?

Yes, for habits. No, for "style", and not soon.

| When | What Rookery can honestly say |
|---|---|
| **Now** (once ≥ 20 reviews are at depth 16) | Where your points go by phase; how often you miss the opponent's threat; finishing won games and saving worse ones; clock use (where clocks were recorded); whether openings are a problem |
| **After Step 0 + re-review** | Critical moments: positions with one good move, and whether you rushed them |
| **Later (40 games per speed)** | Whether forcing moves cost you more than quiet ones; how your games end |
| **After Phase 4 calibration** | "Your endgame moves fit a lower rating than your middlegame moves"; comparisons with Maia in your own positions |
| **Never** | "You are an attacker / positional player / Tal", archetype cards, labels drawn from accuracy or the `other` bucket, rating-band labels |

Why never: below ~1800 apparent style is mostly opponents' blunders; a label becomes a sentence the player repeats to themselves, and it flips when ten games change. Calibration makes comparisons honest, not nouns safe.

**For Hannan today:** the section stays locked until the re-review finishes. Then expect phase and threat lines; conversion/saves will likely say "not enough games vs people and Maia", since most of his games are Stockfish levels. That is correct, not a bug.

## 2. "What kind of player you are": wording rules

- **Verbs, not nouns.** "You finish won games", never "You are a converter".
- **Dated and counted.** Every line names its window and group: "From your last 24 rapid games (18 vs bots, 6 vs people)".
- **Strengths pass the same gate as weaknesses.** No filler praise.
- **Closing line, always:** "This describes your recent games, not you. It updates as you play."
- Never "tilt", "because", "typical", or any peer comparison.

| Style | Sees |
|---|---|
| **Learner** | One proven strength, one reassurance where it holds ("Your openings are not where you lose points"), the Focus sentence. No numbers, no style section ever. |
| **Club** | The habit lines with *n*, clear ones only; "leaning" shown greyed; the habit matching the Focus says "This is your Focus". |
| **Analyst** | Full table: estimate, 90% interval, state, group, evidence-position links. |

## 3. "What to improve": one source of truth

The **Focus** (ledger + re-test) is the only action; profile lines get no Train button. The matching line says "This is your Focus" and links to it; other habits are shown, not prescribed. No Focus yet → "No Focus yet: n of 20 games". Two recommenders would contradict each other within a week.

## 4. Bot rule (decided)

Analytics' three groups, with the coach's reasoning:

| Trait kind | Opponents counted | Display |
|---|---|---|
| **Your own errors** (phase, threats, clock, opening approach) | All, with group counts shown and the existing filter | "Mostly from games against bots (24 of 30)" when bots > half |
| **Opponent-dependent** (conversion, saves, later: cost by type, how games end) | People + Maia bots pooled, labelled "vs people and Maia bots" | Stockfish-level games never feed these |

Product's "humans only" is rejected: it gives a bot-only player nothing for months, and Maia, trained on human games, is the best stand-in. Stockfish levels are out because `pBlunder` up to 0.25 hands out pieces at random.

**Code gap:** `MoveFact.opponent` is only `'human' | 'bot'` (`src/insights/types.ts:36`, set in `facts.ts:176`), and `EpisodeCard` splits human/bot only. `GameRecord.botEngine` already says `'maia' | 'stockfish'` (`src/game/types.ts:75`). So the three-way split is a facts change, and it goes in Step 0.

## 5. Gates (confirmed, one amendment)

- Section opens at **20 qualifying reviewed games** (the Focus gate).
- Each line also passes its existing Insights card gate (30 moves + 8 events; 8 episodes; 15 clocked games; 10 games per opening).
- Style-type traits: **40 games per speed per group**, *clear / leaning / not enough (n of 40)*, with the flip test.
- **Amendment:** Learner sees only *clear* lines.

## 6. Trait list

| Trait | When | Training link |
|---|---|---|
| Where your games are decided (phase) | **Slice 1** | the phase's drill: opening trainer / calculation mode / endgames |
| Checking their threats | **Slice 1** | My mistakes (ignored-threat, hanging, allowed-mate) |
| Finishing won games / saving worse ones | **Slice 1** | endgame drills; Maia sparring from a worse position |
| Clock use | **Slice 1**, only where clocks exist | advice text + timed puzzles; never the ledger's Focus |
| Opening approach + "not the problem" line | **Slice 1** | opening trainer only if the opening phase leaks |
| Rushed critical moves | **Slice 2** (needs Step 0 + re-review) | calculation mode |
| Cost by type (forcing vs quiet) | **Slice 3**, 40 games | calculation mode, via the ledger |
| Opening breadth; how your games end (Analyst) | Later, 40 games | opening trainer / none |
| Plays like ~X **by phase** | After Phase 4, Analyst, "uncalibrated" until then | the weaker phase's drills |
| Aggression vs Maia, trades ahead/behind, pressure created | After Phase 4, Analyst, number only | none / endgame drills |
| Pooled "plays like ~X" headline | **Never** (reads as a second rating) | — |
| Raw forcing share, multiPV ≥ 3 risk appetite, archetypes, `other` → "positional", rating-band labels | **Never** | — |

## 7. Step 0 and the re-review

Verified: `REVIEW.multiPV = 2` (`tunables.ts:43`), requested in `reviewRunner.ts:79`, read by `isGreat` in `classify.ts`, then dropped by `toPosition()` (`buildReview.ts:18-20`). Paid for, thrown away.

**Step 0 (~0.5–1 day, estimate):**
1. `PositionReview.second?: { move, score }`, filled in `toPosition()`; `GameReview.version` 1 → 2.
2. `MoveFact.critical` derived in `facts.ts`; opponent split into human / maia / stockfish; `INSIGHTS.factsVersion` 1 → 2 (one bump for both).
3. **Widen the re-review selector.** `shallowReviewIds()` (`src/app/reReview.ts:21`) picks only reviews below depth 16, so a depth-16 review without a second line would never be redone. It must also pick `version < 2`.

**Should Hannan pause the re-review? Yes** — cancel it; the offer brings it back. Running twice would only cost ~30 min of background CPU (BA's unmeasured ~1.5 h per 100 games), so this is tidiness, not a crisis. But without change 3 a finished run leaves his games permanently without `critical`. Keep playing meanwhile.

## 8. Placement and privacy (confirmed)

A section on `#/insights` under the Focus, same filters and "reviewed X of Y"; no new route. Private; the coach sees it via the existing link check and notice. **Nothing on the public `#/profile/<username>`**, opt-in or not.

## 9. Build plan (effort is an agent-assisted estimate, unmeasured)

| # | Slice | Effort |
|---|---|---|
| 0 | Second line, three-way opponent, versions, re-review selector | 0.5–1 day |
| — | Hannan runs the re-review | ~30 min background |
| 1 | Habits profile from the existing `InsightsModel` | ~1.5 days |
| 2 | Rushed critical moves (fills `ClockCard.rushedCritical`, now null) | ~0.5–1 day |
| 3 | Cost by type: forcing vs quiet, feeding the ledger | ~1.5–2 days |
| 4 | Maia-by-phase batch + Phase 4 items | after Phase 4 calibration |

Separately (unestimated): why one account recorded clocks on 0 of 14 games.

**Slice 1 acceptance criteria**
1. Pure `src/insights/profile.ts`: `InsightsModel` → `PlayerProfile`; no new facts or engine work; reused on the server for the coach tab.
2. The five Slice 1 traits only, each with *n*, window, group, 90% interval and state; below 20 games only "n of 20"; each line hidden until its own card gate passes.
3. Conversion/saves use human + Maia games only; Stockfish-level episodes are excluded and counted in a note.
4. Wording is verb-only; a unit test rejects any line matching a banned-word list ("you are a", "attacker", "positional", "tilt", "because", "typical").
5. No profile line has its own Train button. The Focus-matching line says "This is your Focus".
6. Learner / Club / Analyst render as in §2; the closing "not you" line is always present.
7. A coach sees it via the link check; the public profile shows none of it (server test).
8. Thresholds only in `INSIGHTS.minSample`; unit tests for gates/states; one e2e per review style at phone width.

## 10. Hannan's calls (preferences only)

1. **Section name:** *recommend "Your recent games"* over "Your game" — the name itself says "not you".
2. **Learner reassurance line:** *recommend yes* — it saves beginners wasted opening study.
