// Carros low-poly caprichados: carroceria extrudada de um perfil lateral com chanfros,
// cabine de vidro com teto, caixas de roda, rodas com aro, faróis, lanternas, para-choques
// e retrovisores. Modelos: sedã, hatch, van, táxi e ônibus. Frente do carro = +x.
import * as THREE from 'three';
import { toon } from './toon.js';

const cache = new Map();
const mat = (cor) => {
  if (!cache.has(cor)) cache.set(cor, toon(cor));
  return cache.get(cor);
};
const vidroM = () => mat(0x37506e);
const borrachaM = () => mat(0x1d1e22);
const aroM = () => mat(0xe8e6e1);
const plasticoM = () => mat(0x2e3138);
const farolM = new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false });
const lanternaM = new THREE.MeshBasicMaterial({ color: 0xe23b3b, toneMapped: false });

// perfil lateral (x = comprimento, y = altura), com recortes para as rodas
function perfil(pontos, rodas, rr) {
  const s = new THREE.Shape();
  s.moveTo(pontos[0][0], pontos[0][1]);
  for (let i = 1; i < pontos.length; i++) s.lineTo(pontos[i][0], pontos[i][1]);
  // fundo, da frente para trás, contornando as rodas
  const yb = pontos[0][1];
  const ordem = [...rodas].sort((a, b) => b - a);
  for (const wx of ordem) {
    s.lineTo(wx + rr + 0.06, yb);
    s.absarc(wx, yb - 0.02, rr + 0.06, 0, Math.PI, false);
  }
  s.lineTo(pontos[0][0], yb);
  return s;
}

function extrudar(shape, largura, cor, chanfro = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: largura - 2 * chanfro, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro, bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, -(largura - 2 * chanfro) / 2);
  const m = new THREE.Mesh(g, mat(cor));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function roda(x, z, r, largura) {
  const g = new THREE.Group();
  const pneu = new THREE.Mesh(new THREE.CylinderGeometry(r, r, largura, 14).rotateX(Math.PI / 2), borrachaM());
  pneu.castShadow = true;
  const aro = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, largura + 0.02, 10).rotateX(Math.PI / 2), aroM());
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, largura + 0.04, 6).rotateX(Math.PI / 2), plasticoM());
  g.add(pneu, aro, cubo);
  g.position.set(x, r, z);
  return g;
}

const MODELOS = {
  sedan: {
    corpo: [[-2.05, 0.32], [-2.12, 0.62], [-2.02, 0.86], [-1.2, 0.92], [1.05, 0.92], [1.95, 0.82], [2.12, 0.62], [2.08, 0.32]],
    cabine: [[-1.25, 0.9], [-0.95, 1.42], [0.35, 1.45], [0.98, 0.9]],
    rodas: [-1.3, 1.3], r: 0.34, largura: 1.72,
  },
  hatch: {
    corpo: [[-1.72, 0.32], [-1.78, 0.66], [-1.7, 0.95], [1.0, 0.95], [1.65, 0.84], [1.8, 0.62], [1.76, 0.32]],
    cabine: [[-1.7, 0.93], [-1.55, 1.46], [0.3, 1.5], [0.95, 0.93]],
    rodas: [-1.08, 1.12], r: 0.33, largura: 1.66,
  },
  van: {
    corpo: [[-2.25, 0.34], [-2.3, 0.7], [-2.28, 1.05], [1.6, 1.05], [2.15, 0.88], [2.28, 0.66], [2.24, 0.34]],
    cabine: [[-2.26, 1.03], [-2.24, 1.95], [1.15, 1.98], [1.7, 1.03]],
    rodas: [-1.45, 1.45], r: 0.36, largura: 1.82,
  },
};

