/* AURA: Genesis 2 — habitat.js
 * Where an animal would choose to be. Each species gets a profile read from its mean genes and
 * common name (temperature it is built for, open ground or forest, slopes, water, shyness,
 * snow, prey), and score(profile, cell) says how good a cell is for it right now: the season and
 * the weather move the temperature, snow buries grass, summer heat raises thirst, fire and
 * people push the shy away.
 * Coarse maps over 4x4-cell blocks (distance to fresh water, to settlements, to fire, and where
 * grazers actually are) keep each score a handful of array reads. They are rebuilt when animals
 * are embodied and refreshed every few seconds of Watch time; nothing here uses randomness
 * except through the caller's generator, so runs stay deterministic. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, Life = AG.Life;
  const { W, H, SEA, FT, SO } = AG;
  const L = Life.L, ARCH = Life.ARCH;
  const B = 4, BW = Math.ceil(W / B), BH = Math.ceil(H / B), BN = BW * BH;
  const FAR = 250;

  const Hab = (AG.Habitat = {
    B, BW, BH,
    waterD: new Uint8Array(BN).fill(FAR), // blocks to the nearest fresh water
    peopleD: new Uint8Array(BN).fill(FAR), // blocks to the nearest building or busy road
    fireD: new Uint8Array(BN).fill(FAR),  // blocks to fire or lava
    prey: new Float32Array(BN),           // grazers nearby, 0..1
    stamp: 0, clock: 0, preyClock: 0,
    stats: { refreshes: 0, ms: 0 },
  });
  const smooth = AG.smooth, clamp = AG.clamp;
  const blockOf = (x, y) => clamp((y / B) | 0, 0, BH - 1) * BW + clamp((x / B) | 0, 0, BW - 1);
  Hab.blockOf = blockOf;

  // ------------------------------------------------------------ coarse maps
  // two-pass chamfer distance over the block grid (seeds hold 0)
  function distance(d) {
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const b = y * BW + x; let v = d[b];
      if (x > 0 && d[b - 1] + 1 < v) v = d[b - 1] + 1;
      if (y > 0 && d[b - BW] + 1 < v) v = d[b - BW] + 1;
      if (x > 0 && y > 0 && d[b - BW - 1] + 1 < v) v = d[b - BW - 1] + 1;
      if (x < BW - 1 && y > 0 && d[b - BW + 1] + 1 < v) v = d[b - BW + 1] + 1;
      d[b] = v;
    }
    for (let y = BH - 1; y >= 0; y--) for (let x = BW - 1; x >= 0; x--) {
      const b = y * BW + x; let v = d[b];
      if (x < BW - 1 && d[b + 1] + 1 < v) v = d[b + 1] + 1;
      if (y < BH - 1 && d[b + BW] + 1 < v) v = d[b + BW] + 1;
      if (x < BW - 1 && y < BH - 1 && d[b + BW + 1] + 1 < v) v = d[b + BW + 1] + 1;
      if (x > 0 && y < BH - 1 && d[b + BW - 1] + 1 < v) v = d[b + BW - 1] + 1;
      d[b] = v;
    }
  }
  // fresh water an animal can drink from: rivers, lakes and pools on land (not the salt sea)
  Hab.fresh = (i) => Wd.fl[i] > 0.012 && Wd.ft[i] === FT.WATER && !Wd.frozen[i] && Wd.elev[i] >= SEA - 0.004;
  // Water, settlements and fire: the slow-changing maps.
  Hab.refresh = function () {
    const t0 = AG.now();
    if (AG.Sky.updateSeason) AG.Sky.updateSeason(); // (time may have jumped since the sky last ticked)
    const { waterD, peopleD, fireD } = Hab, { fl, ft, bgrid, traffic, fire } = Wd;
    waterD.fill(FAR); peopleD.fill(FAR); fireD.fill(FAR);
    for (let y = 0; y < H; y++) {
      const row = ((y / B) | 0) * BW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, b = row + ((x / B) | 0);
        if (fl[i] > 0.012) {
          if (ft[i] === FT.LAVA) fireD[b] = 0;
          else if (waterD[b] && Hab.fresh(i)) waterD[b] = 0;
        }
        if (bgrid[i] || traffic[i] > 120) peopleD[b] = 0;
        if (fire[i]) fireD[b] = 0;
      }
    }
    distance(waterD); distance(peopleD); distance(fireD);
    Hab.refreshPrey();
    Hab.stamp++; profiles.clear();
    Hab.stats.refreshes++; Hab.stats.ms = AG.now() - t0;
  };
  // Where the grazers are, blurred over ~3 blocks, as 0..1 (predators follow it).
  const raw = new Float32Array(BN), tmp = new Float32Array(BN);
  Hab.refreshPrey = function () {
    const U = AG.U, SP = AG.SP; raw.fill(0);
    if (U) for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sp[i] === SP.GRAZER && !(U.flags[i] & AG.FL.DOMESTIC)) raw[blockOf(U.x[i], U.y[i])] += 1;
    // box blur radius 3 (rows then columns)
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { let s = 0; for (let k = -3; k <= 3; k++) { const xx = x + k; if (xx >= 0 && xx < BW) s += raw[y * BW + xx]; } tmp[y * BW + x] = s; }
    const P = Hab.prey;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { let s = 0; for (let k = -3; k <= 3; k++) { const yy = y + k; if (yy >= 0 && yy < BH) s += tmp[yy * BW + x]; } P[y * BW + x] = 1 - Math.exp(-s / 6); }
    Hab.preyClock = 0;
  };
  // Watch-time upkeep: prey every ~2 s, the rest every ~2 days.
  Hab.tick = function () {
    if (++Hab.preyClock >= 120) Hab.refreshPrey();
    if (++Hab.clock >= 960) { Hab.clock = 0; Hab.refresh(); }
  };

  // ------------------------------------------------------------ profiles
  // what each common kind looks for (open: open-ground food; cover: forest; slope/high: -1 avoids,
  // +1 seeks; water: how much it needs to drink; snow: copes with snow; prey: hunts; people: >0
  // drawn to farms and towns (crows), otherwise shyness comes from the BOLD gene)
  const KIND = {
    mammoth: { open: 0.9, cover: 0.15, slope: -0.8, high: -0.3, water: 0.6, snow: 0.8 },
    bison: { open: 1, cover: 0.1, slope: -0.6, high: -0.3, water: 0.6, snow: 0.6 },
    aurochs: { open: 0.75, cover: 0.35, slope: -0.6, high: -0.3, water: 0.8, snow: 0.25 },
    elk: { open: 0.35, cover: 0.85, slope: -0.1, high: 0, water: 0.8, snow: 0.5 },
    deer: { open: 0.4, cover: 0.8, slope: 0, high: 0, water: 0.6, snow: 0.3 },
    'wild horse': { open: 1, cover: 0.05, slope: -0.4, high: -0.1, water: 0.7, snow: 0.35 },
    gazelle: { open: 1, cover: 0, slope: -0.3, high: -0.2, water: 0.3, snow: 0.1 },
    ibex: { open: 0.65, cover: 0.15, slope: 1, high: 1, water: 0.3, snow: 0.7 },
    bear: { open: 0.25, cover: 0.9, slope: 0.4, high: 0.2, water: 0.8, snow: 0.6, prey: 0.3 },
    wolf: { open: 0.6, cover: 0.5, slope: 0, high: 0, water: 0.5, snow: 0.7, prey: 1 },
    'great cat': { open: 0.45, cover: 0.75, slope: 0.1, high: 0, water: 0.5, snow: 0.3, prey: 1 },
    hyena: { open: 1, cover: 0.1, slope: -0.2, high: -0.2, water: 0.5, snow: 0.1, prey: 0.8 },
    'great bird': { open: 0.7, cover: 0.2, slope: 1, high: 1, water: 0.3, snow: 0.6 },
    crow: { open: 0.75, cover: 0.4, slope: 0, high: 0, water: 0.3, snow: 0.6, people: 0.6 },
    songbird: { open: 0.3, cover: 0.95, slope: 0, high: -0.2, water: 0.45, snow: 0.2 },
    monkey: { open: 0.1, cover: 1, slope: 0, high: -0.2, water: 0.5, snow: 0 },
    'great ape': { open: 0.15, cover: 1, slope: 0, high: 0, water: 0.45, snow: 0 },
    hominin: { open: 0.55, cover: 0.55, slope: -0.1, high: -0.1, water: 1, snow: 0.1 },
  };
  const ARCH_KIND = ['deer', 'wolf', 'songbird', 'monkey'];
  const profiles = new Map();
  // The temperature a species is built for, from the same gene-to-climate rule the regions use
  // (life.js optimum): COLD = (0.62 - t) * 520, HEAT = (t - 0.42) * 560.
  function preferredT(m) {
    const c = m[L.COLD], h = m[L.HEAT], tc = 0.62 - c / 520, th = 0.42 + h / 560;
    if (c > 24 && h > 24) return (tc + th) / 2;
    if (c > 24) return tc;
    if (h > 24) return th;
    return 0.52;
  }
  Hab.profile = function (s) {
    let p = profiles.get(s.id);
    if (p) return p;
    const m = s.mean, name = Life.commonName(s), k = KIND[name] || KIND[ARCH_KIND[s.arch]];
    p = {
      id: s.id, arch: s.arch, name, tp: preferredT(m), tol: 0.15,
      lo: 0.32 - (m[L.COLD] / 255) * 0.5, hi: 0.82 + (m[L.HEAT] / 255) * 0.45,
      open: k.open, cover: k.cover, slope: k.slope, high: k.high, water: k.water, snow: k.snow, prey: k.prey || 0,
      people: k.people || 0, shy: clamp(1.15 - m[L.BOLD] / 200, 0.1, 1), social: m[L.SOCIAL] / 255,
      bird: s.arch === ARCH.BIRD, migrant: name === 'songbird', hibernator: name === 'bear', climber: k.high > 0.5,
    };
    profiles.set(s.id, p);
    return p;
  };
  Hab.clearProfiles = () => profiles.clear();

  // ------------------------------------------------------------ scoring
  // steepness 0..1 from the neighbouring heights
  Hab.slope = function (i) {
    const x = i % W, y = (i / W) | 0, e = Wd.elev;
    const a = x > 0 ? e[i - 1] : e[i], b = x < W - 1 ? e[i + 1] : e[i], c = y > 0 ? e[i - W] : e[i], d = y < H - 1 ? e[i + W] : e[i];
    return clamp((Math.abs(b - a) + Math.abs(d - c)) / 0.06, 0, 1);
  };
  // the temperature right now (climate, season, weather), as animals feel it
  const tempNow = (i) => Wd.T(i);
  Hab.comfort = function (p, i) {
    const T = tempNow(i);
    if (T < p.lo - 0.06 || T > p.hi + 0.06) return 0.02;
    const d = (T - p.tp) / p.tol;
    return Math.exp(-d * d);
  };
  // How good cell i is for profile p now (0 = unusable, ~1 = ideal). opt.den scores den sites
  // for hibernation (sheltered slopes in forest or rock).
  Hab.score = function (p, i, opt) {
    if (i < 0 || i >= AG.N) return 0;
    const wet = Wd.fl[i] > 0.006 && !Wd.frozen[i];
    if (!p.bird && (!Wd.passLand(i) || Wd.ice[i] || wet)) return 0;
    if (Wd.bgrid[i] && p.people <= 0) return 0;
    const x = i % W, y = (i / W) | 0, b = ((y / B) | 0) * BW + ((x / B) | 0);
    const fd = Hab.fireD[b];
    if (fd <= 1) return 0;
    let s = Hab.comfort(p, i);
    // food: open ground, forest or the edge between them
    const v = Wd.veg[i], f = smooth(110, 200, v), g = smooth(20, 80, v) * (1 - f * 0.8), edge = 4 * f * (1 - f);
    let food = p.open * g + p.cover * f + 0.6 * Math.min(p.open, p.cover) * edge;
    if (p.arch === ARCH.GRAZER) food += (Wd.cereal[i] / 255) * 0.3;
    if (p.prey > 0) food = food * (1 - p.prey * 0.75) + p.prey * 0.75 * Hab.prey[b];
    if (p.bird && wet) food = p.name === 'great bird' ? 0.35 : p.name === 'songbird' ? 0.05 : 0.15;
    const snow = Wd.snow[i];
    if (snow > 60 && !p.bird) food *= p.snow + (1 - p.snow) * (snow > 160 ? 0.15 : 0.45);
    if (Wd.soil[i] === SO.BLIGHT || Wd.soil[i] === SO.ASH) food *= 0.4;
    s *= 0.06 + Math.min(1.2, food);
    // water: the pull grows with heat and in summer
    if (p.water > 0) {
      const T = tempNow(i), thirst = clamp(0.5 + (AG.Sky.season() === 1 ? 0.2 : 0) + (T - 0.55) * 1.5, 0.3, 1);
      const near = Math.exp(-Hab.waterD[b] / 3);
      s *= 1 - p.water * thirst * 0.7 * (1 - near);
    }
    // terrain
    const st = Hab.slope(i), e = Wd.elev[i], hi = smooth(AG.HILL - 0.05, AG.PEAK, e);
    if (opt && opt.den) s *= 0.4 + st * 0.8 + f * 0.6;
    else {
      s *= clamp(1 + p.slope * (st - 0.3), 0.15, 1.6);
      s *= clamp(1 + p.high * (hi - 0.25), 0.15, 1.6);
      if (e > AG.PEAK && !p.climber) s *= 0.3;
    }
    // people: the shy keep away from buildings and roads, crows come to fields and towns
    const near = Math.exp(-Hab.peopleD[b] / 2);
    if (p.people > 0) s *= 1 + p.people * near;
    else { s *= 1 - p.shy * near * 0.92; if (Wd.owner[i] >= 0) s *= 1 - p.shy * 0.35; }
    if (fd <= 3) s *= 0.3;
    return s > 2 ? 2 : s;
  };

  // A drinking spot near (x, y): a dry cell beside fresh water, or -1. Looks up to maxB blocks out.
  Hab.drinkSpot = function (x, y, maxB, rand) {
    const bx = clamp((x / B) | 0, 0, BW - 1), by = clamp((y / B) | 0, 0, BH - 1);
    if (Hab.waterD[by * BW + bx] > maxB) return -1;
    let best = -1, bd = 1e9;
    for (let dy = -maxB; dy <= maxB; dy++) for (let dx = -maxB; dx <= maxB; dx++) {
      const xx = bx + dx, yy = by + dy;
      if (xx < 0 || yy < 0 || xx >= BW || yy >= BH || Hab.waterD[yy * BW + xx] !== 0) continue;
      const d = dx * dx + dy * dy + (rand ? rand() * 2 : 0);
      if (d < bd) { bd = d; best = yy * BW + xx; }
    }
    if (best < 0) return -1;
    const x0 = (best % BW) * B, y0 = ((best / BW) | 0) * B;
    for (let yy = y0; yy < Math.min(H, y0 + B); yy++) for (let xx = x0; xx < Math.min(W, x0 + B); xx++) {
      const w = yy * W + xx;
      if (!Hab.fresh(w)) continue;
      // a dry neighbour to stand on
      for (const n of [w - 1, w + 1, w - W, w + W, w - W - 1, w - W + 1, w + W - 1, w + W + 1]) if (n >= 0 && n < AG.N && Wd.passLand(n) && Wd.fl[n] < 0.006 && !Wd.bgrid[n]) return n;
    }
    return -1;
  };
  // Is this a winter that sends bears to their dens here?
  Hab.denWeather = (i) => AG.Sky.season() === 3 && tempNow(i) < 0.36;
  // Have the songbirds of this place gone south for the winter?
  Hab.migrated = (i) => AG.Sky.season() === 3 && tempNow(i) < 0.38;
  // How many go together.
  Hab.groupSize = function (p, rand) {
    const r = rand(), soc = p.social;
    switch (p.name) {
      case 'bear': return rand() < 0.25 ? 2 : 1; // a mother and her cub, or alone
      case 'great cat': return rand() < 0.3 ? 2 : 1;
      case 'wolf': return 3 + ((r * 5) | 0);
      case 'hyena': return 3 + ((r * 4) | 0);
      case 'great bird': return 1 + ((r * 2) | 0);
      case 'crow': return 3 + ((r * 4) | 0);
      case 'songbird': return 4 + ((r * 6) | 0);
      case 'deer': case 'elk': return 2 + ((r * 3) | 0);
      case 'ibex': return 3 + ((r * 5) | 0);
      case 'monkey': return 5 + ((r * 6) | 0);
      case 'great ape': return 3 + ((r * 5) | 0);
      case 'hominin': return 4 + ((r * 5) | 0);
    }
    return soc > 0.55 ? 5 + ((r * 9) | 0) : 2 + ((r * 4) | 0); // herds
  };
})();
