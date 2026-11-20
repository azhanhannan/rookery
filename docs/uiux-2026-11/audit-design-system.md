# Rookery design-system audit (Nov 2026)

Scope: `src/index.css` and every non-test `.tsx` under `src/app` and `src/components` (81 files), plus the colour
constants they import from `src/config`, `src/review`, `src/puzzles`, `src/game`, `src/settings`. Code reading only; no
browser, no edits. Method: the `design:design-system` audit (tokens, components, patterns), with counts produced by
scanning every `<button>`/button-like `<a>`, every `className` constant and every colour literal.

## Summary

**Components reviewed:** 81 files | **Issues found:** 38 | **Score:** 46/100

There is a *de facto* system and it is mostly coherent in look: cream/green surfaces, `rounded-lg`, `bg-surface-2`
secondary buttons with an accent hover outline, `bg-accent` primaries, `text-sm`. The problem is that it exists only
as copy-paste. The same secondary-button string is defined **26 times in 26 files** (24 `btn` constants plus `coach/ui.ts` `button` and `GameWithComments` `step`), the primary button 11 times, the
panel 6 times, and two files already tried to centralise it independently (`src/app/insights/parts.tsx`,
`src/app/coach/ui.ts`) without anyone else importing them. The colours are tokenised for chrome but not for anything
on the board: about 35 overlay/arrow colours live as `rgba()` literals across 14 files, and the same concept (threat
arrow, best-move arrow, "right" square, white/black side) has 2-5 different values.

Key numbers:

| Measure | Count |
|---|---|
| Button-like elements scanned | 278 (`<button>` + button-styled `<a>`) |
| Distinct class combinations on them | **90** inline + 13 secondary-constant variants + 14 primary variants (≈ 60 after collapsing layout-only classes such as `col-span-2`, `self-start`) |
| Files that define their own `btn` constant | 24 (26 with the `button`/`step` aliases) |
| Selection-chip/pill implementations (`on ? 'bg-accent…' : …`) | 15 |
| Segmented/tab bar implementations | 5 (3 looks, 2 ARIA models) |
| Hardcoded colour literals (hex/rgb/hsl) in `src` | **134**: 70 legitimate data (board themes 50, mascot 16, Google logo 4), **64 drift candidates** |
| Tailwind palette colours bypassing tokens | 31 (`text-white` 10, `bg-neutral-*` 11, `bg-black/40` 3, `bg-black/25` 1, `bg-white` 1, `text-[#…]`/`bg-[#…]` 6) |
| Arbitrary font sizes | 25 (`text-[10px]` 15, `text-[11px]` 4, `text-[9px]` 3, `text-[0.95em]` 2, `text-[min(5vw,1.75rem)]` 1) |
| Inline `style={{}}` | **45** (32 legitimate dynamic, 13 should be classes/tokens) |
| `window.confirm` dialogs | 8 |
| Buttons with a `focus-visible` style | 2 (SquareGrid, EvalGraph); everything else relies on the browser default |

## 1. Inventory of de facto patterns

### 1.1 Buttons

Variants are reported by visual role. File:line examples are where the class string is written.

**Secondary (the workhorse): `rounded-lg bg-surface-2 … font-medium hover:outline-1 hover:outline-accent`.**
Used by ~150 call sites via local constants (`className={btn}` 102×, `{button}` 10×, `{step}` 4×).

| Variant | Copies | Where defined |
|---|---|---|
| `px-3 py-2 text-center text-sm disabled:opacity-40` (canonical) | 16 | `app/AnalysisPage.tsx:27`, `EndgamesPage.tsx:11`, `LessonsPage.tsx:11`, `OpeningsPage.tsx:27`, `PlayPage.tsx:148`, `ReviewScreen.tsx:57`, `insights/parts.tsx:23`, `components/BatchReviewPanel.tsx:3`, `CalcMode.tsx:39`, `CoachWalkthrough.tsx:11`, `MaiaMatchPanel.tsx:8`, `PracticePanel.tsx:19`, `PuzzlePanel.tsx:4`, `ReviewRunPanel.tsx:11`, `SaveRepertoire.tsx:7`, `SelfReviewGate.tsx:8` |
| same, no `text-center` | 4 | `ImportPage.tsx:18`, `PositionEditor.tsx:20`, `LossCushion.tsx:57`, `coach/ui.ts:6` |
| same, no `disabled:` state | 2 | `DrillsPage.tsx:21`, `CoachWarning.tsx:13` |
| small `py-1.5` | 4 | `LichessTokenSection.tsx:5`, `ReReviewOffer.tsx:6`, `WhyPanel.tsx:10` (no disabled), `coach/GameWithComments.tsx:67` (no `font-medium`) |
| inline one-offs | 6+ | `GamesPage.tsx:232` (self-start), `GamesPage.tsx:349` (`px-4`), `KeyboardShortcuts.tsx:56` (`w-full mt-4`), `PuzzlesPage.tsx:143`, `ReviewScreen.tsx:497` (`px-2 py-1 rounded-md`), `VariationMoveList.tsx:148,151` (`px-2 py-1 rounded`) |

**Primary: `rounded-lg bg-accent … font-semibold text-accent-ink`.** 25 constant uses + ~15 inline, **14 distinct
strings**: padding `px-3`/`px-4`, `py-1.5`/`py-2`/`py-3`; disabled `opacity-40` (most), `opacity-50`
(`LossCushion.tsx:70`, `NewGameDialog.tsx:224`), `opacity-60` (`AccountPage.tsx:140`, `AuthPage.tsx:125`), none
(`PlayPage.tsx:208,239`, `CoachWarning.tsx:20`, `PuzzlePanel.tsx:115`); hover `opacity-90` in only 3 of them
(`insights/parts.tsx:24`, `OpeningLibraryPanel.tsx:10`, `OpeningsPage.tsx:29`) — **the main call to action has no hover
state almost everywhere.** Size outliers: `DrillsPage.tsx:155` (`py-3 text-base`), `NewGameDialog.tsx:159`
(`py-1.5`), `EndScreen.tsx:137` (`<a>`, no `py`, `text-center`), `AuthPage.tsx:60` (`<a>` `inline-block px-4`).

