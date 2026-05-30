'use strict';

const path    = require('path');
const fs      = require('fs');
const { Router } = require('express');
const db         = require('../db.js');
const { generateDocumentPdf, generateDocumentDocx } = require('../exportHelpers.js');

const router = Router();

// ── List and get ──────────────────────────────────────────────────────────────

router.get('/cv-documents', (req, res) => {
  try { res.json(db.getAllCvDocuments()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cv-documents/:id', (req, res) => {
  try {
    const doc = db.getCvDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'CV document not found' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────
// body: { title?, content_html?, profile_id?, job_ad_text? }

router.post('/cv-documents', (req, res) => {
  try {
    const { title, content_html, profile_id, job_ad_text, notes } = req.body;
    const id = db.createCvDocument(title, content_html || '', profile_id || null, job_ad_text || '', notes || '');
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Update ────────────────────────────────────────────────────────────────────
// Accepts any subset of { title, content_html, profile_id, job_ad_text }

router.put('/cv-documents/:id', (req, res) => {
  try {
    db.updateCvDocument(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/cv-documents/:id', (req, res) => {
  try {
    db.deleteCvDocument(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.post('/cv-documents/:id/export-pdf', async (req, res) => {
  try {
    const doc = db.getCvDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'CV document not found' });

    const settings  = db.getSettings();
    const exportPath = settings.exportPath;
    if (!exportPath || !fs.existsSync(exportPath)) {
      return res.status(400).json({ error: 'Export path not set or does not exist. Configure it in Settings.' });
    }

    const safeTitle = (doc.title || 'CV').replace(/[\\/:*?"<>|]/g, '-');
    const filePath  = path.join(exportPath, `${safeTitle}.pdf`);
    const buffer    = await generateDocumentPdf(doc.content_html, doc.title, { pageSize: settings.pageSize || 'A4' });
    fs.writeFileSync(filePath, buffer);
    res.json({ filePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cv-documents/:id/export-docx', async (req, res) => {
  try {
    const doc = db.getCvDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'CV document not found' });

    const settings  = db.getSettings();
    const exportPath = settings.exportPath;
    if (!exportPath || !fs.existsSync(exportPath)) {
      return res.status(400).json({ error: 'Export path not set or does not exist. Configure it in Settings.' });
    }

    const safeTitle = (doc.title || 'CV').replace(/[\\/:*?"<>|]/g, '-');
    const filePath  = path.join(exportPath, `${safeTitle}.docx`);
    const buffer    = await generateDocumentDocx(doc.content_html, doc.title, { pageSize: settings.pageSize || 'A4' });
    fs.writeFileSync(filePath, buffer);
    res.json({ filePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
