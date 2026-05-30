'use strict';

const { Router } = require('express');
const db           = require('../db.js');
const samplesCache = require('../styleSamplesCache.js');

const router = Router();

router.get('/settings', (req, res) => {
  try {
    const s = db.getSettings();
    res.json({
      hasApiKey:            !!s.anthropicApiKey,
      coverLetterSamplesDir: s.coverLetterSamplesDir || '',
      exportPath:            s.exportPath  || '',
      aiEnabled:             s.aiEnabled   !== false,
      cvOrder:               s.cvOrder     || 'newest-first',
      pageSize:              s.pageSize    || 'A4',
      cvLocale:              s.cvLocale    || 'en-GB',
      cvFileName:            s.cvFileName  || 'CV',
      coverLetterFileName:   s.coverLetterFileName || 'Cover Letter',
      aiPiiExclusions:       s.ai_pii_exclusions || [],
      aiPersonas:            s.ai_personas || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', (req, res) => {
  try {
    // Changing the samples directory invalidates the cached letter samples.
    if ('coverLetterSamplesDir' in req.body) samplesCache.clear();
    db.updateSettings(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
