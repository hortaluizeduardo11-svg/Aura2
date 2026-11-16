/* AURA: Genesis 2 — deeds.js
 * Deeds: things a world can live through and a god can bring about, from the first farmers to a
 * colony among the stars, from a cured pandemic to a dragon brought down. Each is marked once,
 * with the year, when it first happens in this world (saved with it); the Deeds panel lists them
 * all, and a toast announces each new one. Some are read from the world every year, some are
 * noted by the systems at the moment they happen. */
'use strict';
(function () {
  const AG = window.AG;
  const year = () => AG.Geo.year;
  const Dd = (AG.Deeds = { got: {}, notes: {}, peak: 0 });
  const cities = () => AG.Civ.cities.filter((c) => c.alive);
  const maxEra = () => cities().reduce((m, c) => Math.max(m, c.era || 0), 0);
  // key, group, name, how to earn it, check (optional: read from the world)
  const LIST = [
    ['dawn', 'Ages', 'The Dawn', 'People walk the earth', () => !!(AG.Life && AG.Life.people)],
    ['farm', 'Ages', 'First farmers', 'A people learns to farm', () => cities().some((c) => AG.Tech.knows(c, 'cultivation'))],
    ['writing', 'Ages', 'Written word', 'A people learns to write', () => cities().some((c) => AG.Tech.knows(c, 'writing'))],
    ['state', 'Ages', 'The first state', 'A realm becomes a state', () => AG.Civ.kingdoms.some((k) => k.alive && k.gov >= 3)],
    ['medieval', 'Ages', 'Castles and cathedrals', 'Reach the Medieval age', () => maxEra() >= 7],
    ['industrial', 'Ages', 'Smoke and steam', 'Reach the Industrial age', () => maxEra() >= 9],
    ['atomic', 'Ages', 'The atom split', 'Reach the Atomic age', () => maxEra() >= 11],
    ['space', 'Ages', 'Beyond the sky', 'Reach the Space Age', () => maxEra() >= 13],
    ['stellar', 'Ages', 'To the stars', 'Reach the Stellar age', () => maxEra() >= 14],
    ['future10', 'Ages', 'Far future', 'Reach future technology 10', () => cities().some((c) => (c.future || 0) >= 10)],
    ['colony', 'Ages', 'Off-world', 'Found a colony beyond the world', null],
    ['starcolony', 'Ages', 'A new star', 'Found a colony around another star', null],
    ['peoples3', 'Peoples', 'Many peoples', 'Three peoples alive at once', () => peoplesAlive() >= 3],
    ['peoples6', 'Peoples', 'A crowded world', 'Six peoples alive at once', () => peoplesAlive() >= 6],
    ['uplift', 'Peoples', 'Minds awaken', 'Uplift apes to a people', () => !!(AG.Races && AG.Races.list.some((r) => r.origin === 'uplift'))],
    ['ethno', 'Peoples', 'A people is born', 'A new people splits off on its own', () => !!(AG.Races && AG.Races.list.some((r) => r.origin === 'folk'))],
    ['pop', 'Peoples', 'Teeming', 'A world of 4,000 people', () => AG.People.alive >= 4000],
    ['empire', 'Realms', 'Empire', 'A realm of ten communities', () => AG.Civ.kingdoms.some((k) => k.alive && k.cities.length >= 10)],
    ['republic', 'Realms', 'Liberty', 'A revolution proclaims a republic', null],
    ['town', 'Realms', 'Founder', 'Found a town', null],
    ['wonder', 'Realms', 'A wonder of the world', 'A great wonder rises', null],
    ['wonders5', 'Realms', 'Seven wonders (almost)', 'Five great wonders stand at once', () => !!(AG.Realms && AG.Realms.standing().length >= 5)],
    ['annex', 'War', 'Spoils of war', 'A peace treaty annexes a city', null],
    ['vassal', 'War', 'Overlord', 'A beaten realm becomes a vassal', null],
    ['bomb', 'War', 'Now I am become death', 'Use the bomb', null],
    ['peace', 'War', 'Pax', 'A hundred years without a war, among many realms', null],
    ['cure', 'Plague', 'The cure', 'A cure ends a plague', null],
    ['pandemic', 'Plague', 'Pandemic', 'A plague of the lab reaches 30 communities', () => !!(AG.Plague && AG.Plague.list.some((p) => p.comms >= 30))],
    ['horde', 'Plague', 'Hold the walls', 'Defenders cut down a hollow horde', null],
    ['nightlord', 'Plague', 'Dawn breaks', 'The lord of the night is slain', null],
    ['dragon', 'Myth', 'Dragonslayer', 'Defenders bring down a dragon', null],
    ['kaiju', 'Myth', 'Monster down', 'Defenders bring down a kaiju', null],
    ['kraken', 'Myth', 'Calm seas', 'Drive off a kraken', null],
    ['dinos', 'Myth', 'Thunder lizards', 'Watch the age of dinosaurs up close', null],
    ['asteroid', 'Myth', 'Extinction event', 'Bring down a great asteroid', null],
    ['legend', 'Myth', 'Here be dragons', 'Raise a creature of legend', null],
    ['starseed', 'Myth', 'Visitors', 'Seed life from another world', null],
    ['dive', 'Myth', 'Twenty fathoms', 'Dive under the sea in the close-up', null],
    ['ashes', 'Myth', 'From the ashes', 'The world loses three quarters of its people, and lives on', null],
  ].map(([key, group, name, desc, check]) => ({ key, group, name, desc, check }));
  Dd.LIST = LIST;
  function peoplesAlive() { if (!AG.Races) return 1; const n = AG.Races.census(); let k = 0; for (const v of n) if (v > 0) k++; return k; }
  Dd.note = function (key) { Dd.notes[key] = true; if (!Dd.got[key]) earn(key); };
  function earn(key) {
    const d = LIST.find((q) => q.key === key);
    if (!d || Dd.got[key]) return;
    Dd.got[key] = Math.floor(year());
    if (AG.UI && AG.UI.toast && !AG.creating) AG.UI.toast(`Deed: ${d.name} (${d.desc})`);
  }
  Dd.yearStep = function () {
    for (const d of LIST) if (!Dd.got[d.key] && d.check) { try { if (d.check()) earn(d.key); } catch (e) { /* a system not present */ } }
    // a century of peace among at least five realms
    const ks = AG.Civ.kingdoms.filter((k) => k.alive);
    if (ks.some((k) => k.atWar)) Dd.lastWar = year();
    if (ks.length >= 5 && Dd.lastWar !== undefined && year() - Dd.lastWar >= 100) earn('peace');
    // a catastrophe survived
    Dd.peak = Math.max(Dd.peak || 0, AG.People.alive);
    if (Dd.peak >= 1000 && AG.People.alive > 0 && AG.People.alive < Dd.peak * 0.25) earn('ashes');
  };
  Dd.count = () => Object.keys(Dd.got).length;
  Dd.state = () => ({ got: Object.assign({}, Dd.got), peak: Dd.peak, lastWar: Dd.lastWar });
  Dd.restore = function (s) { s = s || {}; Dd.got = Object.assign({}, s.got || {}); Dd.peak = s.peak || 0; Dd.lastWar = s.lastWar; Dd.notes = {}; };
  Dd.reset = function () { Dd.got = {}; Dd.notes = {}; Dd.peak = 0; Dd.lastWar = undefined; };
})();
