# Round 2: Farid (FIDE ~2250)
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## Correction first: the F key

I checked every keydown handler in `src/`. `App.tsx` binds `F` to full screen on board pages only, and `focusMode.ts` uses `Escape` to leave it. `PlayPage.tsx` and `ReviewScreen.tsx` bind only ←/→/Home/End (plus Esc in a Review line). **Flip board has no key at all.** So there's no clash today. I was wrong to say there was. The real point is that flip is mouse-only. Bind it to `Shift+F` or `X` rather than taking `F` away from full screen.

## (a) Where I agree

- **Daniel and Rahim on the mistake-to-puzzle loop.** I agree, and I'd use it too. My own repeated errors are worth more than random Lichess puzzles. It reuses Review, Retry and the Glicko puzzle code, so it's cheap.
- **Daniel on bulk import (Lichess username + multi-game PGN).** Without it, the repertoire report and the mistake loop have nothing to work on.
- **Rahim on analysis board + position setup, endgame drills, and themed puzzles.** Endgame drills against Stockfish with tablebase truth are exactly what club players skip.
- **Rahim and Aina on Practice vs Rated in the New game dialog.** Takebacks, threat check and the hanging-piece glow are fine, as long as they're locked out of rated games.
- **Rahim's red threat arrow.** That's a good teaching idea even at my level.

## (b) Where I disagree

- **Aina, the plain-words coach line.** I want it for you, but generated sentences *will* be wrong sometimes. "Your knight was undefended" when the real reason is a mating net teaches the wrong lesson with confidence. Only show a sentence when a rule can actually prove it (hanging piece, missed fork, back rank). Otherwise show nothing rather than guess.
- **Aina, the mascot and the "Great move!" pop.** Fine as an opt-in. But I'd keep it out of Review by default, because a bird saying "Blunder!" is still a label, just a cuter one.
- **Rahim, hiding the engine by default.** For kids, yes. For me it's friction on the screen I open the most. And "I'm in a hurry" logged in a training log feels like being watched.
- **Rahim, the three-tier palette.** I'd go further and add a label-free mode: just eval deltas and NAG symbols.

## (c) Compromises I'd accept

- A **"Review style" setting** with three choices: *Guided* (self-review first, plain words, mascot), *Standard* (today's labels) and *Analyst* (numbers, multi-PV, NAGs, no labels). Default it from the player's rating, and let anyone change it. No logging when someone skips self-review.
- Coach lines only from **provable rules**, each with a "Show engine line" link right underneath.

## (d) Final rankings

**Top 5 features**

1. Free analysis board: variation tree, multi-PV, position setup / FEN, "Continue from here" from Review
2. Lossless PGN round-trip (comments, variations, NAGs, `%eval`, `%cal/%csl`) + bulk/Lichess import
3. Mistake-to-puzzle loop with spaced repetition
4. "Analyse deeper here" button in Review (depth 30+/infinite on one position) + tablebase probe
5. Practice vs Rated mode (takebacks/threat check vs integrity), plus premoves

**Top 3 cosmetics**

1. Numeric eval (+1.34 / #5, with depth) always available, plus a label-free Analyst view
2. A compact move list showing NAG symbols and variations inline, with optional figurine notation
3. Right-drag arrows and circles in modifier colours on every board, exported to PGN, plus a flip-board key
