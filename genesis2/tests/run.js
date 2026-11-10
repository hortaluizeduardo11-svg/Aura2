/* AURA: Genesis 2 — headless test suite.  Run:  node genesis2/tests/run.js [filter]
 * Each test gets fresh worlds from the harness; nothing here needs a browser. */
'use strict';
const { load, hash } = require('./harness');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(0)) : String(v));

// ------------------------------------------------------------------ geology
function crustNear(G, x0, x1) { // max crust in columns [x0, x1)
  let m = 0;
  for (let c = 0; c < G.GN; c++) { const x = c % G.GW; if (x >= x0 && x < x1) m = Math.max(m, G.crust[c]); }
  return m;
}

test('tectonics: converging continents raise mountains at the suture', () => {
  const AG = load({ W: 256, H: 160, modules: ['core', 'world', 'geo'] }), G = AG.Geo;
  G.scenario('collide');
  const half = G.GW >> 1, before = crustNear(G, half - 3, half + 3);
  for (let k = 0; k < 40; k++) G.deepStep(0.5);
  // after 20 Myr the boundary has moved; find it and look around it
  let sx = -1;
  for (let x = 1; x < G.GW; x++) if (G.plate[20 * G.GW + x] !== G.plate[20 * G.GW + x - 1]) { sx = x; break; }
  assert(sx > 0, 'plate boundary should still exist');
  const suture = crustNear(G, sx - 4, sx + 4), far = Math.max(crustNear(G, 0, 6), crustNear(G, G.GW - 6, G.GW));
  assert(suture > before + 0.12, `suture crust ${fmt(suture)} should rise well above ${fmt(before)}`);
  assert(suture > far + 0.1, `suture ${fmt(suture)} should stand above the plate interiors ${fmt(far)}`);
  let conv = 0; for (let c = 0; c < G.GN; c++) if (G.bound[c] === G.B.CONV) conv++;
  assert(conv > 0, 'boundary should be classified convergent');
  return `suture max ${fmt(suture)} vs interior ${fmt(far)}`;
});

test('tectonics: diverging plates open a rift, then new ocean floor', () => {
  const AG = load({ W: 256, H: 160, modules: ['core', 'world', 'geo'] }), G = AG.Geo;
  G.scenario('rift');
  for (let k = 0; k < 40; k++) G.deepStep(0.5);
  let young = 0, youngSea = 0, basalt = 0, rift = 0;
  for (let c = 0; c < G.GN; c++) {
    if (G.age[c] < 20) { young++; if (G.crust[c] < 0.4) youngSea++; if (G.rock[c] === AG.ROCK.BASALT) basalt++; if (G.rock[c] === AG.ROCK.VOLCANIC) rift++; }
  }
  assert(young > G.GH * 10, `a wide band of new crust should form (got ${young} cells)`);
  assert(youngSea / young > 0.8, `new crust should lie mostly below the sea (${youngSea}/${young})`);
  assert(basalt > young * 0.6, `new crust should be mostly basalt ocean floor (${basalt}/${young})`);
  assert(rift > 0, 'the first opening should be a volcanic rift valley');
  let div = 0; for (let c = 0; c < G.GN; c++) if (G.bound[c] === G.B.DIV) div++;
  assert(div > 0, 'boundary should be classified divergent');
  return `${young} new cells, ${basalt} basalt, ${rift} rift`;
});

test('tectonics: a transform fault builds strain and releases earthquakes', () => {
  const AG = load({ W: 256, H: 160, modules: ['core', 'world', 'geo'] }), G = AG.Geo;
  G.scenario('transform');
  const q0 = G.quakes;
  for (let k = 0; k < 40; k++) G.deepStep(0.5);
  let tr = 0; for (let c = 0; c < G.GN; c++) if (G.bound[c] === G.B.TRANS) tr++;
  assert(tr > G.GH, `fault should be classified as transform along its length (${tr})`);
  assert(G.quakes > q0, 'strain should be released as quakes');
  return `${tr} transform cells, ${G.quakes - q0} quakes`;
});

