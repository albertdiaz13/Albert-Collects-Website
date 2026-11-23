/* Local preview server for the Full Circle Shopify theme.
 *
 * Thin HTTP layer around core.js, which renders ../full-circle-theme with LiquidJS, keeps an
 * Ajax-API cart and simulates checkout. A stand-in for `shopify theme dev` when there is no
 * store access. Nothing here talks to a real store.
 *
 *   node server.js            → http://localhost:9292
 *   ?fixture=full|one|none    → switch the sample show set (remembered in a cookie)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const liquidjs = require('liquidjs');
const createApp = require('./core');
const createFixtures = require('./fixtures');

const THEME = path.resolve(__dirname, '..', 'full-circle-theme');
const PORT = parseInt(process.env.PORT || '9292', 10);

function readText(p) {
  try { return fs.readFileSync(path.join(THEME, p), 'utf8'); } catch (e) { return null; }
}

function previewHeader(mode) {
  const link = (m, label) => `<a href="?fixture=${m}" style="color:inherit;${m === mode ? 'font-weight:700;text-decoration:underline' : ''}">${label}</a>`;
  return `<script>
document.addEventListener('DOMContentLoaded',function(){
  var b=document.createElement('div');
  b.setAttribute('data-preview-bar','');
  b.style.cssText='font:500 11px/1.35 system-ui,sans-serif;background:#fff3b0;color:#3a3000;padding:4px 12px;display:flex;gap:4px 12px;flex-wrap:wrap;justify-content:center;border-bottom:1px solid #d8c66a';
  b.innerHTML='<span><strong>Local preview</strong> · real catalog · sample shows are fixtures, not real events</span><span>Shows: ${link('full', 'several')} · ${link('one', 'one')} · ${link('none', 'none')}</span>';
  if(!/[?&]bar=0/.test(location.search)) document.body.insertBefore(b,document.body.firstChild);
});
</script>`;
}

const app = createApp({
  liquidjs,
  fixtures: createFixtures(require('./fixtures/live-products.json').products),
  readText,
  listSnippets: () => fs.readdirSync(path.join(THEME, 'snippets')),
  origin: `http://localhost:${PORT}`,
  urls: {
    asset(name) {
      let v = 0;
      try { v = Math.floor(fs.statSync(path.join(THEME, 'assets', name)).mtimeMs); } catch (e) { /* missing */ }
      return `/assets/${name}?v=${v}`;
    },
    image(src, w) {
      if (!src || !/cdn\.shopify\.com/.test(src)) return src || '';
      return src + (src.includes('?') ? '&' : '?') + 'width=' + w;
    },
    font: (w) => `/fonts/inter-latin-${w}-normal.woff2`,
    headerHTML: previewHeader,
  },
});

const carts = new Map();
const MIME = {
  '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
};

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function parseForm(req) {
  if (req.method !== 'POST') return {};
  const buf = await readBody(req);
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) return { json: JSON.parse(buf.toString('utf8') || '{}') };
  if (type.includes('multipart/form-data')) {
    const boundary = type.split('boundary=')[1];
    const pairs = [];
    for (const part of buf.toString('utf8').split(`--${boundary}`)) {
      const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
      if (m) pairs.push([m[1], m[2]]);
    }
    return { pairs };
  }
  return { pairs: Array.from(new URLSearchParams(buf.toString('utf8')).entries()) };
}

function serveFile(res, file, type) {
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
  return send(res, 200, fs.readFileSync(file), type || MIME[path.extname(file)] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const cookies = Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => c.split('=')));
    let sid = cookies.fc_sid;
    const setCookies = [];
    if (!sid) { sid = crypto.randomBytes(8).toString('hex'); setCookies.push(`fc_sid=${sid}; Path=/`); }
    let mode = cookies.fc_fixture || 'full';
    if (['full', 'one', 'none'].includes(parsed.query.fixture)) { mode = parsed.query.fixture; setCookies.push(`fc_fixture=${mode}; Path=/`); }
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);

    if (pathname.startsWith('/assets/')) return serveFile(res, path.join(THEME, 'assets', path.basename(pathname)));
    if (pathname.startsWith('/fonts/')) return serveFile(res, path.join(__dirname, 'node_modules/@fontsource/inter/files', path.basename(pathname)), 'font/woff2');
    if (pathname === '/__reset') { carts.delete(sid); return send(res, 302, '', 'text/plain', { Location: '/' }); }

    if (!carts.has(sid)) carts.set(sid, { lines: [], note: '' });
    const { pairs, json } = await parseForm(req);
    const r = await app.handle({ method: req.method, pathname, query: parsed.query, pairs, json, cart: carts.get(sid), mode });

    if (r.type === 'redirect') return send(res, r.status, '', 'text/plain', { Location: r.location });
    if (r.type === 'json') return send(res, r.status, JSON.stringify(r.body), 'application/json');
    return send(res, r.status, r.body);
  } catch (err) {
    console.error(err);
    send(res, 500, `<pre>${String(err && err.stack).replace(/</g, '&lt;')}</pre>`);
  }
});

server.listen(PORT, () => console.log(`Full Circle preview on http://localhost:${PORT}`));
