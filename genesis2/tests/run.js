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
    const A = fromSave(dawnSave(13, W, H), W, H);
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

test('history: a new world drops a step that was half done in the old one', () => {
  // A scenario or a new world started while a history step was spread over frames used to carry on
  // that step against the new world's records (and crash on its missing buildings).
  const AG = load({ W: 160, H: 96 });
  AG.Sim.newWorld(3); AG.Sim.skipDeep();
  for (let y = 0; y < 40; y += 4) AG.Sim.yearStep(4);
  AG.Sim.stepBegin(4); AG.Sim.stepRun(AG.now() - 1);
  assert(AG.Sim.h, 'the step should still be in progress');
  AG.Sim.newWorld(4);
  assert(!AG.Sim.h, 'the old step should be gone (reaching the Dawn would otherwise finish it against the new world)');
  AG.Sim.skipDeep();
  for (let y = 0; y < 40; y += 4) { AG.Sim.stepBegin(4); while (!AG.Sim.stepRun(AG.now() - 1)) { /* sliced */ } }
  return `${AG.People.alive} people after 40 sliced years in the new world`;
});

test('people: skin pigment follows the sun (darker under a strong sun, lighter under a weak one)', () => {
  // The same people under a scorching or a dim sky: pigment drifts toward what the light favours.
  const W = 224, H = 144;
  const run = (hot) => {
    const A = fromSave(dawnSave(11, W, H), W, H), Wd = A.World;
    for (let i = 0; i < A.N; i++) Wd.tbase[i] = hot ? Math.max(Wd.tbase[i], 0.85) : Math.min(Wd.tbase[i], 0.2);
    for (let y = 0; y < 1600; y += 8) A.Sim.yearStep(8);
    let sum = 0, n = 0;
    for (const P of A.People.map.values()) if (P.died === null) { sum += A.Life.express(P.gen, 0, A.Life.L.HUE); n++; }
    return [sum / Math.max(1, n), n];
  };
  const [hot, nh] = run(true), [dim, nd] = run(false);
  assert(nh > 50 && nd > 50, `people should survive in both (${nh}, ${nd})`);
  assert(hot - dim > 10, `the sunny people should end up darker (${hot.toFixed(0)} vs ${dim.toFixed(0)})`);
  return `mean pigment ${hot.toFixed(0)} under a strong sun, ${dim.toFixed(0)} under a weak one, after 1,600 years`;
});

test('save/load: a loaded world has the same future as the original', () => {
  const W = 224, H = 144, A = fromSave(dawnSave(13, W, H), W, H);
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
  const W = 224, H = 144, text = dawnSave(13, W, H);
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
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), Life = AG.Life, L = Life.L, e = Life.env;
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
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), Tech = AG.Tech, Civ = AG.Civ;
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
  const B = fromSave(dawnSave(13, W, H), W, H), TB = B.Tech;
  for (let y = 0; y < 1500; y += 5) B.Sim.yearStep(5);
  let checked = 0;
  for (const t of TB.LIST) { const f = TB.firsts[t.key]; if (!f) continue; for (const p of t.pre) { if (TB.STARTING.includes(p)) continue; const fp = TB.firsts[p]; assert(fp && fp.year <= f.year, `${t.name} (${f.year}) came before its prerequisite ${p}`); } checked++; }
  return `${gated} gated at the Dawn; ${checked} first discoveries in 1,500 years all followed their prerequisites`;
});

// ------------------------------------------------------------------ level of detail
test('LOD: embodying and folding keeps every person record, and both modes feed people alike', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), Civ = AG.Civ, People = AG.People, Sim = AG.Sim;
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

