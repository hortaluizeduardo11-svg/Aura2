/* AURA: Genesis 2 — life.js
 * Genomes, species and evolution.
 *  - Every creature, people included, carries a diploid genome: 16 loci x 2 alleles (u8).
 *    Most loci are additive; HUE is Mendelian (recessive albino, dominant melanic); MATE decides
 *    who can breed with whom; NEUTRAL drifts and measures relatedness.
 *  - Species live in regions (16x16 world cells). Each species-region holds a population, mean
 *    phenotype and a reservoir of real genomes. Regions adapt toward the local optimum, drift,
 *    exchange migrants with neighbours on the same landmass, and colonise new land.
 *  - When a species' range is split (a sea opens, a land bridge drowns) the pieces drift apart at
 *    the MATE locus; once they can no longer interbreed, the smaller piece becomes a new species.
 *  - In Watch time, animals are bodies (entities) with these genomes; fast time folds them back
 *    into the regions, and returning to Watch embodies the regions again. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World;
  const { W, H, N, SEA } = AG;
  const NL = 16, GL = NL * 2;
  const L = { SIZE: 0, STR: 1, SPEED: 2, METAB: 3, SENSE: 4, FERT: 5, LIFE: 6, BOLD: 7, IMMUNE: 8, COGN: 9, COLD: 10, HEAT: 11, HUE: 12, SOCIAL: 13, MATE: 14, NEUTRAL: 15 };
  const LOCI = ['Size', 'Strength', 'Speed', 'Metabolism', 'Senses', 'Fertility', 'Longevity', 'Boldness', 'Immunity', 'Cognition', 'Cold tolerance', 'Heat tolerance', 'Pigment', 'Sociality', 'Mate signal', 'Neutral marker'];
  const RS = 16, RW = Math.ceil(W / RS), RH = Math.ceil(H / RS), RN = RW * RH;
  const ARCH = { GRAZER: 0, PREDATOR: 1, BIRD: 2, PRIMATE: 3, FISH: 4, SHARK: 5 };
  const ARCHS = ['grazer', 'predator', 'bird', 'primate', 'sea grazer', 'sea hunter'];
  const GEN_YEARS = [4, 5, 2, 18, 2, 6];     // generation time
  const GROWTH = [0.3, 0.14, 0.45, 0.06, 0.5, 0.12]; // intrinsic growth per year
  const isSea = (a) => a >= 4; // the two lineages of the sea live in sea regions, by ocean basin
  const SPECIATE = 40;                 // MATE divergence that ends interbreeding

  const Life = (AG.Life = {
    NL, GL, L, LOCI, RS, RW, RH, RN, ARCH, ARCHS, GEN_YEARS, SPECIATE,
    species: [], extinctions: 0, speciations: 0, massExtinctions: 0,
    env: { land: new Float32Array(RN), temp: new Float32Array(RN), precip: new Float32Array(RN), forest: new Float32Array(RN), ice: new Float32Array(RN), mass: new Int32Array(RN), massSize: [], open: new Float32Array(RN), cells: [],
      sea: new Float32Array(RN), seaTemp: new Float32Array(RN), shelf: new Float32Array(RN), basin: new Int32Array(RN), basinSize: [] },
    isSea,
    stats: { ms: 0 },
  });
  let rng = Math.random;
  Life.setRng = (v) => { if (!rng.set) rng = AG.makeRng(0); rng.set(v); Life.rng = rng; };
  const rr = () => rng();
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rr(); v = rr(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  // ------------------------------------------------------------ genome
  // phenotype of locus k for genome g (Uint8Array) at offset o
  function express(g, o, k) {
    const a = g[o + 2 * k], b = g[o + 2 * k + 1];
    if (k === L.HUE) {
      if (a < 24 && b < 24) return 6;                  // homozygous recessive: albino
      if (a > 232 || b > 232) return 248;              // a dominant melanic allele shows through
      if (a < 24) return b; if (b < 24) return a;      // one albino allele stays hidden
    }
    return (a + b) >> 1;
  }
  Life.express = express;
  Life.phenotype = function (g, o, out) { out = out || new Float32Array(NL); for (let k = 0; k < NL; k++) out[k] = express(g, o, k); return out; };
  Life.isAlbino = (g, o) => g[o + 2 * L.HUE] < 24 && g[o + 2 * L.HUE + 1] < 24;
  Life.carrier = (g, o) => (g[o + 2 * L.HUE] < 24) !== (g[o + 2 * L.HUE + 1] < 24);

  // Child genome: one allele per locus from each parent (independent assortment), then mutation.
  Life.breed = function (dst, d, mom, mo, dad, dd, rand, mut) {
    rand = rand || rr; mut = mut === undefined ? 1 : mut;
    for (let k = 0; k < NL; k++) {
      dst[d + 2 * k] = mom[mo + 2 * k + (rand() < 0.5 ? 0 : 1)];
      dst[d + 2 * k + 1] = dad[dd + 2 * k + (rand() < 0.5 ? 0 : 1)];
    }
    Life.mutate(dst, d, rand, mut);
  };
  Life.mutate = function (g, o, rand, mut) {
    for (let a = 0; a < GL; a++) {
      const q = rand();
      if (q < 0.03 * mut) g[o + a] = clamp8(g[o + a] + (rand() < 0.5 ? -1 : 1) * (1 + ((rand() * 12) | 0)));
      else if (q < 0.032 * mut) { g[o + a] = clamp8(g[o + a] + (rand() < 0.5 ? -1 : 1) * (40 + rand() * 50)); Life.macro = (Life.macro || 0) + 1; }
    }
  };
  // Founder genome around a mean phenotype (sd per allele), rarely carrying an albino allele.
  Life.founder = function (dst, d, mean, sd, rand) {
    rand = rand || rr;
    for (let k = 0; k < NL; k++) for (let a = 0; a < 2; a++) {
      let v = mean[k] + gaussR(rand) * sd;
      if (k === L.HUE && rand() < 0.06) v = 4 + rand() * 18; // a hidden albino allele now and then
      dst[d + 2 * k + a] = clamp8(v);
    }
  };
  function gaussR(rand) { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }
  Life.gauss = gaussR;
  // relatedness from neutral + mate loci (0 = identical)
  Life.distance = (g, o, h, p) => { let s = 0; for (const k of [L.MATE, L.NEUTRAL, L.HUE, L.SIZE]) s += Math.abs(express(g, o, k) - express(h, p, k)); return s / 4; };
  Life.canMate = (g, o, h, p) => Math.abs(express(g, o, L.MATE) - express(h, p, L.MATE)) < SPECIATE;

  // ------------------------------------------------------------ names
  const GEN_A = ['Aur', 'Bor', 'Cal', 'Dor', 'Equ', 'Fel', 'Gal', 'Hyp', 'Ict', 'Lam', 'Meg', 'Neo', 'Ory', 'Pal', 'Rha', 'Sau', 'Tal', 'Ur', 'Vul', 'Xen', 'Zyg', 'Mor', 'Kel', 'Ster', 'Ant', 'Cyn', 'Dama', 'Lyc'];
  const GEN_B = [['otherium', 'oceros', 'obos', 'ohippus', 'olophus', 'odon', 'aceros', 'elaphus'], ['ocanis', 'ofelis', 'odromus', 'olestes', 'ictis', 'osmilus'], ['ornis', 'opteryx', 'avis', 'orhynchus'], ['opithecus', 'anthropus', 'osimia', 'ocebus'],
    ['ichthys', 'aspis', 'oceras', 'opterus', 'olepis', 'onautilus'], ['oselache', 'onectes', 'osaurus', 'ocetus', 'oteuthis', 'odus']];
  const EPI = { big: ['major', 'robustus', 'giganteus'], small: ['minor', 'gracilis', 'nanus'], cold: ['borealis', 'glacialis', 'lanatus'], hot: ['australis', 'aridus', 'tropicus'], island: ['insularis', 'pelagicus'], fast: ['velox', 'cursor'], docile: ['mitis', 'placidus'], fierce: ['ferox', 'atrox'], forest: ['silvestris', 'nemoralis'], open: ['campestris', 'pratensis'], smart: ['sagax', 'prudens'], plain: ['vulgaris', 'communis', 'primus', 'antiquus'] };
  function nameFor(sp, parent) {
    const m = sp.mean, gs = GEN_B[sp.arch];
    let genus = parent ? parent.genus : null;
    if (!genus || (parent && phenoGap(sp.mean, parent.mean) > 34 && rr() < 0.6)) genus = GEN_A[(rr() * GEN_A.length) | 0] + gs[(rr() * gs.length) | 0];
    let key = 'plain';
    const opts = [];
    if (m[L.SIZE] > 175) opts.push('big'); if (m[L.SIZE] < 80) opts.push('small');
    if (m[L.COLD] > 170) opts.push('cold'); if (m[L.HEAT] > 170) opts.push('hot');
    if (m[L.SPEED] > 175) opts.push('fast'); if (m[L.BOLD] < 70) opts.push('docile'); if (m[L.BOLD] > 185) opts.push('fierce');
    if (sp.island) opts.push('island'); if (sp.arch === ARCH.PRIMATE && m[L.COGN] > 160) opts.push('smart');
    if (opts.length) key = opts[(rr() * opts.length) | 0];
    const taken = (g, e) => Life.species.some((s) => s.genus === g && s.epithet === e);
    const pool = EPI[key].concat(EPI.plain, ...Object.values(EPI));
    let epi = EPI[key][(rr() * EPI[key].length) | 0];
    for (let k = 0; k < pool.length && taken(genus, epi); k++) epi = pool[k];
    if (taken(genus, epi)) { const gs2 = GEN_B[sp.arch]; genus = GEN_A[(rr() * GEN_A.length) | 0] + gs2[(rr() * gs2.length) | 0]; }
    sp.genus = genus; sp.epithet = epi; sp.name = `${genus} ${epi}`;
  }
  const phenoGap = (a, b) => { let s = 0; for (const k of [L.SIZE, L.SPEED, L.COLD, L.HEAT, L.SOCIAL, L.BOLD]) s += Math.abs(a[k] - b[k]); return s / 6; };
  const COMMON = [['grazer', 'antelope', 'elk', 'bison', 'wild horse', 'mammoth', 'aurochs', 'gazelle', 'ibex'], ['wolf', 'great cat', 'hyena', 'bear'], ['bird', 'heron', 'crow', 'goose'], ['ape', 'hominin', 'monkey']];
  // ------------------------------------------------------------ the ages of life
  // Deep time runs through the world's own geological periods (compressed: the Dawn can come
  // from 120 million years on, and by then the animals of today are here). Each period has its own
  // forms: a lineage keeps its genes and its descent, but in the Cretaceous a big hunter is a
  // tyrant lizard and in the Quaternary a bear.
  const PERIODS = [
    [0, 'Cambrian', 'Life fills the seas: trilobites crawl on the sea floor and the first hunters swim'],
    [12, 'Ordovician', 'Shelled squid-kin and sea scorpions rule the seas, and the first reefs grow'],
    [20, 'Silurian', 'Jawless fish swim over the reefs; green plants creep onto the shores'],
    [26, 'Devonian', 'The age of fishes: armoured giants hunt in the seas, and the first four-legged creatures crawl onto the land'],
    [34, 'Carboniferous', 'Great swamp forests; dragonflies as big as hawks, millipedes as long as a man'],
    [42, 'Permian', 'Sail-backed beasts and sabre-toothed hunters roam the dry heart of the continent'],
    [50, 'Triassic', 'The first dinosaurs, the first flying reptiles and the first reptiles of the open sea'],
    [62, 'Jurassic', 'Long-necked giants shake the ground; plesiosaurs and ichthyosaurs fill the seas'],
    [76, 'Cretaceous', 'Tyrants, horned and armoured dinosaurs; mosasaurs in the seas; the first flowers'],
    [92, 'Paleogene', 'After the great impact, mammals and birds inherit the earth; whales return to the sea'],
    [106, 'Neogene', 'Grasslands spread: horses, great cats and apes; great sharks and whales rule the seas'],
    [116, 'Quaternary', 'Ice ages come and go: mammoths, bison and the animals of today'],
  ];
  Life.PERIODS = PERIODS;
  Life.LAND_MYR = 26; // life crawls out of the sea in the Devonian
  Life.KPG_MYR = 92;  // the end of the Cretaceous
  Life.periodAt = (myr) => { let p = 0; for (let k = 0; k < PERIODS.length; k++) if (myr >= PERIODS[k][0]) p = k; return p; };
  Life.periodIdx = () => (AG.Geo.phase === 'deep' ? Life.periodAt(AG.Geo.myr) : PERIODS.length - 1);
  Life.periodName = () => PERIODS[Life.periodIdx()][1];
  // creatures of legend and of other worlds (a lineage keeps its strangeness as it evolves)
  function mythName(sp) {
    const m = sp.mean, S = m[L.SIZE];
    switch (sp.arch) {
      case ARCH.GRAZER: return S > 200 ? 'behemoth' : 'unicorn';
      case ARCH.PREDATOR: return S > 180 ? 'manticore' : 'griffin';
      case ARCH.BIRD: return S > 140 ? 'roc' : 'phoenix';
      case ARCH.PRIMATE: return 'yeti';
      case ARCH.FISH: return 'hippocampus';
      default: return S > 200 ? 'leviathan' : 'sea serpent';
    }
  }
  const ALIEN = ['tripod strider', 'xeno stalker', 'skyray', 'grey', 'glow jelly', 'void squid'];
  function commonName(sp) {
    const m = sp.mean, S = m[L.SIZE], V = m[L.SPEED], SO = m[L.SOCIAL], C = m[L.COLD], Hh = m[L.HEAT], CG = m[L.COGN];
    if (sp.sapient) return 'people';
    if (sp.domestic) return sp.domesticName || 'herd beast';
    if (sp.alien) return ALIEN[sp.arch];
    if (sp.myth) return mythName(sp);
    const p = Life.periodIdx();
    switch (sp.arch) {
      case ARCH.GRAZER:
        if (p <= 3) return 'early tetrapod';
        if (p === 4) return S > 150 ? 'giant millipede' : 'early tetrapod';
        if (p === 5) return S > 150 ? 'sail-back' : 'dicynodont';
        if (p === 6) return S > 160 ? 'early sauropod' : 'dicynodont';
        if (p === 7) return S > 190 ? 'sauropod' : S > 150 ? 'stegosaur' : 'small ornithopod';
        if (p === 8) return S > 205 ? 'sauropod' : S > 175 ? (SO > 150 ? 'duckbill' : 'horned dinosaur') : S > 140 ? 'armoured dinosaur' : 'small ornithopod';
        if (p === 9) return S > 200 ? 'giant rhino' : S > 160 ? 'early elephant' : 'early horse';
        return S > 205 && C > 150 ? 'mammoth' : S > 190 ? 'aurochs' : S > 165 ? (C > 150 ? 'bison' : 'elk') : V > 165 ? (SO > 160 ? 'wild horse' : 'gazelle') : S < 90 ? 'ibex' : 'deer';
      case ARCH.PREDATOR:
        if (p <= 3) return 'giant scorpion';
        if (p === 4) return S > 150 ? 'amphibian hunter' : 'giant centipede';
        if (p === 5) return 'sabre-tooth synapsid';
        if (p === 6) return S > 160 ? 'crocodile-kin' : 'early theropod';
        if (p === 7) return S > 160 ? 'great theropod' : 'small raptor';
        if (p === 8) return S > 180 ? 'tyrant lizard' : SO > 140 ? 'raptor' : 'great theropod';
        if (p === 9) return S > 160 ? 'terror bird' : 'creodont';
        return S > 190 ? 'bear' : SO > 150 ? 'wolf' : V > 160 ? 'great cat' : 'hyena';
      case ARCH.BIRD:
        if (p <= 4) return 'giant dragonfly';
        if (p === 5) return 'gliding reptile';
        if (p <= 7) return S > 100 ? 'giant pterosaur' : 'pterosaur';
        if (p === 8) return S > 110 ? 'giant pterosaur' : 'early bird';
        return S > 130 ? 'great bird' : CG > 140 ? 'crow' : 'songbird';
      case ARCH.PRIMATE:
        if (p <= 4) return 'small amphibian';
        if (p === 5) return 'cynodont';
        if (p <= 8) return 'early mammal';
        if (p === 9) return 'early primate';
        return CG > 170 ? 'hominin' : S > 150 ? 'great ape' : 'monkey';
      case ARCH.FISH:
        if (p === 0) return SO > 175 && CG < 90 ? 'jellyfish' : 'trilobite';
        if (p === 1) return S > 160 ? 'nautiloid' : SO > 175 ? 'jellyfish' : S < 90 ? 'sea lily' : 'trilobite';
        if (p === 2) return S > 150 ? 'nautiloid' : S < 85 ? 'sea lily' : 'jawless fish';
        if (p === 3) return S > 150 ? 'armoured fish' : SO > 150 ? 'jawless fish' : 'lobe-finned fish';
        if (p <= 5) return S > 160 ? 'ammonite' : SO > 150 ? 'bony fish' : 'lobe-finned fish';
        if (p <= 8) return S > 190 ? 'sea turtle' : S > 150 ? 'ammonite' : 'bony fish';
        if (p === 9) return S > 190 ? 'sea turtle' : Hh > 150 ? 'reef fish' : 'bony fish';
        return S > 215 ? (C > 130 ? 'baleen whale' : 'manta ray') : S > 180 ? (Hh > 150 ? 'sea turtle' : C > 160 ? 'seal' : 'dugong') :
          CG > 150 ? 'octopus' : SO > 175 ? 'sardine' : V > 175 ? 'tuna' : Hh > 150 ? 'reef fish' : C > 150 ? 'cod' : CG < 70 ? 'jellyfish' : 'reef fish';
      default: // the hunters of the sea
        if (p === 0) return 'anomalocarid';
        if (p === 1) return S > 170 ? 'orthocone' : 'sea scorpion';
        if (p === 2) return S > 180 ? 'orthocone' : 'sea scorpion';
        if (p === 3) return S > 140 ? 'placoderm' : 'sea scorpion';
        if (p <= 5) return 'early shark';
        if (p === 6) return 'ichthyosaur';
        if (p === 7) return S > 180 ? 'plesiosaur' : 'ichthyosaur';
        if (p === 8) return S > 190 ? 'mosasaur' : S > 150 ? 'plesiosaur' : 'early shark';
        if (p === 9) return S > 190 ? 'early whale' : 'shark';
        if (p === 10) return S > 215 ? 'giant shark' : S > 180 ? (SO > 130 ? 'orca' : 'great shark') : CG > 150 ? 'dolphin' : 'shark';
        return S > 200 ? (SO > 130 || CG > 150 ? 'orca' : 'great shark') : CG > 150 ? (C > 140 ? 'sea lion' : 'dolphin') : V > 180 && Hh > 140 ? 'barracuda' : S > 170 && CG > 120 ? 'giant squid' : 'shark';
    }
  }
  Life.commonName = commonName;
  // 'the first griffins', 'glow jellies', 'hippocampi', 'reef fish'
  Life.plural = (n) => ({ hippocampus: 'hippocampi', octopus: 'octopuses', people: 'people', cod: 'cod', tuna: 'tuna', grey: 'greys' }[n] || (/fish$/.test(n) ? n : /[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(n) ? n + 'es' : n + 's'));

  // ------------------------------------------------------------ species registry
  Life.newSpecies = function (arch, mean, parent, when) {
    const sp = { id: Life.species.length, arch, parent: parent ? parent.id : -1, born: when, died: null, cause: '', mean: Float32Array.from(mean), census: 0, regions: new Map(), sapient: false, domestic: false, wildOf: -1, island: false, kids: [], hue: 0, peak: 0, color: [0, 0, 0] };
    // a lineage's niche: how much bigger or smaller, more or less social, faster or slower than the
    // plain optimum of its kind it lives (inherited, shifting at each split)
    const pn = parent && parent.arch === arch && parent.niche ? parent.niche : null;
    sp.niche = pn ? { size: AG.clamp(pn.size + gauss() * 22, -90, 90), social: AG.clamp(pn.social + gauss() * 22, -90, 90), speed: AG.clamp(pn.speed + gauss() * 16, -60, 60) } : { size: 0, social: 0, speed: 0 };
    if (parent && parent.myth) sp.myth = parent.myth;
    if (parent && parent.alien) sp.alien = true;
    nameFor(sp, parent);
    if (parent) parent.kids.push(sp.id);
    refreshColor(sp);
    Life.species.push(sp);
    return sp;
  };
  function refreshColor(sp) {
    const m = sp.mean, hue = m[L.HUE] / 255;
    const base = sp.alien ? [96, 210, 190] : sp.arch === ARCH.PREDATOR ? [128, 124, 134] : sp.arch === ARCH.BIRD ? [70, 70, 84] : sp.arch === ARCH.PRIMATE ? [116, 82, 58] : sp.arch === ARCH.FISH ? [120, 150, 170] : sp.arch === ARCH.SHARK ? [100, 112, 128] : [176, 122, 72];
    const light = 1.45 - hue * 0.95, cold = m[L.COLD] / 255;
    sp.color = base.map((c, i) => AG.clamp(c * light + cold * 40 * (i === 2 ? 1.2 : 1), 10, 250) | 0);
    if (hue < 0.06) sp.color = [236, 228, 214];
    if (sp.myth) sp.color = { unicorn: [244, 242, 250], behemoth: [120, 100, 90], griffin: [196, 156, 92], manticore: [178, 90, 60], phoenix: [232, 96, 40], roc: [150, 110, 70], yeti: [230, 234, 240], hippocampus: [90, 170, 160], 'sea serpent': [60, 120, 90], leviathan: [50, 70, 90] }[mythName(sp)] || sp.color;
    if (sp.arch === ARCH.FISH && !sp.alien && !sp.myth) { const t = (m[L.HEAT] - m[L.COLD]) / 255; if (t > 0.3) sp.color = [[240, 140, 60], [250, 210, 70], [90, 170, 230], [230, 90, 150], [120, 220, 160]][sp.id % 5]; } // warm-water fish wear the colours of the reef
    sp.common = commonName(sp);
  }
  Life.refreshColor = refreshColor;
  Life.alive = () => Life.species.filter((s) => s.died === null);
  Life.byArch = (a) => Life.species.filter((s) => s.died === null && s.arch === a);
  Life.when = () => (AG.Geo.phase === 'deep' ? { myr: AG.Geo.myr } : { year: Math.floor(AG.Geo.year) });
  Life.whenLabel = (w) => (!w ? '' : w.myr !== undefined ? `Year ${Math.round(w.myr * 1e6).toLocaleString('en-US')}` : w.year !== undefined ? AG.calText(w.year) : '');

  // ------------------------------------------------------------ regional environment
  // Land share, climate and forest per 16x16 region, and which landmass each region belongs to.
  Life.envFromGeo = function () {
    const G = AG.Geo, e = Life.env, sl = SEA + G.seaLevel, per = RS / G.CS;
    e.land.fill(0); e.temp.fill(0); e.precip.fill(0); e.ice.fill(0); e.sea.fill(0); e.seaTemp.fill(0); e.shelf.fill(0);
    for (let c = 0; c < G.GN; c++) {
      const gx = c % G.GW, gy = (c / G.GW) | 0, r = ((gy / per) | 0) * RW + ((gx / per) | 0);
      if (r >= RN) continue;
      if (G.crust[c] > sl) { e.land[r] += 1; e.temp[r] += G.temp[c]; e.precip[r] += G.precip[c]; e.ice[r] += Math.min(1, G.ice[c] * 2); }
      else { e.sea[r] += 1; e.seaTemp[r] += G.temp[c]; if (G.crust[c] > sl - 0.06) e.shelf[r] += 1; }
    }
    seaNorm(per * per);
    for (let r = 0; r < RN; r++) {
      const n = e.land[r];
      if (n) { e.temp[r] /= n; e.precip[r] /= n; e.ice[r] /= n; }
      e.land[r] = n / (per * per);
      e.forest[r] = AG.clamp((e.precip[r] - 0.25) * 1.6, 0, 1) * AG.smooth(0.12, 0.3, e.temp[r]) * (1 - e.ice[r]);
      e.open[r] = 1 - e.forest[r];
    }
    landmasses();
  };
  // the sea's share of each region, its warmth, how much of it is shallow shelf, and the ocean
  // basin it belongs to (sea creatures meet only within a basin)
  function seaNorm(cells) {
    const e = Life.env;
    for (let r = 0; r < RN; r++) { const n = e.sea[r]; if (n) { e.seaTemp[r] /= n; e.shelf[r] /= n; } e.sea[r] = n / cells; }
    seaBasins();
  }
  Life.envFromWorld = function () {
    const e = Life.env, { elev, tbase, moist, veg, ice } = Wd;
    const cnt = new Float32Array(RN);
    e.land.fill(0); e.temp.fill(0); e.precip.fill(0); e.forest.fill(0); e.ice.fill(0); e.sea.fill(0); e.seaTemp.fill(0); e.shelf.fill(0);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = y * W + x, r = ((y / RS) | 0) * RW + ((x / RS) | 0);
      cnt[r]++;
      if (elev[i] < SEA) { e.sea[r]++; e.seaTemp[r] += tbase[i]; if (elev[i] > SEA - 0.04) e.shelf[r]++; }
      if (elev[i] < SEA || (Wd.fl[i] > 0.05 && !Wd.frozen[i])) continue;
      e.land[r]++; e.temp[r] += Wd.Tc(i); e.precip[r] += moist[i]; e.forest[r] += veg[i] >= 165 ? 1 : veg[i] / 330; e.ice[r] += ice[i] ? 1 : 0;
    }
    for (let r = 0; r < RN; r++) {
      const n = e.land[r];
      if (n) { e.temp[r] /= n; e.precip[r] /= n; e.forest[r] /= n; e.ice[r] /= n; }
      e.land[r] = cnt[r] ? n / cnt[r] : 0;
      e.open[r] = 1 - e.forest[r];
    }
    for (let r = 0; r < RN; r++) { const n = e.sea[r]; if (n) { e.seaTemp[r] /= n; e.shelf[r] /= n; } e.sea[r] = cnt[r] ? n / cnt[r] : 0; }
    seaBasins();
    landmasses();
  };
  function seaBasins() { // (basins only: the shares are already normalised)
    const e = Life.env, basin = e.basin; basin.fill(-1); e.basinSize = [];
    const q = [];
    for (let r = 0; r < RN; r++) {
      if (basin[r] >= 0 || e.sea[r] < 0.2) continue;
      const id = e.basinSize.length; let size = 0;
      basin[r] = id; q.length = 0; q.push(r);
      while (q.length) { const u = q.pop(); size++; const x = u % RW, y = (u / RW) | 0; for (const v of [x > 0 ? u - 1 : -1, x < RW - 1 ? u + 1 : -1, y > 0 ? u - RW : -1, y < RH - 1 ? u + RW : -1]) if (v >= 0 && basin[v] < 0 && e.sea[v] >= 0.2) { basin[v] = id; q.push(v); } }
      e.basinSize.push(size);
    }
  }
  function landmasses() {
    const e = Life.env, mass = e.mass; mass.fill(-1); e.massSize = [];
    const q = [];
    for (let r = 0; r < RN; r++) {
      if (mass[r] >= 0 || e.land[r] < 0.12) continue;
      const id = e.massSize.length; let size = 0;
      mass[r] = id; q.length = 0; q.push(r);
      while (q.length) {
        const u = q.pop(); size++;
        const x = u % RW, y = (u / RW) | 0;
        for (const v of [x > 0 ? u - 1 : -1, x < RW - 1 ? u + 1 : -1, y > 0 ? u - RW : -1, y < RH - 1 ? u + RW : -1]) if (v >= 0 && mass[v] < 0 && e.land[v] >= 0.12) { mass[v] = id; q.push(v); }
      }
      e.massSize.push(size);
    }
  }

  // ------------------------------------------------------------ niche
  // Local optimum phenotype for an archetype in a region: cold makes thick fur and big bodies
  // (Bergmann), heat the reverse, open plains make fast social grazers, small islands dwarf them.
  const opt = new Float32Array(NL);
  function optimum(arch, r, out) {
    const e = Life.env, sea = isSea(arch), t = sea ? e.seaTemp[r] : e.temp[r], open = e.open[r], forest = e.forest[r], ms = e.mass[r] >= 0 ? e.massSize[e.mass[r]] : 0;
    const island = ms > 0 && ms < 6 ? 1 : 0;
    out[L.COLD] = AG.clamp((0.62 - t) * 520, 20, 240);
    out[L.HEAT] = AG.clamp((t - 0.42) * 560, 20, 240);
    out[L.HUE] = AG.clamp(70 + forest * 90 + (t - 0.4) * 220 - e.ice[r] * 80, 25, 230);
    out[L.IMMUNE] = AG.clamp(90 + forest * t * 160, 60, 220);
    switch (arch) {
      case ARCH.GRAZER:
        out[L.SIZE] = AG.clamp(110 + open * 70 + (0.5 - t) * 140 - island * 90, 40, 245);
        out[L.SPEED] = 100 + open * 90; out[L.SOCIAL] = 70 + open * 150; out[L.BOLD] = 120 - open * 60;
        out[L.SENSE] = 120 + open * 40; out[L.STR] = 90 + (0.5 - t) * 60; out[L.METAB] = 120; out[L.COGN] = 70;
        out[L.FERT] = 140 - (0.5 - Math.abs(t - 0.45)) * 60; out[L.LIFE] = 120;
        break;
      case ARCH.PREDATOR:
        out[L.SIZE] = AG.clamp(120 + (0.5 - t) * 120 - island * 70, 50, 235);
        out[L.SPEED] = 130 + open * 70; out[L.SOCIAL] = 80 + open * 110; out[L.BOLD] = 190; out[L.SENSE] = 170;
        out[L.STR] = 170; out[L.METAB] = 150; out[L.COGN] = 110; out[L.FERT] = 110; out[L.LIFE] = 120;
        break;
      case ARCH.FISH: { // shelves and reefs make small, colourful, clever fish; open cold water big schools and whales
        const sh = e.shelf[r];
        out[L.HUE] = AG.clamp(80 + sh * 90 + (t - 0.4) * 200, 25, 235);
        out[L.SIZE] = AG.clamp(70 + (1 - sh) * 60 + (0.5 - t) * 150, 30, 245); out[L.SPEED] = 100 + (1 - sh) * 90; out[L.SOCIAL] = 90 + (1 - sh) * 120;
        out[L.BOLD] = 90; out[L.SENSE] = 140; out[L.STR] = 80; out[L.METAB] = 140; out[L.COGN] = 60 + sh * 70 + (t - 0.4) * 60; out[L.FERT] = 190; out[L.LIFE] = 80;
        break;
      }
      case ARCH.SHARK: {
        const sh = e.shelf[r];
        out[L.SIZE] = AG.clamp(130 + (0.5 - t) * 110 + (1 - sh) * 50, 60, 250); out[L.SPEED] = 150 + (1 - sh) * 60; out[L.SOCIAL] = AG.clamp(60 + (0.5 - t) * 160, 20, 230);
        out[L.BOLD] = 190; out[L.SENSE] = 190; out[L.STR] = 180; out[L.METAB] = 150; out[L.COGN] = AG.clamp(100 + (0.5 - t) * 120, 40, 230); out[L.FERT] = 90; out[L.LIFE] = 140;
        break;
      }
      case ARCH.BIRD:
        out[L.SIZE] = 50 + open * 40; out[L.SPEED] = 200; out[L.SOCIAL] = 160; out[L.BOLD] = 90; out[L.SENSE] = 190;
        out[L.STR] = 50; out[L.METAB] = 190; out[L.COGN] = 100 + forest * 40; out[L.FERT] = 170; out[L.LIFE] = 70;
        break;
      default: // primates: open, changeable country rewards social, clever generalists
        out[L.SIZE] = 110 + open * 40 + (0.5 - t) * 40; out[L.SPEED] = 110; out[L.SOCIAL] = 130 + open * 90; out[L.BOLD] = 130;
        out[L.SENSE] = 140; out[L.STR] = 120 - open * 20; out[L.METAB] = 130; out[L.COGN] = 120 + open * 90 + Math.abs(t - 0.45) * 60;
        out[L.FERT] = 90; out[L.LIFE] = 160;
        out[L.COGN] += Life.brainDrive(); // the long pressure toward bigger brains in social, tool-using primates
    }
    out[L.MATE] = -1; out[L.NEUTRAL] = -1; // neutral: drift only
    return out;
  }
  // Over deep time, social primates face a slowly rising payoff for intelligence (bigger groups,
  // tools, a changeable climate); it stops rising once people exist.
  Life.brainDrive = () => Math.min(70, AG.Geo.myr * 0.18);
  // Have the primates become minds enough? When the cleverest lineage crosses the threshold, the
  // Dawn comes within some millions of years (by chance); a world that never gets there is given
  // its people late in the day.
  Life.sapienceReady = function (dt) {
    const G = AG.Geo;
    if (G.myr >= 340) return true;
    if (G.myr < 120) return false;
    let m = 0; for (const s of Life.byArch(ARCH.PRIMATE)) m = Math.max(m, s.mean[L.COGN]);
    return m >= 205 && rr() < dt / 12;
  };
  Life.optimum = (arch, r) => Array.from(optimum(arch, r, new Float32Array(NL)));
  // a species' own optimum: its kind's, shifted by its niche
  function optimumFor(s, r, out) {
    optimum(s.arch, r, out);
    const n = s.niche; if (!n) return out;
    out[L.SIZE] = AG.clamp(out[L.SIZE] + n.size, 10, 250); out[L.SOCIAL] = AG.clamp(out[L.SOCIAL] + n.social, 5, 250); out[L.SPEED] = AG.clamp(out[L.SPEED] + n.speed, 10, 250);
    return out;
  }
  Life.optimumFor = optimumFor;
  const opt2 = new Float32Array(NL);
  function fitFor(s, mu, r) {
    optimumFor(s, r, opt2);
    const dc = (mu[L.COLD] - opt2[L.COLD]) / 70, dh = (mu[L.HEAT] - opt2[L.HEAT]) / 70, ds = (mu[L.SIZE] - opt2[L.SIZE]) / 110;
    return Math.exp(-(dc * dc * 0.5 + dh * dh * 0.5 + ds * ds * 0.25));
  }
  Life.fitFor = fitFor;
  // how much two populations of one kind compete for the same food: alike in size and in herd
  // life, fully; very different, little (so big and small, herding and solitary, can share a land)
  // (overlap = exp(-(dSIZE/50)^2/2 - (dSOCIAL/60)^2/2), worked out pairwise in crowding below)
  // the competition each population feels: the fitness-weighted crowding of its kind in its region
  function crowding(sp) {
    const byKey = new Map();
    for (const s of sp) for (const [r, R] of s.regions) { R.fit = fitFor(s, R.mu, r); const k = s.arch * RN + r; let a = byKey.get(k); if (!a) byKey.set(k, (a = [])); a.push(R); }
    // (all of a kind share the food; the alike most). Each pair's overlap is worked out once and
    // added to both, in the same order a plain double loop over the list would add it
    for (const list of byKey.values()) {
      const n = list.length;
      if (n === 1) { const R = list[0]; R.crowd = Math.max(1e-6, R.fit * R.fit); continue; }
      if (cS.length < n) { cS = new Float64Array(n * 2); cQ = new Float64Array(n * 2); cF = new Float64Array(n * 2); cD = new Float64Array(n * 2); }
      for (let i = 0; i < n; i++) { const R = list[i]; cS[i] = R.mu[L.SIZE]; cQ[i] = R.mu[L.SOCIAL]; cF[i] = R.fit * R.fit; cD[i] = 0; }
      for (let i = 0; i < n; i++) {
        cD[i] += cF[i];
        const si = cS[i], qi = cQ[i], fi = cF[i];
        for (let j = i + 1; j < n; j++) { const ds = (si - cS[j]) / 50, dq = (qi - cQ[j]) / 60, w = 0.55 + 0.45 * Math.exp(-(ds * ds + dq * dq) / 2); cD[i] += cF[j] * w; cD[j] += fi * w; }
      }
      for (let i = 0; i < n; i++) list[i].crowd = Math.max(1e-6, cD[i]);
    }
  }
  let cS = new Float64Array(64), cQ = new Float64Array(64), cF = new Float64Array(64), cD = new Float64Array(64);
  // how well a mean phenotype fits a region (0..1): temperature dominates, then body plan
  function fit(arch, mu, r) {
    optimum(arch, r, opt);
    const dc = (mu[L.COLD] - opt[L.COLD]) / 70, dh = (mu[L.HEAT] - opt[L.HEAT]) / 70, ds = (mu[L.SIZE] - opt[L.SIZE]) / 110;
    return Math.exp(-(Math.max(0, dc) * 0 + dc * dc * 0.5 + dh * dh * 0.5 + ds * ds * 0.25));
  }
  Life.fit = fit;

  // food a region offers an archetype (relative units; scaled into head counts by CAP)
  const CAP = [26, 2, 6, 4, 30, 4]; // (predators: two niches of hunters now share what one used to take)
  function forage(arch, r, prey) {
    const e = Life.env;
    if (isSea(arch)) { // plankton on shelves and in cold upwelling water
      const t = e.seaTemp[r], prod = e.sea[r] * (0.35 + e.shelf[r] * 0.9 + AG.clamp(0.5 - t, 0, 0.5) * 0.7);
      return arch === ARCH.FISH ? prod : Math.min(prod, prey / 30);
    }
    const land = e.land[r] * (1 - e.ice[r] * 0.9), t = e.temp[r];
    const prod = land * AG.clamp(e.precip[r] * 1.2 + 0.2, 0, 1.2) * AG.smooth(0.05, 0.3, t);
    if (arch === ARCH.GRAZER) return prod * (0.5 + e.open[r] * 0.8);
    if (arch === ARCH.PREDATOR) return Math.min(prod, prey / 26) * 1;
    if (arch === ARCH.BIRD) return prod * 0.8 + 0.1 * (1 - e.land[r]) * (e.land[r] > 0 ? 1 : 0);
    return prod * (0.4 + e.forest[r] * 0.6) * AG.smooth(0.22, 0.4, t);
  }

  // ------------------------------------------------------------ region records
  function newRegion(mu, n) { return { n, mu: Float32Array.from(mu), res: new Uint8Array(12 * GL), nres: 0, fit: 0 }; }
  function seedReservoir(R, sd) { for (let k = 0; k < 12; k++) Life.founder(R.res, k * GL, R.mu, sd, rr); R.nres = 12; }
  Life.newRegion = newRegion; Life.seedReservoir = seedReservoir;
  // The reservoir's genomes follow the population as it evolves (deep time moves the regional mean,
  // not each stored genome): each locus is shifted so the sample's mean is the population's again.
  function syncReservoir(R) {
    if (!R.nres) return;
    for (let k = 0; k < NL; k++) {
      if (k === L.HUE) continue; // (pigment keeps its Mendelian alleles)
      let m = 0; for (let q = 0; q < R.nres; q++) m += express(R.res, q * GL, k);
      const d = Math.round(R.mu[k] - m / R.nres);
      if (Math.abs(d) < 2) continue;
      for (let q = 0; q < R.nres; q++) { const o = q * GL + 2 * k; R.res[o] = clamp8(R.res[o] + d); R.res[o + 1] = clamp8(R.res[o + 1] + d); }
    }
  }
  Life.syncReservoir = syncReservoir;

  // ------------------------------------------------------------ deep time
  Life.init = function (seed) {
    Life.acc = 0;
    rng = AG.makeRng((Math.imul(seed, 1597334677) ^ 0x2545f491) >>> 0); Life.rng = rng;
    Life.species = []; Life.extinctions = 0; Life.speciations = 0; Life.massExtinctions = 0; Life.macro = 0;
    Life.envFromGeo();
    Life.landPending = true; Life.kpg = false; Life.periodSeen = 0; Life.alienDone = false;
    // in Year 0 life is in the sea: grazers of the sea floor and the first hunters
    seedSea();
    if (AG.Geo.myr >= Life.LAND_MYR) seedLand();
  };
  const baseMean = () => { const m = new Float32Array(NL).fill(128); m[L.MATE] = 128; m[L.NEUTRAL] = 128; m[L.HUE] = 110; return m; };
  function seedSea() {
    const founders = [[ARCH.FISH, { SIZE: 90, SPEED: 80, SOCIAL: 120, COGN: 50 }, [0, 0, 0]], [ARCH.FISH, { SIZE: 60, SPEED: 60, SOCIAL: 200, COGN: 40 }, [-50, 70, 10]], [ARCH.FISH, { SIZE: 160, SPEED: 70, SOCIAL: 70, COGN: 80 }, [70, -60, -20]],
      [ARCH.SHARK, { SIZE: 130, SPEED: 150, BOLD: 200, STR: 170 }, [0, -30, 0]], [ARCH.SHARK, { SIZE: 180, SPEED: 140, BOLD: 200, STR: 190, SOCIAL: 160 }, [60, 60, -10]]];
    for (const [arch, over, nn] of founders) {
      const m = baseMean(); for (const k in over) m[L[k]] = over[k];
      const sp = Life.newSpecies(arch, m, null, Life.when()); sp.niche = { size: nn[0], social: nn[1], speed: nn[2] };
      for (let r = 0; r < RN; r++) {
        if (Life.env.sea[r] < 0.5 || rr() > 0.35) continue;
        const R = newRegion(m, 1); optimum(arch, r, opt);
        for (let k = 0; k < NL; k++) if (opt[k] >= 0 && k !== L.HUE) R.mu[k] = (R.mu[k] + opt[k]) / 2;
        seedReservoir(R, 14); sp.regions.set(r, R);
      }
    }
  }
  // The Devonian: the first four-legged creatures crawl out onto the land, and with them the
  // ancestors of every land lineage (the flyers begin as insects, the primates as small amphibians).
  function seedLand() {
    Life.landPending = false;
    const base = baseMean;
    const founders = [
      [ARCH.GRAZER, { SIZE: 130, SPEED: 130, SOCIAL: 140, BOLD: 90, COLD: 110, HEAT: 120 }],
      [ARCH.GRAZER, { SIZE: 170, SPEED: 100, SOCIAL: 90, BOLD: 120, COLD: 130, HEAT: 100 }],
      [ARCH.PREDATOR, { SIZE: 140, SPEED: 150, SOCIAL: 120, BOLD: 190, STR: 170 }],
      [ARCH.BIRD, { SIZE: 60, SPEED: 200, SOCIAL: 150 }],
      [ARCH.PRIMATE, { SIZE: 110, COGN: 120, SOCIAL: 140, COLD: 80, HEAT: 150 }],
    ];
    let mass = -1, best = 0;
    for (let k = 0; k < Life.env.massSize.length; k++) if (Life.env.massSize[k] > best) { best = Life.env.massSize[k]; mass = k; }
    founders.push([ARCH.GRAZER, { SIZE: 90, SPEED: 160, SOCIAL: 190 }], [ARCH.PREDATOR, { SIZE: 100, SPEED: 170, SOCIAL: 180 }], [ARCH.BIRD, { SIZE: 120, SPEED: 170, SOCIAL: 100 }]);
    const NICHES = [[0, 0, 0], [60, -50, -20], [50, -50, 0], [0, 0, 0], [0, 0, 0], [-50, 60, 25], [-40, 60, 20], [60, -40, 0]];
    founders.forEach((f, q) => { f[2] = NICHES[q] || [0, 0, 0]; });
    for (const [arch, over, nn] of founders) {
      const m = base(arch); for (const k in over) m[L[k]] = over[k];
      const sp = Life.newSpecies(arch, m, null, Life.when()); sp.niche = { size: nn[0], social: nn[1], speed: nn[2] };
      for (let r = 0; r < RN; r++) {
        if (Life.env.mass[r] !== mass || Life.env.land[r] < 0.3) continue;
        if (rr() < 0.5) {
          const R = newRegion(m, 1); optimum(arch, r, opt);
          for (let k = 0; k < NL; k++) if (opt[k] >= 0 && k !== L.HUE) R.mu[k] = (R.mu[k] + opt[k]) / 2;
          seedReservoir(R, 14); sp.regions.set(r, R);
        }
      }
    }
    lifeEvent('speciation', 'Life crawls out of the sea: the first four-legged creatures walk on the land');
  }
  Life.seedLand = seedLand;
  // the chronicle of deep time
  function lifeEvent(kind, text) { if (AG.History && AG.History.event) AG.History.event(kind, text, { cause: 'evolution' }); }
  // The end of the Cretaceous: a great asteroid. Big land animals almost all perish.
  function impact() {
    const dinos = !Life.kpg && AG.Geo.phase === 'deep' && AG.Geo.myr >= 50;
    Life.kpg = true; Life.massExtinctions++;
    AG.Geo.climate.aerosol += 0.15;
    AG.Geo.events.push({ kind: 'impact', myr: AG.Geo.myr });
    for (const s of Life.alive()) {
      s.lastLoss = 'the great asteroid';
      const big = s.mean[L.SIZE] > 150 && !isSea(s.arch), p = big ? 0.92 : isSea(s.arch) ? 0.5 : 0.6;
      for (const [r] of s.regions) if (rr() < p) s.regions.delete(r);
      if (!s.regions.size && s.sapient) continue;
    }
    lifeEvent('extinction', dinos ? 'A great asteroid strikes: fire and a long winter end the age of the dinosaurs; the small survive' : 'A great asteroid strikes: fire and a long winter; most of the big animals die and the small inherit the world');
  }
  // (a god's asteroid: the same blow at any time; before the end of the Cretaceous it ends the
  // age of the dinosaurs there and then)
  Life.strike = function () { impact(); return true; };
  // An emptied way of life does not stay empty: some survivors of a related kind take it up
  // (after the great asteroid, mammals became the hunters).
  const DONOR = { 0: [3, 1], 1: [3, 0], 2: [0, 3], 3: [0, 1], 4: [5], 5: [4] };
  function refill(dt) {
    for (const arch of [0, 1, 2, 3, 4, 5]) {
      if (!isSea(arch) && Life.landPending) continue;
      if (Life.species.some((q) => q.died === null && q.arch === arch && !q.sapient && !q.domestic)) continue;
      if (rr() > Math.min(1, dt / 3)) continue;
      let donor = null;
      for (const a of DONOR[arch]) { for (const q of Life.byArch(a)) if (!q.sapient && !q.domestic && (!donor || q.regions.size > donor.regions.size)) donor = q; if (donor) break; }
      if (!donor || !donor.regions.size) continue;
      const m = Float32Array.from(donor.mean); m[L.MATE] = AG.clamp(m[L.MATE] + 70, 5, 250);
      const sp = Life.newSpecies(arch, m, null, Life.when()); sp.parent = donor.id; donor.kids.push(sp.id); sp.genus = donor.genus.slice(0, 4) + GEN_B[arch][(rr() * GEN_B[arch].length) | 0]; sp.name = `${sp.genus} ${sp.epithet}`;
      let k = 0; for (const [r, R] of donor.regions) { if (k++ > 8) break; const Q = newRegion(m, 1); optimumFor(sp, r, opt); for (let j = 0; j < NL; j++) if (opt[j] >= 0) Q.mu[j] = (Q.mu[j] + opt[j]) / 2; seedReservoir(Q, 16); sp.regions.set(r, Q); }
      refreshColor(sp);
      lifeEvent('speciation', `Into an empty way of life: descendants of the ${Life.plural(donor.common)} become ${Life.plural(sp.common)} (${sp.name})`);
    }
  }
  // A comet seeds life from another world (once in some worlds); or the god does.
  Life.seedAlien = function (r, arch) {
    const e = Life.env;
    if (arch === undefined) arch = e.sea[r] > 0.5 ? (rr() < 0.5 ? ARCH.FISH : ARCH.SHARK) : [ARCH.GRAZER, ARCH.PREDATOR, ARCH.BIRD][(rr() * 3) | 0];
    const m = baseMean(); for (let k = 0; k < NL; k++) if (k !== L.MATE && k !== L.NEUTRAL) m[k] = 40 + rr() * 180;
    m[L.MATE] = 10 + rr() * 30; m[L.SIZE] = 120 + rr() * 100; m[L.IMMUNE] = 230;
    const sp = Life.newSpecies(arch, m, null, Life.when()); sp.alien = true;
    sp.genus = ['Xeno', 'Astro', 'Exo', 'Void', 'Nebul'][(rr() * 5) | 0] + (GEN_B[arch][(rr() * GEN_B[arch].length) | 0]); sp.name = `${sp.genus} ${['stellaris', 'advena', 'peregrinus', 'cometae'][(rr() * 4) | 0]}`;
    const x = r % RW, y = (r / RW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (y + dy) * RW + x + dx; if (x + dx < 0 || y + dy < 0 || x + dx >= RW || y + dy >= RH) continue; if (isSea(arch) ? e.sea[q] < 0.2 : e.land[q] < 0.2) continue; const R = newRegion(m, 3); seedReservoir(R, 22); sp.regions.set(q, R); }
    if (!sp.regions.size) { const R = newRegion(m, 3); seedReservoir(R, 22); sp.regions.set(r, R); }
    refreshColor(sp);
    lifeEvent('speciation', `A comet falls and seeds life from another world: the ${Life.plural(sp.common)} (${sp.name})`);
    return sp;
  };
  // A creature of legend: a lineage descended from the local fauna, strange from then on.
  Life.seedMyth = function (r, arch) {
    const e = Life.env;
    if (arch === undefined) arch = e.sea[r] > 0.5 ? (rr() < 0.5 ? ARCH.FISH : ARCH.SHARK) : [ARCH.GRAZER, ARCH.PREDATOR, ARCH.BIRD, ARCH.PRIMATE][(rr() * 4) | 0];
    const kin = Life.byArch(arch).filter((q) => !q.sapient && !q.domestic && !q.alien)[0];
    const m = kin ? Float32Array.from(kin.mean) : baseMean();
    m[L.MATE] = AG.clamp(m[L.MATE] + 60, 5, 250); m[L.SIZE] = AG.clamp(m[L.SIZE] + 30, 5, 250); m[L.LIFE] = 230; m[L.COGN] = AG.clamp(m[L.COGN] + 40, 5, 250);
    const sp = Life.newSpecies(arch, m, kin || null, Life.when()); sp.myth = true;
    const R = newRegion(m, 2); seedReservoir(R, 12); sp.regions.set(r, R);
    refreshColor(sp);
    lifeEvent('speciation', `A creature of legend appears: the first ${Life.plural(sp.common)} (${sp.name})`);
    return sp;
  };

  // One deep step of dt million years: adaptation, drift, migration, colonisation, competition,
  // speciation and extinction, all at the level of regions.
  Life.deepStep = function (dt) {
    const t0 = AG.now();
    Life.envFromGeo();
    const sp = Life.alive().sort((a, b) => a.arch - b.arch || a.id - b.id); // grazers before their predators
    const adapt = Math.min(1, 0.6 * dt), drift = 9 * Math.sqrt(dt);
    const G = AG.Geo, stress = G.climate.aerosol;
    // grazer biomass per region feeds predators
    const prey = new Float32Array(RN), preySea = new Float32Array(RN);
    for (const s of sp) if (s.arch === ARCH.GRAZER) for (const [r, R] of s.regions) prey[r] += R.n;
    for (const s of sp) if (s.arch === ARCH.FISH) for (const [r, R] of s.regions) preySea[r] += R.n;
    // adaptation toward each region's optimum; neutral loci drift together across each connected
    // population (one random walk per landmass), so only separated populations pull apart
    for (const s of sp) {
      const walk = new Map();
      for (const [r, R] of s.regions) {
        if (lost(s, r)) { s.regions.delete(r); s.lastLoss = isSea(s.arch) ? 'the sea dried' : 'drowned'; continue; }
        optimumFor(s, r, opt);
        for (let k = 0; k < NL; k++) if (opt[k] >= 0) R.mu[k] += (opt[k] - R.mu[k]) * adapt;
        const key = compKeyFor(s, r);
        let w = walk.get(key); if (!w) walk.set(key, (w = [gauss() * drift, gauss() * drift]));
        R.mu[L.MATE] = AG.clamp(R.mu[L.MATE] + w[0], 5, 250); R.mu[L.NEUTRAL] = AG.clamp(R.mu[L.NEUTRAL] + w[1], 5, 250);
      }
    }
    // competition: populations of a kind in a region share its food by fitness, the more alike the more
    crowding(sp);
    let preyFresh = false;
    for (const s of sp) {
      if (s.arch === ARCH.PREDATOR && !preyFresh) { prey.fill(0); for (const g of sp) if (g.arch === ARCH.GRAZER) for (const [r, R] of g.regions) prey[r] += R.n; preyFresh = true; }
      if (s.arch === ARCH.SHARK && !s._seaFresh) { preySea.fill(0); for (const g of sp) if (g.arch === ARCH.FISH) for (const [r, R] of g.regions) preySea[r] += R.n; }
      for (const [r, R] of s.regions) {
        const K = CAP[s.arch] * forage(s.arch, r, s.arch === ARCH.SHARK ? preySea[r] : prey[r]) * Math.sqrt(R.fit) * (R.fit * R.fit / R.crowd);
        R.n = K * (1 - Math.min(0.9, stress * 6 * (s.arch === ARCH.BIRD ? 0.5 : 1)));
        if (R.n < 0.4) { s.regions.delete(r); s.lastLoss = s.lastLoss || (s.arch === ARCH.PREDATOR ? 'prey vanished' : 'outcompeted'); continue; }
      }
      migrate(s, dt);
      colonise(s, dt);
    }
    speciationCheck(dt, true);
    extinctionCheck();
    if (G.phase === 'deep' && G.myr > 5 && rr() < dt / 95) massExtinction();
    if (G.phase === 'deep') {
      const pi = Life.periodAt(G.myr);
      if (pi > (Life.periodSeen || 0)) { Life.periodSeen = pi; lifeEvent('genesis', `The ${PERIODS[pi][1]} begins. ${PERIODS[pi][2]}`); }
      if (Life.landPending && G.myr >= Life.LAND_MYR) seedLand();
      refill(dt);
      if (!Life.kpg && G.myr >= Life.KPG_MYR) impact();
      if (!Life.alienDone && G.myr > 34 && G.myr < 110 && rr() < dt / 160) { // a comet from another world
        Life.alienDone = true;
        const cands = []; for (let r = 0; r < RN; r++) if (Life.env.land[r] > 0.5 || Life.env.sea[r] > 0.6) cands.push(r);
        if (cands.length) Life.seedAlien(cands[(rr() * cands.length) | 0]);
      }
    }
    Life.stats.ms = Life.stats.ms * 0.9 + (AG.now() - t0) * 0.1;
  };

  // gene flow between neighbouring occupied regions on the same landmass homogenises the MATE
  // signal; only isolation lets it diverge.
  function migrate(s, dt) {
    const e = Life.env, m = Math.min(0.5, 0.35 * Math.min(1, dt));
    for (const [r, R] of s.regions) {
      const x = r % RW, y = (r / RW) | 0;
      for (const v of [x < RW - 1 ? r + 1 : -1, y < RH - 1 ? r + RW : -1]) {
        if (v < 0) continue;
        const Q = s.regions.get(v); if (!Q) continue;
        if (!linked(s, r, v)) continue;
        for (const k of [L.MATE, L.NEUTRAL]) { const a = R.mu[k], b = Q.mu[k]; R.mu[k] += (b - a) * m * 0.5; Q.mu[k] += (a - b) * m * 0.5; }
      }
    }
  }
  function colonise(s, dt) {
    const e = Life.env, add = [];
    for (const [r, R] of s.regions) {
      if (R.n < 1) continue;
      const x = r % RW, y = (r / RW) | 0;
      for (const v of [x > 0 ? r - 1 : -1, x < RW - 1 ? r + 1 : -1, y > 0 ? r - RW : -1, y < RH - 1 ? r + RW : -1]) {
        if (v < 0 || s.regions.has(v) || (isSea(s.arch) ? e.sea[v] < 0.15 : e.land[v] < 0.15)) continue;
        const sameMass = linked(s, r, v);
        if (!sameMass && s.arch !== ARCH.BIRD && rr() > 0.004 * dt) continue; // rafting across a strait (or a land bridge) is rare
        if (fitFor(s, R.mu, v) < 0.15) continue;
        if (rr() < Math.min(1, 0.8 * dt)) add.push([v, R]);
      }
    }
    for (const [v, R] of add) if (!s.regions.has(v)) { const Q = newRegion(R.mu, 0.5); Q.res.set(R.res); Q.nres = R.nres; s.regions.set(v, Q); }
  }

  // Split each species by landmass; a piece whose MATE signal has drifted too far away becomes a
  // new species, descended from the old.
  const compKey = (r) => Life.env.mass[r];
  Life.compKey = compKey;
  // a species' connected population: landmass for land animals, ocean basin for sea creatures
  const compKeyFor = (s, r) => (isSea(s.arch) ? 100000 + Life.env.basin[r] : Life.env.mass[r]);
  Life.compKeyFor = compKeyFor;
  const lost = (s, r) => (isSea(s.arch) ? Life.env.sea[r] < 0.06 : Life.env.land[r] < 0.06 && s.arch !== ARCH.BIRD);
  const linked = (s, r, v) => { const e = Life.env; if (s.arch === ARCH.BIRD) return true; if (isSea(s.arch)) return e.basin[r] >= 0 && e.basin[r] === e.basin[v]; return e.mass[r] >= 0 && e.mass[r] === e.mass[v]; };
  function speciationCheck(dt, deep) {
    const e = Life.env;
    for (const s of Life.alive()) {
      if (s.regions.size < 2 || s.domestic || s.sapient) continue;
      const comps = new Map();
      for (const [r, R] of s.regions) {
        const key = compKeyFor(s, r);
        let c = comps.get(key); if (!c) comps.set(key, (c = { regions: [], n: 0, mate: 0 }));
        c.regions.push(r); c.n += R.n; c.mate += R.mu[L.MATE] * R.n;
      }
      if (comps.size < 2) continue;
      const list = [...comps.values()].filter((c) => c.n > 0);
      list.forEach((c) => (c.mate /= c.n));
      list.sort((a, b) => b.n - a.n);
      const main = list[0];
      for (const c of list.slice(1)) {
        if (Math.abs(c.mate - main.mate) < SPECIATE) continue;
        const mean = new Float32Array(NL);
        for (const r of c.regions) { const R = s.regions.get(r); for (let k = 0; k < NL; k++) mean[k] += R.mu[k] * R.n / c.n; }
        const child = Life.newSpecies(s.arch, mean, s, Life.when());
        child.island = c.regions.length <= 5;
        for (const r of c.regions) { child.regions.set(r, s.regions.get(r)); s.regions.delete(r); }
        if (!child.myth && !child.alien && deep && AG.Geo.myr > 30 && rr() < 0.01) { child.myth = true; lifeEvent('speciation', `Cut off from its kin, a lineage turns strange: the first ${Life.plural(mythName(child))}`); }
        refreshColor(child);
        Life.speciations++;
        Life.onEvent && Life.onEvent({ kind: 'speciation', species: child, parent: s });
      }
    }
  }
  Life.speciationCheck = speciationCheck;
  function extinctionCheck(cause) {
    for (const s of Life.alive()) {
      if (s.sapient) { s.census = AG.People ? AG.People.alive : 0; continue; } // people live in person records, not regions
      let n = 0; for (const R of s.regions.values()) n += R.n;
      if (n > 0 && !s.sapient) { // the species' traits are its living population's
        s.mean.fill(0);
        for (const R of s.regions.values()) for (let k = 0; k < NL; k++) s.mean[k] += R.mu[k] * R.n / n;
      }
      s.census = n; if (n > s.peak) s.peak = n;
      if (s.regions.size === 0 || n < 0.5) {
        s.died = Life.when(); s.cause = cause || s.lastLoss || (s.arch === ARCH.PREDATOR ? 'prey vanished' : 'habitat lost');
        Life.extinctions++;
        Life.onEvent && Life.onEvent({ kind: 'extinction', species: s });
      }
      refreshColor(s);
    }
  }
  function massExtinction() {
    Life.massExtinctions++;
    AG.Geo.climate.aerosol += 0.12;
    AG.Geo.events.push({ kind: 'lip', myr: AG.Geo.myr });
    for (const s of Life.alive()) {
      s.lastLoss = 'the Great Dying (volcanic winter)';
      for (const [r] of s.regions) if (rr() < (s.regions.size < 8 ? 0.85 : 0.55)) s.regions.delete(r);
    }
  }

  // ------------------------------------------------------------ the Dawn: choose the sapient
  Life.dawn = function () {
    Life.envFromWorld();
    // the primate lineage with the highest cognition becomes people
    let best = null;
    for (const s of Life.byArch(ARCH.PRIMATE)) { const c = s.mean[L.COGN] + s.regions.size * 0.2; if (!best || c > best.c) best = { s, c }; }
    if (!best) { // every primate died out in deep time: a survivor lineage emerges from the forest
      const m = new Float32Array(NL).fill(128); m[L.COGN] = 170; m[L.SOCIAL] = 170;
      const s = Life.newSpecies(ARCH.PRIMATE, m, null, Life.when());
      for (let r = 0; r < RN; r++) if (Life.env.land[r] > 0.5 && Life.env.temp[r] > 0.45) { const R = newRegion(m, 2); seedReservoir(R, 12); s.regions.set(r, R); if (s.regions.size > 6) break; }
      best = { s };
    }
    const p = Life.newSpecies(ARCH.PRIMATE, best.s.mean, best.s, Life.when());
    p.sapient = true; p.genus = best.s.genus.replace(/(opithecus|osimia|ocebus)$/, 'anthropus'); p.epithet = 'sapiens'; p.name = `${p.genus} sapiens`;
    p.mean[L.COGN] = Math.max(p.mean[L.COGN], 175); p.mean[L.SOCIAL] = Math.max(p.mean[L.SOCIAL], 160);
    // the cradle: the warmest well-fitted region of the ancestor's range
    let cradle = -1, cv = -1;
    for (const [r, R] of best.s.regions) { const v = R.n * fit(ARCH.PRIMATE, p.mean, r) * (Life.env.ice[r] < 0.1 ? 1 : 0); if (v > cv) { cv = v; cradle = r; } }
    if (cradle < 0) for (let r = 0; r < RN; r++) if (Life.env.land[r] > 0.6 && Life.env.ice[r] === 0 && Life.env.temp[r] > 0.45) { cradle = r; break; }
    p.cradle = cradle;
    const R = newRegion(p.mean, 0); seedReservoir(R, 16); p.regions.set(cradle, R);
    Life.people = p;
    refreshColor(p); p.common = 'people';
    return p;
  };

  // ------------------------------------------------------------ the Age of People (fast time)
  // Regional dynamics in years: logistic growth, slow adaptation, drift scaled by population and
  // generation time, predation and human hunting pressure.
  // On a big world the regional model runs every few years, the years gathered into one longer step
  // (its growth, selection and drift are written for long steps; Millennia mode takes 8 at once).
  const LIFE_EVERY = AG.N > 400000 ? Math.max(2, Math.round(AG.N / 280000)) : 1;
  Life.acc = 0;
  Life.yearStep = function (dy) {
    if (LIFE_EVERY > 1 && dy > 0 && dy < LIFE_EVERY) { Life.acc += dy; if (Life.acc < LIFE_EVERY) return; dy = Life.acc; Life.acc = 0; }
    const t0 = AG.now();
    if (Math.floor(AG.Geo.year / 50) !== Math.floor((AG.Geo.year - dy) / 50) || !Life.envYear) { Life.envFromWorld(); Life.envYear = AG.Geo.year; }
    const prey = new Float32Array(RN), pred = new Float32Array(RN);
    const sp = Life.alive();
    const preySea = new Float32Array(RN), predSea = new Float32Array(RN);
    for (const s of sp) for (const [r, R] of s.regions) { if (s.arch === ARCH.GRAZER) prey[r] += R.n; else if (s.arch === ARCH.PREDATOR) pred[r] += R.n; else if (s.arch === ARCH.FISH) preySea[r] += R.n; else if (s.arch === ARCH.SHARK) predSea[r] += R.n; }
    crowding(sp);
    for (const s of sp) {
      if (s.sapient) continue; // people live in communities, not regions
      const gen = GEN_YEARS[s.arch], grow = GROWTH[s.arch];
      for (const [r, R] of s.regions) {
        if (lost(s, r)) { s.regions.delete(r); s.lastLoss = isSea(s.arch) ? 'the sea dried' : 'drowned range'; continue; }
        const K = Math.max(0.01, CAP[s.arch] * forage(s.arch, r, s.arch === ARCH.SHARK ? preySea[r] : prey[r]) * R.fit * R.fit / R.crowd * R.fit) * (s.domestic ? 0 : 1);
        if (s.domestic) continue; // herds are kept by people (civ.js)
        // logistic growth below the capacity; above it the excess dies back smoothly (stable for long steps)
        if (R.n <= K) R.n = Math.min(K, R.n + grow * R.n * (1 - R.n / K) * dy);
        else R.n = K + (R.n - K) * Math.exp(-grow * dy);
        // predators take their share (a few animals a year each, never most of a herd)
        if (s.arch === ARCH.GRAZER && pred[r] > 0) R.n -= Math.min(R.n * 0.12 * Math.min(1, dy), pred[r] * 0.2 * dy * R.n / (R.n + 5));
        if (s.arch === ARCH.FISH && predSea[r] > 0) R.n -= Math.min(R.n * 0.12 * Math.min(1, dy), predSea[r] * 0.2 * dy * R.n / (R.n + 5));
        R.n = Math.max(0, R.n);
        optimumFor(s, r, opt);
        const sel = Math.min(1, 0.012 * dy / gen);
        for (let k = 0; k < NL; k++) if (opt[k] >= 0) R.mu[k] += (opt[k] - R.mu[k]) * sel;
        if (R.n < 0.3) { s.regions.delete(r); continue; }
      }
      // neutral drift per connected population: smaller populations drift faster
      const pop = new Map();
      for (const [r, R] of s.regions) pop.set(compKeyFor(s, r), (pop.get(compKeyFor(s, r)) || 0) + R.n);
      const walk = new Map();
      for (const [key, n] of pop) { const d = 3.2 * Math.sqrt(dy / gen) / Math.sqrt(Math.max(1, n) / 40); walk.set(key, [gauss() * d, gauss() * d]); }
      for (const [r, R] of s.regions) { const w = walk.get(compKeyFor(s, r)); R.mu[L.MATE] = AG.clamp(R.mu[L.MATE] + w[0], 5, 250); R.mu[L.NEUTRAL] = AG.clamp(R.mu[L.NEUTRAL] + w[1], 5, 250); }
      migrateYears(s, dy);
      if (rr() < dy * 0.02) colonise(s, Math.min(0.2, dy * 0.01));
    }
    if (Math.floor(AG.Geo.year / 50) !== Math.floor((AG.Geo.year - dy) / 50)) { speciationCheck(dy, false); extinctionCheck(); }
    Life.stats.ms = Life.stats.ms * 0.9 + (AG.now() - t0) * 0.1;
  };
  function migrateYears(s, dy) {
    const e = Life.env, m = Math.min(0.5, 0.01 * dy);
    for (const [r, R] of s.regions) {
      const x = r % RW, y = (r / RW) | 0;
      for (const v of [x < RW - 1 ? r + 1 : -1, y < RH - 1 ? r + RW : -1]) {
        if (v < 0) continue;
        const Q = s.regions.get(v); if (!Q) continue;
        if (!linked(s, r, v)) continue;
        for (let k = 0; k < NL; k++) { const a = R.mu[k], b = Q.mu[k]; R.mu[k] += (b - a) * m * 0.5; Q.mu[k] += (a - b) * m * 0.5; }
        const avg = (R.n + Q.n) / 2; R.n += (avg - R.n) * m; Q.n += (avg - Q.n) * m;
      }
    }
  }
  // People hunting a region: take up to `want` animals of an archetype; returns what they got.
  Life.harvest = function (r, arch, want, pickBig) {
    let got = 0;
    for (const s of Life.alive()) {
      if (s.arch !== arch || s.domestic) continue;
      const R = s.regions.get(r); if (!R || R.n <= 0) continue;
      const take = Math.min(R.n * (pickBig && s.mean[L.SIZE] > 190 ? 0.12 : 0.08), want - got);
      R.n -= take; got += take;
      if (R.n < 0.3) { s.regions.delete(r); s.lastLoss = 'overhunted'; }
      if (got >= want) break;
    }
    return got;
  };
  Life.regionOf = (x, y) => AG.clamp((y / RS) | 0, 0, RH - 1) * RW + AG.clamp((x / RS) | 0, 0, RW - 1);
  Life.animalsIn = function (r, arch) { let n = 0; for (const s of Life.alive()) if ((arch === undefined || s.arch === arch) && !s.sapient) { const R = s.regions.get(r); if (R) n += R.n; } return n; };

  // A herd taken into human care becomes its own population: the domestic form of a wild species.
  Life.domesticate = function (wild, r, n) {
    let d = Life.species.find((s) => s.domestic && s.wildOf === wild.id && s.died === null);
    if (!d) {
      const m = Float32Array.from(wild.mean); m[L.BOLD] = Math.max(20, m[L.BOLD] - 50); m[L.FERT] = Math.min(240, m[L.FERT] + 25);
      d = Life.newSpecies(wild.arch, m, wild, Life.when());
      d.domestic = true; d.wildOf = wild.id;
      d.domesticName = wild.mean[L.SIZE] > 185 ? 'cattle' : wild.mean[L.SPEED] > 160 ? 'horses' : wild.mean[L.SIZE] < 100 ? 'goats' : 'sheep';
      d.name = `${wild.genus} domesticus`; d.epithet = 'domesticus';
      refreshColor(d);
      Life.onEvent && Life.onEvent({ kind: 'domestication', species: d, parent: wild });
    }
    const R = d.regions.get(r) || newRegion(d.mean, 0);
    R.n += n; if (!R.nres) seedReservoir(R, 10);
    d.regions.set(r, R);
    return d;
  };

  // ------------------------------------------------------------ bodies (Watch time)
  // Census of embodied animals per species-region (for the UI and for folding).
  Life.census = function () {
    const U = AG.U; if (!U) return;
    for (const s of Life.species) s.census = 0;
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || U.sid[i] < 0) continue;
      const s = Life.species[U.sid[i]]; if (s) s.census++;
    }
    for (const s of Life.species) if (s.sapient && AG.People) s.census = AG.People.alive;
  };
  // Fold bodies back into regions: population, mean phenotype and a fresh reservoir sample.
  Life.fold = function () {
    Life.bodyArea = null;
    const U = AG.U, ph = new Float32Array(NL);
    const acc = new Map();
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || U.sid[i] < 0 || U.pid[i] >= 0) continue;
      const s = Life.species[U.sid[i]]; if (!s || s.sapient) continue;
      const r = Life.regionOf(U.x[i], U.y[i]), key = s.id * RN + r;
      let a = acc.get(key); if (!a) acc.set(key, (a = { s, r, n: 0, mu: new Float32Array(NL), ids: [] }));
      Life.phenotype(U.gen, i * GL, ph); for (let k = 0; k < NL; k++) a.mu[k] += ph[k];
      a.n++; if (a.ids.length < 12) a.ids.push(i); else if (rr() < 12 / a.n) a.ids[(rr() * 12) | 0] = i;
    }
    // The regional record stays the population; the bodies tell how it fared while watched:
    // survivors over those embodied scale it (within limits), and their genes update its mean and reservoir.
    for (const s of Life.species) {
      if (s.sapient || s.domestic) continue;
      for (const [r, R] of s.regions) {
        const a = acc.get(s.id * RN + r), cnt = a ? a.n : 0;
        if (R.emb > 0) R.n *= AG.clamp((cnt + 0.5) / (R.emb + 0.5), 0.2, 1.5); // (those that wandered off are counted where they went)
        R.emb = 0;
        if (a) acc.delete(s.id * RN + r);
        if (!a) continue;
        for (let k = 0; k < NL; k++) R.mu[k] = R.mu[k] * 0.5 + (a.mu[k] / a.n) * 0.5;
        a.ids.forEach((i, k) => R.res.set(U.gen.subarray(i * GL, i * GL + GL), k * GL)); R.nres = Math.max(R.nres, a.ids.length);
      }
    }
    for (const a of acc.values()) { // bodies that wandered into a region their species did not hold
      const R = newRegion(a.s.mean, 0);
      for (let k = 0; k < NL; k++) R.mu[k] = a.mu[k] / a.n;
      R.n = a.n * BODY_SCALE[a.s.arch];
      a.ids.forEach((i, k) => R.res.set(U.gen.subarray(i * GL, i * GL + GL), k * GL)); R.nres = a.ids.length;
      a.s.regions.set(a.r, R);
    }
    for (const s of Life.species) if (!s.sapient && !s.domestic) for (const [r, R] of s.regions) if (R.n <= 0) s.regions.delete(r);
    extinctionCheck('vanished');
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sid[i] >= 0 && U.pid[i] < 0 && Life.species[U.sid[i]] && !Life.species[U.sid[i]].domestic) AG.Ent.remove(i);
  };
  // One body stands for this many animals of the regional population.
  const BODY_SCALE = [1, 1, 1, 1, 1, 1];
  const BODY_CAP = [1500, 260, 320, 220, 0, 0]; // bodies on the map at once (the rest stay in the regional record)
  Life.bodyK = 1; // AG.Perf lowers it on slow machines
  Life.BODY_SP = null; // filled by entities.js: archetype -> body kind
  // Embody every region's population (capped per archetype) with genomes bred from the reservoir.
  // Bodies go where their kind would be (habitat.js): candidate cells of the region are scored for
  // the species now (season, weather, food, water, slope, snow, people, fire), groups of a size that
  // fits the species gather around the better ones, grazers first so predators can follow the prey.
  // Songbirds of cold lands are away in winter and bears there are in their dens. Bodies stay
  // inside their region square, so folding them back keeps the regional numbers exact.
  // On a big world bodies are embodied only in a box around the camera, about as large as a whole
  // screen-sized world (so animals stand as thick on the ground as there), and the box follows the
  // camera (Life.streamTo): regions it leaves give up their bodies, regions it reaches get theirs.
  Life.STREAM = AG.N > 400000 ? 320 : 0;
  Life.bodyFocus = null; // where the camera is (main.js), for the box
  Life.bodyArea = null;  // the box embodied now: { cx, cy, rx0, ry0, rx1, ry1 } in regions
  function areaAt(x, y) {
    const h = Life.STREAM / 2;
    const x0 = AG.clamp(x - h, 0, Math.max(0, W - Life.STREAM)), y0 = AG.clamp(y - h, 0, Math.max(0, H - Life.STREAM));
    return { cx: x, cy: y, rx0: Math.floor(x0 / RS), ry0: Math.floor(y0 / RS), rx1: Math.min(RW - 1, Math.floor((x0 + Life.STREAM) / RS)), ry1: Math.min(RH - 1, Math.floor((y0 + Life.STREAM) / RS)) };
  }
  const inBox = (a, r) => { const x = r % RW, y = (r / RW) | 0; return x >= a.rx0 && x <= a.rx1 && y >= a.ry0 && y <= a.ry1; };
  Life.streamTo = function (x, y) {
    const a = Life.bodyArea;
    if (!Life.STREAM || AG.mode !== 'watch' || !a) return false;
    if (Math.abs(x - a.cx) < Life.STREAM * 0.2 && Math.abs(y - a.cy) < Life.STREAM * 0.2) return false;
    const na = areaAt(x, y), U = AG.U;
    // bodies of the regions left behind go back into the regional record as they were
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || U.sid[i] < 0 || U.pid[i] >= 0) continue;
      const s = Life.species[U.sid[i]]; if (!s || s.sapient || s.domestic) continue;
      if (!inBox(na, Life.regionOf(U.x[i], U.y[i]))) AG.Ent.remove(i);
    }
    for (const s of Life.alive()) if (!s.sapient && !s.domestic) for (const [r, R] of s.regions) if (R.emb && !inBox(na, r)) R.emb = 0;
    Life.embody(na, a);
    return true;
  };
  Life.embody = function (area, had) {
    const Hab = AG.Habitat;
    if (Life.STREAM && !area) area = areaAt(Life.bodyFocus ? Life.bodyFocus.x : W / 2, Life.bodyFocus ? Life.bodyFocus.y : H / 2);
    if (area) Life.bodyArea = area;
    const want = (r) => !area || (inBox(area, r) && !(had && inBox(had, r))); // (streaming: only the regions newly in the box)
    const tot = [0, 0, 0, 0, 0, 0];
    for (const s of Life.alive()) if (!s.sapient && !s.domestic && !isSea(s.arch)) for (const [r, R] of s.regions) if (!area || inBox(area, r)) tot[s.arch] += R.n;
    const k = tot.map((t, a) => (t > BODY_CAP[a] * Life.bodyK ? (BODY_CAP[a] * Life.bodyK) / t : 1));
    if (Hab) Hab.refresh();
    const list = Life.alive().filter((s) => !s.sapient && !s.domestic && !isSea(s.arch));
    list.sort((a, b) => (a.arch === ARCH.GRAZER ? 0 : 1) - (b.arch === ARCH.GRAZER ? 0 : 1) || a.id - b.id);
    let preyDone = false;
    for (const s of list) {
      if (Hab && !preyDone && s.arch !== ARCH.GRAZER) { Hab.refreshPrey(); preyDone = true; }
      const wants = [];
      for (const [r, R] of s.regions) {
        if (!want(r)) continue;
        R.emb = 0; syncReservoir(R);
        const w = R.n * k[s.arch], n = Math.floor(w) + (rr() < w % 1 ? 1 : 0);
        if (n > 0) wants.push({ r, R, n });
      }
      slotsOut = false;
      if (Hab) placeByHabitat(s, Hab.profile(s), wants); else for (const w of wants) w.R.emb = placeAnywhere(s, w.r, w.R, w.n);
      if (slotsOut) return; // every body slot is taken
    }
  };
  // Each sets R.emb (or returns how many it placed); slotsOut is set when no body slot is left.
  let slotsOut = false;
  function placeAnywhere(s, r, R, want) {
    const Ent = AG.Ent, x0 = (r % RW) * RS, y0 = ((r / RW) | 0) * RS;
    let m = 0;
    for (let tries = 0; m < want && tries < want * 12; tries++) {
      const x = x0 + rr() * RS, y = y0 + rr() * RS;
      if (x >= W || y >= H) continue;
      const i = (y | 0) * W + (x | 0);
      if (s.arch !== ARCH.BIRD && (!Wd.passLand(i) || Wd.ice[i])) continue;
      if (Ent.spawnCreature(s, x, y, R) < 0) { slotsOut = true; break; }
      m++;
    }
    return m;
  }
  // A species' animals over all its regions, in groups: a region is picked by how many animals it
  // should still hold, a spot in it by habitat (candidates scored, squared so good ground wins
  // clearly), and a whole herd, pack or flock settles around that spot inside the region square.
  // Many thinly spread animals so become fewer, real herds in the best places nearby.
  function placeByHabitat(s, p, wants) {
    const Hab = AG.Habitat, Ent = AG.Ent, U = AG.U;
    let left = 0;
    for (const w of wants) {
      const x0 = (w.r % RW) * RS, y0 = ((w.r / RW) | 0) * RS;
      w.x0 = x0; w.y0 = y0; w.x1 = Math.min(W, x0 + RS); w.y1 = Math.min(H, y0 + RS);
      const mid = Math.min(H - 1, (y0 + w.y1) >> 1) * W + Math.min(W - 1, (x0 + w.x1) >> 1);
      if (p.migrant && Hab.migrated(mid)) w.n = Math.floor(w.n * 0.3 + rr() * 0.99); // most have flown south
      w.den = p.hibernator && Hab.denWeather(mid) ? { den: true } : null;
      w.cand = null;
      left += w.n;
    }
    const total = left;
    for (let guard = 0; left > 0 && guard < total * 2 + 8; guard++) {
      let sum = 0;
      for (const w of wants) if (w.n > 0) sum += w.n;
      if (sum <= 0) break;
      let t = rr() * sum, w = null;
      for (const q of wants) { if (q.n <= 0) continue; w = q; if ((t -= q.n) < 0) break; }
      if (!w.cand) sampleRegion(Hab, p, w);
      if (!w.tw) { left -= w.n; w.n = 0; continue; } // nowhere here an animal of this kind could stand
      let u = rr() * w.tw, q = 0;
      while (q < w.cand.length - 1 && u >= w.cw[q]) { u -= w.cw[q]; q++; }
      const c = w.cand[q], cx = (c % W) + 0.5, cy = ((c / W) | 0) + 0.5;
      const g = Math.min(Hab.groupSize(p, rr), left), spread = (0.6 + Math.sqrt(g) * 0.55) * (p.bird ? 1.5 : 1);
      for (let k = 0; k < g; k++) {
        let x = cx + (rr() - 0.5) * 0.6, y = cy + (rr() - 0.5) * 0.6;
        for (let t2 = 0; t2 < 6; t2++) {
          const ax = AG.clamp(cx + gauss() * spread, w.x0, w.x1 - 0.01), ay = AG.clamp(cy + gauss() * spread, w.y0, w.y1 - 0.01);
          if (Hab.score(p, (ay | 0) * W + (ax | 0), w.den) > 0) { x = ax; y = ay; break; }
        }
        const b = Ent.spawnCreature(s, x, y, w.R);
        if (b < 0) { slotsOut = true; return; }
        w.R.emb++;
        if (w.den) { U.task[b] = AG.TK.HIBERNATE; U.st[b] = AG.ST.WORK; U.tm[b] = (1 - AG.Sky.yearFrac()) * AG.YEAR_TICKS + 30 + rr() * 200; }
      }
      left -= g; w.n -= g;
      w.tw -= w.cw[q] * 0.85; w.cw[q] *= 0.15; // the next group settles somewhere else
    }
  }
  function sampleRegion(Hab, p, w) {
    const C = Math.min(64, 20 + w.n * 4), cand = [], cw = [];
    let tw = 0;
    for (let q = 0; q < C; q++) {
      const x = w.x0 + ((rr() * (w.x1 - w.x0)) | 0), y = w.y0 + ((rr() * (w.y1 - w.y0)) | 0), i = y * W + x;
      const v = Hab.score(p, i, w.den);
      if (v <= 0) continue;
      cand.push(i); cw.push(v * v); tw += v * v;
    }
    w.cand = cand; w.cw = cw; w.tw = tw;
  }

  // ------------------------------------------------------------ queries for the UI
  Life.tree = function () { // phylogeny rows: depth-first from the founders
    const rows = [], visit = (s, depth) => { rows.push({ s, depth }); for (const k of s.kids) visit(Life.species[k], depth + 1); };
    for (const s of Life.species) if (s.parent < 0) visit(s, 0);
    return rows;
  };
  Life.lineage = function (s) { const out = []; while (s) { out.push(s); s = s.parent >= 0 ? Life.species[s.parent] : null; } return out; };
})();
