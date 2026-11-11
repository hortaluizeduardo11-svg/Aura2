// Roteiro visual: para cada instante t (s), o estado completo da simulação.
// Tudo é função pura de t, para que cada quadro possa ser renderizado isoladamente.
import * as THREE from 'three';

export const DURACAO = 95.0;
export const FIM_CONTEUDO = 90.0;

// ---------- utilidades ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const ss = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
// aceleração breve: começa devagar, dispara e pousa
export const easeWhip = (u) => (u < 0.5 ? 16 * Math.pow(u, 5) : 1 - Math.pow(-2 * u + 2, 5) / 2);
export const win = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(ss(a, a + fi, t), 1 - ss(b - fo, b, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const _m = new THREE.Matrix4();
export function look(pos, target, fov = 40, up = [0, 1, 0]) {
  const p = V(...pos), tg = V(...target), u = V(...up);
  _m.lookAt(p, tg, u);
  return { pos: p, quat: new THREE.Quaternion().setFromRotationMatrix(_m), fov };
}
function blend(a, b, u) {
  return { pos: a.pos.clone().lerp(b.pos, u), quat: a.quat.clone().slerp(b.quat, u), fov: lerp(a.fov, b.fov, u) };
}

// ---------- geometria fixa da cena ----------
export const PROT = { x: -2.2, z: 2.2 }; // onde o protagonista para
export const ESC = { x: 0.0, z: -6.0 }; // pessoa escondida (fonte)
const ROT_RUA = Math.PI / 2; // olhando para +x
const ROT_VAO = (3 * Math.PI) / 4; // olhando para a abertura

// ---------- protagonista ----------
const WALK_V = 1.35, T_DESACEL = 2.55, T_PARA = 3.25;
function distAndando(t) {
  // velocidade constante, depois desaceleração suave até parar em T_PARA
  if (t <= T_DESACEL) return WALK_V * t;
  const u = clamp((t - T_DESACEL) / (T_PARA - T_DESACEL));
  return WALK_V * T_DESACEL + WALK_V * (T_PARA - T_DESACEL) * (u - (u * u) / 2);
}
const DIST_TOTAL = distAndando(99);
export const PASSO = 1.42; // metros por ciclo completo (2 passos)

export function protagonista(t) {
  const d = distAndando(Math.max(0, t));
  const x = PROT.x - DIST_TOTAL + d;
  const vel = t < T_DESACEL ? 1 : 1 - ss(T_DESACEL, T_PARA, t);
  const walk = (d / PASSO) * Math.PI * 2;
  let rot = lerp(ROT_RUA, ROT_VAO, ss(3.0, 3.9, t));
  let headYaw = 0.55 * ss(2.35, 2.9, t) * (1 - ss(3.1, 3.9, t)) + 0.04 * Math.sin(t * 0.7);
  let headPitch = -0.03 + 0.02 * Math.sin(t * 0.9);
  const breathe = 0.012 * Math.sin(t * 2.1);
  let armR = null, device = 0, dial = 0;
  // cena 4: aciona o controle fictício
  const up = ss(35.7, 36.4, t) * (1 - ss(41.6, 42.2, t));
  if (up > 0) {
    armR = { sh: [-0.55 * up, -0.2 * up, 0.12 * up], el: -1.35 * up, hand: [0, 0, 0] };
    device = up;
    dial = ss(37.7, 38.5, t);
    headPitch += 0.32 * up * (1 - ss(39.2, 39.6, t));
    headYaw += 0.18 * up * (1 - ss(39.2, 39.6, t));
  }
  // cena 6: cabeça levemente inclinada, curiosa
  headYaw += 0.12 * win(t, 63.4, 66.4, 0.6, 0.6);
  headPitch += 0.05 * win(t, 63.4, 66.4, 0.6, 0.6);
  return {
    x, z: PROT.z, rot, walk, amt: vel, headYaw, headPitch, lean: breathe, armR, device, dial,
  };
}

// passos (para o áudio): instantes em que cada pé toca o chão
export function passos() {
  const out = [];
  let last = 0;
  for (let t = 0; t < T_PARA; t += 1 / 240) {
    const n = Math.floor(distAndando(t) / (PASSO / 2) + 0.25);
    if (n > last) { out.push(+t.toFixed(3)); last = n; }
  }
  return out;
}

// ---------- pessoa escondida ----------
export function escondida(t) {
  const call = ss(0.75, 1.0, t) * (1 - ss(2.0, 2.4, t));
  const armR = call > 0 ? { sh: [-1.75 * call, 0.15 * call, -0.35 * call], el: -1.9 * call, hand: [0, 0, 0] } : null;
  let mouth = 0;
  if (t > 1.05 && t < 1.9) mouth = 0.5 + 0.5 * Math.abs(Math.sin((t - 1.05) * 11));
  // continua falando (ao telefone) nas cenas 1–2: o som segue presente
  else if (t > 2.4 && t < 22.5) mouth = 0.35 * Math.max(0, Math.sin(t * 9.0) * Math.sin(t * 2.3));
  const armL = { sh: [-0.25, 0, -0.1], el: -1.6 + 0.1 * Math.sin(t), hand: [0, 0, 0] };
  return {
    x: ESC.x, z: ESC.z, rot: 0, headYaw: 0.15 * Math.sin(t * 0.37), headPitch: -0.05,
    armR, armL: call > 0.5 ? null : armL, mouthOpen: mouth,
  };
}

// ---------- câmera ----------
function camTracking(t) {
  const p = protagonista(t);
  const drift = ss(2.6, 3.4, t) * 0.5;
  return look([p.x + 4.7 - drift, 1.35, 4.45], [p.x + 0.15, 1.08, 2.1], 44);
}

const C = {
  s1bA: look([-3.2, 1.75, 6.0], [-1.0, 1.2, -0.3], 44),
  s1bB: look([-1.3, 7.6, 6.9], [-0.7, 0.5, -2.0], 46),
  s1cA: look([-3.3, 2.0, 6.2], [-0.87, 1.0, 0.17], 44),
  s1cB: look([-3.1, 1.95, 5.8], [-0.87, 1.0, 0.17], 43),
  topo: look([0.0, 27.0, 2.0], [0.0, 0.0, 2.0], 50, [0, 0, -1]),
  topo2: look([0.0, 25.6, 1.9], [0.0, 0.0, 1.9], 50, [0, 0, -1]),
  s3A: look([-2.6, 2.5, 5.0], [0.15, 0.8, 0.3], 44),
  s3B: look([-2.1, 2.2, 4.1], [0.15, 0.85, 0.1], 42),
  s3C: look([-1.95, 2.05, 3.8], [0.1, 0.9, 0.0], 42),
  s4C: look([-1.6, 6.8, 8.2], [-0.6, 0.2, 0.9], 44),
  s4D: look([-1.35, 6.4, 7.7], [-0.6, 0.2, 1.0], 44),
  s5fim: look([-1.9, 13.5, 11.6], [-1.3, 0.0, 2.2], 44),
  s5fim2: look([-1.8, 12.9, 11.0], [-1.3, 0.0, 2.3], 44),
  s6A: look([0.95, 1.6, 1.35], [-2.2, 1.35, 2.2], 40),
  s6B: look([0.6, 1.58, 1.5], [-2.2, 1.38, 2.2], 38),
  s6volta: look([-3.35, 2.05, 4.75], [-0.6, 1.1, -0.1], 42),
  s6fim: look([-4.7, 2.7, 5.1], [-0.4, 1.0, -0.4], 40),
  s7A: look([-3.4, 2.02, 6.4], [-0.87, 1.0, 0.17], 44),
  s7B: look([-3.1, 1.95, 5.8], [-0.87, 1.0, 0.17], 43),
  s7C: look([-3.2, 2.8, 6.3], [-0.87, 1.25, 0.17], 43),
  split: look([0.0, 24.0, 0.5], [0.0, 0.0, 0.5], 50, [0, 0, -1]),
};

// trajeto pela abertura (cena 5)
const voo = new THREE.CatmullRomCurve3([
  V(1.5, 2.4, -10.5), V(0.75, 2.45, -6.2), V(0.25, 1.85, -2.6), V(0.0, 1.6, -0.15), V(-0.05, 1.7, 1.6), V(-0.3, 2.6, 3.4),
]);

export function camera(t, ctx) {
  // ctx.olho(t) e ctx.mao(t): posições do mundo calculadas a partir do esqueleto
  if (t < 3.4) return camTracking(t);
  if (t < 6.6) return blend(C.s1bA, C.s1bB, easeIO(ss(3.4, 6.5, t)));
  if (t < 10.0) return blend(C.s1cA, C.s1cB, ss(6.6, 10.4, t));
  if (t < 11.9) return blend(blend(C.s1cA, C.s1cB, ss(6.6, 10.4, t)), C.topo, easeWhip(ss(10.0, 11.9, t)));
  if (t < 23.0) return blend(C.topo, C.topo2, ss(11.9, 23.0, t));
  if (t < 24.7) return blend(C.topo2, C.s3A, easeWhip(ss(23.0, 24.7, t)));
  if (t < 32.2) return blend(C.s3A, C.s3B, easeIO(ss(24.7, 32.2, t)));
  if (t < 36.0) return blend(C.s3B, C.s3C, ss(32.2, 36.0, t));
  if (t < 39.4) {
    // por cima do ombro direito, olhando o controle na mão
    const h = ctx.mao(t), e = ctx.olho(t), f = ctx.frente(t);
    const right = V(-f.z, 0, f.x).multiplyScalar(-1);
    const dolly = ss(36.0, 39.4, t);
    const pos = e.clone().add(right.multiplyScalar(0.5 - 0.06 * dolly)).add(f.clone().multiplyScalar(-0.62 + 0.1 * dolly)).add(V(0, 0.3 - 0.05 * dolly, 0));
    const tg = h.clone().add(f.clone().multiplyScalar(0.35)).add(V(0, -0.12, 0));
    return look(pos.toArray(), tg.toArray(), 44);
  }
  if (t < 42.6) {
    const e = ctx.olho(t), f = ctx.frente(t);
    const pos = e.clone().add(f.clone().multiplyScalar(0.14));
    const sway = 0.02 * Math.sin(t * 1.3);
    return look(pos.toArray(), [0.15 + sway, 0.75, 0.0], 52);
  }
  if (t < 49.0) return blend(C.s4C, C.s4D, ss(42.6, 49.0, t));
  if (t < 52.6) {
    const u = easeIO(ss(49.0, 52.6, t));
    const p = voo.getPointAt(u);
    const a = voo.getPointAt(Math.min(1, u + 0.06));
    const tg = a.clone().add(a.clone().sub(p).normalize().multiplyScalar(2.0)).add(V(0, -1.25, 0));
    return look(p.toArray(), tg.toArray(), 54);
  }
  if (t < 55.0) {
    const end = voo.getPointAt(1);
    const a = voo.getPointAt(0.94);
    const startTg = end.clone().add(end.clone().sub(a).normalize().multiplyScalar(2.0)).add(V(0, -1.25, 0));
    const s = look(end.toArray(), startTg.toArray(), 54);
    return blend(s, C.s5fim, easeIO(ss(52.6, 55.0, t)));
  }
  if (t < 63.0) return blend(C.s5fim, C.s5fim2, ss(55.0, 63.0, t));
  if (t < 66.6) return blend(C.s6A, C.s6B, ss(63.0, 66.6, t));
  if (t < 75.4) {
    const e = ctx.olho(t), f = ctx.frente(t);
    const pos = e.clone().add(f.clone().multiplyScalar(0.14));
    return look(pos.toArray(), [0.1, 1.0 + 0.03 * Math.sin(t * 0.8), -0.2], 50);
  }
  // corte para trás do ombro e recuo até o plano aberto
  if (t < 78.0) return blend(C.s6volta, C.s6fim, easeIO(ss(75.4, 78.0, t)));
  if (t < 84.6) return { split: true, cam: C.split };
  if (t < 90.0) return blend(C.s7A, C.s7B, easeIO(ss(84.6, 90.0, t)));
  return blend(C.s7B, C.s7C, easeIO(ss(90.0, DURACAO, t)));
}

// ---------- ondas ----------
// lambda de exibição (espaçamento das frentes desenhadas). Só o caso de 1 m está em escala.
export const LAM_DISP = { '500nm': 0.18, '1cm': 0.28, '10cm': 0.45, '1m': 1.0 };
const COR = { '500nm': '#4ff2c2', '1cm': '#ffcf5c', '10cm': '#ff9f4a', '1m': '#ff6f61' };
const crestSpeed = (lam) => 0.9 + 1.1 * lam; // m/s

// integra ciclos numericamente (determinístico)
function ciclos(t, lamAt, t0) {
  let c = 0;
  const dt = 1 / 120;
  for (let s = t0; s < t; s += dt) {
    const h = Math.min(dt, t - s);
    const l = lamAt(s + h / 2);
    c += (crestSpeed(l) / l) * h;
  }
  return c;
}

// sequência do comprimento de onda da "luz" (cena 2 em diante)
const TROCAS = [
  { t: 38.35, de: '500nm', para: '1cm' },
  { t: 49.55, de: '1cm', para: '10cm' },
  { t: 52.55, de: '10cm', para: '1m' },
];
const DUR_TROCA = 0.8;
function estadoLambda(t) {
  let atual = '500nm';
  for (const tr of TROCAS) {
    if (t >= tr.t + DUR_TROCA) atual = tr.para;
    else if (t >= tr.t) {
      const u = ss(tr.t, tr.t + DUR_TROCA, t);
      return { a: tr.de, b: tr.para, mix: u };
    }
  }
  return { a: atual, b: atual, mix: 0 };
}
function lamDisp(t) {
  const s = estadoLambda(t);
  return Math.exp(lerp(Math.log(LAM_DISP[s.a]), Math.log(LAM_DISP[s.b]), s.mix));
}
function corLuz(t) {
  const s = estadoLambda(t);
  return new THREE.Color(COR[s.a]).lerp(new THREE.Color(COR[s.b]), s.mix);
}

export const EMIT_SOM = 1.05;
export const EMIT_LUZ = 11.9;

export function ondas(t) {
  // som: voz da pessoa escondida, lambda ~ 1 m (340 Hz)
  const somOp =
    0.5 * ss(1.05, 1.5, t) * (1 - ss(9.6, 10.4, t)) +
    0.82 * ss(10.4, 11.4, t) * (1 - ss(22.8, 23.9, t)) +
    0.42 * win(t, 32.6, 36.0, 0.6, 0.5) +
    0.3 * win(t, 85.2, 95.0, 1.0, 1.5);
  const som = {
    a: '1m', lamA: 1.0, color: '#fff3e2', opacity: somOp,
    front: Math.max(0, (t - EMIT_SOM) * 4.0), cyc: (t - EMIT_SOM) * crestSpeed(1.0),
    far: 1, near: 1, crest: 1, heat: 0, lineW: 0.1,
  };
  // "luz" (e depois as ondas da hipótese)
  const L = estadoLambda(t);
  const luzOp =
    0.95 * ss(11.9, 12.4, t) * (1 - ss(35.9, 36.05, t)) +
    0.95 * win(t, 39.4, 75.4, 0.4, 0.4) * (1 - 0.45 * win(t, 63.0, 66.6, 0.2, 0.2));
  const heat = ss(55.6, 56.8, t) * (1 - ss(62.8, 63.0, t));
  const luz = {
    a: L.a, b: L.b, mix: L.mix, lamA: LAM_DISP[L.a], lamB: LAM_DISP[L.b], color: corLuz(t),
    opacity: luzOp, front: Math.max(0, (t - EMIT_LUZ) * 4.0), cyc: ciclos(t, lamDisp, EMIT_LUZ),
    far: L.a === '500nm' && L.mix < 0.5 ? 0.4 : 0.8, near: 1, crest: 1 - 0.55 * heat, heat, lineW: 0.12,
  };
  if (t >= 39.4 && t < 42.6) luz.lineW = 0.16;
  return { som, luz, lam: L, lamDisp: lamDisp(t) };
}

// tela dividida (cena 7): esquerda = luz visível; direita = lambda ~ abertura
export function ondasSplit(t) {
  const base = { front: 40, far: 0.4, near: 1, crest: 1, heat: 0, opacity: 0.95, lineW: 0.12 };
  return {
    esq: { ...base, a: '500nm', lamA: LAM_DISP['500nm'], color: COR['500nm'], cyc: (t - 70) * crestSpeed(0.18) / 0.18 },
    dir: { ...base, a: '1m', lamA: 1.0, color: COR['1m'], cyc: (t - 70) * crestSpeed(1.0) / 1.0 },
  };
}

// ---------- modo esquemático (vista de cima) ----------
export function esquema(t) {
  if (t >= 78.0 && t < 84.6) return 1;
  return ss(10.35, 11.9, t) * (1 - ss(23.0, 24.3, t));
}

// ---------- painel ----------
export function painel(t) {
  const L = estadoLambda(t);
  const vis = ss(23.3, 23.9, t) * (1 - ss(77.7, 78.0, t)) * (1 - win(t, 66.6, 75.7, 0.35, 0.4));
  const valor = { '500nm': '500 nm', '1cm': '1 cm', '10cm': '10 cm', '1m': '1 m' };
  return {
    vis,
    de: valor[L.a], para: valor[L.b], mix: L.mix,
    pilula: ss(38.35, 38.9, t) * (1 - ss(93.5, 95, t)),
  };
}

// trocas do painel (para efeitos sonoros)
export const EVENTOS = {
  trocas: TROCAS.map((x) => x.t),
  transicoes: [10.0, 23.0, 36.0, 49.0, 63.0, 78.0, 84.6],
  cortes: [3.4, 6.6, 39.4, 42.6, 66.6, 75.4],
  painelEntra: 23.3,
  pilula: 38.35,
  creditos: 90.0,
};
