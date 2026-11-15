/* AURA: Genesis 2 — creatures.js
 * Models for the creatures of deep time, the sea, legend and other worlds, built like the
 * animals of models3d.js (merged low-poly parts, one instanced bank per kind, tinted per species):
 * trilobites, sea scorpions, anomalocarids, nautiloids and ammonites, jawless, armoured and bony
 * fish, early sharks, ichthyosaurs, plesiosaurs and mosasaurs; giant millipedes, dragonflies and
 * scorpions, sail-backs and sabre-toothed synapsids, sauropods, stegosaurs, horned and armoured
 * dinosaurs, duckbills, raptors and tyrants, pterosaurs; terror birds, early horses and elephants;
 * the sea today (sardines, cod, tuna, reef fish, sharks, rays, turtles, octopus, giant squid,
 * dolphins, orcas, seals, dugongs, whales); unicorns, griffins, manticores, phoenixes, rocs, yetis,
 * behemoths, hippocampi, sea serpents and leviathans; striders, stalkers, skyrays, greys, glow
 * jellies and void squid. Every model is one unit long along +z (head forward); walkers stand on
 * y = 0, swimmers and flyers are centred on it. Sizes are real: a kind's length in metres runs
 * from its smallest to its largest with the species' SIZE gene. */
'use strict';
(function () {
  const AG = window.AG, M = AG.Models3D;
  if (!M) return;
  const G = (v) => [v, v, v];
  const B = G(255), BL = G(232), MD = G(170), DK = G(78), EY = [16, 14, 12], HR = [236, 226, 200], RED = [200, 60, 50];
  // ------------------------------------------------------------ helpers
  function eyes(p, x, y, z, s, c) { for (const sx of [-1, 1]) p.add('cbox', c || EY, sx * x, y, z, s, s, s * 0.7); }
  // a box from point a to point b (in the y-z plane), w wide and h high
  function seg(p, c, a, b, w, h, g) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    if (dz < 0) { dx = -dx; dy = -dy; dz = -dz; } // (a box is the same either way round: point it forward)
    const len = Math.hypot(dx, dy, dz) || 0.001;
    p.add(g || 'cbox', c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, w, h, len, -Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
  }
  // a tapering chain through points (widths and heights per point)
  function chain(p, c, pts, ws, hs, g) { for (let k = 0; k < pts.length - 1; k++) seg(p, c, pts[k], pts[k + 1], (ws[k] + ws[k + 1]) / 2, (hs[k] + hs[k + 1]) / 2, g); }
  function legs(p, c, xs, zs, top, w, foot) { for (const x of xs) for (const z of zs) { p.add('box', c, x, 0, z, w, top, w); if (foot) p.add('box', foot, x, 0, z + w * 0.15, w * 1.2, w * 0.4, w * 1.4); } }
  function fins(p, c, x, y, z, sx, sz, tilt) { for (const k of [-1, 1]) p.add('cbox', c, k * x, y, z, sx, 0.012, sz, 0, k * 0.4, k * (tilt || 0.3)); }
  function tentacles(p, c, n, r, y, len, w, droop) { for (let q = 0; q < n; q++) { const a = (q / n) * Math.PI * 2; p.add('cbox', c, Math.cos(a) * r, y - len * (droop || 0.5), Math.sin(a) * r * 0.6 + 0.1, w, len, w, 0.3 * Math.sin(a), 0, 0.3 * Math.cos(a)); } }

  // ------------------------------------------------------------ swimmers
  function fish(o) { // a fish of any kind: o.d depth, o.w width, armour, lobes, jawless, beak, dorsal height, tail height
    const p = M._parts(), d = o.d || 0.28, w = o.w || 0.16;
    p.add('ico', B, 0, 0, 0.02, w, d, 0.84);
    p.add('ico', BL, 0, -d * 0.18, 0.06, w * 0.86, d * 0.6, 0.7);
    if (o.armour) { p.add('cbox', MD, 0, d * 0.05, 0.3, w * 1.12, d * 0.8, 0.28); p.add('cbox', DK, 0, -d * 0.2, 0.42, w * 0.9, d * 0.25, 0.14); }
    if (o.beak) seg(p, B, [0, 0, 0.42], [0, -0.01, 0.42 + o.beak], 0.04, 0.03);
    const th = o.tail || d * 1.2;
    p.add('cbox', B, 0, th * 0.25, -0.46, 0.02, th * 0.6, 0.16, 0.6); p.add('cbox', B, 0, -th * 0.25, -0.46, 0.02, th * 0.6, 0.16, -0.6);
    if (!o.jawless) p.add('cbox', B, 0, d * 0.45 + (o.dorsal || 0.08) / 2, -0.02, 0.016, o.dorsal || 0.08, 0.22, -0.4);
    if (o.lobes) for (const z of [0.15, -0.15]) fins(p, MD, w * 0.6, -d * 0.3, z, 0.12, 0.06, 0.6); else if (!o.jawless) fins(p, B, w * 0.6, -d * 0.2, 0.15, 0.1, 0.06, 0.4);
    eyes(p, w * 0.42, d * 0.12, 0.33, o.eye || 0.04);
    if (o.stripes) for (let q = 0; q < 3; q++) p.add('cbox', DK, 0, 0, 0.18 - q * 0.18, w * 1.04, d * 0.86, 0.035);
    return p.geo();
  }
  function shark(o) {
    const p = M._parts();
    p.add('ico', B, 0, 0, 0.02, 0.17, 0.2, 0.92); p.add('ico', BL, 0, -0.05, 0.05, 0.15, 0.12, 0.8);
    p.add('cbox', B, 0, 0.16, 0.02, 0.016, o.fin || 0.16, 0.12, -0.5);
    p.add('cbox', B, 0, 0.1, -0.47, 0.02, 0.22, 0.1, 0.8); p.add('cbox', B, 0, -0.06, -0.46, 0.02, 0.12, 0.08, -0.7);
    fins(p, B, 0.14, -0.07, 0.12, 0.16, 0.08, 0.5);
    eyes(p, 0.07, 0.03, 0.34, 0.025);
    for (let q = 0; q < 4; q++) p.add('cbox', DK, 0, -0.02, 0.24 - q * 0.025, 0.175, 0.07, 0.008);
    return p.geo();
  }
  function marineReptile(o) { // ichthyosaur, plesiosaur, mosasaur
    const p = M._parts();
    if (o.kind === 'plesio') {
      p.add('ico', B, 0, 0, -0.08, 0.28, 0.18, 0.42); p.add('ico', BL, 0, -0.04, -0.08, 0.24, 0.1, 0.38);
      chain(p, B, [[0, 0.02, 0.12], [0, 0.07, 0.3], [0, 0.11, 0.45]], [0.07, 0.05, 0.04], [0.07, 0.05, 0.04]);
      p.add('cbox', B, 0, 0.11, 0.49, 0.05, 0.04, 0.08); eyes(p, 0.025, 0.12, 0.5, 0.012);
      for (const z of [0.04, -0.2]) fins(p, B, 0.17, -0.05, z, 0.22, 0.07, 0.3);
      chain(p, B, [[0, 0, -0.28], [0, 0, -0.5]], [0.06, 0.01], [0.06, 0.01]);
    } else if (o.kind === 'mosa') {
      chain(p, B, [[0, 0, 0.42], [0, 0, 0.1], [0, 0, -0.2], [0, 0, -0.45]], [0.1, 0.16, 0.1, 0.03], [0.08, 0.14, 0.09, 0.04]);
      p.add('cbox', BL, 0, -0.05, 0.05, 0.13, 0.04, 0.5);
      p.add('cbox', B, 0, 0.0, 0.48, 0.07, 0.05, 0.14); p.add('cbox', HR, 0, -0.03, 0.5, 0.06, 0.01, 0.1); eyes(p, 0.04, 0.02, 0.43, 0.015);
      for (const z of [0.22, -0.08]) fins(p, B, 0.11, -0.04, z, 0.14, 0.06, 0.4);
      p.add('cbox', B, 0, -0.06, -0.48, 0.02, 0.14, 0.08, -0.6);
    } else { // ichthyosaur: a reptile shaped like a dolphin, with a long beak and a huge eye
      p.add('ico', B, 0, 0, 0, 0.2, 0.24, 0.78); p.add('ico', BL, 0, -0.06, 0.02, 0.17, 0.12, 0.66);
      seg(p, B, [0, 0, 0.36], [0, -0.01, 0.52], 0.04, 0.035);
      p.add('cbox', B, 0, 0.17, 0.0, 0.016, 0.12, 0.1, -0.4);
      p.add('cbox', B, 0, 0.1, -0.44, 0.02, 0.18, 0.08, 0.6); p.add('cbox', B, 0, -0.1, -0.44, 0.02, 0.18, 0.08, -0.6);
      fins(p, B, 0.12, -0.08, 0.14, 0.14, 0.06, 0.4);
      eyes(p, 0.08, 0.04, 0.3, 0.05); eyes(p, 0.085, 0.04, 0.3, 0.02, G(230));
    }
    return p.geo();
  }
  function whale(o) { // baleen whale, early whale, orca, dolphin, dugong, seal
    const p = M._parts(), k = o.kind;
    if (k === 'seal') {
      p.add('ico', B, 0, 0, 0.02, 0.24, 0.22, 0.86); p.add('ico', B, 0, 0.04, 0.4, 0.15, 0.14, 0.2); eyes(p, 0.05, 0.07, 0.48, 0.02);
      fins(p, B, 0.12, -0.08, 0.16, 0.14, 0.08, 0.6); for (const sx of [-1, 1]) p.add('cbox', B, sx * 0.04, -0.02, -0.46, 0.08, 0.02, 0.12, 0, sx * 0.4);
      return p.geo();
    }
    const fat = k === 'dugong' ? 0.34 : k === 'baleen' ? 0.26 : k === 'early' ? 0.13 : 0.22, len = k === 'early' ? 0.96 : 0.84;
    p.add('ico', B, 0, 0, 0.02, fat, fat * 1.05, len); p.add('ico', BL, 0, -fat * 0.25, 0.04, fat * 0.86, fat * 0.6, len * 0.85);
    if (k === 'baleen') for (let q = 0; q < 6; q++) p.add('cbox', MD, (q - 2.5) * 0.03, -fat * 0.5, 0.2, 0.01, 0.01, 0.4);
    if (k === 'dolphin') seg(p, B, [0, -0.02, 0.4], [0, -0.03, 0.5], 0.05, 0.04);
    if (k !== 'dugong') p.add('cbox', B, 0, fat * 0.48 + (k === 'orca' ? 0.12 : 0.04), -0.05, 0.016, k === 'orca' ? 0.26 : 0.08, 0.1, -0.3);
    if (k === 'orca') { p.add('cbox', G(250), 0, -0.02, 0.12, fat * 1.06, 0.07, 0.3); for (const sx of [-1, 1]) p.add('cbox', G(250), sx * fat * 0.45, 0.06, 0.3, 0.02, 0.05, 0.08); }
    for (const sx of [-1, 1]) p.add('cbox', B, sx * 0.08, 0, -0.47, 0.16, 0.02, 0.1, 0, sx * 0.3); // flukes
    fins(p, B, fat * 0.7, -fat * 0.4, 0.2, 0.16, 0.07, 0.6);
    eyes(p, fat * 0.6, 0, 0.3, 0.02);
    return p.geo();
  }
  function turtle() {
    const p = M._parts();
    p.add('mound', B, 0, 0.03, 0, 0.6, 0.22, 0.7); p.add('cbox', BL, 0, -0.05, 0, 0.5, 0.06, 0.6);
    for (let q = 0; q < 5; q++) p.add('cbox', DK, (q - 2) * 0.1, 0.1, 0, 0.012, 0.012, 0.5);
    p.add('ico', MD, 0, 0.0, 0.42, 0.14, 0.12, 0.18); eyes(p, 0.05, 0.03, 0.48, 0.02);
    fins(p, MD, 0.34, -0.03, 0.18, 0.36, 0.12, 0.35); fins(p, MD, 0.22, -0.03, -0.28, 0.18, 0.1, 0.2);
    return p.geo();
  }
  function ray(glow) {
    const p = M._parts();
    p.add('prism', B, 0, -0.02, -0.02, 1.0, 0.07, 0.62, 0, 0, 0); // the flat wings (a low gable, ridge along z)
    p.add('cbox', BL, 0, -0.03, 0, 0.3, 0.03, 0.5);
    for (const sx of [-1, 1]) p.add('cbox', B, sx * 0.08, 0, 0.33, 0.04, 0.03, 0.12);
    seg(p, B, [0, 0, -0.3], [0, 0, -0.5], 0.015, 0.015);
    eyes(p, 0.12, 0.03, 0.26, 0.02, glow ? G(255) : null);
    return p.geo();
  }
  function cephalopod(o) { // octopus, squid, nautiloid, ammonite, orthocone
    const p = M._parts(), k = o.kind;
    if (k === 'octopus') {
      p.add('ico', B, 0, 0.08, -0.12, 0.36, 0.32, 0.42); eyes(p, 0.1, 0.05, 0.04, 0.04);
      for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; chain(p, B, [[0, -0.04, 0.05], [Math.cos(a) * 0.2, -0.1, 0.05 + Math.sin(a) * 0.2], [Math.cos(a) * 0.38, -0.08 + Math.sin(q) * 0.05, 0.08 + Math.sin(a) * 0.36]], [0.07, 0.045, 0.015], [0.07, 0.045, 0.015]); }
    } else if (k === 'squid' || k === 'void') {
      p.add('cone', B, 0, 0, -0.08, 0.16, 0.5, 0.16, Math.PI / 2 * -1); // the mantle points back
      p.add('ico', B, 0, 0, -0.02, 0.17, 0.17, 0.4);
      for (const sx of [-1, 1]) p.add('cbox', B, sx * 0.1, 0, -0.42, 0.14, 0.01, 0.1, 0, sx * 0.3);
      eyes(p, 0.08, 0.02, 0.12, 0.04, k === 'void' ? G(255) : null);
      for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; seg(p, B, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.16], [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.38], 0.02, 0.02); }
      for (const sx of [-1, 1]) seg(p, B, [sx * 0.02, 0, 0.16], [sx * 0.06, -0.02, 0.5], 0.012, 0.012);
      if (k === 'void') for (let q = 0; q < 8; q++) p.add('cbox', G(255), ((q % 2) - 0.5) * 0.16, ((q * 7) % 3 - 1) * 0.05, -0.28 + q * 0.05, 0.02, 0.02, 0.02);
    } else if (k === 'orthocone') {
      p.add('cone', B, 0, 0, 0.1, 0.18, 0.62, 0.18, -Math.PI / 2);
      for (let q = 0; q < 6; q++) p.add('cyl', DK, 0, 0, 0.05 - q * 0.08, 0.17 - q * 0.02, 0.008, 0.17 - q * 0.02, Math.PI / 2);
      for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; seg(p, BL, [Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.1], [Math.cos(a) * 0.09, Math.sin(a) * 0.09 - 0.03, 0.36], 0.018, 0.018); }
      eyes(p, 0.06, 0.04, 0.12, 0.025);
    } else { // nautiloid and ammonite: a coiled shell
      for (let q = 0; q < 10; q++) { const a = q * 0.62, r = 0.3 - q * 0.024; p.add('ico', q % 2 ? B : BL, 0, Math.sin(a) * r * 0.8 + 0.05, -0.08 + Math.cos(a) * r * 0.8, 0.22 - q * 0.012, 0.18 - q * 0.012, 0.18 - q * 0.012); }
      if (k === 'ammonite') for (let q = 0; q < 8; q++) { const a = q * 0.78; p.add('cbox', DK, 0, Math.sin(a) * 0.22 + 0.05, -0.08 + Math.cos(a) * 0.22, 0.23, 0.01, 0.06, a); }
      for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; seg(p, BL, [Math.cos(a) * 0.04, Math.sin(a) * 0.04 - 0.05, 0.2], [Math.cos(a) * 0.07, Math.sin(a) * 0.07 - 0.08, 0.42], 0.018, 0.018); }
      eyes(p, 0.07, -0.02, 0.22, 0.03);
    }
    return p.geo();
  }
  function arthropod(o) { // trilobite, sea scorpion, anomalocarid, scorpion, centipede, millipede
    const p = M._parts(), k = o.kind;
    if (k === 'trilobite') {
      p.add('mound', B, 0, 0.02, 0, 0.62, 0.12, 0.95); p.add('cbox', MD, 0, 0.06, 0, 0.18, 0.06, 0.9);
      p.add('mound', B, 0, 0.03, 0.34, 0.74, 0.12, 0.34);
      for (let q = 0; q < 8; q++) p.add('cbox', DK, 0, 0.06, 0.2 - q * 0.08, 0.6 - q * 0.04, 0.012, 0.012);
      eyes(p, 0.16, 0.08, 0.36, 0.05, MD);
      return p.geo();
    }
    if (k === 'anomalocarid') {
      for (let q = 0; q < 11; q++) { const z = 0.3 - q * 0.07; p.add('cbox', B, 0, 0, z, 0.22 - Math.abs(q - 4) * 0.012, 0.06, 0.07); for (const sx of [-1, 1]) p.add('cbox', BL, sx * 0.15, 0, z, 0.12, 0.01, 0.07, 0, 0, sx * 0.2); }
      for (const sx of [-1, 1]) { chain(p, MD, [[sx * 0.04, -0.02, 0.36], [sx * 0.05, -0.05, 0.48], [sx * 0.03, -0.1, 0.5]], [0.03, 0.025, 0.02], [0.03, 0.025, 0.02]); seg(p, B, [sx * 0.05, 0.03, 0.34], [sx * 0.1, 0.07, 0.38], 0.012, 0.012); p.add('ico', EY, sx * 0.11, 0.08, 0.39, 0.035, 0.035, 0.035); }
      for (const sx of [-1, 1]) p.add('cbox', B, sx * 0.05, 0, -0.46, 0.06, 0.01, 0.12, 0, sx * 0.5);
      return p.geo();
    }
    // sea scorpion and the land arthropods: segmented bodies on many legs
    const many = k === 'millipede' ? 18 : k === 'centipede' ? 14 : 9, wid = k === 'millipede' ? 0.11 : k === 'centipede' ? 0.08 : 0.2;
    for (let q = 0; q < many; q++) {
      const z = 0.42 - q * (0.86 / many), w = k === 'seascorpion' || k === 'scorpion' ? wid * (1 - q / (many * 1.6)) : wid;
      p.add('cbox', q % 2 ? B : MD, 0, 0.06, z, w, 0.06, 0.86 / many * 1.1);
      if (k !== 'seascorpion' || q < 4) for (const sx of [-1, 1]) p.add('cbox', DK, sx * (w / 2 + 0.03), 0.03, z, 0.07, 0.012, 0.012, 0, 0, sx * -0.5);
      if (k === 'scorpion' || k === 'seascorpion' ? q < 4 : true) for (const sx of [-1, 1]) p.add('box', DK, sx * (w / 2 + 0.06), 0, z, 0.01, 0.05, 0.01);
    }
    if (k === 'scorpion') { chain(p, B, [[0, 0.06, -0.3], [0, 0.18, -0.42], [0, 0.32, -0.38], [0, 0.36, -0.26]], [0.06, 0.05, 0.045, 0.03], [0.06, 0.05, 0.045, 0.03]); p.add('cone', DK, 0, 0.32, -0.22, 0.03, 0.06, 0.03, 1.6); }
    if (k === 'scorpion' || k === 'seascorpion') for (const sx of [-1, 1]) { seg(p, B, [sx * 0.08, 0.05, 0.4], [sx * 0.16, 0.05, 0.52], 0.04, 0.03); p.add('cbox', MD, sx * 0.17, 0.05, 0.56, 0.07, 0.03, 0.08); }
    if (k === 'seascorpion') { seg(p, B, [0, 0.06, -0.42], [0, 0.06, -0.56], 0.03, 0.02); for (const sx of [-1, 1]) p.add('cbox', MD, sx * 0.16, 0.04, 0.12, 0.14, 0.012, 0.09, 0, sx * 0.4); }
    if (k === 'centipede' || k === 'millipede') for (const sx of [-1, 1]) seg(p, DK, [sx * 0.02, 0.08, 0.45], [sx * 0.08, 0.12, 0.56], 0.008, 0.008);
    eyes(p, wid * 0.3, 0.1, 0.44, 0.02);
    return p.geo();
  }
  function jelly(glow) {
    const p = M._parts();
    p.add('ico', B, 0, 0.12, 0, 0.9, 0.5, 0.9); p.add('cyl', BL, 0, -0.02, 0, 0.84, 0.1, 0.84);
    for (let q = 0; q < 12; q++) { const a = (q / 12) * Math.PI * 2; p.add('box', glow ? G(255) : BL, Math.cos(a) * 0.32, -0.9, Math.sin(a) * 0.32, 0.02, 0.88, 0.02); }
    for (let q = 0; q < 4; q++) p.add('box', MD, (q - 1.5) * 0.08, -0.5, 0, 0.06, 0.5, 0.06, 0, 0, (q - 1.5) * 0.15);
    if (glow) for (const y of [0.1, 0.25]) p.add('cyl', G(255), 0, y, 0, 0.92 - y, 0.02, 0.92 - y);
    return p.geo();
  }
  function crinoid() {
    const p = M._parts();
    p.add('cyl', MD, 0, 0, 0, 0.05, 0.62, 0.05);
    p.add('cone', B, 0, 0.6, 0, 0.12, 0.1, 0.12, Math.PI);
    for (let q = 0; q < 10; q++) { const a = (q / 10) * Math.PI * 2; seg(p, B, [Math.cos(a) * 0.04, 0.62, Math.sin(a) * 0.04], [Math.cos(a) * 0.22, 0.9, Math.sin(a) * 0.22], 0.025, 0.025); }
    return p.geo();
  }
  function serpent(o) { // sea serpents and leviathans: a long body in waves
    const p = M._parts(), n = o.lev ? 9 : 14, pts = [], ws = [];
    for (let q = 0; q <= n; q++) { const t = q / n; pts.push([Math.sin(t * Math.PI * 3) * 0.06, Math.sin(t * Math.PI * 2) * (o.lev ? 0.04 : 0.08), 0.45 - t * 0.95]); ws.push((o.lev ? 0.2 : 0.07) * (1 - t * 0.75) + 0.01); }
    chain(p, B, pts, ws, ws);
    for (let q = 1; q < n; q += 2) p.add('cone6', MD, pts[q][0], pts[q][1] + ws[q] * 0.45, pts[q][2], ws[q] * 0.5, ws[q] * (o.lev ? 0.9 : 1.2), ws[q] * 0.3);
    p.add('cbox', B, 0, 0.0, 0.5, ws[0] * 1.2, ws[0] * 0.9, ws[0] * 1.8);
    for (const sx of [-1, 1]) { p.add('cone', HR, sx * ws[0] * 0.4, ws[0] * 0.4, 0.46, ws[0] * 0.2, ws[0] * 0.9, ws[0] * 0.2, -0.6, 0, sx * -0.4); p.add('cbox', MD, sx * ws[0] * 0.65, 0, 0.47, 0.01, ws[0] * 0.7, ws[0] * 0.8, 0, sx * 0.3); }
    eyes(p, ws[0] * 0.45, ws[0] * 0.2, 0.56, ws[0] * 0.18, o.lev ? [255, 200, 60] : [230, 190, 60]);
    if (o.lev) for (const z of [0.25, -0.05]) fins(p, B, ws[2] * 0.9, -0.05, z, 0.25, 0.12, 0.3);
    return p.geo();
  }
  function hippocampus() {
    const p = M._parts();
    p.add('cbox', B, 0, 0.12, 0.18, 0.12, 0.16, 0.3);
    seg(p, B, [0, 0.18, 0.28], [0, 0.34, 0.38], 0.08, 0.07); p.add('cbox', B, 0, 0.36, 0.44, 0.07, 0.07, 0.14, 0.4); eyes(p, 0.035, 0.38, 0.44, 0.015);
    p.add('cbox', MD, 0, 0.3, 0.3, 0.02, 0.14, 0.14, 0.3); // the mane, a fin
    for (const sx of [-1, 1]) seg(p, B, [sx * 0.05, 0.06, 0.26], [sx * 0.05, -0.08, 0.36], 0.04, 0.04);
    const pts = [[0, 0.1, 0.05], [0, 0.0, -0.12], [0, 0.04, -0.3], [0, 0.14, -0.4]]; chain(p, B, pts, [0.11, 0.08, 0.05, 0.03], [0.12, 0.08, 0.05, 0.03]);
    p.add('cbox', B, 0, 0.2, -0.44, 0.02, 0.14, 0.12, 0.6);
    return p.geo();
  }

  // ------------------------------------------------------------ walkers
  function quad(o) { // a four-legged body: o = { len, ht, wid, leg, legW, neck: [pts], head: [w,h,l], tail: len, low }
    const p = M._parts(), L = o.leg, y0 = L, ht = o.ht, w = o.wid;
    legs(p, o.legC || B, [-(w / 2 - o.legW / 2), w / 2 - o.legW / 2], [0.26 * o.len, -0.26 * o.len], y0 + ht * 0.3, o.legW, o.foot);
    p.add('cbox', B, 0, y0 + ht / 2, 0, w, ht, o.len * 0.62);
    p.add('cbox', BL, 0, y0 + ht * 0.18, 0, w * 0.92, ht * 0.36, o.len * 0.5);
    const nb = [0, y0 + ht * 0.7, o.len * 0.3];
    let hp = nb;
    if (o.neck) { const pts = [nb].concat(o.neck); const ws = pts.map((_, k) => o.neckW * (1 - k / (pts.length * 1.6))); chain(p, B, pts, ws, ws); hp = pts[pts.length - 1]; }
    const [hw, hh, hl] = o.head;
    p.add('cbox', B, hp[0], hp[1], hp[2] + hl * 0.4, hw, hh, hl, 0.15);
    eyes(p, hw / 2, hp[1] + hh * 0.15, hp[2] + hl * 0.55, Math.max(0.012, hw * 0.14));
    if (o.tail) { const tz = -o.len * 0.31; chain(p, B, [[0, y0 + ht * 0.6, tz], [0, y0 + ht * (o.tailUp ? 0.9 : 0.35), tz - o.tail * 0.5], [0, y0 + ht * (o.tailUp ? 1.0 : 0.15), tz - o.tail]], [w * 0.4, w * 0.22, 0.02], [ht * 0.4, ht * 0.22, 0.02]); }
    if (o.extra) o.extra(p, { y0, ht, w, hp, hw, hh, hl });
    return p.geo();
  }
  function biped(o) { // theropods, ornithopods, terror birds, greys and yetis (upright when o.up)
    const p = M._parts(), L = o.leg, w = o.wid, ht = o.ht;
    if (o.up) { // upright: legs, a tall body, arms, a head on top
      legs(p, B, [-w * 0.25, w * 0.25], [0], L, w * 0.22);
      p.add('cbox', B, 0, L + ht / 2, 0, w, ht, w * 0.6);
      for (const sx of [-1, 1]) p.add('box', B, sx * (w / 2 + 0.03), L + ht * 0.15, 0, 0.05, ht * 0.8, 0.05);
      p.add('ico', B, 0, L + ht + o.head[1] * 0.5, 0.02, o.head[0], o.head[1], o.head[2]);
      eyes(p, o.head[0] * 0.25, L + ht + o.head[1] * 0.55, o.head[2] * 0.45, o.head[0] * (o.bigEyes ? 0.3 : 0.12), o.bigEyes ? G(10) : null);
      return p.geo();
    }
    for (const sx of [-1, 1]) { seg(p, B, [sx * w * 0.3, L * 1.02, -0.02], [sx * w * 0.32, L * 0.5, 0.04], w * 0.3, w * 0.3); seg(p, B, [sx * w * 0.32, L * 0.5, 0.04], [sx * w * 0.32, 0, -0.03], w * 0.16, w * 0.16); p.add('box', o.claw ? DK : B, sx * w * 0.32, 0, 0.02, w * 0.2, 0.02, 0.08); }
    chain(p, B, [[0, L + ht * 0.4, -0.12], [0, L + ht * 0.6, 0.14]], [w, w * 0.8], [ht, ht * 0.9]);
    p.add('cbox', BL, 0, L + ht * 0.18, 0.02, w * 0.86, ht * 0.4, 0.22);
    const hb = [0, L + ht * 0.85, 0.22];
    chain(p, B, [hb, [0, L + ht * 0.85 + o.neck, 0.3]], [w * 0.5, w * 0.4], [w * 0.5, w * 0.4]);
    const [hw, hh, hl] = o.head, hc = [0, L + ht * 0.85 + o.neck, 0.3 + hl * 0.4];
    p.add('cbox', B, hc[0], hc[1], hc[2], hw, hh, hl, 0.08);
    if (o.beak) p.add('cone', [220, 180, 90], 0, hc[1] - hh * 0.1, hc[2] + hl * 0.5, hw * 0.6, hl * 0.6, hw * 0.6, Math.PI / 2);
    if (o.teeth) p.add('cbox', HR, 0, hc[1] - hh * 0.3, hc[2] + hl * 0.1, hw * 0.9, 0.01, hl * 0.8);
    eyes(p, hw / 2, hc[1] + hh * 0.15, hc[2] + hl * 0.25, Math.max(0.01, hw * 0.12));
    for (const sx of [-1, 1]) seg(p, B, [sx * w * 0.45, L + ht * 0.6, 0.14], [sx * w * 0.5, L + ht * 0.35, 0.14 + o.arm], 0.02, 0.02);
    chain(p, B, [[0, L + ht * 0.5, -0.16], [0, L + ht * 0.45, -0.3], [0, L + ht * 0.4, -0.5]], [w * 0.6, w * 0.3, 0.015], [ht * 0.6, ht * 0.3, 0.015]);
    if (o.crest) p.add('cbox', MD, 0, hc[1] + hh * 0.6, hc[2] - hl * 0.1, 0.012, hh * 0.8, hl * 0.6, 0.3);
    if (o.feathers) for (let q = 0; q < 5; q++) p.add('cbox', MD, 0, L + ht * 0.9, 0.12 - q * 0.06, w * 0.2, 0.04, 0.05);
    return p.geo();
  }
  function flyer(o) { // dragonflies, gliding reptiles, pterosaurs, birds, phoenixes, rocs, skyrays
    const p = M._parts(), k = o.kind;
    if (k === 'dragonfly') {
      p.add('cbox', B, 0, 0, 0.0, 0.05, 0.05, 1.0); p.add('ico', B, 0, 0, 0.45, 0.1, 0.09, 0.1); eyes(p, 0.04, 0.02, 0.48, 0.05, MD);
      for (const z of [0.18, 0.05]) for (const sx of [-1, 1]) p.add('cbox', G(245), sx * 0.32, 0.03, z, 0.6, 0.008, 0.1, 0, sx * 0.1);
      return p.geo();
    }
    if (k === 'skyray') return ray(true);
    const span = o.span || 1.2;
    p.add('ico', B, 0, 0, 0, 0.18, 0.16, 0.6);
    for (const sx of [-1, 1]) p.add('prism', o.wingC || B, sx * span * 0.26, 0, 0.02, span * 0.5, 0.05, 0.34, 0, 0, sx * -0.05);
    if (k === 'pterosaur') { seg(p, B, [0, 0.03, 0.2], [0, 0.06, 0.34], 0.06, 0.06); p.add('cone', HR, 0, 0.06, 0.36, 0.05, 0.3, 0.05, Math.PI / 2); p.add('cbox', MD, 0, 0.12, 0.32, 0.01, 0.12, 0.16, -0.4); eyes(p, 0.03, 0.08, 0.38, 0.015); }
    else { p.add('ico', B, 0, 0.04, 0.3, 0.13, 0.12, 0.14); p.add('cone', [220, 180, 90], 0, 0.03, 0.36, 0.05, 0.12, 0.05, Math.PI / 2); eyes(p, 0.05, 0.06, 0.34, 0.015); }
    if (k === 'glider') { p.add('cbox', B, 0, 0, -0.38, 0.03, 0.03, 0.3); }
    if (o.tail) for (let q = 0; q < 3; q++) p.add('cbox', o.tailC || B, (q - 1) * 0.05, 0, -0.42 - q * 0.04, 0.05, 0.01, 0.36, 0, (q - 1) * 0.2);
    else p.add('cbox', B, 0, 0, -0.33, 0.14, 0.01, 0.12);
    return p.geo();
  }

  // ------------------------------------------------------------ the catalogue
  // kind: [min, max length in metres], mode (swim, bottom, drift, fixed, walk, fly), depth (0 surface .. 1 sea floor), school size, build
  const K = {};
  const def = (names, len, mode, depth, school, build) => { for (const n of [].concat(names)) K[n] = { len, mode, depth, school, build }; };
  def('trilobite', [0.05, 0.45], 'bottom', 1, 3, () => arthropod({ kind: 'trilobite' }));
  def('anomalocarid', [0.4, 1.2], 'swim', 0.5, 1, () => arthropod({ kind: 'anomalocarid' }));
  def('sea scorpion', [0.5, 2.5], 'bottom', 0.9, 1, () => arthropod({ kind: 'seascorpion' }));
  def('jellyfish', [0.2, 1.0], 'drift', 0.3, 5, () => jelly(false));
  def('glow jelly', [1, 4], 'drift', 0.5, 3, () => jelly(true));
  def('sea lily', [0.2, 0.9], 'fixed', 1, 6, crinoid);
  def(['nautiloid', 'ammonite'], [0.2, 2], 'swim', 0.5, 2, () => cephalopod({ kind: 'ammonite' }));
  def('orthocone', [1, 6], 'swim', 0.6, 1, () => cephalopod({ kind: 'orthocone' }));
  def('octopus', [0.5, 3], 'bottom', 1, 1, () => cephalopod({ kind: 'octopus' }));
  def('giant squid', [5, 13], 'swim', 0.85, 1, () => cephalopod({ kind: 'squid' }));
  def('void squid', [3, 10], 'swim', 0.7, 1, () => cephalopod({ kind: 'void' }));
  def('jawless fish', [0.15, 0.6], 'swim', 0.6, 6, () => fish({ jawless: true, d: 0.2, w: 0.14 }));
  def('armoured fish', [0.4, 2], 'swim', 0.7, 2, () => fish({ armour: true, d: 0.26, w: 0.2 }));
  def('placoderm', [3, 8], 'swim', 0.6, 1, () => fish({ armour: true, d: 0.3, w: 0.22, dorsal: 0.12 }));
  def('lobe-finned fish', [0.5, 2], 'swim', 0.75, 2, () => fish({ lobes: true, d: 0.24, w: 0.17 }));
  def('bony fish', [0.2, 1.2], 'swim', 0.5, 8, () => fish({ d: 0.26 }));
  def('sardine', [0.1, 0.3], 'swim', 0.3, 18, () => fish({ d: 0.2, w: 0.12 }));
  def('cod', [0.5, 1.5], 'swim', 0.7, 6, () => fish({ d: 0.26, w: 0.17 }));
  def('tuna', [1, 3], 'swim', 0.4, 8, () => fish({ d: 0.3, w: 0.2, dorsal: 0.12, tail: 0.5 }));
  def('reef fish', [0.1, 0.5], 'swim', 0.85, 7, () => fish({ d: 0.5, w: 0.12, stripes: true, dorsal: 0.12, eye: 0.05 }));
  def('barracuda', [1, 2], 'swim', 0.5, 4, () => fish({ d: 0.16, w: 0.12, beak: 0.05 }));
  def(['early shark', 'shark'], [1.5, 4], 'swim', 0.5, 1, () => shark({}));
  def('great shark', [4, 6.5], 'swim', 0.45, 1, () => shark({ fin: 0.2 }));
  def('giant shark', [10, 18], 'swim', 0.5, 1, () => shark({ fin: 0.2 }));
  def('ichthyosaur', [3, 15], 'swim', 0.4, 2, () => marineReptile({ kind: 'ichthyo' }));
  def('plesiosaur', [4, 12], 'swim', 0.45, 1, () => marineReptile({ kind: 'plesio' }));
  def('mosasaur', [6, 15], 'swim', 0.45, 1, () => marineReptile({ kind: 'mosa' }));
  def('early whale', [8, 18], 'swim', 0.35, 1, () => whale({ kind: 'early' }));
  def('baleen whale', [10, 25], 'swim', 0.2, 2, () => whale({ kind: 'baleen' }));
  def('orca', [5, 9], 'swim', 0.2, 4, () => whale({ kind: 'orca' }));
  def('dolphin', [2, 4], 'swim', 0.15, 6, () => whale({ kind: 'dolphin' }));
  def('dugong', [2.5, 3.5], 'swim', 0.8, 2, () => whale({ kind: 'dugong' }));
  def(['seal', 'sea lion'], [1.5, 2.5], 'swim', 0.3, 3, () => whale({ kind: 'seal' }));
  def('sea turtle', [0.8, 2], 'swim', 0.4, 1, turtle);
  def('manta ray', [3, 7], 'swim', 0.35, 1, () => ray(false));
  def('hippocampus', [2, 4], 'swim', 0.4, 2, hippocampus);
  def('sea serpent', [10, 30], 'swim', 0.3, 1, () => serpent({}));
  def('leviathan', [25, 60], 'swim', 0.5, 1, () => serpent({ lev: true }));
  // land
  def(['early tetrapod', 'small amphibian'], [0.15, 2], 'walk', 0, 2, () => quad({ len: 1, ht: 0.12, wid: 0.2, leg: 0.06, legW: 0.06, head: [0.2, 0.08, 0.22], tail: 0.4 }));
  def('amphibian hunter', [1.5, 4], 'walk', 0, 1, () => quad({ len: 1, ht: 0.13, wid: 0.24, leg: 0.06, legW: 0.07, head: [0.26, 0.09, 0.3], tail: 0.35 }));
  def('crocodile-kin', [3, 7], 'walk', 0, 1, () => quad({ len: 1, ht: 0.12, wid: 0.18, leg: 0.07, legW: 0.05, head: [0.12, 0.08, 0.3], tail: 0.45, extra: (p, q) => { for (let k = 0; k < 6; k++) p.add('cone', MD, 0, q.y0 + q.ht, 0.2 - k * 0.08, 0.04, 0.04, 0.04); } }));
  def('giant millipede', [1, 2.5], 'walk', 0, 1, () => arthropod({ kind: 'millipede' }));
  def('giant centipede', [0.3, 1], 'walk', 0, 1, () => arthropod({ kind: 'centipede' }));
  def('giant scorpion', [0.3, 1], 'walk', 0, 1, () => arthropod({ kind: 'scorpion' }));
  def('sail-back', [2, 4], 'walk', 0, 2, () => quad({ len: 1, ht: 0.14, wid: 0.18, leg: 0.1, legW: 0.05, head: [0.14, 0.1, 0.18], tail: 0.4, extra: (p, q) => { for (let k = 0; k < 7; k++) p.add('box', k % 2 ? MD : B, 0, q.y0 + q.ht, 0.18 - k * 0.06, 0.012, 0.32 - Math.abs(k - 3) * 0.06, 0.06); } }));
  def('dicynodont', [0.5, 3], 'walk', 0, 3, () => quad({ len: 1, ht: 0.26, wid: 0.3, leg: 0.12, legW: 0.08, head: [0.2, 0.16, 0.2], tail: 0.1, extra: (p, q) => { for (const sx of [-1, 1]) p.add('cone', HR, sx * 0.05, q.hp[1] - q.hh * 0.4, q.hp[2] + q.hl * 0.6, 0.025, 0.08, 0.025, Math.PI); } }));
  def('sabre-tooth synapsid', [1, 3.5], 'walk', 0, 1, () => quad({ len: 1, ht: 0.2, wid: 0.18, leg: 0.22, legW: 0.05, neck: [[0, 0.5, 0.42]], neckW: 0.1, head: [0.13, 0.12, 0.2], tail: 0.25, extra: (p, q) => { for (const sx of [-1, 1]) p.add('cone', HR, sx * 0.03, q.hp[1] - q.hh * 0.45, q.hp[2] + q.hl * 0.55, 0.015, 0.1, 0.015, Math.PI); } }));
  def(['cynodont', 'early mammal', 'creodont'], [0.1, 2.5], 'walk', 0, 2, () => quad({ len: 1, ht: 0.22, wid: 0.2, leg: 0.16, legW: 0.05, head: [0.14, 0.12, 0.2], tail: 0.35 }));
  def('early primate', [0.3, 0.7], 'walk', 0, 3, () => quad({ len: 1, ht: 0.2, wid: 0.18, leg: 0.2, legW: 0.05, head: [0.16, 0.15, 0.14], tail: 0.6, tailUp: true, extra: (p, q) => { for (let k = 0; k < 5; k++) p.add('cbox', DK, 0, q.y0 + q.ht * (0.7 + k * 0.08), -0.35 - k * 0.1, 0.06, 0.04, 0.03); } }));
  def('early horse', [0.6, 1.4], 'walk', 0, 5, () => quad({ len: 1, ht: 0.3, wid: 0.22, leg: 0.42, legW: 0.06, neck: [[0, 0.95, 0.5]], neckW: 0.12, head: [0.12, 0.13, 0.28], tail: 0.18 }));
  def('giant rhino', [6, 8], 'walk', 0, 1, () => quad({ len: 1, ht: 0.34, wid: 0.3, leg: 0.48, legW: 0.1, neck: [[0, 1.1, 0.46]], neckW: 0.16, head: [0.16, 0.16, 0.3], tail: 0.1 }));
  def('early elephant', [3, 5], 'walk', 0, 3, () => quad({ len: 1, ht: 0.42, wid: 0.36, leg: 0.4, legW: 0.12, head: [0.28, 0.28, 0.24], tail: 0.1, extra: (p, q) => { chain(p, B, [[0, q.hp[1], q.hp[2] + q.hl * 0.6], [0, q.hp[1] - 0.2, q.hp[2] + q.hl * 0.8], [0, q.hp[1] - 0.42, q.hp[2] + q.hl * 0.9]], [0.08, 0.06, 0.05], [0.08, 0.06, 0.05]); for (const sx of [-1, 1]) { p.add('cbox', B, sx * 0.17, q.hp[1], q.hp[2], 0.02, 0.22, 0.2); seg(p, HR, [sx * 0.06, q.hp[1] - 0.1, q.hp[2] + 0.12], [sx * 0.08, q.hp[1] - 0.24, q.hp[2] + 0.3], 0.03, 0.03); } } }));
  def('early sauropod', [4, 9], 'walk', 0, 3, () => quad({ len: 1, ht: 0.26, wid: 0.22, leg: 0.24, legW: 0.08, neck: [[0, 0.62, 0.48], [0, 0.82, 0.62]], neckW: 0.1, head: [0.07, 0.07, 0.12], tail: 0.55 }));
  def('sauropod', [15, 30], 'walk', 0, 4, () => quad({ len: 1, ht: 0.22, wid: 0.2, leg: 0.24, legW: 0.07, neck: [[0, 0.7, 0.5], [0, 1.0, 0.66], [0, 1.2, 0.78]], neckW: 0.08, head: [0.05, 0.05, 0.08], tail: 0.6 }));
  def('stegosaur', [5, 9], 'walk', 0, 2, () => quad({ len: 1, ht: 0.24, wid: 0.2, leg: 0.2, legW: 0.07, head: [0.07, 0.07, 0.14], tail: 0.45, extra: (p, q) => { for (let k = 0; k < 8; k++) for (const sx of [-1, 1]) p.add('prism', MD, sx * 0.03, q.y0 + q.ht - 0.02, 0.24 - k * 0.07, 0.03, 0.12 + Math.sin((k / 7) * Math.PI) * 0.1, 0.07, 0, Math.PI / 2, sx * 0.1); for (const sx of [-1, 1]) p.add('cone', HR, sx * 0.03, q.y0 + q.ht * 0.2, -0.75, 0.02, 0.12, 0.02, 0, 0, sx * 1.2); } }));
  def('small ornithopod', [1, 4], 'walk', 0, 5, () => biped({ leg: 0.3, wid: 0.12, ht: 0.18, neck: 0.1, head: [0.08, 0.08, 0.14], arm: 0.08 }));
  def('duckbill', [6, 12], 'walk', 0, 6, () => biped({ leg: 0.34, wid: 0.18, ht: 0.24, neck: 0.12, head: [0.09, 0.09, 0.2], arm: 0.12, crest: true }));
  def('horned dinosaur', [5, 9], 'walk', 0, 4, () => quad({ len: 1, ht: 0.3, wid: 0.28, leg: 0.18, legW: 0.1, head: [0.22, 0.2, 0.26], tail: 0.25, extra: (p, q) => { p.add('cbox', MD, 0, q.hp[1] + q.hh * 0.5, q.hp[2] - q.hl * 0.05, 0.4, 0.32, 0.03, -0.4); for (const sx of [-1, 1]) p.add('cone', HR, sx * 0.07, q.hp[1] + q.hh * 0.3, q.hp[2] + q.hl * 0.4, 0.03, 0.2, 0.03, 1.2); p.add('cone', HR, 0, q.hp[1], q.hp[2] + q.hl * 0.9, 0.025, 0.1, 0.025, 1.0); } }));
  def('armoured dinosaur', [5, 8], 'walk', 0, 2, () => quad({ len: 1, ht: 0.2, wid: 0.34, leg: 0.12, legW: 0.08, head: [0.14, 0.1, 0.14], tail: 0.4, extra: (p, q) => { for (let k = 0; k < 6; k++) for (const sx of [-1, 0, 1]) p.add('cone', MD, sx * 0.12, q.y0 + q.ht - 0.01, 0.24 - k * 0.09, 0.04, 0.06, 0.04); for (const sx of [-1, 1]) p.add('cone', HR, sx * 0.18, q.y0 + q.ht * 0.5, 0.15, 0.03, 0.1, 0.03, 0, 0, sx * -1.5); p.add('ico', MD, 0, q.y0 + q.ht * 0.2, -0.82, 0.12, 0.08, 0.1); } }));
  def(['early theropod', 'small raptor'], [0.8, 4], 'walk', 0, 3, () => biped({ leg: 0.28, wid: 0.1, ht: 0.14, neck: 0.12, head: [0.07, 0.07, 0.14], arm: 0.08, claw: true, feathers: true, teeth: true }));
  def('raptor', [1.5, 3], 'walk', 0, 4, () => biped({ leg: 0.3, wid: 0.1, ht: 0.14, neck: 0.12, head: [0.07, 0.07, 0.15], arm: 0.1, claw: true, feathers: true, crest: true, teeth: true }));
  def('great theropod', [6, 10], 'walk', 0, 1, () => biped({ leg: 0.34, wid: 0.16, ht: 0.22, neck: 0.12, head: [0.12, 0.13, 0.22], arm: 0.07, teeth: true, crest: true }));
  def('tyrant lizard', [9, 13], 'walk', 0, 1, () => biped({ leg: 0.36, wid: 0.18, ht: 0.24, neck: 0.1, head: [0.17, 0.18, 0.27], arm: 0.04, teeth: true }));
  def('terror bird', [1.5, 3], 'walk', 0, 1, () => biped({ leg: 0.38, wid: 0.12, ht: 0.18, neck: 0.22, head: [0.1, 0.12, 0.18], arm: 0.04, beak: true, feathers: true }));
  def('yeti', [2, 3], 'walk', 0, 1, () => biped({ up: true, leg: 0.28, wid: 0.24, ht: 0.34, head: [0.14, 0.14, 0.14] }));
  def('grey', [1, 1.4], 'walk', 0, 3, () => biped({ up: true, leg: 0.32, wid: 0.12, ht: 0.28, head: [0.24, 0.3, 0.24], bigEyes: true }));
  def(['unicorn'], [2, 2.6], 'walk', 0, 3, () => quad({ len: 1, ht: 0.3, wid: 0.22, leg: 0.44, legW: 0.06, neck: [[0, 0.98, 0.5]], neckW: 0.12, head: [0.12, 0.13, 0.28], tail: 0.3, extra: (p, q) => { p.add('cone', [240, 220, 140], 0, q.hp[1] + q.hh * 0.5, q.hp[2] + q.hl * 0.55, 0.025, 0.26, 0.025, 0.9); p.add('cbox', MD, 0, q.hp[1] - 0.08, q.hp[2] - 0.1, 0.02, 0.2, 0.18, 0.5); } }));
  def('behemoth', [6, 10], 'walk', 0, 1, () => quad({ len: 1, ht: 0.4, wid: 0.36, leg: 0.3, legW: 0.12, head: [0.26, 0.22, 0.24], tail: 0.2, extra: (p, q) => { for (const sx of [-1, 1]) chain(p, HR, [[sx * 0.1, q.hp[1] + 0.1, q.hp[2]], [sx * 0.24, q.hp[1] + 0.22, q.hp[2] + 0.05], [sx * 0.3, q.hp[1] + 0.4, q.hp[2] + 0.12]], [0.06, 0.04, 0.02], [0.06, 0.04, 0.02]); for (let k = 0; k < 5; k++) p.add('cone', MD, 0, q.y0 + q.ht, 0.2 - k * 0.1, 0.06, 0.1, 0.06); } }));
  def(['griffin', 'manticore'], [2.5, 5], 'walk', 0, 1, () => quad({ len: 1, ht: 0.24, wid: 0.2, leg: 0.24, legW: 0.06, neck: [[0, 0.62, 0.42]], neckW: 0.12, head: [0.14, 0.13, 0.18], tail: 0.4, tailUp: true, extra: (p, q) => { p.add('cone', [220, 180, 90], 0, q.hp[1] - 0.02, q.hp[2] + q.hl * 0.8, 0.05, 0.12, 0.05, Math.PI / 2); for (const sx of [-1, 1]) p.add('prism', B, sx * 0.4, q.y0 + q.ht + 0.04, 0.05, 0.62, 0.05, 0.3, 0, 0, sx * -0.35); } }));
  def('tripod strider', [2, 6], 'walk', 0, 2, () => { const p = M._parts(); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; chain(p, MD, [[Math.cos(a) * 0.08, 0.9, Math.sin(a) * 0.08], [Math.cos(a) * 0.36, 0.6, Math.sin(a) * 0.36], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4]], [0.04, 0.03, 0.02], [0.04, 0.03, 0.02]); } p.add('mound', B, 0, 0.95, 0, 0.5, 0.2, 0.5); p.add('cbox', G(255), 0, 0.95, 0.24, 0.12, 0.06, 0.03); return p.geo(); });
  def('xeno stalker', [2, 5], 'walk', 0, 2, () => { const p = M._parts(); for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) chain(p, MD, [[sx * 0.08, 0.3, 0.2 - k * 0.2], [sx * 0.26, 0.4, 0.2 - k * 0.2], [sx * 0.32, 0, 0.24 - k * 0.2]], [0.03, 0.025, 0.015], [0.03, 0.025, 0.015]); chain(p, B, [[0, 0.32, -0.4], [0, 0.34, 0], [0, 0.4, 0.3]], [0.12, 0.18, 0.1], [0.1, 0.16, 0.1]); p.add('cbox', B, 0, 0.44, 0.44, 0.08, 0.08, 0.26, -0.2); for (const sx of [-1, 1]) p.add('cbox', G(255), sx * 0.04, 0.46, 0.5, 0.02, 0.02, 0.06); return p.geo(); });
  // flyers
  def('giant dragonfly', [0.3, 0.75], 'fly', 0, 4, () => flyer({ kind: 'dragonfly' }));
  def('gliding reptile', [0.3, 0.6], 'fly', 0, 3, () => flyer({ kind: 'glider', span: 1.4 }));
  def(['pterosaur', 'giant pterosaur'], [1, 6], 'fly', 0, 2, () => flyer({ kind: 'pterosaur', span: 2.4 }));
  def(['early bird', 'songbird', 'crow'], [0.15, 0.6], 'fly', 0, 5, () => flyer({ kind: 'bird', span: 1.5 }));
  def('great bird', [0.6, 1.2], 'fly', 0, 2, () => flyer({ kind: 'bird', span: 2.2 }));
  def('phoenix', [1, 2], 'fly', 0, 1, () => flyer({ kind: 'bird', span: 2.2, tail: true, tailC: [255, 200, 80], wingC: G(255) }));
  def('roc', [5, 9], 'fly', 0, 1, () => flyer({ kind: 'bird', span: 2.4, tail: true }));
  def('skyray', [2, 6], 'fly', 0, 2, () => flyer({ kind: 'skyray' }));
  // the reef and the sea floor (fixed: drawn where the sea is shallow, by its warmth)
  const reef = (build) => () => { const p = M._parts(M._tex().PLAIN); build(p); return p.geo(); };
  def('coral-branch', [1, 1], 'fixed', 1, 1, reef((p) => { for (let q = 0; q < 7; q++) { const a = q * 0.9, r = 0.1 + (q % 3) * 0.08; p.add('cyl', B, Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5, 0.06, 0.4 + (q % 3) * 0.2, 0.06, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); p.add('ico', BL, Math.cos(a) * r * 1.4, 0.48 + (q % 3) * 0.18, Math.sin(a) * r * 1.4, 0.1, 0.1, 0.1); } }));
  def('coral-brain', [1, 1], 'fixed', 1, 1, reef((p) => { p.add('mound', B, 0, 0.18, 0, 0.7, 0.42, 0.7); for (let q = 0; q < 5; q++) p.add('cbox', MD, -0.24 + q * 0.12, 0.36, 0, 0.02, 0.04, 0.6); }));
  def('coral-fan', [1, 1], 'fixed', 1, 1, reef((p) => { p.add('cyl', MD, 0, 0, 0, 0.05, 0.2, 0.05); p.add('cbox', B, 0, 0.55, 0, 0.8, 0.7, 0.02); for (let q = 0; q < 5; q++) p.add('cbox', MD, -0.3 + q * 0.15, 0.55, 0.012, 0.015, 0.66, 0.012, 0, 0, (q - 2) * 0.2); }));
  def('coral-table', [1, 1], 'fixed', 1, 1, reef((p) => { p.add('cyl', MD, 0, 0, 0, 0.12, 0.3, 0.12); p.add('cyl', B, 0, 0.3, 0, 0.9, 0.06, 0.9); }));
  def('anemone', [1, 1], 'fixed', 1, 1, reef((p) => { p.add('cyl', MD, 0, 0, 0, 0.22, 0.16, 0.22); for (let q = 0; q < 10; q++) { const a = (q / 10) * Math.PI * 2; p.add('cone', B, Math.cos(a) * 0.08, 0.16, Math.sin(a) * 0.08, 0.05, 0.22, 0.05, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } }));
  def('sponge', [1, 1], 'fixed', 1, 1, reef((p) => { for (let q = 0; q < 3; q++) { p.add('cyl', B, (q - 1) * 0.16, 0, (q % 2) * 0.1, 0.14, 0.3 + q * 0.12, 0.14); p.add('cyl', DK, (q - 1) * 0.16, 0.3 + q * 0.12, (q % 2) * 0.1, 0.09, 0.01, 0.09); } }));
  def('kelp', [1, 1], 'fixed', 1, 1, reef((p) => { for (let q = 0; q < 3; q++) { const x = (q - 1) * 0.12; chain(p, B, [[x, 0, 0], [x + 0.05, 0.6, 0.03], [x - 0.04, 1.2, 0], [x + 0.03, 1.8, 0.04]], [0.03, 0.025, 0.02, 0.015], [0.03, 0.025, 0.02, 0.015]); for (let k = 1; k < 7; k++) p.add('cbox', BL, x + (k % 2 ? 0.06 : -0.06), k * 0.27, 0, 0.12, 0.05, 0.015, 0, 0, k % 2 ? -0.5 : 0.5); } }));
  def('seagrass', [1, 1], 'fixed', 1, 1, reef((p) => { for (let q = 0; q < 9; q++) { const a = q * 2.1; p.add('box', B, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0.025, 0.25 + (q % 3) * 0.1, 0.008, Math.sin(a) * 0.2, a, Math.cos(a) * 0.2); } }));
  def('stromatolite', [1, 1], 'fixed', 1, 1, reef((p) => { for (let q = 0; q < 3; q++) p.add('mound', q % 2 ? MD : B, (q - 1) * 0.22, 0.12, (q % 2) * 0.14, 0.32, 0.3 + q * 0.06, 0.32); }));
  M.CREATURES = K;
  M.isCreature = (name) => !!K[name];
  M.creatureInfo = (name) => K[name];
  // one creature: kind, place, length in world units, heading, roll, tint
  M.creature = function (kind, x, y, z, len, ry, roll, r, g, b) {
    const C = K[kind]; if (!C) return false;
    const bk = M._bank('cr:' + kind, C.build, C.mode !== 'fly');
    bk.add(x, y, z, len, len, len, ry, roll || 0, r, g, b);
    M._drawn();
    return true;
  };
  M.creatureLen = (kind, size01) => { const C = K[kind]; return C ? (C.len[0] + (C.len[1] - C.len[0]) * size01) : 1; };
})();
