# CV Ferret — Parking Lot

Ideas and options parked for future consideration. Not prioritised or committed.

---

## Desktop packaging: Electron migration

The app currently runs as an Express server on localhost, distributed via `pkg` as a Windows `.exe`. A console window stays open while the app is running, and unsigned builds trigger Windows SmartScreen on first launch.

Two options were evaluated:

**Option A — Electron wrapper (low effort)**
Keep Express running in-process; wrap it in an Electron `BrowserWindow`. No console window, proper taskbar entry, ~60 lines of new Electron glue code, all existing source files unchanged. Downside: still an HTTP server inside a desktop app; binary size jumps to ~150-200MB; port conflict risk remains.

**Option B — Full Electron IPC (proper Electron architecture)**
Replace the HTTP layer entirely. All Express routes become `ipcMain.handle()` handlers; all `ipc.js` fetch calls become `ipcRenderer.invoke()`. Native file dialogs via `dialog.showOpenDialog()`. Cleaner architecture, no internal HTTP server, but a large rewrite touching every route and every API call.

**Decision:** kept as-is for now. The Express-in-browser approach is the interesting, opinionated thing about this project. For a developer audience, hiding the machinery in an Electron shell adds weight without adding value. If the native desktop feel becomes a priority, do it properly with Option B rather than the half-measure of Option A.

**Note on SmartScreen:** neither option fixes the Windows warning on its own — that requires a code signing certificate. `electron-builder` has good signing support if that path is taken.

---

## Import page — full task plan

Unified Import page replacing all scattered import modals. Primary onboarding entry point. Design decisions documented in Claude memory (project_import_page.md).

### Phase 1 — Backend foundation

**1.1** Add `pdf-parse` as a dependency for server-side PDF text extraction.

**1.2** New route `POST /api/import/extract-text` — accepts a file upload (DOCX, PDF, Markdown) and returns extracted plain text. Uses mammoth for DOCX (text mode, not HTML), pdf-parse for PDF, direct read for Markdown/txt. This is the input layer for AI extraction.

**1.3** New route `POST /api/import/extract-with-ai` — accepts `{ cvText: string }`, sends to Claude with a structured extraction prompt, returns a unified preview object: `{ personalDetails, jobs, education, training, skills, languages }`. Uses tool_use for reliable structured output. PII stripping deliberately NOT applied (user is extracting their own data).

**1.4** New route `POST /api/import/import-all` — accepts the confirmed preview object plus `{ overwritePersonal: boolean }`. Saves each section to the correct place simultaneously. Returns a summary: `{ personal: saved|skipped, jobs: N, tasks: N, education: N, ... }`.

**1.5** Write the extraction system prompt. Key requirements: one job entry per role (not per employer), one task per bullet point verbatim, extract personal details from header, handle unusual date formats, note ambiguities as a `notes` field.

---

### Phase 2 — Import page component

**2.1** Create `ImportPage.jsx` + `ImportPage.css`. Add to App.jsx routing and NAV array with ArrowDownTrayIcon, between Application Tracker and Settings.

**2.2** Input section — file upload (drag-and-drop, accepts .docx .pdf .md .txt) and paste text textarea. File upload calls extract-text route to get plain text, then proceeds identically to paste path.

**2.3** PII notice — shown alongside the input. Non-scary: "Your CV text will be sent to Claude for extraction. To avoid sending personal details, replace them with placeholders before uploading and correct them in the app afterwards."

**2.4** AI extraction flow — "Extract with AI" button, loading state ("Reading your CV…"), then renders editable preview component.

**2.5** Manual (no-AI) path — shown when AI is disabled. Contains: step-by-step instructions, downloadable JSON templates, "Import experience JSON" and "Import education JSON" file pickers (replaces existing modals), personal details link.

---

### Phase 3 — Editable preview component

**3.1** `ImportPreview.jsx` — receives the extracted preview object. Four collapsible sections: Personal Details, Work History, Education & Skills, summary.

**3.2** Personal details section — if existing data is present, shows side-by-side comparison (current vs. extracted). Checkbox unchecked by default: "Update my personal details." Warning label on the checkbox.

**3.3** Work history section — collapsible job entries, each with editable tasks. User can delete individual tasks or whole jobs.

**3.4** Education & Skills section — editable list entries, skills, languages. Each editable or deletable.

**3.5** Inline editing — all extracted data is directly editable in the preview before import. Users can correct any field: edit job titles, employer names, task descriptions, dates; delete individual tasks or whole jobs; edit or remove education and skills entries. No AI round-trips required for corrections.

**3.6** Import button — calls import-all, shows progress, then success summary with links to Experience Pool and Education.

---

### Phase 4 — AI knowledge base

**4.1** Add CV Ferret app knowledge to the Assembly `aiChat.js` system prompt (applies to all AI chat). Key knowledge: what the pool is, versions, profiles, cover letters location, how pool drawer works, common first-use questions.

---

### Phase 5 — Navigation and integration

**5.1** Dashboard import invitation card — shown when `stats.jobCount === 0`. Dismissible. "Already have a CV? Get started in minutes." Button navigates to Import page. Disappears once jobs exist.

