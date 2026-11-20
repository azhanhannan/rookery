# Accessibility Audit: Rookery

**Standard:** WCAG 2.1 AA (2.5.8 Target Size from 2.2 used as the 24 px floor, as requested) | **Date:** 2026-11-20
**Scope:** live site https://rookery.runcodecloud.com (signed out, Chrome, 1024 px desktop, 375 px and 320 px mobile emulation) plus source in `src/`.
**Method:** code read of `src/index.css`, `Board.tsx`, `SiteHeader.tsx`, `useDetailsMenu.ts`, `NewGameDialog.tsx`, `EndScreen.tsx`, `CoachWarning.tsx`, `KeyboardShortcuts.tsx`, `boardKeys.ts`, `MoveList.tsx`, `ReviewMoveList.tsx`, `PlayerBar.tsx`, `EvalBar.tsx`, `EvalGraph.tsx`, `MoveBadge.tsx`, `labelStyle.ts`, `PlayPage.tsx`, `App.tsx`. Live checks with real key presses (Tab, Space, Enter, arrows, Escape), DOM/computed-style queries and the accessibility tree. Contrast computed with the WCAG relative-luminance formula; translucent highlights alpha-composited onto the square colour.
**Not tested live:** signed-in screens (Account, Games, Coach, synced Insights, rating changes). Those findings come from code only and are marked *(code)*. No screen reader was run; the screen-reader findings come from the accessibility tree and the DOM.

## Summary

**Issues found:** 26 | **Blocker:** 3 | **Major:** 11 | **Minor:** 12

| Severity | Meaning |
|---|---|
| Blocker | A keyboard or screen-reader user cannot do the app's core task (play a move, follow the game) |
| Major | A clear AA failure that makes a common task much harder |
| Minor | An AA edge case, a best-practice gap, or a marginal failure |

What works well: `lang="en"`, a viewport that allows zoom, no horizontal scroll at 320 px on any of the 11 public routes (1.4.10 reflow passes), most page-level `<h1>`s, the transport buttons (⏮ ◀ ▶ ⏭ ⇅ ⛶) all have `aria-label`s, the eval bar is a labelled `role="meter"` with `aria-valuetext`, form fields on the Auth, Import and Analysis pages have labels, review move badges carry `role="img"` and `aria-label`, and piece animation and the win celebration respect `prefers-reduced-motion`.

---

## Findings, ranked

### Blockers

| # | Issue | WCAG | Page | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| B1 | **You cannot play a move with the keyboard.** Squares cannot take focus. Pieces are focusable `div role="button"`s from dnd-kit. Space or Enter picks a piece up ("Draggable item e2 was moved over droppable area e2"), but the arrow keys never move it to another square: after 6× ↑ and Space it dropped back on e2. There is no keyboard path to `onSquareClick`. | 2.1.1 Keyboard | Play, Analysis, Puzzles, Openings, Endgames, Lessons, Review retry | Live test on `#/analysis`: e2 pawn focus → Space → ↑×6 → Space, the pawn stayed on e2. The DnD live region confirms the drag never left e2. | Add a keyboard move layer of your own. Option A: a roving-tabindex 8×8 grid (`role="grid"`, one tab stop, arrows move between squares, Enter/Space calls the existing `onSquareClick` select→target logic). Option B (cheaper): a "Type a move" text field (SAN/UCI) next to the board that calls `onMove`. Then set the dnd-kit pieces to `tabindex=-1` so they stop being 32 dead tab stops. | L (A) / M (B) |
| B2 | **The board has no text alternative.** The 32 piece "buttons" have no accessible name (the SVGs have no `<title>`), and the squares have none either. A screen reader hears "button, draggable" ×32 and cannot tell the position. | 1.1.1, 1.3.1, 4.1.2 | All board pages | The accessibility tree on `#/analysis` shows `button [ref_18]` … `button [ref_49]`, all unnamed. | Give each square or piece an accessible name, e.g. `aria-label="e4, white knight"` (empty squares "e4, empty"), via `squareRenderer`/piece wrappers. Wrap the board in `role="grid"`/`group` with `aria-label="Board, White to move"`. Optionally add a "Describe position" button that reads out the pieces by side. | M |
| B3 | **Moves are never announced.** The bot's reply, the game-ending text ("Black wins by resignation"), check and the move-list update are not live regions. A screen-reader user playing a bot gets no signal that the bot has moved or what it played. Only "Bot is thinking…" is live. | 4.1.3 Status Messages | Play (also Puzzles opponent replies) | `data-testid="status"` div has no `role`/`aria-live`. The live regions present on Play are only the PlayerBar thinking span and the dnd-kit region. | Add one visually-hidden `aria-live="polite"` region on Play that announces each new move in words ("Bot played knight to f6, check"), plus the result on game end. Put `role="status"` on the status box. | S–M |

