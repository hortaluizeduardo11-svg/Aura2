// Visualização das ondas: frentes translúcidas e mapa de intensidade, no plano do chão.
// Lado da rua (z >= 0): usa os mapas calculados em tools/campos.py (Huygens–Fresnel).
// Lado do pátio (z < 0): onda cilíndrica incidente vinda da fonte (pessoa escondida).
// As paredes são barreiras ideais opacas: nada é desenhado atravessando a parede.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vW;
void main() {
  // coordenadas locais do plano = coordenadas do campo calculado (o plano pode ser movido/girado)
  vW = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform float uMix, uLamA, uLamB, uTrueA, uTrueB;
uniform float uFront, uCyc;
uniform float uCrest, uHeat, uOpacity, uLayer, uFar, uNear, uLineW;
uniform vec3 uColor;
uniform vec2 uSrc;
uniform vec3 uFarBox; // xmin, xmax, zmin da região atrás da barreira
uniform float uClipX;  // descarta x < uClipX (ex.: abaixo do chão na maquete do rádio)
varying vec3 vW;

const vec4 DOM = vec4(-10.0, 10.0, 0.0, 12.0);
const float TAU = 6.2831853;

// uCyc = ciclos já emitidos; a crista avança com a fase, sem saltos quando lambda muda
float crestOf(float lam, float useTrue, vec2 dec, float rS) {
  float w = TAU * uCyc;
  if (useTrue > 0.5) return dec.x * cos(w) + dec.y * sin(w);
  return cos(TAU * (rS / lam - uCyc));
}
float lineOf(float c) {
  return smoothstep(1.0 - uLineW, 0.992, c) * 0.95 + 0.10 * smoothstep(-0.3, 1.0, c);
}
vec3 heatCol(float v) {
  vec3 c = mix(vec3(0.20, 0.07, 0.38), vec3(0.78, 0.20, 0.50), smoothstep(0.0, 0.35, v));
  c = mix(c, vec3(0.98, 0.55, 0.22), smoothstep(0.35, 0.7, v));
  c = mix(c, vec3(1.0, 0.93, 0.70), smoothstep(0.72, 1.0, v));
  return c;
}

void main() {
  vec2 p = vW.xz;
  if (p.x < uClipX) discard;
  float front = uFront;
  if (front <= 0.0) discard;
  float rS = length(p - uSrc);
  float aC = 0.0, aH = 0.0;
  vec3 hc = vec3(0.0);
  if (p.y < -0.3) {
    // pátio: onda incidente
    if (p.x < uFarBox.x || p.x > uFarBox.y || p.y < uFarBox.z) discard;
    float m = 1.0 - smoothstep(front - 0.9, front, rS);
    float amp = clamp(1.5 / sqrt(rS + 0.6), 0.0, 1.0) * uFar;
    float lam = mix(uLamA, uLamB, uMix);
    float tr = mix(uTrueA, uTrueB, uMix);
    float c = cos(TAU * (rS / lam - uCyc) - 0.785 * tr);
    aC = m * amp * lineOf(c) * uCrest;
  } else if (p.y >= 0.0) {
    vec2 uv = vec2((p.x - DOM.x) / (DOM.y - DOM.x), (p.y - DOM.z) / (DOM.w - DOM.z));
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
    vec4 A = texture2D(uMapA, uv);
    vec4 B = texture2D(uMapB, uv);
    float v = mix(A.r, B.r, uMix);
    float path = length(uSrc) + length(p);
    float m = 1.0 - smoothstep(front - 0.9, front, path);
    // borda suave do domínio
    m *= smoothstep(1.0, 0.86, uv.y) * smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    float cA = crestOf(uLamA, uTrueA, A.gb * 2.0 - 1.0, rS);
    float cB = crestOf(uLamB, uTrueB, B.gb * 2.0 - 1.0, rS);
    float ampA = smoothstep(0.03, 0.72, A.r);
    float ampB = smoothstep(0.03, 0.72, B.r);
    aC = m * mix(ampA * lineOf(cA), ampB * lineOf(cB), uMix) * uCrest * uNear;
    aH = m * uHeat * smoothstep(0.01, 0.28, v) * 0.82 * uNear;
    hc = heatCol(v);
  } else {
    discard;
  }
  float a = 1.0 - (1.0 - aC) * (1.0 - aH);
  vec3 col = (uColor * aC + hc * aH) / max(aC + aH, 1e-4);
  gl_FragColor = vec4(col, clamp(a * uOpacity * uLayer, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export class WaveField {
  constructor(scene, maps, opts = {}) {
    this.maps = maps;
    // uma única camada rente ao chão: nada parece atravessar a parede
    const layers = opts.layers || [[0.17, 1.0]];
    this.u = {
      uMapA: { value: maps['1m'] }, uMapB: { value: maps['1m'] }, uMix: { value: 0 },
      uLamA: { value: 1 }, uLamB: { value: 1 }, uTrueA: { value: 1 }, uTrueB: { value: 1 },
      uFront: { value: 0 }, uCyc: { value: 0 },
      uCrest: { value: 1 }, uHeat: { value: 0 }, uOpacity: { value: 0 }, uFar: { value: 1 }, uNear: { value: 1 },
      uLineW: { value: 0.13 },
      uColor: { value: new THREE.Color(1, 1, 1) }, uSrc: { value: new THREE.Vector2(0, -6) },
      uFarBox: { value: new THREE.Vector3(-5.95, 5.95, -15.6) }, uClipX: { value: -1e4 },
    };
    this.meshes = [];
    const geo = new THREE.PlaneGeometry(20, 27.6, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -1.8);
    layers.forEach(([y, a], i) => {
      const uniforms = { ...this.u, uLayer: { value: a } };
      if (i > 0) uniforms.uHeat = { value: 0 }; // mapa de calor só no chão
      const m = new THREE.ShaderMaterial({
        uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y;
      mesh.renderOrder = 10 + i;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.push({ mesh, uniforms, isBase: i === 0, baseY: y });
    });
  }

  // posiciona o plano do campo: null = muro principal; {base, espelho} = no chão; {base, vertical} = plano vertical
  colocar(l) {
    for (const L of this.meshes) {
      L.mesh.position.set(0, L.baseY, 0);
      L.mesh.quaternion.identity();
      L.mesh.scale.set(1, 1, 1);
      if (!l) continue;
      if (l.vertical) {
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
        L.mesh.quaternion.setFromRotationMatrix(m);
        L.mesh.position.set(l.base[0], l.base[1], l.base[2] + L.baseY);
      } else {
        L.mesh.position.set(l.base[0], l.base[1] + L.baseY, l.base[2]);
        if (l.espelho) L.mesh.scale.x = -1;
      }
    }
  }

  // s: {a, b, mix, lamA, lamB, color, crest, heat, opacity, front, cyc, far, near, layers, lineW, src, farBox}
  set(s) {
    const u = this.u;
    // fase verdadeira do campo calculado para os casos de lambda >= 1 m
    const ph = (k) => (/(^|_)(1m|3m)$/.test(k) ? 1 : 0);
    u.uMapA.value = this.maps[s.a];
    u.uMapB.value = this.maps[s.b || s.a];
    u.uMix.value = s.mix || 0;
    u.uLamA.value = s.lamA;
    u.uLamB.value = s.lamB || s.lamA;
    u.uTrueA.value = ph(s.a);
    u.uTrueB.value = ph(s.b || s.a);
    u.uColor.value.set(s.color);
    u.uCrest.value = s.crest ?? 1;
    u.uOpacity.value = s.opacity ?? 0;
    u.uFront.value = s.front ?? 0;
    u.uCyc.value = s.cyc ?? 0;
    u.uFar.value = s.far ?? 1;
    u.uNear.value = s.near ?? 1;
    u.uLineW.value = s.lineW ?? 0.13;
    const src = s.src || [0, -6], fb = s.farBox || [-5.95, 5.95, -15.6];
    u.uSrc.value.set(src[0], src[1]);
    u.uFarBox.value.set(fb[0], fb[1], fb[2]);
    u.uClipX.value = s.clipX ?? -1e4;
    for (const L of this.meshes) {
      if (L.isBase) L.uniforms.uHeat.value = s.heat || 0;
      L.mesh.visible = (s.opacity ?? 0) > 0.001 && (L.isBase || s.layers !== false);
    }
  }
}
