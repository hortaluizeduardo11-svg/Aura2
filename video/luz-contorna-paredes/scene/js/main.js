// Monta a simulação e expõe window.renderAt(t) para a captura quadro a quadro.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Person, PALETAS } from './people.js';
import { WaveField } from './waves.js';
import { buildAnnotations } from './annotations.js';
import { Overlay } from './overlay.js';
import * as T from './timeline.js';

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
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 1200);
const camHalf = new THREE.PerspectiveCamera(50, (W / 2) / H, 0.05, 1200);

// ---------- céu de fim de tarde ----------
const SUN_DIR = new THREE.Vector3(0.82, 0.4, 0.17).normalize();
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

let som, luz, overlay, timeline;
const v3 = new THREE.Vector3();

function poseProt(t) {
  const p = T.protagonista(t);
  prot.root.position.set(p.x, 0.15, p.z);
  prot.root.rotation.y = p.rot;
  prot.pose({ walk: p.walk, amt: p.amt, headYaw: p.headYaw, headPitch: p.headPitch, lean: p.lean, armR: p.armR });
  prot.root.updateMatrixWorld(true);
  return p;
}
const ctx = {
  mao: (t) => { poseProt(t); return prot.arms[1].hand.localToWorld(new THREE.Vector3(0, -0.07, 0.035)); },
  olho: (t) => { poseProt(t); return prot.head.localToWorld(new THREE.Vector3(0, 0.14, 0.09)); },
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
  { t0: 67.1, t1: 71.6, txt: 'Receber sinal ≠ enxergar detalhes.', top: 950 },
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
  P('esc', inn('pessoa escondida'), [0, 2.1, -6.0], Math.max(cena1, top), '', -30);
  P('visao', inn('linha de visão', false), [1.9, 0.2, -4.2], win(t, 5.3, 6.6, 0.4, 0.25), 'chip');
  P('parede', inn('parede', false), [-3.6, 0.2, -0.6], top, '', -6);
  P('abertura', inn('abertura · 1 m', false), [2.5, 0.2, 0.3], top, 'chip');
  P('difr', inn('difração', false), [0, 0.3, 1.0], win(t, 14.45, 17.8, 0.3, 0.4), 'big');
  P('somL', inn('som<span class="small">λ ≈ 1 m</span>', false), [-4.6, 0.2, 6.2], win(t, 16.0, 23.0, 0.4, 0.4), 'chip');
  P('luzL', inn('luz visível<span class="small">λ ≈ 500 nm · espalhamento<br>muito pequeno nesta escala</span>', false), [2.9, 0.2, 9.0], win(t, 16.9, 23.0, 0.4, 0.4), 'chip');
  P('regua', inn('1 m', false), [0, 1.27, 0.06], win(t, 24.2, 35.8, 0.4, 0.3), 'serif', -10);
  P('senoide', inn('som de 340 Hz<span class="small">λ ≈ 1 m</span>', false), [0.25, 1.78, 0.08], win(t, 32.5, 35.8, 0.35, 0.3), 'chip', -26);
  P('sombra', inn('limite da<br>sombra geométrica', false), [-2.05, 0.2, 8.4], win(t, 58.0, 63.0, 0.5, 0.2), 'chip');
  st.rotulos = R;

  st.def = win(t, 24.4, 28.9, 0.4, 0.35);
  const anc = project([0, 0.3, 0.5]);
  st.lupa = {
    op: win(t, 28.9, 32.3, 0.35, 0.35), zoom: ss(28.95, 29.85, t), ondas: ss(29.75, 30.15, t), nota: ss(30.35, 30.75, t), ancora: anc,
  };
  st.detector = { op: win(t, 66.8, 75.6, 0.45, 0.4), sinal: ss(67.15, 67.5, t), imagem: ss(68.2, 68.55, t), formula: ss(70.45, 70.85, t) };
  st.legenda = win(t, 55.8, 63.0, 0.5, 0.2);
  st.split = t >= 78 && t < 84.6 ? win(t, 78.0, 84.6, 0.35, 0.3) : 0;
  st.visaoAdaptada = Math.max(win(t, 39.4, 42.6, 0.35, 0.1), win(t, 66.6, 75.4, 0.35, 0.6)) * 0.95;
  // transições: linhas de velocidade e desfoque
  const pulsos = [[10.0, 11.4], [23.0, 24.2], [35.9, 36.3], [48.95, 49.6], [62.9, 63.3], [77.9, 78.3], [84.5, 84.9]];
  st.speed = Math.max(0, ...pulsos.map(([a, b]) => 0.75 * win(t, a, b, (b - a) * 0.35, (b - a) * 0.5)));
  st.creditos = ss(90.2, 90.9, t);
  st.fade = Math.max(1 - ss(0.0, 0.5, t), ss(94.4, 95.0, t));
  return st;
}

