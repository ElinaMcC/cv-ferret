# Test Suite Optimization Plan

Implementation plan from the test engineer pass of the multi-persona app
review (see `PARKING-LOT.md` → "Full technical review of the app"). Items
are sorted by priority — highest risk / highest value first.

Current state: 3 test files (`src/tests/cvDocuments.test.js`,
`src/tests/profiles.test.js`, `src/tests/piiUtils.test.js`), ~53 tests,
`environment: 'node'`, all added in the initial commit and untouched since.

---

## 1. Backup / restore / migration tests (P0)

**Problem:** `restoreData`, `performAutoBackup`, and
`migrateExperiencesToTasks` in `src/main/db.js` are completely untested.
This is the highest-risk code in the app: it's a local JSON-file store with
"every change written to disk immediately," so a bug here risks corrupting
or losing the user's only copy of their CV history.

**Plan:**
- `restoreData`: test that a valid backup payload round-trips correctly
  (all sections restored), that it rejects/handles malformed or
  partial payloads without corrupting the existing data file, and that
  `cv_documents`/`profiles`/`applications` cross-references stay consistent
  after a restore.
- `performAutoBackup`: test that a backup file is written with the expected
  naming/timestamp convention and contains a faithful snapshot of current
  data.
- `migrateExperiencesToTasks`: test against a representative pre-migration
  data shape, confirming the migrated shape matches what the rest of the
  app expects (this is a one-way data transformation on the user's real
  data — needs the strongest guarantees in the file).

**Files:** `src/tests/db.test.js` (new), exercising `src/main/db.js`.

---

## 2. Core experience pool model tests (P0)

**Problem:** `createJob`, `updateJob`, `deleteJob`, `createTask`,
`deleteTask`, `getTasksByJob`, `reorderTasks`, `createTaskVersion`,
`updateTaskVersion`, `deleteTaskVersion`, `setDefaultVersion`,
`getAllJobsWithTasks`, `searchTasks` — the entire Experience Pool data
model, which every other feature (Assembly, CV Library, AI generation)
builds on — has zero test coverage.

**Plan:**
- Mirror the style of `src/tests/profiles.test.js` / `cvDocuments.test.js`:
  CRUD round-trips, default/edge-case behavior (e.g. deleting a task's only
  version, deleting the default version, reordering with invalid IDs,
  `setDefaultVersion` clearing the previous default), and `searchTasks`
  matching across description/employer/title/tags as documented in the
  README.

**Files:** `src/tests/jobsAndTasks.test.js` (new), exercising
`src/main/db.js`.

---

## 3. AI route guard tests (P0)

**Problem:** CLAUDE.md establishes a security/privacy invariant — every
AI-calling route must check **both** `aiEnabled` and `anthropicApiKey` via
the `requireAI(settings, res)` pattern. This is currently enforced only by
code review/convention, with no automated check. A future change that
forgets the guard (or breaks `requireAI` itself) would silently leak data
to the Anthropic API even when AI is disabled.

**Plan:**
- Add lightweight route-level tests (using `supertest` or Express's own
  test utilities — whichever has the smaller footprint) for `routes/ai.js`
  and `routes/aiChat.js`: assert a 4xx/blocked response when `aiEnabled` is
  false, when `anthropicApiKey` is missing, and when both are set but no
  real API call is made (mock the Anthropic client).
- This doubles as the first route-layer test in the suite — keep it small
  and use it as the template for any future route tests, rather than trying
  to cover all 14 route files at once.

**Files:** `src/tests/aiRouteGuard.test.js` (new), exercising
`src/main/routes/ai.js` and `src/main/routes/aiChat.js`.

---

## 4. Testing convention in CLAUDE.md (P1)

**Problem:** There is no documented expectation for when/how tests should
be added alongside new features. As a result, the suite has been static
since the initial commit while 27 subsequent commits added significant
functionality (Import page, AI chat, bulk edit, CV Library responsiveness)
with no new tests.

**Plan:**
- Add a short "Testing" section to `CLAUDE.md` stating the expectation:
  new `db.js` functions get unit tests in `src/tests/`, new AI-calling
  routes get a guard test per item 3's template, and significant frontend
  flows are noted as candidates for the Playwright smoke suite (item 6).
- This is a documentation-only change, but it's the cheapest way to stop
  the gap from continuing to widen with future work (including work done by
  AI agents, who follow CLAUDE.md directly).

**Files:** `CLAUDE.md`.

---

## 5. Tests for recently-shipped features (P2)

**Problem:** Import (Phases 1–6), the AI knowledge base, and CV Library
bulk-edit all shipped without tests, growing the untested surface.

**Plan:**
- `import.js` / `importExport.js`: test the manual JSON import path
  (`importExperience`, `importEducation` in `db.js` already partially
  testable without AI) — validate shape handling and edge cases (empty
  sections, partial data).
- CV Library bulk-edit (move/delete multiple CVs): test the underlying
  `db.js` operations for moving documents between profiles and the
  "linked to an application" delete warning logic.
- AI extraction/chat content itself is out of scope for unit tests (it
  calls Claude) — focus on the deterministic logic around it (data shaping,
  validation, PII guard from item 3).

**Files:** `src/tests/import.test.js` (new), additions to
`src/tests/cvDocuments.test.js` or a new `src/tests/cvLibrary.test.js` for
bulk-edit logic.

---

## 6. Targeted Playwright smoke suite (P2 — separate from `npm test`)

**Problem:** No automated check exists for rendered layout/responsiveness —
the entire UX review (Experience Pool/Application Tracker breakage at narrow
widths) was found by manual screenshotting with a temporarily-installed
Playwright.

**Plan:**
- Add Playwright as a `devDependency` (not bundled into `npm test`/CI-blocking
  — a separate `npm run test:e2e`, run manually or before releases).
- Cover 2–3 golden-path flows at 2–3 viewport widths (1440px / 900px / 380px,
  matching the UX review): Experience Pool task list renders correctly,
  Assembly "Start a new CV" dialog is usable, CV Library responsive layout
  (regression guard for the fix already made).
- Keep this suite small and deliberately scoped — it's a regression guard
  for layout, not a full E2E replacement for the unit suite.

**Files:** `playwright.config.js` (new), `e2e/` directory (new),
`package.json` (`devDependencies` + `test:e2e` script).

---

## 7. Frontend component tests (P3)

**Problem:** No frontend testing exists at all — no jsdom environment, no
React Testing Library. This is the largest gap but also the most expensive
to close, and lower-priority than the backend data-integrity gaps above
given the app's "personal local tool" scope.

**Plan:**
- Defer until items 1–6 are done. If pursued, add a second Vitest project/
  config with `environment: 'jsdom'` and React Testing Library, and start
  with the components most central to data entry (ExperiencePool,
  PersonalDetails) rather than attempting broad coverage.

**Files:** TBD — likely a second `vitest.config.js` (e.g.
`vitest.config.frontend.js`) plus `src/tests/frontend/`.

---

## Suggested order of work

1. Backup/restore/migration tests (P0 — data safety)
2. Core experience pool model tests (P0 — foundation)
3. AI route guard tests (P0 — privacy/security invariant)
4. Testing convention in CLAUDE.md (P1 — stop the gap from widening)
5. Tests for recently-shipped features (P2)
6. Targeted Playwright smoke suite (P2, separate from `npm test`)
7. Frontend component tests (P3, defer)
