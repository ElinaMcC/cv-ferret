'use strict';

const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Router } = require('express');
const multer = require('multer');
const db     = require('../db.js');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);

// Multer storage: destination is resolved lazily so db.getRefLettersDir() is
// called after the database has been initialised (which happens in server.js).
// Files are stored under a UUID name to prevent path traversal via originalname.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, db.getRefLettersDir()),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXTENSIONS.has(ext));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const router = Router();

router.get('/references', (req, res) => {
  try { res.json(db.getAllReferences()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/references/:id/file', (req, res) => {
  try {
    const ref = db.getReference(parseInt(req.params.id));
    if (!ref) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(db.getRefLettersDir(), ref.stored_name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/references/upload', upload.single('file'), (req, res) => {
  try {
    const { jobId, tags, notes } = req.body;
    const parsedTags = tags ? JSON.parse(tags) : [];
    const id = db.createReference(
      req.file.originalname,
      req.file.filename,
      jobId ? parseInt(jobId) : null,
      parsedTags,
      notes || ''
    );
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/references/:id', (req, res) => {
  try {
    const { jobId, tags, notes } = req.body;
    db.updateReference(parseInt(req.params.id), jobId || null, tags || [], notes || '');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/references/:id', (req, res) => {
  try {
    const storedName = db.deleteReference(parseInt(req.params.id));
    if (storedName) {
      const filePath = path.join(db.getRefLettersDir(), storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
