'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

// ── Impact queries ─────────────────────────────────────────────────────────────
// Return which cv_documents reference the given job or task IDs, so the UI can
// warn the user before a bulk delete. Reads only — no mutations.
//
// Response shape: { affected: [{ id, title, jobIds?, taskIds?, applicationId }] }
// applicationId is non-null when the cv_document is linked to an application,
// indicating it is part of a submitted application record.

function buildApplicationIndex(applications) {
  const index = {};
  for (const app of applications) {
    if (app.cv_document_id) index[app.cv_document_id] = app.id;
  }
  return index;
}

// GET /api/impact/jobs?ids=1,2,3
router.get('/impact/jobs', (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({ affected: [] });

    const docs = db.getAllCvDocuments();
    const appIndex = buildApplicationIndex(db.getAllApplications());
    const affected = [];

    for (const doc of docs) {
      if (!doc.content_html) continue;
      const matchedJobIds = ids.filter(id => doc.content_html.includes(`data-job-id="${id}"`));
      if (matchedJobIds.length) {
        affected.push({
          id: doc.id,
          title: doc.title || 'Untitled CV',
          jobIds: matchedJobIds,
          applicationId: appIndex[doc.id] || null,
        });
      }
    }

    res.json({ affected });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/impact/tasks?ids=1,2,3
router.get('/impact/tasks', (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({ affected: [] });

    const docs = db.getAllCvDocuments();
    const appIndex = buildApplicationIndex(db.getAllApplications());
    const affected = [];

    for (const doc of docs) {
      if (!doc.content_html) continue;
      const matchedTaskIds = ids.filter(id => doc.content_html.includes(`data-task-id="${id}"`));
      if (matchedTaskIds.length) {
        affected.push({
          id: doc.id,
          title: doc.title || 'Untitled CV',
          taskIds: matchedTaskIds,
          applicationId: appIndex[doc.id] || null,
        });
      }
    }

    res.json({ affected });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
