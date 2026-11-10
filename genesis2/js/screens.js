/* AURA: Genesis 2 — screens.js
 * The loading screen and the title screen.
 *  - Loading: a pixel starfield with a faint nebula, and in the middle the planet itself turning:
 *    its globe is painted from the world being made (or, before there is one, from noise), with
 *    drifting clouds and a small moon. Above it the step in hand, below it a tip.
 *  - Title: the Aura emblem over the living world, and the way into the game.
 * Both draw at low resolution and are scaled up crisply; the loading screen animates only while
 * it is shown. */
'use strict';
(function () {
  const AG = window.AG;
  const $ = (q) => document.querySelector(q);
  const hash = (x, y, s) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // smooth value noise, wrapping horizontally every `wrap` cells (a globe has no east edge)
  function vnoise(x, y, s, wrap) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = (k) => (wrap ? ((k % wrap) + wrap) % wrap : k);
    const a = hash(w(xi), yi, s), b = hash(w(xi + 1), yi, s), c = hash(w(xi), yi + 1, s), d = hash(w(xi + 1), yi + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  const fbm = (x, y, s, wrap, o) => { let v = 0, amp = 0.5, f = 1, n = 0; for (let k = 0; k < (o || 4); k++) { v += vnoise(x * f, y * f, s + k * 17, wrap * f) * amp; n += amp; amp *= 0.5; f *= 2; } return v / n; };
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const pack = (r, g, b, a = 255) => ((c8(a) << 24) | (c8(b) << 16) | (c8(g) << 8) | c8(r)) >>> 0; // (clamped: a channel past 255 would spill into the next)

  // ============================================================ loading screen
  const TW = 256, TH = 128;                       // globe texture (longitude x latitude)
  const GS = 112, GR = 50, GC = 56;               // globe canvas, radius, centre
  const tex = new Uint32Array(TW * TH), cloud = new Uint8Array(TW * TH);
  let texWorld = false, texT = 1e9, rot = 0, raf = 0, last = 0, flavorT = 1e9, flavorI = 0, tipT = 0;
  let sky = null, skyW = 0, skyH = 0, twinkles = [], disc = null;

  const SEA = ['#1d3f7a', '#24529a', '#2f68b8', '#4a86cf'].map(rgb);
  function landCol(e, veg, ice, t) {
    if (ice) return [236, 244, 250];
    if (e > 0.82) return [240, 242, 246];
    if (e > 0.7) return [138, 128, 116];
    if (veg > 150) return [56, 140, 52];
    if (veg > 80) return [98, 172, 64];
    if (t > 0.58) return [222, 196, 120];
    return [150, 176, 84];
  }
  // the globe from the world being made: the map wraps east-west, the poles get ice caps
  function paintFromWorld() {
    const Wd = AG.World, W = AG.W, H = AG.H, SEA_L = AG.SEA;
    if (!Wd || !Wd.elev || !W) return false;
    let land = 0; for (let i = 0; i < Wd.elev.length; i += 97) if (Wd.elev[i] >= SEA_L) land++;
    if (!land) return false;
    for (let v = 0; v < TH; v++) {
      const lat = Math.abs(v / (TH - 1) - 0.5) * 2, y = Math.min(H - 1, Math.floor((v / TH) * H));
      for (let u = 0; u < TW; u++) {
        const x = Math.floor((u / TW) * W), i = y * W + x, e = Wd.elev[i];
        let c;
        if (lat > 0.9 || (lat > 0.84 && hash(u, v, 7) < 0.5)) c = [232, 242, 250];
        else if (e < SEA_L) c = SEA[Math.max(0, Math.min(3, 3 - Math.floor((SEA_L - e) / 0.06)))];
        else c = landCol(e, Wd.veg[i], Wd.ice[i] > 0, Wd.tbase ? Wd.tbase[i] : 0.5);
        tex[v * TW + u] = pack(c[0], c[1], c[2]);
      }
    }
    return true;
  }
  // before there is a world: continents from noise
  function paintFromNoise() {
    for (let v = 0; v < TH; v++) {
      const lat = Math.abs(v / (TH - 1) - 0.5) * 2;
      for (let u = 0; u < TW; u++) {
        const n = fbm(u / 32, v / 32, 11, TW / 32, 5) - lat * lat * 0.18;
        let c;
        if (lat > 0.88) c = [232, 242, 250];
        else if (n < 0.5) c = SEA[Math.max(0, Math.min(3, Math.floor((n - 0.3) / 0.05)))];
        else c = landCol(0.4 + (n - 0.5) * 2.4, fbm(u / 12, v / 12, 5, TW / 12, 3) * 260, false, 1 - lat);
        tex[v * TW + u] = pack(c[0], c[1], c[2]);
      }
    }
  }
  function paintClouds() {
    for (let v = 0; v < TH; v++) for (let u = 0; u < TW; u++) {
      // swirls: the noise is sampled along a twisted coordinate
      const tw = Math.sin(v / 9) * 6, n = fbm((u + tw) / 18, v / 12, 31, TW / 18, 4);
      cloud[v * TW + u] = n > 0.6 ? (n > 0.68 ? 220 : 130) : 0;
    }
  }
  // per pixel of the disc: latitude row, longitude column and light (worked out once); the visible
  // half of the globe shows half of the texture
  function buildDisc() {
    disc = [];
    const L = [-0.55, -0.5, 0.67], ln = Math.hypot(L[0], L[1], L[2]);
    for (let py = 0; py < GS; py++) for (let px = 0; px < GS; px++) {
      const dx = (px + 0.5 - GC) / GR, dy = (py + 0.5 - GC) / GR, r2 = dx * dx + dy * dy;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      const lon = Math.atan2(dx, nz), lat = Math.asin(-dy);
      const shade = Math.max(0, (dx * L[0] + dy * L[1] + nz * L[2]) / ln);
      disc.push({ i: py * GS + px, u: Math.floor((lon / Math.PI + 0.5) * (TW / 2)), v: Math.max(0, Math.min(TH - 1, Math.floor((0.5 - lat / Math.PI) * TH))), light: shade, rim: Math.sqrt(r2) > 0.93 });
    }
  }
  function drawGlobe(g, img, px32) {
    px32.fill(0);
    const r0 = Math.floor(rot) & (TW - 1), c0 = Math.floor(rot * 1.35) & (TW - 1);
    for (const d of disc) {
      let c = tex[d.v * TW + ((d.u + r0) & (TW - 1))];
      let r = c & 255, gg = (c >> 8) & 255, b = (c >> 16) & 255;
      const cl = cloud[d.v * TW + ((d.u + c0) & (TW - 1))];
      if (cl) { const k = cl / 255; r += (250 - r) * k; gg += (252 - gg) * k; b += (255 - b) * k; }
      // light in a few steps, as a pixel artist would shade it
      const L = d.light, k = L > 0.55 ? 1 : L > 0.3 ? 0.82 : L > 0.12 ? 0.62 : 0.42;
      r *= k; gg *= k; b *= k;
      if (d.rim) { r = r * 0.5 + 70; gg = gg * 0.5 + 150; b = b * 0.5 + 190; }
      px32[d.i] = pack(r | 0, gg | 0, b | 0);
    }
    // drawn off screen first, so what is already on the canvas (the moon behind) stays
    off.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(off, 0, 0);
    // a thin bright atmosphere line
    g.strokeStyle = '#bff0ff'; g.lineWidth = 1; g.beginPath(); g.arc(GC, GC, GR + 0.5, 0, Math.PI * 2); g.stroke();
  }
  function drawMoon(g, t) {
    const a = t * 0.55, x = GC + Math.cos(a) * 54, y = GC + Math.sin(a) * 15 - 4, front = Math.sin(a) > 0;
    const dot = () => { g.fillStyle = '#1c1b17'; g.fillRect(Math.round(x) - 3, Math.round(y) - 2, 6, 5); g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 7); g.fillStyle = '#d9d4c6'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 5); g.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 3); g.fillStyle = '#a8a294'; g.fillRect(Math.round(x), Math.round(y), 2, 2); };
    return { front, dot };
  }
  // the sky: deep blue-black, a faint red-violet nebula (dithered), stars of a few sizes
  function buildSky() {
    const el = $('#ld-sky'); if (!el) return;
    const k = 2, w = Math.max(1, Math.ceil(innerWidth / k)), h = Math.max(1, Math.ceil(innerHeight / k));
    if (sky && skyW === w && skyH === h) return;
    skyW = w; skyH = h;
    el.width = w; el.height = h;
    sky = document.createElement('canvas'); sky.width = w; sky.height = h;
    const g = sky.getContext('2d'), img = g.createImageData(w, h), p = new Uint32Array(img.data.buffer);
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const s = (Math.random() * 1000) | 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n1 = fbm(x / 90, y / 70, s, 0, 4), n2 = fbm(x / 60 + 40, y / 80, s + 9, 0, 4);
      const band = Math.exp(-Math.pow((x / w - y / h * 0.6 - 0.35) * 2.6, 2)); // a diagonal drift of dust
      const t = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      let r = 18, gg = 22, b = 31;
      const red = (n1 * band - 0.22) * 2.2, vio = (n2 * (0.5 + band * 0.6) - 0.36) * 2;
      if (red > t * 0.6) { r = 58; gg = 22; b = 44; if (red > 0.55 + t * 0.3) { r = 78; gg = 28; b = 56; } }
      else if (vio > t * 0.7) { r = 36; gg = 30; b = 66; }
      p[y * w + x] = pack(r, gg, b);
    }
    for (let k2 = 0, n = Math.round((w * h) / 520); k2 < n; k2++) {
      const x = (Math.random() * w) | 0, y = (Math.random() * h) | 0, sz = Math.random() < 0.82 ? 1 : Math.random() < 0.8 ? 2 : 3;
      const c = Math.random() < 0.2 ? pack(150, 210, 255) : pack(235, 238, 245, Math.random() < 0.5 ? 255 : 170);
      for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz; xx++) if (x + xx < w && y + yy < h) p[(y + yy) * w + x + xx] = c;
    }
    g.putImageData(img, 0, 0);
    twinkles = Array.from({ length: Math.max(4, Math.round((w * h) / 26000)) }, () => ({ x: (Math.random() * w) | 0, y: (Math.random() * h) | 0, ph: Math.random() * 6.28, sp: 0.8 + Math.random() * 1.6, c: Math.random() < 0.4 ? '#a7e3ff' : '#ffffff' }));
  }
  function drawSky(t) {
    const el = $('#ld-sky'); if (!el || !sky) return;
    const g = el.getContext('2d');
    g.drawImage(sky, 0, 0);
    for (const s of twinkles) { // + shaped stars that pulse
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * s.sp + s.ph)), L = a > 0.8 ? 3 : 2;
      g.globalAlpha = a; g.fillStyle = s.c;
      g.fillRect(s.x - L, s.y, L * 2 + 1, 1); g.fillRect(s.x, s.y - L, 1, L * 2 + 1);
      g.globalAlpha = 1;
    }
  }
  // what is happening, in a few words that change while a step lasts
  const FLAVOR = {
    world: ['Cooling the crust', 'Shaping continents', 'Filling the oceans', 'Raising the first mountains', 'Igniting aura cores', 'Seeding the first cells', 'Spawning ecosystems', 'Setting the planet turning'],
    deep: ['Drifting the continents', 'Evolving new species', 'Splitting the supercontinent', 'Folding mountain ranges', 'Waiting for bigger brains', 'Counting the generations', 'Carving river valleys'],
    dawn: ['Lighting the first campfires', 'Naming the first bands', 'Teaching the first words', 'Preparing the close-up'],
  };
  const TIPS = [
    'Bands learn to farm only where wild grain grows and the climate settles down.',
    'Open History and ask "what if this never happened?" of any invention.',
    'Sow wild grain near a band, and farming may begin there first.',
    'Everyone remembers: tap a person to read their story, memories and family.',
    'Languages drift apart when contact breaks. Watch the Languages overlay after the sea rises.',
    'Push a plate in deep time and watch mountains rise where continents meet.',
    'Start an ice age: the sea falls and land bridges open for people to cross.',
    'Bronze needs tin. Seed ore underground, or trade will have to find it.',
    'Send a dream to a curious child, and they may grow up an explorer or a prophet.',
    'Writing comes to chiefdoms; states need writing, monuments or many towns.',
    'Gods are born from what a people lived through: flood survivors revere the sea.',
    'Zoom past 8x and the camera tilts into a 3D close-up.',
    'A strait is enough: cut off on an island, a species drifts into a new one.',
    'Diseases drift as they spread. Design your own with the Plague power.',
    'Possess any creature and walk the world with WASD.',
    'Small isolated groups can forget what their ancestors knew.',
    'Cold climates favour stocky bodies: the genes follow the weather.',
    'A paused world is a still picture and uses almost no power.',
    'Meteors fly in real time, even while the world is paused.',
  ];
  const phaseOf = (text) => (/racing|ages/i.test(text) ? 'deep' : /first people|dawn|close-up/i.test(text) ? 'dawn' : 'world');
  const Loader = (AG.Loader = {
    on: true, phase: 'world', status: '',
    set(p, text) {
      const f = $('#ld-fill'); if (f) f.style.width = Math.round(AG.clamp(p, 0, 1) * 100) + '%';
      if (text) {
        const ph = phaseOf(text);
        if (ph !== Loader.phase) { Loader.phase = ph; flavorT = 1e9; }
        Loader.status = text;
        const s = $('#ld-sub'); if (s) s.textContent = text;
      }
    },
    show(text, tip) {
      const el = $('#loader'); if (!el) return;
      el.hidden = false; el.classList.remove('hide'); Loader.on = true;
      Loader.phase = ''; Loader.set(0, text || 'Loading');
      const t = $('#ld-tip'); if (t) t.textContent = tip || TIPS[(Math.random() * TIPS.length) | 0];
      tipT = 0; texWorld = false; texT = 1e9;
      start();
    },
    hide() {
      const el = $('#loader'); if (!el) return;
      el.classList.add('hide'); Loader.on = false;
      setTimeout(() => { if (!Loader.on) { el.hidden = true; cancelAnimationFrame(raf); raf = 0; } }, 500);
    },
  });
  let gctx = null, gimg = null, g32 = null, off = null;
  function frame(now) {
    raf = 0;
    if (!Loader.on && $('#loader').hidden) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    const t = now / 1000;
    rot += dt * 9;
    // the globe takes the world's own face as soon as there is one, and follows it as it changes
    if ((texT += dt) > (texWorld ? 1.5 : 0.4)) { texT = 0; texWorld = paintFromWorld() || texWorld; }
    if ((flavorT += dt) > 1.9) {
      flavorT = 0;
      const list = FLAVOR[Loader.phase] || FLAVOR.world, el = $('#ld-step');
      if (el) el.textContent = list[flavorI++ % list.length];
    }
    if ((tipT += dt) > 7) { tipT = 0; const el = $('#ld-tip'); if (el) el.textContent = TIPS[(Math.random() * TIPS.length) | 0]; }
    buildSky(); drawSky(t);
    if (gctx) {
      const m = drawMoon(gctx, t);
      gctx.clearRect(0, 0, GS, GS);
      if (!m.front) m.dot();
      drawGlobe(gctx, gimg, g32);
      if (m.front) m.dot();
      const el = $('#ld-globe'); if (el) el.style.transform = `translateY(${Math.round(Math.sin(t * 1.6) * 3)}px)`; // a slow bob
    }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (!gctx) {
      const c = $('#ld-globe'); if (!c) return;
      c.width = GS; c.height = GS;
      gctx = c.getContext('2d'); gimg = gctx.createImageData(GS, GS); g32 = new Uint32Array(gimg.data.buffer);
      off = document.createElement('canvas'); off.width = GS; off.height = GS;
      buildDisc(); paintFromNoise(); paintClouds();
    }
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  Loader.start = start;
  window.addEventListener('resize', () => { skyW = 0; });

  // ============================================================ title screen
  // The emblem: the planet in its golden aura ring (a mountain with pines, lava and sea at its
  // foot), AURA above in raised gold letters, GENESIS below on a stone ribbon. Drawn once.
  const EW = 220, EH = 184;
  // Text as crisp pixels: drawn with the pixel font at low resolution, then cut to on/off.
  function textMask(text, size, weight, spacing) {
    const m = document.createElement('canvas'), g = m.getContext('2d');
    const font = `${weight || 700} ${size}px "Pixelify Sans", "Courier New", monospace`;
    g.font = font;
    let w = 0; const widths = [...text].map((ch) => { const cw = Math.ceil(g.measureText(ch).width); w += cw + (spacing || 0); return cw; });
    w = Math.max(1, w - (spacing || 0) + 2); const h = Math.ceil(size * 1.25) + 2;
    m.width = w; m.height = h;
    g.font = font; g.textBaseline = 'top'; g.fillStyle = '#fff';
    let x = 1; [...text].forEach((ch, k) => { g.fillText(ch, x, 1); x += widths[k] + (spacing || 0); });
    const d = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    let top = h, bottom = 0;
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 120) { mask[i] = 1; const y = (i / w) | 0; if (y < top) top = y; if (y > bottom) bottom = y; }
    return { w, h, mask, top, bottom };
  }
  // Stamp a mask with a vertical gradient face, a solid extrusion below and a dark outline.
  function stampText(px, W, m, ox, oy, top, bot, depthCol, depth, outline) {
    const cov = new Uint8Array(W * EH); // 1 face, 2 extrusion
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.mask[y * m.w + x]) continue;
      for (let d = depth; d >= 0; d--) {
        const X = ox + x, Y = oy + y + d;
        if (X < 0 || Y < 0 || X >= W || Y >= EH) continue;
        const j = Y * W + X;
        if (d === 0) cov[j] = 1; else if (!cov[j]) cov[j] = 2;
      }
    }
    const span = Math.max(1, m.bottom - m.top);
    for (let j = 0; j < cov.length; j++) {
      const c = cov[j];
      if (!c) {
        const x = j % W, y = (j / W) | 0;
        if ((x > 0 && cov[j - 1]) || (x < W - 1 && cov[j + 1]) || (y > 0 && cov[j - W]) || (y < EH - 1 && cov[j + W])) px[j] = outline;
        continue;
      }
      if (c === 2) { px[j] = depthCol; continue; }
      const y = (j / W) | 0, f = AG.clamp((y - oy - m.top) / span, 0, 1);
      const k = f < 0.5 ? 0 : 1, a = k ? (f - 0.5) * 2 : f * 2;
      const c0 = k ? top[1] : top[0], c1 = k ? bot : top[1];
      const step = Math.round(a * 3) / 3; // banded, not smooth
      px[j] = pack(c0[0] + (c1[0] - c0[0]) * step | 0, c0[1] + (c1[1] - c0[1]) * step | 0, c0[2] + (c1[2] - c0[2]) * step | 0);
    }
  }
  function drawEmblem(canvas) {
    canvas.width = EW; canvas.height = EH;
    const g = canvas.getContext('2d'), img = g.createImageData(EW, EH), px = new Uint32Array(img.data.buffer);
    const cx = 110, cy = 96, R0 = 50;
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < EW && y < EH) px[y * EW + x] = c; };
    const C = (h) => { const v = rgb(h); return pack(v[0], v[1], v[2]); };
    // --- the disc: a landscape inside the planet
    const ground = (x) => cy + 20 + Math.round(Math.sin(x * 0.21) * 1.5);
    const peak = (x) => { // three summits, the middle one highest
      const m1 = cy - 34 + Math.abs(x - cx) * 1.15, m2 = cy - 14 + Math.abs(x - (cx - 27)) * 1.05, m3 = cy - 10 + Math.abs(x - (cx + 29)) * 1.1;
      return Math.min(m1 + (hash(x, 1, 3) < 0.3 ? 1 : 0), m2, m3);
    };
    for (let y = cy - R0; y <= cy + R0; y++) for (let x = cx - R0; x <= cx + R0; x++) {
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx + 0.5, dy + 0.5);
      if (r > R0) continue;
      let col;
      const gy = ground(x), pk = peak(x);
      if (y < pk) { // sky: night blue to dawn teal, with a few stars
        const f = (y - (cy - R0)) / (R0 * 1.2);
        col = f < 0.3 ? '#16264a' : f < 0.55 ? '#1f3a66' : f < 0.75 ? '#2c5c86' : '#4a8aa4';
        if (hash(x, y, 9) > 0.985 && f < 0.6) col = '#e9f2ff';
      } else if (y < gy) { // mountains: snow on top, rock below, shaded on the right
        const depthIn = y - pk, right = x > cx ? 1 : 0;
        col = depthIn < 6 && pk < cy - 12 ? (right ? '#c6d3e2' : '#f2f6fb') : depthIn < 14 ? (right ? '#5f5a66' : '#837c86') : (right ? '#4d5a3c' : '#62724a');
      } else if (y < gy + 4) col = (x + y) % 5 ? '#58a33c' : '#3f8a30'; // meadow
      else { // the foot of the world: lava on the left, sea on the right, earth between
        if (x < cx - 14) col = hash(x, y, 4) < 0.18 ? '#ffe07a' : (x + y * 2) % 7 < 3 ? '#f2752a' : '#d8461f';
        else if (x > cx + 12) col = (y + Math.floor(x / 3)) % 6 === 0 ? '#9fe0ff' : y > gy + 10 ? '#1f5fae' : '#2f78c8';
        else col = (x * 3 + y) % 7 === 0 ? '#5c3d22' : '#7a5231';
      }
      put(x, y, C(col));
    }
    // pines at the foot of the mountains
    const pine = (bx, by, s) => {
      for (let k = 0; k < s; k++) for (let w = -Math.floor(k / 2); w <= Math.floor(k / 2); w++) put(bx + w, by - s + k, C(k % 3 === 2 ? '#1f5e2a' : '#2e7d32'));
      put(bx, by, C('#5c3d22')); put(bx, by + 1, C('#5c3d22'));
    };
    for (const [bx, s] of [[cx - 38, 9], [cx - 31, 12], [cx - 24, 8], [cx - 9, 10], [cx + 4, 13], [cx + 18, 9], [cx + 26, 11], [cx + 35, 8]]) {
      if (Math.hypot(bx - cx, ground(bx) - cy) < R0 - 3) pine(bx, ground(bx) + 1, s);
    }
    // --- the aura ring: gold, highlighted on the upper left, with four small gems
    for (let y = cy - R0 - 8; y <= cy + R0 + 8; y++) for (let x = cx - R0 - 8; x <= cx + R0 + 8; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r < R0 || r > R0 + 6) continue;
      const a = Math.atan2(y - cy, x - cx), lit = Math.cos(a + 2.4);
      const col = r < R0 + 1 || r > R0 + 5 ? '#2a1608' : r < R0 + 2.5 ? (lit > 0.3 ? '#fff1b0' : '#f8d64e') : lit > 0.5 ? '#f8d64e' : lit > -0.3 ? '#e8a636' : '#b06a1c';
      put(x, y, C(col));
    }
    const gem = (gx, gy, col) => { for (let k = -3; k <= 3; k++) for (let w = -(3 - Math.abs(k)); w <= 3 - Math.abs(k); w++) put(gx + w, gy + k, C(Math.abs(k) + Math.abs(w) === 3 ? '#2a1608' : k < 0 && w <= 0 ? '#ffffff' : col)); };
    gem(cx - R0 - 3, cy, '#9fe0ff'); gem(cx + R0 + 3, cy, '#9fe0ff'); gem(cx, cy + R0 + 3, '#f27bb4');
    // --- GENESIS on a stone ribbon across the lower ring
    const rib = { y0: cy + 36, y1: cy + 52, x0: cx - 66, x1: cx + 66 };
    for (let y = rib.y0; y <= rib.y1; y++) for (let x = rib.x0; x <= rib.x1; x++) {
      const edgeX = x === rib.x0 || x === rib.x1, edgeY = y === rib.y0 || y === rib.y1;
      const half = (rib.y1 - rib.y0) / 2, endDist = Math.min(x - rib.x0, rib.x1 - x);
      if (endDist < 6 && Math.abs(y - (rib.y0 + rib.y1) / 2) < ((6 - endDist) * half) / 6) continue; // swallow-tailed ends
      put(x, y, C(edgeX || edgeY ? '#1a1a1a' : y === rib.y0 + 1 ? '#6b6f61' : y === rib.y1 - 1 ? '#23251f' : '#3a3d34'));
    }
    const gm = textMask('GENESIS', 14, 700, 2);
    stampText(px, EW, gm, Math.round(cx - gm.w / 2), rib.y0 - gm.top + 2, [rgb('#fffaf0'), rgb('#f3ead2')], rgb('#d8c9a2'), pack(150, 132, 96), 1, pack(26, 20, 12));
    // --- AURA: raised gold letters over the top of the ring
    const am = textMask('AURA', 40, 700, 3);
    stampText(px, EW, am, Math.round(cx - am.w / 2), 4 - am.top + 2, [rgb('#fff3a8'), rgb('#ffc83d')], rgb('#f08a24'), pack(150, 64, 18), 4, pack(36, 16, 6));
    g.putImageData(img, 0, 0);
  }
  const Title = (AG.Title = { on: false, drawn: false, held: false });
  Title.show = function () {
    const el = $('#title'); if (!el) return;
    if (!Title.drawn) { drawEmblem($('#ti-emblem')); Title.drawn = true; }
    if (AG.mode !== 'deep' && !AG.paused) { AG.setSpeed('0'); Title.held = true; } // the world waits behind the title (deep time drifts on slowly)
    const fresh = AG.mode === 'deep' && AG.Geo && AG.Geo.myr < 20;
    $('#ti-play').textContent = fresh ? 'Play' : 'Resume World';
    $('#ti-foot').textContent = `${AG.calText(AG.mode === 'deep' ? null : AG.Geo.year)} · seed ${AG.seed} · Esc to play`;
    $('#ti-new').hidden = true; $('#ti-btns').hidden = false;
    el.hidden = false; Title.on = true;
    document.documentElement.classList.add('title-on');
    requestAnimationFrame(() => el.classList.add('show'));
  };
  Title.hide = function () {
    const el = $('#title'); if (!el || el.hidden) return;
    Title.on = false;
    document.documentElement.classList.remove('title-on');
    el.classList.remove('show');
    if (Title.held) { Title.held = false; if (AG.paused) AG.togglePause(); }
    setTimeout(() => { if (!Title.on) el.hidden = true; }, 260);
    if (AG.Render && AG.Render.invalidate) AG.Render.invalidate();
  };
  Title.drawEmblem = drawEmblem;
})();
