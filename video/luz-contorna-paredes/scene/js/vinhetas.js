// Vinhetas do cotidiano: rádio (mundo real), esconde-esconde, carro na esquina e celular
// (hipótese da visão adaptada). Cada vinheta tem um trecho próprio do roteiro (base + u),
// e os eventos internos seguem os inícios dos trechos de legenda (K) da narração atual.
import * as THREE from 'three';
import { toon } from './toon.js';
import { carroBonito } from './carros.js';
import { Person, PALETAS } from './people.js';
import { look, ss, win, clamp, lerp, easeIO, LAM_DISP } from './timeline.js';

const BASES = { radio: 100, esconde: 120, esquina: 140, celular: 160 };
let VIN = {};

// recebe os segmentos do mapa de tempo e a narração; calcula K (inícios dos trechos, em s da vinheta)
export function configurar(warp, timeline) {
  VIN = {};
  if (!warp || !warp.segs) return;
  for (const sg of warp.segs) {
    if (!(sg.cena in BASES)) continue;
    const cena = timeline.cenas.find((c) => c.cena === sg.cena);
    const K = cena.segmentos.flatMap((s) => s.legendas).map((l) => l.t0 - sg.v0);
    const fim = cena.segmentos[cena.segmentos.length - 1].t1 - sg.v0;
    VIN[sg.cena] = { nome: sg.cena, base: sg.s0, dur: sg.s1 - sg.s0, K, fimFala: fim };
  }
}

// marcas de som das vinhetas, já no tempo do vídeo (v0 = início da vinheta no vídeo)
export function deixas(segs) {
  const out = {};
  for (const sg of segs || []) {
    const v = VIN[sg.cena];
    if (!v) continue;
    const k = (i) => sg.v0 + (v.K[i] ?? v.dur);
    out[sg.cena] = { v0: sg.v0, v1: sg.v1 };
    if (sg.cena === 'radio') Object.assign(out[sg.cena], { sintonia: sg.v0 + 0.3, notas: k(4) - 0.6 });
    if (sg.cena === 'esconde') Object.assign(out[sg.cena], { quem: k(4) - 0.2, risada: sg.v0 + 0.9 });
    if (sg.cena === 'esquina') Object.assign(out[sg.cena], { brilho: k(2) - 0.4, passos: [0.3, 0.85, 1.4, 1.95, 2.45].map((x) => sg.v0 + x) });
    if (sg.cena === 'celular') Object.assign(out[sg.cena], { mensagem: sg.v0 + 0.25, borrao: k(2) - 0.1 });
  }
  return out;
}

