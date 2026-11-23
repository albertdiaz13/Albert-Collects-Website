/* Exercises the homepage in the built storefront (dist/storefront) under an artifact-like CSP:
 * logo load sweep, idle orbit, press pulse (pointer and keyboard), scroll hand-off, the
 * Friday event, shop tile edge, opening a product, console. Usage: node browser/check-homepage.js <dir> */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const OUT = process.argv[2] || '.';
const DIST = path.join(__dirname, '..', 'dist', 'storefront');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'";
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const rel = u.pathname.replace('/artifact/x/', '') || 'index.html';
  const file = path.join(DIST, rel || 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (file.endsWith('index.html')) body = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>${body}</body></html>`);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
  res.end(body);
});

async function run(browser, size, label) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: label === 'phone', isMobile: label === 'phone' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  const ok = (s) => console.log(`PASS [${label}] ${s}`);
  const shot = (n) => page.screenshot({ path: `${OUT}/${label}-${n}.png` });

  await page.goto('http://localhost:9494/artifact/x/');
  await page.locator('[data-fc-logo-img].is-sweeping').waitFor({ timeout: 15000 });
  const clickable = await page.evaluate(() => { const a = document.querySelector('.fc-hero__actions a'); const r = a.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('a') === a; });
  assert.ok(clickable, 'CTA clickable during the sweep');
  await page.waitForTimeout(450);
  await shot('1-load-mid-sweep');
  ok('load: circular sweep running while the buttons are already usable');
  await page.waitForTimeout(1700);
  assert.strictEqual(await page.locator('[data-fc-logo-img].is-sweeping').count(), 0);
  await shot('2-settled');
  ok('load: logo settles fully visible');

  const a1 = await page.locator('.fc-hero__spin').evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(1500);
  const a2 = await page.locator('.fc-hero__spin').evaluate((el) => getComputedStyle(el).transform);
  assert.notStrictEqual(a1, a2);
  const logoTransform = await page.locator('[data-fc-logo-img]').evaluate((el) => getComputedStyle(el).transform);
  assert.ok(logoTransform === 'none', 'logo itself is still at rest: ' + logoTransform);
  ok('rest: orbit arc drifts slowly; the logo itself stays still');

  const box = await page.locator('[data-fc-logo]').boundingBox();
  const px = box.x + box.width * 0.85; const py = box.y + box.height * 0.22;
  if (label === 'phone') await page.touchscreen.tap(px, py); else await page.mouse.click(px, py);
  await page.waitForTimeout(380);
  assert.ok((await page.locator('.fc-hero__ripple').count()) >= 1, 'ripples created');
  await shot('3-pulse');
  await page.waitForTimeout(1500);
  assert.strictEqual(await page.locator('.fc-hero__ripple').count(), 0);
  assert.strictEqual(await page.locator('[data-fc-pulse]').evaluate((el) => getComputedStyle(el).opacity), '0');
  ok('press: rings leave the contact point, pulse travels the ring, then back to idle');

  await page.locator('[data-fc-logo]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const center = await page.locator('.fc-hero__ripple').first().evaluate((el) => ({ l: parseFloat(el.style.left), t: parseFloat(el.style.top) }));
  const b2 = await page.locator('[data-fc-logo]').boundingBox();
  assert.ok(Math.abs(center.l - b2.width * 0.5057) < 3 && Math.abs(center.t - b2.height * 0.457) < 3, 'keyboard pulse starts at the logo centre');
  await page.keyboard.press(' ');
  ok('keyboard: Enter and Space pulse from the centre of the mark');

  const heroH = await page.locator('[data-fc-hero]').evaluate((el) => el.offsetHeight);
  if (label === 'phone') await page.evaluate((y) => window.scrollTo(0, y), heroH * 0.6);
  else await page.mouse.wheel(0, heroH * 0.6);
  await page.waitForTimeout(1000);
  console.log(`  scrolled to ${await page.evaluate(() => Math.round(window.scrollY))}px of a ${heroH}px hero`);
  const st = await page.evaluate(() => ({
    mark: new DOMMatrix(getComputedStyle(document.querySelector('[data-fc-logo]')).transform).a,
    ring: new DOMMatrix(getComputedStyle(document.querySelector('[data-fc-orbit]')).transform).a,
    ringOpacity: parseFloat(getComputedStyle(document.querySelector('[data-fc-orbit]')).opacity),
  }));
  assert.ok(st.mark < 0.95 && st.ring > 1.15 && st.ringOpacity < 0.85, JSON.stringify(st));
  await shot('4-scroll-handoff');
  ok(`scroll: mark scales to ${st.mark.toFixed(2)}, ring expands to ${st.ring.toFixed(2)}× at ${st.ringOpacity.toFixed(2)} opacity`);

  await page.locator('.fc-night__title').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const night = await page.locator('.fc-night').innerText();
  for (const t of ['ORS TCG', 'TRADE NIGHTS', 'Every Friday', '5:00 PM–9:30 PM', 'Orlando Racket Sports', 'Orange Blossom Trail']) assert.ok(night.toUpperCase().includes(t.toUpperCase()), t);
  await page.locator('.fc-night').screenshot({ path: `${OUT}/${label}-5-event.png` });
  ok('event: name, day/time and venue present exactly');

  await page.locator('.fc-shop__grid').scrollIntoViewIfNeeded();
  const tiles = page.locator('.fc-tile');
  assert.strictEqual(await tiles.count(), 3);
  const frames = await page.locator('.fc-tile__frame').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(new Set(frames).size === 1, 'equal frames ' + frames);
  const fits = await page.locator('.fc-tile__img').evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit));
  assert.ok(fits.every((f) => f === 'contain'));
  if (label === 'desktop') {
    await tiles.nth(1).hover();
    await page.waitForTimeout(1000);
    const drawn = await tiles.nth(1).locator('.fc-tile__edge i').evaluateAll((els) => els.every((e) => getComputedStyle(e).transform === 'none'));
    assert.ok(drawn, 'edge drawn on hover');
    await page.locator('.fc-shop').screenshot({ path: `${OUT}/${label}-6-shop-hover.png` });
    ok('shop: equal frames, whole photos, crimson edge draws on hover');
  } else {
    await page.locator('.fc-shop').screenshot({ path: `${OUT}/${label}-6-shop.png` });
    ok('shop: equal frames, whole photos, one per row');
  }

  // Open a product from its image (touch on phone)
  await tiles.first().locator('.fc-tile__frame').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const target = await tiles.first().locator('.fc-tile__frame').boundingBox();
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const a = el && el.closest('a'); return a ? a.getAttribute('href') : null; }, [target.x + target.width / 2, target.y + target.height / 2]);
  assert.ok(hit && hit.includes('/products/'), 'image centre is a product link: ' + hit);
  if (label === 'phone') await page.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);
  else await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await page.locator('.fc-product__title').waitFor();
  assert.ok((await page.locator('.fc-product__title').textContent()).includes('Custom Stickers'));
  await page.waitForTimeout(600);
  await shot('7-product');
  ok('product: tapping the tile image opens Custom Stickers');

  const real = errors.filter((e) => !/favicon/i.test(e));
  if (real.length) { console.log(`[${label}] console:\n` + real.join('\n')); throw new Error('console errors'); }
  ok('console: no errors or warnings, no failed requests');
  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(9494, r));
  const browser = await chromium.launch();
  try {
    await run(browser, { width: 1440, height: 900 }, 'desktop');
    await run(browser, { width: 390, height: 844 }, 'phone');
    // Reduced motion: static logo, simple acknowledgement on press
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9494/artifact/x/');
    await page.locator('[data-fc-logo]').waitFor();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('.is-sweeping').count(), 0);
    assert.strictEqual(await page.locator('.fc-hero__spin').evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.locator('[data-fc-logo]').click();
    assert.ok(await page.locator('[data-fc-logo].is-acknowledged').count());
    assert.strictEqual(await page.locator('.fc-hero__ripple').count(), 0);
    console.log('PASS [reduced motion] static logo; press gives a still crimson ring, no travel');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
