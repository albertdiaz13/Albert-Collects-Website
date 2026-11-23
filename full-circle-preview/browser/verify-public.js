/* Verifies the hosted demo in fresh, signed-out browser contexts (no cookies or storage).
 * Usage: node browser/verify-public.js <url> <screenshotDir> */
const { chromium } = require('playwright');
const assert = require('assert');
const [URL, OUT = '.'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext({ ...opts, storageState: undefined });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    const ok = (s) => console.log(`PASS [${label}] ${s}`);
    assert.strictEqual((await ctx.cookies()).length, 0);
    const resp = await page.goto(URL);
    assert.strictEqual(resp.status(), 200);
    assert.ok(!/claude\.ai|login|sign in/i.test(page.url()), 'no sign-in redirect: ' + page.url());
    await page.locator('[data-layer="ring"] img.is-sweeping').waitFor({ timeout: 20000 });
    ok('opens directly on the storefront homepage, no sign-in; logo entrance starts');
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/${label}-home.png` });
    assert.ok(await page.locator('.fc-hero__mark.is-layered').count());
    const rows = await page.locator('[data-fc-bill] .fc-bill__date').evaluateAll((e) => e.map((x) => x.getAttribute('datetime').slice(0, 10)));
    assert.deepStrictEqual(rows, ['2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18']);
    ok('logo assembled; calendar shows Nov 27, Dec 4, 11, 18');
    assert.ok(await page.getByText('Theme preview').first().isVisible());
    ok('preview banner states checkout is simulated');
    await page.locator('[data-fc-bill] .fc-bill__item').nth(0).getByText('Book now').click();
    await page.locator('.fc-event__title').waitFor();
    assert.ok((await page.locator('.fc-event__facts').innerText()).includes('Friday, November 27, 2026'));
    await page.locator('.fc-booking__submit').click();
    await page.locator('[data-fc-toast]:not([hidden])').waitFor();
    ok('Book now → Nov 27 booking page → table added (demo cart)');
    await page.locator('[data-fc-toast]').getByRole('button', { name: 'Check out' }).click();
    await page.locator('[data-checkout-stub]').waitFor();
    assert.ok((await page.locator('h1').textContent()).includes('simulated'));
    await page.screenshot({ path: `${OUT}/${label}-checkout.png`, fullPage: true });
    ok('checkout stops at the simulated page; no order placed');
    await page.getByRole('link', { name: 'Back to the store' }).click();
    await page.locator('.fc-hero__title').waitFor();
    await page.locator('.fc-tile__link').first().click();
    await page.locator('.fc-product__title').waitFor();
    ok('shop tile opens a product page');
    const deep = await (await browser.newContext(opts)).newPage();
    await deep.goto(URL + '#p-ors-tcg-trade-nights-2026-12-04');
    await deep.locator('.fc-event__title').waitFor({ timeout: 20000 });
    assert.ok((await deep.locator('.fc-event__facts').innerText()).includes('December 4, 2026'));
    ok('a shared date link (#p-ors-tcg-trade-nights-2026-12-04) opens that Friday directly');
    if (errors.length) { console.log(errors.join('\n')); throw new Error('console errors'); }
    ok('console: no errors, no failed requests');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