export function vinheta(t) {
  for (const v of Object.values(VIN)) {
    if (t >= v.base - 1e-6 && t < v.base + v.dur + 0.5) return { ...v, u: t - v.base };
  }
  return null;
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const OR = new THREE.Vector3(400, 60, 0); // maquete do rádio, flutuando no céu

// ------------------------------------------------------------------ objetos 3D
export function construir(scene) {
  const O = {};
  // ---- maquete do rádio: ilha com morro, torre e carro ----
  const ilha = (O.ilha = new THREE.Group());
  ilha.position.copy(OR);
  scene.add(ilha);
  const grama = toon(0x86c06a), terra = toon(0xb98b5e), morroM = toon(0x6fae55), rochaM = toon(0x8f9a7a);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(17, 16, 1.6, 28), terra);
  base.position.y = -0.8;
  base.receiveShadow = true;
  const topo = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 0.12, 28), grama);
  topo.position.y = 0.0;
  topo.receiveShadow = true;
  ilha.add(base, topo);
  // morro: perfil h(r) = 5 (1 - (r/6.5)^1.6), em poucas facetas
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const r = (i / 8) * 6.5;
    pts.push(new THREE.Vector2(Math.max(0.001, r), 5 * (1 - Math.pow(r / 6.5, 1.6))));
  }
  pts.reverse();
  const morro = new THREE.Mesh(new THREE.LatheGeometry(pts, 11), morroM);
  morro.castShadow = morro.receiveShadow = true;
  ilha.add(morro);
  for (const [x, z, s] of [[-2.5, 2.5, 0.7], [2.0, -2.8, 0.6], [3.2, 1.8, 0.5]]) {
    const pedra = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rochaM);
    pedra.position.set(x, 5 * (1 - Math.pow(Math.hypot(x, z) / 6.5, 1.6)) - 0.1, z);
    pedra.castShadow = true;
    ilha.add(pedra);
  }
  // torre da rádio (treliça vermelha e branca) com luz piscante
  const verm = toon(0xe0574a), branco = toon(0xf4f1ea);
  const torre = new THREE.Group();
  torre.position.set(-10, 0, 0);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - i * 0.025, 0.26 - i * 0.025, 1.0, 4), i % 2 ? branco : verm);
    seg.position.y = 0.5 + i;
    seg.castShadow = true;
    torre.add(seg);
  }
  O.luzTorre = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
  O.luzTorre.position.y = 6.15;
  torre.add(O.luzTorre);
  ilha.add(torre);
  // estrada e carro atrás do morro
  const estrada = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 2.6), toon(0x5a5d66));
  estrada.position.set(8.5, 0.07, 0);
  estrada.receiveShadow = true;
  ilha.add(estrada);
  O.carroRadio = carroBolha(0x4fb3a1);
  O.carroRadio.position.set(6.5, 0.05, 0);
  ilha.add(O.carroRadio);
  for (const [x, z, s] of [[-13, -5, 1], [-6, 6, 0.8], [12, -6, 0.9], [13, 6, 0.8], [-14, 4, 0.7]]) ilha.add(arvore(x, z, s));
  // notas musicais saindo do rádio
  O.notas = [];
  const notaM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const n = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), notaM);
    cab.scale.set(1.25, 1, 0.6);
    const haste = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.04), notaM);
    haste.position.set(0.17, 0.27, 0);
    const bandeira = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), notaM);
    bandeira.position.set(0.26, 0.5, 0);
    bandeira.rotation.z = -0.5;
    n.add(cab, haste, bandeira);
    n.userData.mat = notaM;
    ilha.add(n);
    O.notas.push(n);
  }
  // linha de visão bloqueada (carro -> antena)
  const tr = new THREE.Group();
  const a = V3(6.5, 1.5, 0.6), b = V3(3.1, 2.55, 0.6);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p0 = a.clone().lerp(b, i / n), p1 = a.clone().lerp(b, (i + 0.55) / n);
    const d = p1.clone().sub(p0);
    const tr1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, d.length(), 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false }));
    tr1.position.copy(p0.clone().add(p1).multiplyScalar(0.5));
    tr1.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    tr.add(tr1);
  }
  O.visaoRadio = tr;
  ilha.add(tr);

  // ---- carro da esquina (rua transversal) ----
  O.carroEsquina = carroBolha(0xf2c14e);
  O.carroEsquina.visible = false;
  scene.add(O.carroEsquina);

  // ---- brilho borrado na quina (o que a visão adaptada perceberia) ----
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  O.brilhoM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xff8a6a, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
  O.brilho = new THREE.Sprite(O.brilhoM);
  O.brilho.position.set(-36.6, 1.4, 0.6);
  O.brilho.scale.set(3.2, 3.2, 1);
  O.brilho.renderOrder = 40;
  scene.add(O.brilho);

  // ---- celular com tela de conversa (nítida e borrada) ----
  O.celular = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.165, 0.012), toon(0x26232e));
  O.celular.add(corpo);
  O.telaNitida = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
  O.telaBorrada = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0 });
  const tela1 = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.152), O.telaNitida);
  tela1.position.z = 0.0065;
  const tela2 = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.152), O.telaBorrada);
  tela2.position.z = 0.007;
  O.celular.add(tela1, tela2);
  O.celular.visible = false;
  scene.add(O.celular);
  return O;
}

