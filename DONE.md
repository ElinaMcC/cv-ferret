# CV Ferret — Done

Completed work and architectural decisions. Each entry records what was done,
why, and where it landed (branch / commit). Moved here from `PARKING-LOT.md`
once the work was fully shipped.

---

## Architectural decision: Express on localhost (not Electron)

The app runs as an Express server on localhost, distributed via `pkg` as a
Windows `.exe`. A console window stays open while the app is running, and
unsigned builds trigger Windows SmartScreen on first launch.

Two options were evaluated:

**Option A — Electron wrapper (low effort)**
Keep Express running in-process; wrap it in an Electron `BrowserWindow`. No
console window, proper taskbar entry, ~60 lines of new Electron glue code, all
existing source files unchanged. Downside: still an HTTP server inside a
desktop app; binary size jumps to ~150–200 MB; port conflict risk remains.

**Option B — Full Electron IPC (proper Electron architecture)**
Replace the HTTP layer entirely. All Express routes become `ipcMain.handle()`
handlers; all `ipc.js` fetch calls become `ipcRenderer.invoke()`. Native file
dialogs via `dialog.showOpenDialog()`. Cleaner architecture, no internal HTTP
server, but a large rewrite touching every route and every API call.

**Decision:** kept as-is. The Express-in-browser approach is the interesting,
opinionated thing about this project. For a developer audience, hiding the
machinery in an Electron shell adds weight without adding value. If the native
desktop feel becomes a priority, do it properly with Option B rather than the
half-measure of Option A.

**Note on SmartScreen:** neither option fixes the Windows warning on its own —
that requires a code signing certificate. `electron-builder` has good signing
support if that path is taken.

---

## Import page (Phases 1–6)

Unified Import page replacing all scattered import modals. Primary onboarding
entry point. Design decisions documented in Claude memory (`project_import_page.md`).

### Phase 1 — Backend foundation ✅

- `POST /api/import/extract-text` — file upload (DOCX, PDF, Markdown/txt),
  returns extracted plain text. Mammoth in text mode for DOCX, pdf-parse for
  PDF, direct read for Markdown.
- `POST /api/import/extract-with-ai` — accepts `{ cvText }`, sends to Claude
  with a structured extraction prompt using tool_use for reliable structured
  output, returns `{ personalDetails, jobs, education, training, skills,
  languages }`. PII stripping deliberately NOT applied (user is extracting
  their own data).
- `POST /api/import/import-all` — accepts the confirmed preview object plus
  `{ overwritePersonal: boolean }`, saves each section simultaneously, returns
  a summary `{ personal: saved|skipped, jobs: N, tasks: N, education: N, … }`.
- Extraction prompt: one job entry per role (not per employer), one task per
  bullet point verbatim, extract personal details from header, handle unusual
  date formats, ambiguities noted in a `notes` field.

### Phase 2 — Import page component ✅

- `ImportPage.jsx` + `ImportPage.css`, added to `App.jsx` NAV with
  `ArrowDownTrayIcon`, between Application Tracker and Settings.
- File upload (drag-and-drop, `.docx .pdf .md .txt`) and paste textarea;
  both paths converge after text extraction.
- PII notice alongside input: non-scary framing, placeholder suggestion.
- AI extraction flow: "Extract with AI" button → "Reading your CV…" loading
  state → editable preview.
- Manual path (AI disabled): step-by-step instructions, downloadable JSON
  templates, JSON file pickers replacing the retired `ImportModal`.

### Phase 3 — Editable preview component ✅

- `ImportPreview.jsx` — four collapsible sections: Personal Details, Work
  History, Education & Skills, summary.
- Personal details: side-by-side comparison (current vs. extracted), checkbox
  unchecked by default, warning label.
- Work history: collapsible job entries with editable tasks; delete individual
  tasks or whole jobs.
- Education & Skills: editable list entries, skills, languages; each editable
  or deletable.
- All extracted data is directly editable inline — no AI round-trips for
  corrections.
- Import button: calls import-all, shows progress, then success summary with
  links to Experience Pool and Education.

### Phase 4 — AI knowledge base ✅

Implemented separately on `feature/ai-chat-knowledge-base` (merged to main,
commit `dbe01ca`) — no dependency on the Import page. Content factored into
`src/shared/appKnowledge.json`, consumed by both `aiChat.js` system prompt
and a new in-app Help page for users without AI enabled. See `CLAUDE.md`
"App knowledge" section for the maintenance convention.

