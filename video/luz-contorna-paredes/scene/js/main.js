// Monta a simulação e expõe window.renderAt(t) para a captura quadro a quadro.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Person, PALETAS } from './people.js';
import { WaveField } from './waves.js';
import { buildAnnotations } from './annotations.js';
import { Overlay } from './overlay.js';
import * as T from './timeline.js';
import * as Vn from './vinhetas.js';
import { construirMultidao, atualizarMultidao, tRua } from './multidao.js';

const W = 1080, H = 1920;
const { ss, win, lerp, clamp } = T;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('gl').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();

// ---------- transição em onda: o plano B aparece dentro de um círculo que se abre ----------
const rtOnda = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
const ondaU = {
  tB: { value: rtOnda.texture }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: 0 },
  uAsp: { value: W / H }, uTint: { value: 0 }, uCor: { value: new THREE.Color('#ffd9bf') },
};
const ondaQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: ondaU, transparent: true, depthTest: false, depthWrite: false, toneMapped: true,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tB; uniform vec2 uC; uniform float uR, uAsp, uTint; uniform vec3 uCor; varying vec2 vUv;
    void main(){
      vec2 d = vUv - uC; d.y /= uAsp;
      float r = length(d);
      float borda = uR - r;
      if (borda < -0.03) discard;
      // leve refração na frente de onda
      vec2 n = normalize(d + 1e-5);
      float anel = smoothstep(0.035, 0.0, abs(borda));
      vec4 b = texture2D(tB, vUv - n * 0.018 * anel);
      vec3 c = b.rgb;
      c = mix(c, c * vec3(1.06, 0.9, 1.02) + vec3(0.05, 0.015, 0.045), uTint);
      c = mix(c, uCor * 1.6, anel * 0.75);
      float a = max(smoothstep(-0.004, 0.004, borda), anel);
      gl_FragColor = vec4(c, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
const ondaCena = new THREE.Scene();
ondaCena.add(ondaQuad);
const ondaCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 1200);
const camHalf = new THREE.PerspectiveCamera(50, (W / 2) / H, 0.05, 1200);

// ---------- céu de fim de tarde ----------
const SUN_DIR = new THREE.Vector3(0.82, 0.47, 0.15).normalize();
const skyU = {
  uSun: { value: SUN_DIR.clone() }, uSchem: { value: 0 },
  uTop: { value: new THREE.Color('#5f86c0') }, uHor: { value: new THREE.Color('#f1c79c') }, uGround: { value: new THREE.Color('#b9a58f') },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uSun, uTop, uHor, uGround; uniform float uSchem; varying vec3 vD;
    void main(){
      float h = vD.y;
      vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, h));
      c = mix(c, uGround, smoothstep(0.0, -0.2, h));
      float s = max(dot(normalize(vD), uSun), 0.0);
      c += vec3(1.0, 0.78, 0.5) * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.4);
      c = mix(c, vec3(0.06, 0.075, 0.1), uSchem);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);
const FOG0 = new THREE.Color('#e7c9a6'), FOG1 = new THREE.Color('#10141b');
scene.fog = new THREE.Fog(FOG0.clone(), 70, 330);

// ---------- luzes ----------
const hemi = new THREE.HemisphereLight(0xbfd0ec, 0x8c7660, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd3a1, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 420;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.target.position.set(-2, 0, 0);
sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xc9d6ff, 0.6);
fill.position.set(-30, 25, 30);
scene.add(fill);

// ---------- mundo, personagens, ondas ----------
const world = buildWorld(scene);
const multidao = construirMultidao(scene);
const prot = new Person(PALETAS.protagonista);
const esc = new Person(PALETAS.escondida);
scene.add(prot.root, esc.root);
const ann = buildAnnotations(scene);
scene.add(ann.controle);
const UP = new THREE.Vector3(0, 1, 0);
function posicionaControle(p) {
  // o controle fica sobre a palma da mão direita, com a face voltada para cima e para o rosto
  const palma = prot.arms[1].hand.localToWorld(new THREE.Vector3(0, -0.07, 0.035));
  const f = new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot));
  ann.controle.position.copy(palma).add(new THREE.Vector3(0, 0.03, 0));
  const n = UP.clone().addScaledVector(f, -0.55).normalize();
  ann.controle.quaternion.setFromUnitVectors(UP, n);
}