function carroBolha(cor) {
  // carro das vinhetas: o mesmo modelo low-poly da cidade, com antena de rádio
  const g = carroBonito(cor === 0xf2c14e ? 'taxi' : 'hatch', cor);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 5), toon(0x1d1e22));
  ant.position.set(-1.2, 1.5, 0.5);
  ant.rotation.z = 0.3;
  g.add(ant);
  return g;
}

function arvore(x, z, s) {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2 * s, 6).translate(0, s, 0), toon(0x7a5236));
  tronco.castShadow = true;
  g.add(tronco);
  const folhas = [0x6fae55, 0x86c06a, 0x5d9a4a];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry((0.8 + (i % 2) * 0.25) * s, 1), toon(folhas[i % 3]));
    const a = i * 1.9;
    f.position.set(Math.cos(a) * 0.55 * s * (i ? 1 : 0), (2.4 + (i ? 0.1 : 0.7)) * s, Math.sin(a) * 0.55 * s * (i ? 1 : 0));
    f.castShadow = true;
    g.add(f);
  }
  g.position.set(x, 0, z);
  return g;
}

// tela do celular: conversa com a amiga (nítida e borrada para a visão adaptada)
export function desenharTela(O, rostoCanvas) {
  const W = 360, H = 720;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4f86c6'; g.fillRect(0, 0, W, 120);
  g.fillStyle = '#fff';
  g.font = '600 26px Inter, sans-serif';
  g.fillText('18:42', 22, 40);
  if (rostoCanvas) {
    g.save(); g.beginPath(); g.arc(70, 88, 44, 0, Math.PI * 2); g.clip();
    g.drawImage(rostoCanvas, 26, 44, 88, 88); g.restore();
  }
  g.font = '600 34px Inter, sans-serif';
  g.fillText('Bia', 132, 100);
  const balao = (y, txt, minha) => {
    g.font = '500 30px Inter, sans-serif';
    const w = Math.min(W - 60, g.measureText(txt).width + 40);
    const x = minha ? W - w - 20 : 20;
    g.fillStyle = minha ? '#dcf2d6' : '#ffffff';
    g.beginPath(); g.roundRect(x, y, w, 64, 18); g.fill();
    g.fillStyle = '#26232e';
    g.fillText(txt, x + 20, y + 42);
  };
  balao(170, 'Cadê você?', true);
  balao(260, 'Tô atrás do muro!', false);
  balao(350, 'Me acha 😉'.replace('😉', ':)'), false);
  // rosto grande (chamada de vídeo)
  if (rostoCanvas) {
    g.save(); g.beginPath(); g.roundRect(40, 450, 280, 240, 22); g.clip();
    g.drawImage(rostoCanvas, 40, 430, 280, 280); g.restore();
  }
  const nitida = new THREE.CanvasTexture(c);
  nitida.colorSpace = THREE.SRGBColorSpace;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d');
  g2.filter = 'blur(26px)';
  g2.drawImage(c, 0, 0);
  const borrada = new THREE.CanvasTexture(c2);
  borrada.colorSpace = THREE.SRGBColorSpace;
  O.telaNitida.map = nitida; O.telaNitida.needsUpdate = true;
  O.telaBorrada.map = borrada; O.telaBorrada.needsUpdate = true;
}

// ------------------------------------------------------------------ estado por vinheta
const K = (v, i) => (v.K[i] ?? v.dur);

