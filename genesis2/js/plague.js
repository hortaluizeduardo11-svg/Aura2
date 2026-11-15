/* AURA: Genesis 2 — plague.js
 * The plague lab: the god designs a pathogen and sets it loose. A pathogen has a type (bacterium,
 * virus, fungus, parasite, prion, nano-virus, bio-weapon, and the strange ones: an undead blight
 * whose dead rise in hordes, an ape fever that wakes minds in apes, a night plague led by a lord
 * of the night, a mind worm that binds its hosts into a cult, and a rumour that is no sickness at
 * all), and traits bought with DNA points that the outbreak earns as it grows: ways to travel
 * (air, water, livestock, rodents, insects, blood), symptoms (each one more visible and more
 * deadly) and abilities (cold, heat and drug resistance, genetic hardening and reshuffling).
 * It spreads inside communities from person to person and between them along contacts, trade
 * and shores, slowed by cold or heat it cannot stand. Once it is noticed, every realm that
 * knows of it works on a cure, as fast as its medicine and science allow, and the cure ends it.
 * Each pathogen is also an entry in AG.DISEASES, so the old machinery (bodies in view, people's
 * illness and death, immunity) runs it everywhere. */
'use strict';
(function () {
  const AG = window.AG;
  const rnd = () => AG.rnd();
  const year = () => AG.Geo.year;
  const Pl = (AG.Plague = { list: [], hordes: [], lords: [], current: -1, nextId: 1 });

  // ------------------------------------------------------------ types
  const TYPES = {
    bacteria: { name: 'Bacterium', color: '#c0ca33', contagion: 0.1, lethality: 0.02, detect: 1, cure: 1, cold: 0.3, heat: 0.3, drug: 0.2, desc: 'Hardy and steady: it shrugs off some cold, heat and medicine.' },
    virus: { name: 'Virus', color: '#ef5350', contagion: 0.15, lethality: 0.02, detect: 1.2, cure: 1, mutate: 0.18, desc: 'Spreads fast, and mutates new symptoms by itself (sometimes ones you did not want).' },
    fungus: { name: 'Fungus', color: '#a1887f', contagion: 0.08, lethality: 0.02, detect: 1, cure: 1, spores: 0.08, desc: 'Creeps slowly from town to town, but now and then its spores burst out and seed a distant land.' },
    parasite: { name: 'Parasite', color: '#8d6e63', contagion: 0.1, lethality: 0.01, detect: 0.4, cure: 1, desc: 'Barely noticed: the world takes a long time to see it, and longer to fight it.' },
    prion: { name: 'Prion', color: '#7e57c2', contagion: 0.07, lethality: 0.03, detect: 0.8, cure: 0.35, desc: 'A twisted protein of the brain: slow to spread, very hard to cure.' },
    nano: { name: 'Nano-virus', color: '#4fc3f7', contagion: 0.16, lethality: 0.04, detect: 99, cure: 1.6, cold: 0.5, heat: 0.5, desc: 'A machine of molecules: strong and fast, but seen at once, and the world races to switch it off.' },
    bioweapon: { name: 'Bio-weapon', color: '#76ff03', contagion: 0.12, lethality: 0.3, detect: 1.5, cure: 1, grow: 0.08, desc: 'Made to kill: it grows deadlier every year on its own. It may burn out before it spreads.' },
    undead: { name: 'Undead blight', color: '#558b2f', contagion: 0.1, lethality: 0.08, detect: 1.3, cure: 0.8, desc: 'Those it kills rise again as the hollow, and walk in hordes upon the living.' },
    simian: { name: 'Ape fever', color: '#ff8a65', contagion: 0.12, lethality: 0.05, detect: 1, cure: 1, desc: 'It sickens people but wakes the apes: where it touches them they rise to minds and found peoples.' },
    night: { name: 'Night plague', color: '#b71c1c', contagion: 0.06, lethality: 0.06, detect: 1.2, cure: 0.9, desc: 'A lord of the night wakes and walks from town to town, feeding and spreading the plague; hunters may one day slay it.' },
    worm: { name: 'Mind worm', color: '#ec407a', contagion: 0.11, lethality: 0, detect: 0.6, cure: 0.8, desc: 'It does not kill: it binds its hosts into one cult, and whole towns break away to serve it.' },
    rumour: { name: 'Rumour', color: '#ffd54f', contagion: 0.16, lethality: 0, detect: 0.7, cure: 1, info: 1, desc: 'Not a sickness but a lie. It spreads by word, breeds fear and unrest, and the only cure is the truth.' },
  };
  Pl.TYPES = TYPES;
  // key, group, name, DNA cost, effects, prerequisite
  const TRAITS = [
    ['air1', 'trans', 'Air 1', 8, { air: 1, contagion: 0.03 }], ['air2', 'trans', 'Air 2', 14, { air: 1, contagion: 0.04 }, 'air1'], ['air3', 'trans', 'Air 3', 22, { air: 1, contagion: 0.05 }, 'air2'],
    ['water1', 'trans', 'Water 1', 8, { water: 1, contagion: 0.02 }], ['water2', 'trans', 'Water 2', 14, { water: 1, contagion: 0.03 }, 'water1'],
    ['livestock', 'trans', 'Livestock', 9, { herd: 1, contagion: 0.02 }], ['rodent', 'trans', 'Rodents', 10, { rodent: 1, contagion: 0.03 }], ['insect', 'trans', 'Insects', 10, { insect: 1, contagion: 0.03 }], ['blood', 'trans', 'Blood', 7, { contagion: 0.025 }],
    ['cough', 'symp', 'Coughing', 4, { contagion: 0.03, sev: 1 }], ['rash', 'symp', 'Rashes', 4, { contagion: 0.02, sev: 1 }], ['insomnia', 'symp', 'Insomnia', 5, { sev: 2, unrest: 0.05 }],
    ['fever', 'symp', 'Fever', 8, { lethality: 0.12, sev: 3 }, 'cough'], ['paranoia', 'symp', 'Paranoia', 9, { sev: 3, unrest: 0.15 }, 'insomnia'], ['sterility', 'symp', 'Sterility', 10, { sev: 3, sterile: 1 }, 'rash'],
    ['hemorrhage', 'symp', 'Haemorrhage', 15, { lethality: 0.45, contagion: 0.03, sev: 6 }, 'fever'], ['necrosis', 'symp', 'Necrosis', 15, { lethality: 0.5, sev: 6 }, 'rash'], ['coma', 'symp', 'Coma', 13, { lethality: 0.4, sev: 7 }, 'insomnia'],
    ['insanity', 'symp', 'Insanity', 14, { sev: 6, unrest: 0.3, madness: 1 }, 'paranoia'], ['organfail', 'symp', 'Organ failure', 22, { lethality: 1.1, sev: 10 }, 'hemorrhage'], ['totalfail', 'symp', 'Total organ failure', 32, { lethality: 3, sev: 16 }, 'organfail'],
    ['coldres', 'abil', 'Cold resistance', 10, { cold: 1 }], ['heatres', 'abil', 'Heat resistance', 10, { heat: 1 }], ['drugres', 'abil', 'Drug resistance', 14, { drug: 1 }],
    ['hardening', 'abil', 'Genetic hardening', 18, { harden: 1 }, 'drugres'], ['reshuffle', 'abil', 'Genetic reshuffle', 20, { reshuffle: 1 }, 'hardening'],
  ];
  const TR = {}; TRAITS.forEach(([key, group, name, cost, fx, pre]) => (TR[key] = { key, group, name, cost, fx, pre }));
  Pl.TRAITS = TR; Pl.TRAIT_LIST = TRAITS.map((t) => TR[t[0]]);
  // a rumour's 'symptoms' are fears and passions
  const RUMOUR = { cough: 'Whispers', rash: 'Slogans', insomnia: 'Sleepless fear', fever: 'Outrage', paranoia: 'Paranoia', sterility: 'Despair', hemorrhage: 'Riots', necrosis: 'Witch hunts', coma: 'Apathy', insanity: 'Fanaticism', organfail: 'Pogroms', totalfail: 'Civil strife',
    air1: 'Market gossip', air2: 'Pamphlets', air3: 'Broadcasts', water1: 'Sailors\' tales', water2: 'Port taverns', livestock: 'Drovers', rodent: 'Beggars', insect: 'Pilgrims', blood: 'Kinship', coldres: 'Hearth tales', heatres: 'Desert tales', drugres: 'Distrust', hardening: 'Dogma', reshuffle: 'New versions' };
  Pl.traitName = (p, key) => (p && p.type === 'rumour' && RUMOUR[key]) || TR[key].name;

  // ------------------------------------------------------------ pathogens
  const sum = (p, k) => p.traits.reduce((s, t) => s + (TR[t].fx[k] || 0), 0);
  const has = (p, k) => p.traits.some((t) => TR[t].fx[k]);
  Pl.get = (id) => Pl.list.find((p) => p.id === id) || null;
  Pl.of = (d) => Pl.list.find((p) => p.d === d && !p.done) || null; // d: index in AG.DISEASES
  Pl.severity = (p) => sum(p, 'sev');
  // write the pathogen's numbers into its disease entry
  function sync(p) {
    const T = TYPES[p.type], D = AG.DISEASES[p.d];
    if (!D) return;
    const info = T.info ? 0.12 : 1;
    D.name = p.name; D.color = T.color;
    D.contagion = p.done ? 0 : Math.min(0.6, T.contagion + sum(p, 'contagion'));
    D.radius = 1.5 + sum(p, 'air') * 0.4;
    D.lethality = (T.lethality + sum(p, 'lethality') + (p.grown || 0)) * info;
    D.sterile = has(p, 'sterile') ? 1 : 0; D.madness = has(p, 'madness') && !T.info ? 1 : 0; D.hollow = p.type === 'undead' ? 1 : 0;
    // an illness lasts weeks to months (longer the worse its symptoms), then the living recover
    // and are immune; prions, the blight and the worm never let go
    D.incubation = 1; D.duration = p.type === 'prion' || p.type === 'undead' || p.type === 'worm' ? 1e6 : 16 + Pl.severity(p) * 2.5 + (has(p, 'drug') ? 8 : 0); D.slow = Math.min(0.5, Pl.severity(p) * 0.02); D.targets = p.type === 'simian' ? 3 : 1; D.lab = p.id;
  }
  Pl.sync = sync;
  // a free slot in the disease list (re-using one nobody carries, and wiping its immunity)
  function slot() {
    if (AG.DISEASES.length < AG.MAX_DISEASES) return AG.DISEASES.length;
    const sick = new Int32Array(AG.DISEASES.length);
    for (const P of AG.People.map.values()) if (P.died === null && P.dis) sick[P.dis - 1]++;
    for (let d = AG.DISEASES.length - 1; d >= 0; d--) {
      const D = AG.DISEASES[d];
      if (D.builtin || sick[d] || (D.lab && Pl.of(d))) continue;
      const bit = ~(1 << d);
      for (const P of AG.People.map.values()) P.imm &= bit;
      const U = AG.U; for (let i = 0; i < U.hi; i++) { U.imm[i] &= bit; if (U.dis[i] === d + 1) U.dis[i] = 0; }
      const old = Pl.list.find((p) => p.d === d); if (old) old.done = true;
      return d;
    }
    return -1;
  }
  Pl.create = function (type, name) {
    if (!TYPES[type]) type = 'bacteria';
    const d = slot();
    if (d < 0) return null;
    const p = { id: Pl.nextId++, d, type, name: name || (type === 'rumour' ? AG.Names.disease().replace(/(Fever|Cough|Sickness|Pox|Plague|Rot|Flux|Blight|Ague)$/i, 'Rumour') : AG.Names.disease()), traits: [], dna: 12, cure: 0, detected: false, born: Math.floor(year()), infected: 0, peak: 0, dead: 0, comms: 0, done: false, cured: false, grown: 0, uplifts: 0, cult: -1, zero: -1, log: [] };
    AG.DISEASES[d] = { name: p.name, color: TYPES[type].color, contagion: 0, radius: 1.5, lethality: 0, incubation: 1, duration: 1e6, slow: 0, sterile: 0, madness: 0, hollow: 0, targets: 1, lab: p.id };
    Pl.list.push(p); sync(p);
    Pl.current = p.id;
    return p;
  };
  Pl.canBuy = function (p, key) {
    const t = TR[key];
    if (!p || !t || p.traits.includes(key) || p.done) return false;
    if (t.pre && !p.traits.includes(t.pre)) return false;
    return Pl.unlimited || p.dna >= Pl.cost(p, key);
  };
  Pl.cost = (p, key) => TR[key].cost + Math.floor(p.traits.length * 0.6); // (each trait makes the next a little dearer)
  Pl.buy = function (p, key) {
    if (!Pl.canBuy(p, key)) return false;
    if (!Pl.unlimited) p.dna -= Pl.cost(p, key);
    p.traits.push(key);
    if (key === 'reshuffle') p.cure *= 0.55;
    sync(p);
    return true;
  };
  Pl.sell = function (p, key) { // devolve: a little DNA back
    const k = p.traits.indexOf(key);
    if (k < 0 || p.traits.some((t) => TR[t].pre === key)) return false;
    p.traits.splice(k, 1); p.dna += Math.floor(TR[key].cost * 0.4); sync(p); return true;
  };

  // ------------------------------------------------------------ infection
  const L = () => AG.Life.L;
  function infect(P, p) {
    const d = p.d;
    if (P.died !== null || P.dis || (P.imm & (1 << d))) return false;
    P.dis = d + 1; P.dtm = 0;
    if (P.body >= 0 && AG.U.alive[P.body]) { AG.U.dis[P.body] = d + 1; AG.U.dtm[P.body] = 0; }
    return true;
  }
  // patient zero: a few people of the community nearest (x, y)
  Pl.release = function (p, x, y) {
    const Civ = AG.Civ, c = Civ.cityAt(x, y) || Civ.nearestCity(x, y, -1, 40);
    if (!p || !c) return null;
    let n = 0;
    for (const P of Civ.persons(c)) if (n < 3 && rnd() < 0.5 && infect(P, p)) n++;
    if (!n) for (const P of Civ.persons(c)) if (n < 2 && infect(P, p)) n++;
    p.zero = c.id;
    if (p.type === 'night' && !Pl.lords.some((l) => l.p === p.id)) Pl.lords.push({ p: p.id, x: c.x, y: c.y, at: c.id, hp: 100, fed: 0, thralls: 0, alive: true, name: AG.Lang.personName(c.lang, 1) });
    if (p.type === 'nano') p.detected = true;
    p.log.push({ year: Math.floor(year()), text: `Patient zero in ${c.name}` });
    return c;
  };
  function climateMul(p, c) {
    const t = AG.World.tbase[AG.clamp(c.y | 0, 0, AG.H - 1) * AG.W + AG.clamp(c.x | 0, 0, AG.W - 1)], T = TYPES[p.type];
    let m = 1;
    if (t < 0.3) m *= Math.min(1, 0.4 + (has(p, 'cold') ? 0.6 : 0) + (T.cold || 0));
    if (t > 0.68) m *= Math.min(1, 0.5 + (has(p, 'heat') ? 0.5 : 0) + (T.heat || 0));
    if (has(p, 'insect') && t > 0.6) m *= 1.4;
    return m;
  }
  function spreadMul(p, c) {
    let m = 1 + sum(p, 'air') * 0.25;
    if ((c.river || c.coastal) && has(p, 'water')) m *= 1 + sum(p, 'water') * 0.3;
    if (c.herd > 10 && has(p, 'herd')) m *= 1.4;
    if (c.sedentary && c.members.length > 60 && has(p, 'rodent')) m *= 1.5;
    if (TYPES[p.type].info) m *= 1 + (AG.Tech.knows(c, 'printing') ? 0.5 : 0) + (AG.Tech.knows(c, 'radio') ? 0.5 : 0) + (AG.Tech.knows(c, 'internet') ? 1 : 0); // (news travels faster with presses, radio and the net)
    return m;
  }
  // how fast a community works on the cure (its medicine and science)
  function research(c, p) {
    const k = (t) => AG.Tech.knows(c, t);
    if (TYPES[p.type].info) return (k('writing') ? 0.3 : 0.1) * (k('printing') ? 2 : 1) * (k('universities') ? 1.5 : 1) * (k('scientific') ? 1.5 : 1) * (k('internet') ? 2 : 1);
    return (k('herbal') ? 0.15 : 0.05) * (k('medicine') ? 2.5 : 1) * (k('scientific') ? 2 : 1) * (k('vaccines') ? 2 : 1) * (k('antibiotics') ? 1.5 : 1) * (k('computers') ? 1.4 : 1) * (k('genetics') ? 2 : 1) * (k('ai') ? 1.5 : 1) * (k('nanotech') ? 1.3 : 1);
  }

  // ------------------------------------------------------------ the year of a plague
  Pl.yearStep = function (dy) {
    for (const p of Pl.list) if (!p.done) stepOne(p, dy);
    hordesStep(dy); lordsStep(dy);
  };
  function stepOne(p, dy) {
    const Civ = AG.Civ, d = p.d, D = AG.DISEASES[d], T = TYPES[p.type];
    if (!D || D.lab !== p.id) { p.done = true; return; }
    if (T.grow) { p.grown += T.grow * dy; sync(p); }
    if (T.mutate && rnd() < T.mutate * dy) { // a virus mutates a symptom by itself
      const free = Pl.TRAIT_LIST.filter((t) => t.group === 'symp' && !p.traits.includes(t.key) && (!t.pre || p.traits.includes(t.pre)) && t.cost <= 16);
      if (free.length) { const t = free[(rnd() * free.length) | 0]; p.traits.push(t.key); sync(p); p.log.push({ year: Math.floor(year()), text: `Mutated: ${t.name}` }); }
    }
    const beta = (1.5 + D.contagion * 22), inf = new Map();
    let total = 0, comms = 0, newInf = 0, aware = new Set();
    // inside each community
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const ps = Civ.persons(c);
      let I = 0; for (const P of ps) if (P.dis === d + 1) I++;
      if (!I) continue;
      // generation by generation (an illness of weeks passes through many hosts in a year): the
      // sick infect others, then recover (and are immune) at the rate their illness lasts
      const N = ps.length, gens = Math.min(12, Math.max(1, Math.ceil(dy * 40 / Math.max(1, D.duration)))), dt = dy / gens, k0 = beta * spreadMul(p, c) * climateMul(p, c) * dt / Math.max(1, N);
      const heal = 1 - Math.exp(-dt * 40 / Math.max(1, D.duration));
      for (let gq = 0; gq < gens && I > 0; gq++) {
        const pr = 1 - Math.exp(-k0 * I);
        let fresh = 0;
        for (const P of ps) if (!P.dis && !(P.imm & (1 << d)) && rnd() < pr * (1.25 - AG.People.ph(P, L().IMMUNE) / 255 * 0.5)) { if (infect(P, p)) { fresh++; newInf++; P._new = 1; } }
        if (heal > 1e-4) for (const P of ps) if (P.dis === d + 1 && !P._new && rnd() < heal) { P.dis = 0; P.imm |= 1 << d; I--; if (P.body >= 0 && AG.U.alive[P.body]) { AG.U.dis[P.body] = 0; AG.U.imm[P.body] |= 1 << d; } }
        if (fresh) for (const P of ps) P._new = 0;
        I += fresh;
      }
      if (I <= 0) continue;
      inf.set(c.id, I / Math.max(1, N)); total += I; comms++;
      aware.add(c.kd);
    }
    // between communities: along contacts and trade, by sea for waterborne ones, spores for fungi
    for (const [cid, share] of inf) {
      const c = Civ.cities[cid];
      for (const [oid, st] of c.contacts) {
        if (inf.has(oid)) continue;
        const o = Civ.cities[oid]; if (!o || !o.alive) continue;
        const pr = 1 - Math.exp(-dy * Math.min(2, st) * share * D.contagion * 6 * spreadMul(p, o) * climateMul(p, o) * (Civ.kingdoms[c.kd] && Civ.kingdoms[c.kd].war[o.kd] ? 1.5 : 1));
        if (rnd() < pr) seed(p, o);
      }
      for (const o of Civ.cities) { // neighbours meet at hunting grounds, wells and markets
        if (!o.alive || o === c || inf.has(o.id)) continue;
        const dd = AG.dist2(o.x, o.y, c.x, c.y);
        if (dd > 32 * 32) continue;
        if (rnd() < 1 - Math.exp(-dy * share * D.contagion * 2.5 * (1 - Math.sqrt(dd) / 32) * spreadMul(p, o) * climateMul(p, o))) seed(p, o);
      }
      if (c.coastal && has(p, 'water') && rnd() < dy * share * 0.15) { const o = farCity(c, 160, (q) => q.coastal); if (o) seed(p, o); }
      if (T.spores && rnd() < dy * T.spores * share) { const o = farCity(c, 140); if (o) { seed(p, o); p.log.push({ year: Math.floor(year()), text: `Spores reach ${o.name}` }); } }
    }
    p.infected = total; p.peak = Math.max(p.peak, total);
    const newComms = Math.max(0, comms - p.comms); p.comms = comms;
    // DNA from the outbreak's growth
    p.dnaAcc = (p.dnaAcc || 0) + newComms * 2 + newInf / 12;
    const gain = Math.floor(p.dnaAcc); p.dna += gain; p.dnaAcc -= gain;
    // noticed: by its deaths, its symptoms, or at once (nano-virus)
    if (!p.detected && (p.dead > 12 / T.detect || Pl.severity(p) * T.detect >= 9 || total > Math.max(30, AG.People.alive * 0.04) / T.detect)) {
      p.detected = true;
      const c0 = Civ.cities[[...inf.keys()][0]];
      AG.History.event('plague', T.info ? `A dangerous rumour, ${p.name}, is spreading${c0 ? ' from ' + c0.name : ''}` : `A new ${T.name.toLowerCase()}, ${p.name}, is recognised${c0 ? ' in ' + c0.name : ''}`, { x: c0 ? c0.x : -1, y: c0 ? c0.y : -1, comm: c0 ? c0.id : -1, cause: 'the plague lab' });
    }
    // the cure: every realm that knows of it works on it
    if (p.detected && !p.cured) {
      let r = 0;
      for (const c of Civ.cities) if (c.alive && aware.has(c.kd)) r += research(c, p) * Math.sqrt(c.members.length);
      const slow = (has(p, 'drug') ? 0.6 : 1) * (has(p, 'harden') ? 0.5 : 1) * (T.drug ? 1 - T.drug * 0.3 : 1);
      p.cure = Math.min(1, p.cure + dy * r * T.cure * slow / (900 * (1 + Pl.severity(p) / 25)));
      if (p.cure >= 1) cure(p);
    }
    if (!total && p.infected === 0 && p.everInfected && !p.cured) { p.done = true; p.burnt = Math.floor(year()); AG.History.event('plague', `${p.name} dies out`, { cause: 'the plague lab' }); }
    if (total) p.everInfected = true;
    // unrest, cults, uprisings
    const unrest = sum(p, 'unrest') + (T.info ? 0.15 : 0);
    if (unrest > 0 || p.type === 'worm') for (const [cid, share] of inf) {
      const c = Civ.cities[cid], k = Civ.kingdoms[c.kd];
      if (!k) continue;
      k.stability = Math.max(0, k.stability - unrest * share * dy * 0.12);
      c.loyalty = Math.max(0, (c.loyalty === undefined ? 1 : c.loyalty) - unrest * share * dy * 0.2);
      if (unrest > 0.2 && share > 0.5 && k.cities.length > 1 && rnd() < dy * unrest * 0.05) AG.War.secede(c, T.info ? 'stirred up by ' + p.name : 'in the madness of ' + p.name);
      if (T.info && share > 0.4 && rnd() < dy * 0.04) { // the rumour turns realms against their neighbours
        for (const o of Civ.kingdoms) if (o.alive && o !== k && Civ.capitalOf(o) && AG.dist2(Civ.capitalOf(o).x, Civ.capitalOf(o).y, c.x, c.y) < 120 * 120) { k.mods[o.id] -= 15; o.mods[k.id] -= 8; }
      }
      if (p.type === 'worm' && share > 0.6) wormTakes(p, c);
    }
    // the ape fever wakes the apes near its hosts
    if (p.type === 'simian' && p.detected && p.uplifts < 3 && AG.Races && rnd() < dy * 0.03 * Math.min(4, comms)) {
      const cids = [...inf.keys()], c = Civ.cities[cids[(rnd() * cids.length) | 0]];
      const k = AG.Races.uplift(c.x + (rnd() - 0.5) * 30, c.y + (rnd() - 0.5) * 30);
      if (k) { p.uplifts++; AG.History.event('plague', `Apes touched by ${p.name} awaken to minds near ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: p.name }); }
    }
  }
  function farCity(c, r, ok) {
    const Civ = AG.Civ, list = [];
    for (const o of Civ.cities) if (o.alive && o !== c && (!ok || ok(o)) && AG.dist2(o.x, o.y, c.x, c.y) < r * r) list.push(o);
    return list.length ? list[(rnd() * list.length) | 0] : null;
  }
  function seed(p, o) {
    let n = 0;
    for (const P of AG.Civ.persons(o)) if (n < 2 && rnd() < 0.3 && infect(P, p)) n++;
    return n;
  }
  function cure(p) {
    const d = p.d, T = TYPES[p.type];
    p.cured = true; p.done = true; p.curedYear = Math.floor(year());
    if (AG.Deeds) AG.Deeds.note('cure');
    let healed = 0;
    for (const P of AG.People.map.values()) { if (P.died !== null) continue; if (P.dis === d + 1) { P.dis = 0; healed++; } P.imm |= 1 << d; if (P.body >= 0 && AG.U.alive[P.body]) { AG.U.dis[P.body] = 0; AG.U.imm[P.body] |= 1 << d; } }
    sync(p);
    for (const l of Pl.lords) if (l.p === p.id && l.alive) { l.alive = false; if (AG.Deeds) AG.Deeds.note('nightlord'); AG.History.event('plague', `Hunters armed with the cure slay ${l.name}, lord of the night`, { x: l.x, y: l.y, cause: p.name }); }
    AG.History.event('plague', T.info ? `The truth catches up with ${p.name}: the rumour fades (${healed} freed of it)` : `A cure for ${p.name} is found and shared (${healed} healed)`, { cause: 'medicine' });
  }
  Pl.cure = cure;
  Pl.onDeath = function (P, cause) { // (people.js calls this for every death)
    if (!P.dis) return;
    const p = Pl.of(P.dis - 1);
    if (!p || (cause !== p.name && cause !== 'the lord of the night')) return; // (only deaths it caused)
    p.dead++;
    p.dnaAcc = (p.dnaAcc || 0) + 1 / 20;
    if (p.type === 'undead' && P.comm >= 0) { const c = AG.Civ.cities[P.comm]; if (c) c.risen = (c.risen || 0) + 1; }
  };

  // ------------------------------------------------------------ the mind worm's cult
  function wormTakes(p, c) {
    const Civ = AG.Civ, k = Civ.kingdoms[c.kd];
    let hive = p.cult >= 0 ? Civ.kingdoms[p.cult] : null;
    if (hive && !hive.alive) hive = null;
    if (!hive) {
      if (k.cities.length < 2) { p.cult = k.id; k.hive = p.id; AG.History.event('plague', `${c.name} and all the ${k.name} are bound into the cult of ${p.name}`, { x: c.x, y: c.y, comm: c.id, cause: p.name }); return; }
      const nk = AG.War.secede(c, 'bound into the cult of ' + p.name);
      if (nk) { p.cult = nk.id; nk.hive = p.id; nk.name = 'Hive of ' + p.name; }
      return;
    }
    if (c.kd === hive.id) return;
    AG.War.transferCity(c, hive);
    AG.History.event('plague', `${c.name} joins the Hive of ${p.name}`, { x: c.x, y: c.y, comm: c.id, polity: hive.id, cause: p.name });
  }

  // ------------------------------------------------------------ hordes of the hollow
  // The undead blight's dead rise; when enough have risen in a community a horde walks out and
  // falls on the nearest living town. Soldiers (and the arms of their age) cut it down; those it
  // kills join it.
  function hordesStep(dy) {
    const Civ = AG.Civ;
    for (const c of Civ.cities) {
      if (!c.risen || c.risen < 4) continue;
      const p = Pl.list.find((q) => q.type === 'undead' && !q.done);
      Pl.hordes.push({ x: c.x, y: c.y, n: c.risen, p: p ? p.id : 0, tx: c.x, ty: c.y, born: Math.floor(year()), from: c.name, alive: true });
      AG.History.event('plague', `The dead of ${c.name} rise: a horde of ${c.risen} hollow walks out`, { x: c.x, y: c.y, comm: c.id, cause: p ? p.name : 'the blight' });
      c.risen = 0;
    }
    for (const h of Pl.hordes) {
      if (!h.alive) continue;
      let tgt = null, bd = 1e18;
      for (const c of Civ.cities) { if (!c.alive || c.members.length < 3) continue; const dd = AG.dist2(c.x, c.y, h.x, h.y); if (dd < bd) { bd = dd; tgt = c; } }
      if (!tgt || bd > 140 * 140) { h.n *= Math.pow(0.7, dy); if (h.n < 2) h.alive = false; continue; }
      const dd = Math.sqrt(bd), step = Math.min(dd, 40 * dy);
      h.x += (tgt.x - h.x) / Math.max(1, dd) * step; h.y += (tgt.y - h.y) / Math.max(1, dd) * step;
      if (dd > 6) continue;
      // battle at the walls
      const ps = Civ.persons(tgt), sold = ps.filter((P) => P.job === AG.J.SOLDIER).length, arms = AG.Warfare ? AG.Warfare.arms(tgt) : 1;
      const defence = (sold * 1.5 + ps.length * 0.25) * arms * (tgt.walled ? 2 : 1);
      const killed = Math.min(ps.length, Math.round(h.n * 0.35 * dy * 4 / (1 + defence / Math.max(1, h.n))));
      h.n -= defence * 0.5;
      const p = Pl.get(h.p);
      for (let q = 0; q < killed; q++) { const P = ps[(rnd() * ps.length) | 0]; if (P && P.died === null) { if (p && rnd() < 0.3) infect(P, p); else { AG.People.die(P, 'the hollow horde'); h.n += 0.6; } } }
      if (killed > 2) AG.History.event('plague', `A hollow horde falls on ${tgt.name}${killed ? `; ${killed} are lost` : ''}`, { x: tgt.x, y: tgt.y, comm: tgt.id, cause: 'the blight' });
      if (h.n < 2) { h.alive = false; if (AG.Deeds) AG.Deeds.note('horde'); AG.History.event('plague', `The defenders of ${tgt.name} cut down the last of a hollow horde`, { x: tgt.x, y: tgt.y, comm: tgt.id, cause: 'war' }); }
    }
    Pl.hordes = Pl.hordes.filter((h) => h.alive);
  }

  // ------------------------------------------------------------ the lord of the night
  // Walks by night from town to town, feeding on the people and leaving the plague behind;
  // grows stronger as it feeds. Hunters (soldiers of towns that know the plague) may wound it;
  // the cure ends it.
  function lordsStep(dy) {
    const Civ = AG.Civ;
    for (const l of Pl.lords) {
      if (!l.alive) continue;
      const p = Pl.get(l.p);
      if (!p || p.done) { l.alive = false; continue; }
      l.wait = (l.wait || 0) - dy;
      if (l.wait <= 0) { // move on to another town nearby
        const here = Civ.cities[l.at], o = here ? farCity(here, 60) : null;
        if (o) { l.at = o.id; l.tx = o.x; l.ty = o.y; }
        l.wait = 1 + rnd() * 2;
      }
      const c = Civ.cities[l.at];
      if (!c || !c.alive) { l.wait = 0; continue; }
      l.x += ((l.tx === undefined ? c.x : l.tx) - l.x) * Math.min(1, dy * 2); l.y += ((l.ty === undefined ? c.y : l.ty) - l.y) * Math.min(1, dy * 2);
      const ps = Civ.persons(c);
      const feed = Math.min(ps.length, Math.ceil(dy * (1 + l.fed / 40)));
      for (let q = 0; q < feed; q++) { const P = ps[(rnd() * ps.length) | 0]; if (P && P.died === null) { if (rnd() < 0.5) { AG.People.die(P, 'the lord of the night'); l.fed++; } else if (infect(P, p)) l.thralls++; } }
      if (p.detected) { // hunters
        const sold = ps.filter((P) => P.job === AG.J.SOLDIER).length, arms = AG.Warfare ? AG.Warfare.arms(c) : 1;
        if (rnd() < dy * 0.15 * Math.min(1, sold / 10)) {
          l.hp -= 8 * arms;
          if (l.hp <= 0) { l.alive = false; if (AG.Deeds) AG.Deeds.note('nightlord'); AG.History.event('plague', `Hunters of ${c.name} slay ${l.name}, lord of the night`, { x: c.x, y: c.y, comm: c.id, cause: 'war' }); }
          else if (rnd() < 0.3) AG.History.event('plague', `Hunters of ${c.name} wound ${l.name}, lord of the night, who flees`, { x: c.x, y: c.y, comm: c.id, cause: 'war' });
        }
      }
      l.hp = Math.min(100 + l.fed, l.hp + dy * 3);
    }
    Pl.lords = Pl.lords.filter((l) => l.alive);
  }

  // ------------------------------------------------------------ state
  Pl.state = () => ({ list: Pl.list, hordes: Pl.hordes, lords: Pl.lords, current: Pl.current, nextId: Pl.nextId, unlimited: !!Pl.unlimited });
  Pl.restore = function (s) {
    if (!s) { Pl.reset(); return; }
    const c = JSON.parse(JSON.stringify(s));
    Pl.list = c.list; Pl.hordes = c.hordes; Pl.lords = c.lords; Pl.current = c.current; Pl.nextId = c.nextId; Pl.unlimited = c.unlimited;
  };
  Pl.reset = function () { Pl.list = []; Pl.hordes = []; Pl.lords = []; Pl.current = -1; Pl.nextId = 1; };
  Pl.cur = () => Pl.get(Pl.current);
})();
