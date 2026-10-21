# Workspace UI redesign — 21 October 2026

Presentation-only update. Existing API requests, authentication handlers, calculations, approvals and record mutation handlers are retained. No database schema, backend service or integration configuration was changed for this update.

## Changes by module

| Scope | Changes |
| --- | --- |
| Shared header | Top-right initials menu replaces the separate Sign out button. Profile displays the available workspace context; Settings changes browser-local display spacing. Sign out retains its existing pending, retry and redirect behavior. |
| Sales — all routes | Grouped icon navigation, right-aligned badges, active state, remembered collapse and mobile modal drawer. Client search stays in the header; existing Viewing and Dates controls move into a dedicated toolbar. All ten navigation callbacks remain intact. |
| Sales — Architects | Aligned title, subtitle, search and Add architect action. Add action reveals an inline form. Existing edit/create/remove handlers retained. Less prominent editable cells, aligned numeric columns, sticky header, subtle removal action and In use badge. Below 1200px rows become labeled cards. Search and empty-directory messages are explicit. |
| Design — Pre/Post | Shared sidebar with the existing routes/counts and summary tooltips. One remembered Design collapse preference. Viewing/date filters move below the main header. Existing workflow controls are retained. |
| Measurement — Home/Requests/Areas/Reports | Shared icon sidebar and mobile drawer use existing navigation. Shared avatar menu and page spacing. Stage tabs and request controls retain their behavior. |
| Accounts | Shared avatar menu, responsive header and page-header styling. Existing stage navigation, payment forms and approval controls retained. |
| Management/Tavneet | Existing report tabs and person selector move into a dedicated toolbar; read-only badge stays with these controls. Shared avatar and page styling. |

Shared CSS provides focus/hover treatments, transitions, bounded menus, consistent spacing and responsive behavior. Wide analytical tables retain intentional internal scrolling rather than hiding columns. Other forms keep their existing loading, error and submission behavior.

## Important profile limitation

The existing frontend exposes a workspace viewing name/role, not a verified account display profile. The menu labels this explicitly as **Workspace view**. Profile is read-only; Settings is a functioning browser-local density preference. No account editing, permission changes or new identity API calls were introduced.

## Verification

- Six production builds/type checks passed: authentication, Sales, Design, Accounts, Measurement and Management.
- 185 frontend tests passed: auth/shared 13, Sales 44, Design 47, Accounts 26, Measurement 18, Management 37. Sales and Design were rebuilt and retested after the final empty-state/persistence adjustment.
- Two new sidebar tests cover groups/active counts/existing route callback and persisted collapse without network requests.
- Browser matrix: five modules at 320, 390, 768 and 1440px (20 cases), with no document overflow or avatar/header overlap in the tested default views.
- All ten Sales sidebar destinations opened. Mobile Sales and Measurement navigation and Design Timelines navigation checked.
- Collapse survives reload; mobile drawer closes on navigation; Escape closes the user menu. Profile and density controls checked, density restored to comfortable.
- Login, logout redirect and login again succeeded. Mobile opportunity form inspected without submission.
- Architect creation verified only in the isolated workflow QA database using synthetic input. Customer records were not edited.
- No browser console errors captured in the QA tab at the final check.
- Evidence: ignored `.local/saas-browser-matrix.json`, `.local/saas-desktop.png`, `.local/saas-mobile.png` and `.local/saas-*-test.log`.

These checks cover representative routes and responsive layouts, not every possible data-dependent state or physical mobile browser. Backend regression results from earlier reports are not presented as newly run in this UI task.

## Local delivery

Rebuild only the local CRM container; preserve existing Supabase services and volumes. The rollback image is `magppie-crm:before-workspace-redesign-20261021`. No cloud deployment is authorized. Factory email remains disabled.

Rebuild completed and the CRM container is healthy on `http://127.0.0.1:4302`. Running image: `sha256:1092548333d62a36e9008570423633f482d65d6214f0cd82091cb96d6c974f6f`. Authenticated requests returned 200 for all five modules and the container serves the exact current shared stylesheet. Existing admin browser login succeeded and the live Architects screen rendered all 44 existing entries with the new shell. The complete `/api/store` JSON hash matches the pre-change baseline, including all 28 client documents. Factory mail returned HTTP 403 and the signature provider remains off. No Supabase services or volumes were replaced. Attachment hashes were not independently rerun in this UI-only update.

Future UI work belongs in shared `backend/react/src/Sidebar.tsx`, `backend/react/src/Auth.tsx` and `shared/workspace.css`, with module-specific presentation in each module's `react/src` directory. Keep API and business handlers separate from presentation changes.