test('habitat: animals are placed where their kind would live, in groups, and winter changes them', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(5, W, H), W, H), Life = AG.Life, Hab = AG.Habitat, U = AG.U, Sim = AG.Sim, Y = AG.YEAR_TICKS; // (a world with wolves)
  for (let y = 0; y < 20; y += 2) Sim.yearStep(2);
  Sim.setMode('watch'); // (Watch time always begins on a morning)
  const wild = [];
  for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sid[i] >= 0 && U.pid[i] < 0 && !(U.flags[i] & AG.FL.DOMESTIC)) wild.push(i);
  assert(wild.length > 50, `enough animals to judge (${wild.length})`);
  // their spots against random dry spots of the same region squares (the old placement)
  let rs = 12345;
  const rand = () => ((rs = (rs * 1103515245 + 12345) >>> 0) / 4294967296);
  const judge = (ids) => {
    let got = 0, base = 0, nb = 0;
    for (const i of ids) {
      const p = Hab.profile(Life.species[U.sid[i]]);
      got += Hab.score(p, (U.y[i] | 0) * W + (U.x[i] | 0), null);
      const r = Life.regionOf(U.x[i], U.y[i]), x0 = (r % Life.RW) * Life.RS, y0 = ((r / Life.RW) | 0) * Life.RS;
      for (let k = 0; k < 6; k++) {
        const x = Math.min(W - 1, x0 + ((rand() * Life.RS) | 0)), y = Math.min(H - 1, y0 + ((rand() * Life.RS) | 0)), c = y * W + x;
        if (p.bird || (AG.World.passLand(c) && !AG.World.ice[c])) { base += Hab.score(p, c, null); nb++; }
      }
    }
    return [got / Math.max(1, ids.length), base / Math.max(1, nb)];
  };
  const [got, base] = judge(wild);
  assert(got > base * 1.3, `animals should stand on clearly better habitat than random spots (${fmt(got)} vs ${fmt(base)})`);
  // social kinds come in groups: most have one of their own kind close by
  let social = 0, together = 0;
  for (const i of wild) {
    if (U.social[i] < 0.55) continue;
    social++;
    for (const j of wild) if (j !== i && U.sid[j] === U.sid[i] && (U.x[j] - U.x[i]) ** 2 + (U.y[j] - U.y[i]) ** 2 < 9) { together++; break; }
  }
  assert(social === 0 || together / social > 0.6, `herds, packs and flocks should be together (${together}/${social})`);
  // predators where the prey is
  let predPrey = 0, np = 0, anyPrey = 0, na = 0;
  for (const i of wild) { const b = Hab.blockOf(U.x[i], U.y[i]); if (U.sp[i] === AG.SP.PREDATOR) { predPrey += Hab.prey[b]; np++; } }
  for (let b = 0; b < Hab.BW * Hab.BH; b++) { anyPrey += Hab.prey[b]; na++; }
  const pp = np ? predPrey / np : 0, ap = anyPrey / na;
  assert(np >= 5, `this world has predators (${np})`);
  assert(pp > ap, `predators should be nearer prey than the average place (${fmt(pp)} vs ${fmt(ap)})`);
  // a week of watching: they keep to good ground (habitat wandering), and the night puts herds to rest
  for (let t = 0; t < AG.DAY_TICKS * 2; t++) Sim.tick();
  const alive = [];
  for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sid[i] >= 0 && U.pid[i] < 0 && !(U.flags[i] & AG.FL.DOMESTIC)) alive.push(i);
  const [later, base2] = judge(alive);
  assert(later > base2 * 1.2, `after two days they should still be on good ground (${fmt(later)} vs random ${fmt(base2)})`);
  while (AG.Sky.daylight() > 0.1) Sim.tick();
  for (let t = 0; t < 40; t++) Sim.tick();
  let resting = 0, grazers = 0;
  for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sp[i] === AG.SP.GRAZER && !(U.flags[i] & AG.FL.DOMESTIC)) { grazers++; if (U.task[i] === AG.TK.REST) resting++; }
  assert(grazers === 0 || resting / grazers > 0.3, `grazers bed down at night (${resting}/${grazers})`);
  // winter: songbirds of cold lands have flown south, so fewer are here than in summer
  const songs = () => { let n = 0; for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sid[i] >= 0 && Hab.profile(Life.species[U.sid[i]]).migrant) n++; return n; };
  Sim.setMode('history');
  // the same regional populations embodied in summer and then in deep winter (a world loaded in winter embodies like this)
  const embodyAt = (f) => { AG.tick = Math.ceil(AG.tick / Y) * Y + Math.round(Y * f); AG.mode = 'watch'; Life.embody(); const n = songs(), season = AG.Sky.season(); AG.mode = 'history'; Life.fold(); return [n, season]; };
  const [summerSongs] = embodyAt(0.4), [winterSongs, winterSeason] = embodyAt(0.78); // (early winter: room for the bear to settle and sleep before spring)
  AG.mode = 'watch'; Life.embody();
  assert(winterSeason === 3, 'the second embodying is in winter');
  assert(summerSongs === 0 || winterSongs < summerSongs * 0.8, `fewer songbirds in a cold winter (${summerSongs} -> ${winterSongs})`);
  // a bear in cold country goes to a den and sleeps through the winter, burning little
  const m = new Float32Array(Life.NL).fill(128); m[Life.L.SIZE] = 230; m[Life.L.COLD] = 200; m[Life.L.HEAT] = 20; m[Life.L.SOCIAL] = 40;
  const bear = Life.newSpecies(Life.ARCH.PREDATOR, m, null, Life.when());
  assert(Life.commonName(bear) === 'bear', 'the test species reads as a bear');
  let cold = -1;
  for (let c = W * 20; c < AG.N - W * 20 && cold < 0; c += 7) if (AG.World.passLand(c) && !AG.World.ice[c] && AG.World.T(c) < 0.3 && c % W > 20 && c % W < W - 20) cold = c;
  assert(cold >= 0, 'a cold place for the bear');
  const b = AG.Ent.spawnCreature(bear, (cold % W) + 0.5, ((cold / W) | 0) + 0.5, null, { age: 6 });
  U.energy[b] = 0.9;
  for (let t = 0; t < 120 && U.task[b] !== AG.TK.HIBERNATE; t++) Sim.tick();
  assert(U.alive[b] && U.task[b] === AG.TK.HIBERNATE, `the bear hibernates in a cold winter (task ${AG.TASKS[U.task[b]]})`);
  const e0 = U.energy[b];
  for (let t = 0; t < 60; t++) Sim.tick();
  assert(U.energy[b] > e0 - 0.01, `a hibernating bear burns almost nothing (${fmt(e0)} -> ${fmt(U.energy[b])})`);
  let dens = 0;
  for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.task[i] === AG.TK.HIBERNATE) dens++;
  return `habitat ${fmt(got)} vs random ${fmt(base)} (after 2 days ${fmt(later)} vs ${fmt(base2)}); ${together}/${social} in groups; predators on prey ${fmt(pp)} vs ${fmt(ap)}; ${resting}/${grazers} grazers resting at night; songbirds ${summerSongs} in spring, ${winterSongs} in winter; ${dens} bears in dens`;
});

