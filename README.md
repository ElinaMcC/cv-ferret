# CV Ferret

A personal, local-only CV builder. Maintains a structured pool of professional experience, assembles tailored CVs, tracks job applications, and generates cover letters — all with optional AI assistance powered by the Claude API.

> **Platform:** Developed and tested on **Windows**. The app uses only cross-platform Node.js APIs and should run on macOS and Linux without modification, but this has not been verified. See the macOS note under Development. Bug reports from non-Windows users are welcome at cv.builder.vibe@gmail.com.

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- An Anthropic API key — **optional, but required for AI features**. See [AI features & API costs](#ai-features--api-costs) below.

### Install dependencies
```
npm install
```

### Development

1. Open a terminal in this folder
2. Run: `npm run dev`
3. Open your browser at **http://localhost:5173**

This starts two processes concurrently:
- **Frontend**: Vite dev server on http://localhost:5173 (hot-reloads automatically)
- **Backend**: Express API server on http://localhost:5000 (auto-restarts via nodemon on changes to `src/main/`)

> **macOS note:** Port 5000 is used by AirPlay Receiver on macOS Monterey and later, which will prevent the backend from starting. Either disable AirPlay Receiver in System Settings → General → AirDrop & Handoff, or change the port by editing the `PORT` value at the top of `src/main/server.js` and updating the `API_BASE` URL in `src/renderer/services/ipc.js` to match.

To simulate a completely fresh install (empty data, no settings) without touching your real data:
```
npm run start:fresh
```
This starts the server pointing at a local `test-profile/` directory instead of `%APPDATA%`. Delete `test-profile/` afterwards to reset. Your real data is unaffected.

### Production (development machine)
```
npm run build
npm start
```

Builds the React app to `dist/` and serves it via Express.

### Building a Windows installer

Requires [Inno Setup 6](https://jrsoftware.org/isinfo.php) (free).

```
npm run package:win
```

This builds the frontend, bundles the server and Node.js runtime into a single `release/cv-ferret.exe`, and copies the frontend files to `release/dist/`. Then open `installer/setup.iss` in Inno Setup and click **Build → Compile** to produce `installer/Output/Setup-CV-Ferret.exe`.

The installer:
- Installs to `%LOCALAPPDATA%\CV Ferret\` — no administrator rights required
- Creates a Start Menu entry and an optional desktop shortcut
- Includes an uninstaller

**Running the installed app:** double-click the shortcut (or `cv-ferret.exe` directly). A console window shows the server is running; your browser opens automatically to `http://localhost:5000`. Close the console window to stop the app. If the app is already running, the exe opens a new browser tab instead of starting a second instance.

---

## Architecture

```
Browser (React/Vite)  ←→  Express API (Node.js)  ←→  JSON files on disk
                                   ↕
                           Anthropic Claude API
```

- No database — all data is stored in local JSON files
- **Windows**: `%APPDATA%\.cv-builder\`
- **macOS/Linux**: `~/.cv-builder/`
- Every change is written to disk immediately
- Completely offline except for AI features (which call the Anthropic API)

### Data files
| File | Purpose |
|------|---------|
| `cv-builder-data.json` | All jobs, tasks, versions, education, skills, languages, references, profiles, CV documents, applications (including notes and cover letters), personal details |
| `cv-builder-settings.json` | Anthropic API key, export path, and other settings (never committed to version control) |
| `reference_letters/` | Uploaded reference letter and certificate files |

---

## Features

### Dashboard
- Setup checklist guides new users through first-time configuration
- **Your data** summary: past and present jobs, CVs across profiles, job applications
- **Recent CVs** — last 5 modified CVs with direct "Open" links into the Assembly
- **Quick actions**: New CV, CV Library, Experience Pool, Application Tracker, Settings

### Experience Pool
- Add jobs with employer, title, location, start/end dates, notes
- Add tasks (bullet points) to each job; drag to reorder
- Each task can have multiple versions (alternate wordings for different audiences)
- Tag versions with free-form keywords
- Assign role priorities: `{ role, rank }` — rank 1 = most important for that role
- Search across all tasks by description, employer, title, or tag
- Jobs sorted newest-first; current roles (no end date) always at the top
- When adding an alternative version, pre-fills from an existing version as a starting point

### AI-Powered Version Generation (if you activate AI features)
- **Per-task**: sparkle button on each task row in the Experience Pool sends the description to Claude, which identifies relevant roles and generates a tailored version for each
- **Batch**: "Generate All" button processes every task in the pool in one go
- First run auto-saves; subsequent runs show a review panel for editing before saving
- Existing role priorities are cleared and regenerated cleanly

### Education & Skills
- **Education**: institution, qualification, end date, notes — sorted newest-first
- **Training & Certifications**: same structure as education
- **Skills**: free-form list
- **Languages**: world language dropdown + CEFR proficiency level (A1–C2 + Native)

### Personal Details
- Name, gender, date of birth, place of birth
- Email, phone, home address
- Links (LinkedIn, personal site, etc.)

### Reference Letters
- Store reference letters and employment certificates (PDF/DOCX)
- Associate each document with a job from the experience pool
- Tag documents by skill or domain
- View documents directly in the browser
- Upload new documents at any time

### CV Library
- Organise CVs into **profiles** — named role groupings, each with a designated base CV and any number of variants
- CV cards show whether a document is the base CV or a variant for its profile
- Create a new CV, open an existing CV in Assembly, or create a new CV based on an existing one
- Unorganised CVs (not assigned to a profile) appear in their own section

### Assembly

The unified CV editor, opened from the CV Library, the Dashboard, or the Application Tracker.

**Starting a CV:**
- **Blank** — empty editor with job-structure headings and placeholder text (add your job titles, employer names, and start and end dates in the Experience Pool first)
- **Load from existing CV** — opens any saved CV document as a starting point; profile and job ad are carried over

**Editing:**
- TipTap rich-text editor with headings, bullet lists, and standard formatting
- **Pool drawer** — slides in from the left; browse your Experience Pool; check a task to insert it at the correct position, uncheck to remove; swap versions without leaving the editor; edit task metadata (tags, role priorities) inline

**Export:**
- Export to DOCX and PDF directly from the toolbar
- **Save to application** — link the current CV to an existing application or quick-create a new one

**Tracker back-link:**
When Assembly is opened from the Application Tracker, a "← [Job Title] at [Employer]" back-link appears in the toolbar. Clicking it returns to the Tracker with that application pre-selected.

**AI assistant panel** (requires AI features):
- Collapsible panel on the right; fully hidden when AI is disabled
- **PII disclosure notice** — shows exactly what the AI sees; employer names, your name, address, phone, email, and any user-configured exclusions are stripped before every call
- Paste a job ad into an editor in the chat to give Claude context
- **Personas** — Claude suggests perspectives on the first turn; switch persona mid-chat; saved user-defined personas appear as quick-select chips
- **Suggestions** — AI proposes changes in chat; click "Apply to document" per suggestion
- **Flagged content** — any AI text not grounded in pool items is highlighted in yellow; accept individually or accept all
- Chat history is ephemeral — it is not saved to disk; document edits made during a chat are saved normally

### Application Tracker
- Log applications with employer, job title, job ad URL, and stored job ad text
- Status arc: **Saved → Applied → Interviewing → Offer → Closed**, with per-status filtering
- Timestamps: auto-created date; user-set applied date (shown once status moves past Saved)
- Timestamped **activity notes** — chronological log of events per application (saves immediately, not on form save)
- **CV source** — three options for the CV linked to each application:
  - **Library CV**: link to a saved CV document in the library; one click opens it in Assembly with the originating application pre-selected
  - **External file**: store a path to a DOCX/PDF saved outside the app; the app checks whether the file exists and shows an amber warning if it is missing; includes an "Open file" button
  - **None**: no CV linked
- Attach **reference letters** used (multi-select from the library)
- **Export** CV and cover letter as DOCX and PDF; optionally copy the selected reference letters into the same folder; export folder path is saved and can be reopened with one click

### Cover Letter
- Generate an AI draft to get started, or load a previous letter as a starting point; once text is present the textarea is fully editable
- **Load from previous** — dropdown of other saved cover letters; select one to copy it as a starting point
- Live word count; **Save cover letter** persists the letter with the application
- Saved letters are included in the DOCX/PDF export alongside the CV
- **AI generation** (requires AI features) — choose Formal letter or Short note style; Claude drafts using the job ad, the linked CV's task descriptions, and your past cover letters as style samples

### Settings
- **AI Features** — toggle all AI functionality on or off; when off, no data is ever sent to external services
- **Anthropic API key** — paste and save through the UI; stored locally, never in the project folder
- **PII exclusions** — add terms (employer names, your name, etc.) to be stripped from every AI call in addition to the defaults
- **AI personas** — create and manage named AI personas that appear as quick-select chips in the Assembly chat panel
- **Cover letter style samples** — path to a folder of `.docx` past cover letters used to match your writing voice
- **Export path** — default folder where exported DOCX/PDF files are saved; can be overridden per application at export time
- **CV Preferences** — experience order (newest-first or oldest-first), page size (A4 or US Letter), CV date locale
- **Export file naming** — templates for CV and cover letter file names; supports tokens: `{name}`, `{date}`, `{employer}`, `{role}`
- **Data backup** — export all data as a JSON file; import a previous backup to restore; automatic backup is created on every app start (last 10 kept)
- **Dark / light mode** — toggle in the sidebar; remembers your preference; respects OS default on first launch

---

## File Structure

```
src/
├── main/
│   ├── server.js                  — Express server entry point; mounts all route files
│   ├── db.js                      — Data layer: in-memory store + JSON persistence
│   ├── exportHelpers.js           — DOCX and PDF generation (docx + pdfkit)
│   ├── piiUtils.js                — PII stripping utility used by every AI route
│   ├── styleSamplesCache.js       — Cover letter style sample cache
│   └── routes/
│       ├── jobs.js                — Jobs, tasks, versions, tags, roles, search
│       ├── education.js           — Education, training, skills, languages
│       ├── personal.js            — Personal details
│       ├── references.js          — Reference letter library
│       ├── profiles.js            — CV profiles CRUD
│       ├── cvDocuments.js         — CV documents CRUD + export
│       ├── applications.js        — Application tracker + cover letters + file check
│       ├── settings.js            — Settings read/write
│       ├── ai.js                  — AI version generation and CV assembly analysis
│       ├── aiChat.js              — Conversational AI assistant (Assembly chat panel)
│       ├── compositions.js        — Legacy compositions (retained for data compatibility)
│       ├── documents.js           — Legacy document editor (retained for data compatibility)
│       └── importExport.js        — Dashboard summary, import, export, backup/restore
└── renderer/
    ├── App.jsx / .css             — Navigation shell, theme toggle, context providers
    ├── index.jsx / .css           — React entry point
    ├── public/                    — Static assets (favicon, logo)
    ├── components/
    │   ├── Dashboard.jsx / .css   — Home page: setup checklist, data summary, recent CVs
    │   ├── CVLibrary.jsx / .css   — Profile and CV management
    │   ├── Assembly/
    │   │   ├── AssemblyPage.jsx   — Unified CV editor (state, save, nav guard)
    │   │   ├── AssemblyEditor.jsx — TipTap editor instance
    │   │   ├── AssemblyToolbar.jsx — Save, export, back-link toolbar
    │   │   ├── PoolDrawer.jsx     — Experience pool sidebar (bidirectional sync)
    │   │   ├── AIChatPanel.jsx    — AI assistant panel
    │   │   ├── StartNewCVDialog.jsx — Blank / load-from-existing start dialog
    │   │   ├── SaveToApplicationModal.jsx — Link CV to an application
    │   │   ├── VersionedListItemView.jsx  — Inline version edit in pool drawer
    │   │   └── Assembly.css
    │   ├── ExperiencePool.jsx / .css    — Jobs, tasks, versions, AI generation
    │   ├── ExperienceForm.jsx / .css    — Create/edit form for jobs and task versions
    │   ├── EducationPage.jsx / .css     — Education, training, skills, languages
    │   ├── PersonalDetails.jsx / .css   — Personal info form
    │   ├── ReferencePage.jsx / .css     — Reference letter library
    │   ├── ApplicationTracker.jsx / .css — Application tracking, cover letters, export
    │   ├── Settings.jsx / .css          — All settings
    │   ├── ImportModal.jsx / .css        — JSON import modal
    │   └── InfoTip.jsx / .css            — Reusable inline help tooltip
    ├── contexts/
    │   ├── ToastContext.jsx        — Shared toast notification system
    │   └── AppSettingsContext.jsx  — App-wide settings (AI toggle, CV prefs)
    ├── hooks/
    │   └── useFocusTrap.js        — Accessibility: trap keyboard focus inside modals
    ├── services/
    │   └── ipc.js                 — HTTP API client (all API namespaces)
    ├── styles/
    │   └── shared.css             — Shared button styles (imported by component CSS files)
    └── utils/
        └── icons.jsx              — Heroicons aliases
```

---

## API Reference

### Jobs & Tasks

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/with-tasks` | List all jobs with tasks and versions (single call) |
| POST | `/api/jobs` | Create job |
| PUT | `/api/jobs/:id` | Update job |
| GET | `/api/jobs/:id/tasks` | Get tasks for a job |
| PUT | `/api/jobs/:id/tasks-order` | Reorder tasks |
| POST | `/api/jobs/:id/tasks-with-version` | Create task + first version |
| DELETE | `/api/tasks/:id` | Delete task and all versions |
| POST | `/api/tasks/:id/versions` | Add version to a task |
| PUT | `/api/versions/:id` | Update a version |
| DELETE | `/api/versions/:id` | Delete a version |
| PUT | `/api/versions/:id/default` | Set version as default |
| GET | `/api/tags` | All tags (autocomplete) |
| GET | `/api/roles` | All role names (autocomplete) |
| GET | `/api/search?q=` | Search tasks |

### AI

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/generate-versions` | Generate role-specific versions for one task |
| POST | `/api/generate-versions-batch` | Generate for all tasks without role priorities |
| POST | `/api/cv-assembly/analyse` | Analyse a job ad and recommend task selection |
| POST | `/api/cover-letter/generate` | Generate a cover letter for an application |
| POST | `/api/ai/chat` | Conversational AI assistant (stateless; full history sent per call) |

### Profiles & CV Documents

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/profiles` | List all profiles |
| POST | `/api/profiles` | Create a profile |
| PUT | `/api/profiles/:id` | Update a profile |
| DELETE | `/api/profiles/:id` | Delete a profile |
| PUT | `/api/profiles/:id/set-base-cv` | Set the base CV for a profile |
| GET | `/api/cv-documents` | List all CV documents |
| POST | `/api/cv-documents` | Create a CV document |
| GET | `/api/cv-documents/:id` | Get a CV document |
| PUT | `/api/cv-documents/:id` | Update a CV document |
| DELETE | `/api/cv-documents/:id` | Delete a CV document |
| POST | `/api/cv-documents/:id/export-pdf` | Export CV document to PDF |
| POST | `/api/cv-documents/:id/export-docx` | Export CV document to DOCX |

### Education & Skills

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/education` | List education entries |
| POST | `/api/education` | Create education entry |
| PUT | `/api/education/:id` | Update education entry |
| DELETE | `/api/education/:id` | Delete education entry |
| GET | `/api/training` | List training entries |
| POST | `/api/training` | Create training entry |
| PUT | `/api/training/:id` | Update training entry |
| DELETE | `/api/training/:id` | Delete training entry |
| GET | `/api/skills` | Get skills list |
| PUT | `/api/skills` | Replace skills list |
| GET | `/api/languages` | Get languages list |
| PUT | `/api/languages` | Replace languages list |

### Personal & Settings

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/personal` | Get personal details |
| PUT | `/api/personal` | Update personal details |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

### Reference Letters

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/references` | List all reference documents |
| POST | `/api/references/upload` | Upload a new document |
| GET | `/api/references/:id/file` | View/download a document |
| PUT | `/api/references/:id` | Update job association, tags, notes |
| DELETE | `/api/references/:id` | Delete document and file |

### Applications

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/applications` | List all applications |
| POST | `/api/applications` | Create an application |
| GET | `/api/applications/:id` | Get an application |
| PUT | `/api/applications/:id` | Update an application (including notes, cover letter) |
| DELETE | `/api/applications/:id` | Delete an application |
| GET | `/api/applications/:id/check-files` | Check whether linked external CV file exists on disk |

### Export, Backup & Dashboard

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dashboard` | Dashboard summary (setup status, stats, recent CVs) |
| POST | `/api/export/application/:id` | Export CV and cover letter for an application |
| POST | `/api/export/open-folder` | Open the export folder in Explorer |
| GET | `/api/export/backup` | Get all data for backup download |
| POST | `/api/export/restore` | Restore data from a backup |
| POST | `/api/import/experience` | Import jobs from JSON |
| POST | `/api/import/education` | Import education/skills from JSON |

---

## Project Status

All core features are complete and working. The app underwent a major refactor that unified the CV editing experience, introduced profiles, and added a conversational AI assistant.

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Foundation: backend split into route files, PII utility, test framework, export quality check | ✅ Complete |
| 1 | New data model: `profiles` and `cv_documents` entities, full CRUD API | ✅ Complete |
| 2 | Collapsible navigation, CV Library page | ✅ Complete |
| 3 | Unified Assembly: replaces old CV Assembly and Document Editor | ✅ Complete |
| 4 | Pool drawer: bidirectional document ↔ pool sync | ✅ Complete |
| 5 | Export and save-to-application from Assembly | ✅ Complete |
| 6 | AI chat panel: personas, PII stripping, suggestions, flagging | ✅ Complete |
| 7 | Application Tracker updates: external file CV, file-missing warning, Assembly back-link | ✅ Complete |
| 8 | Dashboard updates: New CV button, Recent CVs, stats updated to new data model | ✅ Complete |
| 9 | Polish and documentation | 🔜 Next |


---

## Importing your existing CV data

CV Ferret can import work history and education data from a JSON file — useful for
getting your existing CV into the app without entering everything manually.

The recommended workflow is to use an AI tool (ChatGPT, Claude, or any other LLM)
to convert your CV text into the required JSON format, then import the file.

> **Important:** AI tools parse unstructured text with varying accuracy. Dates may be
> misread, separate roles may be merged, or bullet points misattributed. Always review
> imported data carefully before using it in your CV assembly.

### Experience import

In **Experience Pool**, click **Import JSON**. The file must contain a `jobs` array:

```json
{
  "jobs": [
    {
      "employer": "Company Name",
      "job_title": "Job Title",
      "start_date": "2020-01-15",
      "end_date": null,
      "location": "Vienna, Austria",
      "notes": "",
      "tasks": [
        {
          "description": "One bullet point per task.",
          "tags": [],
          "role_priorities": []
        }
      ]
    }
  ]
}
```

- `start_date` / `end_date`: `YYYY-MM-DD` format, or `null` for a current role
- Each task becomes one bullet point in your pool
- `tags` and `role_priorities` are optional — use empty arrays if unsure

### Education & Skills import

In **Education & Skills**, click **Import JSON**. All four sections are optional:

```json
{
  "education": [
    { "institution": "University Name", "title": "MSc Computer Science", "end_date": "Jun 2018", "notes": "" }
  ],
  "training": [
    { "institution": "Amazon", "title": "AWS Certified Solutions Architect", "end_date": "Mar 2023", "notes": "" }
  ],
  "skills": ["Python", "SQL", "Power BI"],
  "languages": [
    { "language": "German", "level": "C1" }
  ]
}
```

- `end_date` for education/training is free text (`"Jun 2018"`, `"2023"`, etc.)
- Language `level` must be one of: `A1`, `A2`, `B1`, `B2`, `C1`, `C2`, `Native`
- Skills are merged with existing ones (no duplicates); languages update the level if already present

### Using an AI tool to extract your CV

Paste your CV text into any LLM (Claude, ChatGPT, etc.) and ask it to convert your work history into the JSON format shown above. Include the field rules and the example structure in your prompt for best results. Always review the output carefully — dates can be misread and bullet points occasionally misattributed.

Imports always **add to** your existing data rather than replacing it.

---

## Privacy & Security

- All personal data stays on your machine — nothing is synced or uploaded
- The Anthropic API key is stored in `cv-builder-settings.json` outside the project folder and is never committed to version control
- **PII stripping**: before every AI call, a `piiUtils.js` pass removes your name, employer names, address, phone, email, and any additional terms you configure in Settings — the AI never sees identifying information
- The `Input/` folder (source CVs, reference documents, etc.) is gitignored
- When sharing or publishing this project, no personal data is included
- **AI chat history is ephemeral** — the Assembly chat panel conversation is never written to disk; only document edits made during a chat are saved normally

---

## AI Features & API Costs

AI features are **entirely optional**. The app is fully functional without them.

When enabled, AI features include:
- Role-specific version generation for pool tasks
- CV assembly analysis (job ad → task recommendations)
- Conversational AI assistant in the Assembly (with persona system and PII stripping)
- Cover letter drafting

To use AI features you need an Anthropic API key:

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key and paste it into **Settings → AI Features**
3. Enable the AI toggle in Settings

**The Anthropic API is a paid, pay-as-you-go service.** You are charged per token (roughly per word) processed. New accounts receive a small free credit to get started. Typical CV Ferret usage is modest — generating versions for one task or drafting a cover letter costs a few cents — but costs accumulate over time. Review [Anthropic's pricing](https://www.anthropic.com/pricing) before enabling AI features.

AI features can be disabled at any time in Settings; all manual features continue to work independently.

---

## Icons & Licences

This project uses [Heroicons](https://heroicons.com) (MIT licensed).

All third-party dependencies (React, Vite, Express, docx, pdfkit, TipTap, Zustand, react-rnd, and others) are MIT licensed.

This project itself is licensed under the **PolyForm Noncommercial License 1.0.0** — free for personal, educational, and non-profit use; commercial use is not permitted. See [LICENSE](./LICENSE) for the full terms.

Questions, feedback, or bug reports: cv.builder.vibe@gmail.com

If you use or build on this project and want to share what you're doing, I would love to hear about it. I am not a developer, but keen to learn.