const loader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => loader.load(url, (t) => {
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  res(t);
}, undefined, rej));

let som, luz, overlay, timeline, vn3d;
const v3 = new THREE.Vector3();

const easeOndas = (u) => 1 - Math.pow(1 - u, 2.2);

// piscadas: rápidas, a cada ~3 s, com variação
function piscar(t, fase) {
  const per = 3.1 + fase;
  const u = ((t + fase * 7) % per) / per;
  const d = Math.abs(u - 0.5) * per;
  return d < 0.07 ? 1 - d / 0.07 : 0;
}

function poseProt(t) {
  const vv = Vn.vinheta(t);
  const p = vv ? Vn.prota(vv) : T.protagonista(t);
  prot.root.position.set(p.x, 0.15, p.z);
  prot.root.rotation.y = p.rot;
  prot.pose({ walk: p.walk, amt: p.amt, headYaw: p.headYaw, headPitch: p.headPitch, headRoll: p.headRoll, lean: p.lean,
    armR: p.armR, armL: p.armL, blink: piscar(t, 0.3), brow: p.brow, smile: p.smile, mouthOpen: p.mouthOpen, crouch: p.crouch });
  prot.root.updateMatrixWorld(true);
  return p;
}
const ctx = {
  mao: (t) => { poseProt(t); return prot.arms[1].hand.localToWorld(new THREE.Vector3(0, -0.07, 0.035)); },
  olho: (t) => { poseProt(t); return prot.head.localToWorld(prot.eyeLocal.clone()); },
  frente: (t) => { const r = T.protagonista(t).rot; return new THREE.Vector3(Math.sin(r), 0, Math.cos(r)); },
};