export function carroBonito(tipo, cor) {
  const g = new THREE.Group();
  if (tipo === 'onibus') return onibus(cor);
  const taxi = tipo === 'taxi';
  const M = MODELOS[taxi ? 'sedan' : tipo] || MODELOS.sedan;
  const corpo = extrudar(perfil(M.corpo, M.rodas, M.r), M.largura, taxi ? 0xf2c14e : cor);
  g.add(corpo);
  // cabine de vidro um pouco mais estreita, com teto da cor do carro
  const cab = extrudar(new THREE.Shape(M.cabine.map(([x, y]) => new THREE.Vector2(x, y))), M.largura - 0.18, 0, 0.05);
  cab.material = vidroM();
  g.add(cab);
  const [a, b, c, d] = M.cabine;
  const teto = new THREE.Mesh(new THREE.BoxGeometry(c[0] - b[0] + 0.06, 0.06, M.largura - 0.14), mat(taxi ? 0xf2c14e : cor));
  teto.position.set((b[0] + c[0]) / 2, (b[1] + c[1]) / 2 + 0.035, 0);
  teto.castShadow = true;
  g.add(teto);
  // coluna central (divide as janelas laterais)
  const coluna = new THREE.Mesh(new THREE.BoxGeometry(0.09, (b[1] + c[1]) / 2 - a[1], M.largura - 0.14), mat(taxi ? 0xf2c14e : cor));
  coluna.position.set((a[0] + d[0]) / 2 + 0.05, (a[1] + (b[1] + c[1]) / 2) / 2, 0);
  g.add(coluna);
  if (taxi) {
    const placa = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), mat(0xffffff));
    placa.position.set(teto.position.x, teto.position.y + 0.11, 0);
    g.add(placa);
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, M.largura + 0.02), mat(0x2b2b30));
    faixa.position.set(0, 0.68, 0);
    g.add(faixa);
  }
  for (const wx of M.rodas) for (const sz of [-1, 1]) g.add(roda(wx, sz * (M.largura / 2 - 0.13), M.r, 0.24));
  const xf = M.corpo[M.corpo.length - 2][0], xt = M.corpo[1][0];
  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.32), farolM);
    f.position.set(xf + 0.02, 0.66, sz * (M.largura / 2 - 0.3));
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), lanternaM);
    l.position.set(xt - 0.02, 0.7, sz * (M.largura / 2 - 0.3));
    const esp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), mat(taxi ? 0xf2c14e : cor));
    esp.position.set(d[0] - 0.12, a[1] + 0.12, sz * (M.largura / 2 + 0.05));
    g.add(f, l, esp);
  }
  for (const [x, w] of [[xf + 0.05, 0.12], [xt - 0.05, 0.12]]) {
    const pc = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, M.largura + 0.04), plasticoM());
    pc.position.set(x, 0.42, 0);
    g.add(pc);
  }
  return g;
}

function onibus(cor) {
  const g = new THREE.Group();
  const L = 10.5, W = 2.5, H = 2.9;
  const shape = new THREE.Shape([
    new THREE.Vector2(-L / 2, 0.4), new THREE.Vector2(-L / 2, H), new THREE.Vector2(L / 2 - 0.35, H),
    new THREE.Vector2(L / 2, H - 0.4), new THREE.Vector2(L / 2, 0.4),
  ]);
  g.add(extrudar(shape, W, cor, 0.1));
  // faixa de janelas
  const jan = new THREE.Mesh(new THREE.BoxGeometry(L - 1.2, 0.9, W + 0.04), vidroM());
  jan.position.set(-0.3, 2.05, 0);
  g.add(jan);
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, W - 0.4), vidroM());
  pb.position.set(L / 2 + 0.03, 1.9, 0);
  g.add(pb);
  for (const wx of [-3.4, 3.2]) for (const sz of [-1, 1]) g.add(roda(wx, sz * (W / 2 - 0.2), 0.5, 0.32));
  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.4), farolM);
    f.position.set(L / 2 + 0.04, 0.8, sz * 0.85);
    g.add(f);
  }
  const letreiro = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 1.4), new THREE.MeshBasicMaterial({ color: 0xffb648, toneMapped: false }));
  letreiro.position.set(L / 2 + 0.04, H - 0.22, 0);
  g.add(letreiro);
  return g;
}

export const TIPOS = ['sedan', 'hatch', 'sedan', 'van', 'taxi', 'hatch'];
