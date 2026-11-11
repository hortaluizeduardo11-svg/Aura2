// Cidade low-poly: prédios bege e cinza, janelas escuras repetidas, árvores facetadas,
// calçadas, carros simplificados, o muro com a abertura de 1 m e o pátio escondido.
import * as THREE from 'three';

// gerador pseudoaleatório determinístico
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAY_W = 3.0; // largura de um vão de janela (m)
const FLOOR_H = 3.3; // altura de um andar (m)

// Textura de fachada: 8 x 8 vãos, cada um com uma janela escura; poucas acesas/refletindo.
function facadeTexture(wall, frame, seed) {
  const N = 8, T = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N * T;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = wall;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = i * T, y = j * T;
      // moldura e peitoril
      g.fillStyle = frame;
      g.fillRect(x + 13, y + 9, 38, 46);
      const k = r();
      let win = '#2a3140';
      if (k < 0.07) win = '#f1dcae'; // reflexo quente do sol
      else if (k < 0.18) win = '#3a4558';
      else if (k < 0.24) win = '#222833';
      g.fillStyle = win;
      g.fillRect(x + 16, y + 12, 32, 40);
      // divisória da janela
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + 31, y + 12, 2, 40);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + 13, y + 53, 38, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function pavingTexture(base, line, cell = 64, n = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = cell * n;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = line;
  for (let i = 0; i <= n; i++) {
    g.fillRect(i * cell - 1, 0, 2, c.height);
    g.fillRect(0, i * cell - 1, c.width, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// UVs em metros (1 unidade de textura = 8 vãos), para todas as caixas compartilharem a textura
function worldUVBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i) + h / 2, z = pos.getZ(i);
    let u, v;
    if (ny > 0.5) { u = x / 8; v = z / 8; }
    else if (nx > 0.5) { u = z / (BAY_W * 8); v = y / (FLOOR_H * 8); }
    else { u = x / (BAY_W * 8); v = y / (FLOOR_H * 8); }
    uv.setXY(i, u, v);
  }
  g.translate(0, h / 2, 0);
  return g;
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, flatShading: true, ...o });

