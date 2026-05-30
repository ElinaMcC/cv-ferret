'use strict';

const path       = require('path');
const { Router } = require('express');
const multer     = require('multer');
const Anthropic  = require('@anthropic-ai/sdk');
const db         = require('../db.js');

const router = Router();

// Memory storage — file content is only needed temporarily for text extraction.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.docx', '.pdf', '.md', '.txt'].includes(ext));
  },
});

function requireAI(settings, res) {
  if (settings.aiEnabled === false) {
    res.status(403).json({ error: 'AI features are disabled. Enable them in Settings.' });
    return false;
  }
  if (!settings.anthropicApiKey) {
    res.status(400).json({ error: 'No API key configured. Add your Anthropic API key in Settings.' });
    return false;
  }
  return true;
}

// ── Tool definition ───────────────────────────────────────────────────────────

const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });

const CV_EXTRACTION_TOOL = {
  name: 'extract_cv_data',
  description: 'Extract all structured data from a CV into the CV Ferret data model.',
  input_schema: {
    type: 'object',
    properties: {
      personalDetails: {
        type: 'object',
        description: 'Contact and personal information from the CV header. Use empty string for fields not present — do not guess.',
        properties: {
          first_name:     { type: 'string' },
          last_name:      { type: 'string' },
          email:          { type: 'string' },
          phone:          { type: 'string' },
          address:        { type: 'string' },
          links:          { type: 'array', items: { type: 'string' }, description: 'URLs, LinkedIn, GitHub, portfolio, etc.' },
          date_of_birth:  { type: 'string', description: 'As written on the CV, or empty string.' },
          place_of_birth: { type: 'string' },
          gender:         { type: 'string' },
        },
        required: ['first_name', 'last_name', 'email', 'phone', 'address', 'links'],
      },
      jobs: {
        type: 'array',
        description: 'Work experience. One entry per distinct role — if someone held two titles at the same employer, create two separate job entries.',
        items: {
          type: 'object',
          properties: {
            employer:   { type: 'string' },
            job_title:  { type: 'string' },
            start_date: { ...nullable('string'), description: 'YYYY-MM-DD. Use 01 for unknown day or month (e.g. March 2020 → 2020-03-01). null if completely unknown.' },
            end_date:   { ...nullable('string'), description: 'YYYY-MM-DD, or null if this is a current role.' },
            location:   { type: 'string' },
            notes:      { type: 'string', description: 'Note any ambiguities, assumptions, or unusual formatting here. Empty string if none.' },
            tasks: {
              type: 'array',
              description: 'Each bullet point or responsibility as a separate task object. Preserve original wording verbatim.',
              items: {
                type: 'object',
                properties: {
                  description:     { type: 'string', description: 'The bullet point text, verbatim.' },
                  tags:            { type: 'array', items: { type: 'string' }, description: 'Always an empty array — the user will tag tasks later.' },
                  role_priorities: { type: 'array', items: {}, description: 'Always an empty array.' },
                },
                required: ['description', 'tags', 'role_priorities'],
              },
            },
          },
          required: ['employer', 'job_title', 'start_date', 'end_date', 'location', 'notes', 'tasks'],
        },
      },
      education: {
        type: 'array',
        description: 'Academic qualifications and degrees only. Courses and certifications go in training.',
        items: {
          type: 'object',
          properties: {
            institution: { type: 'string' },
            title:       { type: 'string', description: 'Degree name or qualification title.' },
            end_date:    { type: 'string', description: 'Free text as written, e.g. "Jun 2018" or "2020".' },
            notes:       { type: 'string' },
          },
          required: ['institution', 'title', 'end_date', 'notes'],
        },
      },
      training: {
        type: 'array',
        description: 'Professional courses, certifications, and non-academic training.',
        items: {
          type: 'object',
          properties: {
            institution: { type: 'string' },
            title:       { type: 'string', description: 'Certificate or course name.' },
            end_date:    { type: 'string', description: 'Free text as written.' },
            notes:       { type: 'string' },
          },
          required: ['institution', 'title', 'end_date', 'notes'],
        },
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Individual skill strings from any skills section on the CV.',
      },
      languages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            level:    { type: 'string', description: 'CEFR level: A1, A2, B1, B2, C1, C2, or Native. Use Native only if explicitly stated or clearly implied. Empty string if unknown.' },
          },
          required: ['language', 'level'],
        },
      },
    },
    required: ['personalDetails', 'jobs', 'education', 'training', 'skills', 'languages'],
  },
};