function applyCam(cam, c) {
  cam.position.copy(c.pos);
  cam.quaternion.copy(c.quat);
  cam.fov = c.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

function project(p, cam = camera, x0 = 0, w = W) {
  v3.set(p[0], p[1], p[2]).project(cam);
  if (v3.z > 1 || v3.z < -1) return null;
  return { x: x0 + (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * H };
}

// linhas de velocidade (determinísticas)
(function speedLines() {
  const svg = document.getElementById('speed');
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let html = '';
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, r0 = 560 + r() * 380, r1 = r0 + 260 + r() * 520;
    const cx = 540, cy = 900;
    html += `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0 * 1.6}" x2="${cx + Math.cos(a) * r1}" y2="${cy + Math.sin(a) * r1 * 1.6}" stroke="white" stroke-opacity="${0.25 + r() * 0.5}" stroke-width="${1.5 + r() * 2.5}" stroke-linecap="round"/>`;
  }
  svg.innerHTML = html;
})();

// ---------- estado da edição ----------
const DESTAQUES = [
  { t0: 7.3, t1: 10.15, txt: 'E se a luz contornasse paredes?', top: 300 },
  { t0: 11.95, t1: 14.9, txt: 'A luz já faz isso.', top: 950 },
  { t0: 42.7, t1: 47.7, txt: 'Agora começa a hipótese.', top: 300 },
  { t0: 57.9, t1: 62.7, txt: 'Mais espalhamento pelas bordas.', top: 270 },
  { t0: 69.3, t1: 73.0, txt: 'Receber sinal ≠ enxergar detalhes.', top: 220 },
  { t0: 86.3, t1: 90.1, txt: 'O segredo está na escala.', top: 300 },
];

function edicao(t, O, camState) {
  const st = {};
  const d = DESTAQUES.find((x) => t >= x.t0 && t < x.t1);
  st.destaque = d ? { txt: d.txt, top: d.top, op: win(t, d.t0, d.t1, 0.35, 0.4) } : null;
  st.painel = T.painel(t);

  // etiqueta "Representação das ondas"
  const L = O.lam;
  const faixa = { '500nm': 'luz visível · espaçamento fora de escala', '1cm': 'micro-ondas · espaçamento fora de escala',
    '10cm': 'micro-ondas · espaçamento fora de escala', '1m': 'ondas de rádio · espaçamento em escala' };
  const kAtual = L.mix > 0.5 ? L.b : L.a;
  let extra = 'cores simbólicas · som (voz)';
  if (O.luz.opacity > 0.05) extra = 'cores simbólicas · ' + faixa[kAtual];
  if (t >= 78 && t < 84.6) extra = 'cores simbólicas · luz fora de escala';
  const ondasVis = Math.max(O.som.opacity, O.luz.opacity, t >= 78 && t < 84.6 ? 1 : 0);
  st.tag = { op: clamp(ondasVis * 1.6) * (1 - ss(89.6, 90.2, t)), extra };

  // rótulos 3D
  const R = [];
  const P = (id, html, p, op, cls = '', dy = 0) => {
    if (op <= 0.001) { R.push({ id, html, pos: null, op: 0, cls }); return; }
    const q = project(p);
    if (q) q.y += dy;
    R.push({ id, html, pos: q, op, cls });
  };
  const inn = (s, dot = true) => `<div class="in">${s}${dot ? '<div class="dot"></div>' : ''}</div>`;
  const cena1 = win(t, 5.3, 6.6, 0.35, 0.25);
  const top = win(t, 12.2, 23.0, 0.5, 0.4);
  P('voce', inn('você'), [-2.2, 2.05, 2.2], Math.max(cena1, top, win(t, 55.4, 63.0, 0.5, 0.2)), '', -30);
  P('esc', inn('sua amiga'), [0, 2.1, -6.0], Math.max(cena1, top), '', -30);
  P('visao', inn('linha de visão', false), [1.9, 0.2, -4.2], win(t, 5.3, 6.6, 0.4, 0.25), 'chip');
  P('parede', inn('parede', false), [-3.6, 0.2, -0.6], top, '', -6);
  P('abertura', inn('abertura · 1 m', false), [2.5, 0.2, 0.3], top, 'chip');
  P('difr', inn('difração', false), [0, 0.3, 1.0], win(t, 14.45, 17.8, 0.3, 0.4), 'big');
  P('somL', inn('som<span class="small">λ ≈ 1 m</span>', false), [-4.6, 0.2, 6.2], win(t, 16.0, 23.0, 0.4, 0.4), 'chip');
  P('luzL', inn('luz visível<span class="small">λ ≈ 500 nm · espalhamento<br>muito pequeno nesta escala</span>', false), [2.9, 0.2, 9.0], win(t, 16.9, 23.0, 0.4, 0.4), 'chip');
  P('regua', inn('1 m', false), [0, 1.27, 0.06], win(t, 24.2, 35.8, 0.4, 0.3), 'serif', -10);
  P('senoide', inn('som de 340 Hz<span class="small">λ ≈ 1 m</span>', false), [0.25, 1.78, 0.08], win(t, 32.5, 35.8, 0.35, 0.3), 'chip', -26);
  P('sombra', inn('limite da<br>sombra geométrica', false), [-2.05, 0.2, 8.4], win(t, 58.0, 63.0, 0.5, 0.2), 'chip');
  // cena 6: quem está de verdade no pátio x o que a visão adaptada percebe
  const rev = win(t, T.ONDA1[1] - 0.1, T.ONDA2[0] + 0.1, 0.3, 0.25);
  P('rev_amiga', inn('sua amiga'), [0, 2.05, -6.0], rev, '', -26);
  P('rev_gente', inn('quem está lá de verdade', false), [-0.6, 3.2, -9.5], rev, 'chip');
  const foco = ss(T.FOCO[0], T.FOCO[1], t) * (1 - ss(T.FOCO[2], T.FOCO[3], t));
  const pv = win(t, T.ONDA2[1], 75.2, 0.3, 0.3);
  // explicação fixa na tela, logo abaixo do brilho
  R.push({ id: 'perc_1m', html: inn('o que chega até você<span class="small">λ = 1 m: um brilho só, sem detalhes</span>', false), pos: { x: 540, y: 1040 }, op: pv * (1 - foco), cls: 'chip' });
  R.push({ id: 'perc_10', html: inn('se <span style="text-transform:none">λ</span> fosse 10 cm<span class="small">manchas separadas, mas muito menos sinal</span>', false), pos: { x: 540, y: 1040 }, op: pv * foco, cls: 'chip' });
  st.rotulos = R;

  st.def = win(t, 24.4, 28.9, 0.4, 0.35);
  const anc = project([0, 0.3, 0.5]);
  st.lupa = {
    op: win(t, 28.9, 32.3, 0.35, 0.35), zoom: ss(28.95, 29.85, t), ondas: ss(29.75, 30.15, t), nota: ss(30.35, 30.75, t), ancora: anc,
  };
  st.legenda = win(t, 55.8, 63.0, 0.5, 0.2);
  st.split = t >= 78 && t < 84.6 ? win(t, 78.0, 84.6, 0.35, 0.3) : 0;
  st.visaoAdaptada = Math.max(win(t, 39.4, 42.6, 0.35, 0.1) * 0.95, win(t, T.ONDA2[1], 75.4, 0.1, 0.3) * 0.45);
  // transições: linhas de velocidade e desfoque
  const pulsos = [[10.0, 11.4], [23.0, 24.2], [35.9, 36.3], [48.95, 49.6], [62.9, 63.3], [77.9, 78.3], [84.5, 84.9]];
  st.speed = Math.max(0, ...pulsos.map(([a, b]) => 0.75 * win(t, a, b, (b - a) * 0.35, (b - a) * 0.5)));
  st.creditos = t < 99 ? ss(90.2, 90.9, t) : 0;
  st.fade = Math.max(1 - ss(0.0, 0.5, t), t < 99 ? ss(94.4, 95.0, t) : 0);
  return st;
}

// ---------- render de um instante ----------
function camAt(t) {
  const c = T.camera(t, ctx);
  return c;
}

// ---------- tempo de saída x tempo do roteiro ----------
// O roteiro visual (timeline.js) foi escrito sobre a narração de referência
// (data/timeline_roteiro.json). data/warp.json leva o tempo do vídeo final ao tempo
// do roteiro, ancorado nos trechos de legenda: os eventos ficam sincronizados com a
// narração atual, qualquer que seja a voz.
let warp = null;
function tempoRoteiro(tv) {
  if (!warp) return tv;
  const x = tv / warp.dt;
  const i = Math.max(0, Math.min(warp.s.length - 2, Math.floor(x)));
  const u = Math.min(1, Math.max(0, x - i));
  return warp.s[i] + (warp.s[i + 1] - warp.s[i]) * u;
}
// inverso por trecho (o mapa tem cortes entre cenas não vizinhas no roteiro)
function tempoVideo(ts) {
  if (!warp) return ts;
  const s = warp.s, dt = warp.dt;
  let melhor = null;
  // num limite exato entre trechos, vale o início do trecho que começa ali
  for (const sg of warp.segs) if (Math.abs(ts - sg.s0) < 1e-6) return sg.v0;
  for (const sg of warp.segs) {
    if (ts < sg.s0 - 1e-6 || ts > sg.s1 + 1e-6) continue;
    let lo = Math.round(sg.v0 / dt), hi = Math.min(s.length - 1, Math.round(sg.v1 / dt) - 1);
    if (ts <= s[lo]) return lo * dt;
    if (ts >= s[hi]) return hi * dt;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= ts) lo = m; else hi = m; }
    const u = (ts - s[lo]) / Math.max(1e-9, s[hi] - s[lo]);
    return (lo + u) * dt;
  }
  // fora de qualquer trecho (parte do roteiro que não entrou no vídeo): fim do trecho anterior
  for (const sg of warp.segs) if (sg.s1 <= ts && (!melhor || sg.s1 > melhor.s1)) melhor = sg;
  return melhor ? melhor.v1 : 0;
}
window.duracao = () => (warp ? warp.duracao : T.DURACAO);

