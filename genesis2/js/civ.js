/* AURA: Genesis 2 — civ.js
 * Communities and polities.
 *  - A community is a band camp, village, town or city: members (person ids), stores, buildings,
 *    knowledge, language, faith, customs and contacts. Bands are nomadic: they move camp when the
 *    land around them is spent and split when they grow too big, so people spread across the
 *    world. Cultivation (or rich fishing with pottery) lets a band settle; villages grow fields,
 *    granaries and monuments, and send out daughter villages.
 *  - A polity is band, tribe, chiefdom or state. Government changes with population, surplus,
 *    inequality and war; institutions gain strength, legitimacy and corruption; polities collapse.
 *  - The economy is one yearly model used everywhere. Embodied workers (near the camera) earn the
 *    same expected yield per trip that the model credits per worker-year, so a community grows at
 *    the same rate whether or not you watch it.
 *  - LOD: communities near the camera are materialised (a body per member); far ones fold. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Ent = AG.Ent, People = AG.People, Tech = AG.Tech, Life = AG.Life;
  const { W, H, N, SEA, BT, BUILD, SO, FT, SP, TK, ST, FL, J, TR, RES, SK } = AG;
  const MK = People.MK;
  const rnd = AG.rnd, ri = AG.ri, pick = AG.pick, dist2 = AG.dist2;
  const MAXK = 256;
  const Civ = (AG.Civ = {
    kingdoms: [], cities: [], buildings: [], religions: [], squads: [], routes: [], expeditions: [],
    contact: new Uint16Array(MAXK * MAXK), MAXK, focus: null, embodied: 0, stats: { ms: 0, lod: 0 },
  });
  const AGENT_YIELD = 1.6; // embodied workers spend part of their time walking, eating and resting
  Civ.AGENT_YIELD = AGENT_YIELD;
  const year = () => AG.Geo.year;

  Civ.resetFree = () => { freeB.length = 0; for (const b of Civ.buildings) if (b && !b.alive) freeB.push(b.id); };
  Civ.reset = function () {
    freeB.length = 0;
    Civ.kingdoms.length = 0; Civ.cities.length = 0; Civ.buildings.length = 0; Civ.religions.length = 0;
    Civ.squads.length = 0; Civ.routes.length = 0; Civ.expeditions.length = 0; Civ.contact.fill(0);
    Flow.cache.clear(); Civ.embodied = 0;
  };

  // ============================================================ flow fields (v1)
  const Flow = (AG.Flow = { cache: new Map(), budget: 2, q: new Int32Array(N), computed: 0 });
  Flow.get = function (key, tx, ty, mode, seeds) {
    let f = Flow.cache.get(key);
    const stale = !f || AG.tick - f.t > 1500 || (f.epoch !== Wd.epoch && AG.tick - f.t > 200);
    if (!stale) { Flow.cache.delete(key); Flow.cache.set(key, f); return f.d; }
    if (Flow.budget <= 0) return f ? f.d : null;
    Flow.budget--;
    const d = f ? f.d : new Uint16Array(N);
    computeField(d, seeds || [AG.clamp(ty | 0, 0, H - 1) * W + AG.clamp(tx | 0, 0, W - 1)], mode);
    if (f) { f.t = AG.tick; f.epoch = Wd.epoch; Flow.cache.delete(key); Flow.cache.set(key, f); }
    else { f = { d, t: AG.tick, epoch: Wd.epoch }; Flow.cache.set(key, f); if (Flow.cache.size > 40) Flow.cache.delete(Flow.cache.keys().next().value); }
    Flow.computed++;
    return d;
  };
  function computeField(d, seeds, mode) {
    d.fill(65535);
    const q = Flow.q, sea = mode === 'S';
    let qh = 0, qt = 0;
    for (const s of seeds) if (d[s] !== 0) { d[s] = 0; q[qt++] = s; }
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, nd = d[i] + 1;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy; if (ny < 0 || ny >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox; if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (d[j] !== 65535) continue;
          if (sea ? !Wd.passSea(j) : !Wd.passLand(j)) continue;
          d[j] = nd; q[qt++] = j;
        }
      }
    }
  }
  Flow.ahead = function (d, x, y, steps) {
    let i = AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1), moved = -1;
    for (let s = 0; s < steps; s++) {
      const cx = i % W, cy = (i / W) | 0;
      let best = -1, bv = d[i];
      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy; if (ny < 0 || ny >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox; if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (d[j] < bv) { bv = d[j]; best = j; }
        }
      }
      if (best < 0) break;
      i = best; moved = best;
    }
    return moved;
  };
  Flow.reachable = (d, x, y) => d[AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1)] !== 65535;

  // ============================================================ lookups
  Civ.cityAt = function (x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const o = Wd.owner[(y | 0) * W + (x | 0)];
    return o >= 0 ? Civ.cities[o] : null;
  };
  Civ.nearestCity = function (x, y, kd, maxD) {
    let best = null, bd = (maxD || 1e9) ** 2;
    for (const c of Civ.cities) { if (!c.alive || (kd >= 0 && c.kd !== kd)) continue; const d = dist2(c.x, c.y, x, y); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  Civ.placeName = function (x, y) { const c = Civ.nearestCity(x, y, -1, 40); return c ? c.name : ''; };
  Civ.capitalOf = (k) => Civ.cities[k.capital] || null;
  function counts(c, builtOnly) {
    const n = new Int32Array(BUILD.length);
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && (!builtOnly || b.prog >= 1)) n[b.type]++; }
    return n;
  }
  Civ.counts = counts;
  function firstBuilding(c, type) { for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && b.type === type && b.prog >= 1) return b; } return null; }
  function randomBuilding(c, type) { let found = null, n = 0; for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && b.type === type && b.prog >= 1 && rnd() < 1 / ++n) found = b; } return found; }
  Civ.firstBuilding = firstBuilding; Civ.randomBuilding = randomBuilding;
  Civ.cityMine = (c) => firstBuilding(c, BT.MINE);
  Civ.dockOf = (c) => firstBuilding(c, BT.DOCK);
  Civ.addRes = function (c, type, amt) {
    switch (type) { case 1: c.food += amt / 100; break; case 2: c.wood += amt; break; case 3: c.stone += amt; break; case 4: c.metal += amt; break; case 5: c.gold += amt; break; case 6: c.goods += amt; break; }
  };
  // living members (cached within one sim step; any change to the list invalidates it)
  const persons = (c) => {
    if (c._ps && c._psT === AG.tick && c._psN === c.members.length) return c._ps;
    const out = [];
    for (const id of c.members) { const P = People.get(id); if (P && P.died === null) out.push(P); }
    c._ps = out; c._psT = AG.tick; c._psN = c.members.length;
    return out;
  };
  Civ.persons = persons;
  Civ.adults = (c) => persons(c).filter((P) => P.job !== J.CHILD);

  // ============================================================ territory
  // A cached survey of what the land around a community offers.
  function survey(c) {
    const R = c.nomadic ? 15 : Math.max(10, c.radius + 4);
    const s = { forage: 0, water: 0, coast: 0, river: 0, forest: 0, cereal: 0, cells: 0, stone: 0, res: new Uint8Array(AG.RESOURCES.length), fert: 0, cold: 0, ice: 0, temp: 0 };
    for (let oy = -R; oy <= R; oy += 2) for (let ox = -R; ox <= R; ox += 2) {
      if (ox * ox + oy * oy > R * R) continue;
      const x = (c.x + ox) | 0, y = (c.y + oy) | 0; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (Wd.fl[i] > 0.02 && Wd.ft[i] === FT.WATER && !Wd.frozen[i]) { s.water++; if (Wd.elev[i] < SEA) s.coast++; else s.river++; continue; }
      if (Wd.elev[i] < SEA) continue;
      s.cells++;
      const t = Wd.Tc(i);
      s.temp += t;
      if (Wd.ice[i]) { s.ice++; continue; }
      s.forage += Wd.veg[i] / 255 * AG.smooth(0.05, 0.3, t);
      if (Wd.veg[i] >= 165) s.forest++;
      s.cereal += Wd.cereal[i] / 255;
      s.fert += Wd.fert[i] / 255;
      if (Wd.elev[i] > AG.HILL || Wd.soil[i] === SO.ROCK) s.stone++;
      if (Wd.res[i]) s.res[Wd.res[i]]++;
      if (t < 0.2) s.cold++;
    }
    s.temp = s.cells ? s.temp / s.cells : 0.4;
    const k = 4; // sample spacing 2 → each sample stands for 4 cells
    for (const f of ['forage', 'forest', 'cereal', 'fert', 'stone', 'cells', 'water', 'coast', 'river', 'ice']) s[f] *= k;
    c.survey = s; c.surveyed = year();
    c.coastal = s.coast > 12; c.water = s.water > 6; c.river = s.river > 6;
    return s;
  }
  Civ.survey = survey;
  const gameRegion = (c) => Life.regionOf(c.x, c.y);
  function gameIn(c) {
    // animals in the community's region (aggregate) or around it (embodied)
    if (AG.mode === 'watch') { const n = Ent.near(c.x, c.y, 22, 1, 400); let g = 0; for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (U.sp[j] === SP.GRAZER && !(U.flags[j] & FL.DOMESTIC)) g++; } return g * 1.6; }
    return Life.animalsIn(gameRegion(c), Life.ARCH.GRAZER);
  }

  // ============================================================ economy
  // Food-years produced per worker-year at full capacity, before technology.
  const RATE = { forage: 1.55, hunt: 2.0, fish: 1.8, farm: 3.1, herd: 2.3 };
  const sat = (x) => (2 * x) / (1 + x);
  // output of n workers on a source that can keep `cap` busy: nearly linear at first, then it
  // levels off at the land's capacity (extra hands add little)
  const yieldShare = (cap, n) => (n <= 0 ? 0 : cap <= 0 ? 0 : (cap * (1 - Math.exp(-n / cap))) / n);
  Civ.techMul = function (c, job) {
    const k = (t) => Tech.knows(c, t);
    switch (job) {
      case J.GATHER: return (k('foraging') ? 1.3 : 1) * (k('groundstone') ? 1.05 : 1);
      case J.HUNT: return (k('spear') ? 1.4 : 1) * (k('bow') ? 1.3 : 1) * (k('dogs') ? 1.15 : 1) * (k('microliths') ? 1.08 : 1);
      case J.FISH: return (k('fishing') ? 1 : 0.25) * (k('boats') ? 1.25 : 1) * (k('sailing') ? 1.1 : 1);
      case J.FARM: return (k('irrigation') ? 1.4 : 1) * (k('plough') ? 1.4 : 1) * (k('astronomy') ? 1.1 : 1) * (k('iron') ? 1.15 : 1) * (k('groundstone') ? 1.05 : 1);
      case J.HERD: return k('herding') ? (k('riding') ? 1.15 : 1) : 0;
      default: return 1;
    }
  };
  // Capacity of each food source, in workers it can keep at full rate.
  function capacity(c) {
    const s = c.survey || survey(c);
    const fields = counts(c, true)[BT.FARM];
    let fert = 0, nf = 0;
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.type === BT.FARM && b.alive && b.prog >= 1) { fert += b.fert === undefined ? 1 : b.fert; nf++; } }
    return {
      forage: s.forage / 14 * (1 - c.overForage),
      hunt: gameIn(c) / 8,
      fish: Tech.knows(c, 'fishing') ? s.water / 14 : 0,
      farm: nf ? (fert / nf) * fields * 3 : 0,
      herd: (c.herd || 0) / 7,
    };
  }
  Civ.capacity = capacity;
  // Expected food from one worker of a job in one year (also what an embodied trip is scaled from).
  Civ.yieldPerYear = function (c, job, P) {
    const cap = c.cap || capacity(c), n = Math.max(1, c.jobs ? c.jobs[job] : 1);
    const skill = P ? 0.8 + P.skills[People.JOB_SKILL[job]] / 250 : 1;
    const work = P ? People.workMul(P) : 1;
    switch (job) {
      case J.GATHER: return RATE.forage * Civ.techMul(c, job) * yieldShare(cap.forage, n) * 1.25 * skill * work;
      case J.HUNT: return RATE.hunt * Civ.techMul(c, job) * yieldShare(cap.hunt, n) * 1.25 * skill * work;
      case J.FISH: return RATE.fish * Civ.techMul(c, job) * yieldShare(cap.fish, n) * 1.25 * skill * work;
      case J.FARM: return RATE.farm * Civ.techMul(c, job) * yieldShare(cap.farm, n) * 1.25 * skill * work * (0.6 + 0.4 * c.climateOK);
      case J.HERD: return RATE.herd * Civ.techMul(c, job) * yieldShare(cap.herd, n) * 1.25 * skill * work;
      default: return 0;
    }
  };
  const FOOD_JOBS = [J.GATHER, J.HUNT, J.FISH, J.FARM, J.HERD];
  const RKEY = ['', 'forage', 'farm', '', '', '', '', '', '', 'hunt', 'fish', 'herd'];
  const capOf = (cap, j) => (j === J.GATHER ? cap.forage : j === J.HUNT ? cap.hunt : j === J.FISH ? cap.fish : j === J.FARM ? cap.farm : cap.herd);

  // Who does what: the community's needs, weighed against each person's skills and tastes.
  function assignJobs(c) {
    const k = Civ.kingdoms[c.kd];
    const ps = persons(c), adults = [];
    const y = year();
    for (const P of ps) {
      const a = y - P.born;
      if (a < AG.SPECIES[0].adult) { P.job = J.CHILD; continue; }
      if (a > 62 || P.frail > 0.6) { if (P.job !== J.ELDER) P.job = J.ELDER; continue; }
      if (P.job === J.CHILD || P.job === J.ELDER) P.job = J.GATHER;
      adults.push(P);
    }
    const n = adults.length; c.jobs = new Int32Array(14);
    if (!n) return;
    const cap = c.cap = capacity(c);
    const want = new Float32Array(14);
    const kk = (t) => Tech.knows(c, t), bc = counts(c, true);
    // specialists first
    if (kk('burial') || c.religion >= 0) want[J.PRIEST] = c.nomadic ? 1 : Math.max(1, Math.round(n * 0.04));
    const atWar = k && k.atWar;
    want[J.SOLDIER] = k && k.gov >= 2 ? Math.round(n * (atWar ? 0.25 : 0.08)) : atWar ? Math.round(n * 0.2) : 0;
    if (!c.nomadic) {
      if (kk('pottery') || kk('copper') || kk('weaving')) want[J.CRAFT] = Math.max(1, Math.round(n * (0.04 + (kk('copper') ? 0.04 : 0) + (kk('bronze') ? 0.03 : 0))));
      if (c.site >= 0 || (c.wallPlan && c.wallPlan.length)) want[J.BUILD] = Math.max(1, Math.round(n * 0.1));
      want[J.WOOD] = c.wood < 30 + c.members.length * 0.2 ? Math.max(1, Math.round(n * 0.06)) : 0;
      if (bc[BT.MINE]) want[J.MINE] = Math.max(1, Math.round(n * 0.06));
      if (bc[BT.MARKET] || kk('currency')) want[J.TRADE] = Math.max(1, Math.round(n * 0.03));
    } else if (c.wood < 8) want[J.WOOD] = 1;
    let spec = 0; for (let j = 0; j < 14; j++) spec += want[j];
    const foodW = Math.max(1, n - spec);
    // food workers go one by one to whichever source gives the most extra food
    const opts = FOOD_JOBS.filter((j) => (j === J.FARM ? cap.farm > 0 : j === J.HERD ? cap.herd > 0 && kk('herding') : j === J.FISH ? cap.fish > 0.5 : true));
    const total = (j, k) => k <= 0 ? 0 : RATE[RKEY[j]] * Civ.techMul(c, j) * k * yieldShare(capOf(cap, j), k);
    for (let w = 0; w < foodW; w++) {
      let bj = J.GATHER, bv = -1;
      for (const j of opts) { const v = total(j, want[j] + 1) - total(j, want[j]); if (v > bv) { bv = v; bj = j; } }
      want[bj]++;
    }
    // fill slots: best match of skill + taste
    const pool = adults.slice();
    const order = [J.PRIEST, J.SOLDIER, J.BUILD, J.CRAFT, J.MINE, J.TRADE, J.WOOD, J.FARM, J.HERD, J.FISH, J.HUNT, J.GATHER];
    let pool2 = pool;
    for (const j of order) {
      const need = Math.min(want[j], pool2.length);
      if (need <= 0) continue;
      const sk = People.JOB_SKILL[j];
      const scored = pool2.map((P) => {
        let v = (sk >= 0 ? P.skills[sk] : 0) + P.tastes[AG.JOB_TASTE[j]] * 0.35 + (P.job === j ? 25 : 0) + rnd() * 10;
        if (j === J.SOLDIER) v += (P.traits & TR.brave ? 30 : 0) - (P.traits & TR.coward ? 60 : 0);
        if (j === J.PRIEST) v += (P.traits & TR.pious ? 40 : 0) + P.belief.devotion * 30;
        return [v, P];
      });
      scored.sort((a, b) => b[0] - a[0]);
      for (let q = 0; q < need; q++) {
        const P = scored[q][1];
        if (P.job !== j && P.body >= 0) { U.job[P.body] = j; if (U.st[P.body] !== ST.FIGHT) { U.st[P.body] = ST.IDLE; U.task[P.body] = TK.NONE; } }
        P.job = j; c.jobs[j]++;
      }
      pool2 = scored.slice(need).map((e) => e[1]);
    }
    for (const P of pool2) { if (P.job !== J.GATHER && P.body >= 0) U.job[P.body] = J.GATHER; P.job = J.GATHER; c.jobs[J.GATHER]++; }
  }
  Civ.assignJobs = assignJobs;

  // One slice (dy years) of a community's economy. Embodied communities earn their food from
  // trips (AI deposits); folded ones from the model. Both eat the same way.
  function economy(c, dy) {
    if (!c.survey || year() - c.surveyed > 25) survey(c);
    c.climateOK = AG.clamp(1 - Math.abs(AG.Geo.shift || 0) * 3, 0.3, 1);
    const ps = persons(c);
    let need = 0, prod = 0;
    const y = year();
    for (const P of ps) need += y - P.born < 15 ? 0.5 : 1;
    if (!c.materialized) {
      if (c.jobs) for (const j of FOOD_JOBS) if (c.jobs[j]) prod += c.jobs[j] * Civ.yieldPerYear(c, j, null);
      c.food += prod * dy;
      // hunting draws on the regional herds (folded animals)
      if (c.jobs && c.jobs[J.HUNT] && AG.mode !== 'watch') Life.harvest(gameRegion(c), Life.ARCH.GRAZER, c.jobs[J.HUNT] * 0.8 * dy, Tech.knows(c, 'spear'));
      if (c.jobs) {
        c.wood += (c.jobs[J.WOOD] || 0) * 12 * dy + (c.nomadic ? 2 * dy : 0);
        c.stone += (c.jobs[J.MINE] || 0) * 6 * dy + (c.jobs[J.BUILD] || 0) * 2 * dy;
        c.metal += (c.jobs[J.MINE] || 0) * (Tech.knows(c, 'copper') ? 3 : 0) * dy;
        c.goods += (c.jobs[J.CRAFT] || 0) * 4 * dy;
      }
    } else prod = c.recentProd || 0;
    c.food -= need * dy;
    const keep = Tech.knows(c, 'granaries') ? 0.88 : Tech.knows(c, 'pottery') ? 0.7 : 0.45; // what survives a year in store
    if (c.food > 0) c.food *= Math.pow(keep, dy); else c.food *= 0.2;
    c.need = need;
    // how well people eat: this year's food, eked out by what is in store
    const ratio = need > 0 ? AG.clamp((prod + Math.max(0, c.food) * 0.6) / need, 0, 1.5) : 1;
    c.nutr += (Math.min(1, ratio) - c.nutr) * Math.min(1, dy * 3);
    c.surplus = need > 0 ? (prod - need) / need : 0;
    // carrying capacity: what the land could feed if everyone able worked it
    const cap = c.cap || capacity(c);
    let best = 0;
    for (const j of FOOD_JOBS) { const cj = j === J.GATHER ? cap.forage : j === J.HUNT ? cap.hunt : j === J.FISH ? cap.fish : j === J.FARM ? cap.farm : cap.herd; best += RATE[['', 'forage', 'farm', '', '', '', '', '', '', 'hunt', 'fish', 'herd'][j]] * Civ.techMul(c, j) * cj * (j === J.FARM ? 0.6 + 0.4 * c.climateOK : 1); }
    c.K = best / 0.78; // people per unit of food capacity (workers are ~60% of a band)
    c.crowded = c.members.length > Math.min(housing(c) * 1.1, c.K * 0.9);
    // fields wear out and recover; the land around a band is foraged out
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.type === BT.FARM && b.alive) { b.fert = AG.clamp((b.fert === undefined ? 1 : b.fert) - dy * (Tech.knows(c, 'plough') ? 0.012 : 0.008) + dy * 0.004, 0.35, 1.1); } }
    const fc = c.cap ? c.cap.forage : 1, fw = c.jobs ? c.jobs[J.GATHER] : 0;
    c.overForage = AG.clamp(c.overForage + dy * (fw / Math.max(1, fc) - 0.8) * 0.15, 0, 0.7);
    if (c.nutr < 0.62 && !c.famine) { c.famine = true; famine(c); } else if (c.nutr > 0.85) c.famine = false;
    return ratio;
  }
  function famine(c) {
    const k = Civ.kingdoms[c.kd];
    for (const P of persons(c)) People.remember(P, MK.FAMINE, { v: -0.7, s: 0.8, d: c.name });
    if (k) { k.exp.harvest += 1.5; k.unrest = (k.unrest || 0) + 0.15; }
    if (c.members.length > 20) AG.History.event('famine', `Famine grips ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: c.overForage > 0.4 ? 'the land around is spent' : AG.Geo.climate.aerosol > 0.02 ? 'a volcanic winter' : 'poor harvests' });
  }
  Civ.economy = economy;
  function housing(c) {
    if (c.nomadic) return 9999;
    const b = counts(c, true);
    return 8 + b[BT.TENT] * 4 + b[BT.HUT] * 5 + b[BT.HOUSE] * 7 + b[BT.HALL] * 6 + b[BT.KEEP] * 10;
  }
  Civ.housing = housing;

  // ============================================================ creating communities
  function newCommunity(k, x, y, o) {
    o = o || {};
    const id = Civ.cities.length;
    const c = {
      id, kd: k.id, name: '', lang: o.lang !== undefined ? o.lang : k.lang, x, y, alive: true, members: [],
      kind: o.nomadic ? 'band' : 'village', nomadic: !!o.nomadic, sedentary: !o.nomadic,
      food: 6, wood: 6, stone: 0, metal: 0, goods: 0, gold: 0, faith: 0, herd: 0,
      buildings: [], site: -1, radius: o.nomadic ? 7 : 6, religion: o.religion === undefined ? k.religion : o.religion, loyalty: 1,
      founded: year(), coastal: false, water: false, river: false, wallPlan: null, towerPlan: null, walled: false, captureT: 0, area: 0,
      lastTrade: AG.tick, lastSettle: year(), lastMove: year(), keep: -1, hearth: -1, empty: 0, race: 0,
      tech: o.tech ? Uint8Array.from(o.tech) : Tech.newSet(), techYear: {}, era: 0, banned: o.banned || null,
      tradition: o.tradition === undefined ? 0.5 : o.tradition, customs: o.customs ? Object.assign({}, o.customs) : newCustoms(), art: o.art ? Object.assign({}, o.art) : { motif: ri(6), hue: rnd() * 360 },
      contacts: new Map(), grievance: new Map(), overForage: 0, nutr: 1, surplus: 0, famine: false,
      materialized: false, lodT: 0, slice: 0, stats: { births: 0, deaths: 0, famines: 0 }, recentProd: 0, prodAcc: 0, prodT: 0, tradeRes: new Uint8Array(AG.RESOURCES.length), langIso: 0, jobs: null,
    };
    c.era = Tech.eraOf(c);
    Civ.cities.push(c); k.cities.push(id);
    if (k.capital < 0 || !Civ.cities[k.capital] || !Civ.cities[k.capital].alive) k.capital = id;
    c.name = AG.Lang.placeName(c.lang, x, y);
    survey(c);
    return c;
  }
  function newCustoms() {
    return { burial: pick(['inhumation', 'cremation', 'cairns', 'sky burial']), marriage: rnd() < 0.7 ? 'monogamy' : 'polygyny', residence: rnd() < 0.6 ? 'patrilocal' : 'matrilocal', taboo: pick(['none', 'none', 'fish', 'pork', 'horse', 'dog']), festival: pick(['midsummer', 'midwinter', 'harvest', 'first rains', 'the hunt']) };
  }
  const BANNERS = () => ({ pattern: ri(6), accent: AG.hsl(rnd() * 360, 0.6, rnd() < 0.5 ? 0.82 : 0.25), sym: ri(4) });
  function newPolity(lang, gov, o) {
    o = o || {};
    let id = Civ.kingdoms.length;
    if (id >= MAXK) { // reuse the slot of a people long gone
      const old = Civ.kingdoms.find((q) => !q.alive && !q.cities.length && year() - q.fell > 50);
      if (!old) return null;
      id = old.id;
      for (const q of Civ.kingdoms) { q.opinion[id] = 0; q.war[id] = 0; q.warSince[id] = 0; q.mods[id] = 0; q.trade[id] = 0; q.ally[id] = 0; if (q.tribute[id] >= 0) q.tribute[id] = -1; }
      for (let a = 0; a < MAXK; a++) { Civ.contact[id * MAXK + a] = 0; Civ.contact[a * MAXK + id] = 0; }
    }
    const color = AG.hsl(id * 137.508 + 14, 0.7, 0.56);
    const k = {
      id, race: 0, lang, gov: gov === undefined ? 0 : gov, name: '', color, dark: color.map((v) => (v * 0.55) | 0), css: AG.css(color),
      alive: true, cities: [], capital: -1, religion: o.religion === undefined ? -1 : o.religion,
      opinion: new Float32Array(MAXK), war: new Uint8Array(MAXK), warSince: new Float32Array(MAXK), mods: new Float32Array(MAXK), trade: new Float32Array(MAXK),
      ally: new Uint8Array(MAXK), tribute: new Int16Array(MAXK).fill(-1),
      exp: { fire: 0, water: 0, storm: 0, earth: 0, plague: 0, harvest: 0, war: 0, watcher: 0, death: 0, sun: 1, sea: 0, moon: 0.5 },
      king: -1, ruler: 0, pop: 0, founded: year(), fell: 0, exhaustion: 0, inspire: 0, banner: BANNERS(), kills: 0, losses: 0, atWar: false,
      inst: [], inequality: 0.08, stability: 0.6, legit: 0.6, unrest: 0, treasury: 0, laws: 0, history: [], culture: { agrarian: 0, martial: 0, mercantile: 0, mystic: 0 },
    };
    Civ.kingdoms[id] = k;
    for (const o2 of Civ.kingdoms) if (o2 !== k) k.opinion[o2.id] = o2.opinion[id] = o2.lang === lang ? 25 : 0;
    return k;
  }
  Civ.newPolity = newPolity;
  const GOVS = ['band', 'tribe', 'chiefdom', 'state'];
  Civ.GOVS = GOVS;
  function namePolity(k, base) {
    const cap = Civ.capitalOf(k);
    k.name = AG.Lang.polityName(k.lang, GOVS[k.gov], base || (cap ? cap.name : AG.Lang.peopleName(k.lang)));
  }
  Civ.namePolity = namePolity;

  // members
  Civ.addMember = function (c, P) {
    if (P.comm >= 0 && P.comm !== c.id) Civ.removeMember(Civ.cities[P.comm], P);
    if (!c.members.includes(P.id)) c.members.push(P.id);
    c._ps = null;
    P.comm = c.id;
    if (P.belief.faith < 0) P.belief.faith = c.religion;
    if (P.body >= 0 && U.alive[P.body]) { U.city[P.body] = c.id; U.kd[P.body] = c.kd; U.home[P.body] = c.id; }
    else if (c.materialized && AG.mode === 'watch') embodyOne(c, P);
  };
  Civ.removeMember = function (c, P) {
    if (!c) return;
    const k = c.members.indexOf(P.id); if (k >= 0) c.members.splice(k, 1);
    c._ps = null;
  };
  Civ.moveMember = function (P, c2) {
    const c1 = Civ.cities[P.comm];
    if (c1 === c2) return;
    if (P.body >= 0 && c1 && c1.materialized && !c2.materialized) { const b = P.body; Ent.remove(b); }
    Civ.addMember(c2, P);
  };

  // ============================================================ the first people
  // A band of people with genomes drawn from a gene-pool reservoir R.
  Civ.foundBand = function (k, x, y, lang, R, parent, n) {
    const c = newCommunity(k, x, y, { nomadic: true, lang, tech: parent ? parent.tech : undefined, religion: parent ? parent.religion : -1 });
    if (!k.name) namePolity(k, c.name);
    n = n || 24 + ri(8);
    for (let q = 0; q < n; q++) {
      const g = new Uint8Array(Life.GL);
      const a = (rnd() * R.nres) | 0, bb = (rnd() * R.nres) | 0;
      Life.breed(g, 0, R.res, a * Life.GL, R.res, bb * Life.GL, AG.rnd, 1);
      const age = q < n * 0.65 ? 16 + rnd() * 28 : rnd() * 15;
      const P = People.create({ gen: g, comm: c.id, born: year() - age, x: x + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 6, adult: age >= 15 });
      if (age < 15) P.job = J.CHILD;
      c.members.push(P.id);
    }
    // pair the adults, link the children to parents
    const ad = persons(c).filter((P) => People.age(P) >= 16);
    const f = ad.filter((P) => P.sex === 0), m = ad.filter((P) => P.sex === 1);
    for (let q = 0; q < Math.min(f.length, m.length) * 0.8; q++) People.marry(f[q], m[q]);
    for (const K of persons(c).filter((P) => People.age(P) < 15)) { const M = f[ri(Math.max(1, f.length))]; if (M) { K.mom = M.id; M.kids.push(K.id); if (M.spouse) { K.dad = M.spouse; const D = People.get(M.spouse); if (D) D.kids.push(K.id); } } }
    for (const P of persons(c)) { People.remember(P, MK.BORN, { t: P.born, v: 0.2, s: 0.5, d: c.name, core: true }); if (P.sex === 0) P.lastBirth = year() - rnd() * 3.4; }
    campBuild(c);
    assignJobs(c);
    economy(c, 0.01);
    if (c.K && c.members.length > c.K * 0.9 && c.members.length >= 16) split(c, 'size');
    if (AG.mode === 'watch') Civ.lod();
    return c;
  };
  // At the Dawn: a few bands of the sapient species in the cradle, one language, one faith.
  Civ.dawn = function () {
    const sp = Life.people, cradle = sp.cradle;
    const R = sp.regions.get(cradle);
    const L = AG.Lang.create(null, 0);
    const cx = (cradle % Life.RW) * Life.RS + Life.RS / 2, cy = ((cradle / Life.RW) | 0) * Life.RS + Life.RS / 2;
    const bands = 4, sites = [];
    // the best camps within reach of the cradle
    for (let t = 0; t < 400; t++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 70, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (!campFits(x, y, 2)) continue;
      sites.push({ x: x + 0.5, y: y + 0.5, s: siteScore(x, y, true) });
    }
    sites.sort((a, b) => b.s - a.s);
    const chosen = [];
    for (const s of sites) { if (chosen.length >= bands) break; if (chosen.some((o) => dist2(o.x, o.y, s.x, s.y) < 18 * 18)) continue; chosen.push(s); }
    for (const site of chosen) {
      const k = newPolity(L.id, 0);
      Civ.foundBand(k, site.x, site.y, L.id, R, null);
    }
    Civ.recomputeBorders();
    AG.History.event('dawn', `The first people, the ${L.name}, gather in ${Civ.cities.length} bands at ${Civ.cities.map((c) => c.name).join(', ')}`, { x: cx, y: cy, cause: `${sp.name} descended from ${Life.species[sp.parent] ? Life.species[sp.parent].name : 'the apes'}` });
  };

  // grazers per region, cached for a year (site searches ask a lot)
  let gameCache = null, gameYear = -1;
  function gameAt(r) {
    if (!gameCache || gameYear !== Math.floor(year())) { gameCache = new Float32Array(Life.RN); for (const s of Life.byArch(Life.ARCH.GRAZER)) if (!s.domestic) for (const [q, R] of s.regions) gameCache[q] += R.n; gameYear = Math.floor(year()); }
    return gameCache[r];
  }
  // a decent place to live: dry land, not ice, water near, the most food
  function siteScore(x, y, nomadic) {
    const i = (y | 0) * W + (x | 0);
    if (!Wd.passLand(i) || Wd.ice[i] || Wd.elev[i] > AG.MOUNTAIN || Wd.bgrid[i]) return -1e9;
    let s = 0, water = 0, veg = 0, cereal = 0, fert = 0, ice = 0;
    for (let oy = -12; oy <= 12; oy += 4) for (let ox = -12; ox <= 12; ox += 4) {
      const nx = (x + ox) | 0, ny = (y + oy) | 0; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (Wd.fl[j] > 0.01 && Wd.ft[j] === FT.WATER) water++;
      veg += Wd.veg[j]; cereal += Wd.cereal[j]; fert += Wd.fert[j]; if (Wd.ice[j]) ice++;
    }
    s += water > 0 && water < 12 ? 1 : water ? 0.4 : -0.6;
    s += veg / (49 * 255) * (nomadic ? 2.2 : 0.8) + cereal / (49 * 255) * (nomadic ? 0.4 : 1.8) + fert / (49 * 255) * (nomadic ? 0 : 1.2);
    s -= ice * 0.4;
    const t = Wd.Tc(i); s -= Math.max(0, 0.2 - t) * 4 + Math.max(0, t - 0.85) * 3;
    if (nomadic) s += Math.min(1, gameAt(Life.regionOf(x, y)) / 30) * 0.8; // game
    return s;
  }
  function campFits(x, y, rad) {
    if (x < 6 || y < 6 || x >= W - 6 || y >= H - 6) return false;
    for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
      const i = ((y + oy) | 0) * W + ((x + ox) | 0);
      if (Wd.fl[i] > 0.008 || Wd.bgrid[i] || Wd.ice[i] || Wd.elev[i] > AG.MOUNTAIN + 0.04) return false;
      const o = Wd.owner[i]; if (o >= 0 && Civ.cities[o] && Civ.cities[o].alive && dist2(Civ.cities[o].x, Civ.cities[o].y, x, y) < 100) return false;
    }
    return true;
  }
  function findSite(x, y, r, nomadic, avoid) {
    let best = null, bs = -1e9;
    for (let t = 0; t < 28; t++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * r;
      const nx = Math.round(x + Math.cos(a) * rr), ny = Math.round(y + Math.sin(a) * rr);
      if (!campFits(nx, ny, 2)) continue;
      if (Civ.cities.some((o) => o.alive && o !== avoid && dist2(o.x, o.y, nx, ny) < (nomadic ? 14 * 14 : 18 * 18))) continue;
      const s = siteScore(nx, ny, nomadic);
      if (s > bs) { bs = s; best = { x: nx + 0.5, y: ny + 0.5, s }; }
    }
    return best;
  }
  Civ.findSite = findSite;

  // ============================================================ buildings (v1 placement)
  const freeB = [];
  Civ.placeBuilding = function (c, type, bx, by, built) {
    const d = BUILD[type], id = freeB.length ? freeB.pop() : Civ.buildings.length;
    const b = { id, type, x: bx, y: by, w: d.w, h: d.h, city: c.id, kd: c.kd, hp: d.hp, mhp: d.hp, prog: built ? 1 : type === BT.WALL ? 0.4 : 0.02, alive: true, growth: rnd() * 0.3, cd: 0, cx: bx + d.w / 2, cy: by + d.h / 2, era: c.era, fert: 1 };
    Civ.buildings[id] = b; c.buildings.push(id);
    for (let y = by; y < by + d.h; y++) for (let x = bx; x < bx + d.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      Wd.bgrid[i] = id + 1; Wd.fire[i] = 0; Wd.snow[i] = 0;
      if (type !== BT.TENT && type !== BT.HEARTH) Wd.veg[i] = 0;
      if (type === BT.FARM) { Wd.soil[i] = SO.FARM; b.fert = Math.max(0.4, Wd.fert[i] / 200); }
      else if (Wd.soil[i] === SO.FARM) Wd.soil[i] = SO.DIRT;
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    if (built) Civ.complete(b);
    return b;
  };
  Civ.complete = function (b) {
    b.prog = 1; b.hp = b.mhp;
    const c = Civ.cities[b.city], k = Civ.kingdoms[b.kd];
    if (b.type === BT.MINE) {
      for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) { const i = y * W + x; if (i >= 0 && i < N && Wd.ug[i] !== AG.UG.BEDROCK) Wd.ug[i] = AG.UG.TUNNEL; Wd.wakeU(x, y); }
    } else if ((b.type === BT.TEMPLE || b.type === BT.MEGALITH) && k && AG.War) AG.War.templeBuilt(c, k);
    if (c && c.site === b.id) c.site = -1;
    Wd.dirty[Wd.chunkOfIdx(b.y * W + b.x)] = 1;
  };
  Civ.damageBuilding = function (id, amt, kd) { const b = Civ.buildings[id]; if (!b || !b.alive) return; b.hp -= amt; if (b.hp <= 0) Civ.destroyBuilding(id, kd); };
  Civ.destroyBuilding = function (id, kd, quiet) {
    const b = Civ.buildings[id];
    if (!b || !b.alive) return;
    b.alive = false;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (Wd.bgrid[i] !== id + 1) continue;
      Wd.bgrid[i] = 0;
      if (!quiet && Wd.fl[i] < 0.01) Wd.soil[i] = SO.ASH;
      if (Wd.soil[i] === SO.FARM) Wd.soil[i] = SO.DIRT;
      if (kd >= 0 && rnd() < 0.25) Wd.fire[i] = 120;
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    if (!quiet) AG.FX.burst(b.cx, b.cy, 'debris', 6 + b.w * b.h);
    freeB.push(id); // the slot is reused by the next building
    const c = Civ.cities[b.city];
    if (c) {
      const p = c.buildings.indexOf(id); if (p >= 0) c.buildings.splice(p, 1);
      if (c.site === id) c.site = -1; if (c.keep === id) c.keep = -1; if (c.hearth === id) c.hearth = -1;
      if (b.type === BT.WALL) c.walled = false;
    }
  };
  function fits(c, type, bx, by) {
    const d = BUILD[type];
    if (bx < 3 || by < 3 || bx + d.w >= W - 3 || by + d.h >= H - 3) return false;
    let water = 0;
    for (let y = by - 1; y <= by + d.h; y++) for (let x = bx - 1; x <= bx + d.w; x++) {
      const i = y * W + x;
      const inside = x >= bx && x < bx + d.w && y >= by && y < by + d.h;
      if (inside) {
        if (Wd.bgrid[i] || Wd.fire[i] || Wd.ice[i]) return false;
        if (Wd.fl[i] > 0.008) { if (type === BT.DOCK && Wd.ft[i] === FT.WATER && Wd.fl[i] < 0.09) { water++; continue; } return false; }
        if (Wd.elev[i] > AG.MOUNTAIN + 0.05 && type !== BT.MINE) return false;
        const o = Wd.owner[i]; if (o !== -1 && o !== c.id) return false;
      } else {
        if (Wd.bgrid[i] && type !== BT.WALL && type !== BT.TENT) { const nb = Civ.buildings[Wd.bgrid[i] - 1]; if (nb && nb.type !== BT.WALL) return false; }
        if (type === BT.DOCK && Wd.passSea(i)) water++;
      }
    }
    return type !== BT.DOCK || water >= 3;
  }
  Civ.fits = fits;
  function findSpot(c, type) {
    const d = BUILD[type];
    for (let t = 0; t < 60; t++) {
      const a = rnd() * Math.PI * 2;
      const rr = type === BT.FARM ? 4 + rnd() * (c.radius + 2) : type === BT.TENT || type === BT.HUT || type === BT.HOUSE ? 1.5 + rnd() * c.radius * 0.6 : type === BT.DOCK ? 3 + rnd() * (c.radius + 4) : type === BT.PEN ? 4 + rnd() * c.radius * 0.8 : 2 + rnd() * c.radius * 0.7;
      const bx = Math.round(c.x + Math.cos(a) * rr - d.w / 2), by = Math.round(c.y + Math.sin(a) * rr - d.h / 2);
      if (fits(c, type, bx, by)) return { bx, by };
    }
    return null;
  }
  Civ.findSpot = findSpot;
  function build(c, type, instant) {
    const d = BUILD[type];
    if (c.wood < d.wood || c.stone < d.stone) return null;
    const s = findSpot(c, type); if (!s) return null;
    c.wood -= d.wood; c.stone -= d.stone;
    const b = Civ.placeBuilding(c, type, s.bx, s.by, instant);
    if (!instant) c.site = b.id;
    return b;
  }
  // A band camp: a hearth and a tent for every five people.
  function campBuild(c) {
    for (const bid of c.buildings.slice()) Civ.destroyBuilding(bid, -1, true);
    c.buildings.length = 0;
    const hx = c.x | 0, hy = c.y | 0;
    if (fits(c, BT.HEARTH, hx, hy)) { c.hearth = Civ.placeBuilding(c, BT.HEARTH, hx, hy, true).id; }
    if (Tech.knows(c, 'shelters')) for (let k = 0; k < Math.ceil(c.members.length / 5); k++) { const s = findSpot(c, BT.TENT); if (s) Civ.placeBuilding(c, BT.TENT, s.bx, s.by, true); }
  }

  // What a settled community wants to build next.
  function planBuild(c, instant) {
    const k = Civ.kingdoms[c.kd];
    if (c.site >= 0) {
      const b = Civ.buildings[c.site];
      if (!b || !b.alive) c.site = -1;
      else { if (!c.materialized || instant) { b.prog += instant ? 1 : 0.3; if (b.prog >= 1) Civ.complete(b); } return; }
    }
    if (c.nomadic) return;
    const kk = (t) => Tech.knows(c, t), bc = counts(c, false), pop = c.members.length, cap = housing(c);
    const home = kk('mudbrick') || kk('masonry') ? BT.HOUSE : BT.HUT;
    let want = -1;
    if (c.hearth < 0) want = BT.HEARTH;
    else if (pop >= cap - 3) want = home;
    else if (kk('cultivation') && bc[BT.FARM] < Math.ceil(pop / 8) && bc[BT.FARM] < (c.kind === 'village' ? 16 : 34)) want = BT.FARM;
    else if (kk('herding') && !bc[BT.PEN] && c.herd > 0) want = BT.PEN;
    else if (kk('granaries') && bc[BT.GRANARY] < 1 + Math.floor(pop / 120)) want = BT.GRANARY;
    else if (kk('burial') && !bc[BT.SHRINE] && pop > 25) want = BT.SHRINE;
    else if (kk('megaliths') && !bc[BT.MEGALITH] && pop > 70 && c.stone >= 24) want = BT.MEGALITH;
    else if (k && k.gov >= 2 && c.id === k.capital && !bc[BT.HALL] && !bc[BT.KEEP]) want = BT.HALL;
    else if (kk('kilns') && !bc[BT.WORKSHOP] && pop > 60) want = BT.WORKSHOP;
    else if (kk('monuments') && bc[BT.TEMPLE] < 1 + (pop > 600 ? 1 : 0) && pop > 200) want = BT.TEMPLE;
    else if (kk('currency') && !bc[BT.MARKET] && pop > 120) want = BT.MARKET;
    else if (kk('copper') && !bc[BT.MINE] && (c.survey.res[RES.COPPER] || c.survey.res[RES.TIN] || c.survey.res[RES.IRON]) && pop > 60) want = BT.MINE;
    else if (kk('sailing') && c.coastal && !bc[BT.DOCK] && pop > 50) want = BT.DOCK;
    else if (kk('masonry') && k && k.gov >= 3 && c.id === k.capital && c.keep < 0 && pop > 400) want = BT.KEEP;
    else if (kk('fortification') && pop > 150 && !c.walled && !c.wallPlan && k && (k.atWar || k.gov >= 2)) { AG.War.planWalls(c); return; }
    else if (c.wallPlan && c.wallPlan.length) { AG.War.buildWall(c, instant); return; }
    else if (pop >= cap * 0.8) want = home;
    if (want < 0) return;
    if (want === BT.HEARTH) { const hx = c.x | 0, hy = c.y | 0; if (fits(c, BT.HEARTH, hx, hy)) c.hearth = Civ.placeBuilding(c, BT.HEARTH, hx, hy, true).id; return; }
    const b = build(c, want, instant);
    if (b && want === BT.KEEP) c.keep = b.id;
  }
  Civ.planBuild = planBuild;

  // ============================================================ settling down, moving, splitting
  function settle(c) {
    c.nomadic = false; c.sedentary = true; c.kind = 'village';
    for (const bid of c.buildings.slice()) { const b = Civ.buildings[bid]; if (b.type === BT.TENT) Civ.destroyBuilding(bid, -1, true); }
    for (let k = 0; k < Math.ceil(c.members.length / 5); k++) { const s = findSpot(c, BT.HUT); if (s) Civ.placeBuilding(c, BT.HUT, s.bx, s.by, true); }
    for (let k = 0; k < Math.ceil(c.members.length / 8); k++) { const s = findSpot(c, BT.FARM); if (s) Civ.placeBuilding(c, BT.FARM, s.bx, s.by, true); }
    c.radius = 7;
    AG.History.event('settle', `The band at ${c.name} settles down to farm: a village is born`, { x: c.x, y: c.y, comm: c.id, cause: Tech.knows(c, 'cultivation') ? 'cultivation' : 'rich fishing and pottery' });
    for (const P of persons(c)) People.remember(P, MK.FOUNDED, { v: 0.5, s: 0.6, d: c.name + ' (the village)' });
    if (c.materialized) Civ.recomputeBorders();
  }
  // A band moves camp when the land around it is spent (or the ice comes, or the sea).
  function moveCamp(c, why) {
    const site = findSite(c.x, c.y, c.nutr < 0.75 || why ? 55 : 26, true, c);
    if (!site || site.s < siteScore(c.x | 0, c.y | 0, true) - 0.05) return false;
    const old = { x: c.x, y: c.y };
    c.x = site.x; c.y = site.y; c.lastMove = year(); c.overForage *= 0.3;
    campBuild(c); survey(c);
    for (const P of persons(c)) {
      P.visited++;
      if (P.body >= 0 && U.alive[P.body]) { U.task[P.body] = TK.MIGRATE; U.st[P.body] = ST.IDLE; U.tx[P.body] = c.x; U.ty[P.body] = c.y; }
      else { P.x = c.x + (rnd() - 0.5) * 5; P.y = c.y + (rnd() - 0.5) * 5; }
      if (rnd() < 0.15) People.remember(P, MK.MIGRATED, { v: why === 'ice' || why === 'sea' ? -0.3 : 0.1, s: 0.3, d: c.name });
    }
    if (why === 'sea' || why === 'ice') AG.History.event('migration', `The band of ${c.name} is driven from its land by the ${why === 'sea' ? 'rising sea' : 'advancing ice'}`, { x: old.x, y: old.y, comm: c.id, cause: why === 'sea' ? 'sea-level rise' : 'glaciation' });
    Civ.recomputeBordersSoon = true;
    return true;
  }
  Civ.moveCamp = moveCamp;
  // A crowded band or village sends part of its people to found a new community nearby.
  function split(c, why) {
    const k = Civ.kingdoms[c.kd];
    let site = null;
    const here = siteScore(c.x | 0, c.y | 0, c.nomadic), big = c.members.length > 90;
    for (let t = 0; t < (big ? 14 : 8) && !site; t++) {
      const far = (t < 8 ? (c.nomadic ? 30 : 28) + rnd() * 40 : 16 + rnd() * 16), a = rnd() * Math.PI * 2;
      site = findSite(c.x + Math.cos(a) * far, c.y + Math.sin(a) * far, 16, c.nomadic);
      if (site && (!reachable(c, site) || (!big && site.s < Math.min(here, 0.6) - 0.3))) site = null;
    }
    if (!site) return null;
    const ps = persons(c).filter((P) => P.rank < 2);
    // whole families go together
    const go = new Set(), n = Math.floor(c.members.length * (0.35 + rnd() * 0.15));
    for (const P of ps.sort(() => rnd() - 0.5)) {
      if (go.size >= n) break;
      if (go.has(P.id)) continue;
      go.add(P.id);
      if (P.spouse) go.add(P.spouse);
      for (const kid of P.kids) { const K = People.get(kid); if (K && K.died === null && People.age(K) < 15 && K.comm === c.id) go.add(kid); }
    }
    if (go.size < 10) return null;
    // the daughter stays in the tribe if it stays close; far ones become their own people
    let pk = k;
    const capk = k ? Civ.capitalOf(k) : null;
    const independent = !k || dist2(site.x, site.y, capk ? capk.x : c.x, capk ? capk.y : c.y) > (k.gov >= 2 ? 140 : 90) ** 2 || (k.gov === 0 && rnd() < 0.5) || (k.gov === 1 && k.cities.length >= 7);
    if (independent) { pk = newPolity(c.lang, 0, { religion: c.religion }); if (!pk) pk = k; }
    const d = newCommunity(pk, site.x, site.y, { nomadic: c.nomadic, lang: c.lang, tech: c.tech, banned: c.banned, tradition: c.tradition, customs: c.customs, art: c.art, religion: c.religion });
    d.food = Math.max(2, c.food * 0.3); c.food *= 0.7; d.wood = c.wood * 0.3; c.wood *= 0.7;
    d.herd = c.herd * 0.3; c.herd *= 0.7;
    for (const id of go) { const P = People.get(id); if (!P || P.comm !== c.id) continue; Civ.moveMember(P, d); P.x = d.x + (rnd() - 0.5) * 5; P.y = d.y + (rnd() - 0.5) * 5; People.remember(P, MK.FOUNDED, { v: 0.4, s: 0.6, d: d.name }); }
    if (pk !== k) { namePolity(pk, d.name); }
    if (c.nomadic) campBuild(d); else { settle2(d); }
    d.contacts.set(c.id, 1); c.contacts.set(d.id, 1);
    if (pk === k && k && k.gov === 0 && k.cities.length >= 3) { k.gov = 1; namePolity(k); AG.History.event('government', `The bands of the ${AG.Lang.peopleName(k.lang)} draw together as a tribe: ${k.name}`, { x: c.x, y: c.y, cause: 'kinship among growing bands' }); }
    c.lastSettle = year();
    assignJobs(c); assignJobs(d);
    if (c.materialized || d.materialized) Civ.recomputeBorders(); else Civ.recomputeBordersSoon = true;
    return d;
  }
  Civ.split = split;
  function settle2(d) { d.kind = 'village'; d.nomadic = false; d.sedentary = true; d.hearth = -1; planBuild(d, true); for (let k = 0; k < Math.ceil(d.members.length / 5); k++) { const s = findSpot(d, BT.HUT); if (s) Civ.placeBuilding(d, BT.HUT, s.bx, s.by, true); } for (let k = 0; k < Math.ceil(d.members.length / 8); k++) { const s = findSpot(d, BT.FARM); if (s) Civ.placeBuilding(d, BT.FARM, s.bx, s.by, true); } }
  // land reach (or a short crossing by boat)
  function reachable(c, site) {
    const a = Life.regionOf(c.x, c.y), b = Life.regionOf(site.x, site.y), m = Life.env.mass;
    if (m[a] === m[b] && m[a] >= 0) return true;
    return Tech.knows(c, 'boats') && dist2(c.x, c.y, site.x, site.y) < 60 * 60;
  }

  // ============================================================ yearly community life
  // Both clocks call this: dy years for one community.
  Civ.communityYear = function (c, dy) {
    if (!c.alive) return;
    if (!c.members.length) { c.empty += dy; if (c.empty > 3) abandon(c); return; }
    c.empty = 0;
    economy(c, dy);
    People.yearStep(c, dy, c.nutr);
    if (!c.members.length) return;
    c.slice += dy;
    if (c.slice >= 1 || dy >= 1) { // the slower decisions, once a year
      const yrs = Math.max(1, c.slice); c.slice = 0;
      assignJobs(c);
      marriageMarket(c);
      herds(c, yrs);
      const pop = c.members.length;
      if (c.nomadic && pop < 6 && mergeInto(c)) return;
      if (c.nomadic) {
        if ((Tech.knows(c, 'cultivation') && c.survey.cereal > 15) || (Tech.knows(c, 'pottery') && c.survey.water > 60 && Tech.knows(c, 'fishing') && pop > 30)) settle(c);
        else {
          const here = (c.x | 0) + (c.y | 0) * W;
          const why = Wd.ice[here] ? 'ice' : Wd.fl[here] > 0.02 ? 'sea' : '';
          if (why || (year() - c.lastMove > 1 && (c.overForage > 0.3 || c.nutr < 0.85 || c.crowded)) || (year() - c.lastMove > 6 && rnd() < 0.25)) moveCamp(c, why);
          if ((pop > 44 + ri(10) || (c.crowded && pop >= 26)) && year() - c.lastSettle > 4) split(c, 'size');
        }
      } else {
        c.radius = Math.min(28, 6 + Math.sqrt(pop) * 1.4);
        const fields = counts(c, true)[BT.FARM];
        const landFull = fields >= 18 || (c.nutr < 0.85 && pop > 60);
        if ((pop > 220 && landFull || pop > 420) && year() - c.lastSettle > 15 && Civ.cities.filter((o) => o.alive && o.kd === c.kd).length < 30) split(c, 'land');
        c.kind = pop >= 900 ? 'city' : pop >= 250 ? 'town' : 'village';
        const here = (c.x | 0) + (c.y | 0) * W;
        if (Wd.fl[here] > 0.02 && Wd.elev[here] < SEA) drowned(c);
      }
    }
    if (!c.materialized) for (let k = 0; k < Math.max(1, Math.round(dy * 2)); k++) planBuild(c, true);
    else if (rnd() < dy * 4) planBuild(c, false);
  };
  // Bands are too small to marry within: people find spouses among neighbours who share their
  // language, and one of them moves (patrilocal or matrilocal by custom). Genes and news travel.
  function marriageMarket(c) {
    const y = year(), all = persons(c), mine = all.filter((P) => !P.spouse && y - P.born >= 16 && y - P.born < 40);
    if (!mine.length || all.length > 120) return; // big villages marry at home
    const singles = [0, 0]; for (const P of mine) singles[P.sex]++;
    const near = Civ.cities.filter((o) => o.alive && o !== c && o.lang === c.lang && dist2(o.x, o.y, c.x, c.y) < 90 * 90);
    for (const P of mine) {
      if (P.spouse || rnd() > 0.5) continue;
      if (singles[1 - P.sex] > 2) continue; // enough partners at home
      for (const o of near.sort(() => rnd() - 0.5)) {
        const Q = persons(o).find((q) => !q.spouse && q.sex !== P.sex && y - q.born >= 16 && y - q.born < 45 && Life.canMate(P.gen, 0, q.gen, 0));
        if (!Q || !People.marry(P, Q)) continue;
        const wife = P.sex === 0 ? P : Q, husband = wife === P ? Q : P;
        const pat = (c.customs.residence || 'patrilocal') === 'patrilocal';
        const mover = pat ? wife : husband, home = Civ.cities[(pat ? husband : wife).comm];
        if (home) Civ.moveMember(mover, home);
        People.remember(mover, MK.EXILE, { v: 0.2, s: 0.5, d: home ? 'a new home at ' + home.name : '' });
        c.contacts.set(o.id, Math.min(2, (c.contacts.get(o.id) || 0) + 0.3)); o.contacts.set(c.id, Math.min(2, (o.contacts.get(c.id) || 0) + 0.3));
        break;
      }
    }
  }
  // A dwindling band joins the nearest band of its own people.
  function mergeInto(c) {
    let best = null, bd = 110 * 110;
    for (const o of Civ.cities) { if (!o.alive || o === c || o.lang !== c.lang) continue; const d = dist2(o.x, o.y, c.x, c.y); if (d < bd) { bd = d; best = o; } }
    if (!best) return false;
    for (const P of persons(c)) { Civ.moveMember(P, best); People.remember(P, MK.MIGRATED, { v: -0.1, s: 0.5, d: best.name }); }
    best.food += Math.max(0, c.food);
    abandon(c);
    return true;
  }
  function herds(c, dy) {
    if (!Tech.knows(c, 'herding')) return;
    if (!c.herd) {
      const wild = Civ.domesticableNear(c);
      if (wild) { c.herdSpecies = Life.domesticate(wild, gameRegion(c), 6).id; c.herd = 6; }
      return;
    }
    const pens = counts(c, true)[BT.PEN];
    const s = c.survey || survey(c);
    const pasture = Math.max(4, (s.cells - s.forest - s.ice) * 0.08); // open grass the herds can graze
    const cap = Math.min(pasture, (pens + 1) * 40 + (c.nomadic ? pasture : 0));
    c.herd += c.herd * 0.25 * (1 - c.herd / cap) * dy;
    const d = Life.species[c.herdSpecies];
    if (d) { const R = d.regions.get(gameRegion(c)) || Life.newRegion(d.mean, 0); R.n = c.herd; if (!R.nres) Life.seedReservoir(R, 10); d.regions.set(gameRegion(c), R); }
  }
  Civ.domesticableNear = function (c) {
    const r = gameRegion(c);
    let best = null;
    for (const s of Life.byArch(Life.ARCH.GRAZER)) {
      if (s.domestic) continue;
      const R = s.regions.get(r); if (!R || R.n < 2) continue;
      const m = R.mu, L = Life.L;
      if (m[L.BOLD] < 112 && m[L.SOCIAL] > 125 && m[L.SIZE] > 75 && m[L.SIZE] < 215) { if (!best || m[L.BOLD] < best.mean[L.BOLD]) best = s; }
    }
    return best;
  };
  function drowned(c) {
    AG.History.event('flood', `The rising sea swallows ${c.name}; its people must move`, { x: c.x, y: c.y, comm: c.id, cause: 'sea-level rise' });
    for (const P of persons(c)) People.remember(P, MK.FLOOD, { v: -0.8, s: 0.9, d: c.name });
    const k = Civ.kingdoms[c.kd]; if (k) k.exp.water += 3;
    const site = findSite(c.x, c.y, 50, false, c);
    if (!site) return;
    for (const bid of c.buildings.slice()) Civ.destroyBuilding(bid, -1, true);
    c.x = site.x; c.y = site.y; c.hearth = -1; c.keep = -1; survey(c);
    settle2(c);
    Civ.recomputeBordersSoon = true;
  }
  function abandon(c) {
    c.alive = false; c.contacts = new Map(); c.grievance = new Map(); c.cap = null;
    const k = Civ.kingdoms[c.kd];
    const p = k.cities.indexOf(c.id); if (p >= 0) k.cities.splice(p, 1);
    if (k.capital === c.id) k.capital = k.cities.length ? k.cities[0] : -1;
    for (const bid of c.buildings.slice()) Civ.destroyBuilding(bid, -1, true);
    if (c.members.length === 0 && c.founded < year() - 60 && (c.sedentary || c.stats.births > 20)) AG.History.event('abandoned', `${c.name} lies empty`, { x: c.x, y: c.y, comm: c.id });
    if (!k.cities.length) AG.War.fall(k, null);
  }
  Civ.abandon = abandon;

  // Inventors: clever, curious adults are likelier to be the one.
  Civ.pickInventor = function (c) {
    let best = null, bv = -1;
    const ps = persons(c);
    for (let t = 0; t < Math.min(8, ps.length); t++) {
      const P = ps[(rnd() * ps.length) | 0]; if (!P || P.job === J.CHILD) continue;
      const v = People.ph(P, Life.L.COGN) * (0.5 + P.pers.open) * (P.traits & TR.curious ? 1.6 : 1) * (P.traits & TR.genius ? 1.8 : 1) * rnd();
      if (v > bv) { bv = v; best = P; }
    }
    return best;
  };
  // What tech.js needs to know about a community.
  Civ.techContext = function (c) {
    const k = Civ.kingdoms[c.kd], s = c.survey || survey(c), ps = persons(c);
    let inno = 0, ni = 0;
    const maxSkill = new Uint8Array(AG.NS);
    for (const P of ps) { for (let q = 0; q < AG.NS; q++) if (P.skills[q] > maxSkill[q]) maxSkill[q] = P.skills[q]; }
    for (let t = 0; t < 4 && ps.length; t++) { const P = ps[(rnd() * ps.length) | 0]; if (P.job === J.CHILD) continue; inno += People.ph(P, Life.L.COGN) / 255 * (0.5 + P.pers.open) * (P.traits & TR.curious ? 1.6 : 1); ni++; }
    const wolves = Life.animalsIn(gameRegion(c), Life.ARCH.PREDATOR) > 0.5 || (AG.mode === 'watch' && (() => { const n = Ent.near(c.x, c.y, 24, 1, 200); for (let q = 0; q < n; q++) if (U.sp[Ent.buf[q]] === SP.PREDATOR) return true; return false; })());
    const dom = Civ.domesticableNear(c);
    let horses = false;
    for (const sp of Life.byArch(Life.ARCH.GRAZER)) { const R = sp.regions.get(gameRegion(c)); if (R && R.mu[Life.L.SPEED] > 160 && R.mu[Life.L.SIZE] > 140 && R.mu[Life.L.BOLD] < 140) horses = true; }
    return {
      pop: ps.length, sedentary: c.sedentary, res: s.res, tradeRes: c.tradeRes, cereal: s.cereal / Math.max(1, s.cells) * 6, water: c.water, coast: c.coastal, river: c.river, forest: s.forest / Math.max(1, s.cells),
      stone: s.stone > 20, cold: s.temp < 0.28, wolves, domesticable: !!dom, domesticableName: dom ? dom.common : '', horses,
      contacts: c.contacts.size, gov: k ? k.gov : 0, war: k ? k.atWar : false, deaths: c.stats.deaths, stable: AG.Geo.climate.anomaly > -0.065 && AG.Geo.climate.aerosol < 0.02, // a warm, settled climate
      innovation: ni ? inno / ni : 0.5, stability: k ? 0.6 + k.stability * 0.6 : 1, maxSkill, visible: c.materialized, inspired: c.inspired > year(),
    };
  };

  // ============================================================ polities
  function polityYear(k, dy) {
    let pop = 0;
    const live = k.cities.filter((id) => Civ.cities[id].alive);
    k.cities = live;
    for (const cid of k.cities) pop += Civ.cities[cid].members.length;
    k.pop = pop;
    if (!k.cities.length) { AG.War.fall(k, null); return; }
    if (k.capital < 0 || !Civ.cities[k.capital] || !Civ.cities[k.capital].alive || Civ.cities[k.capital].kd !== k.id) k.capital = k.cities.reduce((a, b) => (Civ.cities[a].members.length >= Civ.cities[b].members.length ? a : b));
    const cap = Civ.capitalOf(k);
    // the ruler (bands have elders, not rulers)
    const R = k.ruler ? People.get(k.ruler) : null;
    if (k.gov >= 1 && (!R || R.died !== null || R.comm < 0 || Civ.cities[R.comm].kd !== k.id)) succession(k, R);
    // inequality: surplus, ploughs, herds and conquest concentrate wealth; bands share
    let surplus = 0; for (const cid of k.cities) surplus += Math.max(0, Civ.cities[cid].surplus);
    surplus /= k.cities.length;
    const cap0 = cap || Civ.cities[k.cities[0]];
    const target = k.gov === 0 ? 0.08 : AG.clamp(0.1 + surplus * 0.25 + (Tech.knows(cap0, 'plough') ? 0.12 : 0) + (Tech.knows(cap0, 'herding') ? 0.06 : 0) + k.gov * 0.07 + (k.conquests || 0) * 0.02 - (k.laws ? 0.06 : 0), 0.05, 0.75);
    k.inequality += (target - k.inequality) * Math.min(1, dy * 0.05);
    institutions(k, dy);
    // stability and legitimacy
    let famine = 0; for (const cid of k.cities) if (Civ.cities[cid].famine) famine++;
    let corr = 0; for (const I of k.inst) corr += I.corrupt / Math.max(1, k.inst.length);
    k.legit = AG.clamp(k.legit + dy * (0.03 - famine / k.cities.length * 0.2 - corr * 0.06 - (k.unrest || 0) * 0.1 + (k.monuments || 0) * 0.01 + (R && R.traits & TR.kind ? 0.01 : 0) - (R && R.traits & TR.cruel ? 0.015 : 0)), 0, 1);
    k.unrest = (k.unrest || 0) * Math.pow(0.6, dy);
    k.stability = AG.clamp(k.legit - corr * 0.5 - k.inequality * 0.3 - k.exhaustion * 0.004 - (k.unrest || 0), -1, 1);
    // government transitions
    const sedCap = cap && cap.sedentary;
    if (k.gov === 0 && k.cities.length >= 3) setGov(k, 1, 'kinship among growing bands');
    else if (k.gov === 1 && sedCap && pop >= 330 && (k.inequality >= 0.22 || k.atWar)) setGov(k, 2, k.atWar ? 'war called for a war leader' : 'surplus and rank made a chief');
    else if (k.gov === 2 && pop >= 1100 && cap && cap.members.length >= 250 && (Tech.knows(cap, 'writing') || Tech.knows(cap, 'monuments') || k.cities.length >= 6)) setGov(k, 3, Tech.knows(cap, 'writing') ? 'scribes and law bind the towns into a state' : 'the chief became a king');
    if (k.stability < -0.15 && k.cities.length >= 2 && (famine || k.atWar || (k.unrest || 0) > 0.2) && rnd() < dy * 0.2) collapse(k);
    else if (k.gov <= 1 && k.cities.length > 8 && rnd() < dy * 0.05) { // a sprawling tribe drifts apart
      let far = null, fd = 0; for (const cid of k.cities) { const c = Civ.cities[cid]; const d = cap ? dist2(c.x, c.y, cap.x, cap.y) : 0; if (cid !== k.capital && d > fd) { fd = d; far = c; } }
      if (far) AG.War.secede(far, 'distance');
    }
    else if (k.cities.length >= 3) AG.War.loyaltyCheck(k, dy);
  }
  function setGov(k, g, why) {
    const was = GOVS[k.gov];
    k.gov = g; namePolity(k);
    AG.History.event('government', `The ${was} of the ${AG.Lang.peopleName(k.lang)} becomes ${g === 1 ? 'a tribe' : g === 2 ? 'a chiefdom' : 'a state'}: ${k.name}`, { x: capX(k), y: capY(k), cause: why, polity: k.id });
    if (g >= 1 && !k.inst.length) k.inst.push(newInst('council'));
    if (g >= 2 && !k.inst.some((I) => I.kind === 'warriors')) k.inst.push(newInst('warriors'));
    const R = k.ruler ? People.get(k.ruler) : null; if (R) R.rank = Math.max(R.rank, g >= 3 ? 3 : 2);
  }
  Civ.setGov = setGov;
  const capX = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].x : -1);
  const capY = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].y : -1);
  function newInst(kind) { return { kind, str: 0.3, legit: 0.6, corrupt: 0, since: year() }; }
  Civ.INSTITUTIONS = { council: 'Council of elders', priesthood: 'Priesthood', warriors: 'Warrior band', scribes: 'Scribes', guild: 'Merchant guild' };
  function institutions(k, dy) {
    const cap = Civ.capitalOf(k); if (!cap) return;
    const want = [];
    if (k.gov >= 1) want.push('council');
    if (k.religion >= 0 && (counts(cap, true)[BT.TEMPLE] || counts(cap, true)[BT.MEGALITH])) want.push('priesthood');
    if (k.gov >= 2 || k.atWar) want.push('warriors');
    if (Tech.knows(cap, 'writing')) want.push('scribes');
    if (counts(cap, true)[BT.MARKET]) want.push('guild');
    for (const w of want) if (!k.inst.some((I) => I.kind === w)) { k.inst.push(newInst(w)); AG.History.event('institution', `A ${Civ.INSTITUTIONS[w].toLowerCase()} takes shape in the ${k.name}`, { x: cap.x, y: cap.y, polity: k.id }); }
    const R = k.ruler ? People.get(k.ruler) : null;
    for (const I of k.inst) {
      I.str = Math.min(1, I.str + dy * 0.02);
      const age = (year() - I.since) / 300;
      I.corrupt = AG.clamp(I.corrupt + dy * 0.01 * (k.inequality * 1.5 + age * 0.5 + (R && R.traits & TR.greedy ? 0.6 : 0) + (R && R.traits & TR.cruel ? 0.3 : 0) - (Tech.knows(cap, 'law') ? 0.8 : 0) - 0.15), 0, 1);
      I.legit = AG.clamp(I.legit + dy * (0.01 - I.corrupt * 0.03), 0, 1);
      if (I.corrupt > 0.75 && rnd() < dy * 0.02) { // a reformer
        I.corrupt *= 0.4; I.since = year();
        AG.History.event('reform', `Reformers sweep out the corrupt ${Civ.INSTITUTIONS[I.kind].toLowerCase()} of the ${k.name}`, { x: cap.x, y: cap.y, polity: k.id, cause: 'corruption' });
      }
    }
    if (Tech.knows(cap, 'law') && !k.laws) { k.laws = 1; AG.History.event('law', `The ${k.name} writes down its laws`, { x: cap.x, y: cap.y, polity: k.id }); }
  }
  // Heirs: eldest adult child in the polity, else the most ambitious, respected adult.
  function succession(k, old) {
    let heir = null;
    if (old && k.gov >= 2) for (const kid of old.kids) {
      const K = People.get(kid);
      if (!K || K.died !== null || K.comm < 0 || Civ.cities[K.comm].kd !== k.id || People.age(K) < 16) continue;
      if (!heir || People.age(K) > People.age(heir)) heir = K;
    }
    if (!heir) {
      const cap = Civ.capitalOf(k); if (!cap) return;
      let bv = -1e9;
      for (const P of persons(cap)) {
        if (P.job === J.CHILD) continue;
        const v = (P.traits & TR.ambitious ? 3 : 0) + (P.goal === 5 ? 2 : 0) + P.fame * 0.4 + P.skills[SK.LORE] / 30 + P.kills * 0.3 + (People.age(P) > 30 ? 1 : 0) + rnd();
        if (v > bv) { bv = v; heir = P; }
      }
    }
    if (!heir) return;
    if (old && old.rank > 0) old.rank = old.died === null ? 1 : old.rank;
    k.ruler = heir.id; heir.rank = k.gov >= 3 ? 3 : 2; heir.fame += 2;
    const title = k.gov >= 3 ? (heir.sex ? 'king' : 'queen') : k.gov === 2 ? 'chief' : 'headman';
    People.remember(heir, MK.RULER, { v: 0.8, s: 1, d: `${title} of the ${k.name}`, core: true });
    if (heir.body >= 0) U.flags[heir.body] |= FL.KING;
    if (old && old.body >= 0 && U.alive[old.body]) U.flags[old.body] &= ~FL.KING;
    if (k.gov >= 2) AG.History.event('ruler', `${heir.name} becomes ${title} of the ${k.name}`, { x: heir.x, y: heir.y, polity: k.id, person: heir.id, cause: old ? (heir.mom === old.id || heir.dad === old.id ? 'inheritance' : 'chosen by the elders') : 'the people chose' });
    if (k.gov === 2 && !k.hereditary) k.hereditary = true;
  }
  Civ.succession = succession;
  // A polity in crisis breaks: outlying communities go their own way, government falls back.
  function collapse(k) {
    const cap = Civ.capitalOf(k);
    const others = k.cities.filter((id) => id !== k.capital).map((id) => Civ.cities[id]);
    let n = 0;
    for (const c of others) { if (rnd() < 0.6) { AG.War.secede(c, 'collapse'); n++; } }
    if (k.gov >= 2) k.gov--;
    namePolity(k);
    k.legit = 0.4; k.stability = 0.2; k.unrest = 0;
    for (const I of k.inst) { I.corrupt *= 0.5; I.str *= 0.5; }
    AG.History.event('collapse', `The ${k.name} collapses${n ? `: ${n} communities break away` : ''}`, { x: cap ? cap.x : -1, y: cap ? cap.y : -1, polity: k.id, cause: k.inequality > 0.5 ? 'inequality and corruption' : 'famine and unrest' });
  }
  Civ.collapse = collapse;

  // ============================================================ contacts
  // Communities in reach of each other are in contact: knowledge, goods, spouses and rumours move.
  function contacts(dy) {
    const cs = Civ.cities.filter((c) => c.alive);
    for (const c of cs) { for (const [id, v] of c.contacts) { const v2 = v * Math.pow(0.7, dy); if (v2 < 0.05 || !Civ.cities[id].alive) c.contacts.delete(id); else c.contacts.set(id, v2); } c.tradeRes.fill(0); }
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a], B = cs[b];
      const d = Math.sqrt(dist2(A.x, A.y, B.x, B.y));
      const range = 60 + (Tech.knows(A, 'wheel') || Tech.knows(B, 'wheel') ? 50 : 0) + (Tech.knows(A, 'sailing') && Tech.knows(B, 'sailing') && A.coastal && B.coastal ? 120 : 0) + (A.kd === B.kd ? 50 : 0);
      if (d > range) continue;
      const ra = Life.regionOf(A.x, A.y), rb = Life.regionOf(B.x, B.y), m = Life.env.mass;
      const linked = m[ra] === m[rb] || (Tech.knows(A, 'boats') && Tech.knows(B, 'boats') && d < 50) || (Tech.knows(A, 'sailing') && Tech.knows(B, 'sailing'));
      if (!linked) continue;
      const s = AG.clamp(1 - d / range, 0.05, 1) * (A.kd === B.kd ? 1.3 : 1);
      A.contacts.set(B.id, Math.min(2, (A.contacts.get(B.id) || 0) + s * dy)); B.contacts.set(A.id, Math.min(2, (B.contacts.get(A.id) || 0) + s * dy));
      for (let r = 1; r < AG.RESOURCES.length; r++) { if (A.survey.res[r]) B.tradeRes[r] = 1; if (B.survey.res[r]) A.tradeRes[r] = 1; }
      Tech.diffuse(A, B, s, dy);
      // marriage between bands: spouses move, genes flow
      if (rnd() < dy * 0.3 * s) exogamy(A, B);
    }
  }
  function exogamy(A, B) {
    const pa = persons(A).filter((P) => !P.spouse && People.age(P) >= 16 && People.age(P) < 35);
    const pb = persons(B).filter((P) => !P.spouse && People.age(P) >= 16 && People.age(P) < 35);
    if (!pa.length || !pb.length) return;
    const P = pick(pa), Q = pb.find((q) => q.sex !== P.sex && AG.Life.canMate(P.gen, 0, q.gen, 0));
    if (!Q) return;
    if (!People.marry(P, Q)) return;
    const wife = P.sex === 0 ? P : Q, husband = wife === P ? Q : P;
    const pat = (A.customs.residence || 'patrilocal') === 'patrilocal';
    const mover = pat ? wife : husband, home = Civ.cities[(pat ? husband : wife).comm];
    if (home) Civ.moveMember(mover, home);
    People.remember(mover, MK.EXILE, { v: 0.1, s: 0.4, d: home ? home.name : '' });
  }
  Civ.contactOf = (a, b) => (a.contacts.get(b.id) || 0) > 0.15;

  // ============================================================ LOD
  // Near the camera every person is a body; far away they live on their records.
  function embodyOne(c, P) {
    const recent = year() - P.lastSeen < 2 && P.x;
    let x = recent ? P.x : c.x + (rnd() - 0.5) * c.radius * 1.2, y = recent ? P.y : c.y + (rnd() - 0.5) * c.radius * 1.2;
    for (let t = 0; t < 8 && !Wd.passLand(AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1)); t++) { x = c.x + (rnd() - 0.5) * 6; y = c.y + (rnd() - 0.5) * 6; }
    const i = Ent.spawnPerson(P, x, y);
    if (i >= 0) Civ.embodied++;
    return i;
  }
  Civ.materialize = function (c) {
    if (c.materialized) return;
    c.materialized = true; c.lodT = AG.now();
    for (const P of persons(c)) if (P.body < 0) embodyOne(c, P);
    c.prodAcc = 0; c.prodT = 0;
    AG.History.lod && AG.History.lod('m', c.id);
  };
  Civ.fold = function (c) {
    if (!c.materialized) return;
    c.materialized = false; c.lodT = AG.now();
    for (const P of persons(c)) if (P.body >= 0) { const b = P.body; Ent.remove(b); Civ.embodied--; }
    AG.History.lod && AG.History.lod('f', c.id);
  };
  Civ.foldAll = function () { for (const c of Civ.cities) if (c.materialized) Civ.fold(c); for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.pid[i] >= 0) Ent.remove(i); Civ.embodied = 0; };
  Civ.lod = function () {
    const f = Civ.focus;
    const t0 = AG.now();
    if (!f || AG.mode !== 'watch') { Civ.foldAll(); return; }
    const w = f.x1 - f.x0, h = f.y1 - f.y0;
    const inner = { x0: f.x0 - w * 0.3, y0: f.y0 - h * 0.3, x1: f.x1 + w * 0.3, y1: f.y1 + h * 0.3 };
    const outer = { x0: f.x0 - w * 0.6, y0: f.y0 - h * 0.6, x1: f.x1 + w * 0.6, y1: f.y1 + h * 0.6 };
    const inR = (r, c) => c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1;
    const now = AG.now();
    // the budget: nearest first
    const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    const order = Civ.cities.filter((c) => c.alive).sort((a, b) => dist2(a.x, a.y, cx, cy) - dist2(b.x, b.y, cx, cy));
    let budget = 6000;
    for (const c of order) {
      const pinned = AG.God.possessed >= 0 && U.city[AG.God.possessed] === c.id;
      if (c.materialized) {
        budget -= c.members.length;
        if (!pinned && (!inR(outer, c) || budget < 0) && now - c.lodT > 4000) Civ.fold(c);
      } else if ((inR(inner, c) || pinned) && budget - c.members.length >= 0 && now - c.lodT > 1500) { Civ.materialize(c); budget -= c.members.length; }
    }
    Civ.stats.lod = AG.now() - t0;
  };

  // A person died: tidy up memberships, offices and the polity's memory of loss.
  Civ.onPersonDeath = function (P, cause, by) {
    const c = Civ.cities[P.comm];
    if (c) { Civ.removeMember(c, P); c.stats.deaths++; }
    const k = c ? Civ.kingdoms[c.kd] : null;
    if (k && k.ruler === P.id && k.gov >= 2) AG.History.event('death', `${People.title(P) || 'Ruler'} ${P.name} of the ${k.name} dies (${cause})`, { x: P.x, y: P.y, person: P.id, polity: k.id });
    else if (P.traits & TR.hero) AG.History.event('death', `The hero ${P.name} has fallen (${cause})`, { x: P.x, y: P.y, person: P.id });
    if (k) {
      if (P.job === J.SOLDIER) { k.exhaustion += 1; k.losses++; }
      if (cause === 'lava' || cause === 'fire') k.exp.fire += 0.3; else if (cause === 'drowning') k.exp.water += 0.3; else if (cause === 'lightning') k.exp.storm += 0.5; else if (P.dis) k.exp.plague += 0.3;
      k.exp.death += 0.05;
      if (by && by.comm >= 0 && Civ.cities[by.comm] && Civ.cities[by.comm].id !== c.id) { const g = c.grievance.get(by.comm) || 0; c.grievance.set(by.comm, g + 1); }
    }
  };
  Civ.onAnimalDeath = function (i, cause, killer) {
    // a domestic animal lost reduces the herd it belonged to
    if (U.flags[i] & FL.DOMESTIC) { const c = Civ.cities[U.home[i]]; if (c && c.herd > 0) c.herd = Math.max(0, c.herd - 1); }
  };
  // Experience of the world feeds the gods (eruptions -> fire gods, floods -> water gods...).
  Civ.experience = function (x, y, dom, amt) {
    for (const c of Civ.cities) { if (!c.alive) continue; const d = Math.sqrt(dist2(c.x, c.y, x, y)); if (d > 60) continue; const k = Civ.kingdoms[c.kd]; if (k) k.exp[dom] = (k.exp[dom] || 0) + amt * (1 - d / 60); }
  };

  // ============================================================ borders (v1)
  const bq = new Int32Array(N);
  Civ.recomputeBorders = function () {
    const owner = Wd.owner;
    owner.fill(-1);
    let qh = 0, qt = 0;
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const i = AG.clamp(c.y | 0, 0, H - 1) * W + AG.clamp(c.x | 0, 0, W - 1);
      owner[i] = c.id; bq[qt++] = i; c.area = 0;
    }
    while (qh < qt) {
      const i = bq[qh++], c = Civ.cities[owner[i]];
      c.area++;
      const r = c.nomadic ? 11 : c.radius, r2 = r * r, x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x, ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (owner[j] !== -1) continue;
        if (Wd.fl[j] > 0.12 && !Wd.frozen[j]) continue;
        if (dist2(nx, ny, c.x, c.y) > r2) continue;
        owner[j] = c.id; bq[qt++] = j;
      }
    }
    Civ.contact.fill(0);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, o = owner[i]; if (o < 0) continue;
      const ka = Civ.cities[o].kd;
      const r = owner[i + 1], d = owner[i + W];
      if (r >= 0 && r !== o) { const kb = Civ.cities[r].kd; if (kb !== ka) { Civ.contact[ka * MAXK + kb]++; Civ.contact[kb * MAXK + ka]++; } }
      if (d >= 0 && d !== o) { const kb = Civ.cities[d].kd; if (kb !== ka) { Civ.contact[ka * MAXK + kb]++; Civ.contact[kb * MAXK + ka]++; } }
    }
    Civ.recomputeBordersSoon = false;
    if (AG.Render) AG.Render.bordersDirty = true;
  };

  // ============================================================ clocks
  // History mode: dy years for everything.
  Civ.yearStep = function (dy) {
    const t0 = AG.now();
    const cs = Civ.cities.filter((c) => c.alive);
    for (const c of cs) Civ.communityYear(c, dy);
    for (const c of cs) if (c.alive) { const ctx = Civ.techContext(c); Tech.yearStep(c, ctx, dy); }
    contacts(dy);
    for (const k of Civ.kingdoms) if (k.alive) polityYear(k, dy);
    AG.War.yearStep(dy);
    if (Math.floor(year() / 25) !== Math.floor((year() - dy) / 25)) AG.Lang.checkSplits(Civ.cities, Civ.contactOf, 25);
    AG.Lang.yearStep(dy);
    if (Civ.recomputeBordersSoon || Math.floor(year() / 10) !== Math.floor((year() - dy) / 10)) Civ.recomputeBorders();
    Civ.stats.ms = Civ.stats.ms * 0.9 + (AG.now() - t0) * 0.1;
  };
  // Watch mode: the same yearly processes in slices, plus LOD and the embodied systems.
  Civ.tick = function () {
    const t = AG.tick, Y = AG.YEAR_TICKS;
    const cs = Civ.cities;
    for (let q = 0; q < cs.length; q++) {
      const c = cs[q]; if (!c.alive) continue;
      if ((t + c.id * 7) % 24 === 0) {
        if (c.materialized) { c.prodT += 24 / Y; if (c.prodT > 0.25) { c.recentProd = c.prodAcc / c.prodT; c.prodAcc = 0; c.prodT = 0; } }
        Civ.communityYear(c, 24 / Y);
      }
      if ((t + c.id * 13) % 120 === 0) { const ctx = Civ.techContext(c); Tech.yearStep(c, ctx, 120 / Y); }
    }
    if (t % 120 === 60) contacts(120 / Y);
    for (const k of Civ.kingdoms) if (k.alive && (k.id * 11 + t) % 240 === 0) polityYear(k, 240 / Y);
    if (t % 240 === 120) { AG.Lang.yearStep(240 / Y); if (t % (240 * 25) === 120) AG.Lang.checkSplits(Civ.cities, Civ.contactOf, 25 * 240 / Y); }
    if (t % 30 === 0) Civ.lod();
    if (t % 40 === 0 || Civ.recomputeBordersSoon) Civ.recomputeBorders();
    AG.War.tick();
  };
  // Embodied workers credit food like this (scaled so the expected rate matches the model).
  Civ.creditFood = function (c, amount) { c.food += amount; c.prodAcc += amount; };
})();