test('sizes: animals are drawn at real sizes from their own genes, and follow them as they evolve', () => {
  const { SIM } = require('./harness');
  const W = 224, H = 144, AG = load({ W, H, modules: SIM.concat(['models3d']) }), Life = AG.Life, U = AG.U, M = AG.Models3D, L = Life.L;
  AG.Sim.newWorld(3); AG.Geo.myr = 200; // (the animals of today: in deep time each period has its own forms)
  const body = (arch, size, extra, age) => {
    const m = new Float32Array(Life.NL).fill(128); m[L.SIZE] = size; Object.assign(m, extra || {});
    const s = Life.newSpecies(arch, m, null, Life.when());
    const i = AG.Ent.spawnCreature(s, 50, 50, null, { age: age === undefined ? 20 : age });
    U.gen[i * Life.GL + L.SIZE * 2] = U.gen[i * Life.GL + L.SIZE * 2 + 1] = size; // both alleles at the chosen size
    AG.Ent.deriveStats(i);
    return { i, s, h: M.heightOf(i, s, Life.commonName(s), 0) };
  };
  const horse = body(Life.ARCH.GRAZER, 150, { [L.SPEED]: 200, [L.SOCIAL]: 200 });
  const ibex = body(Life.ARCH.GRAZER, 60);
  const mammoth = body(Life.ARCH.GRAZER, 240, { [L.COLD]: 220 });
  const wolf = body(Life.ARCH.PREDATOR, 120, { [L.SOCIAL]: 200 });
  const bear = body(Life.ARCH.PREDATOR, 210);
  const foal = body(Life.ARCH.GRAZER, 150, { [L.SPEED]: 200, [L.SOCIAL]: 200 }, 0.1);
  const person = 1.7;
  assert(Life.commonName(horse.s) === 'wild horse' && Life.commonName(mammoth.s) === 'mammoth' && Life.commonName(bear.s) === 'bear', 'the test bodies read as their kinds');
  assert(horse.h > 1.2 && horse.h < 1.65, `a horse stands 1.2-1.65 m at the shoulder (${fmt(horse.h)})`);
  assert(ibex.h > 0.5 && ibex.h < 0.9, `an ibex stands 0.5-0.9 m (${fmt(ibex.h)})`);
  assert(mammoth.h > 2.8 && mammoth.h < 3.8, `a mammoth stands 2.8-3.8 m (${fmt(mammoth.h)})`);
  assert(wolf.h > 0.65 && wolf.h < 0.95, `a wolf stands 0.65-0.95 m (${fmt(wolf.h)})`);
  assert(bear.h > 1.1 && bear.h < 1.6, `a bear stands 1.1-1.6 m on all fours (${fmt(bear.h)})`);
  assert(foal.h < horse.h * 0.6, `a newborn foal is much smaller than its parents (${fmt(foal.h)} vs ${fmt(horse.h)})`);
  assert(horse.h < person && mammoth.h > person * 1.6 && wolf.h < person / 2 + 0.1, 'against a person of 1.7 m: a horse is shorter at the shoulder, a mammoth towers, a wolf is knee-to-hip high');
  // evolution: the same body with a bigger SIZE gene is drawn bigger, a smaller one smaller
  const g = horse.i * Life.GL + L.SIZE * 2;
  U.gen[g] = U.gen[g + 1] = 100; AG.Ent.deriveStats(horse.i);
  const dwarf = M.heightOf(horse.i, horse.s, 'horse', 0);
  U.gen[g] = U.gen[g + 1] = 185; AG.Ent.deriveStats(horse.i);
  const giant = M.heightOf(horse.i, horse.s, 'horse', 0);
  assert(dwarf < horse.h && giant > horse.h, `the drawn size follows the size gene (${fmt(dwarf)} < ${fmt(horse.h)} < ${fmt(giant)})`);
  return `horse ${fmt(horse.h)} m, ibex ${fmt(ibex.h)}, mammoth ${fmt(mammoth.h)}, wolf ${fmt(wolf.h)}, bear ${fmt(bear.h)}, foal ${fmt(foal.h)}; size gene 100 -> ${fmt(dwarf)} m, 185 -> ${fmt(giant)} m`;
});

