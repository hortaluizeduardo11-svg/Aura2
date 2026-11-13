// Personagens low-poly montados com primitivas facetadas.
import * as THREE from 'three';

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });

function box(w, h, d, m) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function limb(rTop, rBot, len, m, seg = 6) {
  // cilindro facetado que "pendura" a partir do pivô (de 0 até -len)
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  g.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export const PALETAS = {
  protagonista: {
    pele: 0xc58d68, cabelo: 0x1c1512, jaqueta: 0x2c3f6e, jaquetaEscura: 0x223259, camiseta: 0xece8de,
    calca: 0x34363e, tenis: 0xf5f4f0, sola: 0xcfcfcf, barba: false, coque: false,
  },
  escondida: {
    pele: 0x8e5b3d, cabelo: 0x24160f, jaqueta: 0xd08a3a, jaquetaEscura: 0xb87430, camiseta: 0xd08a3a,
    calca: 0x39445c, tenis: 0xf0ece6, sola: 0xcfc9c0, barba: false, coque: true,
  },
};

export class Person {
  constructor(p) {
    this.p = p;
    const M = {
      pele: mat(p.pele), cabelo: mat(p.cabelo), jaqueta: mat(p.jaqueta), jaquetaEscura: mat(p.jaquetaEscura),
      camiseta: mat(p.camiseta), calca: mat(p.calca), tenis: mat(p.tenis), sola: mat(p.sola),
      olho: mat(0x14110f, { roughness: 0.4 }), boca: mat(0x7a3f33),
    };
    this.M = M;
    const root = (this.root = new THREE.Group());
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.9;
    root.add(hips);
    // quadril
    const pelvis = box(0.34, 0.16, 0.2, M.calca);
    pelvis.position.y = 0.02;
    hips.add(pelvis);

    // pernas
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0.095 * s, 0, 0);
      thigh.add(limb(0.085, 0.07, 0.43, M.calca));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      knee.add(limb(0.068, 0.055, 0.41, M.calca));
      const ankle = new THREE.Group();
      ankle.position.y = -0.41;
      const shoe = box(0.12, 0.09, 0.28, M.tenis);
      shoe.position.set(0, -0.025, 0.06);
      const sole = box(0.125, 0.03, 0.29, M.sola);
      sole.position.set(0, -0.07, 0.06);
      ankle.add(shoe, sole);
      knee.add(ankle);
      thigh.add(knee);
      hips.add(thigh);
      this.legs.push({ thigh, knee, ankle });
    }

    // tronco
    const spine = (this.spine = new THREE.Group());
    spine.position.y = 0.08;
    hips.add(spine);
    const shirt = box(0.3, 0.56, 0.2, M.camiseta);
    shirt.position.y = 0.3;
    spine.add(shirt);
    if (p.coque) {
      // blusa inteira, sem jaqueta aberta
      const top = box(0.37, 0.58, 0.23, M.jaqueta);
      top.position.y = 0.3;
      spine.add(top);
    } else {
      for (const s of [-1, 1]) {
        const panel = box(0.135, 0.6, 0.235, M.jaqueta);
        panel.position.set(0.118 * s, 0.3, 0.002);
        spine.add(panel);
        const lapel = box(0.05, 0.2, 0.02, M.jaquetaEscura);
        lapel.position.set(0.07 * s, 0.48, 0.12);
        lapel.rotation.z = 0.25 * s;
        spine.add(lapel);
      }
      const back = box(0.38, 0.6, 0.06, M.jaqueta);
      back.position.set(0, 0.3, -0.09);
      spine.add(back);
      const hem = box(0.4, 0.06, 0.25, M.jaquetaEscura);
      hem.position.set(0, 0.02, 0);
      spine.add(hem);
      const collar = box(0.34, 0.06, 0.24, M.jaquetaEscura);
      collar.position.set(0, 0.6, -0.01);
      spine.add(collar);
    }
    const shoulders = box(0.44, 0.1, 0.22, p.coque ? M.jaqueta : M.jaqueta);
    shoulders.position.y = 0.55;
    spine.add(shoulders);

    // pescoço e cabeça
    const neck = limb(0.05, 0.055, 0.1, M.pele);
    neck.position.y = 0.66;
    spine.add(neck);
    const head = (this.head = new THREE.Group());
    head.position.y = 0.6;
    spine.add(head);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 1), M.pele);
    skull.scale.set(0.95, 1.13, 1.0);
    skull.position.y = 0.12;
    skull.castShadow = true;
    head.add(skull);
    // cabelo: calota superior + nuca
    const capG = new THREE.SphereGeometry(0.125, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const cap = new THREE.Mesh(capG, M.cabelo);
    cap.position.set(0, 0.16, -0.008);
    cap.scale.set(1.0, 0.95, 1.05);
    cap.rotation.x = -0.18;
    cap.castShadow = true;
    head.add(cap);
    const nape = box(0.2, 0.13, 0.08, M.cabelo);
    nape.position.set(0, 0.11, -0.085);
    head.add(nape);
    if (p.coque) {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), M.cabelo);
      bun.position.set(0, 0.26, -0.08);
      bun.castShadow = true;
      head.add(bun);
      for (const s of [-1, 1]) {
        const side = box(0.03, 0.08, 0.1, M.cabelo);
        side.position.set(0.106 * s, 0.18, -0.04);
        head.add(side);
      }
    } else {
      const fringe = box(0.2, 0.04, 0.05, M.cabelo);
      fringe.position.set(0, 0.235, 0.075);
      fringe.rotation.x = 0.3;
      head.add(fringe);
      for (const s of [-1, 1]) {
        const side = box(0.025, 0.08, 0.1, M.cabelo);
        side.position.set(0.108 * s, 0.17, -0.01);
        head.add(side);
      }
    }
    // rosto
    for (const s of [-1, 1]) {
      const eye = box(0.019, 0.025, 0.012, M.olho);
      eye.position.set(0.04 * s, 0.135, 0.108);
      head.add(eye);
      const brow = box(0.045, 0.011, 0.012, M.cabelo);
      brow.position.set(0.042 * s, 0.168, 0.106);
      brow.rotation.z = -0.08 * s;
      head.add(brow);
    }
    const nose = box(0.025, 0.045, 0.03, M.pele);
    nose.position.set(0, 0.105, 0.118);
    head.add(nose);
    const mouth = (this.mouth = box(0.045, 0.01, 0.01, M.boca));
    mouth.position.set(0, 0.06, 0.103);
    head.add(mouth);
    for (const s of [-1, 1]) {
      const ear = box(0.02, 0.05, 0.035, M.pele);
      ear.position.set(0.112 * s, 0.12, 0);
      head.add(ear);
    }

    // braços
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.225 * s, 0.53, 0);
      const sleeveM = p.coque ? M.pele : M.jaqueta;
      sh.add(limb(0.06, 0.052, 0.3, p.coque ? M.jaqueta : M.jaqueta));
      const el = new THREE.Group();
      el.position.y = -0.3;
      el.add(limb(0.05, 0.042, 0.26, sleeveM));
      const hand = new THREE.Group();
      hand.position.y = -0.26;
      const palm = box(0.07, 0.09, 0.04, M.pele);
      palm.position.y = -0.045;
      hand.add(palm);
      const thumb = box(0.025, 0.05, 0.025, M.pele);
      thumb.position.set(-0.03 * s, -0.03, 0.025);
      hand.add(thumb);
      el.add(hand);
      sh.add(el);
      spine.add(sh);
      this.arms.push({ sh, el, hand });
    }
  }

  // pose: {walk: fase (rad), amt: 0..1, headYaw, headPitch, torsoYaw,
  //        armR: {sh:[x,y,z], el}, armL: {...}, mouthOpen}
  pose(o = {}) {
    const ph = o.walk || 0;
    const a = o.amt || 0;
    const [L, R] = this.legs;
    const sw = Math.sin(ph);
    L.thigh.rotation.x = -sw * 0.5 * a;
    R.thigh.rotation.x = sw * 0.5 * a;
    L.knee.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 0.75 * a;
    R.knee.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 1.2)) * 0.75 * a;
    L.ankle.rotation.x = -L.thigh.rotation.x * 0.3 - L.knee.rotation.x * 0.2;
    R.ankle.rotation.x = -R.thigh.rotation.x * 0.3 - R.knee.rotation.x * 0.2;
    this.hips.position.y = 0.9 + Math.abs(Math.cos(ph)) * 0.035 * a - 0.015 * a;
    this.hips.rotation.y = sw * 0.08 * a;
    this.spine.rotation.y = -sw * 0.12 * a + (o.torsoYaw || 0);
    this.spine.rotation.x = 0.04 * a + (o.lean || 0);
    this.head.rotation.y = (o.headYaw || 0) + sw * 0.04 * a;
    this.head.rotation.x = o.headPitch || 0;
    const [AL, AR] = this.arms;
    const base = (arm, side, cfg) => {
      arm.sh.rotation.set(0, 0, 0.07 * side);
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
    // balanço dos braços na caminhada (somado)
    AL.sh.rotation.x += sw * 0.42 * a;
    AR.sh.rotation.x += -sw * 0.42 * a;
    AL.el.rotation.x += -0.25 * a;
    AR.el.rotation.x += -0.25 * a;
    this.mouth.scale.y = 1 + (o.mouthOpen || 0) * 3.5;
  }
}
