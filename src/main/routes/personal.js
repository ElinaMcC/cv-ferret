'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/personal', (req, res) => {
  try { res.json(db.getPersonal()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/personal', (req, res) => {
  try { db.updatePersonal(req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
