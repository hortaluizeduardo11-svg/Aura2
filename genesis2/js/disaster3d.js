/* Real-time meteor flight, terrain-conforming targets and pooled impact effects.
 * All effects use the same God.meteors / God.impacts state as the world simulation. */
'use strict';
(function () {
  const AG = window.AG, T = window.THREE;
  if (!T) return;
  const D = AG.Disaster3D = {};
  let root, core, flame, debris, dust, rings, lights;
  const MAX_FLIGHTS = 48, MAX_IMPACTS = 12, SEGMENTS = 80;
  const obj = new T.Object3D(), color = new T.Color(), point = new T.Vector3();
  const counters = {};
  function pool(geometry, material, count) {
    const mesh = new T.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.setColorAt(0, color.setHex(0xffffff));
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0;
    root.add(mesh); return mesh;
  }
  function init(scene) {
    root = new T.Group(); scene.add(root);
    const rock = new T.IcosahedronGeometry(1, 1);
    // Irregular rock facets make the incoming body read as stone inside the fire.
    const pos = rock.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i);
      const k = 0.9 + 0.12 * Math.sin(point.x * 7 + point.y * 11 + point.z * 5);
      pos.setXYZ(i, point.x * k, point.y * k, point.z * k);
    }
    rock.computeVertexNormals();
    core = pool(rock, new T.MeshStandardMaterial({ color: 0x67504a, roughness: 0.95, emissive: 0xff3905, emissiveIntensity: 0.65, flatShading: true }), MAX_FLIGHTS);
    core.castShadow = true;
    flame = pool(new T.IcosahedronGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }), MAX_FLIGHTS * 20 + MAX_IMPACTS * 18);
    debris = pool(new T.DodecahedronGeometry(1, 0), new T.MeshLambertMaterial(), MAX_IMPACTS * 72);
    debris.castShadow = true;
    dust = pool(new T.IcosahedronGeometry(1, 1), new T.MeshLambertMaterial({ transparent: true, opacity: 0.24, depthWrite: false }), MAX_IMPACTS * 28);
    const geo = new T.BufferGeometry(), vertices = new Float32Array((MAX_FLIGHTS + MAX_IMPACTS + 1) * SEGMENTS * 6);
    geo.setAttribute('position', new T.BufferAttribute(vertices, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(vertices.length), 3).setUsage(T.DynamicDrawUsage));
    rings = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    rings.frustumCulled = false; root.add(rings);
    // The lights exist in the scene only while something burns: a light at zero brightness still
    // costs every lit surface on every frame. Both shader variants are compiled up front (prewarm).
    lights = Array.from({ length: 4 }, () => { const l = new T.PointLight(0xff792b, 0, 45, 2); l.visible = false; root.add(l); return l; });
  }
  function put(mesh, x, y, z, sx, sy, sz, hex, rotation = 0) {
    const n = counters[mesh.id] || 0;
    if (n >= mesh.instanceMatrix.count) return;
    obj.position.set(x, y, z); obj.scale.set(sx, sy, sz); obj.rotation.set(rotation * 0.7, rotation, rotation * 0.3); obj.updateMatrix();
    mesh.setMatrixAt(n, obj.matrix); mesh.setColorAt(n, color.setHex(hex)); counters[mesh.id] = n + 1;
  }
  function ring(x, z, r, hex, dashed, lift = 0.12) {
    const p = rings.geometry.attributes.position.array, c = rings.geometry.attributes.color.array;
    color.setHex(hex);
    for (let k = 0; k < SEGMENTS; k++) {
      if (dashed && k % 5 === 4) continue;
      for (let j = 0; j < 2; j++) {
        const a = (k + j) / SEGMENTS * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const i = counters.ring++ * 3;
        p[i] = px; p[i + 1] = AG.View3D.groundAt(px, pz) + lift; p[i + 2] = pz;
        c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b;
      }
    }
  }
  // Accelerating descent. Both endpoints are world coordinates; orbiting never
  // changes the target or the trajectory, and the final point is exactly x/y.
  D.position = function (m, u, out) {
    u = AG.clamp(u, 0, 1);
    const p = 0.25 * u + 0.75 * u * u, remain = 1 - p;
    const h = AG.View3D.groundAt(m.x, m.y);
    return out.set(m.x - 22 * remain, h + 46 * remain, m.y - 14 * remain);
  };
  D.reset = function () {
    if (!root) return;
    for (const m of [core, flame, debris, dust]) m.count = 0;
    rings.geometry.setDrawRange(0, 0); lights.forEach(l => { l.intensity = 0; l.visible = false; });
  };
  // Compile the scene's shaders with the meteor lights on (the caller compiles them off).
  D.prewarm = function (scene, compile) {
    if (!root) init(scene);
    lights.forEach(l => { l.visible = true; });
    compile();
    lights.forEach(l => { l.visible = false; });
  };
  D.render = function (scene, time, quality) {
    if (!root) init(scene);
    for (const m of [core, flame, debris, dust]) counters[m.id] = 0;
    counters.ring = 0; lights.forEach(l => { l.intensity = 0; });
    let light = 0;
    const flights = AG.God.meteors.slice(-MAX_FLIGHTS);
    for (const m of flights) {
      const u = AG.clamp(m.t / m.T, 0, 1), size = Math.max(0.45, Math.min(2.6, m.r * 0.17));
      D.position(m, u, point);
      put(core, point.x, point.y, point.z, size, size * 1.15, size, 0xffffff, u * 8);
      if (light < lights.length && quality < 2) { const l = lights[light++]; l.position.copy(point); l.intensity = 2.4; }
      const count = quality >= 2 ? 9 : 18;
      for (let j = 0; j < count; j++) {
        const f = j / count;
        D.position(m, Math.max(0, u - f * 0.27), point);
        const s = size * (1.4 - f) * (0.95 + 0.08 * Math.sin(time * 30 + j * 5));
        put(flame, point.x, point.y, point.z, s, s, s, j < 2 ? 0xffe5a1 : j < 7 ? 0xff9529 : 0xb82b08);
      }
      ring(m.x, m.y, m.r, 0xff9a51, true);
      const cross = 0.22 + 0.08 * Math.sin(time * 8);
      put(flame, m.x, AG.View3D.groundAt(m.x, m.y) + 0.15, m.y, cross, 0.06, cross, 0xffe9ae);
    }
    for (const impact of AG.God.impacts) {
      const { x, y: z, r, age: a, water } = impact;
      const fade = Math.max(0, 1 - a / 3.8), height = impact.height;
      if (a < 1.5) ring(x, z, r * (0.3 + a * 1.7), water ? 0xb5f1ff : 0xeaa765, false, 0.18);
      if (a < 0.65) {
        const s = r * (0.25 + a * 1.2) * (1 - a / 0.65);
        put(flame, x, height + s * 0.5, z, s, s * 0.8, s, water ? 0xb9eeff : 0xffd19a);
        if (light < lights.length && quality < 2) { const l = lights[light++]; l.position.set(x, height + 2, z); l.intensity = 5 * (1 - a / 0.65); }
      }
      const fragments = quality >= 2 ? 28 : 72;
      for (let j = 0; j < fragments; j++) {
        const seed = Math.sin(j * 127.1 + x * 31.7 + z) * 43758.5453, n = seed - Math.floor(seed);
        const angle = j * 2.39996, speed = r * (0.65 + n * 1.1), px = x + Math.cos(angle) * speed * a, pz = z + Math.sin(angle) * speed * a;
        const ground = AG.View3D.groundAt(px, pz), py = Math.max(ground + 0.08, height + (5 + n * 10) * a - 8 * a * a);
        const s = (0.08 + n * 0.3) * Math.min(1, fade * 3);
        put(debris, px, py, pz, s, s * (water ? 2.6 : 0.8), s, water ? (j % 2 ? 0xa1dded : 0xe2faff) : j % 5 ? 0x66504a : 0xf69b43, a * (2 + n * 7));
      }
      const puffs = quality >= 2 ? 12 : 28;
      for (let j = 0; j < puffs; j++) {
        const angle = j * 2.39996, speed = r * (0.45 + (j % 5) * 0.12), radius = speed * Math.sqrt(a + 0.01);
        const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
        const s = (0.4 + a * (1 + (j % 3) * 0.2)) * fade;
        put(dust, px, Math.max(height, AG.View3D.groundAt(px, pz)) + 0.4 + a * (1.1 + j % 3), pz, s * 1.5, s, s * 1.5, water ? 0xd4e8e8 : j % 2 ? 0x8b7767 : 0xb29b80, angle);
      }
    }
    // Hover is a preview; every launched meteor keeps its own independent marker.
    const hover = AG.Render.hover;
    if (AG.God.tool === 'meteor' && hover.on) ring(hover.x, hover.y, 4 + AG.God.brush.r * 0.45, 0xffdbac, true);
    for (const m of [core, flame, debris, dust]) {
      m.count = counters[m.id];
      if (m.count) { m.instanceMatrix.updateRange.offset = 0; m.instanceMatrix.updateRange.count = m.count * 16; m.instanceMatrix.needsUpdate = true; m.instanceColor.updateRange.offset = 0; m.instanceColor.updateRange.count = m.count * 3; m.instanceColor.needsUpdate = true; }
    }
    // all four lights on or all off together: a changing number of lights would recompile shaders
    const lit = lights.some(l => l.intensity > 0);
    lights.forEach(l => { l.visible = lit; });
    rings.geometry.setDrawRange(0, counters.ring);
    if (counters.ring || rings.userData.had) { // (nothing to upload while no ring is drawn)
      const a = rings.geometry.attributes;
      a.position.updateRange.offset = a.color.updateRange.offset = 0; a.position.updateRange.count = a.color.updateRange.count = counters.ring * 3;
      a.position.needsUpdate = true; a.color.needsUpdate = true;
    }
    rings.userData.had = counters.ring > 0;
    D.stats = { flights: flights.length, impacts: AG.God.impacts.length, debris: debris.count };
  };
})();