export function prota(v) {
  const u = v.u;
  const P = { x: -2.2, z: 2.2, rot: (3 * Math.PI) / 4, walk: 0, amt: 0, headYaw: 0, headPitch: -0.03, lean: 0.01 * Math.sin(u * 2.1), smile: 0.6 };
  if (v.nome === 'radio') return { ...P, x: 900, z: 900 }; // fora de cena
  if (v.nome === 'esconde') {
    const olhos = 1 - ss(K(v, 3) - 0.35, K(v, 3) + 0.1, u); // mãos nos olhos, contando
    return {
      ...P,
      armL: { sh: [-2.35 * olhos, 0.45 * olhos, -0.25 * olhos], el: -1.75 * olhos },
      armR: { sh: [-2.35 * olhos, -0.45 * olhos, 0.25 * olhos], el: -1.75 * olhos },
      headPitch: 0.12 * olhos - 0.04, headRoll: 0.12 * (1 - olhos) * Math.sin(u * 1.4),
      brow: (1 - olhos) * 0.7, smile: 0.4 + 0.5 * olhos,
    };
  }
  if (v.nome === 'esquina') {
    const anda = 1 - ss(2.0, 2.7, u);
    const d = 1.35 * Math.min(u, 2.0) + 1.35 * 0.35 * ss(2.0, 2.7, u);
    const para = ss(K(v, 2) - 0.1, K(v, 2) + 0.35, u);
    return {
      ...P, x: -30.4 - d, z: 2.25, rot: -Math.PI / 2, walk: (d / 1.1) * Math.PI * 2, amt: anda,
      armR: para > 0 ? { sh: [-1.35 * para, 0.15 * para, 0.35 * para], el: -0.25 * para, hand: [0, 0, 0] } : null,
      lean: -0.08 * para, brow: para, mouthOpen: 0.45 * para * (1 - ss(K(v, 3) + 0.6, K(v, 3) + 1.2, u)),
      headYaw: 0.35 * para,
    };
  }
  if (v.nome === 'celular') {
    const up = ss(0, 0.35, u);
    return {
      ...P, armR: { sh: [-0.55 * up, -0.2 * up, 0.12 * up], el: -1.35 * up, hand: [0, 0, 0] },
      headPitch: 0.36 * up, headYaw: 0.18 * up, celular: up, brow: ss(K(v, 3) - 0.3, K(v, 3), u) * 0.8,
    };
  }
  return P;
}

export function escondida(v) {
  const u = v.u;
  const B = { x: 0, z: -6, rot: 0, headYaw: 0.15 * Math.sin(u * 0.37), headPitch: -0.05, mouthOpen: 0, smile: 0.9 };
  if (v.nome === 'esconde') {
    const ag = ss(0.2, 0.9, u);
    return {
      ...B, x: -1.6, z: -1.05, rot: Math.PI * 0.95, crouch: 0.85 * ag,
      armL: { sh: [-1.0 * ag, 0.2, -0.2], el: -1.3 * ag }, armR: { sh: [-1.0 * ag, -0.2, 0.2], el: -1.3 * ag },
      headYaw: 0.5 * Math.sin(u * 0.9), mouthOpen: 0.25 * Math.max(0, Math.sin(u * 7)) * ag, tail: 0.2 * Math.sin(u * 5),
    };
  }
  if (v.nome === 'celular') {
    return { ...B, armR: { sh: [-1.25, -0.3, 0.2], el: -1.9, hand: [0, 0, 0] }, headPitch: 0.05 };
  }
  return B;
}

