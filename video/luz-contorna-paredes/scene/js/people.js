// Personagens estilizados ("brinquedo"): cabeça grande, formas arredondadas, rosto expressivo,
// sombreamento cel e contorno discreto. Mesma interface de antes (root, hips, spine, head, arms, legs).
import * as THREE from 'three';
import { toon, contorno } from './toon.js';

function malha(geo, mat, { sombra = true, linha = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = sombra;
  m.receiveShadow = true;
  if (linha) contorno(m);
  return m;
}
// cilindro arredondado que "pendura" do pivô (de 0 até -len)
function membro(r0, r1, len, mat) {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, Math.max(0.01, len - (r0 + r1) / 2), 4, 10);
  g.translate(0, -len / 2, 0);
  return malha(g, mat);
}
const esfera = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

export const PALETAS = {
  protagonista: {
    pele: 0xe2a77f, cabelo: 0x2a1d18, jaqueta: 0x2f4a8a, jaquetaEscura: 0x223766, camiseta: 0xf3efe6,
    calca: 0x34384a, tenis: 0xfbfaf6, faixa: 0xe0574a, bochecha: 0xf08c86, menina: false,
  },
  escondida: {
    pele: 0xa66b4c, cabelo: 0x3a2318, jaqueta: 0xf2855a, jaquetaEscura: 0xd96a42, camiseta: 0xf2855a,
    calca: 0x4fb3a1, tenis: 0xfbfaf6, faixa: 0xf2c14e, bochecha: 0xe2756b, menina: true,
  },
};

// visuais variados para a multidão (evita as roupas do protagonista e da amiga)
export function paletaAleatoria(r) {
  const escolha = (lista) => lista[Math.floor(r() * lista.length)];
  const pele = escolha([0xf1c7a5, 0xe2a77f, 0xc98a62, 0xa66b4c, 0x8a5538, 0x6b412b, 0xf5d3b8]);
  const cabelo = escolha([0x1d1714, 0x2a1d18, 0x4a2e1f, 0x6b4226, 0xa8743f, 0xd7b46a, 0x9c9c9c, 0x7a2f22]);
  const topo = escolha([0xf2c14e, 0x8cc084, 0x6c8fd6, 0xb58ad6, 0xe66a5a, 0x4fb3a1, 0xf4f1ea, 0xd9a05b, 0x5d6b8a, 0xef8fb1, 0x7fc6d9]);
  const calca = escolha([0x3d5a80, 0x4a5568, 0x8a7a5a, 0x2f2f38, 0x5e7d4f, 0x9b6a4f, 0x6a5c8a]);
  const tenis = escolha([0xfbfaf6, 0x2a2a30, 0xe0574a, 0xf2c14e, 0x6c8fd6]);
  return {
    pele, cabelo, jaqueta: topo, jaquetaEscura: new THREE.Color(topo).multiplyScalar(0.82).getHex(),
    camiseta: topo, calca, tenis, faixa: escolha([0xe0574a, 0xf2c14e, 0x4fb3a1, 0x6c8fd6]),
    bochecha: 0xf08c86, menina: r() < 0.5,
  };
}