// ------------------------------------------------------------ the later ages, war and plague
test('ages: inventions run on past the Classical age to the stars and on into future technology', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), T = AG.Tech, Civ = AG.Civ;
  const c = Civ.cities.filter((q) => q.alive).sort((a, b) => b.members.length - a.members.length)[0], k = Civ.kingdoms[c.kd];
  assert(T.ERAS.length === 15 && T.ERAS[14] === 'Stellar', 'fifteen ages, the last the Stellar');
  for (const t of T.LIST) for (const p of t.preIds) assert(T.LIST[p].era <= t.era, `${t.name} needs nothing from a later age`);
  k.gov = 3; for (const t of T.LIST) if (t.era <= 6) T.learn(c, t, 'god');
  assert(c.era === 6, 'the Classical age');
  const before = AG.Civ.learning(c);
  for (const t of T.LIST) if (t.era <= 13) T.learn(c, t, 'god');
  assert(c.era === 13 && AG.Civ.learning(c) > before * 10, `printing, science, computers, the net and minds multiply invention (${fmt(AG.Civ.learning(c))}x)`);
  for (const t of T.LIST) T.learn(c, t, 'god');
  const ctx = Object.assign(Civ.techContext(c), { pop: 400, contacts: 6 });
  for (let y = 0; y < 400 && !c.future; y++) T.futureStep(c, ctx, 5);
  assert(c.era === 14 && c.future >= 1 && /future/.test(T.eraName(c)), 'past warp drive there is always more to learn');
  assert(AG.Warfare.arms(c) > 100, `the arms of the Stellar age outweigh a warband a hundredfold (${Math.round(AG.Warfare.arms(c))}x)`);
  return `${T.LIST.length} inventions in ${T.ERAS.length} ages; learning ${fmt(before)}x -> ${fmt(AG.Civ.learning(c))}x; ${T.eraName(c)}`;
});