**5.2** Experience Pool — retire ImportModal, replace button with link to Import page.

**5.3** Education & Skills — same: retire ImportModal, replace with link.

**5.4** Delete `ImportModal.jsx` and `ImportModal.css` (or keep as internal utility if needed by manual JSON path — evaluate at build time).

---

### Phase 6 — Polish and documentation

**6.1** Update README: add Import page description near top of Features. Update the existing "Importing your existing CV data" section to reference the page.

**6.2** Update CLAUDE.md: Import page is canonical home for all imports; note deliberate PII exception for AI extraction.

**6.3** StartNewCVDialog — remove the "Import from Markdown" mode (Import page is now the canonical entry point for bringing documents into the app). Add a hint or link in the dialog directing users who want to import an existing CV to the Import page.

---

### Constraints and notes

- `pdf-parse` is a new backend dependency; `mammoth` already installed
- Tool use (structured output) preferred over text completion for extraction — more reliable
- Extraction prompt quality is critical; expect iteration
- The editable preview is the most complex frontend component — allow real time for it
- Import is additive only; no "replace all" option; personal details overwrite requires explicit confirmation
- Reference letters and cover letters are NOT part of this flow

---

## Freeform AI mode

A complementary CV mode alongside the existing building-block approach. Instead of selecting tasks and versions from the pool, the user pastes a job ad and Claude rewrites all task descriptions in one go to match it.

**Core idea:** "paste-then-reshape" rather than "select-then-compose." Useful when a role is unusual enough that existing versions don't fit and the user wants a completely fresh framing.

**Key constraints:**
- Job headers (employer, title, dates, location) are locked — only task descriptions are rewritten
- AI rewrites are stored as a temporary "draft," separate from compositions; user explicitly saves any approved rewrites back to the pool as new versions
- Education, skills, and languages sections are not touched

**Draft review UI:** side-by-side original vs. rewritten per task, with Approve / Reject / Regenerate per task and optional structural suggestions (combine, expand, de-emphasise) that the user can accept or ignore.

**Relation to current modes:** not a replacement for building-block assembly — more useful for one-off applications to unusual roles, or for seeding the pool with job-ad-tailored versions over time.

**Token/cost note:** rewrites the full pool in one call — could be expensive. Mitigation: compress pool to default versions only; warn user before generating.

**When to consider:** after the Import page is complete and the core workflow is stable.

---

## DOCX → Assembly import

Allow a user to open an existing DOCX CV directly as a new Assembly document for editing. The document would not be pool-linked — it opens as an editable draft only, not extracting jobs or tasks into the Experience Pool.

**What this requires:** a server-side route that runs mammoth in HTML mode (`convertToHtml`) rather than text mode, returning structured HTML suitable for the Tiptap editor. Currently the Import page's `extract-text` route runs mammoth in text mode for AI extraction only; a separate route is needed for this path.

**Deliberately excluded from the Import page implementation** to avoid the complexity of a second mammoth output mode and the UX risk of users expecting pool extraction. If added, it should be clearly labelled as "open for editing only" and the prominent warning from the original design ("This will NOT add your jobs or tasks to the Experience Pool") should be preserved.

---

## Fluid and frozen CV states

Currently cv_documents are always snapshots: once a task is inserted into Assembly, the document is independent of the pool. Editing a task in the pool does not update any existing CV. This is correct behaviour for submitted CVs, but can surprise users who edit a task in the pool expecting a draft CV to reflect the change.

**Proposed model:** CVs have two states — *fluid* and *frozen*. A fluid CV accepts updates when pool tasks it contains are edited. A frozen CV is a locked snapshot. Freezing would happen explicitly (user action) or automatically when the CV is linked to a job application.

**The hard problem:** if a user also edits a task bullet directly in Assembly, there are now two sources of truth for that node. Syncing pool changes back into the document without overwriting the user's in-Assembly edits is a merge problem. This is where the implementation complexity lives.

**Simpler variant worth evaluating first:** rather than live sync, fluid state means "notify the user when a pool item used in this CV has changed, with a one-click update offer per changed item." No automatic rewrite, no merge conflict. Same conceptual model, much lower implementation risk.

**When to consider:** the CV Library bulk-edit feature (select/move/delete) is now complete and stable. Requires a significant rethink of the Assembly/pool relationship and the cv_document schema.

---

## Cover letter viewing options

Consider whether we need to allow a "Copy to other application" option for cover letters. Users can already pick an existing cover letter to reuse in an application, but there is a common use case where a user views an existing cover letter, and then wants to copy that over to some other application.

---

## Responsiveness improvements

Some of the screens (notably the CV library) don't resize well: item names are covered, the profiles list takes up too much space. There is probably a better way to break up the layout when a user resizes to smaller or partial screen.

---

## Bulk edit for experience pool task descriptions

Over time, users might end up with quite many versions of each task description, with minor differences. It would be useful to offer cleanup features that let users delete multiple building blocks at once. There are some questions that need to be answered first. Users will need clarity about what happens if a given building block is currently in use in a CV draft. Should bulk delete only be possible within a particular job, or across all building blocks for all jobs in the pool?