export class Person {
  constructor(p) {
    this.p = p;
    const M = {
      pele: toon(p.pele), cabelo: toon(p.cabelo), jaqueta: toon(p.jaqueta), jaquetaEscura: toon(p.jaquetaEscura),
      camiseta: toon(p.camiseta), calca: toon(p.calca), tenis: toon(p.tenis), faixa: toon(p.faixa),
      branco: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      pupila: new THREE.MeshBasicMaterial({ color: 0x1c1626 }),
      boca: new THREE.MeshBasicMaterial({ color: 0x5a2230 }),
      bochecha: new THREE.MeshBasicMaterial({ color: p.bochecha, transparent: true, opacity: 0.55, depthWrite: false }),
      ziper: toon(0xd9dde6),
      sola: toon(0xdedbd4),
    };
    this.M = M;
    const root = (this.root = new THREE.Group());
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.72;
    root.add(hips);
    const pelvis = malha(esfera(0.17, 12, 8), M.calca);
    pelvis.scale.set(1.05, 0.7, 0.8);
    hips.add(pelvis);

    // pernas curtas e tênis arredondados
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0.09 * s, -0.02, 0);
      thigh.add(membro(0.08, 0.07, 0.36, M.calca));
      const knee = new THREE.Group();
      knee.position.y = -0.36;
      knee.add(membro(0.07, 0.062, 0.31, M.calca));
      const ankle = new THREE.Group();
      ankle.position.y = -0.31;
      const shoe = malha(esfera(0.085, 12, 8), M.tenis);
      shoe.scale.set(0.95, 0.62, 1.55);
      shoe.position.set(0, -0.035, 0.045);
      const sola = malha(new THREE.CylinderGeometry(0.085, 0.085, 0.025, 12), M.sola, { linha: false });
      sola.scale.set(0.95, 1, 1.55);
      sola.position.set(0, -0.075, 0.045);
      const faixa = malha(new THREE.BoxGeometry(0.012, 0.03, 0.12), M.faixa, { linha: false, sombra: false });
      faixa.position.set(0.078 * s, -0.03, 0.04);
      ankle.add(shoe, sola, faixa);
      knee.add(ankle);
      thigh.add(knee);
      hips.add(thigh);
      this.legs.push({ thigh, knee, ankle });
    }

    // tronco arredondado
    const spine = (this.spine = new THREE.Group());
    spine.position.y = 0.04;
    hips.add(spine);
    const corpo = malha(new THREE.CapsuleGeometry(0.19, 0.22, 4, 14), p.menina ? M.jaqueta : M.camiseta);
    corpo.scale.set(1.08, 1, 0.78);
    corpo.position.y = 0.24;
    spine.add(corpo);
    if (!p.menina) {
      // jaqueta aberta: duas metades + gola + zíper + bolsos
      for (const s of [-1, 1]) {
        // metades da jaqueta afastadas: a camiseta aparece no meio
        const lado = malha(new THREE.CapsuleGeometry(0.2, 0.22, 4, 14), M.jaqueta);
        lado.scale.set(0.52, 1.02, 0.86);
        lado.position.set(0.128 * s, 0.24, -0.01);
        spine.add(lado);
        const bolso = malha(new THREE.BoxGeometry(0.07, 0.05, 0.02), M.jaquetaEscura, { linha: false });
        bolso.position.set(0.14 * s, 0.11, 0.16);
        bolso.rotation.y = 0.3 * s;
        spine.add(bolso);
        const ziper = malha(new THREE.BoxGeometry(0.01, 0.34, 0.01), M.ziper, { linha: false, sombra: false });
        ziper.position.set(0.03 * s, 0.25, 0.165);
        spine.add(ziper);
      }
      const gola = malha(new THREE.TorusGeometry(0.115, 0.035, 6, 16), M.jaquetaEscura);
      gola.rotation.x = Math.PI / 2 + 0.25;
      gola.position.set(0, 0.47, -0.005);
      spine.add(gola);
    } else {
      // blusa colorida com barra
      const barra = malha(new THREE.TorusGeometry(0.17, 0.03, 6, 18), M.jaquetaEscura, { linha: false });
      barra.rotation.x = Math.PI / 2;
      barra.scale.set(1.08, 0.8, 1);
      barra.position.y = 0.06;
      spine.add(barra);
    }

    // cabeça grande
    const neck = malha(new THREE.CylinderGeometry(0.06, 0.065, 0.08, 10), M.pele, { linha: false });
    neck.position.y = 0.5;
    spine.add(neck);
    const head = (this.head = new THREE.Group());
    head.position.y = 0.52;
    spine.add(head);
    const cranio = malha(esfera(0.2, 18, 14), M.pele);
    cranio.scale.set(1, 0.96, 0.94);
    cranio.position.y = 0.19;
    head.add(cranio);
    this.eyeLocal = new THREE.Vector3(0, 0.2, 0.2);
    // olhos com brilho (piscam)
    this.olhos = [];
    for (const s of [-1, 1]) {
      const olho = new THREE.Group();
      olho.position.set(0.07 * s, 0.2, 0.175);
      const branco = new THREE.Mesh(esfera(0.042, 12, 8), M.branco);
      branco.scale.set(0.85, 1.05, 0.5);
      const pup = new THREE.Mesh(esfera(0.026, 10, 8), M.pupila);
      pup.position.set(0, -0.004, 0.016);
      pup.scale.set(1, 1.1, 0.6);
      const brilho = new THREE.Mesh(esfera(0.008, 6, 4), M.branco);
      brilho.position.set(0.008, 0.01, 0.03);
      olho.add(branco, pup, brilho);
      head.add(olho);
      this.olhos.push(olho);
      const sob = malha(new THREE.CapsuleGeometry(0.009, 0.04, 2, 6), M.cabelo, { linha: false, sombra: false });
      sob.rotation.z = Math.PI / 2 - 0.12 * s;
      sob.position.set(0.072 * s, 0.268, 0.172);
      head.add(sob);
      (this.sobrancelhas ||= []).push(sob);
      const boch = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), M.bochecha);
      boch.position.set(0.118 * s, 0.135, 0.162);
      boch.rotation.y = 0.55 * s;
      head.add(boch);
      const orelha = malha(esfera(0.038, 8, 6), M.pele);
      orelha.scale.set(0.6, 1, 0.8);
      orelha.position.set(0.198 * s, 0.18, -0.005);
      head.add(orelha);
    }
    const nariz = malha(esfera(0.022, 8, 6), M.pele, { linha: false });
    nariz.scale.set(1, 0.85, 0.8);
    nariz.position.set(0, 0.155, 0.19);
    head.add(nariz);
    // sorriso (arco) e boca aberta (disco)
    this.sorriso = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 4, 10, Math.PI), M.boca);
    this.sorriso.rotation.z = Math.PI;
    this.sorriso.position.set(0, 0.112, 0.176);
    head.add(this.sorriso);
    this.mouth = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), M.boca);
    this.mouth.position.set(0, 0.1, 0.18);
    this.mouth.scale.set(1, 0.2, 1);
    head.add(this.mouth);

    // cabelo
    const capa = malha(new THREE.SphereGeometry(0.212, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), M.cabelo);
    capa.scale.set(1.02, 1.0, 0.98);
    capa.position.set(0, 0.2, -0.012);
    capa.rotation.x = -0.32;
    head.add(capa);
    const nuca = malha(esfera(0.19, 12, 8), M.cabelo);
    nuca.scale.set(1.02, 0.8, 0.7);
    nuca.position.set(0, 0.15, -0.07);
    head.add(nuca);
    if (!p.menina) {
      // topete com mechas
      const mechas = [[-0.08, 0.36, 0.1, 0.5], [-0.01, 0.39, 0.11, 0.2], [0.07, 0.37, 0.09, -0.35], [0.12, 0.33, 0.05, -0.7]];
      for (const [x, y, z, rz] of mechas) {
        const m = malha(new THREE.ConeGeometry(0.06, 0.13, 6), M.cabelo);
        m.position.set(x, y, z);
        m.rotation.set(0.9, 0, rz);
        head.add(m);
      }
    } else {
      // franja e rabo de cavalo que balança
      for (const [x, rz] of [[-0.09, 0.5], [0, 0], [0.09, -0.5]]) {
        const f = malha(esfera(0.07, 8, 6), M.cabelo);
        f.scale.set(1, 0.7, 0.7);
        f.position.set(x, 0.33, 0.13);
        f.rotation.z = rz;
        head.add(f);
      }
      const prende = malha(new THREE.TorusGeometry(0.035, 0.014, 6, 12), M.faixa, { linha: false });
      prende.position.set(0, 0.3, -0.17);
      prende.rotation.x = 0.6;
      head.add(prende);
      this.rabo = new THREE.Group();
      this.rabo.position.set(0, 0.3, -0.19);
      head.add(this.rabo);
      let pai = this.rabo;
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Group();
        seg.position.y = i === 0 ? 0 : -0.08;
        const bola = malha(esfera(0.07 - i * 0.013, 10, 8), M.cabelo);
        bola.position.y = -0.045;
        bola.scale.set(0.9, 1.2, 0.9);
        seg.add(bola);
        pai.add(seg);
        pai = seg;
        (this.raboSeg ||= []).push(seg);
      }
    }

    // braços com mãos redondas
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.235 * s, 0.4, 0);
      sh.add(membro(0.062, 0.055, 0.24, M.jaqueta));
      const el = new THREE.Group();
      el.position.y = -0.24;
      el.add(membro(0.055, 0.05, 0.21, p.menina ? M.pele : M.jaqueta));
      const hand = new THREE.Group();
      hand.position.y = -0.21;
      const palma = malha(esfera(0.058, 10, 8), M.pele);
      palma.position.y = -0.04;
      palma.scale.set(0.95, 1.05, 0.85);
      const polegar = malha(esfera(0.025, 8, 6), M.pele, { linha: false });
      polegar.position.set(-0.045 * s, -0.03, 0.03);
      hand.add(palma, polegar);
      el.add(hand);
      sh.add(el);
      spine.add(sh);
      this.arms.push({ sh, el, hand });
    }
    if (p.simples) this.simplificar();
    if (p.escala) this.root.scale.setScalar(p.escala);
  }

  // versão leve para a multidão: sem contorno, sem detalhes minúsculos, sombra só das partes grandes
  simplificar() {
    const remover = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.contorno) { remover.push(o); return; }
      o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z);
      const essencial = o.material === this.M.pupila || o === this.mouth || o === this.sorriso;
      if (r < 0.03 && !essencial) remover.push(o);
      o.castShadow = r > 0.1;
    });
    for (const o of remover) o.parent.remove(o);
    this.sobrancelhas = [];
  }

  // pose: {walk, amt, headYaw, headPitch, headRoll, torsoYaw, lean, armR, armL, mouthOpen,
  //        blink (0..1), brow (0..1 surpresa), smile (0..1), tail (balanço do rabo de cavalo), crouch}
  pose(o = {}) {
    const ph = o.walk || 0;
    const a = o.amt || 0;
    const [L, R] = this.legs;
    const sw = Math.sin(ph);
    const crouch = o.crouch || 0;
    const sent = o.sentado || 0;
    L.thigh.rotation.x = -sw * 0.55 * a - 1.3 * crouch - 1.45 * sent;
    R.thigh.rotation.x = sw * 0.55 * a - 1.3 * crouch - 1.45 * sent;
    L.knee.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 0.8 * a + 2.0 * crouch + 1.45 * sent;
    R.knee.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 1.2)) * 0.8 * a + 2.0 * crouch + 1.45 * sent;
    L.ankle.rotation.x = -L.thigh.rotation.x * 0.3 - L.knee.rotation.x * 0.25 - 0.4 * crouch;
    R.ankle.rotation.x = -R.thigh.rotation.x * 0.3 - R.knee.rotation.x * 0.25 - 0.4 * crouch;
    // quique na caminhada; agachar abaixa o quadril
    this.hips.position.y = 0.72 + Math.abs(Math.cos(ph)) * 0.05 * a - 0.02 * a - 0.33 * crouch - 0.24 * sent;
    this.hips.rotation.y = sw * 0.1 * a;
    this.spine.rotation.y = -sw * 0.14 * a + (o.torsoYaw || 0);
    this.spine.rotation.x = 0.05 * a + (o.lean || 0) + 0.35 * crouch;
    this.spine.rotation.z = sw * 0.04 * a;
    this.head.rotation.y = (o.headYaw || 0) + sw * 0.05 * a;
    this.head.rotation.x = (o.headPitch || 0) - 0.3 * crouch;
    this.head.rotation.z = (o.headRoll || 0) - sw * 0.04 * a;
    const [AL, AR] = this.arms;
    const base = (arm, side, cfg) => {
      arm.sh.rotation.set(0, 0, 0.12 * side);
      arm.el.rotation.set(0, 0, 0);
      arm.hand.rotation.set(0, 0, 0);
      if (cfg) {
        arm.sh.rotation.set(cfg.sh[0], cfg.sh[1], cfg.sh[2]);
        arm.el.rotation.x = cfg.el;
        if (cfg.hand) arm.hand.rotation.set(cfg.hand[0], cfg.hand[1], cfg.hand[2]);
      }
    };
    base(AL, -1, o.armL);
    base(AR, 1, o.armR);
    AL.sh.rotation.x += sw * 0.5 * a;
    AR.sh.rotation.x += -sw * 0.5 * a;
    AL.el.rotation.x += -0.3 * a;
    AR.el.rotation.x += -0.3 * a;
    // rosto
    const bl = 1 - 0.92 * (o.blink || 0);
    for (const ol of this.olhos) ol.scale.y = bl;
    const br = o.brow || 0;
    (this.sobrancelhas || []).forEach((s) => (s.position.y = 0.268 + 0.025 * br));
    const mo = o.mouthOpen || 0;
    this.mouth.scale.set(1 + 0.3 * mo, 0.2 + 1.6 * mo, 1);
    this.mouth.visible = mo > 0.05;
    this.sorriso.visible = mo <= 0.05;
    this.sorriso.scale.set(1, 0.6 + 0.6 * (o.smile ?? 0.5), 1);
    if (this.raboSeg) {
      const tl = o.tail || 0;
      this.raboSeg.forEach((sg, i) => { sg.rotation.x = 0.35 + 0.15 * i - 0.2 * crouch; sg.rotation.z = tl * (0.5 + 0.3 * i); });
    }
  }
}