export function buildWorld(scene) {
  const W = { context: [], schematicMats: [], movingCars: [], buildings: [], fadeables: [] };
  const r = rng(7);

  // --- materiais com cor normal e cor "esquemática" ---
  const reg = (m, schemColor) => {
    m.userData.c0 = m.color.clone();
    m.userData.c1 = new THREE.Color(schemColor);
    W.schematicMats.push(m);
    return m;
  };

  const facadeStyles = [
    { wall: '#d9c8ad', frame: '#c4b293', roof: 0xb9ab95 }, // bege
    { wall: '#c9c4bb', frame: '#b3ada3', roof: 0xa9a49b }, // cinza claro
    { wall: '#b9b2a7', frame: '#a39c91', roof: 0x9b958c }, // cinza quente
    { wall: '#e0d3bc', frame: '#cbbda3', roof: 0xc2b59f }, // areia
    { wall: '#a9a8a6', frame: '#959492', roof: 0x8f8e8c }, // concreto
  ];
  const facadeMats = facadeStyles.map((s, i) => {
    const tex = facadeTexture(s.wall, s.frame, 100 + i);
    const f = reg(std({ map: tex, color: 0xffffff }), 0x3a4252);
    const roof = reg(std({ color: s.roof }), 0x2c3340);
    const plinth = reg(std({ color: new THREE.Color(s.roof).multiplyScalar(0.72) }), 0x2c3340);
    return { f, roof, plinth };
  });

  function building(x0, x1, z0, z1, h, style) {
    const w = x1 - x0, d = z1 - z0;
    const m = facadeMats[style];
    const g = worldUVBox(w, h, d);
    const mesh = new THREE.Mesh(g, [m.f, m.f, m.roof, m.roof, m.f, m.f]);
    mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // térreo mais escuro e platibanda
    const pl = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.9, d + 0.12).translate(0, 0.45, 0), m.plinth);
    pl.position.copy(mesh.position);
    pl.receiveShadow = true;
    scene.add(pl);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3).translate(0, 0.25, 0), m.roof);
    cap.position.set(mesh.position.x, h, mesh.position.z);
    cap.castShadow = true;
    scene.add(cap);
    const b = { mesh, pl, cap, h };
    W.buildings.push(b);
    return b;
  }

  // fileira norte (fachadas em z = 0), com o vão do pátio entre x = -6 e x = 6
  let x = -150;
  while (x < -6) {
    let w = 10 + Math.floor(r() * 9);
    if (x + w > -18 && x < -18) w = -18 - x; // prédio A termina exatamente em -18
    if (x >= -18) w = 12; // prédio A: [-18, -6]
    const h = x >= -18 ? 30 : 16 + r() * 30;
    building(x, x + w, -16, 0, h, Math.floor(r() * 5));
    x += w;
  }
  x = 6;
  while (x < 150) {
    const w = x === 6 ? 12 : 10 + Math.floor(r() * 9);
    const h = x === 6 ? 36 : 16 + r() * 30;
    building(x, x + w, -16, 0, h, Math.floor(r() * 5));
    x += w;
  }
  // fundo do pátio e segunda fileira
  building(-6, 6, -30, -16, 24, 1);
  for (let xx = -150; xx < 150; xx += 14 + Math.floor(r() * 8)) {
    building(xx, xx + 12, -46, -32, 30 + r() * 40, Math.floor(r() * 5));
  }
  // fileira sul (fachadas em z = 17)
  x = -150;
  while (x < 150) {
    const w = 10 + Math.floor(r() * 9);
    building(x, x + w, 17, 33, 14 + r() * 32, Math.floor(r() * 5));
    x += w;
  }

  // --- chão ---
  const roadM = reg(std({ color: 0x41444c }), 0x1c222c);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 9).rotateX(-Math.PI / 2), roadM);
  road.position.set(0, 0, 8.5);
  road.receiveShadow = true;
  scene.add(road);
  const groundM = reg(std({ color: 0x55575c }), 0x1c222c);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), groundM);
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const swTex = pavingTexture('#b9b6ae', '#a3a097', 64, 8);
  swTex.repeat.set(400 / 1.2 / 8, 4 / 1.2 / 8);
  const sideM = reg(std({ map: swTex, color: 0xffffff }), 0x262d39);
  for (const [z0, z1] of [[0, 4], [13, 17]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(400, 0.15, z1 - z0).translate(0, 0.075, 0), sideM);
    s.position.set(0, 0, (z0 + z1) / 2);
    s.receiveShadow = true;
    scene.add(s);
  }
  const curbM = reg(std({ color: 0xd6d3cc }), 0x323a48);
  for (const zc of [4.0, 13.0]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(400, 0.17, 0.22).translate(0, 0.085, 0), curbM);
    c.position.set(0, 0, zc);
    c.receiveShadow = true;
    scene.add(c);
  }
  // faixas
  const lineM = reg(std({ color: 0xe8e4d8 }), 0x2a3240);
  for (let xx = -200; xx < 200; xx += 6) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.01, 0.16), lineM);
    l.position.set(xx, 0.006, 8.5);
    scene.add(l);
  }
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 8.4), lineM);
    l.position.set(-34 + i * 1.0, 0.006, 8.5);
    scene.add(l);
  }

  // pátio escondido
  const yardTex = pavingTexture('#cfc6b6', '#bdb3a2', 64, 8);
  yardTex.repeat.set(12 / 0.8 / 8, 16 / 0.8 / 8);
  const yardM = reg(std({ map: yardTex, color: 0xffffff }), 0x262d39);
  const yard = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 15.7).translate(0, 0.03, 0), yardM);
  yard.position.set(0, 0, -8.15);
  yard.receiveShadow = true;
  scene.add(yard);

  // --- o muro com a abertura de 1 m (barreira ideal opaca) ---
  const wallM = std({ color: 0xcbbfa9 });
  wallM.userData.c0 = wallM.color.clone();
  wallM.userData.c1 = new THREE.Color(0x8d97a8);
  W.schematicMats.push(wallM);
  const capM = std({ color: 0xb3a68f });
  capM.userData.c0 = capM.color.clone();
  capM.userData.c1 = new THREE.Color(0xf2f4f7);
  W.schematicMats.push(capM);
  const WALL_H = 3.2;
  W.wallH = WALL_H;
  W.walls = [];
  for (const [x0, x1] of [[-6, -0.5], [0.5, 6]]) {
    const w = x1 - x0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, 0.3).translate(0, WALL_H / 2, 0), wallM);
    m.position.set((x0 + x1) / 2, 0, -0.15);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.14, 0.42).translate(0, 0.07, 0), capM);
    cap.position.set((x0 + x1) / 2, WALL_H, -0.15);
    cap.castShadow = true;
    scene.add(cap);
    // arestas da passagem
    const edgeX = x0 === -6 ? x1 : x0;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, WALL_H, 0.34).translate(0, WALL_H / 2, 0), capM);
    trim.position.set(edgeX + (x0 === -6 ? -0.04 : 0.04), 0, -0.15);
    trim.castShadow = true;
    scene.add(trim);
    W.walls.push(m);
  }

  // --- árvores ---
  const trunkM = reg(std({ color: 0x6b4a33 }), 0x2c3340);
  const leafMs = [0x6e9b3d, 0x86ae4a, 0x5d8a36].map((c) => reg(std({ color: c }), 0x2c3340));
  function tree(x, z, s = 1, seed = 1) {
    const rr = rng(seed);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2.4 * s, 5).translate(0, 1.2 * s, 0), trunkM);
    trunk.castShadow = true;
    g.add(trunk);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.IcosahedronGeometry((1.1 + rr() * 0.5) * s, 0);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + rr() * 0.25), p.getY(k) * (0.85 + rr() * 0.25), p.getZ(k) * (0.9 + rr() * 0.25));
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, leafMs[i % 3]);
      leaf.position.set((rr() - 0.5) * 1.0 * s, (2.8 + rr() * 0.9 + i * 0.35) * s, (rr() - 0.5) * 1.0 * s);
      leaf.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0.15, z);
    scene.add(g);
    W.fadeables.push(g);
    return g;
  }
  for (let xx = -140; xx < 140; xx += 9) {
    if (Math.abs(xx) > 10) tree(xx + (r() - 0.5) * 2, 3.3, 0.95 + r() * 0.2, 11 + xx);
    tree(xx + 4 + (r() - 0.5) * 2, 13.7, 0.95 + r() * 0.2, 211 + xx);
  }
  tree(-3.4, -10.5, 0.85, 501);
  tree(3.6, -12.5, 0.8, 502);

  // --- carros ---
  const carColors = [0xe1b23a, 0xf2f0ea, 0x3d6fa8, 0x9bb24a, 0xb8423a, 0x2f343b];
  const glassM = reg(std({ color: 0x2b3442, roughness: 0.3 }), 0x2c3340);
  const tyreM = reg(std({ color: 0x1b1c1f }), 0x2c3340);
  const lightM = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff0c8, emissiveIntensity: 0.6, flatShading: true });
  function car(color, x, z, dir = 1) {
    const bodyM = reg(std({ color, roughness: 0.6 }), 0x2c3340);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.72, 1.8), bodyM);
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.62, 1.62), glassM);
    cabin.position.set(-0.2, 1.28, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.55), bodyM);
    roof.position.set(-0.25, 1.62, 0);
    for (const m of [body, cabin, roof]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    for (const sx of [-1.35, 1.35]) for (const sz of [-0.86, 0.86]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8).rotateX(Math.PI / 2), tyreM);
      w.position.set(sx, 0.34, sz);
      w.castShadow = true;
      g.add(w);
    }
    for (const sz of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.32), lightM);
      hl.position.set(2.11, 0.72, sz);
      g.add(hl);
    }
    g.position.set(x, 0, z);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(g);
    W.fadeables.push(g);
    return g;
  }
  car(carColors[0], -15, 4.95, 1);
  car(carColors[1], -27, 4.95, 1);
  car(carColors[3], 13, 4.95, 1);
  car(carColors[2], 26, 4.95, 1);
  car(carColors[5], -40, 12.05, -1);
  car(carColors[4], 9, 12.05, -1);
  W.movingCars.push({ g: car(carColors[2], 0, 7.0, 1), x0: -90, v: 7.5 });
  W.movingCars.push({ g: car(carColors[1], 0, 10.4, -1), x0: 70, v: -6.5 });
  W.movingCars.push({ g: car(carColors[0], 0, 7.0, 1), x0: -170, v: 7.5 });

  // --- postes e banco ---
  const poleM = reg(std({ color: 0x3b3f46, roughness: 0.5 }), 0x2c3340);
  for (let xx = -130; xx < 140; xx += 18) {
    for (const zz of [3.75, 13.25]) {
      if (zz < 5 && Math.abs(xx - 4) < 12) continue;
      const p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 6).translate(0, 2.75, 0), poleM);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), poleM);
      arm.position.set(0, 5.45, zz < 5 ? 0.55 : -0.55);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), poleM);
      lamp.position.set(0, 5.38, zz < 5 ? 1.1 : -1.1);
      for (const m of [pole, arm, lamp]) { m.castShadow = true; p.add(m); }
      p.position.set(xx + 4, 0.15, zz);
      scene.add(p);
      W.fadeables.push(p);
    }
  }
  const benchM = reg(std({ color: 0x7a5a3e }), 0x2c3340);
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.45), benchM);
  seat.position.y = 0.45;
  const backr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.06), benchM);
  backr.position.set(0, 0.72, -0.2);
  for (const m of [seat, backr]) { m.castShadow = true; bench.add(m); }
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(0, 0.225, 0), poleM);
    leg.position.x = sx;
    bench.add(leg);
  }
  bench.position.set(-3.6, 0.06, -6.5);
  bench.rotation.y = Math.PI / 2;
  scene.add(bench);
  W.fadeables.push(bench);

  W.update = (t, schem) => {
    for (const m of W.schematicMats) m.color.lerpColors(m.userData.c0, m.userData.c1, schem);
    const flat = 1 - 0.985 * schem;
    for (const b of W.buildings) {
      b.mesh.scale.y = flat;
      b.pl.scale.y = flat;
      b.cap.position.y = b.h * flat;
      b.cap.scale.y = flat;
    }
    for (const c of W.movingCars) {
      c.g.position.x = c.x0 + c.v * t;
    }
    const s = Math.max(0.0001, 1 - schem);
    for (const f of W.fadeables) f.scale.setScalar(s);
  };
  return W;
}
