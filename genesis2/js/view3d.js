/* AURA: Genesis 2 — view3d.js
 * The close-up 3D view (three.js / WebGL). Past 8x zoom the camera tilts, map-app style,
 * into a cel-shaded voxel diorama of the area around it: terrain columns with pixel
 * texture, water and glowing lava, layered trees, a detailed model for every building,
 * walking people and animals, drifting low-poly clouds with moving shadows, rain, snow and
 * lightning, chimney smoke, sun shadows, sky and haze. Looking straight down at the hand-off
 * zoom it matches the 2D map cell for cell, so the switch is seamless; then the camera tilts. */
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
  const CLOUD_Y = 24;       // cloud base height
  const FIG = 1.4; // figures are drawn a little larger than life so they read at a glance
  const MAXT = 24000, MAXU = 3000, MAXC = 5000, MAXSMOKE = 900, MAXDROP = 3600;
  let renderer, scene, camera, sun, hemi, el, cw = 1, ch = 1, gradient, toonV, glowV, skyTex, skyCtx;
  let land, water, hot, trunks, pines, leaves, jungle, rocks, cacti, bushes, flowers;
  let people, heads, hats, beasts, props, smoke, clouds, rain, snow, bolts;
  let wx0 = 0, wy0 = 0, ws = 0, roll = 0, needBuild = true, floraClock = 0, bldClock = 0, gTarget = 0, frameN = 0;
  const top = new Float32Array(MAXS * MAXS);
  const groups = new Map();
  const target = THREE ? new THREE.Vector3() : null;

  function hash(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const colTop = (i) => { const e = Wd.elev[i]; return e >= SEA ? Math.round((e - SEA) * HS * 2) / 2 + 0.25 : Math.round((e - SEA) * 16 * 2) / 2 - 0.1; }; // (the sea floor in half steps too, so flat stretches read as one)
  const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const hexOf = (c) => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
  const shade = (hex, k) => hexOf(rgbOf(hex).map((v) => Math.max(0, Math.min(255, v * k))));

  // ------------------------------------------------------------ geometry kit
  // Shapes are kept non-indexed with their base at y = 0 (the icosahedron is centred) so they
  // can be merged into one vertex-coloured mesh per building, tree or figure.
  const GEO = {};
  function prismGeo() { // gable roof: ridge along z, base 1x1 at y = 0, apex at y = 1
    const a = [-0.5, 0, 0.5], b = [0.5, 0, 0.5], c = [0, 1, 0.5], d = [-0.5, 0, -0.5], e = [0.5, 0, -0.5], f = [0, 1, -0.5];
    const tris = [a, b, c, e, d, f, a, c, f, a, f, d, b, e, f, b, f, c, a, d, e, a, e, b];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return g;
  }
  function makeGeos() {
    const base = (g) => { g.translate(0, 0.5, 0); return g.toNonIndexed(); };
    GEO.box = base(new THREE.BoxGeometry(1, 1, 1));
    GEO.cbox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); // centred
    GEO.cyl = base(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    GEO.taper = base(new THREE.CylinderGeometry(0.34, 0.52, 1, 10));
    GEO.cone = base(new THREE.ConeGeometry(0.5, 1, 10));
    GEO.cone6 = base(new THREE.ConeGeometry(0.5, 1, 6, 1, true));
    GEO.ico = new THREE.IcosahedronGeometry(0.5, 0);
    GEO.mound = new THREE.DodecahedronGeometry(0.5, 0);
    GEO.prism = prismGeo();
  }
  const _m = THREE ? new THREE.Matrix4() : null, _q = THREE ? new THREE.Quaternion() : null, _e = THREE ? new THREE.Euler() : null;
  const _n = THREE ? new THREE.Matrix3() : null, _v = THREE ? new THREE.Vector3() : null, _p = THREE ? new THREE.Vector3() : null, _s = THREE ? new THREE.Vector3() : null;
  function merge(parts) {
    let count = 0;
    for (const p of parts) count += p.geo.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    let o = 0;
    for (const p of parts) {
      _e.set(p.rx || 0, p.ry || 0, p.rz || 0); _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx, p.sy, p.sz));
      _n.getNormalMatrix(_m);
      const P = p.geo.attributes.position, N = p.geo.attributes.normal, c = p.c;
      for (let k = 0; k < P.count; k++, o++) {
        _v.fromBufferAttribute(P, k).applyMatrix4(_m); pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        _v.fromBufferAttribute(N, k).applyMatrix3(_n).normalize(); nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
        col[o * 3] = c[0] / 255; col[o * 3 + 1] = c[1] / 255; col[o * 3 + 2] = c[2] / 255;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // A little builder: kit.box(colour, x, y, z, sx, sy, sz, ry, rx, rz), likewise cyl/cone/prism/ico/...;
  // kit.glow(...) adds unlit parts (windows, braziers) that shine at night.
  function Kit() { this.lit = []; this.lamp = []; }
  for (const [name, gk] of [['box', 'box'], ['cbox', 'cbox'], ['cyl', 'cyl'], ['taper', 'taper'], ['cone', 'cone'], ['cone6', 'cone6'], ['ico', 'ico'], ['mound', 'mound'], ['prism', 'prism']]) {
    Kit.prototype[name] = function (hex, x, y, z, sx, sy, sz, ry, rx, rz) {
      this.lit.push({ geo: GEO[gk], c: Array.isArray(hex) ? hex : rgbOf(hex), x, y, z, sx, sy, sz, ry, rx, rz });
      return this;
    };
  }
  Kit.prototype.glow = function (hex, x, y, z, sx, sy, sz, ry) { this.lamp.push({ geo: GEO.box, c: rgbOf(hex), x, y, z, sx, sy, sz, ry }); return this; };
  Kit.prototype.done = function () { return { lit: merge(this.lit), glow: this.lamp.length ? merge(this.lamp) : null }; };

  // ------------------------------------------------------------ setup
  function flakeTex() { // a soft round dot so snowflakes are not square
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    return new THREE.CanvasTexture(c);
  }
  // ------------------------------------------------------------ the sea and the horizon
  // One continuous sea surface for the whole world: gentle waves, sun glints, shallows you can see
  // into (turquoise over sand, deepening to blue), and foam where it meets the shore. Its depth
  // comes from a small texture of the sea floor, refreshed now and then.
  const SEA_Y = 0.12;
  let sea = null, seaTex = null, seaData = null, seaClock = 99, far = null, farClock = 99;
  function makeSea() {
    seaData = new Uint8Array(W * H * 4);
    seaTex = new THREE.DataTexture(seaData, W, H, THREE.RGBAFormat);
    seaTex.magFilter = seaTex.minFilter = THREE.LinearFilter; seaTex.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(W, H, Math.max(1, W >> 2), Math.max(1, H >> 2));
    geo.rotateX(-Math.PI / 2); geo.translate(W / 2, SEA_Y, H / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uDepth: { value: null }, uSize: { value: new THREE.Vector2(W, H) },
        uSun: { value: new THREE.Vector3(0.3, 0.8, 0.4) }, uLight: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) },
      }]),
      vertexShader: `
        uniform float uTime; varying vec2 vXZ; varying vec3 vView;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = position;
          p.y += (sin(p.x * 0.55 + uTime * 1.3) + sin(p.z * 0.45 - uTime * 1.05) + sin((p.x + p.z) * 0.9 + uTime * 1.9) * 0.5) * 0.035;
          vXZ = p.xz;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vView = cameraPosition - wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D uDepth; uniform vec2 uSize; uniform vec3 uSun; uniform float uLight; uniform vec3 uTint;
        varying vec2 vXZ; varying vec3 vView;
        #include <fog_pars_fragment>
        void main() {
          vec4 d = texture2D(uDepth, vXZ / uSize);
          float depth = d.r, shore = d.g;
          if (depth <= 0.002 && shore <= 0.002) discard;            // dry land: the surface is not there
          // small moving ripples give the surface a normal to catch the sun
          vec2 q = vXZ * 1.7;
          float dx = cos(q.x + uTime * 1.6) * 0.5 + cos((q.x + q.y) * 1.3 + uTime * 2.1) * 0.35 + cos(q.x * 2.7 - uTime * 2.6) * 0.15;
          float dz = cos(q.y * 0.9 - uTime * 1.3) * 0.5 + cos((q.x + q.y) * 1.3 + uTime * 2.1) * 0.35 + cos(q.y * 2.3 + uTime * 2.2) * 0.15;
          vec3 n = normalize(vec3(-dx * 0.06, 1.0, -dz * 0.06));
          vec3 v = normalize(vView);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 shallow = vec3(0.17, 0.68, 0.74), mid = vec3(0.07, 0.42, 0.64), deep = vec3(0.03, 0.15, 0.36);
          float dd = smoothstep(0.0, 1.0, depth);
          vec3 col = mix(shallow, mid, smoothstep(0.0, 0.35, dd));
          col = mix(col, deep, smoothstep(0.3, 1.0, dd));
          col = mix(col, vec3(0.62, 0.80, 0.92), fres * 0.45);      // the sky reflected at grazing angles
          float spec = pow(max(dot(reflect(-normalize(uSun), n), v), 0.0), 260.0);
          col *= uLight * uTint;
          // fine glints that twinkle, not broad white patches
          float tw = 0.5 + 0.5 * sin(vXZ.x * 3.1 + vXZ.y * 2.3 + uTime * 3.0);
          col += vec3(1.0, 0.96, 0.86) * spec * 0.55 * tw * uLight;
          // foam: a bright, breathing line where the sea meets the shore
          float wob = 0.55 + 0.45 * sin(uTime * 1.6 + (vXZ.x + vXZ.y) * 0.8 + sin(vXZ.x * 0.35) * 2.0);
          float foam = smoothstep(0.25, 0.85, shore) * wob;
          col = mix(col, vec3(0.97, 0.99, 1.0) * max(uLight, 0.35), foam * 0.85);
          float alpha = mix(0.55, 0.95, smoothstep(0.0, 0.45, dd));  // shallows let the sand show through
          alpha = max(alpha, foam * 0.9);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
    mat.uniforms.uDepth.value = seaTex;
    sea = new THREE.Mesh(geo, mat); sea.frustumCulled = false; sea.renderOrder = 2;
    scene.add(sea);
    // open ocean all around the map, so the world never ends in empty sky
    const om = new THREE.MeshLambertMaterial({ color: 0x0d2f5c });
    for (const [x, z, w, d] of [[-2 * W, -2 * H, 5 * W, 2 * H], [-2 * W, H, 5 * W, 2 * H], [-2 * W, 0, 2 * W, H], [W, 0, 2 * W, H]]) {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x + w / 2, SEA_Y - 0.02, z + d / 2);
      const m = new THREE.Mesh(g, om); m.frustumCulled = false; scene.add(m);
    }
  }
  // depth of the sea over each cell (R) and how close the shore is (G)
  function refreshSea() {
    const d = seaData, top = SEA_Y + 0.05;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4, g = colTop(i), wet = Wd.elev[i] < SEA && Wd.fl[i] > 0.004 && !Wd.frozen[i];
      const depth = wet ? Math.max(0, top - g) : 0;
      d[o] = Math.min(255, (depth / 3.2) * 255) | 0;
      // shore: shallow sea next to land
      let near = 0;
      if (wet && depth < 0.9) {
        for (let k = 0; k < 4 && !near; k++) { const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0); if (nx >= 0 && ny >= 0 && nx < W && ny < H && Wd.elev[ny * W + nx] >= SEA) near = 1; }
      }
      d[o + 1] = near ? 255 : 0; d[o + 2] = 0; d[o + 3] = 255;
    }
    seaTex.needsUpdate = true;
  }
  // The world beyond the detailed window: a faceted, low-detail landscape (every 4th cell) so the
  // land runs on to the horizon instead of ending at a cliff. Inside the window it sinks out of sight.
  const FS = 4;
  function makeFarLand() {
    const nx = Math.ceil(W / FS) + 1, nz = Math.ceil(H / FS) + 1, n = nx * nz;
    const pos = new Float32Array(n * 3), colr = new Float32Array(n * 3), idx = [];
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const k = z * nx + x; pos[k * 3] = Math.min(W, x * FS); pos[k * 3 + 2] = Math.min(H, z * FS); }
    for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) { const a = z * nx + x, b = a + 1, c = a + nx, e = c + 1; idx.push(a, c, b, b, c, e); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    far = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); // lit from computed normals (set in refreshFar)
    far.frustumCulled = false; far.receiveShadow = false;
    far.userData = { nx, nz };
    scene.add(far);
  }
  function refreshFar(colours) {
    const { nx, nz } = far.userData, pos = far.geometry.attributes.position.array, cl = far.geometry.attributes.color.array;
    const x0 = wx0 + FS, x1 = wx0 + ws - FS, z0 = wy0 + FS, z1 = wy0 + ws - FS; // sink only well inside the window (no trench at its edge)
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const k = z * nx + x, cx = Math.min(W - 1, x * FS), cz = Math.min(H - 1, z * FS), i = cz * W + cx;
      const inside = cx > x0 && cx < x1 && cz > z0 && cz < z1;
      // the highest ground around the vertex, so distant hills are not shaved off (and the detailed
      // window's edge columns stay tucked under the far landscape)
      let hmax = -1e9, land = false;
      for (let dz = -2; dz <= 2; dz += 2) for (let dx = -2; dx <= 2; dx += 2) {
        const xx = cx + dx, zz = cz + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
        const j = zz * W + xx; if (Wd.elev[j] >= SEA) { land = true; hmax = Math.max(hmax, colTop(j)); }
      }
      pos[k * 3 + 1] = inside ? BOTTOM - 2 : land ? hmax - 0.05 : Math.max(BOTTOM, colTop(i));
      if (colours) {
        if (land) { const c = R.flatColor(i); cl[k * 3] = (c & 255) / 255; cl[k * 3 + 1] = ((c >>> 8) & 255) / 255; cl[k * 3 + 2] = ((c >>> 16) & 255) / 255; }
        else { const dk = AG.clamp(-colTop(i) / 3, 0, 1); cl[k * 3] = (168 - dk * 90) / 255; cl[k * 3 + 1] = (152 - dk * 70) / 255; cl[k * 3 + 2] = (108 - dk * 30) / 255; } // sea floor: sand to deep
      }
    }
    far.geometry.attributes.position.needsUpdate = true;
    if (colours) far.geometry.attributes.color.needsUpdate = true;
    far.geometry.computeVertexNormals(); // (without normals the land lights as black)
    far.geometry.computeBoundingSphere();
  }
  V.parts = () => ({ sea, far, scene }); // (for debugging and screenshots)
  // Warm-up during the loading screen: build a window, compile every shader program (including the
  // building and glow materials, through two tiny stand-ins) and draw once off-screen, so the first
  // zoom into 3D does not stall on compiling and uploading.
  V.prewarm = function () {
    if (!V.ok) return false;
    try {
      if (!V._standins) {
        const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -50, 0, 0.01, -50, 0, 0, -50, 0.01]), 3));
        tri.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
        for (const m of [toonV, glowV]) { const me = new THREE.Mesh(tri, m); me.frustumCulled = false; me.castShadow = true; scene.add(me); }
        V._standins = true;
      }
      if (!ws) build();
      placeCamera();
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      needBuild = true;
      return true;
    } catch (e) { needBuild = true; return false; }
  };
  function updateSea(t, dt) {
    if (!sea) return;
    const u = sea.material.uniforms, sd = Sky.sunDir(), day = Sky.daylight();
    u.uTime.value = t;
    u.uSun.value.set(sd.x, Math.max(0.25, Sky.sunHeight()), sd.y);
    u.uLight.value = 0.25 + 0.75 * day;
    u.uTint.value.copy(sun.color).lerp(new THREE.Color(1, 1, 1), 0.6);
    if ((seaClock += dt) > 2) { refreshSea(); seaClock = 0; }
    if ((farClock += dt) > 5) { refreshFar(true); farClock = 0; }
  }

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
    makeGeos();
    scene = new THREE.Scene();
    const sc = document.createElement('canvas'); sc.width = 2; sc.height = 128; skyCtx = sc.getContext('2d');
    skyTex = new THREE.CanvasTexture(sc); scene.background = skyTex;
    scene.fog = new THREE.Fog(0x9fcbea, 200, 600);
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 4000);
    hemi = new THREE.HemisphereLight(0xe6f2ff, 0x4f5a3c, 0.55);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2dd, 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // cel shading: four flat bands of light
    gradient = new THREE.DataTexture(new Uint8Array([96, 96, 96, 255, 162, 162, 162, 255, 218, 218, 218, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.generateMipmaps = false; gradient.needsUpdate = true;
    const toon = (o) => new THREE.MeshToonMaterial(Object.assign({ gradientMap: gradient }, o));
    toonV = toon({ vertexColors: true });
    glowV = new THREE.MeshBasicMaterial({ vertexColors: true });

    // a tiny noise texture gives every voxel face crisp pixel detail up close
    const s = 16, data = new Uint8Array(s * s * 4), r = AG.mulberry32(11);
    for (let i = 0; i < s * s; i++) {
      const x = i % s, y = (i / s) | 0;
      let v = 238 + r() * 17;           // a faint grain, no seams: neighbouring cells read as one surface
      if (r() < 0.04) v = 222;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const detail = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
    detail.magFilter = THREE.NearestFilter; detail.minFilter = THREE.LinearMipmapLinearFilter; detail.generateMipmaps = true;
    detail.needsUpdate = true;

    const inst = (geo, mat, n, cast, receive) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = !!cast; m.receiveShadow = !!receive; m.count = 0;
      scene.add(m);
      return m;
    };
    const col = new THREE.BoxGeometry(1, 1, 1); col.translate(0, 0.5, 0);
    { const idx = Array.from(col.index.array); idx.splice(18, 6); col.setIndex(idx); col.clearGroups(); } // no bottom face: never seen
    land = inst(col, new THREE.MeshLambertMaterial({ map: detail }), MAXS * MAXS, false, true);
    water = inst(col, new THREE.MeshPhongMaterial({ map: detail, transparent: true, opacity: 0.9, shininess: 70, specular: 0x3a5068 }), MAXS * MAXS, false, true);
    hot = inst(col, new THREE.MeshBasicMaterial({ map: detail }), MAXS * MAXS, false, false);
    makeSea();
    makeFarLand();

    // flora: layered pines, puffy broadleaf clusters, jungle canopies, cacti with arms
    const pineGeo = merge([
      { geo: GEO.cone6, c: [255, 255, 255], x: 0, y: 0.0, z: 0, sx: 0.95, sy: 0.55, sz: 0.95 },
      { geo: GEO.cone6, c: [236, 236, 236], x: 0, y: 0.3, z: 0, sx: 0.75, sy: 0.5, sz: 0.75 },
      { geo: GEO.cone6, c: [222, 222, 222], x: 0, y: 0.58, z: 0, sx: 0.52, sy: 0.48, sz: 0.52 },
    ]);
    const leafGeo = merge([
      { geo: GEO.ico, c: [255, 255, 255], x: 0, y: 0.05, z: 0, sx: 0.92, sy: 0.84, sz: 0.92 },
      { geo: GEO.ico, c: [214, 214, 214], x: 0.24, y: -0.12, z: 0.1, sx: 0.58, sy: 0.54, sz: 0.58 },
      { geo: GEO.ico, c: [226, 226, 226], x: -0.22, y: -0.08, z: -0.14, sx: 0.6, sy: 0.55, sz: 0.6 },
    ]);
    const jungleGeo = merge([
      { geo: GEO.ico, c: [255, 255, 255], x: 0, y: 0, z: 0, sx: 1.25, sy: 0.6, sz: 1.25 },
      { geo: GEO.ico, c: [220, 220, 220], x: 0.3, y: -0.12, z: -0.2, sx: 0.7, sy: 0.4, sz: 0.7 },
      { geo: GEO.ico, c: [235, 235, 235], x: -0.28, y: -0.1, z: 0.24, sx: 0.7, sy: 0.4, sz: 0.7 },
    ]);
    const cactusGeo = merge([
      { geo: GEO.box, c: [255, 255, 255], x: 0, y: 0, z: 0, sx: 0.2, sy: 0.8, sz: 0.2 },
      { geo: GEO.box, c: [230, 230, 230], x: 0.16, y: 0.3, z: 0, sx: 0.14, sy: 0.08, sz: 0.12 },
      { geo: GEO.box, c: [230, 230, 230], x: 0.2, y: 0.3, z: 0, sx: 0.1, sy: 0.32, sz: 0.1 },
      { geo: GEO.box, c: [220, 220, 220], x: -0.15, y: 0.42, z: 0, sx: 0.12, sy: 0.07, sz: 0.11 },
      { geo: GEO.box, c: [220, 220, 220], x: -0.18, y: 0.42, z: 0, sx: 0.09, sy: 0.24, sz: 0.09 },
    ]);
    trunks = inst(GEO.box, toon({}), MAXT, true, false);
    pines = inst(pineGeo, toon({ vertexColors: true }), MAXT, true, true);
    leaves = inst(leafGeo, toon({ vertexColors: true }), MAXT, true, true);
    jungle = inst(jungleGeo, toon({ vertexColors: true }), 8000, true, true);
    rocks = inst(GEO.mound, toon({}), MAXT, true, true);
    cacti = inst(cactusGeo, toon({ vertexColors: true }), 4000, true, false);
    bushes = inst(GEO.ico, toon({}), 12000, true, true);
    flowers = inst(GEO.cbox, new THREE.MeshLambertMaterial(), 8000, false, false);

    // figures: a jointed humanoid, a quadruped, heads, hats and a generic prop box
    const humanGeo = merge([
      { geo: GEO.box, c: [96, 96, 96], x: -0.045, y: 0, z: 0, sx: 0.065, sy: 0.14, sz: 0.075 },
      { geo: GEO.box, c: [96, 96, 96], x: 0.045, y: 0, z: 0, sx: 0.065, sy: 0.14, sz: 0.075 },
      { geo: GEO.box, c: [255, 255, 255], x: 0, y: 0.13, z: 0, sx: 0.17, sy: 0.17, sz: 0.11 },
      { geo: GEO.box, c: [70, 60, 50], x: 0, y: 0.165, z: 0, sx: 0.178, sy: 0.026, sz: 0.118 },
      { geo: GEO.box, c: [235, 235, 235], x: -0.112, y: 0.14, z: 0, sx: 0.048, sy: 0.15, sz: 0.06 },
      { geo: GEO.box, c: [235, 235, 235], x: 0.112, y: 0.14, z: 0, sx: 0.048, sy: 0.15, sz: 0.06 },
    ]);
    const beastGeo = merge([
      { geo: GEO.box, c: [255, 255, 255], x: 0, y: 0.13, z: 0, sx: 0.17, sy: 0.14, sz: 0.36 },
      { geo: GEO.box, c: [170, 170, 170], x: -0.055, y: 0, z: -0.12, sx: 0.045, sy: 0.14, sz: 0.045 },
      { geo: GEO.box, c: [170, 170, 170], x: 0.055, y: 0, z: -0.12, sx: 0.045, sy: 0.14, sz: 0.045 },
      { geo: GEO.box, c: [170, 170, 170], x: -0.055, y: 0, z: 0.12, sx: 0.045, sy: 0.14, sz: 0.045 },
      { geo: GEO.box, c: [170, 170, 170], x: 0.055, y: 0, z: 0.12, sx: 0.045, sy: 0.14, sz: 0.045 },
      { geo: GEO.box, c: [235, 235, 235], x: 0, y: 0.2, z: 0.17, sx: 0.07, sy: 0.13, sz: 0.07, rx: 0.5 },
      { geo: GEO.box, c: [225, 225, 225], x: 0, y: 0.29, z: 0.23, sx: 0.09, sy: 0.08, sz: 0.15 },
      { geo: GEO.box, c: [200, 200, 200], x: 0, y: 0.2, z: -0.2, sx: 0.04, sy: 0.04, sz: 0.1, rx: -0.6 },
    ]);
    people = inst(humanGeo, toon({ vertexColors: true }), MAXU, true, false);
    heads = inst(GEO.ico, toon({}), MAXU, true, false);
    hats = inst(GEO.cone, toon({}), MAXU, true, false);
    beasts = inst(beastGeo, toon({ vertexColors: true }), MAXU, true, false);
    props = inst(GEO.box, toon({}), MAXU * 2, true, false);

    // chimney smoke and weather
    smoke = inst(GEO.ico, toon({ transparent: true, opacity: 0.55, depthWrite: false }), MAXSMOKE, false, false);
    const puffGeo = merge([
      { geo: GEO.ico, c: [255, 255, 255], x: 0, y: 0, z: 0, sx: 1, sy: 0.62, sz: 1 },
      { geo: GEO.ico, c: [246, 246, 246], x: 0.32, y: 0.12, z: 0.1, sx: 0.66, sy: 0.55, sz: 0.66 },
      { geo: GEO.ico, c: [240, 240, 240], x: -0.3, y: 0.08, z: -0.12, sx: 0.6, sy: 0.5, sz: 0.6 },
    ]);
    clouds = inst(puffGeo, toon({ vertexColors: true, transparent: true, opacity: 0.9 }), MAXC, true, false);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXDROP * 6), 3).setUsage(THREE.DynamicDrawUsage));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc4d8f0, transparent: true, opacity: 0.75, depthWrite: false }));
    rain.frustumCulled = false; scene.add(rain);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXDROP * 3), 3).setUsage(THREE.DynamicDrawUsage));
    snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.95, map: flakeTex(), alphaTest: 0.3, depthWrite: false }));
    snow.frustumCulled = false; scene.add(snow);
    bolts = inst(GEO.cbox, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 120, false, false);
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
    const z = R.cam.z, want = V.allowed !== false && R.view !== 0 && z > ENTER + 0.001; // (AG.Perf can switch 3D off)
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
      if (act) { needBuild = true; Q.since = performance.now() / 1000; Q.ema = 60; Q.prev = 0; }
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
        const gTop = e < SEA && Wd.frozen[i] && sea ? SEA_Y + 0.06 : colTop(i), wet = f > 0.004 && !Wd.frozen[i]; // a frozen sea is ice on the surface
        setBox(land, n, x, y, BOTTOM, gTop);
        if (wet && typ === FT.WATER && e < SEA && sea) {
          // the sea itself is the one continuous surface (makeSea); here only its floor
          const deepK = AG.clamp(-gTop / 3, 0, 1);
          paint(land, n, 168 - deepK * 90 + cr * 0.1, 152 - deepK * 70 + cg * 0.1, 108 - deepK * 30 + cb * 0.1);
          liq[n] = LIQ_NONE; top[n] = SEA_Y;
        } else if (wet && typ === FT.WATER) {
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
    flag(water); flag(hot);
    liqDirty = false;
  }
  // Upload only the instances in use: a full-capacity upload re-sends megabytes every frame
  // (three.js resets the range after each upload, so it is set every time).
  function flag(m) {
    const n = Math.max(1, m.count);
    m.instanceMatrix.updateRange.offset = 0; m.instanceMatrix.updateRange.count = n * 16; m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) { m.instanceColor.updateRange.offset = 0; m.instanceColor.updateRange.count = n * 3; m.instanceColor.needsUpdate = true; }
  }
  function build() {
    ws = windowSize();
    wx0 = AG.clamp(Math.round(R.cam.x - ws / 2), 0, W - ws);
    wy0 = AG.clamp(Math.round(R.cam.y - ws / 2), 0, H - ws);
    land.count = ws * ws;
    refreshRows(0, ws);
    packLiquids();
    if (sea) { refreshSea(); seaClock = 0; }
    if (far) { refreshFar(farClock > 4); }
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
  const LEAF = [[106, 172, 76], [74, 146, 64], [222, 128, 54]]; // spring, summer, autumn (a little less neon)
  const PETALS = [[244, 92, 116], [252, 224, 92], [184, 124, 244], [252, 252, 252], [255, 152, 64]];
  const dummy = THREE ? new THREE.Object3D() : null, tint = THREE ? new THREE.Color() : null;
  function place(mesh, n, x, y, z, sx, sy, sz, ry, rgb, vary, roll) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, roll || 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    const k = 1 + vary;
    tint.setRGB(Math.min(1, (rgb[0] / 255) * k), Math.min(1, (rgb[1] / 255) * k), Math.min(1, (rgb[2] / 255) * k));
    mesh.setColorAt(n, tint);
  }
  function buildFlora() {
    let nt = 0, np = 0, nl = 0, nj = 0, nr = 0, nc = 0, nb = 0, nf = 0;
    const season = Sky.season(), leafC = LEAF[season === 0 ? 0 : season === 2 ? 2 : 1];
    for (let ly = 0; ly < ws; ly++) for (let lx = 0; lx < ws; lx++) {
      const x = wx0 + lx, y = wy0 + ly, i = y * W + x;
      if (Wd.bgrid[i] || Wd.fire[i] || Wd.fl[i] > 0.004) continue;
      const h = hash(x, y), v = Wd.veg[i], s = Wd.soil[i], T = Wd.tbase[i], snowy = Wd.snow[i] > 120;
      let kind = 0; // 1 pine, 2 broadleaf, 3 jungle, 4 dead, 5 rock, 6 cactus, 7 bush, 8 flower
      const tree = () => (snowy || T < 0.3 ? 1 : T > 0.68 ? 3 : season === 3 && T < 0.48 ? 4 : 2);
      if (s === SO.DIRT || s === SO.HOLY) {
        if (v >= 165) { if ((h & 3) !== 0) kind = tree(); else if ((h & 12) === 0) kind = 7; }
        else if (v >= 110) { if (h % 9 === 0) kind = tree(); else if (h % 4 === 0) kind = 7; }
        else if (v >= 60 && season <= 1 && h % 11 === 0) kind = 8;
        if (s === SO.HOLY && !kind && h % 4 === 0) kind = 8;
      } else if (s === SO.ROCK) { if (h % 13 === 0) kind = 5; else if (v > 60 && h % 9 === 0) kind = 1; }
      else if (s === SO.SAND) { if (T > 0.55 && Wd.elev[i] > SEA + 0.02 && h % 29 === 0) kind = 6; else if (Wd.veg[i] > 20 && h % 17 === 0) kind = 7; }
      else if (s === SO.ASH) { if (h % 11 === 0) kind = 4; }
      else if (s === SO.BASALT) { if (h % 15 === 0) kind = 5; }
      if (!kind || nt >= MAXT - 2) continue;
      const px = x + 0.5 + (((h >>> 4) % 5) - 2) * 0.09, pz = y + 0.5 + (((h >>> 7) % 5) - 2) * 0.09, base = top[ly * ws + lx];
      const sc = 0.8 + ((h >>> 10) % 8) * 0.06, ry = ((h >>> 13) % 16) * 0.39, vary = (((h >>> 17) % 7) - 3) * 0.035;
      switch (kind) {
        case 1: {
          const white = snowy || (season === 3 && T < 0.4);
          place(trunks, nt++, px, base, pz, 0.12, 0.35 * sc, 0.12, ry, [104, 72, 46], 0);
          place(pines, np++, px, base + 0.22 * sc, pz, sc, 1.15 * sc, sc, ry, white ? [222, 234, 244] : [56, 124, 88], vary);
          break;
        }
        case 2: case 3: {
          place(trunks, nt++, px, base, pz, 0.12, (kind === 3 ? 0.75 : 0.5) * sc, 0.12, ry, [118, 84, 54], 0);
          if (kind === 3 && nj < 7999) place(jungle, nj++, px, base + 0.85 * sc, pz, sc, sc, sc, ry, [34, 136, 66], vary);
          else if (kind === 2) place(leaves, nl++, px, base + 0.5 * sc + 0.36 * sc, pz, sc, sc, sc, ry, leafC, vary);
          break;
        }
        case 4:
          place(trunks, nt++, px, base, pz, 0.1, 0.85 * sc, 0.1, ry, [96, 76, 58], 0);
          place(trunks, nt++, px + 0.08, base + 0.5 * sc, pz, 0.06, 0.32 * sc, 0.06, ry, [96, 76, 58], 0, 0.7);
          break;
        case 5: place(rocks, nr++, px, base + 0.06, pz, sc * 0.75, sc * 0.48, sc * 0.65, ry, s === SO.BASALT ? [62, 58, 66] : snowy ? [226, 232, 240] : [150, 144, 138], vary); break;
        case 6: if (nc < 3999) place(cacti, nc++, px, base, pz, sc, sc, sc, ry, [86, 168, 90], vary); break;
        case 7: if (nb < 11999) place(bushes, nb++, px, base + 0.12, pz, 0.42 * sc, 0.32 * sc, 0.42 * sc, ry, s === SO.SAND ? [176, 160, 92] : leafC.map((c) => c * 0.85), vary); break;
        case 8: if (nf < 7999) place(flowers, nf++, px, base + 0.06, pz, 0.09, 0.09, 0.09, ry, s === SO.HOLY ? [255, 236, 140] : PETALS[(h >>> 8) % PETALS.length], 0); break;
      }
    }
    trunks.count = nt; pines.count = np; leaves.count = nl; jungle.count = nj; rocks.count = nr; cacti.count = nc; bushes.count = nb; flowers.count = nf;
    for (const m of [trunks, pines, leaves, jungle, rocks, cacti, bushes, flowers]) flag(m);
    floraClock = 0;
  }

  // ------------------------------------------------------------ buildings
  const STONE = 0x9c978f, STONE2 = 0x7f7a73, BEAM = 0x5e4130, WOOD = 0x8a6440, PLASTER = 0xe2d3b0, DOOR = 0x3a2618, GOLD = 0xe2b64c, WIN = 0xffd27a, SLIT = 0x1a1410;
  const modelCache = new Map(), cropMats = new Map();
  function roofOf(kc, v) { return hexOf([kc[0] * 0.55 + 70 + v * 6, kc[1] * 0.55 + 36 + v * 4, kc[2] * 0.55 + 26]); }
  function merlonRing(k, hex, y, r, n, size) {
    for (let q = 0; q < n; q++) { const a = (q / n) * Math.PI * 2; k.box(hex, Math.cos(a) * r, y, Math.sin(a) * r, size, size * 1.1, size, -a); }
  }
  function kitFor(type, kc, v) {
    const k = new Kit(), flagC = hexOf(kc), roof = roofOf(kc, v), smokes = [];
    switch (type) {
      case BT.HOUSE: {
        const wall = [PLASTER, 0xead9b6, 0xd8c39a][v];
        k.box(STONE2, 0, 0, 0, 1.56, 0.16, 1.42);
        k.box(wall, 0, 0.16, 0, 1.44, 0.8, 1.3);
        for (const sx of [-0.7, 0.7]) for (const sz of [-0.63, 0.63]) k.box(BEAM, sx, 0.16, sz, 0.09, 0.8, 0.09);
        k.box(BEAM, 0, 0.56, 0, 1.47, 0.06, 1.33);
        k.box(BEAM, 0, 0.92, 0, 1.5, 0.06, 1.36);
        k.prism(roof, 0, 0.96, 0, 1.8, 0.8, 1.6);
        k.box(shade(roof, 0.7), 0, 1.71, 0, 0.12, 0.08, 1.64);
        k.box(BEAM, 0.28, 0.16, 0.656, 0.38, 0.56, 0.02);
        k.box(DOOR, 0.28, 0.16, 0.668, 0.28, 0.48, 0.02);
        k.glow(WIN, -0.32, 0.34, 0.664, 0.22, 0.18, 0.02);
        k.box(0x4f6b45, -0.48, 0.32, 0.664, 0.07, 0.22, 0.02); k.box(0x4f6b45, -0.16, 0.32, 0.664, 0.07, 0.22, 0.02);
        k.box(0x8a5a3a, -0.32, 0.27, 0.69, 0.3, 0.05, 0.07); k.box([0xe57373, 0xffb74d, 0xba68c8][v], -0.32, 0.32, 0.7, 0.26, 0.05, 0.05);
        k.glow(WIN, 0.725, 0.36, -0.2, 0.02, 0.18, 0.22); k.glow(WIN, -0.725, 0.36, 0.2, 0.02, 0.18, 0.22);
        const cx = v === 1 ? -0.42 : 0.42;
        k.box(STONE, cx, 0.9, -0.34, 0.22, 1.05, 0.22); k.box(STONE2, cx, 1.95, -0.34, 0.28, 0.07, 0.28);
        smokes.push([cx, 2.05, -0.34]);
        break;
      }
      case BT.KEEP: {
        k.box(STONE2, 0, 0, 0, 3.75, 0.25, 3.75);
        for (const s of [-1.55, 1.55]) { k.box(STONE, 0, 0.25, s, 3.0, 1.3, 0.32); k.box(STONE, s, 0.25, 0, 0.32, 1.3, 3.0); }
        for (let q = 0; q < 6; q++) {
          const o = -1.25 + q * 0.5;
          for (const s of [-1.6, 1.6]) { if (!(s > 0 && Math.abs(o) < 0.5)) k.box(STONE, o, 1.55, s, 0.24, 0.24, 0.22); k.box(STONE, s, 1.55, o, 0.22, 0.24, 0.24); }
        }
        k.box(0xa8a39a, 0, 0.25, -0.25, 1.8, 2.0, 1.5);
        k.prism(roof, 0, 2.25, -0.25, 2.0, 0.85, 1.7);
        k.box(STONE, 0.5, 0.25, -0.5, 0.9, 3.1, 0.9);
        for (const sx of [0.13, 0.87]) for (const sz of [-0.87, -0.13]) k.box(STONE, sx, 3.35, sz, 0.18, 0.22, 0.18);
        for (const sx of [-1.55, 1.55]) for (const sz of [-1.55, 1.55]) {
          k.cyl(STONE2, sx, 0.25, sz, 0.95, 2.3, 0.95);
          k.cyl(shade(STONE2, 0.85), sx, 2.5, sz, 1.07, 0.14, 1.07);
          k.cone(roof, sx, 2.64, sz, 1.12, 1.15, 1.12);
          k.box(GOLD, sx, 3.75, sz, 0.05, 0.28, 0.05);
          k.glow(WIN, sx, 1.6, sz + (sz > 0 ? 0.48 : -0.48), 0.12, 0.22, 0.02);
        }
        k.box(STONE, 0, 0.25, 1.6, 1.05, 1.75, 0.55);
        for (const sx of [-0.4, 0, 0.4]) k.box(STONE, sx, 2.0, 1.6, 0.22, 0.22, 0.55);
        k.box(SLIT, 0, 0.25, 1.88, 0.52, 0.78, 0.02);
        for (const sx of [-0.16, 0, 0.16]) k.box(0x3d3d3d, sx, 0.3, 1.895, 0.025, 0.7, 0.01);
        for (const sx of [-0.38, 0.38]) { k.box(flagC, sx, 1.0, 1.885, 0.2, 0.72, 0.015); k.box(GOLD, sx, 1.68, 1.885, 0.22, 0.04, 0.02); }
        k.box(0x5d4037, 0.5, 3.35, -0.5, 0.06, 1.3, 0.06);
        k.box(flagC, 0.8, 4.2, -0.5, 0.56, 0.36, 0.04);
        for (const sx of [-0.55, 0.0]) k.glow(WIN, sx, 1.2, 0.51, 0.16, 0.28, 0.02);
        k.glow(WIN, 0.5, 2.6, -0.04, 0.14, 0.24, 0.02);
        smokes.push([-0.5, 3.0, -0.6]);
        break;
      }
      case BT.TEMPLE: {
        k.box(0xc9c2b2, 0, 0, 0, 2.95, 0.14, 2.95); k.box(0xd6d0c2, 0, 0.14, 0, 2.7, 0.14, 2.7); k.box(0xe2ddd0, 0, 0.28, 0, 2.45, 0.14, 2.45);
        k.box(0xefe9dc, 0, 0.42, -0.1, 1.5, 1.3, 1.5);
        for (const x of [-1.0, -0.33, 0.33, 1.0]) for (const z of [-1.0, 1.0]) { k.cyl(0xf6f2ea, x, 0.42, z, 0.22, 1.36, 0.22); k.box(0xe6e0d2, x, 1.74, z, 0.3, 0.07, 0.3); }
        for (const x of [-1.0, 1.0]) { k.cyl(0xf6f2ea, x, 0.42, 0, 0.22, 1.36, 0.22); k.box(0xe6e0d2, x, 1.74, 0, 0.3, 0.07, 0.3); }
        k.box(0xe9e4d8, 0, 1.8, 0, 2.4, 0.2, 2.35);
        k.box(GOLD, 0, 1.86, 0, 2.43, 0.06, 2.38);
        k.prism(GOLD, 0, 2.0, 0, 2.5, 0.78, 2.4);
        k.ico(GOLD, 0, 2.86, 1.2, 0.2, 0.2, 0.2); k.ico(GOLD, 0, 2.86, -1.2, 0.2, 0.2, 0.2);
        k.cyl(0xfff0b8, 0, 2.22, 1.21, 0.42, 0.04, 0.42, 0, Math.PI / 2);
        k.glow(0xffc46b, 0, 0.42, 0.66, 0.5, 0.86, 0.02);
        for (const x of [-0.75, 0.75]) { k.cyl(0x4e3a2a, x, 0.42, 1.32, 0.15, 0.34, 0.15); k.glow(0xff8a2c, x, 0.76, 1.32, 0.13, 0.1, 0.13); }
        break;
      }
      case BT.GRANARY: { // a raised store: clay silos on stone stilts, thatched
        k.box(STONE2, 0, 0, 0, 1.7, 0.12, 1.5);
        for (const sx of [-0.45, 0.45]) {
          for (const dz of [-0.3, 0.3]) k.box(STONE, sx + (dz > 0 ? 0.2 : -0.2), 0.12, dz, 0.14, 0.32, 0.14);
          k.cyl(0xc9a77a, sx, 0.44, 0, 0.78, 0.9, 0.78);
          k.cyl(shade(0xc9a77a, 0.82), sx, 0.78, 0, 0.8, 0.05, 0.8);
          k.cone(0xc8a660, sx, 1.34, 0, 0.92, 0.62, 0.92);
          k.box(DOOR, sx, 0.62, 0.38, 0.2, 0.26, 0.03);
        }
        k.box(BEAM, 0, 0.12, 0.62, 0.08, 0.6, 0.08, 0, 0.5);
        break;
      }
      case BT.TENT: { // hide tent on poles
        const hide = [0xb08a62, 0xa47c55, 0xbf9a70][v];
        k.cone(hide, 0, 0, 0, 0.9, 0.95, 0.9);
        for (const a of [0.4, 2.2, 4.1]) k.box(BEAM, Math.sin(a) * 0.08, 0.85, Math.cos(a) * 0.08, 0.04, 0.3, 0.04, a, 0.3);
        k.box(DOOR, 0, 0, 0.36, 0.22, 0.38, 0.03);
        break;
      }
      case BT.HEARTH: { // ring of stones and a fire
        for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; k.ico(STONE, Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32, 0.16, 0.12, 0.16); }
        for (const a of [0, 1.1, 2.2]) k.box(0x4a3020, 0, 0.06, 0, 0.42, 0.06, 0.06, a);
        k.glow(0xff9a3c, 0, 0.1, 0, 0.18, 0.22, 0.18); k.glow(0xffd27a, 0, 0.22, 0, 0.09, 0.16, 0.09);
        smokes.push([0, 0.5, 0]);
        break;
      }
      case BT.HUT: { // round wattle-and-daub hut with a thatched cone
        k.cyl(0xb59a74, 0, 0, 0, 1.45, 0.75, 1.45);
        k.cyl(shade(0xb59a74, 0.8), 0, 0.7, 0, 1.5, 0.06, 1.5);
        k.cone(0xc9a85e, 0, 0.74, 0, 1.75, 0.95, 1.75);
        k.box(DOOR, 0, 0, 0.7, 0.3, 0.5, 0.04);
        smokes.push([0, 1.75, 0]);
        break;
      }
      case BT.PEN: { // a fold of stakes and rails
        for (let q = 0; q < 12; q++) { const a = (q / 12) * Math.PI * 2; k.box(BEAM, Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3, 0.07, 0.5, 0.07); }
        for (let q = 0; q < 12; q++) { const a = ((q + 0.5) / 12) * Math.PI * 2; for (const y of [0.18, 0.38]) k.box(WOOD, Math.cos(a) * 1.3, y, Math.sin(a) * 1.3, 0.04, 0.04, 0.7, -a); }
        k.box(0x8a6a3a, 0.5, 0, -0.4, 0.5, 0.18, 0.3); // trough
        break;
      }
      case BT.MEGALITH: { // a stone circle with a trilithon
        for (let q = 0; q < 10; q++) { const a = (q / 10) * Math.PI * 2; k.box(q % 2 ? STONE : 0x8e8a84, Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25, 0.26, 1.0 + (q % 3) * 0.12, 0.18, -a); }
        for (const sx of [-0.32, 0.32]) k.box(0x8e8a84, sx, 0, 0, 0.26, 1.3, 0.24);
        k.box(STONE, 0, 1.3, 0, 0.95, 0.2, 0.28);
        k.box(0x7f7a73, 0, 0, 0.55, 0.5, 0.16, 0.3); // altar stone
        break;
      }
      case BT.SHRINE: { // a small ancestor shrine
        k.box(STONE2, 0, 0, 0, 0.8, 0.12, 0.8);
        k.box(0xd8c9a8, 0, 0.12, 0, 0.5, 0.5, 0.5);
        k.prism(roof, 0, 0.62, 0, 0.7, 0.32, 0.66);
        k.glow(0xffc46b, 0, 0.18, 0.26, 0.16, 0.22, 0.02);
        break;
      }
      case BT.HALL: { // a long timber hall for the headman's feasts
        k.box(STONE2, 0, 0, 0, 2.8, 0.12, 1.8);
        k.box(0x8a6440, 0, 0.12, 0, 2.6, 0.85, 1.5);
        for (const sx of [-1.25, -0.4, 0.4, 1.25]) for (const sz of [-0.72, 0.72]) k.box(BEAM, sx, 0.12, sz, 0.1, 0.85, 0.1);
        k.prism(0xb8964e, 0, 0.97, 0, 2.95, 1.0, 1.9);
        for (const sx of [-1.38, 1.38]) { k.box(BEAM, sx, 1.7, 0, 0.06, 0.4, 0.06, 0, 0.5); k.box(BEAM, sx, 1.7, 0, 0.06, 0.4, 0.06, 0, -0.5); }
        k.box(DOOR, 0, 0.12, 0.76, 0.4, 0.6, 0.03);
        k.box(flagC, 0.55, 0.5, 0.77, 0.36, 0.26, 0.02);
        k.glow(WIN, -0.7, 0.45, 0.76, 0.2, 0.14, 0.02);
        smokes.push([0, 2.0, 0]);
        break;
      }
      case BT.TOWER: {
        k.cyl(STONE2, 0, 0, 0, 1.5, 0.35, 1.5);
        k.cyl(STONE, 0, 0.35, 0, 1.25, 2.75, 1.25);
        k.cyl(STONE2, 0, 3.1, 0, 1.52, 0.22, 1.52);
        merlonRing(k, STONE, 3.32, 0.66, 8, 0.24);
        k.cone(roof, 0, 3.32, 0, 1.15, 1.1, 1.15);
        k.box(0x5d4037, 0, 4.35, 0, 0.05, 0.7, 0.05); k.box(flagC, 0.25, 4.82, 0, 0.42, 0.26, 0.03);
        for (const [a, y] of [[0, 1.1], [2.1, 1.6], [4.2, 2.2], [1.0, 2.6]]) k.box(SLIT, Math.sin(a) * 0.62, y, Math.cos(a) * 0.62, 0.06, 0.32, 0.03, a);
        k.box(DOOR, 0, 0.35, 0.6, 0.32, 0.55, 0.06);
        k.glow(WIN, 0, 2.55, 0.62, 0.14, 0.22, 0.02);
        break;
      }
      case BT.WALL: {
        const c = [0x8f8c88, 0x96928c, 0x88857f][v];
        k.box(c, 0, 0, 0, 1.0, 0.95, 0.75);
        k.box(shade(c, 0.8), 0, 0.95, 0, 1.02, 0.06, 0.78);
        for (const sx of [-0.28, 0.28]) for (const sz of [-0.28, 0.28]) k.box(c, sx, 1.0, sz, 0.28, 0.26, 0.18);
        for (const y of [0.3, 0.62]) for (const sz of [-0.38, 0.38]) k.box(shade(c, 0.78), 0, y, sz, 1.0, 0.025, 0.012);
        break;
      }
      case BT.FARM: {
        k.box(0x6e4f2e, 0, 0, 0, 2.9, 0.08, 2.9);
        for (let r = 0; r < 5; r++) k.box(0x553a20, 0, 0.08, -1.1 + r * 0.55, 2.75, 0.03, 0.18);
        for (const y of [0.16, 0.3]) { for (const s of [-1.42, 1.42]) { k.box(BEAM, 0, y, s, 2.9, 0.035, 0.035); k.box(BEAM, s, y, 0, 0.035, 0.035, 2.9); } }
        for (const sx of [-1.42, 0, 1.42]) for (const sz of [-1.42, 1.42]) k.box(BEAM, sx, 0, sz, 0.06, 0.38, 0.06);
        k.box(BEAM, 1.0, 0.08, 1.05, 0.05, 0.62, 0.05); k.box(0x9c6b3a, 1.0, 0.5, 1.05, 0.42, 0.05, 0.05);
        k.box(0x8a3b2e, 1.0, 0.36, 1.05, 0.16, 0.2, 0.1); k.ico(0xe2c27a, 1.0, 0.68, 1.05, 0.13, 0.13, 0.13); k.cone(0xb8913c, 1.0, 0.72, 1.05, 0.26, 0.14, 0.26);
        k.cyl(0xd9b45a, -0.8, 0.14, 1.12, 0.28, 0.4, 0.28, 0, 0, Math.PI / 2); k.cyl(0xcfa94e, -1.1, 0.14, 0.82, 0.28, 0.4, 0.28, 0, 0, Math.PI / 2);
        break;
      }
      case BT.MARKET: {
        k.box(0xc9bfae, 0, 0, 0, 2.9, 0.06, 2.9);
        for (let q = 0; q < 3; q++) {
          const x = -0.95 + q * 0.95, z = -0.25;
          for (const dx of [-0.36, 0.36]) for (const dz of [-0.55, 0.55]) k.box(BEAM, x + dx, 0.06, z + dz, 0.06, 0.95, 0.06);
          k.box(WOOD, x, 0.06, z + 0.42, 0.78, 0.38, 0.22);
          for (let s = 0; s < 4; s++) k.box(s % 2 ? 0xf6efe2 : flagC, x - 0.3 + s * 0.2, 1.0, z, 0.2, 0.05, 1.3, 0, 0.14);
          for (let s = 0; s < 3; s++) k.ico([0xe57373, 0xffd54f, 0x81c784, 0x9575cd][(q + s) % 4], x - 0.22 + s * 0.22, 0.5, z + 0.42, 0.15, 0.12, 0.15);
        }
        for (const [bx, bz] of [[1.15, 1.0], [0.85, 1.2]]) { k.cyl(0x7a4f2a, bx, 0.06, bz, 0.26, 0.36, 0.26); k.cyl(0x3b3b3b, bx, 0.3, bz, 0.27, 0.03, 0.27); }
        k.box(0x9c7448, -1.15, 0.06, 1.1, 0.3, 0.3, 0.3); k.box(0xa8805a, -1.15, 0.36, 1.1, 0.24, 0.24, 0.24);
        k.cyl(STONE, 0, 0.06, 0.95, 0.52, 0.32, 0.52); k.cyl(0x2c5c8a, 0, 0.36, 0.95, 0.4, 0.02, 0.4);
        for (const dx of [-0.24, 0.24]) k.box(BEAM, dx, 0.38, 0.95, 0.05, 0.55, 0.05);
        k.prism(roof, 0, 0.92, 0.95, 0.65, 0.3, 0.55);
        break;
      }
      case BT.MINE: {
        k.mound(0x7d7570, -0.1, 0.35, -0.25, 2.1, 1.4, 1.8); k.mound(0x8d857e, 0.55, 0.22, -0.55, 1.0, 0.9, 1.0);
        k.box(0x0e0a08, 0, 0, 0.5, 0.72, 0.8, 0.34);
        for (const sx of [-0.42, 0.42]) k.box(BEAM, sx, 0, 0.7, 0.1, 0.9, 0.1);
        k.box(BEAM, 0, 0.86, 0.7, 1.0, 0.1, 0.14);
        for (const sx of [-0.16, 0.16]) k.box(0x5f5f5f, sx, 0, 1.15, 0.035, 0.035, 0.95);
        for (let s = 0; s < 5; s++) k.box(BEAM, 0, 0, 0.75 + s * 0.2, 0.46, 0.02, 0.06);
        k.box(0x6d4c41, 0, 0.06, 1.25, 0.34, 0.2, 0.42); k.ico(0x9e9e9e, -0.05, 0.3, 1.22, 0.2, 0.12, 0.26); k.ico(GOLD, 0.08, 0.32, 1.3, 0.1, 0.08, 0.1);
        k.box(BEAM, 0.6, 0, 0.88, 0.05, 0.62, 0.05); k.glow(0xffc96b, 0.6, 0.6, 0.88, 0.1, 0.12, 0.1);
        break;
      }
      case BT.DOCK: {
        for (let p = 0; p < 6; p++) k.box(p % 2 ? WOOD : 0x9a7048, 0, 0, -0.85 + p * 0.34, 2.0, 0.1, 0.3);
        for (const sx of [-0.92, 0.92]) for (const sz of [-0.92, 0.92]) { k.cyl(0x5d4037, sx, -1.0, sz, 0.15, 1.25, 0.15); k.cyl(0x4a3328, sx, 0.25, sz, 0.17, 0.06, 0.17); }
        k.box(0x9c7448, 0.55, 0.1, 0.45, 0.3, 0.3, 0.3); k.cyl(0x7a4f2a, 0.15, 0.1, 0.55, 0.24, 0.32, 0.24);
        k.cyl(0xd8c8a0, -0.6, 0.1, -0.5, 0.26, 0.08, 0.26);
        break;
      }
      case BT.WORKSHOP: {
        k.box(STONE2, 0, 0, 0, 2.5, 0.12, 2.0);
        k.box(0x8c6a46, 0, 0.12, -0.15, 2.3, 1.0, 1.6);
        for (const sx of [-1.1, 1.1]) for (const sz of [-0.9, 0.6]) k.box(BEAM, sx, 0.12, sz, 0.09, 1.0, 0.09);
        k.prism(roof, 0, 1.12, -0.15, 2.55, 0.8, 1.8);
        k.box(DOOR, 0, 0.12, 0.66, 0.9, 0.8, 0.03);
        for (let s = 0; s < 3; s++) k.cyl(0x8a6440, -0.95 + s * 0.02, 0.12 + 0.12 + (s === 2 ? 0.2 : 0), 0.85 + (s === 1 ? 0.22 : 0), 0.22, 0.7, 0.22, 0, 0, Math.PI / 2);
        k.box(WOOD, 0.75, 0.12, 0.92, 0.45, 0.12, 0.6);
        for (const dz of [0.68, 1.16]) for (const dx of [0.5, 1.0]) k.cyl(0x3e2a1c, dx, 0.12, dz, 0.2, 0.06, 0.2, 0, 0, Math.PI / 2);
        k.box(BEAM, 0.75, 0.24, 0.92, 0.06, 0.72, 0.06, 0, -0.55);
        smokes.push([-0.7, 1.8, -0.6]);
        k.box(STONE, -0.7, 1.1, -0.6, 0.22, 0.65, 0.22);
        break;
      }
    }
    const out = k.done();
    out.smoke = smokes;
    return out;
  }
  const bladeGeo = () => {
    if (GEO.blades) return GEO.blades;
    const parts = [];
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
      const at = (x, y) => [x * c - y * s, x * s + y * c];
      const [sx, sy] = at(0, 0.62);
      parts.push({ geo: GEO.cbox, c: [94, 66, 50], x: sx, y: sy, z: 0, sx: 0.06, sy: 1.25, sz: 0.04, rz: a });
      const [px, py] = at(0.13, 0.72);
      parts.push({ geo: GEO.cbox, c: [244, 238, 224], x: px, y: py, z: 0.01, sx: 0.22, sy: 0.9, sz: 0.02, rz: a });
      for (let b = 0; b < 3; b++) { const [bx, by] = at(0.13, 0.4 + b * 0.3); parts.push({ geo: GEO.cbox, c: [120, 90, 64], x: bx, y: by, z: 0.025, sx: 0.26, sy: 0.03, sz: 0.01, rz: a }); }
    }
    GEO.blades = merge(parts);
    return GEO.blades;
  };
  const cropGeo = () => {
    if (GEO.crops) return GEO.crops;
    const parts = [];
    for (let r = 0; r < 5; r++) for (let s = 0; s < 5; s++) parts.push({ geo: GEO.box, c: [255, 255, 255], x: -1.1 + s * 0.55, y: 0.08, z: -1.1 + r * 0.55, sx: 0.46, sy: 1, sz: 0.24 });
    GEO.crops = merge(parts);
    return GEO.crops;
  };
  function cropMat(t) {
    const q = Math.round(t * 8);
    let m = cropMats.get(q);
    if (!m) { const u = q / 8; m = new THREE.MeshToonMaterial({ gradientMap: gradient, color: hexOf([104 + 130 * u, 168 + 32 * u, 60 + 20 * u]) }); cropMats.set(q, m); }
    return m;
  }
  function siteModel(b) {
    const g = new THREE.Group(), w = b.w * 0.86, d = b.h * 0.86, h = Math.min(2.4, 0.9 + b.w * 0.35);
    const k = new Kit();
    k.box(STONE2, 0, -2, 0, b.w * 0.92, 2.02, b.h * 0.92);
    k.box(0x9a7a52, 0, 0, 0, w, 0.06, d);
    for (const sx of [-w / 2, 0, w / 2]) for (const sz of [-d / 2, d / 2]) k.box(BEAM, sx, 0, sz, 0.07, h, 0.07);
    for (const sz of [-d / 2, d / 2]) for (const y of [h * 0.5, h]) k.box(BEAM, 0, y, sz, w, 0.05, 0.05);
    k.box(0xc89a5a, w / 2 + 0.15, 0.06, 0, 0.3, 0.06, d * 0.7); k.box(0xb88a4a, w / 2 + 0.15, 0.12, 0, 0.3, 0.06, d * 0.6);
    const kit = k.done();
    const lit = new THREE.Mesh(kit.lit, toonV); lit.castShadow = lit.receiveShadow = true; g.add(lit);
    const wall = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ gradientMap: gradient, color: 0xd2c3a0 }));
    wall.position.set(0, 0.06, 0); wall.scale.set(w * 0.9, 1, d * 0.9); wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    g.userData = { kd: b.kd, site: true, rise: wall, riseH: h * 0.9 };
    return g;
  }
  function model(b) {
    if (b.prog < 1) return siteModel(b);
    const kn = Civ.kingdoms[b.kd], kc = kn ? kn.color : [150, 150, 150], v = b.id % 3;
    const key = `${b.type}|${b.kd}|${v}`;
    let kit = modelCache.get(key);
    if (!kit) {
      kit = kitFor(b.type, kc, v);
      const fk = new Kit(); fk.box(STONE2, 0, -2, 0, b.w * 0.92, 2.02, b.h * 0.92); // foundation hides any slope underneath
      kit.base = fk.done().lit;
      modelCache.set(key, kit);
    }
    const g = new THREE.Group();
    const lit = new THREE.Mesh(kit.lit, toonV); lit.castShadow = lit.receiveShadow = true; g.add(lit);
    const base = new THREE.Mesh(kit.base, toonV); base.receiveShadow = true; g.add(base);
    if (kit.glow) g.add(new THREE.Mesh(kit.glow, glowV));
    g.userData = { kd: b.kd, smoke: kit.smoke };
    if (b.type === BT.FARM) { const crops = new THREE.Mesh(cropGeo(), cropMat(b.growth)); crops.castShadow = true; g.add(crops); g.userData.crops = crops; }
    if (b.type === BT.HOUSE || b.type === BT.WALL || b.type === BT.TENT || b.type === BT.HUT || b.type === BT.HALL || b.type === BT.SHRINE) g.rotation.y = ((b.id >>> 2) % 4) * (Math.PI / 2);
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
        g.updateMatrixWorld();
        if (g.userData.rise) g.userData.rise.scale.y = Math.max(0.05, b.prog * g.userData.riseH);
        if (g.userData.crops) { g.userData.crops.material = cropMat(b.growth); g.userData.crops.scale.y = 0.06 + b.growth * 0.3; }
        seen.add(b.id);
      }
    }
    for (const [id, g] of groups) if (!seen.has(id)) { scene.remove(g); groups.delete(id); }
  }

  // ------------------------------------------------------------ creatures
  const CARGO = [[150, 110, 66], [120, 190, 70], [150, 104, 60], [160, 160, 160], [180, 100, 70], [250, 210, 70], [110, 220, 255]];
  function updateUnits(alpha, t) {
    let np = 0, nh = 0, nhat = 0, nb = 0, nprop = 0;
    const x1 = wx0 + ws, y1 = wy0 + ws, PM = MAXU * 2 - 4;
    const prop = (x, y, z, sx, sy, sz, ry, rgb, roll) => { if (nprop < PM) place(props, nprop++, x, y, z, sx, sy, sz, ry, rgb, 0, roll); };
    for (let i = 0; i < U.hi && np < MAXU - 1 && nb < MAXU - 1 && nh < MAXU - 1; i++) {
      if (!U.alive[i] || U.layer[i] === 0) continue;
      const x = U.px[i] + (U.x[i] - U.px[i]) * alpha, y = U.py[i] + (U.y[i] - U.py[i]) * alpha;
      if (x < wx0 || y < wy0 || x >= x1 || y >= y1) continue;
      const sp = U.sp[i], d = SPECIES[sp], ry = Math.atan2(U.fx[i], U.fy[i]);
      const g = V.groundAt(x, y), moving = U.st[i] === 1 || U.st[i] === 3 || (U.flags[i] & FL.POSSESSED);
      const step = U.anim[i] * 3, bob = moving ? Math.abs(Math.sin(step)) * 0.05 : 0, wob = moving ? Math.sin(step) * 0.1 : 0;
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
      const kc = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]].color : [170, 170, 170];
      switch (d.kind) {
        case 'civ': case 'avatar': case 'monster': {
          if (sp === SP.WYRM) {
            const lift = 6 + Math.sin(t * 2 + i) * 0.3, flap = Math.sin(t * 5 + i);
            prop(x, g + lift, y, 0.5, 0.36, 1.5, ry, d.fur);
            prop(x + fx * 0.85, g + lift + 0.1, y + fz * 0.85, 0.28, 0.26, 0.42, ry, [170, 36, 36]);
            prop(x - fx * 1.05, g + lift + 0.05, y - fz * 1.05, 0.14, 0.12, 0.7, ry, [150, 30, 30]);
            for (const side of [-1, 1]) prop(x + rx * side * 0.95, g + lift + 0.2 + flap * 0.35 * side * side, y + rz * side * 0.95, 1.5, 0.05, 0.75, ry, [140, 28, 28], -side * flap * 0.5);
            break;
          }
          if (sp === SP.CRAWLER) break;
          const civ = d.kind === 'civ', child = U.job[i] === J.CHILD && civ;
          const k = FIG * (child ? 0.7 : 1) * (sp === SP.HERALD ? 1.5 : 1) * (0.92 + (U.genes[i * NG + G.STAT] / 255) * 0.2);
          const cloth = !civ ? (sp === SP.HOLLOW ? [110, 122, 104] : d.fur) : U.job[i] === J.PRIEST ? [238, 234, 222] : kc;
          place(people, np++, x, g + bob, y, k, k, k, ry, cloth, 0, wob);
          const hy = g + bob + 0.36 * k;
          place(heads, nh++, x, hy, y, 0.15 * k, 0.15 * k, 0.15 * k, ry, sp === SP.HOLLOW ? [170, 200, 160] : d.skin || d.fur, 0);
          if (civ && U.flags[i] & FL.KING) place(hats, nhat++, x, hy + 0.05 * k, y, 0.13 * k, 0.1 * k, 0.13 * k, ry, [255, 214, 90], 0);
          else if (civ && (U.job[i] === J.SOLDIER || U.sq[i] >= 0)) {
            place(hats, nhat++, x, hy + 0.02 * k, y, 0.17 * k, 0.1 * k, 0.17 * k, ry, [176, 182, 192], 0);
            prop(x + rx * 0.14 * k, g + bob + 0.05, y + rz * 0.14 * k, 0.025, 0.62 * k, 0.025, ry, [150, 120, 84]);
            prop(x + rx * 0.14 * k, g + bob + 0.66 * k, y + rz * 0.14 * k, 0.05, 0.08, 0.05, ry, [210, 214, 222]);
          } else if (civ && U.job[i] === J.PRIEST) place(hats, nhat++, x, hy - 0.02 * k, y, 0.18 * k, 0.16 * k, 0.18 * k, ry, [238, 234, 222], 0);
          else if (sp === SP.HERALD) place(hats, nhat++, x, hy + 0.04, y, 0.2, 0.06, 0.2, ry, [255, 236, 150], 0);
          if (civ && U.carry[i]) prop(x - fx * 0.1 * k, g + bob + 0.18 * k, y - fz * 0.1 * k, 0.1 * k, 0.1 * k, 0.08 * k, ry, CARGO[U.carry[i]]);
          break;
        }
        case 'animal': {
          const k = FIG * (sp === SP.WOLF ? 0.9 : 1.05);
          place(beasts, nb++, x, g + bob * 0.5, y, k, k, k, ry, d.fur, 0, wob * 0.5);
          if (sp === SP.DEER && U.sex[i]) for (const side of [-1, 1]) prop(x + fx * 0.25 * k + rx * side * 0.04, g + 0.36 * k, y + fz * 0.25 * k + rz * side * 0.04, 0.02, 0.14, 0.02, ry, [214, 196, 160], side * 0.4);
          break;
        }
        case 'ambient': {
          const flap = Math.sin(t * 12 + i), lift = g + 4 + Math.sin(t + i) * 0.4;
          prop(x, lift, y, 0.06, 0.05, 0.14, ry, d.fur);
          for (const side of [-1, 1]) prop(x + rx * side * 0.1, lift + flap * 0.04, y + rz * side * 0.1, 0.16, 0.015, 0.08, ry, d.fur, -side * flap * 0.6);
          break;
        }
        case 'vehicle': {
          if (sp === SP.SHIP) {
            const w = Math.max(g, 0) + Math.sin(t * 2 + i) * 0.03, rock = Math.sin(t * 1.6 + i) * 0.05;
            const S = 1.6;
            prop(x, w - 0.1 * S, y, 0.42 * S, 0.22 * S, 0.95 * S, ry, [128, 88, 52], rock);
            prop(x + fx * 0.45 * S, w - 0.05 * S, y + fz * 0.45 * S, 0.3 * S, 0.17 * S, 0.18 * S, ry, [116, 78, 46], rock);
            prop(x - fx * 0.38 * S, w + 0.08 * S, y - fz * 0.38 * S, 0.4 * S, 0.12 * S, 0.2 * S, ry, [150, 108, 66], rock); // stern cabin
            prop(x, w + 0.12 * S, y, 0.04 * S, 0.85 * S, 0.04 * S, ry, [94, 66, 44]);
            prop(x, w + 0.3 * S, y, 0.5 * S, 0.55 * S, 0.03 * S, ry, kc.map((c) => Math.min(255, c * 0.6 + 100)), rock);
            prop(x - fx * 0.08 * S, w + 0.84 * S, y - fz * 0.08 * S, 0.02, 0.1 * S, 0.16 * S, ry, kc); // pennant
          } else if (sp === SP.AIRSHIP) {
            const lift = 5 + Math.sin(t + i) * 0.2;
            place(heads, nh++, x, g + lift + 0.4, y, 0.8, 0.6, 1.5, ry, kc, 0);
            prop(x, g + lift - 0.3, y, 0.3, 0.2, 0.55, ry, [120, 84, 52]);
            prop(x - fx * 0.75, g + lift + 0.4, y - fz * 0.75, 0.04, 0.4, 0.3, ry, kc.map((c) => c * 0.6));
          } else if (sp === SP.CATAPULT) {
            prop(x, g + 0.08, y, 0.42, 0.14, 0.6, ry, [140, 100, 62]);
            for (const side of [-1, 1]) for (const fb of [-0.2, 0.2]) prop(x + rx * side * 0.23 + fx * fb, g, y + rz * side * 0.23 + fz * fb, 0.04, 0.18, 0.18, ry, [62, 42, 28]);
            prop(x - fx * 0.12, g + 0.2, y - fz * 0.12, 0.05, 0.6, 0.05, ry, [110, 78, 50], 0);
          } else {
            prop(x, g + 0.1, y, 0.34, 0.2, 0.52, ry, [140, 100, 62]);
            for (const side of [-1, 1]) prop(x + rx * side * 0.2, g, y + rz * side * 0.2, 0.04, 0.2, 0.2, ry, [62, 42, 28]);
            prop(x, g + 0.3, y, 0.28, 0.16, 0.34, ry, CARGO[U.carry[i]] || CARGO[0]);
            place(beasts, nb++, x + fx * 0.55, g, y + fz * 0.55, 0.9, 0.9, 0.9, ry, [120, 90, 60], 0, wob * 0.5); // the ox pulling it
          }
          break;
        }
      }
    }
    people.count = np; heads.count = nh; hats.count = nhat; beasts.count = nb; props.count = nprop;
    for (const m of [people, heads, hats, beasts, props]) flag(m);
    V.stats.creatures = np + nb;
  }

  // ------------------------------------------------------------ chimney smoke
  const sp3 = THREE ? new THREE.Vector3() : null;
  function updateSmoke(t) {
    let n = 0;
    const wx = Sky.wind.x, wz = Sky.wind.y;
    for (const g of groups.values()) {
      const list = g.userData.smoke;
      if (!list || !list.length) continue;
      for (let c = 0; c < list.length && n < MAXSMOKE - 4; c++) {
        sp3.set(list[c][0], list[c][1], list[c][2]); g.localToWorld(sp3);
        for (let k = 0; k < 4; k++) {
          const age = (t * 0.32 + k / 4 + (g.id % 7) * 0.13) % 1;
          const s = 0.1 + age * 0.3;
          place(smoke, n++, sp3.x + wx * age * 1.6, sp3.y + age * 1.5, sp3.z + wz * age * 1.6, s, s * 0.85, s, age * 3, [236 - age * 40, 236 - age * 40, 240 - age * 30], 0);
        }
      }
    }
    smoke.count = n; flag(smoke);
  }

  // ------------------------------------------------------------ clouds
  // Puffs sit on a lattice that scrolls with the 2D cloud field, so clouds drift smoothly and
  // line up with the shadows and weather of the flat map.
  const latDens = new Float32Array(80 * 80), latDark = new Float32Array(80 * 80);
  let latU0 = 0, latV0 = 0, latN = 0, latClock = 99;
  function cloudLattice() {
    const sx = Sky.offX * 0.25, sy = Sky.offY * 0.25;
    latU0 = Math.floor(wx0 / 4 + sx) - 2; latV0 = Math.floor(wy0 / 4 + sy) - 2; latN = Math.min(80, Math.ceil(ws / 4) + 5);
    const humid = 0.56 - (Sky.season() === 1 ? -0.03 : Sky.season() === 3 ? 0.03 : 0);
    for (let b = 0; b < latN; b++) for (let a = 0; a < latN; a++) {
      const u = latU0 + a, v = latV0 + b, j = b * latN + a;
      let d = AG.smooth(humid, humid + 0.2, Sky.noise.fbm(u * 0.06, v * 0.06, 4)) * 0.6, dk = 0;
      const X = (u - sx) * 4 + 2, Z = (v - sy) * 4 + 2;
      for (const s of Sky.storms) {
        const def = Sky.STORMS[s.type]; if (!def.dens) continue;
        const r = Math.sqrt(AG.dist2(X, Z, s.x, s.y)) / (s.r * 1.25); if (r >= 1) continue;
        const f = (1 - r * r) * s.k; d += def.dens * f; dk += def.dark * f;
      }
      latDens[j] = Math.min(1, d); latDark[j] = Math.min(1, dk);
    }
    latClock = 0;
  }
  // Clouds fade out as the camera sinks toward them, and part around the point you are looking
  // at (the spot where your line of sight crosses the cloud deck), so a storm frames the view
  // instead of hiding it.
  function updateClouds(dt, dist) {
    const camH = camera.position.y;
    // looking straight down at 8x the 2D map shows clouds at about 10%, so ramp up with the tilt
    const ramp = 0.1 + 0.82 * AG.smooth(0.05, 0.6, V.tilt);
    const op = ramp * Math.min(AG.clamp((camH - CLOUD_Y - 4) / 16, 0, 1), AG.clamp(1.4 - (R.cam.z - ENTER) / 12, 0, 1));
    clouds.visible = op > 0.03;
    clouds.material.opacity = op;
    clouds.castShadow = op > 0.4;
    if (!clouds.visible) { clouds.count = 0; return; }
    if ((latClock += dt) > 0.4) cloudLattice();
    let hx = target.x, hz = target.z;
    if (camH > CLOUD_Y + 0.5) {
      const f = (camH - CLOUD_Y) / Math.max(0.01, camH - target.y);
      hx = camera.position.x + (target.x - camera.position.x) * f; hz = camera.position.z + (target.z - camera.position.z) * f;
    }
    const hole = dist * 0.17 * V.tilt / 1.1, hole2 = hole * 2.2;
    const sx = Sky.offX * 0.25, sy = Sky.offY * 0.25, day = Sky.daylight();
    let n = 0;
    for (let b = 0; b < latN; b++) for (let a = 0; a < latN; a++) {
      const j = b * latN + a, d = latDens[j];
      if (d < 0.3) continue;
      const u = latU0 + a, v = latV0 + b, h = hash(u, v), X = (u - sx) * 4 + 2, Z = (v - sy) * 4 + 2;
      if (X < wx0 - 6 || Z < wy0 - 6 || X > wx0 + ws + 6 || Z > wy0 + ws + 6) continue;
      const r = Math.sqrt((X - hx) * (X - hx) + (Z - hz) * (Z - hz)), part = hole > 0.5 ? AG.smooth(hole, hole2, r) : 1;
      if (part < 0.12) continue;
      const puffs = 1 + (d > 0.5 ? 1 : 0) + (d > 0.72 ? 1 : 0), g = 255 - Math.min(1, latDark[j] * 1.5) * 150, nightK = 0.35 + 0.65 * day;
      for (let k = 0; k < puffs && n < MAXC; k++) {
        const hk = hash(h, k), w = (2.3 + d * 2.6 + (hk & 7) * 0.18) * part;
        place(clouds, n++, X + (((hk >>> 3) % 9) - 4) * 0.35, CLOUD_Y + k * 0.55 + ((hk >>> 7) % 5) * 0.25 - latDark[j] * 3, Z + (((hk >>> 11) % 9) - 4) * 0.35,
          w, (1.1 + d * 1.3) * (0.4 + 0.6 * part), w * (0.75 + ((hk >>> 15) % 5) * 0.08), ((hk >>> 17) % 12) * 0.5, [g * nightK, g * nightK, (g + 8) * nightK], 0);
      }
    }
    clouds.count = n; flag(clouds);
  }

  // ------------------------------------------------------------ rain, snow, lightning
  const dx = new Float32Array(MAXDROP), dy = new Float32Array(MAXDROP), dz = new Float32Array(MAXDROP), dkind = new Uint8Array(MAXDROP);
  let dropN = 0;
  // Drops fall only in the patch of the window around the camera target, so the closer you zoom
  // the denser the rain gets. Each drop is respawned at the top when it lands.
  function updatePrecip(dt, dist) {
    const half = Math.min(ws / 2, dist * 0.75 + 6);
    const fx0 = Math.max(wx0, target.x - half), fz0 = Math.max(wy0, target.z - half);
    const fx1 = Math.min(wx0 + ws, target.x + half) - 0.01, fz1 = Math.min(wy0 + ws, target.z + half) - 0.01;
    const vis = [];
    for (const s of Sky.storms) {
      if (s.type === 'heat' || s.k < 0.1) continue;
      if (s.x + s.r < fx0 || s.x - s.r > fx1 || s.y + s.r < fz0 || s.y - s.r > fz1) continue;
      vis.push(s);
    }
    // how much of the patch is under a storm (8x8 samples)
    let cover = 0;
    if (vis.length) for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) {
      const x = fx0 + ((a + 0.5) / 8) * (fx1 - fx0), z = fz0 + ((b + 0.5) / 8) * (fz1 - fz0);
      let k = 0;
      for (const s of vis) if (AG.dist2(x, z, s.x, s.y) < s.r * s.r) k = Math.max(k, s.k);
      cover += k / 64;
    }
    const want = Math.min(MAXDROP, Math.round(MAXDROP * cover));
    const spawn = (k) => {
      for (let tries = 0; tries < 12; tries++) {
        const x = fx0 + Math.random() * (fx1 - fx0), z = fz0 + Math.random() * (fz1 - fz0);
        let s = null;
        for (const q of vis) if (AG.dist2(x, z, q.x, q.y) < q.r * q.r) { s = q; break; }
        if (!s && tries < 11) continue;
        dx[k] = x; dz[k] = z;
        const i = (z | 0) * W + (x | 0), st = s || vis[0];
        dkind[k] = st.type === 'acid' ? 2 : st.type === 'blizzard' || Wd.T(i) < 0.22 ? 1 : 0;
        return;
      }
    };
    while (dropN < want) { spawn(dropN); dy[dropN] = V.groundAt(dx[dropN], dz[dropN]) + Math.random() * (CLOUD_Y - 2); dropN++; }
    if (dropN > want) dropN = want;
    const rp = rain.geometry.attributes.position.array, spos = snow.geometry.attributes.position.array, wxv = Sky.wind.x, wzv = Sky.wind.y;
    let nr = 0, ns = 0;
    for (let k = 0; k < dropN; k++) {
      const flake = dkind[k] === 1;
      dy[k] -= dt * (flake ? 2.6 : 30);
      dx[k] += wxv * dt * (flake ? 1.5 : 3); dz[k] += wzv * dt * (flake ? 1.5 : 3);
      if (flake) { dx[k] += Math.sin(dy[k] * 1.7 + k) * dt * 0.4; dz[k] += Math.cos(dy[k] * 1.3 + k) * dt * 0.3; }
      if (dy[k] < V.groundAt(dx[k], dz[k]) || dx[k] < fx0 - 2 || dz[k] < fz0 - 2 || dx[k] > fx1 + 2 || dz[k] > fz1 + 2) {
        spawn(k); dy[k] = CLOUD_Y - 2 - Math.random() * 3;
      }
      if (flake) { spos[ns * 3] = dx[k]; spos[ns * 3 + 1] = dy[k]; spos[ns * 3 + 2] = dz[k]; ns++; }
      else {
        const o = nr * 6;
        rp[o] = dx[k]; rp[o + 1] = dy[k]; rp[o + 2] = dz[k];
        rp[o + 3] = dx[k] - wxv * 0.14; rp[o + 4] = dy[k] + 1.1; rp[o + 5] = dz[k] - wzv * 0.14;
        nr++;
      }
    }
    rain.geometry.setDrawRange(0, nr * 2); rain.geometry.attributes.position.needsUpdate = true; rain.visible = nr > 0;
    snow.geometry.setDrawRange(0, ns); snow.geometry.attributes.position.needsUpdate = true; snow.visible = ns > 0;
    rain.material.color.setHex(vis.some((s) => s.type === 'acid') ? 0xc8ff7a : 0xc4d8f0);
  }
  const up = THREE ? new THREE.Vector3(0, 1, 0) : null, segDir = THREE ? new THREE.Vector3() : null;
  const boltCol = THREE ? new THREE.Color() : null;
  function updateBolts(t) {
    let n = 0;
    for (const s of Sky.strikes) {
      if (s.x < wx0 || s.y < wy0 || s.x >= wx0 + ws || s.y >= wy0 + ws) continue;
      let seed = s.seed;
      const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
      const gy = V.groundAt(s.x, s.y);
      let px = s.x + rr() * 4, py = CLOUD_Y, pz = s.y + rr() * 4;
      for (let k = 1; k <= 9 && n < 119; k++) {
        const f = k / 9, nx = k === 9 ? s.x : s.x + (px - s.x) * 0.5 + rr() * 1.6 * (1 - f), ny = CLOUD_Y + (gy - CLOUD_Y) * f, nz = k === 9 ? s.y : s.y + (pz - s.y) * 0.5 + rr() * 1.6 * (1 - f);
        segDir.set(nx - px, ny - py, nz - pz);
        const len = segDir.length(); segDir.normalize();
        dummy.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
        dummy.quaternion.setFromUnitVectors(up, segDir);
        dummy.scale.set(0.14 * (s.t / 9) + 0.04, len, 0.14 * (s.t / 9) + 0.04);
        dummy.updateMatrix(); bolts.setMatrixAt(n, dummy.matrix);
        const fl = 0.75 + 0.25 * Math.sin(t * 60 + k);
        bolts.setColorAt(n++, boltCol.setRGB(0.9 * fl + 0.1, 0.94 * fl + 0.06, 1));
        px = nx; py = ny; pz = nz;
      }
    }
    dummy.quaternion.identity();
    bolts.count = n; flag(bolts);
  }

  // ------------------------------------------------------------ sky, light, camera
  const SKY_DAY = [148, 196, 236], SKY_HAZE = [196, 222, 240], SKY_DUSK = [244, 164, 112], SKY_NIGHT = [10, 18, 36], STORM = [104, 112, 126];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  let lastSky = '';
  function lighting(dist) {
    const day = Sky.daylight(), sh = Sky.sunHeight(), sd = Sky.sunDir();
    const dusk = Math.max(0, 1 - Math.abs(sh) / 0.35) * (day > 0.05 ? 1 : 0);
    const ci = AG.clamp((R.cam.y / 4) | 0, 0, Sky.CLH - 1) * Sky.CLW + AG.clamp((R.cam.x / 4) | 0, 0, Sky.CLW - 1);
    const gloom = Math.min(1, Sky.dark[ci] * 1.3); // under a storm the light goes grey
    let zen = mix(SKY_NIGHT, SKY_DAY, day), hor = mix(SKY_NIGHT, SKY_HAZE, day);
    zen = mix(zen, SKY_DUSK, dusk * 0.45); hor = mix(hor, SKY_DUSK, dusk * 0.75);
    zen = mix(zen, STORM.map((c) => c * (0.3 + 0.7 * day)), gloom * 0.7); hor = mix(hor, STORM.map((c) => c * (0.3 + 0.7 * day)), gloom * 0.7);
    const key = css(zen) + css(hor);
    if (key !== lastSky) {
      const g = skyCtx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, css(zen)); g.addColorStop(1, css(hor));
      skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, 2, 128); skyTex.needsUpdate = true; lastSky = key;
    }
    scene.fog.color.setRGB(hor[0] / 255, hor[1] / 255, hor[2] / 255);
    scene.fog.near = dist * (1.3 - gloom * 0.7); scene.fog.far = dist * (3.4 - gloom * 1.6) + 80 - gloom * 40; // rain haze under storms
    const warm = mix([255, 244, 224], [255, 170, 110], dusk);
    sun.color.setRGB(warm[0] / 255, warm[1] / 255, warm[2] / 255);
    sun.intensity = (0.1 + 0.5 * day) * (1 - gloom * 0.6);
    hemi.intensity = (0.26 + 0.44 * day) * (1 - gloom * 0.25) + Sky.flash * 1.4; // lightning lights everything up
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
  // Adaptive quality: when the 3D view runs slowly (a weak or busy graphics card), render fewer
  // pixels and lighter shadows; step back up when there is headroom again.
  const Q = { level: 0, ema: 60, last: 0, since: 0 };
  V.quality = Q;
  function applyQuality() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), ratio = [dpr, Math.min(dpr, 1), 0.75, 0.55][Q.level];
    renderer.setPixelRatio(ratio);
    const r = el.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    const ms = Q.level >= 1 ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    sun.castShadow = Q.level < 2;                          // level 2+: no shadow pass at all
    bushes.visible = flowers.visible = Q.level < 3;        // level 3: the smallest plants go
  }
  function adaptQuality(t) {
    const real = Q.prev ? t - Q.prev : 0; Q.prev = t; // the real time between 3D frames (not the game's capped step)
    if (Q.lock) return; // (screenshots and benchmarks pin a level)
    if (t - Q.since < 1.5 || real <= 0) return; // the first moments after entering include building the scene
    Q.ema = Q.ema * 0.7 + Math.min(120, 1 / real) * 0.3;
    if (Q.level < (V.minQuality || 0)) { Q.level = V.minQuality; Q.last = t; applyQuality(); }
    if (Q.ema < 22 && Q.level < 3 && t - Q.last > 0.8) { Q.level++; Q.last = t; applyQuality(); }
    else if (Q.ema > 52 && Q.level > (V.minQuality || 0) && t - Q.last > 8) { Q.level--; Q.last = t; applyQuality(); }
  }
  V.setQuality = function (level) { Q.level = AG.clamp(level | 0, 0, 3); Q.last = performance.now() / 1000; applyQuality(); };
  V.render = function (dt, alpha) {
    const t = performance.now() / 1000;
    frameN++;
    adaptQuality(t);
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
    const dist = placeCamera();
    updateUnits(alpha, t);
    if (frameN % 2 === 0) updateSmoke(t);
    updateClouds(dt, dist);
    updatePrecip(Math.min(dt, 0.1), dist);
    updateBolts(t);
    lighting(dist);
    updateSea(t, dt);
    renderer.render(scene, camera);
    V.stats.window = ws; V.stats.triangles = renderer.info.render.triangles; V.stats.calls = renderer.info.render.calls; V.stats.quality = Q.level;
    V.stats.clouds = clouds.visible ? clouds.count : 0; V.stats.drops = dropN;
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
