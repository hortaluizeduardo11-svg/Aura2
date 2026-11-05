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