export function camera(v, ctx) {
  const u = v.u;
  if (v.nome === 'radio') {
    const y = OR.y;
    const A = look([397.6, y + 13.0, 46], [398.2, y + 7.6, 0], 54);
    const B = look([399.4, y + 12.0, 42], [399.6, y + 7.0, 0], 52);
    return blendCam(A, B, easeIO(ss(0, v.dur, u)));
  }
  if (v.nome === 'esconde') {
    if (u < K(v, 3)) {
      // bem do alto: dá para ver ela agachada atrás do muro e ele do outro lado
      const A = look([-1.0, 12.8, 3.4], [-1.6, 0.4, -0.1], 46);
      const B = look([-1.1, 11.6, 2.9], [-1.6, 0.4, -0.1], 44);
      return blendCam(A, B, ss(0, K(v, 3), u));
    }
    const e = ctx.olho(v.base + u), f = ctx.frente(v.base + u);
    const pos = e.clone().add(f.clone().multiplyScalar(0.16));
    return look(pos.toArray(), [-0.1, 1.05, -0.2], 52);
  }
  if (v.nome === 'esquina') {
    // de sudoeste, sobre a boca da rua transversal: vemos o carro chegando, ele não
    const A = look([-46.5, 13.0, 17.0], [-37.4, 0.6, -2.8], 54);
    const B = look([-45.8, 12.2, 16.0], [-37.2, 0.6, -2.2], 52);
    return blendCam(A, B, easeIO(ss(0, v.dur, u)));
  }
  if (v.nome === 'celular') {
    const h = ctx.mao(v.base + u), e = ctx.olho(v.base + u), f = ctx.frente(v.base + u);
    const right = V3(f.z, 0, -f.x);
    const pos = e.clone().add(right.multiplyScalar(0.34)).add(f.clone().multiplyScalar(-0.42)).add(V3(0, 0.16, 0));
    const tg = h.clone().add(f.clone().multiplyScalar(0.1)).add(V3(0, 0.05, 0));
    return look(pos.toArray(), tg.toArray(), 34);
  }
  return look([0, 5, 10], [0, 0, 0], 40);
}

function blendCam(a, b, u) {
  return { pos: a.pos.clone().lerp(b.pos, u), quat: a.quat.clone().slerp(b.quat, u), fov: lerp(a.fov, b.fov, u) };
}

export function pov(v) {
  return v.nome === 'esconde' && v.u >= K(v, 3);
}

// ondas de cada vinheta (o campo é colocado no lugar da cena correspondente)
export function ondas(v) {
  const r = ondasBase(v);
  r.lam = { a: '1m', b: '1m', mix: 0 };
  return r;
}

function ondasBase(v) {
  const u = v.u;
  const vazio = { a: '1m', lamA: 1, color: '#ffffff', opacity: 0, front: 0, cyc: 0 };
  if (v.nome === 'radio') {
    const lam = 3.0, vel = 0.9 + 1.1 * lam;
    return {
      som: vazio,
      luz: {
        a: 'gume_3m', lamA: lam, color: '#c9adff', opacity: 1.0 * ss(K(v, 1) - 0.3, K(v, 1) + 0.2, u),
        front: Math.max(0, (u - K(v, 1) + 0.3) * 5.0), cyc: u * vel / lam, far: 1, near: 1, crest: 1, heat: 0.12,
        lineW: 0.16, src: [1.0, -10.0], farBox: [-5.0, 10.0, -10.0], clipX: -5.0,
      },
      lugar: { base: [OR.x, OR.y + 5.0, 0.0], vertical: true },
    };
  }
  if (v.nome === 'esconde') {
    const t0 = K(v, 2);
    return {
      som: vazio,
      luz: {
        a: 'esconde_1m', lamA: 1.0, color: '#ff6f61', opacity: 0.85 * ss(t0, t0 + 0.4, u),
        front: Math.max(0, (u - t0) * 4.0), cyc: u * 2.0, far: 0.8, near: 1, crest: 1, heat: 0.35,
        src: [-1.6, -1.2], farBox: [-5.95, 5.95, -15.6],
      },
      lugar: null,
    };
  }
  if (v.nome === 'esquina') {
    return {
      som: vazio,
      luz: {
        a: 'gume_1m', lamA: 1.0, color: '#ff6f61', opacity: 0.85 * ss(0.2, 0.7, u),
        front: Math.max(0, (u - 0.2) * 6.0), cyc: u * 2.0, far: 0.9, near: 1, crest: 1, heat: 0.45,
        src: [5.0, -10.0], farBox: [0.0, 10.0, -26.0],
      },
      lugar: { base: [-36.0, 0.0, 0.0], espelho: true },
    };
  }
  return { som: vazio, luz: vazio, lugar: null };
}