function camFor(t) {
  const vv = Vn.vinheta(t);
  return vv ? Vn.camera(vv, ctx) : camAt(t);
}

window.renderAt = (tv) => {
  const t = tempoRoteiro(tv);
  const v = Vn.vinheta(t);
  const schem = v ? 0 : T.esquema(t);
  world.update(tRua(t), schem);
  // na vinheta da esquina, só o carro da história passa perto da quina
  for (const mc of world.movingCars) mc.g.visible = !(v && v.nome === 'esquina' && mc.g.position.x > -72 && mc.g.position.x < -8);
  atualizarMultidao(multidao, t, schem, v);
  // céu, névoa e luzes acompanham o modo esquemático
  skyU.uSchem.value = schem;
  scene.fog.color.lerpColors(FOG0, FOG1, schem);
  scene.fog.near = lerp(70, 400, schem);
  scene.fog.far = lerp(330, 900, schem);
  sun.intensity = lerp(3.7, 1.1, schem);
  hemi.intensity = lerp(1.55, 1.9, schem);

  // câmera (pode reposicionar o esqueleto para medir mão/olho)
  const c = window.debugCam ? T.look(window.debugCam.pos, window.debugCam.target, window.debugCam.fov || 40) : camFor(t);
  // desfoque proporcional ao movimento da câmera (acelerações nas transições)
  let blur = 0;
  if (!c.split && !c.wipe) {
    const cp = camFor(tempoRoteiro(Math.max(0, tv - 1 / 30)));
    if (!cp.split && !cp.wipe) {
      const dPos = c.pos.distanceTo(cp.pos);
      const dAng = c.quat.angleTo(cp.quat) * 180 / Math.PI;
      if (dPos < 3 && dAng < 25) blur = clamp(dAng * 0.4 + dPos * 1.8 - 0.8, 0, 2.2);
    }
  }

  // personagens
  const p = poseProt(t);
  posicionaControle(p);
  const e = v ? Vn.escondida(v) : T.escondida(t);
  esc.root.position.set(e.x, 0.06, e.z);
  esc.root.rotation.y = e.rot;
  esc.pose({ headYaw: e.headYaw, headPitch: e.headPitch, armR: e.armR, armL: e.armL, mouthOpen: e.mouthOpen,
    blink: piscar(t, 1.1), smile: e.smile ?? 0.8, tail: 0.12 * Math.sin(t * 2.3) + (e.tail || 0), crouch: e.crouch, walk: e.walk, amt: e.amt });

  // ondas
  const O = v ? Vn.ondas(v) : T.ondas(t);
  som.set(O.som);
  luz.set(O.luz);
  som.colocar(null);
  luz.colocar(O.lugar || null);
  Vn.atualizar(vn3d, v, t, prot);

  // apoios 3D
  ann.update(t, {
    visao: { op: win(t, 4.9, 6.6, 0.3, 0.25), grow: ss(4.9, 5.6, t) },
    sombra: { op: win(t, 57.9, 63.0, 0.4, 0.2), grow: ss(57.9, 58.8, t) },
    regua: win(t, 23.6, 36.0, 0.3, 0.1),
    senoide: win(t, 32.3, 35.95, 0.35, 0.3),
    controle: p.device,
    dial: p.dial,
    mancha: (v && v.nome === 'esconde' ? 0.8 * ss(v.K[3], v.K[3] + 0.5, v.u) : 0) * (0.85 + 0.15 * Math.sin(t * 3.1)),
  });

  // personagem: no plano em primeira pessoa a cabeça some (câmera dentro dela)
  const pov = v ? Vn.pov(v) : (t >= 39.4 && t < 42.6) || (t >= T.ONDA2[1] && t < 75.4);
  prot.head.visible = !pov;
  // ao sair da visão em primeira pessoa, a câmera não pode atravessar a cabeça
  prot.root.visible = true;
  if (!pov && !c.split && !c.wipe) {
    const cabeca = prot.head.localToWorld(new THREE.Vector3(0, 0.12, 0));
    if (c.pos.distanceTo(cabeca) < 0.55) prot.root.visible = false;
  }

  // percepção da visão adaptada (cena 6): só nos planos em primeira pessoa
  const cena6 = !v && t >= T.ONDA2[0] && t < 75.4;
  const foco = cena6 ? ss(T.FOCO[0], T.FOCO[1], t) * (1 - ss(T.FOCO[2], T.FOCO[3], t)) : 0;
  const percOp = cena6 ? ss(T.ONDA2[0] + 0.2, T.ONDA2[1] + 0.3, t) * (1 - ss(75.0, 75.4, t)) : 0;
  ann.atualizarPercepcao(percOp, foco, t);
  // visão adaptada: a cena de luz comum escurece e o sinal de onda longa brilha por cima
  renderer.toneMappingExposure = lerp(1.12, 0.48, (c.wipe ? 0 : percOp));

  if (c.wipe) {
    const w = c.wipe;
    // plano B no alvo, plano A na tela, B por cima dentro do círculo
    const percVis = ann.percepcao.visible;
    ann.percepcao.visible = percVis && w.povB;
    prot.head.visible = !w.povB;
    applyCam(camera, w.b);
    ondaU.uTint.value = w.povB ? 1 : 0;
    renderer.setRenderTarget(rtOnda);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    ann.percepcao.visible = false;
    prot.head.visible = true;
    applyCam(camera, w.a);
    renderer.render(scene, camera);
    ondaU.uC.value.set(w.centro[0], 1 - w.centro[1]);
    ondaU.uR.value = easeOndas(w.u) * 1.05;
    ondaU.uTint.value = w.povB ? 1 : 0;
    renderer.autoClear = false;
    renderer.render(ondaCena, ondaCam);
    renderer.autoClear = true;
    ann.percepcao.visible = percVis;
    if (w.u > 0.5) applyCam(camera, w.b); // rótulos acompanham o plano que está entrando
  } else if (c.split) {
    const S = T.ondasSplit(t);
    renderer.setScissorTest(true);
    applyCam(camHalf, c.cam);
    // esquerda: luz visível
    som.set({ ...O.som, opacity: 0 });
    luz.set(S.esq);
    renderer.setViewport(0, 0, W / 2, H);
    renderer.setScissor(0, 0, W / 2, H);
    renderer.render(scene, camHalf);
    // direita: lambda ~ abertura
    luz.set(S.dir);
    renderer.setViewport(W / 2, 0, W / 2, H);
    renderer.setScissor(W / 2, 0, W / 2, H);
    renderer.render(scene, camHalf);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  } else {
    applyCam(camera, c);
    renderer.render(scene, camera);
  }
  if (v) blur = Math.max(blur, Vn.desfoque(v));
  canvas.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : 'none';

  let st = edicao(t, O, c);
  if (v) st = Vn.edicao(v, project, st);
  overlay.update(tv, st);
  return true;
};