### Major

| # | Issue | WCAG | Page | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| M1 | **The New game dialog is not modal for keyboard or AT.** Focus stays on the "New game" button behind the overlay when the dialog opens. Tab from "Start" goes to the "Rookery" header link behind it. Escape does nothing. On Cancel, focus drops to `<body>`. There is no `aria-modal`. | 2.4.3 Focus Order, 2.1.2, 4.1.2 | Play | Live: after Enter on New game, `activeElement` = "New game" with `inDialog:false`. After Start + Tab, `activeElement` = `A:Rookery`. After Escape, the dialog is still open. After Cancel, `activeElement` = `BODY`. | Use native `<dialog>` with `showModal()` (gives a focus trap, Escape and inertness for free), or add `aria-modal="true"`, initial focus on the first control, a Tab trap, Escape → `onClose`, and restore focus to the opener. One shared `useModal` hook would also cover M2 and the promotion picker. | S |
| M2 | **The Keyboard-shortcuts sheet and the promotion picker do not trap or restore focus.** The shortcuts sheet does focus Close and closes on Escape, but Tab leaves it and on close focus drops to `<body>`. The promotion picker (`Board.tsx`) moves no focus and has no Escape. | 2.4.3, 2.1.2 | Play, Review, Puzzles; any promotion | Live: Escape closed the sheet, then `activeElement` = `BODY`. Code: `role="dialog"` with no `aria-modal` anywhere in `src/`. | Same shared modal hook as M1. In the promotion picker, focus the Queen button on open and let Escape cancel. | S |
| M3 | **Board highlights fail non-text contrast.** The last-move, selected, legal-move dot and check marks are all below 3:1 against their square (table below). Last-move on a light square is 1.17:1 (light theme) and 1.06:1 (dark theme). The check glow on a dark square in the dark theme is 1.12:1. These states carry game information. | 1.4.11 Non-text Contrast | All board pages | See the Board table. | Add a non-colour cue: an inset 3–4 px ring or corner triangles for last-move/selected, a darker ring around legal-move dots (e.g. `rgba(0,0,0,.5)` with a light halo), and a stronger red ring for check. Or raise the alphas until each mark reaches 3:1 on both square colours. | M |
| M4 | **Board coordinates fail text contrast.** The 13 px file/rank letters use the opposite square colour: 2.38:1 (light) and 3.01:1 (dark). The requirement is 4.5:1. | 1.4.3 | All board pages | `lightSquareNotationStyle: var(--board-dark)` on `--board-light` and the reverse. | Use `--text` on light squares and white on dark squares, or bold 600 with a text-shadow halo. Coordinates are text, so 4.5:1 applies. | S |
| M5 | **The running low-time clock fails in the dark theme.** `!bg-danger !text-white` gives white on `#e0735e` = 3.10:1 for 18 px regular mono text. This is the moment the clock matters most. | 1.4.3 | Play (timed games) | `PlayerBar.tsx` | In the dark theme use `--accent-text`-style dark ink on danger (#0f1312 on #e0735e ≈ 6.2:1), or darken the danger background used for the clock. | S |
| M6 | **Review move badges fail text contrast.** The glyph is white on the label colour at 9 px: Inaccuracy 2.30, Excellent 2.80, Good 3.03, Mistake 3.13, Brilliant 3.28, Best 3.51, Book 3.78, Miss 3.90, Great 4.06. Only Blunder (5.26) passes. | 1.4.3 | Review, Analysis graph, Insights | `labelStyle.ts` | Use dark ink (`#1a1a1a`) on the light badges (Inaccuracy, Excellent, Good, Mistake, Best, Brilliant) and darken the rest, or grow the badge to 11 px bold and darken all fills to ≥4.5:1. The `aria-label` already covers screen readers. | S |
| M7 | **Toggle groups in New game do not expose the selected state.** Opponent, engine, level and Rated/Practice have `aria-pressed`, but the "You play" side (White/Random/Black) and Time control (1+0 … Unlimited) buttons do not, so a screen reader cannot tell which one is chosen. | 4.1.2 Name, Role, Value | Play → New game | Live: `White=null, … Unlimited=null`. | Add `aria-pressed`, or better, make each group a `role="radiogroup"` of `role="radio"` with `aria-checked` (or native radios styled as pills). | S |
| M8 | **No way to skip the header or the board.** There is no skip link, and the board adds 32 tab stops before the side panel. A keyboard user needs about 50 Tabs to reach "New game". | 2.4.1 Bypass Blocks | All board pages | First tab stop is "Rookery". The interactive-tree order puts 32 board buttons before the controls. | Add a "Skip to main content" link and a "Skip to game controls" link. Fixing B1 with a single-stop grid also removes the 32 stops. | S |
| M9 | **Header and footer links fall below the 24 px target minimum on mobile.** Play 25×20, Review 43×20, Puzzles 45×20, the hamburger "More pages" 20×20, Log in 38×20, the More-menu items 120×20, "Sign in" 36×16, the footer links 74×18 and 92×18. | 2.5.8 (24 px), 2.5.5 (44 px advisory) | All pages at 375 px | Live measurement at 375×812. | Give header links `py-3`/`min-h-11` (the bar height is already 56 px, so it costs nothing visually), add `p-2.5` on the hamburger, `py-2` on menu items and inline links. | S |
| M10 | **Play and Puzzles have no `<h1>`, and the document title never changes.** `document.title` is "Rookery" on all 11 routes, so a screen-reader user cannot tell which page they are on from the title or the headings. | 2.4.2 Page Titled, 1.3.1, 2.4.6 | Play, Puzzles (headings); all (title) | Live check of `h1` and `title` per route. | Set `document.title = "<Page> · Rookery"` in the `useHash` effect. Add a visually-hidden `<h1>` ("Play", "Puzzles"). | S |
| M11 | **Graph dots are click-only.** Marked moves on the eval graph are `<circle role="button">` with an `aria-label` but no `tabindex` and no key handler. | 2.1.1, 4.1.2 | Review | `EvalGraph.tsx:49–70` | Add `tabIndex={0}` and an Enter/Space handler, or `aria-hidden` the dots, since the move list offers the same navigation. | S |

### Minor

| # | Issue | WCAG | Page | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| m1 | "Viewing move N of M" is `opacity-80` 12 px text on the accent box: 4.42:1 in the light theme. | 1.4.3 | Play | computed | Drop the opacity, or use full `--accent-text`. | S |
| m2 | `--danger` on `--surface-2` is 4.46 (light) and 4.28 (dark), for example the idle low-time clock (`!text-danger` on `bg-surface-2`). | 1.4.3 | Play | computed | Darken light danger to `#a63c29`, lighten dark danger to `#e8826e`. | S |
| m3 | Focus indicators rely entirely on the UA default (`outline: auto`). There are no `focus-visible` styles in `index.css` or on components, while hover gets a custom `hover:outline-accent`. Chrome's ring is visible, but it is faint on pale board squares and it varies by browser. | 2.4.7 Focus Visible | All | `outline: auto 0.8px` on a focused piece. Grep finds no `focus-visible:` in components. | Add a global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` and a two-tone ring (accent + bg) on board pieces. | S |
| m4 | The "More" menu does not close on Escape, and it keeps the label "More pages" while its visible text becomes the current page ("Analysis ▾"). The accessible name then does not contain the visible label. | 2.1.1 (expected pattern), 2.5.3 Label in Name | All | Live: after Escape, `details.open === true`. Code: `aria-label="More pages"`. | Add an Escape handler to `useDetailsMenu` that closes the menu and focuses the summary. Use `aria-label={\`More pages${moreCurrent ? ', current: ' + moreCurrent.label : ''}\`}` or drop the aria-label and use visible text plus sr-only text. | S |
| m5 | Play's move-list buttons are named only "e4", "Nf6", with no move number or side. The active move has no `aria-current` (Review's list has it). The `<li class="contents">` rows can lose list semantics in Safari. | 1.3.1, 4.1.2 | Play | `MoveList.tsx` | `aria-label="1. White e4"`, `aria-current` on the active move, and `role="listitem"` explicitly. | S |
| m6 | The clocks have no accessible label ("4:59" with no owner). The low-time state is colour-only. | 1.3.1, 1.4.1 | Play | `PlayerBar.tsx` | `aria-label="White clock 4:59"` (do NOT make it live). Add an sr-only "low time" plus an icon or bold weight for the low state. | S |
| m7 | The page arrow-key handler (←/→/Home/End) ignores only INPUT and TEXTAREA, so it also fires while a `<select>` or a dnd-kit piece is focused and steals their arrow keys. | 2.1.1 | Play | `PlayPage.tsx:105` | Reuse `ignoreKey()` from `boardKeys.ts` (it also covers select and contenteditable), and skip when `[aria-roledescription=draggable]` is focused. | S |
| m8 | Single-key shortcuts (X, F, ?, W) cannot be turned off or remapped. | 2.1.4 Character Key Shortcuts | Board pages | `boardKeys.ts`, `App.tsx` | Add a Settings toggle "Single-key shortcuts", or require focus on the board region. | S |
| m9 | A route change moves no focus and announces nothing. After a hash navigation focus stays on the clicked link (or the body). | 2.4.3 (best practice) | All | `App.tsx` | Focus the page `<h1>` (`tabIndex=-1`) on hash change. | S |
| m10 | Motion not gated by reduced-motion: the EvalBar `transition-all duration-300`, the progress bars, the `animate-pulse` on "Bot is thinking…", and the smooth `scrollIntoView` in CoachWarning and Insights. 2.3.3 is AAA, so this is advisory. | 2.3.3 (AAA, advisory) | Play, Review, Insights | grep | Use `motion-safe:` prefixes, and `behavior: prefersReducedMotion() ? 'auto' : 'smooth'`. | S |
| m11 | CoachWarning is an inline `<section>` with a polite status, which is correct. But on a phone it only scrolls into view: focus does not move to "Take it back", and the bot is waiting on the user's choice. EndScreen's result text is not a live region (covered by B3). | 2.4.3 | Play (Practice) | `CoachWarning.tsx` | Move focus to the "Take it back" button when the warning appears (it is the next required action). | S |
| m12 | Secondary buttons (`bg-surface-2` on `bg-surface`/`bg`) have a 1.10–1.32:1 boundary. The text label identifies them, so this passes 1.4.11, but the controls look flat. | 1.4.11 (pass, advisory) | All | computed | Optional 1 px `--muted`/30 % border. | S |

