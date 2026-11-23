/* Runs Shopify Theme Check (the same engine as `shopify theme check`) on ../full-circle-theme. */
const path = require('path');
const { themeCheckRun } = require('@shopify/theme-check-node');
(async () => {
  const root = path.resolve(__dirname, '..', 'full-circle-theme');
  const { offenses } = await themeCheckRun(root, undefined, () => {});
  const sev = ['error', 'warning', 'info'];
  for (const o of offenses) {
    console.log(`${sev[o.severity] || o.severity}\t${o.check}\t${o.uri.replace(/.*full-circle-theme\//, '')}:${o.start.line + 1}\t${o.message}`);
  }
  const errors = offenses.filter((o) => o.severity === 0).length;
  console.log(`\n${offenses.length} offenses (${errors} errors)`);
  process.exit(errors ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
