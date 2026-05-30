'use strict';

// Assembles the release/ folder after pkg has built the exe.
// Run via: npm run package:win
//
// Output structure:
//   release/
//     cv-ferret.exe   — standalone server (Node.js bundled)
//     dist/            — Vite frontend build (must stay alongside the exe)

const fs = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const SRC_DIST  = path.join(ROOT, 'dist');
const DEST_DIST = path.join(ROOT, 'release', 'dist');

if (!fs.existsSync(SRC_DIST)) {
  console.error('ERROR: dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, 'release', 'cv-ferret.exe'))) {
  console.error('ERROR: release/cv-ferret.exe not found. pkg step may have failed.');
  process.exit(1);
}

// Copy dist/ into release/dist/
copyDir(SRC_DIST, DEST_DIST);

console.log('');
console.log('  ✓ release/ is ready:');
console.log('');
console.log('    release/cv-ferret.exe    — the application');
console.log('    release/dist/            — frontend files (keep alongside the exe)');
console.log('');
console.log('  To build the Windows installer:');
console.log('    Open installer/setup.iss in Inno Setup and click Build → Compile.');
console.log('    Output: installer/Output/Setup-CV-Ferret.exe');
console.log('');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