Signed-in screens *(code)*: the Auth, Account (Lichess token), Import, Coach StudentView and OpeningsPage fields are all wrapped in `<label>` or carry `aria-label`. No new label failures were found. The same contrast tokens apply, so M5/M6/m2 carry over. The rating count-up in EndScreen is not live (B3), and the Settings toggles were not checked for `aria-pressed` in depth.

---

## Colour contrast

Tokens from `src/index.css`. The dark theme does not redefine `--last-move`, `--selected`, `--dot` or `--check`, so it uses the light values.

### Text on surfaces (requirement 4.5:1; 3:1 for ≥24 px or ≥18.66 px bold)

| Foreground | on `--bg` | on `--surface` | on `--surface-2` |
|---|---|---|---|
| **Light** `--text` #22201c | 14.42 ✅ | 16.26 ✅ | 13.06 ✅ |
| `--muted` #6b665c | 5.06 ✅ | 5.71 ✅ | 4.58 ✅ (barely) |
| `--accent` #2f6f62 | 5.21 ✅ | 5.88 ✅ | 4.72 ✅ |
| `--danger` #b4432f | 4.92 ✅ | 5.55 ✅ | **4.46 ❌** |
| **Dark** `--text` #ece8df | 14.33 ✅ | 12.56 ✅ | 10.85 ✅ |
| `--muted` #a19c91 | 6.41 ✅ | 5.62 ✅ | 4.85 ✅ |
| `--accent` #5fb3a1 | 7.05 ✅ | 6.18 ✅ | 5.34 ✅ |
| `--danger` #e0735e | 5.66 ✅ | 4.96 ✅ | **4.28 ❌** |

