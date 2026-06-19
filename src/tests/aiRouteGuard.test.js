// Tests for the requireAI(settings, res) guard described in CLAUDE.md:
// every AI-calling route must check BOTH `aiEnabled` and `anthropicApiKey`
// before proceeding. A route that forgets this guard (or a future change
// that breaks it) would call the Anthropic API even when AI is disabled.
//
// These tests only exercise the guard itself — the "both set" success path
// is out of scope, since it would require either a live API key or mocking
// the @anthropic-ai/sdk module.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import express from 'express';

// The route modules (src/main/routes/*.js) are CommonJS and reach `db.js` via
// `require()`. Loading `db` here the same way (rather than `import db from
// '../main/db.js'`) ensures the test and the routes share the same module
// instance — otherwise Vite's ESM/CJS interop gives each its own copy of the
// in-memory `settings`, and `db.updateSettings()` in the test would have no
// effect on what the route sees.
const require = createRequire(import.meta.url);
const db = require('../main/db.js');

let tmpDir;
let server;
let baseUrl;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api', require('../main/routes/ai.js'));
  app.use('/api', require('../main/routes/aiChat.js'));
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cv-ferret-test-'));
  db.initializeDatabase(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const ROUTES = [
  { name: 'cv-assembly/analyse', path: '/cv-assembly/analyse', body: { jobAd: 'Some job ad' } },
  { name: 'generate-versions', path: '/generate-versions', body: { taskId: 1, description: 'desc', jobTitle: 'Title', tags: [] } },
  { name: 'generate-versions-batch', path: '/generate-versions-batch', body: {} },
  { name: 'ai/chat', path: '/ai/chat', body: { messages: [] } },
];

describe.each(ROUTES)('$name', ({ path, body }) => {
  it('returns 403 when AI is disabled, even if an API key is configured', async () => {
    db.updateSettings({ aiEnabled: false, anthropicApiKey: 'sk-test-key' });

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/disabled/i);
  });

  it('returns 400 when AI is enabled but no API key is configured', async () => {
    db.updateSettings({ aiEnabled: true, anthropicApiKey: '' });

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/api key/i);
  });
});