test('geology: deep time keeps continents, then the Dawn finishes a living map', () => {
  const AG = load({ W: 256, H: 160, modules: ['core', 'world', 'geo'] }), G = AG.Geo, Wd = AG.World;
  G.init(31337);
  for (let k = 0; k < 500; k++) G.deepStep(0.5);
  G.dawn();
  let land = 0, ice = 0; const res = {};
  for (let i = 0; i < AG.N; i++) { if (Wd.elev[i] >= AG.SEA) land++; if (Wd.ice[i]) ice++; if (Wd.res[i]) res[Wd.res[i]] = 1; }
  const lf = land / AG.N;
  assert(lf > 0.2 && lf < 0.8, `land fraction ${fmt(lf)} should be reasonable`);
  assert(G.plates.filter((p) => p.alive).length >= 4, 'several plates should survive');
  assert(Wd.springs.length > 0, 'rivers should flow');
  assert(Object.keys(res).length >= 5, `several resource kinds should exist (${Object.keys(res).length})`);
  assert(ice > 0, 'the Dawn falls in an ice age');
  return `land ${fmt(lf)}, ${G.plates.filter((p) => p.alive).length} plates, ${Object.keys(res).length} resources, ${ice} ice cells`;
});

test('geology: deglaciation raises the sea and drowns coastal land', () => {
  const AG = load({ W: 256, H: 160, modules: ['core', 'world', 'geo'] }), G = AG.Geo, Wd = AG.World;
  G.init(2024);
  for (let k = 0; k < 500; k++) G.deepStep(0.5);
  G.dawn(); AG.mode = 'history';
  const landNow = () => { let n = 0; for (let i = 0; i < AG.N; i++) if (Wd.elev[i] >= AG.SEA) n++; return n; };
  const l0 = landNow(), s0 = G.seaLevel;
  for (let y = 0; y < 15000; y += 25) G.yearStep(25);
  const l1 = landNow();
  assert(G.seaLevel > s0 + 0.02, `sea should rise (from ${fmt(s0)} to ${fmt(G.seaLevel)})`);
  assert(l1 < l0 * 0.97, `land should shrink (${l0} -> ${l1})`);
  return `sea ${fmt(s0)} -> ${fmt(G.seaLevel)}, land ${l0} -> ${l1}`;
});

test('determinism: geology from one seed is identical; another seed differs', () => {
  const run = (seed) => {
    const AG = load({ W: 192, H: 128, modules: ['core', 'world', 'geo'] }), G = AG.Geo;
    G.init(seed); for (let k = 0; k < 120; k++) G.deepStep(0.5); G.dawn(); AG.mode = 'history';
    for (let y = 0; y < 3000; y += 10) G.yearStep(10);
    return hash([G.crust, G.plate, AG.World.elev, AG.World.res, G.events.length, G.quakes]);
  };
  const a = run(99), b = run(99), c = run(100);
  assert(a === b, `same seed must match (${a} vs ${b})`);
  assert(a !== c, 'different seeds should differ');
  return `hash ${a}`;
});

// ------------------------------------------------------------------ worlds after the Dawn
// Deep time is the slow part, so tests share Dawn worlds through save files (which also
// exercises save/load): dawnSave() runs one and caches the text; fromSave() loads it fresh.
const saves = {};
function dawnSave(seed, W, H) {
  const key = `${seed}:${W}x${H}`;
  if (!saves[key]) { const AG = load({ W, H }); AG.Sim.newWorld(seed); AG.Sim.skipDeep(); saves[key] = AG.History.serialize(); }
  return saves[key];
}
function fromSave(text, W, H) { const AG = load({ W, H }); AG.History.deserialize(text); return AG; }
function simHash(AG) {
  const ps = [...AG.People.map.values()].map((P) => [P.id, P.born, P.died, P.comm, P.spouse, P.job, Array.from(P.gen.slice(0, 8))]);
  const cs = AG.Civ.cities.filter((c) => c.alive).map((c) => [c.id, c.x.toFixed(3), c.y.toFixed(3), c.members.length, c.kd, c.lang, Array.from(c.tech).join(''), c.food.toFixed(4)]);
  const sp = AG.Life.alive().map((s) => [s.id, [...s.regions.values()].reduce((a, R) => a + R.n, 0).toFixed(4)]);
  return hash([AG.World.elev, AG.Geo.crust, ps, cs, sp, AG.History.events.length, AG.Lang.list.length, AG.Geo.seaLevel]);
}

