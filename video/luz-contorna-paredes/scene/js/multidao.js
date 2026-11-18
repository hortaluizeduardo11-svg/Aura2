// Multidão: pedestres andando, grupos conversando, café, ponto de ônibus, criança com balão
// e alguém passeando com o cachorro. Tudo é função do tempo (determinístico).
// Regra: ninguém entra na área da ação (calçada norte entre x = -12 e x = 9, e o pátio),
// e na vinheta da esquina a calçada norte perto da quina fica livre.
import * as THREE from 'three';
import { Person, paletaAleatoria } from './people.js';
import { toon } from './toon.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PASSO = 1.25;
// Tempo "da rua": no roteiro principal é o próprio t; em cada vinheta, um trecho do meio
// do mesmo dia (a rua continua viva sem repetir a mesma arrumação).
const OFF = { 100: 40, 120: 30, 140: 55, 160: 70 };
export function tRua(t) {
  if (t < 99) return t;
  const base = t >= 160 ? 160 : t >= 140 ? 140 : t >= 120 ? 120 : 100;
  return t - base + OFF[base];
}

function cachorro() {
  const g = new THREE.Group();
  const pelo = toon(0xc98a4b), escuro = toon(0x5a3a22);
  const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 4, 10).rotateZ(Math.PI / 2), pelo);
  corpo.position.y = 0.33;
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pelo);
  cab.position.set(0.3, 0.46, 0);
  const foc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), escuro);
  foc.position.set(0.42, 0.43, 0);
  g.add(corpo, cab, foc);
  for (const s of [-1, 1]) {
    const orelha = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), escuro);
    orelha.scale.set(0.6, 1.4, 0.5);
    orelha.position.set(0.28, 0.56, 0.08 * s);
    g.add(orelha);
  }
  g.userData.pernas = [];
  for (const [x, z] of [[0.18, 0.08], [0.18, -0.08], [-0.18, 0.08], [-0.18, -0.08]]) {
    const piv = new THREE.Group();
    piv.position.set(x, 0.28, z);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 6).translate(0, -0.13, 0), pelo);
    piv.add(pe);
    g.add(piv);
    g.userData.pernas.push(piv);
  }
  const rabo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.22, 6).translate(0, 0.11, 0), pelo);
  rabo.position.set(-0.3, 0.4, 0);
  rabo.rotation.z = -0.7;
  g.add(rabo);
  g.userData.rabo = rabo;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function construirMultidao(scene) {
  const r = rng(2024);
  const M = { pessoas: [], extras: [], grupo: new THREE.Group() };
  scene.add(M.grupo);
  const nova = (extra = {}) => {
    const pal = paletaAleatoria(r);
    const p = new Person({ ...pal, simples: true, escala: extra.escala ?? 0.93 + r() * 0.14 });
    M.grupo.add(p.root);
    return p;
  };
  const add = (cfg) => M.pessoas.push({ p: nova(cfg), fase: r() * 10, ...cfg });

  // --- calçada sul (z 14,2 a 16,4): gente indo e vindo pela rua inteira ---
  for (let i = 0; i < 56; i++) {
    const v = (r() < 0.5 ? -1 : 1) * (0.95 + r() * 0.55);
    add({ tipo: 'anda', z: 14.3 + r() * 2.0, x0: -72 + r() * 144, v, min: -75, max: 75, volta: true });
  }
  // --- calçada norte, lado oeste: nunca chegam a x > -12 ---
  for (let i = 0; i < 18; i++) {
    const indo = r() < 0.5; // indo para oeste, saindo de perto da ação
    const v = (0.95 + r() * 0.5) * (indo ? -1 : 1);
    const x0 = indo ? -13 - r() * 30 : -13 - Math.abs(v) * 100 - r() * 40;
    add({ tipo: 'anda', z: r() < 0.6 ? 3.35 : 0.85, x0, v, min: -160, max: -12, norte: true });
  }
  // --- calçada norte, lado leste: nunca chegam a x < 9 ---
  for (let i = 0; i < 14; i++) {
    const indo = r() < 0.5; // indo para leste
    const v = (0.95 + r() * 0.5) * (indo ? 1 : -1);
    const x0 = indo ? 10 + r() * 30 : 10 + Math.abs(v) * 100 + r() * 40;
    add({ tipo: 'anda', z: r() < 0.6 ? 3.35 : 0.85, x0, v, min: 9, max: 160, norte: true });
  }
  // --- café na calçada sul (mesas em x -19..-11) ---
  for (const [x, z, rot] of [[-18.3, 15.9, Math.PI / 2], [-16.7, 15.9, -Math.PI / 2], [-13.6, 15.5, 0.4], [-11.8, 16.0, -2.2]]) {
    add({ tipo: 'sentado', x, z, rot, conversa: true });
  }
  add({ tipo: 'parado', x: -15.2, z: 14.6, rot: Math.PI, gesto: 'bandeja' });
  // --- ponto de ônibus (x 12..16) ---
  add({ tipo: 'parado', x: 12.6, z: 15.6, rot: Math.PI, gesto: 'celular' });
  add({ tipo: 'sentado', x: 14.4, z: 16.0, rot: Math.PI });
  add({ tipo: 'parado', x: 16.0, z: 15.4, rot: -2.6, gesto: 'nada' });
  // --- grupos conversando ---
  add({ tipo: 'parado', x: -34.8, z: 15.5, rot: Math.PI / 2, conversa: true });
  add({ tipo: 'parado', x: -33.6, z: 15.5, rot: -Math.PI / 2, conversa: true, gesto: 'mao' });
  add({ tipo: 'parado', x: 23.6, z: 2.9, rot: Math.PI / 2 + 0.5, conversa: true, gesto: 'mao' });
  add({ tipo: 'parado', x: 24.9, z: 2.6, rot: -Math.PI / 2, conversa: true });
  add({ tipo: 'parado', x: 24.3, z: 3.6, rot: Math.PI, conversa: true });
  add({ tipo: 'parado', x: -62.0, z: 15.2, rot: 0.3, gesto: 'celular' });
  // mais grupinhos pela calçada sul e na norte (longe da ação)
  for (const [gx, gz, n] of [[-46, 16.2, 2], [-8, 16.3, 3], [6, 16.2, 2], [31, 16.1, 3], [47, 16.3, 2], [-24, 2.6, 2], [36, 2.7, 2]]) {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      add({ tipo: 'parado', x: gx + 0.55 * Math.cos(ang), z: gz + 0.4 * Math.sin(ang), rot: -Math.PI / 2 - ang, conversa: true, gesto: k === 0 ? 'mao' : undefined });
    }
  }
  // --- pátio atrás do muro: mais gente além da amiga, sempre fora da linha de visão do
  // protagonista pela abertura (x <= 1 perto do muro; os de x maior ficam no fundo, z <= -11) ---
  M.patio = [];
  const addP = (cfg) => { add({ ...cfg, patio: true, y: 0.06 }); M.patio.push(M.pessoas[M.pessoas.length - 1]); };
  addP({ tipo: 'parado', x: -3.4, z: -3.5, rot: 2.3, escala: 0.7, gesto: 'bola' });
  addP({ tipo: 'parado', x: -1.4, z: -5.0, rot: -0.85, escala: 0.72, gesto: 'bola' });
  addP({ tipo: 'sentado', x: -3.42, z: -6.5, rot: Math.PI / 2, gesto: 'celular' });
  addP({ tipo: 'parado', x: 2.5, z: -11.7, rot: 1.25, conversa: true, gesto: 'mao' });
  addP({ tipo: 'parado', x: 3.5, z: -11.3, rot: -1.95, conversa: true });
  addP({ tipo: 'parado', x: -1.3, z: -13.4, rot: 0.25, gesto: 'celular' });
  addP({ tipo: 'parado', x: 4.5, z: -14.1, rot: -0.7, conversa: true });
  const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), toon(0xf4f1ea));
  bola.castShadow = true;
  const faixaBola = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 12), toon(0xe0574a));
  bola.add(faixaBola);
  M.grupo.add(bola);
  M.bola = bola;

  // --- criança com balão e o adulto ao lado ---
  add({ tipo: 'parado', x: -3.0, z: 15.4, rot: Math.PI, escala: 0.68, gesto: 'balao' });
  add({ tipo: 'parado', x: -2.2, z: 15.6, rot: -2.8, conversa: true });
  const balaoM = toon(0xe8483f);
  const balao = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), balaoM);
  balao.scale.set(1, 1.15, 1);
  const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.1, 4), toon(0xffffff));
  M.grupo.add(balao, fio);
  M.balao = { balao, fio };
  // --- passeando com o cachorro (calçada sul) ---
  const dono = { tipo: 'anda', z: 14.6, x0: -40, v: 1.0, min: -125, max: 125, volta: true };
  add(dono);
  const dog = cachorro();
  M.grupo.add(dog);
  M.cachorro = { g: dog, dono: M.pessoas[M.pessoas.length - 1] };
  const coleira = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), toon(0xd94a3c));
  M.grupo.add(coleira);
  M.cachorro.coleira = coleira;
  return M;
}

