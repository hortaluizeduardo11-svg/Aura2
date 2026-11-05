/* AURA: Genesis 2 — demo: the rising sea.
 * A geological change reshapes a civilization. People spread at the Dawn over land exposed by an
 * ice age; then the world warms, the ice sheets fail and the sea rises over a hundred metres.
 * Coasts drown, land bridges become straits, camps flee inland, and isolated peoples drift into
 * new languages. Printed as maps of the land and its people before and after, plus the record.
 *   node genesis2/tests/demo-sealevel.js [seed=3] [W=320] [H=192]
 */
'use strict';
const { load } = require('./harness');
const seed = +process.argv[2] || 3, W = +process.argv[3] || 320, H = +process.argv[4] || 192;
const DY = 4;
const AG = load({ W, H });
AG.Sim.newWorld(seed); AG.Sim.skipDeep();
const { Civ, People, Lang, History, Geo, Life, World: Wd, SEA } = AG;

// a coarse map: '~' sea, '.' land, '^' ice, 'o' band, 'V' village or town
function map(label) {
  const sx = Math.ceil(W / 80), sy = Math.ceil(H / 30), rows = [];
  const occ = new Map(); for (const c of Civ.cities) if (c.alive) occ.set(((c.y / sy) | 0) * 1000 + ((c.x / sx) | 0), c.nomadic ? 'o' : 'V');
  for (let y = 0; y < H; y += sy) {
    let r = '';
    for (let x = 0; x < W; x += sx) {
      const k = ((y / sy) | 0) * 1000 + ((x / sx) | 0), i = y * W + x;
      r += occ.get(k) || (Wd.elev[i] < SEA ? '~' : Wd.ice[i] ? '^' : '.');
    }
    rows.push(r);
  }
  console.log(`\n${label}\n${rows.join('\n')}`);
}
const land = () => { let n = 0; for (let i = 0; i < AG.N; i++) if (Wd.elev[i] >= SEA) n++; return n; };
const masses = () => { Life.envFromWorld(); return Life.env.massSize.filter((s) => s >= 3).length; };
const stat = () => `${People.alive} people in ${Civ.cities.filter((c) => c.alive).length} communities, ${Lang.list.filter((L) => L.speakers).length} languages; sea ${Math.round(Geo.seaLevel * 2500)} m; land ${land()} cells in ${masses()} landmasses`;

// two thousand years for people to spread over the ice-age lowlands
for (let y = 0; y < 2000; y += DY) AG.Sim.yearStep(DY);
console.log(`AURA: Genesis 2 — the rising sea (seed ${seed}, ${W}x${H})`);
console.log(`Year ${Math.floor(Geo.year) + 1}, before: ${stat()}`);
map('Before the melt  (~ sea, . land, ^ ice, o band, V village):');
const land0 = land(), masses0 = masses(), id0 = History.nextId;
const coastal0 = Civ.cities.filter((c) => c.alive && Wd.elev[(c.y | 0) * W + (c.x | 0)] < SEA + 0.05).map((c) => c.id);

// the warming: the great ice sheets fail over a few thousand years
Geo.climate.carbon += 0.14;
History.event('god', 'The world warms: the great ice sheets begin to fail', { cause: 'the rising-sea demo' });
for (let y = 0; y < 4000; y += DY) {
  AG.Sim.yearStep(DY);
  if (Math.floor(Geo.year) % 500 < DY) console.log(`  year ${Math.floor(Geo.year) + 1}: ${stat()}`);
}
map(`After the melt, year ${Math.floor(Geo.year) + 1}:`);

const ev = History.events.filter((e) => e.id >= id0);
const pick = (k) => ev.filter((e) => e.kind === k);
const fled = pick('migration').filter((e) => /rising sea/.test(e.text)), drowned = pick('flood'), langs = pick('language');
console.log(`\nWhat the sea did (${stat()}):`);
console.log(`  Land lost: ${land0 - land()} cells (${(((land0 - land()) / land0) * 100).toFixed(1)}%); landmasses ${masses0} -> ${masses()} (land bridges became straits).`);
console.log(`  ${drowned.length} settlements swallowed and ${fled.length} bands driven inland by the water; of ${coastal0.length} communities that lived near the old shore, ${coastal0.filter((id) => Civ.cities[id].alive && Wd.elev[(Civ.cities[id].y | 0) * W + (Civ.cities[id].x | 0)] >= SEA).length} still stand on dry land.`);
console.log(`  ${langs.length} new languages formed as the water and distance parted peoples.`);
for (const e of [...drowned.slice(0, 4), ...fled.slice(0, 4), ...langs.slice(0, 4)].sort((a, b) => a.year - b.year)) console.log(`  Y${String(Math.floor(e.year) + 1).padStart(5)}  ${e.text}  [because: ${e.cause}]`);
// the experience lives on in faith: peoples who lost land to the water revere water gods
const water = Civ.kingdoms.filter((k) => k.alive && k.exp && k.exp.water > 2).length;
console.log(`  ${water} living polities carry the memory of the flood in their faith (water and sea gods).`);