### Phase 5 — Navigation and integration ✅

- Dashboard import invitation card (shown when no jobs exist, dismissible).
- Experience Pool and Education & Skills: retired `ImportModal`, replaced with
  "Import →" links to the Import page.
- Deleted `ImportModal.jsx` and `ImportModal.css`.

### Phase 6 — Polish and documentation ✅

- README updated: new "Import" feature section, replaced old scattered import
  docs with a single unified section, updated API and File Structure tables.
- `CLAUDE.md` updated: "Import" section naming `ImportPage.jsx` as the
  canonical home for all imports.
- `StartNewCVDialog`: removed "Import from Markdown" mode and now-unused
  `marked` dependency; added hint linking to Import page.

### Constraints and decisions

- Import is additive only — no "replace all" option; personal details
  overwrite requires explicit opt-in checkbox.
- Tool use (structured output) preferred over text completion for AI
  extraction — more reliable schema adherence.
- Reference letters and cover letters are deliberately not part of this flow.
- `pdf-parse` added as a new backend dependency; `mammoth` was already
  installed.

---

## Responsiveness improvements

**CV Library** was the worst offender — the fixed-width profile sidebar
squeezed CV titles down to a sliver. Fixed early (before the full technical
review): at `≤900px`, the profile list becomes a horizontally scrollable strip
of chips above the detail panel, and CV doc rows wrap so the title gets the
full width on line one and date/actions wrap to a right-aligned second line.

All other screens (Experience Pool, Application Tracker, Education & Skills,
Assembly, Personal Details) were reviewed and fixed as part of the
optimization plan Phases 2–7 below.

---

## Full technical review + optimization plan (Phases 0–10)

A comprehensive review of the whole app from four perspectives: UX designer,
product architect, code quality expert, and test engineer. Produced three
prioritised plans (`UX-OPTIMIZATION.md`, `CODE-QUALITY-OPTIMIZATION.md`,
`TEST-OPTIMIZATION.md`) which were merged into one 11-phase implementation
plan to minimise repeated passes over the same files.

Product architect findings were small enough to action directly
(`appKnowledge.json` nav sync fixed; Dashboard onboarding overlap folded into
UX item 9).

### Phase 0 — Shared primitives ✅ (`0f4661d`)

`shared.css` with `.modal-overlay` / `.modal-dialog` / `.icon-btn`; new
`ConfirmDialog.jsx`; `utils/dates.js` shared formatters; `ipc.js` PII logging
fix; `CLAUDE.md` doc updates (shared UI patterns section).

### Phase 1 — Backend test suite ✅ (`0f4661d`)

`db.test.js` (backup/restore/migration), `jobsAndTasks.test.js` (full
Experience Pool data model), `aiRouteGuard.test.js` (AI route guard invariant).
Suite grew from 53 to 100 tests.

### Phase 2 — Experience Pool ✅ (`10c8ce8`)

Migrated to shared `ConfirmDialog` / `.icon-btn`; `@media (max-width: 900px)`
responsive fix for task rows and toolbar; aria-label sweep on icon buttons.

### Phase 3 — Application Tracker ✅ (`0293daf`)

Export modal migrated to shared classes; `window.confirm` replaced with
`<ConfirmDialog>`; local `formatDate` removed in favour of `utils/dates.js`;
`@media (max-width: 900px)` single-column layout; fixed "stray grey bar" root
cause (`.at-page` height/margin).

### Phase 4 — Education & Reference pages ✅ (`bf525d0`)

Removed duplicated local `.icon-btn` blocks; migrated deletes to
`<ConfirmDialog>`; aria-label sweep; `@media (max-width: 600px)` stacking fix
for entry rows; confirmed Reference Letters filename truncation already correct.

### Phase 5 — Assembly & dialogs ✅ (`e4961a2`)

`Assembly.css` imports `shared.css`; removed eight duplicated dialog/overlay
class blocks. Migrated `SaveAsCvModal`, `PoolBuildingBlocksDialog`,
`DeleteCvConfirmDialog`, `NavGuardDialog`, `StartNewCVDialog`, and
`SaveToApplicationModal` to shared classes with `useFocusTrap` +
`aria-labelledby`. Replaced `.pool-icon-btn` with `.icon-btn` in
`PoolDrawer.jsx` and `AIChatPanel.jsx`. New CV dialog no longer overflows at
380×420.