// ------------------------------------------------------------------ the whole simulation
test('determinism: the whole world (deep time, Dawn, history) replays from its seed', () => {
  const run = (seed, sliced) => {
    const AG = load({ W: 224, H: 144 });
    AG.Sim.newWorld(seed); AG.Sim.skipDeep();
    for (let y = 0; y < 400; y += 4) {
      if (!sliced) AG.Sim.yearStep(4);
      else { AG.Sim.stepBegin(4); while (!AG.Sim.stepRun(AG.now() - 1)) { /* one community per call: the browser's frame slicing */ } }
    }
    return [simHash(AG), AG.People.alive];
  };
  const [a, n] = run(7), [b] = run(7), [c] = run(7, true), [d] = run(8);
  assert(a === b, `same seed must replay identically (${a} vs ${b})`);
  assert(a === c, `slicing a step over frames must not change the result (${a} vs ${c})`);
  assert(a !== d, 'another seed should give another history');
  assert(n > 0, 'people should survive 400 years');
  return `hash ${a}, ${n} people at year 400`;
});

test('history: a snapshot copied over many frames restores the same world as one taken at once', () => {
  const W = 224, H = 144;
  const run = (async) => {
    const A = fromSave(dawnSave(7, W, H), W, H);
    for (let y = 0; y < 40; y += 4) A.Sim.yearStep(4);
    A.asyncSnaps = async; A.History.lastSnapYear = -1e9;
    const before = A.History.snaps.length;
    A.Sim.yearStep(4); // the snapshot falls due at the end of this step
    let slices = 0;
    if (async) while (!A.History.snapWork(A.now() - 1)) slices++; // one stage per call, as the browser spreads it over frames
    assert(A.History.snaps.length === before + 1, 'the snapshot should be taken');
    const snap = A.History.snaps[A.History.snaps.length - 1];
    for (let y = 0; y < 40; y += 4) A.Sim.yearStep(4);
    const ahead = simHash(A);
    A.History.restore(snap.data);
    for (let y = 0; y < 40; y += 4) A.Sim.yearStep(4);
    return [ahead, simHash(A), slices];
  };
  const [a1, a2] = run(false), [b1, b2, n] = run(true);
  assert(n > 10, `the copying should be spread over many slices (${n})`);
  assert(a1 === a2, `restoring a snapshot taken at once must replay the same future (${a1} vs ${a2})`);
  assert(b1 === b2 && b1 === a1, `a snapshot spread over ${n} slices must replay the same future (${b1} / ${b2} vs ${a1})`);
  return `${n} slices, hash ${a1}`;
});

test('creatures: a lookup before the first tick returns at once, and finds a new body after a refresh', () => {
  // The lookup grid is built by the watch tick. In deep time no tick has run yet: a click on the map
  // once walked an unbuilt list forever and froze the page.
  const AG = load({ W: 160, H: 96 });
  AG.Sim.newWorld(3);
  assert(AG.Ent.near(80, 48, 30, 1, 64) === 0, 'an unbuilt grid should hold nobody');
  let i = -1;
  for (let y = 8; y < 88 && i < 0; y += 4) for (let x = 8; x < 152 && i < 0; x += 4) if (AG.World.passLand(y * AG.W + x)) i = AG.Ent.spawn(AG.SP.GRAZER, x, y, { force: true });
  assert(i >= 0, 'a grazer should be placed on land');
  AG.Ent.freshGrid();
  const n = AG.Ent.near(AG.U.x[i], AG.U.y[i], 2, AG.U.layer[i], 8);
  assert(n >= 1 && AG.Ent.buf[0] === i, 'the new body should be found after the grid is refreshed');
  AG.Sim.newWorld(4);
  assert(AG.Ent.near(80, 48, 200, 1, 64) === 0, 'a new world should start with an empty grid');
  return `found body ${i}; empty before and after`;
});

test('save/load: a loaded world has the same future as the original', () => {
  const W = 224, H = 144, A = fromSave(dawnSave(7, W, H), W, H);
  for (let y = 0; y < 120; y += 2) A.Sim.yearStep(2);
  const mid = A.History.serialize();
  for (let y = 0; y < 120; y += 2) A.Sim.yearStep(2);
  const B = fromSave(mid, W, H);
  for (let y = 0; y < 120; y += 2) B.Sim.yearStep(2);
  const a = simHash(A), b = simHash(B);
  assert(a === b, `futures differ after loading (${a} vs ${b})`);
  return `year ${Math.floor(A.Geo.year)}, ${A.People.alive} people, hash ${a}`;
});

