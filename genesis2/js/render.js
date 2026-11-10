/* AURA: Genesis 2 — render.js
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
  const STEPS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48];
  const SPRITE_LIMIT = 2500; // above this many visible creatures, draw them as pixels
  const R = (AG.Render = {
    view: 1, overlay: 'realms', showTrade: true, cam: { x: W / 2, y: H / 2, z: AG.BASE_ZOOM }, follow: -1, bordersDirty: true,
    hover: { x: -1, y: -1, on: false }, stats: { ms: 0 }, minZoom: 1,
  });
  let cv, ctx, cw = 0, ch = 0, mini, mctx, vignette = null;
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
    mini.width = 200; mini.height = Math.round((200 * H) / W);
    R.resize();
  };
  // Performance knobs, set by AG.Perf (main.js): the canvas can hold fewer pixels than the screen
  // (drawing stays in screen coordinates through a scale transform, and the browser stretches the
  // pixel art up crisply); cosmetic layers can be switched off; the minimap redraws less often.
  R.perf = { scale: 1, cosmetics: true, minimapEvery: 12, animate: true, wildZ: 4 };
  R.setScale = function (k) { if (Math.abs(k - R.perf.scale) > 0.01) { R.perf.scale = k; R.resize(); plates.clear(); for (const d in digits) delete digits[d]; } };
  R.resize = function () {
    const r = cv.getBoundingClientRect();
    cw = Math.max(1, Math.round(r.width)); ch = Math.max(1, Math.round(r.height)); sigLast = '';
    cv.width = Math.max(1, Math.round(cw * R.perf.scale)); cv.height = Math.max(1, Math.round(ch * R.perf.scale));
    if (AG.View3D && AG.View3D.ok) AG.View3D.resize(cw, ch);
    R.minZoom = Math.max(cw / W, ch / H);
    if (R.cam.z < R.minZoom) R.cam.z = R.minZoom;
    // vignette rendered once at quarter resolution, then stretched each frame
    const vw = Math.max(1, cw >> 2), vh = Math.max(1, ch >> 2);
    vignette = mk(vw, vh);
    const vx = vignette.getContext('2d'), g = vx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
    g.addColorStop(0, 'rgba(6,8,16,0)'); g.addColorStop(1, 'rgba(6,8,16,0.42)');
    vx.fillStyle = g; vx.fillRect(0, 0, vw, vh);
    clampCam();
  };
  R.size = () => ({ w: cw, h: ch });
  // Warm-up (loading screen, and when people first appear): paint every terrain chunk, the overlay
  // and minimap, and the tree tiles for what is on screen, so the first frames have nothing to build.
  R.prewarm = function () {
    lastView = -1; updateTerrain();
    updateBorders(); R.bordersDirty = false;
    drawMinimap();
    const z = R.cam.z;
    if (z >= 2.9) {
      const k = Math.round(z) % 3 === 0 ? 3 : 4; decoK = k;
      const hw = cw / 2 / z + 32, hh = ch / 2 / z + 32;
      const cx0 = Math.max(0, Math.floor((R.cam.x - hw) / 16)), cx1 = Math.min(CW - 1, Math.floor((R.cam.x + hw) / 16));
      const cy0 = Math.max(0, Math.floor((R.cam.y - hh) / 16)), cy1 = Math.min(AG.CH - 1, Math.floor((R.cam.y + hh) / 16));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * CW + cx; buildDeco(c, k); decoDirty[c] = 0; }
    }
  };
  R.reset = function () { R.follow = -1; R.bordersDirty = true; lastView = -1; morphReset(); R.invalidate(); Wd.dirty.fill(1); Wd.udirty.fill(1); decoDirty.fill(1); decoSig.fill(0); decoWarm = true; R.fit(); };

  // ------------------------------------------------------------ camera
  // The world is sized to the screen, so the smallest zoom always fills it edge to edge.
  // Zoom and position glide toward targets (zt, tx, ty) for smooth, map-app style motion;
  // past 8x the 3D view (view3d.js) takes over and tilts the camera.
  const MAXZ = 48;
  let anchor = null; // world point held under the cursor while a 2D zoom animates
  R.MAXZ = MAXZ;
  R.zoomList = () => [R.minZoom, ...STEPS.filter((s) => s > R.minZoom + 0.05)];
  R.is3D = () => !!(AG.View3D && AG.View3D.active);
  R.fit = function () {
    const c = R.cam;
    R.minZoom = Math.max(cw / W, ch / H);
    c.z = c.zt = Math.max(R.minZoom, AG.BASE_ZOOM); c.x = c.tx = W / 2; c.y = c.ty = H / 2; anchor = null;
    clampCam();
  };
  const flatToWorld = (sx, sy) => ({ x: (sx - cw / 2) / R.cam.z + R.cam.x, y: (sy - ch / 2) / R.cam.z + R.cam.y });
  R.screenToWorld = (sx, sy) => (R.is3D() ? AG.View3D.screenToWorld(sx, sy) : flatToWorld(sx, sy));
  R.zoomAt = function (sx, sy, dir) {
    const c = R.cam, list = R.zoomList();
    let idx = 0;
    for (let k = 0; k < list.length; k++) if (list[k] <= c.zt + 0.01) idx = k;
    const ni = AG.clamp(idx + dir, 0, list.length - 1);
    if (Math.abs(list[ni] - c.zt) < 0.001) return;
    anchor = R.is3D() || list[ni] > 8 ? null : { sx, sy, ...flatToWorld(sx, sy) };
    if (!anchor) { c.tx = c.x; c.ty = c.y; }
    c.zt = list[ni];
  };
  R.zoomTarget = function (z) { R.cam.zt = AG.clamp(z, R.minZoom, MAXZ); anchor = null; };
  R.setZoom = function (z) { R.cam.z = R.cam.zt = AG.clamp(z, R.minZoom, MAXZ); anchor = null; clampCam(); };
  R.pan = function (dx, dy) {
    const c = R.cam;
    let wx = dx / c.z, wy = dy / c.z;
    if (R.is3D()) {
      // drag along the ground plane, respecting the camera's heading and tilt
      const V = AG.View3D, sy = Math.sin(V.yaw), cy = Math.cos(V.yaw);
      wy /= Math.max(0.35, Math.cos(V.tilt));
      const ex = wx * cy + wy * sy, ez = -wx * sy + wy * cy;
      wx = ex; wy = ez;
    }
    c.x -= wx; c.y -= wy; c.tx = c.x; c.ty = c.y; anchor = null;
    if (God.possessed < 0) R.follow = -1;
    clampCam();
  };
  // fly to a place (and optionally a zoom); the camera glides there over a few frames
  R.centerOn = function (x, y, z) {
    const c = R.cam;
    c.tx = x; c.ty = y; anchor = null;
    if (z) c.zt = AG.clamp(z, R.minZoom, MAXZ);
  };
  R.jumpTo = function (x, y, z) { const c = R.cam; c.x = c.tx = x; c.y = c.ty = y; if (z) c.z = c.zt = AG.clamp(z, R.minZoom, MAXZ); anchor = null; clampCam(); };
  function bounds(z) {
    if (R.is3D() || z > 8) return [1, W - 1, 1, H - 1];
    const hw = cw / 2 / z, hh = ch / 2 / z;
    return [hw * 2 >= W ? W / 2 : hw, hw * 2 >= W ? W / 2 : W - hw, hh * 2 >= H ? H / 2 : hh, hh * 2 >= H ? H / 2 : H - hh];
  }
  function clampCam() {
    const c = R.cam;
    if (c.z < R.minZoom) c.z = R.minZoom;
    if (c.zt < R.minZoom) c.zt = R.minZoom;
    const b = bounds(c.z), bt = bounds(c.zt);
    c.x = AG.clamp(c.x, b[0], b[1]); c.y = AG.clamp(c.y, b[2], b[3]);
    c.tx = AG.clamp(c.tx, bt[0], bt[1]); c.ty = AG.clamp(c.ty, bt[2], bt[3]);
  }
  R.updateCamera = function (dt) {
    const c = R.cam, k = 1 - Math.exp(-dt * 9);
    if (R.follow >= 0) {
      if (U.alive[R.follow]) { c.tx = U.x[R.follow]; c.ty = U.y[R.follow]; } else R.follow = -1;
    }
    if (Math.abs(c.zt - c.z) > 1e-4) {
      c.z += (c.zt - c.z) * k;
      if (Math.abs(c.zt - c.z) < 0.003) c.z = c.zt;
      if (anchor) { c.x = c.tx = anchor.x - (anchor.sx - cw / 2) / c.z; c.y = c.ty = anchor.y - (anchor.sy - ch / 2) / c.z; }
    } else anchor = null;
    c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
    clampCam();
  };

  // ------------------------------------------------------------ terrain colours (16-bit palette)
  const C = {
    deep: [16, 42, 98], mid: [26, 84, 158], shallow: [44, 134, 198], shoal: [96, 190, 216], foam: [226, 244, 250], river: [58, 162, 214],
    sand: [236, 214, 154], sandWet: [198, 172, 118], dirt: [152, 116, 74],
    rock: [148, 140, 132], snow: [244, 248, 255],
    forest: [40, 102, 50], forestCold: [40, 86, 70], jungle: [28, 116, 58],
  };
  const gc = [0, 0, 0], wc = [0, 0, 0];
  function grassColour(T, out) {
    // tundra teal -> meadow green -> savanna gold
    if (T < 0.45) { const t = AG.clamp((T - 0.05) / 0.4, 0, 1); out[0] = 92 + 10 * t; out[1] = 140 + 36 * t; out[2] = 112 - 50 * t; }
    else { const t = AG.clamp((T - 0.45) / 0.35, 0, 1); out[0] = 102 + 88 * t; out[1] = 176 - 8 * t; out[2] = 62 + 2 * t; }
  }
  function waterColour(t, out) { // 0 = shoal, 1 = abyss
    let a, b, u;
    if (t < 0.25) { a = C.shoal; b = C.shallow; u = t / 0.25; }
    else if (t < 0.6) { a = C.shallow; b = C.mid; u = (t - 0.25) / 0.35; }
    else { a = C.mid; b = C.deep; u = (t - 0.6) / 0.4; }
    out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
  }
  function buildingColour(B, x, y) {
    const k = Civ.kingdoms[B.kd], kc = k ? k.color : [150, 150, 150];
    switch (B.type) {
      case BT.KEEP: return (x - B.x === 1 || x - B.x === 2) && (y - B.y === 1 || y - B.y === 2) ? kc : [150, 146, 140];
      case BT.HOUSE: return [kc[0] * 0.5 + 60, kc[1] * 0.5 + 34, kc[2] * 0.5 + 24];
      case BT.FARM: {
        if ((y - B.y) & 1) return [110, 80, 48];
        const t = B.growth;
        return [126 + 104 * t, 160 + 38 * t, 62 + 22 * t];
      }
      case BT.GRANARY: return [214, 196, 160];
      case BT.TENT: return [176, 140, 98];
      case BT.HEARTH: return [120, 96, 80];
      case BT.HUT: return [168, 140, 90];
      case BT.PEN: return [126, 100, 70];
      case BT.MEGALITH: return [140, 138, 132];
      case BT.SHRINE: return [170, 160, 140];
      case BT.HALL: return [kc[0] * 0.5 + 60, kc[1] * 0.5 + 40, kc[2] * 0.5 + 28];
      case BT.TEMPLE: return [238, 232, 216];
      case BT.MARKET: return (x + y) & 1 ? kc : [236, 230, 214];
      case BT.MINE: return [72, 58, 50];
      case BT.TOWER: return [150, 150, 160];
      case BT.WALL: return [126, 126, 134];
      case BT.DOCK: return [146, 106, 66];
      case BT.WORKSHOP: return [140, 104, 66];
    }
    return kc;
  }
  const BANDS = 26;  // elevation terraces, drawn as lit lips and shaded cliff faces
  let noShade = false;
  // A cell's colour without sun shading or water sparkle: the 3D view lights it for real.
  R.flatColor = function (i) { noShade = true; const v = surfPix(i, i % W, (i / W) | 0); noShade = false; return v; };
  let LX = 0.6, LY = -0.55, season = 0, glints = false; // glints only on water that moves
  const dry = (j) => Wd.fl[j] < 0.002 || Wd.frozen[j] === 1;
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  function waterPix(i, x, y, e, f, d, inner) {
    const ocean = e < SEA - 0.03;
    const depth = ocean ? SEA - e : f;
    const q = Math.min(1, Math.floor(AG.clamp(depth / 0.32, 0, 1) * 7 + (d + 7) / 15) / 7); // banded, dithered edges
    waterColour(q, wc);
    let r = wc[0], g = wc[1], b = wc[2];
    if (!ocean) { r = r * 0.6 + C.river[0] * 0.4; g = g * 0.6 + C.river[1] * 0.4; b = b * 0.6 + C.river[2] * 0.4; }
    const wt = glints ? tm : 0; // water that does not animate is drawn still
    const shim = noShade ? 0 : Math.sin(x * 0.8 + wt * 2.1 + d * 0.3) * Math.sin(y * 0.6 - wt * 1.7);
    if (shim > 0.6) { r += 14; g += 18; b += 16; }
    if (glints && !noShade && depth > 0.025 && ((hash(x, y) + ((wt * 3) | 0) * 40503) >>> 0) % 53 === 0) { r = 236; g = 246; b = 255; } // sun glints, scattered (a still lattice of them read as streaks)
    if (inner && (dry(i - 1) || dry(i + 1) || dry(i - W) || dry(i + W))) {
      const fo = 0.42 + 0.3 * Math.sin(wt * 2.4 + (x + y) * 0.7); // lapping shoreline foam
      r += (C.foam[0] - r) * fo; g += (C.foam[1] - g) * fo; b += (C.foam[2] - b) * fo;
    }
    return [r, g, b];
  }
  function surfPix(i, x, y) {
    const e = Wd.elev[i], f = Wd.fl[i], d = Wd.dither[i];
    const inner = x > 0 && x < W - 1 && y > 0 && y < H - 1;
    // open water takes a fast path: no ground to shade underneath
    if (f > 0.02 && Wd.ft[i] === FT.WATER && !Wd.frozen[i] && !Wd.fire[i]) {
      const w = waterPix(i, x, y, e, f, d, inner);
      return pack(clamp255(w[0] + d * 0.4), clamp255(w[1] + d * 0.4), clamp255(w[2] + d * 0.4));
    }
    const s = Wd.soil[i], v = Wd.veg[i];
    let r, g, b;
    switch (s) {
      case SO.SAND: {
        const c = inner && (!dry(i - 1) || !dry(i + 1) || !dry(i - W) || !dry(i + W)) ? C.sandWet : C.sand;
        r = c[0]; g = c[1]; b = c[2];
        if (v > 20) { r -= 26; g -= 6; b -= 30; }
        if (((x * 3 + y * 5) & 15) === 0) { r -= 12; g -= 12; b -= 10; } // pebbles
        break;
      }
      case SO.ROCK: {
        const t = AG.clamp((e - AG.MOUNTAIN) * 3.5, 0, 1);
        r = C.rock[0] - t * 34; g = C.rock[1] - t * 32; b = C.rock[2] - t * 22;
        if (((x * 5 + y * 3) & 7) === 0) { r += 16; g += 16; b += 14; }
        break;
      }
      case SO.BASALT: r = 60; g = 54; b = 62; if (((x + y * 3) % 5) === 0) { r += 14; g += 10; b += 14; } break;
      case SO.ASH: r = 108; g = 102; b = 98; if (v > 20) { r -= 10; g += 22; b -= 10; } break;
      case SO.BLIGHT: r = 108; g = 62 + (v >> 3); b = 124; if (((x ^ y) & 3) === 0) { r += 18; g -= 8; b += 22; } break;
      case SO.ROAD: r = 186; g = 154; b = 110; if (((x + y) & 3) === 0) { r -= 14; g -= 14; b -= 12; } break;
      case SO.FARM: r = 128; g = 94; b = 58; break;
      default: {
        const T = Wd.tbase[i] + Sky.seasonT;
        grassColour(T, gc);
        if (season === 2 && T > 0.25 && T < 0.6) { gc[0] += 54; gc[1] -= 12; gc[2] -= 22; } // autumn
        if (v < 60) { const t = v / 60; r = C.dirt[0] + (gc[0] - C.dirt[0]) * t; g = C.dirt[1] + (gc[1] - C.dirt[1]) * t; b = C.dirt[2] + (gc[2] - C.dirt[2]) * t; }
        else if (v < 165) {
          const t = (v - 60) / 105; r = gc[0] - 16 * t; g = gc[1] - 20 * t; b = gc[2] - 8 * t;
          if (((x ^ (y * 3)) & 7) === 0) { r += 16; g += 20; b += 8; } // grass blades
        } else {
          const F = T < 0.3 ? C.forestCold : T > 0.68 ? C.jungle : C.forest;
          r = F[0]; g = F[1]; b = F[2];
          if (d > 2) { r += 16; g += 24; b += 12; } else if (d < -4) { r -= 12; g -= 16; b -= 10; } // canopy texture
        }
        if (s === SO.HOLY) { r = r * 0.45 + 132; g = g * 0.45 + 118; b = b * 0.45 + 52; if (((x + y * 2) % 7) === 0) { r += 30; g += 26; } }
      }
    }
    if (Wd.ice[i]) { // glacier: blue-white with crevasses
      const t = Math.min(1, Wd.ice[i] / 120);
      r = 214 + d * 2 - t * 10; g = 230 + d * 2 - t * 4; b = 246;
      if (((x * 7 + y * 3) % 23) === 0 || ((x * 2 + y * 9) % 31) === 0) { r -= 40; g -= 26; b -= 10; }
    }
    const snowy = Wd.snow[i] > 20 && !Wd.ice[i];
    if (snowy) { const t = Math.min(1, Wd.snow[i] / 190); r += (C.snow[0] - r) * t; g += (C.snow[1] - g) * t; b += (C.snow[2] - b) * t; }
    const bg = Wd.bgrid[i];
    if (bg) {
      const B = Civ.buildings[bg - 1], c = buildingColour(B, x, y), t = B.prog >= 1 ? 1 : 0.35 + B.prog * 0.5;
      r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
    }
    // hillshade with the moving sun, plus stepped terraces for the 16-bit relief look
    let sh = 1;
    if (inner && !noShade) {
      const en = Wd.elev[i - W], es = Wd.elev[i + W];
      sh = 1 - ((Wd.elev[i + 1] - Wd.elev[i - 1]) * LX + (es - en) * LY) * 18 + (e - SEA) * 0.16;
      if (e >= SEA) {
        const bd = ((e - SEA) * BANDS) | 0;
        if ((((en - SEA) * BANDS) | 0) > bd) sh *= 0.8; else if (bd > (((es - SEA) * BANDS) | 0)) sh *= 1.1;
      }
      sh = sh < 0.55 ? 0.55 : sh > 1.4 ? 1.4 : sh;
    }
    r = r * sh + d; g = g * sh + d; b = b * sh + d;
    if (snowy && sh < 0.97) b += (0.97 - sh) * 90; // blue shadows on snow
    if (f > 0.0015) {
      const ty = Wd.ft[i];
      if (Wd.frozen[i]) {
        r = r * 0.12 + 200 + d; g = g * 0.12 + 218 + d; b = b * 0.12 + 226;
        if ((x * 3 + y * 5) % 17 === 0) { r -= 30; g -= 20; b -= 10; } // cracks in the ice
      } else if (ty === FT.WATER) {
        const w = waterPix(i, x, y, e, f, d, inner);
        const a = 0.35 + (f / 0.02) * 0.65; // fords and puddles show the ground beneath
        r += (w[0] - r) * a; g += (w[1] - g) * a; b += (w[2] - b) * a;
      } else if (ty === FT.LAVA) {
        const fl = 0.5 + 0.5 * Math.sin(tm * 3 + d * 0.9 + x * 0.35 + y * 0.2);
        if (f < 0.005 || (d > 4 && f < 0.03)) { r = 128 + fl * 30; g = 36 + fl * 22; b = 24; } // cooling crust
        else { r = 255; g = 78 + fl * 120; b = 22 + fl * 34; }
      } else {
        const bub = (d + ((tm * 6) | 0)) % 7 === 0;
        r = bub ? 214 : 118; g = bub ? 255 : 230; b = bub ? 150 : 66;
      }
    }
    if (Wd.fire[i]) { const fl = 0.5 + 0.5 * Math.sin(tm * 11 + d * 2 + x); r = 255; g = 100 + fl * 130; b = 24 + fl * 20; }
    return pack(clamp255(r), clamp255(g), clamp255(b));
  }
  function underPix(i, x, y) {
    const u = Wd.ug[i], d = Wd.dither[i];
    let r, g, b;
    switch (u) {
      case UG.ROCK: r = 66 + d; g = 62 + d; b = 74 + d; break;
      case UG.DIRT: r = 98 + d; g = 76 + d; b = 58 + d; break;
      case UG.CAVE: r = 32; g = 27; b = 36; if (((x * 3 + y * 7) & 15) === 0) { r += 10; g += 8; b += 10; } break;
      case UG.TUNNEL: r = 120 + d; g = 94 + d; b = 66 + d; if ((x + y) % 6 === 0) { r -= 24; g -= 20; b -= 14; } break; // timber props
      case UG.IRON: if (d > 1) { r = 184; g = 110; b = 78; } else { r = 72 + d; g = 62; b = 66; } break;
      case UG.GOLD: if (d > 0) { r = 255; g = 212; b = 72; } else { r = 98; g = 84; b = 62; } break;
      case UG.CRYSTAL: { const p = 0.5 + 0.5 * Math.sin(tm * 2 + d); r = 90 + p * 70; g = 210 + p * 40; b = 255; break; }
      case UG.FUNGUS: if (d > 3) { r = 96; g = 236; b = 200; } else { r = 34; g = 58; b = 54; } break;
      default: r = 16; g = 14; b = 18;
    }
    const open = Wd.ugOpen(i);
    if (y > 0 && y < H - 1) {
      if (!open && u !== UG.BEDROCK && Wd.ugOpen(i + W)) { r += 34; g += 30; b += 30; }        // lit wall face above a cavern
      else if (open && !Wd.ugOpen(i - W)) { r *= 0.6; g *= 0.6; b *= 0.62; }                   // shadow under the overhang
    }
    if (Wd.ugF[i]) {
      const a = Math.min(1, Wd.ugF[i] / 110);
      if (Wd.ugT[i] === UF.MAGMA) { const fl = 0.5 + 0.5 * Math.sin(tm * 3 + d + x * 0.3); r += (255 - r) * a; g += (80 + fl * 100 - g) * a; b += (20 - b) * a; }
      else { r += (40 - r) * a; g += (104 - g) * a; b += (200 - b) * a; }
    }
    const bg = Wd.bgrid[i];
    if (bg && Civ.buildings[bg - 1].type === BT.MINE) { r = 232; g = 188; b = 96; }
    return pack(clamp255(r), clamp255(g), clamp255(b));
  }
  const animated = new Uint8Array(NC); // chunks holding water, lava, acid or fire
  function paintChunk(c, under, out) { // out: a hidden picture to draw into (deep time), else the map
    const x0 = (c % CW) << 4, y0 = ((c / CW) | 0) << 4;
    if (under) {
      for (let y = y0; y < y0 + 16; y++) { let i = y * W + x0; for (let x = x0; x < x0 + 16; x++, i++) upix[i] = underPix(i, x, y); }
      return;
    }
    let sig = season + 1, ani = 0;
    const px = out || wpix;
    for (let y = y0; y < y0 + 16; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x0 + 16; x++, i++) {
        px[i] = surfPix(i, x, y);
        const v = Wd.veg[i], wet = Wd.fl[i] > 0.004;
        if (wet || Wd.fire[i]) ani = 1;
        sig = (Math.imul(sig, 31) + ((v >= 165 ? 3 : v >= 110 ? 2 : v >= 60 ? 1 : 0) | (Wd.snow[i] > 120 ? 4 : 0) | (Wd.bgrid[i] ? 8 : 0) | (Wd.fire[i] ? 16 : 0) | (wet ? 32 : 0) | (Wd.soil[i] << 6))) | 0;
      }
    }
    animated[c] = ani;
    if (out) mo.sigB[c] = sig; // trees follow when the morph reaches this chunk
    else if (sig !== decoSig[c]) { decoSig[c] = sig; decoDirty[c] = 1; }
  }
  // ------------------------------------------------------------ deep time: the land morphs
  // The geology repaints the fine map a band of rows per frame, but no band is ever shown as it is
  // painted (that drew a line sweeping the map). The rows are drawn into a hidden picture; when it
  // is whole, the map on screen dissolves into it everywhere at once, cell by cell, in an order set
  // by a fixed noise field (drifting patches with a fine grain). Each dissolve lasts about as long
  // as the next picture takes to build, so the land changes all the time, smoothly, with no sweep
  // and no jump. Only cells that differ are touched: a dissolve costs what actually changed.
  const NB = 64;
  const mo = {
    build: new Uint32Array(W * H), to: new Uint32Array(W * H), // picture being built; target of the dissolve
    sigB: new Int32Array(NC), sigT: new Int32Array(NC),          // tree signatures of those pictures, per chunk
    order: new Uint8Array(W * H), corder: new Uint8Array(NC),    // each cell's (and chunk's) moment in a dissolve
    list: new Int32Array(W * H), start: new Int32Array(NB + 1), trees: [],
    y: 0, rows: 0, ready: false, on: false, t0: 0, dur: 1, applied: 0, rot: 0, passT0: 0, stepAt: -1, poke: false,
  };
  (function morphOrder() {
    // value noise: patches of ~24 and ~7 cells and a per-cell grain, flattened to an even spread
    const v = new Float32Array(W * H);
    const octave = (sc, wgt, salt) => {
      const gw = Math.ceil(W / sc) + 2, gh = Math.ceil(H / sc) + 2, g = new Float32Array(gw * gh);
      for (let k = 0; k < g.length; k++) g[k] = hash((k % gw) + salt, ((k / gw) | 0) * 7 + salt) / 4294967296;
      for (let y = 0; y < H; y++) {
        const fy = y / sc, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < W; x++) {
          const fx = x / sc, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), k = iy * gw + ix;
          const a = g[k] + (g[k + 1] - g[k]) * sx, b = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * sx;
          v[y * W + x] += (a + (b - a) * sy) * wgt;
        }
      }
    };
    octave(24, 0.62, 101); octave(7, 0.28, 307);
    for (let i = 0; i < W * H; i++) v[i] += (hash(i % W, ((i / W) | 0) + 9001) / 4294967296) * 0.1;
    const BINS = 1024, hist = new Int32Array(BINS);
    for (let i = 0; i < W * H; i++) hist[Math.min(BINS - 1, (v[i] * BINS) | 0)]++;
    for (let b = 1; b < BINS; b++) hist[b] += hist[b - 1];
    for (let i = 0; i < W * H; i++) mo.order[i] = Math.min(NB - 1, ((hist[Math.min(BINS - 1, (v[i] * BINS) | 0)] - 1) / (W * H)) * NB) | 0;
    for (let c = 0; c < NC; c++) mo.corder[c] = mo.order[((((c / CW) | 0) << 4) + 8) * W + ((c % CW) << 4) + 8];
  })();
  // Main asks for a few rows of the fine map each frame of deep time (none while a finished
  // picture waits for the running dissolve to end).
  R.deepFrame = function (rows) {
    if (mo.ready) return;
    if (mo.y === 0 && mo.rows === 0) { // a new picture only once the land has moved or a power touched it
      if (AG.Geo.stepN === mo.stepAt && !mo.poke) return;
      mo.stepAt = AG.Geo.stepN; mo.poke = false; mo.passT0 = AG.now();
    }
    const y1 = Math.min(H, mo.y + rows);
    AG.Geo.paintRows(mo.y, y1, true); // quiet: nothing on screen is marked for repainting
    mo.y = y1;
    // draw each band of chunks once its cells and the row below (shading, shores) are painted
    const upto = y1 >= H ? AG.CH : Math.max(0, (y1 - 1) >> 4);
    if (mo.rows < upto) { lightNow(); glints = false; }
    for (; mo.rows < upto; mo.rows++) for (let cx = 0; cx < CW; cx++) paintChunk(mo.rows * CW + cx, false, mo.build);
    if (mo.rows >= AG.CH) {
      mo.ready = true; mo.y = 0; mo.rows = 0;
      mo.dur = AG.clamp((AG.now() - mo.passT0) / 1000, 0.35, 3); // the next dissolve lasts as long as this picture took
      R.bordersDirty = true;
    }
  };
  function morphStart() {
    // the finished picture becomes the target; the old target (already on screen) is reused
    let t = mo.to; mo.to = mo.build; mo.build = t;
    t = mo.sigT; mo.sigT = mo.sigB; mo.sigB = t;
    mo.ready = false; mo.on = true; mo.t0 = AG.now(); mo.applied = 0;
    mo.rot = (mo.rot + 23) % NB; // the order turns a little each time, so no patch always leads
    const to = mo.to, order = mo.order, rot = mo.rot, start = mo.start, list = mo.list, n = W * H;
    start.fill(0);
    for (let i = 0; i < n; i++) if (wpix[i] !== to[i]) start[((order[i] + rot) % NB) + 1]++;
    for (let b = 0; b < NB; b++) start[b + 1] += start[b];
    const fill = start.slice(0, NB);
    for (let i = 0; i < n; i++) if (wpix[i] !== to[i]) list[fill[(order[i] + rot) % NB]++] = i;
    R.stats.morphCells = start[NB]; R.stats.morphs = (R.stats.morphs || 0) + 1; R.stats.morphSecs = mo.dur;
    mo.trees.length = 0;
    for (let c = 0; c < NC; c++) if (mo.sigT[c] !== decoSig[c]) mo.trees.push(c);
  }
  function morphStep() {
    if (!mo.on) { if (!mo.ready) return; morphStart(); }
    const t = (AG.now() - mo.t0) / (mo.dur * 1000), upto = t >= 1 ? NB : Math.floor(t * NB);
    if (upto <= mo.applied) return;
    const to = mo.to, list = mo.list, start = mo.start;
    for (let k = start[mo.applied]; k < start[upto]; k++) {
      const i = list[k], y = (i / W) | 0, cy = y >> 4, cx = (i - y * W) >> 4;
      wpix[i] = to[i];
      if (cx < spanLo[cy]) spanLo[cy] = cx;
      if (cx > spanHi[cy]) spanHi[cy] = cx;
    }
    for (let k = mo.trees.length - 1; k >= 0; k--) {
      const c = mo.trees[k];
      if ((mo.corder[c] + mo.rot) % NB < upto) { decoSig[c] = mo.sigT[c]; decoDirty[c] = 1; mo.trees[k] = mo.trees[mo.trees.length - 1]; mo.trees.pop(); }
    }
    mo.applied = upto;
    if (upto >= NB) mo.on = false;
  }
  // A chunk drawn straight onto the map (a god power, a new world) goes into the hidden pictures too.
  function morphCopy(k) {
    const x0 = (k % CW) << 4, y0 = ((k / CW) | 0) << 4;
    for (let y = y0; y < y0 + 16; y++) { const i = y * W + x0, row = wpix.subarray(i, i + 16); mo.to.set(row, i); mo.build.set(row, i); }
    mo.sigT[k] = mo.sigB[k] = decoSig[k];
  }
  // After the whole map is drawn at once: nothing left to dissolve into.
  function morphSync() { mo.to.set(wpix); mo.build.set(wpix); mo.sigT.set(decoSig); mo.sigB.set(decoSig); mo.on = false; mo.trees.length = 0; }
  function morphReset() { morphSync(); mo.ready = false; mo.y = 0; mo.rows = 0; mo.stepAt = AG.Geo.stepN; mo.poke = false; }
  R.deepPoke = function () { mo.poke = true; }; // a power was used in deep time: rebuild the picture

  let visRoll = 0;
  // Only the repainted parts of the world image are uploaded: one span of chunks per chunk row
  // (putImageData converts every pixel it is given, and Safari does that on the CPU).
  const spanLo = new Int32Array(AG.CH).fill(1 << 30), spanHi = new Int32Array(AG.CH).fill(-1);
  function paintAt(k, under) {
    paintChunk(k, under);
    const cy = (k / CW) | 0, cx = k - cy * CW;
    if (cx < spanLo[cy]) spanLo[cy] = cx;
    if (cx > spanHi[cy]) spanHi[cy] = cx;
  }
  function upload(under, all) {
    const g = under ? uctx : wctx, img = under ? uimg : wimg;
    if (all) g.putImageData(img, 0, 0);
    else for (let cy = 0; cy < AG.CH; cy++) if (spanHi[cy] >= 0) g.putImageData(img, 0, 0, spanLo[cy] << 4, cy << 4, (spanHi[cy] - spanLo[cy] + 1) << 4, 16);
    spanLo.fill(1 << 30); spanHi.fill(-1);
  }
  function lightNow() { const sun = Sky.sunDir(), day = Sky.daylight(); LX = day > 0.05 ? sun.x : -0.5; LY = sun.y; season = Sky.season(); }
  function updateTerrain() {
    const under = R.view === 0;
    lightNow();
    const dirty = under ? Wd.udirty : Wd.dirty, awake = under ? Wd.uawake : Wd.awake;
    const full = lastView !== (under ? 0 : 1);
    lastView = under ? 0 : 1;
    let painted = 0;
    glints = (AG.mode === 'watch' || under) && R.perf.animate;
    if (full) {
      for (let k = 0; k < NC; k++) paintChunk(k, under);
      dirty.fill(0); painted = NC; upload(under, true); R.stats.painted = painted;
      if (!under) morphSync();
      return;
    }
    if (AG.mode === 'deep' && !under) {
      // deep time: the land morphs (below); only chunks something else changed are drawn at once,
      // into the hidden pictures too so the morph never brings back what they showed before
      for (let k = 0; k < NC; k++) if (dirty[k]) { paintAt(k, false); dirty[k] = 0; painted++; morphCopy(k); }
      morphStep();
      upload(false, false);
      R.stats.painted = painted;
      return;
    }
    {
      const live = (AG.mode === 'watch' || under) && R.perf.animate; // in deep time and history (and on slow machines) water does not ripple
      for (let k = 0; k < NC; k++) if (dirty[k] || (live && awake[k] && (frameN + k) % 3 === 0)) { paintAt(k, under); dirty[k] = 0; painted++; }
      if (!live) { if (painted) upload(under, painted > NC / 2); R.stats.painted = painted; return; }
      // animate visible water and fire: a quarter of those chunks per frame
      const c = R.cam, hw = cw / 2 / c.z, hh = ch / 2 / c.z;
      const vx0 = Math.max(0, (c.x - hw) >> 4), vx1 = Math.min(CW - 1, (c.x + hw) >> 4);
      const vy0 = Math.max(0, (c.y - hh) >> 4), vy1 = Math.min(AG.CH - 1, (c.y + hh) >> 4);
      const vw = vx1 - vx0 + 1, nv = vw * (vy1 - vy0 + 1);
      for (let k = 0; k < nv; k++) {
        const q = (visRoll + k) % nv, cc = (vy0 + ((q / vw) | 0)) * CW + vx0 + (q % vw);
        if ((k & 3) === (frameN & 3) && (under ? Wd.uawake[cc] || true : animated[cc])) { paintAt(cc, under); painted++; }
      }
      for (let k = 0; k < 10; k++) { paintAt(roll, under); roll = (roll + 1) % NC; }
    }
    upload(under, painted > NC / 2);
    R.stats.painted = painted;
  }

  // ------------------------------------------------------------ decoration layer
  // Trees, bushes, rocks, flowers and cacti, baked per 16x16 chunk at k sprite pixels per cell
  // (k = 3 or 4 so they stay crisp at integer zooms) and rebuilt only when the chunk changes.
  const deco = new Array(NC).fill(null), decoSig = new Int32Array(NC), decoDirty = new Uint8Array(NC).fill(1);
  let decoK = 4, decoWarm = true;
  const DECO = {
    4: {
      broad: ['..LLg..', '.LLgggg', 'LLggggG', 'LgggGGG', '.ggGGG.', '..GGG..', '...t...', '...T...'],
      pine: ['...g...', '..Lgg..', '..LgG..', '.LggGG.', '..LgG..', '.LggGG.', 'LggggGG', '...T...', '...T...'],
      jungle: ['.LLggg.', 'LLgggGG', 'LgggGGG', 'ggGgGGG', '.gGGGG.', '..tTt..', '...T...'],
      dead: ['.t...t.', '..t.t..', 't..t..t', '.t.t.t.', '..tTt..', '...T...', '...T...'],
      bush: ['.LLg.', 'LgggG', '.gGG.'],
      tuft: ['L.L', 'gLg'],
      flower: ['.f.', 'fyf', '.g.'],
      rock: ['.hh.', 'hrrR', 'rrRR'],
      cactus: ['.c..', '.c.c', 'cc.c', '.ccc', '.c..'],
      thorn: ['p.p', '.p.', 'ppp'],
      reed: ['t.t', 't.t', 'gtg'],
    },
    3: {
      broad: ['.LLg.', 'LLggG', 'LggGG', '.gGG.', '..t..'],
      pine: ['..g..', '.Lgg.', '.LgG.', 'LggGG', '..T..'],
      jungle: ['.LLg.', 'LggGG', 'gGgGG', '.GGG.', '..T..'],
      dead: ['t...t', '.t.t.', '..t..', '..T..'],
      bush: ['LgG', 'gGG'],
      tuft: ['L.L'],
      flower: ['f', 'g'],
      rock: ['hr', 'rR'],
      cactus: ['.c', 'cc', '.c'],
      thorn: ['p.p', '.p.'],
      reed: ['t.t', 'g.g'],
    },
  };
  const TRUNK = { t: [124, 88, 56], T: [86, 58, 36] };
  const DPAL = {
    spring: { L: [160, 216, 106], g: [100, 174, 72], G: [54, 124, 54], ...TRUNK },
    summer: { L: [126, 200, 84], g: [72, 154, 62], G: [38, 104, 48], ...TRUNK },
    autumn: { L: [252, 188, 76], g: [226, 126, 50], G: [160, 74, 38], ...TRUNK },
    pine: { L: [106, 172, 118], g: [56, 124, 86], G: [30, 82, 60], ...TRUNK },
    snowpine: { L: [242, 248, 255], g: [62, 122, 90], G: [32, 80, 60], ...TRUNK },
    jungle: { L: [118, 208, 94], g: [42, 154, 74], G: [20, 100, 56], ...TRUNK },
    dead: { t: [112, 86, 62], T: [80, 60, 44] },
    tuft: { L: [150, 212, 110], g: [92, 162, 72] },
    tuftDry: { L: [214, 194, 112], g: [170, 150, 84] },
    rock: { h: [200, 194, 184], r: [152, 144, 136], R: [106, 100, 98] },
    snowrock: { h: [244, 248, 255], r: [196, 206, 222], R: [120, 116, 120] },
    basalt: { h: [110, 104, 114], r: [70, 64, 74], R: [44, 40, 48] },
    cactus: { c: [96, 176, 96], C: [60, 124, 66] },
    thorn: { p: [176, 92, 210] },
    reed: { t: [156, 176, 96], g: [94, 146, 74] },
  };
  const PETALS = [[244, 92, 116], [252, 224, 92], [184, 124, 244], [252, 252, 252], [255, 152, 64]];
  const dsCache = new Map();
  function decoSprite(k, name, palKey, pal) {
    const key = k + name + palKey;
    let sp = dsCache.get(key);
    if (sp) return sp;
    const rows = DECO[k][name], w0 = rows.reduce((m, r) => Math.max(m, r.length), 0), h0 = rows.length;
    const w = w0 + 2, h = h0 + 2, px = new Uint32Array(w * h);
    let darkest = 255 * 3, oc = [20, 20, 20];
    for (const ch of Object.keys(pal)) { const c = pal[ch]; if (c[0] + c[1] + c[2] < darkest) { darkest = c[0] + c[1] + c[2]; oc = c; } }
    const outline = pack((oc[0] * 0.45) | 0, (oc[1] * 0.45) | 0, (oc[2] * 0.5) | 0);
    for (let y = 0; y < h0; y++) for (let x = 0; x < rows[y].length; x++) { const c = pal[rows[y][x]]; if (c) px[(y + 1) * w + x + 1] = pack(c[0], c[1], c[2]); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (px[j] && px[j] !== outline) continue;
      if ((x > 0 && px[j - 1] && px[j - 1] !== outline) || (x < w - 1 && px[j + 1] && px[j + 1] !== outline) || (y > 0 && px[j - w] && px[j - w] !== outline) || (y < h - 1 && px[j + w] && px[j + w] !== outline)) px[j] = outline;
    }
    sp = { w, h, px };
    dsCache.set(key, sp);
    return sp;
  }
  function hash(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const SHADOW = pack(8, 18, 16, 64);
  const scratch = {};
  function buildDeco(c, k) {
    const cx0 = (c % CW) << 4, cy0 = ((c / CW) | 0) << 4;
    const bw = 18 * k, bh = 19 * k; // one cell of padding left and right, three on top
    if (!scratch[k]) scratch[k] = new Uint32Array(bw * bh);
    const buf = scratch[k];
    buf.fill(0);
    let n = 0;
    const leaf = season === 0 ? 'spring' : season === 2 ? 'autumn' : 'summer';
    const far = k === 3; // the zoomed-out set is sparser so the land reads as land, not speckle
    for (let y = cy0; y < cy0 + 16; y++) for (let x = cx0; x < cx0 + 16; x++) {
      const i = y * W + x;
      if (Wd.bgrid[i] || Wd.fire[i] || Wd.fl[i] > 0.004) continue;
      const h = hash(x, y), v = Wd.veg[i], s = Wd.soil[i], T = Wd.tbase[i], snow = Wd.snow[i] > 120;
      let name = null, pk = null, pal = null;
      const tree = () => {
        if (snow || T < 0.3) { name = 'pine'; pk = snow || (season === 3 && T < 0.4) ? 'snowpine' : 'pine'; }
        else if (T > 0.68) { name = 'jungle'; pk = 'jungle'; }
        else if (season === 3 && T < 0.48) { name = 'dead'; pk = 'dead'; }
        else { name = 'broad'; pk = leaf; }
      };
      if (s === SO.DIRT || s === SO.HOLY) {
        if (v >= 165) { if (far ? (h & 3) === 0 : (h & 3) !== 0) tree(); else if (!far && (h & 12) === 0) { name = 'bush'; pk = leaf; } }
        else if (v >= 110) { if (h % (far ? 17 : 9) === 0) tree(); else if (!far && h % 5 === 0) { name = 'bush'; pk = leaf; } }
        else if (v >= 60 && !far) {
          if (h % 6 === 0) { name = 'tuft'; pk = season === 2 || T > 0.62 ? 'tuftDry' : 'tuft'; }
          else if (season <= 1 && h % 17 === 0) { name = 'flower'; pk = 'f' + (h >>> 8) % PETALS.length; pal = { f: PETALS[(h >>> 8) % PETALS.length], y: [255, 232, 120], g: [72, 150, 60] }; }
        }
        if (!name && v > 40 && h % 4 === 0 && x > 0 && x < W - 1 && y > 0 && y < H - 1 && (Wd.fl[i - 1] > 0.01 || Wd.fl[i + 1] > 0.01 || Wd.fl[i - W] > 0.01 || Wd.fl[i + W] > 0.01)) { name = 'reed'; pk = 'reed'; }
        if (s === SO.HOLY && !name && h % 5 === 0) { name = 'flower'; pk = 'holy'; pal = { f: [255, 236, 140], y: [255, 255, 220], g: [150, 170, 70] }; }
      } else if (s === SO.ROCK) { if (h % (far ? 41 : 19) === 0) { name = 'rock'; pk = snow ? 'snowrock' : 'rock'; } else if (v > 60 && h % 9 === 0) tree(); }
      else if (s === SO.SAND) {
        if (T > 0.55 && Wd.elev[i] > SEA + 0.02 && h % 29 === 0) { name = 'cactus'; pk = 'cactus'; }
        else if (v > 20 && h % 13 === 0) { name = 'bush'; pk = 'tuftDry'; pal = { L: [196, 182, 104], g: [150, 136, 80], G: [110, 100, 64] }; }
      } else if (s === SO.ASH) { if (h % 11 === 0) { name = 'dead'; pk = 'dead'; } }
      else if (s === SO.BASALT) { if (h % 15 === 0) { name = 'rock'; pk = 'basalt'; } }
      else if (s === SO.BLIGHT) { if (h % 6 === 0) { name = 'thorn'; pk = 'thorn'; } }
      if (!name) continue;
      const sp = decoSprite(k, name, pk, pal || DPAL[pk]);
      const bx = (x - cx0 + 1) * k + (k >> 1) + ((h >>> 4) % 3) - 1, by = (y - cy0 + 3) * k + k - 1 + ((h >>> 6) & 1);
      const px0 = bx - (sp.w >> 1), py0 = by - sp.h + 1;
      if (name !== 'tuft' && name !== 'flower' && name !== 'reed') {
        // soft contact shadow, cast down and to the right
        const sw = Math.max(2, sp.w - 3);
        for (let yy = 0; yy < (k >> 1); yy++) for (let xx = 0; xx < sw; xx++) {
          const tx = px0 + 2 + xx, ty = by + yy;
          if (tx >= 0 && tx < bw && ty >= 0 && ty < bh && !buf[ty * bw + tx]) buf[ty * bw + tx] = SHADOW;
        }
      }
      for (let yy = 0; yy < sp.h; yy++) {
        const ty = py0 + yy; if (ty < 0 || ty >= bh) continue;
        for (let xx = 0; xx < sp.w; xx++) {
          const tx = px0 + xx; if (tx < 0 || tx >= bw) continue;
          const val = sp.px[yy * sp.w + xx];
          if (val) buf[ty * bw + tx] = val;
        }
      }
      n++;
    }
    if (!n) { deco[c] = null; return; }
    let cv2 = deco[c];
    if (!cv2 || cv2.width !== bw) { cv2 = mk(bw, bh); deco[c] = cv2; }
    cv2._k = k;
    const x2 = cv2.getContext('2d'), img = x2.createImageData(bw, bh);
    new Uint32Array(img.data.buffer).set(buf);
    x2.putImageData(img, 0, 0);
  }
  function drawDeco(ox, oy, z, vx0, vy0, vx1, vy1) {
    if (z < 2.9 || R.view === 0) return;
    const k = Math.round(z) % 3 === 0 ? 3 : 4;
    if (k !== decoK) { decoK = k; decoDirty.fill(1); }
    const cx0 = Math.max(0, Math.floor(vx0 / 16)), cx1 = Math.min(CW - 1, Math.floor(vx1 / 16));
    const cy0 = Math.max(0, Math.floor(vy0 / 16)), cy1 = Math.min(AG.CH - 1, Math.floor((vy1 + 3) / 16));
    let budget = decoWarm ? 1e9 : 28;
    decoWarm = false;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * CW + cx;
      if (decoDirty[c] && budget > 0) { buildDeco(c, k); decoDirty[c] = 0; budget--; }
      const d = deco[c];
      if (!d) continue;
      const sc = z / d._k;
      ctx.drawImage(d, Math.round(ox + (cx * 16 - 1) * z), Math.round(oy + (cy * 16 - 3) * z), Math.round(d.width * sc), Math.round(d.height * sc));
    }
  }

  // ------------------------------------------------------------ overlays
  // Map overlays. Per-cell ones read the land (plates, rock, resources, temperature, strain);
  // per-community ones colour territories (realms, faiths, languages, eras, genetics).
  const ROCK_C = [[214, 160, 150], [70, 70, 90], [214, 196, 140], [150, 110, 160], [200, 80, 60], [120, 170, 110]];
  const ERA_C = [[170, 150, 120], [140, 190, 120], [230, 200, 90], [210, 130, 70], [220, 170, 60], [140, 150, 170], [240, 240, 255]];
  function updateBorders() {
    bpix.fill(0);
    const mode = R.overlay;
    if (mode === 'none') { bctx.putImageData(bimg, 0, 0); return; }
    const owner = Wd.owner, Geo = AG.Geo;
    if (mode === 'heat') {
      for (let i = 0; i < W * H; i += 1) {
        const T = Wd.T(i), t = AG.clamp((T + 0.1) / 1.1, 0, 1);
        bpix[i] = pack((t * 255) | 0, (80 + Math.sin(t * Math.PI) * 120) | 0, ((1 - t) * 255) | 0, 110);
      }
      bctx.putImageData(bimg, 0, 0); return;
    }
    if (mode === 'rock' || mode === 'resources') {
      for (let i = 0; i < W * H; i++) {
        if (Wd.elev[i] < SEA) continue;
        if (mode === 'rock') { const c = ROCK_C[Wd.rock[i]] || ROCK_C[0]; bpix[i] = pack(c[0], c[1], c[2], 120); continue; }
        if (Wd.cereal[i] > 60) bpix[i] = pack(240, 200, 70, Math.min(150, Wd.cereal[i] >> 1));
        const r = Wd.res[i];
        if (r) { const hex = AG.RES_COLORS[r], v = parseInt(hex.slice(1), 16); bpix[i] = pack(v >> 16, (v >> 8) & 255, v & 255, 255); }
      }
      // make deposits visible at a distance: grow each one into a small diamond
      if (mode === 'resources') { const copy = bpix.slice(); for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (!Wd.res[i]) continue; for (const o of [-1, 1, -W, W]) if (!Wd.res[i + o]) bpix[i + o] = copy[i]; } }
      bctx.putImageData(bimg, 0, 0); return;
    }
    const nc = Civ.cities.length, key = new Int32Array(nc), col = new Uint32Array(nc), fill = new Uint32Array(nc);
    for (let k = 0; k < nc; k++) {
      const c = Civ.cities[k];
      let rc = null, kk = -1;
      if (mode === 'faith') { kk = c.religion; rc = c.religion >= 0 ? Civ.religions[c.religion].color : null; }
      else if (mode === 'language') { const L = AG.Lang.get(c.lang); kk = c.lang; if (L) { const fam = AG.Lang.get(L.family); rc = AG.hsl((L.family * 97 + 30) % 360 + (L.id - L.family) * 9, 0.6, 0.45 + ((L.id * 37) % 5) * 0.06); } }
      else if (mode === 'era') { kk = c.era; rc = ERA_C[c.era]; }
      else if (mode === 'genes') { // the people's mean skin tone (pigment gene)
        let h = 0, n = 0; for (const id of c.members) { const P = AG.People.get(id); if (P) { h += AG.Life.express(P.gen, 0, AG.Life.L.HUE); n++; } }
        h = n ? h / n : 128; kk = (h / 12) | 0; rc = skinOf(h);
      } else { kk = c.kd; rc = Civ.kingdoms[c.kd] ? Civ.kingdoms[c.kd].color : [150, 150, 150]; }
      key[k] = kk;
      col[k] = rc ? pack(rc[0], rc[1], rc[2], 235) : 0; fill[k] = rc ? pack(rc[0], rc[1], rc[2], mode === 'realms' ? 40 : 90) : 0;
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
  // Box blur of the part [x0,x1) x [y0,y1) of a w-wide field (edges clamp to that part).
  function blur(a, w, x0, y0, x1, y1, r) {
    const X = x1 - 1, Y = y1 - 1;
    for (let y = y0; y < y1; y++) {
      let s = 0; const row = y * w;
      for (let x = x0 - r; x <= x0 + r; x++) s += a[row + AG.clamp(x, x0, X)];
      for (let x = x0; x < x1; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(X, x + r + 1)] - a[row + Math.max(x0, x - r)];
      }
    }
    for (let x = x0; x < x1; x++) {
      let s = 0;
      for (let y = y0 - r; y <= y0 + r; y++) s += tmp[AG.clamp(y, y0, Y) * w + x];
      for (let y = y0; y < y1; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(Y, y + r + 1) * w + x] - tmp[Math.max(y0, y - r) * w + x];
      }
    }
  }
  // Light and gas are worked out only for the part of the map on screen (plus a margin wider than
  // any glow reaches); the rest is brought up to date when the camera gets there.
  const lwin = { x0: 0, y0: 0, x1: 0, y1: 0 }, gwin = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function viewWin(m) { // the view in half-cells (the grid of the light and gas layers), m cells of margin
    const c = R.cam, hw = cw / 2 / c.z, hh = ch / 2 / c.z;
    return { x0: Math.max(0, Math.floor((c.x - hw) / 2) - m), y0: Math.max(0, Math.floor((c.y - hh) / 2) - m), x1: Math.min(LW, Math.ceil((c.x + hw) / 2) + m), y1: Math.min(LH, Math.ceil((c.y + hh) / 2) + m) };
  }
  const covers = (a, b) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;
  let lightOn = true, glowOn = true, gasOn = true, cloudOn = true;
  function updateLight() {
    const under = R.view === 0, day = Sky.daylight();
    if (!under && AG.mode !== 'watch') { lightOn = glowOn = false; lwin.x1 = 0; return; } // deep time and history are drawn in plain daylight
    const w = viewWin(14), x0 = w.x0, y0 = w.y0, x1 = w.x1, y1 = w.y1;
    if (x1 <= x0 || y1 <= y0) return;
    const add = (wx, wy, v) => { const lx = (wx / 2) | 0, ly = (wy / 2) | 0; if (lx >= x0 && lx < x1 && ly >= y0 && ly < y1) lum[ly * LW + lx] += v; };
    for (let ly = y0; ly < y1; ly++) {
      lum.fill(0, ly * LW + x0, ly * LW + x1);
      for (let lx = x0; lx < x1; lx++) {
        const i = (ly * 2) * W + lx * 2, j = ly * LW + lx;
        if (under) {
          if (Wd.ugF[i] && Wd.ugT[i] === UF.MAGMA) lum[j] += 1.3;
          else { const u = Wd.ug[i]; if (u === UG.CRYSTAL) lum[j] += 0.8; else if (u === UG.FUNGUS) lum[j] += 0.45; else if (u === UG.TUNNEL) lum[j] += 0.14; }
        } else {
          if (Wd.fire[i]) lum[j] += 1.5;
          else if (Wd.fl[i] > 0.003 && Wd.ft[i] === FT.LAVA) lum[j] += 1.1;
        }
      }
    }
    if (under) {
      for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.layer[i] === 0) add(U.x[i], U.y[i], 1.6);
    } else {
      for (const c of Civ.cities) {
        if (!c.alive) continue;
        for (const bid of c.buildings) {
          const b = Civ.buildings[bid];
          if (!b || b.prog < 1 || b.type === BT.WALL || b.type === BT.FARM) continue;
          add(b.cx, b.cy, b.type === BT.KEEP || b.type === BT.TEMPLE ? 2.2 : 1.1);
        }
      }
      for (let p = 0; p < Proj.n; p++) if (Proj.kind[p] === 2) add(Proj.x[p], Proj.y[p], 2);
      for (const s of Sky.strikes) add(s.x, s.y, 8);
      for (let k = 0; k < Wd.vents.length; k++) { const v = Wd.vents[k]; add(v.x, v.y, 4); }
    }
    blur(lum, LW, x0, y0, x1, y1, 2); blur(lum, LW, x0, y0, x1, y1, 2);
    const dark = under ? 0.86 : (1 - day) * (AG.speed >= 4 && !AG.paused ? 0.45 : 0.8); // gentler nights when time races
    const tr = under ? 4 : 8, tg = under ? 3 : 12, tb = under ? 10 : 38;
    const glowK = under ? 0.6 : 0.15 + (1 - day) * 0.5;
    let la = 0, ga2 = 0;
    for (let ly = y0; ly < y1; ly++) for (let j = ly * LW + x0, e = ly * LW + x1; j < e; j++) {
      const L = lum[j] * 1.6;
      const a = (dark * (1 - (L > 1 ? 1 : L)) * 255) | 0;
      lpix[j] = pack(tr, tg, tb, a); if (a > la) la = a;
      const ga = (Math.min(1, lum[j]) * glowK * 200) | 0;
      gpix[j] = pack(255, 150, 70, ga); if (ga > ga2) ga2 = ga;
    }
    // layers with nothing in them are not uploaded or drawn
    lightOn = la > 2; glowOn = ga2 > 2;
    if (lightOn) lctx.putImageData(limg, 0, 0, x0, y0, x1 - x0, y1 - y0);
    if (glowOn) gctx.putImageData(gimg, 0, 0, x0, y0, x1 - x0, y1 - y0);
    lwin.x0 = x0; lwin.y0 = y0; lwin.x1 = x1; lwin.y1 = y1;
  }
  const GASCOL = [[0, 0, 0], [236, 240, 244], [74, 70, 68], [140, 205, 70]];
  function updateGas() {
    let any = false;
    const w = viewWin(8), x0 = w.x0, y0 = w.y0, x1 = w.x1, y1 = w.y1;
    if (x1 <= x0 || y1 <= y0) return;
    for (let ly = y0; ly < y1; ly++) for (let lx = x0; lx < x1; lx++) {
      const i = ly * 2 * W + lx * 2, g = Math.max(Wd.gas[i], Wd.gas[i + 1], Wd.gas[i + W], Wd.gas[i + W + 1]);
      if (g < 0.01) { gspix[ly * LW + lx] = 0; continue; }
      any = true;
      const c = GASCOL[Wd.gt[i] || Wd.gt[i + 1] || Wd.gt[i + W] || 2];
      gspix[ly * LW + lx] = pack(c[0], c[1], c[2], Math.min(210, (g * 420) | 0));
    }
    if (any || gasOn) gsctx.putImageData(gsimg, 0, 0, x0, y0, x1 - x0, y1 - y0);
    gasOn = any;
    gwin.x0 = x0; gwin.y0 = y0; gwin.x1 = x1; gwin.y1 = y1;
  }
  function updateClouds() {
    if (AG.mode === 'deep') { cloudOn = false; return; } // no weather over millions of years
    const night = 1 - Sky.daylight();
    let any = false;
    for (let j = 0; j < cpix.length; j++) {
      const c = Sky.cloud[j], dk = Sky.dark[j];
      if (c < 0.02) { cpix[j] = 0; shpix[j] = 0; continue; }
      any = true;
      const v = 250 - dk * 160 - night * 150;
      cpix[j] = pack(Math.max(20, v) | 0, Math.max(22, v + 2) | 0, Math.max(30, v + 8) | 0, (c * 225) | 0);
      shpix[j] = pack(0, 0, 10, (c * 110) | 0);
    }
    if (any || cloudOn) { cctx.putImageData(cimg, 0, 0); shctx.putImageData(shimg, 0, 0); }
    cloudOn = any;
  }
  const WILD = SPECIES.map((d) => (d.kind === 'animal' || d.kind === 'ambient' ? 1 : 0));
  let wildDots = false;
  function updateDots(alpha, wildOnly) {
    dpix.fill(0);
    const under = R.view === 0;
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || (wildOnly && !WILD[U.sp[i]])) continue;
      const L = U.layer[i];
      if (under ? L !== 0 : L === 0) continue;
      const x = (U.px[i] + (U.x[i] - U.px[i]) * alpha) | 0, y = (U.py[i] + (U.y[i] - U.py[i]) * alpha) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = SPECIES[U.sp[i]];
      let c;
      if (d.kind === 'civ' || d.kind === 'vehicle') { const k = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]].color : [200, 200, 200]; c = pack(Math.min(255, k[0] + 40), Math.min(255, k[1] + 40), Math.min(255, k[2] + 40)); }
      else if (d.kind === 'ambient') c = pack(30, 30, 36);
      else { const spc = U.sid[i] >= 0 ? AG.Life.species[U.sid[i]] : null, fc = spc ? spc.color : d.fur || [150, 150, 150]; c = pack(fc[0], fc[1], fc[2]); }
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
    mammoth: [['..FFFF...', '.FfffffF.', 'Ffffffffm', 'Ffffffff.', '.fffffffm', '.ff..ff..', '.ff..ff..'], ['..FFFF...', '.FfffffF.', 'Ffffffffm', 'Ffffffff.', '.fffffffm', '.ff...ff.', 'ff....ff.']],
    bear: [['.ff.....', 'ffffffF.', 'fffffffF', '.ffffff.', '.f.f..f.'], ['.ff.....', 'ffffffF.', 'fffffffF', '.ffffff.', 'f..f.f..']],
    ape: [['.FF.', 'Fsf.', 'ffff', 'f.ff', 'f..f'], ['.FF.', 'Fsf.', 'ffff', 'ff.f', '.ff.']],
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
    [BT.GRANARY]: ['...cc...', '..cccc..', '.cccccc.', 'cccccccc', '.eeeeee.', '.eeeeee.', '.eeyeee.', '.eeeeee.', '..eeee..'],
    [BT.TENT]: ['...W...', '..cWc..', '..ccc..', '.ccccc.', '.cc.cc.', 'ccc.ccc', 'cc...cc'],
    [BT.HEARTH]: ['..o..', '.oyo.', 'roooR', '.r.r.'],
    [BT.HUT]: ['...cc...', '..cccc..', '.cccccc.', 'cccccccc', '.wwwwww.', '.wwbbww.', '.wwbbww.'],
    [BT.PEN]: ['W.W.W.W.W.W.', 'wwwwwwwwwwww', 'W..........W', 'w..........w', 'W..........W', 'wwwwwwwwwwww', 'W.W.W.W.W.W.'],
    [BT.MEGALITH]: ['rrrrr..rrrrr', 'rR.Rr..rR.Rr', 'rR.Rr..rR.Rr', 'rR.Rr..rR.Rr', '..rrrrrrr...', '..rR.r.Rr...', '..rR.r.Rr...', '..rR.r.Rr...'],
    [BT.SHRINE]: ['..y..', '.yyy.', '.rrr.', '.rRr.', '.rRr.', 'rrrrr'],
    [BT.HALL]: ['.....WW.....', '...KKKKKK...', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', '.wwwwwwwwww.', '.wyw.ww.wyw.', '.www.bb.www.', '.www.bb.www.'],
    [BT.TEMPLE]: ['.....yy.....', '....yyyy....', '...yyyyyy...', '..yyyyyyyy..', '.eeeeeeeeee.', 'eeeeeeeeeeee', '.e.eR.Re.e..', '.e.eR.Re.e..', '.e.eR.Re.e..', '.e.eRbRe.e..', '.e.eRbRe.e..', 'eeeeeeeeeeee', 'rrrrrrrrrrrr', 'RRRRRRRRRRRR'],
    [BT.MARKET]: ['kekekekekeke', 'kekekekekeke', '.w..w..w..w.', '.w..w..w..w.', 'kekeke.kekek', 'kekeke.kekek', 'wgow.w.wyvw.', 'wwww.w.wwww.', 'w..w...w..w.', 'w..w...w..w.'],
    [BT.MINE]: ['..rrrr..', '.rrrrrr.', 'rrwwwwrr', 'rwbbbbwr', 'rwbbbbwr', 'rwbbbbwr', '.mmmmmm.', 'm.m..m.m'],
    [BT.TOWER]: ['....k...', '....kk..', '....W...', 'r.r.Wr.r', 'rrrrrrrr', '.rRRRRr.', '.rRrRRr.', '.rRRRRr.', '.rRbRRr.', '.rRRRRr.', '.rRRRRr.', '.rRRbRr.', '.rRRRRr.', '.rRRRRr.', '.rRRRRr.', '.rRbbRr.', 'rrRbbRrr', 'rrrrrrrr'],
    [BT.WALL]: ['r.r.', 'rrrr', 'rRrr', 'rrRr', 'rRrr', 'rrrr'],
    [BT.DOCK]: ['WwwwwwwW', 'wwwwwwww', 'WwwwwwwW', 'wwwwwwww', 'WwwwwwwW', 'wwwwwwww', 'W......W', 'W......W'],
    [BT.WORKSHOP]: ['....KKKK....', '...KKKKKK...', '..KKKKKKKK..', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', '.wwwwwwwwww.', '.w......W.w.', '.w.....W..w.', '.w..wwwwwww.', '.w.wWwwwWww.', '.wwwwwwwwww.'],
  };
  const cache = new Map();
  const OUTLINE = pack(22, 18, 28);
  function makeSprite(rows, pal, flip, noOutline) {
    const w0 = rows.reduce((m, r) => Math.max(m, r.length), 0), h0 = rows.length, o = noOutline ? 0 : 1;
    const w = w0 + 2 * o, h = h0 + 2 * o;
    const c = mk(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), px = new Uint32Array(img.data.buffer);
    for (let y = 0; y < h0; y++) for (let k = 0; k < rows[y].length; k++) {
      const col = pal[rows[y][k]];
      if (!col) continue;
      px[(y + o) * w + (flip ? w0 - 1 - k : k) + o] = pack(AG.clamp(col[0] | 0, 0, 255), AG.clamp(col[1] | 0, 0, 255), AG.clamp(col[2] | 0, 0, 255));
    }
    if (o) for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) {
      const j = y * w + k;
      if (px[j]) continue;
      const n = (k > 0 && px[j - 1] && px[j - 1] !== OUTLINE) || (k < w - 1 && px[j + 1] && px[j + 1] !== OUTLINE) || (y > 0 && px[j - w] && px[j - w] !== OUTLINE) || (y < h - 1 && px[j + w] && px[j + w] !== OUTLINE);
      if (n) px[j] = OUTLINE;
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
  // skin from the pigment gene: pale (albino) to deep brown
  function skinOf(hue) {
    if (hue < 12) return [240, 220, 206];
    const t = AG.clamp((hue - 40) / 190, 0, 1);
    return [232 - t * 128, 192 - t * 122, 160 - t * 110];
  }
  function unitSprite(i, frame) {
    const sp = U.sp[i], d = SPECIES[sp], kd = U.kd[i], flip = U.fx[i] < 0;
    if (d.kind === 'civ') {
      const f = U.flags[i], job = U.job[i];
      let role = 'person';
      if (f & FL.KING) role = 'king';
      else if (job === J.SOLDIER || U.sq[i] >= 0) role = 'soldier';
      else if (job === J.PRIEST) role = 'priest';
      else if (job === J.CHILD) role = 'child';
      const hue = U.hue[i] >> 4, elder = job === J.ELDER ? 1 : 0, c = Civ.cities[U.city[i]], era = c ? Math.min(c.era, 4) : 0;
      const key = `c|${role}|${kd}|${hue}|${elder}|${era}|${frame}|${flip ? 1 : 0}`;
      return getSprite(key, () => {
        const kc = kd >= 0 && Civ.kingdoms[kd] ? Civ.kingdoms[kd].color : [150, 150, 150];
        const cloth = era <= 1 ? [150, 112, 74] : era === 2 ? AG.mixc([196, 180, 150], kc, 0.4) : kc; // hides, then linen, then dyed cloth
        const skin = skinOf(hue * 16 + 8), hair = hue < 1 ? [236, 230, 220] : AG.mixc([176, 134, 72], [34, 24, 18], AG.clamp(hue / 9, 0, 1));
        const pal = Object.assign({}, BASEPAL, { s: skin, h: elder ? [214, 214, 220] : hair, k: cloth, K: dark(cloth), m: era >= 4 ? [200, 160, 90] : era >= 3 ? [200, 120, 70] : [150, 140, 130] });
        return makeSprite(S[role][frame], pal, flip);
      });
    }
    const sid = U.sid[i], spc = sid >= 0 ? AG.Life.species[sid] : null;
    let name = d.key === 'grazer' ? 'deer' : d.key === 'predator' ? 'wolf' : d.key;
    if (spc && sp === SP.GRAZER && spc.mean[0] > 200 && spc.mean[10] > 150) name = 'mammoth';
    if (spc && sp === SP.PREDATOR && spc.mean[0] > 185) name = 'bear';
    const extra = sp === SP.CART ? U.carry[i] : 0;
    const key = `a${sp}|${sid}|${name}|${kd}|${extra}|${frame}|${flip ? 1 : 0}`;
    return getSprite(key, () => {
      const kc = kd >= 0 && Civ.kingdoms[kd] ? Civ.kingdoms[kd].color : [170, 170, 170];
      const fur = spc ? spc.color : d.fur || [150, 150, 150];
      const pal = Object.assign({}, BASEPAL, { f: fur, F: dark(fur), k: kc, K: dark(kc), c: CARGO[extra] || CARGO[2], s: [200, 160, 130], m: [240, 232, 210] });
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
    const k = Civ.kingdoms[b.kd], kc = k ? k.color : [150, 150, 150], early = (b.era || 0) < 4 ? 1 : 0;
    return getSprite(`b${b.type}|${b.kd}|${early}`, () => {
      const pal = Object.assign({}, BASEPAL, { k: kc, K: dark(kc), c: [196, 162, 108] });
      if (early && b.type === BT.HOUSE) Object.assign(pal, { w: [188, 150, 104], W: [140, 108, 72], k: [196, 170, 96], K: [150, 124, 70] }); // mud brick and thatch
      if (b.type === BT.HUT || b.type === BT.TENT) pal.c = b.type === BT.TENT ? [184, 146, 102] : [196, 170, 96];
      return makeSprite(B_SPR[b.type], pal, false);
    });
  }
  // dark silhouette of a sprite, skewed onto the ground as a sun-cast shadow
  const silCache = new Map();
  function silhouette(spr) {
    let c = silCache.get(spr);
    if (!c) {
      c = mk(spr.width, spr.height);
      const x = c.getContext('2d');
      x.drawImage(spr, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0a1020'; x.fillRect(0, 0, c.width, c.height);
      silCache.set(spr, c);
    }
    return c;
  }
  const unitShadow = (() => {
    const c = mk(7, 3), x = c.getContext('2d');
    x.fillStyle = 'rgba(8,12,20,0.38)'; x.fillRect(1, 0, 5, 3); x.fillRect(0, 1, 7, 1);
    return c;
  })();
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
    const want = Math.min(DROPS, vis.length ? Math.round((260 + vis.length * 160) * AG.clamp(z / 6, 0.35, 1)) : 0);
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
    ctx.strokeStyle = `rgba(190,215,255,${AG.clamp(0.12 + z * 0.06, 0.2, 0.55).toFixed(2)})`;
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
      const s = Math.max(1, Math.round(z / 8));
      ctx.fillRect(Math.round(ox + dx[k] * z), Math.round(oy + (dy[k] - dh[k] * 0.8) * z), s, dk[k] === 1 ? s : s * 2);
    }
  }

  // ------------------------------------------------------------ main frame
  // Draw only the part of a world-sized layer that is on screen. A layer can be at any resolution
  // (cells, half cells, cloud cells); one layer pixel of margin keeps smoothed edges the same.
  function blit(img, ox, oy, z) {
    const kx = img.width / W, ky = img.height / H;
    const x0 = Math.max(0, Math.floor((-ox / z) * kx) - 1), y0 = Math.max(0, Math.floor((-oy / z) * ky) - 1);
    const x1 = Math.min(img.width, Math.ceil(((cw - ox) / z) * kx) + 1), y1 = Math.min(img.height, Math.ceil(((ch - oy) / z) * ky) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, ox + (x0 / kx) * z, oy + (y0 / ky) * z, ((x1 - x0) / kx) * z, ((y1 - y0) / ky) * z);
  }
  // A paused world is a still picture. Everything that can change what is on screen goes into one
  // signature; while it stays the same nothing is drawn (after a few frames for the layers to
  // settle), apart from one safety frame every half second.
  let sigLast = '', sigSame = 0, miniDue = false;
  function stillPicture(V3) {
    const c = R.cam, h = R.hover, sel = AG.UI && AG.UI.sel, d = R.view === 0 ? Wd.udirty : Wd.dirty;
    let dirty = 0; for (let k = 0; k < NC; k++) dirty += d[k];
    const busy = God.meteors.length > 0 || God.impacts.length > 0 || AG.FX.n > 0 || God.down || God.shake > 0 || God.flash() > 0 || mo.on || mo.ready || dirty > 0 || R.bordersDirty;
    const sig = busy ? '' : [c.x.toFixed(3), c.y.toFixed(3), c.z.toFixed(4), c.zt, R.view, R.overlay, R.showTrade ? 1 : 0, R.follow, h.on ? h.x.toFixed(1) + ',' + h.y.toFixed(1) : '',
      God.tool, God.brush.r, God.acts | 0, God.possessed, sel ? sel.type + sel.id : '', cw, ch, R.perf.scale, R.perf.cosmetics ? 1 : 0, R.perf.animate ? 1 : 0,
      lastView, AG.tick, AG.mode, AG.Geo.stepN, AG.Geo.year, U.count, V3 && V3.sig ? V3.sig() : ''].join('|');
    if (busy || sig !== sigLast) { sigLast = sig; sigSame = 0; return false; }
    sigSame++;
    if (sigSame === 6 || sigSame % 30 === 0) { miniDue = true; return false; } // the last settling frame, and the safety frames
    return sigSame > 6;
  }
  R.invalidate = function () { sigLast = ''; sigSame = 0; };
  R.frame = function (dt, alpha, still) {
    const t0 = performance.now();
    if (!still) tm += dt; // (paused: water, flags and glows hold still)
    frameN++;
    const RS = R.perf.scale; ctx.setTransform(RS, 0, 0, RS, 0, 0);
    const c = R.cam;
    R.updateCamera(dt);
    const V3 = AG.View3D;
    if (V3 && V3.ok) V3.update(dt);
    if (still && stillPicture(V3)) { R.stats.ms = 0; R.stats.idle = true; return; }
    R.stats.idle = false;
    if (V3 && V3.ok && V3.active) { frame3D(dt, alpha, t0); return; }
    const z = c.z, under = R.view === 0;
    const tp = performance.now();
    updateTerrain();
    R.stats.terrainMs = performance.now() - tp;
    if (R.bordersDirty || (R.overlay === 'heat' && frameN % 20 === 0) || (AG.mode === 'deep' && frameN % 10 === 0)) { updateBorders(); R.bordersDirty = false; }
    const vis = viewWin(0); // (a jump of the camera past the margin brings the layers up to date at once)
    if (frameN % 2 === 0 || ((lightOn || glowOn) && !covers(lwin, vis))) updateLight();
    if (!under && (frameN % 3 === 0 || (gasOn && !covers(gwin, vis)))) updateGas();
    if (frameN % 4 === 0) { if (R.perf.cosmetics) updateClouds(); else cloudOn = false; }

    let ox = Math.round(cw / 2 - c.x * z), oy = Math.round(ch / 2 - c.y * z);
    if (God.shake > 0 && R.perf.shake !== false) { ox += Math.round((Math.random() - 0.5) * God.shake * 0.7); oy += Math.round((Math.random() - 0.5) * God.shake * 0.7); }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = under ? '#0b090d' : '#0e2a5a';
    ctx.fillRect(0, 0, cw, ch);
    blit(under ? underC : worldC, ox, oy, z);
    if (!under && R.overlay !== 'none') blit(borderC, ox, oy, z);

    // viewport in world cells
    const vx0 = -ox / z - 2, vy0 = -oy / z - 2, vx1 = vx0 + cw / z + 4, vy1 = vy0 + ch / z + 6;
    const s = Math.max(1, Math.round(z / 4)); // integer sprite scale keeps pixels crisp
    const td = performance.now();
    if (!under && !(AG.mode === 'deep' && z < 5) && (R.perf.cosmetics || z >= 5)) drawDeco(ox, oy, z, vx0, vy0, vx1, vy1); // deep time: the land's shape, not its trees
    R.stats.decoMs = performance.now() - td;
    if (!under && z >= 3) drawBuildings(ox, oy, z, s, vx0, vy0, vx1, vy1);
    if (!under && R.showTrade) drawRoutes(ox, oy, z);
    if (!under) drawArmies(ox, oy, z);
    // level of detail: people, monsters and vehicles get sprites from zoom 3, wildlife from
    // zoom 4; anything else (or any crowd past SPRITE_LIMIT) is one pixel per creature
    wildDots = z < R.perf.wildZ; // wild animals are dots until zoomed in (closer on slow machines)
    let sprites = z >= 3;
    if (sprites) {
      let n = 0;
      for (let i = 0; i < U.hi && sprites; i++) {
        if (!U.alive[i] || (U.layer[i] === 0) !== under || (wildDots && WILD[U.sp[i]])) continue;
        const x = U.x[i], y = U.y[i];
        if (x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1 && ++n > SPRITE_LIMIT) sprites = false;
      }
    }
    R.stats.sprites = sprites;
    if ((!sprites || wildDots) && U.count > 0) { updateDots(alpha, sprites); blit(dotsC, ox, oy, z); }
    if (sprites) drawUnits(ox, oy, z, s, alpha, vx0, vy0, vx1, vy1, under);
    else R._sky = [];
    drawProjectiles(ox, oy, z, under);
    drawParticles(ox, oy, z, under, false);
    if (!under) {
      ctx.imageSmoothingEnabled = true;
      if (gasOn) blit(gasC, ox, oy, z);
      if (cloudOn) {
        const cvis = R.view === 2 ? 1 : AG.clamp(0.9 - z / 7, 0.1, 0.6);
        const sun = Sky.sunDir();
        ctx.globalAlpha = cvis * Sky.daylight();
        blit(shadC, ox - sun.x * 7 * z, oy + 5 * z, z);
        ctx.globalAlpha = 1;
      }
    } else ctx.imageSmoothingEnabled = true;
    // light: darkness then warm glow (skipped in full daylight)
    if (lightOn) blit(lightC, ox, oy, z);
    if (glowOn) {
      ctx.globalCompositeOperation = 'lighter';
      blit(glowC, ox, oy, z);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!under && cloudOn) {
      const cvis = R.view === 2 ? 1 : AG.clamp(0.9 - z / 7, 0.1, 0.6);
      ctx.globalAlpha = cvis;
      blit(cloudC, ox, oy, z);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    if (!under && AG.mode === 'watch') { if (R.perf.cosmetics) weather(dt, ox, oy, z); drawSkyUnitsOver(ox, oy, z, alpha); } // no rain streaks while centuries or ages fly by
    drawParticles(ox, oy, z, under, true);
    if (!under) { drawDisasters(ox, oy, z); drawLightning(ox, oy, z); if (AG.mode === 'watch' && R.perf.cosmetics) godRays(); }
    if (!under && God.flash() > 0) { ctx.fillStyle = `rgba(230,236,255,${God.flash() * 0.35})`; ctx.fillRect(0, 0, cw, ch); }
    const tg = performance.now();
    grade(under);
    R.stats.gradeMs = performance.now() - tg;
    drawLabels(ox, oy, z, under);
    drawSelection(ox, oy, z, alpha);
    drawCursor(ox, oy, z);
    if (frameN % R.perf.minimapEvery === 0 || miniDue) { drawMinimap(); miniDue = false; }
    R.stats.ms = performance.now() - t0;
  };

  function grade(under) {
    if (!under && AG.mode === 'watch') {
      const f = Sky.dayFrac();
      const warm = Math.max(0, 1 - Math.abs(f - 0.28) / 0.09) + Math.max(0, 1 - Math.abs(f - 0.72) / 0.09);
      if (warm > 0.02) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(255,128,64,${(0.5 * warm).toFixed(3)})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // (the vignette is a CSS layer over the canvas: the compositor draws it for free)
  }
  function drawBuildings(ox, oy, z, s, vx0, vy0, vx1, vy1) {
    const bs = Math.max(1, z / 4), list = [];
    for (const c of Civ.cities) {
      if (!c.alive || c.x < vx0 - 30 || c.x > vx1 + 30 || c.y < vy0 - 30 || c.y > vy1 + 30) continue;
      for (const bid of c.buildings) {
        const b = Civ.buildings[bid];
        if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1 + 4) continue;
        list.push(b);
      }
    }
    list.sort((a, b) => a.y + a.h - (b.y + b.h));
    const day = Sky.daylight();
    if (day > 0.08) {
      const len = 1.25 - Math.max(0, Sky.sunHeight()) * 0.75, kx = -LX * 0.75 * len, ky = 0.42 * len;
      ctx.globalAlpha = 0.32 * day;
      for (const b of list) {
        if (b.prog < 1 || b.type === BT.FARM || b.type === BT.DOCK) continue;
        const spr = buildingSprite(b), sw = spr.width * bs, sh = spr.height * bs;
        const sx = ox + b.cx * z - sw / 2, by = oy + (b.y + b.h) * z + bs;
        { const RS = R.perf.scale; ctx.setTransform(RS, 0, -kx * RS, -ky * RS, (sx + sh * kx) * RS, (by + sh * ky) * RS); }
        ctx.drawImage(silhouette(spr), 0, 0, sw, sh);
      }
      ctx.setTransform(R.perf.scale, 0, 0, R.perf.scale, 0, 0);
      ctx.globalAlpha = 1;
    }
    for (const b of list) {
      const spr = buildingSprite(b);
      const sw = spr.width, sh = spr.height;
      const dx = Math.round(ox + b.cx * z - (sw * bs) / 2), by = Math.round(oy + (b.y + b.h) * z + bs);
      if (b.prog >= 1) ctx.drawImage(spr, dx, by - sh * bs, sw * bs, sh * bs);
      else {
        const vis = Math.max(1, Math.ceil(sh * b.prog));
        ctx.globalAlpha = 0.9;
        ctx.drawImage(spr, 0, sh - vis, sw, vis, dx, by - vis * bs, sw * bs, vis * bs);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(176,128,70,0.95)'; ctx.lineWidth = Math.max(1, bs * 0.6);
        ctx.strokeRect(dx + 2 * bs, by - sh * bs, sw * bs - 4 * bs, sh * bs);
        ctx.beginPath(); ctx.moveTo(dx + 2 * bs, by - sh * bs); ctx.lineTo(dx + sw * bs - 2 * bs, by); ctx.stroke();
      }
      if (false) {
        const hx = dx + 5 * bs, hy = by - 12 * bs, a0 = tm * 1.4 + b.id, L = 6 * bs;
        ctx.strokeStyle = '#4e342e'; ctx.lineWidth = Math.max(1.5, bs * 1.2);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { const a = a0 + (k * Math.PI) / 2; ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L); }
        ctx.stroke();
        ctx.fillStyle = '#efe6d2';
        for (let k = 0; k < 4; k++) { const a = a0 + (k * Math.PI) / 2; ctx.fillRect(hx + Math.cos(a) * L * 0.6 - bs, hy + Math.sin(a) * L * 0.6 - bs, 2 * bs, 2 * bs); }
      }
      if (b.hp < b.mhp * 0.98 && z >= 4) {
        const w = b.w * z;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ox + b.x * z, by + 1, w, 3);
        ctx.fillStyle = '#ef5350'; ctx.fillRect(ox + b.x * z, by + 1, (w * b.hp) / b.mhp, 3);
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
      if (wildDots && WILD[U.sp[i]]) continue;
      if (L === 2) { sky.push(i); continue; }
      drawUnit(i, x, y, ox, oy, z, s, 0);
    }
    R._sky = sky;
  }
  function drawUnit(i, x, y, ox, oy, z, s, lift) {
    const moving = U.st[i] === 1 || U.st[i] === 3 || (U.flags[i] & FL.POSSESSED);
    const frame = moving ? (U.anim[i] | 0) & 1 : 0;
    const spr = unitSprite(i, frame);
    const sc = U.pid[i] < 0 && U.sid[i] >= 0 ? AG.clamp(U.scale[i], 0.6, 1.7) : U.pid[i] >= 0 ? AG.clamp(U.scale[i], 0.75, 1.25) : 1;
    const sw = spr.width * s * sc, sh = spr.height * s * sc;
    const sx = Math.round(ox + x * z - sw / 2), sy = Math.round(oy + y * z - sh - lift * z);
    const f = U.flags[i];
    if (f & (FL.BLESSED | FL.CURSED | FL.POSSESSED)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = f & FL.POSSESSED ? `rgba(255,230,140,${0.35 + 0.15 * Math.sin(tm * 6)})` : f & FL.BLESSED ? 'rgba(255,220,120,0.25)' : 'rgba(170,80,220,0.3)';
      ctx.beginPath(); ctx.arc(ox + x * z, oy + y * z - sh / 2 - lift * z, Math.max(3, sh * 0.7), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!lift && z >= 4) ctx.drawImage(unitShadow, ox + x * z - 3.5 * s, oy + y * z - 2 * s, 7 * s, 3 * s);
    ctx.drawImage(spr, sx, sy, sw, sh);
    if (z >= 6) {
      if (U.carry[i] && SPECIES[U.sp[i]].kind === 'civ') { const c = CARGO[U.carry[i]]; ctx.fillStyle = AG.css(c); ctx.fillRect(sx + sw - s, sy + sh * 0.45, s * 1.5, s * 1.5); }
      if (U.dis[i]) { ctx.fillStyle = AG.DISEASES[U.dis[i] - 1].color; ctx.fillRect(ox + x * z - s * 0.5, sy - s * 2, s, s); }
      if (U.hp[i] < U.mhp[i] * 0.95 && U.st[i] === 3) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx, sy - s * 1.2, sw, s * 0.7); ctx.fillStyle = '#e53935'; ctx.fillRect(sx, sy - s * 1.2, (sw * U.hp[i]) / U.mhp[i], s * 0.7); }
    }
  }
  function drawSkyUnitsOver(ox, oy, z, alpha) {
    if (z < 3) return;
    const s = Math.max(1, Math.round(z / 4));
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
      const t = m.t / m.T, progress = 0.25 * t + 0.75 * t * t, hx = m.x - (1 - progress) * 22, hy = m.y - (1 - progress) * 60;
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
  const textW = new Map();
  const measure = (t) => { const key = ctx.font + '|' + t; let w = textW.get(key); if (w === undefined) { w = ctx.measureText(t).width; if (textW.size > 4000) textW.clear(); textW.set(key, w); } return w; };
  // Name plates are drawn once into small images and reused (text is the costliest thing a canvas
  // draws); a plate is redrawn only when its name, head count, colour or rank changes.
  const plates = new Map();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { plates.clear(); for (const k in digits) delete digits[k]; });
  // the head count is stamped from pre-drawn digits, so a plate is redrawn only when its name,
  // colour, rank or the number of digits changes
  const digits = {};
  const plateK = () => (R.perf.scale > 1 ? R.perf.scale : 1); // drawn finer than CSS pixels at Sharp resolution, so text stays crisp
  function digitSet(big) {
    const key = big ? 'b' : 's';
    if (digits[key]) return digits[key];
    const K = plateK();
    const font = `600 ${big ? 13 : 12}px "Alegreya Sans", system-ui, sans-serif`, prev = ctx.font;
    ctx.font = font;
    let adv = 0; for (let d = 0; d < 10; d++) adv = Math.max(adv, ctx.measureText(String(d)).width);
    ctx.font = prev;
    adv = Math.ceil(adv);
    const h = big ? 22 : 20, c = mk(Math.ceil(adv * 10 * K), Math.ceil(h * K)), g = c.getContext('2d');
    g.scale(K, K);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(232,182,76,0.95)';
    for (let d = 0; d < 10; d++) g.fillText(String(d), d * adv + adv / 2, h / 2 + 1);
    return (digits[key] = { c, adv, h, K });
  }
  function plateSprite(name, nd, k, cap, big) {
    const key = `${name}|${nd}|${k.css}|${cap ? 1 : 0}${big ? 1 : 0}`;
    let e = plates.get(key);
    if (e) { e.t = frameN; return e; }
    const font = `600 ${big ? 13 : 12}px "Alegreya Sans", system-ui, sans-serif`, prevFont = ctx.font;
    ctx.font = font;
    const nw = measure(name);
    ctx.font = prevFont;
    const D = digitSet(big), pw = D.adv * nd;
    const ph = big ? 22 : 20, crest = 7, pad = 7, w = Math.ceil(crest + pad + nw + 8 + pw + pad);
    const K = plateK(), c = mk(Math.ceil((w + 2) * K), Math.ceil((ph + 7) * K)), g = c.getContext('2d'), x0 = 1, y0 = 1, mid = y0 + ph / 2;
    g.scale(K, K);
    g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(12,16,27,0.82)';
    g.beginPath(); if (g.roundRect) g.roundRect(x0, y0, w, ph, 5); else g.rect(x0, y0, w, ph); g.fill();
    g.strokeStyle = cap ? 'rgba(232,182,76,0.85)' : 'rgba(222,202,150,0.22)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = k.css; g.fillRect(x0 + 5, y0 + 4, crest - 2, ph - 8);
    g.fillStyle = cap ? '#fff1cf' : '#efe8d6';
    g.fillText(name, x0 + crest + pad, mid + 1);
    g.beginPath(); g.moveTo(x0 + w / 2 - 4, y0 + ph); g.lineTo(x0 + w / 2 + 4, y0 + ph); g.lineTo(x0 + w / 2, y0 + ph + 5); g.closePath();
    g.fillStyle = 'rgba(12,16,27,0.82)'; g.fill();
    e = { c, w, ph, numX: crest + pad + nw + 8, t: frameN, cw: w + 2, chh: ph + 7 };
    plates.set(key, e);
    if (plates.size > 900) for (const [kk, v] of plates) if (frameN - v.t > 90) plates.delete(kk);
    return e;
  }
  function plate(sx, sy, name, pop, k, cap, big, captureT) {
    const e = plateSprite(name, pop.length, k, cap, big), x0 = Math.round(sx - e.w / 2), y0 = Math.round(sy - e.ph / 2);
    const D = digitSet(big), K = D.K, sm = ctx.imageSmoothingEnabled;
    if (K !== 1) ctx.imageSmoothingEnabled = true; // (a finer image laid onto a finer canvas, one to one)
    ctx.drawImage(e.c, x0 - 1, y0 - 1, e.cw, e.chh);
    for (let q = 0; q < pop.length; q++) { const d = pop.charCodeAt(q) - 48; if (d >= 0 && d <= 9) ctx.drawImage(D.c, d * D.adv * K, 0, D.adv * K, D.h * K, x0 + e.numX + q * D.adv, y0, D.adv, D.h); }
    if (K !== 1) ctx.imageSmoothingEnabled = sm;
    if (captureT > 0) { ctx.fillStyle = '#ef5350'; ctx.fillRect(x0 + 4, y0 + e.ph + 2, ((e.w - 8) * captureT) / 100, 3); }
  }
  function drawLabels(ox, oy, z, under) {
    if (under) return;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const big = z >= 6;
    ctx.font = `600 ${big ? 13 : 12}px "Alegreya Sans", system-ui, sans-serif`;
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const k = Civ.kingdoms[c.kd], cap = k.capital === c.id;
      if (z < 2 && !cap) continue;
      const sx = Math.round(ox + c.x * z), sy = Math.round(oy + (c.y - 2.2) * z - Math.max(14, 16 * Math.max(1, z / 4)));
      if (sx < -120 || sx > cw + 120 || sy < -20 || sy > ch + 20) continue;
      plate(sx, sy, z < 2 ? k.name : c.name, String(c.members.length), k, cap, big, c.captureT);
    }
  }
  // ------------------------------------------------------------ 3D frame: the WebGL view plus projected 2D overlays
  function ring3D(x, y, r, h) {
    const V3 = AG.View3D;
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2, p = V3.project(x + Math.cos(a) * r, y + Math.sin(a) * r, h || 0.05);
      if (!p.vis) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  function frame3D(dt, alpha, t0) {
    ctx.setTransform(R.perf.scale, 0, 0, R.perf.scale, 0, 0);
    const V3 = AG.View3D, z = R.cam.z;
    if (frameN % 6 === 0) updateTerrain(); // keeps the minimap and the 2D map ready for zooming back out
    if (R.bordersDirty) { updateBorders(); R.bordersDirty = false; }
    V3.render(dt, alpha);
    ctx.clearRect(0, 0, cw, ch);
    if (God.flash() > 0) { ctx.fillStyle = `rgba(230,236,255,${God.flash() * 0.3})`; ctx.fillRect(0, 0, cw, ch); }
    // city name plates float above each keep
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '600 13px "Alegreya Sans", system-ui, sans-serif';
    const plates = [];
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const p = V3.project(c.x, c.y, 6.5);
      if (p.vis && p.depth < 0.995) plates.push([p.depth, p, c]);
    }
    plates.sort((a, b) => b[0] - a[0]);
    for (const [, p, c] of plates) { const k = Civ.kingdoms[c.kd]; plate(Math.round(p.x), Math.round(p.y), c.name, String(c.members.length), k, k.capital === c.id, true, c.captureT); }
    // selection
    const sel = AG.UI && AG.UI.sel;
    ctx.strokeStyle = 'rgba(255,240,180,0.95)'; ctx.lineWidth = 2;
    if (sel && (sel.type === 'unit' || sel.type === 'person')) {
      let i = sel.id;
      if (sel.type === 'person') { const r = AG.People.get(sel.id); i = r && !r.died && r.idx >= 0 && U.alive[r.idx] ? r.idx : -1; }
      if (i >= 0 && U.alive[i] && U.layer[i] !== 0) ring3D(U.px[i] + (U.x[i] - U.px[i]) * alpha, U.py[i] + (U.y[i] - U.py[i]) * alpha, 0.55);
    } else if (sel && sel.type === 'city') {
      const c = Civ.cities[sel.id];
      if (c && c.alive) { ctx.setLineDash([8, 6]); ring3D(c.x, c.y, c.radius); ctx.setLineDash([]); }
    }
    // tool cursor on the ground
    const h = R.hover;
    if (h.on && God.cur) {
      ctx.strokeStyle = God.cur.color || '#fff'; ctx.lineWidth = 2;
      if (God.cur.mode === 'brush') ring3D(h.x, h.y, God.brush.r);
      else { const p = V3.project(h.x, h.y, 0.05); if (p.vis) { ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8); ctx.stroke(); } }
    }
    if (frameN % R.perf.minimapEvery === 0 || miniDue) { drawMinimap(); miniDue = false; }
    R.stats.ms = performance.now() - t0;
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
    if (!mctx || AG.Settings.v.minimap === 'off') return;
    const mw = mini.width, mh = mini.height;
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(R.view === 0 ? underC : worldC, 0, 0, mw, mh);
    if (R.view !== 0) mctx.drawImage(borderC, 0, 0, mw, mh);
    const c = R.cam, sx = mw / W, sy = mh / H;
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
    mctx.strokeRect((c.x - cw / 2 / c.z) * sx, (c.y - ch / 2 / c.z) * sy, (cw / c.z) * sx, (ch / c.z) * sy);
  }
})();
