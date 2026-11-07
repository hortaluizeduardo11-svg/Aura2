/* AURA: Genesis 2 — god.js
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
  const toast = (m) => AG.UI && AG.UI.toast(m);
  function realmAt(x, y) { const c = Civ.cityAt(x, y); return c ? Civ.kingdoms[c.kd] : null; }

  const diseaseIndex = (name) => Math.max(0, AG.DISEASES.findIndex((d) => d.name === name));

  // A god's acts leave traces: people who see them remember, and their gods take shape from it.
  function witness(x, y, r, kind, text, v) {
    const P = AG.People, MK = P.MK;
    for (const j of unitsIn(x, y, r, 1)) { const Q = Ent.person(j); if (Q) P.remember(Q, kind, { v, s: 0.8, d: text }); }
    for (const c of Civ.cities) { if (!c.alive || c.materialized || AG.dist2(c.x, c.y, x, y) > r * r * 4) continue; for (const id of c.members) { const Q = P.get(id); if (Q && rnd() < 0.5) P.remember(Q, kind, { v, s: 0.6, d: text }); } }
  }
  God.witness = witness;
  function personAt(x, y) { const u = AG.UI ? AG.UI.unitAt(x, y) : -1; return u >= 0 ? Ent.person(u) : null; }
  function locusEdit(delta) {
    return (x, y, k) => {
      const L = God.locus, GL = AG.Life.GL;
      for (const j of unitsIn(x, y, God.brush.r, view())) {
        if (rnd() > 0.2 * k || AG.SPECIES[U.sp[j]].kind === 'vehicle') continue;
        for (const a of [0, 1]) U.gen[j * GL + 2 * L + a] = AG.clamp(U.gen[j * GL + 2 * L + a] + delta * (8 + rnd() * 10), 0, 255);
        const Q = Ent.person(j);
        if (Q) { Q.gen.set(U.gen.subarray(j * GL, j * GL + GL)); AG.People.remember(Q, AG.People.MK.MIRACLE, { v: 0.1, s: 0.5, d: 'felt their body change' }); }
        Ent.deriveStats(j);
        AG.FX.burst(U.x[j], U.y[j], 'magic', 3, U.layer[j]);
      }
    };
  }
  God.locus = 10; // cold tolerance by default
  God.CATS = [
    { id: 'look', name: 'Watch' }, { id: 'land', name: 'Terrain' }, { id: 'geo', name: 'Geology' }, { id: 'elem', name: 'Elements' }, { id: 'sky', name: 'Weather' },
    { id: 'life', name: 'Life' }, { id: 'divine', name: 'Divine' }, { id: 'ruin', name: 'Disasters' }, { id: 'deep', name: 'Deep' },
  ];
  const plateSel = { id: -1 };
  God.TOOLS = [
    { id: 'inspect', cat: 'look', name: 'Inspect', mode: 'click', color: '#e0e0e0', desc: 'Tap a person, animal, building or people to read its story. Drag to pan.', click: (x, y) => AG.UI.pick(x, y) },
    { id: 'possess', cat: 'look', name: 'Possess', mode: 'click', color: '#ffd54f', desc: 'Take control of any creature. WASD to move, Space to strike, E to throw, Esc to release.',
      click: (x, y) => { const u = AG.UI.unitAt(x, y); if (u >= 0) God.possess(u); else toast('Tap directly on a creature to possess it'); } },
    // terrain
    { id: 'raise', cat: 'land', name: 'Raise', mode: 'brush', color: '#a1887f', desc: 'Lift the land. Close a strait to join two lands.',
      apply: (x, y, k) => { const s = God.brush.str * k; eachCell(x, y, God.brush.r, (i, f) => { Wd.elev[i] = Math.min(0.98, Wd.elev[i] + 0.004 * s * f); }); touched(x, y, God.brush.r); } },
    { id: 'lower', cat: 'land', name: 'Lower', mode: 'brush', color: '#6d4c41', desc: 'Carve valleys, lakes and channels. Open a strait to part two lands.',
      apply: (x, y, k) => { const s = God.brush.str * k; eachCell(x, y, God.brush.r, (i, f) => { Wd.elev[i] = Math.max(0.02, Wd.elev[i] - 0.004 * s * f); }); touched(x, y, God.brush.r); } },
    { id: 'smooth', cat: 'land', name: 'Smooth', mode: 'brush', color: '#bcaaa4', desc: 'Flatten rough ground.',
      apply: (x, y, k) => { const s = Math.min(1, God.brush.str * k * 0.3); eachCell(x, y, God.brush.r, (i, f) => { const e = Wd.elev; const avg = (e[i - 1] + e[i + 1] + e[i - W] + e[i + W] + e[i]) / 5; e[i] += (avg - e[i]) * s * f; }); touched(x, y, God.brush.r); } },
    { id: 'grass', cat: 'land', name: 'Meadow', mode: 'brush', color: '#7cb342', desc: 'Paint fertile grassland.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f) return; if (Wd.soil[i] !== SO.FARM && Wd.soil[i] !== SO.ROAD) Wd.soil[i] = SO.DIRT; Wd.veg[i] = Math.max(Wd.veg[i], 130); Wd.fert[i] = Math.max(Wd.fert[i], 150); Wd.snow[i] = 0; Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'forest', cat: 'land', name: 'Forest', mode: 'brush', color: '#2e7d32', desc: 'Grow dense woodland.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f * 0.7 || Wd.bgrid[i]) return; Wd.soil[i] = SO.DIRT; Wd.veg[i] = 235; Wd.moist[i] = Math.min(1, Wd.moist[i] + 0.01); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'desert', cat: 'land', name: 'Desert', mode: 'brush', color: '#e6c77a', desc: 'Dry the land into sand.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f) return; if (!Wd.bgrid[i]) Wd.soil[i] = SO.SAND; Wd.veg[i] = 0; Wd.cereal[i] = 0; Wd.moist[i] = Math.max(0, Wd.moist[i] - 0.01); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'grain', cat: 'land', name: 'Wild grain', mode: 'brush', color: '#e8c25a', desc: 'Sow wild cereals. Where they grow, people may learn to farm.',
      apply: (x, y) => eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f || Wd.elev[i] < AG.SEA || Wd.ice[i]) return; Wd.cereal[i] = Math.max(Wd.cereal[i], 200); Wd.fert[i] = Math.max(Wd.fert[i], 140); Wd.dirty[Wd.chunkOfIdx(i)] = 1; }) },
    { id: 'snowcap', cat: 'land', name: 'Ice', mode: 'brush', color: '#eceff1', desc: 'Lay down glacier ice.',
      apply: (x, y) => { eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f || Wd.elev[i] < AG.SEA) return; Wd.ice[i] = 200; Wd.snow[i] = 230; Wd.veg[i] = 0; Wd.cereal[i] = 0; Wd.dirty[Wd.chunkOfIdx(i)] = 1; }); touched(x, y, God.brush.r); } },
    // geology
    { id: 'plate', cat: 'geo', name: 'Push plate', mode: 'click', color: '#ff8f00', desc: 'Tap a plate, then tap where it should drift. Plates move over millions of years (deep time) or creep in history.',
      click: (x, y) => {
        const G = AG.Geo, c = G.cellOf(x, y);
        if (plateSel.id < 0) { plateSel.id = G.plate[c]; plateSel.x = x; plateSel.y = y; toast(`Plate ${plateSel.id} chosen — now tap the direction it should move`); return; }
        const p = G.plates[plateSel.id], dx = x - plateSel.x, dy = y - plateSel.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(2.5, d / 30);
        p.tx = p.vx = (dx / d) * sp; p.ty = p.vy = (dy / d) * sp;
        toast(`Plate ${p.id} now drifts at ${sp.toFixed(1)} cells per million years`); plateSel.id = -1;
        AG.History.event('god', `A god pushes a continental plate`, { x, y, cause: 'divine will' });
      } },
    { id: 'fault', cat: 'geo', name: 'Trigger quake', mode: 'click', color: '#8d6e63', desc: 'Release the strain under a fault now. Strength sets the magnitude.', click: (x, y) => God.quake(x, y, 5.5 + God.brush.str * 3.3) },
    { id: 'calm', cat: 'geo', name: 'Calm fault', mode: 'brush', color: '#a5d6a7', desc: 'Let strain bleed away quietly (no earthquakes here for a while).',
      apply: (x, y) => { const G = AG.Geo; eachCell(x, y, God.brush.r * 2, (i) => { const c = G.cellOf(i % W, (i / W) | 0); G.strain[c] *= 0.9; G.magma[c] *= 0.97; }); } },
    { id: 'erupt', cat: 'geo', name: 'Force eruption', mode: 'click', color: '#d84315', desc: 'Make the nearest volcano erupt, or open a new one here.',
      click: (x, y) => { const G = AG.Geo; let v = null, bd = 30 * 30; for (const q of G.volcanoes) { const d = AG.dist2(q.x, q.y, x, y); if (d < bd) { bd = d; v = q; } } if (v) v.magma = 3; else { G.volcanoes.push({ gx: (x / G.CS) | 0, gy: (y / G.CS) | 0, x: x | 0, y: y | 0, magma: 3, name: '', erupted: 0 }); } toast('The mountain rumbles…'); } },
    { id: 'iceage', cat: 'geo', name: 'Ice age', mode: 'click', color: '#b3e5fc', desc: 'Cool the world: ice sheets grow over centuries and the sea falls, opening land bridges.',
      click: () => { AG.Geo.climate.carbon -= 0.05; AG.History.event('god', 'The world grows colder by divine will', { cause: 'divine will' }); toast('The climate cools. Ice will spread and the sea will fall over the coming centuries.'); } },
    { id: 'warm', cat: 'geo', name: 'Warm world', mode: 'click', color: '#ffcc80', desc: 'Warm the world: ice caps melt and the sea rises.',
      click: () => { AG.Geo.climate.carbon += 0.05; AG.History.event('god', 'The world grows warmer by divine will', { cause: 'divine will' }); toast('The climate warms. Ice will melt and the sea will rise.'); } },
    // elements
    { id: 'water', cat: 'elem', name: 'Water', mode: 'brush', color: '#42a5f5', desc: 'Pour water. It flows downhill and floods low ground.', apply: pour(FT.WATER, 0.012) },
    { id: 'lava', cat: 'elem', name: 'Lava', mode: 'brush', color: '#ff5722', desc: 'Pour lava. It burns, hardens to basalt and leaves fertile ash.', apply: pour(FT.LAVA, 0.01) },
    { id: 'acid', cat: 'elem', name: 'Acid', mode: 'brush', color: '#76ff03', desc: 'Pour acid that dissolves land and life.', apply: pour(FT.ACID, 0.01) },
    { id: 'fire', cat: 'elem', name: 'Fire', mode: 'brush', color: '#ff9800', desc: 'Set things alight. Wind carries the flames.',
      apply: (x, y) => { eachCell(x, y, God.brush.r * 0.6, (i, f) => { if (rnd() > f * 0.6) return; if (Wd.veg[i] > 10 || Wd.bgrid[i]) Wd.fire[i] = 255; else Wd.heat[i] = Math.min(1.2, Wd.heat[i] + 0.25); }); touched(x, y, God.brush.r); if (rnd() < 0.2) Civ.experience(x, y, 'fire', 0.1); } },
    { id: 'freeze', cat: 'elem', name: 'Frost', mode: 'brush', color: '#80deea', desc: 'Pull heat out of the world. Water freezes, fire dies.',
      apply: (x, y, k) => { eachCell(x, y, God.brush.r, (i, f) => { Wd.heat[i] = Math.max(-1.6, Wd.heat[i] - 0.08 * God.brush.str * k * f); Wd.fire[i] = 0; }); touched(x, y, God.brush.r); } },
    { id: 'drain', cat: 'elem', name: 'Drain', mode: 'brush', color: '#90a4ae', desc: 'Remove liquids and gases.',
      apply: (x, y, k) => { eachCell(x, y, God.brush.r, (i, f) => { const m = 1 - Math.min(1, 0.2 * God.brush.str * k * f); Wd.fl[i] *= m; Wd.gas[i] *= m; if (Wd.fl[i] < 1e-4) { Wd.fl[i] = 0; Wd.ft[i] = 0; Wd.frozen[i] = 0; } }); touched(x, y, God.brush.r); } },
    // weather
    { id: 'rain', cat: 'sky', name: 'Rain', mode: 'click', color: '#64b5f6', desc: 'Summon a drifting rainstorm.', click: storm('rain') },
    { id: 'thunder', cat: 'sky', name: 'Thunder', mode: 'click', color: '#b39ddb', desc: 'Summon a thunderstorm that hurls lightning.', click: storm('thunder') },
    { id: 'blizzard', cat: 'sky', name: 'Blizzard', mode: 'click', color: '#e3f2fd', desc: 'Summon a freezing blizzard.', click: storm('blizzard') },
    { id: 'heat', cat: 'sky', name: 'Drought', mode: 'click', color: '#ffb74d', desc: 'A heatwave that parches crops and forests.', click: storm('heat') },
    { id: 'bolt', cat: 'sky', name: 'Lightning', mode: 'click', color: '#fff59d', desc: 'Strike a single bolt where you tap.', click: (x, y) => God.lightning(x, y, false) },
    // life
    { id: 'people', cat: 'life', name: 'People', mode: 'click', color: '#d9a77a', desc: 'Set down a band of people here (after the Dawn).', click: (x, y) => { if (!Civ.godBand || !Civ.godBand(x, y)) toast('People can only be placed on open, dry land after the Dawn'); } },
    { id: 'grazers', cat: 'life', name: 'Grazers', mode: 'brush', color: '#c49a6c', desc: 'Release grazers of the nearest living species.', apply: spawnIn(SP.GRAZER, 1, 0.5) },
    { id: 'hunters', cat: 'life', name: 'Predators', mode: 'brush', color: '#9e9e9e', desc: 'Release predators of the nearest living species.', apply: spawnIn(SP.PREDATOR, 1, 0.25) },
    { id: 'birds', cat: 'life', name: 'Birds', mode: 'brush', color: '#455a64', desc: 'Release a flock.', apply: spawnIn(SP.BIRD, 2, 0.6) },
    { id: 'apes', cat: 'life', name: 'Apes', mode: 'brush', color: '#8d6e63', desc: 'Release apes of the nearest primate species.', apply: spawnIn(SP.APE, 1, 0.3) },
    { id: 'geneup', cat: 'life', name: 'Gene +', mode: 'brush', color: '#4dd0e1', desc: 'Raise the chosen gene (both alleles) in creatures under the brush. It is inherited.', apply: locusEdit(1), locus: true },
    { id: 'genedown', cat: 'life', name: 'Gene −', mode: 'brush', color: '#26a69a', desc: 'Lower the chosen gene in creatures under the brush.', apply: locusEdit(-1), locus: true },
    { id: 'mutate', cat: 'life', name: 'Mutate', mode: 'brush', color: '#80cbc4', desc: 'Scramble genomes at random (rare large mutations included).',
      apply: (x, y, k) => { for (const j of unitsIn(x, y, God.brush.r, view())) { if (rnd() > 0.15 * k || AG.SPECIES[U.sp[j]].kind === 'vehicle') continue; AG.Life.mutate(U.gen, j * AG.Life.GL, AG.rnd, 8); const Q = Ent.person(j); if (Q) Q.gen.set(U.gen.subarray(j * AG.Life.GL, (j + 1) * AG.Life.GL)); Ent.deriveStats(j); AG.FX.burst(U.x[j], U.y[j], 'magic', 4, U.layer[j]); } } },
    { id: 'fertile', cat: 'life', name: 'Bounty', mode: 'brush', color: '#c5e1a5', desc: 'Make the land bloom and feed every creature in reach.',
      apply: (x, y, k) => {
        eachCell(x, y, God.brush.r, (i, f) => { if (rnd() > f * 0.5 * k || Wd.bgrid[i] || Wd.fl[i] > 0.01) return; if (Wd.soil[i] === SO.SAND || Wd.soil[i] === SO.BASALT) Wd.soil[i] = SO.DIRT; Wd.veg[i] = Math.min(255, Wd.veg[i] + 40); Wd.fert[i] = Math.min(255, Wd.fert[i] + 10); Wd.dirty[Wd.chunkOfIdx(i)] = 1; });
        for (const j of unitsIn(x, y, God.brush.r, 1)) U.energy[j] = 1;
        const c = Civ.cityAt(x, y); if (c) c.food += 0.5 * k;
        if (rnd() < 0.3) AG.FX.burst(x, y, 'heal', 3);
        if (rnd() < 0.2) Civ.experience(x, y, 'harvest', 0.2);
      } },
    // divine
    { id: 'bless', cat: 'divine', name: 'Bless', mode: 'brush', color: '#ffe082', desc: 'Heal and strengthen. Those touched remember a miracle.',
      apply: (x, y, k) => {
        for (const j of unitsIn(x, y, God.brush.r, view())) {
          U.hp[j] = Math.min(U.mhp[j], U.hp[j] + 2 * k);
          if (!(U.flags[j] & FL.BLESSED)) { U.flags[j] = (U.flags[j] | FL.BLESSED) & ~FL.CURSED; const Q = Ent.person(j); if (Q) { Q.flags |= 1; Q.belief.devotion = Math.min(1, Q.belief.devotion + 0.2); AG.People.remember(Q, AG.People.MK.MIRACLE, { v: 0.8, s: 0.9, d: 'a light that healed them' }); if (rnd() < 0.3) AG.People.addTrait(Q, 'blessed'); } }
        }
        if (rnd() < 0.5) AG.FX.burst(x + (rnd() - 0.5) * God.brush.r, y + (rnd() - 0.5) * God.brush.r, 'holy', 3, view());
        if (rnd() < 0.2) { Civ.experience(x, y, 'watcher', 0.15); Civ.experience(x, y, 'harvest', 0.08); }
      } },
    { id: 'curse', cat: 'divine', name: 'Curse', mode: 'brush', color: '#ab47bc', desc: 'Blight the land and sap the body. The cursed remember the wrath of the heavens.',
      apply: (x, y, k) => {
        for (const j of unitsIn(x, y, God.brush.r, view())) {
          if (!(U.flags[j] & FL.CURSED)) { U.flags[j] = (U.flags[j] | FL.CURSED) & ~FL.BLESSED; const Q = Ent.person(j); if (Q) { AG.People.remember(Q, AG.People.MK.OMEN, { v: -0.8, s: 0.9, d: 'the wrath of the heavens' }); if (rnd() < 0.3) AG.People.addTrait(Q, 'cursed'); } }
          Ent.damage(j, 0.6 * k, -1, 'a divine curse');
        }
        eachCell(x, y, God.brush.r, (i, f) => { if (rnd() < 0.05 * f * k && Wd.soil[i] !== SO.ROCK && Wd.fl[i] < 0.01) { Wd.soil[i] = SO.BLIGHT; Wd.fert[i] = Math.max(0, Wd.fert[i] - 40); Wd.dirty[Wd.chunkOfIdx(i)] = 1; } });
        if (rnd() < 0.5) AG.FX.burst(x + (rnd() - 0.5) * God.brush.r, y + (rnd() - 0.5) * God.brush.r, 'curse', 3, view());
        if (rnd() < 0.2) { Civ.experience(x, y, 'watcher', 0.15); Civ.experience(x, y, 'death', 0.1); }
      } },
    { id: 'plague', cat: 'divine', name: 'Plague', mode: 'brush', color: '#8bc34a', desc: 'Infect creatures with the disease chosen below. Design your own in the editor.',
      apply: (x, y, k) => { for (const j of unitsIn(x, y, God.brush.r, view())) if (rnd() < 0.25 * k) Ent.infect(j, God.disease); if (rnd() < 0.3) AG.FX.burst(x, y, 'acid', 3, view()); if (rnd() < 0.1) Civ.experience(x, y, 'plague', 0.3); } },
    { id: 'dream', cat: 'divine', name: 'Send a dream', mode: 'click', color: '#9fa8da', desc: 'Tap a person to send them a dream. They wake changed: an explorer, a prophet, a founder.',
      click: (x, y) => {
        const Q = personAt(x, y); if (!Q) { toast('Tap directly on a person'); return; }
        const opts = [['of a land beyond the hills', 3, 15], ['of a voice from the sky', 4, 12], ['of a new way of doing things', 7, 23], ['of leading their people', 5, 20]];
        const [d, goal, taste] = opts[(rnd() * opts.length) | 0];
        AG.People.remember(Q, AG.People.MK.DREAM, { v: 0.6, s: 1, d, core: true });
        Q.goal = goal; Q.goalDone = false; AG.People.taste(Q, taste, 60); Q.pers.open = Math.min(1, Q.pers.open + 0.15); Q.belief.devotion = Math.min(1, Q.belief.devotion + 0.2);
        if (goal === 7) AG.People.addTrait(Q, 'curious');
        Civ.experience(x, y, 'watcher', 0.5);
        toast(`${Q.name} dreams ${d}`);
      } },
    { id: 'omen', cat: 'divine', name: 'Omen', mode: 'click', color: '#ce93d8', desc: 'Show a community a sign in the sky. It strengthens faith, and frightened bands may move.',
      click: (x, y) => {
        const c = Civ.cityAt(x, y) || Civ.nearestCity(x, y, -1, 30); if (!c) { toast('Tap a community'); return; }
        const k = Civ.kingdoms[c.kd];
        witness(c.x, c.y, 18, AG.People.MK.OMEN, 'a burning sign in the sky', 0.2);
        k.exp.watcher += 3; k.legit = Math.max(0, k.legit - 0.05);
        for (const id of c.members) { const Q = AG.People.get(id); if (Q) Q.belief.devotion = Math.min(1, Q.belief.devotion + 0.15); }
        if (c.nomadic && rnd() < 0.6) Civ.moveCamp(c, 'omen');
        AG.FX.burst(c.x, c.y - 4, 'magic', 40); AG.Sky.flash = 0.6;
        AG.History.event('omen', `An omen burns in the sky over ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: 'divine will' });
      } },
    { id: 'inspire', cat: 'divine', name: 'Inspire', mode: 'click', color: '#f48fb1', desc: 'Kindle curiosity in a community: discoveries come faster there for a generation.',
      click: (x, y) => {
        const c = Civ.cityAt(x, y) || Civ.nearestCity(x, y, -1, 30); if (!c) { toast('Tap a community'); return; }
        c.inspired = AG.Geo.year + 30;
        for (const id of c.members) { const Q = AG.People.get(id); if (Q && rnd() < 0.3) { Q.pers.open = Math.min(1, Q.pers.open + 0.2); AG.People.remember(Q, AG.People.MK.DREAM, { v: 0.5, s: 0.7, d: 'of fire and making' }); } }
        AG.FX.burst(c.x, c.y, 'magic', 30); Civ.experience(c.x, c.y, 'watcher', 1);
        AG.History.event('god', `A spark of inspiration falls on ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: 'divine will' });
      } },
    { id: 'harmony', cat: 'divine', name: 'Harmony', mode: 'click', color: '#81d4fa', desc: 'Tap two peoples to bind them in friendship (ends wars).', click: (x, y) => twoRealms(x, y, true) },
    { id: 'discord', cat: 'divine', name: 'Discord', mode: 'click', color: '#ef5350', desc: 'Tap two peoples to sow hatred between them.', click: (x, y) => twoRealms(x, y, false) },
    // disasters
    { id: 'meteor', cat: 'ruin', name: 'Meteor', mode: 'click', color: '#ff7043', desc: 'Call down a meteor.', click: (x, y) => { God.meteors.push({ x, y, t: 0, T: 45, r: 4 + God.brush.r * 0.45 }); } },
    { id: 'volcano', cat: 'ruin', name: 'Volcano', mode: 'click', color: '#d84315', desc: 'Raise an erupting volcano.', click: (x, y) => God.volcano(x, y, 4) },
    { id: 'tornado', cat: 'ruin', name: 'Tornado', mode: 'click', color: '#b0bec5', desc: 'Spawn a tornado. Keep holding to steer it.', click: (x, y) => { God.tornadoes.push({ x, y, vx: 0, vy: 0, life: 700, steer: true, a: 0 }); } },
    { id: 'tsunami', cat: 'ruin', name: 'Tsunami', mode: 'click', color: '#4fc3f7', desc: 'Send a great wave onto the nearest coast.', click: (x, y) => God.tsunami(x, y, 8) },
    // deep (underground)
    { id: 'dig', cat: 'deep', name: 'Dig', mode: 'brush', color: '#795548', desc: 'Hollow out caverns.', deep: true, apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] !== UG.BEDROCK && !Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; }) },
    { id: 'fill', cat: 'deep', name: 'Fill', mode: 'brush', color: '#616161', desc: 'Fill caverns with rock.', deep: true, apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] !== UG.BEDROCK) { Wd.ug[i] = UG.ROCK; Wd.ugF[i] = 0; Wd.ugT[i] = 0; } }) },
    { id: 'ore', cat: 'deep', name: 'Ore', mode: 'brush', color: '#ffb300', desc: 'Seed copper, tin and iron for miners (and their surface outcrops).', deep: true,
      apply: (x, y) => deep(x, y, (i, f) => { if ((Wd.ug[i] === UG.ROCK || Wd.ug[i] === UG.DIRT) && rnd() < f * 0.3) { const r = rnd(); Wd.ug[i] = r < 0.4 ? UG.COPPER : r < 0.6 ? UG.TIN : UG.IRON; if (rnd() < 0.2 && Wd.elev[i] >= AG.SEA) Wd.res[i] = Wd.ug[i] === UG.COPPER ? AG.RES.COPPER : Wd.ug[i] === UG.TIN ? AG.RES.TIN : AG.RES.IRON; } }) },
    { id: 'magma', cat: 'deep', name: 'Magma', mode: 'brush', color: '#ff3d00', desc: 'Fill caverns with magma.', deep: true, apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] === UG.BEDROCK) return; if (!Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.MAGMA; Wd.ugF[i] = 255; }) },
    { id: 'aquifer', cat: 'deep', name: 'Aquifer', mode: 'brush', color: '#29b6f6', desc: 'Fill caverns with groundwater.', deep: true, apply: (x, y) => deep(x, y, (i) => { if (Wd.ug[i] === UG.BEDROCK) return; if (!Wd.ugOpen(i)) Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.WATER; Wd.ugF[i] = 230; }) },
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
  // Every act is logged (tick, tool, place, brush) so a replay can repeat it exactly.
  God.apply = function (id, x, y, k, r, str, extra) {
    if (AG.History.flushSnap) AG.History.flushSnap(); // a snapshot being copied belongs to the moment before
    const t = God.byId[id]; if (!t) return;
    const br = God.brush.r, bs = God.brush.str, loc = God.locus;
    if (r !== undefined) { God.brush.r = r; God.brush.str = str; if (extra !== undefined) God.locus = extra; }
    if (t.mode === 'click') t.click(x, y); else t.apply(x, y, k);
    God.brush.r = br; God.brush.str = bs; God.locus = loc;
  };
  function act(t, x, y, k) {
    if (t.id !== 'inspect' && t.id !== 'possess') {
      AG.History.record('tool', { id: t.id, x, y, k, r: God.brush.r, s: God.brush.str, l: God.locus });
      if (AG.mode === 'deep' && AG.Render && AG.Render.deepPoke) AG.Render.deepPoke(); // the deep-time map shows what it did
    }
    if (t.mode === 'click') t.click(x, y); else t.apply(x, y, k);
  }
  God.press = function (x, y) {
    God.down = true; God.wx = x; God.wy = y;
    act(God.cur, x, y, 1);
  };
  God.frame = function (dt) {
    const k = Math.min(3, dt * 60);
    if (God.down && God.cur.mode === 'brush') act(God.cur, God.wx, God.wy, k);
    if (God.shake > 0) God.shake = Math.max(0, God.shake - dt * 30);
    if (God.possessed >= 0 && (!U.alive[God.possessed] || !(U.flags[God.possessed] & FL.POSSESSED))) God.possessed = -1;
  };

  // ------------------------------------------------------------ possession
  God.possess = function (i) {
    if (i < 0 || !U.alive[i]) return false;
    God.release();
    U.flags[i] |= FL.POSSESSED; U.st[i] = ST.IDLE; U.task[i] = TK.NONE;
    God.possessed = i;
    const Q = Ent.person(i); if (Q) AG.People.remember(Q, AG.People.MK.MIRACLE, { v: 0.3, s: 1, d: 'a god moving within them', core: true });
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
        if (d < 0.6 && Wd.ug[i] !== UG.BEDROCK && rnd() < 0.3) Wd.ug[i] = UG.IRON; // meteoric iron
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
    witness(x, y, r * 4, AG.People.MK.DISASTER, 'the falling star', -0.9);
    AG.History.event('quake', `A meteor strikes ${placeName(x, y)}`, { x, y, cause: 'a falling star' });
  }
  God.quake = function (x, y, mag, natural) {
    mag = mag || 7;
    const sc = Math.max(0.3, (mag - 4.5) / 3);
    const a = rnd() * Math.PI, len = (14 + God.brush.r) * sc, ca = Math.cos(a), sa = Math.sin(a);
    let vents = 0;
    for (let s = -len; s <= len; s += 0.5) {
      const wob = Math.sin(s * 0.35) * 2.2 + (rnd() - 0.5) * 1.2;
      const px = x + ca * s - sa * wob, py = y + sa * s + ca * wob;
      eachCell(px, py, 1.1, (i) => {
        Wd.elev[i] = Math.max(0.03, Wd.elev[i] - 0.02); Wd.soil[i] = SO.ROCK; Wd.veg[i] = 0;
        if (vents < 2 && rnd() < 0.01) { for (let k = 0; k < 9; k++) { const j = i + ((k % 3) - 1) + (((k / 3) | 0) - 1) * W; if (Wd.ugT[j] === UF.MAGMA) { Wd.vents.push({ x: i % W, y: (i / W) | 0, life: 160, rate: 0.006 }); vents++; break; } } }
      });
    }
    const R = 8 + 6 * sc;
    for (const b of Civ.buildings) if (b.alive && AG.dist2(b.cx, b.cy, x, y) < R * R) Civ.damageBuilding(b.id, (40 + rnd() * 90) * sc, -1);
    for (const j of unitsIn(x, y, R, 1)) Ent.damage(j, (4 + rnd() * 10) * sc, -1, 'the earthquake');
    for (const j of unitsIn(x, y, R, 0)) Ent.damage(j, (8 + rnd() * 18) * sc, -1, 'a cave-in');
    witness(x, y, R * 1.5, AG.People.MK.QUAKE, `the great quake (magnitude ${mag.toFixed(1)})`, -0.8);
    eachCell(x, y, 14, (i) => {
      if (rnd() > 0.1 || Wd.ug[i] === UG.BEDROCK) return;
      if (Wd.ugOpen(i)) { Wd.ug[i] = UG.ROCK; Wd.ugF[i] = 0; Wd.ugT[i] = 0; } else if (Wd.ug[i] === UG.ROCK) Wd.ug[i] = UG.CAVE;
    });
    for (let oy = -16; oy <= 16; oy += 8) for (let ox = -16; ox <= 16; ox += 8) Wd.wakeU(AG.clamp((x + ox) | 0, 0, W - 1), AG.clamp((y + oy) | 0, 0, H - 1));
    Wd.wakeArea(x | 0, y | 0, len); Wd.epoch++;
    God.shake = 32;
    AG.FX.burst(x, y, 'dust', 40);
    Civ.experience(x, y, 'earth', 2 + sc * 2); if (!natural) Civ.experience(x, y, 'watcher', 1);
    AG.History.event('quake', `A magnitude ${mag.toFixed(1)} earthquake shakes the land ${placeName(x, y)}`, { x, y, cause: natural ? 'strain released on the fault' : 'divine will' });
  };
  God.volcano = function (x, y, vei, natural) {
    vei = vei || 4;
    const r = (5 + vei * 1.6) * (natural ? 0.8 : 1) + (natural ? 0 : God.brush.r * 0.4);
    eachCell(x, y, r, (i, f, cx, cy, dd) => {
      const d = dd / r;
      if (Wd.bgrid[i] && d < 0.8) Civ.destroyBuilding(Wd.bgrid[i] - 1, -1);
      Wd.elev[i] = Math.min(0.97, Wd.elev[i] + 0.3 * Math.pow(1 - d, 1.5));
      if (d < 0.7) { Wd.soil[i] = SO.BASALT; Wd.veg[i] = 0; }
      Wd.snow[i] = 0; Wd.fl[i] = Wd.ft[i] === FT.WATER ? 0 : Wd.fl[i];
    });
    eachCell(x, y, 1.6, (i) => { Wd.elev[i] -= 0.05; });
    eachCell(x, y, 4, (i) => { if (Wd.ug[i] !== UG.BEDROCK) { Wd.ug[i] = UG.CAVE; Wd.ugT[i] = UF.MAGMA; Wd.ugF[i] = 255; } });
    Wd.vents.push({ x: x | 0, y: y | 0, life: 300 + vei * 140, rate: 0.006 + vei * 0.0015 });
    eachCell(x, y, r * 2.5, (i, f) => { if (Wd.soil[i] === SO.DIRT && rnd() < f) Wd.fert[i] = Math.min(255, Wd.fert[i] + 25 * f); }); // ash makes the land rich
    witness(x, y, r * 3, AG.People.MK.ERUPTION, 'the mountain of fire', -0.8);
    Wd.wakeArea(x | 0, y | 0, Math.ceil(r)); Wd.wakeU(x | 0, y | 0); Wd.epoch++;
    God.shake = 22;
    AG.FX.burst(x, y, 'explosion', 60); AG.FX.burst(x, y, 'ember', 40);
    Civ.experience(x, y, 'fire', 2 + vei); Civ.experience(x, y, 'earth', 2);
    AG.History.event('eruption', `A volcano erupts ${placeName(x, y)} (VEI ${vei})`, { x, y, cause: natural ? 'magma rising under the mountain' : 'divine will' });
  };
  // A wave runs onto the coast near (x, y): water poured along the shore.
  God.tsunami = function (x, y, mag, natural) {
    let n = 0;
    for (let t = 0; t < 400 && n < 60; t++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 22, px = (x + Math.cos(a) * rr) | 0, py = (y + Math.sin(a) * rr) | 0;
      if (px < 2 || py < 2 || px >= W - 2 || py >= H - 2) continue;
      const i = py * W + px;
      if (Wd.elev[i] >= AG.SEA && Wd.elev[i] < AG.SEA + 0.05 && (Wd.fl[i - 1] > 0.05 || Wd.fl[i + 1] > 0.05 || Wd.fl[i - W] > 0.05 || Wd.fl[i + W] > 0.05)) { eachCell(px, py, 3, (j) => { Wd.fl[j] += 0.03 * (mag / 8); Wd.ft[j] = FT.WATER; }); n++; }
    }
    Wd.wakeArea(x | 0, y | 0, 30); God.shake = 12;
    witness(x, y, 30, AG.People.MK.FLOOD, 'the great wave', -0.9);
    Civ.experience(x, y, 'water', 4);
    AG.History.event('tsunami', `A great wave strikes the coast ${placeName(x, y)}`, { x, y, cause: natural ? 'an undersea earthquake' : 'divine will' });
  };
  God.state = () => ({ tornadoes: God.tornadoes.map((t) => Object.assign({}, t)), meteors: God.meteors.map((m) => Object.assign({}, m)) });
  God.setState = (s) => { God.tornadoes = s.tornadoes; God.meteors = s.meteors; God.possessed = -1; };

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