// carro da esquina: desce a rua transversal e para antes da faixa
export function carroEsquina(v) {
  if (!v || v.nome !== 'esquina') return null;
  const e = easeIO(clamp(v.u / (v.dur - 0.2)));
  return { x: -41.6, z: lerp(-27, -3.4, e), rot: -Math.PI / 2 };
}

export function painel(v) {
  if (v.nome === 'radio') return { vis: 0, de: '1 m', para: '1 m', mix: 0, pilula: 0, real: ss(0, 0.4, v.u) * (1 - ss(v.dur - 0.2, v.dur, v.u)) };
  return { vis: ss(0, 0.3, v.u) * (v.nome === 'celular' ? 1 - ss(K(v, 2), K(v, 2) + 0.3, v.u) : 1), de: '1 m', para: '1 m', mix: 0, pilula: 1, real: 0 };
}

export function desfoque(v) {
  if (v.nome !== 'celular') return 0;
  return 9 * ss(K(v, 2) - 0.1, K(v, 3) + 0.2, v.u);
}

// edição: destaques, rótulos e etiqueta das ondas
export function edicao(v, project, st) {
  const u = v.u;
  const D = {
    radio: { a: K(v, 4), b: v.dur, txt: 'Isso já acontece com o rádio.', top: 250 },
    esconde: { a: K(v, 3) + 0.2, b: v.dur, txt: 'Alguém está ali. Mas quem?', top: 260 },
    esquina: { a: K(v, 2), b: v.dur, txt: 'Um brilho chega antes do carro.', top: 230 },
    celular: { a: K(v, 2), b: v.dur, txt: 'Letras e rostos viram manchas.', top: 230 },
  }[v.nome];
  st.destaque = u >= D.a && u < D.b ? { txt: D.txt, top: D.top, op: win(u, D.a, D.b, 0.35, 0.3) } : null;
  st.painel = painel(v);
  const inn = (s, dot = true) => `<div class="in">${s}${dot ? '<div class="dot"></div>' : ''}</div>`;
  const R = [];
  const P = (id, html, p, op, cls = '', dy = 0) => {
    const q = op > 0.001 ? project(p) : null;
    if (q) q.y += dy;
    R.push({ id, html, pos: q, op, cls });
  };
  const o = OR;
  P('vr_antena', inn('antena'), [o.x - 10, o.y + 7.0, 0], v.nome === 'radio' ? win(u, 0.3, K(v, 4), 0.3, 0.3) : 0, '', -20);
  P('vr_ondas', inn('ondas de rádio<span class="small">λ ≈ 3 m (FM)</span>', false), [o.x - 4.5, o.y + 11.5, 0], v.nome === 'radio' ? win(u, K(v, 1), K(v, 4) + 0.5, 0.3, 0.3) : 0, 'chip');
  P('vr_pega', inn('o rádio pega!', false), [o.x + 7.6, o.y + 4.8, 0], v.nome === 'radio' ? win(u, K(v, 4) + 0.2, v.dur, 0.3, 0.2) : 0, 'chip');
  P('vr_visao', inn('sem ver a antena', false), [o.x + 2.6, o.y + 2.2, 3.0], v.nome === 'radio' ? win(u, K(v, 5), v.dur, 0.3, 0.2) : 0, 'chip');
  P('ve_amiga', inn('sua amiga'), [-1.6, 1.35, -1.05], v.nome === 'esconde' ? win(u, 0.4, K(v, 3), 0.3, 0.2) : 0, '', -20);
  P('ve_voce', inn('você'), [-2.2, 2.0, 2.2], v.nome === 'esconde' ? win(u, 0.4, K(v, 3), 0.3, 0.2) : 0, '', -20);
  P('ve_quem', '<div class="in">?</div>', [-0.25, 1.75, -0.1], v.nome === 'esconde' ? win(u, K(v, 4) - 0.2, v.dur + 0.4, 0.25, 0.2) : 0, 'bolha');
  const car = carroEsquina(v);
  P('vq_carro', inn('carro'), car ? [car.x, 2.4, car.z] : [0, 0, 0], v.nome === 'esquina' ? win(u, 0.3, v.dur, 0.3, 0.2) : 0, '', -20);
  P('vq_voce', inn('você'), [-34.6, 2.0, 2.25], v.nome === 'esquina' ? win(u, 0.3, v.dur, 0.3, 0.2) : 0, '', -20);
  P('vc_lam', inn('visão adaptada<span class="small">λ = 1 m: tudo vira mancha</span>', false), [0, 0, 0], 0, 'chip');
  st.rotulos = st.rotulos.concat(R);
  const extra = {
    radio: 'cores simbólicas · rádio FM, λ ≈ 3 m · no mundo real',
    esconde: 'cores simbólicas · λ = 1 m (hipótese)',
    esquina: 'cores simbólicas · λ = 1 m (hipótese)',
    celular: '',
  }[v.nome];
  st.tag = { op: v.nome === 'celular' ? 0 : ss(0.3, 0.6, u), extra };
  st.visaoAdaptada = (v.nome === 'esconde' && u >= K(v, 3) ? ss(K(v, 3), K(v, 3) + 0.3, u) : 0)
    + (v.nome === 'celular' ? 0.9 * ss(K(v, 1) + 0.2, K(v, 2), u) : 0);
  st.speed = Math.max(st.speed, 0.6 * (1 - ss(0, 0.35, u)));
  st.creditos = 0;
  st.fade = 0;
  return st;
}

