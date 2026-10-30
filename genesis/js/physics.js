/* AURA: Genesis — physics.js
 * Grid physics, processed only inside "awake" 16x16 chunks (dilated by one):
 *  - height-field fluids (water / lava / acid) with per-type viscosity and
 *    reactions (lava+water -> basalt+steam, acid+water -> dilution, ...)
 *  - fire spread biased by wind, fuel and wetness; smoke emission
 *  - heat anomaly diffusion driving freezing / thawing / ignition fronts
 *  - gas advection (steam, smoke, miasma) with wind
 *  - a slow round-robin pass for vegetation, snow, seasons, roads
 *  - an underground cellular automaton for magma and aquifers. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World;
  const { W, H, N, CW, CH, NC, SEA, FT, GT, SO, UG, UF } = AG;
  const rnd = AG.rnd;
  const { elev, fl, ft, frozen, veg, snow, soil, fire, heat, gas, gt, moist, tbase, traffic, bgrid, ug, ugF, ugT } = Wd;

  const dfl = new Float32Array(N), inT = new Uint8Array(N), dgas = new Float32Array(N);
  const act = new Uint8Array(NC), list = new Int32Array(NC), hot = new Uint8Array(NC).fill(1);
  const RATE = new Float32Array([0, 0.5, 0.1, 0.42]); // per-fluid flow rate (viscosity)
  const DEEP = SEA - 0.03;                             // below this, water is open ocean
  const GAS_DECAY = new Float32Array([0, 0.97, 0.988, 0.995]);
  const P = (AG.Physics = { stats: { active: 0, uactive: 0, ms: { fluid: 0, gas: 0, slow: 0, deep: 0 } } });
  const now = () => performance.now();
  const ema = (k, v) => { P.stats.ms[k] = P.stats.ms[k] * 0.95 + v * 0.05; };
  let slowCursor = 0;

  function nb4(i, x, y) {
    switch ((rnd() * 4) | 0) {
      case 0: return x > 0 ? i - 1 : -1;
      case 1: return x < W - 1 ? i + 1 : -1;
      case 2: return y > 0 ? i - W : -1;
      default: return y < H - 1 ? i + W : -1;
    }
  }

  // ------------------------------------------------------------ reactions
  function react(i, resident, incoming, amt) {
    const x = i % W, y = (i / W) | 0;
    const a = resident, b = incoming;
    if ((a === FT.WATER && b === FT.LAVA) || (a === FT.LAVA && b === FT.WATER)) {
      if (a === FT.LAVA) { elev[i] = Math.min(0.98, elev[i] + fl[i] * 0.85 + 0.001); fl[i] = 0; ft[i] = FT.NONE; }
      else { elev[i] = Math.min(0.98, elev[i] + 0.012); fl[i] = Math.max(0, fl[i] - 0.012); ft[i] = fl[i] > 0 ? FT.WATER : FT.NONE; }
      frozen[i] = 0; soil[i] = SO.BASALT; veg[i] = 0;
      gas[i] = Math.min(1, gas[i] + 0.5); gt[i] = GT.STEAM; if (heat[i] < 0.25) heat[i] = 0.25;
      if (rnd() < 0.25) AG.FX.burst(x + 0.5, y + 0.5, 'steam', 3);
    } else if ((a === FT.WATER && b === FT.ACID) || (a === FT.ACID && b === FT.WATER)) {
      fl[i] = fl[i] * 0.94 + (amt || 0); ft[i] = FT.WATER;
      if (rnd() < 0.2) { gas[i] = Math.min(1, gas[i] + 0.15); gt[i] = GT.MIASMA; }
    } else if ((a === FT.LAVA && b === FT.ACID) || (a === FT.ACID && b === FT.LAVA)) {
      fl[i] *= 0.6; ft[i] = FT.LAVA; gas[i] = Math.min(1, gas[i] + 0.4); gt[i] = GT.SMOKE;
    } else fl[i] += amt || 0;
  }
  P.react = react;

  P.addFluid = function (i, type, amt) {
    if (fl[i] > 0.002 && ft[i] !== type) react(i, ft[i], type, amt);
    else { fl[i] += amt; ft[i] = type; if (type !== FT.WATER) frozen[i] = 0; }
    Wd.wake1(i % W, (i / W) | 0);
  };

  // ------------------------------------------------------------ fluids
  function edge(a, b) {
    const fa = fl[a], fb = fl[b];
    if (fa < 1e-5 && fb < 1e-5) return;
    if (frozen[a] || frozen[b]) return;
    const d = elev[a] + fa - elev[b] - fb;
    if (d > 0) {
      if (fa < 1e-5) return;
      const q = Math.min(fa * 0.24, d * 0.5 * RATE[ft[a]]);
      if (q < 2e-6) return;
      dfl[a] -= q; dfl[b] += q;
      if (ft[b] !== ft[a]) inT[b] = ft[a];
    } else {
      if (fb < 1e-5) return;
      const q = Math.min(fb * 0.24, -d * 0.5 * RATE[ft[b]]);
      if (q < 2e-6) return;
      dfl[b] -= q; dfl[a] += q;
      if (ft[a] !== ft[b]) inT[a] = ft[b];
    }
  }

  function flux(c) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    const rightAct = cx + 1 < CW && act[c + 1], downAct = cy + 1 < CH && act[c + CW];
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x0 + 16; x++, i++) {
        if (x < x0 + 15 || rightAct) edge(i, i + 1);
        if (y < y0 + 15 || downAct) edge(i, i + W);
      }
    }
  }

  function lavaCell(i, x, y) {
    if (heat[i] < 0.9) heat[i] = 0.9;
    veg[i] = 0; snow[i] = 0; frozen[i] = 0;
    const f = fl[i];
    if (rnd() < (f < 0.02 ? 0.03 : 0.004)) {
      const s = Math.min(f, 0.006); fl[i] = f - s; elev[i] = Math.min(0.98, elev[i] + s * 0.9);
      if (fl[i] < 0.0015) { elev[i] += fl[i]; fl[i] = 0; ft[i] = FT.NONE; soil[i] = SO.BASALT; }
    }
    if (rnd() < 0.06) { const j = nb4(i, x, y); if (j >= 0 && veg[j] > 25 && fl[j] < 0.003 && !fire[j]) fire[j] = 220; }
    if (rnd() < 0.006) { gas[i] = Math.min(1, gas[i] + 0.25); gt[i] = GT.SMOKE; }
    if (bgrid[i] && rnd() < 0.3) AG.Civ.damageBuilding(bgrid[i] - 1, 6, -1);
  }

  function acidCell(i) {
    if (elev[i] > 0.05) elev[i] -= 0.00035;
    if (veg[i]) veg[i] = veg[i] > 6 ? veg[i] - 6 : 0;
    snow[i] = 0; frozen[i] = 0;
    fl[i] *= 0.9992;
    if (rnd() < 0.004) { gas[i] = Math.min(1, gas[i] + 0.12); gt[i] = GT.MIASMA; }
    if (bgrid[i] && rnd() < 0.3) AG.Civ.damageBuilding(bgrid[i] - 1, 2, -1);
    if (fl[i] < 0.0005) { fl[i] = 0; ft[i] = FT.NONE; }
  }

  function fireCell(i, x, y, wx, wy, raining) {
    let f = fire[i];
    if (fl[i] > 0.003 && ft[i] === FT.WATER) { fire[i] = 0; gas[i] = Math.min(1, gas[i] + 0.2); gt[i] = GT.STEAM; return; }
    if (heat[i] < 0.7) heat[i] = 0.7;
    if (snow[i]) snow[i] = snow[i] > 8 ? snow[i] - 8 : 0;
    const b = bgrid[i];
    if (veg[i]) veg[i] = veg[i] > 5 ? veg[i] - 5 : 0;
    if (b && rnd() < 0.5) AG.Civ.damageBuilding(b - 1, 1.5, -1);
    if (!veg[i] && !bgrid[i]) {
      f -= raining ? 24 : 10;
      if (f <= 0) { f = 0; if (soil[i] === SO.DIRT || soil[i] === SO.HOLY || soil[i] === SO.FARM) soil[i] = SO.ASH; }
    } else if (raining && rnd() < 0.08) f = Math.max(0, f - 40);
    fire[i] = f;
    if (rnd() < 0.12) { gas[i] = Math.min(1, gas[i] + 0.07); gt[i] = GT.SMOKE; }
    if (rnd() < 0.02) AG.FX.burst(x + 0.5, y + 0.5, 'ember', 1);
    if (rnd() < 0.4) {
      const dir = (rnd() * 4) | 0;
      let j = -1, dx = 0, dy = 0;
      if (dir === 0 && x > 0) { j = i - 1; dx = -1; } else if (dir === 1 && x < W - 1) { j = i + 1; dx = 1; }
      else if (dir === 2 && y > 0) { j = i - W; dy = -1; } else if (dir === 3 && y < H - 1) { j = i + W; dy = 1; }
      if (j < 0 || fire[j]) return;
      if (fl[j] > 0.003 && !frozen[j]) return;
      let fuel = veg[j] / 255 + (bgrid[j] ? 0.7 : 0);
      if (fuel < 0.08) return;
      const wind = Math.max(0.15, 1 + (dx * wx + dy * wy) * 1.8);
      let p = fuel * wind * 0.3 * (1 - moist[j] * 0.6);
      if (snow[j] > 40) p *= 0.1;
      if (raining) p *= 0.15;
      if (rnd() < p) fire[j] = 190 + ((rnd() * 60) | 0);
    }
  }

  function applyChunk(c, wx, wy) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    let busy = false, warm = false;
    // heat only needs diffusing where this chunk or a neighbour holds an anomaly
    const doHeat = hot[c] || (cx > 0 && hot[c - 1]) || (cx < CW - 1 && hot[c + 1]) || (cy > 0 && hot[c - CW]) || (cy < CH - 1 && hot[c + CW]);
    const sT = AG.Sky.seasonT + AG.Sky.chunkT[c], raining = AG.Sky.chunkRain[c];
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x0 + 16; x++, i++) {
        const d = dfl[i];
        if (elev[i] < DEEP && ft[i] <= FT.WATER) {
          // open ocean is a reservoir pinned to sea level: inflow drains away, chunks can sleep
          if (d !== 0) { dfl[i] = 0; if (inT[i] === FT.LAVA) react(i, FT.WATER, FT.LAVA); inT[i] = 0; }
          if (!frozen[i]) { fl[i] = SEA - elev[i]; ft[i] = FT.WATER; }
        } else if (d !== 0) {
          const old = fl[i]; let nv = old + d; if (nv < 1e-5) nv = 0;
          fl[i] = nv; dfl[i] = 0;
          const it = inT[i];
          if (it) { inT[i] = 0; if (old < 0.002) ft[i] = it; else if (it !== ft[i]) react(i, ft[i], it); }
          if (d > 6e-5 || d < -6e-5) busy = true;
          if (fl[i] === 0) ft[i] = FT.NONE;
        }
        // heat anomaly diffusion (in place) — drives freeze/ignite fronts
        let h = heat[i];
        if (doHeat) {
          const hl = x > 0 ? heat[i - 1] : 0, hr = x < W - 1 ? heat[i + 1] : 0, hu = y > 0 ? heat[i - W] : 0, hd = y < H - 1 ? heat[i + W] : 0;
          if (h !== 0 || hl !== 0 || hr !== 0 || hu !== 0 || hd !== 0) {
            h = (h * 0.76 + (hl + hr + hu + hd) * 0.06) * 0.993;
            if (h < 0.002 && h > -0.002) h = 0; else { warm = true; if (h > 0.02 || h < -0.02) busy = true; }
            heat[i] = h;
          }
        }
        const f = fl[i];
        const T = tbase[i] + sT + h;
        if (f > 0) {
          const typ = ft[i];
          if (typ === FT.LAVA) { lavaCell(i, x, y); busy = true; }
          else if (typ === FT.ACID) { acidCell(i); busy = true; }
          else if (f > 0.002) {
            if (!frozen[i]) {
              if (T < 0.12 && (f < 0.35 || T < -0.1)) {
                let nf = 0;
                if (x > 0) nf += frozen[i - 1]; if (x < W - 1) nf += frozen[i + 1]; if (y > 0) nf += frozen[i - W]; if (y < H - 1) nf += frozen[i + W];
                if (rnd() < 0.01 + nf * 0.06 + (T < 0 ? 0.05 : 0)) { frozen[i] = 1; busy = true; }
              }
            } else if (T > 0.22 && rnd() < 0.02 + (T - 0.22)) { frozen[i] = 0; busy = true; }
          }
        } else if (h < -0.25 && snow[i] < 200 && rnd() < 0.05) snow[i] += 30; // frost bloom from cold fronts
        if (snow[i] && T > 0.34 && rnd() < 0.25) snow[i] = snow[i] > 3 ? snow[i] - 3 : 0;
        if (fire[i]) { fireCell(i, x, y, wx, wy, raining); busy = true; warm = true; }
        else if (T > 1.05 && veg[i] > 60 && rnd() < 0.01) fire[i] = 200; // spontaneous combustion in extreme heat
        if (heat[i] !== 0) warm = true;
      }
    }
    hot[c] = warm ? 1 : 0;
    return busy;
  }

  // ------------------------------------------------------------ gas
  function gasSpread(c, wx, wy) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    const L = cx > 0 && act[c - 1], R = cx < CW - 1 && act[c + 1], U = cy > 0 && act[c - CW], D = cy < CH - 1 && act[c + CW];
    const wR = 0.25 + wx * 0.18, wL = 0.25 - wx * 0.18, wD = 0.25 + wy * 0.18, wU = 0.25 - wy * 0.18;
    let busy = false;
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x0 + 16; x++, i++) {
        let g = gas[i];
        if (g < 0.004) { if (g > 0) { gas[i] = 0; gt[i] = GT.NONE; } continue; }
        busy = true;
        g *= GAS_DECAY[gt[i]]; gas[i] = g;
        const share = g * 0.5, t = gt[i];
        let out = 0;
        if (x > x0 || L) { const j = i - 1; dgas[j] += share * wL; out += share * wL; if (gas[j] < 0.02) gt[j] = t; }
        if (x < x0 + 15 || R) { const j = i + 1; dgas[j] += share * wR; out += share * wR; if (gas[j] < 0.02) gt[j] = t; }
        if (y > y0 || U) { const j = i - W; dgas[j] += share * wU; out += share * wU; if (gas[j] < 0.02) gt[j] = t; }
        if (y < y0 + 15 || D) { const j = i + W; dgas[j] += share * wD; out += share * wD; if (gas[j] < 0.02) gt[j] = t; }
        dgas[i] -= out;
      }
    }
    return busy;
  }
  function gasApply(c) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = 0; x < 16; x++, i++) {
        const d = dgas[i];
        if (d !== 0) { const v = gas[i] + d; gas[i] = v > 1 ? 1 : v < 0 ? 0 : v; dgas[i] = 0; }
      }
    }
  }

  // ------------------------------------------------------------ slow pass
  function slowChunk(c) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    const sT = AG.Sky.seasonT + AG.Sky.chunkT[c], rain = AG.Sky.chunkRain[c];
    let wet = false;
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x0 + 16; x++, i++) {
        const T = tbase[i] + sT + heat[i];
        const f = fl[i];
        if (f > 0.002 && ft[i] === FT.WATER) {
          if (!frozen[i]) {
            if (T < 0.09 && (f < 0.3 || T < -0.05) && rnd() < 0.2) { frozen[i] = 1; wet = true; }
            else if (!rain && T > 0.15 && elev[i] >= DEEP) {
              // inland water evaporates (faster when shallow and warm) so closed basins settle into lakes
              fl[i] = Math.max(0, f - (f < 0.01 ? 0.0006 : 0.00025) * T);
              if (fl[i] < 1e-4) { fl[i] = 0; ft[i] = FT.NONE; }
              wet = true;
            }
          } else if (T > 0.2 && rnd() < 0.35) { frozen[i] = 0; wet = true; }
          continue;
        }
        if (f > 0.004) continue;
        if (snow[i]) {
          if (T > 0.3) { const m = Math.min(snow[i], ((T - 0.3) * 70 + 2) | 0); snow[i] -= m; if (m > 3 && T < 0.6) { fl[i] += m * 0.00003; ft[i] = FT.WATER; wet = true; } }
        } else if (T < 0.05 && rnd() < 0.08) snow[i] = 40;
        const s = soil[i];
        if (traffic[i]) {
          if (traffic[i] > 70 && (s === SO.DIRT || s === SO.ASH || s === SO.SAND)) { soil[i] = SO.ROAD; veg[i] = 0; }
          traffic[i] = traffic[i] > 4 ? traffic[i] - 4 : 0;
        } else if (s === SO.ROAD && rnd() < 0.01) soil[i] = SO.DIRT;
        if (fire[i] || bgrid[i]) continue;
        let cap = snow[i] > 140 ? 0 : Wd.vegCap(moist[i], T, s);
        const v = veg[i];
        if (v < cap) {
          if (rnd() < 0.35) veg[i] = Math.min(255, v + (s === SO.HOLY ? 9 : 4));
          if (s === SO.ASH && v > 30) soil[i] = SO.DIRT;
        } else if (v > cap + 24 && rnd() < 0.3) veg[i] = v - 3;
        if (s === SO.BASALT && rnd() < 0.002) soil[i] = SO.DIRT;
        else if (s === SO.BLIGHT) {
          if (rnd() < 0.05) {
            const j = nb4(i, x, y);
            if (j >= 0 && fl[j] < 0.01) {
              if (soil[j] === SO.HOLY) { soil[j] = SO.DIRT; soil[i] = SO.DIRT; }
              else if (soil[j] === SO.DIRT || soil[j] === SO.SAND) soil[j] = SO.BLIGHT;
            }
          }
        } else if (s === SO.HOLY && rnd() < 0.0015) soil[i] = SO.DIRT;
      }
    }
    if (wet) { Wd.dirty[c] = 1; if (Wd.awake[c] < 12) Wd.awake[c] = 12; }
  }

  // ------------------------------------------------------------ underground automaton
  let uFlip = 0;
  function underChunk(c) {
    const cx = c % CW, cy = (c / CW) | 0, x0 = cx << 4, y0 = cy << 4;
    let busy = false;
    uFlip ^= 1;
    for (let yy = 0; yy < 16; yy++) {
      const y = uFlip ? y0 + yy : y0 + 15 - yy;
      for (let xx = 0; xx < 16; xx++) {
        const x = uFlip ? x0 + xx : x0 + 15 - xx, i = y * W + x;
        const a = ugF[i]; if (!a) continue;
        const typ = ugT[i];
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        let j;
        switch ((rnd() * 4) | 0) { case 0: j = i - 1; break; case 1: j = i + 1; break; case 2: j = i - W; break; default: j = i + W; }
        const u = ug[j];
        if (!(u === UG.CAVE || u === UG.TUNNEL || u === UG.FUNGUS)) continue;
        const b = ugF[j];
        if (b && ugT[j] !== typ) {
          if (typ === UF.MAGMA) { ug[i] = UG.ROCK; ugF[i] = 0; ugT[i] = 0; ugF[j] = b > 40 ? b - 40 : 0; if (!ugF[j]) ugT[j] = 0; }
          else { ug[j] = UG.ROCK; ugF[j] = 0; ugT[j] = 0; ugF[i] = a > 40 ? a - 40 : 0; if (!ugF[i]) ugT[i] = 0; }
          busy = true; continue;
        }
        if (a > b + 1) {
          const m = (a - b) >> 1; ugF[i] = a - m; ugF[j] = b + m; ugT[j] = typ; busy = true;
          if (typ === UF.MAGMA && u === UG.FUNGUS) ug[j] = UG.CAVE;
          const cj = (((j / W) | 0) >> 4) * CW + ((j % W) >> 4);
          if (cj !== c) { Wd.uawake[cj] = 40; Wd.udirty[cj] = 1; }
        }
        if (typ === UF.MAGMA) { if (ugF[i] < 24 && rnd() < 0.002) { ug[i] = UG.ROCK; ugF[i] = 0; ugT[i] = 0; busy = true; } }
        else if (ugF[i] < 6 && rnd() < 0.002) { ugF[i] = 0; ugT[i] = 0; }
      }
    }
    return busy;
  }

  // ------------------------------------------------------------ main tick
  P.tick = function () {
    const t = AG.tick, Sky = AG.Sky;
    const wx = Sky.wind.x, wy = Sky.wind.y;
    // active set = awake chunks dilated by their 4-neighbours
    act.fill(0);
    for (let c = 0; c < NC; c++) {
      if (!Wd.awake[c]) continue;
      act[c] = 1;
      const cx = c % CW, cy = (c / CW) | 0;
      if (cx > 0) act[c - 1] = 1; if (cx < CW - 1) act[c + 1] = 1;
      if (cy > 0) act[c - CW] = 1; if (cy < CH - 1) act[c + CW] = 1;
    }
    let na = 0;
    for (let c = 0; c < NC; c++) if (act[c]) list[na++] = c;
    P.stats.active = na;

    let t0 = now();
    for (let k = 0; k < na; k++) flux(list[k]);
    for (let k = 0; k < na; k++) {
      const c = list[k];
      if (applyChunk(c, wx, wy)) { Wd.awake[c] = 30; Wd.dirty[c] = 1; }
      else if (Wd.awake[c]) Wd.awake[c]--;
    }
    let t1 = now(); ema('fluid', t1 - t0);
    for (let k = 0; k < na; k++) { const c = list[k]; if (gasSpread(list[k], wx, wy)) { Wd.awake[c] = 30; Wd.dirty[c] = 1; } }
    for (let k = 0; k < na; k++) gasApply(list[k]);
    t0 = now(); ema('gas', t0 - t1);

    // springs keep rivers alive; vents pour lava
    for (const s of Wd.springs) {
      const i = s.i;
      if (ft[i] === FT.LAVA || ft[i] === FT.ACID || frozen[i]) continue;
      fl[i] += s.rate; ft[i] = FT.WATER;
      const c = Wd.chunkOfIdx(i); if (!Wd.awake[c]) Wd.wake(s.x, s.y);
    }
    for (let k = Wd.vents.length - 1; k >= 0; k--) {
      const v = Wd.vents[k];
      if (--v.life <= 0) { Wd.vents.splice(k, 1); continue; }
      const i = v.y * W + v.x;
      P.addFluid(i, FT.LAVA, v.rate * Math.min(1, v.life / 200));
      heat[i] = 1;
      if (rnd() < 0.35) AG.FX.burst(v.x + 0.5, v.y + 0.5, 'ember', 2);
      if (rnd() < 0.25) { gas[i] = Math.min(1, gas[i] + 0.35); gt[i] = GT.SMOKE; }
    }

    // map edge is open ocean: pin it to sea level so floods can drain
    if ((t & 3) === 0) {
      for (let x = 0; x < W; x++) { pin(x); pin((H - 1) * W + x); }
      for (let y = 1; y < H - 1; y++) { pin(y * W); pin(y * W + W - 1); }
    }

    // slow round-robin pass (each chunk every 16 ticks)
    t1 = now();
    for (let k = 0; k < NC / 16; k++) { slowChunk(slowCursor); slowCursor = (slowCursor + 1) % NC; }
    t0 = now(); ema('slow', t0 - t1);

    // underground every other tick
    if (t & 1) {
      let nu = 0;
      for (let c = 0; c < NC; c++) {
        if (!Wd.uawake[c]) continue;
        nu++;
        if (underChunk(c)) { Wd.uawake[c] = 40; Wd.udirty[c] = 1; } else Wd.uawake[c]--;
      }
      P.stats.uactive = nu;
      ema('deep', now() - t0);
    }
  };
  function pin(i) {
    const target = SEA - elev[i];
    if (target > 0) { fl[i] = target; ft[i] = FT.WATER; frozen[i] = 0; } else if (ft[i] === FT.WATER) { fl[i] = 0; ft[i] = FT.NONE; }
  }
})();
