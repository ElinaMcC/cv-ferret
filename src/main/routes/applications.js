'use strict';

const fs     = require('fs');
const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/applications', (req, res) => {
  try { res.json(db.getAllApplications()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/applications', (req, res) => {
  try {
    const id = db.createApplication(req.body);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/applications/:id', (req, res) => {
  try {
    const application = db.getApplication(parseInt(req.params.id));
    if (!application) return res.status(404).json({ error: 'Not found' });
    res.json(application);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/applications/:id', (req, res) => {
  try {
    db.updateApplication(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/applications/batch-delete', (req, res) => {
  try {
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'No ids provided' });
    db.batchDeleteApplications(ids);
    res.json({ success: true, deleted: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/applications/:id', (req, res) => {
  try {
    db.deleteApplication(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check whether files referenced by an application still exist on disk.
// Returns { cv_file_missing: true } if cv_file_path is set but the file is gone.
router.get('/applications/:id/check-files', (req, res) => {
  try {
    const application = db.getApplication(parseInt(req.params.id));
    if (!application) return res.status(404).json({ error: 'Not found' });
    const cv_file_missing = !!(
      application.cv_file_path &&
      !fs.existsSync(application.cv_file_path)
    );
    res.json({ cv_file_missing });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
