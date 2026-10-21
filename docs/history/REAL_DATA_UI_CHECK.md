# Real-data desktop/mobile UI check — 21 October 2026

Checked the authenticated local Docker app on port 4302 against the existing CRM database and live, read-only Zoho Measurement feed. No customer fields were changed, forms submitted, payments approved or messages sent.

## Findings and fixes

1. **Sales mobile lists collapsed below summary cards.** At 320 x 740, the Booked list's rows had zero visible height. A CSS-only mobile minimum/list height now keeps the table reachable through the main scroller. The same screen now has 446px of visible rows; clicking the visible real client name opens its existing order form. Wide columns remain accessible through the table's own horizontal scroll.
2. **Long summary amounts escaped their cards.** Real Design collection totals and factory waiting text did not fit the narrower desktop cards. Shared summary text now wraps inside its card. The populated post-design board has zero overflowing metric text elements at 1440px.

Source changes are limited to `sales/react/src/style.css` and `shared/workspace.css`. Generated Sales assets were rebuilt. No TS/JS handlers, API calls, database code, financial rules or authentication behavior were changed.

## Browser coverage

| Module | Real-data checks |
| --- | --- |
| Sales | Architects directory with 44 entries, avatar dropdown, 320px drawer, populated Booked table and long-name order detail form. Existing order inputs inspected without editing. |
| Design | Task lists, real project detail/actions form, post-design drawer, Order tracker and post-design board; desktop and mobile summary/card wrapping. |
| Accounts | Desktop/mobile Daily payments form, populated Clients table with 18 orders, real client money/approval/payment details dialog, avatar Settings panel. No financial actions executed. |
| Measurement | Live feed with 7,963 orders scanned and 117 requests (94 open, 23 done) at verification time; Requests table/mobile cards, real request detail, filter dialog, drawer and Profile panel. Cold-start loading state was observed after the container restart and then resolved. Source counts can change independently in Zoho. |
| Management | Overview and Full analysis reports, person/filter toolbar, mobile tab navigation and avatar menu. This module remains read-only. |

Post-rebuild matrix: Sales Booked, Design tasks, Accounts Clients, Measurement Requests and Management Full analysis at 320, 390, 768 and 1440px, plus the desktop Design post board: **21 checks**. All had matching document/viewport widths, avatar bounds inside the viewport, and no populated `.rows` containers collapsed below 24px. Representative screenshots and direct form/drawer interactions supplement these geometry checks. Internal horizontal scrolling in wide financial/workflow tables and navigation strips remains intentional to preserve all columns/items.

## Verification and preservation

- Sales production build/type check passed; **44 Sales tests passed**.
- Both changed CSS files passed Prettier checking.
- Docker multi-stage rebuild compiled all six frontends successfully. Only the CRM container was recreated; it is healthy.
- Complete `/api/store` SHA-256 equals the baseline captured before this audit; all 28 client documents unchanged. Normal auth sessions and read-only Zoho cache refreshes are not customer record edits.
- No console errors captured in the fresh verification tab at the final check.
- Factory email/signature settings were not modified; no cloud deployment occurred.
- Current image: `sha256:f2b82be228a65dc7b95b0e9d92716d8626554ddda3ed84a40a90443ac2a0da97`.
- Rollback tag: `magppie-crm:before-real-data-ui-check`.
- Private local evidence: `.local/real-ui-matrix.json`, `.local/real-ui-sales-mobile.png`, `.local/real-ui-design-desktop.png`, `.local/real-ui-sales-tests.log`, `.local/real-ui-docker-build.log`.

This verifies representative real-data screens and responsive browser viewports. It does not claim exhaustive coverage of every record/form combination or physical iOS/Android browsers. Backend suites and unrelated frontend test suites were not rerun for these two CSS-only changes; earlier results remain historical evidence.