// Trânsito: candidatos sorteados e testados contra todas as posições de câmera do vídeo;
// fica só quem nunca passa por dentro ou rente à câmera.
function escolherTransito() {
  const dur = window.duracao();
  const amostras = [];
  for (let tv = 0; tv < dur; tv += 0.1) {
    const t = tempoRoteiro(tv);
    const v = Vn.vinheta(t);
    if ((v ? 0 : T.esquema(t)) > 0.5 || (v && v.nome === 'radio')) continue;
    const c = camFor(t);
    if (c.split) continue;
    for (const k of c.wipe ? [c.wipe.a, c.wipe.b] : [c]) amostras.push({ tr: tRua(t), x: k.pos.x, y: k.pos.y, z: k.pos.z });
  }
  let s = 77;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lista = [];
  for (let i = 0; i < 200 && lista.length < 10; i++) {
    const leste = r() < 0.5;
    const v = (leste ? 1 : -1) * (6 + r() * 3);
    const cand = { z: leste ? 7.0 : 10.4, v, x0: leste ? -620 + r() * 700 : -80 + r() * 700, cor: Math.floor(r() * 8), onibus: lista.length === 3 };
    const meio = cand.onibus ? 5.6 : 2.3;
    let ok = true;
    for (const a of amostras) {
      const x = cand.x0 + cand.v * a.tr;
      const dx = Math.max(0, Math.abs(a.x - x) - meio), dz = Math.max(0, Math.abs(a.z - cand.z) - 1.3), dy = Math.max(0, a.y - (cand.onibus ? 3.0 : 2.0));
      if (Math.hypot(dx, dy, dz) < 2.0) { ok = false; break; }
    }
    if (ok) lista.push(cand);
  }
  window._transito = lista;
  return lista;
}

