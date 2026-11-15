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
    const race = U.race[i] || 0, stamp = race * 1e9 + kd * 1e6 + job * 1e4 + king * 1000 + era * 100 + Math.min(99, (age / 8) | 0);
    let L = looks.get(uid);
    if (L && L.stamp === stamp) return L;
    const male = U.sex[i] === 1, child = job === AG.J.CHILD, o = i * AG.Life.GL, LL = AG.Life.L;
    const pig = AG.Life.express(U.gen, o, LL.HUE), albino = AG.Life.isAlbino(U.gen, o), neutral = U.gen[o + 2 * LL.NEUTRAL];
    const clim = M.debug.climate ? M.debug.climate(uid) : climateAt(c ? c.x : U.x[i], c ? c.y : U.y[i]);
    const kc = kd >= 0 && Civ.kingdoms[kd] ? Civ.kingdoms[kd].color : [150, 150, 150];
    const fashion = hash(kd + 7, c ? c.lang : 0), h = hash(uid, 91);
    let style;
    if (job === AG.J.PRIEST) style = 'robe';
    else if ((clim === 'snow' || clim === 'cold') && era < 9) style = 'fur'; // (woven coats from the Industrial age)
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
      // the later ages dress by their own fashions: dark coats, then bright modern colours, then
      // casual wear, then pale suits of the Space Age
      if (era >= 9) {
        const FASH = era >= 13 ? [[232, 236, 242], [208, 214, 224], [180, 220, 236]] : era >= 12 ? [[60, 90, 140], [200, 200, 196], [40, 40, 44], [176, 70, 60], [90, 140, 110]] : era >= 10 ? [[70, 80, 110], [150, 60, 50], [200, 180, 140], [60, 110, 90], [90, 90, 96]] : [[48, 46, 52], [70, 60, 54], [90, 96, 104], [110, 80, 60]];
        cloth = job === AG.J.SOLDIER ? (era >= 13 ? [226, 232, 238] : era >= 10 ? [92, 104, 62] : mix(kc, [40, 40, 50], 0.5)) : job === AG.J.PRIEST ? cloth : mix(FASH[h % FASH.length], kc, king ? 0.4 : 0.12);
      }
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
    else if (job === AG.J.SOLDIER) { if (era < 10) { hat = 'helmet'; hatC = era >= 5 ? [150, 154, 164] : era >= 4 ? [200, 152, 80] : [128, 92, 58]; } } // (modern helmets come with the gear)
    else if (job === AG.J.PRIEST) { hat = 'cowl'; hatC = cloth; }
    else if (!child && style === 'robe' && clim === 'dry') { hat = 'turban'; hatC = (h >>> 3) % 3 ? [240, 234, 220] : mix(kc, LINEN, 0.4); }
    else if (!child && (style === 'wrap' || style === 'wrapf') && (h >>> 5) % 3 === 0) { hat = 'feathers'; hatC = mix(kc, [255, 255, 255], 0.2); }
    else if (!child && job === AG.J.FARM && era >= 2 && clim !== 'snow' && clim !== 'cold' && (h >>> 6) % 5 < 2) { hat = 'straw'; hatC = [222, 196, 120]; }
    const Rc = AG.Races ? AG.Races.get(race) : null, rs = Rc ? AG.Races.skin(Rc, pig) : null, RL = Rc ? Rc.look : {};
    if (RL.feature === 'bighead' && job !== AG.J.PRIEST) cloth = mix([206, 212, 222], kc, 0.15); // the visitors' silver suits
    const skinC = rs && !albino ? rs : skinOf(pig, albino), hairC = RL.hair ? (age > 55 ? mix(RL.hair, [220, 220, 224], 0.6) : RL.hair) : hairOf(pig, albino, neutral, age);
    L = { stamp, style, hair: RL.feature === 'bighead' ? -1 : hair, hat, cloth: cl(cloth), skin: cl(skinC), hairC: cl(hairC), hatC: cl(hatC),
      feature: RL.feature || null, featC: cl(RL.featC || (RL.feature === 'beard' || RL.feature === 'fur' ? hairC : RL.feature === 'bighead' ? skinC : skinC)), tall: RL.tall || 1 };
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
    k *= L.tall; // each people its own height
    bank('pc' + L.style).add(x, y, z, k, k, k, ry, roll, c[0] / 255, c[1] / 255, c[2] / 255);
    bank('ps' + L.style).add(x, y, z, k, k, k, ry, roll, s[0] / 255, s[1] / 255, s[2] / 255);
    if (L.hair >= 0) bank('ph' + L.hair).add(x, y, z, k, k, k, ry, roll, hc[0] / 255, hc[1] / 255, hc[2] / 255);
    if (L.hat && L.feature !== 'antennae' && L.feature !== 'bighead') { const t = L.hatC; bank('pt' + L.hat).add(x, y, z, k, k, k, ry, roll, t[0] / 255, t[1] / 255, t[2] / 255); }
    if (L.feature) { const f = L.featC; bank('pf' + L.feature, () => featureGeo(L.feature), false).add(x, y, z, k, k, k, ry, roll, f[0] / 255, f[1] / 255, f[2] / 255); }
    return L;
  };
  // the features that set a people apart, on the shared figure (head at y 0.355-0.46, face to +z)
  function featureGeo(f) {
    const p = new Parts(f === 'fur' || f === 'beard' ? TX.FUR : 0), W = G(255);
    switch (f) {
      case 'ears': for (const sx of [-1, 1]) p.add('box', W, sx * 0.057, 0.375, -0.004, 0.012, 0.062, 0.026, 0, 0, -sx * 0.55); break; // long and pointed
      case 'beard': p.add('box', W, 0, 0.3, 0.032, 0.094, 0.075, 0.04).add('box', G(236), 0, 0.27, 0.04, 0.06, 0.04, 0.03); break;
      case 'tusks': for (const sx of [-1, 1]) p.add('cone', W, sx * 0.026, 0.352, 0.05, 0.012, 0.036, 0.012); break;
      case 'crest': for (let q = 0; q < 4; q++) p.add('box', G(255 - q * 14), 0, 0.455, 0.035 - q * 0.024, 0.01, 0.05 - q * 0.008, 0.02); break;
      case 'antennae': for (const sx of [-1, 1]) p.add('cyl', W, sx * 0.022, 0.452, 0.02, 0.006, 0.075, 0.006, 0, 0, -sx * 0.4).add('ico', W, sx * 0.052, 0.522, 0.02, 0.018, 0.018, 0.018); break;
      case 'fins': for (const sx of [-1, 1]) p.add('box', W, sx * 0.056, 0.36, -0.01, 0.006, 0.065, 0.05, 0, 0, -sx * 0.25); p.add('box', G(230), 0, 0.17, -0.064, 0.008, 0.14, 0.05); break;
      case 'bighead': // a great domed head with dark, wrap-round eyes
        p.add('box', W, 0, 0.4, -0.004, 0.13, 0.085, 0.118).add('box', G(250), 0, 0.47, -0.008, 0.11, 0.025, 0.1);
        for (const sx of [-1, 1]) p.add('box', G(14), sx * 0.025, 0.378, 0.05, 0.034, 0.03, 0.006, 0, 0, sx * 0.25);
        break;
      case 'shards': // crystals growing from the head and shoulders
        p.add('cone', W, 0, 0.455, -0.005, 0.03, 0.08, 0.03).add('cone', G(230), 0.03, 0.445, -0.02, 0.02, 0.05, 0.02, 0, 0, -0.4).add('cone', G(230), -0.03, 0.445, -0.02, 0.02, 0.05, 0.02, 0, 0, 0.4);
        for (const sx of [-1, 1]) p.add('cone', G(240), sx * 0.09, 0.27, 0, 0.022, 0.06, 0.022, 0, 0, -sx * 0.5);
        break;
      case 'fur': p.add('box', W, 0, 0.405, 0.044, 0.104, 0.018, 0.012).add('box', G(232), 0, 0.2, -0.045, 0.16, 0.13, 0.02).add('box', G(240), 0, 0.27, 0, 0.17, 0.03, 0.1); break;
    }
    return p.geo();
  }

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

  // ============================================================ the peoples' towns
  // One design per people for dwellings (house, hut, tent at their own scale), one for halls and one
  // for temples and shrines; anything else keeps the common design. They grow taller with the era.
  const RACE_STYLES = new Set(['sylvan', 'stonekin', 'ashborn', 'saurian', 'hive', 'tide', 'crystal', 'void']);
  M.RACE_STYLES = RACE_STYLES;
  function raceKit(k, type, style, kc, v, era) {
    const BT = AG.BT, smokes = [], flag = (kc[0] << 16) | (kc[1] << 8) | kc[2];
    const kind = type === BT.HALL ? 'hall' : type === BT.TEMPLE || type === BT.SHRINE ? 'temple' : type === BT.HOUSE || type === BT.HUT || type === BT.TENT ? 'home' : null;
    if (!kind) return null;
    const s = type === BT.TENT || type === BT.SHRINE ? 0.6 : 1, g = 1 + Math.min(1.4, Math.max(0, era - 4) * 0.1); // later eras build higher
    const S = (n) => n * s;
    switch (style) {
      case 'sylvan': { // homes among (and in) great trees, leaf roofs, lanterns
        const bark = { c: 0x6e5338, t: 'bark' }, leaf = { c: [86, 150, 70], t: 'leaves' };
        if (kind === 'home') { k.cyl(bark, 0, 0, 0, S(0.36), S(1.5) * g, S(0.36)); k.ico(leaf, 0, S(1.75) * g, 0, S(1.5), S(0.9), S(1.5)); k.cyl({ c: 0x8a6a46, t: 'planks' }, 0, S(0.7) * g, 0, S(1.0), S(0.08), S(1.0)); k.cyl({ c: 0xd8c896, t: 'plaster' }, 0, S(0.78) * g, 0, S(0.62), S(0.42), S(0.62)); k.cone(leaf, 0, S(1.2) * g, 0, S(0.82), S(0.42), S(0.82)); k.glow(0xffe08a, S(0.32), S(0.9) * g, S(0.1), S(0.04), S(0.08), S(0.04)); }
        else if (kind === 'hall') { k.cyl(bark, 0, 0, 0, 0.7, 2.2 * g, 0.7); k.ico(leaf, 0, 2.6 * g, 0, 2.8, 1.4, 2.6); k.cyl({ c: 0x8a6a46, t: 'planks' }, 0, 0.9, 0, 2.4, 0.1, 1.8); k.box({ c: 0xd8c896, t: 'plaster' }, 0, 1.0, 0, 1.9, 0.55, 1.3); k.prism(leaf, 0, 1.55, 0, 2.1, 0.5, 1.5, Math.PI / 2); for (const x of [-0.7, 0.7]) k.glow(0xffe08a, x, 1.2, 0.66, 0.08, 0.12, 0.02); }
        else { k.cyl(bark, 0, 0, 0, S(1.0), S(2.6) * g, S(1.0)); k.ico(leaf, 0, S(3.0) * g, 0, S(3.0), S(1.8), S(3.0)); for (let q = 0; q < 6; q++) { const a = q * 1.05; k.glow(0xbfffd0, Math.cos(a) * S(1.1), S(1.4 + (q % 2) * 0.6), Math.sin(a) * S(1.1), S(0.08), S(0.1), S(0.08)); } }
        break;
      }
      case 'stonekin': { // halls dug into turfed mounds, stone doorways, round doors, forge glow
        const turf = { c: [104, 140, 76], t: 'grass' }, stone = { c: 0x8f8a80, t: 'masonry' };
        if (kind === 'home') { k.mound(turf, 0, S(0.15), 0, S(1.7), S(1.0) * g, S(1.6)); k.box(stone, 0, 0, S(0.62), S(0.62), S(0.62), S(0.24)); k.cyl({ c: 0x6b4a2c, t: 'planks' }, 0, S(0.24), S(0.75), S(0.36), S(0.04), S(0.36), 0, Math.PI / 2); k.cyl(stone, S(0.4), S(0.5) * g, S(-0.2), S(0.16), S(0.5), S(0.16)); smokes.push([S(0.4), S(1.05) * g, S(-0.2)]); }
        else if (kind === 'hall') { k.mound(turf, 0, 0.2, 0, 3.0, 1.5 * g, 2.0); k.box(stone, 0, 0, 0.9, 1.3, 1.0, 0.3); for (const x of [-0.5, 0.5]) k.cyl(stone, x, 0, 1.1, 0.16, 1.0, 0.16); k.box(stone, 0, 1.0, 1.1, 1.4, 0.16, 0.3); k.glow(0xff9a3c, 0, 0.1, 1.06, 0.6, 0.6, 0.02); smokes.push([0.8, 1.7 * g, -0.3]); }
        else { k.box(stone, 0, 0, 0, S(2.4), S(0.3), S(2.4)); k.box(stone, 0, S(0.3), 0, S(1.6), S(1.4) * g, S(1.6)); k.prism({ c: 0x6f6a62, t: 'masonry' }, 0, S(1.7) * g, 0, S(1.8), S(0.6), S(1.8)); k.glow(0xff8a2c, 0, S(0.35), S(0.81), S(0.5), S(0.6), S(0.02)); smokes.push([0, S(2.4) * g, 0]); }
        break;
      }
      case 'ashborn': { // dark hide and timber, bone spikes, skull totems
        const hide = { c: 0x4a3a30, t: 'hide' }, bone = 0xe8dcc0, wood = { c: 0x3a2a20, t: 'logs' };
        if (kind === 'home') { k.cone(hide, 0, 0, 0, S(1.5), S(1.3) * g, S(1.5)); for (let q = 0; q < 5; q++) { const a = q * 1.26; k.cone(bone, Math.cos(a) * S(0.55), S(0.5), Math.sin(a) * S(0.55), S(0.06), S(0.5), S(0.06), 0, Math.cos(a) * 0.6, -Math.sin(a) * 0.6); } k.ico(bone, 0, S(1.3) * g, 0, S(0.16), S(0.14), S(0.16)); k.box(0x1e1612, 0, 0, S(0.66), S(0.3), S(0.42), S(0.03)); }
        else if (kind === 'hall') { k.box(wood, 0, 0, 0, 2.6, 0.9 * g, 1.6); k.prism(hide, 0, 0.9 * g, 0, 2.8, 0.9, 1.8, Math.PI / 2); for (const x of [-1.1, -0.4, 0.4, 1.1]) k.cone(bone, x, 1.6 * g, 0, 0.06, 0.5, 0.06); for (const x of [-1.4, 1.4]) { k.cyl(wood, x, 0, 0.95, 0.08, 1.4, 0.08); k.ico(bone, x, 1.45, 0.95, 0.14, 0.12, 0.14); } }
        else { k.cyl(wood, 0, 0, 0, S(0.3), S(2.4) * g, S(0.3)); for (let q = 0; q < 3; q++) k.ico(bone, 0, S(0.9 + q * 0.55) * g, S(0.16), S(0.24), S(0.2), S(0.22)); k.cone(hide, 0, 0, 0, S(1.6), S(0.5), S(1.6)); k.glow(0xff5a2c, 0, S(0.1), 0, S(0.3), S(0.25), S(0.3)); }
        break;
      }
      case 'saurian': { // stepped clay houses with carved crests, jungle thatch
        const clay = { c: 0xb98a5a, t: 'plaster' }, jade = 0x4aa878, thatch = { c: 0x9aa050, t: 'thatch' };
        if (kind === 'home') { k.box(clay, 0, 0, 0, S(1.5), S(0.6), S(1.5)); k.box(clay, 0, S(0.6), 0, S(1.1), S(0.5) * g, S(1.1)); k.cone(thatch, 0, S(1.1) * g, 0, S(1.3), S(0.6), S(1.3)); k.box(jade, 0, S(0.15), S(0.76), S(0.4), S(0.12), S(0.04)); k.box(0x2a1a10, 0, 0, S(0.76), S(0.28), S(0.45), S(0.02)); }
        else if (kind === 'hall') { for (let q = 0; q < 3; q++) k.box(clay, 0, q * 0.45, 0, 2.7 - q * 0.6, 0.45, 1.8 - q * 0.4); k.prism(thatch, 0, 1.35, 0, 1.6, 0.6, 0.8, Math.PI / 2); for (const x of [-1.1, 1.1]) k.ico(jade, x, 0.5, 0.95, 0.2, 0.2, 0.2); }
        else { for (let q = 0; q < 4; q++) k.box(clay, 0, q * 0.5 * g, 0, S(2.8 - q * 0.6), S(0.5) * g, S(2.8 - q * 0.6)); k.box(clay, 0, 0, S(1.2), S(0.7), S(1.6) * g, S(0.6), 0, -0.5); k.box(jade, 0, S(2.0) * g, 0, S(0.6), S(0.5), S(0.6)); k.glow(0x8affc0, 0, S(2.5) * g, 0, S(0.2), S(0.2), S(0.2)); }
        break;
      }
      case 'hive': { // organic mound hives with dark openings, spires, amber glow
        const wax = { c: 0xc28c48, t: 'plaster' }, dark = 0x2a1c12;
        if (kind === 'home') { k.mound(wax, 0, S(0.3), 0, S(1.5), S(1.2) * g, S(1.5)); k.mound(wax, S(0.2), S(1.0) * g, S(-0.1), S(0.8), S(0.8), S(0.8)); k.ico(dark, 0, S(0.32), S(0.66), S(0.36), S(0.36), S(0.12)); k.ico(dark, S(0.3), S(0.95) * g, S(0.26), S(0.16), S(0.16), S(0.08)); }
        else if (kind === 'hall') { k.cone(wax, 0, 0, 0, 2.6, 2.8 * g, 2.0); k.mound(wax, -0.8, 0.4, 0, 1.4, 1.0, 1.2); k.mound(wax, 0.9, 0.3, 0.2, 1.2, 0.9, 1.0); for (let q = 0; q < 4; q++) k.ico(dark, -0.6 + q * 0.4, 0.5 + (q % 2) * 0.7, 0.75, 0.2, 0.2, 0.1); }
        else { k.cone(wax, 0, 0, 0, S(2.6), S(4.0) * g, S(2.6)); for (let q = 0; q < 5; q++) k.glow(0xffb040, Math.cos(q * 1.26) * S(0.6), S(0.6 + q * 0.5) * g, Math.sin(q * 1.26) * S(0.6), S(0.12), S(0.12), S(0.12)); }
        break;
      }
      case 'tide': { // spiral shell houses on stilts, coral, pearl glow
        const shell = { c: 0xf0d8cc, t: 'plaster' }, coral = 0xe8786a, post = { c: 0x7a6650, t: 'planks' };
        if (kind === 'home') { for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) k.cyl(post, S(x), 0, S(z), S(0.08), S(0.5), S(0.08)); k.box(post, 0, S(0.5), 0, S(1.4), S(0.08), S(1.4)); k.cone(shell, 0, S(0.58), 0, S(1.1), S(1.4) * g, S(1.1)); k.ico(shell, S(0.2), S(0.9) * g, S(0.3), S(0.5), S(0.5), S(0.5)); k.ico(coral, S(-0.5), S(0.62), S(0.5), S(0.2), S(0.3), S(0.2)); }
        else if (kind === 'hall') { k.mound(shell, 0, 0.3, 0, 2.8, 1.6 * g, 1.8); for (let q = 0; q < 5; q++) k.cone(coral, -1.1 + q * 0.55, 0, 0.9, 0.16, 0.6 + (q % 2) * 0.4, 0.16); k.ico(shell, 0, 1.55 * g, 0, 0.7, 0.5, 0.7); }
        else { k.mound(shell, 0, S(0.4), 0, S(2.6), S(2.0) * g, S(2.6)); k.glow(0xe0f4ff, 0, S(1.9) * g, 0, S(0.5), S(0.5), S(0.5)); for (let q = 0; q < 6; q++) k.cone(coral, Math.cos(q) * S(1.2), 0, Math.sin(q) * S(1.2), S(0.14), S(0.8), S(0.14)); }
        break;
      }
      case 'crystal': { // clustered crystal spires with glowing cores
        const cr = [176, 150, 236], cr2 = [140, 210, 240];
        if (kind === 'home') { k.cone6(cr, 0, 0, 0, S(0.9), S(1.8) * g, S(0.9)); k.cone6(cr2, S(0.45), 0, S(0.2), S(0.5), S(1.1) * g, S(0.5), 0.4); k.cone6(cr, S(-0.4), 0, S(-0.3), S(0.45), S(0.9) * g, S(0.45), 0.8); k.glow(0xc0f0ff, 0, S(0.5), 0, S(0.28), S(0.5), S(0.28)); }
        else if (kind === 'hall') { for (let q = 0; q < 6; q++) { const a = q * 1.05; k.cone6(q % 2 ? cr2 : cr, Math.cos(a) * 0.9, 0, Math.sin(a) * 0.6, 0.6, (1.6 + (q % 3) * 0.6) * g, 0.6, a); } k.cone6(cr, 0, 0, 0, 1.0, 2.8 * g, 1.0); k.glow(0xd8c0ff, 0, 0.8, 0, 0.5, 0.8, 0.5); }
        else { k.cone6(cr, 0, 0, 0, S(1.4), S(4.5) * g, S(1.4)); for (let q = 0; q < 4; q++) k.cone6(cr2, Math.cos(q * 1.57) * S(0.9), 0, Math.sin(q * 1.57) * S(0.9), S(0.5), S(1.6) * g, S(0.5)); k.glow(0xe8f8ff, 0, S(1.6) * g, 0, S(0.4), S(1.0), S(0.4)); }
        break;
      }
      case 'void': { // smooth white domes, glowing rings, masts
        const shell = { c: 0xe6eaf0, t: 'plaster' }, metal = 0x9aa4b0;
        if (kind === 'home') { k.mound(shell, 0, S(0.2), 0, S(1.6), S(1.1) * g, S(1.6)); k.cyl(metal, 0, S(0.05), 0, S(1.75), S(0.12), S(1.75)); k.glow(0x7affd0, 0, S(0.2), 0, S(1.8), S(0.04), S(1.8)); k.cyl(metal, 0, S(1.2) * g, 0, S(0.04), S(0.6), S(0.04)); k.glow(0xff4060, 0, S(1.8) * g, 0, S(0.06), S(0.06), S(0.06)); }
        else if (kind === 'hall') { for (const [x, z] of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) k.cyl(metal, x, 0, z, 0.1, 0.9, 0.1); k.cyl(shell, 0, 0.9, 0, 3.0, 0.3, 2.2); k.mound(shell, 0, 1.1, 0, 1.6, 0.8 * g, 1.2); k.glow(0x7affd0, 0, 0.95, 0, 3.1, 0.06, 2.3); }
        else { k.cyl(shell, 0, 0, 0, S(0.8), S(4.0) * g, S(0.8)); k.cone(shell, 0, S(4.0) * g, 0, S(0.8), S(1.2), S(0.8)); for (const y of [1.4, 2.6]) k.glow(0x7affd0, 0, S(y) * g, 0, S(1.6), S(0.06), S(1.6)); }
        break;
      }
    }
    // the later ages reach every people: lamps, then masts and lit rings around their own forms
    if (era >= 9) k.glow(0xffe2a0, S(0.3), S(0.35), S(0.62), S(0.18), S(0.16), S(0.02));
    if (era >= 10) { k.box({ c: 0x8c939c, t: 'metal' }, S(-0.35), S(1.2) * g, S(-0.2), S(0.03), S(0.8), S(0.03)); k.glow(0xff4a4a, S(-0.35), S(2.0) * g, S(-0.2), S(0.05), S(0.05), S(0.05)); }
    if (era >= 13) k.glowc(0x7affd0, 0, S(0.1), 0, S(kind === 'home' ? 1.8 : 3.0), S(0.04), S(kind === 'home' ? 1.8 : 2.4));
    return smokes;
  }

  // ============================================================ the later ages
  // From the Medieval age on, towns rebuild in the look of their age: half-timbered townhouses,
  // castles, cathedrals and windmills; brick terraces, factories, railway halls and domed capitols;
  // apartment blocks, skyscrapers, malls and cooling towers; glass towers, data centres and wind
  // farms; arcologies, fusion rings and launch towers. Regional flavour stays in walls and roofs
  // (whitewash and domes in dry lands, steep roofs in the north). Bands: 0 Medieval-Renaissance,
  // 1 Industrial, 2 Modern-Atomic, 3 Information, 4 Space Age and beyond.
  const BRICK = { c: 0xa65a42, t: 'brick' }, BRICK2 = { c: 0x8a4a3a, t: 'brick' }, YBRICK = { c: 0xc8a070, t: 'brick' };
  const CONC = { c: 0xbab6ae, t: 'concrete' }, CONC2 = { c: 0x98948c, t: 'concrete' };
  const GLASS = { c: 0x86acd0, t: 'glass' }, GLASS2 = { c: 0x5e88b0, t: 'glass' }, GGREEN = { c: 0x7ab8a0, t: 'glass' };
  const STEEL = { c: 0x8c939c, t: 'metal' }, STEEL2 = { c: 0x5c636c, t: 'metal' }, WHITE = { c: 0xeef1f4, t: 'plaster' }, WMETAL = { c: 0xe4e8ee, t: 'metal' };
  const SLATE_T = { c: 0x4f5864, t: 'tiles' }, LAMP = 0xffe2a0, COOL = 0xbfe6ff, NEON = 0x7affd0, NEON2 = 0x7ab8ff, REDL = 0xff4a4a;
  const eraBand = (era) => (era >= 13 ? 4 : era >= 12 ? 3 : era >= 10 ? 2 : era >= 9 ? 1 : era >= 7 ? 0 : -1);
  M.eraBand = eraBand;
  // lit windows on the four faces of a w x d block, n per row, at the given heights
  function winGrid(k, w, d, ys, n, hex, ww, wh) {
    ww = ww || 0.14; wh = wh || 0.16;
    for (const y of ys) for (let q = 0; q < n; q++) {
      const fx = -w / 2 + (w / n) * (q + 0.5), fz = -d / 2 + (d / n) * (q + 0.5);
      k.glow(hex, fx, y, d / 2 + 0.012, ww, wh, 0.02); k.glow(hex, fx, y, -d / 2 - 0.012, ww, wh, 0.02);
      k.glow(hex, w / 2 + 0.012, y, fz, 0.02, wh, ww); k.glow(hex, -w / 2 - 0.012, y, fz, 0.02, wh, ww);
    }
  }
  const floors = (y0, n, h) => Array.from({ length: n }, (_, q) => y0 + q * h);
  // a lattice mast: four legs and cross bars
  function lattice(k, mat, y0, h, r0, r1) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lean = (r0 - r1) / h; k.box(mat, sx * r0, y0, sz * r0, 0.05, h, 0.05, 0, -sz * lean, sx * lean); }
    for (let y = y0 + 0.4; y < y0 + h; y += 0.55) { const r = r0 + (r1 - r0) * ((y - y0) / h); k.box(mat, 0, y, r, r * 2, 0.03, 0.03); k.box(mat, 0, y, -r, r * 2, 0.03, 0.03); k.box(mat, r, y, 0, 0.03, 0.03, r * 2); k.box(mat, -r, y, 0, 0.03, 0.03, r * 2); }
  }
  // a rocket on its pad (the Space Age launch complex)
  function rocket(k, x, z, h, kc) {
    k.cyl(WMETAL, x, 0.3, z, 0.42, h, 0.42); k.cone(WMETAL, x, 0.3 + h, z, 0.42, 0.7, 0.42);
    k.cyl(kc, x, 0.3 + h * 0.62, z, 0.43, 0.25, 0.43);
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; k.box(STEEL2, x + Math.cos(a) * 0.28, 0.3, z + Math.sin(a) * 0.28, 0.04, 0.6, 0.3, -a); }
    for (const a of [0.8, 2.4, 3.9, 5.5]) k.cyl(WMETAL, x + Math.cos(a) * 0.32, 0.3, z + Math.sin(a) * 0.32, 0.2, h * 0.45, 0.2);
  }
  function eraKit(k, type, style, kc, v, era, roof) {
    const BT = AG.BT, band = eraBand(era), smokes = [], flag = (kc[0] << 16) | (kc[1] << 8) | kc[2];
    const dry = style === 'dry' || style === 'tropic', north = style === 'snow' || style === 'cold';
    const tile = { c: roof, t: 'tiles' }, home = type === BT.HOUSE || type === BT.HUT;
    const s = type === BT.HUT ? 0.86 : 1, S = (n) => n * s;
    if (band === 0) {
      if (home) {
        if (dry) { // whitewashed courtyard house: flat roof, parapet, a little dome or a wind tower, a wooden balcony
          const wall = { c: [0xf0e8d8, 0xe8dcc4, 0xf4ece0][v], t: 'plaster' };
          k.box(wall, 0, 0, 0, S(1.5), S(1.25), S(1.4)); k.box(wall, 0, S(1.25), 0, S(1.56), S(0.12), S(1.46));
          if (v === 1) { k.cyl(wall, S(0.3), S(1.25), S(-0.2), S(0.6), S(0.18), S(0.6)); k.ico(wall, S(0.3), S(1.48), S(-0.2), S(0.62), S(0.5), S(0.62)); }
          else { k.box(wall, S(-0.45), S(1.25), S(-0.4), S(0.4), S(0.6), S(0.4)); k.glow(0x2a2018, S(-0.45), S(1.55), S(-0.19), S(0.22), S(0.2), S(0.02)); }
          k.box({ c: 0x6a4a2e, t: 'planks' }, S(0.35), S(0.6), S(0.74), S(0.5), S(0.42), S(0.14));
          k.box(DOOR, S(-0.3), 0, S(0.705), S(0.3), S(0.55), S(0.02)); k.cone(DOOR, S(-0.3), S(0.55), S(0.705), S(0.3), S(0.14), S(0.02));
          winGrid(k, S(1.5), S(1.4), [S(0.85)], 2, LAMP, S(0.1), S(0.16));
          return smokes;
        }
        // a half-timbered townhouse: stone ground floor, jettied upper floor, steep roof, chimney
        const plaster = { c: [0xeee4cc, 0xe6d6b6, 0xf0e2c8][v], t: 'plaster' }, st = { c: 0x9a948a, t: 'masonry' };
        k.box(st, 0, 0, 0, S(1.4), S(0.62), S(1.3));
        k.box(plaster, 0, S(0.62), 0, S(1.52), S(0.6), S(1.42)); k.box(BEAM, 0, S(0.62), 0, S(1.56), S(0.05), S(1.46));
        if (era >= 8) k.box(plaster, 0, S(1.22), 0, S(1.52), S(0.5), S(1.42)); // the Renaissance adds a storey
        const top = era >= 8 ? S(1.72) : S(1.22);
        for (const x of [-0.74, -0.25, 0.25, 0.74]) { k.box(BEAM, S(x), S(0.62), S(0.715), S(0.06), top - S(0.62), S(0.02)); k.box(BEAM, S(x), S(0.62), S(-0.715), S(0.06), top - S(0.62), S(0.02)); }
        k.box(BEAM, 0, S(0.9), S(0.715), S(1.52), S(0.04), S(0.02), 0, 0, 0.0); k.box(BEAM, S(-0.5), S(0.75), S(0.716), S(0.04), S(0.5), S(0.02), 0, 0, 0.7);
        k.prism(north ? { c: 0x3a3a3a, t: 'tiles' } : tile, 0, top, 0, S(1.7), north ? S(1.3) : S(1.0), S(1.56));
        if (v === 2 && era >= 8) { for (let q = 0; q < 3; q++) k.box(st, 0, top + S(q * 0.28), S(0.72), S(1.4 - q * 0.42), S(0.28), S(0.1)); } // a stepped gable
        k.box(DOOR, S(0.3), 0, S(0.655), S(0.3), S(0.52), S(0.02)); k.box(st, S(-0.45), top - S(0.3), S(-0.35), S(0.22), S(1.1), S(0.22)); smokes.push([S(-0.45), top + S(0.85), S(-0.35)]);
        winGrid(k, S(1.52), S(1.42), era >= 8 ? [S(0.8), S(1.35)] : [S(0.82)], 2, LAMP, S(0.16), S(0.18));
        return smokes;
      }
      switch (type) {
        case BT.HALL: { // a guildhall: an open arcade below, a council room above, a belfry
          const st = { c: 0xb0a898, t: 'masonry' };
          k.box(st, 0, 0, 0, 2.6, 0.12, 1.7);
          for (let q = 0; q < 5; q++) { k.cyl(st, -1.0 + q * 0.5, 0.12, 0.62, 0.14, 0.62, 0.14); }
          k.box(st, 0, 0.12, -0.15, 2.4, 0.62, 1.1); k.box(st, 0, 0.74, 0, 2.5, 0.75, 1.5); k.prism(tile, 0, 1.49, 0, 2.6, 0.75, 1.6, Math.PI / 2);
          k.box(st, 0.85, 1.49, 0, 0.5, 1.2, 0.5); k.cone(tile, 0.85, 2.69, 0, 0.62, 0.9, 0.62); k.box(GOLD, 0.85, 3.59, 0, 0.04, 0.3, 0.04);
          k.box(flag, -0.6, 1.0, 0.76, 0.35, 0.5, 0.02); winGrid(k, 2.5, 1.5, [1.05], 4, LAMP, 0.14, 0.24);
          return smokes;
        }
        case BT.TEMPLE: {
          if (dry || era >= 8) { // a great domed temple on a drum, slender towers at the corners
            const wall = { c: dry ? 0xece2cc : 0xd8d0c0, t: 'plaster' };
            k.box(wall, 0, 0, 0, 2.6, 1.3, 2.6); k.cyl(wall, 0, 1.3, 0, 1.6, 0.5, 1.6); k.ico(dry ? { c: 0x4a8ab0, t: 'tiles' } : tile, 0, 2.05, 0, 1.75, 1.5, 1.75);
            k.cyl(wall, 0, 2.7, 0, 0.3, 0.3, 0.3); k.cone(GOLD, 0, 3.0, 0, 0.2, 0.4, 0.2);
            for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) { k.cyl(wall, x, 0, z, 0.28, 2.6, 0.28); k.cone(dry ? GOLD : tile, x, 2.6, z, 0.32, 0.6, 0.32); }
            k.box(DOOR, 0, 0, 1.31, 0.5, 0.8, 0.02); k.glow(0xffc46b, 0, 0.9, 1.31, 0.3, 0.3, 0.02);
            return smokes;
          }
          // a cathedral: long nave, transept, twin west towers with spires, a rose window
          const st = { c: 0xb8b0a0, t: 'masonry' }, dark = { c: 0x3a4048, t: 'tiles' };
          k.box(st, 0, 0, 0.1, 1.2, 1.3, 2.4); k.prism(dark, 0, 1.3, 0.1, 1.3, 0.7, 2.44);
          k.box(st, 0, 0, -0.2, 2.6, 1.1, 0.8); k.prism(dark, 0, 1.1, -0.2, 0.84, 0.6, 2.64, Math.PI / 2);
          for (const x of [-0.45, 0.45]) { k.box(st, x, 0, 1.1, 0.5, 2.3, 0.5); k.cone(dark, x, 2.3, 1.1, 0.5, 1.2, 0.5); }
          k.cone(dark, 0, 1.6, -0.2, 0.3, 1.4, 0.3);
          k.glowc(0xffc46b, 0, 1.0, 1.36, 0.42, 0.02, 0.42, 0, Math.PI / 2); k.box(DOOR, 0, 0, 1.36, 0.36, 0.6, 0.02);
          for (let q = 0; q < 4; q++) { k.glow(0xffb85a, 0.61, 0.5, -0.8 + q * 0.55, 0.02, 0.5, 0.14); k.glow(0xffb85a, -0.61, 0.5, -0.8 + q * 0.55, 0.02, 0.5, 0.14); }
          return smokes;
        }
        case BT.SHRINE: { // a wayside chapel with a bell gable
          const st = { c: 0xc8c0b0, t: 'masonry' };
          k.box(st, 0, 0, 0, 0.6, 0.5, 0.75); k.prism(tile, 0, 0.5, 0, 0.66, 0.3, 0.8); k.box(st, 0, 0.5, 0.36, 0.3, 0.45, 0.06); k.glow(0xffc46b, 0, 0.12, 0.38, 0.16, 0.24, 0.02);
          return smokes;
        }
        case BT.MARKET: { // a market hall on columns, the town's goods beneath, stalls around
          const st = { c: 0xb0a898, t: 'masonry' };
          k.box({ c: 0x9c968c, t: 'cobble' }, 0, 0, 0, 2.9, 0.05, 2.9);
          for (const x of [-0.9, -0.3, 0.3, 0.9]) for (const z of [-0.6, 0.6]) k.box(BEAM, x, 0.05, z, 0.12, 0.7, 0.12);
          k.box({ c: 0xe6d6b6, t: 'plaster' }, 0, 0.75, 0, 2.1, 0.6, 1.5); for (const x of [-1.0, -0.5, 0, 0.5, 1.0]) k.box(BEAM, x, 0.75, 0.76, 0.05, 0.6, 0.02);
          k.prism(tile, 0, 1.35, 0, 2.2, 0.8, 1.6, Math.PI / 2);
          for (let q = 0; q < 4; q++) { const x = -1.1 + q * 0.73; k.box(q % 2 ? 0xf6efe2 : flag, x, 0.5, 1.15, 0.5, 0.04, 0.5, 0, 0.2); k.box({ c: 0x8a6440, t: 'planks' }, x, 0.05, 1.15, 0.45, 0.32, 0.3); }
          winGrid(k, 2.1, 1.5, [0.95], 4, LAMP, 0.14, 0.18);
          return smokes;
        }
        case BT.WORKSHOP: { // a mill house with a water wheel and a forge chimney
          const st = { c: 0x9a948a, t: 'masonry' };
          k.box(st, 0, 0, -0.1, 2.2, 1.1, 1.5); k.prism(tile, 0, 1.1, -0.1, 2.3, 0.8, 1.6, Math.PI / 2);
          k.cyl({ c: 0x6a4a2e, t: 'planks' }, 1.34, 0.55, 0.2, 1.1, 0.18, 1.1, 0, 0, Math.PI / 2); for (let q = 0; q < 6; q++) k.cbox(BEAM, 1.25, 0.55, 0.2, 0.22, 1.2, 0.05, 0, q * 0.52);
          k.box(st, -0.7, 0.8, -0.5, 0.32, 1.4, 0.32); smokes.push([-0.7, 2.3, -0.5]);
          k.box(DOOR, -0.2, 0, 0.66, 0.5, 0.6, 0.02); k.glow(0xff9a3c, -0.2, 0.05, 0.665, 0.4, 0.3, 0.02);
          return smokes;
        }
        case BT.GRANARY: { // a tower windmill, its sails turned to the wind
          const st = { c: 0xd8d0c0, t: 'plaster' };
          k.taper(st, 0, 0, 0, 1.3, 1.9, 1.3); k.cone({ c: 0x5a4a3a, t: 'planks' }, 0, 1.9, 0, 1.0, 0.6, 1.0);
          k.box(BEAM, 0, 1.75, 0.55, 0.12, 0.12, 0.3);
          for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.4; k.box({ c: 0x8a6a4a, t: 'planks' }, 0, 1.75, 0.7, 0.05, 1.25, 0.04, 0, 0, a - Math.PI / 2); k.box({ c: 0xe8e0cc, t: 'cloth' }, Math.cos(a) * 0.05 - Math.sin(a) * 0.12, 1.75 + Math.sin(a) * 0.05 + Math.cos(a) * 0.12, 0.72, 0.24, 1.1, 0.02, 0, 0, a - Math.PI / 2); }
          k.box(DOOR, 0, 0, 0.62, 0.28, 0.5, 0.04); k.glow(LAMP, 0, 1.0, 0.56, 0.12, 0.16, 0.02);
          return smokes;
        }
        case BT.DOCK: { // a stone quay with a treadwheel crane
          const st = { c: 0x9a948a, t: 'masonry' };
          k.box(st, 0, -1.0, 0, 2.0, 1.15, 2.0); k.box({ c: 0x8a6440, t: 'planks' }, 0, 0.15, 0.2, 1.9, 0.05, 1.4);
          k.cyl({ c: 0x6a4a2e, t: 'planks' }, -0.5, 0.2, -0.4, 0.8, 0.4, 0.8, 0, 0, Math.PI / 2); k.box(BEAM, -0.5, 0.6, -0.4, 0.1, 1.2, 0.1); k.box(BEAM, -0.1, 1.7, -0.4, 1.0, 0.08, 0.08, 0, 0, -0.3);
          k.box({ c: 0x9c7448, t: 'planks' }, 0.5, 0.2, 0.5, 0.35, 0.3, 0.35); k.cyl({ c: 0x7a4f2a, t: 'planks' }, 0.1, 0.2, 0.6, 0.26, 0.34, 0.26);
          return smokes;
        }
      }
      return null; // (castles, towers, walls, mines, farms keep their designs)
    }
    if (band === 1) { // ---------------------------------------------------- Industrial
      if (home) {
        if (dry) { // a stuccoed colonial house: tall shuttered windows, a veranda, a low tile roof
          const wall = { c: [0xf2e2c0, 0xe8cfa8, 0xd8e2d0][v], t: 'plaster' };
          k.box(wall, 0, 0, 0, S(1.5), S(1.5), S(1.3)); k.box({ c: roof, t: 'tiles' }, 0, S(1.5), 0, S(1.62), S(0.1), S(1.42));
          k.box(wall, 0, S(0.72), S(0.78), S(1.5), S(0.06), S(0.3)); for (const x of [-0.7, 0, 0.7]) k.box(WHITE, S(x), 0, S(0.9), S(0.06), S(0.72), S(0.06));
          for (const x of [-0.4, 0.4]) { k.box(0x4a7a5a, S(x - 0.13), S(0.9), S(0.66), S(0.08), S(0.4), S(0.02)); k.box(0x4a7a5a, S(x + 0.13), S(0.9), S(0.66), S(0.08), S(0.4), S(0.02)); }
          winGrid(k, S(1.5), S(1.3), [S(0.35), S(1.1)], 2, LAMP, S(0.14), S(0.3));
          return smokes;
        }
        const br = v === 1 ? YBRICK : BRICK, storeys = v === 2 ? 4 : v === 1 ? 3 : 2, H = storeys * 0.5;
        k.box(br, 0, 0, 0, S(1.5), S(H), S(1.36)); k.box(CONC, 0, S(H), 0, S(1.56), S(0.06), S(1.42));
        if (v === 1) { k.box(SLATE_T, 0, S(H + 0.06), 0, S(1.3), S(0.5), S(1.16)); for (const x of [-0.35, 0.35]) k.box(WHITE, S(x), S(H + 0.15), S(0.6), S(0.22), S(0.25), S(0.08)); }
        else k.prism(SLATE_T, 0, S(H + 0.06), 0, S(1.6), S(0.55), S(1.46));
        for (const x of [-0.5, 0.5]) { k.box(br, S(x), S(H), S(-0.5), S(0.2), S(0.9), S(0.3)); for (const dx of [-0.05, 0.05]) k.cyl({ c: 0xb06a4a, t: 'plain' }, S(x + dx), S(H + 0.9), S(-0.5), S(0.07), S(0.12), S(0.07)); smokes.push([S(x), S(H + 1.1), S(-0.5)]); }
        k.box(0x2a3a4a, S(-0.35), 0, S(0.685), S(0.26), S(0.44), S(0.02)); k.box(0x4a2a2a, S(0.35), 0, S(0.685), S(0.26), S(0.44), S(0.02)); k.box(CONC2, 0, 0, S(0.74), S(1.4), S(0.06), S(0.1));
        winGrid(k, S(1.5), S(1.36), floors(S(0.6), storeys - 1, S(0.5)).concat([S(0.1 + 0.15)]).slice(0, storeys), 3, LAMP, S(0.16), S(0.24));
        return smokes;
      }
      switch (type) {
        case BT.HALL: { // a town hall: columns, a pediment and a clock tower
          k.box(CONC, 0, 0, 0, 2.7, 0.2, 1.8); k.box(YBRICK, 0, 0.2, -0.15, 2.5, 1.2, 1.3);
          for (let q = 0; q < 6; q++) k.cyl(WHITE, -1.0 + q * 0.4, 0.2, 0.62, 0.14, 1.1, 0.14);
          k.box(WHITE, 0, 1.3, 0.55, 2.4, 0.12, 0.4); k.prism(WHITE, 0, 1.42, 0.55, 2.4, 0.4, 0.4, Math.PI / 2); k.box(SLATE_T, 0, 1.4, -0.2, 2.5, 0.3, 1.2);
          k.box(YBRICK, 0, 1.4, -0.3, 0.6, 1.4, 0.6); k.glowc(0xfff4d0, 0, 2.3, 0.01, 0.4, 0.02, 0.4, 0, Math.PI / 2); k.cone(SLATE_T, 0, 2.8, -0.3, 0.7, 0.8, 0.7); k.box(flag, 0.1, 3.7, -0.3, 0.4, 0.26, 0.03); k.box(STEEL2, 0, 3.6, -0.3, 0.04, 0.5, 0.04);
          winGrid(k, 2.5, 1.3, [0.5, 1.0], 5, LAMP, 0.16, 0.28);
          return smokes;
        }
        case BT.TEMPLE: {
          if (dry) return eraKit(k, type, style, kc, v, 8, roof);
          // a brick church with a tall spire
          k.box(BRICK2, 0, 0, -0.2, 1.4, 1.4, 2.2); k.prism(SLATE_T, 0, 1.4, -0.2, 1.5, 0.8, 2.26);
          k.box(BRICK2, 0, 0, 1.05, 0.7, 2.4, 0.7); k.cone6(SLATE_T, 0, 2.4, 1.05, 0.72, 2.2, 0.72); k.box(GOLD, 0, 4.6, 1.05, 0.04, 0.3, 0.04);
          k.glowc(0xfff4d0, 0, 2.0, 1.41, 0.32, 0.02, 0.32, 0, Math.PI / 2); k.box(DOOR, 0, 0, 1.41, 0.3, 0.6, 0.02);
          for (let q = 0; q < 4; q++) { k.glow(0xffb85a, 0.71, 0.5, -1.1 + q * 0.55, 0.02, 0.6, 0.16); k.glow(0xffb85a, -0.71, 0.5, -1.1 + q * 0.55, 0.02, 0.6, 0.16); }
          return smokes;
        }
        case BT.SHRINE: { k.box(BRICK2, 0, 0, 0, 0.6, 0.55, 0.75); k.prism(SLATE_T, 0, 0.55, 0, 0.66, 0.35, 0.8); k.cone6(SLATE_T, 0, 0.9, 0.3, 0.2, 0.5, 0.2); k.glow(0xffc46b, 0, 0.12, 0.38, 0.16, 0.26, 0.02); return smokes; }
        case BT.KEEP: { // a domed capitol with wings, columns and the realm's flag
          k.box(CONC, 0, 0, 0, 3.8, 0.3, 3.0); for (let q = 0; q < 3; q++) k.box(WHITE, 0, 0.3 + q * 0.08, 1.35 - q * 0.12, 1.6, 0.08, 0.3);
          k.box(WHITE, 0, 0.3, -0.2, 3.6, 1.3, 1.8); k.box(WHITE, 0, 1.6, -0.2, 3.7, 0.12, 1.9);
          for (let q = 0; q < 8; q++) k.cyl(WHITE, -1.4 + q * 0.4, 0.55, 0.85, 0.16, 1.05, 0.16);
          k.prism(WHITE, 0, 1.6, 0.85, 1.8, 0.45, 0.3, Math.PI / 2);
          k.cyl(WHITE, 0, 1.72, -0.2, 1.4, 0.7, 1.4); for (let q = 0; q < 12; q++) { const a = q / 12 * Math.PI * 2; k.cyl(WHITE, Math.cos(a) * 0.72, 1.72, -0.2 + Math.sin(a) * 0.72, 0.08, 0.7, 0.08); }
          k.ico({ c: 0x9ab0b8, t: 'metal' }, 0, 2.5, -0.2, 1.45, 1.2, 1.45); k.cyl(WHITE, 0, 3.0, -0.2, 0.3, 0.4, 0.3); k.box(STEEL2, 0, 3.4, -0.2, 0.04, 0.8, 0.04); k.box(flag, 0.25, 3.95, -0.2, 0.46, 0.3, 0.03);
          winGrid(k, 3.6, 1.8, [0.7, 1.2], 7, LAMP, 0.14, 0.26);
          return smokes;
        }
        case BT.MARKET: { // a railway hall: a brick front with a clock and an arched glass roof
          k.box(CONC2, 0, 0, 0, 2.9, 0.06, 2.9);
          k.cyl(GLASS, 0, 0.3, -1.4, 2.4, 2.4, 1.8, 0, Math.PI / 2); k.box(STEEL2, 0, 0.06, -0.2, 2.5, 0.26, 2.4);
          for (let q = 0; q < 5; q++) k.cyl(STEEL2, 0, 0.3, -1.38 + q * 0.58, 2.46, 0.05, 1.86, 0, Math.PI / 2);
          k.box(BRICK, 0, 0, 1.15, 2.8, 1.5, 0.5); k.prism(SLATE_T, 0, 1.5, 1.15, 2.85, 0.5, 0.55, Math.PI / 2); k.box(BRICK, 0, 1.5, 1.15, 0.6, 0.9, 0.5); k.glowc(0xfff4d0, 0, 1.95, 1.41, 0.36, 0.02, 0.36, 0, Math.PI / 2);
          winGrid(k, 2.8, 0.5, [0.3, 0.9], 6, LAMP, 0.18, 0.36);
          k.box(STEEL, 0, 0.06, -1.4, 0.06, 0.04, 1.0); k.box(STEEL, 0.4, 0.06, -1.4, 0.06, 0.04, 1.0);
          return smokes;
        }
        case BT.WORKSHOP: { // a factory: saw-tooth roofs and tall smokestacks
          k.box(CONC2, 0, 0, 0, 2.9, 0.08, 2.6); k.box(BRICK2, 0, 0.08, 0, 2.6, 1.0, 2.2);
          for (let q = 0; q < 4; q++) { k.box(SLATE_T, -0.98 + q * 0.65, 1.08, 0, 0.62, 0.42, 2.2, 0, 0, 0.6); k.glow(COOL, -1.1 + q * 0.65, 1.12, 0, 0.02, 0.32, 2.0, 0); }
          for (const [x, z, h] of [[1.0, -0.8, 3.2], [0.4, -0.85, 2.6]]) { k.taper(BRICK, x, 0.08, z, 0.42, h, 0.42); k.cyl(BRICK2, x, 0.08 + h, z, 0.34, 0.12, 0.34); smokes.push([x, h + 0.3, z]); }
          winGrid(k, 2.6, 2.2, [0.45], 6, 0xffc070, 0.2, 0.36);
          return smokes;
        }
        case BT.GRANARY: { // grain silos, an elevator and a water tower
          for (let q = 0; q < 3; q++) { k.cyl(CONC, -0.55 + q * 0.42, 0, -0.2, 0.44, 2.0, 0.44); k.cone(CONC2, -0.55 + q * 0.42, 2.0, -0.2, 0.44, 0.2, 0.44); }
          k.box(CONC2, 0.55, 0, 0.1, 0.4, 2.6, 0.4); k.box(STEEL2, 0.2, 2.2, -0.2, 0.8, 0.08, 0.1);
          for (const [x, z] of [[0.35, 0.55], [0.75, 0.55], [0.35, 0.85], [0.75, 0.85]]) k.box(STEEL2, x, 0, z, 0.04, 1.3, 0.04);
          k.cyl({ c: 0x8a6a4a, t: 'planks' }, 0.55, 1.3, 0.7, 0.55, 0.45, 0.55); k.cone(STEEL2, 0.55, 1.75, 0.7, 0.6, 0.25, 0.6);
          return smokes;
        }
        case BT.TOWER: { // an artillery bastion: thick sloped brick, cannon in the embrasures
          k.taper(BRICK2, 0, 0, 0, 1.7, 1.5, 1.7); k.cyl(CONC, 0, 1.5, 0, 1.2, 0.14, 1.2);
          for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.4; k.cyl(0x2a2a2a, Math.cos(a) * 0.5, 1.32, Math.sin(a) * 0.5, 0.12, 0.6, 0.12, Math.PI - a, 0, Math.PI / 2); }
          k.box(STEEL2, 0, 1.64, 0, 0.04, 0.9, 0.04); k.box(flag, 0.2, 2.25, 0, 0.36, 0.24, 0.03);
          return smokes;
        }
        case BT.DOCK: { // an iron harbour crane and a brick warehouse
          k.box(CONC2, 0, -1.0, 0, 2.0, 1.12, 2.0);
          k.box(BRICK, -0.4, 0.12, -0.3, 1.0, 0.9, 1.2); k.prism(SLATE_T, -0.4, 1.02, -0.3, 1.05, 0.35, 1.25);
          lattice(k, STEEL2, 0.12, 1.8, 0.22, 0.12); k.box(STEEL2, 0.6, 1.9, 0.4, 1.4, 0.1, 0.1, -0.7); k.box(STEEL, 0.55, 0.12, 0.55, 0.06, 1.8, 0.06);
          return smokes;
        }
        case BT.MINE: { // a pithead: a steel headframe with its wheel and the brick engine house
          k.mound(0x5a5550, -0.4, 0.2, -0.4, 1.2, 0.9, 1.0);
          lattice(k, STEEL2, 0, 2.0, 0.35, 0.15); k.cyl(STEEL2, 0, 2.0, 0, 0.6, 0.06, 0.6, 0, Math.PI / 2);
          k.box(BRICK, 0.5, 0, 0.4, 0.7, 0.8, 0.6); k.prism(SLATE_T, 0.5, 0.8, 0.4, 0.75, 0.3, 0.65); k.taper(BRICK, 0.75, 0, 0.6, 0.2, 1.8, 0.2); smokes.push([0.75, 1.9, 0.6]);
          return smokes;
        }
        case BT.WALL: { k.box(BRICK2, 0, 0, 0, 1.0, 0.8, 0.7); k.box(CONC, 0, 0.8, 0, 1.04, 0.08, 0.74); return smokes; }
      }
      return null;
    }
    if (band === 2) { // ---------------------------------------------------- Modern and Atomic
      if (home) {
        if (v === 0) { // a concrete apartment block, balconies on every floor
          const fl = 5 + (era >= 11 ? 2 : 0), H = fl * 0.42;
          k.box(CONC, 0, 0, 0, S(1.5), S(H), S(1.3)); k.box(CONC2, 0, S(H), 0, S(1.54), S(0.08), S(1.34));
          for (let q = 1; q < fl; q++) k.box(CONC2, 0, S(q * 0.42), S(0.7), S(1.4), S(0.04), S(0.14));
          k.box(STEEL2, S(0.4), S(H + 0.08), S(-0.3), S(0.4), S(0.3), S(0.4));
          winGrid(k, S(1.5), S(1.3), floors(S(0.14), fl, S(0.42)), 4, LAMP, S(0.18), S(0.2));
          return smokes;
        }
        if (v === 1) { // a suburban house: low pitched roof, picture window, garage and a car
          const wall = { c: [0xe8e0d0, 0xd8e0e8, 0xf0e0c8][(era + 1) % 3], t: 'plaster' };
          k.box(wall, S(-0.15), 0, 0, S(1.1), S(0.6), S(1.1)); k.prism({ c: 0x5a5a60, t: 'tiles' }, S(-0.15), S(0.6), 0, S(1.3), S(0.35), S(1.2));
          k.box(wall, S(0.6), 0, S(-0.1), S(0.6), S(0.45), S(0.8)); k.box(CONC2, S(0.6), S(0.45), S(-0.1), S(0.64), S(0.05), S(0.84)); k.box(WHITE, S(0.6), 0, S(0.305), S(0.5), S(0.38), S(0.02));
          k.box(flag, S(0.6), 0, S(0.6), S(0.26), S(0.14), S(0.42)); k.box(GLASS2, S(0.6), S(0.14), S(0.58), S(0.22), S(0.1), S(0.24));
          k.glow(LAMP, S(-0.15), S(0.2), S(0.555), S(0.5), S(0.26), S(0.02)); k.box(0x4a6a3a, S(-0.6), 0, S(0.65), S(0.2), S(0.2), S(0.2));
          return smokes;
        }
        // a brick mid-rise with a water tank on the roof
        const fl = 7, H = fl * 0.4;
        k.box(BRICK, 0, 0, 0, S(1.5), S(H), S(1.4)); k.box(CONC, 0, S(H), 0, S(1.54), S(0.08), S(1.44));
        for (const [x, z] of [[0.2, 0.2], [0.5, 0.2], [0.2, 0.5], [0.5, 0.5]]) k.box(STEEL2, S(x), S(H + 0.08), S(z), S(0.03), S(0.3), S(0.03));
        k.cyl({ c: 0x7a5a3a, t: 'planks' }, S(0.35), S(H + 0.38), S(0.35), S(0.4), S(0.35), S(0.4)); k.cone(STEEL2, S(0.35), S(H + 0.73), S(0.35), S(0.44), S(0.18), S(0.44));
        winGrid(k, S(1.5), S(1.4), floors(S(0.14), fl, S(0.4)), 4, LAMP, S(0.16), S(0.2));
        return smokes;
      }
      switch (type) {
        case BT.HALL: { // a civic centre: a long concrete slab on pilotis, a glass lobby, a flag
          k.box(CONC2, 0, 0, 0, 2.8, 0.06, 1.8); for (let q = 0; q < 6; q++) k.box(CONC, -1.1 + q * 0.44, 0.06, 0.5, 0.1, 0.6, 0.1);
          k.box(GLASS2, 0, 0.06, -0.1, 2.0, 0.6, 0.9); k.box(CONC, 0, 0.66, 0, 2.7, 0.9, 1.4); k.box(STEEL2, 1.2, 0.06, 0.8, 0.04, 2.0, 0.04); k.box(flag, 1.42, 1.75, 0.8, 0.42, 0.28, 0.03);
          winGrid(k, 2.7, 1.4, [0.85, 1.25], 8, LAMP, 0.22, 0.2);
          return smokes;
        }
        case BT.TEMPLE: { // a modern temple: a soaring concrete A-frame, a free-standing bell tower
          k.box(CONC2, 0, 0, 0, 2.8, 0.1, 2.8); k.prism(CONC, 0, 0.1, -0.2, 2.0, 2.4, 2.2); k.glow(0xffd28a, 0, 0.1, 0.91, 0.5, 1.4, 0.02);
          k.box(CONC, 1.1, 0.1, 1.0, 0.36, 3.0, 0.36); k.box(GOLD, 1.1, 3.1, 1.0, 0.04, 0.5, 0.04); k.glow(0xffd28a, 1.1, 2.4, 1.19, 0.18, 0.4, 0.02);
          return smokes;
        }
        case BT.SHRINE: { k.box(CONC, 0, 0, 0, 0.6, 0.06, 0.6); k.box(CONC, 0, 0.06, -0.15, 0.4, 0.7, 0.2); k.glow(0xffd28a, 0, 0.3, -0.04, 0.1, 0.3, 0.02); return smokes; }
        case BT.KEEP: { // a stepped skyscraper of the machine age, a spire and beacon on top
          const H = era >= 11 ? 7 : 5.5;
          k.box(CONC2, 0, 0, 0, 3.8, 0.2, 3.8); k.box(YBRICK, 0, 0.2, 0, 2.8, H * 0.5, 2.8); k.box(YBRICK, 0, 0.2 + H * 0.5, 0, 2.2, H * 0.3, 2.2); k.box(YBRICK, 0, 0.2 + H * 0.8, 0, 1.5, H * 0.2, 1.5);
          k.cone6({ c: 0xc8ccd0, t: 'metal' }, 0, 0.2 + H, 0, 1.0, 1.4, 1.0); k.box(STEEL, 0, 1.6 + H, 0, 0.05, 1.2, 0.05); k.glow(REDL, 0, 2.8 + H, 0, 0.1, 0.1, 0.1);
          winGrid(k, 2.8, 2.8, floors(0.5, Math.floor(H * 0.5 / 0.4), 0.4), 6, LAMP, 0.16, 0.2); winGrid(k, 2.2, 2.2, floors(0.4 + H * 0.5, Math.floor(H * 0.3 / 0.4), 0.4), 5, LAMP, 0.16, 0.2);
          k.box(flag, 0, 0.2, 1.42, 0.8, 0.5, 0.02);
          return smokes;
        }
        case BT.MARKET: { // a shopping mall: a low box, a glass entrance, signs and a car park
          k.box({ c: 0x3a3c40, t: 'plain' }, 0, 0, 0, 2.9, 0.04, 2.9); for (let q = 0; q < 5; q++) k.box(WHITE, -1.1 + q * 0.55, 0.04, 1.0, 0.03, 0.005, 0.6);
          k.box(CONC, 0, 0.04, -0.45, 2.6, 0.9, 1.7); k.box(GLASS, 0, 0.04, 0.42, 0.9, 0.7, 0.06); k.glow(flag, 0, 0.75, 0.43, 1.4, 0.16, 0.02);
          for (let q = 0; q < 4; q++) k.box([0xd04040, 0x4060c0, 0xe0e0e0, 0x40a060][q], -1.0 + q * 0.6, 0.04, 1.05 + (q % 2) * 0.2, 0.16, 0.12, 0.3);
          return smokes;
        }
        case BT.WORKSHOP: {
          if (era >= 11 && v === 0) { // a power station: cooling towers steaming
            for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4]]) { k.taper(CONC, x, 0, z, 1.15, 1.7, 1.15); k.taper(CONC, x, 1.7, z, 0.82, 0.5, 0.82, 0, Math.PI); k.cyl(0x2a2a2a, x, 2.19, z, 0.62, 0.02, 0.62); smokes.push([x, 2.4, z], [x + 0.15, 2.4, z]); }
            k.box(CONC2, 0, 0, 0.75, 1.6, 0.7, 0.8); k.cyl(CONC, 0.9, 0, 0.8, 0.6, 0.9, 0.6); k.ico(CONC, 0.9, 0.9, 0.8, 0.6, 0.5, 0.6);
            return smokes;
          }
          // a factory of metal sheds with a tall banded stack
          k.box(CONC2, 0, 0, 0, 2.9, 0.06, 2.6); k.box(STEEL, 0, 0.06, 0, 2.6, 0.9, 2.2); k.cyl(STEEL2, 1.3, 0.96, 0, 0.8, 2.6, 2.2, 0, 0, Math.PI / 2);
          k.cyl(CONC, 1.0, 0.06, -0.8, 0.36, 3.6, 0.36); for (const y of [2.8, 3.3]) k.cyl({ c: 0xd04030, t: 'plain' }, 1.0, y, -0.8, 0.37, 0.2, 0.37); smokes.push([1.0, 3.8, -0.8]);
          winGrid(k, 2.6, 2.2, [0.5], 5, 0xffc070, 0.24, 0.2);
          return smokes;
        }
        case BT.GRANARY: { for (let q = 0; q < 4; q++) { k.cyl(CONC, -0.5 + (q % 2) * 0.6, 0, -0.3 + (q >> 1) * 0.6, 0.56, 2.6, 0.56); } k.box(CONC2, 0, 2.6, 0, 1.2, 0.3, 1.2); return smokes; }
        case BT.TOWER: { // a concrete bunker under a radio mast with a warning light
          k.box(CONC, 0, 0, 0, 1.6, 0.6, 1.6); k.box(0x1a1a1a, 0, 0.3, 0.81, 1.0, 0.1, 0.02);
          lattice(k, STEEL, 0.6, 4.0, 0.3, 0.06); k.glow(REDL, 0, 4.6, 0, 0.1, 0.1, 0.1); k.cyl(WMETAL, 0.4, 0.6, 0.3, 0.5, 0.05, 0.5, 0.5, 0.8);
          return smokes;
        }
        case BT.DOCK: { // a container gantry crane and stacks of boxes
          k.box(CONC2, 0, -1.0, 0, 2.0, 1.1, 2.0);
          for (const x of [-0.6, 0.6]) { k.box(flag, x, 0.1, -0.3, 0.1, 2.0, 0.1); k.box(flag, x, 0.1, 0.4, 0.1, 2.0, 0.1); }
          k.box(flag, 0, 2.1, 0.05, 1.4, 0.14, 2.6); k.box(STEEL2, 0, 1.8, 0.3, 0.3, 0.3, 0.3);
          for (let q = 0; q < 6; q++) k.box([0xc04030, 0x3060a0, 0x40a060, 0xe0a030][q % 4], -0.5 + (q % 3) * 0.5, 0.1 + (q >> 1 & 1) * 0.22, -0.7, 0.45, 0.22, 0.24);
          return smokes;
        }
        case BT.MINE: { k.mound(0x7a6a5a, 0, -0.2, 0, 2.0, 0.8, 2.0); lattice(k, STEEL2, 0, 2.4, 0.4, 0.2); k.box(STEEL2, 0.6, 0.3, 0.3, 0.12, 0.12, 1.6, 0, -0.5); k.box(CONC, -0.6, 0, 0.5, 0.6, 0.6, 0.6); return smokes; }
        case BT.WALL: { k.box(CONC, 0, 0, 0, 1.0, 1.0, 0.3); for (let q = 0; q < 3; q++) k.box(STEEL2, -0.3 + q * 0.3, 1.0, 0, 0.03, 0.25, 0.03); k.box(STEEL2, 0, 1.18, 0, 1.0, 0.02, 0.02); return smokes; }
      }
      return null;
    }
    if (band === 3) { // ---------------------------------------------------- Information
      if (home) {
        if (v === 0) { // a glass residential tower with a lit crown
          const fl = 10 + (era % 3), H = fl * 0.4;
          k.box(CONC2, 0, 0, 0, S(1.6), S(0.4), S(1.5)); k.box(GLASS, 0, S(0.4), 0, S(1.3), S(H), S(1.2));
          for (let q = 1; q < fl; q += 2) k.box(WMETAL, 0, S(0.4 + q * 0.4), 0, S(1.34), S(0.04), S(1.24));
          k.glow(COOL, 0, S(0.4 + H), 0, S(1.32), S(0.12), S(1.22));
          return smokes;
        }
        if (v === 1) { // a modern townhouse: white cubes, timber cladding, solar panels
          k.box(WHITE, S(-0.2), 0, 0, S(1.0), S(0.9), S(1.3)); k.box({ c: 0x9a6a40, t: 'planks' }, S(0.45), 0, S(0.1), S(0.6), S(0.6), S(1.0));
          for (let q = 0; q < 3; q++) k.box({ c: 0x283850, t: 'glass' }, S(-0.2), S(0.95), S(-0.4 + q * 0.4), S(0.8), S(0.03), S(0.34), 0, 0.3);
          k.glow(LAMP, S(-0.2), S(0.15), S(0.66), S(0.7), S(0.6), S(0.02));
          return smokes;
        }
        // a mid-rise with trees on its terraces
        const fl = 6;
        for (let q = 0; q < fl; q++) { const w = 1.5 - q * 0.08; k.box(WHITE, 0, S(q * 0.42), 0, S(w), S(0.42), S(w - 0.1)); k.ico({ c: [80, 140, 70], t: 'leaves' }, S(w / 2 - 0.1), S(q * 0.42 + 0.5), S(w / 2 - 0.15), S(0.24), S(0.22), S(0.24)); }
        winGrid(k, S(1.4), S(1.3), floors(S(0.14), fl, S(0.42)), 3, LAMP, S(0.2), S(0.18));
        return smokes;
      }
      switch (type) {
        case BT.HALL: { k.box(CONC2, 0, 0, 0, 2.8, 0.06, 1.8); k.box(GLASS, 0, 0.06, 0, 2.5, 1.1, 1.4); k.cyl(WMETAL, 1.35, 1.16, 0, 0.5, 2.7, 1.6, 0, 0, Math.PI / 2); k.box(STEEL2, 1.25, 0.06, 0.8, 0.04, 2.0, 0.04); k.box(flag, 1.47, 1.75, 0.8, 0.42, 0.28, 0.03); k.glow(COOL, 0, 0.1, 0.71, 2.2, 0.9, 0.02); return smokes; }
        case BT.TEMPLE: { k.box(WHITE, 0, 0, 0, 2.6, 0.2, 2.6); k.cone({ c: 0xd8e8f0, t: 'glass' }, 0, 0.2, 0, 2.2, 2.4, 2.2); k.glowi(0xfff0c0, 0, 1.2, 0, 0.5, 0.5, 0.5); k.box(WHITE, 0, 0.2, 1.3, 0.6, 0.5, 0.02); return smokes; }
        case BT.SHRINE: { k.box(WHITE, 0, 0, 0, 0.6, 0.06, 0.6); k.box(GLASS, 0, 0.06, 0, 0.3, 0.8, 0.3); k.glow(0xfff0c0, 0, 0.2, 0, 0.1, 0.5, 0.1); return smokes; }
        case BT.KEEP: { // a supertall glass headquarters with a spire
          const H = 10 + (era - 12) * 1.5;
          k.box(CONC2, 0, 0, 0, 3.8, 0.3, 3.8); k.box(GLASS2, 0, 0.3, 0, 2.6, H * 0.55, 2.6); k.box(GLASS, 0, 0.3 + H * 0.55, 0, 2.0, H * 0.3, 2.0); k.box(GLASS2, 0, 0.3 + H * 0.85, 0, 1.4, H * 0.15, 1.4);
          for (let q = 1; q < 8; q++) k.box(WMETAL, 0, 0.3 + q * H * 0.12, 0, q < 5 ? 2.64 : 2.04, 0.05, q < 5 ? 2.64 : 2.04);
          k.box(WMETAL, 0, 0.3 + H, 0, 0.1, 2.5, 0.1); k.glow(REDL, 0, 2.85 + H, 0, 0.12, 0.12, 0.12); k.glow(COOL, 0, 0.3 + H - 0.1, 0, 1.44, 0.1, 1.44);
          k.glow(flag, 0, 0.35, 1.31, 1.4, 0.4, 0.02);
          return smokes;
        }
        case BT.MARKET: { // a glass mall with a great screen
          k.box({ c: 0x3a3c40, t: 'plain' }, 0, 0, 0, 2.9, 0.04, 2.9); k.box(GLASS, 0, 0.04, -0.2, 2.6, 1.0, 2.0); k.cyl(WMETAL, 1.31, 1.04, -0.2, 0.7, 2.62, 2.0, 0, 0, Math.PI / 2);
          k.glow(flag, 0.6, 0.3, 0.81, 1.0, 0.6, 0.02); k.glow(NEON2, -0.7, 0.6, 0.81, 0.6, 0.2, 0.02);
          return smokes;
        }
        case BT.WORKSHOP: { // a data centre with cooling units, and a wind turbine
          k.box(WHITE, -0.3, 0, 0, 2.0, 0.7, 2.2); for (let q = 0; q < 6; q++) k.cyl(STEEL, -1.0 + (q % 3) * 0.6, 0.7, -0.5 + (q >> 1 & 1) * 0.8, 0.36, 0.12, 0.36);
          k.glow(NEON2, -0.3, 0.3, 1.11, 1.8, 0.04, 0.02);
          k.taper(WMETAL, 1.1, 0, 0.9, 0.18, 3.6, 0.18); k.box(WMETAL, 1.1, 3.55, 0.95, 0.16, 0.16, 0.36);
          for (let q = 0; q < 3; q++) { const a = q * 2.094 + 0.3; k.box(WMETAL, 1.1, 3.63, 1.15, 0.1, 1.4, 0.03, 0, 0, a - Math.PI / 2); }
          return smokes;
        }
        case BT.GRANARY: { k.box(GGREEN, 0, 0, 0, 1.5, 2.6, 1.5); for (let q = 0; q < 6; q++) k.glow(0xa0ff90, 0, 0.2 + q * 0.42, 0, 1.52, 0.06, 1.52); k.box(WMETAL, 0, 2.6, 0, 1.56, 0.1, 1.56); return smokes; }
        case BT.TOWER: { k.cyl(CONC, 0, 0, 0, 0.8, 2.6, 0.8); k.ico(WMETAL, 0, 3.1, 0, 1.3, 1.2, 1.3); k.glow(REDL, 0, 3.8, 0, 0.1, 0.1, 0.1); return smokes; }
        case BT.DOCK: { k.box(CONC2, 0, -1.0, 0, 2.0, 1.1, 2.0); for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.4]) k.box(WMETAL, x, 0.1, z, 0.1, 2.2, 0.1); k.box(WMETAL, 0, 2.3, 0.05, 1.4, 0.14, 2.8); for (let q = 0; q < 6; q++) k.box([0xc04030, 0x3060a0, 0x40a060, 0xe0a030][q % 4], -0.5 + (q % 3) * 0.5, 0.1 + (q >> 1 & 1) * 0.22, -0.7, 0.45, 0.22, 0.24); return smokes; }
        case BT.MINE: case BT.WALL: return eraKit(k, type, style, kc, v, 10, roof);
      }
      return null;
    }
    // ------------------------------------------------------------------------ Space Age and beyond
    if (home) {
      if (v === 0) { // an arcology tower: a white column, sky gardens and glowing rings
        const H = 5 + (era >= 14 ? 2.5 : 0) + (era % 2);
        k.cyl(WMETAL, 0, 0, 0, S(1.2), S(H), S(1.2)); k.cone(WMETAL, 0, S(H), 0, S(1.2), S(1.0), S(1.2));
        for (let q = 1; q < 4; q++) { k.glowc(NEON, 0, S(H * q / 4), 0, S(1.32), S(0.05), S(1.32)); k.ico({ c: [86, 160, 80], t: 'leaves' }, S(0.45), S(H * q / 4 + 0.15), S(0.2), S(0.32), S(0.24), S(0.32)); }
        k.glowi(NEON2, 0, S(H + 1.0), 0, S(0.14), S(0.14), S(0.14));
        return smokes;
      }
      if (v === 1) { // a dome habitat on a ring
        k.cyl(WMETAL, 0, 0, 0, S(1.6), S(0.15), S(1.6)); k.glowc(NEON, 0, S(0.15), 0, S(1.62), S(0.04), S(1.62)); k.ico({ c: 0xd8eef8, t: 'glass' }, 0, S(0.55), 0, S(1.4), S(1.2), S(1.4)); k.glowi(LAMP, 0, S(0.5), 0, S(0.4), S(0.4), S(0.4));
        return smokes;
      }
      const H = 7 + (era >= 14 ? 3 : 0); // a needle tower that narrows to a point
      k.taper(WMETAL, 0, 0, 0, S(1.3), S(H), S(1.3)); k.cone(WMETAL, 0, S(H), 0, S(0.9), S(2.0), S(0.9));
      for (let q = 1; q < 6; q++) k.glowc(NEON2, 0, S(H * q / 6), 0, S(1.3 - q * 0.07), S(0.04), S(1.3 - q * 0.07));
      return smokes;
    }
    switch (type) {
      case BT.HALL: { k.cyl(WMETAL, 0, 0, 0, 0.5, 1.2, 0.5); k.cyl(WMETAL, 0, 1.2, 0, 2.8, 0.3, 1.9); k.glowc(NEON, 0, 1.18, 0, 2.84, 0.05, 1.94); k.ico({ c: 0xd8eef8, t: 'glass' }, 0, 1.6, 0, 1.4, 0.7, 1.0); return smokes; }
      case BT.TEMPLE: { k.cyl(WMETAL, 0, 0, 0, 2.6, 0.2, 2.6); k.cone6({ c: 0xe0f0ff, t: 'glass' }, 0, 0.2, 0, 1.0, 5.0, 1.0); for (let q = 0; q < 3; q++) k.glowc(0xfff0c0, 0, 1.0 + q * 1.1, 0, 1.6 - q * 0.4, 0.04, 1.6 - q * 0.4); k.glowi(0xfff0c0, 0, 5.4, 0, 0.3, 0.3, 0.3); return smokes; }
      case BT.SHRINE: { k.cyl(WMETAL, 0, 0, 0, 0.5, 0.1, 0.5); k.glowi(NEON, 0, 0.6, 0, 0.3, 0.3, 0.3); return smokes; }
      case BT.KEEP: { // the launch complex: tower, rocket and pad (a sky tether in the Stellar age)
        k.cyl(CONC, 0, 0, 0, 3.8, 0.3, 3.8); k.glowc(NEON, 0, 0.3, 0, 3.6, 0.03, 3.6);
        lattice(k, { c: 0xc04030, t: 'metal' }, 0.3, 6.0, 0.35, 0.3); k.box(STEEL2, 0.0, 4.0, 0.6, 0.1, 0.1, 0.9);
        rocket(k, 0, 1.15, 5.0, flag);
        k.box(WMETAL, -1.3, 0.3, -1.3, 0.9, 0.6, 0.9); k.glow(COOL, -1.3, 0.5, -0.84, 0.7, 0.2, 0.02);
        if (era >= 14) { k.glow(NEON2, 1.4, 0.3, -1.4, 0.08, 60, 0.08); k.cyl(WMETAL, 1.4, 0.3, -1.4, 0.8, 0.4, 0.8); k.glowc(NEON, 1.4, 0.7, -1.4, 0.9, 0.04, 0.9); }
        return smokes;
      }
      case BT.MARKET: { k.cyl(WMETAL, 0, 0, 0, 2.8, 0.1, 2.8); k.ico({ c: 0xd8eef8, t: 'glass' }, 0, 0.4, 0, 2.6, 1.8, 2.6); for (let q = 0; q < 5; q++) { const a = q * 1.256; k.glow([NEON, NEON2, 0xffa0e0, LAMP, NEON][q], Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, 0.2, 0.4, 0.2); } return smokes; }
      case BT.WORKSHOP: { // a fusion ring and its glowing core
        k.box(WMETAL, 0, 0, 0, 2.6, 0.3, 2.6);
        for (let q = 0; q < 14; q++) { const a = q / 14 * Math.PI * 2; k.cyl(STEEL, Math.cos(a) * 0.95, 0.3, Math.sin(a) * 0.95, 0.42, 0.6, 0.42); }
        k.glowc(0xb0d8ff, 0, 0.5, 0, 1.6, 0.18, 1.6); k.glowi(0xe8f4ff, 0, 0.8, 0, 0.5, 0.5, 0.5);
        return smokes;
      }
      case BT.GRANARY: { for (let q = 0; q < 3; q++) { const x = -0.5 + q * 0.5; k.ico({ c: 0xc8f0d8, t: 'glass' }, x, 0.35, (q % 2) * 0.4 - 0.2, 0.9, 0.8, 0.9); k.glowi(0xa0ff90, x, 0.3, (q % 2) * 0.4 - 0.2, 0.4, 0.3, 0.4); } return smokes; }
      case BT.TOWER: { k.taper(WMETAL, 0, 0, 0, 0.9, 3.0, 0.9); k.glowi(0xff6080, 0, 3.4, 0, 0.5, 0.5, 0.5); k.glowc(NEON, 0, 1.5, 0, 1.0, 0.04, 1.0); return smokes; }
      case BT.DOCK: { k.cyl(WMETAL, 0, 0, 0, 1.9, 0.15, 1.9); k.glowc(NEON, 0, 0.15, 0, 1.6, 0.03, 1.6); k.mound(WMETAL, 0, 0.45, 0, 1.0, 0.3, 0.6); k.glow(NEON2, 0, 0.3, 0, 0.8, 0.03, 0.4); return smokes; }
      case BT.MINE: { for (let q = 0; q < 3; q++) { const a = q * 2.094; k.box(WMETAL, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0.08, 2.6, 0.08, 0, -Math.sin(a) * 0.19, Math.cos(a) * 0.19); } k.cyl(WMETAL, 0, 2.4, 0, 0.5, 0.3, 0.5); k.glow(0xff8a40, 0, 0, 0, 0.12, 2.4, 0.12); return smokes; }
      case BT.WALL: { k.box(WMETAL, 0, 0, 0, 1.0, 0.3, 0.4); k.glow(NEON2, 0, 0.3, 0, 1.0, 0.9, 0.04); return smokes; }
    }
    return null;
  }
  M.eraKit = eraKit;

  // ============================================================ great wonders (4 x 4 cells)
  const SANDSTONE = { c: 0xd8c08a, t: 'masonry' }, MARBLE = { c: 0xf0ece2, t: 'plaster' }, BRONZE = { c: 0xb07a3a, t: 'metal' }, VERD = { c: 0x6fae96, t: 'metal' };
  M.wonderKit = function (k, key, kc, era) {
    const flag = (kc[0] << 16) | (kc[1] << 8) | kc[2], smokes = [];
    switch (key) {
      case 'mound': // a great earthen mound ringed with standing stones, a stair to a fire on top
        k.mound({ c: [104, 140, 76], t: 'grass' }, 0, 0.4, 0, 3.6, 2.2, 3.6);
        for (let q = 0; q < 12; q++) { const a = q / 12 * Math.PI * 2; k.box({ c: 0x8f8a80, t: 'rock' }, Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85, 0.22, 0.7, 0.16, -a); }
        for (let q = 0; q < 6; q++) k.box({ c: 0x9c978f, t: 'masonry' }, 0, q * 0.25, 1.75 - q * 0.22, 0.5, 0.06, 0.2);
        k.glow(0xff9a3c, 0, 1.45, 0, 0.3, 0.35, 0.3); smokes.push([0, 1.9, 0]);
        break;
      case 'pyramid': // a stepped pyramid with a gold cap
        for (let q = 0; q < 7; q++) k.box(SANDSTONE, 0, q * 0.5, 0, 3.8 - q * 0.52, 0.5, 3.8 - q * 0.52);
        k.cone({ c: 0xe2b64c, t: 'plain' }, 0, 3.5, 0, 0.5, 0.5, 0.5);
        for (let q = 0; q < 7; q++) k.box({ c: 0xc8b07a, t: 'masonry' }, 0, q * 0.5, 1.9 - q * 0.26, 0.5, 0.5, 0.08);
        k.glow(0xffc46b, 0, 0.1, 1.92, 0.3, 0.4, 0.02);
        break;
      case 'colossus': // a bronze giant over the harbour, torch raised
        k.box({ c: 0xb0a898, t: 'masonry' }, 0, 0, 0, 2.6, 0.9, 2.6); k.box({ c: 0xb0a898, t: 'masonry' }, 0, 0.9, 0, 1.6, 0.4, 1.6);
        for (const x of [-0.3, 0.3]) k.box(BRONZE, x, 1.3, 0, 0.3, 1.6, 0.34);
        k.box(BRONZE, 0, 2.9, 0, 0.9, 1.5, 0.5); k.box(BRONZE, 0, 4.4, 0, 0.42, 0.5, 0.42);
        k.cone(BRONZE, 0, 4.9, 0, 0.5, 0.25, 0.5);
        k.box(BRONZE, 0.55, 3.4, 0, 0.22, 1.5, 0.22, 0, 0, -0.2); k.glow(0xffb040, 0.72, 4.95, 0, 0.22, 0.3, 0.22);
        k.box(BRONZE, -0.55, 2.8, 0.1, 0.22, 1.0, 0.22, 0, 0.2, 0.15);
        smokes.push([0.72, 5.3, 0]);
        break;
      case 'library': // a marble hall of columns under a great dome; scrolls glowing in its windows
        k.box(MARBLE, 0, 0, 0, 3.8, 0.3, 3.4); k.box(MARBLE, 0, 0.3, -0.3, 3.0, 1.6, 2.2);
        for (let q = 0; q < 8; q++) k.cyl(MARBLE, -1.5 + q * 0.43, 0.3, 1.3, 0.2, 1.6, 0.2);
        k.box(MARBLE, 0, 1.9, 0.5, 3.4, 0.2, 1.8); k.prism(MARBLE, 0, 2.1, 1.1, 3.4, 0.5, 0.6, Math.PI / 2);
        k.cyl(MARBLE, 0, 1.9, -0.3, 1.8, 0.5, 1.8); k.ico({ c: 0x9ab0b8, t: 'metal' }, 0, 2.7, -0.3, 1.9, 1.6, 1.9); k.box({ c: 0xe2b64c, t: 'plain' }, 0, 3.4, -0.3, 0.06, 0.4, 0.06);
        for (let q = 0; q < 5; q++) k.glow(0xffd28a, -1.2 + q * 0.6, 0.6, 0.82, 0.2, 0.7, 0.02);
        break;
      case 'cathedral': { // a vast gothic cathedral with twin spires and a rose window
        const st = { c: 0xc4bcae, t: 'masonry' }, dark = { c: 0x3a4048, t: 'tiles' };
        k.box(st, 0, 0, 0, 1.6, 2.2, 3.4); k.prism(dark, 0, 2.2, 0, 1.7, 1.0, 3.44);
        k.box(st, 0, 0, -0.4, 3.6, 1.8, 1.0); k.prism(dark, 0, 1.8, -0.4, 1.04, 0.8, 3.64, Math.PI / 2);
        for (const x of [-0.65, 0.65]) { k.box(st, x, 0, 1.6, 0.66, 3.8, 0.66); k.cone(dark, x, 3.8, 1.6, 0.66, 2.0, 0.66); k.box({ c: 0xe2b64c, t: 'plain' }, x, 5.8, 1.6, 0.04, 0.3, 0.04); }
        k.cone(dark, 0, 2.8, -0.4, 0.4, 2.4, 0.4);
        for (const z of [-1.2, -0.4, 0.4]) for (const s of [-1, 1]) k.box(st, s * 1.0, 0, z, 0.3, 1.4, 0.2, 0, 0, s * 0.3); // flying buttresses
        k.glowc(0xffb040, 0, 1.5, 1.94, 0.6, 0.02, 0.6, 0, Math.PI / 2);
        for (let q = 0; q < 5; q++) { k.glow(0xff9a5a, 0.81, 0.8, -1.3 + q * 0.6, 0.02, 0.9, 0.18); k.glow(0xff9a5a, -0.81, 0.8, -1.3 + q * 0.6, 0.02, 0.9, 0.18); }
        break;
      }
      case 'observatory': // a round tower on a terrace, a dome split open for a great telescope
        k.box({ c: 0xd0c8b8, t: 'masonry' }, 0, 0, 0, 3.6, 0.5, 3.6);
        k.cyl({ c: 0xe0d8c8, t: 'plaster' }, 0, 0.5, 0, 2.2, 2.4, 2.2); k.ico({ c: 0x8ca0b0, t: 'metal' }, 0, 3.0, 0, 2.3, 1.8, 2.3);
        k.box({ c: 0x1a1a22, t: 'plain' }, 0, 3.0, 0.5, 0.4, 1.0, 1.2);
        k.cyl({ c: 0x6a6a72, t: 'metal' }, 0, 3.2, 0.6, 0.3, 1.6, 0.3, 0, -0.7);
        for (let q = 0; q < 6; q++) k.glow(0xffd28a, Math.cos(q) * 1.11, 1.3 + (q % 2) * 0.6, Math.sin(q) * 1.11, 0.12, 0.25, 0.12);
        break;
      case 'irontower': // a tall iron lattice tower on four arched legs
        lattice(k, { c: 0x6a5a4a, t: 'metal' }, 0, 3.2, 1.6, 0.6);
        lattice(k, { c: 0x6a5a4a, t: 'metal' }, 3.2, 3.2, 0.6, 0.25);
        lattice(k, { c: 0x6a5a4a, t: 'metal' }, 6.4, 2.6, 0.25, 0.08);
        k.box({ c: 0x5a4a3a, t: 'metal' }, 0, 1.6, 0, 2.6, 0.12, 2.6); k.box({ c: 0x5a4a3a, t: 'metal' }, 0, 3.2, 0, 1.4, 0.12, 1.4);
        k.box({ c: 0x8a8a8a, t: 'metal' }, 0, 9.0, 0, 0.04, 0.8, 0.04); k.glow(0xff4a4a, 0, 9.8, 0, 0.1, 0.1, 0.1);
        for (let q = 0; q < 4; q++) k.glow(0xffe2a0, (q % 2 ? 1 : -1) * 0.7, 3.25, (q < 2 ? 1 : -1) * 0.7, 0.1, 0.06, 0.1);
        break;
      case 'stadium': // an oval bowl of tiered seats round a green field, floodlights
        for (let q = 0; q < 28; q++) { const a = q / 28 * Math.PI * 2; k.box({ c: 0xbab6ae, t: 'concrete' }, Math.cos(a) * 1.65, 0, Math.sin(a) * 1.3, 0.5, 1.0, 0.42, -a); k.box({ c: q % 2 ? flag : 0xe0e0e0, t: 'cloth' }, Math.cos(a) * 1.5, 0.95, Math.sin(a) * 1.18, 0.4, 0.06, 0.3, -a, 0.3); }
        k.box({ c: [86, 150, 70], t: 'grass' }, 0, 0, 0, 2.2, 0.06, 1.6); for (let q = 0; q < 3; q++) k.box({ c: 0xf0f0f0, t: 'plain' }, -0.7 + q * 0.7, 0.06, 0, 0.03, 0.005, 1.5);
        for (const [x, z] of [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]]) { k.box({ c: 0x8c939c, t: 'metal' }, x, 0, z, 0.08, 2.4, 0.08); k.glow(0xfff6d0, x, 2.4, z, 0.4, 0.15, 0.2); }
        break;
      case 'worldtower': // a supertall glass spire with sky gardens and a beacon
        k.box({ c: 0x98948c, t: 'concrete' }, 0, 0, 0, 3.8, 0.4, 3.8);
        for (let q = 0; q < 6; q++) { const w = 2.4 - q * 0.32; k.box({ c: q % 2 ? 0x86acd0 : 0x5e88b0, t: 'glass' }, 0, 0.4 + q * 2.2, 0, w, 2.2, w, q * 0.15); k.glow(0xbfe6ff, 0, 0.4 + q * 2.2 + 2.1, 0, w + 0.04, 0.08, w + 0.04, q * 0.15); }
        k.cone({ c: 0xe4e8ee, t: 'metal' }, 0, 13.6, 0, 0.7, 3.4, 0.7); k.glow(0xff4a4a, 0, 17.0, 0, 0.14, 0.14, 0.14);
        break;
      case 'elevator': // a base station and a tether of light rising out of sight, a climber on it
        k.cyl({ c: 0xe4e8ee, t: 'metal' }, 0, 0, 0, 3.8, 0.5, 3.8); k.glowc(0x7affd0, 0, 0.5, 0, 3.6, 0.04, 3.6);
        k.cyl({ c: 0xe4e8ee, t: 'metal' }, 0, 0.5, 0, 1.6, 1.6, 1.6); k.cone({ c: 0xe4e8ee, t: 'metal' }, 0, 2.1, 0, 1.6, 0.8, 1.6);
        k.glow(0x7ab8ff, 0, 2.8, 0, 0.12, 120, 0.12); k.glow(0xbfe6ff, 0, 2.8, 0, 0.3, 120, 0.04);
        for (const y of [8, 22, 40]) k.cyl({ c: 0xe4e8ee, t: 'metal' }, 0, y, 0, 0.7, 0.4, 0.7);
        for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; k.box({ c: 0xbab6ae, t: 'concrete' }, Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5, 0.6, 0.8, 0.6); }
        break;
      default: return null;
    }
    return smokes;
  };

  // ============================================================ houses
  // a building's style comes from where its community lives, and its era
  M.styleOf = function (b) {
    if (M.debug.style) return M.debug.style(b);
    const c = AG.Civ.cities[b.city];
    const Rs = AG.Races && c ? AG.Races.of(c).style : null;
    if (Rs) return Rs;
    return climateAt(c ? c.x : b.cx, c ? c.y : b.cy);
  };
  const BEAM = 0x5e4130, DOOR = 0x3a2618, WIN = 0xffd27a, STONE = 0x9c978f, STONE2 = 0x7f7a73, GOLD = 0xe2b64c;
  const THATCH = 0xc9a85e, PALM = 0xb3a35a, TURF = 0x5f8a3e, SNOW = 0xeef3f8, LOG = 0x7a5534, LOG2 = 0x684828, SLATE = 0x4f5864, ADOBE = [0xd7b47e, 0xcfa56f, 0xdcc08e];
  const shadeHex = (hex, k) => { const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => Math.max(0, Math.min(255, v * k)) | 0); return (c[0] << 16) | (c[1] << 8) | c[2]; };
  // Fills kit k for the regional variants; returns the chimney smoke points, or null when the
  // building keeps its common design (castles, towers, walls, farms, markets, mines, docks...).
  M.houseKit = function (k, type, style, kc, v, era, roof) {
    if (RACE_STYLES.has(style)) { const r = raceKit(k, type, style, kc, v, era); return r || era < 7 ? r : eraKit(k, type, 'temperate', kc, v, era, roof); }
    if (era >= 7) { const sm = eraKit(k, type, style, kc, v, era, roof); if (sm) return sm; if (k.lit.length) k.lit.length = 0, k.lamp.length = 0; }
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
