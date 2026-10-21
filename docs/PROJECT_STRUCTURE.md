# CRM project folder structure

Actual workspace: `CRM-CLAUDE`. Source files and feature folders are listed below. Private data, credential files, generated files and historical backup contents are summarized rather than exposed.

## Start the app

Double-click `Start CRM.cmd` on Windows. It starts Docker, local Supabase and FastAPI at http://127.0.0.1:4301/. The isolated container verification app uses 4302. `run.cmd` / 4300 is a historical standalone path. See `deploy/README.md` for current ports and container commands.

Current additions to the historical tree below: each department has `react/` source/tests and compiled `assets/`; `backend/react/` owns login; `supabase/` owns local services and storage setup; root `Dockerfile` and `docker-compose.yml` plus `deploy/compose.local.yml` own container verification. `scripts/launch_local.py` owns one-click startup. `docs/PREDEPLOYMENT_AUDIT.md` records the current verification and module boundaries.

## Complete active-source tree

```text
CRM-CLAUDE/
├── backend/
│   ├── app.py
│   ├── auth.py
│   ├── config.py
│   ├── integrations.py
│   ├── local.py
│   ├── manage.py
│   ├── models.py
│   ├── repository.py
│   ├── migrations/
│   │   ├── env.py
│   │   └── versions/0001_initial.py
│   ├── tests/test_api.py
│   ├── web/ [login and session UI]
│   └── README.md
├── alembic.ini
├── backend.env.example
├── requirements-backend.txt
├── run-backend.cmd
├── .github/
│   └── workflows/
│       └── check.yml
├── accounts/
│   ├── approvals/
│   │   └── page.js
│   ├── booking/
│   │   ├── page.js
│   │   └── window.js
│   ├── client-search/
│   │   └── page.js
│   ├── common/
│   │   └── pieces.js
│   ├── daily-payments/
│   │   └── page.js
│   ├── payment-window/
│   │   └── window.js
│   ├── pi/
│   │   └── pi.js
│   ├── shell/
│   │   └── shell.js
│   ├── stage-tabs/
│   │   └── page.js
│   ├── summary/
│   │   └── page.js
│   └── index.html
├── ai/
│   ├── agents/
│   │   ├── __init__.py
│   │   └── transcriber.py
│   ├── __init__.py
│   ├── keys.env.example
│   └── README.md
├── backup/ [preserved historical project snapshots]
├── core/
│   ├── security.py
│   ├── server.py
│   └── storage.py
├── data/ [private client records, uploads and recovery copies]
├── design/
│   ├── birds-eye/
│   │   └── strip.js
│   ├── client-window/
│   │   └── window.js
│   ├── common/
│   │   └── pieces.js
│   ├── my-tasks/
│   │   └── today.js
│   ├── post-design/
│   │   ├── appliances/
│   │   │   └── window.js
│   │   ├── board/
│   │   │   └── board.js
│   │   ├── design-flow/
│   │   │   └── window.js
│   │   ├── ept/
│   │   │   └── window.js
│   │   ├── factory/
│   │   │   └── page.js
│   │   ├── pdi/
│   │   │   └── page.js
│   │   ├── site-measurement/
│   │   │   └── window.js
│   │   ├── pages.js
│   │   └── tracker.js
│   ├── pre-design/
│   │   ├── pages.js
│   │   ├── proposal-window.js
│   │   └── timeline-window.js
│   ├── shell/
│   │   └── shell.js
│   ├── side-panel/
│   │   └── rail.js
│   └── index.html
├── dist/ [generated source-release archive]
├── docs/
│   ├── ARCHITECTURE.md
│   ├── OPERATIONS.md
│   ├── PROJECT_STRUCTURE.md
│   └── VERIFICATION.md
├── mail/
│   ├── __init__.py
│   ├── keys.env.example
│   ├── README.md
│   └── send.py
├── management/
│   ├── analysis.js
│   ├── dashboard.js
│   ├── index.html
│   └── look.css
├── measurement/
│   ├── areas/
│   │   └── page.js
│   ├── backend/
│   │   ├── connection.py
│   │   ├── [private local configuration]
│   │   └── mapping.py
│   ├── common/
│   │   ├── live.js
│   │   ├── pieces.js
│   │   ├── source-model.js
│   │   └── tools.js
│   ├── overview/
│   │   └── page.js
│   ├── reports/
│   │   └── page.js
│   ├── request-window/
│   │   └── window.js
│   ├── requests/
│   │   └── page.js
│   ├── shell/
│   │   └── shell.js
│   ├── tests/
│   │   ├── fixture.js
│   │   ├── model.test.cjs
│   │   ├── storage_check.py
│   │   ├── test_connection.py
│   │   └── ui.html
│   ├── vendor/
│   │   ├── LEAFLET-LICENSE.txt
│   │   ├── leaflet.css
│   │   ├── leaflet.js
│   │   ├── world-outline.geojson
│   │   └── world-outline.LICENSE.txt
│   ├── .gitignore
│   ├── index.html
│   ├── look.css
│   ├── README.md
│   ├── server.py
│   └── start.cmd
├── online/
│   ├── bridge.js
│   └── build.py
├── post-sales/
│   └── README.md
├── pre-sales/
│   └── README.md
├── sales/
│   ├── approvals/
│   │   └── dashboard.js
│   ├── architects/
│   │   └── architects.js
│   ├── bin/
│   │   └── bin.js
│   ├── birds-eye/
│   │   └── strip.js
│   ├── booked/
│   │   └── dashboard.js
│   ├── common/
│   │   └── pieces.js
│   ├── date-filter/
│   │   └── filter.js
│   ├── follow-ups/
│   │   └── lists.js
│   ├── in-design/
│   │   ├── dashboard.js
│   │   └── dropdowns.js
│   ├── incentive/
│   │   └── box.js
│   ├── master-data/
│   │   └── table.js
│   ├── my-team/
│   │   └── page.js
│   ├── new-opportunity/
│   │   └── form.js
│   ├── notifications/
│   │   └── bell.js
│   ├── ocf/
│   │   ├── auto-sign.js
│   │   ├── ocf.js
│   │   └── terms.js
│   ├── order-cards/
│   │   └── cards.js
│   ├── payments/
│   │   └── dashboard.js
│   ├── qualified-leads/
│   │   ├── dashboard.js
│   │   └── dropdowns.js
│   ├── shell/
│   │   └── shell.js
│   ├── side-panel/
│   │   └── panel.js
│   ├── stage-board/
│   │   └── board.js
│   ├── team/
│   │   └── team.js
│   ├── token-due/
│   │   └── dashboard.js
│   ├── weekly-report/
│   │   └── report.js
│   ├── whatsapp/
│   │   ├── chat.js
│   │   └── README.md
│   └── index.html
├── scripts/
│   ├── backup.py
│   ├── build.py
│   └── check.py
├── shared/
│   ├── vendor/
│   │   ├── JSPDF-LICENSE.txt
│   │   └── jspdf.umd.min.js
│   ├── kit.js
│   ├── look.css
│   ├── master.js
│   ├── people.js
│   ├── pin.js
│   ├── rules.js
│   └── signals.js
├── sign/
│   ├── __init__.py
│   ├── keys.env.example
│   ├── README.md
│   ├── setup.py
│   └── zoho_sign.py
├── test/
│   ├── rules-tests.html
│   ├── save-errors.html
│   ├── whatsapp-link.html
│   └── whatsapp-mirror-demo.jpg
├── tests/
│   └── test_foundation.py
├── vercel/
│   ├── deploy.py
│   └── keys.env.example
├── windows-helper/
│   ├── helper.ps1
│   ├── install.cmd
│   ├── install.ps1
│   ├── README.md
│   ├── uninstall.cmd
│   └── uninstall.ps1
├── .env.example
├── .gitignore
├── CLAUDE.md
├── README.md
├── run.cmd
└── run.sh
```

## Where future changes belong

| Folder | Purpose |
|---|---|
| sales/, design/, measurement/, accounts/, management/ | Department screens and workflows |
| pre-sales/, post-sales/ | Existing lifecycle-specific modules |
| shared/ | Shared UI, design tokens and business rules |
| core/ | HTTP server, access checks and JSON persistence |
| measurement/backend/ | Live read-only Zoho integration |
| ai/, sign/, mail/ | Server-only external integrations |
| windows-helper/ | Existing Windows integration |
| tests/, test/, measurement/tests/ | API, model and browser tests |
| scripts/, .github/workflows/ | Check, build, backup and CI tooling |
| online/, vercel/ | Legacy encrypted-snapshot tooling |
| docs/ | Architecture, operations, verification and this tree |

See [ARCHITECTURE.md](ARCHITECTURE.md) for naming and dependency rules, and [OPERATIONS.md](OPERATIONS.md) for configuration, backups and rollback.
