#!/usr/bin/env node
// Screenshots of the visual slice in headless Chromium, one per game state, so a change to the
// art can be looked at without playing to it by hand.
//
//   node proto/visual/shots.cjs            ->  proto/visual/out/*.png  (gitignored)
//
// Needs playwright-core and a Chromium binary; neither is a dependency of this repo. Set
// PLAYWRIGHT_CORE (module path) and CHROME (binary), or let it look in the npx cache and in
// ~/.cache/ms-playwright. Fonts come from Google Fonts, so a run without network falls back to
// the stack in the page. Exits 1 on any script error in the page.
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

const page_url = 'file://' + path.join(__dirname, 'index.html');
const out = path.join(__dirname, 'out');

(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(chrome ? { executablePath: chrome } : {}) });
  const errors = [];
  const shot = (target, name) => target.screenshot({ path: path.join(out, name) });

  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(page_url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '01-start.png');

  // window.__oub is the page's debug hook: G (state), warp(room), hurt(n), boss(hp).
  const stage = await page.$('#stage');
  const box = await stage.boundingBox();
  const heal = () => page.evaluate(() => { const G = window.__oub.G; G.player.hp = G.st.maxhp; });
  await page.evaluate(() => window.__oub.warp(2));
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.keyboard.press('f');                       // auto-fire toward the cursor
  await page.waitForTimeout(3500);
  await shot(stage, '02-combat.png');

  await page.evaluate(() => window.__oub.warp(5));
  await heal();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.waitForTimeout(5000);
  await heal();
  await shot(stage, '03-boss-phase1.png');
  await page.evaluate(() => window.__oub.boss(1100));
  await page.waitForTimeout(3000);
  await heal();
  await shot(stage, '04-boss-phase3.png');
  await page.evaluate(() => window.__oub.boss(5));
  await page.waitForTimeout(1500);
  await shot(stage, '05-pinata.png');
  await heal();
  await page.waitForTimeout(1800);
  await shot(stage, '06-seal.png');

  await page.evaluate(() => window.__oub.hurt(9999));
  await page.waitForTimeout(3400);
  await shot(page, '07-death.png');
  await page.screenshot({ path: path.join(out, '08-full-page.png'), fullPage: true });

  const phone = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  phone.on('pageerror', e => errors.push('phone: ' + e.message));
  await phone.goto(page_url, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1000);
  await shot(phone, '09-phone.png');
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) errors.push('phone: page scrolls sideways by ' + wide + 'px');

  await browser.close();
  console.log('wrote ' + fs.readdirSync(out).filter(n => n.endsWith('.png')).length + ' screenshots to ' + out);
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
