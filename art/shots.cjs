#!/usr/bin/env node
// Screenshots of the art bank's gallery page, so a new sprite can be looked at from a terminal.
//
//   node art/shots.cjs        ->  art/out/*.png  (gitignored)
//
// Needs playwright-core and a Chromium binary; neither is a dependency of this repo. Set
// PLAYWRIGHT_CORE (module path) and CHROME (binary), or let it look in the npx cache and in
// ~/.cache/ms-playwright. Exits 1 on any script error in the page.
const fs = require('fs');
const os = require('os');
const path = require('path');

function newest(dir, re, tail) {
  if (!fs.existsSync(dir)) return null;
  const hits = fs.readdirSync(dir).filter(n => re.test(n)).sort().reverse()
    .map(n => path.join(dir, n, tail)).filter(p => fs.existsSync(p));
  return hits[0] || null;
}
function loadPlaywright() {
  if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
  try { return require('playwright-core'); } catch (_) { /* fall through to the npx cache */ }
  const cached = newest(path.join(os.homedir(), '.npm', '_npx'), /./, 'node_modules/playwright-core');
  if (!cached) throw new Error('playwright-core not found: set PLAYWRIGHT_CORE to its module path');
  return require(cached);
}
const chrome = process.env.CHROME ||
  newest(path.join(os.homedir(), '.cache', 'ms-playwright'), /^chromium-\d+$/, 'chrome-linux64/chrome');
const url = 'file://' + path.join(__dirname, 'index.html');
const out = path.join(__dirname, 'out');

(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));   // section numbers shift when a group is added
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(chrome ? { executablePath: chrome } : {}) });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, '00-page.png'), fullPage: true });
  // one capture per section, so each can be read at full size
  const sections = await page.$$('.page section');
  for (let i = 0; i < sections.length; i++) {
    const title = (await sections[i].$eval('h2', h => h.textContent)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await sections[i].screenshot({ path: path.join(out, String(i + 1).padStart(2, '0') + '-' + title + '.png') });
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  phone.on('pageerror', e => errors.push('phone: ' + e.message));
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: path.join(out, '99-phone.png') });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) errors.push('phone: page scrolls sideways by ' + wide + 'px');
  await browser.close();
  console.log('wrote ' + fs.readdirSync(out).filter(n => n.endsWith('.png')).length + ' screenshots to ' + out);
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
