/* AURA: Genesis 2 — models3d.js
 * The look of people, animals and houses in the 3D close-up, taken from what the simulation knows:
 *  - People: clothing from the climate and the era where they live (furs and hooded parkas in the
 *    cold, hide wraps in the Stone Age, woven tunics and dresses in the temperate lands, long robes
 *    and turbans in the dry heat, wraps and bare skin in the tropics), dyed in their realm's colours;
 *    skin and hair from each person's own genome (pigment, the albino allele, grey with age); hair
 *    styles that are a fashion of their people; hats by role (crown, helmet, cowl, turban, feathers,
 *    straw hat). Skin colour itself follows the sun over the generations (people.js).
 *  - Animals: a body plan per species from its gene-derived kind (deer, elk, gazelle, ibex, aurochs,
 *    bison, mammoth, wild horse; wolf, great cat, bear, hyena; ape, monkey; cattle, horses, goats,
 *    sheep), with proportions from its genes (size, speed, strength, cold and heat), a coat from its
 *    pigment and climate, and markings and horns passed down the lineage: when a population cut off
 *    by the sea becomes a new species, it keeps much of its parent's look and changes some of it.
 *    Each animal's own pigment shades its coat; albinos are white; antlers and big horns are male.
 *  - Houses: a style from the climate and terrain of the community and its era: log cabins with
 *    snow on the roof, turf-roofed longhouses, timber and thatch (tiles from the Bronze Age), stone
 *    and slate in the highlands, flat-roofed adobe in the dry heat, palm-thatched stilt houses in
 *    the tropics; temples, halls, huts, tents, granaries and shrines follow suit.
 * Geometry is built once per style or species (merged, vertex-coloured) and drawn instanced. */
