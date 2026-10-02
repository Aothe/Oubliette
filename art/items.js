// Gear, relics and consumables. 12 x 12 icons.
//
// Gear is one shape per family and three tiers by recolour (`tiers`): tier I is wood, cloth and
// tin; tier II is steel and ember; tier III is verdigris and gold. A and a are the main colour
// and its shade; X and x are the accent. The slice uses the first three families and one relic.
(function (A) {
  'use strict';

  A.group('gear', 'Gear', 'Seventeen families, three tiers each. The first three are the slice\'s ten-item set, less its relic. One shape per family, so a new tier is a recolour, never a redraw.');
  A.group('relics', 'Relics', 'One-off pieces, tier III, meant as boss drops.');
  A.group('skills', 'Skill items', 'The slice\'s three wagered skills: one per delver, chosen in the entry hall and then locked.');
  A.group('consumables', 'Consumables', 'Things that are used up. The certificate stands for the tokenised-stock drop (SPEC §3.2).');

  const T = function (names, maps) { return names.map(function (n, i) { return { name: n, map: maps[i] }; }); };
  const METAL = [{ A: 'm', a: 'i', X: 'W', x: 'w' }, { A: 'M', a: 'm', X: 'e', x: 'R' }, { A: 'T', a: 't', X: 'G', x: 'g' }];
  const PLATE = [{ A: 'W', a: 'w', X: 'i' }, { A: 'm', a: 'i', X: 'e' }, { A: 'T', a: 't', X: 'G' }];
  const HIDE = [{ A: 'W', a: 'w', X: 'l' }, { A: 'm', a: 'i', X: 'M' }, { A: 'T', a: 'd', X: 'G' }];

  /* ---------- gear ---------- */
  A.add('gear', 'wand', { name: 'Wand', slice: true, tiers: T(['Tallow Wand', 'Ember Wand', "Castellan's Brand"], [{ A: 'y' }, { A: 'e', '#': 'Y', w: 'i', l: 'm' }, { A: 'T', w: 'g', l: 'G' }]), rows: [
    '.........kk.',
    '........kAAk',
    '.......kA#Ak',
    '......kkAAk.',
    '.....kwlkk..',
    '....kwlk....',
    '...kwlk.....',
    '..kwlk......',
    '.kwlk.......',
    'kwlk........',
    'kkk.........',
    '............'] });
  A.add('gear', 'armour', { name: 'Armour', slice: true, tiers: T(['Gaol-cloth Robe', "Warder's Hauberk", 'Verdigris Plate'], [{ A: 'W', a: 'w' }, { A: 'M', a: 'm' }, { A: 'T', a: 't' }]), rows: [
    '............',
    '.kkk....kkk.',
    'kAAAkkkkAAAk',
    'kAAAAaaAAAAk',
    'kkAAAAAAAAkk',
    '.kaAAAAAAak.',
    '.kaAAaaAAak.',
    '.kaAAAAAAak.',
    '.kaAAaaAAak.',
    '.kaaAAAAaak.',
    '..kkaaaakk..',
    '....kkkk....'] });
  A.add('gear', 'ring', { name: 'Ring', slice: true, tiers: T(['Tin Band', 'Signet of the Watch', 'Ring of the Forgotten'], [{ A: '6', a: 'm', '#': 'M' }, { A: 'e', a: 'g', '#': 'Y' }, { A: 'T', a: 'G' }]), rows: [
    '............',
    '....kkkk....',
    '...kA##Ak...',
    '...kAAAAk...',
    '..kkkaakkk..',
    '.kaak..kaak.',
    '.kak....kak.',
    '.kak....kak.',
    '.kaak..kaak.',
    '..kaakkaak..',
    '...kaaaak...',
    '....kkkk....'] });
  A.add('gear', 'sword', { name: 'Sword', tiers: T(["Gaoler's Shortsword", "Warder's Blade", "Castellan's Edge"], METAL), rows: [
    '..........kk',
    '.........kAk',
    '........kAAk',
    '.......kAak.',
    '......kAak..',
    '.....kAak...',
    '.k..kAak....',
    'kXkkAak.....',
    '.kXXak......',
    '..kXXk......',
    '.kxkkXk.....',
    'kxk..kk.....'] });
  A.add('gear', 'dagger', { name: 'Dagger', tiers: T(['Shiv', 'Stiletto', 'Mercy'], METAL), rows: [
    '............',
    '............',
    '.......kk...',
    '......kAAk..',
    '.....kAAk...',
    '....kAak....',
    '..kkAak.....',
    '.kXXak......',
    '..kXXk......',
    '.kxkkk......',
    'kxk.........',
    '.k..........'] });
  A.add('gear', 'axe', { name: 'Axe', tiers: T(['Hatchet', "Headsman's Axe", 'Verdict'], METAL), rows: [
    '............',
    '....kkkk....',
    '...kAAAAkkk.',
    '..kAAAAaakXk',
    '..kAAaakkXk.',
    '..kAaak.kXk.',
    '...kkk.kXk..',
    '......kXk...',
    '.....kXk....',
    '....kXk.....',
    '...kXk......',
    '...kk.......'] });
  A.add('gear', 'mace', { name: 'Mace', tiers: T(['Cudgel', 'Flanged Mace', 'Morning Bell'], METAL), rows: [
    '......k.k...',
    '.....kAkAk..',
    '....kAAAAAk.',
    '.....kAaAk..',
    '....kAAaAAk.',
    '.....kaaak..',
    '......kXk...',
    '.....kXk....',
    '....kXk.....',
    '...kXk......',
    '..kXk.......',
    '..kk........'] });
  A.add('gear', 'bow', { name: 'Bow', tiers: T(['Yew Bow', 'Horn Bow', 'Verdigris Recurve'], [{ A: 'W', X: 'l' }, { A: 'l', X: 'e' }, { A: 'T', X: 'G' }]), rows: [
    '....kkk.....',
    '...kAAk.....',
    '...6.kAk....',
    '...6..kAk...',
    '...6...kXk..',
    '...6...kXk..',
    '...6...kXk..',
    '...6...kXk..',
    '...6..kAk...',
    '...6.kAk....',
    '...kAAk.....',
    '....kkk.....'] });
  A.add('gear', 'staff', { name: 'Staff', tiers: T(['Ash Staff', 'Cinder Staff', 'Staff of the Shade'], [{ A: '6', X: 'W' }, { A: 'o', X: 'i' }, { A: 'P', X: 'G' }]), rows: [
    '.......kkk..',
    '......kAAAk.',
    '......kA#Ak.',
    '......kAAAk.',
    '.......kXk..',
    '......kXk...',
    '.....kXk....',
    '....kXk.....',
    '...kXk......',
    '..kXk.......',
    '.kXk........',
    '.kk.........'] });
  A.add('gear', 'shield', { name: 'Shield', tiers: T(['Plank Shield', 'Kite Shield', "Seal-bearer's Ward"], PLATE), rows: [
    '............',
    '.kkkkkkkkkk.',
    '.kAAAXXAAAk.',
    '.kAAAXXAAAk.',
    '.kAAAXXAAAk.',
    '.kXXXXXXXXk.',
    '.kaaaXXaaak.',
    '.kaaaXXaaak.',
    '..kaaXXaak..',
    '...kaXXak...',
    '....kkkk....',
    '............'] });
  A.add('gear', 'helm', { name: 'Helm', tiers: T(['Leather Cap', 'Barbute', 'Verdigris Crown-helm'], [{ A: 'l', a: 'W', X: 'w' }, { A: 'M', a: 'm', X: 'e' }, { A: 'T', a: 't', X: 'G' }]), rows: [
    '....kXXk....',
    '..kkAXXAkk..',
    '.kAAAAAAAAk.',
    '.kAAAAAAAAk.',
    '.kAkkkkkkAk.',
    '.kAkkkkkkAk.',
    '.kAAAkkAAAk.',
    '.kaAAkkAAak.',
    '.kaaAkkAaak.',
    '..kkkkkkkk..',
    '............',
    '............'] });
  A.add('gear', 'boots', { name: 'Boots', tiers: T(['Rag Wraps', 'Riveted Boots', 'Stillwater Treads'], HIDE), rows: [
    '............',
    '...kkkk.....',
    '...kAAk.....',
    '...kAAk.....',
    '...kXXk.....',
    '...kAAk.....',
    '...kAAkk....',
    '...kAAAAkk..',
    '..kAAAAAAAk.',
    '..kaaaaaaak.',
    '..kkkkkkkkk.',
    '............'] });
  A.add('gear', 'gloves', { name: 'Gloves', tiers: T(['Rope-burned Mitts', 'Gauntlets', "Lockpicker's Hands"], HIDE), rows: [
    '............',
    '..k.k.k.k...',
    '.kAkAkAkAk..',
    '.kAkAkAkAk..',
    '.kAAAAAAAkk.',
    '.kAAAAAAAAAk',
    '.kAAAAAAAAk.',
    '..kaaaaaak..',
    '..kXXXXXXk..',
    '..kaaaaaak..',
    '..kkkkkkkk..',
    '............'] });
  A.add('gear', 'cloak', { name: 'Cloak', tiers: T(['Sackcloth Cloak', "Warder's Mantle", 'Mantle of the Forgotten'], [{ A: 'W', a: 'w', X: 'm' }, { A: 'e', a: 'R', X: 'g' }, { A: 'p', a: 'v', X: 'G' }]), rows: [
    '............',
    '...kkkkkk...',
    '..kAAXXAAk..',
    '..kAAAAAAk..',
    '.kAAAAAAAAk.',
    '.kAAaAAaAAk.',
    '.kAAaAAaAAk.',
    'kAAAaAAaAAAk',
    'kAAaaAAaaAAk',
    'kAaaAAAAaaAk',
    'kkakkAAkkakk',
    '.k.k.kk.k.k.'] });
  A.add('gear', 'amulet', { name: 'Amulet', tiers: T(['Tin Token', 'Blood Pendant', 'Verdigris Eye'], [{ X: 'm', A: '6' }, { X: 'g', A: 'e' }, { X: 'G', A: 'T' }]), rows: [
    '...k....k...',
    '..kXk..kXk..',
    '..kXk..kXk..',
    '...kXkkXk...',
    '....kXXk....',
    '...kkAAkk...',
    '..kAAAAAAk..',
    '..kAA##AAk..',
    '..kAAAAAAk..',
    '...kAAAAk...',
    '....kkkk....',
    '............'] });
  A.add('gear', 'lantern', { name: 'Lantern', tiers: T(['Tallow Lantern', 'Ember Lantern', 'Wisp Lantern'], [{ X: 'i', A: 'y' }, { X: 'm', A: 'o' }, { X: 'G', A: 'T' }]), rows: [
    '....kkkk....',
    '...kXkkXk...',
    '....kXXk....',
    '...kkkkkk...',
    '..kXAAAAXk..',
    '..kXA##AXk..',
    '..kXA##AXk..',
    '..kXAAAAXk..',
    '..kXAAAAXk..',
    '...kkkkkk...',
    '..kXXXXXXk..',
    '...kkkkkk...'] });
  A.add('gear', 'tome', { name: 'Tome', tiers: T(['Gaol Ledger', 'Red Psalter', 'Book of Names'], [{ A: 'W', a: 'w', X: 'l' }, { A: 'e', a: 'R', X: 'g' }, { A: 'p', a: 'v', X: 'G' }]), rows: [
    '............',
    '.kkkkkkkkk..',
    '.kAAAAAAAkk.',
    '.kAXXXXXAkBk',
    '.kAXAAAXAkBk',
    '.kAXA#AXAkBk',
    '.kAXAAAXAkBk',
    '.kAXXXXXAkBk',
    '.kAAAAAAAkBk',
    '.kaaaaaaakBk',
    '.kkkkkkkkkk.',
    '............'] });

  /* ---------- relics ---------- */
  A.add('relics', 'key', { name: "The Turnkey's Key", slice: true, rows: [
    '............',
    '............',
    '.kkkk.......',
    'kGGGGk......',
    'kGkkGgkkkkkk',
    'kGk.kGGGGGGk',
    'kGkkGgkkGkGk',
    'kGGGGk.kGkGk',
    '.kkkk..kkkkk',
    '............',
    '............',
    '............'] });
  A.add('relics', 'seal', { name: "The Warden's Seal", rows: [
    '............',
    '....kkkk....',
    '...kWWWWk...',
    '...kWllWk...',
    '...kWWWWk...',
    '....kwwk....',
    '...kkwwkk...',
    '..kGGGGGGk..',
    '..kGeGGeGk..',
    '..kgGeeGgk..',
    '...kkkkkk...',
    '............'] });
  A.add('relics', 'censer', { name: "The Abbot's Censer", rows: [
    '.....mm.....',
    '....m..m....',
    '....m..m....',
    '...kkkkkk...',
    '..kGgGGgGk..',
    '..kGGGGGGk..',
    '.kGkGkkGkGk.',
    '.kGGGGGGGGk.',
    '..kGoyyoGk..',
    '..kgGGGGgk..',
    '...kkggkk...',
    '....kkkk....'] });
  A.add('relics', 'knucklebone', { name: "The Saint's Knucklebone", rows: [
    '............',
    '............',
    '.kk......kk.',
    'kBBk....kBBk',
    'kBBBkkkkBBBk',
    '.kBBBBBBBBk.',
    '.kbBBBBBBbk.',
    'kBBbkkkkbBBk',
    'kBbk....kbBk',
    '.kk......kk.',
    '............',
    '............'] });
  A.add('relics', 'crown', { name: "The Castellan's Crown", rows: [
    '............',
    '.k...kk...k.',
    'kGk.kGGk.kGk',
    'kGkkkGGkkkGk',
    'kGGkGGGGkGGk',
    'kGGGGGGGGGGk',
    'kGeGGTTGGeGk',
    'kGGGGGGGGGGk',
    'kggggggggggk',
    '.kkkkkkkkkk.',
    '............',
    '............'] });
  A.add('relics', 'chalice', { name: 'The Drowned Chalice', rows: [
    '............',
    '.kkkkkkkkkk.',
    '.kGGGGGGGGk.',
    '.kGttttttGk.',
    '.kGGGGGGGGk.',
    '..kGGGGGGk..',
    '...kgGGgk...',
    '....kGGk....',
    '....kGGk....',
    '...kgGGgk...',
    '..kGGGGGGk..',
    '..kkkkkkkk..'] });

  /* ---------- skill items ---------- */
  A.add('skills', 'feather', { name: 'Moth Feather (Slip)', slice: true, rows: [
    '........kkk.',
    '.......kTTTk',
    '......kTT#Tk',
    '.....kTT#Tk.',
    '....kTT#Tk..',
    '...ktT#Tk...',
    '...kttTk....',
    '..kwkkk.....',
    '.kwk........',
    'kwk.........',
    'kk..........',
    '............'] });
  A.add('skills', 'poultice', { name: 'Moss Poultice (Mend)', slice: true, rows: [
    '............',
    '.....kk.....',
    '....kHHk....',
    '...kHhHHk...',
    '...kHHhHk...',
    '..kkkkkkkk..',
    '.kWWWWWWWWk.',
    '.kWlWWWWWWk.',
    '..kWWWWWWk..',
    '...kwwwwk...',
    '....kkkk....',
    '............'] });
  A.add('skills', 'maul', { name: "Breaker's Maul (Sunder)", slice: true, rows: [
    '............',
    '..kkkkkkk...',
    '.kMMMMMMMk..',
    '.kmMMMMMmk..',
    '.kmmmmmmmk..',
    '..kkkWkkk...',
    '....kWk.....',
    '....kWk.....',
    '....kWk.....',
    '....kwk.....',
    '....kkk.....',
    '............'] });

  /* ---------- consumables ---------- */
  A.add('consumables', 'draught', { name: 'Draught', slice: true,
    variants: { 'Lamp oil': { e: 'y', Y: '#' }, 'Antidote': { e: 'h', Y: 'H' }, 'Shade tonic': { e: 'p', Y: 'P' }, 'Verdigris tincture': { e: 't', Y: 'T' } }, rows: [
    '....kkkk....',
    '....kwwk....',
    '....k##k....',
    '....k##k....',
    '...k#ee#k...',
    '..k#eeee#k..',
    '.k#eeeYee#k.',
    '.k#eeeeee#k.',
    '.k#eeeeee#k.',
    '..k#eeee#k..',
    '...kkkkkk...',
    '............'] });
  A.add('consumables', 'repair_kit', { name: 'Repair Kit', rows: [
    '............',
    '..kkkkkk....',
    '.kmmmmmmk...',
    '.kmMMMmmkk..',
    '.kiiiiiikWk.',
    '..kkkkkkWk..',
    '......kWk...',
    '.....kWk....',
    '....kWk.....',
    '...kWk......',
    '..kWk.......',
    '..kk........'] });
  A.add('consumables', 'bandage', { name: 'Bandage', rows: [
    '............',
    '............',
    '..kkkkkkkk..',
    '.kBBBBBBBBk.',
    '.kBBBeeBBBk.',
    '.kBeeeeeeBk.',
    '.kBeeeeeeBk.',
    '.kBBBeeBBBk.',
    '.kbBBBBBBbk.',
    '..kkkkkkkk..',
    '............',
    '............'] });
  A.add('consumables', 'scroll', { name: 'Recall Scroll', rows: [
    '............',
    '.kkkkkkkkk..',
    'kBBBBBBBBBk.',
    'kbkkkkkkkbk.',
    '.kBBBBBBBk..',
    '.kBtBtBtBk..',
    '.kBBBBBBBk..',
    '.kBtBtBtBk..',
    '.kBBBBBBBk..',
    'kbkkkkkkkbk.',
    'kBBBBBBBBBk.',
    '.kkkkkkkkk..'] });
  A.add('consumables', 'bomb', { name: 'Powder Bomb', rows: [
    '............',
    '.......ky...',
    '......kk.Y..',
    '.....kWk....',
    '...kkkkkk...',
    '..k333333k..',
    '.k33443333k.',
    '.k34433333k.',
    '.k33333333k.',
    '.k33333332k.',
    '..k333322k..',
    '...kkkkkk...'] });
  A.add('consumables', 'candle', { name: 'Candle', rows: [
    '............',
    '.....ky.....',
    '....kyYk....',
    '....koyk....',
    '.....kk.....',
    '....kBBk....',
    '....kBBk....',
    '....kBbk....',
    '....kBBk....',
    '...kkBbkk...',
    '..kggggggk..',
    '..kkkkkkkk..'] });
  A.add('consumables', 'ration', { name: 'Ration', rows: [
    '............',
    '............',
    '............',
    '...kkkkkk...',
    '..kllllllk..',
    '.klWlWlWllk.',
    '.kWWWWWWWWk.',
    '.kWWWWWWWWk.',
    '.kwWWWWWWwk.',
    '..kkkkkkkk..',
    '............',
    '............'] });
  A.add('consumables', 'iron_key', { name: 'Cell Key', map: { G: 'm', g: 'i' }, rows: A.sprites.key.rows });
  A.add('consumables', 'certificate', { name: 'Stock Certificate', rows: [
    '............',
    '.kkkkkkkkkk.',
    '.kBBBBBBBBk.',
    '.kB666666Bk.',
    '.kBBBBBBBBk.',
    '.kB6666BBBk.',
    '.kBBBBBBBBk.',
    '.kB66BBkGkk.',
    '.kBBBBkGGGk.',
    '.kBBBBBkGek.',
    '.kkkkkkkekk.',
    '........k...'] });
})(typeof module !== 'undefined' && module.exports ? require('./bank.js') : OUB_ART);
