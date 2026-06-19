# CV Ferret — Parking Lot

Ideas and options parked for future consideration. Not prioritised or committed.
Completed work lives in `DONE.md`.

---

## Unified manual import template (ready to implement)

Replace the current two-template manual import flow (separate experience and
education JSON files, plus a "go fill in personal details yourself" step) with
a single combined JSON template covering all sections. This also fixes the
inconsistency between the Dashboard "Getting started" copy (which implies
personal details are always extracted on import) and the manual path (which
currently can't import them at all).

### Why it's straightforward

The backend `POST /api/import/import-all` already accepts a combined payload:
`{ personalDetails, jobs, education, training, skills, languages, overwritePersonal }`.
No backend changes are needed — this is purely a frontend improvement.

### Implementation plan

**1. New combined template constant in `ImportPage.jsx`**

Replace `EXPERIENCE_TEMPLATE` and `EDUCATION_TEMPLATE` with a single `CV_TEMPLATE`:

```json
{
  "personalDetails": {
    "first_name": "", "last_name": "", "email": "", "phone": "",
    "address": "", "links": [], "date_of_birth": "", "place_of_birth": "", "gender": ""
  },
  "jobs": [{
    "employer": "Example Company", "job_title": "Job Title",
    "start_date": "2020-01-15", "end_date": null, "location": "City, Country",
    "notes": "",
    "tasks": [{ "description": "One bullet point per task.", "tags": [], "role_priorities": [] }]
  }],
  "education": [{ "institution": "University", "title": "Degree", "end_date": "Jun 2018", "notes": "" }],
  "training":  [{ "institution": "Provider", "title": "Certificate", "end_date": "Mar 2023", "notes": "" }],
  "skills": ["Skill One", "Skill Two"],
  "languages": [{ "language": "German", "level": "C1" }]
}
```

**2. Rewrite `ManualPath` component**

Replace the three separate steps (personal → navigate, experience → JSON upload,
education → JSON upload) with a single flow:

- Brief instruction: "Download the template, fill it in with your data, and upload it."
- One `TemplateDownload` button for `cv-template.json`
- One JSON file upload (replacing the two `ManualJsonImport` instances)
- Checkbox: **"Update personal details"** — unchecked by default. Shown only if
  `personalDetails` fields are present in the uploaded file. Warning: "This will
  overwrite your existing personal details." Mirrors the AI preview path.
- "Import" button → calls `importAPI.importAll({ ...data, overwritePersonal })`
- Inline success summary (reuse/extend the existing `buildSuccessMsg` /
  `ImportSummary` logic to cover all sections including personal)

**3. Simplify or retire `ManualJsonImport`**

The existing `ManualJsonImport` component handles the experience/education split
with an `isExperience` flag. With the combined template it's no longer needed in
that form — fold the upload/parse/import logic directly into the new `ManualPath`,
or extract a simpler `CombinedJsonImport` component if the logic warrants it.

**4. Update copy in `Dashboard.jsx`**

With personal details now importable via both paths, remove any planned AI caveat
from the Getting Started step 1 description.

**5. Update the `ManualPath` tile description in `ChoosePath`**

Current: "Download JSON templates, prepare your data using any tool you like, and
upload the files section by section."
New: "Download a single JSON template, fill it in, and upload it to import
everything at once."

### Files affected

- `src/renderer/components/ImportPage.jsx` — all changes live here
- `src/renderer/components/Dashboard.jsx` — minor copy tweak only

### Notes

- `importAPI.importAll()` is already wired up in `ipc.js` and used by the AI
  preview path — reuse it directly for the manual path.
- Keep `importAPI.importExperience()` and `importAPI.importEducation()` in
  `ipc.js` for now (don't delete until confirmed nothing else calls them).
- `overwritePersonal` checkbox should default to unchecked regardless of whether
  personal details data already exists — matching the AI path's conservative default.
- If the uploaded JSON has no `personalDetails` key, or all its string fields are
  empty, suppress the checkbox entirely.

---

## Guided setup walkthrough

A "walk me through setup" mode on the Dashboard — a step-by-step wizard that
guides new users through each setup task in sequence. Key design notes:

- Tasks should be user-controlled: each step has explicit "Mark complete" and
  "Come back to this" options, rather than auto-detecting completion from data
  state (which can be misleading).
- Consider whether this should replace the current checklist entirely, or sit
  alongside it as an opt-in mode.
- The import step should be first and prominent; settings (export path, API key)
  should follow; pool refinement last.
- When to consider: after the Dashboard onboarding redesign (Phase 8) is stable.

---

## Freeform AI mode

A complementary CV mode alongside the existing building-block approach. Instead
of selecting tasks and versions from the pool, the user pastes a job ad and
Claude rewrites all task descriptions in one go to match it.

**Core idea:** "paste-then-reshape" rather than "select-then-compose." Useful
when a role is unusual enough that existing versions don't fit and the user wants
a completely fresh framing.

**Key constraints:**
- Job headers (employer, title, dates, location) are locked — only task
  descriptions are rewritten
- AI rewrites are stored as a temporary "draft," separate from compositions;
  user explicitly saves approved rewrites back to the pool as new versions
- Education, skills, and languages sections are not touched

**Draft review UI:** side-by-side original vs. rewritten per task, with Approve /
Reject / Regenerate per task and optional structural suggestions (combine, expand,
de-emphasise) that the user can accept or ignore.

**Relation to current modes:** not a replacement for building-block assembly —
more useful for one-off applications to unusual roles, or for seeding the pool
with job-ad-tailored versions over time.

**Token/cost note:** rewrites the full pool in one call — could be expensive.
Mitigation: compress pool to default versions only; warn user before generating.

**When to consider:** now that the Import page and core workflow are stable.

---

## DOCX → Assembly import

Allow a user to open an existing DOCX CV directly as a new Assembly document for
editing. The document would not be pool-linked — it opens as an editable draft
only, not extracting jobs or tasks into the Experience Pool.

**What this requires:** a server-side route that runs mammoth in HTML mode
(`convertToHtml`) rather than text mode, returning structured HTML suitable for
the Tiptap editor. Currently the Import page's `extract-text` route runs mammoth
in text mode for AI extraction only; a separate route is needed for this path.

**Deliberately excluded from the Import page implementation** to avoid the
complexity of a second mammoth output mode and the UX risk of users expecting
pool extraction. If added, it should be clearly labelled as "open for editing
only" and a prominent warning ("This will NOT add your jobs or tasks to the
Experience Pool") preserved.

---

## Fluid and frozen CV states

Currently `cv_documents` are always snapshots: once a task is inserted into
Assembly, the document is independent of the pool. Editing a task in the pool
does not update any existing CV. This is correct behaviour for submitted CVs,
but can surprise users who edit a task in the pool expecting a draft CV to
reflect the change.

**Proposed model:** CVs have two states — *fluid* and *frozen*. A fluid CV
accepts updates when pool tasks it contains are edited. A frozen CV is a locked
snapshot. Freezing would happen explicitly (user action) or automatically when
the CV is linked to a job application.

**The hard problem:** if a user also edits a task bullet directly in Assembly,
there are now two sources of truth for that node. Syncing pool changes back
without overwriting in-Assembly edits is a merge problem. This is where the
implementation complexity lives.

**Simpler variant worth evaluating first:** rather than live sync, fluid state
means "notify the user when a pool item used in this CV has changed, with a
one-click update offer per changed item." No automatic rewrite, no merge
conflict. Same conceptual model, much lower implementation risk.

---

## Cover letter viewing options

Consider whether we need to allow a "Copy to other application" option for cover
letters. Users can already pick an existing cover letter to reuse in an
application, but there is a common use case where a user views an existing cover
letter and then wants to copy it to another application.

---

## Bulk edit for experience pool task descriptions

Over time, users might end up with quite many versions of each task description,
with minor differences. It would be useful to offer cleanup features that let
users delete multiple building blocks at once. Open questions before
implementing:

- What happens if a given building block is currently in use in a CV draft?
- Should bulk delete only be possible within a particular job, or across all
  building blocks for all jobs in the pool?
