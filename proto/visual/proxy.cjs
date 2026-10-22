#!/usr/bin/env node
// A death-rate proxy for the slice: seeded runs played by the page's autopilot (window.__oub.fastRun), stepped
// headlessly with no rendering, so a change to the mobs can be measured before a person plays it. It is a sanity
// check, not the target: the operator judges by playing, and the autopilot never uses the skill.
//
//   node proto/visual/proxy.cjs [--runs 40] [--from 1] [--pots 3] [--ticks 20000]
//
// Prints one line per run and a summary: deaths per run, the median length of finished runs, bosses broken,
// stalls (runs that hit the tick limit), and who did the killing. Same loader as shots.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const RUNS = arg('runs', 40), FROM = arg('from', 1), POTS = arg('pots', 3), TICKS = arg('ticks', 20000);

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

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(page_url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    const seed = (0x0B11E77E + (FROM + i) * 0x9E3779B9) >>> 0;
    const r = await page.evaluate(([s, pots, ticks]) => window.__oub.fastRun(s, { pots, ticks }), [seed, POTS, TICKS]);
    rows.push(r);
    const how = r.state === 'dead' ? 'died in room ' + r.room + ' to ' + r.by
      : r.state === 'out' ? 'extracted' + (r.bossDead ? ', the Turnkey broken' : '')
      : 'stalled in room ' + r.room;
    console.log(`#${String(FROM + i).padStart(2)} ${r.seed}  ${how.padEnd(34)} tick ${String(r.ticks).padStart(5)}  hp ${String(r.hp).padStart(3)}  drank ${r.drank}  allies ${r.allies}`);
  }
  const dead = rows.filter(r => r.state === 'dead'), out = rows.filter(r => r.state === 'out'), stall = rows.filter(r => r.state === 'play');
  const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const by = {}; for (const r of dead) by[r.by] = (by[r.by] || 0) + 1;
  const room = {}; for (const r of dead) room[r.room] = (room[r.room] || 0) + 1;
  console.log(`\nruns ${rows.length}: deaths ${dead.length} (${(dead.length / rows.length * 100).toFixed(0)} % of runs, 1 in ${dead.length ? (rows.length / dead.length).toFixed(1) : '-'}), extracted ${out.length}, Turnkey broken ${out.filter(r => r.bossDead).length}, stalled ${stall.length}`);
  console.log(`median length of finished runs ${(med(rows.filter(r => r.state !== 'play').map(r => r.ticks)) / 60).toFixed(0)} s; mean drinks ${(rows.reduce((s, r) => s + r.drank, 0) / rows.length).toFixed(1)}; mean allies alive at the end ${(rows.reduce((s, r) => s + r.allies, 0) / rows.length).toFixed(1)}`);
  if (dead.length) console.log('killed by ' + Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ') + '; in room ' + Object.entries(room).map(([k, v]) => k + ' x' + v).join(', '));
  await browser.close();
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
