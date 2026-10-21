Current architecture and setup: `docs/ARCHITECTURE.md`, `docs/SETUP.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`; changes in `CHANGELOG.md`. The folder inventory below describes the original implementation; preserve its business rules, but use the native React entries (`<department>/react/src`) and the FastAPI backend for current work. No cloud deployment is authorized without the owner's explicit approval.

# Magppie CRM (Claude): rules for anyone who edits this folder

Started 10 Oct 2026. Separate from `Documents/crm` (the Codex build). Nothing here reads or changes that folder.

Start: double-click `Start CRM.cmd`, then open http://127.0.0.1:4301/ (FastAPI + local Supabase). The old 4300 server (`run.cmd`, `run.sh`, `measurement/server.py`) is retired; its code is on branch `archive/legacy-2026-10`.

## The one rule

Work only inside the folder you were given. If a change needs a file outside it, stop and say which file and why.

## How the folders work

| Folder | What it holds |
|---|---|
| `core/` | Small shared library the backend imports (safe file names, public-file rules, store validation). It used to be the 4300 engine. Names no stage, field or dashboard. |
| `shared/` | The look (`look.css`), the old building blocks (`kit.js`, now kept only for a parity test), the order rules (`rules.js`: money maths, payment plans, timeline dates, clocks, project and customer numbers), the rules for what counts as a problem (`signals.js`) and the people (`people.js`). Every department reads these. |
| `data/` | Retired. The old 4300 `store.json` and uploads are in the encrypted archive (see `docs/OPERATIONS.md`). Live data is in local Supabase PostgreSQL and the private `crm-uploads` bucket. |
| `sales/` | Everything for Sales. |
| `design/` | The Design team's screen, at `/design/`. Two portals on slim tabs: Pre-design (until the booking share is in; Sales is the point of contact) and Post-design (after it; Design is the point of contact). Each has its own strip of pages on the left. |
| `measurement/` | The Measurement screen, at `/measurement/`. Same screens and words as the Measurement Dashboard project (Overview, Requests, Map and areas, Reports), fed from this CRM's clients. |
| `accounts/` | The Accounts screen, at `/accounts/`. Split into folders like Sales (19 Oct 2026); see the Accounts table below. |
| `ai/` | Everything that uses an AI model: `agents/` (one job when asked, for example the voice note transcriber) and `automations/` (run by themselves; empty for now). Keys sit in `ai/keys.env` on this laptop only and are never served to a browser. Read `ai/README.md`. |
| `online/` | Retired; on branch `archive/legacy-2026-10`. |
| `management/` | The management view, opened from the Management link in the top bar (`/management/`). It only reads, never saves. |
| `pre-sales/`, `post-sales/` | Removed (they were empty); on branch `archive/legacy-2026-10`. |

Inside `sales/`:

| Folder | What it holds |
|---|---|
| `shell/` | The frame: top bar, the workflow list on the left, the window that opens when a client is clicked. |
| `qualified-leads/` | Dashboard 1. Its own screen and its own dropdowns. |
| `in-design/` | Dashboard 2. DRF, proposals, revisions. |
| `token-due/` | Dashboard 3. Forms signed, token not in yet. |
| `booked/` | Dashboard 4. Booked, collecting the booking share. |
| `order-cards/` | The short forms (order, timeline, payment, proof, approvals, OCF, contact) used by dashboards 3 and 4. |
| `side-panel/` | Call again, Money to collect, Approvals pending. |
| `common/` | Pieces more than one sales dashboard needs (contact log, client header). |
| `payments/` | Payments dashboard: what is still to collect, by due date. |
| `bin/` | Deleted clients and follow-up calls, with restore. |
| `stage-board/`, `incentive/`, `master-data/` | Full-screen dashboards opened from the workflow panel: the client tracker (which client is at what stage, money and dates), the incentive rule, and the master data table. |
| `approvals/`, `notifications/` | Sent for approvals (everything sent for a yes, and what came back) and the bell in the top bar. |
| `follow-ups/`, `birds-eye/`, `team/`, `date-filter/`, `new-opportunity/` | One folder each: the follow-up calls list, the strip on top, the Viewing dropdown, the date dropdown, the new opportunity form. |

Inside `accounts/` (tabs in this order: Summary, Clients, Daily payments, Approvals, then the payment stages, then Master data):