// eventos para o áudio, já no tempo do vídeo final
window.eventos = () => {
  const E = T.EVENTOS;
  const v = (x) => +tempoVideo(x).toFixed(3);
  return {
    trocas: E.trocas.map(v), transicoes: E.transicoes.map(v), cortes: E.cortes.map(v),
    painelEntra: v(E.painelEntra), pilula: v(E.pilula), creditos: v(E.creditos),
    ondas: E.ondas.map(v), foco: E.foco.map(v), cliques: v(37.7),
    passos: T.passos().map(v), chamado: timeline.chamado, duracao: window.duracao(),
    vinhetas: Vn.deixas(warp && warp.segs),
    // amostras roteiro -> vídeo por trecho, para a trilha acompanhar as cenas
    trechos: (warp ? warp.segs : [{ cena: 0, s0: 0, s1: T.DURACAO, v0: 0, v1: T.DURACAO }]).map((sg) => ({
      cena: sg.cena, s0: sg.s0, s1: sg.s1, v0: sg.v0, v1: sg.v1,
      mapa: Array.from({ length: Math.max(2, Math.ceil((sg.s1 - sg.s0) / 0.25) + 1) }, (_, i) => {
        const x = Math.min(sg.s1, sg.s0 + i * 0.25);
        return [x, v(x)];
      }),
    })),
  };
};

