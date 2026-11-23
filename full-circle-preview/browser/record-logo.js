/* Records the hero logo in motion from the built storefront: entrance, idle, hover roll,
 * click, scroll exit and return. Usage: node browser/record-logo.js <outDir> */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const DIST = path.join(__dirname, '..', 'dist', 'storefront');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html';
  const file = path.join(DIST, rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (rel === 'index.html') body = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>${body}</body></html>`);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});
(async () => {
  await new Promise((r) => server.listen(9595, r));
  const browser = await chromium.launch();
  const size = { width: 1280, height: 800 };
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: OUT, size } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:9595/');
  await page.waitForTimeout(6500);                       // entrance + a moment of idle
  const b = await page.locator('[data-fc-logo]').boundingBox();
  const y = b.y + b.height * 0.45;
  await page.mouse.move(b.x + b.width * 0.5, y, { steps: 10 });
  await page.mouse.move(b.x + b.width * 0.85, y, { steps: 30 });
  await page.waitForTimeout(500);
  await page.mouse.move(b.x + b.width * 0.15, y, { steps: 45 });
  await page.waitForTimeout(500);
  await page.mouse.click(b.x + b.width * 0.15, y);
  await page.waitForTimeout(1300);
  await page.mouse.move(b.x + b.width + 160, b.y - 30, { steps: 10 });
  await page.waitForTimeout(1600);
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(45); }
  await page.waitForTimeout(900);
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, -40); await page.waitForTimeout(45); }
  await page.waitForTimeout(1500);
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  fs.renameSync(src, path.join(OUT, 'logo-motion.webm'));
  await browser.close();
  server.close();
  console.log('recorded', path.join(OUT, 'logo-motion.webm'));
})();