// ---------- render de um instante ----------
function camAt(t) {
  const c = T.camera(t, ctx);
  return c;
}

window.renderAt = (t) => {
  const schem = T.esquema(t);
  world.update(t, schem);
  // céu, névoa e luzes acompanham o modo esquemático
  skyU.uSchem.value = schem;
  scene.fog.color.lerpColors(FOG0, FOG1, schem);
  scene.fog.near = lerp(70, 400, schem);
  scene.fog.far = lerp(330, 900, schem);
  sun.intensity = lerp(3.7, 1.1, schem);
  hemi.intensity = lerp(1.55, 1.9, schem);

  // câmera (pode reposicionar o esqueleto para medir mão/olho)
  const c = window.debugCam ? T.look(window.debugCam.pos, window.debugCam.target, window.debugCam.fov || 40) : camAt(t);
  // desfoque proporcional ao movimento da câmera (acelerações nas transições)
  let blur = 0;
  if (!c.split) {
    const cp = camAt(Math.max(0, t - 1 / 30));
    if (!cp.split) {
      const dPos = c.pos.distanceTo(cp.pos);
      const dAng = c.quat.angleTo(cp.quat) * 180 / Math.PI;
      if (dPos < 3 && dAng < 25) blur = clamp(dAng * 0.4 + dPos * 1.8 - 0.8, 0, 2.2);
    }
  }

  // personagens
  const p = poseProt(t);
  posicionaControle(p);
  const e = T.escondida(t);
  esc.root.position.set(e.x, 0.06, e.z);
  esc.root.rotation.y = e.rot;
  esc.pose({ headYaw: e.headYaw, headPitch: e.headPitch, armR: e.armR, armL: e.armL, mouthOpen: e.mouthOpen });

  // ondas
  const O = T.ondas(t);
  som.set(O.som);
  luz.set(O.luz);

  // apoios 3D
  ann.update(t, {
    visao: { op: win(t, 4.9, 6.6, 0.3, 0.25), grow: ss(4.9, 5.6, t) },
    sombra: { op: win(t, 57.9, 63.0, 0.4, 0.2), grow: ss(57.9, 58.8, t) },
    regua: win(t, 23.6, 36.0, 0.3, 0.1),
    senoide: win(t, 32.3, 35.95, 0.35, 0.3),
    controle: p.device,
    dial: p.dial,
    mancha: 0.85 * win(t, 67.0, 75.4, 0.6, 0.4) * (0.85 + 0.15 * Math.sin(t * 3.1)),
  });

  // personagem: no plano em primeira pessoa a cabeça some (câmera dentro dela)
  const pov = (t >= 39.4 && t < 42.6) || (t >= 66.6 && t < 75.4);
  prot.head.visible = !pov;
  // ao sair da visão em primeira pessoa, a câmera não pode atravessar a cabeça
  prot.root.visible = true;
  if (!pov && !c.split) {
    const cabeca = prot.head.localToWorld(new THREE.Vector3(0, 0.12, 0));
    if (c.pos.distanceTo(cabeca) < 0.55) prot.root.visible = false;
  }

  if (c.split) {
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
  canvas.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : 'none';

  overlay.update(t, edicao(t, O, c));
  return true;
};

window.eventos = () => ({ ...T.EVENTOS, passos: T.passos(), chamado: timeline.chamado, duracao: T.DURACAO });

(async () => {
  timeline = await (await fetch('./data/timeline.json')).json();
  const maps = {};
  for (const k of ['500nm', '1cm', '10cm', '1m']) maps[k] = await loadTex(`./data/campo_${k}.png`);
  som = new WaveField(scene, maps);
  luz = new WaveField(scene, maps);
  overlay = new Overlay(timeline);
  await document.fonts.load('400 66px "Instrument Serif"');
  await document.fonts.load('italic 400 66px "Instrument Serif"');
  await document.fonts.load('600 20px Inter');
  await document.fonts.load('500 20px Inter');
  await document.fonts.ready;
  renderer.compile(scene, camera);
  window.ready = true;
})();
