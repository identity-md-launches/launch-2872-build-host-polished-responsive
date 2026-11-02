# Squeek Colony design

## Overview

A playable pixel-art burrow under a hamster wheel, for visitors making one free move per ten-minute round. The existing night-sky and warm-earth palette, pixel headings, and readable system body text are preserved. The scene and move controls lead; room details, local NPC leaderboard, auditable history, and explanation follow. This is a single game page, with hash navigation.

The implementation lives in `src/styles.css`, `src/App.tsx`, and `src/Scene.tsx`. Rules and room definitions are in `src/engine.ts`. These are local components and patterns, not a component library.

## Colors

Canonical CSS hex tokens are defined in `src/styles.css:root`:

| Token | Value | Role |
| --- | --- | --- |
| `--bg`, `--surface`, `--surface-2` | `#1b1310`, `#261b15`, `#31241b` | Page, panels/rows, choice and quiet-button fills |
| `--line` | `#4d3a2c` | Structural separators, choice outlines, inactive level pips |
| `--text`, `--muted` | `#f6ead8`, `#cdb89e` | Primary text and secondary descriptions |
| `--accent`, `--accent-ink` | `#f2b544`, `#1b1310` | Action fill/selection outline and its dark foreground |
| `--link`, `--accent-hover` | `#f7c96b`, `#f7c96b` | Underlined links and primary-button hover |
| `--selected` | `#3d2c1c` | Locked move and the player's leaderboard row |
| `--sky` | `#2d2a4a` | Scene backdrop |
| `--focus`, `--danger` | `#8fd3ff`, `#ff9c8a` | Keyboard outline and errors |
| `--forage`, `--fortify`, `--research` | `#e9b85a`, `#8fb3d9`, `#c3a3e6` | Move names, always accompanied by text |
| `--nap`, `--jog`, `--zoomies` | `#b9adec`, `#9bd27a`, `#ff9a6b` | Labelled result badges; dark foreground |

The single supported theme is dark (`color-scheme: dark`). The art's separate `C` palette in `src/Scene.tsx` supplies sky bands, soil, furniture, and sprites. Reuse interface tokens for text and controls; art colors do not define extra UI themes. Contrast coverage and measured limitations are in the validation record.

## Typography

- `--font-body`: system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif. Body and input text use 400; controls, legends, and table headers use 600; native `strong` provides emphasis.
- `--font-pixel`: Pixelify Sans, falling back to the body stack. `src/main.tsx` imports the Latin 600 face from `@fontsource/pixelify-sans`; both WOFF2 and its WOFF fallback are bundled locally. Use it for headings, brand, move names, countdown digits, and store amounts. Loaded font checked in the browser.
- `--font-code`: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace, used for auditable seed/hash text.

The six sizes are `--fs-small` 0.875rem (14px), `--fs-body` 1rem (16px), `--fs-lead` 1.125rem (18px), `--fs-h3` 1.375rem (22px), `--fs-h2` 1.75rem (28px), and `--fs-display` 2.5rem (40px), at the default root size. Small text covers notes, hints, captions and code; body covers prose and inputs; lead covers descriptions and choice names. Mobile headings h1/h2/h3 use 28/22/18px. At 720px+, they use 40/28/22px; room/history subheadings stay 18px.

Body line-height is 1.5; headings use 1.15 at weight 600 and balanced wrapping. Prose uses pretty wrapping; the lede is limited to 40ch and how-it-works copy to 65ch. Numeric values use `.num` tabular digits. Code wraps anywhere rather than hiding the seed. No tracked capitals or additional type scale is introduced.

## Layout

Spacing tokens `--space-1` through `--space-7` are 4, 8, 12, 16, 24, 32, and 48px. `--page: 72rem` caps main content and footer. Main sections use a 32px gap, with 8–16px gaps inside related content. `.topbar` is sticky; `.skip` precedes it for keyboard access.

- Below 960px, `.hero` stacks intro, scene, then the move panel; `.columns` stacks sections. All three move buttons are on the initial 390 × 844 ready screen, confirmed on the production export. Additional error/pending explanations grow naturally and may require scrolling.
- At 720px+, main padding increases from 16px to 24px, heading sizes increase, and History/Leaderboard navigation appears beside How it works.
- At 960px+, the scene and move panel sit side by side in a 1.5:1 grid (panel minimum 20rem), and `.columns` uses two equal columns.
- `.room-list` auto-fills columns at a 15rem minimum. Stores use four columns, collapsing to two below 520px. The leaderboard's Rounds column hides below 520px; the player's played count remains in its explanation.
- Moves remain three stacked buttons with a label column and flexible hint. The label column is 6.5rem, reduced to 5.5rem at 380px and below. Tables use `.table-wrap` for internal overflow, while forms, room headings, history metadata, and links wrap.

