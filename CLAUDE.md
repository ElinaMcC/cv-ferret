# CV Ferret — Working Instructions

## Accessibility
Accessibility is a core value in this project. When writing or reviewing UI code:
- Icon-only buttons must have `aria-label`
- Dialogs must trap focus and have `aria-labelledby` pointing to their title
- Dynamic messages (toasts, loading states) need `aria-live` regions
- Clickable elements must be keyboard-accessible — use `<button>`, not `<div onClick>`
- Flag any change that would regress accessibility, even if the user hasn't asked about it

## Architecture decisions
These are intentional — do not suggest replacing them unprompted:
- **Express on localhost instead of Electron.** The app runs as a local web server; the browser is the window. Deliberate choice for simplicity and transparency.
- **JSON file storage instead of a database.** All data lives in `%APPDATA%\.cv-builder\`. Appropriate for a single-user personal tool; no migrations, trivially backed up.

## Icons
Use **Heroicons** (`@heroicons/react`) exclusively. Do not introduce other icon libraries.

## Shared UI patterns
A code quality review found the same UI patterns reimplemented separately
across components (see `CODE-QUALITY-OPTIMIZATION.md` for the full
writeup and migration plan). Going forward:

- **Modal/dialog overlays** — use the shared `.modal-overlay` /
  `.modal-dialog` classes in `src/renderer/styles/shared.css`. Do not add a
  new per-component overlay class (e.g. `.foo-modal-overlay`) with its own
  opacity/z-index — every existing one ended up subtly different and it's a
  stacking-order risk.
- **Icon-only buttons** — use the shared `.icon-btn` class in `shared.css`.
  Do not redefine `.icon-btn` (or a renamed variant like `.foo-icon-btn`)
  in a component stylesheet.
- **Destructive confirmations** — use `<ConfirmDialog>`
  (`src/renderer/components/ConfirmDialog.jsx`). Do not use
  `window.confirm()` — it ignores dark mode and isn't accessible per the
  rules below.
- **All dialogs** (`role="dialog"`) must use `useFocusTrap`
  (`src/renderer/hooks/useFocusTrap.js`) and have `aria-labelledby` pointing
  at their title, per the Accessibility section above — this applies even
  to small/simple dialogs like confirmation prompts.
- **Component stylesheets should `@import '../styles/shared.css'`** unless
  there's a specific reason not to — most of the duplication above happened
  because a stylesheet didn't import it and a developer didn't know the
  shared version existed.
- **Date formatting** — use the shared formatters in
  `src/renderer/utils/dates.js` (`formatDate`, `formatMonthYear`) rather than
  defining a local `formatDate`.

## Debugging
Do not leave unconditional `console.log` of request/response bodies or
other application data in committed code — this app handles personal data
(names, addresses, CV content), and logging it to the browser console by
default is a privacy leak. Gate any request/response logging behind
`import.meta.env.DEV` if it's needed during development.

## Testing
New `db.js` functions should get unit tests in `src/tests/` (mirror the
style of `cvDocuments.test.js`/`profiles.test.js` — CRUD round-trips plus
edge cases). New AI-calling routes should get a guard test asserting they
honour `requireAI` (see `aiRouteGuard.test.js` for the pattern). Significant
new frontend flows (new pages, new dialogs) are candidates for the Playwright
smoke suite (`e2e/`, run via `npm run test:e2e` — separate from `npm test`
and not CI-blocking). This applies to work done by AI agents as much as
human contributors — don't let the suite fall behind new functionality.

## AI route guard
Every backend route that calls the Anthropic API must check **both** `aiEnabled` and `anthropicApiKey` before proceeding. Use the `requireAI(settings, res)` helper pattern already established in `routes/ai.js` and `routes/aiChat.js`. Checking the API key alone is not sufficient — a disabled toggle must be honoured server-side, not just in the UI.

The one deliberate exception is the Import page's AI extraction route, where PII stripping is also intentionally omitted (documented separately).

## Import
`src/renderer/components/ImportPage.jsx` is the canonical home for bringing an existing CV into the app — AI extraction (`src/main/routes/import.js`) and the manual JSON path both live here. Other pages (Experience Pool, Education & Skills, Dashboard, StartNewCVDialog) should link to the Import page rather than hosting their own import UI.

## App knowledge (AI chat + Help page)
`src/shared/appKnowledge.json` is the single source of truth for "how CV Ferret works" content — covering the Experience Pool, task versions, profiles, cover letters, the Pool Drawer, app navigation, and the onboarding flow. It is consumed by both:
- `src/main/routes/aiChat.js` — included in the AI chat system prompt
- `src/renderer/components/HelpPage.jsx` — rendered as the in-app Help page for users without AI enabled

Any change to these concepts (e.g. renaming the Pool Drawer, adding a sidebar section, changing how versions or profiles work) must update this file so the AI chat and the Help page stay accurate and in sync. Do not duplicate this content elsewhere.

## PII awareness
When touching AI-related code (`src/main/routes/ai.js`, `aiChat.js`, `piiUtils.js`), always consider whether personal data could be exposed. The established pattern is `piiUtils.js` stripping before every AI call — maintain this.

## Language
Plain JavaScript. Do not introduce TypeScript.

## Localisation
There are no current plans to translate this app. If a contributor wants to add translations in the future, here is what they need to know:

- **Status codes** — application statuses are stored as language-neutral lowercase codes (`unprocessed`, `applied`, `interviewing`, `offer`, `closed`). Display labels live in `STATUS_LABELS` in `ApplicationTracker.jsx`. Do not store display strings in data.
- **UI strings** — all other strings are inline in JSX. A translation effort would need to extract them to JSON files and introduce a library such as `react-i18next`.
- **Date formatting** — the shared formatters in `src/renderer/utils/dates.js` use a hardcoded `en-GB` locale. The `cvLocale` setting in `db.js` covers CV export dates only.
- **Plurals** — several strings handle plurals inline (e.g. `count !== 1 ? 's' : ''`). An i18n library handles this properly for other languages.
- **AI responses** — the AI is prompted in English in `src/main/routes/ai.js` and `aiChat.js`. Translating the UI would not affect the language the AI responds in; that is a separate, harder problem.
