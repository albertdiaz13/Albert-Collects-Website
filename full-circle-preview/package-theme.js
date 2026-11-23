/* Packages ../full-circle-theme as a ZIP for Online Store › Themes › Add theme › Upload zip file.
 * Folders sit at the ZIP root (layout/, config/, …) as Shopify expects. Usage: node package-theme.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const THEME = path.resolve(__dirname, '..', 'full-circle-theme');
const OUT = path.join(__dirname, 'dist', 'full-circle-theme.zip');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.rmSync(OUT, { force: true });
execFileSync('zip', ['-r', '-X', '-q', OUT, 'assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates', '-x', '*.DS_Store'], { cwd: THEME });
console.log(`${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
