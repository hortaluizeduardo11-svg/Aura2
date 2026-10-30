/* AURA: Genesis — core.js
 * Shared namespace (window.AG), constants, RNG, value noise and the static data
 * tables every other module reads: species, buildings, culture tree, genes,
 * traits, skills, goals, religion vocabulary and the starter disease library. */
'use strict';
(function () {
  const AG = (window.AG = window.AG || {});

  // ------------------------------------------------------------ world & time
  AG.W = 384; AG.H = 256; AG.N = AG.W * AG.H;
  AG.CHUNK = 16; AG.CW = AG.W / 16; AG.CH = AG.H / 16; AG.NC = AG.CW * AG.CH;
  AG.TPS = 20;                        // simulation ticks per second at 1x
  AG.SEASON_TICKS = 240;
  AG.YEAR_TICKS = AG.SEASON_TICKS * 4;  // a year passes in ~48 s at 1x
  AG.DAY_TICKS = 480;                   // one day/night cycle (~24 s at 1x), decoupled from the calendar
  AG.SEA = 0.4; AG.HILL = 0.6; AG.MOUNTAIN = 0.7; AG.PEAK = 0.82;
  AG.tick = 0;

  AG.FT = { NONE: 0, WATER: 1, LAVA: 2, ACID: 3 };                 // surface fluids
  AG.GT = { NONE: 0, STEAM: 1, SMOKE: 2, MIASMA: 3 };               // gases
  AG.SO = { DIRT: 0, SAND: 1, ROCK: 2, BASALT: 3, ASH: 4, BLIGHT: 5, HOLY: 6, ROAD: 7, FARM: 8 };
  AG.UG = { ROCK: 0, DIRT: 1, CAVE: 2, TUNNEL: 3, IRON: 4, GOLD: 5, CRYSTAL: 6, FUNGUS: 7, BEDROCK: 8 };
  AG.UF = { NONE: 0, WATER: 1, MAGMA: 2 };                         // underground fluids

  // unit state machine
  AG.ST = { IDLE: 0, MOVE: 1, WORK: 2, FIGHT: 3 };
  AG.TK = {
    NONE: 0, WANDER: 1, GATHER: 2, WOOD: 3, FARM: 4, QUARRY: 5, MINE: 6, DIG: 7, ASCEND: 8,
    DEPOSIT: 9, BUILD: 10, PATROL: 11, WORSHIP: 12, SETTLE: 13, TRADE: 14, FLEE: 15, MARCH: 16,
    HUNT: 17, GRAZE: 18, SIEGE: 19, RAID: 20, ATTACKB: 21,
  };
  AG.TASKS = ['Idle', 'Wandering', 'Gathering', 'Felling trees', 'Farming', 'Quarrying', 'Heading to the mine',
    'Digging', 'Climbing out', 'Hauling goods', 'Building', 'Patrolling', 'Worshipping', 'Settling new land',
    'Trading', 'Fleeing', 'Marching to war', 'Hunting', 'Grazing', 'Bombarding', 'Raiding', 'Breaching walls'];
  AG.FL = { BLESSED: 1, CURSED: 2, POSSESSED: 4, KING: 8, HERO: 16, SETTLER: 32, FLANKL: 64, FLANKR: 128, FLEE: 256, MAD: 512 };
  AG.J = { CHILD: 0, GATHER: 1, FARM: 2, WOOD: 3, MINE: 4, BUILD: 5, SOLDIER: 6, PRIEST: 7, ELDER: 8 };
  AG.JOBS = ['Child', 'Gatherer', 'Farmer', 'Woodcutter', 'Miner', 'Builder', 'Soldier', 'Priest', 'Elder'];
  AG.CARRY = ['', 'food', 'wood', 'stone', 'ore', 'gold', 'crystal'];

  // ------------------------------------------------------------ RNG
  // Fast xorshift for the simulation; mulberry32 for reproducible world gen.
  let rs = 0x9e3779b9;
  AG.seedRnd = (s) => { rs = (s >>> 0) || 0x9e3779b9; };
  AG.rnd = function () { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  AG.ri = (n) => (AG.rnd() * n) | 0;
  AG.pick = (a) => a[(AG.rnd() * a.length) | 0];
  AG.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 2D value noise with smoothstep interpolation + fractal sum.
  AG.makeNoise = function (seed) {
    const r = AG.mulberry32(seed);
    const p = new Uint16Array(512), v = new Float32Array(256), perm = [];
    for (let i = 0; i < 256; i++) perm.push(i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    for (let i = 0; i < 256; i++) v[i] = r();
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = yi & 255, y1 = (yi + 1) & 255;
      const a = v[p[p[x0] + y0]], b = v[p[p[x1] + y0]], c = v[p[p[x0] + y1]], d = v[p[p[x1] + y1]];
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    }
    noise.fbm = function (x, y, oct, lac, gain) {
      lac = lac || 2; gain = gain || 0.5;
      let s = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= gain; f *= lac; }
      return s / norm;
    };
    return noise;
  };

  // ------------------------------------------------------------ math & colour
  AG.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  AG.lerp = (a, b, t) => a + (b - a) * t;
  AG.smooth = (e0, e1, x) => { const t = AG.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  AG.dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  AG.pack = (r, g, b, a) => (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  AG.mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  AG.css = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  AG.hsl = function (h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  };

  // ------------------------------------------------------------ species
  AG.SP = { KIN: 0, SYLVAN: 1, STONE: 2, ASHEN: 3, DEER: 4, WOLF: 5, CRAWLER: 6, HOLLOW: 7, WYRM: 8, HERALD: 9, CART: 10, SHIP: 11, CATAPULT: 12, BIRD: 13, AIRSHIP: 14 };
  AG.CIV_MASK = 0b1111; // species 0-3 build civilisations
  AG.SPECIES = [
    { key: 'kin', name: 'Kin', kind: 'civ', hp: 30, dmg: 5, spd: 0.075, life: [52, 74], adult: 14,
      skin: [226, 178, 136], hair: [96, 62, 40], genes: [130, 130, 135, 140, 125, 128, 128, 125, 120],
      bias: { agrarian: 1.25, martial: 1, mercantile: 1.35, mystic: 0.9 }, home: 'temperate', fireRes: 0, coldRes: 0.1,
      syl: ['al', 'bran', 'cor', 'dun', 'el', 'fen', 'gar', 'hal', 'is', 'jor', 'ka', 'lin', 'mar', 'nor', 'os', 'per', 'ric', 'sel', 'tor', 'ul', 'ven', 'wyn', 'ad', 'bel'],
      end: ['an', 'en', 'ric', 'a', 'is', 'or', 'wyn', 'ard', 'ia', 'el', 'o'],
      place: ['ford', 'ton', 'bury', 'wick', 'hold', 'mere', 'vale', 'gate', 'stead'] },
    { key: 'sylvan', name: 'Sylvan', kind: 'civ', hp: 24, dmg: 4, spd: 0.085, life: [70, 110], adult: 18,
      skin: [204, 222, 178], hair: [70, 140, 80], genes: [110, 160, 165, 110, 170, 115, 128, 140, 155],
      bias: { agrarian: 1.3, martial: 0.7, mercantile: 0.9, mystic: 1.6 }, home: 'forest', fireRes: -0.2, coldRes: 0.2,
      syl: ['ae', 'lith', 'syl', 'wen', 'thal', 'ili', 'ora', 'fae', 'lun', 'myr', 'eth', 'iel', 'vae', 'rin', 'sha', 'qui', 'nae', 'lor'],
      end: ['iel', 'wen', 'ith', 'ara', 'ae', 'is', 'on', 'eth'],
      place: ['glade', 'wood', 'bough', 'leaf', 'shade', 'grove', 'thorn'] },
    { key: 'stone', name: 'Stoneborn', kind: 'civ', hp: 40, dmg: 6, spd: 0.062, life: [90, 140], adult: 20,
      skin: [186, 146, 122], hair: [160, 84, 40], genes: [175, 95, 125, 105, 160, 90, 128, 170, 110],
      bias: { agrarian: 0.8, martial: 1.4, mercantile: 1.1, mystic: 0.8 }, home: 'mountain', fireRes: 0.2, coldRes: 0.5, mineBonus: 1.8,
      syl: ['dur', 'gor', 'krag', 'mok', 'thrum', 'bal', 'dor', 'grim', 'hak', 'kor', 'rok', 'zun', 'bor', 'dag', 'brun'],
      end: ['in', 'ak', 'um', 'or', 'rik', 'da', 'ur'],
      place: ['delve', 'forge', 'deep', 'hall', 'peak', 'anvil', 'hearth'] },
    { key: 'ashen', name: 'Ashen', kind: 'civ', hp: 30, dmg: 6, spd: 0.078, life: [45, 66], adult: 12,
      skin: [104, 80, 92], hair: [240, 120, 40], genes: [150, 140, 120, 160, 100, 128, 128, 130, 140],
      bias: { agrarian: 0.8, martial: 1.4, mercantile: 1, mystic: 1.25 }, home: 'hot', fireRes: 0.85, coldRes: -0.3,
      syl: ['ash', 'ka', 'zar', 'vex', 'ith', 'sul', 'rax', 'khe', 'mor', 'nyx', 'tez', 'ur', 'vak', 'zol'],
      end: ['ar', 'ex', 'is', 'ul', 'a', 'oth', 'ix'],
      place: ['spire', 'cinder', 'scorch', 'pyre', 'dune', 'ember'] },
    { key: 'deer', name: 'Deer', kind: 'animal', diet: 'graze', hp: 14, dmg: 1, spd: 0.09, life: [8, 14], adult: 1, fur: [176, 122, 72], cap: 4000 },
    { key: 'wolf', name: 'Wolf', kind: 'animal', diet: 'hunt', hp: 24, dmg: 5, spd: 0.104, life: [8, 13], adult: 1, fur: [128, 128, 138], cap: 900 },
    { key: 'crawler', name: 'Crawler', kind: 'monster', layer: 0, hp: 28, dmg: 6, spd: 0.07, life: [20, 35], adult: 2, fur: [92, 60, 120], cap: 600 },
    { key: 'hollow', name: 'Hollow', kind: 'monster', hp: 26, dmg: 5, spd: 0.065, life: [10, 16], adult: 0, fur: [150, 186, 150] },
    { key: 'wyrm', name: 'Wyrm', kind: 'monster', flying: 1, hp: 800, dmg: 24, spd: 0.2, life: [400, 600], adult: 0, fur: [190, 44, 44], fireRes: 1 },
    { key: 'herald', name: 'Herald', kind: 'avatar', hp: 500, dmg: 35, spd: 0.14, life: [1e9, 1e9], adult: 0, fur: [255, 230, 140], fireRes: 0.9 },
    { key: 'cart', name: 'Trade cart', kind: 'vehicle', hp: 30, dmg: 0, spd: 0.07, life: [1e9, 1e9], adult: 0 },
    { key: 'ship', name: 'Trade ship', kind: 'vehicle', naval: 1, hp: 60, dmg: 0, spd: 0.11, life: [1e9, 1e9], adult: 0 },
    { key: 'catapult', name: 'Catapult', kind: 'vehicle', hp: 90, dmg: 40, spd: 0.04, life: [1e9, 1e9], adult: 0 },
    { key: 'bird', name: 'Bird', kind: 'ambient', flying: 1, hp: 2, dmg: 0, spd: 0.22, life: [5, 9], adult: 0, fur: [40, 40, 48], cap: 700 },
    { key: 'airship', name: 'Skyship', kind: 'vehicle', flying: 1, hp: 60, dmg: 0, spd: 0.13, life: [1e9, 1e9], adult: 0 },
  ];

  // ------------------------------------------------------------ genetics
  AG.GENES = ['Strength', 'Agility', 'Intellect', 'Fertility', 'Longevity', 'Stature', 'Hue', 'Resilience', 'Devotion'];
  AG.NG = AG.GENES.length;
  AG.G = { STR: 0, AGI: 1, INT: 2, FERT: 3, LONG: 4, STAT: 5, HUE: 6, RES: 7, DEV: 8 };
  // heritable: chance a child copies the trait from a parent that has it.
  // gene: [geneIndex, threshold] -> expressed automatically above threshold (below if `low`).
  AG.TRAITS = [
    { key: 'brave', name: 'Brave', heritable: 0.3, opp: 'coward', desc: 'Stands and fights; +10% damage' },
    { key: 'coward', name: 'Coward', heritable: 0.3, opp: 'brave', desc: 'Flees from danger' },
    { key: 'kind', name: 'Kind', heritable: 0.3, opp: 'cruel', desc: 'Rulers seek peace' },
    { key: 'cruel', name: 'Cruel', heritable: 0.3, opp: 'kind', desc: 'Rulers seek war' },
    { key: 'greedy', name: 'Greedy', heritable: 0.25, desc: 'Hoards wealth' },
    { key: 'pious', name: 'Pious', heritable: 0.35, desc: 'Drawn to the temples' },
    { key: 'curious', name: 'Curious', heritable: 0.25, desc: 'Wanders far' },
    { key: 'ambitious', name: 'Ambitious', heritable: 0.25, desc: 'May seize a throne' },
    { key: 'genius', name: 'Genius', gene: [2, 205], desc: 'Learns skills twice as fast' },
    { key: 'giant', name: 'Giant', gene: [5, 215], desc: 'Huge and strong, a little slow' },
    { key: 'swift', name: 'Swift', gene: [1, 212], desc: '+20% speed' },
    { key: 'sickly', name: 'Sickly', gene: [7, 45], low: true, desc: 'Falls ill easily' },
    { key: 'fertile', name: 'Fertile', gene: [3, 215], desc: 'Many children' },
    { key: 'longlived', name: 'Long-lived', gene: [4, 222], desc: 'Lives a quarter longer' },
    { key: 'blessed', name: 'Blessed', heritable: 0.2, desc: 'Touched by the divine' },
    { key: 'cursed', name: 'Cursed', heritable: 0.15, desc: 'Marked by divine wrath' },
    { key: 'veteran', name: 'Veteran', desc: 'Survived many battles' },
    { key: 'hero', name: 'Hero', desc: 'A legend of the realm' },
    { key: 'fireborn', name: 'Fire-touched', heritable: 0.1, desc: 'Survived the flames' },
  ];
  AG.TR = {}; AG.TRAITS.forEach((t, i) => { AG.TR[t.key] = 1 << i; t.bit = 1 << i; });
  AG.SKILLS = ['Combat', 'Farming', 'Crafting', 'Mining', 'Faith', 'Trade'];
  AG.SK = { COMBAT: 0, FARMING: 1, CRAFTING: 2, MINING: 3, FAITH: 4, TRADE: 5 };
  AG.NS = AG.SKILLS.length;
  AG.GOALS = ['Raise a family', 'Amass wealth', 'Win glory in battle', 'See the world', 'Serve the gods', 'Rule a realm', 'Master a craft'];

  // ------------------------------------------------------------ buildings
  AG.BT = { KEEP: 0, HOUSE: 1, FARM: 2, WINDMILL: 3, TEMPLE: 4, MARKET: 5, MINE: 6, TOWER: 7, WALL: 8, DOCK: 9, WORKSHOP: 10 };
  AG.BUILD = [
    { key: 'keep', name: 'Keep', w: 4, h: 4, hp: 500, wood: 20, stone: 20 },
    { key: 'house', name: 'House', w: 2, h: 2, hp: 90, wood: 8, stone: 0 },
    { key: 'farm', name: 'Farm', w: 3, h: 3, hp: 40, wood: 4, stone: 0 },
    { key: 'windmill', name: 'Windmill', w: 2, h: 2, hp: 100, wood: 14, stone: 4, req: ['agrarian', 2] },
    { key: 'temple', name: 'Temple', w: 3, h: 3, hp: 220, wood: 8, stone: 16, req: ['mystic', 1] },
    { key: 'market', name: 'Market', w: 3, h: 3, hp: 120, wood: 16, stone: 0, req: ['mercantile', 1] },
    { key: 'mine', name: 'Mine', w: 2, h: 2, hp: 120, wood: 10, stone: 0 },
    { key: 'tower', name: 'Tower', w: 2, h: 2, hp: 300, wood: 4, stone: 20, req: ['martial', 2] },
    { key: 'wall', name: 'Wall', w: 1, h: 1, hp: 240, wood: 0, stone: 2, req: ['martial', 2] },
    { key: 'dock', name: 'Dock', w: 2, h: 2, hp: 100, wood: 16, stone: 0, req: ['mercantile', 2] },
    { key: 'workshop', name: 'Siege Workshop', w: 3, h: 3, hp: 160, wood: 20, stone: 8, req: ['martial', 3] },
  ];

  // ------------------------------------------------------------ culture tree
  AG.BRANCHES = ['agrarian', 'martial', 'mercantile', 'mystic'];
  AG.CULTURE = {
    agrarian: { name: 'Agrarian', color: '#9ccc65', nodes: [
      { name: 'Crop Rotation', desc: 'Farms yield +40%' },
      { name: 'Windmills', desc: 'Windmills boost nearby farms' },
      { name: 'Irrigation', desc: 'Farms near water yield +60%' },
      { name: 'Granaries', desc: 'More births, famine resistance' } ] },
    martial: { name: 'Martial', color: '#ef5350', nodes: [
      { name: 'Drilled Ranks', desc: 'Armies split and flank' },
      { name: 'Fortification', desc: 'Stone walls and arrow towers' },
      { name: 'Siegecraft', desc: 'Workshops roll out catapults' },
      { name: 'Tempered Steel', desc: '+30% damage, +20% armour' } ] },
    mercantile: { name: 'Mercantile', color: '#ffca28', nodes: [
      { name: 'Markets', desc: 'Trade carts link cities' },
      { name: 'Seafaring', desc: 'Docks and trade ships' },
      { name: 'Coinage', desc: 'Trade yields double gold' },
      { name: 'Skyships', desc: 'Trade flies over everything' } ] },
    mystic: { name: 'Mystic', color: '#ba68c8', nodes: [
      { name: 'Shrines', desc: 'Temples; a faith is born' },
      { name: 'Pantheon', desc: 'The faith spreads to neighbours' },
      { name: 'Miracles', desc: 'Priests cure the sick' },
      { name: 'Ascension', desc: 'Saints arise; blessings doubled' } ] },
  };
  AG.CULTURE_COST = [60, 160, 320, 560];

  // ------------------------------------------------------------ religion vocabulary
  AG.DOMAINS = ['fire', 'water', 'storm', 'earth', 'plague', 'harvest', 'war', 'watcher', 'death', 'sun'];
  AG.EPITHETS = {
    fire: ['the Burning Hand', 'Who Walks in Embers', 'the Molten Crown'],
    water: ['of the Rising Tide', 'the Drowned Mother', 'Rain-Bringer'],
    storm: ['the Thunder-Voice', 'Lord of Gales', 'Who Hurls the Spear of Light'],
    earth: ['the Mountain Heart', 'Who Shakes the Deep', 'the Stone Throne'],
    plague: ['the Pale Whisper', 'Keeper of the Rot', 'the Withering'],
    harvest: ['the Golden Sheaf', 'Mother of Fields', 'the Green Hand'],
    war: ['the Red Banner', 'Breaker of Shields', 'the Iron Wolf'],
    watcher: ['the Unseen Hand', 'Who Watches from Above', 'the Great Gardener'],
    death: ['Shepherd of Souls', 'the Quiet Door', 'Lantern of the Dead'],
    sun: ['the Bright Sun', 'Lord of Dawn', 'the Gilded Eye'],
  };
  AG.TENETS = {
    fire: 'zealous', war: 'zealous', water: 'pacifist', harvest: 'pacifist', plague: 'ascetic', death: 'ascetic',
    watcher: 'devout', storm: 'stoic', earth: 'stoic', sun: 'devout',
  };
  AG.TENET_DESC = {
    zealous: 'Zealous — despises other faiths, quick to holy war',
    pacifist: 'Pacifist — slow to anger, generous to neighbours',
    ascetic: 'Ascetic — endures plague and hunger',
    devout: 'Devout — divine blessings are stronger',
    stoic: 'Stoic — unshaken by disaster',
  };

  // ------------------------------------------------------------ diseases (editable)
  // Times are in days, lethality = share of max HP lost per symptomatic day.
  AG.DISEASES = [
    { name: 'Grey Rot', color: '#a1a1a1', contagion: 0.1, radius: 1.5, lethality: 0.22, incubation: 1, duration: 3, slow: 0.2, sterile: 0, madness: 0, hollow: 0, targets: 0b1111, builtin: 1 },
    { name: 'Ember Fever', color: '#ff7043', contagion: 0.16, radius: 2, lethality: 0.5, incubation: 0.5, duration: 2, slow: 0.3, sterile: 0, madness: 0, hollow: 0, targets: 0b1111, builtin: 1 },
    { name: 'The Hollowing', color: '#8bc34a', contagion: 0.12, radius: 1.5, lethality: 0.6, incubation: 1, duration: 3, slow: 0.1, sterile: 0, madness: 0, hollow: 1, targets: 0b1111, builtin: 1 },
    { name: 'Moon Madness', color: '#7e57c2', contagion: 0.08, radius: 1.5, lethality: 0.08, incubation: 1, duration: 4, slow: 0, sterile: 0, madness: 1, hollow: 0, targets: 0b1111, builtin: 1 },
  ];
  AG.MAX_DISEASES = 16;

  // ------------------------------------------------------------ names
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  AG.Names = {
    cap,
    person(sp) {
      const d = AG.SPECIES[sp]; if (!d.syl) return d.name;
      let s = AG.pick(d.syl); if (AG.rnd() < 0.55) s += AG.pick(d.syl);
      return cap(s + AG.pick(d.end));
    },
    place(sp) {
      const d = AG.SPECIES[sp] && AG.SPECIES[sp].syl ? AG.SPECIES[sp] : AG.SPECIES[0];
      return cap(AG.pick(d.syl) + (AG.rnd() < 0.35 ? AG.pick(d.syl) : '') + AG.pick(d.place));
    },
    kingdom(sp, base) {
      const forms = {
        0: ['Kingdom of #', '# Dominion', 'Free Cities of #', 'Grand Duchy of #', 'Crown of #'],
        1: ['Grove of #', '# Concord', 'Circle of #', 'Wildrealm of #'],
        2: ['Hold of #', '# Under-Throne', 'Clans of #', 'Deepkingdom of #'],
        3: ['# Ascendancy', 'Pyre-Throne of #', 'Cinder Empire of #', 'Sultanate of #'],
      }[sp] || ['Realm of #'];
      return AG.pick(forms).replace('#', base);
    },
    deity() {
      const a = ['va', 'zor', 'el', 'ith', 'mor', 'sa', 'ka', 'thu', 'ny', 'ra', 'os', 'bel', 'qa', 'ul', 'ir', 'au', 'ze'];
      const b = ['ru', 'lo', 'ma', 'ne', 'ta', 'ri', 'ka', 'sha', 'en', 'vi', ''];
      const c = ['th', 'n', 's', 'ra', 'ka', 'os', 'iel', 'ar', 'ix', 'a', 'um'];
      return cap(AG.pick(a) + AG.pick(b) + AG.pick(c));
    },
    disease() {
      return AG.pick(['Crimson', 'Weeping', 'Ashen', 'Silent', 'Gutter', 'Black', 'Pale', 'Laughing', 'Iron', 'Hungry']) + ' ' +
        AG.pick(['Pox', 'Blight', 'Fever', 'Cough', 'Rot', 'Plague', 'Sleep', 'Shakes']);
    },
  };

  // ------------------------------------------------------------ chronicle
  AG.Chronicle = {
    list: [], dirty: true,
    add(text, kind, x, y) {
      this.list.push({ t: AG.tick, text, kind: kind || 'info', x: x === undefined ? -1 : x, y: y === undefined ? -1 : y });
      if (this.list.length > 400) this.list.shift();
      this.dirty = true;
      if (AG.UI && AG.UI.onChronicle) AG.UI.onChronicle(this.list[this.list.length - 1]);
    },
    reset() { this.list.length = 0; this.dirty = true; },
  };
})();
