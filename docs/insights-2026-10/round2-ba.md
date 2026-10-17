# Insights, round 2: Business Analyst reply
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

I changed my mind on two points: the page shape (the coach is right) and my success measure (analytics is right). I'm still holding one point against both: a player who has followed a focus for three weeks must see *something* about it.

## 1. Page shape: one engine, three depths

The three proposals aren't really competing. Analytics' **points-lost ledger** is the right *engine* because it adds up: the parts sum to the points you give away per game, so it ranks leaks honestly. The coach's **Focus of the week** is the right *front*. My "up to three cards" was a hedge between the two, and I'm dropping it.

| Review style | What the page shows |
|---|---|
| Learner (Aina) | One Focus card: one sentence, 2–3 tasks that already exist, nothing else |
| Club (Daniel) | Focus + one "Watch" card (the second-biggest ledger row) |
| Analyst (Farid) | Focus + Watch + "Show the ledger" (phase × motif, with *n* and intervals) |

The Focus is the biggest ledger row that passes the sample gate and has a drill to send you to. A large "other" row never becomes the Focus, because it has nowhere to send you. The player can pin or swap the Focus. This keeps the coach's "one diagnosis, one prescription", and no number reaches Aina that Farid's view couldn't back up.

## 2. Claiming improvement: the main dispute

**Analytics is right about my measure.** "Last 20 vs prior 20" is batch-vs-batch, and the coach's example shows why that's dangerous: 6 of 20 → 2 of 18 has a one-sided Fisher p of about 0.15. That's too thin to support the word "improved".

**But a total ban goes too far.** Analytics' rule exists to stop fishing across 20 metrics. A Focus re-test is different: one hypothesis, declared in advance, about one metric. That is the honest kind of before/after. And a slope that needs 40+ games means Aina, at maybe 10 reviewed games a month, would wait four months for any feedback. She'll have left by then.

**What the player sees (my proposal):**

- **The counts, always, as plain facts with no verdict:** "Since you started this focus: allowed forks in 2 of 18 games (before: 6 of 20)." Counts don't lie. Only the words on top of them can.
- **The word "improved" only when it has been earned:** the rate ratio on contested moves, focus motif only, with a 90% interval that excludes 1. Otherwise the line reads "Too early to tell" or "No clear change yet". This is analytics' rule applied to a single pre-declared test.
- **Analytics' Bayesian slope** for the Analyst-view trend, at 40 or more games, defaulting to "no clear change".

**My benefits measure now** (for Hannan's own judgement, not shown to the player):

1. **Leading:** the share of Focus cards whose tasks get started within 7 days, from the training log. You can read this in weeks. If people don't act on the cards, nothing downstream matters.
2. **Lagging:** the focus motif's rate per 100 contested moves, using analytics' slope rule (40 games or more, 90% interval excludes 0). I withdraw "visibly lower after 4 weeks". It was a batch comparison with a deadline attached.

## 3. Tilt

**I side with analytics:** no tilt *insight* in the MVP. "After a loss you play worse" is a causal-sounding claim from a small, self-selected sample, and it lands hardest on the anxious beginner. The coach's actual *action* ("try a puzzle first") already exists as the loss-streak cushion, which costs nothing and claims nothing. Revisit later as a plain fact, shown only in the Analyst view: "next game after a loss: score X% (n=…) vs Y% overall".

## 4. Sample thresholds: my picks

| Gate | Number | Source |
|---|---|---|
| Insights page unlocks | 10 reviewed games | SA |
| Move-rate figure shown | 30 contested moves | analytics |
| Motif / conversion / episode figure | 8 events | SA, analytics |
| Opening row | 10 games | analytics |
| "Early read" tag | below 3× the gate | analytics |
| Focus can be chosen | 15 reviewed games and its row ≥ 8 events | coach |
| "Improved" / trend wording | 90% interval rule; slope needs 40 games | analytics |

All of these go in `INSIGHTS.*` tunables.

**A problem none of the three raised.** Analytics wants reviews at depth 16 or more only. But Import → "Review all" runs at `REVIEW.depth.fast` (12) (`src/app/ImportPage.tsx:282`), and imports are where most of the volume comes from. Apply that rule today and most reviewed games drop out. Two options:

- (a) Change bulk review to depth 16. At about 1 minute per game, 100 games is roughly 1.5 hours in the background. That's an estimate, not a timing.
- (b) Add an "Upgrade reviews for Insights" button.

I'd take (a). **Before building, count how many saved reviews are at depth 12.**

## 5. Coach visibility

**Yes, with the notice SA proposed.** The coach already sees the games, so Insights adds a view, not new data. And for Rahim this is the single highest-value feature: it's his intake form. I'd add the coach's override of the Focus ("the real problem is calculation"), because a coach-set Focus should beat the automatic one. That's where the human earns his place. I wouldn't add a separate per-link "hide insights" toggle. Unlinking already exists, and a personal app doesn't need a second consent switch. It comes after the MVP, because it needs the coach page to compute facts from the student's records.

## 6. Revised top 5 and the MVP

**Top 5:**

1. Focus of the week, chosen from the ledger, with tasks from existing tools and the re-test counts
2. Points-lost ledger by phase × provable motif (the engine, and the Analyst view)
3. Conversion and saves (human and bot games kept separate)
4. Clock pressure: time-trouble error ratio and rushed critical moves
5. Coach view of insights, with Focus override and "assign as homework"

**MVP:**

- the `captionFact()` split and one `myColor()` helper (SA step 1)
- facts and the ledger computed in the browser over local games, using analytics' sample hygiene and contested-move filter
- the Focus card, plus the Watch card and the ledger expand by Review style
- *n* on every figure, and the gates above
- re-test counts snapshotted when a Focus starts
- the bulk-review depth change

**Out of the MVP:** clock, conversion, coach view, tilt, trend slopes, and comparison with rating bands.
