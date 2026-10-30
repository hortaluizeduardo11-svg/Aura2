/* AURA: Genesis — world.js
 * Multi-layer grid storage (surface + underground; the sky lives in sky.js),
 * chunk wake/sleep bookkeeping and procedural world generation.
 * Every field is a flat typed array indexed by i = y * W + x. */
'use strict';
(function () {
  const AG = window.AG;
  const { W, H, N, CW, CH, NC, SEA, FT, SO, UG, UF } = AG;

  const Wd = (AG.World = {
    // surface layer
    elev: new Float32Array(N),   // ground height 0..1
    fl: new Float32Array(N),     // fluid depth on top of the ground
    ft: new Uint8Array(N),       // fluid type (FT)
    frozen: new Uint8Array(N),   // 1 = water frozen solid
    veg: new Uint8Array(N),      // vegetation density 0..255 (>=165 reads as forest)
    snow: new Uint8Array(N),
    soil: new Uint8Array(N),     // SO
    fire: new Uint8Array(N),     // burn intensity
    heat: new Float32Array(N),   // local temperature anomaly (fire, lava, frost)
    moist: new Float32Array(N),  // base moisture 0..1
    tbase: new Float32Array(N),  // base temperature 0..1 (latitude + altitude)
    dither: new Int8Array(N),    // static per-pixel colour jitter
    gas: new Float32Array(N), gt: new Uint8Array(N),
    traffic: new Uint8Array(N),  // footfall; well-trodden ground becomes road
    owner: new Int16Array(N),    // owning city id or -1
    bgrid: new Int32Array(N),    // building id + 1 or 0
    // underground layer
    ug: new Uint8Array(N), ugF: new Uint8Array(N), ugT: new Uint8Array(N),
    // chunk bookkeeping
    awake: new Uint8Array(NC), uawake: new Uint8Array(NC), dirty: new Uint8Array(NC), udirty: new Uint8Array(NC),
    springs: [], vents: [], epoch: 0, seed: 1,
  });

  Wd.idx = (x, y) => y * W + x;
  Wd.inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  Wd.chunkOfIdx = (i) => (((i / W) | 0) >> 4) * CW + ((i % W) >> 4);

  // Wake the chunk containing (x, y) plus its neighbours so flows can cross edges.
  Wd.wake = function (x, y) {
    const cx = x >> 4, cy = y >> 4;
    for (let oy = -1; oy <= 1; oy++) {
      const b = cy + oy; if (b < 0 || b >= CH) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const a = cx + ox; if (a < 0 || a >= CW) continue;
        const c = b * CW + a; Wd.awake[c] = 40; Wd.dirty[c] = 1;
      }
    }
  };
  // Wake just one chunk (the physics pass already processes a one-chunk halo).
  Wd.wake1 = function (x, y) { const c = (y >> 4) * CW + (x >> 4); Wd.awake[c] = 30; Wd.dirty[c] = 1; };
  Wd.wakeArea = function (x, y, r) {
    const x0 = Math.max(0, (x - r - 1) >> 4), x1 = Math.min(CW - 1, (x + r + 1) >> 4);
    const y0 = Math.max(0, (y - r - 1) >> 4), y1 = Math.min(CH - 1, (y + r + 1) >> 4);
    for (let b = y0; b <= y1; b++) for (let a = x0; a <= x1; a++) { Wd.awake[b * CW + a] = 40; Wd.dirty[b * CW + a] = 1; }
  };
  Wd.wakeU = function (x, y) {
    const cx = x >> 4, cy = y >> 4;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const a = cx + ox, b = cy + oy;
      if (a >= 0 && b >= 0 && a < CW && b < CH) { Wd.uawake[b * CW + a] = 40; Wd.udirty[b * CW + a] = 1; }
    }
  };

  // Effective temperature: base + season + local weather + heat anomaly.
  Wd.T = function (i) {
    return Wd.tbase[i] + AG.Sky.seasonT + AG.Sky.chunkT[Wd.chunkOfIdx(i)] + Wd.heat[i];
  };
  // Land walkers: dry ground, fords and ice; never lava/acid pools or deep water.
  Wd.passLand = function (i) {
    const f = Wd.fl[i];
    if (f > 0.006) {
      if (Wd.frozen[i]) return true;
      if (Wd.ft[i] !== FT.WATER || f > 0.05) return false;
    }
    return Wd.elev[i] < 0.96;
  };
  Wd.passSea = (i) => Wd.fl[i] > 0.035 && Wd.ft[i] === FT.WATER && !Wd.frozen[i];
  Wd.ugOpen = (i) => { const u = Wd.ug[i]; return u === UG.CAVE || u === UG.TUNNEL || u === UG.FUNGUS; };
  Wd.isLand = (i) => Wd.fl[i] < 0.01 || Wd.frozen[i] === 1;

  Wd.reset = function () {
    for (const k of ['elev', 'fl', 'ft', 'frozen', 'veg', 'snow', 'soil', 'fire', 'heat', 'moist', 'tbase', 'gas', 'gt', 'traffic', 'bgrid', 'ug', 'ugF', 'ugT']) Wd[k].fill(0);
    Wd.owner.fill(-1);
    Wd.awake.fill(40); Wd.uawake.fill(40); Wd.dirty.fill(1); Wd.udirty.fill(1);
    Wd.springs.length = 0; Wd.vents.length = 0; Wd.epoch = 0;
  };

  // ------------------------------------------------------------ generation
  Wd.generate = function (seed) {
    Wd.reset();
    Wd.seed = seed;
    const r = AG.mulberry32(seed);
    const s = seed * 7;
    const nE = AG.makeNoise(s + 1), nW = AG.makeNoise(s + 2), nR = AG.makeNoise(s + 3), nM = AG.makeNoise(s + 4),
      nT = AG.makeNoise(s + 5), nC = AG.makeNoise(s + 6), nO = AG.makeNoise(s + 7), nF = AG.makeNoise(s + 8);
    const { elev, moist, tbase, soil, veg, snow, fl, ft, dither } = Wd;

    // Continents: a few soft ellipses, domain-warped noise, ridged mountain chains.
    const blobs = [], nb = 2 + ((r() * 2) | 0);
    for (let k = 0; k < nb; k++) blobs.push({ x: W * (0.22 + r() * 0.56), y: H * (0.26 + r() * 0.48), rx: W * (0.2 + r() * 0.16), ry: H * (0.26 + r() * 0.2) });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = (nW.fbm(x * 0.008, y * 0.008, 3) - 0.5) * 70, wy = (nW.fbm(x * 0.008 + 41, y * 0.008 + 17, 3) - 0.5) * 70;
      const px = x + wx, py = y + wy;
      let m = 0;
      for (const b of blobs) { const dx = (px - b.x) / b.rx, dy = (py - b.y) / b.ry; m = Math.max(m, 1 - Math.sqrt(dx * dx + dy * dy)); }
      let h = (nE.fbm(px * 0.011, py * 0.011, 6) - 0.5) * 1.7 + m * 0.8;
      const ridge = 1 - Math.abs(nR.fbm(px * 0.017, py * 0.017, 4) * 2 - 1);
      h += Math.pow(ridge, 5) * 0.6 * AG.smooth(0.1, 0.45, h);
      const ex = Math.min(x, W - 1 - x) / 22, ey = Math.min(y, H - 1 - y) / 22, edge = Math.min(1, ex, ey);
      elev[i] = h * edge - (1 - edge) * 0.4;
    }
    // Normalise so ~46% of the map sits below sea level.
    const sorted = Float32Array.from(elev).sort();
    const qs = sorted[(N * 0.46) | 0], qmax = sorted[(N * 0.999) | 0], qmin = sorted[(N * 0.002) | 0];
    for (let i = 0; i < N; i++) {
      const v = elev[i];
      if (v >= qs) { const t = Math.min(1, (v - qs) / (qmax - qs)); elev[i] = SEA + Math.pow(t, 1.15) * (0.97 - SEA); }
      else elev[i] = Math.max(0.03, SEA - Math.min(1, (qs - v) / (qs - qmin)) * (SEA - 0.05));
    }

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, e = elev[i];
      moist[i] = AG.clamp((nM.fbm(x * 0.014, y * 0.014, 4) - 0.5) * 2.4 + 0.52, 0, 1);
      const lat = y / H; // north is cold, south is hot
      tbase[i] = AG.clamp(0.2 + lat * 0.58 + (nT.fbm(x * 0.01, y * 0.01, 3) - 0.5) * 0.4 - Math.max(0, e - SEA) * 0.7, -0.2, 1);
      dither[i] = ((r() * 2 - 1) * 7) | 0;
      if (e < SEA) {
        fl[i] = SEA - e; ft[i] = FT.WATER;
        soil[i] = e > SEA - 0.035 ? SO.SAND : SO.DIRT;
        continue;
      }
      const t = tbase[i], mo = moist[i];
      if (e < SEA + 0.016 && mo < 0.75) soil[i] = SO.SAND;
      else if (e > AG.MOUNTAIN) soil[i] = SO.ROCK;
      else if (t > 0.6 && mo < 0.36) soil[i] = SO.SAND;
      else soil[i] = SO.DIRT;
      if (soil[i] === SO.DIRT) {
        const cap = Wd.vegCap(mo, t, SO.DIRT);
        const f = nF.fbm(x * 0.05, y * 0.05, 3);
        veg[i] = AG.clamp(cap * (0.45 + f * 0.9), 0, 255) | 0;
      } else if (soil[i] === SO.SAND) veg[i] = mo > 0.3 ? 20 : 0;
      if (e > AG.PEAK || t < 0.07) snow[i] = 210;
    }

    // Rivers: trace steepest descent from wet highlands, carve a strictly
    // descending bed and leave a spring at the source to keep it flowing.
    const sources = [];
    for (let tries = 0; tries < 900 && sources.length < 8; tries++) {
      const x = 20 + ((r() * (W - 40)) | 0), y = 20 + ((r() * (H - 40)) | 0), i = y * W + x;
      if (elev[i] < 0.58 || elev[i] > 0.86 || moist[i] < 0.38) continue;
      if (sources.some((s2) => AG.dist2(s2.x, s2.y, x, y) < 34 * 34)) continue;
      sources.push({ x, y });
    }
    for (const src of sources) {
      let x = src.x, y = src.y, last = elev[y * W + x];
      for (let step = 0; step < 700; step++) {
        const i = y * W + x;
        elev[i] = Math.min(elev[i], last) - 0.006;
        last = elev[i];
        if (elev[i] < SEA - 0.01) break;
        fl[i] = Math.max(fl[i], 0.012); ft[i] = FT.WATER; veg[i] = Math.min(veg[i], 60);
        let best = -1, bv = 1e9;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          const v = elev[ny * W + nx] + r() * 0.012 + (ox && oy ? 0.004 : 0);
          if (v < bv) { bv = v; best = ny * W + nx; }
        }
        if (best < 0) break;
        x = best % W; y = (best / W) | 0;
      }
      Wd.springs.push({ i: src.y * W + src.x, x: src.x, y: src.y, rate: 0.0016 + r() * 0.0014 });
    }

    // Underground: noise caves smoothed by cellular automata, ore veins,
    // magma pockets under mountains, aquifers under wet lowlands, fungus groves.
    const { ug, ugF, ugT } = Wd;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { ug[i] = UG.BEDROCK; continue; }
      const c = nC.fbm(x * 0.055, y * 0.055, 3);
      ug[i] = c > 0.58 ? UG.CAVE : (elev[i] < 0.55 && nO.fbm(x * 0.03, y * 0.03, 2) > 0.5 ? UG.DIRT : UG.ROCK);
    }
    const tmp = new Uint8Array(N);
    for (let pass = 0; pass < 3; pass++) {
      tmp.set(ug);
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x; let open = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && tmp[i + oy * W + ox] === UG.CAVE) open++;
        if (open >= 5) ug[i] = UG.CAVE; else if (open <= 2 && tmp[i] === UG.CAVE) ug[i] = UG.ROCK;
      }
    }
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (ug[i] === UG.CAVE) {
        const m = nM.fbm(x * 0.04 + 90, y * 0.04, 2);
        if (elev[i] > 0.66 && nO.fbm(x * 0.02 + 300, y * 0.02, 2) > 0.58) { ugT[i] = UF.MAGMA; ugF[i] = 220; }
        else if (moist[i] > 0.6 && elev[i] < 0.55 && m > 0.55) { ugT[i] = UF.WATER; ugF[i] = 180; }
        else if (m > 0.6) ug[i] = UG.FUNGUS;
        continue;
      }
      const o = nO.fbm(x * 0.09, y * 0.09, 2);
      if (o > 0.7) ug[i] = UG.IRON;
      else if (o < 0.24 && elev[i] > 0.58) ug[i] = UG.GOLD;
      else if (r() < 0.0035) ug[i] = UG.CRYSTAL;
    }
  };

  // Vegetation carrying capacity from moisture, temperature and soil.
  Wd.vegCap = function (mo, t, s) {
    if (s === SO.ROCK || s === SO.ROAD || s === SO.FARM) return mo > 0.7 ? 30 : 0;
    if (s === SO.SAND) return mo > 0.4 ? 40 : 10;
    if (s === SO.BASALT) return 0;
    if (s === SO.BLIGHT) return 30;
    const tf = AG.clamp(1 - Math.abs(t - 0.52) * 1.7, 0, 1);
    let cap = AG.clamp((mo * 1.35 - 0.1) * (0.35 + tf * 0.75), 0, 1) * 255;
    if (s === SO.HOLY) cap = Math.max(cap, 200);
    return cap;
  };
})();