### Phase 6 — CV Library & Settings ✅ (`9d3a7b3`)

`CVLibrary.css` imports `shared.css`; removed duplicated `.modal-overlay`
(was 0.45 opacity vs shared 0.5); renamed modal classes to shared equivalents.
`DeleteConfirmModal` and `BulkDeleteConfirmModal` migrated to `<ConfirmDialog>`
(extended to accept JSX `body`). Both `window.confirm()` calls in `Settings.jsx`
replaced with `<ConfirmDialog>`. `.cvlib-icon-btn` deliberately left as-is —
genuinely different visual style (bordered row-action buttons).

### Phase 7 — Personal Details ✅ (`82ed55b`)

`@media (max-width: 600px)` rule switching `.personal-form-row` to column
layout — fixes "Place of Birth" squeezing to ~50px at 380px. Added
`aria-label` to the `.link-remove` "×" button.

### Phase 8 — Dashboard onboarding ✅ (`d9d1481`, `feature/phase-8-dashboard-onboarding`)

Replaced "How it works" guide, import invitation card, and setup checklist
with a single "Getting started" section. Import is the primary first step;
manual entry is a subordinated alternative. "Before you start" pared to two
actionable items (export path + API key). Steps 3–5 reframed as outcomes.
Checklist removed; guided wizard idea parked in `PARKING-LOT.md`.

### Phase 9 — Feature tests ✅ (`464f05c`, `feature/phase-9-tests`)

`import.test.js`: 17 tests covering `importExperience` (round-trips,
empty-description skipping, whitespace trimming, tag/role-priority storage)
and `importEducation` (skill deduplication, language upserts, partial
payloads).

`cvLibrary.test.js`: 25 tests covering `batchDeleteCvDocuments` (cross-
reference nulling), `batchMoveCvDocuments` (profile reassignment),
`batchDeleteProfiles` (with/without `deleteCvDocs`), `batchDeleteJobs` and
`batchDeleteTasks` (cascade deletion).

Suite: 142/142.

### Phase 10 — Dark mode audit + Playwright smoke suite ✅ (`313b912`, `feature/phase-9-tests`)

**Playwright:** `@playwright/test` added as devDependency; `playwright.config.js`
targets dev server on `:5173` with `reuseExistingServer`; `npm run test:e2e`
script added. `e2e/smoke.spec.js`: 9 tests — Experience Pool renders at
1440/900/380px; Assembly Start New CV dialog (aria-labelledby, Cancel, 380px
usability); CV Library responsive layout (column at 1440px, row strip at
900px, no overflow at 380px).

**Dark mode CSS audit:** replaced hardcoded hex colours with CSS variables in
6 component files — `ExperiencePool.css` (tag/badge colours, card bg, success
banner, error border), `ExperienceForm.css` (tag/role-priority badges, error
border), `EducationPage.css` (skill chips, language level badge, error border),
`ReferencePage.css` (ref tags, error border), `PersonalDetails.css` (link-item
bg, hover colour, error border), `InfoTip.css` (trigger border/colour,
hover bg, bubble bg/text/arrow). All variables already defined in `index.css`
for both themes — no new variables needed.

Unit suite: 142/142. E2E suite: 9/9.

---

## Unified manual import (single template + shared preview)

Replaced the three-step manual import flow (separate experience and education
JSON templates, personal details handled by a "go fill it in yourself" redirect)
with a single combined JSON template covering all sections. The manual path now
feeds into the same `ImportPreview` review screen as the AI path, giving users
an edit-before-commit experience regardless of import method.

Also added an existing-data warning on the choose-path screen: when the
Experience Pool is non-empty, users are informed that import is additive and
does not deduplicate — with a direct link to the pool to check before proceeding.

**Changes:**
- `src/renderer/components/ImportPage.jsx` — single `CV_TEMPLATE` constant;
  `ManualPath` reduced to file upload → parse → `ImportPreview`; existing-data
  warning fetched via `dashboardAPI.getSummary()`
- `src/renderer/components/ImportPage.css` — removed old step-card styles;
  added warning banner styles
- `src/renderer/components/ImportPreview.jsx` — copy made path-neutral
  ("Review before importing" / "Review the data below…")

**Landed:** commit `a95d2f3` on `feature/phase-9-tests`