| Pair | Light | Dark | Req | Pass? |
|---|---|---|---|---|
| `--accent-text` on `--accent` (primary buttons, current move) | 5.88 | 7.53 | 4.5 | ✅ |
| `--accent-text` @80 % on `--accent` ("Viewing move…", 12 px) | **4.42** | 5.37 | 4.5 | ❌ light |
| Running clock `--bg` on `--text` | 14.42 | 14.33 | 4.5 | ✅ |
| Low-time running clock: white on `--danger` (18 px) | 5.55 | **3.10** | 4.5 | ❌ dark |
| Low-time idle clock: `--danger` on `--surface-2` | **4.46** | **4.28** | 4.5 | ❌ |
| Eval bar label neutral-800 on neutral-100 (9–10 px) | 13.88 | 13.88 | 4.5 | ✅ (size is tiny) |
| Board coordinates (13 px) | **2.38** | **3.01** | 4.5 | ❌ |
| Move badges white on fill (9 px) | 2.30–5.26 | same | 4.5 | ❌ 9 of 10 |

### Non-text (1.4.11, requirement 3:1)

| Pair | Light | Dark | Pass? |
|---|---|---|---|
| Accent button vs surface | 5.88 | 6.18 | ✅ |
| `--surface-2` button vs `--surface` / `--bg` | 1.25 / 1.10 | 1.16 / 1.32 | n/a (text labels) |
| Board light vs dark square | 2.38 | 3.01 | ⚠ light (squares identified by pattern, acceptable) |