// rosto da amiga (para a chamada de vídeo no celular)
function rostoAmiga() {
  const w = 256;
  const r2 = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r2.setSize(w, w);
  r2.toneMapping = THREE.ACESFilmicToneMapping;
  r2.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#bfe3dc');
  const pessoa = new Person(PALETAS.escondida);
  pessoa.pose({ smile: 1, headRoll: 0.08 });
  sc.add(pessoa.root);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 2.0));
  const key = new THREE.DirectionalLight(0xffe8d0, 1.6);
  key.position.set(1, 2, 3);
  sc.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  cam.position.set(0, 1.5, 1.15);
  cam.lookAt(0, 1.46, 0);
  r2.render(sc, cam);
  const c = document.createElement('canvas');
  c.width = c.height = w;
  c.getContext('2d').drawImage(r2.domElement, 0, 0);
  r2.dispose();
  return c;
}

// retrato da pessoa escondida, visto da abertura, para a simulação de imagem (tools/visao.py)
window.renderRetrato = () => {
  const w = 600, h = 800;
  const r2 = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r2.setSize(w, h);
  r2.toneMapping = THREE.ACESFilmicToneMapping;
  r2.toneMappingExposure = 1.1;
  r2.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#15181e');
  const pessoa = new Person(PALETAS.escondida);
  pessoa.pose({ headPitch: -0.03 });
  sc.add(pessoa.root);
  sc.add(new THREE.HemisphereLight(0xc8d4ee, 0x6a5a4a, 1.6));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.2);
  key.position.set(2, 3, 4);
  sc.add(key);
  // mesma distância da abertura até ela (6 m); campo vertical de ~2,5 m
  const cam = new THREE.PerspectiveCamera(23.5, w / h, 0.1, 50);
  cam.position.set(0, 1.0, 6.0);
  cam.lookAt(0, 0.95, 0);
  r2.render(sc, cam);
  const url = r2.domElement.toDataURL('image/png');
  r2.dispose();
  return { url, fovVertGraus: 23.5, distancia: 6.0 };
};

(async () => {
  timeline = await (await fetch('./data/timeline.json')).json();
  try { warp = await (await fetch('./data/warp.json')).json(); } catch (e) { warp = null; }
  Vn.configurar(warp, timeline);
  ann.criarPercepcao([{ cor: PALETAS.escondida.jaqueta, x: 0, alt: 1 }].concat(
    multidao.patio.map((a) => ({ cor: a.p.p.jaqueta, x: a.x, alt: (a.escala ?? 1) < 0.8 ? 0.55 : (a.tipo === 'sentado' ? 0.7 : 1) }))));
  vn3d = Vn.construir(scene);
  Vn.desenharTela(vn3d, rostoAmiga());
  const maps = {};
  for (const k of ['500nm', '1cm', '10cm', '1m', 'esconde_1m', 'gume_1m', 'gume_3m', 'gume_luz']) maps[k] = await loadTex(`./data/campo_${k}.png`);
  som = new WaveField(scene, maps);
  luz = new WaveField(scene, maps);
  overlay = new Overlay(timeline);
  await document.fonts.load('400 66px "Instrument Serif"');
  await document.fonts.load('italic 400 66px "Instrument Serif"');
  await document.fonts.load('600 20px Inter');
  await document.fonts.load('500 20px Inter');
  await document.fonts.ready;
  world.criarLetreiros();
  world.criarTransito(escolherTransito());
  renderer.compile(scene, camera);
  window.ready = true;
})();
