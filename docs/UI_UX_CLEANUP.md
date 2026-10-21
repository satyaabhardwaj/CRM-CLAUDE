# UI/UX cleanup — 21 October 2026

Presentation-only changes. API clients, request contracts, data fetching, calculations, workflow handlers, permissions, backend Python and database code were not changed.

## Changes by component

| Area | Presentation changes |
| --- | --- |
| Shared shell, all five modules | Common typography and color tokens; consistent header padding, card headings, card bodies, borders and subtle shadows. Existing module navigation and sidebar behavior retained. |
| Controls and feedback | Consistent field borders/radii, visible keyboard focus, disabled-button feedback, short hover transitions and reduced-motion support. Empty states have readable spacing and line height. |
| Session/footer | Reused the existing SignOut component in a dedicated 48px footer; removed its floating inline-styled wrapper. App content reserves footer space so controls and tables are not covered. Existing logout request, retry behavior and redirect are unchanged. |
| Login | Responsive centered card, shared tokens, clear heading and helper copy, visible loading button text and busy/live announcements. Existing labels, autocomplete, required validation, API calls and redirects preserved. Inline CSS moved into a compiled stylesheet. |
| Sales | Shared styles apply to cards, dialogs and controls. Narrow page search headers wrap into their own full-width row, including Architects. Existing team-card responsive fix retained. |
| Accounts | Shared cards, stage navigation, fields and footer treatment; all payment and approval logic untouched. |
| Design | Shared layout spacing, controls and dialog surfaces; all workflow behavior untouched. |
| Measurement | Shared cards, stages, empty states and footer; existing provider failure/retry behavior preserved. |
| Management | White header consistent with other departments, matching view tabs and read-only badge. Problem rows now have card spacing, readable stacked descriptions and proper button styling. |

`shared/tokens.css` owns common values. `shared/ui.css` is the presentation layer loaded after existing module CSS in the five active HTML shells. Feature-specific responsive rules remain in their owning module. Login compiles the same tokens through `backend/react/src/auth.css`; it does not require authenticated shared asset access.

## Verification

- 183 frontend tests passed: Sales 44, Accounts 26, Design 47, Measurement 18, Management 37, Auth 11. Auth tests include request contracts, duplicate-submit protection, error/retry feedback, logout and redirects.
- Auth and Management TypeScript/Vite builds and formatting checks passed. Docker rebuilt all six frontend production bundles successfully.
- Chromium synthetic-data browser matrix: all five modules at 320, 768 and 1280 CSS pixels (15 cases); document width equals viewport, footer ends at viewport bottom and body has no extra vertical overflow. Internal tables/content remain scrollable.
- Additional 390px login, invalid-password feedback, successful login redirect, Sales opportunity dialog, dialog close and logout redirect verified. No opportunity was saved.
- Measurement fixture error screen, retry and recovery to an empty feed verified at 320px. No live provider or customer records were changed for this test.
- Management desktop screenshot inspected after the header/row fixes. Synthetic screenshots retained under `.local/ui-management-desktop.png` and `.local/ui-login-mobile.png`.
- Rebuilt Docker CRM at port 4302 is healthy. New shared/auth CSS endpoints return 200. Client hash comparison confirms 28 existing client documents unchanged; all 15 attachment hashes also unchanged.
- Source baseline comparison confirms edits to existing files were limited to frontend markup/entrypoints and login HTML. New files are presentation CSS and documentation. No backend/data/business-rule implementation edits.

The first local auth build failed due to an incorrect relative CSS import path; it was corrected and the subsequent build passed. No failed build is counted as a pass.

## Local delivery and limits

Image: `magppie-crm:local-verified`, digest `sha256:e5700390001edb14a7ab17ed7312918dd828bd3388702f9c880e8fc5e305b2f4`.
Previous image retained as `magppie-crm:before-ui-cleanup-20261021`. Use the existing Compose rollback procedure with that tag to restore the prior UI; never reset Supabase volumes.

Factory emails remain disabled. No cloud deployment, customer edits or file cleanup deletions were performed. Authentication verification creates ordinary test/login sessions; it does not alter customer records or credentials. No new backend test run is claimed for this presentation-only change. Physical devices, non-Chromium engines and every possible modal/customer state were not exhaustively checked.
