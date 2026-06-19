# Code Quality Optimization Plan

Implementation plan from the code quality pass of the multi-persona app
review (see `PARKING-LOT.md` → "Full technical review of the app"). Items
are sorted by priority — highest value / most foundational first, since
several items below build on the shared primitives introduced by item 1.

---

## 1. Extract shared overlay + dialog + icon-button primitives into `shared.css` (P0)

**Problem:** Four near-identical modal overlay implementations exist
(`.modal-overlay` in `CVLibrary.css`, `.asm-dialog-overlay` in
`Assembly.css`, `.at-modal-overlay` in `ApplicationTracker.css`,
`.ep-confirm-overlay` in `ExperiencePool.css`), with inconsistent overlay
opacity (0.40–0.50) and **inconsistent z-index (200 / 500 / 1000 / 1000)** —
a latent stacking bug if two ever need to coexist. Separately, `.icon-btn`
is redefined near-identically in `ExperiencePool.css`, `EducationPage.css`,
and `ReferencePage.css` (all three already import `shared.css` but redefine
it locally), plus two more variants with different names
(`.cvlib-icon-btn`, `.pool-icon-btn`).

**Plan:**
- Add to `shared.css`: a single `.modal-overlay` / `.modal-dialog` pair
  (fixed positioning, consistent opacity, single z-index tier) and a single
  `.icon-btn` definition.
- Update `CVLibrary.css`, `Assembly.css`, `ApplicationTracker.css`,
  `ExperiencePool.css`, `EducationPage.css`, `ReferencePage.css` to import
  `shared.css` (if not already) and use the shared classes, removing their
  local duplicates (`.cvlib-icon-btn`, `.pool-icon-btn`, `.at-modal-overlay`,
  etc.) — or keep the prefixed names as thin aliases only if a component
  genuinely needs an override, not as full redefinitions.
- This is the foundation for items 2 and 3 below — do this first.

**Files:** `src/renderer/styles/shared.css`, plus the six component CSS
files named above.

---

## 2. Shared `<ConfirmDialog>` component (P0)

**Problem:** Destructive confirmations use three different approaches:
six `window.confirm()` calls (`ApplicationTracker.jsx`, `EducationPage.jsx`
×2, `ReferencePage.jsx`, `Settings.jsx` ×2) — unstyled, ignores dark mode,
not accessible per CLAUDE.md; a bespoke styled overlay in
`ExperiencePool.jsx` (`.ep-confirm-overlay`); and a bespoke modal in
`CVLibrary.jsx` for bulk-delete warnings.

**Plan:**
- Build `src/renderer/components/ConfirmDialog.jsx` on top of the shared
  overlay/dialog from item 1, with focus trap (`useFocusTrap`) and
  `aria-labelledby` built in by default.
- Replace all six `window.confirm()` call sites with it.
- Replace `ExperiencePool.jsx`'s `.ep-confirm-overlay` with it.
- Leave `CVLibrary.jsx`'s bulk-delete modal as-is if its content needs are
  too different (list of affected items, etc.), but consider whether it can
  use `<ConfirmDialog>` as its outer shell.

**Files:** new `src/renderer/components/ConfirmDialog.jsx` (+ `.css`),
`ApplicationTracker.jsx`, `EducationPage.jsx`, `ReferencePage.jsx`,
`Settings.jsx`, `ExperiencePool.jsx`.

---

## 3. Apply focus trap + `aria-labelledby` to remaining dialogs (P1)

**Problem:** CLAUDE.md requires dialogs to trap focus and have
`aria-labelledby`. `CVLibrary.jsx` and `Assembly/AssemblyPage.jsx` do this
fully. `ApplicationTracker.jsx` does it partially. **`StartNewCVDialog.jsx`**
— the dialog every new CV goes through — and `SaveToApplicationModal.jsx`
have **neither**.

**Plan:**
- Audit every `role="dialog"` in the app (currently: `ApplicationTracker`,
  `CVLibrary` ×2, `AssemblyPage` ×2, `SaveToApplicationModal` ×2,
  `StartNewCVDialog`).
- Apply `useFocusTrap` and `aria-labelledby` (pointing at the dialog title)
  to each one that's missing it, starting with `StartNewCVDialog` (highest
  traffic).
- If item 1's shared `.modal-dialog` wrapper is built to include these by
  default, this becomes largely "migrate to the shared wrapper" rather than
  a per-file fix.

**Files:** `Assembly/StartNewCVDialog.jsx`,
`Assembly/SaveToApplicationModal.jsx`, `ApplicationTracker.jsx`
(remaining gap).

---

## 4. Remove unconditional debug logging from `ipc.js` (P0 — quick win)

**Problem:** `src/renderer/services/ipc.js` lines 13 and 16
unconditionally `console.log` every API request and response **including
full bodies** — for an app that handles personal data (names, addresses,
CV content, AI prompts), this means PII is routinely written to the browser
console in normal use. Looks like a debugging leftover.

**Plan:**
- Remove the two `console.log` calls, or gate them behind
  `import.meta.env.DEV` if request/response logging is still wanted during
  development.
- Quick, isolated, no dependencies on other items — do this any time.

**Files:** `src/renderer/services/ipc.js`.

---

## 5. Consolidate `formatDate` into a shared util (P2)

**Problem:** `ApplicationTracker.jsx` and `ImportPreview.jsx` each define
their own `formatDate` with different signatures (full date vs. month/year
from a `YYYY-MM` string), both hardcoding `en-GB` per the CLAUDE.md
localisation note — but CLAUDE.md only documents the `ApplicationTracker`
copy.

**Plan:**
- Create `src/renderer/utils/dates.js` exporting both formatters (e.g.
  `formatDate` and `formatMonthYear`) with clear names reflecting their
  different inputs.
- Update `ApplicationTracker.jsx` and `ImportPreview.jsx` to import from
  there instead of defining locally.
- Update the CLAUDE.md localisation section to point at the new shared
  location instead of `ApplicationTracker.jsx`.

**Files:** new `src/renderer/utils/dates.js`, `ApplicationTracker.jsx`,
`ImportPreview.jsx`, `CLAUDE.md`.

---

## 6. Split `Assembly.css` (P3 — opportunistic only)

**Problem:** `Assembly/Assembly.css` is 1,851 lines — by far the largest
stylesheet in the app, covering the editor, dialogs, and pool drawer
together.

**Plan:**
- Not worth a dedicated pass on its own. If item 1 or 3 already requires
  editing `Assembly.css`, take the opportunity to split it into
  `Assembly.css` (editor), `AssemblyDialogs.css`, and `PoolDrawer.css`.
- Do not schedule this as standalone work.

**Files:** `Assembly/Assembly.css` (split target, opportunistic).

---

## Suggested order of work

1. Shared overlay/dialog/icon-button primitives in `shared.css` (P0 — foundation for 2 & 3)
2. Shared `<ConfirmDialog>` component (P0)
3. Focus trap + `aria-labelledby` on remaining dialogs (P1)
4. Remove debug logging from `ipc.js` (P0, but independent — do whenever convenient)
5. Consolidate `formatDate` (P2)
6. Split `Assembly.css` (P3, opportunistic only — fold into 1/3 if those touch it)
