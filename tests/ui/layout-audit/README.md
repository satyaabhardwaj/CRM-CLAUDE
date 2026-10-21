# Layout audit

Automated layout checks for every screen and state of the five modules and the sign-in pages, on synthetic data only.

```powershell
npx playwright install chromium firefox webkit   # once per machine
npm run ui:audit                                 # all screens, 10 widths, Chromium (about 20 minutes)
npm run ui:audit -- --only "^sales/" --widths 390,1440 --quick
node tests/ui/layout-audit/report.mjs .local/ui-polish/audit-<stamp>/results.json
node tests/ui/layout-audit/css-map.mjs           # breakpoints, !important, colours, duplicate selectors
```

Options: `--out DIR`, `--only REGEX` (screen ids), `--widths 320,390,…`, `--browser chromium|firefox|webkit`, `--workers N`, `--quick` (skips data states and the 9-second refresh checks).

## How it works

- `audit.mjs` starts three loopback QA servers through `scripts/serve_workflow_qa.py`: `stress` on 4311, `one` on 4312 and `empty` on 4313. Each has a fresh SQLite database, a synthetic login (`admin@qa.invalid`) and stubbed providers. It never reads `.env.local` or live data.
- `stress_data.py` makes the data: 540 clients over all seven stages, 520 architects and 520 measurement requests. It includes long and unbroken names, values up to ₹25 crore, notes up to 900 characters, and up to 15 contacts and 8 receipts per client.
- `screens.mjs` lists every page and state: sidebar pages, client windows, order cards, dialogs, bell, user menu and settings, sidebar collapsed or drawer, Also today, select mode, custom dates, tab switches and sign-in pages. A missing control is recorded as `unreachable`; a control that is present but cannot be clicked is recorded as `blocked`.
- `checks.mjs` runs in the page and reports:
  - **Page horizontal overflow**, with its widest causes.
  - **Off-screen controls**: cut off at the viewport edge, outside any scroller.
  - **Obscured controls**: something else is painted over their centre. Covering by a popover the state opened on purpose doesn't count.
  - **Overlapping text**: text boxes clipped to what is actually painted.
  - **Clipped text**: overflow hidden with no ellipsis.
  - **Truncated text without a tooltip**.
  - **Squeezed scroll areas**: a list's own scroller crushed below 120 px while the page doesn't scroll.
  - **Touch targets under 44 × 44 px** at touch widths.
  - **CLS**, from the Layout Instability API (Chromium only).
- Dynamic checks at 390 and 1440:
  - **Background refresh:** a second API client saves a change, and the open page polls it in. The audit then checks focus, scroll position and CLS after two polls.
  - **Tab switch:** CLS, plus whether sibling tabs move.
  - **Data states:** 0 rows, 1 row, a loading state (API delayed 3 s), and an error state (API 503) on every landing page.
- `report.mjs` groups the findings by component and ranks them by severity × number of screens × number of widths. It writes `issues.json` and `summary.md`.

Screenshots and results go to `.local/ui-polish/` (ignored); nothing from a run is committed.
