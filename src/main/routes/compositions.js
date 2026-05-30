'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/compositions', (req, res) => {
  try { res.json(db.getAllCompositions()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/compositions', (req, res) => {
  try {
    const { name, ...payload } = req.body;
    const id = db.createComposition(name, payload);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/compositions/:id', (req, res) => {
  try {
    const comp = db.getComposition(parseInt(req.params.id));
    if (!comp) return res.status(404).json({ error: 'Not found' });
    res.json(comp);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/compositions/:id', (req, res) => {
  try {
    const { name, ...payload } = req.body;
    db.updateComposition(parseInt(req.params.id), name, payload);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/compositions/:id', (req, res) => {
  try {
    db.deleteComposition(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
