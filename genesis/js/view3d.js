/* AURA: Genesis — view3d.js
 * The close-up 3D view (three.js / WebGL). Past 8x zoom the camera tilts, map-app style,
 * into a voxel diorama of the area around it: terrain columns with pixel texture, water,
 * glowing lava, 3D trees, every building as its own model, little 3D people, animals and
 * vehicles, sun shadows, sky and haze. Looking straight down at the hand-off zoom it matches
 * the 2D map cell for cell, so the switch is seamless; then the camera tilts. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Civ = AG.Civ, Sky = AG.Sky, R = AG.Render;
  const { W, H, SEA, FT, SO, BT, SP, SPECIES, FL, J, NG, G } = AG;
  const THREE = window.THREE;
  const V = (AG.View3D = { ok: false, active: false, tilt: 0, yaw: 0, yawTarget: null, pitchBias: 0, stats: {} });
  const ENTER = 8;          // zoom at which 3D takes over
  const HS = 20;            // elevation units -> cells of height
  const FOV = 40;
  const MAXS = 240;         // largest square window of cells kept in the scene
  const BOTTOM = -6;        // columns extend down to here (the diorama's base)
  const MAXT = 24000, MAXU = 3000;
  let renderer, scene, camera, sun, hemi, el, cw = 1, ch = 1;
  let land, water, hot, trunks, pines, leaves, rocks, cacti, bodies, heads;
  let wx0 = 0, wy0 = 0, ws = 0, roll = 0, needBuild = true, floraClock = 0, bldClock = 0, gTarget = 0;
  const top = new Float32Array(MAXS * MAXS);
  const groups = new Map();
  const target = THREE ? new THREE.Vector3() : null;

  function hash(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const colTop = (i) => { const e = Wd.elev[i]; return e >= SEA ? Math.round((e - SEA) * HS * 2) / 2 + 0.25 : (e - SEA) * 16; };

  // ------------------------------------------------------------ setup
  V.init = function (host, overlay) {
    if (!THREE) return false;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el = renderer.domElement; el.id = 'world3d'; el.setAttribute('aria-hidden', 'true');
    el.style.visibility = 'hidden';
    host.insertBefore(el, overlay);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fcbea);
    scene.fog = new THREE.Fog(0x9fcbea, 200, 600);
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 4000);
    hemi = new THREE.HemisphereLight(0xe6f2ff, 0x4f5a3c, 0.55);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2dd, 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // a tiny noise texture gives every voxel face crisp pixel detail up close
    const s = 16, data = new Uint8Array(s * s * 4), r = AG.mulberry32(11);
    for (let i = 0; i < s * s; i++) {
      const x = i % s, y = (i / s) | 0;
      let v = 226 + r() * 29;
      if (r() < 0.07) v = 196;
      if (x === 0 || y === 0) v *= 0.9; // faint seams between cells
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const detail = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
    detail.magFilter = THREE.NearestFilter; detail.minFilter = THREE.LinearMipmapLinearFilter; detail.generateMipmaps = true;
    detail.needsUpdate = true;

    const col = new THREE.BoxGeometry(1, 1, 1); col.translate(0, 0.5, 0);
    const inst = (geo, mat, n, cast, receive) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = !!cast; m.receiveShadow = !!receive; m.count = 0;
      scene.add(m);
      return m;
    };
    land = inst(col, new THREE.MeshLambertMaterial({ map: detail }), MAXS * MAXS, false, true);
    water = inst(col, new THREE.MeshPhongMaterial({ map: detail, transparent: true, opacity: 0.9, shininess: 70, specular: 0x3a5068 }), MAXS * MAXS, false, true);
    hot = inst(col, new THREE.MeshBasicMaterial({ map: detail }), MAXS * MAXS, false, false);
    const trunkGeo = new THREE.BoxGeometry(1, 1, 1); trunkGeo.translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(0.42, 1, 6); coneGeo.translate(0, 0.5, 0);
    const icoGeo = new THREE.IcosahedronGeometry(0.46, 0);
    const rockGeo = new THREE.DodecahedronGeometry(0.32, 0);
    trunks = inst(trunkGeo, new THREE.MeshLambertMaterial(), MAXT, true, false);
    pines = inst(coneGeo, new THREE.MeshLambertMaterial(), MAXT, true, true);
    leaves = inst(icoGeo, new THREE.MeshLambertMaterial(), MAXT, true, true);
    rocks = inst(rockGeo, new THREE.MeshLambertMaterial(), MAXT, true, true);
    cacti = inst(trunkGeo, new THREE.MeshLambertMaterial(), 4000, true, false);
    bodies = inst(trunkGeo, new THREE.MeshLambertMaterial(), MAXU, true, false);
    heads = inst(trunkGeo, new THREE.MeshLambertMaterial(), MAXU, true, false);
    V.ok = true;
    return true;
  };
  V.resize = function (w, h) {
    if (!V.ok) return;
    cw = w; ch = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  V.reset = function () {
    if (!V.ok) return;
    for (const g of groups.values()) scene.remove(g);
    groups.clear(); needBuild = true; V.tilt = 0; V.yaw = 0; V.pitchBias = 0; V.yawTarget = null;
  };
  V.rotate = function (dyaw, dpitch) {
    V.yaw += dyaw; V.yawTarget = null;
    V.pitchBias = AG.clamp(V.pitchBias + dpitch, -0.5, 0.3);
  };
  V.turn = function (dyaw) { V.yawTarget = (V.yawTarget === null ? V.yaw : V.yawTarget) + dyaw; };
  V.north = function () { V.yawTarget = Math.round(V.yaw / (Math.PI * 2)) * Math.PI * 2; V.pitchBias = 0; };

  // ------------------------------------------------------------ tilt animation
  V.update = function (dt) {
    if (!V.ok) return;
    const z = R.cam.z, want = R.view !== 0 && z > ENTER + 0.001;
    const goal = want ? AG.clamp(0.72 + (z - ENTER) * 0.009 + V.pitchBias, 0.25, 1.22) : 0; // ~41° rising to ~55°
    V.tilt += (goal - V.tilt) * (1 - Math.exp(-dt * (want ? 2.4 : 5)));
    if (!want && V.tilt < 0.003) V.tilt = 0;
    if (!want && Math.abs(V.yaw) > 0.001 && V.yawTarget === null) V.north(); // 2D is always north-up
    if (V.yawTarget !== null) {
      V.yaw += (V.yawTarget - V.yaw) * (1 - Math.exp(-dt * 6));
      if (Math.abs(V.yawTarget - V.yaw) < 0.002) { V.yaw = V.yawTarget; V.yawTarget = null; if (!want) V.yaw = 0; }
    }
    const act = R.view !== 0 && (want || V.tilt > 0);
    if (act !== V.active) {
      V.active = act;
      el.style.visibility = act ? 'visible' : 'hidden';
      if (act) needBuild = true;
    }
  };

  // ------------------------------------------------------------ terrain window
  function windowSize() {
    const s = Math.ceil(((Math.max(cw, ch) / Math.max(R.cam.z, ENTER)) * 1.06) / 16) * 16;
    return Math.min(AG.clamp(s, 96, MAXS), Math.floor(Math.min(W, H) / 16) * 16);
  }
  function setBox(mesh, n, x, z, y0, y1) {
    const m = mesh.instanceMatrix.array, o = n * 16, h = y1 - y0 > 0.02 ? y1 - y0 : 0.02;
    m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
    m[o + 12] = x + 0.5; m[o + 13] = y0; m[o + 14] = z + 0.5; m[o + 15] = 1;
  }
  function paint(mesh, n, r, g, b) { const c = mesh.instanceColor.array, o = n * 3; c[o] = r / 255; c[o + 1] = g / 255; c[o + 2] = b / 255; }
  // Land is one column per cell (rows refreshed in place); water, lava and fire are packed
  // into compact lists of just the cells that have them, so dry land costs nothing extra.
  const LIQ_NONE = 0, LIQ_WATER = 1, LIQ_HOT = 2;
  const liq = new Uint8Array(MAXS * MAXS), liqLo = new Float32Array(MAXS * MAXS), liqHi = new Float32Array(MAXS * MAXS), liqCol = new Uint32Array(MAXS * MAXS);
  let liqDirty = true;
  function refreshRows(r0, r1) {
    for (let ly = r0; ly < r1; ly++) {
      for (let lx = 0; lx < ws; lx++) {
        const n = ly * ws + lx, x = wx0 + lx, y = wy0 + ly, i = y * W + x;
        const e = Wd.elev[i], f = Wd.fl[i], typ = Wd.ft[i];
        const c = R.flatColor(i), cr = c & 255, cg = (c >>> 8) & 255, cb = (c >>> 16) & 255;
        const gTop = colTop(i), wet = f > 0.004 && !Wd.frozen[i];
        setBox(land, n, x, y, BOTTOM, gTop);
        if (wet && typ === FT.WATER) {
          const surf = e < SEA - 0.03 ? 0 : Math.max(gTop + 0.08, Math.round((e + f - SEA) * HS * 4) / 4 + 0.25);
          paint(land, n, 120 + cr * 0.2, 112 + cg * 0.15, 84 + cb * 0.1); // sandy bed under the water
          liq[n] = LIQ_WATER; liqLo[n] = gTop; liqHi[n] = surf; liqCol[n] = c; top[n] = surf;
        } else if (wet) { // lava or acid glows on its own
          const surf = Math.max(gTop + 0.1, Math.round((e + f - SEA) * HS * 4) / 4 + 0.3);
          paint(land, n, 60, 52, 56);
          liq[n] = LIQ_HOT; liqLo[n] = gTop; liqHi[n] = surf; liqCol[n] = c; top[n] = surf;
        } else {
          paint(land, n, cr, cg, cb);
          if (Wd.fire[i]) { liq[n] = LIQ_HOT; liqLo[n] = gTop; liqHi[n] = gTop + 0.25 + (hash(x, y) & 3) * 0.12; liqCol[n] = AG.pack(255, 140 + (hash(y, x) & 63), 40); }
          else liq[n] = LIQ_NONE;
          top[n] = gTop;
        }
      }
    }
    land.instanceMatrix.updateRange.offset = r0 * ws * 16; land.instanceMatrix.updateRange.count = (r1 - r0) * ws * 16;
    land.instanceColor.updateRange.offset = r0 * ws * 3; land.instanceColor.updateRange.count = (r1 - r0) * ws * 3;
    land.instanceMatrix.needsUpdate = true; land.instanceColor.needsUpdate = true;
    liqDirty = true;
  }
  function packLiquids() {
    let nw = 0, nh = 0;
    for (let n = 0, nn = ws * ws; n < nn; n++) {
      const k = liq[n];
      if (!k) continue;
      const x = wx0 + (n % ws), y = wy0 + ((n / ws) | 0), c = liqCol[n];
      if (k === LIQ_WATER) { setBox(water, nw, x, y, liqLo[n], liqHi[n]); paint(water, nw++, c & 255, (c >>> 8) & 255, (c >>> 16) & 255); }
      else { setBox(hot, nh, x, y, liqLo[n], liqHi[n]); paint(hot, nh++, c & 255, (c >>> 8) & 255, (c >>> 16) & 255); }
    }
    water.count = nw; hot.count = nh;
    for (const m of [water, hot]) { m.instanceMatrix.updateRange.count = -1; m.instanceColor.updateRange.count = -1; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    liqDirty = false;
  }
  function build() {
    ws = windowSize();
    wx0 = AG.clamp(Math.round(R.cam.x - ws / 2), 0, W - ws);
    wy0 = AG.clamp(Math.round(R.cam.y - ws / 2), 0, H - ws);
    land.count = ws * ws;
    refreshRows(0, ws);
    packLiquids();
    buildFlora();
    syncBuildings();
    needBuild = false; roll = 0;
  }
  V.groundAt = function (x, y) {
    const xi = x | 0, yi = y | 0;
    if (xi >= wx0 && yi >= wy0 && xi < wx0 + ws && yi < wy0 + ws) return top[(yi - wy0) * ws + (xi - wx0)];
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
    const i = yi * W + xi;
    return Wd.fl[i] > 0.004 && Wd.elev[i] < SEA ? 0 : colTop(i);
  };

  // ------------------------------------------------------------ flora
  const LEAF = [[110, 186, 74], [76, 156, 62], [224, 128, 52]]; // spring, summer, autumn
  const dummy = THREE ? new THREE.Object3D() : null, tint = THREE ? new THREE.Color() : null;
  function place(mesh, n, x, y, z, sx, sy, sz, ry, rgb, vary) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    const k = 1 + vary;
    tint.setRGB(Math.min(1, (rgb[0] / 255) * k), Math.min(1, (rgb[1] / 255) * k), Math.min(1, (rgb[2] / 255) * k));
    mesh.setColorAt(n, tint);
  }
  function buildFlora() {
    let nt = 0, np = 0, nl = 0, nr = 0, nc = 0;
    const season = Sky.season();
    for (let ly = 0; ly < ws; ly++) for (let lx = 0; lx < ws; lx++) {
      const x = wx0 + lx, y = wy0 + ly, i = y * W + x;
      if (Wd.bgrid[i] || Wd.fire[i] || Wd.fl[i] > 0.004) continue;
      const h = hash(x, y), v = Wd.veg[i], s = Wd.soil[i], T = Wd.tbase[i], snow = Wd.snow[i] > 120;
      let kind = 0; // 1 pine, 2 broadleaf, 3 jungle, 4 dead, 5 rock, 6 cactus
      const tree = () => (snow || T < 0.3 ? 1 : T > 0.68 ? 3 : season === 3 && T < 0.48 ? 4 : 2);
      if (s === SO.DIRT || s === SO.HOLY) {
        if (v >= 165) { if ((h & 3) !== 0) kind = tree(); }
        else if (v >= 110 && h % 9 === 0) kind = tree();
      } else if (s === SO.ROCK) { if (h % 13 === 0) kind = 5; else if (v > 60 && h % 9 === 0) kind = 1; }
      else if (s === SO.SAND) { if (T > 0.55 && Wd.elev[i] > SEA + 0.02 && h % 29 === 0) kind = 6; }
      else if (s === SO.ASH) { if (h % 11 === 0) kind = 4; }
      else if (s === SO.BASALT) { if (h % 15 === 0) kind = 5; }
      if (!kind || nt >= MAXT - 1) continue;
      const px = x + 0.5 + (((h >>> 4) % 5) - 2) * 0.09, pz = y + 0.5 + (((h >>> 7) % 5) - 2) * 0.09, base = top[ly * ws + lx];
      const sc = 0.8 + ((h >>> 10) % 8) * 0.06, ry = ((h >>> 13) % 16) * 0.39, vary = (((h >>> 17) % 7) - 3) * 0.035;
      if (kind === 1) {
        place(trunks, nt++, px, base, pz, 0.13, 0.4 * sc, 0.13, ry, [104, 72, 46], 0);
        place(pines, np++, px, base + 0.28 * sc, pz, sc, 1.25 * sc, sc, ry, snow || (season === 3 && T < 0.4) ? [226, 236, 244] : [52, 118, 84], vary);
      } else if (kind === 2 || kind === 3) {
        place(trunks, nt++, px, base, pz, 0.13, 0.55 * sc, 0.13, ry, [118, 84, 54], 0);
        const leaf = kind === 3 ? [30, 132, 64] : LEAF[season === 0 ? 0 : season === 2 ? 2 : 1];
        const ls = kind === 3 ? sc * 1.25 : sc;
        place(leaves, nl++, px, base + 0.55 * sc + 0.36 * ls, pz, ls, ls * 0.95, ls, ry, leaf, vary);
      } else if (kind === 4) place(trunks, nt++, px, base, pz, 0.11, 0.9 * sc, 0.11, ry, [96, 76, 58], 0);
      else if (kind === 5) place(rocks, nr++, px, base + 0.08, pz, sc * 1.3, sc * 0.8, sc * 1.1, ry, s === SO.BASALT ? [62, 58, 66] : snow ? [226, 232, 240] : [150, 144, 138], vary);
      else if (kind === 6 && nc < 3999) place(cacti, nc++, px, base, pz, 0.2, 0.75 * sc, 0.2, ry, [86, 168, 90], vary);
    }
    trunks.count = nt; pines.count = np; leaves.count = nl; rocks.count = nr; cacti.count = nc;
    for (const m of [trunks, pines, leaves, rocks, cacti]) { m.instanceMatrix.updateRange.count = -1; m.instanceColor.updateRange.count = -1; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    floraClock = 0;
  }

  // ------------------------------------------------------------ buildings
  const mats = new Map();
  function mat(hex, basic) {
    const key = hex + (basic ? 'b' : '');
    let m = mats.get(key);
    if (!m) { m = basic ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex }); mats.set(key, m); }
    return m;
  }
  const GEO = {};
  function geo() {
    if (GEO.box) return GEO;
    GEO.box = new THREE.BoxGeometry(1, 1, 1); GEO.box.translate(0, 0.5, 0);
    GEO.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); GEO.cyl.translate(0, 0.5, 0);
    GEO.taper = new THREE.CylinderGeometry(0.34, 0.52, 1, 10); GEO.taper.translate(0, 0.5, 0);
    GEO.cone = new THREE.ConeGeometry(0.5, 1, 12); GEO.cone.translate(0, 0.5, 0);
    GEO.pyr = new THREE.ConeGeometry(0.71, 1, 4); GEO.pyr.rotateY(Math.PI / 4); GEO.pyr.translate(0, 0.5, 0);
    GEO.mound = new THREE.DodecahedronGeometry(0.5, 0);
    return GEO;
  }
  const hexOf = (c) => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
  function part(g, geometry, hex, x, y, z, sx, sy, sz, ry, basic) {
    const m = new THREE.Mesh(geometry, mat(hex, basic));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    if (ry) m.rotation.y = ry;
    m.castShadow = !basic; m.receiveShadow = !basic;
    g.add(m);
    return m;
  }
  function siteModel(b) {
    const Gm = geo(), g = new THREE.Group(), w = b.w * 0.86, d = b.h * 0.86, h = Math.min(2.4, 0.9 + b.w * 0.35);
    g.userData.kd = b.kd; g.userData.site = true;
    part(g, Gm.box, 0x86817a, 0, -2, 0, b.w * 0.92, 2, b.h * 0.92);
    part(g, Gm.box, 0x9a7a52, 0, 0, 0, w, 0.06, d);
    const wall = part(g, Gm.box, 0xd2c3a0, 0, 0.06, 0, w * 0.9, 1, d * 0.9);
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) part(g, Gm.box, 0x7a5232, sx, 0, sz, 0.08, h, 0.08);
    for (const sz of [-d / 2, d / 2]) part(g, Gm.box, 0x7a5232, 0, h * 0.55, sz, w, 0.06, 0.06), part(g, Gm.box, 0x7a5232, 0, h, sz, w, 0.06, 0.06);
    g.userData.rise = wall; g.userData.riseH = h * 0.9;
    return g;
  }
  function model(b) {
    if (b.prog < 1) return siteModel(b);
    const Gm = geo(), g = new THREE.Group();
    const k = Civ.kingdoms[b.kd], kc = k ? k.color : [150, 150, 150];
    const flag = hexOf(kc), roof = hexOf([kc[0] * 0.55 + 70, kc[1] * 0.55 + 36, kc[2] * 0.55 + 26]);
    const STONE = 0x9c978f, STONE2 = 0x86817a, WOOD = 0x8a6440, PLASTER = 0xdccba4, WIN = 0xffd27a, DARK = 0x2a1e16;
    g.userData.kd = b.kd;
    part(g, Gm.box, STONE2, 0, -2, 0, b.w * 0.92, 2, b.h * 0.92); // foundation hides any slope underneath
    switch (b.type) {
      case BT.KEEP:
        part(g, Gm.box, STONE, 0, 0, 0, 2.7, 2.1, 2.7);
        for (const sx of [-1.35, 1.35]) for (const sz of [-1.35, 1.35]) {
          part(g, Gm.cyl, STONE2, sx, 0, sz, 1.0, 2.9, 1.0);
          part(g, Gm.cone, roof, sx, 2.9, sz, 1.15, 1.0, 1.15);
        }
        part(g, Gm.box, 0xaaa59c, 0, 2.1, 0, 1.4, 1.5, 1.4);
        for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) part(g, Gm.box, STONE, sx, 3.6, sz, 0.3, 0.3, 0.3);
        part(g, Gm.box, 0x5d4037, 0, 3.6, 0, 0.07, 1.6, 0.07);
        part(g, Gm.box, flag, 0.34, 4.75, 0, 0.62, 0.4, 0.05);
        part(g, Gm.box, DARK, 0, 0, 1.36, 0.62, 0.95, 0.06);
        part(g, Gm.box, WIN, -0.7, 1.3, 1.36, 0.22, 0.3, 0.04, 0, true); part(g, Gm.box, WIN, 0.7, 1.3, 1.36, 0.22, 0.3, 0.04, 0, true);
        break;
      case BT.HOUSE:
        part(g, Gm.box, PLASTER, 0, 0, 0, 1.45, 0.9, 1.3);
        part(g, Gm.pyr, roof, 0, 0.9, 0, 1.75, 0.8, 1.6);
        part(g, Gm.box, DARK, 0.2, 0, 0.66, 0.3, 0.55, 0.04);
        part(g, Gm.box, WIN, -0.35, 0.42, 0.66, 0.24, 0.22, 0.04, 0, true);
        part(g, Gm.box, 0x7a6a5e, 0.45, 1.1, -0.3, 0.18, 0.55, 0.18);
        break;
      case BT.FARM: {
        part(g, Gm.box, 0x6e4f2e, 0, 0, 0, 2.9, 0.08, 2.9);
        const crops = [];
        for (let r = 0; r < 5; r++) crops.push(part(g, Gm.box, 0x6ea040, 0, 0.08, -1.1 + r * 0.55, 2.7, 0.15, 0.3));
        for (const sx of [-1.42, 1.42]) for (const sz of [-1.42, 1.42]) part(g, Gm.box, WOOD, sx, 0, sz, 0.08, 0.35, 0.08);
        g.userData.crops = crops;
        break;
      }
      case BT.WINDMILL: {
        part(g, Gm.taper, 0xe8e2d2, 0, 0, 0, 1.2, 2.4, 1.2);
        part(g, Gm.cone, roof, 0, 2.4, 0, 0.95, 0.7, 0.95);
        part(g, Gm.box, DARK, 0, 0, 0.55, 0.3, 0.5, 0.05);
        const hub = new THREE.Group(); hub.position.set(0, 2.05, 0.62);
        for (let q = 0; q < 4; q++) {
          const arm = new THREE.Group(); arm.rotation.z = (q * Math.PI) / 2;
          part(arm, Gm.box, 0x6d4c41, 0, 0, 0, 0.07, 1.25, 0.04);
          part(arm, Gm.box, 0xf1ead8, 0.12, 0.35, 0.01, 0.22, 0.85, 0.02);
          hub.add(arm);
        }
        g.add(hub); g.userData.blades = hub;
        break;
      }
      case BT.TEMPLE:
        part(g, Gm.box, 0xcfc8b8, 0, 0, 0, 2.9, 0.25, 2.9);
        part(g, Gm.box, 0xe9e4d8, 0, 0.25, 0, 2.5, 0.2, 2.2);
        for (const sx of [-1, 0, 1]) for (const sz of [-0.85, 0.85]) part(g, Gm.cyl, 0xf3efe6, sx, 0.45, sz, 0.32, 1.5, 0.32);
        part(g, Gm.box, 0xe9e4d8, 0, 1.95, 0, 2.6, 0.2, 2.1);
        part(g, Gm.pyr, 0xe2b64c, 0, 2.15, 0, 3.0, 0.8, 2.5);
        part(g, Gm.box, WIN, 0, 0.45, 0, 0.5, 0.9, 0.5, 0, true);
        break;
      case BT.MARKET:
        part(g, Gm.box, 0xb08d5e, 0, 0, 0, 2.9, 0.06, 2.9);
        for (let q = 0; q < 3; q++) {
          const x = -0.95 + q * 0.95;
          for (const sz of [-0.6, 0.6]) part(g, Gm.box, WOOD, x - 0.35, 0, sz, 0.06, 0.95, 0.06), part(g, Gm.box, WOOD, x + 0.35, 0, sz, 0.06, 0.95, 0.06);
          part(g, Gm.box, q % 2 ? 0xf3ece0 : flag, x, 0.95, 0, 0.82, 0.1, 1.4);
          part(g, Gm.box, WOOD, x, 0, 0.4, 0.7, 0.4, 0.3);
          part(g, Gm.box, [0xe57373, 0xffd54f, 0x81c784][q], x, 0.4, 0.4, 0.5, 0.12, 0.2);
        }
        break;
      case BT.MINE:
        part(g, Gm.mound, 0x7d7570, 0, 0.3, -0.1, 2.0, 1.3, 1.9);
        part(g, Gm.box, 0x16100c, 0, 0, 0.62, 0.7, 0.75, 0.3);
        part(g, Gm.box, WOOD, -0.42, 0, 0.72, 0.1, 0.85, 0.1); part(g, Gm.box, WOOD, 0.42, 0, 0.72, 0.1, 0.85, 0.1);
        part(g, Gm.box, WOOD, 0, 0.82, 0.72, 0.95, 0.1, 0.12);
        break;
      case BT.TOWER:
        part(g, Gm.cyl, STONE, 0, 0, 0, 1.4, 3.4, 1.4);
        for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; part(g, Gm.box, STONE2, Math.cos(a) * 0.62, 3.4, Math.sin(a) * 0.62, 0.26, 0.32, 0.26, -a); }
        part(g, Gm.box, 0x5d4037, 0, 3.4, 0, 0.06, 1.2, 0.06);
        part(g, Gm.box, flag, 0.3, 4.3, 0, 0.55, 0.34, 0.05);
        part(g, Gm.box, WIN, 0, 2.2, 0.7, 0.18, 0.34, 0.04, 0, true);
        break;
      case BT.WALL:
        part(g, Gm.box, 0x8f8c88, 0, 0, 0, 1.0, 1.1, 1.0);
        part(g, Gm.box, 0x8f8c88, -0.3, 1.1, 0, 0.32, 0.28, 1.0); part(g, Gm.box, 0x8f8c88, 0.3, 1.1, 0, 0.32, 0.28, 1.0);
        break;
      case BT.DOCK:
        part(g, Gm.box, WOOD, 0, 0, 0, 2.0, 0.15, 2.0);
        for (const sx of [-0.9, 0.9]) for (const sz of [-0.9, 0.9]) part(g, Gm.box, 0x5d4037, sx, -0.8, sz, 0.12, 1.2, 0.12);
        break;
      case BT.WORKSHOP:
        part(g, Gm.box, 0x8c6a46, 0, 0, 0, 2.4, 1.1, 2.0);
        part(g, Gm.pyr, roof, 0, 1.1, 0, 2.9, 0.75, 2.5);
        part(g, Gm.box, DARK, 0, 0, 1.01, 0.9, 0.8, 0.04);
        part(g, Gm.box, WOOD, 0.9, 0, 1.3, 0.12, 1.0, 0.12).rotation.z = 0.5;
        break;
    }
    return g;
  }
  function syncBuildings() {
    if (!ws) return;
    const seen = new Set(), x1 = wx0 + ws, y1 = wy0 + ws;
    for (const c of Civ.cities) {
      if (!c.alive || c.x < wx0 - 30 || c.x > x1 + 30 || c.y < wy0 - 30 || c.y > y1 + 30) continue;
      for (const bid of c.buildings) {
        const b = Civ.buildings[bid];
        if (!b.alive || b.cx < wx0 || b.cy < wy0 || b.cx >= x1 || b.cy >= y1) continue;
        let g = groups.get(b.id);
        if (!g || g.userData.kd !== b.kd || (g.userData.site && b.prog >= 1)) { if (g) scene.remove(g); g = model(b); groups.set(b.id, g); scene.add(g); }
        let base = -1e9;
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) base = Math.max(base, V.groundAt(x, y));
        if (b.type === BT.DOCK) base = Math.max(base, 0.12);
        g.position.set(b.cx, base, b.cy);
        if (g.userData.rise) g.userData.rise.scale.y = Math.max(0.05, b.prog * g.userData.riseH);
        if (g.userData.crops) {
          const t = b.growth, hex = ((110 + 120 * t) << 16) | ((160 + 40 * t) << 8) | (60 + 20 * t);
          for (const m of g.userData.crops) { m.material = mat(hex); m.scale.y = 0.08 + t * 0.32; }
        }
        seen.add(b.id);
      }
    }
    for (const [id, g] of groups) if (!seen.has(id)) { scene.remove(g); groups.delete(id); }
  }

  // ------------------------------------------------------------ creatures
  const CARGO = [[150, 110, 66], [120, 190, 70], [150, 104, 60], [160, 160, 160], [180, 100, 70], [250, 210, 70], [110, 220, 255]];
  function updateUnits(alpha, t) {
    let nb = 0, nh = 0;
    const x1 = wx0 + ws, y1 = wy0 + ws;
    const body = (x, y, z, sx, sy, sz, ry, rgb) => { place(bodies, nb++, x, y, z, sx, sy, sz, ry, rgb, 0); };
    const head = (x, y, z, sx, sy, sz, ry, rgb) => { place(heads, nh++, x, y, z, sx, sy, sz, ry, rgb, 0); };
    for (let i = 0; i < U.hi && nb < MAXU - 1 && nh < MAXU - 1; i++) {
      if (!U.alive[i] || U.layer[i] === 0) continue;
      const x = U.px[i] + (U.x[i] - U.px[i]) * alpha, y = U.py[i] + (U.y[i] - U.py[i]) * alpha;
      if (x < wx0 || y < wy0 || x >= x1 || y >= y1) continue;
      const sp = U.sp[i], d = SPECIES[sp], ry = Math.atan2(U.fx[i], U.fy[i]);
      const g = V.groundAt(x, y), moving = U.st[i] === 1 || U.st[i] === 3 || (U.flags[i] & FL.POSSESSED);
      const bob = moving ? Math.abs(Math.sin(U.anim[i] * 3)) * 0.06 : 0;
      const fx = Math.sin(ry), fz = Math.cos(ry);
      const kc = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]].color : [170, 170, 170];
      switch (d.kind) {
        case 'civ': case 'avatar': case 'monster': {
          if (sp === SP.WYRM) {
            const lift = 6 + Math.sin(t * 2 + i) * 0.3, flap = 0.6 + Math.abs(Math.sin(t * 5 + i)) * 0.6;
            body(x, g + lift, y, 0.55, 0.4, 1.5, ry, d.fur);
            head(x, g + lift + 0.25, y, 2.6 * flap, 0.06, 0.8, ry, [150, 30, 30]);
            break;
          }
          if (sp === SP.CRAWLER) break;
          const child = U.job[i] === J.CHILD && d.kind === 'civ', k = (child ? 0.7 : 1) * (sp === SP.HERALD ? 1.5 : 1) * (0.9 + (U.genes[i * NG + G.STAT] / 255) * 0.25);
          const skin = d.skin ? d.skin : d.fur;
          const torso = d.kind === 'civ' ? kc : sp === SP.HOLLOW ? [110, 120, 104] : d.fur;
          body(x, g + bob, y, 0.2 * k, 0.32 * k, 0.14 * k, ry, U.job[i] === J.PRIEST ? [236, 232, 220] : torso);
          head(x, g + bob + 0.32 * k, y, 0.15 * k, 0.15 * k, 0.15 * k, ry, U.flags[i] & FL.KING ? [255, 214, 90] : sp === SP.HOLLOW ? [170, 200, 160] : skin);
          if ((U.job[i] === J.SOLDIER || U.sq[i] >= 0) && d.kind === 'civ') head(x + fz * 0.13, g + bob + 0.05, y - fx * 0.13, 0.03, 0.62 * k, 0.03, ry, [200, 204, 214]);
          break;
        }
        case 'animal': {
          const wolf = sp === SP.WOLF;
          body(x, g + bob * 0.5, y, wolf ? 0.16 : 0.18, wolf ? 0.24 : 0.3, 0.42, ry, d.fur);
          head(x + fx * 0.24, g + (wolf ? 0.2 : 0.28) + bob * 0.5, y + fz * 0.24, 0.13, 0.13, 0.15, ry, d.fur.map((v) => v * 0.85));
          break;
        }
        case 'ambient': {
          const flap = 0.4 + Math.abs(Math.sin(t * 12 + i)) * 0.8;
          body(x, g + 4 + Math.sin(t + i) * 0.4, y, 0.14 * flap + 0.06, 0.04, 0.1, ry, d.fur);
          break;
        }
        case 'vehicle': {
          if (sp === SP.SHIP) {
            const w = Math.max(g, 0) + Math.sin(t * 2 + i) * 0.03;
            body(x, w - 0.08, y, 0.42, 0.24, 0.95, ry, [128, 88, 52]);
            head(x, w + 0.16, y, 0.04, 0.7, 0.5, ry, kc);
          } else if (sp === SP.AIRSHIP) {
            const lift = 5 + Math.sin(t + i) * 0.2;
            body(x, g + lift, y, 0.7, 0.5, 1.4, ry, kc);
            head(x, g + lift - 0.35, y, 0.3, 0.22, 0.55, ry, [120, 84, 52]);
          } else if (sp === SP.CATAPULT) {
            body(x, g, y, 0.42, 0.22, 0.6, ry, [140, 100, 62]);
            head(x - fx * 0.15, g + 0.2, y - fz * 0.15, 0.06, 0.55, 0.06, ry, [110, 78, 50]);
          } else {
            body(x, g, y, 0.36, 0.26, 0.56, ry, [140, 100, 62]);
            head(x, g + 0.26, y, 0.3, 0.18, 0.36, ry, CARGO[U.carry[i]] || CARGO[0]);
          }
          break;
        }
      }
    }
    bodies.count = nb; heads.count = nh;
    for (const m of [bodies, heads]) { m.instanceMatrix.updateRange.count = -1; m.instanceColor.updateRange.count = -1; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    V.stats.creatures = nb;
  }

  // ------------------------------------------------------------ sky, light, camera
  const SKY_DAY = [159, 203, 234], SKY_DUSK = [240, 164, 112], SKY_NIGHT = [12, 20, 38];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function lighting(dist) {
    const day = Sky.daylight(), sh = Sky.sunHeight(), sd = Sky.sunDir();
    const dusk = Math.max(0, 1 - Math.abs(sh) / 0.35) * (day > 0.05 ? 1 : 0);
    let sky = mix(SKY_NIGHT, SKY_DAY, day);
    sky = mix(sky, SKY_DUSK, dusk * 0.6);
    scene.background.setRGB(sky[0] / 255, sky[1] / 255, sky[2] / 255);
    scene.fog.color.copy(scene.background);
    scene.fog.near = dist * 1.3; scene.fog.far = dist * 3.4 + 80;
    const warm = mix([255, 244, 224], [255, 170, 110], dusk);
    sun.color.setRGB(warm[0] / 255, warm[1] / 255, warm[2] / 255);
    sun.intensity = 0.1 + 0.5 * day;
    hemi.intensity = 0.26 + 0.44 * day; // sky light keeps the palette close to the 2D map
    hemi.color.setRGB(0.55 + 0.4 * day, 0.62 + 0.36 * day, 0.85 + 0.15 * day);
    hemi.groundColor.setRGB(0.32 + 0.3 * day, 0.34 + 0.3 * day, 0.28 + 0.24 * day);
    const elev = Math.max(0.45, sh); // tops stay sunlit even near dusk
    sun.position.set(target.x + sd.x * 120, target.y + elev * 160 + 10, target.z + sd.y * 120);
    sun.target.position.copy(target);
    const half = Math.min(ws * 0.55, dist * 1.1 + 24), sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 600;
    sc.updateProjectionMatrix();
  }
  function placeCamera() {
    const z = R.cam.z, dist = ch / (2 * Math.max(z, 1) * Math.tan((FOV * Math.PI) / 360));
    gTarget += (V.groundAt(R.cam.x, R.cam.y) - gTarget) * 0.12;
    target.set(R.cam.x, Math.max(0, gTarget), R.cam.y);
    const p = V.tilt, s = Math.sin(V.yaw), c = Math.cos(V.yaw);
    camera.position.set(target.x + s * Math.sin(p) * dist, target.y + Math.cos(p) * dist, target.z + c * Math.sin(p) * dist);
    camera.up.set(-s, 0, -c);
    camera.lookAt(target);
    camera.near = Math.max(0.3, dist * 0.02); camera.far = dist * 6 + 400; camera.updateProjectionMatrix();
    return dist;
  }

  // ------------------------------------------------------------ frame
  V.render = function (dt, alpha) {
    const t = performance.now() / 1000;
    const ns = windowSize();
    const off = Math.max(Math.abs(R.cam.x - (wx0 + ws / 2)), Math.abs(R.cam.y - (wy0 + ws / 2)));
    if (needBuild || ns > ws || ns < ws * 0.6 || off > ws * 0.18) build();
    else {
      // keep the window fresh: a band of rows per frame, flora and buildings now and then
      const rows = Math.max(2, Math.ceil(ws / 30)), r0 = roll % ws, r1 = Math.min(ws, r0 + rows);
      refreshRows(r0, r1); roll = r1 % ws;
      if ((floraClock += dt) > 6) buildFlora();
      if ((bldClock += dt) > 0.4) { syncBuildings(); bldClock = 0; if (liqDirty) packLiquids(); }
    }
    for (const g of groups.values()) if (g.userData.blades) g.userData.blades.rotation.z = t * 1.4;
    water.position.y = Math.sin(t * 1.2) * 0.03;
    updateUnits(alpha, t);
    const dist = placeCamera();
    lighting(dist);
    renderer.render(scene, camera);
    V.stats.window = ws; V.stats.triangles = renderer.info.render.triangles;
  };

  // ------------------------------------------------------------ picking & projection
  const ray = THREE ? new THREE.Raycaster() : null, ndc = THREE ? new THREE.Vector2() : null, pv = THREE ? new THREE.Vector3() : null;
  V.screenToWorld = function (sx, sy) {
    ndc.set((sx / cw) * 2 - 1, -(sy / ch) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let h = target.y, px = R.cam.x, pz = R.cam.y;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(d.y) < 1e-5) break;
      const tt = (h - o.y) / d.y;
      if (tt < 0) break;
      px = o.x + d.x * tt; pz = o.z + d.z * tt;
      h = V.groundAt(px, pz);
    }
    return { x: AG.clamp(px, 0, W - 0.01), y: AG.clamp(pz, 0, H - 0.01) };
  };
  V.project = function (x, y, h) {
    pv.set(x, V.groundAt(x, y) + (h || 0), y).project(camera);
    return { x: ((pv.x + 1) * cw) / 2, y: ((1 - pv.y) * ch) / 2, vis: pv.z > -1 && pv.z < 1 && Math.abs(pv.x) < 1.3 && Math.abs(pv.y) < 1.3, depth: pv.z };
  };
})();
