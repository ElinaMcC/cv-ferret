'use strict';

const { Router } = require('express');
const Anthropic   = require('@anthropic-ai/sdk');
const db          = require('../db.js');
const { buildReplacementMap, stripPII } = require('../piiUtils.js');

const router = Router();

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

// POST /api/ai/chat
//
// Stateless conversational AI endpoint. The client sends the full conversation
// history on every request. The server builds the context (pool + document
// structure) server-side and strips all PII before calling the API, so no
// employer names, personal details, or user-defined exclusions ever leave the
// device in plaintext.
//
// Body:
//   messages          – [{role: 'user'|'assistant', content: string}] — full history
//   jobAd             – string — the pasted job ad (optional)
//   documentStructure – string — simplified description of what's currently in the CV
//   persona           – string — current reviewer persona (empty = general CV reviewer)
//
// Response:
//   { message: string, hasUngroundedContent: boolean }
//
// Ungrounded content: if the model generates text that does not come from the
// pool it is instructed to wrap it in [[UNGROUNDED: ... ]]. The client uses
// hasUngroundedContent to show a visual warning.

router.post('/ai/chat', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (!requireAI(settings, res)) return;

    const { messages = [], jobAd = '', documentStructure = '', persona = '' } = req.body;

    // Build PII replacement map from live database state
    const personal = db.getPersonal();
    const jobs     = db.getAllJobs();
    const extras   = settings.ai_pii_exclusions || [];
    const piiMap   = buildReplacementMap(personal, jobs, extras);

    // Build anonymised pool summary for the system prompt.
    // We send only job titles (not employer names) and task descriptions.
    const allJobsWithTasks = db.getAllJobsWithTasks();
    const poolLines = allJobsWithTasks.flatMap(job => {
      const heading = `[${job.job_title || 'Role'}]`;
      const tasks = (job.tasks || []).flatMap(task => {
        const versions = (task.versions || []).map(
          v => `  - ${stripPII(v.description || '', piiMap)}`
        );
        return versions;
      });
      return tasks.length ? [heading, ...tasks] : [];
    });
    const anonymisedPool = poolLines.join('\n');

    // Strip PII from any user-provided context
    const cleanJobAd            = stripPII(jobAd, piiMap);
    const cleanDocumentStructure = stripPII(documentStructure, piiMap);

    // Strip PII from all user messages in the history as a safety net
    // (users sometimes type their own details into the chat)
    const cleanMessages = messages.map(m => ({
      role: m.role,
      content: m.role === 'user' ? stripPII(m.content, piiMap) : m.content,
    }));

    const personaSection = persona
      ? `\nYou are currently reviewing this CV from the perspective of: ${persona}.\n`
      : '';

    const systemPrompt = `You are an expert CV consultant helping a candidate improve their CV for a specific job application.
${personaSection}
STRICT RULES — these override everything else:
1. Only draw on the experience in the pool below. You may suggest reframing, emphasising, or de-emphasising real pool items, but never invent experience or achievements that are not represented there.
2. If you generate any text that cannot be directly traced to a pool item, wrap it in [[UNGROUNDED: your suggested text here]]. This allows the user to review and verify it before accepting.
3. Employer names in the pool have been anonymised (e.g. [Employer 1]). Do not attempt to infer or name real employers.
4. You may switch perspectives at any time if the user requests it.
5. Whenever you recommend a specific bullet point from the pool, format it as a [[SUGGESTION]] block immediately — do not wait to be asked:
   [[SUGGESTION jobId="N": verbatim pool text here]]
   where N is the numeric jobId shown in brackets in the CV STRUCTURE (e.g. [jobId:5] → jobId="5").
   For additions under a named heading that has no jobId (e.g. Education, Skills), use:
   [[SUGGESTION heading="Exact Heading Text": verbatim pool text here]]
   CRITICAL: the text inside [[SUGGESTION]] MUST be copied word-for-word from the pool above — same wording, same punctuation. Do NOT paraphrase or rewrite. If you want to suggest a rewrite, explain it in your prose analysis and then put the closest matching pool version in the [[SUGGESTION]] block. Put every bullet recommendation in its own [[SUGGESTION]] block.
6. On the first turn only, suggest 1–2 reviewer perspectives suited to the pool content${cleanJobAd ? ' and job ad' : ''} by wrapping each as:
   [[PERSONA: brief description of the reviewer perspective]]
   Example: [[PERSONA: HR Manager evaluating leadership and communication]]
   Then offer to proceed as a general CV reviewer if the user prefers no specific perspective.

CANDIDATE'S EXPERIENCE POOL (anonymised):
${anonymisedPool || '(Pool is empty — the user has not added any experience yet.)'}

${cleanJobAd ? `JOB ADVERTISEMENT:\n${cleanJobAd}\n` : ''}
${cleanDocumentStructure ? `CURRENT CV STRUCTURE:\n${cleanDocumentStructure}\n` : ''}`;

    const client = new Anthropic({ apiKey: settings.anthropicApiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: cleanMessages.length > 0 ? cleanMessages : [{ role: 'user', content: 'Hello, I\'d like help with my CV.' }],
    });

    const message = response.content[0].text;
    const hasUngroundedContent = message.includes('[[UNGROUNDED:');

    res.json({ message, hasUngroundedContent });
  } catch (err) {
    console.error('[ai/chat] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
