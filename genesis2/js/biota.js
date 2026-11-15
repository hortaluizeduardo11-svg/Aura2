/* AURA: Genesis 2 — biota.js
 * Life in the 3D close-up, drawn from the regional populations (life.js) rather than from bodies:
 * - the sea, always: every sea species of the regions in view swims there, as many as its
 *   numbers allow, at the depth its kind keeps (trilobites and octopus on the floor, reef fish
 *   over the coral, whales near the surface), schooling fish in shoals, all tinted bluer the
 *   deeper they are; the shallow floor carries coral reefs in warm water, kelp forests in cold,
 *   seagrass and sponges between (and stromatoliths and sponges before there were corals)
 * - the land, in deep time and in the years of history (when no bodies walk): dinosaurs, sail-
 *   backs, giant millipedes, pterosaurs, the first mammals, creatures of legend and of other
 *   worlds, and the animals of today
 * In Watch time land animals are real bodies (entities.js), so here only the sea is drawn.
 * Placement and motion come from stable hashes, so a creature keeps its place frame to frame. */
'use strict';
(function () {
  const AG = window.AG;
  const Bi = (AG.Biota = { stats: { sea: 0, land: 0, reef: 0 }, dive: false });
  const hash = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const h01 = (a, b) => hash(a, b) / 4294967296;
  const SEA_Y = 0.12, DEEP = [0.06, 0.26, 0.42];
  const anchors = new Map(); let anchorWin = '', reefList = null, reefWin = '';
  const MAX_SEA = 1100, MAX_LAND = 420, MAX_REEF = 2600;
  // a stable spot for the q-th creature of a species in a region (null where none can be)
  const depthAt = (i) => (AG.SEA - AG.World.elev[i]) * 16 + 0.2; // (world units of water over a sea cell, as view3d draws its floor)
  function anchor(s, r, q, wantSea, minDepth) {
    const key = s.id * 1e6 + r * 64 + q;
    let a = anchors.get(key);
    if (a !== undefined) return a;
    const Life = AG.Life, W = AG.W, H = AG.H, Wd = AG.World, x0 = (r % Life.RW) * Life.RS, y0 = ((r / Life.RW) | 0) * Life.RS;
    a = null;
    for (let t = 0; t < (wantSea ? 14 : 8) && !a; t++) {
      const x = x0 + h01(key, t * 2 + 1) * Life.RS, y = y0 + h01(key, t * 2 + 2) * Life.RS;
      if (x >= W - 1 || y >= H - 1) continue;
      const i = (y | 0) * W + (x | 0), sea = Wd.elev[i] < AG.SEA && !Wd.frozen[i] && (!minDepth || depthAt(i) >= minDepth);
      if (wantSea ? sea : Wd.passLand(i) && !Wd.ice[i]) a = { x, y, ph: h01(key, 99) * 6.283, rad: 0.8 + h01(key, 98) * 2.4, sp: 0.6 + h01(key, 97) * 0.8 };
    }
    anchors.set(key, a);
    return a;
  }
  const tint = (c, k, deep) => { const f = Math.min(0.75, deep); return [(c[0] / 255 * (1 - f) + DEEP[0] * f) * k, (c[1] / 255 * (1 - f) + DEEP[1] * f) * k, (c[2] / 255 * (1 - f) + DEEP[2] * f) * k]; };

  // ------------------------------------------------------------ the reef
  function buildReef(wx0, wy0, ws) {
    const Wd = AG.World, W = AG.W, Life = AG.Life, out = [];
    const corals = Life.periodIdx() >= 1, early = !corals;
    for (let y = wy0; y < wy0 + ws; y++) for (let x = wx0; x < wx0 + ws; x++) {
      const i = y * W + x, e = Wd.elev[i];
      if (e >= AG.SEA || Wd.frozen[i]) continue;
      const depth = (AG.SEA - e) * 16; // (world units below the surface, as view3d's sea floor)
      if (depth > 2.6) continue;
      const t = Wd.tbase[i], hsh = hash(i, 7);
      const n = depth < 1.2 && h01(hsh, 40) < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const u = h01(hsh, k * 3 + 1), v = h01(hsh, k * 3 + 2), w = h01(hsh, k * 3 + 3);
        let kind;
        if (early) kind = w < 0.5 ? 'stromatolite' : w < 0.8 ? 'sponge' : null;
        else if (t > 0.55) kind = w < 0.25 ? 'coral-branch' : w < 0.42 ? 'coral-brain' : w < 0.52 ? 'coral-fan' : w < 0.6 ? 'coral-table' : w < 0.7 ? 'anemone' : w < 0.78 ? 'sponge' : w < 0.86 ? 'seagrass' : null; /* (sand between the heads, for the fish to show against) */
        else if (t < 0.4) kind = w < 0.55 ? 'kelp' : w < 0.8 ? 'seagrass' : null;
        else kind = w < 0.45 ? 'seagrass' : w < 0.6 ? 'sponge' : w < 0.7 ? 'anemone' : null;
        if (!kind) continue;
        const PAL = t > 0.55 ? [[255, 120, 150], [255, 170, 80], [190, 110, 230], [250, 220, 90], [90, 210, 200], [240, 90, 90]] : kind === 'kelp' ? [[110, 140, 60], [130, 120, 50]] : kind === 'seagrass' ? [[90, 150, 80], [110, 160, 90]] : [[200, 170, 120], [180, 120, 140], [150, 160, 190]];
        const c = PAL[(hsh >>> (k * 5)) % PAL.length];
        out.push({ kind, x: x + 0.15 + u * 0.7, y: y + 0.15 + v * 0.7, s: kind === 'kelp' ? 1.2 + w * 1.2 : kind === 'seagrass' ? 0.6 + w * 0.5 : 0.55 + w * 0.6, ry: w * 6.28, c, depth, sway: kind === 'kelp' || kind === 'seagrass' || kind === 'anemone' });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ each frame
  Bi.draw = function (t, wx0, wy0, ws, groundAt, cam) { // (groundAt: the sea floor under water, the ground elsewhere)
    const M = AG.Models3D, Life = AG.Life;
    if (!M || !M.creature || !Life) return;
    const win = `${wx0},${wy0},${ws}`;
    if (win !== anchorWin || anchors.size > 60000) { anchors.clear(); anchorWin = win; }
    // the reef (rebuilt when the window moves)
    if (win !== reefWin) { reefList = buildReef(wx0, wy0, ws); reefWin = win; }
    const cx = cam ? cam.x : wx0 + ws / 2, cy = cam ? cam.y : wy0 + ws / 2, near = Math.max(24, Math.min(ws * 0.5, 70)), near2 = near * near;
    let nr = 0;
    for (const f of reefList) {
      if (nr >= MAX_REEF || Bi.noReef) break;
      const dx = f.x - cx, dy = f.y - cy; if (dx * dx + dy * dy > near2) continue;
      const g = groundAt(f.x, f.y), col = tint(f.c, 1, (SEA_Y - g) / 6);
      M.creature(f.kind, f.x, g, f.y, f.s, f.ry, f.sway ? Math.sin(t * 1.3 + f.x * 0.7 + f.y) * 0.12 : 0, col[0], col[1], col[2]);
      nr++;
    }
    // creatures of the regions in view
    const RS = Life.RS, RW = Life.RW, rx0 = Math.max(0, Math.floor(wx0 / RS)), ry0 = Math.max(0, Math.floor(wy0 / RS)), rx1 = Math.min(RW - 1, Math.floor((wx0 + ws) / RS)), ry1 = Math.min(Life.RH - 1, Math.floor((wy0 + ws) / RS));
    const landToo = AG.mode !== 'watch', L = Life.L, Wd = AG.World, W = AG.W;
    let nSea = 0, nLand = 0;
    const regions = []; for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) regions.push(ry * RW + rx);
    // nearest regions first, so the caps cut the far ones
    regions.sort((a, b) => { const ax = (a % RW + 0.5) * RS - cx, ay = ((a / RW | 0) + 0.5) * RS - cy, bx = (b % RW + 0.5) * RS - cx, by = ((b / RW | 0) + 0.5) * RS - cy; return ax * ax + ay * ay - (bx * bx + by * by); });
    const species = Life.alive().filter((s) => !s.sapient && !s.domestic);
    const share = new Map();
    for (const r of regions) {
      // the sea of a region is filled to a density set by its water, shared among its sea species by
      // their numbers (so open water always teems, and the commonest kind is the one seen most)
      share.clear(); let wsum = 0;
      for (const s of species) { if (!Life.isSea(s.arch)) continue; const R = s.regions.get(r); if (!R || R.n <= 0 || !M.creatureInfo(s.common)) continue; const w = Math.sqrt(R.n); share.set(s, w); wsum += w; }
      const budget = Math.round(Life.env.sea[r] * RS * RS * 0.22);
      for (const s of species) {
        const sea = Life.isSea(s.arch);
        if (!sea && !landToo) continue;
        const R = s.regions.get(r); if (!R || R.n <= 0) continue;
        const kind = s.common, C = M.creatureInfo(kind), modern = !C && !sea;
        if (!C && !modern) continue;
        const want = sea ? Math.min(32, Math.max(1, Math.round(budget * share.get(s) / wsum))) : Math.min(6, Math.max(1, Math.round(Math.sqrt(R.n) * 1.1)));
        const size01 = s.mean[L.SIZE] / 255;
        for (let q = 0; q < want; q++) {
          if (sea ? nSea >= MAX_SEA : nLand >= MAX_LAND) break;
          const a = anchor(s, r, q, sea, sea && C ? Math.min(2.4, Math.max(0.15, M.creatureLen(kind, size01) * M.m2u * (C.mode === 'bottom' || C.mode === 'fixed' ? 0.1 : 0.45))) : 0);
          if (!a) continue;
          if (a.x < wx0 || a.y < wy0 || a.x >= wx0 + ws || a.y >= wy0 + ws) continue;
          const spd = a.sp * (0.4 + s.mean[L.SPEED] / 255) * (C && C.mode === 'fixed' ? 0 : 1), ang = a.ph + t * spd / a.rad;
          let x = a.x + Math.cos(ang) * a.rad, y = a.y + Math.sin(ang) * a.rad;
          const ry = Math.atan2(-Math.sin(ang), Math.cos(ang)) + (spd > 0 ? 0 : a.ph); // (heading along the circle)
          if (sea) {
            const i = (y | 0) * W + (x | 0);
            if (i < 0 || i >= AG.N || Wd.elev[i] >= AG.SEA || depthAt(i) < depthAt((a.y | 0) * W + (a.x | 0)) * 0.6) { x = a.x; y = a.y; } // (keep to the water, and to its depth)
            const real = M.creatureLen(kind, size01) * M.m2u, floor = groundAt(x, y), len = Math.max(real, 0.3 + real * 0.6); // (the small are drawn larger than life, to be seen: a sardine as long as a hand-span of the map)
            const room = SEA_Y - 0.15 - floor;
            if (room < 0.05) continue;
            const dp = C.mode === 'bottom' || C.mode === 'fixed' ? 1 : C.depth;
            let yy = C.mode === 'bottom' || C.mode === 'fixed' ? floor + 0.02 : SEA_Y - 0.25 - (room - Math.min(room, len * 0.4)) * dp + Math.sin(t * 0.8 + a.ph) * 0.06;
            yy = Math.min(yy, SEA_Y - 0.08 - (C.depth > 0.25 ? len * 0.2 : 0)); yy = Math.max(yy, floor + (C.mode === 'bottom' ? 0.01 : len * 0.15));
            const n = C.school > 1 && s.mean[L.SOCIAL] > 110 ? C.school : C.school > 3 ? 3 : 1;
            const col = tint(s.color, 1, (SEA_Y - yy) / 5), roll = Math.sin(t * 4 * spd + a.ph) * 0.15;
            for (let k = 0; k < n && nSea < MAX_SEA; k++) {
              const spread = len * (1.2 + n * 0.12), ox = n > 1 ? (h01(k, a.ph * 1000) - 0.5) * spread : 0, oz = n > 1 ? (h01(k + 50, a.ph * 1000) - 0.5) * spread : 0, oy = n > 1 ? (h01(k + 90, a.ph * 1000) - 0.5) * len * 0.8 : 0;
              if (n > 1) { const j = ((y + oz) | 0) * W + ((x + ox) | 0); if (j < 0 || j >= AG.N || Wd.elev[j] >= AG.SEA) continue; } // (no shoal member over the shore)
              const fl = n > 1 ? Math.max(floor, groundAt(x + ox, y + oz)) : floor; // (a shoal member over a rise keeps above it)
              M.creature(kind, x + ox, Math.max(fl + (C.mode === 'bottom' ? 0.02 : len * 0.2), yy + oy), y + oz, len * (n > 1 ? 0.8 + h01(k, 7) * 0.4 : 1), C.mode === 'drift' ? a.ph : ry, C.mode === 'drift' ? 0 : roll, col[0], col[1], col[2]);
              nSea++;
            }
          } else {
            const i = (y | 0) * W + (x | 0);
            if (i < 0 || i >= AG.N || !Wd.passLand(i)) { x = a.x; y = a.y; }
            const g = groundAt(x, y);
            if (C && C.mode === 'fly') {
              const len = M.creatureLen(kind, size01) * M.m2u, lift = 2.2 + h01(a.ph * 100, 3) * 3 + len;
              M.creature(kind, x, g + lift, y, len, ry, Math.sin(t * 6 + a.ph) * 0.25, s.color[0] / 255, s.color[1] / 255, s.color[2] / 255);
            } else if (C) {
              const len = M.creatureLen(kind, size01) * M.m2u, bob = Math.abs(Math.sin(t * 4 * spd + a.ph)) * 0.02;
              M.creature(kind, x, g + bob, y, len, ry, 0, s.color[0] / 255, s.color[1] / 255, s.color[2] / 255);
            } else M.animalAt(s, x, g, y, ry, 0);
            nLand++;
          }
        }
      }
    }
    Bi.stats = { sea: nSea, land: nLand, reef: nr };
  };
  Bi.reset = function () { anchors.clear(); anchorWin = ''; reefWin = ''; reefList = null; };
})();
