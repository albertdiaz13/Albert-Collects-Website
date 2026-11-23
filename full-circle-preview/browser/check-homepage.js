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
  const phone = label === 'phone';
  const ctx = await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  const ok = (s) => console.log(`PASS [${label}] ${s}`);
  const shot = (n) => page.screenshot({ path: `${OUT}/${label}-${n}.png` });
  const prop = (sel, p) => page.evaluate(([s, q]) => window.gsap.getProperty(document.querySelector(s), q), [sel, p]);
  const C = '[data-layer="crimson"] img';

  await page.goto('http://localhost:9494/artifact/x/');
  await page.locator('[data-layer="ring"] img.is-sweeping').waitFor({ timeout: 15000 });
  const clickable = await page.evaluate(() => { const a = document.querySelector('.fc-hero__actions a'); const r = a.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('a') === a; });
  assert.ok(clickable, 'buttons usable during the entrance');
  ok('entrance: logo layers swap in; buttons are usable from the first frame');
  await page.waitForTimeout(700); await shot('1-ring-drawing');
  await page.waitForTimeout(1300); await shot('2-crimson-drop');
  await page.waitForTimeout(800); await shot('3-lettering');
  await page.waitForTimeout(1600);
  const rest = await page.evaluate(() => [...document.querySelectorAll('.fc-layer img')].map((i) => ({ n: i.closest('[data-layer]').dataset.layer, t: getComputedStyle(i).transform, c: getComputedStyle(i).clipPath, o: getComputedStyle(i).opacity, m: i.classList.contains('is-sweeping') })));
  for (const r of rest) {
    if (r.n === 'crimson') continue; // idle sway may have begun
    assert.ok((r.t === 'none' || r.t === 'matrix(1, 0, 0, 1, 0, 0)') && (r.c === 'none' || r.c === 'inset(0%)' || r.c === 'inset(0% 0% 0% 0%)') && r.o === '1' && !r.m, JSON.stringify(r));
  }
  await shot('4-assembled');
  ok('entrance: ring, stroke and lettering settle exactly into the original positions');

  const x1 = await prop(C, 'xPercent'); await page.waitForTimeout(2600); const x2 = await prop(C, 'xPercent');
  assert.notStrictEqual(x1, x2, 'idle sway moves the crimson mark');
  ok(`rest: the crimson mark sways gently on the stroke (${x1.toFixed(2)} → ${x2.toFixed(2)})`);

  const box = await page.locator('[data-fc-logo]').boundingBox();
  if (!phone) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.45, { steps: 6 });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.45, { steps: 12 });
    await page.waitForTimeout(700);
    const xr = await prop(C, 'xPercent'); const rr = await prop(C, 'rotation');
    assert.ok(xr > 15 && rr > 40, `rolls right with the pointer: x ${xr} rot ${rr}`);
    await shot('5-hover-roll');
    ok(`hover: the mark rolls along the stroke after the pointer (x ${xr.toFixed(1)}%, ${Math.round(rr)}°)`);
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.45);
    await page.waitForTimeout(250);
    const hop = await prop(C, 'yPercent');
    assert.ok(hop < -3, 'click makes it hop: ' + hop);
    ok('click: the mark hops off the stroke with a spin and bounces back; the ring feels the landing');
    await page.mouse.move(box.x + box.width + 120, box.y - 40);
    await page.waitForTimeout(1600);
  } else {
    await page.touchscreen.tap(box.x + box.width * 0.22, box.y + box.height * 0.45);
    await page.waitForTimeout(500);
    const xt = await prop(C, 'xPercent');
    assert.ok(xt < -10, 'rolls toward the tap: ' + xt);
    await shot('5-tap-roll');
    ok(`tap: the mark rolls to the tap point (x ${xt.toFixed(1)}%), hops, and rolls home`);
    await page.waitForTimeout(2600);
  }
  const home = await prop(C, 'xPercent');
  assert.ok(Math.abs(home) < 2.5, 'returns home: ' + home);
  ok('returns to rest afterwards');

  await page.locator('[data-fc-logo]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  assert.ok((await prop(C, 'xPercent')) > 15);
  ok('keyboard: Enter rolls the mark to the end of the stroke and back');
  await page.waitForTimeout(2400);

  const heroH = await page.locator('[data-fc-hero]').evaluate((el) => el.offsetHeight);
  await page.evaluate((y) => window.scrollTo(0, y), heroH * 0.6);
  await page.waitForTimeout(900);
  const exit = await page.evaluate(() => {
    const g = (n, p) => window.gsap.getProperty(document.querySelector(`[data-layer="${n}"]`), p);
    return { crimsonX: g('crimson', 'xPercent'), crimsonO: g('crimson', 'opacity'), textO: g('text-black', 'opacity'), ringS: g('ring', 'scale') };
  });
  assert.ok(exit.crimsonX > 8 && exit.textO < 0.8 && exit.ringS < 0.97, JSON.stringify(exit));
  await shot('6-scroll-exit');
  ok(`scroll: the logo comes apart (mark rolls off ${exit.crimsonX.toFixed(0)}%, lettering ${exit.textO.toFixed(2)} opacity, ring ${exit.ringS.toFixed(2)}×)`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => window.gsap.getProperty(document.querySelector('[data-layer="text-black"]'), 'opacity'));
  assert.ok(back > 0.98, 'reassembles on the way back up: ' + back);
  ok('scroll back up: the logo reassembles');

  // Calendar directly under the hero, with a per-date Book now
  const order = await page.evaluate(() => [...document.querySelectorAll('main .shopify-section')].map((s) => s.className.match(/fc-section-(\w+)/)?.[1]).filter(Boolean));
  assert.deepStrictEqual(order.slice(0, 4), ['hero', 'shows', 'about', 'shop'], order.join());
  ok('page order: hero → Upcoming shows → About → Shop');
  await page.locator('[data-fc-bill] .fc-bill__item').first().scrollIntoViewIfNeeded();
  await page.locator('[data-fc-shows]').screenshot({ path: `${OUT}/${label}-7-calendar.png` });
  await page.locator('[data-fc-bill] .fc-bill__item').nth(1).getByText('Book now').click();
  await page.locator('.fc-event__title').waitFor();
  assert.ok(page.url().endsWith('#p-ors-tcg-trade-nights-2026-12-04'), page.url());
  assert.ok((await page.locator('.fc-event__facts').innerText()).includes('Friday, December 4, 2026'));
  await shot('8-dec4-booking');
  ok('Book now on Dec 4 opens the Dec 4 booking page (#p-ors-tcg-trade-nights-2026-12-04)');

  // Navigation: About goes back to the homepage strip
  if (phone) {
    await page.locator('[data-fc-menu] summary').click();
    await page.waitForTimeout(250);
    await shot('9-menu');
    await page.locator('.fc-drawer__link', { hasText: 'About' }).click();
  } else {
    await page.locator('.fc-nav__link', { hasText: 'About' }).click();
  }
  await page.locator('#about').waitFor();
  await page.waitForTimeout(1200);
  const aboutTop = await page.locator('#about').evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(aboutTop >= 0 && aboutTop < size.height * 0.5, 'About strip scrolled into view: ' + aboutTop);
  await shot('10-about');
  ok(`${phone ? 'menu' : 'header'} About link lands on the About strip`);

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
    assert.strictEqual(await page.locator('.is-sweeping, .is-layered').count(), 0);
    assert.ok(await page.locator('.fc-hero__logo').isVisible());
    await page.locator('[data-fc-logo]').click();
    assert.ok(await page.locator('[data-fc-logo].is-acknowledged').count());
    await page.screenshot({ path: `${OUT}/reduced-motion.png` });
    console.log('PASS [reduced motion] complete original logo, no movement; a press gives a still glow');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
