'use strict';

const { Router }   = require('express');
const Anthropic    = require('@anthropic-ai/sdk');
const db           = require('../db.js');
const samplesCache = require('../styleSamplesCache.js');

const router = Router();

// Guards both conditions: AI must be enabled AND an API key must be present.
// Returns true if the request can proceed; writes the error response and
// returns false if not. Call as: if (!requireAI(settings, res)) return;
function requireAI(settings, res) {
  if (settings.aiEnabled === false) {
    res.status(403).json({ error: 'AI features are disabled. Enable them in Settings.' });
    return false;
  }
  if (!settings.anthropicApiKey) {
    res.status(400).json({ error: 'No API key configured. Add your Anthropic API key in Settings.' });
    return false;
  }
  return true;
}

// ── CV Assembly analysis ──────────────────────────────────────────────────────

router.post('/cv-assembly/analyse', async (req, res) => {
  try {
    const { jobAd } = req.body;
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    // Build a compact pool: default version gets full detail; alt versions get
    // role priorities only (Claude picks by role match, not by reading every word).
    const pool = db.getAllJobsWithTasks().map(job => ({
      jobId: job.id,
      jobTitle: job.job_title,
      tasks: job.tasks.map(task => ({
        taskId: task.id,
        versions: task.versions.map(v => v.is_default
          ? { versionId: v.id, isDefault: true, description: v.description, tags: v.tags || [], roles: v.role_priorities || [] }
          : { versionId: v.id, isDefault: false, roles: v.role_priorities || [] }
        ),
      })),
    }));

    const client = new Anthropic({ apiKey: settings.anthropicApiKey });

    const prompt = `You are an expert CV consultant. Select the most relevant experience from the candidate's pool for this specific job.

JOB ADVERTISEMENT:
${jobAd}

EXPERIENCE POOL (default versions shown in full; alt versions listed by role priorities only — pick one by role match):
${JSON.stringify(pool)}

For every task return:
- taskId
- versionId: best existing version (prefer an alt whose roles match the job; use default if none fit better)
- include: true/false
- reason: 5–8 words max
- newDescription: only if no existing version fits the role well; otherwise null

Guidelines:
- Aim for 60–75% inclusion for strong matches; a focused CV beats an exhaustive one
- Every job must keep at least 1–2 tasks — no employment gaps
- For low-relevance jobs include tasks showing transferable skills (leadership, communication, delivery)

Return ONLY a valid JSON array, no markdown:
[{"taskId":N,"versionId":N,"include":true,"reason":"...","newDescription":null}]`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = message.content[0].text.trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    res.json(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cover letter style samples ────────────────────────────────────────────────

async function loadStyleSamples(dir) {
  if (samplesCache.get()) return samplesCache.get();
  if (!dir || !require('fs').existsSync(dir)) return { formal: [], short: [] };

  const mammoth = require('mammoth');
  const formal = [], short = [];
  const files = require('fs').readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.docx'))
    .sort().reverse();

  for (const file of files) {
    try {
      const result = await mammoth.extractRawText({ path: require('path').join(dir, file) });
      const text = result.value.trim();
      if (!text) continue;
      if (file.toLowerCase().includes('short')) short.push(text);
      else formal.push(text);
    } catch (e) {
      console.error('[cover-letter] Could not read', file, e.message);
    }
  }

  function truncate(texts, limit) {
    return texts.slice(0, limit).map(t => {
      const words = t.split(/\s+/);
      return words.length > 250 ? words.slice(0, 250).join(' ') + '…' : t;
    });
  }

  const result = { formal: truncate(formal, 3), short: truncate(short, 5) };
  samplesCache.set(result);
  console.log(`[cover-letter] Loaded ${result.formal.length} formal + ${result.short.length} short samples`);
  return result;
}

// ── Cover letter generation ───────────────────────────────────────────────────

router.post('/cover-letter/generate', async (req, res) => {
  try {
    const { applicationId, style } = req.body;
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    const application = db.getApplication(parseInt(applicationId));
    if (!application) return res.status(404).json({ error: 'Application not found.' });

    const [samples, points] = await Promise.all([
      loadStyleSamples(settings.coverLetterSamplesDir),
      Promise.resolve(application.composition_id ? db.getCompositionPoints(application.composition_id) : []),
    ]);

    const isShort      = style === 'short';
    const styleSamples = isShort ? samples.short : samples.formal;
    const styleLabel   = isShort ? 'short note to a hiring manager' : 'formal letter of motivation';

    const samplesBlock = styleSamples.length > 0
      ? `\nCANDIDATE WRITING SAMPLES — match this voice exactly (${styleLabel} style):\n` +
        styleSamples.map((t, i) => `[Sample ${i + 1}]\n${t}`).join('\n---\n') + '\n'
      : '';

    const pointsBlock = points.length > 0
      ? `\nKEY CV POINTS FOR THIS APPLICATION:\n${points.map(p => `- ${p}`).join('\n')}\n`
      : '';

    const jobContext = application.job_title ? `Role: ${application.job_title}` : '';

    const prompt = `Write a ${styleLabel} for the following job application.
${samplesBlock}
JOB CONTEXT:
${jobContext}

JOB ADVERTISEMENT:
${application.job_ad_text || '(No job ad text provided — use the role and company name as context)'}
${pointsBlock}
Rules for the letter body:
- ${isShort ? '3–4 short paragraphs, concise and direct' : 'Opening paragraph, 2–3 body paragraphs highlighting relevant experience, brief closing'}
- First person throughout
- Do not invent facts; draw only on what is provided above
- If writing samples are provided, match the candidate's tone, language, and phrasing style exactly — including the language the samples are written in

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "text": "<body paragraphs only — no date, address block, salutation, or sign-off>",
  "salutation": "<appropriate opening salutation in the same language and register as the letter body>",
  "closing": "<appropriate letter closing in the same language and register>",
  "locale": "<BCP 47 locale code matching the letter language, e.g. 'en-GB', 'de-DE'>"
}`;

    const client = new Anthropic({ apiKey: settings.anthropicApiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    let raw = message.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(raw);
    res.json({
      text:       parsed.text       || '',
      salutation: parsed.salutation || '',
      closing:    parsed.closing    || '',
      locale:     parsed.locale     || 'en-GB',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Version generation ────────────────────────────────────────────────────────

async function callClaude(apiKey, description, jobTitle, tags) {
  const client   = new Anthropic({ apiKey });
  const tagsText = tags && tags.length > 0 ? tags.join(', ') : 'none';

  const prompt = `You are an expert CV writer. Analyze this professional experience bullet point and generate role-specific alternate versions.

Original description:
${description}

Context:
- Job title: ${jobTitle}
- Keywords/tags: ${tagsText}

Instructions:
1. Identify 2-5 distinct professional roles for which this experience is relevant
2. Rank each role's relevance: 1 = this task is central to the role, 5 = moderately relevant
3. For each role, rewrite the description to emphasise the aspects most relevant to that role

Rules:
- Keep approximately the same length as the original
- Maintain complete factual accuracy — do not add or invent any details
- Use strong, role-appropriate action verbs

Return ONLY a valid JSON array, no explanation or markdown:
[{"role": "role name", "rank": 1, "description": "tailored description"}]`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = message.content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

router.post('/generate-versions', async (req, res) => {
  try {
    const { taskId, description, jobTitle, tags } = req.body;
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    const task = db.getTaskWithVersions(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isFirstRun = !task.versions.some(v => v.role_priorities && v.role_priorities.length > 0);
    const generated  = await callClaude(settings.anthropicApiKey, description, jobTitle, tags);

    if (isFirstRun) {
      generated.forEach(v => {
        db.createTaskVersion(taskId, v.description, [], false, [{ role: v.role, rank: v.rank }]);
      });
      res.json({ saved: true, versions: generated });
    } else {
      res.json({ saved: false, versions: generated });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-versions-batch', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    const jobs = db.getAllJobs();
    let processed = 0, skipped = 0;
    const errors = [];

    for (const job of jobs) {
      const tasks = db.getTasksByJob(job.id);
      for (const task of tasks) {
        const defaultVersion = task.versions.find(v => v.is_default);
        if (!defaultVersion) continue;

        const hasRolePriorities = task.versions.some(v => v.role_priorities && v.role_priorities.length > 0);
        if (hasRolePriorities) { skipped++; continue; }

        try {
          const generated = await callClaude(
            settings.anthropicApiKey,
            defaultVersion.description,
            job.job_title,
            defaultVersion.tags || []
          );
          generated.forEach(v => {
            db.createTaskVersion(task.id, v.description, [], false, [{ role: v.role, rank: v.rank }]);
          });
          processed++;
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          errors.push({ taskId: task.id, description: defaultVersion.description.slice(0, 60), error: err.message });
        }
      }
    }

    res.json({ processed, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
