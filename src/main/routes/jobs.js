'use strict';

const { Router } = require('express');
const db = require('../db.js');

const router = Router();

router.get('/jobs', (req, res) => {
  try { res.json(db.getAllJobs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/jobs/with-tasks', (req, res) => {
  try { res.json(db.getAllJobsWithTasks()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/jobs', (req, res) => {
  try {
    const { employer, jobTitle, startDate, endDate, location, notes } = req.body;
    const id = db.createJob(employer, jobTitle, startDate, endDate, location, notes);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/jobs/:jobId', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { employer, jobTitle, startDate, endDate, location, notes } = req.body;
    db.updateJob(jobId, employer, jobTitle, startDate, endDate, location, notes);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/jobs/:jobId/tasks', (req, res) => {
  try { res.json(db.getTasksByJob(parseInt(req.params.jobId))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/tasks', (req, res) => {
  try {
    const id = db.createTask(req.body.jobId);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/tasks/:taskId', (req, res) => {
  try {
    db.deleteTask(parseInt(req.params.taskId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/jobs/:jobId/tasks-order', (req, res) => {
  try {
    db.reorderTasks(parseInt(req.params.jobId), req.body.taskIds);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/jobs/:jobId/tasks-with-version', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { description, tags, rolePriorities } = req.body;
    const taskId    = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, description, tags || [], undefined, rolePriorities || []);
    res.json({ taskId, versionId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/tasks/:taskId/versions', (req, res) => {
  try {
    const { description, tags, rolePriorities } = req.body;
    const id = db.createTaskVersion(parseInt(req.params.taskId), description, tags || [], undefined, rolePriorities || []);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/versions/:versionId', (req, res) => {
  try {
    const version = db.getVersionWithTags(parseInt(req.params.versionId));
    if (!version) return res.status(404).json({ error: 'Version not found' });
    res.json(version);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/versions/:versionId', (req, res) => {
  try {
    const { description, tags, rolePriorities } = req.body;
    db.updateTaskVersion(parseInt(req.params.versionId), description, tags || [], rolePriorities || []);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/versions/:versionId', (req, res) => {
  try {
    const result = db.deleteTaskVersion(parseInt(req.params.versionId));
    res.json({ success: true, taskDeleted: result.taskDeleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/versions/:versionId/default', (req, res) => {
  try {
    db.setDefaultVersion(parseInt(req.params.versionId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/roles', (req, res) => {
  try { res.json(db.getAllRoles()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/tags', (req, res) => {
  try { res.json(db.getAllTags()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/search', (req, res) => {
  try { res.json(db.searchTasks(req.query.q)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
