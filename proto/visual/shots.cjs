#!/usr/bin/env node
// Screenshots of the visual slice in headless Chromium, one per game state, so a change to the
// art can be looked at without playing to it by hand.
//
//   node proto/visual/shots.cjs            ->  proto/visual/out/*.png  (gitignored)
//
// Needs playwright-core and a Chromium binary; neither is a dependency of this repo. Set
// PLAYWRIGHT_CORE (module path) and CHROME (binary), or let it look in the npx cache and in
// ~/.cache/ms-playwright. Fonts come from Google Fonts, so a run without network falls back to
// the stack in the page. Exits 1 on any script error in the page or any state that did not happen.
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

  // window.__oub is the page's debug hook: G (state), warp(room), plate(), hurt(n), boss(hp), skill(i), give(id),
  // mapdump(); in the village goto(desk), use(), close(), delve(), back() (the overlay's button), roll(), vault(), wager(), objects(), spawn().
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(page_url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '01-village.png');                   // every run starts here, in the square

  // every desk, and the plate, must be walkable and reachable from where you arrive
  {
    const d = await page.evaluate(() => Object.assign(window.__oub.mapdump(), { objects: window.__oub.objects(), spawn: window.__oub.spawn(), plate: [42, 15] }));
    const seen = new Uint8Array(d.MW * d.MH), q = [d.spawn];
    seen[d.spawn[1] * d.MW + d.spawn[0]] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= d.MW || ny >= d.MH) continue;
      const i = ny * d.MW + nx; if (seen[i] || d.map[i] !== 1) continue; seen[i] = 1; q.push([nx, ny]); } }
    for (const o of d.objects.concat([{ id: 'plate', use: d.plate }])) { if (!o.use) continue;
      if (!seen[o.use[1] * d.MW + o.use[0]]) errors.push('village: ' + o.id + ' at ' + o.use.join(',') + ' cannot be reached from the square'); }
    console.log('village: ' + d.MW + 'x' + d.MH + ', ' + Array.from(seen).reduce((a, b) => a + b, 0) + ' tiles reachable');
  }

  const stage = await page.$('#stage');
  const box = await stage.boundingBox();
  const heal = () => page.evaluate(() => { const G = window.__oub.G; G.player.hp = G.st.maxhp; });

  await page.evaluate(() => { window.__oub.goto('post'); window.__oub.use(); });
  await page.waitForTimeout(300);
  await shot(stage, '02-fettering-post.png');
  await page.evaluate(() => window.__oub.close());
  await page.evaluate(() => { window.__oub.goto('strongbox'); });
  await page.waitForTimeout(600);
  await shot(stage, '02b-counting-house.png');
  await page.evaluate(() => window.__oub.close());
  await page.evaluate(() => window.__oub.goto('door'));  // on the plate: the shard forms in three seconds
  await page.waitForTimeout(1500);
  await shot(stage, '03-gate-plate.png');            // the other three walk up from the fire
  await page.waitForTimeout(2300);
  const started = await page.evaluate(() => [window.__oub.G.state, window.__oub.G.seed]);
  if (started[0] !== 'play') errors.push('gate: expected the run to start from the plate, got ' + started[0]);
  if (started[1] !== 0x0B11E77E) errors.push('gate: the first run should be seed 0B11E77E');

  await page.evaluate(() => window.__oub.warp(2));
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.keyboard.press('f');                       // auto-fire toward the cursor
  await page.waitForTimeout(3500);
  await shot(stage, '04-combat.png');

  // a potion: back in the hall, hurt to under half, drink (Q); a third of max health comes back over two seconds
  await page.keyboard.press('f');                       // auto-fire off
  await page.evaluate(() => { window.__oub.warp(0); const G = window.__oub.G; G.player.hp = Math.round(G.st.maxhp * 0.45); });
  const pouch0 = await page.evaluate(() => window.__oub.pouch());
  await page.keyboard.press('q');
  await page.waitForTimeout(900);
  await shot(stage, '04b-potion.png');
  await page.waitForTimeout(1500);
  const drank = await page.evaluate(() => [window.__oub.pouch(), Math.round(window.__oub.G.player.hp), window.__oub.G.st.maxhp]);
  if (drank[0] !== pouch0 - 1) errors.push('potion: expected the pouch to drop by one, got ' + pouch0 + ' -> ' + drank[0]);
  if (drank[1] < Math.round(drank[2] * 0.45) + drank[2] / 3 - 2) errors.push('potion: expected about a third healed, hp ' + drank[1] + ' of ' + drank[2]);
  console.log('potion: pouch ' + pouch0 + ' -> ' + drank[0] + ', hp ' + Math.round(drank[2] * 0.45) + ' -> ' + drank[1] + ' of ' + drank[2]);
  await page.keyboard.press('f');                       // auto-fire back on

  // the sealed boss door: the party on the ready plate, the clock running; then through, and the door seals
  await page.keyboard.press('f');                       // auto-fire off
  await page.evaluate(() => window.__oub.plate());
  await heal();
  await page.waitForTimeout(1900);
  await shot(stage, '05-plate.png');
  await page.waitForTimeout(1500);
  const opened = await page.evaluate(() => window.__oub.G.door.state);
  if (opened !== 'open') errors.push('door: expected open after the plate clock, got ' + opened);
  await page.keyboard.down('d');
  await page.waitForTimeout(650);
  await page.keyboard.up('d');
  await page.waitForTimeout(400);
  const sealed = await page.evaluate(() => [window.__oub.G.door.state, window.__oub.G.door.through, window.__oub.G.boss.max, window.__oub.G.boss.awake]);
  if (sealed[0] !== 'sealed') errors.push('door: expected sealed after crossing, got ' + sealed[0]);
  if (sealed[3]) errors.push('door: the Turnkey woke before the chamber');
  console.log('door: ' + sealed[1] + ' of 4 went through, the Turnkey measured to ' + sealed[2]);
  await shot(stage, '06-door-sealed.png');

  await page.evaluate(() => window.__oub.warp(5));
  await heal();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.keyboard.press('f');                       // auto-fire on
  await page.waitForTimeout(5000);
  await heal();
  await shot(stage, '07-boss-phase1.png');
  await page.evaluate(() => window.__oub.boss(1100));
  await page.waitForTimeout(3000);
  await heal();
  await shot(stage, '08-boss-phase3.png');
  await page.evaluate(() => window.__oub.boss(5));
  await page.waitForTimeout(1500);
  await shot(stage, '09-pinata.png');
  await heal();
  await page.waitForTimeout(1800);
  await shot(stage, '10-seal.png');

  const pouchAtDeath = await page.evaluate(() => window.__oub.pouch());   // mobs drop potions now and then, so the count at death is read, not assumed
  await page.evaluate(() => window.__oub.hurt(9999));
  await page.waitForTimeout(3400);
  await shot(page, '11-death.png');
  await page.screenshot({ path: path.join(out, '12-full-page.png'), fullPage: true });

  // back to the village: the death is on the Roll, the strongbox is empty, the Mint sells a set
  await page.evaluate(() => window.__oub.back());
  await page.waitForTimeout(300);
  const roll = await page.evaluate(() => [window.__oub.G.state, window.__oub.roll().length, window.__oub.roll()[0] && window.__oub.roll()[0].by, window.__oub.roll()[0] && window.__oub.roll()[0].pots]);
  if (roll[0] !== 'gate' || roll[1] !== 1) errors.push('roll: expected one death on the Roll back in the village, got ' + roll.join(','));
  if (roll[3] !== pouchAtDeath) errors.push('roll: expected ' + pouchAtDeath + ' potions lost on the Roll row, got ' + roll[3]);
  console.log('roll: You fell to ' + roll[2] + ', ' + roll[3] + ' potion(s) lost');
  await page.evaluate(() => { window.__oub.goto('roll'); window.__oub.use(); });
  await page.waitForTimeout(300);
  await shot(stage, '13-roll.png');
  await page.evaluate(() => window.__oub.close());
  await page.evaluate(() => { window.__oub.goto('mint'); window.__oub.use(); });
  await page.waitForTimeout(300);
  await shot(stage, '14-mint.png');
  const stock0 = await page.evaluate(() => window.__oub.stock());
  await page.click('text=Mint a potion');                 // the potion button on the Mint panel
  await page.waitForTimeout(150);
  const stock1 = await page.evaluate(() => window.__oub.stock());
  if (stock1 !== stock0 + 1) errors.push('mint: expected one more potion in the strongbox, got ' + stock0 + ' -> ' + stock1);
  await page.evaluate(() => window.__oub.back());         // mint a set
  await page.waitForTimeout(200);
  const minted = await page.evaluate(() => window.__oub.wager().filter(Boolean).length);
  if (minted < 4) errors.push('mint: expected a fettered set after minting, got ' + minted + ' pieces');
  await page.evaluate(() => window.__oub.close());

  // skills and the recall, on a fresh page: give() puts loot in the pack so the panel has rows
  const rp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  rp.on('pageerror', e => errors.push('recall: ' + e.message));
  await rp.goto(page_url, { waitUntil: 'networkidle' });
  await rp.waitForTimeout(800);
  await rp.evaluate(() => window.__oub.delve());
  await rp.waitForTimeout(300);
  const rstage = await rp.$('#stage');
  const rbox = await rstage.boundingBox();
  await rp.mouse.move(rbox.x + rbox.width * 0.8, rbox.y + rbox.height * 0.45);
  await rp.evaluate(() => window.__oub.skill(2));        // Sunder
  await rp.waitForTimeout(160);
  await shot(rstage, '15-skill-sunder.png');
  await rp.evaluate(() => { window.__oub.G.player.scd = 0; window.__oub.skill(1); });   // Mend
  await rp.waitForTimeout(200);
  await shot(rstage, '16-skill-mend.png');
  await rp.evaluate(() => { window.__oub.give('wand2'); window.__oub.give('ring1'); });
  await rp.keyboard.down('r');
  await rp.waitForTimeout(1700);
  await shot(rstage, '17-recalling.png');
  await rp.waitForTimeout(2000);
  await rp.keyboard.up('r');
  await rp.waitForTimeout(1200);
  await shot(rp, '18-recalled.png');

  const phone = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  phone.on('pageerror', e => errors.push('phone: ' + e.message));
  await phone.goto(page_url, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1000);
  await shot(phone, '19-phone-village.png');
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) errors.push('phone: page scrolls sideways by ' + wide + 'px');
  await phone.evaluate(() => { window.__oub.delve(); window.__oub.warp(2); });
  await phone.waitForTimeout(1500);
  await shot(await phone.$('#stage'), '20-phone-run.png');

  await browser.close();
  console.log('wrote ' + fs.readdirSync(out).filter(n => n.endsWith('.png')).length + ' screenshots to ' + out);
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