test('plague lab: a pathogen spreads between communities, earns DNA, is noticed and cured; a rumour kills nobody', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), Civ = AG.Civ, Pl = AG.Plague, T = AG.Tech;
  for (let y = 0; y < 300; y += 5) AG.Sim.yearStep(5); // (a world of many communities)
  for (const c of Civ.cities) if (c.alive) for (const t of T.LIST) if (t.era <= 9) T.learn(c, t, 'god'); // (an age with medicine and science)
  const c = Civ.cities.filter((q) => q.alive).sort((a, b) => b.members.length - a.members.length)[0];
  const p = Pl.create('bacteria');
  p.dna = 40; for (const k of ['air1', 'cough', 'water1']) assert(Pl.buy(p, k), 'buys ' + k);
  assert(!Pl.buy(p, 'organfail'), 'a symptom needs the ones before it');
  Pl.release(p, c.x, c.y);
  const r = Pl.create('rumour'), c2 = Civ.cities.filter((q) => q.alive && q !== c).sort((a, b) => b.members.length - a.members.length)[0];
  Pl.release(r, c2.x, c2.y);
  let maxComms = 0, dna = 0;
  for (let y = 0; y < 80 && !(p.done && r.done); y += 2) { AG.Sim.yearStep(2); maxComms = Math.max(maxComms, p.comms); dna = Math.max(dna, p.dna); }
  assert(maxComms >= 3, `it spread to other communities (${maxComms})`);
  assert(dna > 10, `the outbreak earned DNA (${dna})`);
  assert(p.detected && (p.cure > 0.2 || p.done), `it was noticed and a cure was worked on (${fmt(p.cure)})`);
  assert(r.dead === 0, 'a rumour kills nobody');
  return `${p.name}: ${maxComms} communities, ${p.dead} dead, DNA ${dna}, cure ${Math.round(p.cure * 100)}%${p.cured ? ' (cured)' : ''}; rumour ${r.name}: peak ${r.peak} believers`;
});

test('realms: a god founds towns, raises wonders (one of each), crowns, revolts and unites; deeds are marked', () => {
  const W = 224, H = 144, AG = fromSave(dawnSave(13, W, H), W, H), Civ = AG.Civ, Rm = AG.Realms, T = AG.Tech, Wd = AG.World;
  for (let y = 0; y < 200; y += 5) AG.Sim.yearStep(5);
  const spots = [];
  const inland = (x, y) => { for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const i = (y + dy) * W + x + dx; if (!Wd.passLand(i) || Wd.ice[i] || Wd.owner[i] >= 0 || Wd.elev[i] > 0.62) return false; } return true; };
  for (let y = 15; y < H - 15; y += 5) for (let x = 15; x < W - 15; x += 5) if (inland(x, y)) spots.push([x, y]);
  assert(spots.length > 4, `open inland country to found on (${spots.length})`);
  for (const c of Civ.cities) if (c.alive) for (const t of T.LIST) if (t.era <= 9) T.learn(c, t, 'god');
  const made = [];
  for (let q = 0; q < spots.length && made.length < 3; q += 3) { const r = Rm.found(spots[q][0], spots[q][1], true); if (r.ok) made.push(r.c); }
  assert(made.length >= 2, `cities founded (${made.length})`);
  const m = made[0];
  assert(!m.nomadic && m.members.length > 100 && m.era >= 9 && m.keep >= 0, `a built city of the most advanced age (${m.members.length} people, ${T.ERAS[m.era]}, ${m.buildings.length} buildings)`);
  const w1 = Rm.raise(m, true), w2 = Rm.raise(made[1], true);
  assert(w1.ok && w2.ok && w1.b.wonder !== w2.b.wonder, `two different wonders (${w1.ok && w1.b.wname}, ${w2.ok && w2.b.wname})`);
  AG.Sim.yearStep(1);
  assert(Civ.kingdoms[m.kd].wonderFx, 'a wonder strengthens its realm');
  const k1 = Civ.kingdoms[m.kd];
  assert(Rm.revolution(m.x, m.y).ok && k1.republic && /^Republic of/.test(k1.name), `a revolution proclaims a republic (${k1.name})`);
  assert(Rm.crown(made[1].x, made[1].y).ok, 'a ruler is crowned');
  const before = k1.cities.length, B = Civ.kingdoms[made[1].kd];
  assert(Rm.unite(k1, B).ok && k1.cities.length > before && !B.alive, 'two realms become one');
  for (const k of ['town', 'wonder', 'republic']) assert(AG.Deeds.got[k] !== undefined, 'deed: ' + k);
  return `${made.length} cities; ${Rm.standing().map((b) => b.wname).join(' and ')}; ${k1.name} of ${k1.cities.length} communities; ${AG.Deeds.count()} deeds`;
});