// ------------------------------------------------------------------ genetics
test('genetics: Mendelian inheritance (recessive albinism 1:2:1, alleles from each parent)', () => {
  const AG = load({ W: 128, H: 96, modules: ['core', 'world', 'geo', 'life'] }), Life = AG.Life, GL = Life.GL, L = Life.L;
  const rng = AG.makeRng(12345), rand = () => rng();
  const mom = new Uint8Array(GL), dad = new Uint8Array(GL), kid = new Uint8Array(GL);
  for (let k = 0; k < Life.NL; k++) { mom[2 * k] = 100 + k; mom[2 * k + 1] = 150 + k; dad[2 * k] = 60 + k; dad[2 * k + 1] = 200 - k; }
  mom[2 * L.HUE] = 10; mom[2 * L.HUE + 1] = 140; dad[2 * L.HUE] = 12; dad[2 * L.HUE + 1] = 160; // both carriers
  const n = 8000; let albino = 0, carrier = 0, fromBoth = 0;
  for (let i = 0; i < n; i++) {
    Life.breed(kid, 0, mom, 0, dad, 0, rand, 0);
    if (Life.isAlbino(kid, 0)) albino++; else if (Life.carrier(kid, 0)) carrier++;
    let ok = true;
    for (let k = 0; k < Life.NL; k++) { if (kid[2 * k] !== mom[2 * k] && kid[2 * k] !== mom[2 * k + 1]) ok = false; if (kid[2 * k + 1] !== dad[2 * k] && kid[2 * k + 1] !== dad[2 * k + 1]) ok = false; }
    if (ok) fromBoth++;
  }
  const pa = albino / n, pc = carrier / n;
  assert(fromBoth === n, 'without mutation every allele must come from the matching parent');
  assert(Math.abs(pa - 0.25) < 0.02, `albino share ${fmt(pa)} should be ~0.25`);
  assert(Math.abs(pc - 0.5) < 0.025, `carrier share ${fmt(pc)} should be ~0.5`);
  assert(Life.express(mom, 0, L.HUE) === 140, 'a single albino allele stays hidden (recessive)');
  // mutation: ~3.2% of alleles change per birth
  let changed = 0;
  for (let i = 0; i < 3000; i++) { Life.breed(kid, 0, mom, 0, dad, 0, rand, 1); for (let k = 0; k < Life.NL; k++) { if (kid[2 * k] !== mom[2 * k] && kid[2 * k] !== mom[2 * k + 1]) changed++; if (kid[2 * k + 1] !== dad[2 * k] && kid[2 * k + 1] !== dad[2 * k + 1]) changed++; } }
  const mr = changed / (3000 * GL);
  assert(mr > 0.02 && mr < 0.045, `mutation rate ${fmt(mr)} per allele should be ~0.03`);
  return `albino ${fmt(pa)}, carriers ${fmt(pc)}, mutation ${fmt(mr)}/allele`;
});

