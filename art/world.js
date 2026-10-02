// Props, projectiles, interface icons, and the dungeons: a tileset theme and a cast for each.
(function (A) {
  'use strict';

  A.group('props', 'Props', 'Things that stand in a room. Sizes vary; the torch, brazier and spikes have frames.');
  A.group('shots', 'Projectiles', 'Diamonds belong to delvers and orbs to the dungeon, so a glance tells you whose it is. a and A are the outer and inner colour.');
  A.group('ui', 'Interface', 'Skill icons at 12 pixels, status marks at 8.');

  /* ---------- props ---------- */
  A.add('props', 'torch', { name: 'Torch', slice: true, frames: [
    ['..y...', '.yYy..', '.yYYy.', 'oyYYyo', 'oyYyoo', '.ooyo.', '..ww..', '..ww..'],
    ['...y..', '..yYy.', '.yYYy.', 'oyYYyo', 'ooyYyo', '.oyoo.', '..ww..', '..ww..'],
    ['..y...', '..Yy..', '.yYYy.', '.oYYyo', 'oyYyoo', '.ooyo.', '..ww..', '..ww..']] });
  A.add('props', 'brazier', { name: 'Brazier', frames: [[
    '....y..y....',
    '...yYyyYy...',
    '..oyYYYYyo..',
    '..ooyYYyoo..',
    '.kkkkkkkkkk.',
    '.kiiiiiiiik.',
    '..kiiiiiik..',
    '...kkiikk...',
    '....kiik....',
    '....kiik....',
    '...kiiiik...',
    '..kkkkkkkk..'], [
    '...y...y....',
    '..yYy.yYy...',
    '..oyYYYYyo..',
    '..ooyYYyoo..',
    '.kkkkkkkkkk.',
    '.kiiiiiiiik.',
    '..kiiiiiik..',
    '...kkiikk...',
    '....kiik....',
    '....kiik....',
    '...kiiiik...',
    '..kkkkkkkk..']] });
  A.add('props', 'bag', { name: 'Loot bag, tier I', slice: true, variants: { 'Tier II': { W: 'p', w: 'v', l: 'P', n: '#' }, 'Tier III': { W: 'G', w: 'g', l: 'Y', n: '#' } }, rows: [
    '..kk..kk..',
    '.kllkkllk.',
    '..kllllk..',
    '...knnk...',
    '..kWWWWk..',
    '.kWWWlWWk.',
    'kWWWWWlWWk',
    'kWWWWWWWWk',
    'kwWWWWWWwk',
    '.kkkkkkkk.'] });
  A.add('props', 'grave', { name: 'Gravestone', slice: true, rows: [
    '..kkkkkk..',
    '.k566665k.',
    'k56666665k',
    'k56k66k65k',
    'k566kk665k',
    'k56k66k65k',
    'k56666665k',
    'k55666655k',
    'k55555555k',
    'k45555554k',
    'k44444444k',
    'kkkkkkkkkk'] });
  A.add('props', 'bone', { name: 'Bone', slice: true, map: { B: 'n', b: '5' }, rows: ['B..bb..B', 'bBBBBBBb', 'B..bb..B'] });
  A.add('props', 'skull', { name: 'Skull', slice: true, map: { B: 'n', b: '5' }, rows: ['.bBBb.', 'bBBBBb', 'BkBBkB', 'bBBBBb', '.bkbk.'] });
  A.add('props', 'barrel', { name: 'Barrel', rows: [
    '...kkkkkk...',
    '..kWWWWWWk..',
    '.kWlWWWWlWk.',
    '.kiiiiiiiik.',
    '.kWlWWWWwWk.',
    'kWWlWWWWwWWk',
    'kWWlWWWWwWWk',
    'kWWlWWWWwWWk',
    '.kWlWWWWwWk.',
    '.kiiiiiiiik.',
    '.kWwWWWWwWk.',
    '..kwwwwwwk..',
    '...kkkkkk...'] });
  A.add('props', 'crate', { name: 'Crate', rows: [
    'kkkkkkkkkkkk',
    'kllllllllllk',
    'klwWWWWWWwlk',
    'klWwWWWWwWlk',
    'klWWwWWwWWlk',
    'klWWWwwWWWlk',
    'klWWWwwWWWlk',
    'klWWwWWwWWlk',
    'klWwWWWWwWlk',
    'klwWWWWWWwlk',
    'kwwwwwwwwwwk',
    'kkkkkkkkkkkk'] });
  A.add('props', 'chest', { name: 'Chest', variants: { 'Iron-bound': { W: 'm', w: 'i', l: 'M' } }, rows: [
    '..kkkkkkkk..',
    '.kWWWWWWWWk.',
    'kWlWWWWWWlWk',
    'kWWWWWWWWWWk',
    'kggggGGggggk',
    'kkkkkGGkkkkk',
    'kWWWWggWWWWk',
    'kWlWWWWWWlWk',
    'kwwwwwwwwwwk',
    'kkkkkkkkkkkk'] });
  A.add('props', 'chest_open', { name: 'Chest, open', rows: [
    '..kkkkkkkk..',
    '.kwwwwwwwwk.',
    '.kwWWWWWWwk.',
    '.kkkkkkkkkk.',
    'kyYyYYYYyYyk',
    'kkkkkGGkkkkk',
    'kWWWWggWWWWk',
    'kWlWWWWWWlWk',
    'kwwwwwwwwwwk',
    'kkkkkkkkkkkk'] });
  A.add('props', 'door', { name: 'Door', half: [
    '....kkkk',
    '...kWWWk',
    '..kWWWWk',
    '..kWWWWk',
    '..kiiiik',
    '..kWWWWk',
    '..kWWWWk',
    '..kWWWgk',
    '..kWWWWk',
    '..kWWWWk',
    '..kiiiik',
    '..kWWWWk',
    '..kWWWWk',
    '..kwwwwk',
    '..kkkkkk',
    '........'] });
  A.add('props', 'portcullis', { name: 'Portcullis', half: [
    '..kkkkkk',
    '..kmkmkm',
    '..kmkmkm',
    '..kiiiii',
    '..kmkmkm',
    '..kmkmkm',
    '..kmkmkm',
    '..kiiiii',
    '..kmkmkm',
    '..kmkmkm',
    '..kmkmkm',
    '..kiiiii',
    '..kmkmkm',
    '..kmkmkm',
    '...m.m.m',
    '........'] });
  A.add('props', 'pillar', { name: 'Pillar', rows: ['.kkkkkkkkkk.', 'k5666666655k', 'k4555555544k', '.kkkkkkkkkk.']
    .concat(Array(12).fill('..k565554k..'))
    .concat(['.kkkkkkkkkk.', 'k5666666655k', 'k4444444444k', 'kkkkkkkkkkkk']) });
  A.add('props', 'cage', { name: 'Hanging cage', half: [
    '.....i',
    '.....i',
    '...kkk',
    '..kiii',
    '..m.m.',
    '..mbm.',
    '..mBmB',
    '..mbm.',
    '..m.m.',
    '..mbmb',
    '..kiii',
    '..kkkk'] });
  A.add('props', 'banner', { name: 'Banner', variants: { 'Verdigris': { R: 'd', G: 'T', g: 't' }, 'Shade': { R: 'v', G: 'P', g: 'p' } }, rows: [
    'kkkkkkkkkk',
    'kggggggggk',
    '.kRRRRRRk.',
    '.kRRRRRRk.',
    '.kRRGGRRk.',
    '.kRGRRGRk.',
    '.kRGRRGRk.',
    '.kRRGGRRk.',
    '.kRRGRRRk.',
    '.kRRGGRRk.',
    '.kRRGRRRk.',
    '.kRRRRRRk.',
    '.kRRkkRRk.',
    '.kRk..kRk.',
    '.kk....kk.'] });
  A.add('props', 'altar', { name: 'Altar', half: [
    '......k.',
    '.....kyk',
    '.....kBk',
    'kkkkkkBk',
    'k6666666',
    'k5RRRRRR',
    'kkkRRRGG',
    '..kRRRGR',
    '..k55RRR',
    '..k45555',
    '.kk44444',
    '.kkkkkkk'] });
  A.add('props', 'bookshelf', { name: 'Bookshelf', half: [
    'kkkkkkkk',
    'kwwwwwww',
    'kwekpkgk',
    'kwekpktk',
    'kwekpktk',
    'kwwwwwww',
    'kwtkgkRk',
    'kwtkgkRk',
    'kwtkgkRk',
    'kwwwwwww',
    'kwpkbkek',
    'kwpkbkek',
    'kwpkbkek',
    'kwwwwwww',
    'kwwwwwww',
    'kkkkkkkk'] });
  A.add('props', 'sarcophagus', { name: 'Sarcophagus', half: [
    '..kkkkkk',
    '.k666666',
    'k6555555',
    'k65kk555',
    'k6555555',
    'k655kk55',
    'k6555555',
    'k6555555',
    'k5444444',
    'k4444444',
    'kkkkkkkk'] });
  A.add('props', 'spikes', { name: 'Spike trap', halfFrames: [[
    'kkkkkkkk', 'k3333333', 'k3333333', 'k3k333k3', 'k3333333', 'k3333333', 'k3333333', 'k3k333k3',
    'k3333333', 'k3333333', 'k3333333', 'k3k333k3', 'k3333333', 'k3333333', 'k2222222', 'kkkkkkkk'], [
    'kkkkkkkk', 'k3M333M3', 'k3M333M3', 'k3m333m3', 'k3333333', 'k3M333M3', 'k3M333M3', 'k3m333m3',
    'k3333333', 'k3M333M3', 'k3M333M3', 'k3m333m3', 'k3333333', 'k3333333', 'k2222222', 'kkkkkkkk']] });
  A.add('props', 'cobweb', { name: 'Cobweb', rows: [
    '555555555555',
    '55.5...5..5.',
    '5.55...5..5.',
    '5555..5..5..',
    '5...5.5..5..',
    '5....55..5..',
    '5..5555..5..',
    '555....5.5..',
    '5.......55..',
    '5..5555555..',
    '555.........',
    '5...........'] });

  /* ---------- projectiles ---------- */
  const DIA5 = ['..a..', '.aAa.', 'aA#Aa', '.aAa.', '..a..'];
  const DIA7 = ['...a...', '..aAa..', '.aA#Aa.', 'aA###Aa', '.aA#Aa.', '..aAa..', '...a...'];
  const ORB5 = ['.aaa.', 'aaAaa', 'aA#Aa', 'aaAaa', '.aaa.'];
  const ORB7 = ['..aaa..', '.aaAaa.', 'aaA#Aaa', 'aA###Aa', 'aaA#Aaa', '.aaAaa.', '..aaa..'];
  A.add('shots', 'bolt', { name: 'Bolt I', slice: true, map: { a: 't', A: 'T' }, variants: { 'Bolt II': { a: 'T', A: '#' }, 'Other delvers': { a: 'd', A: 't' } }, rows: DIA5 });
  A.add('shots', 'bolt_heavy', { name: 'Bolt III', slice: true, map: { a: 't', A: 'T' }, rows: DIA7 });
  A.add('shots', 'orb', { name: 'Bone shot', slice: true, map: { a: 'n', A: 'B' },
    variants: { 'Shade shot': { a: 'p', A: 'P' }, 'Blood shot': { a: 'e', A: 'y' }, 'Ember shot': { a: 'o', A: 'Y' }, 'Moss shot': { a: 'h', A: 'H' }, 'Marsh shot': { a: 't', A: 'T' } }, rows: ORB5 });
  A.add('shots', 'orb_heavy', { name: 'Heavy ember', slice: true, map: { a: 'r', A: 'o' }, variants: { 'Heavy shade': { a: 'v', A: 'P' }, 'Heavy bone': { a: 'n', A: 'B' } }, rows: ORB7 });
  A.add('shots', 'ring_shot', { name: 'Ring shot', map: { a: 'p', A: 'P' }, variants: { 'Ember ring': { a: 'r', A: 'o' }, 'Marsh ring': { a: 'd', A: 'T' } }, rows: [
    '..aaa..', '.aAAAa.', 'aA...Aa', 'aA...Aa', 'aA...Aa', '.aAAAa.', '..aaa..'] });
  A.add('shots', 'crescent', { name: 'Crescent', map: { a: 'e', A: 'y' }, variants: { 'Pale crescent': { a: 'n', A: 'B' }, 'Shade crescent': { a: 'p', A: 'P' } }, rows: [
    '..aaa..', '.aAA...', 'aA#....', 'aA#....', 'aA#....', '.aAA...', '..aaa..'] });
  A.add('shots', 'shard', { name: 'Shard', map: { a: 'm', A: 'M' }, variants: { 'Bone shard': { a: 'n', A: 'B' }, 'Cinder shard': { a: 'r', A: 'o' } }, rows: [
    '..#..', '.aA#.', '.aAA.', 'aAAAa', '.aAA.', '.aA..', '..a..'] });
  A.add('shots', 'skull_shot', { name: 'Skull shot', variants: { 'Cursed skull': { B: 'P', b: 'p' } }, rows: [
    '.kBBBk.', 'kBBBBBk', 'kBkBkBk', 'kBBBBBk', '.kBkBk.', '..kkk..'] });
  A.add('shots', 'arrow', { name: 'Arrow', rows: ['......M..', 'llllllMM#', '......M..'] });

  /* ---------- interface ---------- */
  A.add('ui', 'slip', { name: 'Slip (dash)', rows: [
    '............',
    '..k....k....',
    '..kT...kT...',
    '...kT...kT..',
    '....kT...kT.',
    '.....kT...kT',
    '....kT...kT.',
    '...kT...kT..',
    '..kT...kT...',
    '..k....k....',
    '............',
    '............'] });
  A.add('ui', 'mend', { name: 'Mend (heal)', rows: [
    '............',
    '....kkkk....',
    '....kHHk....',
    '....kHHk....',
    '.kkkkHHkkkk.',
    '.kHHHHHHHHk.',
    '.kHHHHHHHHk.',
    '.kkkkHHkkkk.',
    '....kHHk....',
    '....kHHk....',
    '....kkkk....',
    '............'] });
  A.add('ui', 'sunder', { name: 'Sunder (strike)', rows: [
    '............',
    '.......kkkk.',
    '.....kkoooyk',
    '....kooyyyk.',
    '...kooyykk..',
    '..kooyk.....',
    '..koyk......',
    '.kooyk......',
    '.koyk.......',
    '.kok........',
    '.kk.........',
    '............'] });
  A.add('ui', 'burn', { name: 'Burning', rows: ['...y....', '..yYy...', '.oyYyo..', '.oyYYyo.', '.ooyYoo.', '.roooor.', '..rrrr..', '........'] });
  A.add('ui', 'bleed', { name: 'Bleeding', rows: ['...e....', '...e....', '..eee...', '..eee...', '.eeeee..', '.e#eee..', '.eeeee..', '..eee...'] });
  A.add('ui', 'curse', { name: 'Cursed', rows: ['..PPPP..', '.PPPPPP.', '.PkPPkP.', '.PPPPPP.', '..PkkP..', '..PPPP..', '........', '........'] });
  A.add('ui', 'ward', { name: 'Warded', rows: ['.MMMMMM.', '.MmmmmM.', '.MmTTmM.', '.MmTTmM.', '.MmmmmM.', '..MmmM..', '...MM...', '........'] });
  A.add('ui', 'haste', { name: 'Hastened', rows: ['........', '.T..T...', '.TT.TT..', '.TTTTTT.', '.TT.TT..', '.T..T...', '........', '........'] });
  A.add('ui', 'chill', { name: 'Chilled', rows: ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'] });

  /* ---------- dungeons: a tileset theme and a cast each ---------- */
  // Only the gaol exists as a playable dungeon. The other four are tiles, a cast and a boss, banked.
  A.theme('gaol', { name: 'The Gaol', mortar: '#17141f', stone: ['#25212f', '#2a2636'], hi: '#322d40', speck: ['#1e1b28', '#302b3e'], crack: '#0d0b14', growth: ['#4d7a3a', '#35552f'],
    wall: { mortar: '#25212f', brick: ['#363145', '#3d3850'], hi: '#4c4660', cap: ['#6b6680', '#4c4660'], base: '#17141f' }, top: ['#110f19', '#17141f'], edge: '#363145' });
  A.theme('cistern', { name: 'The Cistern', mortar: '#101a1f', stone: ['#1d2a30', '#22323a'], hi: '#2b3f47', speck: ['#16232a', '#24424a'], crack: '#0a1114', growth: ['#2f8f83', '#1c5a5a'], overgrown: .16,
    wall: { mortar: '#1a262c', brick: ['#2a3c44', '#31464e'], hi: '#3f5a61', cap: ['#5a7d80', '#3f5a61'], base: '#101a1f', vines: ['#1c5a5a', '#2f8f83'] }, top: ['#0c1418', '#101a1f'], edge: '#2a3c44',
    liquid: ['#1c5a5a', '#2f8f83', '#5fd1b5'] });
  A.theme('ossuary', { name: 'The Ossuary', mortar: '#1c1814', stone: ['#2e2820', '#352e25'], hi: '#40382c', speck: ['#241f19', '#6e6650'], crack: '#0d0b14', growth: ['#a39878', '#6e6650'],
    wall: { mortar: '#2e2820', brick: ['#8f8569', '#a39878'], hi: '#d9cfb4', cap: ['#d9cfb4', '#a39878'], base: '#1c1814', skulls: true }, top: ['#14110d', '#1c1814'], edge: '#40382c' });
  A.theme('foundry', { name: 'The Foundry', mortar: '#140d0d', stone: ['#2a1f1f', '#302424'], hi: '#3b2b2b', speck: ['#1c1414', '#7a1626'], crack: '#b3391f', growth: ['#b3391f', '#7a1626'], cracked: .13,
    wall: { mortar: '#1f1515', brick: ['#3a2a2a', '#453030'], hi: '#5a3d3a', cap: ['#7d5a50', '#5a3d3a'], base: '#140d0d' }, top: ['#0f0909', '#140d0d'], edge: '#3a2a2a',
    liquid: ['#b3391f', '#e8822e', '#f7c04a'] });
  A.theme('overgrowth', { name: 'The Overgrowth', mortar: '#141a12', stone: ['#232b20', '#283324'], hi: '#30402b', speck: ['#1a2118', '#4d7a3a'], crack: '#0d0b14', growth: ['#86b552', '#4d7a3a'], overgrown: .45,
    wall: { mortar: '#1f281c', brick: ['#33402e', '#3a4a33'], hi: '#4d6340', cap: ['#6f8a55', '#4d6340'], base: '#141a12', vines: ['#4d7a3a', '#86b552'] }, top: ['#0d120b', '#141a12'], edge: '#33402e' });

  // cast entries are [sprite id] or [sprite id, variant label]
  A.scenes.push({ theme: 'gaol', built: true, blurb: 'The dungeon in the slice. Cold stone, torchlight, the keys.',
    boss: 'turnkey', cast: [['forgotten'], ['shade'], ['gaoler'], ['rat']], props: [['cage'], ['barrel'], ['banner']] });
  A.scenes.push({ theme: 'cistern', blurb: 'Flooded vaults under the gaol. Wet stone, standing water, verdigris on everything.',
    boss: 'abbot', cast: [['drowned'], ['ooze', 'Cistern ooze'], ['wraith', 'Drowned wraith'], ['shade', 'Marsh light']], props: [['barrel'], ['crate'], ['banner', 'Verdigris']] });
  A.scenes.push({ theme: 'ossuary', blurb: 'Where the forgotten are stacked. Walls of bone, candles, things that watch.',
    boss: 'saint', cast: [['bone_archer'], ['wraith'], ['watcher'], ['acolyte']], props: [['sarcophagus'], ['altar'], ['cobweb']] });
  A.scenes.push({ theme: 'foundry', blurb: 'The forge that made the chains. Dark iron, slag, floors cracked with heat.',
    boss: 'warden', cast: [['imp'], ['ooze', 'Slag'], ['warder'], ['hound', 'Ash hound']], props: [['brazier'], ['crate'], ['portcullis']] });
  A.scenes.push({ theme: 'overgrowth', blurb: 'A wing the roots took back. Moss on every stone, and something large under the caps.',
    boss: 'redcap', cast: [['mould'], ['spider'], ['bat'], ['mimic'], ['mould', 'Rotcap']], props: [['pillar'], ['chest'], ['cobweb']] });
})(typeof module !== 'undefined' && module.exports ? require('./bank.js') : OUB_ART);
