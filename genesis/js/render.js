/* AURA: Genesis — render.js
 * Canvas2D renderer. The world is painted 1 cell = 1 pixel into an offscreen
 * buffer (only dirty / animated / rolling chunks are repainted each frame) and
 * scaled up with nearest-neighbour sampling. On top: realm borders, procedural
 * pixel-art sprites (4 sprite px per cell), particles, gas, a soft light map
 * for night / lava / fire / windows, cloud shadows, clouds, rain and snow,
 * lightning, god rays and selection overlays. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Civ = AG.Civ, Sky = AG.Sky, FX = AG.FX, Proj = AG.Proj, God = AG.God;
  const { W, H, CW, NC, SEA, FT, GT, SO, UG, UF, SP, SPECIES, BT, BUILD, FL, J, NG, G } = AG;
  const pack = AG.pack;
  const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
  const SPRITE_LIMIT = 2500; // above this many visible creatures, draw them as pixels
  const R = (AG.Render = {
    view: 1, overlay: 'realms', showTrade: true, cam: { x: W / 2, y: H / 2, z: 3 }, follow: -1, bordersDirty: true,
    hover: { x: -1, y: -1, on: false }, stats: { ms: 0 }, ZOOMS,
  });
  let cv, ctx, cw = 0, ch = 0, mini, mctx;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // world-resolution buffers
  const worldC = mk(W, H), wctx = worldC.getContext('2d'), wimg = wctx.createImageData(W, H), wpix = new Uint32Array(wimg.data.buffer);
  const underC = mk(W, H), uctx = underC.getContext('2d'), uimg = uctx.createImageData(W, H), upix = new Uint32Array(uimg.data.buffer);
  const borderC = mk(W, H), bctx = borderC.getContext('2d'), bimg = bctx.createImageData(W, H), bpix = new Uint32Array(bimg.data.buffer);
  const dotsC = mk(W, H), dctx = dotsC.getContext('2d'), dimg = dctx.createImageData(W, H), dpix = new Uint32Array(dimg.data.buffer);
  const LW = W / 2, LH = H / 2;
  const lightC = mk(LW, LH), lctx = lightC.getContext('2d'), limg = lctx.createImageData(LW, LH), lpix = new Uint32Array(limg.data.buffer);
  const glowC = mk(LW, LH), gctx = glowC.getContext('2d'), gimg = gctx.createImageData(LW, LH), gpix = new Uint32Array(gimg.data.buffer);
  const gasC = mk(LW, LH), gsctx = gasC.getContext('2d'), gsimg = gsctx.createImageData(LW, LH), gspix = new Uint32Array(gsimg.data.buffer);
  const cloudC = mk(Sky.CLW, Sky.CLH), cctx = cloudC.getContext('2d'), cimg = cctx.createImageData(Sky.CLW, Sky.CLH), cpix = new Uint32Array(cimg.data.buffer);
  const shadC = mk(Sky.CLW, Sky.CLH), shctx = shadC.getContext('2d'), shimg = shctx.createImageData(Sky.CLW, Sky.CLH), shpix = new Uint32Array(shimg.data.buffer);
  const lum = new Float32Array(LW * LH), tmp = new Float32Array(LW * LH);
  let frameN = 0, roll = 0, lastView = -1, tm = 0;

  R.init = function (canvas, minimap) {
    cv = canvas; ctx = cv.getContext('2d');
    mini = minimap; mctx = mini.getContext('2d');
    R.resize();
  };
  R.resize = function () {
    const r = cv.getBoundingClientRect();
    cw = Math.max(1, Math.round(r.width)); ch = Math.max(1, Math.round(r.height));
    cv.width = cw; cv.height = ch;
  };
  R.size = () => ({ w: cw, h: ch });
  R.reset = function () { R.follow = -1; R.bordersDirty = true; lastView = -1; Wd.dirty.fill(1); Wd.udirty.fill(1); R.fit(); };

  // ------------------------------------------------------------ camera
  R.fit = function () {
    const fz = Math.min(cw / W, ch / H);
    let z = ZOOMS[0];
    for (const v of ZOOMS) if (v <= fz * 1.35) z = v;
    R.cam.z = z; R.cam.x = W / 2; R.cam.y = H / 2;
  };
  R.screenToWorld = (sx, sy) => ({ x: (sx - cw / 2) / R.cam.z + R.cam.x, y: (sy - ch / 2) / R.cam.z + R.cam.y });
  R.zoomAt = function (sx, sy, dir) {
    const c = R.cam, idx = ZOOMS.indexOf(c.z), ni = AG.clamp((idx < 0 ? 3 : idx) + dir, 0, ZOOMS.length - 1);
    if (ZOOMS[ni] === c.z) return;
    const before = R.screenToWorld(sx, sy);
    c.z = ZOOMS[ni];
    const after = R.screenToWorld(sx, sy);
    c.x += before.x - after.x; c.y += before.y - after.y;
    clampCam();
  };
  R.setZoom = function (z) { R.cam.z = z; clampCam(); };
  R.pan = function (dx, dy) { R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z; R.follow = God.possessed >= 0 ? R.follow : -1; clampCam(); };
  R.centerOn = function (x, y, z) { R.cam.x = x; R.cam.y = y; if (z) R.cam.z = z; clampCam(); };
  function clampCam() {
    const c = R.cam, hw = cw / 2 / c.z, hh = ch / 2 / c.z;
    c.x = hw * 2 >= W ? W / 2 : AG.clamp(c.x, hw - 8, W - hw + 8);
    c.y = hh * 2 >= H ? H / 2 : AG.clamp(c.y, hh - 8, H - hh + 8);
  }

  // ------------------------------------------------------------ terrain colours
  const DIRT = [142, 112, 74], FOREST = [34, 90, 44], FOREST_COLD = [36, 74, 64], JUNGLE = [26, 104, 50];
  function grassColour(T, out) {
    // cold teal -> temperate green -> hot olive
    if (T < 0.45) { const t = AG.clamp((T - 0.05) / 0.4, 0, 1); out[0] = 86 + 8 * t; out[1] = 132 + 28 * t; out[2] = 108 - 46 * t; }
    else { const t = AG.clamp((T - 0.45) / 0.35, 0, 1); out[0] = 94 + 66 * t; out[1] = 160 - 4 * t; out[2] = 62 + 6 * t; }
  }
  const gc = [0, 0, 0];
  function buildingColour(B, x, y) {
    const k = Civ.kingdoms[B.kd], kc = k ? k.color : [150, 150, 150];
    switch (B.type) {
      case BT.KEEP: return (x - B.x === 1 || x - B.x === 2) && (y - B.y === 1 || y - B.y === 2) ? kc : [150, 146, 140];
      case BT.HOUSE: return [kc[0] * 0.5 + 60, kc[1] * 0.5 + 34, kc[2] * 0.5 + 24];
      case BT.FARM: {
        if ((y - B.y) & 1) return [104, 78, 48];
        const t = B.growth;
        return [120 + 100 * t, 150 + 40 * t, 60 + 20 * t];
      }
      case BT.WINDMILL: return [226, 220, 206];
      case BT.TEMPLE: return [238, 232, 216];
      case BT.MARKET: return (x + y) & 1 ? kc : [236, 230, 214];
      case BT.MINE: return [72, 58, 50];
      case BT.TOWER: return [150, 150, 160];
      case BT.WALL: return [126, 126, 134];
      case BT.DOCK: return [138, 100, 64];
      case BT.WORKSHOP: return [140, 104, 66];
    }
    return kc;
  }
  let LX = 0.6, LY = -0.55;
  function surfPix(i, x, y) {
    const e = Wd.elev[i], f = Wd.fl[i], d = Wd.dither[i], s = Wd.soil[i], v = Wd.veg[i];
    let r, g, b;
    switch (s) {
      case SO.SAND: r = 220; g = 200; b = 144; if (v > 20) { r -= 30; g -= 10; b -= 30; } break;
      case SO.ROCK: { const t = AG.clamp((e - AG.MOUNTAIN) * 3.5, 0, 1); r = 136 - t * 26; g = 128 - t * 24; b = 120 - t * 14; break; }
      case SO.BASALT: r = 56; g = 50; b = 56; break;
      case SO.ASH: r = 100; g = 96; b = 92; if (v > 20) { r -= 10; g += 20; b -= 10; } break;
      case SO.BLIGHT: r = 98; g = 60 + (v >> 3); b = 110; break;
      case SO.ROAD: r = 168; g = 138; b = 100; break;
      case SO.FARM: r = 118; g = 88; b = 56; break;
      default: {
        const T = Wd.tbase[i] + Sky.seasonT;
        grassColour(T, gc);
        if (Sky.season() === 2 && T > 0.25 && T < 0.6) { gc[0] += 50; gc[1] -= 14; gc[2] -= 20; } // autumn
        if (v < 60) { const t = v / 60; r = DIRT[0] + (gc[0] - DIRT[0]) * t; g = DIRT[1] + (gc[1] - DIRT[1]) * t; b = DIRT[2] + (gc[2] - DIRT[2]) * t; }
        else if (v < 165) { const t = (v - 60) / 105; r = gc[0] - 14 * t; g = gc[1] - 18 * t; b = gc[2] - 8 * t; }
        else {
          const F = T < 0.3 ? FOREST_COLD : T > 0.68 ? JUNGLE : FOREST;
          r = F[0]; g = F[1]; b = F[2];
          if (d > 2) { r += 14; g += 22; b += 10; } else if (d < -4) { r -= 10; g -= 14; b -= 8; } // canopy texture
        }
        if (s === SO.HOLY) { r = r * 0.45 + 130; g = g * 0.45 + 118; b = b * 0.45 + 50; }
      }
    }
    if (Wd.snow[i] > 20) { const t = Math.min(1, Wd.snow[i] / 190); r += (240 - r) * t; g += (244 - g) * t; b += (252 - b) * t; }
    const bg = Wd.bgrid[i];
    if (bg) {
      const B = Civ.buildings[bg - 1], c = buildingColour(B, x, y), t = B.prog >= 1 ? 1 : 0.35 + B.prog * 0.5;
      r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
    }
    // hillshade with the moving sun
    let sh = 1;
    if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
      const ex = Wd.elev[i + 1] - Wd.elev[i - 1], ey = Wd.elev[i + W] - Wd.elev[i - W];
      sh = 1 - (ex * LX + ey * LY) * 16 + (e - SEA) * 0.22;
      sh = sh < 0.55 ? 0.55 : sh > 1.4 ? 1.4 : sh;
    }
    r = r * sh + d; g = g * sh + d; b = b * sh + d;
    if (f > 0.0015) {
      const ty = Wd.ft[i];
      if (Wd.frozen[i]) { r = r * 0.15 + 196 + d; g = g * 0.15 + 214 + d; b = b * 0.15 + 220; }
      else if (ty === FT.WATER) {
        const depth = AG.smooth(0, 0.26, f);
        let wr = 60 - 46 * depth, wg = 146 - 104 * depth, wb = 190 - 92 * depth;
        const shim = Math.sin(x * 0.9 + tm * 2.1 + d) * Math.sin(y * 0.7 - tm * 1.6);
        if (shim > 0.55) { wr += 26; wg += 30; wb += 26; }
        if (f < 0.02) { const a = 0.35 + (f / 0.02) * 0.65; r += (wr - r) * a; g += (wg - g) * a; b += (wb - b) * a; }
        else { r = wr + d * 0.5; g = wg + d * 0.5; b = wb + d * 0.5; }
      } else if (ty === FT.LAVA) {
        const fl = 0.5 + 0.5 * Math.sin(tm * 3 + d * 0.9 + x * 0.35 + y * 0.2);
        if (f < 0.005) { r = 140; g = 40 + fl * 30; b = 24; }
        else { r = 255; g = 70 + fl * 120; b = 20 + fl * 30; }
      } else {
        const bub = (d + ((tm * 6) | 0)) % 7 === 0;
        r = bub ? 210 : 112; g = bub ? 255 : 226; b = bub ? 140 : 62;
      }
    }
    if (Wd.fire[i]) { const fl = 0.5 + 0.5 * Math.sin(tm * 11 + d * 2 + x); r = 255; g = 100 + fl * 130; b = 24 + fl * 20; }
    return pack(r < 0 ? 0 : r > 255 ? 255 : r | 0, g < 0 ? 0 : g > 255 ? 255 : g | 0, b < 0 ? 0 : b > 255 ? 255 : b | 0);
  }
  function underPix(i, x, y) {
    const u = Wd.ug[i], d = Wd.dither[i];
    let r, g, b;
    switch (u) {
      case UG.ROCK: r = 64 + d; g = 60 + d; b = 70 + d; break;
      case UG.DIRT: r = 94 + d; g = 74 + d; b = 56 + d; break;
      case UG.CAVE: r = 30; g = 26; b = 34; break;
      case UG.TUNNEL: r = 116 + d; g = 92 + d; b = 66 + d; break;
      case UG.IRON: if (d > 1) { r = 178; g = 108; b = 78; } else { r = 70 + d; g = 60; b = 64; } break;
      case UG.GOLD: if (d > 0) { r = 250; g = 206; b = 70; } else { r = 96; g = 82; b = 60; } break;
      case UG.CRYSTAL: { const p = 0.5 + 0.5 * Math.sin(tm * 2 + d); r = 90 + p * 60; g = 210 + p * 40; b = 255; break; }
      case UG.FUNGUS: if (d > 3) { r = 90; g = 230; b = 196; } else { r = 32; g = 54; b = 50; } break;
      default: r = 16; g = 14; b = 18;
    }
    if (Wd.ugF[i]) {
      const a = Math.min(1, Wd.ugF[i] / 110);
      if (Wd.ugT[i] === UF.MAGMA) { const fl = 0.5 + 0.5 * Math.sin(tm * 3 + d + x * 0.3); r += (255 - r) * a; g += (80 + fl * 100 - g) * a; b += (20 - b) * a; }
      else { r += (40 - r) * a; g += (100 - g) * a; b += (196 - b) * a; }
    }
    const bg = Wd.bgrid[i];
    if (bg && Civ.buildings[bg - 1].type === BT.MINE) { r = 230; g = 186; b = 96; }
    return pack(r < 0 ? 0 : r > 255 ? 255 : r | 0, g < 0 ? 0 : g > 255 ? 255 : g | 0, b < 0 ? 0 : b > 255 ? 255 : b | 0);
  }
  function paintChunk(c, under) {
    const x0 = (c % CW) << 4, y0 = ((c / CW) | 0) << 4, pix = under ? upix : wpix, fn = under ? underPix : surfPix;
    for (let y = y0; y < y0 + 16; y++) { let i = y * W + x0; for (let x = x0; x < x0 + 16; x++, i++) pix[i] = fn(i, x, y); }
  }
  function updateTerrain() {
    const under = R.view === 0;
    const sun = Sky.sunDir(), day = Sky.daylight();
    LX = day > 0.05 ? sun.x : -0.5; LY = sun.y;
    const dirty = under ? Wd.udirty : Wd.dirty, awake = under ? Wd.uawake : Wd.awake;
    const full = lastView !== (under ? 0 : 1);
    lastView = under ? 0 : 1;
    // visible chunk window
    const c = R.cam, hw = cw / 2 / c.z, hh = ch / 2 / c.z;
    const vx0 = Math.max(0, ((c.x - hw) >> 4) - 0), vx1 = Math.min(CW - 1, (c.x + hw) >> 4);
    const vy0 = Math.max(0, (c.y - hh) >> 4), vy1 = Math.min(AG.CH - 1, (c.y + hh) >> 4);
    let painted = 0;
    for (let k = 0; k < NC; k++) {
      const cx = k % CW, cy = (k / CW) | 0;
      const vis = cx >= vx0 && cx <= vx1 && cy >= vy0 && cy <= vy1;
      if (full || dirty[k] || (awake[k] && ((frameN + k) & 1) === 0) || (vis && ((frameN + k) & 3) === 0)) { paintChunk(k, under); dirty[k] = 0; painted++; }
    }
    for (let k = 0; k < 12; k++) { paintChunk(roll, under); roll = (roll + 1) % NC; }
    (under ? uctx : wctx).putImageData(under ? uimg : wimg, 0, 0);
    R.stats.painted = painted;
  }

  // ------------------------------------------------------------ overlays
  function updateBorders() {
    bpix.fill(0);
    const mode = R.overlay;
    if (mode === 'none') { bctx.putImageData(bimg, 0, 0); return; }
    const owner = Wd.owner;
    if (mode === 'heat') {
      for (let i = 0; i < W * H; i += 1) {
        const T = Wd.T(i), t = AG.clamp((T + 0.1) / 1.1, 0, 1);
        bpix[i] = pack((t * 255) | 0, (80 + Math.sin(t * Math.PI) * 120) | 0, ((1 - t) * 255) | 0, 110);
      }
      bctx.putImageData(bimg, 0, 0); return;
    }
    const nc = Civ.cities.length, key = new Int32Array(nc), col = new Uint32Array(nc), fill = new Uint32Array(nc);
    for (let k = 0; k < nc; k++) {
      const c = Civ.cities[k];
      if (mode === 'faith') {
        key[k] = c.religion;
        const rc = c.religion >= 0 ? Civ.religions[c.religion].color : null;
        col[k] = rc ? pack(rc[0], rc[1], rc[2], 230) : 0; fill[k] = rc ? pack(rc[0], rc[1], rc[2], 80) : 0;
      } else {
        key[k] = c.kd;
        const kc = Civ.kingdoms[c.kd].color;
        col[k] = pack(kc[0], kc[1], kc[2], 235); fill[k] = pack(kc[0], kc[1], kc[2], 40);
      }
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, o = owner[i];
      if (o < 0) continue;
      const kk = key[o];
      const l = owner[i - 1], r = owner[i + 1], u = owner[i - W], d = owner[i + W];
      const edge = (l < 0 || key[l] !== kk) || (r < 0 || key[r] !== kk) || (u < 0 || key[u] !== kk) || (d < 0 || key[d] !== kk);
      bpix[i] = edge ? col[o] : fill[o];
    }
    bctx.putImageData(bimg, 0, 0);
  }
  function blur(a, w, h, r) {
    for (let y = 0; y < h; y++) {
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + AG.clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[AG.clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  function updateLight() {
    const under = R.view === 0, day = Sky.daylight();
    lum.fill(0);
    for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
      const i = (ly * 2) * W + lx * 2, j = ly * LW + lx;
      if (under) {
        if (Wd.ugF[i] && Wd.ugT[i] === UF.MAGMA) lum[j] += 1.3;
        else { const u = Wd.ug[i]; if (u === UG.CRYSTAL) lum[j] += 0.8; else if (u === UG.FUNGUS) lum[j] += 0.45; else if (u === UG.TUNNEL) lum[j] += 0.14; }
      } else {
        if (Wd.fire[i]) lum[j] += 1.5;
        else if (Wd.fl[i] > 0.003 && Wd.ft[i] === FT.LAVA) lum[j] += 1.1;
      }
    }
    if (under) {
      for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.layer[i] === 0) { const j = ((U.y[i] / 2) | 0) * LW + ((U.x[i] / 2) | 0); if (j >= 0 && j < lum.length) lum[j] += 1.6; }
    } else {
      for (const c of Civ.cities) {
        if (!c.alive) continue;
        for (const bid of c.buildings) {
          const b = Civ.buildings[bid];
          if (b.prog < 1 || b.type === BT.WALL || b.type === BT.FARM) continue;
          const j = ((b.cy / 2) | 0) * LW + ((b.cx / 2) | 0);
          lum[j] += b.type === BT.KEEP || b.type === BT.TEMPLE ? 2.2 : 1.1;
        }
      }
      for (let p = 0; p < Proj.n; p++) if (Proj.kind[p] === 2) { const j = ((Proj.y[p] / 2) | 0) * LW + ((Proj.x[p] / 2) | 0); if (j >= 0 && j < lum.length) lum[j] += 2; }
      for (const s of Sky.strikes) { const j = ((s.y / 2) | 0) * LW + ((s.x / 2) | 0); if (j >= 0 && j < lum.length) lum[j] += 8; }
      for (let k = 0; k < Wd.vents.length; k++) { const v = Wd.vents[k]; lum[((v.y / 2) | 0) * LW + ((v.x / 2) | 0)] += 4; }
    }
    blur(lum, LW, LH, 2); blur(lum, LW, LH, 2);
    const dark = under ? 0.86 : (1 - day) * (AG.speed >= 4 && !AG.paused ? 0.45 : 0.8); // gentler nights when time races
    const tr = under ? 4 : 8, tg = under ? 3 : 12, tb = under ? 10 : 38;
    const glowK = under ? 0.6 : 0.15 + (1 - day) * 0.5;
    for (let j = 0; j < lum.length; j++) {
      const L = lum[j] * 1.6;
      const a = dark * (1 - (L > 1 ? 1 : L));
      lpix[j] = pack(tr, tg, tb, (a * 255) | 0);
      const ga = Math.min(1, lum[j]) * glowK;
      gpix[j] = pack(255, 150, 70, (ga * 200) | 0);
    }
    lctx.putImageData(limg, 0, 0); gctx.putImageData(gimg, 0, 0);
  }
  const GASCOL = [[0, 0, 0], [236, 240, 244], [74, 70, 68], [140, 205, 70]];
  function updateGas() {
    for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
      const i = ly * 2 * W + lx * 2, g = Math.max(Wd.gas[i], Wd.gas[i + 1], Wd.gas[i + W], Wd.gas[i + W + 1]);
      if (g < 0.01) { gspix[ly * LW + lx] = 0; continue; }
      const c = GASCOL[Wd.gt[i] || Wd.gt[i + 1] || Wd.gt[i + W] || 2];
      gspix[ly * LW + lx] = pack(c[0], c[1], c[2], Math.min(210, (g * 420) | 0));
    }
    gsctx.putImageData(gsimg, 0, 0);
  }
  function updateClouds() {
    const night = 1 - Sky.daylight();
    for (let j = 0; j < cpix.length; j++) {
      const c = Sky.cloud[j], dk = Sky.dark[j];
      if (c < 0.02) { cpix[j] = 0; shpix[j] = 0; continue; }
      const v = 250 - dk * 160 - night * 150;
      cpix[j] = pack(Math.max(20, v) | 0, Math.max(22, v + 2) | 0, Math.max(30, v + 8) | 0, (c * 225) | 0);
      shpix[j] = pack(0, 0, 10, (c * 110) | 0);
    }
    cctx.putImageData(cimg, 0, 0); shctx.putImageData(shimg, 0, 0);
  }
  function updateDots(alpha) {
    dpix.fill(0);
    const under = R.view === 0;
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i]) continue;
      const L = U.layer[i];
      if (under ? L !== 0 : L === 0) continue;
      const x = (U.px[i] + (U.x[i] - U.px[i]) * alpha) | 0, y = (U.py[i] + (U.y[i] - U.py[i]) * alpha) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = SPECIES[U.sp[i]];
      let c;
      if (d.kind === 'civ' || d.kind === 'vehicle') { const k = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]].color : [200, 200, 200]; c = pack(Math.min(255, k[0] + 40), Math.min(255, k[1] + 40), Math.min(255, k[2] + 40)); }
      else if (d.kind === 'ambient') c = pack(30, 30, 36);
      else if (d.kind === 'monster') c = U.sp[i] === SP.HOLLOW ? pack(170, 255, 120) : pack(255, 40, 40);
      else if (d.kind === 'avatar') c = pack(255, 240, 150);
      else c = pack(d.fur[0], d.fur[1], d.fur[2]);
      dpix[y * W + x] = c;
    }
    dctx.putImageData(dimg, 0, 0);
  }

  // ------------------------------------------------------------ sprites
  const BASEPAL = { b: [30, 24, 28], m: [200, 204, 214], y: [255, 214, 90], e: [238, 234, 222], o: [255, 150, 40], w: [152, 110, 66], W: [96, 64, 40], r: [156, 152, 146], R: [102, 98, 98], g: [120, 186, 72], G: [72, 128, 50], c: [210, 170, 96], p: [240, 120, 160], v: [120, 170, 240] };
  const S = {
    person: [['.hhh.', '.sss.', 'skkks', '.kkk.', '.KKK.', '.b.b.', '.b.b.'], ['.hhh.', '.sss.', 'skkks', '.kkk.', '.KKK.', 'b...b', 'b...b']],
    sylvan: [['.hhh.', 'hsssh', 'hkkkh', '.kkk.', '.KKK.', '.b.b.', '.b.b.'], ['.hhh.', 'hsssh', 'hkkkh', '.kkk.', '.KKK.', 'b...b', 'b...b']],
    stone: [['.hhh.', '.sss.', 'shhhs', 'kkkkk', '.KKK.', '.b.b.'], ['.hhh.', '.sss.', 'shhhs', 'kkkkk', '.KKK.', 'b...b']],
    ashen: [['o...o', '.hhh.', '.sss.', 'skkks', '.KKK.', '.b.b.', '.b.b.'], ['o...o', '.hhh.', '.sss.', 'skkks', '.KKK.', 'b...b', 'b...b']],
    soldier: [['.mmm.m', '.sss.m', 'skkksm', '.kkk.m', '.KKK..', '.b.b..', '.b.b..'], ['.mmm.m', '.sss.m', 'skkksm', '.kkk.m', '.KKK..', 'b...b.', 'b...b.']],
    king: [['y.y.y', '.yyy.', '.sss.', 'skkks', 'KkykK', 'KKKKK', '.b.b.'], ['y.y.y', '.yyy.', '.sss.', 'skkks', 'KkykK', 'KKKKK', 'b...b']],
    priest: [['.hhh.', '.sss.', 'seees', '.eke.', '.eee.', '.eee.', '.b.b.'], ['.hhh.', '.sss.', 'seees', '.eke.', '.eee.', 'eeeee', 'b...b']],
    child: [['hhh', 'sss', 'kkk', 'kkk', 'b.b'], ['hhh', 'sss', 'kkk', 'kkk', '.b.']],
    hollow: [['.hhh.', '.sos.', 'skkks', '.k.k.', '.kkk.', '.b.b.', 'b...b'], ['.hhh.', '.sos.', 'skkks', '.k.k.', '.kkk.', 'b...b', '.b.b.']],
    herald: [['.y.y.', '..y..', '.sss.', 'eeeee', '.eye.', '.eee.', '.e.e.'], ['.y.y.', '..y..', '.sss.', 'eeeee', '.eye.', 'eeeee', 'e...e']],
    deer: [['.....W', '....fW', 'ffffff', 'fffff.', '.f..f.'], ['.....W', '....fW', 'ffffff', 'fffff.', 'f....f']],
    wolf: [['....f.f', 'f.fffff', '.fffff.', '.f...f.'], ['....f.f', 'f.fffff', '.fffff.', 'f.....f']],
    crawler: [['b.b.b', '.ofo.', 'fffff', 'b.b.b'], ['.b.b.', '.ofo.', 'fffff', '.b.b.']],
    bird: [['f.f', '.f.'], ['.f.', 'f.f']],
    wyrm: [['..f......f..', '.ff......ff.', 'fff.ffff.fff', '.fffFFFFfff.', '....FFFF..oo', '...fFFFFfff.', '..ff....f...', '.f..........'],
      ['............', '............', '....ffff....', '.ffFFFFFfff.', 'fff.FFFF.ffo', 'ff.fFFFFff..', '..ff....f...', '.f..........']],
    cart: [['..ccc..', '.ccccc.', 'wwwwwww', 'w.....w', '.b...b.'], ['..ccc..', '.ccccc.', 'wwwwwww', 'w.....w', '.b...b.']],
    ship: [['....W.....', '...kkk....', '..kkkkk...', '..kkkkk...', '....W.....', 'wwwwwwwwww', '.wWwWwWww.'], ['....W.....', '....kkk...', '...kkkkk..', '...kkkkk..', '....W.....', 'wwwwwwwwww', '.wwWwWwWw.']],
    airship: [['..kkkkkk..', '.kkkkkkkk.', 'kkkKkkKkkk', '.kkkkkkkk.', '..kkkkkk..', '...W..W...', '..wwwwww..', '...wwww...'], ['..kkkkkk..', '.kkkkkkkk.', 'kkKkkKkkkk', '.kkkkkkkk.', '..kkkkkk..', '...W..W...', '..wwwwww..', '...wwww...']],
    catapult: [['......w.', '.....w..', '....w...', '.wwwwww.', 'wWwwwwWw', '.b....b.'], ['.ww.....', '...w....', '....w...', '.wwwwww.', 'wWwwwwWw', '.b....b.']],
  };
  const B_SPR = {
    [BT.HOUSE]: ['...KK...', '..KkkK..', '.KkkkkK.', 'KkkkkkkK', 'KKKKKKKK', '.wwwwww.', '.wywwyw.', '.wwwwww.', '.wwwbww.', '.wwwbww.'],
    [BT.KEEP]: ['.......kkk......', '.......kkK......', '.......W........', 'r.r.r.rrrr.r.r.r', 'rrrrr.rRRr.rrrrr', 'rRRRr.rRRr.rRRRr', 'rRyRrrrrrrrrRyRr', 'rRRRrrRyyRrrRRRr', 'rrrrrrRRRRrrrrrr', 'rRRRRRRRRRRRRRRr', 'rRrRrRrRrRrRrRrr', 'rrrrrrrrrrrrrrrr', 'rRRRRRRbbRRRRRRr', 'rRRRRRbbbbRRRRRr', 'rrrrrrbbbbrrrrrr', 'rRRRRRbbbbRRRRRr', 'rrrrrrbbbbrrrrrr'],
    [BT.WINDMILL]: ['...KK...', '..KKKK..', '.KKKKKK.', '..eeee..', '..eyee..', '..eeee..', '..eeee..', '..eeee..', '.eeeeee.', '.eeyeee.', '.eeeeee.', '.eeeeee.', 'eeebbeee', 'eeebbeee'],
    [BT.TEMPLE]: ['.....yy.....', '....yyyy....', '...yyyyyy...', '..yyyyyyyy..', '.eeeeeeeeee.', 'eeeeeeeeeeee', '.e.eR.Re.e..', '.e.eR.Re.e..', '.e.eR.Re.e..', '.e.eRbRe.e..', '.e.eRbRe.e..', 'eeeeeeeeeeee', 'rrrrrrrrrrrr', 'RRRRRRRRRRRR'],
    [BT.MARKET]: ['kekekekekeke', 'kekekekekeke', '.w..w..w..w.', '.w..w..w..w.', 'kekeke.kekek', 'kekeke.kekek', 'wgow.w.wyvw.', 'wwww.w.wwww.', 'w..w...w..w.', 'w..w...w..w.'],
    [BT.MINE]: ['..rrrr..', '.rrrrrr.', 'rrwwwwrr', 'rwbbbbwr', 'rwbbbbwr', 'rwbbbbwr', '.mmmmmm.', 'm.m..m.m'],
    [BT.TOWER]: ['....k...', '....kk..', '....W...', 'r.r.Wr.r', 'rrrrrrrr', '.rRRRRr.', '.rRrRRr.', '.rRRRRr.', '.rRbRRr.', '.rRRRRr.', '.rRRRRr.', '.rRRbRr.', '.rRRRRr.', '.rRRRRr.', '.rRRRRr.', '.rRbbRr.', 'rrRbbRrr', 'rrrrrrrr'],
    [BT.WALL]: ['r.r.', 'rrrr', 'rRrr', 'rrRr', 'rRrr', 'rrrr'],
    [BT.DOCK]: ['WwwwwwwW', 'wwwwwwww', 'WwwwwwwW', 'wwwwwwww', 'WwwwwwwW', 'wwwwwwww', 'W......W', 'W......W'],
    [BT.WORKSHOP]: ['....KKKK....', '...KKKKKK...', '..KKKKKKKK..', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', '.wwwwwwwwww.', '.w......W.w.', '.w.....W..w.', '.w..wwwwwww.', '.w.wWwwwWww.', '.wwwwwwwwww.'],
  };
  const cache = new Map();
  function makeSprite(rows, pal, flip) {
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0), h = rows.length;
    const c = mk(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), px = new Uint32Array(img.data.buffer);
    for (let y = 0; y < h; y++) for (let k = 0; k < rows[y].length; k++) {
      const col = pal[rows[y][k]];
      if (!col) continue;
      px[y * w + (flip ? w - 1 - k : k)] = pack(AG.clamp(col[0] | 0, 0, 255), AG.clamp(col[1] | 0, 0, 255), AG.clamp(col[2] | 0, 0, 255));
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function getSprite(key, build) {
    let s = cache.get(key);
    if (!s) { if (cache.size > 6000) cache.clear(); s = build(); cache.set(key, s); }
    return s;
  }
  const dark = (c, f) => [c[0] * (f || 0.6), c[1] * (f || 0.6), c[2] * (f || 0.6)];
  const CARGO = [[0, 0, 0], [120, 190, 70], [150, 104, 60], [160, 160, 160], [180, 100, 70], [250, 210, 70], [110, 220, 255]];
  function unitSprite(i, frame) {
    const sp = U.sp[i], d = SPECIES[sp], kd = U.kd[i], flip = U.fx[i] < 0;
    if (d.kind === 'civ') {
      const f = U.flags[i], job = U.job[i];
      let role = 'person';
      if (f & FL.KING) role = 'king';
      else if (job === J.SOLDIER || U.sq[i] >= 0) role = 'soldier';
      else if (job === J.PRIEST) role = 'priest';
      else if (job === J.CHILD) role = 'child';
      else if (sp === SP.SYLVAN) role = 'sylvan'; else if (sp === SP.STONE) role = 'stone'; else if (sp === SP.ASHEN) role = 'ashen';
      const hue = U.genes[i * NG + G.HUE] >> 6, elder = job === J.ELDER ? 1 : 0;
      const key = `c${sp}|${role}|${kd}|${hue}|${elder}|${frame}|${flip ? 1 : 0}`;
      return getSprite(key, () => {
        const kc = kd >= 0 ? Civ.kingdoms[kd].color : [150, 150, 150], m = [0.8, 0.9, 1, 1.1][hue];
        const pal = Object.assign({}, BASEPAL, { s: d.skin.map((v) => v * m), h: elder ? [214, 214, 220] : d.hair, k: kc, K: dark(kc) });
        if (sp === SP.ASHEN) pal.o = [255, 120, 40];
        return makeSprite(S[role][frame], pal, flip);
      });
    }
    let name = d.key;
    const extra = sp === SP.CART ? U.carry[i] : 0;
    const key = `a${sp}|${kd}|${extra}|${frame}|${flip ? 1 : 0}`;
    return getSprite(key, () => {
      const kc = kd >= 0 ? Civ.kingdoms[kd].color : [170, 170, 170];
      const fur = d.fur || [150, 150, 150];
      const pal = Object.assign({}, BASEPAL, { f: fur, F: dark(fur), k: kc, K: dark(kc), c: CARGO[extra] || CARGO[2] });
      if (sp === SP.HOLLOW) Object.assign(pal, { s: [170, 200, 160], h: [60, 80, 60], k: [110, 110, 104], o: [255, 60, 40] });
      if (sp === SP.HERALD) pal.s = [255, 236, 190];
      if (sp === SP.CRAWLER) pal.o = [255, 90, 90];
      if (sp === SP.WYRM) pal.o = [255, 230, 80];
      return makeSprite(S[name][frame], pal, flip);
    });
  }
  function farmSprite(stage) {
    return getSprite('farm' + stage, () => {
      const crop = [[120, 100, 60], [110, 170, 70], [150, 196, 70], [226, 196, 80]][stage];
      const rows = []; for (let y = 0; y < 12; y++) rows.push(y % 3 === 2 ? 'dddddddddddd' : 'cccccccccccc');
      rows[0] = 'WcWcWcWcWcWc';
      return makeSprite(rows, { c: crop, d: [104, 78, 48], W: [96, 64, 40] }, false);
    });
  }
  function buildingSprite(b) {
    if (b.type === BT.FARM) return farmSprite(Math.min(3, (b.growth * 4) | 0));
    const k = Civ.kingdoms[b.kd], kc = k ? k.color : [150, 150, 150];
    return getSprite(`b${b.type}|${b.kd}`, () => makeSprite(B_SPR[b.type], Object.assign({}, BASEPAL, { k: kc, K: dark(kc) }), false));
  }
  R.bannerURL = function (k) {
    if (k._banner) return k._banner;
    const c = mk(10, 14), x = c.getContext('2d'), b = k.banner;
    x.fillStyle = AG.css(k.color); x.fillRect(0, 0, 10, 14);
    x.fillStyle = AG.css(b.accent);
    switch (b.pattern) {
      case 1: x.fillRect(0, 5, 10, 4); break;
      case 2: x.fillRect(3, 0, 4, 14); break;
      case 3: x.fillRect(4, 0, 2, 14); x.fillRect(0, 5, 10, 2); break;
      case 4: for (let i = 0; i < 5; i++) { x.fillRect(i, 3 + i, 1, 3); x.fillRect(9 - i, 3 + i, 1, 3); } break;
      case 5: x.fillRect(0, 0, 10, 1); x.fillRect(0, 13, 10, 1); x.fillRect(0, 0, 1, 14); x.fillRect(9, 0, 1, 14); break;
    }
    if (b.sym === 1) x.fillRect(4, 6, 2, 2); else if (b.sym === 2) { x.fillRect(4, 5, 2, 4); x.fillRect(3, 6, 4, 2); }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 13, 10, 1);
    k._banner = c.toDataURL();
    return k._banner;
  };

  // ------------------------------------------------------------ rain & snow
  const DROPS = 700, dx = new Float32Array(DROPS), dy = new Float32Array(DROPS), dh = new Float32Array(DROPS), dk = new Uint8Array(DROPS);
  let dropN = 0;
  function weather(dt, ox, oy, z) {
    const vis = [];
    const hw = cw / 2 / z + 10, hh = ch / 2 / z + 10;
    for (const s of Sky.storms) {
      if (s.type === 'heat' || s.k < 0.1) continue;
      if (Math.abs(s.x - R.cam.x) > hw + s.r || Math.abs(s.y - R.cam.y) > hh + s.r) continue;
      vis.push(s);
    }
    const want = Math.min(DROPS, vis.length ? 260 + vis.length * 160 : 0);
    while (dropN < want) {
      const s = vis[(Math.random() * vis.length) | 0];
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.r;
      dx[dropN] = s.x + Math.cos(a) * r; dy[dropN] = s.y + Math.sin(a) * r; dh[dropN] = 2 + Math.random() * 10;
      const T = Wd.tbase[AG.clamp(dy[dropN] | 0, 0, H - 1) * W + AG.clamp(dx[dropN] | 0, 0, W - 1)] + Sky.seasonT + (s.type === 'blizzard' ? -0.4 : 0);
      dk[dropN] = s.type === 'acid' ? 2 : T < 0.22 ? 1 : 0;
      dropN++;
    }
    if (dropN > want) dropN = want;
    if (!dropN) return;
    const wx = Sky.wind.x, wy = Sky.wind.y;
    ctx.lineWidth = Math.max(1, z / 6);
    ctx.strokeStyle = 'rgba(190,215,255,0.55)';
    ctx.beginPath();
    for (let k = 0; k < dropN; k++) {
      const snow = dk[k] === 1;
      dh[k] -= dt * (snow ? 3 : 22);
      if (snow) { dx[k] += wx * dt * 2 + Math.sin(tm * 2 + k) * dt * 0.6; dy[k] += wy * dt * 2; }
      if (dh[k] <= 0) { if (!snow && z >= 4 && Math.random() < 0.3) FX.spawn(dx[k], dy[k], 0, 0, 0.25, [200, 225, 255], 0.35, 0, 1, 0.02, 0.01); dh[k] = 0; dropN--; dx[k] = dx[dropN]; dy[k] = dy[dropN]; dh[k] = dh[dropN]; dk[k] = dk[dropN]; k--; continue; }
      if (dk[k] !== 0) continue;
      const sx = ox + dx[k] * z, sy = oy + (dy[k] - dh[k] * 0.8) * z;
      ctx.moveTo(sx, sy); ctx.lineTo(sx - wx * z * 0.5, sy - z * 0.9);
    }
    ctx.stroke();
    for (let k = 0; k < dropN; k++) {
      if (dk[k] === 0) continue;
      ctx.fillStyle = dk[k] === 1 ? 'rgba(255,255,255,0.9)' : 'rgba(190,255,90,0.7)';
      const s = Math.max(1, z / 5);
      ctx.fillRect(ox + dx[k] * z, oy + (dy[k] - dh[k] * 0.8) * z, s, dk[k] === 1 ? s : s * 2);
    }
  }

  // ------------------------------------------------------------ main frame
  R.frame = function (dt, alpha) {
    const t0 = performance.now();
    tm += dt; frameN++;
    const c = R.cam;
    if (R.follow >= 0) {
      const f = R.follow;
      if (U.alive[f]) { c.x += (U.x[f] - c.x) * 0.15; c.y += (U.y[f] - c.y) * 0.15; clampCam(); } else R.follow = -1;
    }
    const z = c.z, under = R.view === 0;
    updateTerrain();
    if (R.bordersDirty || (R.overlay === 'heat' && frameN % 20 === 0)) { updateBorders(); R.bordersDirty = false; }
    if (frameN % 2 === 0) updateLight();
    if (frameN % 3 === 0 && !under) updateGas();
    if (frameN % 4 === 0) updateClouds();

    let ox = Math.round(cw / 2 - c.x * z), oy = Math.round(ch / 2 - c.y * z);
    if (God.shake > 0) { ox += Math.round((Math.random() - 0.5) * God.shake * 0.7); oy += Math.round((Math.random() - 0.5) * God.shake * 0.7); }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = under ? '#0b090d' : '#0e2a5a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(under ? underC : worldC, ox, oy, W * z, H * z);
    if (!under && R.overlay !== 'none') ctx.drawImage(borderC, ox, oy, W * z, H * z);

    // viewport in world cells
    const vx0 = -ox / z - 2, vy0 = -oy / z - 2, vx1 = vx0 + cw / z + 4, vy1 = vy0 + ch / z + 6;
    const s = z / 4;
    if (!under && z >= 3) drawBuildings(ox, oy, z, s, vx0, vy0, vx1, vy1);
    if (!under && R.showTrade) drawRoutes(ox, oy, z);
    if (!under) drawArmies(ox, oy, z);
    // level of detail: individual sprites when close, one pixel per creature for crowds
    let sprites = z >= 3;
    if (sprites) {
      let n = 0;
      for (let i = 0; i < U.hi && sprites; i++) {
        if (!U.alive[i] || (U.layer[i] === 0) !== under) continue;
        const x = U.x[i], y = U.y[i];
        if (x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1 && ++n > SPRITE_LIMIT) sprites = false;
      }
    }
    R.stats.sprites = sprites;
    if (sprites) drawUnits(ox, oy, z, s, alpha, vx0, vy0, vx1, vy1, under);
    else { R._sky = []; updateDots(alpha); ctx.drawImage(dotsC, ox, oy, W * z, H * z); }
    drawProjectiles(ox, oy, z, under);
    drawParticles(ox, oy, z, under, false);
    if (!under) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(gasC, ox, oy, W * z, H * z);
      const cvis = R.view === 2 ? 1 : AG.clamp(1.15 - z / 7, 0.12, 0.85);
      const sun = Sky.sunDir();
      ctx.globalAlpha = cvis * Sky.daylight();
      ctx.drawImage(shadC, ox - sun.x * 7 * z, oy + 5 * z, W * z, H * z);
      ctx.globalAlpha = 1;
    } else ctx.imageSmoothingEnabled = true;
    // light: darkness then warm glow
    ctx.drawImage(lightC, ox, oy, W * z, H * z);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowC, ox, oy, W * z, H * z);
    ctx.globalCompositeOperation = 'source-over';
    if (!under) {
      const cvis = R.view === 2 ? 1 : AG.clamp(1.15 - z / 7, 0.12, 0.85);
      ctx.globalAlpha = cvis;
      ctx.drawImage(cloudC, ox, oy, W * z, H * z);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    if (!under) { weather(dt, ox, oy, z); drawSkyUnitsOver(ox, oy, z, alpha); }
    drawParticles(ox, oy, z, under, true);
    if (!under) { drawDisasters(ox, oy, z); drawLightning(ox, oy, z); godRays(); }
    if (!under && Sky.flash > 0) { ctx.fillStyle = `rgba(230,236,255,${Sky.flash * 0.35})`; ctx.fillRect(0, 0, cw, ch); }
    drawLabels(ox, oy, z, under);
    drawSelection(ox, oy, z, alpha);
    drawCursor(ox, oy, z);
    if (frameN % 12 === 0) drawMinimap();
    R.stats.ms = performance.now() - t0;
  };

  function drawBuildings(ox, oy, z, s, vx0, vy0, vx1, vy1) {
    for (const c of Civ.cities) {
      if (!c.alive || c.x < vx0 - 30 || c.x > vx1 + 30 || c.y < vy0 - 30 || c.y > vy1 + 30) continue;
      for (const bid of c.buildings) {
        const b = Civ.buildings[bid];
        if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1 + 4) continue;
        const spr = buildingSprite(b);
        const sw = spr.width, sh = spr.height, dx = ox + b.x * z, by = oy + (b.y + b.h) * z;
        if (b.prog >= 1) ctx.drawImage(spr, dx, by - sh * s, sw * s, sh * s);
        else {
          const vis = Math.max(1, Math.ceil(sh * b.prog));
          ctx.globalAlpha = 0.85;
          ctx.drawImage(spr, 0, sh - vis, sw, vis, dx, by - vis * s, sw * s, vis * s);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(150,110,60,0.9)'; ctx.lineWidth = Math.max(1, s * 0.6);
          ctx.strokeRect(dx + s, by - sh * s, sw * s - 2 * s, sh * s);
        }
        if (b.type === BT.WINDMILL && b.prog >= 1) {
          const hx = dx + 4 * s, hy = by - 11 * s, a0 = tm * 1.4 + b.id, L = 6 * s;
          ctx.strokeStyle = '#5d4037'; ctx.lineWidth = Math.max(1, s);
          ctx.beginPath();
          for (let k = 0; k < 4; k++) { const a = a0 + (k * Math.PI) / 2; ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L); }
          ctx.stroke();
        }
        if (b.hp < b.mhp * 0.98 && z >= 4) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(dx, by + 1, b.w * z, 2);
          ctx.fillStyle = '#ef5350'; ctx.fillRect(dx, by + 1, (b.w * z * b.hp) / b.mhp, 2);
        }
      }
    }
  }
  function drawRoutes(ox, oy, z) {
    ctx.setLineDash([z * 1.5, z * 1.5]);
    ctx.lineWidth = Math.max(1, z / 4);
    for (const r of Civ.routes) {
      const a = Civ.cities[r.a], b = Civ.cities[r.b];
      const age = (AG.tick - r.t) / 6000;
      ctx.strokeStyle = r.mode === 'sea' ? `rgba(120,200,255,${0.5 - age * 0.4})` : r.mode === 'air' ? `rgba(220,160,255,${0.5 - age * 0.4})` : `rgba(255,214,90,${0.5 - age * 0.4})`;
      ctx.beginPath(); ctx.moveTo(ox + a.x * z, oy + a.y * z); ctx.lineTo(ox + b.x * z, oy + b.y * z); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  function drawArmies(ox, oy, z) {
    for (const sq of Civ.squads) {
      if (!sq.alive || !sq.members.length) continue;
      const k = Civ.kingdoms[sq.kd], tc = Civ.cities[sq.target];
      const sx = ox + sq.cx * z, sy = oy + sq.cy * z, tx = ox + tc.x * z, ty = oy + tc.y * z;
      ctx.strokeStyle = AG.css(k.color, 0.75); ctx.lineWidth = Math.max(1.5, z / 3);
      ctx.setLineDash([z * 2, z]);
      ctx.beginPath(); ctx.moveTo(sx, sy);
      if (sq.stage === 1 && sq.wpL && sq.wpR) {
        ctx.lineTo(ox + sq.wpL.x * z, oy + sq.wpL.y * z); ctx.lineTo(tx, ty);
        ctx.moveTo(sx, sy); ctx.lineTo(ox + sq.wpR.x * z, oy + sq.wpR.y * z); ctx.lineTo(tx, ty);
        ctx.moveTo(sx, sy);
      }
      ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      const a = Math.atan2(ty - sy, tx - sx), L = Math.max(6, z * 1.6);
      ctx.fillStyle = AG.css(k.color, 0.9);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - Math.cos(a - 0.4) * L, ty - Math.sin(a - 0.4) * L); ctx.lineTo(tx - Math.cos(a + 0.4) * L, ty - Math.sin(a + 0.4) * L); ctx.fill();
    }
  }
  function drawUnits(ox, oy, z, s, alpha, vx0, vy0, vx1, vy1, under) {
    const sky = [];
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i]) continue;
      const L = U.layer[i];
      if (under ? L !== 0 : L === 0) continue;
      const x = U.px[i] + (U.x[i] - U.px[i]) * alpha, y = U.py[i] + (U.y[i] - U.py[i]) * alpha;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      if (L === 2) { sky.push(i); continue; }
      drawUnit(i, x, y, ox, oy, z, s, 0);
    }
    R._sky = sky;
  }
  function drawUnit(i, x, y, ox, oy, z, s, lift) {
    const moving = U.st[i] === 1 || U.st[i] === 3 || (U.flags[i] & FL.POSSESSED);
    const frame = moving ? (U.anim[i] | 0) & 1 : 0;
    const spr = unitSprite(i, frame);
    const sw = spr.width * s, sh = spr.height * s;
    const sx = ox + x * z - sw / 2, sy = oy + y * z - sh - lift * z;
    const f = U.flags[i];
    if (f & (FL.BLESSED | FL.CURSED | FL.POSSESSED) || U.sp[i] === SP.HERALD) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = f & FL.POSSESSED || U.sp[i] === SP.HERALD ? `rgba(255,230,140,${0.35 + 0.15 * Math.sin(tm * 6)})` : f & FL.BLESSED ? 'rgba(255,220,120,0.25)' : 'rgba(170,80,220,0.3)';
      ctx.beginPath(); ctx.arc(ox + x * z, oy + y * z - sh / 2 - lift * z, Math.max(3, sh * 0.7), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(spr, sx, sy, sw, sh);
    if (z >= 6) {
      if (U.carry[i] && SPECIES[U.sp[i]].kind === 'civ') { const c = CARGO[U.carry[i]]; ctx.fillStyle = AG.css(c); ctx.fillRect(sx + sw - s, sy + sh * 0.45, s * 1.5, s * 1.5); }
      if (U.dis[i]) { ctx.fillStyle = AG.DISEASES[U.dis[i] - 1].color; ctx.fillRect(ox + x * z - s * 0.5, sy - s * 2, s, s); }
      if (U.hp[i] < U.mhp[i] * 0.95 && U.st[i] === 3) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx, sy - s * 1.2, sw, s * 0.7); ctx.fillStyle = '#e53935'; ctx.fillRect(sx, sy - s * 1.2, (sw * U.hp[i]) / U.mhp[i], s * 0.7); }
    }
  }
  function drawSkyUnitsOver(ox, oy, z, alpha) {
    if (z < 3) return;
    const s = z / 4;
    for (const i of R._sky || []) {
      if (!U.alive[i]) continue;
      const x = U.px[i] + (U.x[i] - U.px[i]) * alpha, y = U.py[i] + (U.y[i] - U.py[i]) * alpha;
      const lift = U.sp[i] === SP.BIRD ? 2 : 4;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(ox + x * z + lift * z * 0.3, oy + y * z, Math.max(2, s * (U.sp[i] === SP.WYRM ? 5 : 1.5)), Math.max(1, s), 0, 0, Math.PI * 2); ctx.fill();
      drawUnit(i, x, y, ox, oy, z, s, lift);
    }
  }
  function drawProjectiles(ox, oy, z, under) {
    for (let p = 0; p < Proj.n; p++) {
      if ((Proj.layer[p] === 0) !== under) continue;
      const x = ox + Proj.x[p] * z, y = oy + Proj.y[p] * z, h = Proj.z[p] * z * 0.8, k = Proj.kind[p];
      if (k === 0) {
        ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = Math.max(1, z / 6);
        ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x - Proj.vx[p] * z * 2, y - h - (Proj.vy[p] + Proj.vz[p]) * z * 2); ctx.stroke();
      } else if (k === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - z * 0.3, y - z * 0.15, z * 0.6, z * 0.3);
        ctx.fillStyle = '#9e9e9e'; ctx.fillRect(x - z * 0.3, y - h - z * 0.3, z * 0.6, z * 0.6);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = k === 2 ? 'rgba(255,140,40,0.85)' : 'rgba(255,240,160,0.9)';
        ctx.beginPath(); ctx.arc(x, y - h, Math.max(2, z * 0.5), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  function drawParticles(ox, oy, z, under, additive) {
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < FX.n; i++) {
      if (FX.add[i] !== (additive ? 1 : 0)) continue;
      if ((FX.layer[i] === 0) !== under) continue;
      const a = FX.life[i] / FX.max[i], sz = Math.max(1, FX.size[i] * z * 0.5);
      ctx.fillStyle = `rgba(${FX.r[i]},${FX.g[i]},${FX.b[i]},${a.toFixed(2)})`;
      ctx.fillRect(ox + FX.x[i] * z - sz / 2, oy + (FX.y[i] - FX.z[i]) * z - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawDisasters(ox, oy, z) {
    for (const m of God.meteors) {
      const t = m.t / m.T, hx = m.x - (1 - t) * 40, hy = m.y - (1 - t) * 70;
      const sx = ox + hx * z, sy = oy + hy * z;
      const g = ctx.createLinearGradient(sx, sy, sx - 40 * z * 0.25, sy - 70 * z * 0.25);
      g.addColorStop(0, 'rgba(255,220,140,0.95)'); g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(3, z * 1.2);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 40 * z * 0.25, sy - 70 * z * 0.25); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, z * m.r * 0.25), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,80,40,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ox + m.x * z, oy + m.y * z, m.r * z * (1 - t * 0.5), 0, Math.PI * 2); ctx.stroke();
    }
    for (const t of God.tornadoes) {
      const bx = ox + t.x * z, by = oy + t.y * z;
      ctx.strokeStyle = 'rgba(205,205,215,0.55)'; ctx.lineWidth = Math.max(1, z / 4);
      for (let h = 0; h < 9; h++) {
        const r = (0.4 + h * 0.35) * z, wob = Math.sin(t.a + h * 0.7) * z * 0.4;
        ctx.beginPath(); ctx.ellipse(bx + wob, by - h * z * 0.7, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  function drawLightning(ox, oy, z) {
    for (const s of Sky.strikes) {
      let seed = s.seed;
      const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const bx = ox + s.x * z, by = oy + s.y * z;
      const pts = [[bx + (rr() - 0.5) * 60, by - ch]];
      for (let k = 1; k < 10; k++) { const t = k / 10; pts.push([bx + (pts[0][0] - bx) * (1 - t) + (rr() - 0.5) * 30, by - ch * (1 - t)]); }
      pts.push([bx, by]);
      const a = s.t / 9;
      for (const [w, c] of [[6, `rgba(150,180,255,${0.35 * a})`], [2, `rgba(255,255,255,${a})`]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
    }
  }
  function godRays() {
    const day = Sky.daylight();
    if (day < 0.35 || R.view === 0) return;
    const zf = AG.clamp(1.3 - R.cam.z / 10, 0.25, 1);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const bx = ((k * 0.23 + 0.06 + Math.sin(tm * 0.05 + k * 1.7) * 0.05 + 1) % 1) * cw;
      const wpos = R.screenToWorld(bx, ch * 0.35);
      const cloud = Sky.cloudAt(AG.clamp(wpos.x, 0, W - 1), AG.clamp(wpos.y, 0, H - 1));
      const I = day * zf * (0.35 + cloud * 0.9) * (0.6 + 0.4 * Math.sin(tm * 0.3 + k * 2.1));
      if (I < 0.05) continue;
      const w = 30 + (k % 3) * 26, slant = ch * 0.45;
      const g = ctx.createLinearGradient(bx - w, 0, bx + w, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, `rgba(255,236,190,${0.075 * I})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(bx - w * 0.5, 0); ctx.lineTo(bx + w * 0.5, 0); ctx.lineTo(bx + w * 1.4 + slant, ch); ctx.lineTo(bx - w * 1.4 + slant, ch); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawLabels(ox, oy, z, under) {
    if (under) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const k = Civ.kingdoms[c.kd], cap = k.capital === c.id;
      if (z < 2 && !cap) continue;
      const sx = ox + c.x * z, sy = oy + (c.y - 2.5) * z - (z >= 3 ? 4 * z / 4 * 1.2 : 2);
      if (sx < -80 || sx > cw + 80 || sy < -20 || sy > ch + 20) continue;
      const label = z < 2 ? k.name : `${cap ? '♛ ' : ''}${c.name} · ${c.members.length}`;
      ctx.font = `${z < 2 ? 600 : 600} ${z >= 6 ? 12 : 11}px system-ui, sans-serif`;
      ctx.strokeStyle = 'rgba(8,8,14,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = cap ? '#fff4d6' : '#f2f2f2';
      ctx.fillText(label, sx, sy);
      ctx.fillStyle = k.css; ctx.fillRect(sx - ctx.measureText(label).width / 2 - 8, sy - 10, 5, 8);
      if (c.captureT > 0) { ctx.fillStyle = '#ef5350'; ctx.fillRect(sx - 15, sy + 2, (30 * c.captureT) / 100, 3); }
    }
  }
  function drawSelection(ox, oy, z, alpha) {
    const sel = AG.UI && AG.UI.sel;
    if (!sel) return;
    if (sel.type === 'unit' && U.alive[sel.id]) {
      const i = sel.id, x = U.px[i] + (U.x[i] - U.px[i]) * alpha, y = U.py[i] + (U.y[i] - U.py[i]) * alpha;
      if ((U.layer[i] === 0) !== (R.view === 0)) return;
      const lift = U.layer[i] === 2 ? 4 : 0;
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(ox + x * z, oy + (y - lift) * z, Math.max(5, z * 1.1), Math.max(3, z * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
      if (U.st[i] === 1) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(ox + x * z, oy + y * z); ctx.lineTo(ox + U.tx[i] * z, oy + U.ty[i] * z); ctx.stroke(); ctx.setLineDash([]); }
    } else if (sel.type === 'city') {
      const c = Civ.cities[sel.id];
      if (!c || !c.alive) return;
      ctx.strokeStyle = 'rgba(255,240,180,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(ox + c.x * z, oy + c.y * z, c.radius * z, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawCursor(ox, oy, z) {
    const h = R.hover;
    if (!h.on || !God.cur) return;
    const sx = ox + h.x * z, sy = oy + h.y * z;
    ctx.strokeStyle = God.cur.color || '#fff'; ctx.lineWidth = 1.5;
    if (God.cur.mode === 'brush') { ctx.beginPath(); ctx.arc(sx, sy, God.brush.r * z, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy); ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7); ctx.stroke(); }
  }
  function drawMinimap() {
    if (!mctx) return;
    const mw = mini.width, mh = mini.height;
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(R.view === 0 ? underC : worldC, 0, 0, mw, mh);
    if (R.view !== 0) mctx.drawImage(borderC, 0, 0, mw, mh);
    const c = R.cam, sx = mw / W, sy = mh / H;
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
    mctx.strokeRect((c.x - cw / 2 / c.z) * sx, (c.y - ch / 2 / c.z) * sy, (cw / c.z) * sx, (ch / c.z) * sy);
  }
})();
