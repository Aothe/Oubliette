#!/usr/bin/env node
// Screenshots of the loop prototype in headless Chromium: the hall, a fight, the boss, an end
// state, and a replay verdict — plus the in-browser replay check, which fails the script if the
// page's own replay of the run it just played does not reach the same hash.
//
//   npm run build && node proto/loop/shots.cjs     ->  proto/loop/out/*.png  (gitignored)
//
// Needs playwright (or playwright-core with CHROME set to a Chromium binary). Exits 1 on any
// script error in the page or a replay mismatch.
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) { try { return require(name); } catch (_) { /* next */ } }
  if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
  throw new Error('playwright not found: npm i -g playwright, or set PLAYWRIGHT_CORE');
}
const page_url = 'file://' + path.join(__dirname, 'index.html');
const out = path.join(__dirname, 'out');

(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(page_url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const shot = (target, name) => target.screenshot({ path: path.join(out, name) });
  await shot(page, '01-hall.png');

  // window.__loop is the page's hook: start(n), step(k), hash(), log(), replay(log), fast(on), run, result, mode.
  // It never writes the state — every tick goes through the log — so the run it plays replays.
  const stage = await page.$('#stage');
  const box = await stage.boundingBox();
  await page.evaluate(() => window.__loop.start(4));
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.keyboard.press('f');                        // auto-fire toward the cursor
  await page.keyboard.down('d');                         // and walk right, after the bots
  await page.evaluate(() => window.__loop.step(900));    // fifteen seconds, inputs logged as any other
  await page.waitForTimeout(1500);
  await shot(stage, '02-combat.png');
  await page.keyboard.up('d');
  await page.keyboard.press('f');

  // hand the seat to a bot and let the shard take the run to its end at speed, then the settlement
  await page.evaluate(() => { window.__loop.autopilot(true); window.__loop.fast(true); });
  await page.waitForFunction(() => window.__loop.run && window.__loop.run.phase === 'ended', null, { timeout: 120000 });
  await page.waitForTimeout(300);
  await shot(stage, '03-end.png');
  const info = await page.evaluate(() => ({ reason: window.__loop.run.reason, tick: window.__loop.run.tick, hash: window.__loop.hash(), frames: window.__loop.log().frames.length, result: window.__loop.result && { deaths: window.__loop.result.deaths, extracts: window.__loop.result.extracts, prizes: window.__loop.result.prizes } }));
  console.log('run:', JSON.stringify(info));

  // replay the same log in the page and demand the same hash
  const log = await page.evaluate(() => window.__loop.log());
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(log));
  await page.click('#ovBtn');
  await page.evaluate((L) => window.__loop.replay(L), log);
  await page.evaluate(() => window.__loop.fast(true));
  await page.waitForFunction(() => window.__loop.run && window.__loop.run.phase === 'ended', null, { timeout: 120000 });
  await page.waitForTimeout(300);
  const verdict = await page.$eval('#verdict', e => e.textContent);
  console.log('replay:', verdict);
  await shot(page, '04-replay.png');

  // the tick cost in this browser at the realm cap: eighty-five delvers, all bots
  await page.click('#ovBtn');
  await page.evaluate(() => { window.__loop.start(85); window.__loop.autopilot(true); });
  const perTick = await page.evaluate(() => { window.__loop.step(120); const t0 = performance.now(); window.__loop.step(600); return (performance.now() - t0) / 600; });
  console.log('browser tick cost at 85 delvers:', perTick.toFixed(3), 'ms');
  await browser.close();
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
  if (!/^MATCH/.test(verdict)) { console.error('replay did not match'); process.exit(1); }
  console.log('wrote', fs.readdirSync(out).filter(n => n.endsWith('.png')).length, 'screenshots to', out);
})().catch(e => { console.error(e); process.exit(1); });