'use strict';
(function () {
  const AG = window.AG;
  const M = (AG.Models3D = { ready: false, stats: {}, debug: { style: null, climate: null } }); // (debug: a gallery can force styles)
  let T, GEO, merge, scene, mat;
  const hash = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const rnd01 = (a, b) => hash(a, b) / 4294967296;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cl = (a) => a.map((v) => Math.max(0, Math.min(255, v | 0)));
  const G = (v) => [v, v, v];

  // ============================================================ instanced banks
  // One instanced mesh per model; it grows when a frame needs more copies and hides itself when a
  // frame needs none (no draw call).
  const dummy = { o: null }, col = { c: null };
  function Bank(geo, cap, shadow) { this.geo = geo; this.cap = cap || 32; this.shadow = !!shadow; this.n = 0; this.mesh = null; }
  Bank.prototype.make = function (cap) {
    const old = this.mesh, m = new T.InstancedMesh(this.geo, mat, cap);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.setColorAt(0, col.c.setRGB(1, 1, 1)); m.instanceColor.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = this.shadow; m.receiveShadow = false; m.count = 0; m.visible = false;
    if (old) { // keep what this frame has written so far
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.n * 16));
      m.instanceColor.array.set(old.instanceColor.array.subarray(0, this.n * 3));
      scene.remove(old); if (old.dispose) old.dispose();
    }
    scene.add(m); this.mesh = m; this.cap = cap;
  };
  Bank.prototype.add = function (x, y, z, sx, sy, sz, ry, roll, r, g, b) {
    if (!this.mesh) this.make(this.cap);
    if (this.n >= this.cap) { if (this.cap >= 8192) return; this.make(this.cap * 2); }
    const o = dummy.o;
    o.position.set(x, y, z); o.rotation.set(0, ry, roll || 0); o.scale.set(sx, sy, sz); o.updateMatrix();
    this.mesh.setMatrixAt(this.n, o.matrix);
    this.mesh.setColorAt(this.n, col.c.setRGB(r, g, b));
    this.n++;
  };
  Bank.prototype.end = function () {
    const m = this.mesh; if (!m) return;
    m.count = this.n; m.visible = this.n > 0;
    if (this.n) {
      m.instanceMatrix.updateRange.offset = 0; m.instanceMatrix.updateRange.count = this.n * 16; m.instanceMatrix.needsUpdate = true;
      m.instanceColor.updateRange.offset = 0; m.instanceColor.updateRange.count = this.n * 3; m.instanceColor.needsUpdate = true;
    }
    this.n = 0;
  };
  const banks = new Map(); // key -> Bank, for everything drawn in a frame
  function bank(key, build, shadow) { let b = banks.get(key); if (!b) { b = new Bank(build(), 32, shadow); banks.set(key, b); } return b; }

  // a parts list for merge(): add(geoName, rgb, x, y, z, sx, sy, sz, rx, ry, rz)
  // (t: the surface texture layer of the parts, unless a part names its own)
  function Parts(t) { this.a = []; this.t = t || 0; }
  Parts.prototype.add = function (g, c, x, y, z, sx, sy, sz, rx, ry, rz) { this.a.push({ geo: GEO[g], c, x, y, z, sx, sy, sz, rx: rx || 0, ry: ry || 0, rz: rz || 0 }); return this; };
  Parts.prototype.geo = function () { return merge(this.a, this.t); };
  let TX = {}; // texture layers by name (view3d passes them in)

  M.setup = function (lib) {
    T = lib.THREE; GEO = lib.GEO; merge = lib.merge; scene = lib.scene; mat = lib.material; TX = lib.TL || {};
    dummy.o = new T.Object3D(); col.c = new T.Color();
    // build every person model now (behind the loading screen), so the shader is compiled once
    for (const s of STYLES) { bank('pc' + s, () => clothesGeo(s), true); bank('ps' + s, () => skinGeo(s), false); }
    for (let h = 0; h < HAIRS; h++) bank('ph' + h, () => hairGeo(h), false);
    for (const h of HATS) bank('pt' + h, () => hatGeo(h), false);
    M.ready = true;
  };
  M.endFrame = function () {
    let n = 0, meshes = 0;
    for (const b of banks.values()) { n += b.n; if (b.n) meshes++; b.end(); }
    M.stats = { instances: n, meshes }; M.drawn = drawn; drawn = 0;
  };
  // a new world (or another timeline): species ids and people start over, so their models do too
  M.reset = function () {
    for (const [key, b] of banks) {
      b.n = 0; b.end();
      if (typeof key === 'number') { /* an animal model */ if (b.mesh) { scene.remove(b.mesh); if (b.mesh.dispose) b.mesh.dispose(); } if (b.geo.dispose) b.geo.dispose(); banks.delete(key); }
    }
    looks.clear(); morphs.clear();
  };
  M.clearLooks = () => looks.clear();

  // ============================================================ climate where people live
  // snow, cold, temperate, stone (highlands), dry, tropic
  function climateAt(x, y) {
    const Wd = AG.World, i = AG.clamp(y | 0, 0, AG.H - 1) * AG.W + AG.clamp(x | 0, 0, AG.W - 1);
    const t = Wd.tbase[i], m = Wd.moist[i], e = Wd.elev[i];
    if (t < 0.16) return 'snow';
    if (t < 0.32) return 'cold';
    if (e > AG.MOUNTAIN - 0.05) return 'stone';
    if (t > 0.64 && m > 0.42) return 'tropic';
    if (t > 0.55 && m < 0.34) return 'dry';
    return 'temperate';
  }
  M.climateAt = climateAt;

  // ============================================================ people
  // Built facing +z, feet at y = 0, about 0.5 tall; drawn at the game's figure scale.
  const STYLES = ['fur', 'hide', 'tunic', 'dress', 'robe', 'wrap', 'wrapf'];
  const HAIRS = 6; // 0 brows only (under a hood), 1 short, 2 long, 3 bun, 4 beard, 5 braids
  const HATS = ['crown', 'helmet', 'cowl', 'turban', 'feathers', 'straw'];
  function head(p) { // skin: head, ears, face
    p.add('box', G(255), 0, 0.355, 0, 0.1, 0.105, 0.095);
    p.add('box', G(236), -0.052, 0.385, -0.004, 0.012, 0.03, 0.022).add('box', G(236), 0.052, 0.385, -0.004, 0.012, 0.03, 0.022);
    p.add('box', G(232), 0, 0.382, 0.049, 0.016, 0.024, 0.016); // nose
    p.add('box', G(26), -0.022, 0.405, 0.048, 0.016, 0.016, 0.004).add('box', G(26), 0.022, 0.405, 0.048, 0.016, 0.016, 0.004); // eyes
    p.add('box', G(250), -0.026, 0.408, 0.0485, 0.006, 0.006, 0.003).add('box', G(250), 0.018, 0.408, 0.0485, 0.006, 0.006, 0.003); // a glint
    p.add('box', G(150), 0, 0.368, 0.048, 0.03, 0.006, 0.003); // mouth
    p.add('box', G(240), 0, 0.33, 0, 0.042, 0.03, 0.042); // neck
  }
  function hands(p) { for (const sx of [-1, 1]) p.add('box', G(245), sx * 0.093, 0.15, 0.01, 0.034, 0.034, 0.034); }
  function bareArms(p, from) { for (const sx of [-1, 1]) p.add('box', G(250), sx * 0.093, from || 0.18, 0, 0.038, 0.32 - (from || 0.18), 0.042); }
  function bareLegs(p, to) { for (const sx of [-1, 1]) p.add('box', G(250), sx * 0.035, 0.02, 0, 0.044, (to || 0.15) - 0.02, 0.048); }
  function bareFeet(p) { for (const sx of [-1, 1]) p.add('box', G(240), sx * 0.035, 0, 0.012, 0.046, 0.024, 0.072); }
  function skinGeo(s) {
    const p = new Parts();
    head(p); hands(p);
    if (s === 'hide') { bareArms(p); bareLegs(p, 0.1); p.add('box', G(250), -0.04, 0.29, 0, 0.065, 0.045, 0.07); }
    if (s === 'robe') bareFeet(p);
    if (s === 'wrap') { p.add('box', G(250), 0, 0.19, 0, 0.135, 0.145, 0.075); p.add('box', G(238), 0, 0.27, 0.036, 0.1, 0.004, 0.004); bareArms(p); bareLegs(p, 0.12); bareFeet(p); }
    if (s === 'wrapf') { p.add('box', G(250), 0, 0.29, 0, 0.13, 0.045, 0.074); bareArms(p); bareLegs(p, 0.08); bareFeet(p); }
    return p.geo();
  }
  function clothesGeo(s) {
    const p = new Parts(s === 'fur' ? TX.FUR : s === 'hide' ? TX.HIDE : TX.CLOTH);
    const boots = (v, h, w) => { for (const sx of [-1, 1]) p.add('box', G(v), sx * 0.036, 0, 0.012, w || 0.052, h || 0.045, 0.078); };
    const trousers = (v) => { for (const sx of [-1, 1]) p.add('box', G(v), sx * 0.035, 0.04, 0, 0.047, 0.12, 0.052); };
    const sleeves = (v, w) => { for (const sx of [-1, 1]) p.add('box', G(v), sx * 0.095, 0.185, 0, w || 0.045, 0.14, (w || 0.045) + 0.005); };
    const beads = () => { for (let q = 0; q < 7; q++) { const a = -1.2 + q * 0.4; p.add('cbox', G(255), Math.sin(a) * 0.035, 0.318 - Math.cos(a) * 0.012, 0.03 + Math.cos(a) * 0.012, 0.011, 0.011, 0.011); } };
    switch (s) {
      case 'fur': // a hooded parka with fur trim, fur trousers and boots
        boots(110, 0.055, 0.058); trousers(170);
        p.add('box', G(225), 0, 0.13, 0, 0.17, 0.205, 0.105);
        p.add('box', G(255), 0, 0.125, 0, 0.178, 0.025, 0.112);
        for (const sx of [-1, 1]) { p.add('box', G(215), sx * 0.098, 0.17, 0, 0.052, 0.16, 0.056); p.add('box', G(255), sx * 0.098, 0.163, 0, 0.056, 0.02, 0.06); }
        p.add('box', G(205), 0, 0.345, -0.058, 0.125, 0.13, 0.03); p.add('box', G(205), 0, 0.46, -0.005, 0.125, 0.03, 0.12);
        for (const sx of [-1, 1]) { p.add('box', G(205), sx * 0.058, 0.345, -0.005, 0.02, 0.12, 0.11); p.add('box', G(255), sx * 0.06, 0.345, 0.055, 0.02, 0.12, 0.02); }
        p.add('box', G(255), 0, 0.452, 0.055, 0.13, 0.022, 0.02);
        p.add('box', G(120), 0, 0.2, 0.054, 0.02, 0.1, 0.004); // the front seam
        break;
      case 'hide': // a one-shouldered hide with a ragged hem, a belt and foot wraps
        p.add('box', G(225), 0, 0.12, 0, 0.15, 0.17, 0.09);
        p.add('box', G(225), 0.035, 0.29, 0, 0.08, 0.045, 0.092);
        for (const [x, h] of [[-0.055, 0.03], [-0.018, 0.045], [0.018, 0.028], [0.055, 0.042]]) p.add('box', G(205), x, 0.12 - h + 0.012, 0, 0.034, h, 0.094);
        p.add('box', G(90), 0, 0.2, 0, 0.155, 0.018, 0.096);
        p.add('box', G(60), 0.05, 0.165, 0.048, 0.022, 0.035, 0.01); // a pouch
        boots(150, 0.045, 0.05);
        break;
      case 'tunic': // a belted tunic, trousers and boots
        boots(70); trousers(130);
        p.add('box', G(235), 0, 0.14, 0, 0.152, 0.195, 0.09);
        p.add('box', G(80), 0, 0.205, 0, 0.158, 0.02, 0.096); p.add('box', G(255), 0, 0.205, 0.049, 0.02, 0.016, 0.004);
        sleeves(225); p.add('box', G(170), 0, 0.322, 0, 0.1, 0.015, 0.094);
        for (const sx of [-1, 1]) p.add('box', G(160), sx * 0.095, 0.185, 0, 0.049, 0.018, 0.054); // cuffs
        break;
      case 'dress': // a long dress with a sash
        boots(70, 0.03, 0.048);
        p.add('taper', G(230), 0, 0.02, 0, 0.2, 0.19, 0.14);
        p.add('taper', G(150), 0, 0.02, 0, 0.206, 0.02, 0.146);
        p.add('box', G(235), 0, 0.2, 0, 0.135, 0.13, 0.082);
        p.add('box', G(110), 0, 0.2, 0, 0.14, 0.022, 0.088); p.add('box', G(110), 0.03, 0.15, 0.044, 0.022, 0.06, 0.006);
        sleeves(225, 0.042); p.add('box', G(255), 0, 0.322, 0.0, 0.09, 0.012, 0.086);
        break;
      case 'robe': // a long robe with wide sleeves and a sash, sandals
        for (const sx of [-1, 1]) p.add('box', G(80), sx * 0.035, 0, 0.012, 0.048, 0.008, 0.075);
        p.add('taper', G(240), 0, 0.015, 0, 0.21, 0.32, 0.15);
        p.add('taper', G(180), 0, 0.015, 0, 0.214, 0.022, 0.154);
        p.add('box', G(120), 0, 0.2, 0, 0.15, 0.024, 0.1); p.add('box', G(120), -0.04, 0.12, 0.05, 0.024, 0.085, 0.006);
        for (const sx of [-1, 1]) p.add('box', G(230), sx * 0.1, 0.165, 0, 0.062, 0.155, 0.066);
        p.add('box', G(200), 0, 0.31, 0.044, 0.04, 0.025, 0.006); // the neckline
        break;
      case 'wrap': // a wrapped skirt with a striped band, a bead necklace and armbands
        p.add('box', G(235), 0, 0.1, 0, 0.15, 0.09, 0.09); p.add('box', G(140), 0, 0.122, 0, 0.152, 0.016, 0.092);
        p.add('box', G(140), 0.02, 0.165, 0.047, 0.03, 0.03, 0.008);
        beads(); for (const sx of [-1, 1]) p.add('box', G(200), sx * 0.093, 0.29, 0, 0.042, 0.012, 0.046);
        break;
      case 'wrapf': // a wrap from chest to knee with bands, a bead necklace
        p.add('box', G(235), 0, 0.07, 0, 0.15, 0.24, 0.09);
        for (const y of [0.12, 0.265]) p.add('box', G(140), 0, y, 0, 0.152, 0.016, 0.092);
        beads(); for (const sx of [-1, 1]) p.add('box', G(200), sx * 0.093, 0.2, 0, 0.042, 0.012, 0.046);
        break;
    }
    return p.geo();
  }
  function hairGeo(h) {
    const p = new Parts(TX.FUR);
    p.add('box', G(200), -0.022, 0.418, 0.0485, 0.022, 0.007, 0.004).add('box', G(200), 0.022, 0.418, 0.0485, 0.022, 0.007, 0.004); // brows
    if (!h) return p.geo();
    const top = () => { p.add('box', G(255), 0, 0.452, -0.004, 0.108, 0.024, 0.103); p.add('box', G(250), 0, 0.44, 0.046, 0.1, 0.016, 0.01); };
    const back = (y0, hgt) => { p.add('box', G(240), 0, y0, -0.05, 0.108, hgt, 0.014); for (const sx of [-1, 1]) p.add('box', G(240), sx * 0.051, Math.max(y0, 0.37), -0.015, 0.009, Math.min(hgt, 0.08), 0.07); };
    top();
    if (h === 1 || h === 4) back(0.375, 0.08);
    if (h === 2) { back(0.29, 0.165); for (const sx of [-1, 1]) p.add('box', G(235), sx * 0.054, 0.31, 0.004, 0.012, 0.13, 0.05); }
    if (h === 3) { back(0.37, 0.085); p.add('box', G(230), 0, 0.452, -0.05, 0.052, 0.05, 0.05); p.add('box', G(180), 0, 0.47, -0.05, 0.03, 0.012, 0.054); }
    if (h === 4) { p.add('box', G(235), 0, 0.33, 0.028, 0.088, 0.05, 0.042); p.add('box', G(245), 0, 0.374, 0.049, 0.052, 0.01, 0.006); }
    if (h === 5) { back(0.36, 0.095); for (const sx of [-1, 1]) { p.add('box', G(235), sx * 0.045, 0.25, -0.036, 0.022, 0.13, 0.022); p.add('box', G(140), sx * 0.045, 0.24, -0.036, 0.024, 0.014, 0.024); } }
    return p.geo();
  }
  function hatGeo(t) {
    const p = new Parts(t === 'straw' ? TX.THATCH : t === 'cowl' || t === 'turban' ? TX.CLOTH : t === 'feathers' ? TX.FUR : 0);
    switch (t) {
      case 'crown':
        p.add('box', G(255), 0, 0.448, 0, 0.112, 0.026, 0.106);
        for (const [x, z] of [[-0.045, 0.045], [0, 0.047], [0.045, 0.045], [-0.05, -0.04], [0.05, -0.04]]) p.add('box', G(255), x, 0.474, z, 0.016, 0.024, 0.012);
        p.add('box', G(110), 0, 0.452, 0.054, 0.018, 0.014, 0.004);
        break;
      case 'helmet':
        p.add('box', G(255), 0, 0.432, 0, 0.116, 0.05, 0.11); p.add('box', G(220), 0, 0.428, 0, 0.124, 0.012, 0.118);
        p.add('box', G(230), 0, 0.385, 0.052, 0.012, 0.045, 0.008); p.add('box', G(200), 0, 0.482, -0.01, 0.014, 0.022, 0.09);
        for (const sx of [-1, 1]) p.add('box', G(235), sx * 0.054, 0.36, 0.01, 0.01, 0.07, 0.05); // cheek guards
        break;
      case 'cowl':
        p.add('box', G(235), 0, 0.29, -0.055, 0.13, 0.18, 0.026); p.add('box', G(235), 0, 0.458, -0.004, 0.126, 0.028, 0.116);
        for (const sx of [-1, 1]) p.add('box', G(225), sx * 0.059, 0.33, -0.002, 0.018, 0.14, 0.112);
        break;
      case 'turban':
        p.add('box', G(240), 0, 0.432, 0, 0.12, 0.048, 0.114); p.add('box', G(222), 0, 0.472, -0.004, 0.102, 0.026, 0.098);
        p.add('box', G(205), 0, 0.445, 0.058, 0.13, 0.012, 0.006, 0, 0, 0.5); p.add('box', G(215), 0.025, 0.35, -0.062, 0.032, 0.09, 0.012);
        break;
      case 'feathers':
        p.add('box', G(120), 0, 0.425, 0, 0.112, 0.016, 0.106);
        for (const [x, rz] of [[-0.022, 0.35], [0, 0], [0.022, -0.35]]) { p.add('box', G(255), x, 0.44, -0.05, 0.016, 0.09, 0.006, 0, 0, rz); p.add('box', G(150), x, 0.44, -0.05, 0.018, 0.022, 0.007, 0, 0, rz); }
        break;
      case 'straw':
        p.add('cyl', G(255), 0, 0.45, 0, 0.3, 0.01, 0.3); p.add('taper', G(235), 0, 0.452, 0, 0.17, 0.05, 0.17); p.add('cyl', G(150), 0, 0.456, 0, 0.13, 0.014, 0.13); // a flat-topped crown
        break;
    }
    return p.geo();
  }
  // skin, from very fair to very dark; the people's range of pigment is spread over all of it
  const SKIN = [[248, 226, 210], [238, 202, 176], [226, 180, 142], [204, 150, 108], [172, 118, 80], [134, 88, 58], [98, 62, 42], [68, 44, 32]];
  function skinOf(pig, albino) {
    if (albino) return [250, 234, 228];
    const t = AG.clamp((pig - 50) / 170, 0, 1) * (SKIN.length - 1), k = Math.min(SKIN.length - 2, Math.floor(t));
    return mix(SKIN[k], SKIN[k + 1], t - k);
  }
  M.skinOf = skinOf;
  function hairOf(pig, albino, neutral, age) {
    let c;
    if (albino) c = [242, 236, 216];
    else if (pig < 70) c = neutral % 5 === 0 ? [184, 88, 44] : mix([236, 206, 132], [196, 150, 84], pig / 70); // fair: blond, sometimes red
    else if (pig < 130) c = neutral % 7 === 0 ? [150, 70, 38] : mix([150, 104, 60], [78, 52, 34], (pig - 70) / 60);
    else c = mix([66, 44, 30], [28, 22, 20], Math.min(1, (pig - 130) / 90));
    if (age > 45) c = mix(c, [196, 196, 192], Math.min(1, (age - 45) / 22));
    return c;
  }
  const LINEN = [214, 202, 174], WOOL = [178, 156, 120], OCHRE = [168, 112, 64];
  const FURS = [[156, 116, 80], [122, 98, 76], [206, 194, 170], [98, 80, 66], [176, 142, 100]];
  const HIDES = [[170, 126, 84], [150, 106, 66], [190, 150, 104], [134, 98, 64]];
  const looks = new Map();
  // Everything about a person's look that does not change from moment to moment, worked out once
  // and kept until their realm, role, era or age band changes.
  function lookOf(i) {
    const U = AG.U, Civ = AG.Civ, uid = U.uid[i], kd = U.kd[i], job = U.job[i], king = U.flags[i] & AG.FL.KING ? 1 : 0, age = U.age[i];
    const c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null, era = c ? c.era : 0;
    const stamp = kd * 1e6 + job * 1e4 + king * 1000 + era * 100 + Math.min(99, (age / 8) | 0);
    let L = looks.get(uid);
    if (L && L.stamp === stamp) return L;
    const male = U.sex[i] === 1, child = job === AG.J.CHILD, o = i * AG.Life.GL, LL = AG.Life.L;
    const pig = AG.Life.express(U.gen, o, LL.HUE), albino = AG.Life.isAlbino(U.gen, o), neutral = U.gen[o + 2 * LL.NEUTRAL];
    const clim = M.debug.climate ? M.debug.climate(uid) : climateAt(c ? c.x : U.x[i], c ? c.y : U.y[i]);
    const kc = kd >= 0 && Civ.kingdoms[kd] ? Civ.kingdoms[kd].color : [150, 150, 150];
    const fashion = hash(kd + 7, c ? c.lang : 0), h = hash(uid, 91);
    let style;
    if (job === AG.J.PRIEST) style = 'robe';
    else if (clim === 'snow' || clim === 'cold') style = 'fur';
    else if (clim === 'tropic') style = male || child ? 'wrap' : 'wrapf';
    else if (era <= 1) style = 'hide';
    else if (clim === 'dry') style = 'robe';
    else style = male || child ? 'tunic' : 'dress';
    // cloth: natural furs and hides early; later woven cloth, dyed more richly with every era
    let cloth;
    if (job === AG.J.PRIEST) cloth = [238, 232, 216];
    else if (style === 'fur') cloth = FURS[h % FURS.length];
    else if (style === 'hide') cloth = HIDES[h % HIDES.length];
    else {
      const dye = era <= 2 ? 0.35 : era <= 4 ? 0.6 : 0.82, kc2 = [kc[1], kc[2], kc[0]], pick = king ? 0 : h % 5;
      cloth = pick === 0 ? mix(LINEN, kc, Math.min(1, dye + (king ? 0.3 : 0))) : pick === 1 ? mix(LINEN, kc2, dye * 0.8) : pick === 2 ? LINEN : pick === 3 ? WOOL : mix(OCHRE, kc, dye * 0.4);
      if (style === 'robe' && clim === 'dry') cloth = mix(cloth, [236, 226, 204], 0.45); // pale cloth in the sun
      if (job === AG.J.SOLDIER) cloth = mix(kc, [70, 60, 50], 0.35);
    }
    // hair: a fashion of the people, with some going their own way
    let hair;
    if (style === 'fur') hair = 0;
    else if (child) hair = male ? 1 : 2;
    else {
      const own = (h >>> 8) % 4 === 0 ? h >>> 12 : fashion;
      hair = male ? [1, 4, 2, 1, 4][own % 5] : [2, 3, 5, 2, 3][own % 5];
      if (male && age > 40 && (h >>> 4) % 3 === 0) hair = 4;
    }
    let hat = null, hatC = [255, 255, 255];
    if (king) { hat = 'crown'; hatC = [236, 190, 72]; }
    else if (job === AG.J.SOLDIER) { hat = 'helmet'; hatC = era >= 5 ? [150, 154, 164] : era >= 4 ? [200, 152, 80] : [128, 92, 58]; }
    else if (job === AG.J.PRIEST) { hat = 'cowl'; hatC = cloth; }
    else if (!child && style === 'robe' && clim === 'dry') { hat = 'turban'; hatC = (h >>> 3) % 3 ? [240, 234, 220] : mix(kc, LINEN, 0.4); }
    else if (!child && (style === 'wrap' || style === 'wrapf') && (h >>> 5) % 3 === 0) { hat = 'feathers'; hatC = mix(kc, [255, 255, 255], 0.2); }
    else if (!child && job === AG.J.FARM && era >= 2 && clim !== 'snow' && clim !== 'cold' && (h >>> 6) % 5 < 2) { hat = 'straw'; hatC = [222, 196, 120]; }
    L = { stamp, style, hair, hat, cloth: cl(cloth), skin: cl(skinOf(pig, albino)), hairC: cl(hairOf(pig, albino, neutral, age)), hatC: cl(hatC) };
    looks.set(uid, L);
    if (looks.size > 12000) looks.clear();
    return L;
  }
  M.lookOf = lookOf;
  // one person: clothes, skin, hair and maybe a hat (each its own instanced model)
  let drawn = 0; // bodies drawn this frame
  M.person = function (i, x, y, z, k, ry, roll) {
    drawn++;
    const L = lookOf(i), c = L.cloth, s = L.skin, hc = L.hairC;
    bank('pc' + L.style).add(x, y, z, k, k, k, ry, roll, c[0] / 255, c[1] / 255, c[2] / 255);
    bank('ps' + L.style).add(x, y, z, k, k, k, ry, roll, s[0] / 255, s[1] / 255, s[2] / 255);
    bank('ph' + L.hair).add(x, y, z, k, k, k, ry, roll, hc[0] / 255, hc[1] / 255, hc[2] / 255);
    if (L.hat) { const t = L.hatC; bank('pt' + L.hat).add(x, y, z, k, k, k, ry, roll, t[0] / 255, t[1] / 255, t[2] / 255); }
    return L;
  };

  // ============================================================ animals
  const KIND = { deer: 'deer', elk: 'elk', gazelle: 'gazelle', ibex: 'ibex', goats: 'ibex', aurochs: 'bovine', cattle: 'bovine', bison: 'bison', mammoth: 'mammoth', 'wild horse': 'horse', horses: 'horse', sheep: 'sheep', 'herd beast': 'bovine',
    wolf: 'wolf', 'great cat': 'cat', bear: 'bear', hyena: 'hyena', 'great ape': 'ape', hominin: 'ape', monkey: 'monkey' };
  const COAT = { deer: [170, 106, 62], elk: [138, 96, 64], gazelle: [208, 154, 96], ibex: [150, 128, 100], bovine: [92, 60, 40], bison: [104, 72, 46], mammoth: [132, 88, 56], horse: [146, 90, 52], sheep: [228, 220, 202],
    wolf: [134, 130, 124], cat: [206, 156, 88], bear: [108, 74, 48], hyena: [180, 152, 108], ape: [70, 56, 46], monkey: [132, 108, 84] };
  const PATTERNS = { deer: ['belly', 'spots', 'belly', 'saddle'], elk: ['belly', 'saddle'], gazelle: ['side', 'side', 'belly'], ibex: ['belly', 'saddle', 'dorsal'], bovine: ['plain', 'blaze', 'dorsal'], bison: ['plain'], mammoth: ['plain'],
    horse: ['points', 'dorsal', 'stripes', 'plain'], sheep: ['plain'], wolf: ['saddle', 'belly', 'plain'], cat: ['spots', 'stripes', 'plain', 'spots'], bear: ['plain', 'blaze'], hyena: ['spots', 'stripes'], ape: ['plain', 'pale'], monkey: ['pale', 'ring'] };
  const kindOf = (sp) => KIND[sp.common || AG.Life.commonName(sp)] || ({ 0: 'deer', 1: 'wolf', 3: 'ape' }[sp.arch] || 'deer');
  // A species' markings pass down its lineage: a daughter species keeps most of its parent's look.
  // Its body follows its genes as they evolve: every couple of seconds the species' shape signature
  // (kind, speed, strength, cold and heat build, pigment) is checked, and when it has moved its model
  // is rebuilt (a deer line that grows big and cold-built becomes an elk, then perhaps a mammoth).
  const morphs = new Map();
  const shapeSig = (sp, kind) => { const g = sp.mean, L = AG.Life.L; return kind + ((g[L.SPEED] / 20) | 0) + ',' + ((g[L.STR] / 20) | 0) + ',' + ((g[L.COLD] / 24) | 0) + ',' + ((g[L.HEAT] / 24) | 0) + ',' + ((g[L.HUE] / 20) | 0); };
  function dropModels(sid) { // an animal bank key is ((sid * 12 + variant * 4 + albino * 2 + sex) * 64 + version)
    for (const [key, b] of banks) {
      if (typeof key !== 'number' || Math.floor(key / 768) !== sid) continue;
      if (b.mesh) { scene.remove(b.mesh); if (b.mesh.dispose) b.mesh.dispose(); }
      if (b.geo.dispose) b.geo.dispose();
      banks.delete(key);
    }
  }
  function morphOf(sp) {
    let m = morphs.get(sp.id);
    if (m) {
      const now = performance.now();
      if (now - m.seen >= 2000) {
        m.seen = now;
        const kind = kindOf(sp), sig = shapeSig(sp, kind);
        if (sig !== m.sig) {
          if (kind !== m.kind) { m.kind = kind; const pats = PATTERNS[kind] || ['plain']; if (!pats.includes(m.pattern)) m.pattern = pats[hash(sp.id, 2) % pats.length]; }
          m.sig = sig; m.ver = (m.ver + 1) & 63; dropModels(sp.id);
        }
      }
      return m;
    }
    const kind = kindOf(sp), parent = sp.parent >= 0 ? AG.Life.species[sp.parent] : null;
    const pm = parent && parent.arch === sp.arch ? morphOf(parent) : null, pats = PATTERNS[kind] || ['plain'];
    const keep = (k) => pm && rnd01(sp.id, k) < 0.6;
    m = {
      kind,
      pattern: keep(1) && pats.includes(pm.pattern) ? pm.pattern : pats[hash(sp.id, 2) % pats.length],
      horn: keep(3) ? pm.horn : hash(sp.id, 4) % 3,
      hue: (keep(5) ? pm.hue : 0) + (rnd01(sp.id, 6) - 0.5) * 0.16, // a small shift of the coat colour along the lineage
      ear: (keep(7) ? pm.ear : 1) * (0.85 + rnd01(sp.id, 8) * 0.3),
      seed: keep(9) ? pm.seed : hash(sp.id, 10),
      sig: shapeSig(sp, kind), ver: 0, seen: performance.now(),
    };
    morphs.set(sp.id, m);
    return m;
  }
  M.morphOf = morphOf;
  // the coat: the family's colour, darkened by the species' pigment, paled by the cold
  function coatOf(sp, m, albino) {
    if (albino) return { coat: [242, 238, 230], dark: [226, 180, 176], belly: [250, 248, 242], eye: [200, 60, 60] };
    const L = AG.Life.L, hue = sp.mean[L.HUE] / 255, cold = sp.mean[L.COLD] / 255;
    let c = mul(COAT[m.kind] || [160, 120, 80], 1.32 - hue * 0.72);
    const sh = m.hue; c = [c[0] * (1 + sh), c[1], c[2] * (1 - sh)];
    if (cold > 0.62 && m.kind !== 'mammoth' && m.kind !== 'bison') c = mix(c, [232, 230, 224], Math.min(0.75, (cold - 0.62) * 1.8)); // winter-white in the far cold
    if (m.kind === 'sheep') c = mix([236, 230, 214], c, 0.2);
    c = cl(c);
    return { coat: c, dark: cl(mul(c, 0.5)), belly: cl(mix(c, [240, 232, 214], 0.62)), eye: [24, 18, 14] };
  }
  // domestic herds come in several colours (a sign of domestication)
  const DOM = [[[36, 30, 28], [238, 234, 226]], [[150, 82, 46], [238, 230, 214]], [[214, 196, 168], [120, 84, 56]]];
  function animalGeo(sp, sex, albino, variant) {
    const m = morphOf(sp), L = AG.Life.L, g = sp.mean;
    const n = (k) => g[k] / 255;
    let C = coatOf(sp, m, albino);
    let pattern = m.pattern;
    if (sp.domestic && !albino) {
      if (m.kind === 'sheep') { const w = [[238, 230, 212], [134, 94, 62], [52, 46, 42]][variant % 3]; C = { coat: w, dark: variant === 2 ? [30, 26, 24] : [60, 50, 44], belly: w, eye: [24, 18, 14] }; pattern = 'plain'; } // wool: cream, brown or black
      else { const d = DOM[variant % DOM.length]; C = { coat: d[0], dark: cl(mul(d[0], 0.6)), belly: d[1], eye: [24, 18, 14] }; pattern = variant === 0 ? 'piebald' : variant === 1 ? 'blaze' : 'plain'; }
    }
    const p = new Parts(TX.FUR), coat = C.coat, dark = C.dark, belly = C.belly, eye = C.eye, ivory = [232, 222, 196], hoof = [52, 42, 36], nose = [40, 32, 30];
    const kind = m.kind, male = sex === 1, rs = hash(m.seed, 77);
    // body plan (body length, height, width; leg length and thickness; neck; head), from the kind
    // and nudged by the genes: fast species are leggier, strong ones stockier, cold ones furrier
    const spd = n(L.SPEED), str = n(L.STR), cold = n(L.COLD), heat = n(L.HEAT);
    const B = {
      deer: [0.36, 0.13, 0.14, 0.17, 0.034, 0.13, 1.0, 0.07, 0.075, 0.1], elk: [0.42, 0.16, 0.16, 0.19, 0.04, 0.15, 0.9, 0.08, 0.085, 0.12],
      gazelle: [0.3, 0.11, 0.11, 0.19, 0.026, 0.12, 1.05, 0.06, 0.065, 0.09], ibex: [0.32, 0.14, 0.15, 0.13, 0.04, 0.1, 0.9, 0.07, 0.075, 0.09],
      bovine: [0.44, 0.2, 0.2, 0.13, 0.052, 0.07, 0.35, 0.1, 0.1, 0.13], bison: [0.44, 0.21, 0.21, 0.12, 0.055, 0.06, 0.25, 0.11, 0.11, 0.12],
      mammoth: [0.5, 0.3, 0.28, 0.2, 0.08, 0.05, 0.4, 0.2, 0.22, 0.17], horse: [0.42, 0.16, 0.15, 0.2, 0.04, 0.17, 0.95, 0.07, 0.08, 0.16],
      sheep: [0.3, 0.17, 0.2, 0.09, 0.03, 0.06, 0.6, 0.07, 0.07, 0.09], wolf: [0.34, 0.11, 0.11, 0.14, 0.03, 0.07, 0.7, 0.08, 0.07, 0.09],
      cat: [0.38, 0.11, 0.12, 0.12, 0.035, 0.05, 0.5, 0.09, 0.08, 0.08], bear: [0.4, 0.19, 0.2, 0.12, 0.06, 0.05, 0.4, 0.11, 0.1, 0.11],
      hyena: [0.34, 0.14, 0.12, 0.15, 0.035, 0.08, 0.6, 0.09, 0.085, 0.1], ape: [0.24, 0.2, 0.17, 0.12, 0.05, 0.03, 0.5, 0.1, 0.1, 0.09], monkey: [0.2, 0.1, 0.09, 0.1, 0.025, 0.03, 0.5, 0.06, 0.06, 0.06],
    }[kind] || [0.36, 0.13, 0.14, 0.17, 0.034, 0.13, 1.0, 0.07, 0.075, 0.1];
    let [len, ht, wid, leg, legW, neckL, rise, hw, hh, hl] = B;
    leg *= 0.85 + spd * 0.3; legW *= 0.85 + str * 0.35; wid *= 0.9 + str * 0.2; ht *= 0.92 + str * 0.16;
    const y0 = leg, yTop = leg + ht, zF = len / 2, zB = -len / 2;
    // legs: coat above, darker (or hoofed) below; 'points' darkens the lower legs
    const xL = wid / 2 - legW / 2 - 0.004, zl = [zF - legW * 0.9, zB + legW * 0.9];
    const front = kind === 'hyena' ? 1.15 : kind === 'ape' ? 1.45 : 1, backK = kind === 'hyena' ? 0.85 : kind === 'ape' ? 0.85 : 1;
    for (const sx of [-1, 1]) for (let f = 0; f < 2; f++) {
      const L2 = leg * (f === 0 ? front : backK), z = zl[f];
      p.add('box', pattern === 'points' || kind === 'bison' && f === 0 ? dark : coat, sx * xL, 0.018, z, legW, L2 - 0.018 + (f === 0 && front > 1 ? 0 : 0), legW);
      p.add('box', kind === 'cat' || kind === 'wolf' || kind === 'bear' || kind === 'hyena' || kind === 'ape' || kind === 'monkey' ? dark : hoof, sx * xL, 0, z + 0.004, legW * 1.05, 0.02, legW * 1.15);
    }
    // body (the ape's leans forward on its long arms)
    const bodyRx = kind === 'ape' ? -0.5 : kind === 'hyena' ? -0.12 : 0, bodyY = y0 + (kind === 'ape' ? 0.03 : 0);
    p.add('cbox', coat, 0, bodyY + ht / 2, 0, wid, ht, len, bodyRx);
    if (kind === 'sheep') for (let q = 0; q < 9; q++) { const a = q * 2.4; p.add('ico', mix(coat, [255, 255, 255], 0.15 + (q % 3) * 0.08), Math.sin(a) * wid * 0.32, bodyY + ht * (0.55 + 0.3 * ((q * 7) % 3) / 3), Math.cos(a * 1.3) * len * 0.34, wid * 0.7, ht * 0.7, len * 0.5); }
    // markings, placed on the body and turned with it (the ape's leans forward)
    const cy = bodyY + ht / 2, cR = Math.cos(bodyRx), sR = Math.sin(bodyRx);
    const ov = (c, dx, dy, dz, sx, sy, sz) => p.add('cbox', c, dx, cy + dy * cR - dz * sR, dy * sR + dz * cR, sx, sy, sz, bodyRx);
    const sideX = wid / 2 + 0.003;
    if (pattern === 'belly' || pattern === 'pale' || kind === 'deer' || kind === 'gazelle') ov(belly, 0, -ht * 0.34, 0, wid + 0.004, ht * 0.34, len * 0.86);
    if (pattern === 'saddle') ov(dark, 0, ht * 0.29, -len * 0.06, wid + 0.005, ht * 0.44, len * 0.66);
    if (pattern === 'dorsal') ov(dark, 0, ht / 2, 0, 0.02, 0.008, len * 0.96);
    if (pattern === 'side') { ov(dark, 0, -ht * 0.06, 0, wid + 0.006, ht * 0.12, len * 0.82); ov(belly, 0, -ht * 0.32, 0, wid + 0.004, ht * 0.36, len * 0.84); }
    if (pattern === 'stripes') for (let q = 0; q < 7; q++) ov(dark, 0, ht * 0.08, -len / 2 + (q + 0.6) * (len / 7.4), wid + 0.006, ht * 0.86, 0.016 + (q % 2) * 0.006);
    if (pattern === 'spots') for (let q = 0; q < 16; q++) { const r1 = hash(rs, q) / 4294967296, r2 = hash(rs, q + 50) / 4294967296; ov(dark, (q % 2 ? 1 : -1) * sideX, (r1 - 0.45) * ht * 0.7, -len / 2 + 0.03 + r2 * (len - 0.06), 0.006, 0.022, 0.024); }
    if (pattern === 'piebald') for (let q = 0; q < 4; q++) { const r1 = hash(rs, q + 9) / 4294967296; ov(belly, 0, (r1 - 0.3) * ht * 0.5, -len / 2 + 0.1 + q * len * 0.22, wid + 0.006, ht * (0.35 + r1 * 0.3), len * 0.14); }
    if (kind === 'bison' || kind === 'mammoth' || (cold > 0.6 && (kind === 'ibex' || kind === 'bovine' || kind === 'bear'))) { // shaggy fur hanging below the body
      for (let q = 0; q < 5; q++) ov(dark, 0, -ht / 2, -len / 2 + (q + 0.5) * (len / 5), wid * 1.04, 0.05 + (q % 2) * 0.012, len / 6);
    }
    if (kind === 'bison') ov(dark, 0, ht * 0.55, len * 0.25, wid * 1.08, ht * 0.7, len * 0.45); // the hump and the dark front
    if (kind === 'ape' && male && pattern === 'plain') ov(mix(coat, [200, 200, 196], 0.6), 0, ht * 0.3, -len * 0.05, wid + 0.006, ht * 0.4, len * 0.7); // a silver back
    // neck and head
    const nb = [0, bodyY + ht * 0.72, zF - 0.02], th = Math.PI / 2 - rise, dir = [0, Math.sin(rise), Math.cos(rise)];
    const nw = kind === 'bovine' || kind === 'bison' || kind === 'bear' || kind === 'hyena' ? hw * 0.9 : hw * 0.62;
    if (neckL > 0.035) p.add('cbox', kind === 'elk' || kind === 'hyena' ? dark : coat, 0, nb[1] + dir[1] * neckL / 2, nb[2] + dir[2] * neckL / 2, nw, neckL + 0.03, nw * 1.1, th);
    const hc = [0, nb[1] + dir[1] * neckL + hh * 0.2, nb[2] + dir[2] * neckL + hl * 0.25];
    if (kind === 'ape') { hc[1] = yTop + 0.06; hc[2] = zF + 0.02; }
    p.add('cbox', coat, hc[0], hc[1], hc[2], hw, hh, hl, 0.25);
    const snL = kind === 'cat' || kind === 'ape' || kind === 'monkey' || kind === 'bear' ? hl * 0.35 : kind === 'mammoth' ? 0 : hl * 0.55;
    if (snL) {
      p.add('cbox', pattern === 'blaze' || kind === 'deer' && pattern === 'spots' ? belly : kind === 'ape' || kind === 'monkey' ? mix(belly, [210, 170, 140], 0.6) : coat, 0, hc[1] - hh * 0.18, hc[2] + hl / 2 + snL / 2 - 0.01, hw * 0.66, hh * 0.58, snL, 0.25);
      p.add('cbox', nose, 0, hc[1] - hh * 0.12, hc[2] + hl / 2 + snL - 0.004, hw * 0.4, hh * 0.24, 0.012, 0.25);
    }
    if (pattern === 'blaze') p.add('cbox', belly, 0, hc[1] + hh * 0.2, hc[2] + hl / 2 + 0.003, hw * 0.25, hh * 0.6, 0.006, 0.25);
    for (const sx of [-1, 1]) p.add('cbox', eye, sx * (hw / 2 + 0.002), hc[1] + hh * 0.15, hc[2] + hl * 0.22, 0.006, 0.014, 0.016);
    // ears: big in the heat, small in the cold; pointed and upright on hunters
    const ear = m.ear * (0.85 + heat * 0.35 - cold * 0.25), up = kind === 'wolf' || kind === 'cat' || kind === 'hyena' || kind === 'horse';
    if (kind === 'mammoth') { for (const sx of [-1, 1]) p.add('cbox', dark, sx * (hw / 2 + 0.01), hc[1] + 0.02, hc[2] - 0.04, 0.012, 0.09 * ear * (heat > 0.5 ? 1.8 : 1), 0.08 * ear * (heat > 0.5 ? 1.8 : 1)); }
    else if (kind !== 'ape' && kind !== 'monkey') for (const sx of [-1, 1]) p.add('cbox', up ? coat : dark, sx * (hw / 2 + (up ? -0.01 : 0.012)), hc[1] + hh / 2 + (up ? 0.022 : 0.005) * ear, hc[2] - hl * 0.25, up ? 0.022 * ear : 0.04 * ear, up ? 0.045 * ear : 0.016, 0.014, 0, 0, up ? -sx * 0.15 : sx * -0.5);
    else for (const sx of [-1, 1]) p.add('cbox', mix(belly, [210, 170, 140], 0.6), sx * (hw / 2 + 0.006), hc[1], hc[2] - 0.01, 0.01, 0.026, 0.02);
    // horns and antlers
    const hy = hc[1] + hh / 2, hz = hc[2] - hl * 0.15;
    const horn = (c, segs) => { for (const sx of [-1, 1]) for (const s of segs) p.add('cbox', c, sx * s[0], hy + s[1], hz + s[2], s[3], s[4], s[3], s[5], 0, -sx * s[6]); }; // (a positive tilt leans outward)
    if ((kind === 'deer' || kind === 'elk') && male) {
      const big = kind === 'elk' ? 1.35 : 1, var1 = m.horn;
      horn([214, 194, 160], [[0.02, 0.05 * big, -0.01, 0.012, 0.1 * big, -0.25, 0.35], [0.045, 0.1 * big, -0.03, 0.01, 0.06 * big, 0.3, 0.9], [0.05, 0.13 * big, 0.0, 0.009, 0.05 * big, 0.6, 0.2]].concat(var1 ? [[0.06, 0.16 * big, -0.04, 0.009, 0.05 * big, -0.5, 0.6]] : []));
      if (kind === 'elk') horn([204, 182, 146], [[0.07, 0.15, -0.03, 0.06, 0.012, 0.3, 0.2]]); // palmate
    }
    if (kind === 'gazelle') horn([60, 50, 44], [[0.018, 0.07, -0.03, 0.01, 0.15, -0.45 - m.horn * 0.15, 0.08]]);
    if (kind === 'ibex') { const k2 = male ? 1 : 0.55; horn([140, 122, 96], [[0.02, 0.05 * k2, -0.02, 0.022 * k2, 0.1 * k2, -0.5, 0.05], [0.025, 0.12 * k2, -0.08 * k2, 0.02 * k2, 0.09 * k2, -1.2, 0.05], [0.028, 0.14 * k2, -0.16 * k2, 0.017 * k2, 0.08 * k2, -2.1, 0.05]]); if (male) p.add('cbox', dark, 0, hc[1] - hh * 0.6, hc[2] + hl * 0.15, 0.02, 0.05, 0.02); }
    if (kind === 'bovine' && !(sp.domestic && variant === 2)) { const k2 = 1 + m.horn * 0.25; horn([224, 214, 190], [[0.07 * k2, 0.01, 0, 0.022, 0.08 * k2, 0, 1.4], [0.11 * k2, 0.05 * k2, 0.02, 0.018, 0.07 * k2, 0.5, 0.4]]); }
    if (kind === 'bison') horn([40, 34, 30], [[0.065, 0.005, 0, 0.022, 0.05, 0, 1.2], [0.085, 0.035, 0.01, 0.018, 0.04, 0.3, 0.2]]);
    if (kind === 'mammoth') {
      const k2 = 1 + m.horn * 0.2;
      horn(ivory, [[0.06, -hh * 0.75, hl * 0.4, 0.03, 0.14 * k2, 1.3, 0.1], [0.07, -hh * 0.8 + 0.03, hl * 0.4 + 0.12 * k2, 0.026, 0.1 * k2, 0.4, -0.2]]);
      p.add('cbox', coat, 0, hc[1] - hh * 0.6, hc[2] + hl * 0.5, 0.07, 0.16, 0.07, 0.25); p.add('cbox', coat, 0, hc[1] - hh * 1.05, hc[2] + hl * 0.62, 0.055, 0.12, 0.055, -0.15); p.add('cbox', dark, 0, hc[1] - hh * 1.28, hc[2] + hl * 0.66, 0.05, 0.03, 0.05);
      p.add('cbox', dark, 0, hc[1] + hh * 0.45, hc[2] - hl * 0.1, hw * 0.7, 0.05, hl * 0.6); // the dome of hair
    }
    // manes
    if (kind === 'horse') { p.add('cbox', pattern === 'plain' ? dark : dark, 0, nb[1] + dir[1] * neckL * 0.55 + nw * 0.45, nb[2] + dir[2] * neckL * 0.5 - 0.02, 0.016, neckL + 0.04, 0.03, th); p.add('cbox', dark, 0, hy + 0.005, hc[2] - hl * 0.1, 0.014, 0.02, 0.04); }
    if (kind === 'cat' && male && pattern === 'plain') p.add('cbox', dark, 0, hc[1] - 0.005, hc[2] - hl * 0.25, hw * 1.55, hh * 1.5, hl * 0.7); // a lion's mane
    if (kind === 'hyena') p.add('cbox', dark, 0, nb[1] + 0.04, nb[2] + 0.01, 0.014, 0.06, neckL + 0.06, th);
    // tails
    const ty = bodyY + ht * 0.8, tz = zB - 0.005;
    switch (kind) {
      case 'deer': case 'elk': case 'gazelle': p.add('cbox', belly, 0, ty, tz - 0.012, 0.03, 0.04, 0.025, -0.4); break;
      case 'horse': p.add('cbox', dark, 0, ty - 0.08, tz - 0.035, 0.04, 0.18, 0.04, 0.3); break;
      case 'bovine': case 'bison': case 'ibex': p.add('cbox', coat, 0, ty - 0.06, tz - 0.012, 0.016, 0.14, 0.016, 0.15); p.add('cbox', dark, 0, ty - 0.13, tz - 0.025, 0.028, 0.035, 0.028); break;
      case 'wolf': p.add('cbox', coat, 0, ty - 0.035, tz - 0.06, 0.04, 0.04, 0.13, 0.5); p.add('cbox', pattern === 'saddle' ? dark : belly, 0, ty - 0.075, tz - 0.115, 0.036, 0.036, 0.035, 0.5); break;
      case 'cat': p.add('cbox', coat, 0, ty - 0.03, tz - 0.08, 0.022, 0.022, 0.16, 0.35); p.add('cbox', dark, 0, ty - 0.06, tz - 0.16, 0.026, 0.026, 0.04, 0.35); break;
      case 'hyena': p.add('cbox', dark, 0, ty - 0.03, tz - 0.04, 0.03, 0.03, 0.09, 0.6); break;
      case 'monkey': for (let q = 0; q < 5; q++) p.add('cbox', pattern === 'ring' && q % 2 ? dark : coat, 0, ty + q * 0.03, tz - 0.03 - q * 0.012, 0.018, 0.035, 0.018, -0.3 - q * 0.2); break;
      case 'sheep': case 'bear': case 'mammoth': p.add('cbox', coat, 0, ty - 0.02, tz - 0.01, 0.03, 0.04, 0.03); break;
    }
    const built = p.geo();
    built.userData.withers = yTop; built.userData.leg = y0; // (model units: the size is set per animal, in metres)
    return built;
  }
  // the instanced model for an animal: one per species (and sex where antlers or horns differ,
  // and colour morph for domestic herds), built when the species is first seen
  const DIMORPH = new Set(['deer', 'elk', 'ibex', 'cat', 'ape']);
  // Real sizes. Everything in the close-up shares one scale, set by people (a person of 1.7 m):
  // M.m2u is world units per metre. An animal is drawn at its real shoulder height, read from its
  // own SIZE gene (so a herd varies, island lines dwarf and cold lines grow, and the bodies on the
  // ground follow the genes as they evolve), its sex and its age. Heights in metres against the
  // gene: grazers from a 0.6 m ibex to a 3.4 m mammoth (deer about 0.9, horses 1.3-1.5, bison and
  // aurochs 1.75), hunters from a 0.6 m small cat to a 1.2-1.5 m bear (wolves 0.8), primates from a
  // 0.45 m monkey to a 1.3 m great ape. Tamed forms are a little smaller than their wild kin.
  M.m2u = 0.35;
  const WITHERS = [
    [[0, 0.5], [40, 0.6], [70, 0.75], [100, 0.9], [130, 1.1], [150, 1.3], [165, 1.45], [180, 1.6], [190, 1.75], [205, 2.2], [220, 2.8], [240, 3.4], [255, 3.8]],
    [[0, 0.3], [40, 0.4], [80, 0.6], [120, 0.8], [150, 0.95], [170, 1.05], [190, 1.2], [220, 1.4], [255, 1.6]],
    null,
    [[0, 0.25], [40, 0.3], [90, 0.45], [140, 0.75], [170, 1.0], [210, 1.3], [255, 1.6]],
  ];
  const TAME = { sheep: 0.8, ibex: 0.85, bovine: 0.85, horse: 1 };
  function tableAt(t, v) {
    for (let k = 1; k < t.length; k++) if (v <= t[k][0]) { const a = t[k - 1], b = t[k]; return a[1] + ((v - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); }
    return t[t.length - 1][1];
  }
  // shoulder height in metres of body i (its genes, sex and age)
  M.heightOf = function (i, sp, kind, sex) {
    const U = AG.U, d = AG.SPECIES[U.sp[i]], gene = U.genes[i * AG.NG + AG.G.STAT];
    let h = tableAt(WITHERS[sp.arch] || WITHERS[0], gene);
    if (sp.domestic) h *= TAME[kind] || 1;
    if (DIMORPH.has(kind)) h *= sex ? 1.05 : 0.95;
    if (U.age[i] < d.adult) h *= 0.4 + 0.6 * Math.max(0, U.age[i] / d.adult); // the young grow into it
    return h;
  };
  // A bird's body length in metres from its SIZE gene (a songbird ~15 cm, a crow ~45, an eagle ~80).
  M.birdLength = (gene) => tableAt([[0, 0.1], [60, 0.16], [100, 0.3], [130, 0.45], [180, 0.8], [255, 1.1]], gene);
  M.animal = function (i, x, y, z, k, ry, roll, lie) {
    const U = AG.U, Life = AG.Life, sid = U.sid[i], sp = sid >= 0 ? Life.species[sid] : null;
    if (!sp) return false;
    const m = morphOf(sp), o = i * Life.GL, albino = Life.isAlbino(U.gen, o), sex = DIMORPH.has(m.kind) ? U.sex[i] : 0;
    const variant = sp.domestic ? U.uid[i] % 3 : 0;
    const key = ((sid * 12 + variant * 4 + (albino ? 2 : 0) + sex) * 64) + m.ver; // (a number: no string built per animal per frame)
    const b = bank(key, () => animalGeo(sp, sex, albino, variant), true);
    // this animal's own pigment shades the species' coat a little lighter or darker
    const L = Life.L, own = Life.express(U.gen, o, L.HUE), f = albino ? 1 : AG.clamp(1 + (sp.mean[L.HUE] - own) / 255, 0.72, 1.3);
    const ud = b.geo.userData, ks = (M.heightOf(i, sp, m.kind, U.sex[i]) * M.m2u) / (ud.withers || 0.3);
    drawn++;
    // lying down: the body sinks onto the ground and the legs fold away under it
    b.add(x, lie ? y - (ud.leg || 0.14) * ks * 0.85 : y, z, ks, ks, ks, ry, lie ? 0 : roll, f, f, f);
    return true;
  };

  // ============================================================ houses
  // a building's style comes from where its community lives, and its era
  M.styleOf = function (b) {
    if (M.debug.style) return M.debug.style(b);
    const c = AG.Civ.cities[b.city];
    return climateAt(c ? c.x : b.cx, c ? c.y : b.cy);
  };
  const BEAM = 0x5e4130, DOOR = 0x3a2618, WIN = 0xffd27a, STONE = 0x9c978f, STONE2 = 0x7f7a73, GOLD = 0xe2b64c;
  const THATCH = 0xc9a85e, PALM = 0xb3a35a, TURF = 0x5f8a3e, SNOW = 0xeef3f8, LOG = 0x7a5534, LOG2 = 0x684828, SLATE = 0x4f5864, ADOBE = [0xd7b47e, 0xcfa56f, 0xdcc08e];
  const shadeHex = (hex, k) => { const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => Math.max(0, Math.min(255, v * k)) | 0); return (c[0] << 16) | (c[1] << 8) | c[2]; };
  // Fills kit k for the regional variants; returns the chimney smoke points, or null when the
  // building keeps its common design (castles, towers, walls, farms, markets, mines, docks...).
  M.houseKit = function (k, type, style, kc, v, era, roof) {
    const BT = AG.BT, smokes = [], flag = (kc[0] << 16) | (kc[1] << 8) | kc[2];
    const tiled = era >= 4, roofC = tiled ? roof : THATCH;
    switch (type) {
      case BT.HOUSE:
        if (style === 'snow') { // a log cabin, its steep roof under snow
          k.box(STONE2, 0, 0, 0, 1.5, 0.12, 1.36);
          for (let q = 0; q < 7; q++) { const y = 0.12 + q * 0.11; k.box(q % 2 ? LOG : LOG2, 0, y, 0, 1.36 + (q % 2) * 0.12, 0.11, 1.22 + ((q + 1) % 2) * 0.12); }
          k.prism(0x4e3a2a, 0, 0.89, 0, 1.7, 0.95, 1.56); k.prism(SNOW, 0, 1.05, 0, 1.58, 0.82, 1.46);
          k.box(DOOR, 0.3, 0.12, 0.62, 0.3, 0.5, 0.03); k.glow(WIN, -0.32, 0.4, 0.625, 0.2, 0.16, 0.02);
          k.box(STONE, -0.42, 0.8, -0.3, 0.22, 1.1, 0.22); k.box(SNOW, -0.42, 1.9, -0.3, 0.26, 0.05, 0.26);
          smokes.push([-0.42, 2.0, -0.3]);
          return smokes;
        }
        if (style === 'cold') { // a long low house under a roof of turf, crossed beams at the gables
          k.box(STONE2, 0, 0, 0, 1.6, 0.14, 1.3);
          k.box(0x7a5a3a, 0, 0.14, 0, 1.48, 0.55, 1.18);
          for (const sx of [-0.74, 0.74]) k.box(BEAM, sx, 0.14, 0, 0.06, 0.55, 1.2);
          k.prism(TURF, 0, 0.69, 0, 1.72, 0.7, 1.4); k.prism(shadeHex(TURF, 1.15), 0, 0.73, 0, 1.6, 0.62, 1.42);
          for (const sz of [-0.72, 0.72]) { k.box(BEAM, -0.12, 1.3, sz, 0.05, 0.35, 0.05, 0, 0, -0.6); k.box(BEAM, 0.12, 1.3, sz, 0.05, 0.35, 0.05, 0, 0, 0.6); }
          k.box(DOOR, 0, 0.14, 0.6, 0.3, 0.45, 0.03); k.glow(WIN, 0.45, 0.4, 0.6, 0.16, 0.12, 0.02);
          smokes.push([0.3, 1.45, -0.1]);
          return smokes;
        }
        if (style === 'stone') { // thick stone walls, deep small windows, a slate roof
          k.box(STONE2, 0, 0, 0, 1.56, 0.16, 1.42);
          k.box(0x8f8a83, 0, 0.16, 0, 1.44, 0.82, 1.3);
          for (const y of [0.36, 0.58, 0.8]) k.box(0x77726b, 0, y, 0, 1.45, 0.02, 1.31);
          for (const sx of [-0.72, 0.72]) for (const sz of [-0.65, 0.65]) k.box(0xa39e96, sx, 0.16, sz, 0.12, 0.82, 0.12);
          k.prism(SLATE, 0, 0.98, 0, 1.72, 0.85, 1.56); k.box(shadeHex(SLATE, 0.75), 0, 1.79, 0, 0.1, 0.06, 1.6);
          k.box(DOOR, 0.3, 0.16, 0.656, 0.28, 0.5, 0.03); k.glow(WIN, -0.3, 0.42, 0.656, 0.14, 0.16, 0.02);
          k.box(STONE, 0.45, 1.0, -0.3, 0.24, 1.0, 0.24); smokes.push([0.45, 2.05, -0.3]);
          return smokes;
        }
        if (style === 'dry') { // flat-roofed adobe with a parapet, beam ends and a ladder
          const wall = ADOBE[v];
          k.box(wall, 0, 0, 0, 1.44, 0.95, 1.3);
          k.box(shadeHex(wall, 0.92), 0, 0.95, 0, 1.48, 0.06, 1.34);
          for (const [x, z, sx, sz] of [[0, 0.66, 1.48, 0.06], [0, -0.66, 1.48, 0.06], [0.72, 0, 0.06, 1.34], [-0.72, 0, 0.06, 1.34]]) k.box(shadeHex(wall, 0.95), x, 1.0, z, sx, 0.12, sz);
          for (let q = 0; q < 5; q++) k.box(0x5c3f28, -0.56 + q * 0.28, 0.8, 0.68, 0.06, 0.06, 0.1);
          k.box(DOOR, 0.3, 0, 0.656, 0.3, 0.55, 0.03); k.box(0x2a1e16, -0.32, 0.5, 0.656, 0.16, 0.14, 0.02); k.glow(WIN, -0.32, 0.5, 0.66, 0.1, 0.08, 0.01);
          if (v === 1) { k.box(shadeHex(wall, 1.04), -0.35, 1.06, -0.25, 0.6, 0.5, 0.6); k.box(shadeHex(wall, 0.9), -0.35, 1.56, -0.25, 0.64, 0.05, 0.64); }
          if (v === 2) k.ico(shadeHex(wall, 1.05), 0.25, 1.02, -0.2, 0.6, 0.5, 0.6); // a small dome
          for (const sx of [0.62, 0.78]) k.box(0x6b4a2d, sx, 0, 0.3, 0.035, 1.25, 0.035, 0, 0, 0.18);
          for (let q = 0; q < 4; q++) k.box(0x6b4a2d, 0.73, 0.2 + q * 0.26, 0.3, 0.2, 0.025, 0.035, 0, 0, 0.18);
          return smokes;
        }
        if (style === 'tropic') { // a house on stilts, woven walls under a steep palm-thatch roof
          for (const sx of [-0.6, 0, 0.6]) for (const sz of [-0.5, 0.5]) k.box(0x6b4a2d, sx, 0, sz, 0.08, 0.5, 0.08);
          k.box(0x8a6a44, 0, 0.5, 0, 1.45, 0.08, 1.25);
          for (let q = 0; q < 5; q++) k.box(q % 2 ? 0xb59a62 : 0xa68a55, 0, 0.58 + q * 0.1, 0, 1.25, 0.1, 1.05);
          k.prism(PALM, 0, 1.06, 0, 2.05, 1.15, 1.85); k.prism(shadeHex(PALM, 0.82), 0, 1.04, 0, 2.1, 0.12, 1.9);
          k.box(DOOR, 0.25, 0.58, 0.53, 0.28, 0.42, 0.03);
          for (const sx of [0.13, 0.37]) k.box(0x6b4a2d, sx, 0, 0.85, 0.035, 0.62, 0.035, 0.5);
          k.glow(WIN, -0.35, 0.75, 0.53, 0.2, 0.12, 0.02);
          return smokes;
        }
        if (style === 'temperate' && !tiled) { // timber frame, wattle and daub, a thatched roof
          k.box(STONE2, 0, 0, 0, 1.56, 0.16, 1.42);
          k.box([0xe2d3b0, 0xead9b6, 0xd8c39a][v], 0, 0.16, 0, 1.44, 0.8, 1.3);
          for (const sx of [-0.7, 0.7]) for (const sz of [-0.63, 0.63]) k.box(BEAM, sx, 0.16, sz, 0.09, 0.8, 0.09);
          k.box(BEAM, 0, 0.56, 0, 1.47, 0.06, 1.33); k.box(BEAM, 0, 0.16, 0.656, 0.06, 0.8, 0.02, 0, 0, 0.55);
          k.prism(THATCH, 0, 0.92, 0, 1.95, 0.95, 1.7); k.prism(shadeHex(THATCH, 0.8), 0, 0.9, 0, 2.0, 0.08, 1.75);
          k.box(DOOR, 0.3, 0.16, 0.656, 0.28, 0.5, 0.03); k.glow(WIN, -0.32, 0.36, 0.664, 0.2, 0.16, 0.02);
          smokes.push([0, 1.95, 0]);
          return smokes;
        }
        return null; // the tiled town house (the common design)
      case BT.HUT:
        if (style === 'snow') { k.mound(0x8a7a66, 0, 0.35, 0, 1.6, 1.2, 1.6); k.mound(SNOW, 0, 0.55, 0, 1.4, 0.8, 1.4); k.box(0x8a7a66, 0, 0, 0.75, 0.42, 0.36, 0.5); k.box(DOOR, 0, 0, 1.0, 0.24, 0.3, 0.02); smokes.push([0, 1.1, 0]); return smokes; } // an earth lodge
        if (style === 'cold') { k.cyl(0x6a6040, 0, 0, 0, 1.45, 0.6, 1.45); k.cone(TURF, 0, 0.6, 0, 1.7, 0.85, 1.7); k.box(DOOR, 0, 0, 0.7, 0.3, 0.45, 0.04); smokes.push([0, 1.5, 0]); return smokes; }
        if (style === 'stone') { for (let q = 0; q < 5; q++) k.cyl(q % 2 ? 0x8f8a83 : 0x837e77, 0, q * 0.24, 0, 1.5 - q * 0.26, 0.24, 1.5 - q * 0.26); k.box(DOOR, 0, 0, 0.7, 0.28, 0.42, 0.06); return smokes; } // corbelled beehive
        if (style === 'dry') { const w = ADOBE[v]; k.cyl(w, 0, 0, 0, 1.4, 0.7, 1.4); k.ico(shadeHex(w, 1.06), 0, 0.7, 0, 1.38, 0.8, 1.38); k.box(DOOR, 0, 0, 0.68, 0.3, 0.48, 0.04); return smokes; }
        if (style === 'tropic') { k.cyl(0xa68a55, 0, 0, 0, 1.35, 0.4, 1.35); k.cone(PALM, 0, 0.3, 0, 1.95, 1.4, 1.95); k.box(DOOR, 0, 0, 0.66, 0.3, 0.4, 0.04); return smokes; }
        return null;
      case BT.TENT:
        if (style === 'snow' || style === 'cold') { // a dome of hides over arches of mammoth bone
          k.mound(0x9a7a58, 0, 0.32, 0, 1.3, 1.0, 1.3);
          for (const a of [0.3, 1.35, 2.4]) for (const sd of [-1, 1]) k.box(0xe8dcc2, Math.sin(a) * sd * 0.3, 0.42, Math.cos(a) * sd * 0.3, 0.05, 0.36, 0.05, a, sd * 0.85); // arches of bone over the hides
          k.box(0xe8dcc2, 0.45, 0, 0.45, 0.1, 0.5, 0.1, 0, 0, 0.3); k.box(0xe8dcc2, -0.45, 0, 0.45, 0.1, 0.5, 0.1, 0, 0, -0.3);
          k.box(DOOR, 0, 0, 0.58, 0.26, 0.34, 0.03); smokes.push([0, 0.9, 0]);
          return smokes;
        }
        if (style === 'dry') { k.prism(0xa8845c, 0, 0, 0, 1.3, 0.75, 0.95, 0, 0, 0); k.box(0x6b4a2d, -0.6, 0, 0.42, 0.04, 0.78, 0.04); k.box(0x6b4a2d, 0.6, 0, 0.42, 0.04, 0.78, 0.04); return smokes; } // a windbreak of hides
        if (style === 'tropic') { k.prism(0x6f8f3e, 0, 0.2, 0, 1.3, 0.7, 1.0); for (const sx of [-0.55, 0.55]) k.box(0x6b4a2d, sx, 0, 0.42, 0.05, 0.3, 0.05); return smokes; } // a leaf shelter
        return null;
      case BT.HALL:
        if (style === 'snow' || style === 'cold') { // a longhouse with a curved ridge and carved gable beams
          k.box(STONE2, 0, 0, 0, 2.9, 0.12, 1.8);
          k.box(0x6e5034, 0, 0.12, 0, 2.7, 0.7, 1.5);
          for (let q = 0; q < 5; q++) k.box(BEAM, -1.2 + q * 0.6, 0.12, 0.76, 0.08, 0.7, 0.04);
          k.prism(style === 'snow' ? SNOW : TURF, 0, 0.82, 0, 1.95, 0.95, 3.0, Math.PI / 2); k.prism(0x4e3a2a, 0, 0.8, 0, 2.0, 0.1, 3.05, Math.PI / 2);
          for (const sx of [-1.48, 1.48]) { k.box(BEAM, sx, 1.62, 0.12, 0.06, 0.45, 0.06, 0, -0.6); k.box(BEAM, sx, 1.62, -0.12, 0.06, 0.45, 0.06, 0, 0.6); k.box(flag, sx, 1.95, 0, 0.08, 0.12, 0.08); }
          k.box(DOOR, 0, 0.12, 0.76, 0.42, 0.55, 0.03); k.box(flag, 0.6, 0.45, 0.77, 0.32, 0.22, 0.02);
          smokes.push([0, 1.85, 0]);
          return smokes;
        }
        if (style === 'dry') { // an adobe hall with a pillared porch and a flat roof
          k.box(ADOBE[v], 0, 0, -0.2, 2.6, 1.0, 1.3); k.box(shadeHex(ADOBE[v], 0.9), 0, 1.0, -0.2, 2.66, 0.12, 1.36);
          for (const sx of [-1.1, -0.37, 0.37, 1.1]) k.cyl(0xe6d2a8, sx, 0, 0.62, 0.16, 0.9, 0.16);
          k.box(shadeHex(ADOBE[v], 1.05), 0, 0.9, 0.55, 2.6, 0.1, 0.5);
          k.box(DOOR, 0, 0, 0.46, 0.45, 0.62, 0.03); k.box(flag, 0.8, 0.6, 0.46, 0.4, 0.25, 0.02);
          return smokes;
        }
        if (style === 'tropic') { // a stilted longhouse with a saddle roof
          for (const sx of [-1.2, -0.4, 0.4, 1.2]) for (const sz of [-0.6, 0.6]) k.box(0x6b4a2d, sx, 0, sz, 0.09, 0.5, 0.09);
          k.box(0x8a6a44, 0, 0.5, 0, 2.7, 0.08, 1.45); k.box(0xa68a55, 0, 0.58, 0, 2.4, 0.5, 1.2);
          k.prism(PALM, 0, 1.08, 0, 1.9, 1.25, 3.0, Math.PI / 2); k.prism(shadeHex(PALM, 0.82), 0, 1.06, 0, 1.95, 0.12, 3.05, Math.PI / 2);
          k.box(DOOR, 0, 0.58, 0.61, 0.38, 0.42, 0.03);
          return smokes;
        }
        if (style === 'stone') { k.box(STONE2, 0, 0, 0, 2.8, 0.12, 1.8); k.box(0x8f8a83, 0, 0.12, 0, 2.6, 0.9, 1.5); k.prism(SLATE, 0, 1.02, 0, 1.85, 0.9, 2.9, Math.PI / 2); k.box(DOOR, 0, 0.12, 0.76, 0.42, 0.6, 0.03); k.box(flag, 0.6, 0.5, 0.77, 0.3, 0.22, 0.02); smokes.push([0.8, 1.9, 0]); return smokes; }
        if (!tiled) return null;
        return null;
      case BT.GRANARY:
        if (style === 'dry') { for (const sx of [-0.45, 0.45]) { k.cyl(ADOBE[v], sx, 0, 0, 0.78, 0.9, 0.78); k.ico(shadeHex(ADOBE[v], 1.06), sx, 0.92, 0, 0.78, 0.6, 0.78); k.box(DOOR, sx, 0.55, 0.38, 0.16, 0.18, 0.03); } return smokes; }
        if (style === 'tropic') { for (const sx of [-0.5, 0.5]) for (const sz of [-0.4, 0.4]) k.box(0x6b4a2d, sx, 0, sz, 0.07, 0.55, 0.07); k.box(0xa68a55, 0, 0.55, 0, 1.2, 0.55, 1.0); k.cone(PALM, 0, 1.05, 0, 1.6, 0.8, 1.6); return smokes; }
        return null;
      case BT.SHRINE:
        if (style === 'dry') { k.box(0xefe6d2, 0, 0, 0, 0.7, 0.55, 0.7); k.ico(0xf6efe0, 0, 0.55, 0, 0.66, 0.5, 0.66); k.box(GOLD, 0, 0.92, 0, 0.04, 0.16, 0.04); k.glow(0xffc46b, 0, 0.1, 0.36, 0.16, 0.24, 0.02); return smokes; }
        if (style === 'tropic') { k.box(0x6b4a2d, 0, 0, 0, 0.1, 0.7, 0.1); k.box(0x8a6a44, 0, 0.7, 0, 0.5, 0.05, 0.5); k.box(0xc9a46a, 0, 0.75, 0, 0.36, 0.28, 0.36); k.prism(flag, 0, 1.03, 0, 0.52, 0.3, 0.5); k.glow(0xffc46b, 0, 0.8, 0.19, 0.1, 0.12, 0.02); return smokes; } // a spirit house on a post
        if (style === 'snow' || style === 'cold') { const bands = [flag, 0xb8452f, 0x2f5f8a, 0xe8d6a0, flag]; for (let q = 0; q < 5; q++) k.box(bands[q], 0, q * 0.26, 0, 0.26 - q * 0.015, 0.26, 0.26 - q * 0.015); for (const sx of [-1, 1]) k.box(0x6b4a2d, sx * 0.24, 0.85, 0, 0.3, 0.06, 0.08); return smokes; } // a carved pole
        return null;
      case BT.TEMPLE:
        if (style === 'dry') { // a stepped temple mound with a shrine on top
          for (let q = 0; q < 4; q++) { const s = 2.9 - q * 0.62; k.box(shadeHex(ADOBE[0], 1 - q * 0.04), 0, q * 0.42, 0, s, 0.42, s); k.box(shadeHex(ADOBE[0], 0.85), 0, q * 0.42 + 0.4, 0, s + 0.04, 0.04, s + 0.04); }
          for (let q = 0; q < 6; q++) { k.box(shadeHex(ADOBE[0], 0.9), 0, 0, 1.62 - q * 0.135, 0.52, (q + 1) * 0.28, 0.14); k.box(0xb8925e, 0, (q + 1) * 0.28 - 0.02, 1.62 - q * 0.135, 0.54, 0.03, 0.15); } // a stair up the front
          k.box(0xefe6d2, 0, 1.68, 0, 0.7, 0.55, 0.7); k.prism(GOLD, 0, 2.23, 0, 0.8, 0.4, 0.8); k.glow(0xffc46b, 0, 1.72, 0.36, 0.22, 0.36, 0.02);
          return smokes;
        }
        if (style === 'tropic') { // three roofs, one over another, on a stone platform
          k.box(0x8f8a83, 0, 0, 0, 2.8, 0.3, 2.8); k.box(0xa68a55, 0, 0.3, 0, 1.6, 0.9, 1.6);
          for (let q = 0; q < 3; q++) { const s = 2.5 - q * 0.65; k.prism(q === 0 ? PALM : flag, 0, 1.2 + q * 0.55, 0, s, 0.5, s); k.box(0x6b4a2d, 0, 1.15 + q * 0.55, 0, s * 0.6, 0.08, s * 0.6); }
          k.box(GOLD, 0, 2.85, 0, 0.06, 0.4, 0.06); k.glow(0xffc46b, 0, 0.32, 0.81, 0.4, 0.6, 0.02);
          for (const sx of [-1.1, 1.1]) for (const sz of [-1.1, 1.1]) k.box(0x6b4a2d, sx, 0.3, sz, 0.12, 0.5, 0.12);
          return smokes;
        }
        if (style === 'snow' || style === 'cold') { // a dark timber temple of stacked steep roofs
          k.box(STONE2, 0, 0, 0, 2.4, 0.15, 2.4); k.box(0x4e3a2a, 0, 0.15, 0, 1.8, 1.0, 1.8);
          for (let q = 0; q < 3; q++) { const s = 2.2 - q * 0.6; k.prism(style === 'snow' && q === 0 ? SNOW : 0x3e2e22, 0, 1.15 + q * 0.62, 0, s, 0.62, s); k.box(0x4e3a2a, 0, 1.3 + q * 0.62, 0, s * 0.5, 0.4, s * 0.5); }
          for (const sz of [-0.6, 0.6]) k.box(flag, 0, 3.05, sz * 0.5, 0.06, 0.25, 0.06, 0.6);
          k.box(DOOR, 0, 0.15, 0.91, 0.5, 0.7, 0.03); k.glow(0xffc46b, 0, 0.5, 0.92, 0.18, 0.18, 0.02);
          return smokes;
        }
        return null;
      case BT.WORKSHOP:
        if (style === 'dry') { k.box(ADOBE[v], 0, 0, -0.2, 2.3, 0.9, 1.4); k.box(shadeHex(ADOBE[v], 0.9), 0, 0.9, -0.2, 2.36, 0.1, 1.46); for (const sx of [-1.0, 1.0]) k.box(0x6b4a2d, sx, 0, 0.75, 0.06, 0.8, 0.06); k.box(0xd8c7a2, 0, 0.8, 0.6, 2.2, 0.03, 0.6, 0.15); k.box(DOOR, 0, 0, 0.51, 0.7, 0.6, 0.03); smokes.push([-0.8, 1.2, -0.5]); k.box(STONE, -0.8, 0.9, -0.5, 0.2, 0.3, 0.2); return smokes; }
        if (style === 'tropic') { for (const sx of [-1.0, 0, 1.0]) for (const sz of [-0.7, 0.7]) k.box(0x6b4a2d, sx, 0, sz, 0.08, 0.95, 0.08); k.prism(PALM, 0, 0.95, 0, 2.6, 0.9, 1.9); k.box(0x8a6440, 0.4, 0, 0, 0.8, 0.35, 0.5); k.cyl(0x7a4f2a, -0.5, 0, 0.1, 0.3, 0.4, 0.3); return smokes; }
        if (style === 'snow' || style === 'cold') { for (let q = 0; q < 6; q++) k.box(q % 2 ? LOG : LOG2, 0, q * 0.15, -0.15, 2.2 + (q % 2) * 0.12, 0.15, 1.5 + ((q + 1) % 2) * 0.12); k.prism(style === 'snow' ? SNOW : 0x4e3a2a, 0, 0.9, -0.15, 2.5, 0.8, 1.8); k.box(DOOR, 0, 0, 0.62, 0.8, 0.7, 0.03); k.box(STONE, -0.7, 0.9, -0.6, 0.22, 0.65, 0.22); smokes.push([-0.7, 1.6, -0.6]); return smokes; }
        return null;
    }
    return null;
  };
  // (for a model sheet: the builders themselves)
  M._dev = { clothesGeo, skinGeo, hairGeo, hatGeo, animalGeo, STYLES, HATS, kindOf, morphOf };
  // castles, towers and walls are built of mud brick where people build in mud brick
  M.palette = (style) => (style === 'dry' ? { STONE: 0xcfa56f, STONE2: 0xb88e5a } : null);
})();