test('deep time: life begins in the sea, crawls onto land in the Devonian, has its dinosaurs, loses them to an asteroid, and reaches the animals of today', () => {
  const W = 224, H = 144, AG = load({ W, H }), Life = AG.Life;
  AG.Sim.newWorld(13);
  const names = new Map(), seen = (p) => { for (const s of Life.alive()) { const k = Life.PERIODS[p][1]; if (!names.has(k)) names.set(k, new Set()); names.get(k).add(s.common); } };
  assert(Life.alive().every((s) => Life.isSea(s.arch)), 'in Year 0 all life is in the sea');
  let landAt = -1, impact = false, dino = false;
  while (AG.mode === 'deep') {
    AG.Sim.deepStep();
    const p = Life.periodAt(AG.Geo.myr); seen(p);
    if (landAt < 0 && Life.alive().some((s) => !Life.isSea(s.arch))) landAt = AG.Geo.myr;
    if (Life.kpg) impact = true;
    if (Life.alive().some((s) => /sauropod|theropod|tyrant|raptor|horned|armoured dinosaur|stegosaur|duckbill|ornithopod/.test(s.common))) dino = true;
  }
  const all = (k) => [...(names.get(k) || [])];
  assert(landAt >= Life.LAND_MYR - 0.6 && landAt < Life.LAND_MYR + 1, `life comes onto the land in the Devonian (${landAt} Myr)`);
  assert(all('Cambrian').some((n) => /trilobite|jellyfish|anomalocarid/.test(n)), `Cambrian seas: ${all('Cambrian').join(', ')}`);
  assert(dino, 'dinosaurs walk the Mesozoic');
  assert(impact, 'an asteroid ends the Cretaceous');
  const now = Life.alive().filter((s) => !s.sapient).map((s) => s.common);
  assert(now.some((n) => /deer|elk|horse|bison|aurochs|gazelle|ibex|mammoth/.test(n)), `the animals of today at the Dawn (${now.slice(0, 8).join(', ')})`);
  assert(Life.alive().some((s) => Life.isSea(s.arch)) && now.some((n) => /sardine|tuna|cod|reef fish|whale|shark|orca|dolphin|octopus|turtle|jellyfish|manta|dugong|seal|squid|barracuda/.test(n)), 'the seas are full at the Dawn');
  const sea = Life.alive().filter((s) => Life.isSea(s.arch));
  return `land at ${landAt} Myr; Jurassic: ${all('Jurassic').slice(0, 5).join(', ')}; Cretaceous: ${all('Cretaceous').slice(0, 5).join(', ')}; ${sea.length} sea species at the Dawn (${[...new Set(sea.map((s) => s.common))].slice(0, 6).join(', ')})`;
});

