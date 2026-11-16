// Cidade low-poly: prédios bege e cinza, janelas escuras repetidas, árvores facetadas,
// calçadas, carros simplificados, o muro com a abertura de 1 m e o pátio escondido.
import * as THREE from 'three';
import { toon } from './toon.js';

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

// materiais estilizados (cel), foscos
const std = (o) => toon(o.color ?? 0xffffff, o.map ? { map: o.map } : {});

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
    { wall: '#e3cfae', frame: '#f4ead8', roof: 0xc9a98a }, // bege
    { wall: '#cfcac2', frame: '#efebe4', roof: 0xa9a3a0 }, // cinza claro
    { wall: '#f0c9a8', frame: '#fbefe2', roof: 0xd49b7d }, // pêssego
    { wall: '#e8dcc4', frame: '#fbf5ea', roof: 0xc7b394 }, // areia
    { wall: '#b9c7c3', frame: '#eef3f1', roof: 0x93a8a3 }, // cinza-menta
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
  const RT0 = -46, RT1 = -36; // rua transversal (exemplo do carro na esquina)
  W.ruaTransversal = [RT0, RT1];
  let x = -150;
  while (x < -6) {
    if (x >= RT0 && x < RT1) { x = RT1; continue; }
    let w = 10 + Math.floor(r() * 9);
    if (x < RT0 && x + w > RT0) w = RT0 - x;
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
    if (xx + 12 > RT0 - 1 && xx < RT1 + 1) continue;
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), groundM);
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const swTex = pavingTexture('#b9b6ae', '#a3a097', 64, 8);
  swTex.repeat.set(400 / 1.2 / 8, 4 / 1.2 / 8);
  const sideM = reg(std({ map: swTex, color: 0xffffff }), 0x262d39);
  const calcada = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0).translate(0, 0.075, 0), sideM);
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  calcada(-200, RT0 + 1.5, 0, 4);
  calcada(RT1 - 1.5, 200, 0, 4);
  calcada(-200, 200, 13, 17);
  // rua transversal: pista e calçadas laterais
  const rt = new THREE.Mesh(new THREE.PlaneGeometry(RT1 - RT0 - 3, 100).rotateX(-Math.PI / 2), roadM);
  rt.position.set((RT0 + RT1) / 2, 0.001, -46);
  rt.receiveShadow = true;
  scene.add(rt);
  calcada(RT0, RT0 + 1.5, -96, 0);
  calcada(RT1 - 1.5, RT1, -96, 0);
  const curbM = reg(std({ color: 0xd6d3cc }), 0x323a48);
  for (const [x0, x1, zc] of [[-200, RT0 + 1.5, 4.0], [RT1 - 1.5, 200, 4.0], [-200, 200, 13.0]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.17, 0.22).translate(0, 0.085, 0), curbM);
    c.position.set((x0 + x1) / 2, 0, zc);
    c.receiveShadow = true;
    scene.add(c);
  }
  // faixa de pedestres atravessando a rua transversal
  const zebraM = reg(std({ color: 0xf3efe4 }), 0x2a3240);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(RT1 - RT0 - 3, 0.012, 0.5), zebraM);
    l.position.set((RT0 + RT1) / 2, 0.008, 0.6 + i * 0.95);
    scene.add(l);
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
    const n = 5;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.IcosahedronGeometry((0.85 + rr() * 0.45) * s, 1);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + rr() * 0.25), p.getY(k) * (0.85 + rr() * 0.25), p.getZ(k) * (0.9 + rr() * 0.25));
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, leafMs[i % 3]);
      const ang = i * 1.9 + rr();
      const rad = i === 0 ? 0 : 0.75 * s;
      leaf.position.set(Math.cos(ang) * rad, (3.0 + (i === 0 ? 0.9 : rr() * 0.6)) * s, Math.sin(ang) * rad);
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
    const tx = xx + (r() - 0.5) * 2;
    // sem árvores perto da esquina da rua transversal (a câmera da vinheta passa por ali)
    const livre = (x) => x < RT0 - 14 || x > RT1 + 12;
    if (Math.abs(xx) > 10 && livre(tx)) tree(tx, 3.3, 0.95 + r() * 0.2, 11 + xx);
    const tx2 = xx + 4 + (r() - 0.5) * 2;
    if (livre(tx2)) tree(tx2, 13.7, 0.95 + r() * 0.2, 211 + xx);
  }
  tree(-3.4, -10.5, 0.85, 501);
  tree(3.6, -12.5, 0.8, 502);

  // --- carros ---
  const carColors = [0xf2c14e, 0xf4f1ea, 0x4f86c6, 0x8cc084, 0xe66a5a, 0x6c5b9a];
  const glassM = reg(std({ color: 0x3d5470 }), 0x2c3340);
  const hubM = reg(std({ color: 0xe9e6df }), 0x2c3340);
  const tyreM = reg(std({ color: 0x1b1c1f }), 0x2c3340);
  const lightM = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff0c8, emissiveIntensity: 0.6, flatShading: true });
  function car(color, x, z, dir = 1) {
    // carro "bolha": carroceria arredondada, cabine em domo, rodas grandes
    const bodyM = reg(std({ color }), 0x2c3340);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.5, 6, 14).rotateZ(Math.PI / 2), bodyM);
    body.scale.set(1, 0.85, 1.35);
    body.position.y = 0.78;
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glassM);
    cabin.scale.set(1.35, 0.85, 0.9);
    cabin.position.set(-0.15, 1.18, 0);
    const teto = new THREE.Mesh(new THREE.SphereGeometry(0.97, 16, 10, 0, Math.PI * 2, 0, Math.PI / 5), bodyM);
    teto.scale.set(1.35, 0.85, 0.9);
    teto.position.set(-0.15, 1.19, 0);
    for (const m of [body, cabin, teto]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    for (const sx of [-1.25, 1.25]) for (const sz of [-0.82, 0.82]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateX(Math.PI / 2), tyreM);
      w.position.set(sx, 0.4, sz);
      w.castShadow = true;
      g.add(w);
      const calota = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10).rotateX(Math.PI / 2), hubM);
      calota.position.set(sx, 0.4, sz);
      g.add(calota);
    }
    for (const sz of [-0.55, 0.55]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), lightM);
      hl.scale.set(0.5, 1, 1);
      hl.position.set(1.98, 0.85, sz);
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
  car(carColors[5], -52, 12.05, -1);
  car(carColors[4], 9, 12.05, -1);
  W.movingCars.push({ g: car(carColors[2], 0, 7.0, 1), x0: -90, v: 7.5 });
  W.movingCars.push({ g: car(carColors[1], 0, 10.4, -1), x0: 70, v: -6.5 });
  W.movingCars.push({ g: car(carColors[0], 0, 7.0, 1), x0: -170, v: 7.5 });

  // --- postes e banco ---
  const poleM = reg(std({ color: 0x3e5a6e }), 0x2c3340);
  const globoM = new THREE.MeshToonMaterial({ color: 0xfff1cc, emissive: 0xffe6a8, emissiveIntensity: 0.35 });
  for (let xx = -130; xx < 140; xx += 18) {
    for (const zz of [3.75, 13.25]) {
      if (zz < 5 && Math.abs(xx - 4) < 12) continue;
      if (xx + 4 > RT0 - 14 && xx + 4 < RT1 + 12) continue;
      const p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 8).translate(0, 2.3, 0), poleM);
      const globo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), globoM);
      globo.position.y = 4.85;
      const chapeu = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.25, 10), poleM);
      chapeu.position.y = 5.25;
      for (const m of [pole, globo, chapeu]) { m.castShadow = true; p.add(m); }
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

  // --- detalhes lúdicos ---
  const props = new THREE.Group();
  scene.add(props);
  W.fadeables.push(props);
  const toldoCores = [0xe66a5a, 0x4fb3a1, 0xf2c14e, 0x6c8fd6, 0xf2855a];
  const plantaM = reg(std({ color: 0x67a84a }), 0x2c3340);
  const vasoM = reg(std({ color: 0xc8704e }), 0x2c3340);
  const grade = reg(std({ color: 0xf4efe6 }), 0x2c3340);
  const tanqueM = reg(std({ color: 0x5d8fb3 }), 0x2c3340);
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    props.add(m);
    return m;
  };
  const vaso = (x, y, z, s = 1) => {
    add(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.35 * s, 8).translate(0, 0.175 * s, 0), vasoM, x, y, z);
    add(new THREE.IcosahedronGeometry(0.3 * s, 1), plantaM, x, y + 0.5 * s, z);
  };
  for (const b of W.buildings) {
    const p = b.mesh.position, g = b.mesh.geometry.parameters;
    if (Math.abs(p.x) > 70) continue;
    const frente = p.z < 8 ? 1 : -1; // fachada voltada para a rua
    const zf = p.z + frente * (g.depth / 2);
    const rr = rng(Math.round(p.x * 13 + p.z * 7) >>> 0);
    const ehPatio = p.z < -20;
    if (!ehPatio && (p.z === -8 || p.z === 25)) {
      // toldo listrado no térreo
      if (rr() < 0.75) {
        const w = Math.min(g.width - 1.5, 4 + rr() * 3);
        const cx = p.x + (rr() - 0.5) * (g.width - w - 1);
        const cor = reg(std({ color: toldoCores[Math.floor(rr() * toldoCores.length)] }), 0x2c3340);
        const t = add(new THREE.BoxGeometry(w, 0.08, 1.2), cor, cx, 2.6, zf + frente * 0.6);
        t.rotation.x = frente * 0.32;
      }
      // varandas com plantas
      const nv = Math.floor(rr() * 3);
      for (let k = 0; k < nv; k++) {
        const vx = p.x + (rr() - 0.5) * (g.width - 3);
        const vy = 6.6 + 3.3 * Math.floor(rr() * 4);
        if (vy > b.h - 2) continue;
        add(new THREE.BoxGeometry(2.2, 0.12, 0.9), grade, vx, vy, zf + frente * 0.45);
        add(new THREE.BoxGeometry(2.2, 0.55, 0.06), grade, vx, vy + 0.33, zf + frente * 0.88);
        vaso(vx - 0.6, vy + 0.06, zf + frente * 0.4, 0.8);
        vaso(vx + 0.6, vy + 0.06, zf + frente * 0.4, 0.7);
      }
    }
    // caixa d'água no telhado
    if (rr() < 0.55) {
      const tx = p.x + (rr() - 0.5) * (g.width - 3), tz = p.z + (rr() - 0.5) * (g.depth - 3);
      add(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12).translate(0, 0.7 + 0.9, 0), tanqueM, tx, b.h + 0.5, tz);
      add(new THREE.ConeGeometry(1.0, 0.5, 12).translate(0, 2.55, 0), tanqueM, tx, b.h + 0.5, tz);
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5).translate(0, 0.45, 0), poleM, tx + dx, b.h + 0.5, tz + dz);
      }
    }
  }
  // vasos e hidrante na calçada
  for (const vx of [-24.5, -12.5, 9.5, 21.5]) vaso(vx, 0.15, 0.7, 1.2);
  const hidM = reg(std({ color: 0xe0483c }), 0x2c3340);
  add(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 10).translate(0, 0.3, 0), hidM, -9.4, 0.15, 3.5);
  add(new THREE.SphereGeometry(0.16, 10, 8), hidM, -9.4, 0.78, 3.5);

  // nuvens low-poly e pássaros
  const nuvemM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: plantaM.gradientMap, emissive: 0xffffff, emissiveIntensity: 0.25 });
  W.nuvens = [];
  const rn = rng(99);
  for (let i = 0; i < 16; i++) {
    const n = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rn() * 4, 1), nuvemM);
      puff.position.set(k * 6 - 9 + rn() * 2, rn() * 3, rn() * 3);
      puff.scale.y = 0.7;
      n.add(puff);
    }
    const ang = rn() * Math.PI * 2;
    n.position.set(Math.cos(ang) * (180 + rn() * 120), 75 + rn() * 45, Math.sin(ang) * (180 + rn() * 120));
    n.userData.v = 0.4 + rn() * 0.4;
    scene.add(n);
    W.nuvens.push(n);
    W.fadeables.push(n);
  }
  const passaroM = reg(std({ color: 0x3b3550 }), 0x2c3340);
  W.passaros = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), passaroM);
    corpo.scale.set(1.4, 0.9, 0.9);
    const asaE = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.22).translate(0, 0, 0.11), passaroM);
    const asaD = asaE.clone();
    asaD.rotation.y = Math.PI;
    b.add(corpo, asaE, asaD);
    b.userData = { asaE, asaD, fase: i * 1.3, x0: -30 + i * 9, y0: 9 + (i % 3) * 1.6, z0: -2 + (i % 2) * 6 };
    scene.add(b);
    W.passaros.push(b);
    W.fadeables.push(b);
  }

  W.update = (t, schem) => {
    for (const n of W.nuvens) n.rotation.y = 0;
    for (const b of W.passaros) {
      const u = b.userData;
      const xb = ((u.x0 + t * 3.2 + 40) % 80 + 80) % 80 - 40;
      b.position.set(xb, u.y0 + 0.4 * Math.sin(t * 1.7 + u.fase), u.z0 + 2 * Math.sin(t * 0.4 + u.fase));
      const bat = 0.8 * Math.sin(t * 14 + u.fase);
      u.asaE.rotation.x = bat;
      u.asaD.rotation.x = -bat;
    }
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