const wrap = (x, a, b) => a + ((((x - a) % (b - a)) + (b - a)) % (b - a));

export function atualizarMultidao(M, t, schem, vinheta) {
  M.grupo.visible = schem < 0.5 && !(vinheta && vinheta.nome === 'radio');
  if (!M.grupo.visible) return;
  const tr = tRua(t);
  const esquina = vinheta && vinheta.nome === 'esquina';
  for (const a of M.pessoas) {
    const p = a.p;
    const pisc = (((tr + a.fase * 3) % 3.4) < 0.12) ? 1 : 0;
    if (a.tipo === 'anda') {
      let x = a.x0 + a.v * tr;
      if (a.volta) x = wrap(x, a.min, a.max);
      let vis = x >= a.min && x <= a.max;
      // na vinheta da esquina, a calçada norte perto da quina fica livre
      if (esquina && a.norte && x > -56 && x < -22) vis = false;
      p.root.visible = vis;
      if (!vis) continue;
      p.root.position.set(x, 0.15, a.z);
      p.root.rotation.y = a.v > 0 ? Math.PI / 2 : -Math.PI / 2;
      const dist = Math.abs(a.v * tr) + a.fase;
      p.pose({ walk: (dist / PASSO) * Math.PI * 2, amt: 1, headYaw: 0.25 * Math.sin(tr * 0.3 + a.fase), blink: pisc, smile: 0.6 });
      a.x = x;
      continue;
    }
    p.root.visible = true;
    const sent = a.tipo === 'sentado';
    p.root.position.set(a.x, a.y ?? 0.15, a.z);
    p.root.rotation.y = a.rot;
    const fala = a.conversa ? Math.max(0, Math.sin(tr * 7 + a.fase * 5) * Math.sin(tr * 1.3 + a.fase)) : 0;
    const o = { sentado: sent ? 1 : 0, blink: pisc, smile: 0.7, mouthOpen: 0.5 * fala,
      headYaw: 0.25 * Math.sin(tr * 0.5 + a.fase), headPitch: 0, lean: 0.01 * Math.sin(tr * 2 + a.fase) };
    if (a.gesto === 'celular') { o.armR = { sh: [-0.6, -0.2, 0.12], el: -1.35 }; o.headPitch = 0.35; o.headYaw = 0.15; }
    if (a.gesto === 'mao') { const g = 0.5 + 0.5 * Math.sin(tr * 2.2 + a.fase); o.armR = { sh: [-0.5 - 0.4 * g, -0.2, 0.3], el: -1.2 }; }
    if (a.gesto === 'bandeja') { o.armR = { sh: [-0.9, 0, 0.25], el: -0.9 }; o.armL = { sh: [-0.9, 0, -0.25], el: -0.9 }; }
    if (a.gesto === 'balao') { o.armR = { sh: [-2.6, 0, 0.25], el: -0.2 }; o.headPitch = -0.35; }
    if (a.gesto === 'bola') {
      const pega = 0.5 + 0.5 * Math.sin(tr * 3.2 + a.fase);
      o.armR = { sh: [-0.9 - 0.4 * pega, -0.1, 0.25], el: -0.5 }; o.armL = { sh: [-0.9 - 0.4 * pega, 0.1, -0.25], el: -0.5 };
      o.smile = 1; o.mouthOpen = 0.3 * pega;
    }
    // no esconde-esconde as crianças do pátio também se escondem
    if (a.patio && vinheta && vinheta.nome === 'esconde' && (a.escala ?? 1) < 0.8) { o.crouch = 0.85; o.armR = null; o.armL = null; o.smile = 1; }
    p.pose(o);
  }
  // bola passando entre as duas crianças do pátio (arco)
  const kids = M.pessoas.filter((a) => a.gesto === 'bola');
  if (kids.length === 2 && M.bola) {
    const esconde = vinheta && vinheta.nome === 'esconde';
    M.bola.visible = true;
    const ciclo = (tr * 0.55) % 2, ida = ciclo < 1, u = ida ? ciclo : ciclo - 1;
    const [A, B] = ida ? kids : [kids[1], kids[0]];
    const pa = new THREE.Vector3(A.x, 0.75, A.z), pb = new THREE.Vector3(B.x, 0.75, B.z);
    const pos = pa.lerp(pb, u);
    pos.y += Math.sin(u * Math.PI) * 0.9;
    if (esconde) pos.set(kids[0].x + 0.4, 0.18, kids[0].z + 0.3);
    M.bola.position.copy(pos);
    M.bola.rotation.set(tr * 4, tr * 3, 0);
  }

  // balão preso na mão da criança
  const crianca = M.pessoas.find((a) => a.gesto === 'balao');
  if (crianca) {
    crianca.p.root.updateMatrixWorld(true);
    const mao = crianca.p.arms[1].hand.localToWorld(new THREE.Vector3(0, -0.05, 0));
    const topo = mao.clone().add(new THREE.Vector3(0.15 * Math.sin(tr * 0.9), 1.05, 0.1 * Math.cos(tr * 0.7)));
    M.balao.balao.position.copy(topo).add(new THREE.Vector3(0, 0.26, 0));
    M.balao.fio.position.copy(mao.clone().lerp(topo, 0.5));
    M.balao.fio.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), topo.clone().sub(mao).normalize());
  }
  // cachorro ao lado do dono
  const c = M.cachorro;
  if (c && c.dono.p.root.visible) {
    const d = c.dono;
    const dir = Math.sign(d.v);
    const x = d.x + dir * 1.1;
    c.g.visible = true;
    c.g.position.set(x, 0.15, d.z - 0.55);
    c.g.rotation.y = dir > 0 ? 0 : Math.PI;
    const ph = tr * 9;
    c.g.userData.pernas.forEach((pp, i) => (pp.rotation.z = 0.5 * Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0))));
    c.g.userData.rabo.rotation.x = 0.5 * Math.sin(tr * 12);
    d.p.root.updateMatrixWorld(true);
    const mao = d.p.arms[0].hand.localToWorld(new THREE.Vector3(0, -0.05, 0));
    const pescoco = new THREE.Vector3(x + dir * 0.28, 0.6, d.z - 0.55);
    c.coleira.visible = true;
    c.coleira.position.copy(mao.clone().lerp(pescoco, 0.5));
    c.coleira.scale.y = mao.distanceTo(pescoco);
    c.coleira.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pescoco.clone().sub(mao).normalize());
  } else if (c) {
    c.g.visible = false;
    c.coleira.visible = false;
  }
}