### Board highlights (alpha-composited onto the square)

| Mark | on light square (L / D theme) | on dark square (L / D theme) | Pass 3:1? |
|---|---|---|---|
| Last move `rgba(232,196,76,.55)` | 1.17 / 1.06 | 1.38 / 1.80 | ❌ |
| Selected `rgba(47,111,98,.45)` | 1.84 / 1.73 | 1.33 / 1.12 | ❌ |
| Legal-move dot `rgba(34,32,28,.28)` | 1.77 / 1.72 | 1.55 / 1.42 | ❌ |
| Dot on a last-move square | 1.73 / 1.70 | 1.64 / 1.60 | ❌ |
| Check glow centre `rgba(214,48,32,.85)` | 3.28 / 2.80 | 1.62 / **1.12** | ❌ except light/light |

(The default board theme was used. Textured or alternative themes from `settings/boardTheme.ts` will give different numbers.)

---

## Keyboard navigation

| Element | Tab reachable | Enter/Space | Escape | Arrows | Result |
|---|---|---|---|---|---|
| Header links | ✅ | ✅ | n/a | n/a | OK, no skip link |
| "More" menu (`<details>`) | ✅ | ✅ opens and closes | ❌ stays open | ❌ none | Partial |
| Board pieces | ✅ (32 stops) | picks up a dnd-kit drag | ✅ cancels the drag | ❌ do not move between squares | **Cannot move (B1)** |
| Board squares | ❌ not focusable | — | — | — | **B1** |
| ⏮ ◀ ▶ ⏭ | ✅ | ✅ | — | ←/→/Home/End global | OK |
| Move list | ✅ buttons | ✅ goTo | — | — | OK |
| New game dialog | reached only by tabbing past the page | ✅ | ❌ | — | **No initial focus, no trap, no Escape, focus lost on close (M1)** |
| Shortcuts sheet | ✅ autofocus Close | ✅ | ✅ closes | — | No trap, focus lost on close (M2) |
| Promotion picker | not focused | ✅ | ❌ | — | M2 (and unreachable today because of B1) |
| Resign → Confirm | ✅ autoFocus confirm, blur cancels | ✅ | — | — | OK |
| CoachWarning | inline buttons | ✅ | — | — | Focus not moved (m11) |
| EndScreen | inline link | ✅ | — | — | OK (not a dialog) |
| Eval graph dots | ❌ | ❌ | — | — | M11 |