| Folder | What it holds |
|---|---|
| `shell/` | The frame: the slim tabs and which page each one shows. |
| `common/` | Pieces several pages need: stage lines, the approve / reject card, a client's money (`A.money`), the next approval, the Accounts approvals card. |
| `summary/` | Order book (OCF pending, with Design, in production, dispatched, cancelled; retail and project) and the money still needed for 50%, 80%, 100%. |
| `client-search/` | Every order in one searchable table. |
| `daily-payments/` | The one form where each day's money is entered, and that day's list. |
| `approvals/` | The four Accounts gates: Booking to Design (50%), Production drawing (80%), Factory go-ahead (80% + PDI), Dispatch (100%). |
| `booking/`, `stage-tabs/` | The Booking tab with its windows, and the EPT / Production drawing / PDI / Handover tabs. |
| `payment-window/` | A client's money window (record a payment, approvals, PIs) and the "Sales says paid" window. |
| `pi/` | The PI in Magppie's layout (sample: Dr Himanshu, 17.10.2026). |

Each dashboard folder has `dashboard.js` (the screen) and `dropdowns.js` (its lists). A dashboard never reads another dashboard's folder. What two dashboards share goes in `common/` or `order-cards/`.

## How saving and redrawing work (read before touching `kit.js`)

- Every change redraws the whole screen. `Kit.calm` delays a redraw while the mouse is pressed or a dropdown is open, and `Kit.keepFocus` puts the cursor back in the same box. Use `ctx.update(change)` to save, `ctx.update()` to only redraw.
- A text or money box saves when the person leaves it or presses Enter, not on every key.
- Two screens can save at the same moment. The second one gets a "stale" answer, lays its changed clients over the newest copy and saves again. Nothing is reloaded. A client added on both screens at once gets fresh project and customer numbers.
- Screens pick up each other's changes every 4 seconds, except while the person is typing, has a dropdown open or is mid-click (`Kit.busy`).
- A warning in a form is shown with `Kit.warn(draft)`. It clears as soon as the person changes anything in that form.
- Deleting never removes a client from the saved file. It moves them to the bin.

## To confirm with Manish

- Post-design order (19 Oct 2026): site measurement (Sent, Aligned, Done, with a note), design, appliances, EPT, PDI. Design needs only the site measurement; PDI needs design, appliances and EPT. Defaults chosen without his answer: My tasks due date = date promised to Sales (pre-design) or planned production drawing date (post-design; PDI date for PDI); only the right-hand boxes were removed, only on My tasks.

- PI for Booking and Production (19 Oct 2026): the sample is a full statement. On a stage PI the line "Payable at booking: 50% of <bank amount with GST>" is added and Balance Due = that minus payment received in bank. The % on the PI is applied to the bank amount, while the Accounts approvals count the % on the total payable (as in the sheet). To confirm.
- "On hold" orders from the sheet's summary have no place in the CRM yet.
- Order type (Retail or Project) is a new field on the order card, Retail unless chosen.

- Retry timer after no answer: 12 hours, then 6, then halves again, never under 1 hour. Only 12 and 6 are his words.
- Timeline: dispatch 30 days before handover, PDI 21 days before dispatch, drawing signoff = production days (45) before dispatch (from the Accounts sheet, 19 Oct 2026).
- Money maths (settled 19 Oct 2026 from the Accounts sheet, see `shared/rules.js`): bank % and free accessories % are typed; total = OBV + GST on the bank part + free accessories. Net inflow = total - GST - success fees.
- The designer's estimate is entered "including GST" at 18% on everything, but the order maths charges GST on the bank part only, so the client's total payable comes out lower than the estimate. To confirm.
- Payment plan approval (SM / AVP / Founder) is still a dropdown the SM sets, because there is no AVP or Founder screen yet.
- OCF button is a placeholder. The generator comes later.
- After Design or Accounts has approved, the sales person can still change the timeline or the order value, and the approval stays as it was. Should a change send it back for approval?
- The "Express" timeline does not change any date yet. What should it do?
- A disqualified lead shows only in Master data. There is no button to bring it back.
- Management's Client wise tab lists clients up to Booked. Clients moved to post-design are counted in Full analysis only.
- Post-design stages are read from the planned dates (Production drawing, PDI, Dispatch, Handover, Handed over). The real stages come from the Zoho PDF Manish will send.
- Accounts stage tabs: money received is counted against the plan's shares in order (booking first). No date is known for the EPT payment.
- Accounts gates (19 Oct 2026): 50% to Design, 80% production drawing, 80% + PDI factory, 100% dispatch; each needs Accounts to click Approve. Orders already in Design before this were marked approved automatically.
- Measurement: only First Measurement has requests (from "Request site measurement" in Sales). How EPT Marking, EPT Verification and PDI requests are raised is not decided. Visit date, assigned person and "Mark visit done" were added here; the zip project is read-only. The live map (Mappls) and the Zoho connection are not brought over.
