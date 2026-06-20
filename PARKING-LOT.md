# CV Ferret — Parking Lot

Ideas and options parked for future consideration. Not prioritised or committed.
Completed work lives in `DONE.md`.

---

## Pool export and ID-aware reimport

Allow users to export their Experience Pool (and optionally education, skills,
and languages) as a JSON file in the same format as the import template — but
with internal IDs included. This creates a clean round-trip workflow:

1. **Export** — download the pool as JSON with IDs, employer names, job titles,
   dates, and all task versions intact.
2. **Edit externally** — add new task versions, tweak wording, restructure, or
   use the data in other tools entirely.
3. **Reimport** — upload the edited JSON. Jobs whose `id` matches an existing
   pool entry have tasks merged in rather than creating a duplicate job entry.
   Jobs without an `id` (or with an unrecognised one) are treated as new, as
   today.

**Why it matters for the target audience:** a technical user who already has CV
data in another tool (Notion, Obsidian, a spreadsheet, a bespoke script) gets
a stable, documented JSON contract to work against. CV Ferret becomes
interoperable rather than a walled garden, which is consistent with its
local-first, transparency-first ethos.

**Design notes:**
- The export format should be a strict superset of the import template — every
  valid export is a valid import, just with IDs added. No separate schema to
  maintain.
- IDs only matter at the job level for deduplication. Task IDs could be included
  for completeness (and future update-in-place scenarios) but aren't needed for
  the core merge behaviour.
- `ImportPreview` should make the merge behaviour visible: imported jobs that
  matched an existing entry should be labelled "merging into existing job" rather
  than "new job", so the user can see what will happen before confirming.
- A fuzzy-match fallback (employer + title) could be offered as a suggestion
  in `ImportPreview` for JSONs without IDs, letting users opt in to merging
  without needing to know the ID.
- Export should live on the Experience Pool page (and/or a dedicated Data
  page if one is ever added), not buried in Settings.

**When to consider:** after the Import page is stable. Export is a prerequisite
for the ID-aware reimport to be practical — without it, users would need to
inspect internal data to find IDs.

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
