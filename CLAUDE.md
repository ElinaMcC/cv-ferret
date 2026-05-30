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

## PII awareness
When touching AI-related code (`src/main/routes/ai.js`, `aiChat.js`, `piiUtils.js`), always consider whether personal data could be exposed. The established pattern is `piiUtils.js` stripping before every AI call — maintain this.

## Language
Plain JavaScript. Do not introduce TypeScript.