// animação dos objetos das vinhetas
export function atualizar(O, v, t, prot) {
  O.ilha.visible = !!v && v.nome === 'radio';
  if (O.ilha.visible) {
    const u = v.u;
    O.luzTorre.visible = Math.sin(u * 6) > -0.2;
    const chega = K(v, 4) - 0.6;
    O.notas.forEach((n, i) => {
      const k = clamp((u - chega - i * 0.45) / 2.2);
      n.visible = k > 0 && k < 1;
      n.position.set(6.2 + 0.6 * Math.sin(k * 6 + i), 2.0 + k * 2.6, 0.9);
      n.userData.mat.opacity = Math.sin(k * Math.PI);
      n.rotation.z = 0.3 * Math.sin(k * 8);
    });
    O.visaoRadio.visible = u > K(v, 5);
    O.visaoRadio.children.forEach((m) => (m.material.opacity = 0.9 * ss(K(v, 5), K(v, 5) + 0.3, u)));
  }
  const car = carroEsquina(v);
  O.carroEsquina.visible = !!car;
  if (car) {
    O.carroEsquina.position.set(car.x, 0, car.z);
    O.carroEsquina.rotation.y = car.rot;
  }
  O.brilho.visible = !!v && v.nome === 'esquina';
  if (O.brilho.visible) {
    const u = v.u;
    O.brilhoM.opacity = 0.85 * ss(K(v, 2) - 0.6, K(v, 2) + 0.1, u) * (0.85 + 0.15 * Math.sin(u * 5));
  }
  O.celular.visible = !!v && v.nome === 'celular';
  if (O.celular.visible) {
    const p = prot.arms[1].hand.localToWorld(new THREE.Vector3(0, -0.07, 0.04));
    const r = (3 * Math.PI) / 4;
    const f = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
    O.celular.position.copy(p).add(new THREE.Vector3(0, 0.05, 0));
    // tela voltada para o rosto
    const alvo = O.celular.position.clone().add(f.clone().multiplyScalar(-1)).add(new THREE.Vector3(0, 1.2, 0));
    O.celular.lookAt(alvo);
    const u = v.u;
    const b = ss(K(v, 1) + 0.1, K(v, 1) + 0.8, u);
    O.telaBorrada.opacity = b;
    O.telaNitida.opacity = 1;
  }
}
