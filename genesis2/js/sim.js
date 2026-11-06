/* AURA: Genesis 2 — sim.js
 * The clocks and the life of a world, with no rendering: world creation (deep time from 250
 * million years ago), the Dawn, and the three modes:
 *   deep    — Geo.deepStep + Life.deepStep, 0.5 million years a step
 *   watch   — the tick-by-tick world near the camera (bodies, fluids, weather)
 *   history — year steps for everything (no bodies)
 * Geological events (quakes, eruptions, tsunamis) are routed to the land and its people in both
 * modes. Used by main.js in the browser and by the Node tests. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, Geo = AG.Geo, Life = AG.Life, Civ = AG.Civ, People = AG.People;
  const { W, H, N, SEA, SO, FT } = AG;
  const Sim = (AG.Sim = { DEEP_DT: 0.5, stats: { ms: {} }, geoSeen: 0 });
  AG.mode = 'deep'; AG.seed = 0; AG.tick = 0;
  const t0 = () => AG.now();
  const time = (k, fn) => { const a = t0(); fn(); const d = t0() - a; Sim.stats.ms[k] = (Sim.stats.ms[k] || 0) * 0.9 + d * 0.1; };

  // A fresh world at the start of deep time.
  Sim.newWorld = function (seed) {
    seed = seed >>> 0 || ((Math.random() * 1e9) | 0) + 1;
    AG.seed = seed; AG.tick = 0; AG.mode = 'deep'; AG.creating = true;
    AG.seedRnd(Math.imul(seed, 2654435761) >>> 0);
    AG.DISEASES.splice(0, AG.DISEASES.length, ...AG.DISEASES.filter((d) => d.builtin));
    AG.Chronicle.reset(); AG.History.reset(); AG.Ent.reset(); AG.Civ.reset(); AG.War.reset(); AG.God.reset(); AG.FX.reset && AG.FX.reset(); AG.Proj.reset();
    People.reset(); AG.Lang.list.length = 0; AG.Lang.splits = 0; AG.Lang.changes = 0; AG.Tech.reset();
    Wd.reset(); Wd.seed = seed;
    Geo.init(seed); Life.init(seed); AG.Sky.reset(seed);
    Geo.paintFine();
    Sim.geoSeen = 0;
    AG.History.event('genesis', `Year 0: a new world is born (seed ${seed}), one great continent in a world ocean`, { cause: 'creation' });
    AG.creating = false;
  };
  Sim.deepStep = function (dt) {
    dt = dt || Sim.DEEP_DT;
    time('geo', () => Geo.deepStep(dt));
    time('life', () => Life.deepStep(dt));
    if (Life.sapienceReady(dt)) Sim.dawn(); // people arrive when evolution makes them, not on a set date
  };
  // Run the rest of deep time at once (the "skip to the Dawn" button and the tests).
  Sim.skipDeep = function (budgetMs) {
    const end = budgetMs ? t0() + budgetMs : Infinity;
    while (AG.mode === 'deep' && t0() < end) Sim.deepStep();
    return AG.mode !== 'deep';
  };

  // The Dawn: finish the land, choose the sapient, set down the first bands.
  Sim.dawn = function () {
    if (AG.mode !== 'deep') return;
    Geo.dawn();
    const p = Life.dawn();
    for (const s of Life.alive()) if (s.mean[Life.L.SIZE] > 205 && s.arch === Life.ARCH.GRAZER) s.mega = true;
    AG.History.event('dawn', `The Dawn, ${AG.calText(0)}: ${p.name}, descended from ${Life.species[p.parent] ? Life.species[p.parent].name : 'the apes'}, become people`, { cause: `${(Geo.myr).toFixed(1)} million years of primate evolution toward bigger brains` });
    AG.mode = 'history';
    Civ.dawn();
    AG.Sky.reset(AG.seed);
    Wd.dirty.fill(1);
    AG.History.snaps.push({ year: 0, tick: AG.tick, data: AG.History.capture() });
    AG.History.lastSnapYear = 0;
    if (AG.onDawn) AG.onDawn(p);
  };

  // ------------------------------------------------------------ modes
  Sim.setMode = function (m) {
    if (m === AG.mode || AG.mode === 'deep') return;
    Sim.finish(); AG.History.flushSnap();
    AG.History.record('mode', { m });
    if (m === 'history') {
      Civ.foldAll(); Life.fold();
      for (let i = 0; i < AG.U.hi; i++) if (AG.U.alive[i]) AG.Ent.remove(i); // vehicles and strays
      for (const sq of Civ.squads) if (sq.alive) AG.War.endSquad(sq, 'recalled');
      AG.Proj.reset();
      Wd.oceanFill();
      AG.mode = 'history';
    } else {
      AG.mode = 'watch';
      AG.tick += (192 - (AG.tick % AG.DAY_TICKS) + AG.DAY_TICKS) % AG.DAY_TICKS; // arrive in the morning
      Life.embody();
      Civ.lod();
    }
  };

  // ------------------------------------------------------------ watch tick
  Sim.tick = function () {
    AG.tick++;
    AG.Flow.budget = 2;
    time('sky', () => AG.Sky.tick());
    time('physics', () => AG.Physics.tick());
    time('geo', () => Geo.tick());
    AG.Ent.rebuildGrid();
    time('ai', () => AG.AI.tick());
    AG.Proj.tick();
    time('civ', () => Civ.tick());
    if (AG.tick % 120 === 0) Life.census();
    if (AG.tick % 480 === 0) { Life.yearStep(0); } // keeps speciation and extinction checks alive
    AG.God.tick();
    geoEvents();
    if (AG.tick % 240 === 0) AG.History.yearTick();
  };

  // ------------------------------------------------------------ history step
  Sim.yearStep = function (dy) { Sim.stepBegin(dy); Sim.stepRun(Infinity); };
  // One history step, begun now and run to completion over as many calls (frames) as needed.
  Sim.h = null;
  Sim.stepBegin = function (dy) {
    if (Sim.h) Sim.stepRun(Infinity);
    dy = dy || 1;
    AG.tick += Math.round(dy * AG.YEAR_TICKS);
    time('geo', () => Geo.yearStep(dy));
    time('world', () => worldYear(dy));
    Sim.h = { dy, cs: Civ.yearBegin(), i: 0, phase: 0, end: null, ei: 0 };
  };
  // Returns true when the step is complete; stops early once AG.now() passes `until`.
  Sim.stepRun = function (until) {
    const h = Sim.h; if (!h) return true;
    if (h.phase === 0) { time('life', () => Life.yearStep(h.dy)); h.phase = 1; if (t0() > until) return false; }
    while (h.phase === 1 && h.i < h.cs.length) { Civ.communityYear(h.cs[h.i++], h.dy); if ((h.i & 3) === 0 && t0() > until) return false; }
    if (h.phase === 1) { h.phase = 2; h.i = 0; }
    while (h.phase === 2 && h.i < h.cs.length) { Civ.yearTech(h.cs[h.i++], h.dy); if ((h.i & 7) === 0 && t0() > until) return false; }
    if (h.phase === 2) { h.phase = 3; h.end = Civ.yearEndParts(h.dy); h.ei = 0; if (t0() > until) return false; }
    while (h.ei < h.end.length) { if (h.end[h.ei](until) === false) return false; h.ei++; if (h.ei < h.end.length && t0() > until) return false; }
    Sim.h = null;
    geoEvents();
    AG.History.yearTick();
    return true;
  };
  Sim.finish = function () { if (Sim.h) Sim.stepRun(Infinity); };
  // Land between ticks: vegetation regrows toward its climate, a strided pass over the map.
  Sim.stripe = 0; // which eighth of the map regrows this step (saved with the world)
  function worldYear(dy) {
    const { veg, soil, moist, elev, ice, snow, fl, bgrid, traffic } = Wd;
    const rows = Math.ceil(H / 8), y0 = (Sim.stripe * rows) % H, y1 = Math.min(H, y0 + rows);
    Sim.stripe = (Sim.stripe + 1) % 8;
    const k = Math.min(1, dy * 8 * 0.15);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (elev[i] < SEA || fl[i] > 0.02) continue;
      if (ice[i]) { veg[i] = 0; continue; }
      const t = Wd.Tc(i);
      snow[i] = t < 0.06 || (elev[i] > AG.PEAK && t < 0.16) ? 200 : 0; // year-round snow only where it is cold all year (watch-time winters melt away)
      if (bgrid[i]) continue;
      const cap = Wd.vegCap(moist[i], t, soil[i]);
      veg[i] = AG.clamp(veg[i] + (cap - veg[i]) * k, 0, 255) | 0;
      if (traffic[i]) traffic[i] = Math.max(0, traffic[i] - Math.ceil(dy * 4));
      if (soil[i] === SO.ASH && rnd() < dy * 0.01) soil[i] = SO.DIRT;
    }
    for (let c = (y0 >> 4) * AG.CW; c < Math.min(AG.NC, ((y1 >> 4) + 1) * AG.CW); c++) Wd.dirty[c] = 1;
  }
  const rnd = AG.rnd;

  // ------------------------------------------------------------ geological events
  // Quakes, eruptions and tsunamis from geo.js reach the land and its people. In watch time they
  // play out physically (cracks, lava, waves); in history they are applied at once.
  function geoEvents() {
    const ev = Geo.events;
    if (Sim.geoSeen > ev.length) Sim.geoSeen = 0;
    for (; Sim.geoSeen < ev.length; Sim.geoSeen++) {
      const e = ev[Sim.geoSeen];
      if (e.kind === 'quake') {
        if (e.mag < 6.2) continue; // felt, but forgotten
        if (!nearPeople(e.x, e.y, 10 + (e.mag - 6) * 10) && e.mag < 7.5) continue;
        if (AG.mode === 'watch') AG.God.quake(e.x, e.y, e.mag, true); else quakeAggregate(e);
        if (e.tsunami && e.mag >= 7.8) { if (AG.mode === 'watch') AG.God.tsunami(e.x, e.y, e.mag, true); else tsunamiAggregate(e); }
      } else if (e.kind === 'eruption') {
        const v = e.volcano; if (v && !v.name) { const c = Civ.nearestCity(e.x, e.y, -1, 80); v.name = c ? `Mount ${AG.Lang.cap(AG.Lang.word(c.lang, 'fire')).slice(0, 7)}` : 'the Smoking Mountain'; }
        if (AG.mode === 'watch') AG.God.volcano(e.x, e.y, e.vei, true); else eruptAggregate(e);
      }
    }
  }
  function nearPeople(x, y, r) { for (const c of Civ.cities) if (c.alive && AG.dist2(c.x, c.y, x, y) < r * r) return true; return false; }
  function harm(x, y, r, hurtP, killP, cause, mk, what, bldP) {
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const d = Math.sqrt(AG.dist2(c.x, c.y, x, y)); if (d > r) continue;
      const f = 1 - d / r;
      for (const P of Civ.persons(c)) {
        People.remember(P, mk, { v: -0.8 * f - 0.1, s: 0.9, d: what, x, y });
        if (rnd() < killP * f) People.die(P, cause); else if (rnd() < hurtP * f) People.injure(P, -1, 0.4 + rnd() * 0.4, cause);
      }
      for (const bid of c.buildings.slice()) if (rnd() < bldP * f) Civ.destroyBuilding(bid, -1);
      const k = Civ.kingdoms[c.kd]; if (k) { k.legit = Math.max(0, k.legit - 0.1 * f); k.unrest = (k.unrest || 0) + 0.2 * f; }
    }
  }
  function quakeAggregate(e) {
    const sc = (e.mag - 5) / 3, r = 10 + sc * 18;
    harm(e.x, e.y, r, 0.2 * sc, 0.04 * sc, 'the earthquake', People.MK.QUAKE, `the great quake (magnitude ${e.mag})`, 0.25 * sc);
    Civ.experience(e.x, e.y, 'earth', 2 + sc * 2);
    AG.History.event('quake', `A magnitude ${e.mag} earthquake shakes the land near ${Civ.placeName(e.x, e.y) || 'the wilds'}`, { x: e.x, y: e.y, cause: `strain released on a ${e.fault} fault` });
  }
  function tsunamiAggregate(e) {
    harm(e.x, e.y, 40, 0.12, 0.03, 'the great wave', People.MK.FLOOD, 'the great wave', 0.25);
    Civ.experience(e.x, e.y, 'water', 4);
    AG.History.event('tsunami', `A great wave follows the quake and strikes the coast near ${Civ.placeName(e.x, e.y) || 'the wilds'}`, { x: e.x, y: e.y, cause: 'an undersea earthquake' });
  }
  function eruptAggregate(e) {
    const r = 4 + e.vei * 1.8;
    for (let y = Math.max(1, (e.y - r) | 0); y < Math.min(H - 1, e.y + r); y++) for (let x = Math.max(1, (e.x - r) | 0); x < Math.min(W - 1, e.x + r); x++) {
      const i = y * W + x, d = Math.sqrt(AG.dist2(x, y, e.x, e.y)) / r; if (d > 1) continue;
      if (d < 0.6 && rnd() < 0.7) { Wd.soil[i] = SO.BASALT; Wd.veg[i] = 0; Wd.elev[i] = Math.min(0.97, Wd.elev[i] + 0.01 * (1 - d)); if (Wd.bgrid[i]) Civ.destroyBuilding(Wd.bgrid[i] - 1, -1); }
      else if (Wd.soil[i] === SO.DIRT) Wd.fert[i] = Math.min(255, Wd.fert[i] + 30);
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    harm(e.x, e.y, r * 3, 0.15, 0.06 * e.vei / 4, 'the eruption', People.MK.ERUPTION, `the eruption of ${e.volcano ? e.volcano.name : 'the mountain'}`, 0.4);
    Civ.experience(e.x, e.y, 'fire', 2 + e.vei);
    AG.History.event('eruption', `${e.volcano && e.volcano.name ? e.volcano.name : 'A volcano'} erupts (VEI ${e.vei})${e.vei >= 5 ? '; ash darkens the sky for years' : ''}`, { x: e.x, y: e.y, cause: 'magma rising under the mountain' });
  }

  // A band placed by the god: people of the sapient species with genomes from its gene pool.
  Civ.godBand = function (x, y) {
    if (AG.Geo.phase !== 'history' || !Life.people) return false;
    const i = AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1);
    if (!Wd.passLand(i) || Wd.ice[i]) return false;
    const R = Life.people.regions.values().next().value;
    if (!R) return false;
    const parent = Civ.nearestCity(x, y, -1, 1e9);
    const lang = parent ? parent.lang : AG.Lang.create(null, Math.floor(Geo.year)).id;
    const k = Civ.newPolity(lang, 0); if (!k) return false;
    const site = Civ.findSite(x, y, 6, true) || { x: x + 0.5, y: y + 0.5 };
    const c = Civ.foundBand(k, site.x, site.y, lang, R, parent);
    AG.History.event('god', `A god sets down a band of people at ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: 'divine will' });
    Civ.experience(x, y, 'watcher', 3);
    Civ.recomputeBorders();
    return true;
  };
})();
