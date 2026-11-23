/* Screenshot helper: node shoot.js <outDir> <name> <path> <width> <height> [full=0|1] [wait=1800] [reduced=0|1] */
const { chromium } = require('playwright');
(async () => {
  const [outDir, name, p, w, h, full = '0', wait = '1800', reduced = '0'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, reducedMotion: reduced === '1' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:9292' + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: full === '1' });
  if (errors.length) console.log(name, 'ERRORS:', errors.join(' | '));
  await browser.close();
})();
