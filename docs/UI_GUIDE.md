# UI guide

How screens are built so every module looks and moves the same. Read this before adding or changing a screen. Business rules are in [CLAUDE.md](../CLAUDE.md); architecture is in [ARCHITECTURE](ARCHITECTURE.md).

## Where things live

Every module page loads, in this order (each module's `index.html`):

| File | Owns |
|---|---|
| `shared/tokens.css` | All tokens: spacing, type, weights, radius, shadows, control heights, touch sizes (`--tap`), layers, motion, colours. Old names (`--page`, `--card`, `--ink` …) are aliases. |
| `shared/look.css` | Components: cards, KPI tiles, lists and rows, chips, buttons, fields, dialogs, bell panel, toast, skeletons, the phone-card pattern for tables. |
| `<module>/look.css` | Measurement and Management only: their own components (toolbar, map, tiles, analysis). |
| `<module>/react/src/style.css` | That module's own layouts (grid columns, special rows). Bundled into `<module>/assets/app.css`. |
| `shared/ui.css` | Interaction: transitions, focus ring, disabled, dialog backdrop, micro-interactions, reduced motion. |
| `shared/workspace.css` | The shell: frame and scrolling, header, department/stage/view tabs, toolbar, sidebar and drawer, "Also today" panel, page header, user menu. |

Shared React pieces are in `backend/react/src/Shell.tsx`:
- `AppHeader` is the one header.
- `Sidebar` (in `Sidebar.tsx`) switches between the column and the drawer.
- `Rail` is "Also today".
- `Skeleton` is the loading layout.
- `StableLabel` is a busy button that keeps its width.
- `useCardLabels` labels table cells for phone cards.
- `useAutoTitle` gives every ellipsis a hover tooltip.
- `SaveStateContext` and `FieldState` show the inline saving state.

Rules:
- **One source of truth.** A selector is defined in one file only. `npm run ui:css-map` must report `important: 0` and `duplicates: 0`.
- **Tokens, not values.** Use `var(--space-4)`, `var(--color-danger)`, `var(--tap)` and so on. New colours become tokens first.
- **Presentation only in CSS and shell code.** No API, data shape, save/409, permission or `shared/rules.js` change belongs in a UI change.

## Breakpoints (mobile-first, everywhere)

| Width | Meaning |
|---|---|
| < 640 | Small phone. The logo shows only the "M" mark. |
| < 768 | Phone: search is an icon, New opportunity floats, tables become labelled cards, windows are full-screen sheets, the toast sits at the bottom. |
| < 1024 | Phone and tablet: the page scrolls as one document, the header has two rows (department tabs underneath), the sidebar is a drawer, controls are 44 px. |
| ≥ 1024 | Desktop frame: one 56 px header, sidebar column, the main column scrolls, lists keep at least 320 px. |
| < 1280 | "Also today" is a side panel opened from the toolbar; in the header, search is an icon. |
| ≥ 1280 | "Also today" is a column; search is inline in the header centre. |

Write queries as `min-width: 640/768/1024/1280px` or `max-width: 639.98/767.98/1023.98/1279.98px`. The sidebar's JavaScript reads the same values from `BREAKPOINTS` in `Shell.tsx`. No other breakpoints.

## Shell

- **Header:** `AppHeader current="sales" navigation="Sales navigation" search={…} actions={…} primary={…}`.
  - Logo and department tabs sit on the left, in the same place in every module. Search goes in the centre, then actions and the user menu (always last in keyboard order).
  - Items collapse in a fixed order: search becomes an icon (< 1280), the tabs move to a second row (< 1024), the primary action becomes a floating button (< 768), and the logo becomes a mark (< 640).
- **Tabs** (department, stage `.stagebar`, view `.management-tools .tabs`):
  - one style: 44 px tall, equal padding;
  - the active tab gets an accent colour and a 2 px indicator, never a weight or size change.
- **Toolbar:** `.crm-page-toolbar` holds the filters (Viewing, Dates, Person); `.toolbar-end` pushes an action to the right.
- **Page header:** `.page-h` has the title and subtitle on the left, and search and actions on the right.
- **Sidebar:** pass `id`, `label`, `items` and `active`.
  - Collapse (desktop) and the drawer (below 1024, opened by the header's menu button) are handled for you.
  - Keep the sidebar mounted on every tab of a module, so the content never jumps sideways.

## Components

- **Buttons:** `.btn` (default), `.btn.dark` (primary), `.btn.line`, `.btn.warn`, `.btn.small`, `.btn.round` (icon).
  - Heights come from `--tap` and `--tap-sm`.
  - If a label changes while busy, wrap it in `StableLabel`.
- **Fields:** `<label className="field"><span>Label</span><input/></label>`. The label sits above, and every field has the same height.
  - Sales and Design fields show Saving… / Saved / Not saved on the label line through `useFieldSave`.
- **Chips:** `.pill` with `green`, `yellow`, `red` or `grey` (`blue` is neutral too); priority tags `.heat.high/medium/low` share the same look. Do not invent new chip styles.
- **Lists and tables:**
  - Rows have a minimum height of `--row-h`, and the head row is sticky.
  - Numeric columns get `.num`, which right-aligns them.
  - Names truncate with an ellipsis; `useAutoTitle` gives the full text on hover.
  - For phones, add `cardify` to the rows container and either put `data-label` on each cell or call `useCardLabels(ref)` when a sibling head row exists.
  - Exception: master data stays a sideways-scrolling table.
- **KPI tiles** (`.eye`, `.stat`, `.pay-tile`, `.mg-tile`) sit in a grid, so a row has equal heights. Values wrap and never overflow.
- **Windows:**
  - Use `<dialog>` opened with `showModal()`; that gives the native focus trap, and focus returns to the opener on close.
  - On phones `dialog.sheet`, `.a-dialog` and `.m-dialog` become full-screen sheets with a sticky top bar, and the page behind does not scroll.
- **Menus:** the bell panel stays inside the screen at every width. Close menus on Escape and on outside click.
- **Status:** saving, saved, read-only and error notices are a toast (at the bottom on phones, bottom-left on desktop), never a bar that pushes the page. A plain "saved" notice fades after 3 s.
- **Loading and empty:**
  - show `Skeleton` in the shape of the first screen;
  - empty lists use `.empty` (centred, muted);
  - errors give an inline retry.
- **Motion:** 150–200 ms, using `--motion-fast` and `--motion-base`. Everything is off under `prefers-reduced-motion`.

## Background refresh

Modules poll every 4 s and skip the update when the saved revision is unchanged.
- Polls pause while a person is typing, has a dropdown open or has a window open.
- Keep list keys stable (record id plus kind, never the position) so a refresh changes only what changed, and focus and scroll stay put.

## Checking a change

```powershell
npm run build
npm run ui:css-map      # important 0, duplicates 0, only the four breakpoints
npm run ui:audit        # every screen, 10 widths; expect 0 overflow, overlaps, clipping
npm run ui:a11y         # names, landmarks, keyboard order, Escape
npm run ui:visual       # compare with tests/ui/visual/baselines (add --update-snapshots after an intended change)
```

All of these use synthetic data on loopback QA servers. See [tests/ui/layout-audit/README.md](../tests/ui/layout-audit/README.md).

## Checking on a real phone

Do this on Android Chrome and on iPhone Safari before a release.

1. **Sign in.**
   - The sign-in card fits the screen with no sideways scroll.
   - Tapping "Forgot password?" is easy.
   - The keyboard does not zoom the page.
2. **Header.** In each department (Sales, Design, Measurement, Accounts, Management):
   - The header is the same height everywhere: menu button, "M" or MAGPPIE, search icon (Sales, Design), bell and avatar on one row, department tabs under it.
   - The current department is underlined, and the tab row starts in the same place.
   - Swipe the tab row: it scrolls, with a fade at the right edge.
3. **Drawer.**
   - Tap ☰: the navigation slides in from the left over a dim backdrop.
   - Tap a page: the drawer closes and the page opens.
   - Open it again and swipe left: it closes.
4. **Search** (Sales, Design): tap the magnifier. A search box replaces the tab row and the keyboard opens. Tap ✕ to close it.
5. **Lists.**
   - Scroll Sales "Booked · collecting", Design "Post-design board" and Accounts "Clients": each row is a card with labelled values, and nothing is cut off at the right.
   - The whole page scrolls; no list is stuck in a small box.
6. **Floating button** (Sales): "New opportunity" floats at the bottom right and never hides the last row (scroll to the end).
7. **Client window.**
   - Open a client: the window fills the screen, "Close window" stays at the top while you scroll, and the page behind does not move.
   - Change a field and tap elsewhere: "Saving…" then "Saved" appears next to its label.
8. **Also today** (Sales, Design): tap "Also today". A panel slides in from the right. Close it with ✕ or by tapping the dim area.
9. **Bell:** tap it. The panel stays inside the screen; tap outside to close.
10. **Rotate to landscape:**
    - the header stays one row plus tabs;
    - lists stay reachable;
    - nothing overlaps.
11. **Settings → Display spacing → Compact:** the sidebar and drawer links stay at least finger-sized.

Correct looks like: no sideways scrolling anywhere, nothing jumps when data refreshes (leave a screen open for a minute), every button is at least as big as a fingertip, and text never runs into other text.
