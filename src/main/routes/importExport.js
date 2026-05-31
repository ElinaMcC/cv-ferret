'use strict';

const path    = require('path');
const fs      = require('fs');
const { spawn }  = require('child_process');
const { Router } = require('express');
const db         = require('../db.js');
const {
  generateCVDocx, generateCVPdf,
  generateCoverLetterDocx, generateCoverLetterPdf,
  generateDocumentPdf, generateDocumentDocx,
} = require('../exportHelpers.js');

const router = Router();

const VALID_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

// ── Shared helpers ────────────────────────────────────────────────────────────

function uniqueDestPath(folder, fileName) {
  const dest = path.join(folder, fileName);
  if (!fs.existsSync(dest)) return dest;
  const ext  = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let i = 2;
  while (true) {
    const candidate = path.join(folder, `${base} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Application';
}

function resolveFileName(template, tokens) {
  const today = new Date().toISOString().split('T')[0];
  const safe  = s => (s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  return (template || 'CV')
    .replace(/\{name\}/g,     safe(tokens.name))
    .replace(/\{date\}/g,     today)
    .replace(/\{employer\}/g, safe(tokens.employer))
    .replace(/\{role\}/g,     safe(tokens.role))
    .trim() || 'CV';
}

function formatJobDate(d, locale = 'en-GB') {
  if (!d) return 'Present';
  const parts = d.split('-');
  if (parts.length < 2) return d;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1)
    .toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function buildCVData(personal, jobs, education, training, skills, languages, options = {}) {
  const { cvOrder = 'newest-first', cvLocale = 'en-GB' } = options;
  const name = [personal.first_name, personal.last_name].filter(Boolean).join(' ');
  const contactParts = [
    personal.email, personal.phone,
    ...(personal.links || []),
    personal.address?.split('\n')[0]?.trim(),
  ].filter(Boolean);

  const sorted = [...jobs].sort((a, b) => {
    if (cvOrder === 'oldest-first') {
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

  return {
    name,
    contactLine: contactParts.join(' · '),
    jobs: sorted.map(j => ({
      ...j,
      dateRange: (j.start_date ? formatJobDate(j.start_date, cvLocale) : '') +
        (j.start_date ? '–' : 'Until ') + formatJobDate(j.end_date, cvLocale),
    })),
    education, training, skills, languages,
  };
}

function buildCoverLetterData(personal, application) {
  const name         = [personal.first_name, personal.last_name].filter(Boolean).join(' ');
  const contactParts = [personal.email, personal.phone, ...(personal.links || [])].filter(Boolean);
  const cl           = application.cover_letter;
  const locale       = cl.locale || 'en-GB';
  const salutation   = cl.salutation || (cl.style === 'short' ? 'Hi,' : 'Dear Hiring Manager,');
  const closing      = cl.closing    || (cl.style === 'short' ? 'Kind regards,' : 'Yours sincerely,');
  return {
    name,
    contactLine: contactParts.join(' · '),
    date: new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
    bodyText: cl.text,
    salutation,
    closing,
  };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/dashboard', (req, res) => {
  try {
    const s            = db.getSettings();
    const jobs         = db.getAllJobsWithTasks();
    const taskCount    = jobs.reduce((n, j) => n + (j.tasks || []).length, 0);
    const cvDocuments  = db.getAllCvDocuments();
    const profiles     = db.getAllProfiles();
    const applications = db.getAllApplications();
    const statusCounts = {};
    applications.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
    const personal = db.getPersonal();

    res.json({
      setup: {
        hasPersonalDetails: !!(personal.first_name || personal.last_name),
        hasApiKey:          !!s.anthropicApiKey,
        hasExportPath:      !!s.exportPath,
        hasJobs:            jobs.length > 0,
        aiEnabled:          s.aiEnabled !== false,
      },
      stats: {
        jobCount:          jobs.length,
        cvDocumentCount:   cvDocuments.length,
        profileCount:      profiles.length,
        applicationCount:  applications.length,
        statusCounts,
        recentCvs:         cvDocuments.slice(0, 5).map(d => ({ id: d.id, title: d.title, updated_at: d.updated_at })),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Import ────────────────────────────────────────────────────────────────────

router.post('/import/experience', (req, res) => {
  try {
    const { jobs } = req.body;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Expected a JSON object with a "jobs" array containing at least one job.' });
    }
    const errors = [];
    jobs.forEach((job, i) => {
      if (!job.employer && !job.job_title) {
        errors.push(`Job ${i + 1}: must have at least "employer" or "job_title".`);
      }
      (job.tasks || []).forEach((task, j) => {
        if (!task.description || !String(task.description).trim()) {
          errors.push(`Job ${i + 1}, task ${j + 1}: "description" must not be empty.`);
        }
      });
    });
    if (errors.length) return res.status(400).json({ error: errors.join('\n') });
    res.json(db.importExperience(jobs));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/import/education', (req, res) => {
  try {
    const { education = [], training = [], skills = [], languages = [] } = req.body;
    if (!education.length && !training.length && !skills.length && !languages.length) {
      return res.status(400).json({ error: 'Nothing to import — provide at least one of: education, training, skills, languages.' });
    }
    const errors = [];
    education.forEach((e, i) => { if (!e.title) errors.push(`Education entry ${i + 1}: "title" is required.`); });
    training.forEach((t, i)  => { if (!t.title) errors.push(`Training entry ${i + 1}: "title" is required.`); });
    languages.forEach((l, i) => {
      if (!l.language) errors.push(`Language entry ${i + 1}: "language" is required.`);
      if (l.level && !VALID_CEFR.includes(l.level)) {
        errors.push(`Language entry ${i + 1}: level "${l.level}" is invalid. Use one of: ${VALID_CEFR.join(', ')}.`);
      }
    });
    if (errors.length) return res.status(400).json({ error: errors.join('\n') });
    res.json(db.importEducation({ education, training, skills, languages }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.post('/export/application/:id', async (req, res) => {
  try {
    const appId = parseInt(req.params.id);
    const { exportPath: customPath, copyReferences = false } = req.body;
    const settings  = db.getSettings();
    const basePath  = (customPath || settings.exportPath || '').trim();
    if (!basePath) return res.status(400).json({ error: 'No export path provided. Set a default in Settings or enter a path below.' });

    const application = db.getApplication(appId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const nameParts  = [application.employer, application.job_title].filter(Boolean);
    const folderPath = path.join(basePath, sanitizeFolderName(nameParts.join(' – ') || `Application ${appId}`));
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const personal  = db.getPersonal();
    const education = db.getAllEducation();
    const training  = db.getAllTraining();
    const skills    = db.getSkills();
    const languages = db.getLanguages();

    const exportOptions = {
      cvOrder:  settings.cvOrder  || 'newest-first',
      cvLocale: settings.cvLocale || 'en-GB',
      pageSize: settings.pageSize || 'A4',
    };

    const nameTokens = {
      name:     [personal.first_name, personal.last_name].filter(Boolean).join(' '),
      employer: application.employer  || '',
      role:     application.job_title || '',
    };
    const cvBaseName = resolveFileName(settings.cvFileName  || 'CV', nameTokens);
    const clBaseName = resolveFileName(settings.coverLetterFileName || 'Cover Letter', nameTokens);

    const files = [];

    if (application.document_id) {
      const doc = db.getDocument(application.document_id);
      if (doc) {
        const safeTitle = (doc.title || 'CV').replace(/[\\/:*?"<>|]/g, '-');
        const [docPdf, docDocx] = await Promise.all([
          generateDocumentPdf(doc.content, doc.title, exportOptions),
          generateDocumentDocx(doc.content, doc.title, exportOptions),
        ]);
        fs.writeFileSync(path.join(folderPath, `${safeTitle}.pdf`), docPdf);
        fs.writeFileSync(path.join(folderPath, `${safeTitle}.docx`), docDocx);
        files.push(`${safeTitle}.pdf`, `${safeTitle}.docx`);
      }
    } else if (application.cv_document_id) {
      const cvDoc = db.getCvDocument(application.cv_document_id);
      if (cvDoc) {
        const safeTitle = (cvDoc.title || 'CV').replace(/[\\/:*?"<>|]/g, '-');
        const [cvPdf, cvDocx] = await Promise.all([
          generateDocumentPdf(cvDoc.content_html, cvDoc.title, exportOptions),
          generateDocumentDocx(cvDoc.content_html, cvDoc.title, exportOptions),
        ]);
        fs.writeFileSync(path.join(folderPath, `${safeTitle}.pdf`), cvPdf);
        fs.writeFileSync(path.join(folderPath, `${safeTitle}.docx`), cvDocx);
        files.push(`${safeTitle}.pdf`, `${safeTitle}.docx`);
      }
    }

    if (application.cover_letter?.text) {
      const clData = buildCoverLetterData(personal, application);
      const [clDocx, clPdf] = await Promise.all([generateCoverLetterDocx(clData), generateCoverLetterPdf(clData)]);
      fs.writeFileSync(path.join(folderPath, `${clBaseName}.docx`), clDocx);
      fs.writeFileSync(path.join(folderPath, `${clBaseName}.pdf`), clPdf);
      files.push(`${clBaseName}.docx`, `${clBaseName}.pdf`);
    }

    if (copyReferences && application.reference_ids?.length > 0) {
      const allRefs = db.getAllReferences();
      const refDir  = db.getRefLettersDir();
      for (const refId of application.reference_ids) {
        const ref = allRefs.find(r => r.id === refId);
        if (!ref) continue;
        const src = path.join(refDir, ref.stored_name);
        if (!fs.existsSync(src)) continue;
        fs.copyFileSync(src, uniqueDestPath(folderPath, ref.file_name));
        files.push(ref.file_name);
      }
    }

    res.json({ folderPath, files });
  } catch (err) {
    console.error('[export] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/backup', (req, res) => {
  try { res.json(db.getAllData()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/export/restore', (req, res) => {
  try { db.restoreData(req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/export/open-folder', (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'Folder not found' });
    }
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32'  ? 'explorer'
              : 'xdg-open';
    spawn(cmd, [folderPath], { detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Opens a native file-picker dialog and returns the selected path (or null if cancelled).
// The Express server has no access to Electron APIs, so we drive the dialog from the CLI:
//   Windows — PowerShell + WinForms (requires -STA for the UI thread)
//   macOS   — osascript choose-file
//   Linux   — zenity --file-selection
// spawnSync is intentional: the server is single-user and blocking while the dialog is
// open is fine — the user cannot interact with the app while choosing a file anyway.
router.post('/export/browse-file', (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    let filePath = null;

    if (process.platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$d = New-Object System.Windows.Forms.OpenFileDialog',
        '$d.Title = "Select CV file"',
        '$d.Filter = "CV files (*.docx;*.pdf)|*.docx;*.pdf|All files (*.*)|*.*"',
        '$null = $d.ShowDialog()',
        'if ($d.FileName) { Write-Output $d.FileName }',
      ].join('; ');
      const r = spawnSync('powershell', ['-NonInteractive', '-STA', '-Command', script],
        { encoding: 'utf8', timeout: 120000 });
      filePath = r.stdout?.trim() || null;

    } else if (process.platform === 'darwin') {
      const r = spawnSync('osascript', [
        '-e',
        'POSIX path of (choose file with prompt "Select a CV file:" of type {"docx", "pdf", "public.data"})',
      ], { encoding: 'utf8', timeout: 120000 });
      filePath = r.stdout?.trim() || null;

    } else {
      const r = spawnSync('zenity', [
        '--file-selection',
        '--title=Select CV file',
        '--file-filter=CV files (*.docx *.pdf) | *.docx *.pdf',
      ], { encoding: 'utf8', timeout: 120000 });
      filePath = r.status === 0 ? (r.stdout?.trim() || null) : null;
    }

    res.json({ path: filePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Opens a file with the OS default application (same pattern as open-folder).
router.post('/export/open-file', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32'  ? 'explorer'
              : 'xdg-open';
    spawn(cmd, [filePath], { detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
