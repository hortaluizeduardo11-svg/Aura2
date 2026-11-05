/* AURA: Genesis 2 — world.js
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
    // geology-driven fields (Genesis 2)
    ice: new Uint8Array(N),      // glacier thickness 0..255
    rock: new Uint8Array(N),     // bedrock class (AG.ROCK)
    res: new Uint8Array(N),      // surface resource (AG.RES)
    cereal: new Uint8Array(N),   // wild cereal density 0..255 (climate-driven)
    fert: new Uint8Array(N),     // soil fertility 0..255 (exhausted by farming, raised by ash and floods)
    plate: new Uint8Array(N),    // tectonic plate id
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
    return Wd.tbase[i] + AG.Sky.seasonT + AG.Sky.chunkT[Wd.chunkOfIdx(i)] + Wd.heat[i] + (AG.Geo ? AG.Geo.shift || 0 : 0);
  };
  // Climate-only temperature (no season or weather), used by slow processes and biomes.
  Wd.Tc = (i) => Wd.tbase[i] + (AG.Geo ? AG.Geo.shift || 0 : 0);

  // Wild cereals: warm-temperate, seasonally dry, fertile lowland. The belt moves with the climate,
  // so a warming world spreads them north and a cold snap or a glacier takes them away.
  Wd.updateCereal = function () {
    const { cereal, elev, moist, fert, ice, fl, soil } = Wd;
    for (let i = 0; i < N; i++) {
      if (elev[i] < SEA || elev[i] > AG.HILL || ice[i] || fl[i] > 0.01 || soil[i] === SO.ROCK || soil[i] === SO.SAND) { cereal[i] = 0; continue; }
      const t = Wd.Tc(i), m = moist[i];
      const k = AG.smooth(0.4, 0.52, t) * AG.smooth(0.78, 0.66, t) * AG.smooth(0.22, 0.34, m) * AG.smooth(0.72, 0.56, m) * AG.smooth(70, 140, fert[i]);
      cereal[i] = (k * 255) | 0;
    }
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
    for (const k of ['elev', 'fl', 'ft', 'frozen', 'veg', 'snow', 'soil', 'fire', 'heat', 'moist', 'tbase', 'gas', 'gt', 'traffic', 'bgrid', 'ug', 'ugF', 'ugT', 'ice', 'rock', 'res', 'cereal', 'fert', 'plate']) Wd[k].fill(0);
    Wd.owner.fill(-1);
    Wd.awake.fill(40); Wd.uawake.fill(40); Wd.dirty.fill(1); Wd.udirty.fill(1);
    Wd.springs.length = 0; Wd.vents.length = 0; Wd.epoch = 0;
  };

  // ------------------------------------------------------------ ocean
  // Refill the sea from the map edge: every cell below the waterline that the open ocean can reach
  // gets water up to SEA; former sea floor left high and dry is drained. Lakes are left alone.
  const fillQ = new Int32Array(N), seen = new Uint8Array(N);
  Wd.oceanFill = function () {
    const { elev, fl, ft, frozen } = Wd;
    seen.fill(0);
    let qh = 0, qt = 0;
    const push = (i) => { if (!seen[i] && elev[i] < SEA) { seen[i] = 1; fillQ[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 1; y < H - 1; y++) { push(y * W); push(y * W + W - 1); }
    while (qh < qt) {
      const i = fillQ[qh++], x = i % W, y = (i / W) | 0;
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
    }
    for (let i = 0; i < N; i++) {
      if (seen[i]) { if (ft[i] !== FT.LAVA) { fl[i] = SEA - elev[i]; ft[i] = FT.WATER; frozen[i] = 0; } }
      else if (ft[i] === FT.WATER && elev[i] >= SEA && fl[i] > 0.03 && Math.abs(elev[i] + fl[i] - SEA) < 0.004) { fl[i] = 0; ft[i] = FT.NONE; } // stranded sea
    }
    Wd.dirty.fill(1); Wd.awake.fill(20);
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