// A test species placed by hand in chosen regions (a grazer, mean phenotype = the region optimum).
function testSpecies(AG, regions, n) {
  const Life = AG.Life, NL = Life.NL;
  const m = Float32Array.from(Life.optimum(Life.ARCH.GRAZER, regions[0]).map((v) => (v < 0 ? 128 : v)));
  m[Life.L.MATE] = 128; m[Life.L.NEUTRAL] = 128;
  const s = Life.newSpecies(Life.ARCH.GRAZER, m, null, Life.when());
  for (const r of regions) { const R = Life.newRegion(m, n); Life.seedReservoir(R, 10); s.regions.set(r, R); }
  return s;
}
function landRegions(AG) { // land regions grouped by landmass, largest masses first
  const Life = AG.Life, e = Life.env, by = new Map();
  for (let r = 0; r < Life.RN; r++) if (e.land[r] > 0.5 && e.mass[r] >= 0 && e.ice[r] < 0.2) { const k = e.mass[r]; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  return [...by.values()].sort((a, b) => b.length - a.length);
}

test('evolution: a new seaway splits a population into two species; a connected one stays one', () => {
  const W = 224, H = 144, text = dawnSave(7, W, H);
  const run = (split) => {
    const AG = fromSave(text, W, H), Life = AG.Life, Wd = AG.World, RS = Life.RS;
    Life.envFromWorld();
    const land = landRegions(AG)[0];
    // two columns of regions in the middle of the main landmass
    const xs = land.map((r) => r % Life.RW).sort((a, b) => a - b), cx = xs[xs.length >> 1];
    if (split) { // flood a strait two regions wide straight across the map (as a rising sea or a rift would)
      for (let y = 0; y < H; y++) for (let x = (cx - 1) * RS; x < Math.min(W, (cx + 1) * RS); x++) { const i = y * W + x; Wd.elev[i] = AG.SEA - 0.06; Wd.fl[i] = 0.06; Wd.ft[i] = AG.FT.WATER; }
      Life.envFromWorld();
    }
    const west = land.filter((r) => r % Life.RW === cx - 3).slice(0, 2), east = land.filter((r) => r % Life.RW === cx + 2).slice(0, 2);
    assert(west.length === 2 && east.length === 2, 'regions on both sides of the strait');
    const s = testSpecies(AG, [...west, ...east], 18);
    for (let y = 0; y < 6000; y += 10) { Life.yearStep(10); if (s.died !== null) break; }
    return { kids: Life.species.filter((x) => x.parent === s.id).length, masses: new Set([...west, ...east].map((r) => Life.env.mass[r])).size };
  };
  const apart = run(true), together = run(false);
  assert(apart.masses === 2 && together.masses === 1, 'the strait should part the land (and only when flooded)');
  assert(apart.kids >= 1, 'isolated populations should speciate within 6,000 years');
  assert(together.kids === 0, 'one connected population should stay one species');
  return `${apart.kids} daughter species across the strait, ${together.kids} without it`;
});

test('evolution: selection fits cold tolerance to the climate', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(7, W, H), W, H), Life = AG.Life, L = Life.L, e = Life.env;
  Life.envFromWorld();
  // the coldest and warmest regions where wild grazers already live (so the land can feed them)
  const lived = new Set(); for (const sp of Life.byArch(Life.ARCH.GRAZER)) if (!sp.domestic) for (const [r, R] of sp.regions) if (R.n > 2) lived.add(r);
  const land = [...lived].sort((a, b) => e.temp[a] - e.temp[b]);
  const cold = land[Math.floor(land.length * 0.2)], warm = land[Math.floor(land.length * 0.8)]; // a cool and a warm country
  const s = testSpecies(AG, [cold, warm], 25);
  const start = (Life.optimum(Life.ARCH.GRAZER, cold)[L.COLD] + Life.optimum(Life.ARCH.GRAZER, warm)[L.COLD]) / 2;
  for (const [r, R] of s.regions) { const o = Life.optimum(Life.ARCH.GRAZER, r); for (let k = 0; k < Life.NL; k++) if (o[k] >= 0) R.mu[k] = o[k]; R.mu[L.COLD] = start; }
  for (let y = 0; y < 1500; y += 5) Life.yearStep(5);
  const Rc = s.regions.get(cold), Rw = s.regions.get(warm);
  assert(Rc && Rw, 'both populations should survive');
  const oc = Life.optimum(Life.ARCH.GRAZER, cold)[L.COLD], ow = Life.optimum(Life.ARCH.GRAZER, warm)[L.COLD];
  assert(Rc.mu[L.COLD] > Rw.mu[L.COLD] + 30, `cold region ${fmt(Rc.mu[L.COLD])} should out-evolve warm ${fmt(Rw.mu[L.COLD])}`);
  assert(Math.abs(Rc.mu[L.COLD] - oc) < Math.abs(start - oc) * 0.5, 'the cold population moves most of the way to its optimum');
  return `cold-tolerance gene: ${fmt(Rc.mu[L.COLD])} in the cold (optimum ${fmt(oc)}), ${fmt(Rw.mu[L.COLD])} in the heat (optimum ${fmt(ow)})`;
});

