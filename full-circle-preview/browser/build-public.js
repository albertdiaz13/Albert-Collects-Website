/* Turns dist/storefront (the artifact build) into a standalone site in dist/public-demo:
 * a full HTML document, noindex headers and robots.txt, plus manifest.json for Cloudflare
 * Workers static assets (path → {hash, size}). Checkout stays simulated: the cart lives in
 * the visitor's browser and nothing talks to Shopify. Usage: node browser/build-public.js */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SRC = path.join(__dirname, '..', 'dist', 'storefront');
const OUT = path.join(__dirname, '..', 'dist', 'public-demo');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const body = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace(/<title>.*?<\/title>\n?/, '').replace(/<meta name="description"[^>]*>\n?/, '');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Full Circle Collaborations — theme preview</title>
<meta name="description" content="Preview of the Full Circle Collaborations Shopify theme. Checkout and bookings are simulated.">
</head>
<body>
${body}
</body>
</html>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(OUT, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: same-origin\n');

const manifest = {};
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    const rel = '/' + path.relative(OUT, p).split(path.sep).join('/');
    if (rel === '/_headers') continue; // config file, not an asset
    const buf = fs.readFileSync(p);
    const hash = crypto.createHash('sha256').update(buf.toString('base64') + path.extname(p).slice(1)).digest('hex').slice(0, 32);
    manifest[rel] = { hash, size: buf.length };
  }
})(OUT);
fs.writeFileSync(path.join(OUT, '..', 'public-demo-manifest.json'), JSON.stringify(manifest));
console.log(Object.keys(manifest).length, 'assets', (Object.values(manifest).reduce((n, m) => n + m.size, 0) / 1e6).toFixed(2), 'MB');
