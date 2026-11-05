/* AURA: Genesis 2 — core.js
 * Shared namespace (window.AG), constants, RNG, value noise and the static data
 * tables every other module reads: species, buildings, culture tree, genes,
 * traits, skills, goals, religion vocabulary and the starter disease library. */
'use strict';
(function () {
  const AG = (window.AG = window.AG || {});

  // ------------------------------------------------------------ world & time
  // The world takes the shape of the screen: pick the largest integer zoom at which a world of
  // ~140k-280k cells exactly covers the viewport, so the map always fills it edge to edge.
  (function sizeWorld() {
    const cfg = window.AG_CONFIG || {};
    if (cfg.W && cfg.H) { AG.W = cfg.W; AG.H = cfg.H; AG.BASE_ZOOM = cfg.zoom || 3; return; } // tests pick a size
    const vw = Math.max(360, window.innerWidth || 1280), vh = Math.max(360, window.innerHeight || 800);
    let best = null, bestErr = Infinity;
    for (const z of [5, 4, 3, 2]) {
      const w = Math.min(1024, Math.ceil(vw / z / 16) * 16), h = Math.min(1024, Math.ceil(vh / z / 16) * 16), n = w * h;
      const err = n < 140000 ? 140000 - n : n > 280000 ? n - 280000 : 0;
      if (err < bestErr) { bestErr = err; best = { z, w, h }; }
      if (!err) break;
    }
    AG.W = best.w; AG.H = best.h; AG.BASE_ZOOM = best.z;
  })();
  AG.N = AG.W * AG.H;
  AG.SCALE = AG.N / 98304; // relative to the original 384x256 world, for populations and feature counts
  AG.CHUNK = 16; AG.CW = AG.W / 16; AG.CH = AG.H / 16; AG.NC = AG.CW * AG.CH;
  AG.TPS = 20;                        // simulation ticks per second at 1x
  AG.SEASON_TICKS = 240;
  AG.YEAR_TICKS = AG.SEASON_TICKS * 4;  // a year passes in ~48 s at 1x
  AG.DAY_TICKS = 480;                   // one day/night cycle (~24 s at 1x), decoupled from the calendar
  AG.SEA = 0.4; AG.HILL = 0.6; AG.MOUNTAIN = 0.7; AG.PEAK = 0.82;
  AG.tick = 0;
  AG.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()); // timing stats only, never sim state

  AG.FT = { NONE: 0, WATER: 1, LAVA: 2, ACID: 3 };                 // surface fluids
  AG.GT = { NONE: 0, STEAM: 1, SMOKE: 2, MIASMA: 3 };               // gases
  AG.SO = { DIRT: 0, SAND: 1, ROCK: 2, BASALT: 3, ASH: 4, BLIGHT: 5, HOLY: 6, ROAD: 7, FARM: 8 };
  AG.UG = { ROCK: 0, DIRT: 1, CAVE: 2, TUNNEL: 3, IRON: 4, GOLD: 5, CRYSTAL: 6, FUNGUS: 7, BEDROCK: 8, COPPER: 9, TIN: 10, COAL: 11, SALT: 12 };
  // Genesis 2: bedrock classes and surface resources come from the geological history of each place
  AG.ROCK = { GRANITE: 0, BASALT: 1, SEDIMENT: 2, META: 3, VOLCANIC: 4, ALLUVIUM: 5 };
  AG.ROCKS = ['Granite', 'Basalt', 'Sedimentary', 'Metamorphic', 'Volcanic', 'Alluvium'];
  AG.RES = { NONE: 0, FLINT: 1, CLAY: 2, COPPER: 3, TIN: 4, IRON: 5, SALT: 6, OBSIDIAN: 7, COAL: 8, GOLD: 9 };
  AG.RESOURCES = ['', 'Flint', 'Clay', 'Copper', 'Tin', 'Iron', 'Salt', 'Obsidian', 'Coal', 'Gold'];
  AG.RES_COLORS = ['', '#d8d2c0', '#c07850', '#3fb08a', '#b8c0c8', '#a0583a', '#f4f4f0', '#3a3550', '#2a2a2a', '#ffd34d'];
  AG.UF = { NONE: 0, WATER: 1, MAGMA: 2 };                         // underground fluids

  // unit state machine
  AG.ST = { IDLE: 0, MOVE: 1, WORK: 2, FIGHT: 3 };
  AG.TK = {
    NONE: 0, WANDER: 1, GATHER: 2, WOOD: 3, FARM: 4, QUARRY: 5, MINE: 6, DIG: 7, ASCEND: 8,
    DEPOSIT: 9, BUILD: 10, PATROL: 11, WORSHIP: 12, SETTLE: 13, TRADE: 14, FLEE: 15, MARCH: 16,
    HUNT: 17, GRAZE: 18, SIEGE: 19, RAID: 20, ATTACKB: 21, FISH: 22, HERD: 23, CRAFT: 24, EAT: 25,
    REST: 26, SOCIAL: 27, MIGRATE: 28, TEND: 29, MOURN: 30, EXPLORE: 31, COURT: 32, PLAY: 33,
  };
  AG.TASKS = ['Idle', 'Wandering', 'Gathering', 'Felling trees', 'Farming', 'Quarrying', 'Heading to the mine',
    'Digging', 'Climbing out', 'Bringing food home', 'Building', 'Keeping watch', 'Worshipping', 'Settling new land',
    'Trading', 'Fleeing', 'Marching to war', 'Hunting', 'Grazing', 'Bombarding', 'Raiding', 'Breaching walls',
    'Fishing', 'Tending the herd', 'Crafting', 'Eating', 'Resting', 'Talking with friends', 'Moving camp', 'Caring for a child',
    'Mourning', 'Exploring', 'Courting', 'Playing'];
  AG.FL = { BLESSED: 1, CURSED: 2, POSSESSED: 4, KING: 8, HERO: 16, SETTLER: 32, FLANKL: 64, FLANKR: 128, FLEE: 256, MAD: 512, FOLLOW: 1024, DOMESTIC: 2048 };
  AG.J = { CHILD: 0, GATHER: 1, FARM: 2, WOOD: 3, MINE: 4, BUILD: 5, SOLDIER: 6, PRIEST: 7, ELDER: 8, HUNT: 9, FISH: 10, HERD: 11, CRAFT: 12, TRADE: 13 };
  AG.JOBS = ['Child', 'Forager', 'Farmer', 'Woodcutter', 'Miner', 'Builder', 'Warrior', 'Shaman', 'Elder', 'Hunter', 'Fisher', 'Herder', 'Crafter', 'Trader'];
  AG.CARRY = ['', 'food', 'wood', 'stone', 'ore', 'gold', 'goods'];

  // ------------------------------------------------------------ RNG
  // Fast xorshift for the simulation; mulberry32 for reproducible world gen.
  let rs = 0x9e3779b9;
  AG.seedRnd = (s) => { rs = (s >>> 0) || 0x9e3779b9; };
  AG.rnd = function () { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  AG.rndState = () => rs >>> 0;
  AG.setRndState = (v) => { rs = v >>> 0 || 0x9e3779b9; };
  // A seeded stream whose state can be saved and restored (geology and evolution each own one).
  AG.makeRng = function (seed) {
    let a = seed | 0;
    const f = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.get = () => a; f.set = (v) => { a = v | 0; };
    return f;
  };
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

  // ------------------------------------------------------------ bodies
  // Kinds of body the world can hold. Animals are evolved species (life.js): the body kind only
  // picks behaviour and drawing; size, colour and abilities come from each creature's genome.
  // Indices match v1 so the renderers' sprite slots stay valid.
  AG.SP = { PERSON: 0, KIN: 0, GRAZER: 4, DEER: 4, PREDATOR: 5, WOLF: 5, CART: 10, SHIP: 11, CATAPULT: 12, BIRD: 13, APE: 15 };
  AG.CIV_MASK = 0b1;
  const none = { key: 'none', name: '-', kind: 'none', hp: 1, dmg: 0, spd: 0, life: [1, 1], adult: 0 };
  AG.SPECIES = [
    { key: 'person', name: 'Person', kind: 'civ', hp: 30, dmg: 4, spd: 0.075, life: [55, 80], adult: 15, skin: [196, 150, 110], hair: [60, 40, 28] },
    none, none, none,
    { key: 'grazer', name: 'Grazer', kind: 'animal', diet: 'graze', hp: 16, dmg: 2, spd: 0.09, life: [8, 16], adult: 1.5, fur: [176, 122, 72] },
    { key: 'predator', name: 'Predator', kind: 'animal', diet: 'hunt', hp: 24, dmg: 5, spd: 0.1, life: [8, 14], adult: 1.5, fur: [128, 128, 138] },
    none, none, none, none,
    { key: 'cart', name: 'Ox cart', kind: 'vehicle', hp: 30, dmg: 0, spd: 0.07, life: [1e9, 1e9], adult: 0 },
    { key: 'ship', name: 'Boat', kind: 'vehicle', naval: 1, hp: 60, dmg: 0, spd: 0.11, life: [1e9, 1e9], adult: 0 },
    { key: 'catapult', name: 'Siege engine', kind: 'vehicle', hp: 90, dmg: 40, spd: 0.04, life: [1e9, 1e9], adult: 0 },
    { key: 'bird', name: 'Bird', kind: 'ambient', flying: 1, hp: 2, dmg: 0, spd: 0.22, life: [4, 9], adult: 0.5, fur: [40, 40, 48] },
    none,
    { key: 'ape', name: 'Ape', kind: 'animal', diet: 'forage', hp: 26, dmg: 4, spd: 0.07, life: [25, 40], adult: 8, fur: [116, 82, 58] },
  ];

  // A small per-body cache of expressed genes, read by the renderers (derived from the genome).
  AG.GENES = ['Strength', 'Agility', 'Intellect', 'Fertility', 'Longevity', 'Stature', 'Hue', 'Resilience', 'Devotion'];
  AG.NG = AG.GENES.length;
  AG.G = { STR: 0, AGI: 1, INT: 2, FERT: 3, LONG: 4, STAT: 5, HUE: 6, RES: 7, DEV: 8 };

  // ------------------------------------------------------------ minds
  AG.TRAITS = [
    { key: 'brave', name: 'Brave', opp: 'coward', desc: 'Stands and fights' },
    { key: 'coward', name: 'Timid', opp: 'brave', desc: 'Avoids danger' },
    { key: 'kind', name: 'Kind', opp: 'cruel', desc: 'Helps others; rulers seek peace' },
    { key: 'cruel', name: 'Cruel', opp: 'kind', desc: 'Harms others; rulers seek war' },
    { key: 'greedy', name: 'Greedy', desc: 'Hoards and envies' },
    { key: 'pious', name: 'Pious', desc: 'Drawn to the sacred' },
    { key: 'curious', name: 'Curious', desc: 'Explores and invents' },
    { key: 'ambitious', name: 'Ambitious', desc: 'Seeks rank and power' },
    { key: 'genius', name: 'Brilliant', desc: 'Learns and invents twice as fast' },
    { key: 'giant', name: 'Towering', desc: 'Huge and strong' },
    { key: 'swift', name: 'Swift', desc: 'Fast on foot' },
    { key: 'sickly', name: 'Sickly', desc: 'Falls ill easily' },
    { key: 'fertile', name: 'Fertile', desc: 'Many children' },
    { key: 'longlived', name: 'Long-lived', desc: 'Ages slowly' },
    { key: 'blessed', name: 'Blessed', desc: 'Touched by the divine' },
    { key: 'cursed', name: 'Cursed', desc: 'Marked by divine wrath' },
    { key: 'veteran', name: 'Veteran', desc: 'Survived many fights' },
    { key: 'hero', name: 'Hero', desc: 'A legend of the people' },
    { key: 'fireborn', name: 'Fire-touched', desc: 'Survived the flames' },
    { key: 'albino', name: 'Albino', desc: 'Pale from a recessive allele' },
    { key: 'storyteller', name: 'Storyteller', desc: 'Keeps the old stories' },
    { key: 'loner', name: 'Loner', desc: 'Prefers solitude' },
  ];
  AG.TR = {}; AG.TRAITS.forEach((t, i) => { AG.TR[t.key] = 1 << i; t.bit = 1 << i; });
  AG.SKILLS = ['Hunting', 'Gathering', 'Crafting', 'Farming', 'Herding', 'Building', 'Lore', 'Fighting'];
  AG.SK = { HUNT: 0, GATHER: 1, CRAFT: 2, FARM: 3, HERD: 4, BUILD: 5, LORE: 6, FIGHT: 7, COMBAT: 7, FARMING: 3, CRAFTING: 2, MINING: 2, FAITH: 6, TRADE: 2 };
  AG.NS = AG.SKILLS.length;
  AG.GOALS = ['Raise a family', 'Become wealthy', 'Win glory', 'See the world', 'Serve the spirits', 'Lead the people', 'Master a craft', 'Discover something new'];
  // likes and dislikes are tastes over these, from -100 (hates) to 100 (loves)
  AG.TASTES = ['meat', 'fish', 'fruit', 'bread and porridge', 'honey', 'hunting', 'gathering', 'crafting', 'farming', 'herding',
    'building', 'fighting', 'worship', 'stories', 'music', 'exploring', 'trading', 'the forest', 'the water', 'the hills',
    'crowds', 'rain', 'snow', 'new things'];
  AG.NT = AG.TASTES.length;
  AG.JOB_TASTE = [-1, 6, 8, -1, 7, 10, 11, 12, -1, 5, 18, 9, 7, 16];

  // ------------------------------------------------------------ buildings
  // Types 0-10 keep v1's art slots (the keep is a citadel, slot 3 is now a granary); 11+ are the
  // homes and monuments of bands and early villages.
  AG.BT = { KEEP: 0, HOUSE: 1, FARM: 2, GRANARY: 3, WINDMILL: 3, TEMPLE: 4, MARKET: 5, MINE: 6, TOWER: 7, WALL: 8, DOCK: 9, WORKSHOP: 10,
    TENT: 11, HEARTH: 12, HUT: 13, PEN: 14, MEGALITH: 15, SHRINE: 16, HALL: 17 };
  AG.BUILD = [
    { key: 'keep', name: 'Citadel', w: 4, h: 4, hp: 500, wood: 20, stone: 30, tech: 'masonry' },
    { key: 'house', name: 'House', w: 2, h: 2, hp: 90, wood: 6, stone: 2, tech: 'mudbrick' },
    { key: 'farm', name: 'Field', w: 3, h: 3, hp: 40, wood: 0, stone: 0, tech: 'cultivation' },
    { key: 'granary', name: 'Granary', w: 2, h: 2, hp: 100, wood: 8, stone: 2, tech: 'granaries' },
    { key: 'temple', name: 'Temple', w: 3, h: 3, hp: 220, wood: 8, stone: 18, tech: 'monuments' },
    { key: 'market', name: 'Market', w: 3, h: 3, hp: 120, wood: 14, stone: 0, tech: 'currency' },
    { key: 'mine', name: 'Mine', w: 2, h: 2, hp: 120, wood: 10, stone: 0, tech: 'copper' },
    { key: 'tower', name: 'Tower', w: 2, h: 2, hp: 300, wood: 4, stone: 20, tech: 'fortification' },
    { key: 'wall', name: 'Wall', w: 1, h: 1, hp: 240, wood: 1, stone: 2, tech: 'fortification' },
    { key: 'dock', name: 'Harbour', w: 2, h: 2, hp: 100, wood: 14, stone: 0, tech: 'sailing' },
    { key: 'workshop', name: 'Workshop', w: 3, h: 3, hp: 160, wood: 14, stone: 6, tech: 'kilns' },
    { key: 'tent', name: 'Hide tent', w: 1, h: 1, hp: 20, wood: 1, stone: 0, tech: 'shelters' },
    { key: 'hearth', name: 'Hearth', w: 1, h: 1, hp: 40, wood: 0, stone: 0, tech: 'fire' },
    { key: 'hut', name: 'Round hut', w: 2, h: 2, hp: 60, wood: 5, stone: 0, tech: 'shelters' },
    { key: 'pen', name: 'Animal pen', w: 3, h: 3, hp: 50, wood: 6, stone: 0, tech: 'herding' },
    { key: 'megalith', name: 'Stone circle', w: 3, h: 3, hp: 400, wood: 0, stone: 24, tech: 'megaliths' },
    { key: 'shrine', name: 'Shrine', w: 1, h: 1, hp: 60, wood: 2, stone: 2, tech: 'burial' },
    { key: 'hall', name: 'Great hall', w: 3, h: 2, hp: 260, wood: 22, stone: 4, tech: 'shelters' },
  ];
  AG.HOMES = [AG.BT.TENT, AG.BT.HUT, AG.BT.HOUSE];

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
    { name: 'Grey Cough', color: '#a1a1a1', contagion: 0.1, radius: 1.5, lethality: 0.18, incubation: 1, duration: 3, slow: 0.2, sterile: 0, madness: 0, hollow: 0, targets: 1, builtin: 1 },
    { name: 'Marsh Fever', color: '#ff7043', contagion: 0.12, radius: 2, lethality: 0.35, incubation: 0.5, duration: 2, slow: 0.3, sterile: 0, madness: 0, hollow: 0, targets: 1, builtin: 1 },
    { name: 'Wasting Sickness', color: '#8bc34a', contagion: 0.08, radius: 1.5, lethality: 0.45, incubation: 1, duration: 3, slow: 0.1, sterile: 0, madness: 0, hollow: 0, targets: 3, builtin: 1 },
    { name: 'Falling Sickness', color: '#7e57c2', contagion: 0.06, radius: 1.5, lethality: 0.08, incubation: 1, duration: 4, slow: 0, sterile: 0, madness: 1, hollow: 0, targets: 1, builtin: 1 },
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