**Danger (destructive).** No shared style; four looks:
- filled `bg-danger text-white` — `PlayPage.tsx:248` (Confirm resign)
- text link `text-danger underline` — `OpeningsPage.tsx:448`, `coach/StudentView.tsx:276`
- text link `ml-auto text-xs text-danger underline` — `coach/CoachHome.tsx:87`, `coach/StudentView.tsx:322`
- secondary with `hover:outline-danger` — `VariationMoveList.tsx:156`
- plus 8 `window.confirm` prompts for deletes (e.g. `OpeningsPage.tsx:219`).

**Ghost / quiet (`text-muted hover:text-ink`).** 11 sites, 6 strings: `ReviewPage.tsx:99`, `ReviewScreen.tsx:556`,
`CoachWalkthrough.tsx:69`, `WhyPanel.tsx:71` (bare); `EndgamesPage.tsx:138`, `LessonsPage.tsx:139` (`← back`,
`self-start text-sm`); `NewGameDialog.tsx:221` and `ImportPage.tsx:228` (`px-4 py-2 rounded-lg`, Cancel);
`LossCushion.tsx:64`, `Board.tsx:302` (`w-full mt-2`), `ReviewMoveDetails.tsx:47`/`OpeningsDue.tsx:71` (`text-xs underline`).

**Text link buttons (`text-accent` + underline).** 50+ sites in two families that disagree on default state:
always-underlined `text-accent underline` (7, e.g. `OpeningsPage.tsx:439,443`, `PuzzlesPage.tsx:205`) vs
`text-accent hover:underline` (23 + 15 variants with `text-xs`/`text-sm`/`font-semibold`/`shrink-0`). Three of them
also carry button padding (`BotPicker.tsx:71`, `NewGameDialog.tsx:165`, `PlaySettingsSection.tsx:79`:
`px-3 py-1.5 rounded-lg text-accent underline`) — a fourth "link-styled button" look.

**Icon-only buttons.** Unicode glyphs inside secondary buttons: ⏮ ◀ ▶ ⏭ ⇅ (move nav, 4 pages), ✕ close (5 sites:
`CoachWalkthrough.tsx:70`, `LossCushion.tsx:65`, `PositionEditor.tsx:106`, `TimedPuzzles.tsx:187`, …), ⛶/⤡ full screen
(`BoardColumn.tsx:56`), `?` shortcuts (`KeyboardShortcuts.tsx`). They inherit whatever `btn` the page passes in, so
the same ✕ is a 40 px secondary on one page and a bare glyph on another.

**Selectable tile buttons** (`bg-surface … hover:outline-1 hover:outline-accent p-3 rounded-lg text-left`):
`EndgamesPage.tsx:64`, `LessonsPage.tsx:77`, `OpeningLibraryPanel.tsx:78` (surface-2, `rounded`), and as links
`GamesPage.tsx:111` (`p-2.5`), `ReviewPage.tsx:35`, `coach/HomeworkCard.tsx:8`, `coach/CoachHome.tsx:143`,
`OpeningsDue.tsx:57`. Eight list-row/tile looks for "a clickable item in a list".

**Move cells** (SAN buttons in move lists), 8 implementations: `MoveList.tsx:29`, `ReviewMoveList.tsx:38`,
`ReviewStyleParts.tsx:116,171`, `VariationMoveList.tsx:65`, `SelfReviewGate.tsx:69`, `ReviewScreen.tsx:530`,
`coach/GameWithComments.tsx:96`. Padding ranges `px-1`…`px-2`, `py-px`…`py-0.5`, `text-xs`/`text-sm`; active state is
expressed differently in each.

### 1.2 Selection chips, toggles, segmented controls

**Selection chips** — "one of N" or "on/off" pills, `on ? 'bg-accent text-accent-ink' : <off>`, 15 implementations
with 7 different *off* states:

| Site | Shape | Off state |
|---|---|---|
| `DrillsPage.tsx:22` chip, `PlaySettingsSection.tsx:13` chip, `ReviewStyleParts.tsx:207` choice, `NewGameDialog.tsx:92` pill, `BotPicker.tsx:44` | `rounded-lg px-3 py-1.5/2 text-sm` | `bg-surface-2 hover:outline` |
| `BotPicker.tsx:5` pill | `rounded-lg px-1 py-2 tabular-nums` | same |
| `ExplorerPanel.tsx:5` chip | `rounded-md px-2 py-0.5 text-xs` | same |
| `ReviewMoveDetails.tsx:16` toggle | `rounded-md px-2 py-0.5 text-xs` | `bg-surface-2 text-muted hover:text-ink` |
| `ReviewRunPanel.tsx:57` | `rounded-lg px-3 py-2` | (inline) |
| `GamesPage.tsx:88` filters | `rounded-full px-3 py-1` | `bg-surface hover:outline` |
| `AnalysisPage.tsx:256` Stockfish | `rounded-full px-3 py-1 font-semibold` | `bg-surface-2`, no hover |
| `AnalysisPage.tsx:312` NAGs | `rounded px-2 py-0.5 font-mono` | `bg-surface-2`, no hover |
| `ImportPage.tsx:217` side radio | `rounded-lg px-3 py-1` | `bg-surface-2 hover:bg-surface`; **on = `bg-accent text-white`** (wrong ink in dark mode, ≈2.5:1) |
| `BoardThemePicker.tsx:13` option | `rounded-lg p-1.5` | on = `bg-accent/15 outline-2` (a different on-state) |
| `RatingHistoryChart.tsx:78` | `rounded-lg px-2.5 py-1 text-xs` | on = outline, off = muted |

