'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/profiles', (req, res) => {
  try { res.json(db.getAllProfiles()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/profiles', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Profile name is required.' });
    const id = db.createProfile(name.trim(), description || '');
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/profiles/:id', (req, res) => {
  try {
    const profile = db.getProfile(parseInt(req.params.id));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profiles/:id', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Profile name is required.' });
    db.updateProfile(parseInt(req.params.id), name.trim(), description || '');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/profiles/:id', (req, res) => {
  try {
    db.deleteProfile(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Designate a cv_document as the base CV for a profile.
// Also moves the document into the profile if it wasn't already there.
router.put('/profiles/:id/set-base-cv', (req, res) => {
  try {
    const profileId   = parseInt(req.params.id);
    const { cv_document_id } = req.body;
    if (!cv_document_id) return res.status(400).json({ error: 'cv_document_id is required.' });
    db.setProfileBaseCv(profileId, parseInt(cv_document_id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