Focus visible: the Chrome default ring appears on `:focus-visible` (it was confirmed on a focused piece), and the app adds no styles of its own (m3).

## Screen reader (accessibility tree and DOM)

| Element | Announced as | Issue |
|---|---|---|
| Board pieces | "button, draggable" ×32, no name | B2 |
| Board container | nothing | B2 (no group/grid label, no position or turn) |
| ⏮ ◀ ▶ ⏭ (Play) | "First/Previous/Next/Last move" | ✅ |
| ⏮ ⏭ ⇅ ⛶ (Analysis) | "Start", "End of line", "Flip board", "Full screen" | ✅ |
| Eval bar | meter "Evaluation", "+0.3 (White 54%)" | ✅ |
| Status box ("White to move", "Black wins…") | plain text, not live | B3 |
| Bot's move | nothing | B3 |
| "Bot is thinking…" | polite live | ✅ |
| Clocks | "4:59" | m6 (no owner) |
| Play move list | "e4" button | m5 |
| Review move list | badge img "Mistake" + "e4", `aria-current` | ✅ (contrast M6) |
| "More" summary | "More pages" | m4 (does not match the visible current page) |
| Landmarks | `header` > `nav`, `main`, `aside` (Play), `footer` (mobile) | ✅ basic; `aside` is unlabeled, which is fine with only one |
| Headings | h1 on 9 of 11 public routes | M10 (Play, Puzzles) |
| Page title | "Rookery" everywhere | M10 |

## Touch, zoom, motion

- **Touch targets (375 px):** the board squares are 43 px (✅ ≥24, just under 44). The side-panel buttons are 36 px tall (✅ 24, ⚠ 44). The move-list buttons are 24 px tall (✅ borderline). The header, menu and footer links are 16–20 px (❌, M9).
- **Reflow / zoom 200–400 %:** at 320 CSS px (equivalent to 400 % of 1280) none of the 11 public routes scrolls horizontally (`scrollWidth = 320`). The header fits on one line, and the board scales to the column. ✅
- **Reduced motion:** piece animation (`animationMs`) and the win celebration honour `prefers-reduced-motion`. The eval-bar transition, the progress bars, the pulse and the smooth scroll do not (m10, AAA advisory).

## Priority fixes

1. **Keyboard move entry + board labels (B1, B2):** without them the core product is closed to keyboard and screen-reader users. A typed-move field is the fastest unblock. A roving-focus grid is the full fix.
2. **Move/result live region (B3):** a single hidden region on Play, so a screen-reader user can follow the game.
3. **Shared modal hook (M1, M2):** one change fixes focus, Escape and restore for New game, Shortcuts and Promotion.
4. **Contrast tokens (M4, M5, M6, m1, m2) and the highlight rings (M3):** small token or CSS edits.
5. **Skip link, 44 px header targets, page titles and h1s (M8, M9, M10):** quick wins.

*Audit only: no source was edited and nothing was committed.*
