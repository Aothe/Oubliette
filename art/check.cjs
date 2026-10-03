#!/usr/bin/env node
// Validate the art bank and print what is in it.
//
//   node art/check.cjs
//
// Fails (exit 1) on: a mirrored sprite whose half-rows differ in length, a frame whose size
// differs from frame 0, a row longer than the declared width, or a letter that is not in the
// palette once a look's recolour map is applied. Also checks that every dungeon's theme, boss,
// cast and props exist, and that each sprite marked `slice` is identical to the slice's own copy.
const A = require('./bank.js');
require('./creatures.js');
require('./items.js');
require('./world.js');

const errors = [];
let looks = 0, slice = 0;
const perGroup = {};

for (const id in A.sprites) {
  const d = A.sprites[id];
  const halves = d.halfFrames || (d.half ? [d.half] : []);
  for (const h of halves) if (new Set(h.map(r => r.length)).size > 1) errors.push(id + ': half-rows differ in length, the mirror would not line up');
  const full = d.frames || (d.rows ? [d.rows] : []);
  if (d.w) for (const f of full) for (const r of f) if (r.length > d.w) errors.push(id + ': a row is wider than w=' + d.w + ': ' + r);
  const [w, h] = A.size(d);
  for (let f = 0; f < A.frameCount(d); f++) {
    const rows = A.rows(d, f);
    if (rows.length !== h || rows.some(r => r.length !== w)) errors.push(id + ': frame ' + f + ' is not ' + w + 'x' + h);
    for (const look of A.looks(d)) {
      const bad = new Set();
      for (const r of rows) for (let ch of r) {
        if (ch === '.') continue;
        if (look.map && look.map[ch]) ch = look.map[ch];
        if (!A.palette[ch]) bad.add(ch);
      }
      if (bad.size) errors.push(id + ' / ' + look.label + ': not in the palette: ' + [...bad].join(' '));
    }
  }
  const n = A.looks(d).length;
  looks += n; if (d.slice) slice++;
  perGroup[d.group] = perGroup[d.group] || { sprites: 0, looks: 0 };
  perGroup[d.group].sprites++; perGroup[d.group].looks += n;
}

for (const sc of A.scenes) {
  if (!A.themes[sc.theme]) errors.push('scene: unknown theme ' + sc.theme);
  if (sc.boss && !A.sprites[sc.boss]) errors.push(sc.theme + ': unknown boss ' + sc.boss);
  for (const [id, variant] of sc.cast.concat(sc.props)) {
    const d = A.sprites[id];
    if (!d) errors.push(sc.theme + ': unknown sprite ' + id);
    else if (variant && !A.looks(d).some(l => l.label === variant)) errors.push(sc.theme + ': ' + id + ' has no look called ' + variant);
  }
}

// The slice carries its own copy of every sprite it draws. Flag any copy here that has drifted
// from it, so the bank stays the full record until the slice is made to load the bank.
const fs = require('fs');
const path = require('path');
const SLICE_NAME = {
  lamplighter: 'DELVER_A', forgotten: 'FORGOTTEN', shade: 'SHADE', gaoler: 'GAOLER', turnkey: 'TURNKEY_L',
  torch: 'TORCH', bag: 'BAG', grave: 'GRAVE', bone: 'BONE', skull: 'SKULL',
  bolt: 'DIA5', bolt_heavy: 'DIA7', orb: 'ORB5', orb_heavy: 'ORB7',
  wand: 'WAND', armour: 'ARMOUR', ring: 'RING', key: 'KEY', feather: 'FEATHER', poultice: 'POULTICE', maul: 'MAUL', draught: 'FLASK'
};
const slicePath = path.join(__dirname, '..', 'proto', 'visual', 'index.html');
let matched = 0;
if (fs.existsSync(slicePath)) {
  const src = fs.readFileSync(slicePath, 'utf8');
  for (const id in A.sprites) {
    const d = A.sprites[id];
    if (!d.slice) continue;
    const name = SLICE_NAME[id];
    const m = name && src.match(new RegExp('const ' + name + '=(\\[[\\s\\S]*?\\]);'));
    if (!m) { errors.push(id + ': marked as in the slice, but the slice has no ' + (name || 'sprite by that name')); continue; }
    if (JSON.stringify(JSON.parse(m[1])) !== JSON.stringify(d.frames || d.half || d.rows)) errors.push(id + ': differs from ' + name + ' in proto/visual/index.html');
    else matched++;
  }
}

const total = Object.keys(A.sprites).length;
for (const g of A.groups) console.log((g.title + ':').padEnd(14) + String(perGroup[g.id].sprites).padStart(3) + ' sprites, ' + String(perGroup[g.id].looks).padStart(3) + ' looks');
console.log('total:        ' + String(total).padStart(3) + ' sprites, ' + String(looks).padStart(3) + ' looks with recolours; ' + slice + ' already in the slice');
console.log('palette:      ' + Object.keys(A.palette).length + ' colours; dungeons: ' + A.scenes.length + ' (' + A.scenes.filter(s => s.built).length + ' built)');
console.log('slice copies: ' + matched + ' of ' + slice + ' identical to proto/visual/index.html');
if (errors.length) { console.error('\n' + errors.length + ' problem(s):\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('ok');