test('textures: every surface tiles seamlessly, averages a neutral grey, and is the same every run', () => {
  const AG = load({ W: 64, H: 64, modules: ['core', 'textures'] }), T = AG.Textures, S = 256;
  T.build(S);
  const first = hash([T.data]);
  let worst = '', worstK = 0;
  for (let li = 0; li < T.NAMES.length; li++) {
    const d = T.layer(li), lum = (x, y) => { const o = ((y % S) * S + (x % S)) * 4; return d[o] * 0.3 + d[o + 1] * 0.55 + d[o + 2] * 0.15; };
    let m = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) m += lum(x, y); m /= S * S;
    assert(m > 118 && m < 138, `${T.NAMES[li]} averages a neutral grey (${fmt(m)})`);
    // the step across the wrap should look like any other step (on 4x4 block averages, so a thin crack
    // line that happens to cross the edge at a slant does not count as a seam)
    const B = 4, n = S / B, blk = (bx, by) => { let t = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) t += lum(((bx + n) % n) * B + x, ((by + n) % n) * B + y); return t / (B * B); };
    let edge = 0, inner = 0;
    for (let k = 0; k < n; k++) {
      edge += Math.abs(blk(n - 1, k) - blk(0, k)) + Math.abs(blk(k, n - 1) - blk(k, 0));
      for (let q = 0; q < n - 1; q++) inner += (Math.abs(blk(q, k) - blk(q + 1, k)) + Math.abs(blk(k, q) - blk(k, q + 1))) / (n - 1);
    }
    const ratio = (edge + n) / (inner + n);
    if (ratio > worstK) { worstK = ratio; worst = T.NAMES[li]; }
    assert(ratio < 2.5, `${T.NAMES[li]} tiles without a seam (wrap step ${fmt(edge / n / 2)} vs inside ${fmt(inner / n / 2)})`);
  }
  T.data = null; T.build(S);
  assert(hash([T.data]) === first, 'the textures come out the same every run');
  return `${T.NAMES.length} surfaces of ${S}x${S} in ${fmt(T.ms)} ms; worst seam ratio ${fmt(worstK)} (${worst})`;
});

test('the age of dinosaurs can be watched up close: deep time stops, dinosaurs live as bodies, then the ages go on to the asteroid and the Dawn', () => {
  const W = 224, H = 144, AG = load({ W, H }), Life = AG.Life, U = AG.U;
  AG.Sim.newWorld(13);
  while (AG.Geo.myr < 68) AG.Sim.deepStep();
  const ev0 = AG.Geo.events.length, myr = AG.Geo.myr;
  assert(AG.Sim.watchDeep() && AG.mode === 'watch' && AG.Geo.phase === 'deep', 'deep time slows to a walk');
  const dinos = new Set(['early sauropod', 'sauropod', 'stegosaur', 'small ornithopod', 'duckbill', 'horned dinosaur', 'armoured dinosaur', 'early theropod', 'small raptor', 'raptor', 'great theropod', 'tyrant lizard']);
  const census = () => { const by = new Map(); for (let i = 0; i < U.hi; i++) { if (!U.alive[i] || U.sid[i] < 0) continue; const s = Life.species[U.sid[i]]; if (s) by.set(s.common, (by.get(s.common) || 0) + 1); } return by; };
  const c0 = census(), dino0 = [...c0].filter(([k]) => dinos.has(k));
  assert(dino0.length >= 2, `dinosaurs walk as bodies (${[...c0].map(([k, n]) => k + ' ' + n).join(', ')})`);
  const x0 = new Map(); for (let i = 0; i < U.hi; i++) if (U.alive[i]) x0.set(i, [U.x[i], U.y[i]]);
  for (let k = 0; k < AG.YEAR_TICKS + 20; k++) AG.Sim.tick();
  let moved = 0; for (const [i, p] of x0) if (U.alive[i] && Math.hypot(U.x[i] - p[0], U.y[i] - p[1]) > 1) moved++;
  assert(moved > x0.size * 0.3, `they move about (${moved} of ${x0.size})`);
  assert(AG.Geo.myr === myr && AG.Geo.watchYears === 1 && AG.calYear(null) === Math.round(myr * 1e6) + 1, 'the ages wait while a year is watched');
  assert(AG.Sim.geoSeen >= ev0, 'the quakes of the ages are not replayed');
  assert(AG.Sim.resumeDeep() && AG.mode === 'deep', 'Ages takes the world back into deep time');
  let alive = 0; for (let i = 0; i < U.hi; i++) if (U.alive[i]) alive++;
  assert(alive === 0, 'the bodies fold back into their populations');
  while (AG.mode === 'deep' && !Life.kpg) AG.Sim.deepStep();
  const big = Life.alive().filter((s) => dinos.has(s.common) && s.mean[Life.L.SIZE] > 150).length;
  AG.Sim.skipDeep();
  assert(AG.mode === 'history' && AG.Geo.phase === 'history', 'and on to the Dawn');
  return `${dino0.map(([k, n]) => n + ' ' + k).join(', ')}; ${moved}/${x0.size} moved in a year; ${big} big dinosaur species just after the asteroid`;
});

