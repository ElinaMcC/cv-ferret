'use strict';

const path      = require('path');
const fs        = require('fs');
const { Router } = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const db         = require('../db.js');
const { generateDocumentPdf, generateDocumentDocx } = require('../exportHelpers.js');

const router = Router();

// ── CRUD ──────────────────────────────────────────────────────────────────────

router.get('/documents', (req, res) => {
  try { res.json(db.getAllDocuments()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/documents/:id', (req, res) => {
  try {
    const doc = db.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/documents', (req, res) => {
  try {
    const { title, content } = req.body;
    const id = db.createDocument(title || 'Untitled', content || '');
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/documents/:id', (req, res) => {
  try {
    const { title, content } = req.body;
    db.updateDocument(parseInt(req.params.id), title, content);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/documents/:id', (req, res) => {
  try {
    db.deleteDocument(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.post('/documents/:id/export-pdf', async (req, res) => {
  try {
    const doc = db.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const settings   = db.getSettings();
    const exportPath = settings.exportPath;
    if (!exportPath || !fs.existsSync(exportPath)) {
      return res.status(400).json({ error: 'Export path not set or does not exist. Configure it in Settings.' });
    }

    const safeTitle = (doc.title || 'Document').replace(/[\\/:*?"<>|]/g, '-');
    const filePath  = path.join(exportPath, `${safeTitle}.pdf`);
    const buffer    = await generateDocumentPdf(doc.content, doc.title, { pageSize: settings.pageSize || 'A4' });
    fs.writeFileSync(filePath, buffer);
    res.json({ filePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/documents/:id/export-docx', async (req, res) => {
  try {
    const doc = db.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const settings   = db.getSettings();
    const exportPath = settings.exportPath;
    if (!exportPath || !fs.existsSync(exportPath)) {
      return res.status(400).json({ error: 'Export path not set or does not exist. Configure it in Settings.' });
    }

    const safeTitle = (doc.title || 'Document').replace(/[\\/:*?"<>|]/g, '-');
    const filePath  = path.join(exportPath, `${safeTitle}.docx`);
    const buffer    = await generateDocumentDocx(doc.content, doc.title, { pageSize: settings.pageSize || 'A4' });
    fs.writeFileSync(filePath, buffer);
    res.json({ filePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI-assisted document generation ──────────────────────────────────────────

// Generates a tailored CV draft as HTML from a job ad.
// Job titles / employers / dates are ALWAYS taken from the database —
// Claude only selects tasks and may lightly reword descriptions.
router.post('/documents/generate-draft', async (req, res) => {
  try {
    const { jobAdText } = req.body;
    const settings = db.getSettings();
    if (!settings.anthropicApiKey) {
      return res.status(400).json({ error: 'No API key configured. Add your Anthropic API key in Settings.' });
    }

    const personal  = db.getPersonal();
    const allJobs   = db.getAllJobsWithTasks();
    const education = db.getAllEducation();
    const training  = db.getAllTraining();
    const skills    = db.getSkills();
    const languages = db.getLanguages();

    const pool = allJobs.map(job => ({
      jobId:     job.id,
      jobTitle:  job.job_title,
      employer:  job.employer,
      location:  job.location  || '',
      startDate: job.start_date || '',
      endDate:   job.end_date   || '',
      tasks: job.tasks.map(task => {
        const defaultVer = task.versions.find(v => v.is_default) || task.versions[0];
        return {
          taskId:      task.id,
          defaultText: defaultVer?.description || '',
          altVersions: task.versions
            .filter(v => !v.is_default)
            .map(v => ({ versionId: v.id, text: v.description })),
        };
      }),
    }));

    const prompt = `You are a professional CV writer helping tailor a CV to a specific job advertisement.

STRICT RULES — these override everything else:
1. Job titles, employer names, and dates are FACTS. Do not modify them in any way.
2. Every bullet point you include MUST reference a real taskId from the pool below. You may not invent tasks.
3. Tasks must stay under their original job. Never move a task to a different job.
4. You may select the best-fitting wording from alt versions, or lightly reword the default to better match the job ad — but the substance must come from the existing text.
5. Only include jobs that are genuinely relevant. Omit entire jobs that add no value for this role.

Experience pool (structured data):
${JSON.stringify(pool, null, 2)}

Job advertisement:
${jobAdText}

Return ONLY a JSON object in this exact format — no markdown, no explanation:
{
  "jobs": [
    {
      "jobId": <number>,
      "tasks": [
        { "taskId": <number>, "text": "<bullet text>" }
      ]
    }
  ]
}`;

    const client = new Anthropic({ apiKey: settings.anthropicApiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    let selection;
    try {
      const text      = message.content[0].text.trim();
      const jsonStart = text.indexOf('{');
      const jsonEnd   = text.lastIndexOf('}');
      selection = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } catch {
      return res.status(500).json({ error: 'AI returned unexpected format. Please try again.' });
    }

    const jobMap = Object.fromEntries(allJobs.map(j => [j.id, j]));
    const html   = buildDocumentHtml(selection, jobMap, personal, education, training, skills, languages, settings);
    res.json({ html });
  } catch (err) {
    console.error('[documents] generate-draft error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Blank template ────────────────────────────────────────────────────────────

router.post('/documents/blank-template', (req, res) => {
  try {
    const { includeAllTasks = false } = req.body;
    const personal  = db.getPersonal();
    const allJobs   = db.getAllJobsWithTasks();
    const education = db.getAllEducation();
    const training  = db.getAllTraining();
    const skills    = db.getSkills();
    const languages = db.getLanguages();
    const settings  = db.getSettings();
    res.json({ html: buildBlankTemplateHtml(allJobs, personal, education, training, skills, languages, settings, includeAllTasks) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HTML builder helpers ──────────────────────────────────────────────────────

function fmtDate(str, locale) {
  if (!str) return 'Present';
  const parts = str.split('-');
  if (parts.length < 2) return str;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1)
    .toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function buildDocumentHtml(selection, jobMap, personal, education, training, skills, languages, settings) {
  const locale = settings.cvLocale || 'en-GB';
  const CEFR = { A1:'Beginner',A2:'Elementary',B1:'Intermediate',B2:'Upper Intermediate',C1:'Advanced',C2:'Proficient',Native:'Native' };
  let html = '';

  if (selection.jobs && selection.jobs.length > 0) {
    html += '<h2>Professional Experience</h2>';
    for (const selJob of selection.jobs) {
      const job = jobMap[selJob.jobId];
      if (!job) continue;

      const dateRange = job.start_date
        ? `${fmtDate(job.start_date, locale)}–${fmtDate(job.end_date, locale)}`
        : fmtDate(job.end_date, locale);
      const subtitle  = [job.employer, job.location].filter(Boolean).join(' · ');

      html += `<h3 data-job-id="${job.id}">${job.job_title}</h3>`;
      html += `<p>${subtitle} · ${dateRange}</p>`;

      const taskMap = Object.fromEntries((job.tasks || []).map(t => [t.id, t]));
      const bullets = (selJob.tasks || [])
        .filter(st => taskMap[st.taskId])
        .map(st => st.text.trim())
        .filter(Boolean);

      if (bullets.length > 0) {
        html += '<ul>' + bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
      }
    }
  }

  if (education.length > 0) {
    html += '<h2>Education</h2>';
    for (const e of education) {
      html += `<h3>${e.title}</h3>`;
      html += `<p>${e.institution}${e.end_date ? ' · ' + e.end_date : ''}</p>`;
      if (e.notes) html += `<p><em>${e.notes}</em></p>`;
    }
  }

  if (training.length > 0) {
    html += '<h2>Training &amp; Certifications</h2>';
    for (const t of training) {
      html += `<h3>${t.title}</h3>`;
      html += `<p>${t.institution}${t.end_date ? ' · ' + t.end_date : ''}</p>`;
    }
  }

  if (skills.length > 0) {
    html += '<h2>Skills</h2>';
    html += `<p>${skills.join(' · ')}</p>`;
  }

  if (languages.length > 0) {
    html += '<h2>Languages</h2>';
    html += `<p>${languages.map(l => `${l.language}: ${CEFR[l.level] || l.level}`).join(' · ')}</p>`;
  }

  return html;
}

function buildBlankTemplateHtml(allJobs, personal, education, training, skills, languages, settings, includeAllTasks) {
  const locale = settings.cvLocale || 'en-GB';
  const CEFR = { A1:'Beginner',A2:'Elementary',B1:'Intermediate',B2:'Upper Intermediate',C1:'Advanced',C2:'Proficient',Native:'Native' };
  let html = '';

  const nameParts = [personal.first_name, personal.last_name].filter(Boolean);
  if (nameParts.length > 0) html += `<h1>${nameParts.join(' ')}</h1>`;

  const contactParts = [
    personal.email, personal.phone,
    ...(personal.links || []),
    personal.address?.split('\n')[0]?.trim(),
  ].filter(Boolean);
  if (contactParts.length > 0) html += `<p>${contactParts.join(' · ')}</p>`;

  const sortedJobs = [...allJobs].sort((a, b) => {
    const order = settings.cvOrder || 'newest-first';
    if (order === 'oldest-first') {
      if (!a.end_date && !b.end_date) return 0;
      if (!a.end_date) return 1;
      if (!b.end_date) return -1;
      return a.end_date.localeCompare(b.end_date);
    }
    if (!a.end_date && !b.end_date) return 0;
    if (!a.end_date) return -1;
    if (!b.end_date) return 1;
    return b.end_date.localeCompare(a.end_date);
  });

  if (sortedJobs.length > 0) {
    html += '<h2>Professional Experience</h2>';
    for (const job of sortedJobs) {
      const dateRange = job.start_date
        ? `${fmtDate(job.start_date, locale)}–${fmtDate(job.end_date, locale)}`
        : fmtDate(job.end_date, locale);
      const subtitle = [job.employer, job.location].filter(Boolean).join(' · ');
      html += `<h3 data-job-id="${job.id}">${job.job_title}</h3>`;
      html += `<p>${subtitle} · ${dateRange}</p>`;

      if (includeAllTasks && job.tasks && job.tasks.length > 0) {
        const items = job.tasks.map(task => {
          const def = task.versions?.find(v => v.is_default) || task.versions?.[0];
          if (!def) return null;
          return `<li data-task-id="${task.id}" data-version-id="${def.id}">${def.description}</li>`;
        }).filter(Boolean);
        if (items.length > 0) html += '<ul>' + items.join('') + '</ul>';
      }
    }
  }

  if (education.length > 0) {
    html += '<h2>Education</h2>';
    for (const e of education) {
      html += `<h3>${e.title}</h3>`;
      html += `<p>${e.institution}${e.end_date ? ' · ' + e.end_date : ''}</p>`;
      if (e.notes) html += `<p><em>${e.notes}</em></p>`;
    }
  }

  if (training.length > 0) {
    html += '<h2>Training &amp; Certifications</h2>';
    for (const t of training) {
      html += `<h3>${t.title}</h3>`;
      html += `<p>${t.institution}${t.end_date ? ' · ' + t.end_date : ''}</p>`;
    }
  }

  if (skills.length > 0) {
    html += '<h2>Skills</h2>';
    html += `<p>${skills.join(' · ')}</p>`;
  }

  if (languages.length > 0) {
    html += '<h2>Languages</h2>';
    html += `<p>${languages.map(l => `${l.language}: ${CEFR[l.level] || l.level}`).join(' · ')}</p>`;
  }

  return html;
}

module.exports = router;
