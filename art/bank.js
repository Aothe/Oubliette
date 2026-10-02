// The art bank: every sprite Oubliette has, as data.
//
// A sprite is a grid of letters. Each letter is a key into the one palette below; '.' is empty.
// Nothing here is an image file and nothing here is wired into a game: `proto/visual/` carries
// its own copy of the sprites it uses (marked `slice: true` here), and the rest is banked for
// dungeons that do not exist yet (SPEC §7, not-v0).
//
// Loads in a browser (`<script src>`, sets `OUB_ART`) and in node (`require`), so `check.cjs`
// can validate the same data the gallery draws. Load order: bank.js, then creatures.js,
// items.js, world.js.
//
// A sprite definition:
//   name      display name
//   rows      full rows, or
//   half      left halves, mirrored to make a symmetric sprite (every row the same length)
//   frames / halfFrames   the same, one entry per animation frame
//   w         width to right-pad short rows to (optional; default is the longest row)
//   walk      true for delvers: frame 1 swaps the two feet rows
//   map       default recolour, {letter: palette key}
//   variants  {label: map} — further recolours, applied over `map`
//   tiers     [{name, map} x3] — gear: one shape, three tiers
//   slice     true if proto/visual/ already draws it
(function (root) {
  'use strict';

  const PAL = {
    k: '#0d0b14', '1': '#17141f', '2': '#25212f', '3': '#363145', '4': '#4c4660', '5': '#6b6680', '6': '#9390a3',
    b: '#d9cfb4', B: '#f3ecd6', n: '#a39878', o: '#e8822e', y: '#f7c04a', Y: '#fff1a8', r: '#b3391f', R: '#7a1626', e: '#c22a3a',
    t: '#2f8f83', T: '#5fd1b5', d: '#1c5a5a', p: '#6b3fa0', P: '#a678e0', v: '#3d2466', w: '#5a3a24', W: '#8a5a34', l: '#b98a55',
    g: '#c9952c', G: '#f2cf5e', s: '#d99a6c', S: '#f0c090', i: '#4a5263', m: '#7d8796', M: '#b9c3cf', h: '#4d7a3a', H: '#86b552', '#': '#ffffff'
  };
  const COLOUR_NAMES = {
    k: 'void', '1': 'stone 1', '2': 'stone 2', '3': 'stone 3', '4': 'stone 4', '5': 'stone 5', '6': 'stone 6',
    b: 'bone', B: 'bone light', n: 'bone shade', o: 'ember', y: 'flame', Y: 'flame core', r: 'cinder', R: 'old blood', e: 'blood',
    t: 'verdigris', T: 'verdigris light', d: 'verdigris deep', p: 'shade', P: 'shade light', v: 'shade deep',
    w: 'wood dark', W: 'wood', l: 'leather', g: 'gold shade', G: 'gold', s: 'skin shade', S: 'skin',
    i: 'iron', m: 'steel', M: 'steel light', h: 'moss', H: 'moss light', '#': 'white'
  };

  const A = { palette: PAL, colourNames: COLOUR_NAMES, groups: [], sprites: {}, themes: {}, scenes: [] };

  A.group = function (id, title, blurb) { A.groups.push({ id: id, title: title, blurb: blurb || '', ids: [] }); };
  A.add = function (group, id, def) {
    if (A.sprites[id]) throw new Error('duplicate sprite id: ' + id);
    const g = A.groups.find(function (x) { return x.id === group; });
    if (!g) throw new Error('unknown group: ' + group);
    def.id = id; def.group = group; A.sprites[id] = def; g.ids.push(id);
    return def;
  };

  const WALK_FEET = ['...kwwkkwwk.....', '...kkkkkkkk.....'];
  A.frameCount = function (d) { return d.walk ? 2 : d.frames ? d.frames.length : d.halfFrames ? d.halfFrames.length : 1; };
  // One frame's rows, expanded: halves mirrored, short rows right-padded.
  A.rows = function (d, frame) {
    frame = frame || 0;
    let rows = d.frames ? d.frames[frame] : d.halfFrames ? d.halfFrames[frame] : (d.half || d.rows);
    if (d.half || d.halfFrames) rows = rows.map(function (r) { return r + r.split('').reverse().join(''); });
    if (d.walk && frame === 1) rows = rows.slice(0, 14).concat(WALK_FEET);
    const w = d.w || rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    return rows.map(function (r) { return r.length < w ? r + '.'.repeat(w - r.length) : r; });
  };
  A.size = function (d) { const r = A.rows(d, 0); return [r[0].length, r.length]; };
  // Every recolour of a sprite, the default first: [{label, map, tier}].
  A.looks = function (d) {
    if (d.tiers) return d.tiers.map(function (t, i) { return { label: t.name, map: t.map, tier: i + 1 }; });
    const out = [{ label: d.name, map: d.map || null }];
    for (const k in (d.variants || {})) out.push({ label: k, map: Object.assign({}, d.map, d.variants[k]) });
    return out;
  };
  A.mulberry = function (a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  };

  /* ---------- drawing (browser only) ---------- */
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  A.canvas = cv;
  A.draw = function (d, map, frame) {
    const rows = A.rows(d, frame), c = cv(rows[0].length, rows.length), g = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      let ch = rows[y][x]; if (ch === '.') continue;
      if (map && map[ch]) ch = map[ch];
      if (!PAL[ch]) continue;                       // check.cjs reports these; the gallery skips them
      g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1);
    }
    return c;
  };

  /* ---------- dungeon tilesets: one generator, a theme per dungeon ---------- */
  // A theme is colours plus a few switches. Tiles are 16 x 16 and drawn from a seeded source,
  // so a dungeon's floor is the same every time it is generated from the same seed.
  A.theme = function (id, def) { def.id = id; A.themes[id] = def; return def; };
  A.tile = {
    // variant: 0 plain, 1 cracked, 2 grown-over
    floor: function (th, r, variant) {
      const c = cv(16, 16), g = c.getContext('2d'); g.fillStyle = th.mortar; g.fillRect(0, 0, 16, 16);
      const stones = [[0, 0, 7, 7], [8, 0, 7, 7], [4, 8, 7, 7], [12, 8, 4, 7], [0, 8, 3, 7]];
      for (const s of stones) {
        g.fillStyle = th.stone[r() < .5 ? 0 : 1]; g.fillRect(s[0], s[1], s[2], s[3]);
        if (r() < .6) { g.fillStyle = th.hi; g.fillRect(s[0], s[1], s[2], 1); }
      }
      for (let i = 0; i < 9; i++) { g.fillStyle = th.speck[r() < .5 ? 0 : 1]; g.fillRect(r() * 16 | 0, r() * 16 | 0, 1, 1); }
      if (variant === 1) { let x = 3 + (r() * 8 | 0), y = 1; g.fillStyle = th.crack; while (y < 15) { g.fillRect(x, y, 1, 1); y++; if (r() < .5) x += r() < .5 ? -1 : 1; } }
      if (variant === 2) for (let i = 0; i < 8; i++) { g.fillStyle = th.growth[r() < .5 ? 0 : 1]; g.fillRect(r() * 16 | 0, (r() < .5 ? 7 : 15) - (r() * 2 | 0), 1, 1); }
      return c;
    },
    face: function (th, r) {
      const c = cv(16, 16), g = c.getContext('2d'), W = th.wall; g.fillStyle = W.mortar; g.fillRect(0, 0, 16, 16);
      g.fillStyle = W.cap[0]; g.fillRect(0, 0, 16, 1); g.fillStyle = W.cap[1]; g.fillRect(0, 1, 16, 2);
      for (let k = 0; k < 3; k++) {
        const y = 3 + k * 4, off = k % 2 ? 4 : 0;
        for (let bx = -off; bx < 16; bx += 8) {
          g.fillStyle = W.brick[r() < .3 ? 1 : 0]; g.fillRect(bx, y, 7, 3);
          if (r() < .6) { g.fillStyle = W.hi; g.fillRect(bx, y, 7, 1); }
          if (W.skulls) { g.fillStyle = W.mortar; g.fillRect(bx + 2, y + 1, 1, 1); g.fillRect(bx + 4, y + 1, 1, 1); }
        }
      }
      if (W.vines) for (let i = 0; i < 3; i++) { const x = r() * 16 | 0, n = 3 + (r() * 9 | 0); for (let j = 0; j < n; j++) { g.fillStyle = W.vines[j % 3 ? 0 : 1]; g.fillRect(x + (j % 4 === 3 ? 1 : 0), 1 + j, 1, 1); } }
      g.fillStyle = W.base; g.fillRect(0, 15, 16, 1);
      return c;
    },
    top: function (th, r) {
      const c = cv(16, 16), g = c.getContext('2d'); g.fillStyle = th.top[0]; g.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 10; i++) { g.fillStyle = th.top[1]; g.fillRect(r() * 16 | 0, r() * 16 | 0, 2, 1); }
      return c;
    },
    // frame 0 or 1: the ripples shift
    liquid: function (th, r, frame) {
      const c = cv(16, 16), g = c.getContext('2d'), L = th.liquid; g.fillStyle = L[0]; g.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 7; i++) { const x = (r() * 16 | 0), y = (r() * 16 | 0), w = 2 + (r() * 3 | 0); g.fillStyle = L[1 + (i % 2)]; g.fillRect((x + (frame ? 2 : 0)) % 14, y, w, 1); }
      return c;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  root.OUB_ART = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