ARIA is also split: most use `aria-pressed`, `ImportPage.tsx:212` uses `role="radio"`, `BotPicker` mixes both models
in one component.

**Toggles (boolean settings)** — three mechanisms for the same job:
1. Native checkbox in a label (11): `ReviewStyleParts.tsx:244,248,255,259`, `PlaySettingsSection.tsx:38`,
   `PositionEditor.tsx:52`, `CalcMode.tsx:170` (wrapped as a surface pill), `InsightsPage.tsx:278`,
   `OpeningsReport.tsx:111`, `ReviewScreen.tsx:594`, `coach/GameWithComments.tsx:147`. Styling of the box varies
   (`accent-[var(--accent)]` in one place only).
2. A secondary button whose label flips ("Sound on"/"Sound off" `PlayPage.tsx:263` — no `aria-pressed`; "Eval bar
   on/off" `PlayPage.tsx:267`; "Stockfish on/off" `AnalysisPage.tsx:256`). A label that states the current value
   reads ambiguously as an action.
3. The chip in `ReviewMoveDetails.tsx:118,121` — **the same `threatArrow`/`betterArrow` prefs that
   `ReviewStyleParts.tsx:244,248` show as checkboxes.** One setting, two controls.

**Segmented controls / tabs** — 5 implementations:

| Site | Look | ARIA |
|---|---|---|
| `PuzzleModeBar.tsx:15` | `bg-surface p-1` track, active `bg-accent` | `tablist`/`tab` |
| `ReviewStyleParts.tsx:71` StyleSwitch | same track, active `bg-accent` | `group` + `aria-pressed` |
| `OpeningsPage.tsx:224` | same track, active `bg-surface-2 font-semibold` | `tablist` |
| `GamesPage.tsx:430` | underline tabs, `border-b-2 border-accent` | `tablist` |
| `coach/StudentView.tsx:55` | links, active `bg-surface-2 font-semibold` | none |

### 1.3 Cards, panels, containers

| Pattern | Classes | Uses |
|---|---|---|
| Side panel | `flex flex-col gap-2 rounded-lg bg-surface p-3` (constant `panel` in 6 files) | 21 literal + 31 via constant; variants add `text-sm` (7), `gap-1` (3), `gap-3` (2), no flex (14) |
| Settings / page card | `rounded-2xl bg-surface p-5` (constant `card` in `AccountPage.tsx:14`, `LichessTokenSection.tsx:4`, `PlaySettingsSection.tsx:12`, `coach/ui.ts:5`) | 18 |
| Dialog sheet | `rounded-2xl bg-surface p-5 shadow-xl` / `shadow-2xl` | `NewGameDialog.tsx:118`, `KeyboardShortcuts.tsx:42` |
| Popover menu | `absolute right-0 z-30 mt-2 min-w-[9rem] rounded-lg bg-surface p-3 shadow-lg ring-1 ring-surface-2` | duplicated verbatim in `SiteHeader.tsx:55` and `AccountNav.tsx:83` |
| Context menu | `fixed z-50 rounded-lg border border-surface-2 bg-surface py-1 shadow-xl` | `VariationMoveList.tsx:164` |
| Chart tooltip | `rounded bg-surface px-2 py-1 text-xs shadow` | duplicated in `EvalGraph.tsx:24`, `RatingHistoryChart.tsx:21` |
| Outlined row | `rounded-lg border border-surface-2 px-3 py-2` | `ReReviewOffer.tsx:27` (only bordered panel in the app) |
| Scroll list | `max-h-64 lg:max-h-[20rem] overflow-y-auto rounded-lg bg-surface p-2` | 3 |

Two container radii are in use for in-flow content (`rounded-lg` side panels, `rounded-2xl` cards on Account/Coach)
with no rule for which is which. This is the main reason pages "feel" different from each other.

### 1.4 Headings and type scale

`text-sm` 450, `text-xs` 212, `text-xl` 21, `text-lg` 9, `text-base` 8, `text-2xl` 4, `text-3xl` 2, `text-4xl` 1,
plus 25 arbitrary sizes (`text-[10px]` ×15, `[11px]` ×4, `[9px]` ×3).

| Level | Variants found |
|---|---|
| h1 page title | `text-xl font-bold` (16, incl. `truncate`, `mb-2`), `text-xl font-semibold` (4: `AboutPage`, `ImportPage.tsx:167`, …), `text-lg font-bold` (2), `text-lg font-semibold` (1), bare `font-semibold` (1). **5 variants, bold vs semibold split.** |
| h2 section | `font-semibold` with `mb-1`/`mb-2`/`mb-3`/`mt-5 mb-1` (≈30), `text-sm font-semibold` (3), `text-lg font-semibold` (dialog), eyebrow `text-xs font-semibold uppercase tracking-wide text-muted` (2), one h2 styled as a panel (`rounded-lg bg-surface p-3 text-center`) |
| h3 sub-section | `text-sm font-medium` with 4 margin variants, `font-semibold` (4) |

Weights: `font-semibold` 191, `font-medium` 86, `font-bold` 35, `font-mono` 75. No page header component; title +
action link rows are rebuilt per page (e.g. `GamesPage.tsx:424` "My games" + "Play →").

### 1.5 Spacing and layout

Spacing is on the Tailwind scale (good, no `[13px]` paddings). Dominant: `gap-2` (200), `p-3` (81), `px-3 py-2`
(button), `px-4 py-6` (page). Drift is in *which* step is used for the same role (button `py-1.5` vs `py-2`, panel
`gap-1`/`gap-2`/`gap-3`, heading margins `mb-1`…`mb-4`).

Page shells, each hand-written:
- Board pages: `board-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[auto_minmax(18rem,1fr)]` —
  **identical string in 9 files** (`AnalysisPage.tsx:126`, `EndgamesPage.tsx:114`, `LessonsPage.tsx:222`,
  `OpeningsPage.tsx:146`, `PlayPage.tsx:162`, `PuzzlesPage.tsx:166`, `ReviewScreen.tsx:336`, `SelfReviewGate.tsx:59`,
  `TimedPuzzles.tsx:144`) plus 2 with a `minmax(0,36rem)` first column (`DrillsPage.tsx:100`, `HomeworkSolver.tsx:122`).
- Content pages: `mx-auto flex max-w-{xl|2xl|3xl|4xl|6xl} flex-col gap-{3|4} px-4 py-6` — 11 variants across 7 widths.

### 1.6 Radii, elevation, z-index

`rounded-lg` 202, `rounded` 74, `rounded-full` 22, `rounded-2xl` 10, `rounded-md` 8, `rounded-xl` 1
(`Board.tsx:282` promotion picker), `rounded-sm` 1. Shadows: `shadow` 4, `shadow-lg` 2, `shadow-xl` 3, `shadow-2xl` 1 —
four elevations for three floating surfaces. Z-index: `z-10`, `z-20` (NewGameDialog), `z-30` (menus), `z-50`
(KeyboardShortcuts, context menu) — the New game dialog sits *below* the header menus.

### 1.7 Colours

Tokens defined (`index.css`): `bg`, `surface`, `surface-2`, `text`(→`ink`), `muted`, `accent`, `accent-text`
(→`accent-ink`), `danger`, `board-light`, `board-dark`, and `last-move`, `selected`, `dot`, `check` (these four are not
mapped into `@theme` and are **not redefined for dark mode**). No success, warning, info, focus, scrim or elevation
tokens.

Hardcoded colours bypassing tokens (64 drift candidates):

| Concept | Values in use | Files |
|---|---|---|
| Best/good-move arrow, "right" | `rgba(79,154,44,.85)`, `rgba(21,120,27,.8/.85)`, `rgba(76,175,80,.55/.6/.75)`, `#4f9a2c` | `ReviewScreen.tsx:53`, `AnalysisPage.tsx:24`, `OpeningsPage.tsx:31,108`, `tunables.ts:449,455`, `DrillsPage.tsx:18`, `TimedPuzzles.tsx:15`, `puzzleStore.ts:30`, `boardMarks.ts:8`, `variationTree.ts:264`, `ReviewMoveDetails.tsx:122` |
| Threat / wrong / bad | `rgba(199,54,43,.5/.85)`, `rgba(214,48,32,.5/.7/.85)`, `rgba(230,70,40,.75)`, `rgba(136,32,32,.8)`, `#c7362b` | `ReviewScreen.tsx:54`, `HomeworkSolver.tsx:70`, `DrillsPage.tsx:19`, `TimedPuzzles.tsx:16`, `puzzleStore.ts:31`, `tunables.ts:185,189,451`, `boardMarks.ts:9`, `variationTree.ts:265`, `ReviewMoveDetails.tsx:119` |
| Hint / selection / blue | `rgba(66,135,245,.5/.55)`, `rgba(40,140,220,.9)`, `rgba(52,120,200,.5/.32)`, `rgba(20,85,180,.5)`, `rgba(0,48,136,.8)` | `CalcMode.tsx:13`, `puzzleStore.ts:33`, `tunables.ts:191,341`, `AnalysisPage.tsx:24`, `boardMarks.ts:10`, `variationTree.ts:267` |
| Highlight / yellow | `rgba(255,196,0,.55)`, `rgba(255,213,79,.45)`, `rgba(230,143,0,.8)` vs `rgba(230,160,0,.8)` (**the same "yellow mark" differs between `boardMarks.ts:11` and `variationTree.ts:266`**) | |
| White / black side | `bg-neutral-100`/`bg-neutral-800` (`GamesPage.tsx:129`, `ReviewScreen.tsx:75`, `ReviewSummary.tsx:69`, `EvalBar.tsx:40-48`), `bg-white`/`bg-neutral-900` (`PlayerBar.tsx:44`), `#ecebe8`/`#262421` (`EvalGraph.tsx:7-10`), `#f2f2f2`/`#2b2b2b`/`#9a9a9a` (`ExplorerPanel.tsx:28-30`), `#111` piece glyph (`MiniBoard.tsx:36`) | 7 |
| Move-quality tiers | `#4f9a2c`, `#d9a21b`, `#c7362b` (`reviewStyle.ts:64-66`) + 10 label colours (`labelStyle.ts:8-17`) | intentional data palette; should be tokens |
| Rating lines | `#d0892b`, `#5b80c8`, `#a45fa0` (`RatingHistoryChart.tsx:8-11`) | `#a45fa0` is a mauve that drifts toward the purple the owner avoids |
| On-colour ink | `text-white` on `bg-danger` (`GamesPage.tsx:44`, `PlayPage.tsx:249`, `PuzzlePanel.tsx:53`, `TablebasePanel.tsx:7`, `insights/parts.tsx:27`, `PlayerBar.tsx:63`): dark-mode danger `#e0735e` on white ≈ **3.6:1**, below AA for text-sm. `text-white` on `bg-accent` (`ImportPage.tsx:217`): dark ≈ **2.5:1**. |
| Scrims | `bg-black/40` (3), `bg-black/25` (1) | |
| Celebration | `hsl(${hue} 70% 55%)` particles (`EndScreen.tsx:122`) | legit (decorative, random hue) |

### 1.8 Icons

No icon set. Inline SVG only in `SiteHeader.tsx` (menu bars), `AccountNav.tsx`, `GoogleButton.tsx`,
`RookMascot.tsx`. Everything else is Unicode: → ×12, ← ×9, ▶ ×8, ✓ ×8, ◀ ×6, ✕ ×5, ⏮/⏭ ×4, ⇅ ×3, ▾ ×3, ● ×3, ↑ ×2,
💬 ×2, ✔ ×1 (beside ✓ elsewhere), ⭐ + 🎉 (`DrillsPage.tsx:127,138`), ⛶/⤡ (`BoardColumn.tsx:56`), ↶, ∞, −. Glyph
rendering of ⏮ ⏭ ⛶ varies a lot by OS font (on Windows some fall back to emoji presentation). Emoji in a header-like
line (🎉 in Drills) brushes against the owner's "no emoji headers" rule.

### 1.9 Dialogs and overlays

Two modal implementations (`NewGameDialog.tsx:114`, `KeyboardShortcuts.tsx:37`), same structure written twice,
with different z-index (20 vs 50) and shadow (2xl vs xl). Neither sets `aria-modal` or traps focus; only
`KeyboardShortcuts` closes on Escape. The promotion picker (`Board.tsx:281`) is a third overlay with its own scrim and
`rounded-xl`. Destructive confirms use `window.confirm` (8) except resign, which uses an inline two-step button.

### 1.10 Loading and empty states

- Loading: text only. `p-6 text-center text-sm text-muted` "Loading X…" ×20 (10 in `App.tsx` Suspense fallbacks,
  others in Coach, Profile, Puzzles, Review); `text-sm text-muted` / `text-xs text-muted` "Loading…" in panels; no
  skeleton; one `animate-` class in the codebase. Board pages jump from a centred line of text to a full board.
- Empty: ~25 `<p className="text-sm text-muted">No … yet.</p>` sentences (e.g. `GamesPage.tsx:277,337` duplicated,
  `MoveList.tsx:45`, `ExplorerPanel.tsx:136`), two richer ones with a bold title + body + action
  (`PuzzlesPage.tsx:214,222`), one styled as a panel (`ProfilePage.tsx:69`), one not muted (`OpeningsPage.tsx:738`).
  Good copy, no shared shape, and few of them offer the next action.
- Progress bars: 10 hand-built single bars (`h-full bg-accent` + inline width) and 3 win/draw/loss stacked bars
  (`GamesPage.tsx:69-71`, `OpeningsReport.tsx:33-35`, `ExplorerPanel.tsx:22-30` with its own hex colours).

## 2. Inline `style={{}}` usages (45)

**Legitimate dynamic values (32) — keep, but route through primitives where noted.**

| Site | Value | Note |
|---|---|---|
| `DrillsPage.tsx:124`, `ImportPage.tsx:277`, `LessonsPage.tsx:69,148`, `OpeningsPage.tsx:794`, `CalcMode.tsx:183`, `BatchReviewPanel.tsx:35`, `MaiaMatchPanel.tsx:32`, `NewGameDialog.tsx:150`, `ReviewRunPanel.tsx:46` | progress `width: %` | → `<ProgressBar value>` (one inline style inside it) |
| `GamesPage.tsx:69-71`, `OpeningsReport.tsx:33-35`, `ExplorerPanel.tsx:22` | W/D/L segment `width: %` | → `<OutcomeBar>` |
| `EvalBar.tsx:43` | `--white-share` CSS var | good pattern already |
| `BoardThemePicker.tsx:21,29-32` | theme image / swatch colours from data | data-driven |
| `MoveBadge.tsx:14`, `ReviewStyleParts.tsx:39,57,182`, `coach/GameWithComments.tsx:103`, `RatingHistoryChart.tsx:84` | label/tier/series colour from data | → `--tier-*` vars or `data-tier` attribute |
| `MiniBoard.tsx:23,31` | `size`, square colours, font size from size | dynamic |
| `SquareGrid.tsx:38,53`, `PositionEditor.tsx:75` | board CSS vars + per-square styles | dynamic, already var-based |
| `Board.tsx:255` | react-chessboard square renderer spreads square styles | required by the library API |
| `pieceRender.tsx:18` | svg sizing for react-chessboard | required by the library API |
| `VariationMoveList.tsx:165` | context-menu `left/top` from pointer | dynamic |
| `EndScreen.tsx:120` | particle hue/offset/animation | dynamic (but the `@keyframes` is injected via a `<style>` tag at `EndScreen.tsx:115`; move it to `index.css`) |

**Should be classes or tokens (13).**

| Site | Now | Replace with |
|---|---|---|
| `Board.tsx:260` | `position:absolute; top:2%; right:2%; zIndex:5; pointerEvents:none` | `absolute top-[2%] right-[2%] z-[5] pointer-events-none` |
| `EvalGraph.tsx:64,90` | `cursor:'pointer'` (2) | `cursor-pointer` |
| `EvalGraph.tsx:77` | `backgroundColor: FLOOR` (`#262421`) | `bg-side-black` token |
| `MiniBoard.tsx:36` | `color:'#111'` | `text-side-black` token (or piece-ink token) |
| `ReviewMoveDetails.tsx:119,122` | `color: '#c7362b'` / `'#4f9a2c'` | `text-tier-bad` / `text-tier-good` |
| `RatingHistoryChart.tsx:84` | `opacity: hidden ? 0.35 : 1` | `opacity-35` class toggle (colour stays dynamic) |
| `ReviewStyleParts.tsx:182`, `GameWithComments.tsx:103` | colour only when not active | `data-tier` + CSS, removes the ternary |
| `PositionEditor.tsx:75` | `var(--board-dark/light)` chosen in JS | `bg-board-dark`/`bg-board-light` once mapped in `@theme` |
| `EndScreen.tsx:115` | `<style>` keyframes in JSX | `@keyframes` in `index.css` |

(Count excludes the 12 `style={style}` *props*, which pass the Review style name, not CSS.)

## 3. Duplicated UI that should be a shared primitive

| Duplication | Copies | Primitive |
|---|---|---|
| Secondary/primary button strings | 26 + 11 constants, ~40 inline | `Button` |
| ✕ close, ⇅ flip, ⛶ full screen, ? shortcuts | 5 + 4 + 5 + 3 | `IconButton` |
| Move navigation row ⏮ ◀ ▶ ⏭ (+ ⇅, full screen, ?) | `AnalysisPage.tsx:162`, `PlayPage.tsx:231`, `ReviewScreen.tsx:368`, `coach/GameWithComments.tsx:78` (grid-cols 4/6/7, different labels "Start"/"First move", titles only on Play) | `MoveNav` |
| On/off chip `on ? accent : surface-2` | 15 | `Chip` (toggle) / `ChipGroup` (single-select) |
| Segmented / tabs | 5 | `SegmentedControl`, `Tabs` |
| Boolean setting (checkbox vs flipping button vs chip) | 3 mechanisms, 1 duplicated pref | `Switch` |
| Side panel / settings card | 52 / 18 | `Panel` |
| Page shell (board pages, content pages) | 11 / 11 | `BoardPage`, `PageShell` + `PageHeader` |
| Modal scaffold | 2 (+ promotion) | `Dialog` |
| Header popover menu | 2 verbatim | `Menu` (or `Popover`) |
| Chart tooltip | 2 verbatim | `ChartTooltip` |
| Progress bar | 10 | `ProgressBar` |
| W/D/L bar | 3 | `OutcomeBar` |
| Side colour dot | 4 (3 colour pairs) | `SideDot` |
| Count badge (`rounded-full bg-accent px-1.5 text-xs`) | `AccountNav.tsx:50`, `OpeningsDue.tsx:91`, `LessonsPage.tsx:85`, `PuzzleModeBar` | `CountBadge` (fold into `Tag`) |
| Move-quality badge | `MoveBadge.tsx:13` ≈ `ReviewStyleParts.tsx:38` | keep one `MoveBadge` |
| Move cell (SAN button) | 8 | `MoveCell` |
| Clickable list tile | 8 | `ListTile` (button or link) |
| Loading line / empty sentence | 20 / 25 | `Loading`, `EmptyState` |
| Text-link button | 50+ | `Button variant="link"` |
| Two "shared ui" files nobody shares | `insights/parts.tsx:22-24`, `coach/ui.ts:5-7` | absorbed into `src/ui/` |

## 4. Proposed minimal primitive set

All in a new `src/ui/` folder, styled only with tokens. Each component also exports its class builder
(`buttonClass({variant,size})`) so places that must pass a `className` string (e.g. `FullscreenButton`,
`KeyboardShortcuts`, `SparButton`, which take `className` from the page) keep working without wrapping.

| Primitive | Props | Replaces |
|---|---|---|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'link'`; `size: 'sm' (py-1.5) \| 'md' (py-2, default) \| 'lg' (py-3 text-base)`; `block?`; `as?: 'a'` with `href`; native button props | all §1.1 strings; 26 `btn` + 11 `primary` constants; `coach/ui.ts`, `insights/parts.tsx` exports. States built in: hover (secondary outline, primary darken via `--accent-hover`), `focus-visible` ring, `disabled:opacity-40` (one value), `aria-busy` loading. `danger` = outline/text by default, `danger` + `solid` for the final confirm. |
| `IconButton` | `label` (required, becomes `aria-label` + `title`), `icon`, `variant: 'secondary' \| 'ghost'`, `size` | ✕ ×5, ⇅, ⛶, ?, ▾ disclosure |
| `Icon` | `name` from a small inline-SVG set (first, prev, next, last, flip, fullscreen, close, check, chevron, arrow-right/left, comment) | Unicode glyphs in controls (keep chess piece glyphs and NAG text) |
| `MoveNav` | `onFirst/onPrev/onNext/onLast`, `atStart`, `atEnd`, `extra?: ReactNode` (flip, full screen, shortcuts), `labels` fixed + key hints in `title` | the 4 nav rows |
| `Panel` | `as?: 'section' \| 'div'`, `title?`, `titleId?`, `actions?`, `padding: 'md' (p-3, side panels) \| 'lg' (p-5, settings)`, `gap?` | `panel` (52) and `card` (18) |
| `PageShell` + `PageHeader` | `width: 'narrow' (xl) \| 'default' (3xl) \| 'wide' (6xl)`; header: `title`, `subtitle?`, `back?`, `actions?` | 11 content-page wrappers, 5 h1 variants, the "Title + Play →" rows |
| `BoardPage` | `board`, `side`, `variant: 'auto' \| 'fixed'` (the 36rem column) | the 11 `board-layout` strings |
| `Chip` / `ChipGroup` | `Chip`: `pressed`, `size: 'sm' \| 'md'`. `ChipGroup`: `value`, `options`, `onChange`, `label`, `multiple?` (renders `aria-pressed` or radiogroup consistently) | 15 chip/pill implementations |
| `SegmentedControl` | `value`, `options`, `onChange`, `label`, `semantics: 'tabs' \| 'choice'` | `PuzzleModeBar`, `StyleSwitch`, Openings views, Student tabs |
| `Tabs` (underline) | same API | `GamesPage.tsx:430` (or fold into SegmentedControl and drop the underline look) |
| `Switch` | `checked`, `onChange`, `label`, `hint?` | the 11 checkboxes and the 3 flipping on/off buttons; one control for threat/better arrows |
| `Dialog` | `open`, `onClose`, `title`, `size: 'sm' \| 'md'`, `footer?`; Escape, scrim click, focus trap, `aria-modal`, `--z-dialog` | `NewGameDialog`, `KeyboardShortcuts`; later a `ConfirmDialog` to retire `window.confirm` (8) |
| `Menu` | `trigger`, `items` | header More menu and account menu |
| `ProgressBar` / `OutcomeBar` | `value`, `max`, `label`; `won/drawn/lost` | 10 + 3 bars |
| `Tag` (incl. count badge) | `tone: 'muted' \| 'accent' \| 'success' \| 'warning' \| 'danger'`, `shape: 'pill' \| 'square'` | `insights/parts.tsx` Tag, 4 count badges, `GamesPage`/`TablebasePanel` result tags |
| `SideDot` | `color: 'w' \| 'b'`, `size` | 4 dots |
| `MoveCell` | `san`, `active`, `tier?`, `onClick` | 8 move-list buttons (keep each list's layout) |
| `ListTile` | `href?` / `onClick?`, `leading?`, `title`, `meta?`, `trailing?` | 8 clickable tiles/rows |
| `Loading` / `Skeleton` | `Loading label`; `Skeleton shape: 'board' \| 'panel' \| 'line'` | 20 loading lines; board-page Suspense fallbacks get a board-shaped skeleton |
| `EmptyState` | `title`, `body?`, `action?` | ~25 empty sentences (keep the copy) |

Owner taste rules applied: no accent stripe on `Panel` (separation by `surface` vs `bg` and spacing, which is what the
app already does); `PageHeader` is plain text, no gradient, no emoji; `ListTile` and `Panel` are deliberately two
different shapes so lists do not become a uniform card grid; accent stays green, no purple/indigo added (and the
classical rating line should move from mauve `#a45fa0` to a warm or slate hue).

### Migration order (built for parallel agents on disjoint files)

**Phase 0 — one agent, must land first (everything else imports it):**
1. `src/index.css` — new tokens (§5) + `@theme` mapping + `@keyframes` moved from `EndScreen`.
2. `src/ui/tokens.ts` — board overlay colours read from CSS vars (or plain constants in one file) for react-chessboard
   options that need strings: arrows, square tints, marks. `boardMarks.ts`, `variationTree.ts`, `tunables.ts`
   colour entries and `reviewStyle.ts`/`labelStyle.ts` re-export from here.
3. `src/ui/Button.tsx` (+ `buttonClass`), `IconButton.tsx`, `Icon.tsx`, `Panel.tsx`, `PageShell.tsx`
   (`PageShell`, `PageHeader`, `BoardPage`), `Chip.tsx`, `SegmentedControl.tsx`, `Switch.tsx`, `Dialog.tsx`,
   `ProgressBar.tsx` (+ `OutcomeBar`), `Tag.tsx`, `SideDot.tsx`, `MoveCell.tsx`, `ListTile.tsx`, `states.tsx`
   (`Loading`, `Skeleton`, `EmptyState`), `MoveNav.tsx`, `index.ts`.
4. Convert the cross-cutting components that several pages consume so lanes never touch them:
   `BoardColumn.tsx` (FullscreenButton), `KeyboardShortcuts.tsx`, `SparButton.tsx`, `SiteHeader.tsx` + `AccountNav.tsx`
   (Menu), `App.tsx` (Suspense fallbacks), `MoveBadge.tsx`, and turn `insights/parts.tsx:22-24` and `coach/ui.ts:5-7`
   into re-exports of `src/ui` so their importers compile unchanged.
5. Add a lint guard (oxlint `no-restricted-syntax` or a vitest scan) that fails on new `const btn =` strings,
   `rgba(`/`#hex` in `src/app`/`src/components`, and `text-white`; this stops drift returning in later waves.

**Phase 1 — five lanes in parallel, each owns its files exclusively:**

| Lane | Files |
|---|---|
| A Play | `PlayPage`, `NewGameDialog`, `BotPicker`, `PracticePanel`, `CoachWarning`, `LossCushion`, `MaiaMatchPanel`, `PlayerBar`, `EndScreen`, `MoveList`, `EvalBar`, `Board` (promotion overlay) |
| B Review | `ReviewPage`, `ReviewScreen`, `ReviewStyleParts`, `ReviewMoveDetails`, `ReviewMoveList`, `ReviewRunPanel`, `ReviewSummary`, `BatchReviewPanel`, `ReReviewOffer`, `SelfReviewGate`, `WhyPanel`, `CoachWalkthrough`, `EvalGraph` |
| C Training | `PuzzlesPage`, `PuzzlePanel`, `PuzzleModeBar`, `TimedPuzzles`, `CalcMode`, `DrillsPage`, `EndgamesPage`, `LessonsPage`, `TablebasePanel`, `TrainingLogCard`, `TrainingStreak` |
| D Openings + Analysis | `OpeningsPage`, `OpeningLibraryPanel`, `OpeningsReport`, `OpeningsDue`, `SaveRepertoire`, `AnalysisPage`, `VariationMoveList`, `PositionEditor`, `ExplorerPanel`, `DeepLines`, `SquareGrid`, `MiniBoard` |
| E Account, Games, Insights, Coach | `AccountPage`, `LichessTokenSection`, `PlaySettingsSection`, `BoardThemePicker`, `GamesPage`, `ImportPage`, `AuthPage`, `GoogleButton`, `AboutPage`, `ProfilePage`, `RatingHistoryChart`, `InsightsPage`, `app/insights/*`, `app/coach/*` |

Cross-lane touch points to watch: `OpeningsReport` is rendered by `GamesPage` (owned by D, consumed by E — only
props cross); `MoveList`/`ReviewMoveList` vs `MoveCell` (Phase 0 provides `MoveCell`, lanes A and B adopt it
independently); the duplicated threat/better-arrow control spans `ReviewMoveDetails` and `ReviewStyleParts` (both in
lane B, by design). Each lane keeps `data-testid`s and ARIA names unchanged so the 97 e2e specs stay green.

**Phase 2 — clean-up, one agent:** retire `window.confirm` with `ConfirmDialog`; delete empty constants; run the
lint guard in CI; screenshot pass in both themes.

## 5. Token gaps

Keep the direction: cream `--bg`, white/charcoal surfaces, green `--accent`, brick `--danger`.

**Colour (add to `:root` and the dark block, map in `@theme`)**

| Token | Light | Dark | Replaces |
|---|---|---|---|
| `--accent-hover` | `#285f54` | `#72c2b0` | primary hover (missing) |
| `--on-danger` | `#ffffff` | `#1a0f0c` | `text-white` on danger (dark ≈ 3.6:1 today) |
| `--success` / `--on-success` | `#3f7f2a` / `#fff` | `#7cc06a` / `#0f1312` | "right", good-move green, won |
| `--warning` / `--on-warning` | `#a9780f` / `#fff` | `#e0b44a` / `#1a1405` | inaccuracy amber, low-time |
| `--info` | `#3a6fb0` | `#7aa6dd` | hint/selection blue |
| `--focus-ring` | `var(--accent)` | `var(--accent)` | `focus-visible:outline` everywhere |
| `--scrim` | `rgb(0 0 0 / .4)` | `rgb(0 0 0 / .55)` | `bg-black/40`, `/25` |
| `--side-white` / `--side-black` | `#ecebe8` / `#262421` | same | neutral-100/800, white/neutral-900, EvalGraph and Explorer hex |
| `--tier-good` / `--tier-inaccuracy` / `--tier-bad` | `#4f9a2c` / `#d9a21b` / `#c7362b` | same (white glyph) | `reviewStyle.ts`, `ReviewMoveDetails.tsx` |
| `--label-*` (10) | from `labelStyle.ts` | same | `labelStyle.ts` |
| Board overlays: `--arrow-best`, `--arrow-threat`, `--arrow-alt`, `--sq-right`, `--sq-wrong`, `--sq-hint`, `--sq-highlight`, `--sq-premove`, `--mark-green/red/blue/yellow`, `--hanging-glow` | one value each (pick the most used of today's drifted values) | — | the ~35 board `rgba()` literals in 14 files |
| `--last-move`, `--selected`, `--dot`, `--check` | exist | **add dark values** and map into `@theme` | — |

**Radius**: `--radius-control: 0.5rem` (buttons, chips, panels — today's `rounded-lg`), `--radius-inner: 0.375rem`
(segmented thumb, small chips — `rounded-md`), `--radius-sheet: 1rem` (dialogs and floating sheets only —
`rounded-2xl`), `rounded-full` for pills/dots only. Settings cards move from `rounded-2xl` to `--radius-control` so
in-flow containers share one radius and only floating surfaces are rounder.

**Elevation**: `--shadow-popover` (menus, tooltips; today `shadow`/`shadow-lg`), `--shadow-dialog` (today
`shadow-xl`/`2xl`). Z scale: `--z-board-overlay: 10`, `--z-menu: 30`, `--z-dialog: 50`, `--z-toast: 60`.

**Type scale** (as `@theme` font-size tokens and used through `PageHeader`/`Panel`):
`--text-2xs: 0.6875rem` (11 px; replaces 22 `text-[9-11px]`), `xs`, `sm` (body default for panels), `base`,
`--text-title: 1.25rem` + weight 700 for every h1 (settles bold vs semibold), section title `base`/600, subsection
`sm`/500, eyebrow `xs`/600 uppercase muted. Keep `font-mono` for moves and evals.

**Spacing**: no new raw scale needed (Tailwind's is used consistently); encode roles instead — control padding lives
in `Button`/`Chip` sizes, panel padding in `Panel` (`p-3`/`p-5`), page padding in `PageShell` (`px-4 py-6`), stack gap
default `gap-2` inside panels and `gap-4` between panels.

**Motion**: `--duration-fast: 100ms` (timers), `--duration-base: 300ms` (progress, eval bar), honouring the existing
reduced-motion setting in `PlaySettingsSection`.

## Component completeness (today)

| Component | States | Variants | Docs | Score |
|---|---|---|---|---|
| Secondary button | hover, disabled (most); no focus-visible | 13 strings | none | 5/10 |
| Primary button | disabled (3 opacities); hover in 3 of 14 | 14 strings | none | 3/10 |
| Danger action | — | 4 looks + `window.confirm` | none | 2/10 |
| Chip / toggle | on/off; 7 off-states; 2 ARIA models | 15 | none | 3/10 |
| Segmented / tabs | active | 5 | none | 4/10 |
| Panel / card | — | 2 radii, 3 paddings | comment in `index.css` only for board column | 5/10 |
| Dialog | Escape in 1 of 2; no focus trap | 2 | none | 3/10 |
| Loading / empty | text only | ~45 one-offs | none | 3/10 |
| Board column / layout | responsive, focus mode | 2 | good (`index.css` comment) | 7/10 |

## Priority actions

1. Land Phase 0 (`src/index.css` tokens + `src/ui/` + the shared components in step 4) in one commit before any page
   work; it removes ~35 duplicated constants by itself.
2. Fix the two contrast bugs now, independent of the refactor: `ImportPage.tsx:217` `text-white` → `text-accent-ink`;
   `bg-danger text-white` → `--on-danger` (6 sites).
3. Unify board overlay colours into one module so a threat arrow is the same red in Review, Practice and Lessons.
4. Give every button a `focus-visible` ring and the primary a hover state (comes free with `Button`).
5. Add the lint guard so wave 8+ cannot re-introduce local `btn` strings or raw colours.
