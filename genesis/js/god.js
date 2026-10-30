/* AURA: Genesis — god.js
 * The player's hand: brush + click tools for terraforming, elements, weather,
 * life, blessings/curses, plague, mutation, diplomacy meddling, disasters,
 * underground sculpting, and possession of any creature (a controllable avatar). */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Ent = AG.Ent, Civ = AG.Civ, Sky = AG.Sky;
  const { W, H, SP, SPECIES, FT, GT, SO, UG, UF, FL, TR, ST, TK, NG } = AG;
  const rnd = AG.rnd;

  const God = (AG.God = {
    tool: 'inspect', cur: null, brush: { r: 5, str: 0.6 },
    input: { dx: 0, dy: 0, act: false, power: false, aimX: 0, aimY: 0, moveTo: null },
    possessed: -1, tornadoes: [], meteors: [], shake: 0, disease: 0, pendingKd: -1,
    down: false, wx: 0, wy: 0,
  });

  God.reset = function () {
    God.tornadoes.length = 0; God.meteors.length = 0; God.possessed = -1; God.pendingKd = -1; God.shake = 0;
  };

  // ------------------------------------------------------------ brush helpers
  function eachCell(x, y, r, fn) {
    const x0 = Math.max(1, Math.floor(x - r)), x1 = Math.min(W - 2, Math.ceil(x + r));
    const y0 = Math.max(1, Math.floor(y - r)), y1 = Math.min(H - 2, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const d2 = (cx + 0.5 - x) * (cx + 0.5 - x) + (cy + 0.5 - y) * (cy + 0.5 - y);
      if (d2 <= r2) fn(cy * W + cx, 1 - d2 / r2, cx, cy, Math.sqrt(d2));
    }
  }
  function unitsIn(x, y, r, layer) {
    const n = Ent.near(x, y, r, layer, 512), out = [];
    for (let q = 0; q < n; q++) out.push(Ent.buf[q]);
    return out;
  }
  const view = () => (AG.Render ? AG.Render.view : 1);
  function touched(x, y, r) { Wd.wakeArea(x | 0, y | 0, Math.ceil(r)); Wd.epoch++; }
  function pour(type, amt) {
    return (x, y, k) => {
      const s = God.brush.str * k;
      eachCell(x, y, God.brush.r, (i, f) => {
        const a = amt * s * f;
        if (Wd.fl[i] > 0.002 && Wd.ft[i] !== type) AG.Physics.react(i, Wd.ft[i], type, a);
        else { Wd.fl[i] += a; Wd.ft[i] = type; if (type !== FT.WATER) Wd.frozen[i] = 0; }
        if (type === FT.LAVA) Wd.heat[i] = 1;
      });
      touched(x, y, God.brush.r);
      if (type === FT.LAVA && rnd() < 0.3) Civ.experience(x, y, 'fire', 0.05);
      if (type === FT.WATER && rnd() < 0.3) Civ.experience(x, y, 'water', 0.05);
    };
  }
  function spawnIn(sp, layer, chance) {
    return (x, y, k) => {
      if (rnd() > chance * k) return;
      for (let t = 0; t < 8; t++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * God.brush.r;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
        const i = (py | 0) * W + (px | 0);
        if (layer === 1 && !Wd.passLand(i)) continue;
        if (layer === 0 && !Wd.ugOpen(i)) continue;
        if (Ent.spawn(sp, px, py, { layer, force: true }) >= 0) return;
      }
    };
  }
  function storm(type) { return (x, y) => { Sky.spawnStorm(type, x, y, 14 + God.brush.r * 2.2, 1100, false); if (type === 'thunder') Civ.experience(x, y, 'storm', 1); toast(`${Sky.STORMS[type].name} summoned`); }; }
  function newRealm(race) {
    return (x, y) => {
      const k = Civ.createKingdom(race, x, y, 10);
      if (!k) toast('No room for a new realm here — find open, dry land away from other cities');
      else Civ.recomputeBorders();
    };
  }
  const toast = (m) => AG.UI && AG.UI.toast(m);
  function realmAt(x, y) { const c = Civ.cityAt(x, y); return c ? Civ.kingdoms[c.kd] : null; }

  function refreshGeneTraits(i) {
    for (const tr of AG.TRAITS) {
      if (!tr.gene) continue;
      const v = U.genes[i * NG + tr.gene[0]];
      if (tr.low ? v < tr.gene[1] : v > tr.gene[1]) U.traits[i] |= tr.bit; else U.traits[i] &= ~tr.bit;
    }
    Ent.deriveStats(i);
  }
  const diseaseIndex = (name) => Math.max(0, AG.DISEASES.findIndex((d) => d.name === name));

  // ------------------------------------------------------------ tool table
  God.CATS = [
    { id: 'look', name: 'Watch' }, { id: 'land', name: 'Terrain' }, { id: 'elem', name: 'Elements' }, { id: 'sky', name: 'Weather' },
    { id: 'life', name: 'Life' }, { id: 'divine', name: 'Divine' }, { id: 'ruin', name: 'Disasters' }, { id: 'deep', name: 'Deep' },
  ];
  God.TOOLS = [
    // watch
    { id: 'inspect', cat: 'look', name: 'Inspect', mode: 'click', color: '#e0e0e0', desc: 'Tap a creature, building or realm to read its story. Drag to pan.', click: (x, y) => AG.UI.pick(x, y) },
    { id: 'possess', cat: 'look', name: 'Possess', mode: 'click', color: '#ffd54f', desc: 'Take control of any creature. WASD to move, Space to strike, E for divine power, Esc to release.',
      click: (x, y) => { const u = AG.UI.unitAt(x, y); if (u >= 0) God.possess(u); else toast('Tap directly on a creature to possess it'); } },
    // terrain
    { id: 'raise', cat: 'land', name: 'Raise', mode: 'brush', color: '#a1887f', desc: 'Lift the land. Rivers will find new paths.',
      apply: (x, y, k) => { const s = God.brush.str * k; eachCell(x, y, God.brush.r, (i, f) => { Wd.elev[i] = Math.min(0.98, Wd.elev[i] + 0.004 * s * f); }); touched(x, y, God.brush.r); } },
    { id: 'lower', cat: 'land', name: 'Lower', mode: 'brush', color: '#6d4c41', desc: 'Carve valleys, lakes and channels.',
      apply: (x, y, k) => { const s = God.brush.str * k; eachCell(x, y, God.brush.r, (i, f) => { Wd.elev[i] = Math.max(0.02, Wd.elev[i] - 0.004 * s * f); }); touched(x, y, God.brush.r); } },
    { id: 'smooth', cat: 'land', name: 'Smooth', mode: 'brush', color: '#bcaaa4', desc: 'Flatten rough ground.',
      apply: (x, y, k) => {
        const s = Math.min(1, God.brush.str * k * 0.3);
        eachCell(x, y, God.brush.r, (i, f) => { const e = Wd.elev; const avg = (e[i - 1] + e[i + 1] + e[i - W] + e[i + W] + e[i]) / 5; e[i] += (avg - e[i]) * s * f; });
        touched(x, y, God.brush.r);
      } },
    { id: 'grass', cat: 'land', name: 'Meadow', mode: 'brush', color: '#7cb342', desc: 'Paint fertile grassland.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f) return; if (Wd.soil[i] !== SO.FARM && Wd.soil[i] !== SO.ROAD) Wd.soil[i] = SO.DIRT; Wd.veg[i] = Math.max(Wd.veg[i], 130); Wd.snow[i] = 0; Wd.moist[i] = Math.min(1, Wd.moist[i] + 0.006); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'forest', cat: 'land', name: 'Forest', mode: 'brush', color: '#2e7d32', desc: 'Grow dense woodland (Sylvans love it, fire loves it more).',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f * 0.7 || Wd.bgrid[i]) return; Wd.soil[i] = SO.DIRT; Wd.veg[i] = 235; Wd.moist[i] = Math.min(1, Wd.moist[i] + 0.01); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'desert', cat: 'land', name: 'Desert', mode: 'brush', color: '#e6c77a', desc: 'Dry the land into sand.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f) return; if (!Wd.bgrid[i]) Wd.soil[i] = SO.SAND; Wd.veg[i] = 0; Wd.moist[i] = Math.max(0, Wd.moist[i] - 0.01); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'snowcap', cat: 'land', name: 'Snow', mode: 'brush', color: '#eceff1', desc: 'Blanket the ground in snow and chill it.',
      apply: (x, y) => { eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f) return; Wd.snow[i] = 230; Wd.heat[i] = Math.max(-1, Wd.heat[i] - 0.05); }); touched(x, y, God.brush.r); } },
    // elements
    { id: 'water', cat: 'elem', name: 'Water', mode: 'brush', color: '#42a5f5', desc: 'Pour water. It flows downhill and floods low ground.', apply: pour(FT.WATER, 0.012) },
    { id: 'lava', cat: 'elem', name: 'Lava', mode: 'brush', color: '#ff5722', desc: 'Pour viscous lava. Ignites forests, hardens to basalt, boils water.', apply: pour(FT.LAVA, 0.01) },
    { id: 'acid', cat: 'elem', name: 'Acid', mode: 'brush', color: '#76ff03', desc: 'Pour acid. It dissolves land and life; water dilutes it.', apply: pour(FT.ACID, 0.01) },
    { id: 'miasma', cat: 'elem', name: 'Miasma', mode: 'brush', color: '#9ccc65', desc: 'Release poison gas that drifts on the wind.',
      apply: (x, y, k) => { eachCell(x, y, God.brush.r, (i, f) => { Wd.gas[i] = Math.min(1, Wd.gas[i] + 0.08 * f * k); Wd.gt[i] = GT.MIASMA; }); touched(x, y, God.brush.r); } },
    { id: 'fire', cat: 'elem', name: 'Fire', mode: 'brush', color: '#ff9800', desc: 'Set things alight. Wind carries the flames.',
      apply: (x, y) => { eachCell(x, y, God.brush.r * 0.6, (i, f) => { if (rnd() > f * 0.6) return; if (Wd.veg[i] > 10 || Wd.bgrid[i]) Wd.fire[i] = 255; else Wd.heat[i] = Math.min(1.2, Wd.heat[i] + 0.25); }); touched(x, y, God.brush.r); if (rnd() < 0.2) Civ.experience(x, y, 'fire', 0.1); } },
    { id: 'freeze', cat: 'elem', name: 'Frost', mode: 'brush', color: '#80deea', desc: 'Pull heat out of the world. Cold spreads, water freezes, fire dies.',
      apply: (x, y, k) => { eachCell(x, y, God.brush.r, (i, f) => { Wd.heat[i] = Math.max(-1.6, Wd.heat[i] - 0.08 * God.brush.str * k * f); Wd.fire[i] = 0; }); touched(x, y, God.brush.r); } },
    { id: 'drain', cat: 'elem', name: 'Drain', mode: 'brush', color: '#90a4ae', desc: 'Remove liquids and gases.',
      apply: (x, y, k) => { eachCell(x, y, God.brush.r, (i, f) => { const m = 1 - Math.min(1, 0.2 * God.brush.str * k * f); Wd.fl[i] *= m; Wd.gas[i] *= m; if (Wd.fl[i] < 1e-4) { Wd.fl[i] = 0; Wd.ft[i] = 0; Wd.frozen[i] = 0; } }); touched(x, y, God.brush.r); } },
    // weather
    { id: 'rain', cat: 'sky', name: 'Rain', mode: 'click', color: '#64b5f6', desc: 'Summon a drifting rainstorm.', click: storm('rain') },
    { id: 'thunder', cat: 'sky', name: 'Thunder', mode: 'click', color: '#b39ddb', desc: 'Summon a thunderstorm that hurls lightning.', click: storm('thunder') },
    { id: 'blizzard', cat: 'sky', name: 'Blizzard', mode: 'click', color: '#e3f2fd', desc: 'Summon a freezing blizzard.', click: storm('blizzard') },
    { id: 'heat', cat: 'sky', name: 'Heatwave', mode: 'click', color: '#ffb74d', desc: 'Bake the land; dry forests may combust.', click: storm('heat') },
    { id: 'acidrain', cat: 'sky', name: 'Acid rain', mode: 'click', color: '#c6ff00', desc: 'A storm that weeps acid.', click: storm('acid') },
    { id: 'bolt', cat: 'sky', name: 'Lightning', mode: 'click', color: '#fff59d', desc: 'Strike a single bolt where you tap.', click: (x, y) => God.lightning(x, y, false) },
    // life
    { id: 'kin', cat: 'life', name: 'Kin', mode: 'click', color: '#d9a77a', desc: 'Found a realm of the adaptable Kin — traders and farmers.', click: newRealm(SP.KIN) },
    { id: 'sylvan', cat: 'life', name: 'Sylvans', mode: 'click', color: '#a5d6a7', desc: 'Found a realm of long-lived, mystic forest folk.', click: newRealm(SP.SYLVAN) },
    { id: 'stone', cat: 'life', name: 'Stoneborn', mode: 'click', color: '#bcaaa4', desc: 'Found a realm of tough miners from the mountains.', click: newRealm(SP.STONE) },
    { id: 'ashen', cat: 'life', name: 'Ashen', mode: 'click', color: '#ff8a65', desc: 'Found a realm of fire-touched, warlike desert folk.', click: newRealm(SP.ASHEN) },
    { id: 'deer', cat: 'life', name: 'Deer', mode: 'brush', color: '#c49a6c', desc: 'Release grazing deer.', apply: spawnIn(SP.DEER, 1, 0.5) },
    { id: 'wolf', cat: 'life', name: 'Wolves', mode: 'brush', color: '#9e9e9e', desc: 'Release hunting wolves.', apply: spawnIn(SP.WOLF, 1, 0.25) },
    { id: 'birds', cat: 'life', name: 'Birds', mode: 'brush', color: '#455a64', desc: 'Release a flock into the sky layer.', apply: spawnIn(SP.BIRD, 2, 0.6) },
    { id: 'herald', cat: 'life', name: 'Herald', mode: 'click', color: '#fff176', desc: 'Send your avatar into the world and take control of it.',
      click: (x, y) => { const i = Ent.spawn(SP.HERALD, x, y, { force: true }); if (i >= 0) { AG.FX.burst(x, y, 'holy', 30); God.possess(i); Civ.experience(x, y, 'watcher', 3); } } },
    // divine
    { id: 'bless', cat: 'divine', name: 'Bless', mode: 'brush', color: '#ffe082', desc: 'Heal, strengthen and inspire faith. Blessed parents pass on the gift.',
      apply: (x, y, k) => {
        for (const j of unitsIn(x, y, God.brush.r, view())) {
          if (SPECIES[U.sp[j]].kind === 'monster') { Ent.damage(j, 3 * k, -1, 'holy light'); continue; }
          U.hp[j] = Math.min(U.mhp[j], U.hp[j] + 2 * k);
          if (!(U.flags[j] & FL.BLESSED)) {
            U.flags[j] = (U.flags[j] | FL.BLESSED) & ~FL.CURSED; U.faith[j] += 2;
            if (SPECIES[U.sp[j]].kind === 'civ') { if (rnd() < 0.35) Ent.addTrait(j, 'blessed'); Ent.memory(j, 'Was touched by divine light'); }
          }
        }
        eachCell(x, y, God.brush.r, (i, f) => { if (rnd() < 0.05 * f * k && (Wd.soil[i] === SO.DIRT || Wd.soil[i] === SO.ASH || Wd.soil[i] === SO.BLIGHT)) { Wd.soil[i] = SO.HOLY; Wd.dirty[Wd.chunkOfIdx(i)] = 1; } });
        if (rnd() < 0.5) AG.FX.burst(x + (rnd() - 0.5) * God.brush.r, y + (rnd() - 0.5) * God.brush.r, 'holy', 3, view());
        if (rnd() < 0.2) { Civ.experience(x, y, 'watcher', 0.15); Civ.experience(x, y, 'harvest', 0.08); }
      } },
    { id: 'curse', cat: 'divine', name: 'Curse', mode: 'brush', color: '#ab47bc', desc: 'Blight the land, sap the body; some of the cursed become Hollow.',
      apply: (x, y, k) => {
        const hol = diseaseIndex('The Hollowing');
        for (const j of unitsIn(x, y, God.brush.r, view())) {
          if (SPECIES[U.sp[j]].kind === 'monster') continue;
          if (!(U.flags[j] & FL.CURSED)) {
            U.flags[j] = (U.flags[j] | FL.CURSED) & ~FL.BLESSED;
            if (SPECIES[U.sp[j]].kind === 'civ') { if (rnd() < 0.35) Ent.addTrait(j, 'cursed'); Ent.memory(j, 'Felt the wrath of the heavens'); if (rnd() < 0.08) Ent.infect(j, hol); }
          }
          Ent.damage(j, 0.6 * k, -1, 'a divine curse');
        }
        eachCell(x, y, God.brush.r, (i, f) => { if (rnd() < 0.05 * f * k && Wd.soil[i] !== SO.ROCK && Wd.fl[i] < 0.01) { Wd.soil[i] = SO.BLIGHT; Wd.dirty[Wd.chunkOfIdx(i)] = 1; } });
        if (rnd() < 0.5) AG.FX.burst(x + (rnd() - 0.5) * God.brush.r, y + (rnd() - 0.5) * God.brush.r, 'curse', 3, view());
        if (rnd() < 0.2) { Civ.experience(x, y, 'watcher', 0.15); Civ.experience(x, y, 'death', 0.1); }
      } },
    { id: 'plague', cat: 'divine', name: 'Plague', mode: 'brush', color: '#8bc34a', desc: 'Infect creatures with the disease chosen below. Design your own in the editor.',
      apply: (x, y, k) => {
        for (const j of unitsIn(x, y, God.brush.r, view())) if (rnd() < 0.25 * k && Ent.infect(j, God.disease)) Ent.memory(j, `Fell ill with ${AG.DISEASES[God.disease].name}`);
        if (rnd() < 0.3) AG.FX.burst(x, y, 'acid', 3, view());
        if (rnd() < 0.1) Civ.experience(x, y, 'plague', 0.3);
      } },
    { id: 'mutate', cat: 'divine', name: 'Mutate', mode: 'brush', color: '#4dd0e1', desc: 'Rewrite the genes of living things. Changes are inherited.',
      apply: (x, y, k) => {
        for (const j of unitsIn(x, y, God.brush.r, view())) {
          if (rnd() > 0.15 * k || SPECIES[U.sp[j]].kind === 'vehicle') continue;
          for (let g = 0; g < NG; g++) U.genes[j * NG + g] = AG.clamp(U.genes[j * NG + g] + (rnd() - 0.5) * 70, 0, 255);
          refreshGeneTraits(j);
          AG.FX.burst(U.x[j], U.y[j], 'magic', 4, U.layer[j]);
          if (SPECIES[U.sp[j]].kind === 'civ') Ent.memory(j, 'Was reshaped by an unseen power');
        }
      } },
    { id: 'fertile', cat: 'divine', name: 'Bounty', mode: 'brush', color: '#c5e1a5', desc: 'Make the land bloom and feed every creature in reach.',
      apply: (x, y, k) => {
        eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f * 0.5 * k || Wd.bgrid[i] || Wd.fl[i] > 0.01) return; if (Wd.soil[i] === SO.SAND || Wd.soil[i] === SO.ASH || Wd.soil[i] === SO.BASALT) Wd.soil[i] = SO.DIRT; Wd.veg[i] = Math.min(255, Wd.veg[i] + 40); Wd.dirty[Wd.chunkOfIdx(i)] = 1; });
        for (const j of unitsIn(x, y, God.brush.r, 1)) U.food[j] = 1;
        const c = Civ.cityAt(x, y); if (c) c.food += 0.5 * k;
        if (rnd() < 0.3) AG.FX.burst(x, y, 'heal', 3);
        if (rnd() < 0.2) Civ.experience(x, y, 'harvest', 0.2);
      } },
    { id: 'inspire', cat: 'divine', name: 'Inspire', mode: 'click', color: '#ce93d8', desc: 'Grant a realm a vision: a surge of culture toward its next tradition.',
      click: (x, y) => {
        const k = realmAt(x, y); if (!k) { toast('Tap inside a realm\'s borders'); return; }
        k.inspire += 40; k.cp += 30; k.exp.watcher += 2;
        const c = Civ.capitalOf(k); if (c) AG.FX.burst(c.x, c.y, 'magic', 40);
        AG.Chronicle.add(`A divine vision inspires the ${k.name}`, 'culture', x, y);
      } },
    { id: 'harmony', cat: 'divine', name: 'Harmony', mode: 'click', color: '#81d4fa', desc: 'Tap two realms to bind them in friendship (ends wars).', click: (x, y) => twoRealms(x, y, true) },
    { id: 'discord', cat: 'divine', name: 'Discord', mode: 'click', color: '#ef5350', desc: 'Tap two realms to sow hatred between them (starts wars).', click: (x, y) => twoRealms(x, y, false) },
    // disasters
    { id: 'meteor', cat: 'ruin', name: 'Meteor', mode: 'click', color: '#ff7043', desc: 'Call down a meteor. Leaves a crater seeded with mana crystal.',
      click: (x, y) => { God.meteors.push({ x, y, t: 0, T: 45, r: 4 + God.brush.r * 0.45 }); } },
    { id: 'quake', cat: 'ruin', name: 'Earthquake', mode: 'click', color: '#8d6e63', desc: 'Split the earth along a fault, toppling buildings and caves.', click: (x, y) => God.quake(x, y) },
    { id: 'volcano', cat: 'ruin', name: 'Volcano', mode: 'click', color: '#d84315', desc: 'Raise an erupting volcano fed from the deep magma.', click: (x, y) => God.volcano(x, y) },
    { id: 'tornado', cat: 'ruin', name: 'Tornado', mode: 'click', color: '#b0bec5', desc: 'Spawn a tornado. Keep holding to steer it.',
      click: (x, y) => { God.tornadoes.push({ x, y, vx: 0, vy: 0, life: 700, steer: true, a: 0 }); } },
    { id: 'wyrm', cat: 'ruin', name: 'Wyrm', mode: 'click', color: '#e53935', desc: 'Unleash a fire-breathing wyrm in the sky layer. Possess it to fly it yourself.',
      click: (x, y) => { const i = Ent.spawn(SP.WYRM, x, y, { force: true }); if (i >= 0) AG.Chronicle.add('A wyrm takes to the skies', 'disaster', x, y); } },
    // deep (underground)
    { id: 'dig', cat: 'deep', name: 'Dig', mode: 'brush', color: '#795548', desc: 'Hollow out caverns.', deep: true,
      apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] !== UG.BEDROCK && !Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; }) },
    { id: 'fill', cat: 'deep', name: 'Fill', mode: 'brush', color: '#616161', desc: 'Fill caverns with rock.', deep: true,
      apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] !== UG.BEDROCK) { Wd.ug[i] = UG.ROCK; Wd.ugF[i] = 0; Wd.ugT[i] = 0; } }) },
    { id: 'ore', cat: 'deep', name: 'Ore', mode: 'brush', color: '#ffb300', desc: 'Seed iron and gold veins for miners.', deep: true,
      apply: (x, y) => deep(x, y, (i, f) => { if ((Wd.ug[i] === UG.ROCK || Wd.ug[i] === UG.DIRT) && rnd() < f * 0.3) Wd.ug[i] = rnd() < 0.3 ? UG.GOLD : UG.IRON; }) },
    { id: 'crystal', cat: 'deep', name: 'Crystal', mode: 'brush', color: '#4fc3f7', desc: 'Grow mana crystal; realms that mine it grow wiser.', deep: true,
      apply: (x, y) => deep(x, y, (i, f) => { if (Wd.ug[i] !== UG.BEDROCK && !Wd.ugOpen(i) && rnd() < f * 0.15) Wd.ug[i] = UG.CRYSTAL; }) },
    { id: 'magma', cat: 'deep', name: 'Magma', mode: 'brush', color: '#ff3d00', desc: 'Fill caverns with magma. Careless miners beware.', deep: true,
      apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] === UG.BEDROCK) return; if (!Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.MAGMA; Wd.ugF[i] = 255; }) },
    { id: 'aquifer', cat: 'deep', name: 'Aquifer', mode: 'brush', color: '#29b6f6', desc: 'Fill caverns with groundwater.', deep: true,
      apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] === UG.BEDROCK) return; if (!Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.WATER; Wd.ugF[i] = 230; }) },
    { id: 'crawler', cat: 'deep', name: 'Crawlers', mode: 'brush', color: '#7e57c2', desc: 'Breed cave crawlers in the dark.', deep: true, apply: spawnIn(SP.CRAWLER, 0, 0.3) },
  ];
  God.byId = {}; for (const t of God.TOOLS) God.byId[t.id] = t;
  God.cur = God.byId.inspect;

  function deep(x, y, fn) {
    eachCell(x, y, God.brush.r, (i, f) => fn(i, f));
    const r = Math.ceil(God.brush.r);
    for (let oy = -r; oy <= r; oy += 8) for (let ox = -r; ox <= r; ox += 8) Wd.wakeU(AG.clamp((x + ox) | 0, 0, W - 1), AG.clamp((y + oy) | 0, 0, H - 1));
    Wd.wakeU(x | 0, y | 0);
  }
  function twoRealms(x, y, peace) {
    const k = realmAt(x, y);
    if (!k) { toast('Tap inside a realm\'s borders'); return; }
    if (God.pendingKd < 0 || God.pendingKd === k.id || !Civ.kingdoms[God.pendingKd].alive) {
      God.pendingKd = k.id; toast(`${k.name} chosen — now tap a second realm`); return;
    }
    const A = Civ.kingdoms[God.pendingKd], B = k;
    God.pendingKd = -1;
    A.exp.watcher += 2; B.exp.watcher += 2;
    if (peace) {
      A.mods[B.id] = B.mods[A.id] = 60; A.opinion[B.id] = B.opinion[A.id] = Math.min(100, A.opinion[B.id] + 50);
      if (A.war[B.id]) Civ.makePeace(A, B, 'by divine will'); else toast(`${A.name} and ${B.name} now cherish one another`);
    } else {
      A.mods[B.id] = B.mods[A.id] = -80; A.opinion[B.id] = B.opinion[A.id] = Math.max(-100, A.opinion[B.id] - 60);
      Civ.declareWar(A, B, 'as divine discord takes hold');
    }
  }

  God.select = function (id) {
    const t = God.byId[id]; if (!t) return;
    God.tool = id; God.cur = t; God.pendingKd = -1;
    if (AG.Render) { if (t.deep) AG.Render.view = 0; else if (t.cat !== 'look' && t.cat !== 'sky' && AG.Render.view === 0) AG.Render.view = 1; }
  };
  God.press = function (x, y) {
    God.down = true; God.wx = x; God.wy = y;
    const t = God.cur;
    if (t.mode === 'click') t.click(x, y);
    else t.apply(x, y, 1);
  };
  God.frame = function (dt) {
    const k = Math.min(3, dt * 60);
    if (God.down && God.cur.mode === 'brush') God.cur.apply(God.wx, God.wy, k);
    if (God.shake > 0) God.shake = Math.max(0, God.shake - dt * 30);
    if (God.possessed >= 0 && (!U.alive[God.possessed] || !(U.flags[God.possessed] & FL.POSSESSED))) God.possessed = -1;
  };

  // ------------------------------------------------------------ possession
  God.possess = function (i) {
    if (i < 0 || !U.alive[i]) return false;
    God.release();
    U.flags[i] |= FL.POSSESSED; U.st[i] = ST.IDLE; U.task[i] = TK.NONE;
    God.possessed = i;
    Ent.memory(i, 'Felt a god move within them');
    AG.FX.burst(U.x[i], U.y[i], 'holy', 14, U.layer[i]);
    if (AG.UI) { AG.UI.select('unit', i); AG.UI.toast(`You now walk as ${Ent.name(i)}. WASD / tap to move, Space to strike, E for power, Esc to release.`); }
    if (AG.Render) AG.Render.follow = i;
    return true;
  };
  God.release = function () {
    const i = God.possessed;
    if (i >= 0 && U.alive[i]) { U.flags[i] &= ~FL.POSSESSED; U.st[i] = ST.IDLE; }
    God.possessed = -1; God.input.moveTo = null;
  };

  // ------------------------------------------------------------ disasters
  God.lightning = function (x, y, natural) {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    Sky.strikes.push({ x, y, t: 9, seed: (rnd() * 1e6) | 0 });
    Sky.flash = Math.max(Sky.flash, natural ? 0.45 : 0.8);
    for (const j of unitsIn(x, y, 2, 1)) Ent.damage(j, 60, -1, 'lightning');
    for (const j of unitsIn(x, y, 2.5, 2)) Ent.damage(j, 40, -1, 'lightning');
    eachCell(x, y, 1.6, (i) => {
      if (Wd.veg[i] > 15 || Wd.bgrid[i]) Wd.fire[i] = 240;
      if (Wd.bgrid[i]) Civ.damageBuilding(Wd.bgrid[i] - 1, 40, -1);
      Wd.heat[i] = Math.min(1.2, Wd.heat[i] + 0.4);
    });
    Wd.wake(x | 0, y | 0);
    AG.FX.burst(x, y, 'spark', 16);
    Civ.experience(x, y, 'storm', natural ? 0.4 : 1);
    if (!natural) Civ.experience(x, y, 'watcher', 0.5);
  };
  function placeName(x, y) {
    const c = Civ.nearestCity(x, y, -1, 50);
    return c ? `near ${c.name}` : 'in the wilds';
  }
  function meteorImpact(m) {
    const { x, y, r } = m;
    eachCell(x, y, r * 1.7, (i, f, cx, cy, dd) => {
      const d = dd / r;
      if (Wd.bgrid[i] && d < 1.35) Civ.destroyBuilding(Wd.bgrid[i] - 1, -1);
      if (d < 1) {
        Wd.elev[i] = Math.max(0.03, Wd.elev[i] - 0.14 * (1 - d * d));
        Wd.soil[i] = SO.BASALT; Wd.veg[i] = 0; Wd.snow[i] = 0; Wd.frozen[i] = 0; Wd.heat[i] = 1.1;
        if (d < 0.35 && rnd() < 0.25) { Wd.fl[i] += 0.01; Wd.ft[i] = FT.LAVA; }
        if (d < 0.6 && Wd.ug[i] !== UG.BEDROCK && rnd() < 0.4) Wd.ug[i] = UG.CRYSTAL;
      } else if (d < 1.35) {
        Wd.elev[i] = Math.min(0.97, Wd.elev[i] + 0.05 * (1.35 - d));
        if (Wd.veg[i] > 20) Wd.fire[i] = 230;
      } else if (Wd.veg[i] > 30 && rnd() < 0.45) Wd.fire[i] = 200;
      if (rnd() < 0.3) { Wd.gas[i] = Math.min(1, Wd.gas[i] + 0.4); Wd.gt[i] = GT.SMOKE; }
    });
    for (const j of unitsIn(x, y, r * 1.5, 1)) Ent.damage(j, 300 * (1 - Math.sqrt(AG.dist2(U.x[j], U.y[j], x, y)) / (r * 1.5)), -1, 'a meteor');
    Wd.wakeArea(x | 0, y | 0, Math.ceil(r * 2)); Wd.wakeU(x | 0, y | 0); Wd.epoch++;
    AG.FX.burst(x, y, 'explosion', 90); AG.FX.burst(x, y, 'debris', 30); AG.FX.burst(x, y, 'ember', 30);
    God.shake = 20; Sky.flash = Math.max(Sky.flash, 0.7);
    Civ.experience(x, y, 'fire', 4); Civ.experience(x, y, 'watcher', 2);
    AG.Chronicle.add(`A meteor strikes ${placeName(x, y)}`, 'disaster', x, y);
  }
  God.quake = function (x, y) {
    const a = rnd() * Math.PI, len = 24 + God.brush.r * 2, ca = Math.cos(a), sa = Math.sin(a);
    let vents = 0;
    for (let s = -len; s <= len; s += 0.5) {
      const wob = Math.sin(s * 0.35) * 2.2 + (rnd() - 0.5) * 1.2;
      const px = x + ca * s - sa * wob, py = y + sa * s + ca * wob;
      eachCell(px, py, 1.1, (i) => {
        Wd.elev[i] = Math.max(0.03, Wd.elev[i] - 0.02); Wd.soil[i] = SO.ROCK; Wd.veg[i] = 0;
        if (vents < 2 && rnd() < 0.01) { for (let k = 0; k < 9; k++) { const j = i + ((k % 3) - 1) + (((k / 3) | 0) - 1) * W; if (Wd.ugT[j] === UF.MAGMA) { Wd.vents.push({ x: i % W, y: (i / W) | 0, life: 160, rate: 0.006 }); vents++; break; } } }
      });
    }
    for (const b of Civ.buildings) if (b.alive && AG.dist2(b.cx, b.cy, x, y) < 15 * 15) Civ.damageBuilding(b.id, 40 + rnd() * 90, -1);
    for (const j of unitsIn(x, y, 13, 1)) Ent.damage(j, 4 + rnd() * 10, -1, 'the earthquake');
    for (const j of unitsIn(x, y, 13, 0)) Ent.damage(j, 8 + rnd() * 18, -1, 'a cave-in');
    eachCell(x, y, 14, (i) => {
      if (rnd() > 0.1 || Wd.ug[i] === UG.BEDROCK) return;
      if (Wd.ugOpen(i)) { Wd.ug[i] = UG.ROCK; Wd.ugF[i] = 0; Wd.ugT[i] = 0; } else if (Wd.ug[i] === UG.ROCK) Wd.ug[i] = UG.CAVE;
    });
    for (let oy = -16; oy <= 16; oy += 8) for (let ox = -16; ox <= 16; ox += 8) Wd.wakeU(AG.clamp((x + ox) | 0, 0, W - 1), AG.clamp((y + oy) | 0, 0, H - 1));
    Wd.wakeArea(x | 0, y | 0, len); Wd.epoch++;
    God.shake = 32;
    AG.FX.burst(x, y, 'dust', 40);
    Civ.experience(x, y, 'earth', 4); Civ.experience(x, y, 'watcher', 1);
    AG.Chronicle.add(`The earth splits ${placeName(x, y)}`, 'disaster', x, y);
  };
  God.volcano = function (x, y) {
    const r = 9 + God.brush.r * 0.4;
    eachCell(x, y, r, (i, f, cx, cy, dd) => {
      const d = dd / r;
      if (Wd.bgrid[i] && d < 0.8) Civ.destroyBuilding(Wd.bgrid[i] - 1, -1);
      Wd.elev[i] = Math.min(0.97, Wd.elev[i] + 0.3 * Math.pow(1 - d, 1.5));
      if (d < 0.7) { Wd.soil[i] = SO.BASALT; Wd.veg[i] = 0; }
      Wd.snow[i] = 0; Wd.fl[i] = Wd.ft[i] === FT.WATER ? 0 : Wd.fl[i];
    });
    eachCell(x, y, 1.6, (i) => { Wd.elev[i] -= 0.05; });
    eachCell(x, y, 4, (i) => { if (Wd.ug[i] !== UG.BEDROCK) { Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.MAGMA; Wd.ugF[i] = 255; } });
    Wd.vents.push({ x: x | 0, y: y | 0, life: 900, rate: 0.012 });
    Wd.wakeArea(x | 0, y | 0, Math.ceil(r)); Wd.wakeU(x | 0, y | 0); Wd.epoch++;
    God.shake = 22;
    AG.FX.burst(x, y, 'explosion', 60); AG.FX.burst(x, y, 'ember', 40);
    Civ.experience(x, y, 'fire', 4); Civ.experience(x, y, 'earth', 2);
    AG.Chronicle.add(`A volcano erupts ${placeName(x, y)}`, 'disaster', x, y);
  };

  // per simulation tick
  God.tick = function () {
    for (let k = God.meteors.length - 1; k >= 0; k--) {
      const m = God.meteors[k];
      if (++m.t >= m.T) { meteorImpact(m); God.meteors.splice(k, 1); }
    }
    for (let k = God.tornadoes.length - 1; k >= 0; k--) {
      const t = God.tornadoes[k];
      if (--t.life <= 0 || t.x < 2 || t.y < 2 || t.x > W - 2 || t.y > H - 2) { God.tornadoes.splice(k, 1); continue; }
      const steering = t.steer && God.down && God.tool === 'tornado' && k === God.tornadoes.length - 1;
      if (steering) {
        const dx = God.wx - t.x, dy = God.wy - t.y, d = Math.hypot(dx, dy);
        if (d > 0.5) { t.vx += (dx / d) * 0.03; t.vy += (dy / d) * 0.03; }
        t.vx *= 0.9; t.vy *= 0.9;
      } else {
        t.steer = false;
        t.vx += (Sky.wind.x * 0.12 + (rnd() - 0.5) * 0.15 - t.vx) * 0.05;
        t.vy += (Sky.wind.y * 0.12 + (rnd() - 0.5) * 0.15 - t.vy) * 0.05;
      }
      const sp = Math.hypot(t.vx, t.vy); if (sp > 0.35) { t.vx *= 0.35 / sp; t.vy *= 0.35 / sp; }
      t.x += t.vx; t.y += t.vy; t.a += 0.3;
      for (const j of unitsIn(t.x, t.y, 2.6, 1)) {
        if (rnd() > 0.15 || (U.flags[j] & FL.POSSESSED)) continue;
        U.x[j] = AG.clamp(U.x[j] + (rnd() - 0.5) * 8, 1, W - 1); U.y[j] = AG.clamp(U.y[j] + (rnd() - 0.5) * 8, 1, H - 1);
        U.px[j] = U.x[j]; U.py[j] = U.y[j]; U.st[j] = ST.IDLE;
        Ent.damage(j, 6, -1, 'the tornado');
      }
      eachCell(t.x, t.y, 2.2, (i) => {
        if (Wd.veg[i]) Wd.veg[i] = Wd.veg[i] > 25 ? Wd.veg[i] - 25 : 0;
        Wd.snow[i] = 0; if (Wd.fl[i] > 0) Wd.fl[i] *= 0.92;
        if (Wd.bgrid[i] && rnd() < 0.3) Civ.damageBuilding(Wd.bgrid[i] - 1, 5, -1);
      });
      if ((AG.tick & 3) === 0) Wd.wakeArea(t.x | 0, t.y | 0, 3);
      for (let p = 0; p < 2; p++) {
        const a = rnd() * Math.PI * 2, rr = 0.5 + rnd() * 2;
        AG.FX.spawn(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, -Math.sin(a) * 0.15 + t.vx, Math.cos(a) * 0.15 + t.vy, 0.9, rnd() < 0.5 ? [140, 120, 100] : [190, 190, 200], 0.6, 0, 1, 0.12, -0.001);
      }
    }
  };
})();
