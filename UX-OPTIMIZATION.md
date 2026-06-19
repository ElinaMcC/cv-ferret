# UX Optimization Plan

Implementation plan from the UX designer pass of the multi-persona app review
(see `PARKING-LOT.md` → "Full technical review of the app"). Items are
sorted by priority — highest-impact / lowest-effort first.

---

## 1. Fix Experience Pool layout at narrow widths (P0)

**Problem:** At ~380px viewport width, task rows collapse so badly that the
task description renders one character per line, vertically. The toolbar
(`Generate All` / `Import →` / `Add New Task`) also overflows the viewport.
This is the most-used page in the app and is currently unusable on a phone.

**Plan:**
- Add a `@media (max-width: 900px)` breakpoint to `ExperiencePool.css`
  (mirroring the approach already used in `CVLibrary.css`).
- Below the breakpoint, stack `.task-row` content: drag handle + description
  on one line, action icons (`edit`/`+`/`sparkle`/`delete`) wrapping onto
  their own row below rather than competing for horizontal space.
- Make the toolbar button group (`Generate All`, `Import →`, `Add New Task`)
  wrap onto multiple lines or stack vertically below the breakpoint instead
  of overflowing.
- Verify at 1400px, 900px, and 380px (same viewports used in the review).

**Files:** `src/renderer/components/ExperiencePool.css`,
`src/renderer/components/ExperiencePool.jsx` (only if structural changes are
needed to support stacking).

---

## 2. Fix Application Tracker layout at narrow widths (P0)

**Problem:** `.at-list-panel { flex: 0 0 320px }` is a hard-coded 320px
column with no fallback. At 380px it consumes almost the entire viewport and
pushes the detail pane off-screen (content visibly bleeds in from the right
edge). A stray full-width grey bar also appears at the bottom of the page.

**Plan:**
- Add a `@media (max-width: 900px)` breakpoint to `ApplicationTracker.css`.
- Below the breakpoint, switch `.at-page` from a fixed two-column layout to
  a single-column layout: list panel takes full width, and the detail pane
  is either shown/hidden based on selection (mobile drill-down pattern) or
  stacks below the list.
- Investigate and fix the full-width grey bar artifact at the bottom of the
  page (likely an overflow/sizing issue on `.at-page` or a parent container).
- Verify at 1400px, 900px, and 380px.

**Files:** `src/renderer/components/ApplicationTracker.css`,
`src/renderer/components/ApplicationTracker.jsx` (only if the
show/hide-detail-pane pattern requires new state).

---

## 3. Accessibility: add `aria-label` to icon-only buttons (P1)

**Problem:** Several icon-only buttons use `title="Edit"` / `title="Delete"`
but no `aria-label`, violating the CLAUDE.md rule that "Icon-only buttons
must have `aria-label`". `title` alone is not a reliable substitute for
screen readers.

**Plan:** Add `aria-label` (matching or improving on the existing `title`
text — prefer specific labels like "Edit education entry" over generic
"Edit" where context is lost for screen reader users) to:
- `EducationPage.jsx` — edit/delete/remove icon buttons on education
  entries, training entries, and language rows.
- `ReferencePage.jsx` — delete button on each reference document.
- `ExperiencePool.jsx` — the ~6 icon buttons that currently only have
  `title` (audit all `icon-btn` usages; 5 of ~11 already have `aria-label`).

This is mechanical and low-risk — no layout changes required.

**Files:** `src/renderer/components/EducationPage.jsx`,
`src/renderer/components/ReferencePage.jsx`,
`src/renderer/components/ExperiencePool.jsx`.

---

## 4. Fix New CV dialog overflow on short/narrow viewports (P1)

**Problem:** `.asm-dialog-overlay` has no `overflow-y: auto`. On a short or
narrow viewport, the "Start a new CV" dialog can be taller than the screen
with no way to scroll down to the "Create CV" button — a dead end.

**Plan:**
- Add `overflow-y: auto` to `.asm-dialog-overlay` and `max-height: 90vh` (with
  `overflow-y: auto`) to `.asm-dialog` so the dialog scrolls internally
  rather than clipping off-screen.
- Verify by shrinking the browser window height with the dialog open.

**Files:** `src/renderer/components/Assembly/Assembly.css`.