The scene is an SVG on a 192 × 140 art grid with crisp edges, integer sprites, and a matching aspect ratio. Browser reflow was checked at 320, 390, 720, 960, and 1440px; wider browser/device coverage is not implied.

## Elevation & Depth

Surfaces are flat tonal fills. `.panel` uses a 1px structural border, `.choice` a 2px state border, and tables/history use separators or spacing. There are no UI box shadows or gradient text. Sticky navigation has z-index 10; the visible skip link has z-index 20. The scene's depth comes from stacked soil bands and room walls, not interface elevation.

## Shapes

`--radius: 6px` applies to panels, buttons, rows, and the scene. Code/result tags use 3px, and the live dot uses a 2px corner. Level pips and scene sprites are square. Preserve pixel geometry inside the art and the existing small radii on interactive surfaces.

## Components

| Pattern and source | Use and states |
| --- | --- |
| `RoundPanel`, `src/App.tsx` | Current round/countdown, native fieldset and three `.choice` buttons. A move is announced in `role="status"`, marked with `aria-pressed`, and locks the fieldset. Pending moves stay visible. Core failure offers Try again. Wheel failure announces unavailable status and a timestamped last reading; automatic polling recovers it. |
| `.btn`, `.btn-quiet`, `.btn-small`, `src/styles.css` | Amber action, quiet history action, and compact retry. Native keyboard behavior, hover fill, and minimum heights 44px (compact retry 40px). |
| `Scene`, `src/Scene.tsx` | Receives levels, shields, latest resolution, wheel activity/availability, and an accessible description. Six rooms and seeded crew reflect the replay. A failed status refresh removes spinning activity and describes the wheel as unknown. |
| `Rooms`, `src/App.tsx` | Shared stores, six room descriptions, level pips, next-upgrade cost. Upgrades are automatic game rules, not purchase controls. |
| `HistoryRow`, `DeferredHistoryRow`, `src/App.tsx` | Individual resolved rounds show outcome, move/yield, source links, and native Seed and crew disclosure. Expanded Naps also identify the original certified span. Unknown batches retain every saved move, link the aggregate source, and explicitly apply no points/yields. Paging uses Show 20 more rounds. |
| `Leaderboard`, `src/App.tsx` | Semantic table for the player and seven explicitly identified seeded neighbours. `.you` distinguishes the player's row by text and fill. |
| `Verify`, `src/App.tsx` | Labelled numeric-mode input and Check round submit. Invalid input receives `aria-invalid`, an associated message, and restored focus. Results announce politely. An unresolved settled batch explains the pending outcome and links the source. |
| `FeedNotice`, `src/App.tsx` | Loading status, persistent API error with retry, and explicit disclosure of retained cache. Empty history explains how rounds appear. |

All interactive elements use the global 3px `--focus` outline with 2px offset on `:focus-visible`. Native links, buttons, details, headings, tables, and landmarks provide semantics. The wheel spins every 1.6s and crew bob every 1.4s only under `prefers-reduced-motion: no-preference`; reduced motion disables those animations and button transitions. Transitions name only the properties that change.

## Do's and Don'ts

- Start additional content from `.section` and the existing `.columns`/spacing system; preserve the scene and move controls near the top.
- Reuse the six sizes, current font import, and semantic color tokens. Keep body copy in the system face and long machine values fully accessible.
- Use native controls, visible labels, and the existing focus ring. Pair every status color with text.
- A fresh API measurement may animate the wheel. A retained reading must be labelled with its timestamp and must not be described as live.
- Never assign a positive batch's total to one round or label unresolved outcomes as Nap/Jog/Zoomies. Keep source transactions reachable and pending moves auditable.
- Do not present the local seeded NPC leaderboard as global multiplayer. No wallet or payment component belongs to the implemented game.

For another section, reuse `.section` with a descending heading, the body/secondary text tokens, native controls with `.btn` when needed, and the current breakpoints. Keep new content in the single-page flow unless static routing is deliberately implemented.
