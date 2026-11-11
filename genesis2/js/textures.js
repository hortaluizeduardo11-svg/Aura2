/* AURA: Genesis 2 — textures.js
 * Surface textures for the 3D close-up, painted in code when the game loads (nothing is
 * downloaded): grass blades, soil with pebbles, rippled sand, faceted rock with cracks and lichen,
 * snow, leaf litter, ploughed furrows, dry-stone masonry with mortar and moss, cobbles, wooden
 * planks, logs, layered thatch, clay roof tiles, plaster, hide with stitched seams, bark, leaves,
 * pine needles, fur, woven cloth, ice, basalt and stratified cliff faces.
 * Every texture tiles seamlessly and is a detail map: its average is a neutral 50% grey, so it
 * multiplies the colour the simulation gives a surface (a meadow's season, a realm's roof, an
 * animal's coat) instead of replacing it. The renderer samples them from one texture array by
 * world or model position (no texture coordinates needed). Deterministic: the same textures in
 * every run. */
'use strict';
(function () {
  const AG = window.AG;
  const NAMES = ['plain', 'grass', 'dirt', 'sand', 'rock', 'snow', 'litter', 'farm', 'masonry', 'cobble', 'planks', 'logs', 'thatch', 'tiles', 'plaster', 'hide', 'bark', 'leaves', 'needles', 'fur', 'cloth', 'ice', 'basalt', 'cliff'];
  const L = {}; NAMES.forEach((n, i) => (L[n.toUpperCase()] = i));
  // repeats per world unit (a land cell is one unit, about 2.8 m; models are built near that scale)
  // (real sizes: a stone course ~0.45 m, a thatch course ~0.35 m, a roof tile ~0.3 m, a plank ~0.25 m)
  const SCALE = { plain: 1, grass: 1.1, dirt: 0.8, sand: 0.9, rock: 0.45, snow: 0.5, litter: 0.9, farm: 0.9, masonry: 1.1, cobble: 1.5, planks: 1.1, logs: 1.2, thatch: 1.1, tiles: 1.2, plaster: 0.8, hide: 1.2, bark: 2.2, leaves: 1.6, needles: 2.2, fur: 4, cloth: 5, ice: 0.4, basalt: 0.6, cliff: 0.5 };
  const Tx = (AG.Textures = { NAMES, L, SCALE: NAMES.map((n) => SCALE[n]), size: 0, data: null, ms: 0 });

  // ------------------------------------------------------------ tools
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // a texture under construction: RGB in 0..1 where 0.5 is neutral
  function Img(S) { this.S = S; this.d = new Float32Array(S * S * 3); }
  Img.prototype.fill = function (f) { const S = this.S, d = this.d; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = (y * S + x) * 3, c = f(x, y, d[o], d[o + 1], d[o + 2]); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; } };
  // per-pixel edit in place (fast path): f(x, y, o, d)
  Img.prototype.each = function (f) { const S = this.S, d = this.d; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) f(x, y, (y * S + x) * 3, d); };
  Img.prototype.blend = function (x, y, r, g, b, a) {
    const S = this.S; x = ((x % S) + S) % S; y = ((y % S) + S) % S;
    const o = (y * S + x) * 3, d = this.d;
    d[o] += (r - d[o]) * a; d[o + 1] += (g - d[o + 1]) * a; d[o + 2] += (b - d[o + 2]) * a;
  };
  // a soft round stamp
  Img.prototype.dot = function (cx, cy, rad, c, a) {
    const r = Math.ceil(rad + 1);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const fx = Math.floor(cx) + dx, fy = Math.floor(cy) + dy, d = Math.hypot(fx + 0.5 - cx, fy + 0.5 - cy);
      if (d > rad + 0.5) continue;
      this.blend(fx, fy, c[0], c[1], c[2], a * Math.min(1, rad + 0.5 - d));
    }
  };
  // a stroke from (x0, y0) to (x1, y1), tapering from w0 to w1 (wraps around the tile)
  Img.prototype.line = function (x0, y0, x1, y1, w0, w1, c, a, c1) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len * 1.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n, w = w0 + (w1 - w0) * t, cc = c1 ? [c[0] + (c1[0] - c[0]) * t, c[1] + (c1[1] - c[1]) * t, c[2] + (c1[2] - c[2]) * t] : c;
      this.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, cc, a);
    }
  };
  // a filled, rotated ellipse with a darker half (a leaf with its midrib)
  Img.prototype.leaf = function (cx, cy, len, wid, ang, c, a) {
    const ca = Math.cos(ang), sa = Math.sin(ang), r = Math.ceil(len);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca) / wid;
      const q = u * u + v * v;
      if (q > 1) continue;
      const shade = v > 0 ? 0.82 : 1.06, edge = Math.min(1, (1 - q) * 4);
      this.blend(Math.floor(cx) + dx, Math.floor(cy) + dy, c[0] * shade, c[1] * shade, c[2] * shade, a * edge);
    }
  };
  // periodic value noise and fractal sums (period in lattice cells across the tile)
  function Noise(seed) {
    const P = 512, t = new Float32Array(P * P), r = rng(seed);
    for (let i = 0; i < t.length; i++) t[i] = r();
    const sm = (f) => f * f * (3 - 2 * f);
    this.at = (u, v, px, py) => {
      const xi = Math.floor(u), yi = Math.floor(v), xf = sm(u - xi), yf = sm(v - yi);
      const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
      const a = t[y0 * P + x0], b = t[y0 * P + x1], c = t[y1 * P + x0], d = t[y1 * P + x1];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  // fbm over the tile: base lattice (bx by), octaves, 0..1
  function fbm(N, S, x, y, bx, by, oct) {
    let s = 0, amp = 0.5, tot = 0, fx = bx, fy = by || bx;
    for (let k = 0; k < oct; k++) { s += N.at((x / S) * fx, (y / S) * fy, fx, fy) * amp; tot += amp; amp *= 0.5; fx *= 2; fy *= 2; }
    return s / tot;
  }
  // periodic cellular noise: n x n jittered points; returns [F1, F2, id of nearest, dx, dy] in cell units
  function Cells(n, seed, jitter) {
    const r = rng(seed), px = new Float32Array(n * n), py = new Float32Array(n * n), j = jitter === undefined ? 0.9 : jitter;
    for (let i = 0; i < n * n; i++) { px[i] = 0.5 + (r() - 0.5) * j; py[i] = 0.5 + (r() - 0.5) * j; }
    const out = [0, 0, 0, 0, 0];
    this.n = n;
    this.at = (u, v) => {
      const cx = Math.floor(u), cy = Math.floor(v);
      let f1 = 9, f2 = 9, id = 0, ddx = 0, ddy = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy, wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n, k = wy * n + wx;
        const dx = gx + px[k] - u, dy = gy + py[k] - v, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; id = k; ddx = dx; ddy = dy; } else if (d < f2) f2 = d;
      }
      out[0] = f1; out[1] = f2; out[2] = id; out[3] = ddx; out[4] = ddy;
      return out;
    };
  }
  const hash01 = (k) => { let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const set = (d, o, l, t) => { d[o] = l * t[0]; d[o + 1] = l * t[1]; d[o + 2] = l * t[2]; };
  const N1 = [1, 1, 1];

  // ------------------------------------------------------------ the materials
  const GEN = {
    plain(im) { im.d.fill(0.5); },
    grass(im, S, N, r) {
      im.each((x, y, o, d) => { const n = fbm(N, S, x, y, 4, 4, 4); set(d, o, 0.24 + 0.14 * n, [0.92, 1, 0.86]); });
      for (let k = 0; k < 700; k++) { // dark under-blades
        const x = r() * S, y = r() * S, a = fbm(N, S, x, y, 2, 2, 2) * 9 + (r() - 0.5) * 1.2, l = 6 + r() * 10;
        im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.6, 0.4, [0.16, 0.18, 0.14], 0.7);
      }
      for (let k = 0; k < 3200; k++) { // lit blades, yellower at the tips
        const x = r() * S, y = r() * S, a = fbm(N, S, x, y, 2, 2, 2) * 9 + (r() - 0.5) * 1.4, l = 5 + r() * 12, v = 0.5 + r() * 0.45;
        im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.7, 0.3, [v * 0.92, v, v * 0.78], 0.85, [v * 1.08, v * 1.05, v * 0.7]);
      }
    },
    dirt(im, S, N, r) {
      im.each((x, y, o, d) => { const n = fbm(N, S, x, y, 4, 4, 5), f = fbm(N, S, x, y, 32, 32, 2); set(d, o, 0.36 + 0.22 * n + (f - 0.5) * 0.1, [1.03, 1, 0.95]); });
      const C = new Cells(8, 11, 0.8);
      im.each((x, y, o, d) => { const c = C.at((x / S) * 8, (y / S) * 8); if (c[1] - c[0] < 0.03 && fbm(N, S, x, y, 3, 3, 2) > 0.55) set(d, o, d[o] * 0.55 / Math.max(0.01, d[o]) * 0.5, N1); });
      for (let k = 0; k < 260; k++) { // pebbles with a shadow
        const x = r() * S, y = r() * S, rad = 1.2 + r() * 3.2, v = 0.55 + r() * 0.3;
        im.dot(x + rad * 0.4, y + rad * 0.4, rad, [0.18, 0.17, 0.16], 0.45);
        im.dot(x, y, rad, [v, v * 0.98, v * 0.93], 0.9);
        im.dot(x - rad * 0.3, y - rad * 0.3, rad * 0.45, [v * 1.2, v * 1.18, v * 1.12], 0.5);
      }
    },
    sand(im, S, N, r) {
      im.each((x, y, o, d) => {
        const w = fbm(N, S, x, y, 3, 3, 3), rip = Math.sin(((y / S) * 14 + w * 2.2) * Math.PI * 2), g = N.at(x, y, S, S);
        set(d, o, 0.47 + rip * 0.07 + (g - 0.5) * 0.12 + (fbm(N, S, x, y, 6, 6, 3) - 0.5) * 0.1, [1.02, 1, 0.94]);
      });
      for (let k = 0; k < 120; k++) { const x = r() * S, y = r() * S, v = 0.35 + r() * 0.4; im.dot(x, y, 0.6 + r() * 1.2, [v, v, v * 0.95], 0.8); }
    },
    rock(im, S, N) {
      const A = new Cells(6, 21, 1), B = new Cells(14, 22, 1);
      im.each((x, y, o, d) => {
        const u = (x / S) * 6, v = (y / S) * 6, c = A.at(u, v), id = c[2], f2f1 = c[1] - c[0];
        const ang = hash01(id * 7 + 1) * Math.PI * 2, tilt = (c[3] * Math.cos(ang) + c[4] * Math.sin(ang)) * 0.35;
        let l = 0.42 + hash01(id * 7 + 2) * 0.16 + tilt; // each facet its own plane of light
        const b = B.at((x / S) * 14, (y / S) * 14);
        l += (hash01(b[2] * 3 + 5) - 0.5) * 0.06;
        l += (fbm(N, S, x, y, 16, 16, 3) - 0.5) * 0.16;
        if (f2f1 < 0.05) l *= 0.45 + f2f1 * 8; // cracks between the facets
        else if (b[1] - b[0] < 0.035) l *= 0.8;
        const lich = fbm(N, S, x, y, 6, 6, 3);
        set(d, o, l, lich > 0.64 ? [0.98, 1.02, 0.78] : [1.02, 1, 0.97]);
      });
    },
    snow(im, S, N, r) {
      im.each((x, y, o, d) => { const n = fbm(N, S, x, y, 4, 4, 4), h = clamp((0.5 - fbm(N, S, x, y, 2, 2, 3)) * 5, 0, 1); set(d, o, 0.5 + (n - 0.5) * 0.12 - h * 0.03, [1 - h * 0.03, 1 - h * 0.01, 1 + h * 0.03]); });
      for (let k = 0; k < 500; k++) im.blend((r() * S) | 0, (r() * S) | 0, 0.72, 0.72, 0.74, 0.8);
    },
    litter(im, S, N, r) {
      im.each((x, y, o, d) => { const n = fbm(N, S, x, y, 4, 4, 4); set(d, o, 0.26 + 0.14 * n, [1.05, 0.98, 0.88]); });
      const tints = [[1.18, 0.92, 0.66], [1.12, 1, 0.72], [0.96, 1.02, 0.82], [1.1, 0.86, 0.66]];
      for (let k = 0; k < 1100; k++) { const v = 0.4 + r() * 0.42, t = tints[(r() * 4) | 0]; im.leaf(r() * S, r() * S, 3 + r() * 3.5, 1.4 + r() * 1.4, r() * Math.PI, [v * t[0], v * t[1], v * t[2]], 0.9); }
      for (let k = 0; k < 70; k++) { const x = r() * S, y = r() * S, a = r() * Math.PI, l = 8 + r() * 16; im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.4, 0.8, [0.2, 0.17, 0.14], 0.8); }
      im.each((x, y, o, d) => { if (fbm(N, S, x, y, 5, 5, 3) > 0.66) { d[o] *= 0.85; d[o + 1] *= 1.12; d[o + 2] *= 0.82; } });
    },
    farm(im, S, N, r) {
      im.each((x, y, o, d) => {
        const w = fbm(N, S, x, y, 4, 4, 2), s = Math.sin(((y / S) * 10 + w * 0.25) * Math.PI * 2);
        set(d, o, 0.46 + s * 0.15 + (fbm(N, S, x, y, 16, 16, 3) - 0.5) * 0.16, [1.03, 1, 0.94]);
      });
      for (let k = 0; k < 500; k++) { const v = r() < 0.5 ? 0.25 : 0.62; im.dot(r() * S, r() * S, 0.8 + r() * 1.6, [v, v * 0.97, v * 0.9], 0.6); }
    },
    masonry(im, S, N, r) {
      // rows of rough stones in mortar: each stone its own tone, bevelled, the mortar mossy below
      const rows = [40, 46, 38, 44, 42, 46], stones = [];
      let y0 = 0;
      for (const h of rows) { let x = r() * 30; const start = x; while (x < start + S - 20) { const w = 30 + r() * 42; stones.push({ x0: x, x1: x + w, y0, y1: y0 + h, t: 0.44 + r() * 0.22, h: r() }); x += w; } stones[stones.length - 1].x1 = start + S; y0 += h; }
      const rowOf = (y) => { let a = 0; for (let i = 0; i < rows.length; i++) { if (y < a + rows[i]) return i; a += rows[i]; } return rows.length - 1; };
      const rowStones = rows.map((_, i) => stones.filter((s) => s.y0 === rows.slice(0, i).reduce((a, b) => a + b, 0)));
      im.each((x, y, o, d) => {
        const list = rowStones[rowOf(y)];
        let st = null, xx = x;
        for (const s of list) { for (const off of [0, S, -S]) { if (x + off >= s.x0 && x + off < s.x1) { st = s; xx = x + off; } } if (st) break; }
        const jit = (fbm(N, S, x, y, 16, 16, 2) - 0.5) * 5;
        const ex = Math.min(xx - st.x0, st.x1 - xx), ey = Math.min(y - st.y0, st.y1 - y), R = 7;
        const e = (ex < R && ey < R ? R - Math.hypot(R - ex, R - ey) : Math.min(ex, ey)) - 2.6 + jit; // rounded corners
        if (e < 0) { // mortar, darker and mossy toward the bottom of the joint
          const moss = fbm(N, S, x, y, 8, 8, 3) > 0.52;
          set(d, o, 0.28 + (fbm(N, S, x, y, 32, 32, 2) - 0.5) * 0.08, moss ? [0.82, 1.08, 0.74] : [1, 1, 0.95]);
          return;
        }
        let l = st.t + (fbm(N, S, x, y, 12, 12, 4) - 0.5) * 0.2;
        if (e < 7) { const top = (ey === y - st.y0 && ey < ex) || (ex === xx - st.x0 && ex <= ey); l *= top ? 1 + (7 - e) * 0.03 : 1 - (7 - e) * 0.05; }
        const moss = fbm(N, S, x + 77, y + 31, 6, 6, 3) > 0.66 && y - st.y0 > (st.y1 - st.y0) * 0.5;
        set(d, o, l, moss ? [0.84, 1.08, 0.74] : [1.02, 1, 0.97]);
      });
    },
    cobble(im, S, N) {
      const C = new Cells(9, 31, 0.7);
      im.each((x, y, o, d) => {
        const c = C.at((x / S) * 9, (y / S) * 9), gap = c[1] - c[0];
        if (gap < 0.1) { set(d, o, 0.22 + (fbm(N, S, x, y, 16, 16, 2) - 0.5) * 0.1, [1.04, 1, 0.92]); return; }
        const dome = 1 - c[0] / 0.75, light = (-c[3] - c[4]) * 0.25;
        set(d, o, 0.4 + hash01(c[2] + 9) * 0.18 + dome * 0.12 + light + (fbm(N, S, x, y, 24, 24, 2) - 0.5) * 0.1, [1, 1, 0.98]);
      });
    },
    planks(im, S, N, r) {
      const n = 5, w = S / n, butt = Array.from({ length: n }, () => r() * S), tone = Array.from({ length: n }, () => 0.42 + r() * 0.16);
      im.each((x, y, o, d) => {
        const xx = (x + w * 0.5) % S, p = Math.floor(xx / w), lx = xx - p * w; // (no joint on the tile's edge)
        if (lx < 1.5) { set(d, o, 0.14, N1); return; }
        if (Math.abs(y - butt[p]) < 1) { set(d, o, 0.18, N1); return; }
        const streak = fbm(N, S, x, y, 32, 2, 3), grain = Math.sin(lx * 0.5 + streak * 18) * 0.06;
        set(d, o, tone[p] + grain + (streak - 0.5) * 0.16 + (lx < 3.5 ? 0.06 : 0), [1.04, 1, 0.92]);
      });
      for (let k = 0; k < 7; k++) { const x = r() * S, y = r() * S; for (let q = 4; q > 0; q--) im.dot(x, y, q * 1.4, q % 2 ? [0.22, 0.2, 0.18] : [0.4, 0.37, 0.33], 0.6); }
    },
    logs(im, S, N) {
      const rows = 6, h = S / rows;
      im.each((x, y, o, d) => {
        const t = (y % h) / h;
        if (t < 0.07 || t > 0.93) { set(d, o, 0.36 + (fbm(N, S, x, y, 32, 32, 2) - 0.5) * 0.12, [1, 0.98, 0.9]); return; } // chinking
        const round = Math.pow(Math.sin(Math.PI * (t - 0.07) / 0.86), 0.6), bark = fbm(N, S, x, y, 4, 48, 3);
        set(d, o, 0.24 + round * 0.36 + (bark - 0.5) * 0.22, [1.04, 1, 0.93]);
      });
    },
    thatch(im, S, N, r) {
      im.d.fill(0.22);
      const rows = 8, h = S / rows;
      for (let row = 0; row < rows; row++) for (let k = 0; k < 420; k++) { // straw laid in courses, each overlapping the one below
        const x = r() * S, y = row * h - 4 + r() * 6, a = Math.PI / 2 + (r() - 0.5) * 0.35, l = h * 0.9 + r() * h * 0.5, v = 0.42 + r() * 0.45;
        im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.3, 0.9, [v * 1.06, v, v * 0.74], 0.9, [v * 0.8, v * 0.75, v * 0.55]);
      }
      im.each((x, y, o, d) => { const t = (y % h) / h; if (t < 0.12) { const k = 0.7 + t * 2.5; d[o] *= k; d[o + 1] *= k; d[o + 2] *= k; } });
    },
    tiles(im, S, N, r) {
      const rows = 8, h = S / rows, cols = 8, w = S / cols, tone = Array.from({ length: rows * cols }, () => (r() - 0.5) * 0.14);
      im.each((x, y, o, d) => {
        const row = Math.floor(y / h), off = row % 2 ? w / 2 : 0, xx = (x + off) % S, col = Math.floor(xx / w), u = (xx % w) / w, t = (y % h) / h;
        if (u < 0.04 || u > 0.96) { set(d, o, 0.16, N1); return; }
        let l = 0.36 + Math.sin(Math.PI * u) * 0.24 + tone[row * cols + col];
        if (t > 0.78) l *= 0.62; else if (t < 0.08) l *= 1.12;
        l += (fbm(N, S, x, y, 16, 16, 3) - 0.5) * 0.12;
        set(d, o, l, fbm(N, S, x, y, 6, 6, 2) > 0.68 ? [0.92, 1.02, 0.8] : [1.03, 0.99, 0.95]);
      });
    },
    plaster(im, S, N) {
      const C = new Cells(4, 41, 1);
      im.each((x, y, o, d) => {
        let l = 0.5 + (fbm(N, S, x, y, 4, 4, 4) - 0.5) * 0.14 + (N.at(x * 0.5, y * 0.5, S / 2, S / 2) - 0.5) * 0.05;
        const c = C.at((x / S) * 4, (y / S) * 4);
        if (c[1] - c[0] < 0.012 && fbm(N, S, x, y, 3, 3, 2) > 0.5) l *= 0.62;
        set(d, o, l, fbm(N, S, x, y, 2, 2, 3) < 0.4 ? [0.97, 0.95, 0.9] : N1);
      });
    },
    hide(im, S, N) {
      im.each((x, y, o, d) => {
        let l = 0.48 + (fbm(N, S, x, y, 3, 3, 4) - 0.5) * 0.24 + (N.at(x * 0.5, y * 0.5, S / 2, S / 2) - 0.5) * 0.06;
        for (const sx of [64, 192]) { const dx = Math.abs(x - sx); if (dx < 3) l *= 0.82; if (dx < 1.2 && y % 8 < 4) l *= 0.5; } // stitched seams
        set(d, o, l, [1.04, 1, 0.93]);
      });
    },
    bark(im, S, N) {
      im.each((x, y, o, d) => {
        const n = fbm(N, S, x, y, 12, 3, 4), ridge = Math.abs(n - 0.5) * 2;
        let l = 0.3 + ridge * 0.42 + (fbm(N, S, x, y, 48, 12, 2) - 0.5) * 0.1;
        if (ridge < 0.12) l *= 0.5; // the fissures
        set(d, o, l, [1.03, 1, 0.94]);
      });
    },
    leaves(im, S, N, r) {
      im.d.fill(0.16);
      for (let k = 0; k < 2200; k++) { const v = 0.4 + r() * 0.5, g = r(); im.leaf(r() * S, r() * S, 4 + r() * 3.5, 2 + r() * 1.6, r() * Math.PI, [v * (0.9 + g * 0.2), v, v * (0.75 + (1 - g) * 0.25)], 0.92); }
    },
    needles(im, S, N, r) {
      im.d.fill(0.18);
      for (let k = 0; k < 340; k++) {
        const cx = r() * S, cy = r() * S, n = 12 + r() * 8;
        for (let q = 0; q < n; q++) { const a = r() * Math.PI * 2, l = 5 + r() * 8, v = 0.38 + r() * 0.4; im.line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, 1.1, 0.5, [v * 0.9, v, v * 0.94], 0.85); }
      }
    },
    fur(im, S, N, r) {
      im.each((x, y, o, d) => set(d, o, 0.48 + (fbm(N, S, x, y, 3, 3, 3) - 0.5) * 0.12, N1));
      for (let k = 0; k < 5200; k++) {
        const x = r() * S, y = r() * S, a = Math.PI / 2 + (fbm(N, S, x, y, 3, 3, 2) - 0.5) * 2.4, l = 5 + r() * 9, v = 0.36 + r() * 0.3;
        im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.1, 0.4, [v, v, v], 0.55);
      }
    },
    cloth(im, S, N, r) {
      im.each((x, y, o, d) => {
        const tx = (x % 4) / 4, ty = (y % 4) / 4, over = ((x >> 2) + (y >> 2)) % 2 === 0;
        const thread = over ? Math.sin(Math.PI * ty) : Math.sin(Math.PI * tx);
        set(d, o, 0.4 + thread * 0.18 + (fbm(N, S, x, y, 8, 8, 3) - 0.5) * 0.1 + (N.at(x * 0.25, y * 2, S * 0.25, S * 2) - 0.5) * 0.06, N1);
      });
    },
    ice(im, S, N) {
      const C = new Cells(5, 51, 1);
      im.each((x, y, o, d) => {
        let l = 0.5 + (fbm(N, S, x, y, 3, 3, 4) - 0.5) * 0.1;
        const c = C.at((x / S) * 5, (y / S) * 5);
        if (c[1] - c[0] < 0.015) l = 0.72;
        set(d, o, l, [0.96, 0.99, 1.05]);
      });
    },
    basalt(im, S, N, r) {
      const C = new Cells(6, 61, 0.5);
      im.each((x, y, o, d) => {
        const c = C.at((x / S) * 6, (y / S) * 6);
        let l = 0.44 + (fbm(N, S, x, y, 16, 16, 4) - 0.5) * 0.2 + (hash01(c[2] + 3) - 0.5) * 0.1;
        if (c[1] - c[0] < 0.04) l *= 0.45;
        set(d, o, l, [0.98, 0.98, 1.02]);
      });
      for (let k = 0; k < 260; k++) { const x = r() * S, y = r() * S, rad = 0.8 + r() * 2; im.dot(x + 0.6, y + 0.6, rad, [0.6, 0.6, 0.62], 0.4); im.dot(x, y, rad, [0.12, 0.12, 0.13], 0.9); }
    },
    cliff(im, S, N, r) {
      im.each((x, y, o, d) => {
        const w = fbm(N, S, x, y, 3, 3, 3), band = (y / S) * 6 + w * 0.9, bi = Math.floor(band), s = Math.sin(band * Math.PI * 2);
        let l = 0.42 + s * 0.08 + (hash01(((bi % 6) + 6) % 6 + 70) - 0.5) * 0.16 + (fbm(N, S, x, y, 16, 32, 3) - 0.5) * 0.18;
        if (Math.abs(band - bi - 0.02) < 0.035) l *= 0.6; // bedding planes
        set(d, o, l, bi % 2 ? [1.05, 1, 0.92] : [0.96, 0.97, 1.01]);
      });
      for (let k = 0; k < 10; k++) { let x = r() * S, y = r() * S; for (let q = 0; q < 8; q++) { const nx = x + (r() - 0.5) * 8, ny = y + 6 + r() * 8; im.line(x, y, nx, ny, 1.4, 1, [0.15, 0.14, 0.13], 0.7); x = nx; y = ny; } }
    },
  };

  // Build every layer: size x size RGBA per layer, stacked (for a texture array). Each layer's mean
  // brightness is set to 50% so it only adds detail to the colour it multiplies.
  Tx.build = function (size) {
    if (Tx.data && Tx.size === (size || 256)) return Tx;
    const t0 = AG.now ? AG.now() : Date.now();
    const S = size || 256, data = new Uint8Array(NAMES.length * S * S * 4);
    NAMES.forEach((name, li) => {
      const im = new Img(S), N = new Noise(1000 + li * 17), r = rng(5000 + li * 31);
      GEN[name](im, S, N, r);
      const d = im.d;
      let m = 0;
      for (let i = 0; i < d.length; i++) if (!(d[i] >= 0)) d[i] = d[i] > 0 ? 1 : 0.5; // (no stray NaN can reach the GPU)
      for (let i = 0; i < d.length; i += 3) m += d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
      m /= S * S;
      const k = m > 0 ? 0.5 / m : 1, o = li * S * S * 4;
      for (let p = 0, i = 0; i < d.length; i += 3, p += 4) {
        data[o + p] = clamp(d[i] * k * 255, 0, 255); data[o + p + 1] = clamp(d[i + 1] * k * 255, 0, 255); data[o + p + 2] = clamp(d[i + 2] * k * 255, 0, 255); data[o + p + 3] = 255;
      }
    });
    Tx.size = S; Tx.data = data; Tx.ms = (AG.now ? AG.now() : Date.now()) - t0;
    return Tx;
  };
  // one layer as an RGBA image (for previews and tests)
  Tx.layer = function (i) { const S = Tx.size, n = S * S * 4; return Tx.data.subarray(i * n, (i + 1) * n); };
})();
