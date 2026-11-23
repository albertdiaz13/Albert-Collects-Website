/* Serves dist/storefront under /artifact/x/ with an artifact-like CSP, then drives a shopper
 * through it in Chromium. Usage: node browser/test-static.js <screenshotDir> */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const OUT = process.argv[2] || '.';
const DIST = path.join(__dirname, '..', 'dist', 'storefront');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'";

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/artifact/x/')) { res.writeHead(404); return res.end('outside artifact'); }
  let rel = u.pathname.slice('/artifact/x/'.length) || 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(file);
  if (rel === 'index.html') body = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top)}body{margin:0;font:14px system-ui}</style></head><body>${body}</body></html>`);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
  res.end(body);
});

(async () => {
  await new Promise((r) => server.listen(9393, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  page.on('requestfailed', (r) => errors.push('failed ' + r.url()));
  const BASE = 'http://localhost:9393/artifact/x/';
  const ok = (s) => console.log('PASS', s);

  await page.goto(BASE);
  await page.locator('.fc-hero__title').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/s-home.png` });
  ok('homepage renders from theme files in the browser');

  await page.mouse.wheel(0, 900); await page.waitForTimeout(1200);
  assert.ok(await page.locator('.fc-bill__title').first().isVisible());
  ok('scrolls to the show bill');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-fc-menu] summary').click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('.fc-drawer').isVisible());
  await page.screenshot({ path: `${OUT}/s-menu.png` });
  ok('menu opens');
  await page.locator('.fc-drawer__link', { hasText: 'Shop' }).click();
  await page.locator('.fc-collection__title').waitFor();
  assert.ok(location => true);
  assert.strictEqual(await page.locator('.fc-card').count(), 3);
  assert.ok(page.url().endsWith('#c-shop'), page.url());
  ok('menu → Shop collection (#c-shop)');

  await page.locator('#SortBy-template--collection__main').selectOption('price-descending');
  await page.waitForFunction(() => document.querySelector('.fc-card__title').textContent.includes('Stickers'));
  ok('sort select re-renders the collection');

  await page.getByRole('link', { name: 'Custom Stickers' }).first().click();
  await page.locator('.fc-product__title').waitFor();
  await page.locator('label', { hasText: 'Plain' }).click();
  await page.locator('label', { hasText: 'Regular' }).click();
  await page.locator('label', { hasText: 'Circle' }).click();
  assert.strictEqual((await page.locator('[data-fc-price-wrap] [data-fc-amount]').textContent()).trim(), '$30.00');
  ok('variant selection updates the price to $30.00');
  await page.locator('.fc-buy__submit').click();
  await page.locator('[data-fc-toast]:not([hidden])').waitFor();
  assert.strictEqual((await page.locator('[data-fc-cart-count] [aria-hidden]').first().textContent()).trim(), '1');
  assert.strictEqual((await page.locator('[data-fc-toast-title]').textContent()).trim(), 'Added to cart');
  await page.screenshot({ path: `${OUT}/s-added.png` });
  ok('add to cart → toast + header count 1');

  await page.locator('[data-fc-toast]').getByRole('link', { name: 'View cart' }).click();
  await page.locator('.fc-cart__title').waitFor();
  await page.locator('.fc-line [data-fc-qty-step="1"]').click();
  await page.waitForFunction(() => document.querySelector('.fc-summary__total').textContent.includes('60.00'));
  ok('cart quantity change re-renders (2 × $30)');

  await page.reload();
  await page.locator('.fc-cart__title').waitFor();
  assert.ok((await page.locator('.fc-summary__total').textContent()).includes('60.00'));
  ok('reload keeps route (#cart) and cart contents');

  // booking
  await page.locator('.fc-subbar__link--book').click();
  await page.locator('.fc-vending__title').waitFor();
  await page.locator('.fc-bill__link').first().click();
  await page.locator('.fc-event__title').waitFor();
  await page.waitForTimeout(400);
  await page.locator('[data-fc-sticky-go]').click();
  await page.locator('[data-fc-toast]:not([hidden])').waitFor();
  ok('book a table from the sticky bar');

  await page.locator('[data-fc-toast]').getByRole('button', { name: 'Check out' }).click();
  await page.locator('[data-checkout-stub]').waitFor();
  const stub = await page.locator('table').textContent();
  assert.ok(stub.includes('Plain / Regular / Circle') && stub.includes('Standard table'));
  await page.screenshot({ path: `${OUT}/s-checkout.png`, fullPage: true });
  ok('simulated checkout shows stickers + table');
  await page.getByRole('link', { name: 'Back to the store' }).click();
  await page.locator('.fc-hero__title').waitFor();
  ok('back to the store from checkout');

  // search
  await page.locator('[data-fc-search] summary').click();
  await page.locator('#HeaderSearch-sections--fc__header').fill('hat');
  await page.keyboard.press('Enter');
  await page.locator('.fc-search').waitFor();
  assert.ok((await page.locator('.fc-card').count()) >= 2);
  ok('search for "hat"');

  // desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '#');
  await page.locator('.fc-hero__title').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/s-home-1440.png` });

  const real = errors.filter((e) => !/favicon/.test(e));
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'no console errors, no blocked requests');
  await browser.close();
  server.close();
  process.exit(real.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
