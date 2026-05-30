// pkg bundles a small-ICU Node.js build that lacks some legacy encodings.
// fontkit (a pdfkit dependency) tries to create TextDecoder('windows-1252')
// at module load time. We intercept and fall back to UTF-8; our use of pdfkit
// only ever uses built-in Helvetica so this encoding path is never exercised.
if (typeof TextDecoder !== 'undefined') {
  const _TD = TextDecoder;
  global.TextDecoder = class SafeTextDecoder extends _TD {
    constructor(encoding = 'utf-8', options) {
      try { super(encoding, options); }
      catch (e) {
        if (e.code === 'ERR_ENCODING_NOT_SUPPORTED') super('utf-8', options);
        else throw e;
      }
    }
  };
}

const express = require('express');
const path    = require('path');
const { spawn } = require('child_process');
const dbModule  = require('./db.js');

const app  = express();
const PORT = process.env.PORT || 5000;

// When running as a packaged exe (pkg), automatically use production mode
const isPackaged = typeof process.pkg !== 'undefined';
if (isPackaged && !process.env.NODE_ENV) process.env.NODE_ENV = 'production';

// Resolve the frontend dist directory whether packaged or running from source
const distDir = isPackaged
  ? path.join(path.dirname(process.execPath), 'dist')
  : path.join(__dirname, '../../dist');

// Initialize database
dbModule.initializeDatabase(path.join(process.env.APPDATA || process.env.HOME, '.cv-builder'));
dbModule.performAutoBackup();

// Middleware
app.use(express.json());

// CORS — only needed in development, where the Vite dev server (port 5173)
// makes cross-origin requests to this server (port 5000).
// In production the frontend is served by Express itself (same origin),
// so no CORS headers are set at all.
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') res.sendStatus(200);
    else next();
  });
}

// Serve static files from dist (production only)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir));
}

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api', require('./routes/jobs'));
app.use('/api', require('./routes/education'));
app.use('/api', require('./routes/personal'));
app.use('/api', require('./routes/compositions'));
app.use('/api', require('./routes/applications'));
app.use('/api', require('./routes/references'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/ai'));
app.use('/api', require('./routes/aiChat'));
app.use('/api', require('./routes/documents'));
app.use('/api', require('./routes/cvDocuments'));
app.use('/api', require('./routes/profiles'));
app.use('/api', require('./routes/importExport'));

// ── Catch-all: serve the React app for any non-API route (must be last) ───────

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ── Start server ──────────────────────────────────────────────────────────────

const server = app.listen(PORT, '127.0.0.1', () => {
  if (isPackaged) {
    console.log('');
    console.log('  =============================================');
    console.log('   CV Ferret');
    console.log(`   Running at http://localhost:${PORT}`);
    console.log('  =============================================');
    console.log('');
    console.log('  Your browser should open automatically.');
    console.log(`  If not, go to http://localhost:${PORT}`);
    console.log('');
    console.log('  Close this window to stop the application.');
    console.log('');
    setTimeout(() => {
      spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`],
        { shell: false, detached: true, stdio: 'ignore' }).unref();
    }, 600);
  } else {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — CV Ferret may already be running.`);
    if (isPackaged) {
      // In the packaged exe, open a tab in the existing instance instead of failing.
      setTimeout(() => {
        spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`],
          { shell: false, detached: true, stdio: 'ignore' }).unref();
      }, 300);
      setTimeout(() => process.exit(0), 1500);
    } else {
      // In dev mode, exit so concurrently reports the failure clearly.
      // Run: npx kill-port 5000   (or check Task Manager) to free the port.
      process.exit(1);
    }
  } else {
    throw err;
  }
});
