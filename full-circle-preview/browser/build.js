/* Builds the in-browser storefront into dist/storefront/:
 *   index.html, storefront.js, core.js, fixtures.js   the app
 *   theme.json                                        every Liquid/JSON file of ../full-circle-theme
 *   assets/                                           the theme's assets, unchanged
 *   img/, images.json                                 product photos (from the live CDN, 600 and 1200 px)
 *   fonts/                                            Inter, standing in for the font picker
 *   live-products.json                                the public catalog snapshot
 * Usage: node browser/build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const THEME = path.resolve(ROOT, '..', 'full-circle-theme');
const OUT = path.join(ROOT, 'dist', 'storefront');
const WIDTHS = [600, 1200];

fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
for (const d of ['assets', 'img', 'fonts']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// Theme text files
const theme = {};
for (const dir of ['layout', 'sections', 'snippets', 'templates', 'locales', 'config']) {
  for (const f of fs.readdirSync(path.join(THEME, dir))) {
    const p = path.join(THEME, dir, f);
    if (fs.statSync(p).isFile()) theme[`${dir}/${f}`] = fs.readFileSync(p, 'utf8');
  }
}
fs.writeFileSync(path.join(OUT, 'theme.json'), JSON.stringify(theme));
for (const f of fs.readdirSync(path.join(THEME, 'assets'))) fs.copyFileSync(path.join(THEME, 'assets', f), path.join(OUT, 'assets', f));

// App files
fs.copyFileSync(path.join(ROOT, 'core.js'), path.join(OUT, 'core.js'));
fs.copyFileSync(path.join(ROOT, 'fixtures.js'), path.join(OUT, 'fixtures.js'));
fs.copyFileSync(path.join(__dirname, 'storefront.js'), path.join(OUT, 'storefront.js'));
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(OUT, 'index.html'));
fs.copyFileSync(path.join(ROOT, 'fixtures', 'live-products.json'), path.join(OUT, 'live-products.json'));
for (const w of [400, 600, 700]) {
  fs.copyFileSync(path.join(ROOT, 'node_modules/@fontsource/inter/files', `inter-latin-${w}-normal.woff2`), path.join(OUT, 'fonts', `inter-latin-${w}-normal.woff2`));
}

// Product photos, downloaded once at two widths (Shopify's CDN also converts HEIC to JPEG)
const live = require(path.join(ROOT, 'fixtures', 'live-products.json')).products;
const index = {};
for (const p of live) {
  for (const img of p.images) {
    const file = img.src.split('?')[0].split('/').pop();
    const stem = file.replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_');
    index[file] = stem;
    for (const w of WIDTHS) {
      const dest = path.join(OUT, 'img', `${stem}-${w}.jpg`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
      execFileSync('curl', ['-sSfL', '-o', dest, `${img.src}&width=${w}&format=jpg`]);
    }
  }
}
fs.writeFileSync(path.join(OUT, 'images.json'), JSON.stringify(index));

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(path.relative(OUT, p)); } })(OUT);
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`Built ${files.length} files, ${(bytes / 1e6).toFixed(2)} MB → ${path.relative(process.cwd(), OUT)}`);
