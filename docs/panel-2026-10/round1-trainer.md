# Round 1 — Coach Rahim (chess trainer)

## 1. First impressions: what's good for teaching, and what's risky

**Strengths.** Maia bots are the best thing here for teaching. A student at 900 needs an opponent who makes 900-level mistakes, not a Stockfish that plays perfectly for 30 moves and then gives away a rook at random. The puzzle database with a Glicko rating is a solid base for tactics work. PGN copy/download and Import mean students can bring me their tournament games. "Style rating" is a nice touch, because it describes how you play instead of just giving you a number.

**Risks.** The Review page as described is a verdict machine. Eval bar, arrows, labels and accuracy all appear before the student has thought about the game for even a minute. Over twelve years I've seen the same thing again and again: students who open the engine first remember the colour of the label ("I blundered on move 23"), not the *idea* ("I didn't check his checks"). "Brilliant" and "Great" labels push kids to hunt for sacrifices instead of playing good moves. Accuracy % and estimated game rating turn every game into a rating exam. Puzzle rating has the same problem: students start protecting the number and skip the hard puzzles. Clocks are fine, but with no takebacks and no hints, play vs bot is good for testing yourself and poor for practising, and those are two different modes.

## 2. Feature ideas

- **Self-review before engine — MUST-HAVE.** On Review, the engine starts hidden. Step 1: the student goes through the game and marks their own critical moments ("I wasn't sure here", "I think this lost") and writes a one-line note per moment. Step 2: unlock the engine, and the screen shows *their* marks next to the engine's. *Why:* comparing your own judgement with the truth is where learning happens. Reading labels doesn't teach that.
- **Mistake-to-puzzle loop — MUST-HAVE.** Every Mistake/Blunder/Miss from your own games becomes a personal puzzle ("find what you missed"), and it comes back on spaced intervals (1 day, 3, 7, 21). *Why:* your own errors are the most relevant material you'll ever get, and spacing is what makes the pattern stick.
- **Practice mode vs bot — MUST-HAVE.** A clear toggle on the New game dialog: *Practice* (takebacks allowed, a "threat check" button that shows what the opponent threatens but not your best move, unrated) vs *Rated* (none of that). *Why:* beginners need safe repetition. Keeping it out of rated games protects the integrity of the rating.
- **Free analysis board with position setup — MUST-HAVE.** *Why:* I can't teach a rook endgame or a typical middlegame plan without setting up the position.
- **Themed puzzle sets + calculation mode — MUST-HAVE.** Filter by motif (fork, pin, back rank, mate-in-2) from the Lichess theme tags. Also add a "blindfold-lite" option where the pieces disappear after 5 seconds and you have to enter the whole line before moving. *Why:* first build one pattern at a time, then train calculation, not just pattern-matching.
- **Opening trainer for a small repertoire — NICE-TO-HAVE.** Drill your own lines with spaced repetition, and show the *plan* in plain words, not just the move order. *Why:* below 1400, understanding the plan beats memorising 15 moves.
- **Endgame drills vs Stockfish — NICE-TO-HAVE.** Key positions (K+P vs K, Lucena, Philidor) you have to win or hold against the engine. *Why:* that's the most reliable improvement for the time spent, and almost nobody practises it.
- **Coach/student link — NICE-TO-HAVE.** A coach can see a student's games and self-review notes, leave comments on a move, and assign a puzzle set as "homework" with a due date. *Why:* that's how I actually run one-to-ones, and today I do it with WhatsApp and screenshots.
- **Weekly training log — NICE-TO-HAVE.** Minutes spent on games, puzzles, review and endgames. *Why:* students who see their mix stop doing 100% blitz.

## 3. Cosmetics that help learning

- **A calmer label palette.** Show only three tiers in colour (good / inaccuracy / mistake-blunder). Make "Brilliant" an occasional quiet badge instead of a fanfare. Fewer kinds of reward means the student focuses on the important ones.
- **Show the threat, not the answer.** Arrows on Review should come in two colours: what the *opponent* threatened (red) and the better move (green), and the student can switch either one on. Most beginner blunders come from missing the threat.
- **Plain-word captions under each label.** For example: "Mistake: this left your knight on f6 undefended." One sentence, no engine lines.
- **Progress framed as habits.** On Profile, put a "reviewed 4 of your last 5 games" ring and a streak for *days trained* at the top, and put the rating chart below them.
- **Hide rating option.** A setting that hides your rating and rating change during and right after games. It helps anxious kids and tilting adults.
- **Coordinates on by default,** with an optional "name the square" mini-drill for kids.

## 4. What I'd push hard for

**Engine hidden until self-review is done**, at least as the default for rated games (with an "I'm in a hurry" skip that gets recorded in the training log). The beginner will say it's slower. The intermediate will say they just want to see their accuracy. The expert will say they already know how to review. My answer: the beginner learns the most from it, the intermediate is the one stuck on a plateau *because* they read the labels and don't think, and the expert can switch it off. A default sets the habit, and the habit is what makes players improve. A pretty eval graph doesn't.
