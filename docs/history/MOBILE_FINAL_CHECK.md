# Mobile header, navigation and form check — 21 October 2026

Changes in this pass are confined to shared/ui.css and this report. No data access, request, authentication, calculation or workflow code changed.

## Fixes

- Mobile Accounts and Measurement notification buttons now share the top row with Sign out, removing a mostly empty row. Brand width reserves space for both controls.
- Management's read-only badge sits alongside its person filter instead of consuming a separate header row.
- Department links no longer shrink into each other on narrow screens. Navigation retains horizontal scrolling, with a thinner scrollbar; scrolling has not been disabled or clipped.

At 320px, Accounts/Measurement header height fell from about 171px to 119px; Management fell from about 285px to 236px. Sales retains its necessary multi-row filters rather than hiding controls.

## Browser verification

Used the isolated synthetic QA server, not customer data, for form checks. No forms were submitted and no payments, proposals or opportunities were created.

- All five module headers/navigation at 320, 390 and 768 CSS pixels: 15 cases. Document width equals viewport; no intersecting department links and no Sign out overlap with other header inputs/buttons.
- Sales new-opportunity dialog: 320px field containment, vertical scrolling and close action checked.
- Accounts Daily payments: client, amount, date, destination, method, reference and Save payment layout inspected at 320px. Form scrolls within its container.
- Design proposal dialog: date, estimate, uploads, note and send control remain inside dialog width; no horizontal dialog overflow at 320px.
- Measurement filter dialog: checkboxes/selects fit at 320px; scrolling and Close dialog work. No filters were submitted.
- Management: person filter and read-only badge placement visually inspected; no edit forms exist in this read-only module.
- No errors in the inspected QA browser console. Private synthetic screenshot and matrix are in `.local/mobile-final-management.png` and `.local/mobile-final-matrix.json`.

Wide data tables and long navigation strips intentionally retain internal scrolling. This is Chromium viewport verification, not a physical-device/virtual-keyboard or exhaustive every-form-state certification. No new unit/backend test run is claimed for these CSS-only changes.

Docker is rebuilt locally so port 4302 receives the styles. Previous image retained as `magppie-crm:before-mobile-final-20261021`. Cloud deployment remains unauthorized; factory emails remain disabled.
