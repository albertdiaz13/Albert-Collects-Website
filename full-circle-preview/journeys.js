/* End-to-end checks against the local preview (node server.js must be running).
 *   node journeys.js <screenshotDir>
 * Drives both customer journeys to the checkout handoff and exercises edge cases. */
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = 'http://localhost:9292';
const OUT = process.argv[2] || '.';
const results = [];
function ok(name) { results.push(['PASS', name]); console.log('PASS', name); }

async function fresh(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(BASE + '/__reset?fixture=full');
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Journey 1: Shop products (phone) ---------- */
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(BASE + '/?bar=0');
    await page.getByRole('link', { name: 'Shop products' }).click();
    await page.waitForURL('**/collections/shop');
    ok('home → merchandise collection via "Shop products"');
    assert.strictEqual(await page.locator('.fc-card').count(), 3);
    assert.ok(!(await page.locator('.fc-card__kicker', { hasText: 'Vending table' }).count()), 'no tables in merch grid');
    ok('merch collection lists 3 products and no vending tables');

    await page.getByRole('link', { name: 'Custom Stickers' }).first().click();
    await page.waitForURL('**/products/custom-stickers');
    const price = page.locator('[data-fc-price-wrap] [data-fc-amount]');
    assert.strictEqual((await price.textContent()).trim(), '$35.00');
    assert.ok(await page.getByText('per 100 stickers').first().isVisible());
    // instructions are above the buy button
    const instrBox = await page.locator('.fc-callout').boundingBox();
    const buyBox = await page.locator('.fc-buy__submit').boundingBox();
    assert.ok(instrBox.y < buyBox.y, 'instructions before add to cart');
    assert.ok(await page.getByText('must be sent through email after ordering').first().isVisible());
    ok('stickers: price unit + QR/email instructions visible before ordering');

    await page.locator('label', { hasText: 'Plain' }).click();
    await page.locator('label', { hasText: 'Regular' }).click();
    await page.locator('label', { hasText: 'Circle' }).click();
    assert.strictEqual((await price.textContent()).trim(), '$30.00');
    assert.ok(page.url().includes('variant=50506590847193'), 'URL tracks variant ' + page.url());
    const idVal = await page.locator('[data-fc-variant-id]').inputValue();
    assert.strictEqual(idVal, '50506590847193');
    ok('variant selection updates price ($35 → $30), hidden id and URL');
    await page.screenshot({ path: `${OUT}/j1-stickers-plain-390.png` });

    await page.locator('.fc-buy [data-fc-qty-step="1"]').click();
    await page.locator('.fc-buy__submit').click();
    await page.locator('[data-fc-toast]:not([hidden])').waitFor();
    assert.strictEqual((await page.locator('[data-fc-cart-count] [aria-hidden]').first().textContent()).trim(), '2');
    ok('add to cart (qty 2) shows toast and updates header count');
    await page.screenshot({ path: `${OUT}/j1-toast-390.png` });

    await page.locator('[data-fc-toast]').getByRole('link', { name: 'View cart' }).click();
    await page.waitForURL('**/cart');
    await page.locator('.fc-line [data-fc-qty-step="1"]').click();
    await page.waitForFunction(() => document.querySelector('.fc-summary__total') && document.querySelector('.fc-summary__total').textContent.includes('90.00'));
    ok('cart quantity change re-renders section (3 × $30 = $90)');
    await page.screenshot({ path: `${OUT}/j1-cart-390.png`, fullPage: true });

    await page.getByRole('button', { name: /Check out/ }).click();
    await page.waitForURL('**/checkout');
    const stub = await page.locator('table').textContent();
    assert.ok(stub.includes('Plain / Regular / Circle') && stub.includes('3'));
    ok('checkout handoff receives Plain / Regular / Circle × 3');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  }

  /* ---------- Journey 2: Book a vending table for a specific Friday (phone, one hand) ---------- */
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(BASE + '/?bar=0');
    // The homepage calendar sits directly under the hero, one row per Friday
    const homeRows = page.locator('[data-fc-bill] .fc-bill__item');
    const dates = await page.locator('[data-fc-bill] .fc-bill__date').evaluateAll((els) => els.map((e) => e.getAttribute('datetime').slice(0, 10)));
    assert.deepStrictEqual(dates, ['2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18'], dates.join());
    assert.strictEqual(await homeRows.filter({ hasText: 'Book now' }).count(), 3);
    assert.ok(!(await homeRows.nth(2).textContent()).includes('Book now'), 'sold-out Friday has no Book now');
    ok('homepage calendar: four dated Friday rows, Book now on the three with tables');

    await homeRows.nth(0).getByText('Book now').click();
    await page.waitForURL('**/products/ors-tcg-trade-nights-2026-11-27');
    ok('Book now on Nov 27 opens that date’s booking page');
    for (const sel of ['.fc-event__title', '.fc-event__fact time', '.fc-booking__price']) {
      const box = await page.locator(sel).first().boundingBox();
      assert.ok(box.y + box.height < 844, sel + ' above the fold');
    }
    const facts = await page.locator('.fc-event__facts').innerText();
    assert.ok(facts.includes('Friday, November 27, 2026') && facts.includes('5:00 PM–9:30 PM') && facts.includes('Orlando Racket Sports') && facts.includes('Orange Blossom Trail'), facts);
    assert.strictEqual((await page.locator('.fc-booking__price').textContent()).trim(), '$60.00');
    assert.ok(await page.getByText('3 tables left').isVisible());
    ok('event page: date, 5:00–9:30 PM, venue, $60 per table and 3 tables left in the first phone screen');

    for (let i = 0; i < 5; i++) await page.locator('.fc-booking__qty [data-fc-qty-step="1"]').click();
    assert.strictEqual(await page.locator('.fc-booking__qty input').inputValue(), '3');
    ok('quantity capped at that night’s tables left (3)');
    await page.locator('.fc-booking__qty [data-fc-qty-step="-1"]').click();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    assert.ok(await page.locator('[data-fc-sticky]').evaluate((el) => el.classList.contains('is-hidden')), 'bar hidden while the real button is on screen');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => !document.querySelector('[data-fc-sticky]').classList.contains('is-hidden'));
    await page.waitForTimeout(350);
    await page.locator('[data-fc-sticky-go]').click();
    await page.locator('[data-fc-toast]:not([hidden])').waitFor();
    assert.ok((await page.locator('[data-fc-toast-note]').textContent()).includes("doesn't hold it"));
    ok('sticky bar adds 2 tables for Nov 27; toast states the table is not held');

    // The Book Vending Tables page reuses the same list
    await page.locator('.fc-subbar__link--book').click();
    await page.waitForURL('**/collections/vending-tables');
    const bookDates = await page.locator('[data-fc-bill]').first().locator('.fc-bill__date').evaluateAll((els) => els.map((e) => e.getAttribute('datetime').slice(0, 10)));
    assert.deepStrictEqual(bookDates, ['2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18'], bookDates.join());
    assert.ok(await page.locator('.fc-bill--past').getByText('Ended').isVisible());
    ok('Book Vending Tables lists the same dated rows; Nov 20 is under Past shows');
    await page.locator('[data-fc-bill]').first().locator('.fc-bill__item').nth(3).getByText('Book now').click();
    await page.waitForURL('**/products/ors-tcg-trade-nights-2026-12-18');
    await page.locator('.fc-booking__submit').click();
    await page.locator('[data-fc-toast]:not([hidden])').waitFor();
    ok('Book now on Dec 18 from the booking page adds that date');

    // Line properties survive cart edits (vendor details are optional per show)
    await page.evaluate(async () => {
      await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 8000012041, quantity: 1, properties: { 'Business name': 'Test Vendor Co' } }] }) });
    });
    await page.goto(BASE + '/products/custom-stickers?bar=0');
    await page.locator('.fc-buy__submit').click();
    await page.locator('[data-fc-toast]:not([hidden])').waitFor();
    await page.goto(BASE + '/cart?bar=0');
    assert.ok(await page.getByRole('heading', { name: 'Vending tables' }).isVisible());
    assert.ok(await page.getByRole('heading', { name: 'Merchandise' }).isVisible());
    assert.ok(await page.getByText('Fri, Nov 27, 2026').isVisible());
    assert.ok((await page.getByText('No shipping required').count()) >= 3);
    ok('mixed cart: three dated table lines grouped apart from merchandise, no shipping on tables');
    const line = page.locator('.fc-line', { hasText: 'Test Vendor Co' });
    await line.locator('[data-fc-qty-step="1"]').click();
    await page.waitForFunction(() => { const l = [...document.querySelectorAll('.fc-line')].find((x) => x.textContent.includes('Test Vendor Co')); return l && l.querySelector('input').value === '2'; });
    ok('cart edit keeps line properties on the Dec 4 table');

    await page.evaluate(async () => {
      await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 8000011271, quantity: 9 }] }) });
    });
    const cartJson = await page.evaluate(async () => (await fetch('/cart.js')).json());
    const nov27 = cartJson.items.filter((i) => i.id === 8000011271).reduce((n, i) => n + i.quantity, 0);
    assert.ok(nov27 <= 3, 'never more than that night’s inventory: ' + nov27);
    ok('cart never exceeds the Nov 27 inventory (3)');

    await page.reload();
    await page.getByRole('button', { name: /Check out/ }).click();
    await page.waitForURL('**/checkout');
    const stub = await page.locator('table').textContent();
    assert.ok(stub.includes('ORS TCG Trade Nights') && stub.includes('Business name: Test Vendor Co'));
    ok('checkout handoff carries the dated tables and line properties');
    await page.screenshot({ path: `${OUT}/j2-checkout-390.png`, fullPage: true });
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  }

  /* ---------- Edge cases ---------- */
  {
    const { ctx, page } = await fresh(browser, { viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/products/ors-tcg-trade-nights-2026-12-11?bar=0');
    assert.ok(await page.getByText('Every table for this show is booked.').isVisible());
    assert.strictEqual(await page.locator('[data-fc-event-form]').count(), 0);
    ok('entirely sold-out show: no booking form, honest message');
    await page.goto(BASE + '/products/ors-tcg-trade-nights-2026-11-20?bar=0');
    assert.ok(await page.getByText('This show has ended').isVisible());
    assert.strictEqual(await page.locator('[data-fc-event-form]').count(), 0);
    ok('past show with leftover inventory: booking closed');
    await page.screenshot({ path: `${OUT}/edge-past-1440.png` });

    await page.goto(BASE + '/collections/vending-tables?fixture=none&bar=0');
    assert.ok(await page.getByText('No shows announced').isVisible());
    assert.ok(await page.locator('[data-fc-shows]').getByRole('link', { name: 'Ask about upcoming shows' }).isVisible());
    ok('no shows: schedule shows a compact empty state with configured contact link');
    await page.locator('[data-fc-shows]').screenshot({ path: `${OUT}/edge-none-1440.png` });

    await page.goto(BASE + '/collections/vending-tables?fixture=one&bar=0');
    assert.ok(await page.locator('.fc-bill--feature').isVisible());
    ok('one show: schedule uses the feature layout');
    await page.locator('[data-fc-shows]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    await page.locator('[data-fc-shows]').screenshot({ path: `${OUT}/edge-one-1440.png` });

    // Keyboard: tab to the first event row and check focus ring + crimson ring
    await page.goto(BASE + '/collections/vending-tables?fixture=full&bar=0');
    await page.locator('[data-fc-shows]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const link = page.locator('.fc-bill__link').first();
    await link.focus();
    await page.waitForTimeout(600);
    const ringOpacity = await link.locator('.fc-ring-arrow__ring').evaluate((el) => getComputedStyle(el).opacity);
    assert.strictEqual(ringOpacity, '1');
    ok('keyboard focus on an event row resolves the crimson ring');
    await page.locator('[data-fc-shows]').screenshot({ path: `${OUT}/focus-row-1440.png` });
    await page.keyboard.press('Enter');
    await page.waitForURL('**/products/ors-tcg-trade-nights-2026-11-27');
    ok('Enter on focused row opens the show');

    // Skip link and header tab order
    await page.goto(BASE + '/?bar=0');
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent.trim()), 'Skip to content');
    const order = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).trim().replace(/\s+/g, ' ').slice(0, 40))); }
    console.log('  tab order:', order.join(' → '));
    ok('skip link first, header reachable by keyboard');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  }

  /* ---------- Reduced motion & theme editor reload ---------- */
  {
    const { ctx, page } = await fresh(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(BASE + '/?bar=0');
    await page.waitForTimeout(300);
    const sweeping = await page.locator('.fc-hero__mark.is-layered').count() + await page.locator('.is-sweeping').count();
    assert.ok(await page.locator('.fc-hero__logo').isVisible(), 'complete original logo shown');
    const motionOn = await page.evaluate(() => document.documentElement.classList.contains('fc-motion-on'));
    assert.strictEqual(sweeping, 0); assert.strictEqual(motionOn, false);
    const dates = await page.locator('[data-fc-reveal="date"]').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    assert.ok(dates.every((o) => parseFloat(o) >= 0.5), dates.join());
    ok('reduced motion: no arrival sweep, no hidden states, foil idle off');
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(browser, { viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/?bar=0');
    await page.waitForTimeout(1800);
    const result = await page.evaluate(async () => {
      const wrap = document.querySelector('[data-fc-hero]').closest('.shopify-section');
      wrap.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }));
      const html = wrap.innerHTML;
      wrap.innerHTML = html;
      wrap.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1800));
      await new Promise((r) => setTimeout(r, 3000));
      const ring = wrap.querySelector('[data-layer="ring"] img');
      return { sweeping: ring.classList.contains('is-sweeping'), layered: wrap.querySelector('[data-fc-logo]').classList.contains('is-layered'), dot: getComputedStyle(wrap.querySelector('[data-layer="crimson"] img')).opacity };
    });
    assert.strictEqual(result.sweeping, false); assert.strictEqual(result.layered, true); assert.strictEqual(result.dot, '1');
    assert.deepStrictEqual(page.errors, []);
    ok('theme editor section unload/load: hero re-initialises and settles, no errors');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.length} checks passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
