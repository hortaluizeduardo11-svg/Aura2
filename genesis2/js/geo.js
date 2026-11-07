/* AURA: Genesis 2 — geo.js
 * The changing planet. A coarse grid (one cell = 4x4 world cells) carries tectonic plates,
 * crust, rock, strain and magma. Plates drift cell by cell; where they meet, crust stacks into
 * mountains or one plate subducts under the other (trenches, volcanic arcs); where they part, new
 * ocean floor and rift valleys open. Hotspots leave island chains, rivers wear the land down and
 * build deltas, orbital cycles grow and melt ice sheets, and the ice volume sets the sea level.
 *
 * Two clocks:
 *  - deep time (Geo.deepStep, 0.25 Myr steps): plates move, the fine map is regenerated from the
 *    coarse crust with detail that travels with its plate.
 *  - the Age of People (Geo.yearStep, Geo.tick): the fine map is authoritative; geology applies
 *    sea-level shifts, glaciers, earthquakes, eruptions and delta growth to it.
 * Geology draws from its own seeded random stream, so how you watch never changes the rocks. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World;
  const { W, H, N, SEA, FT, SO, UG, UF, ROCK, RES } = AG;
  const CS = 4, GW = Math.ceil(W / CS), GH = Math.ceil(H / CS), GN = GW * GH;
  const CONT = 0.37;          // crust above this is buoyant continental crust
  const SEA_AMP = 0.045;      // sea-level fall at full glaciation (exposes the continental shelves)
  const NOP = 255;
  const B = { NONE: 0, CONV: 1, DIV: 2, TRANS: 3 };
  const F32 = (n) => new Float32Array(n), U8 = (n) => new Uint8Array(n);

  const Geo = (AG.Geo = {
    CS, GW, GH, GN, B, CONT,
    plate: U8(GN), crust: F32(GN), age: F32(GN), rock: U8(GN), strain: F32(GN), magma: F32(GN),
    orog: F32(GN), bound: U8(GN), precip: F32(GN), temp: F32(GN), ice: F32(GN), acc: F32(GN),
    organic: F32(GN), evap: F32(GN), wetFloor: F32(GN),
    lith: U8(GN),               // 1 = continental lithosphere (thick, buoyant: rebounds as it erodes), 2 = thinned rift crust
    plates: [], hotspots: [], volcanoes: [], events: [], frames: [],
    phase: 'deep', myr: 0, dawnMyr: 0, year: 0, quakes: 0, eruptions: 0, splits: 0, sutures: 0,
    climate: { orbital: 0, aerosol: 0, carbon: 0, anomaly: 0, phase: [0, 0, 0] },
    iceVol: 0, seaLevel: 0, applied: 0, seed: 1, stepN: 0, regen: 0,
    stats: { ms: 0, land: 0, boundaries: [0, 0, 0, 0] },
  });
  let rng = Math.random; // replaced by a seeded stream in init
  const rr = () => rng();

  // scratch for the plate shift
  const nP = U8(GN), nC = F32(GN), nA = F32(GN), nR = U8(GN), nS = F32(GN), nM = F32(GN), nO = F32(GN), nG = F32(GN), nE = F32(GN), nL = U8(GN);
  const order = new Int32Array(GN), cnt = new Int32Array(256), off = new Int32Array(257);

  // tileable detail noise (512x512) sampled in plate-local coordinates so texture rides its plate
  const T = 512, tileA = F32(T * T), tileB = F32(T * T);
  // periodic value-noise fBm: a wrapping lattice per octave, so the tile repeats seamlessly
  function periodicFbm(out, seed, L0, oct) {
    const r = AG.mulberry32(seed);
    out.fill(0);
    let amp = 1, norm = 0;
    for (let o = 0, L = L0; o < oct; o++, L *= 2) {
      const lat = new Float32Array(L * L); for (let k = 0; k < L * L; k++) lat[k] = r();
      const step = T / L;
      for (let y = 0; y < T; y++) {
        const gy = y / step, y0 = gy | 0, fy = gy - y0, sy = fy * fy * (3 - 2 * fy), r0 = (y0 % L) * L, r1 = ((y0 + 1) % L) * L;
        for (let x = 0; x < T; x++) {
          const gx = x / step, x0 = gx | 0, fx = gx - x0, sx = fx * fx * (3 - 2 * fx), a0 = x0 % L, a1 = (x0 + 1) % L;
          const v = (lat[r0 + a0] * (1 - sx) + lat[r0 + a1] * sx) * (1 - sy) + (lat[r1 + a0] * (1 - sx) + lat[r1 + a1] * sx) * sy;
          out[y * T + x] += v * amp;
        }
      }
      norm += amp; amp *= 0.5;
    }
    for (let k = 0; k < T * T; k++) out[k] /= norm;
  }
  function buildTiles(seed) {
    periodicFbm(tileA, seed + 401, 24, 4);
    for (let k = 0; k < T * T; k++) tileA[k] -= 0.5;
    periodicFbm(tileB, seed + 402, 16, 4);
    for (let k = 0; k < T * T; k++) tileB[k] = Math.pow(1 - Math.abs(tileB[k] * 2 - 1), 3);
  }

  const oceanDepth = (age) => 0.315 - 0.19 * Math.sqrt(Math.min(age, 180) / 180);
  const seaLine = () => SEA + Geo.seaLevel;
  Geo.rebuildTiles = (seed) => { buildTiles(seed); Geo.tilesFor = seed; };
  Geo.setRng = (v) => { if (!rng.set) rng = AG.makeRng(0); rng.set(v); Geo.rng = rng; };
  Geo.isLandC = (c) => Geo.crust[c] > seaLine();
  Geo.cellOf = (x, y) => AG.clamp((y / CS) | 0, 0, GH - 1) * GW + AG.clamp((x / CS) | 0, 0, GW - 1);

  // ------------------------------------------------------------ deep-time setup
  Geo.init = function (seed) {
    Geo.seed = seed; Geo.scripted = false;
    rng = AG.makeRng((Math.imul(seed, 2654435761) ^ 0x51ed270b) >>> 0); Geo.rng = rng;
    buildTiles(seed); Geo.tilesFor = seed;
    const n1 = AG.makeNoise(seed + 101), n2 = AG.makeNoise(seed + 102), n3 = AG.makeNoise(seed + 103);
    Geo.phase = 'deep'; Geo.myr = 0; Geo.dawnMyr = 0; Geo.year = 0; Geo.stepN = 0; // the world is born in Year 0
    Geo.quakes = Geo.eruptions = Geo.splits = Geo.sutures = 0;
    Geo.events.length = 0; Geo.frames.length = 0; Geo.volcanoes.length = 0;
    Geo.iceVol = 0.1; Geo.seaLevel = 0; Geo.applied = 0;
    for (const k of ['strain', 'magma', 'orog', 'bound', 'ice', 'acc', 'organic', 'evap', 'wetFloor', 'lith']) Geo[k].fill(0);
    Geo.lostCont = 0;
    const cl = Geo.climate; cl.aerosol = 0; cl.carbon = 0.3; cl.orbital = 0;
    cl.phase = [88500 + (rr() - 0.5) * 3000, 30000 + rr() * 6000, rr() * 23000];

    // ---- a new supercontinent, different in every world: ancient cores (cratons) welded together.
    // Each craton is an ellipse of its own size, stretch and tilt, attached to the cluster at a
    // random side; the coastline is the union, warped by noise, cut to a set area, and only the
    // largest connected piece is kept. Old mountain belts run along the seams between cratons.
    const nc = 5 + ((rr() * 4) | 0), cratons = [];
    const cx0 = GW * (0.42 + rr() * 0.16), cy0 = GH * (0.42 + rr() * 0.16), ys = (GH / GW) * 1.5;
    // a curving chain of cratons (a spine, a crescent, an L...) with the odd one welded on the side
    let ang = rr() * Math.PI * 2;
    const bend = (rr() - 0.5) * 1.2;
    for (let k = 0; k < nc; k++) {
      const r = GW * (0.06 + rr() * 0.06), asp = 0.35 + rr() * 0.45, rot = rr() * Math.PI;
      let x = 0, y = 0;
      if (k) {
        const side = k > 1 && rr() < 0.35, host = side ? cratons[(rr() * cratons.length) | 0] : cratons[k - 1];
        const a = side ? ang + (rr() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rr() - 0.5) * 0.6) : (ang += bend + (rr() - 0.5) * 0.5);
        const d = (host.r + r) * (0.55 + rr() * 0.25);
        x = host.x + Math.cos(a) * d; y = host.y + Math.sin(a) * d * ys;
      }
      cratons.push({ x, y, r, rx: r, ry: r * asp, cos: Math.cos(rot), sin: Math.sin(rot) });
    }
    // centre the cluster and keep it inside the map with room to drift
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    for (const C of cratons) { bx0 = Math.min(bx0, C.x - C.r); bx1 = Math.max(bx1, C.x + C.r); by0 = Math.min(by0, C.y - C.r * ys); by1 = Math.max(by1, C.y + C.r * ys); }
    const fit = Math.min(1.25, (GW * 0.8) / (bx1 - bx0), (GH * 0.8) / (by1 - by0)), mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
    for (const C of cratons) { C.x = cx0 + (C.x - mx) * fit; C.y = cy0 + (C.y - my) * fit; C.r *= fit; C.rx *= fit; C.ry *= fit; }
    // one or two gulfs bite into the coast (inland seas, like a young Tethys)
    const gulfs = [];
    for (let g = 0, ng = rr() < 0.75 ? 1 + (rr() < 0.4 ? 1 : 0) : 0; g < ng; g++) {
      const C = cratons[(rr() * nc) | 0], a = rr() * Math.PI * 2, L = C.r * (1.1 + rr() * 0.8);
      gulfs.push({ x: C.x + Math.cos(a) * C.r * 0.9, y: C.y + Math.sin(a) * C.r * 0.9 * ys, ca: Math.cos(a + Math.PI), sa: Math.sin(a + Math.PI), L, w: C.r * (0.18 + rr() * 0.2) });
    }
    let scx0 = 0, scy0 = 0; for (const C of cratons) { scx0 += C.x / nc; scy0 += C.y / nc; }
    const field = (x, y, k) => { const C = cratons[k], dx = x - C.x, dy = y - C.y, u = (dx * C.cos + dy * C.sin) / C.rx, v = (-dx * C.sin + dy * C.cos) / C.ry; return 1 - Math.sqrt(u * u + v * v); };
    const mass = new Float32Array(GN), seam = new Float32Array(GN), owner = new Int8Array(GN);
    const warp = 7 + rr() * 5, rough = 0.42 + rr() * 0.3, n4 = AG.makeNoise(seed + 104);
    const computeMass = () => { for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x;
      const wx = x + (n1.fbm(x * 0.05, y * 0.05, 3) - 0.5) * warp * 2, wy = y + (n1.fbm(x * 0.05 + 31, y * 0.05 + 7, 3) - 0.5) * warp * 2;
      let b1 = -9, b2 = -9, bk = 0;
      for (let k = 0; k < nc; k++) { const f = field(wx, wy, k); if (f > b1) { b2 = b1; b1 = f; bk = k; } else if (f > b2) b2 = f; }
      // smooth union of the two nearest cratons (no pinched necks), then a ragged coast
      const h = AG.clamp(0.5 + (b1 - b2) / 0.5, 0, 1);
      let un = b1 * h + b2 * (1 - h) + 0.14 * h * (1 - h);
      for (const G of gulfs) { const dx = wx - G.x, dy = (wy - G.y) / ys, along = dx * G.ca + dy * G.sa, across = -dx * G.sa + dy * G.ca; if (along > 0 && along < G.L) un -= 0.9 * Math.max(0, 1 - Math.abs(across) / (G.w * (1 - along / G.L * 0.7))); }
      const edge = Math.min(x, GW - 1 - x) / GW, edgeY = Math.min(y, GH - 1 - y) / GH;
      mass[c] = un + (n2.fbm(x * 0.07, y * 0.07, 4) - 0.5) * rough + (n4.fbm(x * 0.19, y * 0.19, 3) - 0.5) * 0.32 + (Math.abs(n3.fbm(x * 0.11, y * 0.11, 3) * 2 - 1) - 0.35) * 0.14
        - Math.max(0, 0.09 - edge) * 9 - Math.max(0, 0.1 - edgeY) * 9;
      seam[c] = b2 > -0.2 ? AG.clamp(1 - Math.abs(b1 - b2) / 0.12, 0, 1) : 0;
      owner[c] = bk;
    } };
    // grow the cratons until the continent reaches this world's share of the map
    const target = 0.22 + rr() * 0.08;
    for (let pass = 0; pass < 3; pass++) {
      computeMass();
      let n = 0; for (let c = 0; c < GN; c++) if (mass[c] > 0) n++;
      if (n / GN > target * 0.9 || pass === 2) break;
      const k = Math.min(1.35, Math.sqrt(target / Math.max(0.02, n / GN)));
      for (const C of cratons) { C.x = scx0 + (C.x - scx0) * k; C.y = scy0 + (C.y - scy0) * k; C.r *= k; C.rx *= k; C.ry *= k; }
      for (const G of gulfs) { G.x = scx0 + (G.x - scx0) * k; G.y = scy0 + (G.y - scy0) * k; G.L *= k; G.w *= k; }
    }

    // the coast: a threshold that gives this world's land area (about a third of the map)
    const sorted = Float32Array.from(mass).sort();
    const thr = Math.max(-0.06, Math.min(0.12, sorted[Math.floor(GN * (1 - target))])); // near the cratons' own outlines
    // keep the largest connected landmass: one unified continent
    const comp = new Int32Array(GN).fill(-1), stack = [];
    let best = -1, bestN = 0;
    for (let c0 = 0; c0 < GN; c0++) {
      if (comp[c0] >= 0 || mass[c0] <= thr) continue;
      let n = 0; stack.length = 0; stack.push(c0); comp[c0] = c0;
      while (stack.length) {
        const c = stack.pop(); n++;
        const x = c % GW, y = (c / GW) | 0;
        for (const o of [x > 0 ? c - 1 : -1, x < GW - 1 ? c + 1 : -1, y > 0 ? c - GW : -1, y < GH - 1 ? c + GW : -1]) if (o >= 0 && comp[o] < 0 && mass[o] > thr) { comp[o] = c0; stack.push(o); }
      }
      if (n > bestN) { bestN = n; best = c0; }
    }
    // lakes smaller than a few cells inside the continent are filled (they read as holes at this scale)
    const seen = new Uint8Array(GN);
    for (let c0 = 0; c0 < GN; c0++) {
      if (seen[c0] || comp[c0] === best) continue;
      const cells = []; let open = false; stack.length = 0; stack.push(c0); seen[c0] = 1;
      while (stack.length) {
        const c = stack.pop(); cells.push(c);
        const x = c % GW, y = (c / GW) | 0;
        if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) open = true;
        for (const o of [x > 0 ? c - 1 : -1, x < GW - 1 ? c + 1 : -1, y > 0 ? c - GW : -1, y < GH - 1 ? c + GW : -1]) if (o >= 0 && !seen[o] && comp[o] !== best) { seen[o] = 1; stack.push(o); }
      }
      if (!open && cells.length < 14) for (const c of cells) { comp[c] = best; mass[c] = Math.max(mass[c], thr + 0.01); }
    }
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x, m = mass[c] - thr;
      if (comp[c] === best) {
        const old = 1 - Math.abs(n3.fbm(x * 0.07, y * 0.07, 3) * 2 - 1); // worn-down ancient mountain belts
        const belt = Math.max(Math.pow(old, 6) * 0.7, seam[c] * (0.55 + n2.fbm(x * 0.2, y * 0.2, 2) * 0.6));
        Geo.crust[c] = 0.46 + Math.min(0.12, m * 0.35) + belt * 0.16 + (n3.fbm(x * 0.2, y * 0.2, 2) - 0.5) * 0.03;
        Geo.age[c] = 400 + rr() * 800; Geo.lith[c] = 1;
        Geo.rock[c] = n3.fbm(x * 0.09 + 50, y * 0.09, 2) > 0.56 ? ROCK.SEDIMENT : belt > 0.4 ? ROCK.META : ROCK.GRANITE;
      } else {
        Geo.age[c] = 20 + rr() * 140;
        Geo.crust[c] = oceanDepth(Geo.age[c]) + (m > -0.12 ? Math.max(0, 0.06 + m * 0.5) : 0); // shelves around the continent
        Geo.rock[c] = ROCK.BASALT;
      }
    }
    // ---- plates: one on each craton (the continent will part along its old seams), the rest at sea
    const np = Math.max(nc + 4, 9 + ((rr() * 5) | 0)), seeds = [];
    for (const C of cratons) seeds.push({ x: C.x + (rr() - 0.5) * C.r * 0.4, y: C.y + (rr() - 0.5) * C.r * 0.4 });
    for (let t = 0; seeds.length < np && t < 4000; t++) {
      const x = rr() * GW, y = rr() * GH, c = (y | 0) * GW + (x | 0);
      if (comp[c] === best && t < 3000) continue;
      if (seeds.some((q) => AG.dist2(q.x, q.y, x, y) < (GW * GH) / (np * 3.2))) continue;
      seeds.push({ x, y });
    }
    Geo.plates = seeds.map((q, id) => ({ id, sx: q.x, sy: q.y, vx: 0, vy: 0, tx: 0, ty: 0, ax: 0, ay: 0, ox: 0, oy: 0, cont: 0, cells: 0, hue: (id * 137.5 + 20) % 360, alive: true, cx: q.x, cy: q.y }));
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x;
      const wx = x + (n1.fbm(x * 0.06, y * 0.06, 3) - 0.5) * 14, wy = y + (n1.fbm(x * 0.06 + 31, y * 0.06 + 7, 3) - 0.5) * 14;
      let bp = 0, bd = 1e9;
      for (let k = 0; k < seeds.length; k++) { const d = AG.dist2(wx, wy, seeds[k].x, seeds[k].y) * (k < nc && comp[c] === best && owner[c] === k ? 0.55 : 1); if (d < bd) { bd = d; bp = k; } }
      Geo.plate[c] = bp;
    }
    let scx = 0, scy = 0; for (const C of cratons) { scx += C.x / nc; scy += C.y / nc; }
    // plates carrying the supercontinent pull away from its centre: the breakup
    platesCensus();
    for (const p of Geo.plates) {
      let a, sp;
      if (p.cont > 0.25) { a = Math.atan2(p.cy - scy, p.cx - scx) + (rr() - 0.5) * 0.7; sp = 0.22 + rr() * 0.2; }
      else { a = rr() * Math.PI * 2; sp = 0.15 + rr() * 0.35; }
      // the continent first stretches (a slow rifting phase), then the pieces gather speed
      p.tx = Math.cos(a) * sp; p.ty = Math.sin(a) * sp; p.vx = p.tx * 0.12; p.vy = p.ty * 0.12;
    }
    Geo.hotspots = [];
    for (let k = 0, n = 3 + ((rr() * 3) | 0); k < n; k++) Geo.hotspots.push({ x: 4 + rr() * (GW - 8), y: 4 + rr() * (GH - 8), power: 0.6 + rr() * 0.6 });
    climateDeep(0); classify(0); recordFrame();
  };

  function platesCensus() {
    for (const p of Geo.plates) { p.cells = 0; p.contCells = 0; p.cx = 0; p.cy = 0; p.edge = [0, 0, 0, 0]; }
    for (let c = 0; c < GN; c++) {
      const p = Geo.plates[Geo.plate[c]]; if (!p) continue;
      const x = c % GW, y = (c / GW) | 0;
      p.cells++; p.cx += x; p.cy += y;
      if (Geo.crust[c] > CONT) {
        p.contCells++;
        const mx = Math.max(3, (GW * 0.05) | 0), my = Math.max(3, (GH * 0.06) | 0);
        if (x < mx) p.edge[0]++; if (x > GW - 1 - mx) p.edge[1]++; if (y < my) p.edge[2]++; if (y > GH - 1 - my) p.edge[3]++;
      }
    }
    for (const p of Geo.plates) {
      if (p.cells) { p.cx /= p.cells; p.cy /= p.cells; }
      p.cont = p.cells ? p.contCells / p.cells : 0;
      p.alive = p.cells > 0;
    }
  }

  // ------------------------------------------------------------ deep-time step
  Geo.deepStep = function (dt) {
    const t0 = AG.now ? AG.now() : 0;
    Geo.stepN++;
    Geo.myr += dt;
    platesCensus();
    steer(dt);
    let any = false;
    for (const p of Geo.plates) {
      if (!p.alive) { p.mx = p.my = 0; continue; }
      p.ax += p.vx * dt; p.ay += p.vy * dt;
      p.mx = p.ax >= 1 ? 1 : p.ax <= -1 ? -1 : 0; p.my = p.ay >= 1 ? 1 : p.ay <= -1 ? -1 : 0;
      p.ax -= p.mx; p.ay -= p.my; p.ox += p.mx; p.oy += p.my;
      if (p.mx || p.my) any = true;
    }
    if (any) { shift(); lockCollisions(); }
    classify(dt);
    hotspots(dt);
    const orogK = Math.pow(0.97, dt);
    for (let c = 0; c < GN; c++) {
      Geo.age[c] += dt;
      if (Geo.crust[c] < CONT - 0.03 && Geo.rock[c] === ROCK.BASALT) { // old ocean floor cools and sinks
        const target = oceanDepth(Geo.age[c]);
        if (Geo.crust[c] > target) Geo.crust[c] += (target - Geo.crust[c]) * 0.05 * dt;
      }
      Geo.orog[c] *= orogK;
      // isostasy: thick continental crust floats back up as erosion strips it
      if (Geo.lith[c] === 1 && Geo.crust[c] < 0.455) Geo.crust[c] += (0.455 - Geo.crust[c]) * Math.min(1, 0.06 * dt);
      else if (Geo.lith[c] === 2 && Geo.age[c] > 25) Geo.lith[c] = 0; // an old rift has become ocean floor
    }
    if (Geo.stepN % 2 === 1) climateDeep(dt * 2); // climate changes slowly: every second step, for both (on the steps without the full erosion pass)
    erode(dt, Geo.stepN % 2 === 0);
    wilson(dt);
    if (Geo.stepN % 8 === 0) recordFrame();
    Geo.regen++;
    if (AG.now) Geo.stats.ms = Geo.stats.ms * 0.9 + (AG.now() - t0) * 0.1;
  };

  // continents feel a slow "mantle" that keeps them on the map; targets wander every ~15 Myr
  function steer(dt) {
    if (Geo.scripted) return;
    for (const p of Geo.plates) {
      if (!p.alive) continue;
      if (rr() < dt / 40) { const a = rr() * Math.PI * 2, sp = 0.12 + rr() * (p.cont > 0.25 ? 0.3 : 0.48); p.tx = Math.cos(a) * sp; p.ty = Math.sin(a) * sp; }
      if (p.cont > 0.08) {
        if (p.edge[0] > 1 && p.tx < 0.1) { p.tx = 0.25 + rr() * 0.3; p.vx = Math.max(p.vx, 0); }
        if (p.edge[1] > 1 && p.tx > -0.1) { p.tx = -0.25 - rr() * 0.3; p.vx = Math.min(p.vx, 0); }
        if (p.edge[2] > 1 && p.ty < 0.1) { p.ty = 0.2 + rr() * 0.3; p.vy = Math.max(p.vy, 0); }
        if (p.edge[3] > 1 && p.ty > -0.1) { p.ty = -0.2 - rr() * 0.3; p.vy = Math.min(p.vy, 0); }
      }
      const k = Math.min(1, 0.05 * dt);
      p.vx += (p.tx - p.vx) * k; p.vy += (p.ty - p.vy) * k;
    }
  }

  // Move every plate that crossed a whole cell. Stationary plates write first, then moving ones by
  // id, so the outcome is deterministic. Overlaps are resolved by buoyancy; gaps become new crust.
  const collide = new Float32Array(256 * 256), hitNow = new Uint16Array(256 * 256);
  // Continents can't subduct: plates whose continents collide lock up, keeping only a slow squeeze.
  function lockCollisions() {
    if (Geo.scripted) return;
    const P = Geo.plates;
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
      const k = a * 256 + b; if (hitNow[k] < 2) continue;
      const A = P[a], Bp = P[b];
      let nx = Bp.cx - A.cx, ny = Bp.cy - A.cy; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const close = (A.vx - Bp.vx) * nx + (A.vy - Bp.vy) * ny;
      if (close <= 0) continue;
      const cut = close * 0.85 * 0.5; // each plate gives up half of 85% of the closing speed
      A.vx -= nx * cut; A.vy -= ny * cut; Bp.vx += nx * cut; Bp.vy += ny * cut;
      const tc = (A.tx - Bp.tx) * nx + (A.ty - Bp.ty) * ny;
      if (tc > 0) { A.tx -= nx * tc * 0.5; A.ty -= ny * tc * 0.5; Bp.tx += nx * tc * 0.5; Bp.ty += ny * tc * 0.5; }
    }
  }
  function shift() {
    hitNow.fill(0);
    const { plate, crust, age, rock, strain, magma, orog, organic, evap } = Geo;
    cnt.fill(0);
    for (let c = 0; c < GN; c++) cnt[plate[c]]++;
    off[0] = 0; for (let k = 0; k < 256; k++) off[k + 1] = off[k] + cnt[k];
    const pos = off.slice(0, 256);
    for (let c = 0; c < GN; c++) order[pos[plate[c]]++] = c;
    nP.fill(NOP);
    const ids = Geo.plates.filter((p) => p.alive).map((p) => p.id);
    ids.sort((a, b) => ((Geo.plates[a].mx || Geo.plates[a].my) ? 1 : 0) - ((Geo.plates[b].mx || Geo.plates[b].my) ? 1 : 0) || a - b);
    const sl = seaLine();
    for (const id of ids) {
      const p = Geo.plates[id], dx = p.mx | 0, dy = p.my | 0;
      for (let k = off[id]; k < off[id + 1]; k++) {
        const c = order[k], x = (c % GW) + dx, y = ((c / GW) | 0) + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) { if (Geo.lith[c] === 1) Geo.lostCont++; continue; } // consumed at the margin trench
        const t = y * GW + x;
        if (nP[t] === NOP) { nP[t] = id; nC[t] = crust[c]; nA[t] = age[c]; nR[t] = rock[c]; nS[t] = strain[c]; nM[t] = magma[c]; nO[t] = orog[c]; nG[t] = organic[c]; nE[t] = evap[c]; nL[t] = Geo.lith[c]; continue; }
        const q = nP[t], eo = nC[t], ei = crust[c];
        const contO = eo > CONT, contI = ei > CONT;
        if (contO && contI) { // continental collision: crust stacks into mountains
          const top = Math.max(eo, ei), bot = Math.min(eo, ei);
          nC[t] = Math.min(0.985, top + Math.max(0, bot - CONT) * 0.5 + 0.03);
          nO[t] += 1; nR[t] = ROCK.META; nS[t] += 0.3; nL[t] = 1;
          if (ei > eo) { nP[t] = id; nA[t] = age[c]; }
          if (q !== id) { const k = Math.min(q, id) * 256 + Math.max(q, id); collide[k] += 1; hitNow[k]++; }
        } else if (contI && !contO) { // ocean floor dives under the arriving continent
          nP[t] = id; nC[t] = Math.min(0.9, ei + 0.006); nA[t] = age[c]; nR[t] = rock[c]; nM[t] = magma[c] + 0.12; nO[t] = orog[c] + 0.3; nG[t] = organic[c]; nE[t] = evap[c]; nS[t] = strain[c] + 0.2; nL[t] = Geo.lith[c];
        } else if (!contI && contO) { // arriving ocean floor subducts: the continent gains an arc
          nC[t] = Math.min(0.9, eo + 0.006); nM[t] += 0.12; nO[t] += 0.3; nS[t] += 0.2;
        } else { // ocean meets ocean: the older, denser slab sinks, building an island arc
          if (age[c] < nA[t]) { nP[t] = id; nC[t] = ei; nA[t] = age[c]; nR[t] = rock[c]; nG[t] = organic[c]; nE[t] = evap[c]; nL[t] = Geo.lith[c]; }
          nM[t] += 0.08; nC[t] += 0.008; nS[t] += 0.15;
        }
      }
    }
    // gaps: new crust at the trailing edge of whichever plate left; narrow gaps in a continent are rifts
    for (let t = 0; t < GN; t++) {
      if (nP[t] !== NOP) continue;
      const x = t % GW, y = (t / GW) | 0;
      let contN = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const a = x + ox, b = y + oy; if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
        const u = b * GW + a; if (nP[u] !== NOP && nL[u] === 1) contN++; // only intact continent counts: a rift's own floor doesn't
      }
      nP[t] = plate[t] !== NOP ? plate[t] : 0;
      nA[t] = 0; nS[t] = 0; nO[t] = 0; nG[t] = 0; nE[t] = 0;
      if (contN >= 7) { nC[t] = sl - 0.012 + rr() * 0.03; nR[t] = ROCK.VOLCANIC; nM[t] = 0.15; nL[t] = 2; } // rift valley: lakes, narrow seas, fissure volcanoes
      else { nC[t] = oceanDepth(0); nR[t] = ROCK.BASALT; nM[t] = 0.1; nL[t] = 0; }
    }
    Geo.plate.set(nP); Geo.crust.set(nC); Geo.age.set(nA); Geo.rock.set(nR); Geo.strain.set(nS); Geo.magma.set(nM);
    Geo.orog.set(nO); Geo.organic.set(nG); Geo.evap.set(nE); Geo.lith.set(nL);
  }

  // Label boundaries from the relative motion of the two plates; build mountains, arcs, trenches
  // and strain where they meet.
  function classify(dt) {
    const { plate, crust, bound, strain, magma, orog } = Geo, P = Geo.plates;
    bound.fill(0);
    const bc = Geo.stats.boundaries; bc.fill(0);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x, p = plate[c];
      for (let k = 0; k < 2; k++) {
        const n = k === 0 ? (x < GW - 1 ? c + 1 : -1) : (y < GH - 1 ? c + GW : -1);
        if (n < 0 || plate[n] === p) continue;
        const q = plate[n], a = P[p], b = P[q]; if (!a || !b) continue;
        const rvx = a.vx - b.vx, rvy = a.vy - b.vy, nx = k === 0 ? 1 : 0, ny = k === 0 ? 0 : 1;
        const close = rvx * nx + rvy * ny, tang = Math.abs(rvx * ny - rvy * nx), mag = Math.hypot(rvx, rvy) + 1e-6;
        const type = close > 0.3 * mag ? B.CONV : close < -0.3 * mag ? B.DIV : B.TRANS;
        for (const u of [c, n]) if (bound[u] === 0 || type === B.CONV) bound[u] = type;
        bc[type]++;
        if (!dt) continue;
        if (type === B.CONV) {
          const amt = Math.max(0, close) * dt;
          for (const u of [c, n]) {
            if (crust[u] > CONT) {
              crust[u] = Math.min(0.985, crust[u] + amt * 0.09); orog[u] += amt * 0.6; magma[u] += amt * 0.03;
              const ux = u % GW, uy = (u / GW) | 0; // the belt is wider than the suture
              for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
                const a2 = ux + ox, b2 = uy + oy; if (a2 < 0 || b2 < 0 || a2 >= GW || b2 >= GH || (!ox && !oy)) continue;
                const w = b2 * GW + a2; if (crust[w] > CONT) crust[w] = Math.min(0.97, crust[w] + amt * 0.025 / (Math.abs(ox) + Math.abs(oy)));
              }
            }
            else if (crust[c] > CONT || crust[n] > CONT) crust[u] = Math.max(0.04, crust[u] - amt * 0.02); // trench on the ocean side
            strain[u] += amt * 0.25;
          }
        } else if (type === B.TRANS) { strain[c] += tang * dt * 0.3; strain[n] += tang * dt * 0.3; }
        else { magma[c] += 0.004 * dt; magma[n] += 0.004 * dt; }
      }
    }
    if (!dt) return;
    // deep time: release strain as (uncounted-in-history) earthquakes, magma as volcanic growth
    for (let c = 0; c < GN; c++) {
      if (strain[c] > 1) { strain[c] = 0; Geo.quakes++; }
      if (magma[c] > 1) {
        magma[c] -= 1; Geo.eruptions++;
        crust[c] = Math.min(0.97, crust[c] + (crust[c] < CONT ? 0.05 : 0.03));
        if (rr() < 0.3) Geo.rock[c] = ROCK.VOLCANIC;
        if (crust[c] > SEA + Geo.seaLevel && Geo.lith[c] === 0) Geo.lith[c] = 1; // accreted island arc
      }
      magma[c] *= 1 - Math.min(0.5, 0.02 * dt);
    }
  }

  function hotspots(dt) {
    for (const h of Geo.hotspots) {
      const c = Geo.cellOf(h.x * CS, h.y * CS);
      Geo.magma[c] += h.power * 0.25 * dt;
      if (Geo.crust[c] < 0.62) Geo.crust[c] += h.power * 0.012 * dt;
    }
  }

  // Large plates sometimes tear along their thickest crust (supercontinent breakup); plates that
  // have pushed into each other for a long time weld together (suture).
  function wilson(dt) {
    if (Geo.scripted) return;
    const alive = Geo.plates.filter((p) => p.alive).length;
    if (rr() < dt / (alive < 8 ? 4 : 16) && alive < 15) {
      let big = null;
      for (const p of Geo.plates) if (p.alive && p.cells > GN * 0.08 && (!big || p.cells > big.cells)) big = p;
      if (big) splitPlate(big);
    }
    for (let a = 0; a < Geo.plates.length; a++) for (let b = a + 1; b < Geo.plates.length; b++) {
      const k = a * 256 + b;
      if (collide[k] > 120 && alive > 9 && rr() < 0.02 * dt) { suture(Geo.plates[a], Geo.plates[b]); collide[k] = 0; }
      collide[k] *= Math.pow(0.9, dt);
    }
  }
  function splitPlate(p) {
    if (Geo.plates.length >= 250) return;
    const ang = rr() * Math.PI, nx = Math.cos(ang), ny = Math.sin(ang);
    const id = Geo.plates.length, q = { id, sx: p.cx, sy: p.cy, vx: p.vx, vy: p.vy, tx: 0, ty: 0, ax: 0, ay: 0, ox: p.ox, oy: p.oy, cont: 0, cells: 0, hue: (id * 137.5 + 20) % 360, alive: true, cx: p.cx, cy: p.cy };
    Geo.plates.push(q);
    let moved = 0;
    for (let c = 0; c < GN; c++) {
      if (Geo.plate[c] !== p.id) continue;
      const x = c % GW, y = (c / GW) | 0;
      if ((x - p.cx) * nx + (y - p.cy) * ny > 0) { Geo.plate[c] = id; moved++; }
    }
    if (!moved) { Geo.plates.pop(); return; }
    const sp = 0.3 + rr() * 0.35;
    q.vx = q.tx = p.vx + nx * sp; q.vy = q.ty = p.vy + ny * sp;
    p.tx = p.vx - nx * sp * 0.6; p.ty = p.vy - ny * sp * 0.6;
    Geo.splits++;
    Geo.events.push({ kind: 'rift', myr: Geo.myr, x: p.cx * CS, y: p.cy * CS });
  }
  function suture(a, b) {
    if (!a.alive || !b.alive) return;
    const keep = a.cells >= b.cells ? a : b, gone = keep === a ? b : a;
    for (let c = 0; c < GN; c++) if (Geo.plate[c] === gone.id) Geo.plate[c] = keep.id;
    keep.vx = (keep.vx * keep.cells + gone.vx * gone.cells) / (keep.cells + gone.cells);
    keep.vy = (keep.vy * keep.cells + gone.vy * gone.cells) / (keep.cells + gone.cells);
    keep.tx = keep.vx; keep.ty = keep.vy; gone.alive = false; gone.cells = 0;
    Geo.sutures++;
    Geo.events.push({ kind: 'suture', myr: Geo.myr, x: ((a.cx + b.cx) / 2) * CS, y: ((a.cy + b.cy) / 2) * CS });
  }

  // ------------------------------------------------------------ climate
  // Temperature from latitude (north cold) and altitude; westerlies carry rain eastward in the
  // north and trade winds westward in the hot south, so mountains cast rain shadows.
  function baseClimate() {
    const { crust, precip, temp } = Geo, sl = seaLine(), an = Geo.climate.anomaly;
    for (let c = 0; c < GN; c++) {
      const y = (c / GW) | 0, lat = (y + 0.5) / GH;
      temp[c] = 0.24 + lat * 0.58 + an - Math.max(0, crust[c] - sl) * 0.5;
    }
    for (let y = 0; y < GH; y++) {
      const lat = (y + 0.5) / GH, east = lat < 0.68;
      const belt = 1 - 0.6 * Math.exp(-Math.pow((lat - 0.8) / 0.09, 2)) + 0.25 * Math.exp(-Math.pow((lat - 0.35) / 0.18, 2));
      let m = 0.6, prev = sl;
      for (let k = 0; k < GW; k++) {
        const x = east ? k : GW - 1 - k, c = y * GW + x, e = crust[c];
        if (e <= sl) { m = Math.min(1, m + 0.08); precip[c] = 0.7 * m * belt; prev = sl; continue; }
        // moist air rains out slowly over the plains and fast where it is forced up a mountain
        // (the climb is measured against the smoothed ground, so small hills do not wring it dry);
        // forests give part of the rain back to the air
        const lift = Math.max(0, e - prev);
        const rain = m * (0.01 + lift * 1.4);
        precip[c] = Math.min(1, (m * 0.95 + lift * 2.5 * m) * belt + 0.05);
        m = Math.max(0.08, m - rain * 0.8 - 0.0015);
        prev = prev * 0.6 + e * 0.4;
      }
    }
  }
  function climateDeep(dt) {
    const cl = Geo.climate;
    cl.carbon = 0.3 * Math.max(0, 1 - Geo.myr / 250) + 0.05 * Math.sin(Geo.myr / 30 * Math.PI * 2); // greenhouse gases slowly draw down
    cl.aerosol *= Math.pow(0.5, dt * 4);
    cl.anomaly = cl.carbon - 0.08 - cl.aerosol;
    baseClimate();
    // polar ice: grows where it is cold enough, sets the sea level
    let vol = 0;
    for (let c = 0; c < GN; c++) {
      const target = Geo.crust[c] > seaLine() - 0.04 ? AG.smooth(0.17, 0.08, Geo.temp[c]) * (0.4 + Geo.precip[c]) : 0;
      Geo.ice[c] += (target - Geo.ice[c]) * Math.min(1, dt * 0.8);
      vol += Geo.ice[c];
    }
    Geo.iceVol = Math.min(1, vol / (GN * 0.08));
    Geo.seaLevel = -Geo.iceVol * SEA_AMP;
    // organic burial in warm lowland wetlands (future coal) and evaporites in hot dry basins (salt)
    const sl = seaLine();
    for (let c = 0; c < GN; c++) {
      const e = Geo.crust[c], low = e > sl - 0.03 && e < sl + 0.06;
      if (low && Geo.temp[c] > 0.45 && Geo.precip[c] > 0.45) Geo.organic[c] += dt * 0.02;
      if (low && Geo.temp[c] > 0.6 && Geo.precip[c] < 0.18) Geo.evap[c] += dt * 0.02;
    }
  }

  // Orbital cycles for the Age of People: 100k, 41k and 23k years. The Dawn falls near a glacial
  // maximum, so the first millennia are a deglaciation.
  Geo.orbital = function (year) {
    const ph = Geo.climate.phase, s = Math.PI * 2;
    // the 100k cycle is a sawtooth: ice builds for 90,000 years, then collapses in 10,000
    const u = (((year + ph[0]) / 100000) % 1 + 1) % 1;
    const saw = u < 0.9 ? 1 - 2 * (u / 0.9) : -1 + 2 * ((u - 0.9) / 0.1);
    const v = 0.62 * saw + 0.23 * Math.sin(s * (year + ph[1]) / 41000) + 0.15 * Math.sin(s * (year + ph[2]) / 23000);
    return v * 0.08 - 0.045; // glacial max ~ -0.125, interglacial ~ +0.035
  };
  const iceTarget = (an) => AG.clamp((-an - 0.0) / 0.1, 0, 1);
  const iceAt = (c) => Geo.crust[c] > seaLine() - 0.05 ? AG.smooth(0.19, 0.1, Geo.temp[c]) * (0.4 + Geo.precip[c]) * (0.25 + Geo.iceVol) : 0;

  // ------------------------------------------------------------ erosion
  const keys = new Float64Array(GN), rcv = new Int32Array(GN), sed = F32(GN), lap = F32(GN);
  function erode(dt, full) {
    const { crust, precip, acc, ice } = Geo, sl = seaLine();
    // creep / thermal: land relaxes toward its neighbours, faster when high and wet
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x, e = crust[c];
      const l = (x > 0 ? crust[c - 1] : e) + (x < GW - 1 ? crust[c + 1] : e) + (y > 0 ? crust[c - GW] : e) + (y < GH - 1 ? crust[c + GW] : e) - 4 * e;
      lap[c] = l;
    }
    const base = sl + 0.014;
    for (let c = 0; c < GN; c++) {
      const e = crust[c];
      if (e > sl) { const v = e + lap[c] * Math.min(0.2, dt * (0.012 + Math.max(0, e - sl) * 0.07 + ice[c] * 0.06)); crust[c] = e > base ? Math.max(base, v) : Math.max(e, v); }
      else if (lap[c] > 0) crust[c] += lap[c] * Math.min(0.2, dt * 0.01); // sediment slumps into basins
      // long-lived lowlands collect a sedimentary cover
      if (e > sl && e < sl + 0.05 && Geo.rock[c] !== ROCK.SEDIMENT && rr() < dt * 0.004) Geo.rock[c] = ROCK.SEDIMENT;
    }
    if (!full) return;
    // stream power on a D8 drainage network: rivers carve highlands and build shelves and deltas
    for (let c = 0; c < GN; c++) keys[c] = Math.floor(AG.clamp(crust[c], 0, 1) * 1048575) * 65536 + c;
    keys.sort();
    for (let c = 0; c < GN; c++) {
      acc[c] = crust[c] > sl ? 0.2 + precip[c] : 0; sed[c] = 0;
      const x = c % GW, y = (c / GW) | 0;
      let best = -1, be = crust[c];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const a = x + ox, b = y + oy; if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
        const u = b * GW + a; if (crust[u] < be) { be = crust[u]; best = u; }
      }
      rcv[c] = best;
    }
    for (let k = GN - 1; k >= 0; k--) {
      const c = keys[k] % 65536, r = rcv[c];
      if (crust[c] > sl && r >= 0) {
        const slope = crust[c] - crust[r];
        const E = Math.min(slope * 0.5, 0.0025 * Math.sqrt(acc[c]) * slope * 6 * dt, Math.max(0, crust[c] - base));
        crust[c] -= E; sed[c] += E;
        acc[r] += acc[c]; sed[r] += sed[c];
      } else if (sed[c] > 0) { // deposit: fill toward the waterline (shelves, deltas, basins)
        const x = c % GW, y = (c / GW) | 0;
        const coast = sed[c] > 0.012 && ((x > 0 && Geo.lith[c - 1] === 1) || (x < GW - 1 && Geo.lith[c + 1] === 1) || (y > 0 && Geo.lith[c - GW] === 1) || (y < GH - 1 && Geo.lith[c + GW] === 1));
        const room = Math.max(0, (coast ? sl + 0.006 : sl - 0.006) - crust[c]);
        const d = Math.min(room * 0.6, sed[c]);
        crust[c] += d; sed[c] -= d;
        if (r >= 0 && crust[r] < crust[c]) sed[r] += sed[c] * 0.7;
        if (d > 0.002) Geo.rock[c] = ROCK.SEDIMENT;
        if (coast && crust[c] > sl && Geo.lith[c] === 0) Geo.lith[c] = 1; // a coastal plain joins the continent
      }
    }
  }

  // ------------------------------------------------------------ time-lapse frames
  function recordFrame() {
    const f = { myr: Geo.phase === 'deep' ? Geo.myr : Geo.dawnMyr, year: Geo.year, e: new Uint8Array(GN), p: new Uint8Array(GN), sea: Geo.seaLevel };
    for (let c = 0; c < GN; c++) { f.e[c] = AG.clamp(((Geo.crust[c] - Geo.seaLevel) * 255) | 0, 0, 255); f.p[c] = Geo.plate[c]; }
    Geo.frames.push(f);
    if (Geo.frames.length > 260) Geo.frames.splice(0, Geo.frames.length - 260);
  }
  Geo.recordFrame = recordFrame;

  // ------------------------------------------------------------ fine map from the coarse crust
  // Bilinear crust + detail that rides each plate (+ ridges in mountain belts), minus sea level.
  function sampleCrust(fx, fy) {
    const gx = AG.clamp(fx / CS - 0.5, 0, GW - 1.001), gy = AG.clamp(fy / CS - 0.5, 0, GH - 1.001);
    const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, c = y0 * GW + x0, cr = Geo.crust;
    const x1 = x0 + 1 < GW ? 1 : 0, y1 = y0 + 1 < GH ? GW : 0;
    return (cr[c] * (1 - tx) + cr[c + x1] * tx) * (1 - ty) + (cr[c + y1] * (1 - tx) + cr[c + y1 + x1] * tx) * ty;
  }
  function sampleField(f, fx, fy) {
    const gx = AG.clamp(fx / CS - 0.5, 0, GW - 1.001), gy = AG.clamp(fy / CS - 0.5, 0, GH - 1.001);
    const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, c = y0 * GW + x0;
    const x1 = x0 + 1 < GW ? 1 : 0, y1 = y0 + 1 < GH ? GW : 0;
    return (f[c] * (1 - tx) + f[c + x1] * tx) * (1 - ty) + (f[c + y1] * (1 - tx) + f[c + y1 + x1] * tx) * ty;
  }
  Geo.sampleField = sampleField;

  // The fine map painted from the coarse crust and climate, a band of rows at a time: deep time
  // builds its next picture of the land a few rows per frame (quiet: the renderer draws those rows
  // into a hidden picture itself and morphs the map into it, so nothing is marked for repainting).
  Geo.paintRows = function (yA, yB, quiet) {
    const { elev, fl, ft, frozen, veg, soil, snow, tbase, moist, ice, rock, plate } = Wd;
    const P = Geo.plates, sl = Geo.seaLevel;
    for (let y = yA; y < yB; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = Geo.cellOf(x, y), p = P[Geo.plate[c]] || P[0];
      const ux = (x - p.ox * CS) & (T - 1), uy = (y - p.oy * CS) & (T - 1), tI = uy * T + ux;
      // continental shelves: flooded continental crust lies shallow (within the reach of an ice-age
      // sea), then the slope drops to the abyss — so glacial seas expose broad plains and land bridges
      let r = sampleCrust(x + 0.5, y + 0.5) - SEA;
      if (r < 0.02 && r > -0.2) { const d = 0.02 - r; r = -(d < 0.1 ? d * 0.42 : 0.042 + (d - 0.1) * 1.58); } // (low coasts sink a little too)
      const base = SEA + r - sl;
      const up = base - SEA;
      const rug = 0.012 + 0.06 * AG.smooth(0.0, 0.3, up) + Math.min(0.08, Geo.orog[c] * 0.02);
      let e = base + tileA[tI] * (up > 0 ? 0.05 + rug * 0.4 : r > -0.06 ? 0.012 : 0.035) + (up > 0.02 ? tileB[tI] * rug * 1.6 : 0);
      elev[i] = AG.clamp(e, 0.02, 0.985);
      plate[i] = Geo.plate[c]; rock[i] = Geo.rock[c];
      const t = sampleField(Geo.temp, x + 0.5, y + 0.5) - Math.max(0, elev[i] - base) * 0.7, m = sampleField(Geo.precip, x + 0.5, y + 0.5);
      tbase[i] = AG.clamp(t + tileA[(tI + 7777) & (T * T - 1)] * 0.06, -0.3, 1.1);
      moist[i] = AG.clamp(m * 1.25 + tileA[(tI + 33333) & (T * T - 1)] * 0.25, 0, 1);
      const gi = sampleField(Geo.ice, x + 0.5, y + 0.5);
      ice[i] = elev[i] >= SEA - 0.02 && gi > 0.35 ? AG.clamp(((gi - 0.35) * 600) | 0, 0, 255) : 0;
      frozen[i] = 0;
      if (elev[i] < SEA) { fl[i] = SEA - elev[i]; ft[i] = FT.WATER; soil[i] = elev[i] > SEA - 0.03 ? SO.SAND : SO.DIRT; veg[i] = 0; snow[i] = 0; if (tbase[i] < 0.12) frozen[i] = 1; continue; }
      fl[i] = 0; ft[i] = FT.NONE;
      const mo = moist[i], tt = tbase[i];
      if (elev[i] < SEA + 0.012 && mo < 0.7) soil[i] = SO.SAND;
      else if (elev[i] > AG.MOUNTAIN + 0.04) soil[i] = SO.ROCK;
      else if (tt > 0.58 && mo < 0.3) soil[i] = SO.SAND;
      else if (rock[i] === ROCK.VOLCANIC && elev[i] < AG.HILL) soil[i] = SO.ASH;
      else soil[i] = SO.DIRT;
      veg[i] = ice[i] ? 0 : AG.clamp(Wd.vegCap(mo, tt, soil[i]) * (0.55 + (tileA[(tI + 999) & (T * T - 1)] + 0.5) * 0.7), 0, 255) | 0;
      snow[i] = ice[i] || elev[i] > AG.PEAK || tt < 0.06 ? 220 : 0;
    }
    if (quiet) return;
    // the chunks those rows touch need repainting on screen
    const r0 = (yA >> 4) * AG.CW, r1 = Math.min(AG.NC, (((yB - 1) >> 4) + 1) * AG.CW);
    for (let k = r0; k < r1; k++) { Wd.dirty[k] = 1; Wd.udirty[k] = 1; }
  };
  Geo.paintFine = function () { Geo.paintRows(0, H); Wd.dirty.fill(1); Wd.udirty.fill(1); };

  // ------------------------------------------------------------ the Dawn: finish the world
  Geo.dawn = function () {
    Geo.phase = 'history'; Geo.dawnMyr = Geo.myr; Geo.year = 0;
    const cl = Geo.climate; cl.carbon = 0; cl.aerosol = 0;
    cl.orbital = Geo.orbital(0); cl.anomaly = cl.orbital;
    Geo.iceVol = iceTarget(cl.anomaly);
    Geo.seaLevel = -Geo.iceVol * SEA_AMP;
    baseClimate();
    for (let c = 0; c < GN; c++) Geo.ice[c] = iceAt(c);
    Geo.paintFine();
    Geo.dawnAnomaly = cl.anomaly; Geo.shift = 0;
    Geo.applied = 0; // from here on, sea-level changes shift the fine land by (seaLevel - level at dawn)
    Geo.dawnSea = Geo.seaLevel;
    const r = AG.mulberry32((Geo.seed * 7919) >>> 0);
    rivers(r); fertility(); underground(r); resources(r); findVolcanoes();
    Wd.updateCereal();
    recordFrame(); // the time-lapse keeps deep time and carries on
  };

  function rivers(r) {
    const { elev, fl, ft, veg, moist } = Wd;
    const sources = [], want = Math.round(10 * AG.SCALE);
    for (let tries = 0; tries < 1500 * AG.SCALE && sources.length < want; tries++) {
      const x = 12 + ((r() * (W - 24)) | 0), y = 12 + ((r() * (H - 24)) | 0), i = y * W + x;
      if (elev[i] < 0.56 || elev[i] > 0.9 || moist[i] < 0.42 || Wd.ice[i]) continue;
      if (sources.some((s) => AG.dist2(s.x, s.y, x, y) < 30 * 30)) continue;
      sources.push({ x, y });
    }
    for (const src of sources) {
      let x = src.x, y = src.y, last = elev[y * W + x];
      for (let step = 0; step < 900; step++) {
        const i = y * W + x;
        elev[i] = Math.min(elev[i], last) - 0.005; last = elev[i];
        Wd.rock[i] = Wd.rock[i] === ROCK.BASALT ? ROCK.BASALT : ROCK.ALLUVIUM;
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
    // floodplains: low ground along rivers becomes alluvium
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (fl[i] > 0 || elev[i] > SEA + 0.08) continue;
      for (let k = 0; k < 8; k++) {
        const a = x + ((k % 3) - 1) * 2, b = y + (((k / 3) | 0) - 1) * 2, j = b * W + a;
        if (fl[j] > 0.008 && fl[j] < 0.05 && elev[j] >= SEA - 0.01) { Wd.rock[i] = ROCK.ALLUVIUM; break; }
      }
    }
  }
  function fertility() {
    const { soil, fert, rock, moist } = Wd;
    for (let i = 0; i < N; i++) {
      let f = soil[i] === SO.DIRT ? 120 : soil[i] === SO.ASH ? 210 : soil[i] === SO.SAND ? 30 : 10;
      if (rock[i] === ROCK.ALLUVIUM) f += 80;
      f *= 0.6 + moist[i] * 0.6;
      fert[i] = AG.clamp(f | 0, 0, 255);
    }
  }
  function underground(r) {
    const { ug, ugF, ugT, elev, moist, rock } = Wd;
    const nC = AG.makeNoise(Geo.seed + 6), nO = AG.makeNoise(Geo.seed + 7), nM = AG.makeNoise(Geo.seed + 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { ug[i] = UG.BEDROCK; continue; }
      const c = nC.fbm(x * 0.055, y * 0.055, 3);
      ug[i] = c > (rock[i] === ROCK.SEDIMENT ? 0.55 : 0.6) ? UG.CAVE : (elev[i] < 0.55 && nO.fbm(x * 0.03, y * 0.03, 2) > 0.5 ? UG.DIRT : UG.ROCK);
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
      const i = y * W + x, c = Geo.cellOf(x, y), rk = rock[i];
      if (ug[i] === UG.CAVE) {
        const m = nM.fbm(x * 0.04 + 90, y * 0.04, 2);
        if (Geo.magma[c] > 0.4 || (rk === ROCK.VOLCANIC && nO.fbm(x * 0.02 + 300, y * 0.02, 2) > 0.55)) { ugT[i] = UF.MAGMA; ugF[i] = 220; }
        else if (moist[i] > 0.6 && elev[i] < 0.55 && m > 0.55) { ugT[i] = UF.WATER; ugF[i] = 180; }
        else if (m > 0.62) ug[i] = UG.FUNGUS;
        continue;
      }
      const o = nO.fbm(x * 0.09, y * 0.09, 2), q = r();
      if ((rk === ROCK.META || rk === ROCK.VOLCANIC) && o > 0.68) ug[i] = q < 0.7 ? UG.COPPER : UG.GOLD;
      else if ((rk === ROCK.GRANITE && o > 0.72) || (rk === ROCK.META && o < 0.22)) ug[i] = UG.TIN;
      else if ((rk === ROCK.SEDIMENT || rk === ROCK.ALLUVIUM) && o > 0.7) ug[i] = UG.IRON;
      else if (Geo.organic[c] > 0.25 && o < 0.34) ug[i] = UG.COAL;
      else if (Geo.evap[c] > 0.15 && o < 0.36) ug[i] = UG.SALT;
      else if (rk === ROCK.META && q < 0.0025) ug[i] = UG.CRYSTAL;
    }
  }
  // Surface deposits people can find without mining: outcrops over ores, flint in chalk, clay by
  // rivers, obsidian at volcanoes, salt pans in dry basins.
  function resources(r) {
    const { res, rock, ug, elev, fl, moist, tbase } = Wd;
    res.fill(0);
    const nR = AG.makeNoise(Geo.seed + 11);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (elev[i] < SEA || fl[i] > 0.004 || Wd.ice[i]) continue;
      const n = nR.fbm(x * 0.12, y * 0.12, 2), q = r(), rk = rock[i], u = ug[i];
      if (u === UG.COPPER && q < 0.22) res[i] = RES.COPPER;
      else if (u === UG.TIN && q < 0.3) res[i] = RES.TIN;
      else if (u === UG.IRON && q < 0.12) res[i] = RES.IRON;
      else if (u === UG.GOLD && q < 0.15) res[i] = RES.GOLD;
      else if (u === UG.COAL && q < 0.1) res[i] = RES.COAL;
      else if (u === UG.SALT && q < 0.35) res[i] = RES.SALT;
      else if (rk === ROCK.SEDIMENT && n > 0.6 && q < 0.3) res[i] = RES.FLINT;
      else if (rk === ROCK.ALLUVIUM && n > 0.55 && q < 0.3) res[i] = RES.CLAY;
      else if (rk === ROCK.VOLCANIC && n > 0.64 && q < 0.2) res[i] = RES.OBSIDIAN;
      else if (tbase[i] > 0.55 && moist[i] < 0.3 && elev[i] < SEA + 0.04 && n < 0.35 && q < 0.25) res[i] = RES.SALT;
      else if ((rk === ROCK.GRANITE || rk === ROCK.META) && n > 0.7 && q < 0.15) res[i] = RES.FLINT;
    }
  }
  function findVolcanoes() {
    Geo.volcanoes.length = 0;
    const cand = [];
    for (let c = 0; c < GN; c++) {
      const hot = Geo.magma[c] + (Geo.rock[c] === ROCK.VOLCANIC ? 0.25 : 0) + Geo.hotspots.reduce((s, h) => s + (Geo.cellOf(h.x * CS, h.y * CS) === c ? 1 : 0), 0);
      if (hot > 0.45 && Geo.crust[c] > seaLine() - 0.05) cand.push({ c, hot });
    }
    cand.sort((a, b) => b.hot - a.hot);
    for (const k of cand) {
      if (Geo.volcanoes.length >= 10) break;
      const gx = k.c % GW, gy = (k.c / GW) | 0;
      if (Geo.volcanoes.some((v) => AG.dist2(v.gx, v.gy, gx, gy) < 64)) continue;
      let bx = gx * CS, by = gy * CS, be = -1;
      for (let y = gy * CS; y < Math.min(H, gy * CS + CS); y++) for (let x = gx * CS; x < Math.min(W, gx * CS + CS); x++) if (Wd.elev[y * W + x] > be) { be = Wd.elev[y * W + x]; bx = x; by = y; }
      Geo.volcanoes.push({ gx, gy, x: bx, y: by, magma: rr() * 0.6, name: '', erupted: 0 });
    }
  }

  // ------------------------------------------------------------ the Age of People
  // Called once per simulated year (fast time) or sliced (watch time); dy = years elapsed.
  Geo.yearStep = function (dy) {
    if (Geo.phase !== 'history') return;
    Geo.year += dy;
    const cl = Geo.climate;
    cl.orbital = Geo.orbital(Geo.year);
    cl.aerosol *= Math.pow(0.72, dy);
    cl.anomaly = cl.orbital - cl.aerosol + cl.carbon;
    Geo.shift = cl.anomaly - Geo.dawnAnomaly;
    // ice responds slowly: sheets build over millennia, collapse faster
    const tgt = iceTarget(cl.orbital + cl.carbon), tau = tgt > Geo.iceVol ? 6000 : 2200; // greenhouse (and the Warm/Ice-age powers) moves the ice; brief volcanic winters do not
    Geo.iceVol += (tgt - Geo.iceVol) * Math.min(1, dy / tau);
    Geo.seaLevel = -Geo.iceVol * SEA_AMP;
    applySea(false);
    if (Math.floor(Geo.year / 50) !== Math.floor((Geo.year - dy) / 50)) glaciers();
    tectonicEvents(dy);
    if (Math.floor(Geo.year / 25) !== Math.floor((Geo.year - dy) / 25)) deltas();
    if (Math.floor(Geo.year / 250) !== Math.floor((Geo.year - dy) / 250)) recordFrame();
  };

  // Sea-level change = shift all ground by the opposite amount, in steps of 0.0004.
  function applySea(force) {
    const want = Geo.seaLevel - Geo.dawnSea, d = want - Geo.applied;
    if (!force && Math.abs(d) < 0.0004) return;
    const { elev } = Wd;
    for (let i = 0; i < N; i++) elev[i] = AG.clamp(elev[i] - d, 0.01, 0.99);
    Geo.applied = want;
    if (AG.mode !== 'watch') Wd.oceanFill(); // in watch time the ocean pin floods or drains the coast
    Wd.dirty.fill(1);
    Geo.seaShifts = (Geo.seaShifts || 0) + 1;
  }
  Geo.applySea = applySea;

  // Glaciers follow the climate: coarse ice relaxes toward a cold-and-wet target and is painted
  // into the fine grid as ice; retreating ice leaves fertile, freshly scoured ground.
  function glaciers() {
    baseClimate();
    const sl = seaLine(), k = 0.25;
    for (let c = 0; c < GN; c++) {
      Geo.ice[c] += (iceAt(c) - Geo.ice[c]) * k;
    }
    const { ice, snow, veg, elev, fert, soil } = Wd;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gi = sampleField(Geo.ice, x + 0.5, y + 0.5) + tileA[(y & 511) * T + (x & 511)] * 0.12;
      const v = elev[i] >= SEA - 0.02 && gi > 0.35 ? AG.clamp(((gi - 0.35) * 600) | 0, 0, 255) : 0;
      if (v === ice[i]) continue;
      if (!v && ice[i]) { snow[i] = 0; if (soil[i] === SO.DIRT) fert[i] = Math.min(255, fert[i] + 40); } // fresh loess
      ice[i] = v;
      if (v) { veg[i] = 0; snow[i] = 220; }
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    Wd.updateCereal();
  }
  Geo.glaciers = glaciers;

  // Earthquakes release strain along convergent and transform boundaries; volcanoes erupt when
  // their magma builds up. Both are queued as events for the world and its people to feel.
  function tectonicEvents(dy) {
    const { strain, bound, crust } = Geo, P = Geo.plates;
    const sl = seaLine();
    for (let c = 0; c < GN; c++) {
      const b = bound[c]; if (b === 0 || b === B.DIV) continue;
      const p = P[Geo.plate[c]], rate = p ? Math.hypot(p.vx, p.vy) : 1;
      strain[c] += dy * rate * 0.00003 * (b === B.TRANS ? 1.4 : 1);
      if (strain[c] > 0.04 && rr() < dy * 0.0025 * strain[c] * strain[c] / 0.16) {
        const released = strain[c] * (0.3 + rr() * 0.7);
        strain[c] -= released;
        for (const u of [c - 1, c + 1, c - GW, c + GW]) if (u >= 0 && u < GN && bound[u]) strain[u] *= 0.6;
        const mag = Math.min(9.3, 4.2 + Math.log10(1 + released * 60) * 2.2 + rr() * 0.4);
        const x = (c % GW) * CS + ((rr() * CS) | 0), y = ((c / GW) | 0) * CS + ((rr() * CS) | 0);
        const sea = crust[c] < sl;
        Geo.quakes++;
        Geo.events.push({ kind: 'quake', year: Geo.year, x, y, mag: Math.round(mag * 10) / 10, sea, tsunami: sea && mag >= 7.2, fault: b === B.TRANS ? 'transform' : 'subduction' });
      }
    }
    for (const v of Geo.volcanoes) {
      const c = v.gy * GW + v.gx;
      v.magma += dy * (0.0012 + Geo.magma[c] * 0.0008);
      if (v.magma > 0.8 && rr() < dy * 0.006 * Math.pow(v.magma, 3)) {
        const vei = Math.min(7, Math.max(1, Math.round(1 + v.magma * 2.4 + rr() * 2 - 1)));
        v.magma = rr() * 0.2; v.erupted++;
        Geo.eruptions++;
        Geo.climate.aerosol += vei >= 4 ? 0.0008 * vei * vei : 0; // big eruptions cool the world for years
        Geo.events.push({ kind: 'eruption', year: Geo.year, x: v.x, y: v.y, vei, volcano: v });
      }
    }
    if (Geo.events.length > 400) Geo.events.splice(0, Geo.events.length - 400);
  }

  // Rivers that reach the sea drop silt: the coast grows outward at their mouths.
  function deltas() {
    const { elev, fl, ft } = Wd;
    for (const s of Wd.springs) {
      // follow the river down to the sea
      let i = s.i, guard = 0;
      while (guard++ < 1500) {
        const x = i % W, y = (i / W) | 0;
        let best = -1, be = elev[i] + fl[i];
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const a = x + ox, b = y + oy; if (a < 1 || b < 1 || a >= W - 1 || b >= H - 1) continue;
          const j = b * W + a; if (elev[j] < elev[i] && (fl[j] > 0.004 || elev[j] < SEA)) { const v = elev[j]; if (v < be) { be = v; best = j; } }
        }
        if (best < 0) break;
        i = best;
        if (elev[i] < SEA - 0.004) {
          // mouth reached: raise a small fan of shallow sea floor toward the waterline
          const mx = i % W, my = (i / W) | 0;
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
            const a = mx + ox, b = my + oy; if (a < 1 || b < 1 || a >= W - 1 || b >= H - 1) continue;
            const j = b * W + a; if (elev[j] < SEA + 0.002 && elev[j] > SEA - 0.05) { elev[j] = Math.min(SEA + 0.003, elev[j] + 0.004); Wd.rock[j] = ROCK.ALLUVIUM; if (elev[j] >= SEA && ft[j] === FT.WATER && fl[j] < 0.02) { fl[j] = 0; ft[j] = FT.NONE; } Wd.dirty[Wd.chunkOfIdx(j)] = 1; }
          }
          break;
        }
      }
    }
  }

  // Watch-time tick: slice the year step so climate and tectonics keep running while you watch.
  Geo.tick = function () {
    if (Geo.phase !== 'history') return;
    if (AG.tick % 48 === 0) Geo.yearStep(48 / AG.YEAR_TICKS);
  };

  // Scripted plate set-ups for tests: two plates meeting, parting or sliding past each other.
  Geo.scenario = function (kind, seed) {
    Geo.init(seed || 1);
    const half = GW >> 1;
    Geo.plates = [0, 1].map((id) => ({ id, sx: 0, sy: 0, vx: 0, vy: 0, tx: 0, ty: 0, ax: 0, ay: 0, ox: 0, oy: 0, cont: 1, cells: 0, hue: id * 180, alive: true, cx: 0, cy: 0, pinned: true }));
    for (let c = 0; c < GN; c++) {
      const x = c % GW;
      Geo.plate[c] = x < half ? 0 : 1;
      Geo.crust[c] = 0.47; Geo.lith[c] = 1; Geo.rock[c] = ROCK.GRANITE; Geo.age[c] = 500;
      Geo.strain[c] = 0; Geo.magma[c] = 0; Geo.orog[c] = 0;
    }
    const v = { collide: [1, 0, -1, 0], rift: [-1, 0, 1, 0], transform: [0, 0.8, 0, -0.8] }[kind];
    Geo.plates[0].vx = Geo.plates[0].tx = v[0]; Geo.plates[0].vy = Geo.plates[0].ty = v[1];
    Geo.plates[1].vx = Geo.plates[1].tx = v[2]; Geo.plates[1].vy = Geo.plates[1].ty = v[3];
    Geo.hotspots = []; Geo.climate.carbon = 0.1;
    Geo.scripted = true;
  };

  // Info for the inspector and overlays.
  Geo.describe = function (x, y) {
    const c = Geo.cellOf(x, y), p = Geo.plates[Geo.plate[c]];
    const b = ['interior', 'convergent boundary', 'divergent boundary', 'transform fault'][Geo.bound[c]];
    return { plate: p ? p.id : -1, plateSpeed: p ? Math.hypot(p.vx, p.vy) : 0, boundary: b, rock: AG.ROCKS[Wd.rock[y * W + x]], strain: Geo.strain[c], magma: Geo.magma[c] };
  };
  // One calendar from the world's birth: Year 0, 1, 2, ... Deep time counts in millions of years;
  // the Age of People continues the same count from the Dawn. y = years since the Dawn (or null for now).
  AG.calYear = function (y) {
    if (Geo.phase === 'deep' && (y === null || y === undefined)) return Math.round(Geo.myr * 1e6);
    return Math.round(Geo.dawnMyr * 1e6) + Math.floor(y === null || y === undefined ? Geo.year : y);
  };
  AG.calText = (y) => `Year ${AG.calYear(y).toLocaleString('en-US')}`;
  Geo.label = function () {
    return `Year ${AG.calYear(Geo.phase === 'deep' ? null : Geo.year).toLocaleString('en-US')}`;
  };
})();
