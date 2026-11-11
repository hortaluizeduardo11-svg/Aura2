// Elementos de apoio em 3D: linha de visão, limites da sombra geométrica, régua de 1 m,
// onda sonora de 1 m, controle fictício e a "mancha" de presença.
import * as THREE from 'three';

const dashVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const dashFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity, uLen, uDash, uGrow;
varying vec2 vUv;
void main() {
  float d = vUv.x * uLen;
  if (vUv.x > uGrow) discard;
  float on = step(fract(d / uDash), 0.58);
  float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
  gl_FragColor = vec4(uColor, on * edge * uOpacity);
  #include <colorspace_fragment>
}`;

function ribbon(a, b, width, color, dash = 0.35, y = 0.2) {
  const A = new THREE.Vector3(a[0], y, a[1]), B = new THREE.Vector3(b[0], y, b[1]);
  const len = A.distanceTo(B);
  const g = new THREE.PlaneGeometry(len, width).rotateX(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uLen: { value: len }, uDash: { value: dash }, uGrow: { value: 1 } },
    vertexShader: dashVert, fragmentShader: dashFrag, transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(A);
  mesh.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
  mesh.renderOrder = 30;
  return mesh;
}

// estende o segmento a->b até z = zFim
function ext(a, b, zFim) {
  const k = (zFim - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * k, zFim];
}

export function buildAnnotations(scene) {
  const A = {};

  // --- linha de visão do protagonista pela abertura ---
  const olho = [-2.2, 2.2];
  const e1 = [-0.5, -0.3], e2 = [0.5, 0.0];
  const far1 = ext(olho, e1, -12.0), far2 = ext(olho, e2, -12.0);
  A.visao = new THREE.Group();
  A.visao.add(ribbon(olho, far1, 0.07, '#ffffff', 0.32));
  A.visao.add(ribbon(olho, far2, 0.07, '#ffffff', 0.32));
  // cunha translúcida do que ele consegue ver
  const wedge = new THREE.BufferGeometry();
  const pts = [olho, far1, far2].map(([x, z]) => [x, 0.19, z]).flat();
  wedge.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  wedge.setIndex([0, 1, 2]);
  wedge.computeVertexNormals();
  const wedgeM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const wedgeMesh = new THREE.Mesh(wedge, wedgeM);
  wedgeMesh.renderOrder = 29;
  A.visao.add(wedgeMesh);
  A.visaoWedge = wedgeM;
  scene.add(A.visao);

  // --- limites da sombra geométrica (retas da fonte pelas bordas) ---
  const S = [0, -6];
  A.sombra = new THREE.Group();
  A.sombra.add(ribbon([-0.5, 0], ext(S, [-0.5, 0], 11.5), 0.08, '#ffffff', 0.4));
  A.sombra.add(ribbon([0.5, 0], ext(S, [0.5, 0], 11.5), 0.08, '#ffffff', 0.4));
  scene.add(A.sombra);

  // --- régua de 1 m atravessando a abertura ---
  A.regua = new THREE.Group();
  const yel = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, flatShading: true });
  const blk = new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.6, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), i % 2 ? blk : yel);
    seg.position.set(-0.45 + i * 0.1, 0, 0);
    seg.castShadow = true;
    A.regua.add(seg);
  }
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.05), blk);
    end.position.set(0.5125 * s, 0, 0);
    A.regua.add(end);
  }
  A.regua.position.set(0, 1.12, 0.06);
  scene.add(A.regua);

  // --- onda sonora de lambda = 1 m sobre a régua ---
  const pts3 = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    pts3.push(new THREE.Vector3(-0.5 + u, 1.45 + 0.13 * Math.sin(u * Math.PI * 2), 0.08));
  }
  const curve = new THREE.CatmullRomCurve3(pts3);
  const tubeM = new THREE.MeshBasicMaterial({ color: 0xfff3e2, transparent: true, opacity: 0, toneMapped: false });
  A.senoide = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.011, 6, false), tubeM);
  A.senoideM = tubeM;
  A.senoide.renderOrder = 31;
  scene.add(A.senoide);
  // marcas das cristas e do comprimento de onda
  const tickM = new THREE.MeshBasicMaterial({ color: 0xfff3e2, transparent: true, opacity: 0, toneMapped: false });
  A.ticks = [];
  for (const x of [-0.25, 0.75]) {
    const tk = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.008), tickM);
    tk.position.set(x, 1.66, 0.08);
    scene.add(tk);
    A.ticks.push(tk);
  }
  A.tickM = tickM;

  // --- controle fictício (na mão direita) ---
  A.controle = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.45, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 10), bodyM);
  A.controle.add(body);
  A.dialRing = new THREE.MeshStandardMaterial({ color: 0x4ff2c2, emissive: 0x4ff2c2, emissiveIntensity: 0.55, flatShading: true });
  const screenM = new THREE.MeshStandardMaterial({ color: 0x0e1a1e, emissive: 0x1d6b5a, emissiveIntensity: 0.5, roughness: 0.3, flatShading: true });
  A.screenM = screenM;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.007, 4, 18).rotateX(Math.PI / 2), A.dialRing);
  ring.position.y = 0.017;
  A.dial = new THREE.Group();
  A.dial.add(ring);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.022), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, flatShading: true }));
  notch.position.set(0, 0.022, 0.032);
  A.dial.add(notch);
  A.controle.add(A.dial);
  const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 10), screenM);
  screen.position.y = 0.017;
  A.controle.add(screen);
  A.controle.scale.setScalar(1.7);

  // --- mancha de presença (cena 6) ---
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  A.manchaM = new THREE.SpriteMaterial({ map: tex, color: 0xff8a6a, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
  A.mancha = new THREE.Sprite(A.manchaM);
  A.mancha.position.set(-0.15, 1.15, 0.15);
  A.mancha.scale.set(2.6, 2.6, 1);
  A.mancha.renderOrder = 40;
  scene.add(A.mancha);

  const setRibbons = (grp, op, grow = 1) => grp.children.forEach((m) => {
    if (m.material.uniforms) { m.material.uniforms.uOpacity.value = op; m.material.uniforms.uGrow.value = grow; }
  });

  A.update = (t, st) => {
    const vis = st.visao;
    setRibbons(A.visao, 0.9 * vis.op, vis.grow);
    A.visaoWedge.opacity = 0.16 * vis.op * vis.grow;
    A.visao.visible = vis.op > 0.001;
    setRibbons(A.sombra, 0.85 * st.sombra.op, st.sombra.grow);
    A.sombra.visible = st.sombra.op > 0.001;
    A.regua.visible = st.regua > 0.01;
    A.regua.scale.set(1, 1, 1);
    A.regua.position.y = 1.12;
    A.senoideM.opacity = st.senoide;
    A.senoide.visible = st.senoide > 0.01;
    A.tickM.opacity = st.senoide;
    A.ticks.forEach((tk) => (tk.visible = st.senoide > 0.01));
    A.controle.visible = st.controle > 0.01;
    A.dial.rotation.y = -st.dial * Math.PI * 1.1;
    A.dialRing.color.set(st.dial > 0.5 ? 0xffcf5c : 0x4ff2c2);
    A.dialRing.emissive.set(st.dial > 0.5 ? 0xffcf5c : 0x4ff2c2);
    A.screenM.emissive.set(st.dial > 0.5 ? 0x7a5a1a : 0x1d6b5a);
    A.manchaM.opacity = st.mancha;
    A.mancha.visible = st.mancha > 0.01;
    const pulse = 1 + 0.06 * Math.sin(t * 3.1);
    A.mancha.scale.set(2.6 * pulse, 2.4 * pulse, 1);
  };
  return A;
}
