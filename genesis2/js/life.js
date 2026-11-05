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
  const ARCH = { GRAZER: 0, PREDATOR: 1, BIRD: 2, PRIMATE: 3 };
  const ARCHS = ['grazer', 'predator', 'bird', 'primate'];
  const GEN_YEARS = [4, 5, 2, 18];     // generation time
  const GROWTH = [0.3, 0.14, 0.45, 0.06]; // intrinsic growth per year
  const SPECIATE = 40;                 // MATE divergence that ends interbreeding

  const Life = (AG.Life = {
    NL, GL, L, LOCI, RS, RW, RH, RN, ARCH, ARCHS, GEN_YEARS, SPECIATE,
    species: [], extinctions: 0, speciations: 0, massExtinctions: 0,
    env: { land: new Float32Array(RN), temp: new Float32Array(RN), precip: new Float32Array(RN), forest: new Float32Array(RN), ice: new Float32Array(RN), mass: new Int32Array(RN), massSize: [], open: new Float32Array(RN), cells: [] },
    stats: { ms: 0 },
  });
  let rng = Math.random;
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
  const GEN_B = [['otherium', 'oceros', 'obos', 'ohippus', 'olophus', 'odon', 'aceros', 'elaphus'], ['ocanis', 'ofelis', 'odromus', 'olestes', 'ictis', 'osmilus'], ['ornis', 'opteryx', 'avis', 'orhynchus'], ['opithecus', 'anthropus', 'osimia', 'ocebus']];
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
  function commonName(sp) {
    const m = sp.mean;
    if (sp.sapient) return 'people';
    if (sp.domestic) return sp.domesticName || 'herd beast';
    if (sp.arch === ARCH.GRAZER) return m[L.SIZE] > 205 && m[L.COLD] > 150 ? 'mammoth' : m[L.SIZE] > 190 ? 'aurochs' : m[L.SIZE] > 165 ? (m[L.COLD] > 150 ? 'bison' : 'elk') : m[L.SPEED] > 165 ? (m[L.SOCIAL] > 160 ? 'wild horse' : 'gazelle') : m[L.SIZE] < 90 ? 'ibex' : 'deer';
    if (sp.arch === ARCH.PREDATOR) return m[L.SIZE] > 190 ? 'bear' : m[L.SOCIAL] > 150 ? 'wolf' : m[L.SPEED] > 160 ? 'great cat' : 'hyena';
    if (sp.arch === ARCH.BIRD) return m[L.SIZE] > 130 ? 'great bird' : m[L.COGN] > 140 ? 'crow' : 'songbird';
    return m[L.COGN] > 170 ? 'hominin' : m[L.SIZE] > 150 ? 'great ape' : 'monkey';
  }
  Life.commonName = commonName;

  // ------------------------------------------------------------ species registry
  Life.newSpecies = function (arch, mean, parent, when) {
    const sp = { id: Life.species.length, arch, parent: parent ? parent.id : -1, born: when, died: null, cause: '', mean: Float32Array.from(mean), census: 0, regions: new Map(), sapient: false, domestic: false, wildOf: -1, island: false, kids: [], hue: 0, peak: 0, color: [0, 0, 0] };
    nameFor(sp, parent);
    if (parent) parent.kids.push(sp.id);
    refreshColor(sp);
    Life.species.push(sp);
    return sp;
  };
  function refreshColor(sp) {
    const m = sp.mean, hue = m[L.HUE] / 255;
    const base = sp.arch === ARCH.PREDATOR ? [128, 124, 134] : sp.arch === ARCH.BIRD ? [70, 70, 84] : sp.arch === ARCH.PRIMATE ? [116, 82, 58] : [176, 122, 72];
    const light = 1.45 - hue * 0.95, cold = m[L.COLD] / 255;
    sp.color = base.map((c, i) => AG.clamp(c * light + cold * 40 * (i === 2 ? 1.2 : 1), 10, 250) | 0);
    if (hue < 0.06) sp.color = [236, 228, 214];
    sp.common = commonName(sp);
  }
  Life.refreshColor = refreshColor;
  Life.alive = () => Life.species.filter((s) => s.died === null);
  Life.byArch = (a) => Life.species.filter((s) => s.died === null && s.arch === a);
  Life.when = () => (AG.Geo.phase === 'deep' ? { mya: AG.Geo.mya } : { year: Math.floor(AG.Geo.year) });
  Life.whenLabel = (w) => (!w ? '' : w.mya !== undefined ? (w.mya > 0 ? `${w.mya.toFixed(0)} Mya` : 'the Dawn') : `Year ${(w.year + 1).toLocaleString('en-US')}`);

  // ------------------------------------------------------------ regional environment
  // Land share, climate and forest per 16x16 region, and which landmass each region belongs to.
  Life.envFromGeo = function () {
    const G = AG.Geo, e = Life.env, sl = SEA + G.seaLevel, per = RS / G.CS;
    e.land.fill(0); e.temp.fill(0); e.precip.fill(0); e.ice.fill(0);
    for (let c = 0; c < G.GN; c++) {
      const gx = c % G.GW, gy = (c / G.GW) | 0, r = ((gy / per) | 0) * RW + ((gx / per) | 0);
      if (r >= RN) continue;
      if (G.crust[c] > sl) { e.land[r] += 1; e.temp[r] += G.temp[c]; e.precip[r] += G.precip[c]; e.ice[r] += Math.min(1, G.ice[c] * 2); }
    }
    for (let r = 0; r < RN; r++) {
      const n = e.land[r];
      if (n) { e.temp[r] /= n; e.precip[r] /= n; e.ice[r] /= n; }
      e.land[r] = n / (per * per);
      e.forest[r] = AG.clamp((e.precip[r] - 0.25) * 1.6, 0, 1) * AG.smooth(0.12, 0.3, e.temp[r]) * (1 - e.ice[r]);
      e.open[r] = 1 - e.forest[r];
    }
    landmasses();
  };
  Life.envFromWorld = function () {
    const e = Life.env, { elev, tbase, moist, veg, ice } = Wd;
    const cnt = new Float32Array(RN);
    e.land.fill(0); e.temp.fill(0); e.precip.fill(0); e.forest.fill(0); e.ice.fill(0);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = y * W + x, r = ((y / RS) | 0) * RW + ((x / RS) | 0);
      cnt[r]++;
      if (elev[i] < SEA || (Wd.fl[i] > 0.05 && !Wd.frozen[i])) continue;
      e.land[r]++; e.temp[r] += Wd.Tc(i); e.precip[r] += moist[i]; e.forest[r] += veg[i] >= 165 ? 1 : veg[i] / 330; e.ice[r] += ice[i] ? 1 : 0;
    }
    for (let r = 0; r < RN; r++) {
      const n = e.land[r];
      if (n) { e.temp[r] /= n; e.precip[r] /= n; e.forest[r] /= n; e.ice[r] /= n; }
      e.land[r] = cnt[r] ? n / cnt[r] : 0;
      e.open[r] = 1 - e.forest[r];
    }
    landmasses();
  };
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
    const e = Life.env, t = e.temp[r], open = e.open[r], forest = e.forest[r], ms = e.mass[r] >= 0 ? e.massSize[e.mass[r]] : 0;
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
      case ARCH.BIRD:
        out[L.SIZE] = 50 + open * 40; out[L.SPEED] = 200; out[L.SOCIAL] = 160; out[L.BOLD] = 90; out[L.SENSE] = 190;
        out[L.STR] = 50; out[L.METAB] = 190; out[L.COGN] = 100 + forest * 40; out[L.FERT] = 170; out[L.LIFE] = 70;
        break;
      default: // primates: open, changeable country rewards social, clever generalists
        out[L.SIZE] = 110 + open * 40 + (0.5 - t) * 40; out[L.SPEED] = 110; out[L.SOCIAL] = 130 + open * 90; out[L.BOLD] = 130;
        out[L.SENSE] = 140; out[L.STR] = 120 - open * 20; out[L.METAB] = 130; out[L.COGN] = 120 + open * 90 + Math.abs(t - 0.45) * 60;
        out[L.FERT] = 90; out[L.LIFE] = 160;
    }
    out[L.MATE] = -1; out[L.NEUTRAL] = -1; // neutral: drift only
    return out;
  }
  Life.optimum = (arch, r) => Array.from(optimum(arch, r, new Float32Array(NL)));
  // how well a mean phenotype fits a region (0..1): temperature dominates, then body plan
  function fit(arch, mu, r) {
    optimum(arch, r, opt);
    const dc = (mu[L.COLD] - opt[L.COLD]) / 70, dh = (mu[L.HEAT] - opt[L.HEAT]) / 70, ds = (mu[L.SIZE] - opt[L.SIZE]) / 110;
    return Math.exp(-(Math.max(0, dc) * 0 + dc * dc * 0.5 + dh * dh * 0.5 + ds * ds * 0.25));
  }
  Life.fit = fit;

  // food a region offers an archetype (relative units; scaled into head counts by CAP)
  const CAP = [26, 3, 6, 4];
  function forage(arch, r, prey) {
    const e = Life.env, land = e.land[r] * (1 - e.ice[r] * 0.9), t = e.temp[r];
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

  // ------------------------------------------------------------ deep time
  Life.init = function (seed) {
    rng = AG.mulberry32((Math.imul(seed, 1597334677) ^ 0x2545f491) >>> 0);
    Life.species = []; Life.extinctions = 0; Life.speciations = 0; Life.massExtinctions = 0; Life.macro = 0;
    Life.envFromGeo();
    // five founding lineages on the supercontinent, 250 million years ago
    const base = (arch) => { const m = new Float32Array(NL).fill(128); m[L.MATE] = 128; m[L.NEUTRAL] = 128; m[L.HUE] = 110; return m; };
    const founders = [
      [ARCH.GRAZER, { SIZE: 130, SPEED: 130, SOCIAL: 140, BOLD: 90, COLD: 110, HEAT: 120 }],
      [ARCH.GRAZER, { SIZE: 170, SPEED: 100, SOCIAL: 90, BOLD: 120, COLD: 130, HEAT: 100 }],
      [ARCH.PREDATOR, { SIZE: 140, SPEED: 150, SOCIAL: 120, BOLD: 190, STR: 170 }],
      [ARCH.BIRD, { SIZE: 60, SPEED: 200, SOCIAL: 150 }],
      [ARCH.PRIMATE, { SIZE: 110, COGN: 120, SOCIAL: 140, COLD: 80, HEAT: 150 }],
    ];
    let mass = -1, best = 0;
    for (let k = 0; k < Life.env.massSize.length; k++) if (Life.env.massSize[k] > best) { best = Life.env.massSize[k]; mass = k; }
    for (const [arch, over] of founders) {
      const m = base(arch); for (const k in over) m[L[k]] = over[k];
      const sp = Life.newSpecies(arch, m, null, { mya: AG.Geo.mya });
      for (let r = 0; r < RN; r++) {
        if (Life.env.mass[r] !== mass || Life.env.land[r] < 0.3) continue;
        if (rr() < 0.5) {
          const R = newRegion(m, 1); optimum(arch, r, opt);
          for (let k = 0; k < NL; k++) if (opt[k] >= 0 && k !== L.HUE) R.mu[k] = (R.mu[k] + opt[k]) / 2;
          seedReservoir(R, 14); sp.regions.set(r, R);
        }
      }
    }
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
    const prey = new Float32Array(RN);
    for (const s of sp) if (s.arch === ARCH.GRAZER) for (const [r, R] of s.regions) prey[r] += R.n;
    // adaptation toward each region's optimum; neutral loci drift together across each connected
    // population (one random walk per landmass), so only separated populations pull apart
    for (const s of sp) {
      const walk = new Map();
      for (const [r, R] of s.regions) {
        if (Life.env.land[r] < 0.06 && s.arch !== ARCH.BIRD) { s.regions.delete(r); s.lastLoss = 'drowned'; continue; }
        optimum(s.arch, r, opt);
        for (let k = 0; k < NL; k++) if (opt[k] >= 0) R.mu[k] += (opt[k] - R.mu[k]) * adapt;
        const key = compKey(r);
        let w = walk.get(key); if (!w) walk.set(key, (w = [gauss() * drift, gauss() * drift]));
        R.mu[L.MATE] = AG.clamp(R.mu[L.MATE] + w[0], 5, 250); R.mu[L.NEUTRAL] = AG.clamp(R.mu[L.NEUTRAL] + w[1], 5, 250);
      }
    }
    // competition: same archetype in the same region shares the food by fitness
    const share = new Map();
    for (const s of sp) for (const [r, R] of s.regions) { R.fit = fit(s.arch, R.mu, r); const k = s.arch * RN + r; share.set(k, (share.get(k) || 0) + R.fit * R.fit); }
    let preyFresh = false;
    for (const s of sp) {
      if (s.arch === ARCH.PREDATOR && !preyFresh) { prey.fill(0); for (const g of sp) if (g.arch === ARCH.GRAZER) for (const [r, R] of g.regions) prey[r] += R.n; preyFresh = true; }
      for (const [r, R] of s.regions) {
        const K = CAP[s.arch] * forage(s.arch, r, prey[r]) * Math.sqrt(R.fit) * (R.fit * R.fit / Math.max(1e-6, share.get(s.arch * RN + r)));
        R.n = K * (1 - Math.min(0.9, stress * 6 * (s.arch === ARCH.BIRD ? 0.5 : 1)));
        if (R.n < 0.4) { s.regions.delete(r); s.lastLoss = s.lastLoss || (s.arch === ARCH.PREDATOR ? 'prey vanished' : 'outcompeted'); continue; }
      }
      migrate(s, dt);
      colonise(s, dt);
    }
    speciationCheck(dt, true);
    extinctionCheck();
    if (G.phase === 'deep' && G.mya < 245 && rr() < dt / 95) massExtinction();
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
        if (s.arch !== ARCH.BIRD && (e.mass[r] !== e.mass[v] || e.mass[r] < 0)) continue;
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
        if (v < 0 || s.regions.has(v) || e.land[v] < 0.15) continue;
        const sameMass = e.mass[v] === e.mass[r];
        if (!sameMass && s.arch !== ARCH.BIRD && rr() > 0.004 * dt) continue; // rafting across a strait is rare
        if (fit(s.arch, R.mu, v) < 0.15) continue;
        if (rr() < Math.min(1, 0.8 * dt)) add.push([v, R]);
      }
    }
    for (const [v, R] of add) if (!s.regions.has(v)) { const Q = newRegion(R.mu, 0.5); Q.res.set(R.res); Q.nres = R.nres; s.regions.set(v, Q); }
  }

  // Split each species by landmass; a piece whose MATE signal has drifted too far away becomes a
  // new species, descended from the old.
  const compKey = (r) => Life.env.mass[r];
  Life.compKey = compKey;
  function speciationCheck(dt, deep) {
    const e = Life.env;
    for (const s of Life.alive()) {
      if (s.regions.size < 2 || s.domestic || s.sapient) continue;
      const comps = new Map();
      for (const [r, R] of s.regions) {
        const key = compKey(r);
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
        refreshColor(child);
        Life.speciations++;
        Life.onEvent && Life.onEvent({ kind: 'speciation', species: child, parent: s });
      }
    }
  }
  Life.speciationCheck = speciationCheck;
  function extinctionCheck(cause) {
    for (const s of Life.alive()) {
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
    AG.Geo.events.push({ kind: 'lip', mya: AG.Geo.mya });
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
      const s = Life.newSpecies(ARCH.PRIMATE, m, null, { mya: 0 });
      for (let r = 0; r < RN; r++) if (Life.env.land[r] > 0.5 && Life.env.temp[r] > 0.45) { const R = newRegion(m, 2); seedReservoir(R, 12); s.regions.set(r, R); if (s.regions.size > 6) break; }
      best = { s };
    }
    const p = Life.newSpecies(ARCH.PRIMATE, best.s.mean, best.s, { mya: 0 });
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
  Life.yearStep = function (dy) {
    const t0 = AG.now();
    if (Math.floor(AG.Geo.year / 50) !== Math.floor((AG.Geo.year - dy) / 50) || !Life.envYear) { Life.envFromWorld(); Life.envYear = AG.Geo.year; }
    const prey = new Float32Array(RN), pred = new Float32Array(RN);
    const sp = Life.alive();
    for (const s of sp) for (const [r, R] of s.regions) { if (s.arch === ARCH.GRAZER) prey[r] += R.n; else if (s.arch === ARCH.PREDATOR) pred[r] += R.n; }
    const share = new Map();
    for (const s of sp) for (const [r, R] of s.regions) { R.fit = fit(s.arch, R.mu, r); const k = s.arch * RN + r; share.set(k, (share.get(k) || 0) + R.fit * R.fit); }
    for (const s of sp) {
      if (s.sapient) continue; // people live in communities, not regions
      const gen = GEN_YEARS[s.arch], grow = GROWTH[s.arch];
      for (const [r, R] of s.regions) {
        if (Life.env.land[r] < 0.06 && s.arch !== ARCH.BIRD) { s.regions.delete(r); s.lastLoss = 'drowned range'; continue; }
        const K = Math.max(0.01, CAP[s.arch] * forage(s.arch, r, prey[r]) * R.fit * R.fit / Math.max(1e-6, share.get(s.arch * RN + r)) * R.fit) * (s.domestic ? 0 : 1);
        if (s.domestic) continue; // herds are kept by people (civ.js)
        let dn = grow * R.n * (1 - R.n / K) * dy;
        if (s.arch === ARCH.GRAZER && pred[r] > 0) dn -= Math.min(R.n * 0.3, pred[r] * 0.9 * dy * R.n / (R.n + 5));
        R.n = Math.max(0, R.n + dn);
        optimum(s.arch, r, opt);
        const sel = Math.min(1, 0.012 * dy / gen);
        for (let k = 0; k < NL; k++) if (opt[k] >= 0) R.mu[k] += (opt[k] - R.mu[k]) * sel;
        if (R.n < 0.3) { s.regions.delete(r); continue; }
      }
      // neutral drift per connected population: smaller populations drift faster
      const pop = new Map();
      for (const [r, R] of s.regions) pop.set(compKey(r), (pop.get(compKey(r)) || 0) + R.n);
      const walk = new Map();
      for (const [key, n] of pop) { const d = 3.2 * Math.sqrt(dy / gen) / Math.sqrt(Math.max(1, n) / 40); walk.set(key, [gauss() * d, gauss() * d]); }
      for (const [r, R] of s.regions) { const w = walk.get(compKey(r)); R.mu[L.MATE] = AG.clamp(R.mu[L.MATE] + w[0], 5, 250); R.mu[L.NEUTRAL] = AG.clamp(R.mu[L.NEUTRAL] + w[1], 5, 250); }
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
        if (s.arch !== ARCH.BIRD && (e.mass[r] !== e.mass[v] || e.mass[r] < 0)) continue;
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
    for (const s of Life.species) if (!s.sapient) for (const R of s.regions.values()) R.n = s.domestic ? R.n : 0; // bodies were the population
    for (const a of acc.values()) {
      const R = a.s.regions.get(a.r) || newRegion(a.s.mean, 0);
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
  const BODY_SCALE = [1, 1, 1, 1];
  const BODY_CAP = [3200, 520, 600, 420];
  Life.BODY_SP = null; // filled by entities.js: archetype -> body kind
  // Embody every region's population (capped per archetype) with genomes bred from the reservoir.
  Life.embody = function () {
    const Ent = AG.Ent, U = AG.U;
    const tot = [0, 0, 0, 0];
    for (const s of Life.alive()) if (!s.sapient && !s.domestic) for (const R of s.regions.values()) tot[s.arch] += R.n;
    const k = tot.map((t, a) => (t > BODY_CAP[a] ? BODY_CAP[a] / t : 1));
    for (const s of Life.alive()) {
      if (s.sapient || s.domestic) continue;
      for (const [r, R] of s.regions) {
        let want = R.n * k[s.arch]; want = Math.floor(want) + (rr() < want % 1 ? 1 : 0);
        const x0 = (r % RW) * RS, y0 = ((r / RW) | 0) * RS;
        for (let m = 0, tries = 0; m < want && tries < want * 12; tries++) {
          const x = x0 + rr() * RS, y = y0 + rr() * RS;
          if (x >= W || y >= H) continue;
          const i = (y | 0) * W + (x | 0);
          if (s.arch !== ARCH.BIRD && (!Wd.passLand(i) || Wd.ice[i])) continue;
          const b = Ent.spawnCreature(s, x, y, R);
          if (b < 0) return;
          m++;
        }
      }
    }
  };

  // ------------------------------------------------------------ queries for the UI
  Life.tree = function () { // phylogeny rows: depth-first from the founders
    const rows = [], visit = (s, depth) => { rows.push({ s, depth }); for (const k of s.kids) visit(Life.species[k], depth + 1); };
    for (const s of Life.species) if (s.parent < 0) visit(s, 0);
    return rows;
  };
  Life.lineage = function (s) { const out = []; while (s) { out.push(s); s = s.parent >= 0 ? Life.species[s.parent] : null; } return out; };
})();
