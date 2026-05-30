'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/education', (req, res) => {
  try { res.json(db.getAllEducation()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/education', (req, res) => {
  try {
    const { institution, title, endDate, notes } = req.body;
    const id = db.createEducation(institution, title, endDate, notes);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/education/:id', (req, res) => {
  try {
    const { institution, title, endDate, notes } = req.body;
    db.updateEducation(parseInt(req.params.id), institution, title, endDate, notes);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/education/:id', (req, res) => {
  try {
    db.deleteEducation(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/training', (req, res) => {
  try { res.json(db.getAllTraining()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/training', (req, res) => {
  try {
    const { institution, title, endDate, notes } = req.body;
    const id = db.createTraining(institution, title, endDate, notes);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/training/:id', (req, res) => {
  try {
    const { institution, title, endDate, notes } = req.body;
    db.updateTraining(parseInt(req.params.id), institution, title, endDate, notes);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/training/:id', (req, res) => {
  try {
    db.deleteTraining(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/skills', (req, res) => {
  try { res.json(db.getSkills()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/skills', (req, res) => {
  try { db.updateSkills(req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/languages', (req, res) => {
  try { res.json(db.getLanguages()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/languages', (req, res) => {
  try { db.updateLanguages(req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