---

## 5. Fix Personal Details 3-column row at narrow widths (P2)

**Problem:** `.personal-form-row { display: flex; gap: 16px }` with three
equal `flex: 1` fields (Gender / Date of Birth / Place of Birth) squeezes the
third field to ~50px at 380px — "Place of Birth" wraps to three lines and the
input shows only a single character.

**Plan:**
- Add a `@media (max-width: 600px)` breakpoint to `PersonalDetails.css` that
  switches `.personal-form-row` from `flex-direction: row` to `column` (each
  field gets full width, stacked).
- Verify at 380px.

**Files:** `src/renderer/components/PersonalDetails.css`.

---

## 6. Fix Reference Letters filename truncation (P2)

**Problem:** Document filenames truncate mid-word with no
`text-overflow: ellipsis`, so titles like "Alpega Recommenda" look broken
rather than intentionally shortened.

**Plan:**
- Apply `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (or
  a `-webkit-line-clamp` multi-line clamp, if multi-line is preferred) to the
  document title element in `ReferencePage.css`.
- Verify at 380px that filenames truncate cleanly with a visible ellipsis.

**Files:** `src/renderer/components/ReferencePage.css`.

---

## 7. Improve cover letter discoverability (P3)

**Problem:** Cover letters have no dedicated nav entry — they live inside
the Application Tracker, per-application. This is documented in the Help
page, but a first-time user scanning the sidebar for "Cover Letters" (a
feature mentioned prominently in the README) won't find it there.

**Plan:**
- Add a short cross-link or note on the Dashboard (or within Application
  Tracker itself) pointing out that cover letters live per-application in
  the Application Tracker, so new users don't go searching the sidebar for a
  page that doesn't exist.
- No structural changes — this is a discoverability/copy fix only.

**Files:** `src/renderer/components/Dashboard.jsx` and/or
`src/renderer/components/ApplicationTracker.jsx` (copy only).

---

## 8. Dark mode visual pass (P3 — do last)

**Problem:** Dark mode wasn't spot-checked during this review. Given how much
CSS is bespoke per-page rather than using shared tokens consistently, a
visual pass is worth doing — but only once the layout changes above have
landed, so it isn't checking a layout that's about to change.

**Plan:**
- After items 1–6 are complete, toggle dark mode and re-screenshot all pages
  at 1440px and 380px, checking for contrast issues, hardcoded colours that
  don't respond to the dark theme, and any new layout regressions introduced
  by the responsive fixes above.

**Files:** TBD based on findings.

---

## 9. Consolidate Dashboard onboarding for new users (P2 — open, needs more planning)

**Problem:** For a brand-new user (`jobCount === 0 && cvDocumentCount === 0`),
the Dashboard shows three separate, non-cross-referencing onboarding
mechanisms at once:

1. **"How it works"** — a collapsible guide, auto-expanded.
2. **"Getting started" checklist** — including an "Experience added: add at
   least one job to your experience pool" item.
3. **"Already have a CV?"** — a dismissible Import invitation card.

Items 2 and 3 address the same gap (empty pool) with different framings and
no link between them — the checklist implies manual entry is the only way,
while the import card offers an alternative path, but neither references the
other. These accreted independently as Import and the checklist were each
added in separate phases.

**Plan (needs further thought before implementation):**
- Consider folding the Import option into the "Experience added" checklist
  item itself (e.g. "Add a job manually, or import an existing CV") rather
  than running it as a separate card.
- Decide whether "How it works" should also reference Import as a
  fast-start option.
- Open question: does removing the standalone Import card reduce its
  visibility for users who skip past the checklist? May need a design pass
  rather than a quick copy fix.

**Files:** `src/renderer/components/Dashboard.jsx`.

---

## Suggested order of work

1. Experience Pool responsive fix (P0)
2. Application Tracker responsive fix (P0)
3. `aria-label` sweep (P1, quick win, can be done independently/in parallel)
4. New CV dialog overflow fix (P1, quick win)
5. Personal Details responsive fix (P2)
6. Reference Letters truncation fix (P2)
7. Cover letter discoverability copy (P3)
8. Dark mode pass (P3, last)
9. Dashboard onboarding consolidation (P2, open — revisit with more design thought before implementing)
