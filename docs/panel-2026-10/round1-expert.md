# Round 1: Farid (FIDE ~2250, OTB + online blitz/bullet)

## 1. First impressions

**What's credible.** Stockfish 19 in the browser is the real thing, not a toy engine. Maia-3 bots are the most interesting part of the app for me. A 2200 Maia that plays human-shaped moves is better training than a sandbagged Stockfish, and I'd use it to test openings before a tournament. Glicko-2 for both play and puzzles is the right call. Arrow keys already step through moves on Play and Review, and `%clk` survives PGN round-trips. Those are good signs.

**What a strong player will find shallow or wrong:**
- **PGN fidelity is lossy.** `src/game/pgn.ts` keeps the mainline SAN and `[%clk]` and nothing else. Comments, variations (RAVs), NAGs (`!?`, `$14`), `[%eval]` and `[%csl]/[%cal]` all get dropped on import. If I paste an annotated game from my database and download it again, my annotations are gone. For me that alone makes it a toy.
- **Review depth tops out at a fixed depth 20** (fast 12 / normal 16 / deep 20), and live eval runs at depth 12 for 400 ms. Depth 20 in a sharp middlegame can flip a "Blunder" label. There's no multi-PV, so I can't see the 2nd and 3rd lines, and I can't tell the engine to "think longer on this one position".
- **Labels without numbers.** "Mistake" doesn't tell me anything. "−1.8 → +0.3, best was 23.Rxe6" does. A strong player wants the eval delta and the engine line before any word label.
- **"Brilliant/Great" is gamification.** The sacrifice heuristic will tag routine recaptures and textbook exchange sacs. Fine for kids, noise for me.
- **"Estimated game rating" from a single game** is statistically meaningless. Show a range, which it already does, and label it honestly as a toy number.

## 2. Feature ideas

- **Free analysis board with infinite analysis, multi-PV 1–5, depth/time display, threads/hash settings.** MUST-HAVE. It's the screen I'd open every day. Review is just a guided pass over this board.
- **Full PGN round-trip: comments, nested variations, NAGs, `%eval`, `%cal/%csl`.** MUST-HAVE. Without it I can't use Rookery alongside ChessBase or Lichess studies.
- **Variation tree in the move list.** Play an alternative move from any position and it branches inline (in brackets) without overwriting the mainline. Promote/delete variation. MUST-HAVE. Analysis without branching is just replaying the game.
- **"Analyse deeper here" button in Review.** Re-run the current position at depth 30+ or infinite and update that move's label. MUST-HAVE. Cheap to build and it fixes the depth problem where it actually matters.
- **Opening explorer from the user's own games, plus Lichess masters/online via their public API.** NICE-TO-HAVE. My repertoire leaks show up in my own games first.
- **Repertoire trainer (spaced repetition on my own lines from a PGN).** NICE-TO-HAVE, but it would make me come back every day.
- **Position setup / FEN paste + "play this position vs Maia 2200".** MUST-HAVE. Training endgames and openings against a human-like bot is the one thing Maia does better than anything else.
- **Premoves + takeback toggle vs bots.** NICE-TO-HAVE. Premoves matter for blitz feel. Takebacks should be off in rated games.
- **Bulk PGN import (multi-game file) + Lichess username import.** NICE-TO-HAVE.
- **Tablebase probe (Syzygy ≤7 via Lichess API) in analysis.** NICE-TO-HAVE. Endgame evals at depth 20 are often wrong.

## 3. Cosmetics / look & feel

- **Eval in numbers, always.** Show `+1.34` / `#5` next to the eval bar, with depth shown small (`d24`). Settings toggle: "Show labels / Show numbers / Both".
- **Move list density.** A compact two-column table (`23. Rxe6 fxe6`), monospace move numbers, and NAG glyphs (`?!`, `??`) instead of coloured icon badges in compact mode. Optional figurine notation (♘f3).
- **Arrows and highlights by right-drag and right-click,** with modifier colours (Shift green / Alt red / Ctrl blue, Lichess-style), exported to PGN as `%cal/%csl`.
- **Engine arrow** in a thin semi-transparent blue. 2nd and 3rd PV lines get fainter arrows when multi-PV is on.
- **Coordinates on the board edge, inside the squares,** in a small font. A toggle for coordinates on all squares, for training.
- **Keyboard everything:** ←/→ step, ↑/↓ start/end or switch variation, `x` best-move toggle, `f` flip (there's a conflict with full-screen on `F`; pick one), `space` play the engine move, `?` shortcut sheet.
- **A plain, low-contrast default theme** (classic green/brown flat) and a clean piece set like cburnett or merida-style open-licence sets. Textures are fine as options, but tournament players want a plain board.

## 4. What I'd push hard for

**A free analysis board with a variation tree and lossless PGN.** The beginner will ask for friendly labels, the intermediate player for achievements, and the trainer for explanations. All of those sit on top of this board. If moves can't branch and annotations can't survive import/export, Review stays something you look at, not something you work with. Then serious players (and the trainer's own lesson prep) will go back to Lichess after one session. Build the tree first and let labels and explanations sit on top of it.
