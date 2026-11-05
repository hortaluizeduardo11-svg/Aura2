/* AURA: Genesis 2 — demo: emergence.
 * From a handful of hunter-gatherer bands at the Dawn to villages, chiefdoms and new eras, with
 * nothing scripted: the run prints the history as it happens and, at the end, the chain of
 * causes behind each "first".
 *   node genesis2/tests/demo-emergence.js [years=9000] [seed=1] [W=320] [H=192]
 */
'use strict';
const { load } = require('./harness');
const years = +process.argv[2] || 9000, seed = +process.argv[3] || 1, W = +process.argv[4] || 320, H = +process.argv[5] || 192;
const DY = 8;
const AG = load({ W, H });
const t0 = Date.now();
AG.Sim.newWorld(seed);
AG.Sim.skipDeep();
const { Civ, Tech, People, Lang, History, Geo, Life } = AG;
const sapiens = Life.people;
console.log(`AURA: Genesis 2 — emergence demo (seed ${seed}, ${W}x${H})`);
console.log(`Deep time ran 250 million years in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${Life.alive().length} living species, ${Life.speciations} speciations, ${Life.extinctions} extinctions.`);
console.log(`The Dawn: ${sapiens ? sapiens.name : 'people'} — ${People.alive} people in ${Civ.cities.filter((c) => c.alive).length} bands. Sea level ${Math.round(Geo.seaLevel * 2500)} m (an ice age).\n`);

const census = () => {
  const cs = Civ.cities.filter((c) => c.alive), kinds = {}, govs = {}, eras = {};
  for (const c of cs) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; const e = Tech.ERAS[c.era]; eras[e] = (eras[e] || 0) + 1; }
  for (const k of Civ.kingdoms) if (k.alive) govs[Civ.GOVS[k.gov]] = (govs[Civ.GOVS[k.gov]] || 0) + 1;
  const f = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(', ');
  return `${People.alive} people | ${f(kinds)} | polities: ${f(govs)} | ${f(eras)} | ${Lang.list.filter((L) => L.speakers).length} languages | sea ${Math.round(Geo.seaLevel * 2500)} m`;
};
const KEY = new Set(['era', 'settle', 'government', 'language', 'war', 'faith', 'conquest', 'collapse', 'domestication', 'flood', 'law']);
const shown = new Set();
let seenId = History.nextId;
const t1 = Date.now();
for (let y = 0; y < years; y += DY) {
  AG.Sim.yearStep(DY);
  // print the firsts of each kind as they happen (and every era's first arrival)
  for (const e of History.events) {
    if (e.id < seenId) continue;
    if (!KEY.has(e.kind)) continue;
    const tag = e.kind === 'era' ? 'era:' + e.era : e.kind === 'government' ? 'gov:' + e.text.split(':')[0].replace(/^The \w+ of the \S+ /, '') : e.kind;
    if (shown.has(tag) && !(e.kind === 'era' && e.first)) continue;
    if (e.kind === 'era' && !e.first) continue;
    shown.add(tag);
    console.log(`  Y${String(Math.floor(e.year) + 1).padStart(5)}  ${e.text}${e.cause ? `  [because: ${e.cause}]` : ''}`);
  }
  seenId = History.nextId;
  if (Math.floor(Geo.year) % 1000 < DY) console.log(`— Year ${Math.floor(Geo.year) + 1}: ${census()}`);
  if (!People.alive) { console.log('Humanity has died out.'); break; }
}
console.log(`\n${years} years of history in ${((Date.now() - t1) / 1000).toFixed(0)} s.`);
console.log('\nFirst discoveries (who, where, when):');
const firsts = Object.entries(Tech.firsts).filter(([k]) => !k.startsWith('era')).sort((a, b) => a[1].year - b[1].year);
console.log('  ' + firsts.map(([k, v]) => `${Tech.LIST[Tech.IDX[k]].name} ${v.year + 1}`).join(' · '));
console.log('\nThe eras, and the first people to reach each:');
for (const t of Tech.timeline()) if (t.first) console.log(`  ${t.era.padEnd(12)} year ${t.first.year + 1} — ${t.first.name}`);
const ok = Civ.cities.some((c) => c.alive && !c.nomadic) && Tech.firsts.era2;
console.log(`\nEmergence ${ok ? 'happened' : 'did not happen yet'}: ${ok ? 'bands became villages and the Neolithic began, without a script' : 'try more years or another seed'}.`);