// ------------------------------------------------------------------ technology
test('technology: prerequisites, conditions and bans gate every invention', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(7, W, H), W, H), Tech = AG.Tech, Civ = AG.Civ;
  const c = Civ.cities.find((q) => q.alive);
  const ctx = Object.assign(Civ.techContext(c), { pop: 400, innovation: 3, contacts: 6 });
  let gated = 0;
  for (const t of Tech.LIST) if (!Tech.prereqsMet(c, t)) { assert(Tech.chance(c, t, ctx) === 0, `${t.name} must be impossible without ${t.pre.join(', ')}`); gated++; }
  // conditions: cultivation needs wild cereals
  const cult = Tech.LIST[Tech.IDX.cultivation];
  for (const p of cult.preIds) c.tech[p] = 1;
  assert(Tech.chance(c, cult, Object.assign({}, ctx, { cereal: 0 })) === 0, 'no wild grain, no cultivation');
  // bans (the counterfactual tool): never discovered, never learned
  Tech.banned.add('pottery');
  const pot = Tech.LIST[Tech.IDX.pottery];
  for (const p of pot.preIds) c.tech[p] = 1;
  assert(Tech.chance(c, pot, ctx) === 0 && Tech.learn(c, 'pottery', 'god') === false, 'a banned invention never appears');
  Tech.banned.delete('pottery');
  // and in a running history (a fresh copy of the world, untouched by the probes above), no
  // invention is ever first found before its prerequisites
  const B = fromSave(dawnSave(7, W, H), W, H), TB = B.Tech;
  for (let y = 0; y < 1500; y += 5) B.Sim.yearStep(5);
  let checked = 0;
  for (const t of TB.LIST) { const f = TB.firsts[t.key]; if (!f) continue; for (const p of t.pre) { if (TB.STARTING.includes(p)) continue; const fp = TB.firsts[p]; assert(fp && fp.year <= f.year, `${t.name} (${f.year}) came before its prerequisite ${p}`); } checked++; }
  return `${gated} gated at the Dawn; ${checked} first discoveries in 1,500 years all followed their prerequisites`;
});

// ------------------------------------------------------------------ level of detail
test('LOD: embodying and folding keeps every person record, and both modes feed people alike', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(7, W, H), W, H), Civ = AG.Civ, People = AG.People, Sim = AG.Sim;
  for (let y = 0; y < 60; y += 2) Sim.yearStep(2);
  const c = Civ.cities.filter((q) => q.alive).sort((a, b) => b.members.length - a.members.length)[0];
  const before = new Set(c.members);
  const expected = Civ.FOOD_JOBS.reduce((a, j) => a + (c.jobs[j] || 0) * Civ.yieldPerYear(c, j, null), 0);
  Civ.focus = { x0: c.x - 20, y0: c.y - 20, x1: c.x + 20, y1: c.y + 20 };
  Sim.setMode('watch');
  Civ.materialize(c);
  assert(c.materialized && Civ.embodied > 0, 'the community near the camera should be embodied');
  for (const id of c.members) { const P = People.get(id); assert(P.body >= 0 && AG.U.pid[P.body] === id, 'every member gets a body linked to its record'); }
  const n0 = c.nutr;
  for (let t = 0; t < AG.YEAR_TICKS; t++) Sim.tick();
  const trips = c.recentProd, n1 = c.nutr;
  Sim.setMode('history');
  assert(!c.materialized && Civ.embodied === 0, 'history mode folds everyone back');
  for (const id of before) { const P = People.get(id); assert(P, 'no record is lost by folding'); assert(P.body === -1, 'folded records hold no body'); }
  assert(trips > 0, 'embodied workers bring food home on their trips');
  assert(n1 > Math.min(0.75, n0 - 0.15), `an embodied year should feed people about as well as the model (nutrition ${fmt(n0)} -> ${fmt(n1)})`);
  return `${before.size} people embodied and folded; trips ${fmt(trips)}/yr vs model ${fmt(expected)}/yr; nutrition ${fmt(n0)} -> ${fmt(n1)}`;
});

// ------------------------------------------------------------------ runner
const filter = process.argv[2];
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  const s = Date.now();
  try {
    const note = t.fn();
    pass++;
    console.log(`  ok   ${t.name}${note ? `  (${note})` : ''}  ${Date.now() - s} ms`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${t.name}\n       ${e.message}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = fail ? 1 : 0;
module.exports = { test, assert };