test('big worlds: coarse geology, batched life, and wild animals embodied around the camera that follow it', () => {
  const W = 832, H = 512, AG = load({ W, H }), Life = AG.Life, U = AG.U;
  assert(AG.N > 400000 && AG.Geo.CS === 8, `a big world paints from 8-cell geology (CS ${AG.Geo.CS})`);
  AG.Sim.newWorld(21); AG.Sim.skipDeep();
  assert(AG.mode !== 'deep' && Life.alive().length > 5, 'deep time reaches the Dawn with life');
  const y0 = AG.Geo.year; for (let k = 0; k < 7; k++) AG.Sim.yearStep(1);
  assert(Math.round(AG.Geo.year - y0) === 7 && Life.acc < 2, `history years are gathered into life steps (acc ${Life.acc})`);
  const land = []; for (let i = 0; i < AG.N; i += 211) { const x = i % W, y = (i / W) | 0; if (AG.World.passLand(i) && Life.env.land[Life.regionOf(x, y)] > 0.8) land.push([x, y]); }
  const a = land[0]; let b = null; for (const q of land) if (Math.hypot(q[0] - a[0], q[1] - a[1]) > 420) { b = q; break; }
  assert(b, 'two far-apart stretches of land');
  // (bodies inside the embodied box of regions, give or take a region for those that wander)
  const bodies = (box) => { let n = 0, all = 0; for (let i = 0; i < U.hi; i++) { if (!U.alive[i] || U.pid[i] >= 0 || U.sid[i] < 0) continue; all++; const rx = (U.x[i] / Life.RS) | 0, ry = (U.y[i] / Life.RS) | 0; if (rx >= box.rx0 - 1 && rx <= box.rx1 + 1 && ry >= box.ry0 - 1 && ry <= box.ry1 + 1) n++; } return [n, all]; };
  Life.bodyFocus = { x: a[0], y: a[1] }; AG.Sim.setMode('watch');
  const boxA = Life.bodyArea, [nA, allA] = bodies(boxA);
  assert(boxA && allA > 0 && nA === allA, `every wild body is in the box around the camera (${nA} of ${allA})`);
  assert(Life.streamTo(b[0], b[1]), 'the box follows the camera');
  const boxB = Life.bodyArea, [nB, allB] = bodies(boxB);
  const disjoint = boxB.rx0 > boxA.rx1 + 1 || boxB.rx1 < boxA.rx0 - 1 || boxB.ry0 > boxA.ry1 + 1 || boxB.ry1 < boxA.ry0 - 1;
  const [leftA] = disjoint ? bodies(boxA) : [0];
  assert(nB > 0 && nB === allB && leftA === 0, `the bodies are now in the new box (${nB} of ${allB}; ${leftA} left in the old one)`);
  for (let k = 0; k < 60; k++) AG.Sim.tick();
  AG.Sim.setMode('history');
  return `CS ${AG.Geo.CS}; ${allA} bodies around the first place, ${allB} around one ${Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))} cells away`;
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
    console.log(`  FAIL ${t.name}\n       ${e.message}`); if (process.env.STACK) console.log(e.stack);
  }
}
console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = fail ? 1 : 0;
module.exports = { test, assert };
