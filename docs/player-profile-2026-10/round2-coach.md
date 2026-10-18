# Player profile — round 2, coach's chair
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

I agree with most of both papers. Product's point that half the feature is already built is right, and so is
analytics' line that "traits describe, the ledger prescribes". I disagree in two places: how much weight
"plays like ~X" should carry, and one detail of the gates.

## 1. Bot-only players — my "humans only" rule was too blunt

The reason behind the rule still stands: a weak Stockfish level plays moves no human would, so the player's
*opponent-dependent* numbers mean little. A cleaner way to split it is by trait, not by game:

- **Your own errors** (threat-checking, hanging pieces, error rate per phase, clock use, opening approach) belong to
  the player whoever sits opposite. **Pool all opponents**, show the split ("18 vs bots, 4 vs humans"), and let the
  filter separate them.
- **Opponent-dependent traits** (conversion, saves, play when worse, forcing share, aggression): **Maia bots count
  as human-like**, labelled "vs Maia". **Stockfish-level games are kept apart** and shown only under a label
  ("vs Stockfish levels, not comparable"). They never decide a strength, because a Stockfish level that throws a
  piece makes conversion look easy.

So a bot-only player like Hannan sees the full habit profile. The opponent-dependent part is built from his Maia
games, and nothing in it is taken from Stockfish levels.

## 2. Aggression vs Maia, and "plays like ~X"

**Aggression vs Maia** is honest analytics: the baseline is the same positions, and the interval is clustered by
game. As coaching, below ~1800 it changes nothing I would assign. A 1300 who is "more forcing than Maia-1300"
still needs threat-checking first. The one link worth keeping is analytics' **cost by type**: "your forcing moves
cost 2× your quiet ones" is a sentence I can train with, using calculation mode. Aggression vs Maia goes to Later,
Analyst only.

**"Plays like ~X"** as one pooled number duplicates Glicko, and the player will read it as a second rating,
calibrated or not. That is the horoscope-with-error-bars risk. The useful form is the **contrast between phases**
("your endgame moves fit a lower rating than your middlegame moves"), because it points at a drill. I would put
that in Later, after Phase 4, and never pooled.

## 3. Gates — settled

The 20 and 40 were measuring different things, so both stand:
- **Habit traits taken from the ledger** (phase, threats, conversion/saves, clock, openings) keep the Insights
  gates: 20 reviewed games for the section, and the per-card gates already agreed.
- **Style traits** (forcing share, opening breadth, aggression, plays like): **40 games per speed**, with analytics'
  clear / leaning / not-enough states and the flip test. Analytics' Spearman–Brown numbers win here. My 20 was never
  meant for style.

## 4. Placement and staging

I agree with product on all of it: "Your game" sits on `#/insights` under the Focus, it stays private, coaches see
it through the existing link, and the Focus is the only action. Two additions:
- **Learner:** one proven strength, one reassurance where it holds ("your openings are not where you lose points"),
  then the Focus. No style section, even once it exists.
- The end-of-review line ("your usual middlegame slip") is good coaching, but it has to name a habit, never a
  label.

## 5. Final list

| Trait | When | Training link |
| --- | --- | --- |
| Where your games are decided (phase) | **Slice 1** | the phase's target: openings / calculation mode / endgames |
| Checking their threats | **Slice 1** | My mistakes (ignored-threat, hanging, allowed-mate) |
| Finishing won games / saving worse ones (Maia + humans) | **Slice 1** | endgame drills (convert); Maia sparring from a worse position |
| Clock use | **Slice 1**, wherever clocks exist | timed puzzles; advice text (never the Focus) |
| Opening approach + "not the problem" line | **Slice 1** | opening trainer, only if the opening phase leaks |
| Forcing share + cost by type | Later (facts v2, 40 games) | calculation mode |
| Opening breadth | Later (40 games per colour) | opening trainer (narrow a wide repertoire) |
| Plays like ~X, by phase | Later (Phase 4) | the weaker phase's drills |
| Aggression vs Maia, simplification, pressure | Later, Analyst only | none / endgame drills for trading when ahead |
| Archetypes, "positional" from `other`, pooled "plays like" headline, peer labels before calibration, anything on the public profile | **Never** | — |

Slice 1 needs no new data. It is product's phase 1 with these five traits and the bot rule above.