// ── Extraction system prompt ──────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a CV data extraction assistant. Extract all structured data from the CV text provided and call the extract_cv_data tool with the result.

Rules:
- JOBS: One entry per distinct role, not per employer. If someone held two different titles at the same company, those are two separate job entries with the same employer name.
- TASKS: Extract each bullet point or responsibility as a separate task. Preserve the original wording verbatim — do not rephrase, improve, or summarise.
- DATES: Convert all dates to YYYY-MM-DD. If only month and year are given, use 01 as the day (e.g. "March 2020" → "2020-03-01"). Use null for a current role's end_date and for start dates that are entirely absent.
- NOTES field on jobs: Record any ambiguities, assumptions, or formatting oddities here (e.g. "Date range unclear — inferred from surrounding roles"). Leave empty string if none.
- PERSONAL DETAILS: Extract from the CV header. Leave fields as empty string if not present — do not guess or infer.
- EDUCATION vs TRAINING: Degrees, diplomas, and academic qualifications go in education. Professional certifications, online courses, and short-course training go in training.
- SKILLS: Extract individual skills as separate strings. Split comma-separated lists into individual entries.
- LANGUAGES: Use CEFR levels (A1–C2 or Native) where possible. Only use "Native" if it is explicitly stated or very clearly implied. Use empty string for level if no indication is given.
- tags and role_priorities on every task must always be empty arrays — the user will complete these later.`;

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/import/extract-text
// Accepts a file upload and returns extracted plain text for the AI extraction step.
router.post('/import/extract-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided, or file type not supported. Accepted: .docx, .pdf, .md, .txt' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    } else if (ext === '.pdf') {
      // Use the lib path to avoid pdf-parse's test-file auto-run at module load time.
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const result = await pdfParse(req.file.buffer);
      text = result.text;
    } else {
      // .md or .txt
      text = req.file.buffer.toString('utf-8');
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return res.status(422).json({ error: 'No readable text found in the file. If this is a scanned PDF, text extraction is not supported.' });
    }

    res.json({ text: trimmed });
  } catch (err) {
    console.error('[import/extract-text]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/extract-with-ai
// Accepts { cvText: string } and returns a structured extraction preview object.
// Deliberately does NOT strip PII — the user is extracting their own data.
router.post('/import/extract-with-ai', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    const { cvText } = req.body;
    if (!cvText || !String(cvText).trim()) {
      return res.status(400).json({ error: 'No CV text provided.' });
    }

    const client = new Anthropic({ apiKey: settings.anthropicApiKey });

    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
      tools:        [CV_EXTRACTION_TOOL],
      tool_choice:  { type: 'tool', name: 'extract_cv_data' },
      messages: [{
        role:    'user',
        content: `${EXTRACTION_PROMPT}\n\nCV TEXT:\n${cvText}`,
      }],
    });

    const toolUse = message.content.find(c => c.type === 'tool_use');
    if (!toolUse) {
      throw new Error('Extraction did not return structured data. Please try again.');
    }

    res.json(toolUse.input);
  } catch (err) {
    console.error('[import/extract-with-ai]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/import-all
// Saves the confirmed (and user-reviewed) extraction preview to the database.
// Body: { personalDetails, jobs, education, training, skills, languages, overwritePersonal }
router.post('/import/import-all', (req, res) => {
  try {
    const {
      personalDetails  = null,
      jobs             = [],
      education        = [],
      training         = [],
      skills           = [],
      languages        = [],
      overwritePersonal = false,
    } = req.body;

    const result = {
      personal:    'skipped',
      jobs:        0,
      tasks:       0,
      education:   0,
      training:    0,
      skillsAdded: 0,
      languages:   0,
    };

    if (personalDetails && overwritePersonal) {
      db.updatePersonal(personalDetails);
      result.personal = 'saved';
    }

    const validJobs = (Array.isArray(jobs) ? jobs : []).filter(j => j.employer || j.job_title);
    if (validJobs.length > 0) {
      const r = db.importExperience(validJobs);
      result.jobs  = r.jobs;
      result.tasks = r.tasks;
    }

    const hasEdu = education.length || training.length || skills.length || languages.length;
    if (hasEdu) {
      const r = db.importEducation({ education, training, skills, languages });
      result.education   = r.education;
      result.training    = r.training;
      result.skillsAdded = r.skillsAdded;
      result.languages   = r.languages;
    }

    res.json(result);
  } catch (err) {
    console.error('[import/import-all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
