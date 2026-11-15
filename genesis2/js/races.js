/* AURA: Genesis 2 — races.js
 * The peoples of the world. Humans rise from the primates at the Dawn; the god can set down other
 * peoples, each built on a familiar archetype of myth and science fiction but its own: forest folk,
 * mountain folk, tusked warrior folk, reptilian folk, an insect hive, sea folk, crystalline beings
 * and grey visitors from the stars. Apes can be uplifted into a people of their own, and a people
 * cut off from its kin for thousands of years becomes a new folk, drifting in body and nature.
 * Each people carries traits the simulation reads (lifespan, fertility, prowess in war, wit for
 * invention, stability, distrust of strangers, what feeds it best), a look (skin, height, the
 * features of the head, a glow) and a way of building towns. */
'use strict';
(function () {
  const AG = window.AG;
  const rnd = () => AG.rnd();
  // traits: life (lifespan), fert, war, wit (invention), stab (stability), xeno (distrust of
  // other peoples), food (per food job), temp (the land it seeks); look: skin palette from light to
  // dark (null: human skin from the genes), hair, tall (height), feature, glow; style: town style
  const BASE = [
    { key: 'human', name: 'Humans', adj: 'Human', desc: 'Adaptable, curious and quarrelsome; the people of the Dawn.',
      life: 1, fert: 1, war: 1, wit: 1, stab: 0, xeno: 0.3, food: {}, temp: 'any', look: { skin: null, hair: null, tall: 1, feature: null, glow: null }, style: null },
    { key: 'sylvan', name: 'Sylvans', adj: 'Sylvan', desc: 'Long-lived forest folk with pointed ears; slow to breed, quick of mind, at home among great trees.',
      life: 2.2, fert: 0.8, war: 0.85, wit: 1.15, stab: 0.05, xeno: 0.5, food: { gather: 1.4, hunt: 1.2, farm: 0.85 }, temp: 'forest', look: { skin: [[246, 232, 210], [214, 196, 160], [168, 150, 120]], hair: [226, 214, 170], tall: 1.1, feature: 'ears', featC: null, glow: null }, style: 'sylvan' },
    { key: 'stonekin', name: 'Stonekin', adj: 'Stonekin', desc: 'Short, broad, bearded mountain folk: miners, smiths and builders of halls under the hills.',
      life: 1.7, fert: 0.95, war: 1.2, wit: 1.05, stab: 0.08, xeno: 0.5, food: { farm: 0.9, herd: 1.15, hunt: 1.1 }, temp: 'mountain', look: { skin: [[236, 200, 170], [196, 150, 112], [130, 92, 64]], hair: [140, 70, 40], tall: 0.78, feature: 'beard', featC: null, glow: null }, style: 'stonekin' },
    { key: 'ashborn', name: 'Ashborn', adj: 'Ashborn', desc: 'Big, tusked, grey-green warrior folk: many children, short tempers, terrible in battle.',
      life: 0.85, fert: 1.35, war: 1.45, wit: 0.85, stab: -0.05, xeno: 0.6, food: { hunt: 1.35, gather: 0.9 }, temp: 'any', look: { skin: [[150, 170, 120], [110, 132, 92], [76, 92, 68]], hair: [30, 28, 26], tall: 1.14, feature: 'tusks', featC: [238, 228, 200], glow: null }, style: 'ashborn' },
    { key: 'saurian', name: 'Saurians', adj: 'Saurian', desc: 'Scaled, crested reptilian folk of hot lands; patient, long-lived and cold-blooded.',
      life: 1.3, fert: 1.1, war: 1.15, wit: 1, stab: 0.05, xeno: 0.6, food: { fish: 1.2, hunt: 1.2 }, temp: 'hot', look: { skin: [[120, 186, 120], [70, 140, 96], [44, 96, 84]], hair: [200, 90, 50], tall: 1.04, feature: 'crest', featC: [214, 96, 52], glow: null }, style: 'saurian' },
    { key: 'hivekin', name: 'Hivekin', adj: 'Hive', desc: 'Insectoid folk of one mind: they breed fast, die young, never rebel and build mound cities.',
      life: 0.55, fert: 2, war: 1.1, wit: 0.9, stab: 0.25, xeno: 0.8, food: { farm: 1.25, gather: 1.2 }, temp: 'any', look: { skin: [[196, 150, 60], [140, 84, 34], [46, 34, 30]], hair: [30, 26, 24], tall: 0.95, feature: 'antennae', featC: [40, 34, 30], glow: null }, style: 'hive' },
    { key: 'tidefolk', name: 'Tidefolk', adj: 'Tide', desc: 'Finned, blue-skinned sea folk: fishers and sailors, at home on every coast.',
      life: 1.1, fert: 1, war: 0.9, wit: 1, stab: 0.05, xeno: 0.4, food: { fish: 2, farm: 0.8 }, temp: 'coast', look: { skin: [[150, 210, 222], [90, 160, 190], [50, 104, 150]], hair: [40, 70, 90], tall: 1, feature: 'fins', featC: [80, 190, 200], glow: null }, style: 'tide' },
    { key: 'lithari', name: 'Lithari', adj: 'Lithari', desc: 'Crystalline beings of living stone: they live for centuries, breed rarely and think deeply.',
      life: 3.2, fert: 0.6, war: 1.2, wit: 1.4, stab: 0.15, xeno: 0.5, food: { gather: 0.9, farm: 0.9, hunt: 0.8 }, temp: 'any', look: { skin: [[214, 190, 250], [160, 130, 230], [100, 80, 190]], hair: [190, 240, 255], tall: 1.06, feature: 'shards', featC: [170, 240, 255], glow: [150, 230, 255] }, style: 'crystal' },
    { key: 'voidborn', name: 'Voidborn', adj: 'Void', desc: 'Grey visitors from the stars with great dark eyes; they arrive knowing the secrets of steam and science.',
      life: 2, fert: 0.95, war: 1.3, wit: 1.6, stab: 0.1, xeno: 0.7, food: { farm: 1.1 }, temp: 'any', look: { skin: [[206, 210, 214], [170, 176, 182], [130, 136, 144]], hair: null, tall: 0.86, feature: 'bighead', featC: [16, 16, 20], glow: [120, 255, 200] }, style: 'void', startEra: 9 },
    { key: 'simian', name: 'Simians', adj: 'Simian', desc: 'Apes raised to minds by a god or a plague: strong, social and fast learners.',
      life: 0.9, fert: 1.1, war: 1.2, wit: 0.8, stab: 0, xeno: 0.6, food: { gather: 1.3, hunt: 1.1 }, temp: 'forest', look: { skin: [[150, 120, 96], [110, 84, 64], [64, 48, 38]], hair: [70, 52, 40], tall: 0.96, feature: 'fur', featC: [90, 66, 48], glow: null }, style: null, uplift: true },
  ];
  BASE.forEach((r, i) => { r.id = i; r.base = true; });
  const Races = (AG.Races = { BASE, list: BASE.slice(), MAX: 32, folkChecks: 0 });
  Races.KEYS = BASE.map((r) => r.key);
  Races.get = (id) => Races.list[id] || BASE[0];
  Races.byKey = (k) => BASE.find((r) => r.key === k) || null;
  Races.of = (c) => Races.get(c ? c.race || 0 : 0);
  Races.ofPerson = (P) => Races.get(P ? P.race || 0 : 0);
  const JOBKEY = () => { const J = AG.J; return { [J.GATHER]: 'gather', [J.HUNT]: 'hunt', [J.FISH]: 'fish', [J.FARM]: 'farm', [J.HERD]: 'herd' }; };
  let jk = null;
  Races.foodMul = (c, job) => { const R = Races.of(c); if (!R.food) return 1; jk = jk || JOBKEY(); const k = jk[job]; return (k && R.food[k]) || 1; };
  // the skin colour of a person of race R with pigment p (0..255): the race's own palette, or null
  Races.skin = function (R, p) {
    const pal = R.look && R.look.skin;
    if (!pal) return null;
    const t = Math.max(0, Math.min(1, p / 255)) * (pal.length - 1), i = Math.min(pal.length - 2, Math.floor(t)), f = t - i;
    return [0, 1, 2].map((k) => Math.round(pal[i][k] + (pal[i + 1][k] - pal[i][k]) * f));
  };

  // ------------------------------------------------------------ setting down a people
  function stamp(c, k, rid) {
    c.race = rid; k.race = rid;
    for (const id of c.members) { const P = AG.People.get(id); if (P) P.race = rid; }
  }
  Races.stamp = stamp;
  // A band of race rid at (x, y). Returns the community, or null (water, ice, or before the Dawn).
  Races.seed = function (rid, x, y) {
    const Civ = AG.Civ, Wd = AG.World, Life = AG.Life, W = AG.W, H = AG.H;
    if (AG.Geo.phase !== 'history' || !Life.people) return null;
    const i = AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1);
    if (!Wd.passLand(i) || Wd.ice[i]) return null;
    const R0 = Life.people.regions.values().next().value;
    if (!R0) return null;
    const R = Races.get(rid);
    const lang = AG.Lang.create(null, Math.floor(AG.Geo.year)).id; // every people its own tongue
    const k = Civ.newPolity(lang, R.startEra >= 6 ? 2 : 0); if (!k) return null;
    k.race = rid; // (before founding: a band that splits at once keeps its people in both halves)
    const site = Civ.findSite(x, y, 6, true) || { x: x + 0.5, y: y + 0.5 };
    // the arts of the age they arrive in (up to farming, as their neighbours know them), and stores
    // for the first hard years
    const near = Civ.nearestCity(x, y, -1, 1e9), upTo = Math.min(2, near ? near.era : 1);
    const c = Civ.foundBand(k, site.x, site.y, lang, R0, null, 34 + ((rnd() * 8) | 0)); // (a band big enough to find spouses among its own)
    stamp(c, k, rid);
    for (const cid of k.cities) {
      const q = Civ.cities[cid];
      for (const t of AG.Tech.LIST) if (t.era <= upTo && !AG.Tech.banned.has(t.key) && (t.era < 2 || (near && near.tech[t.id]))) q.tech[t.id] = 1;
      q.era = AG.Tech.eraOf(q); q.food += 30;
    }
    if (R.startEra) { // visitors arrive knowing what took others ten thousand years
      for (const cid of k.cities) {
        const q = Civ.cities[cid];
        for (const t of AG.Tech.LIST) if (t.era <= R.startEra && !AG.Tech.banned.has(t.key)) q.tech[t.id] = 1;
        q.era = AG.Tech.eraOf(q);
      }
    }
    Civ.namePolity(k, c.name);
    AG.History.event('god', `A god sets down the ${R.name} at ${c.name}: ${R.desc.charAt(0).toLowerCase() + R.desc.slice(1)}`, { x: c.x, y: c.y, comm: c.id, cause: 'divine will' });
    Civ.experience(x, y, 'watcher', 3);
    Civ.recomputeBorders();
    return c;
  };

  // A new people derived from parent race P (uplifted apes, or a folk grown apart). o: name, adj,
  // drift (how far the traits wander), look overrides, origin.
  function derive(parent, o) {
    if (Races.list.length >= Races.MAX) return parent;
    const d = o.drift || 0.12, w = (v) => Math.max(0.3, v * (1 + (rnd() - 0.5) * 2 * d));
    const pl = parent.look || {}, skin = pl.skin ? pl.skin.map((c) => c.map((v) => AG.clamp(Math.round(v * (1 + (rnd() - 0.5) * d * 1.6)), 10, 250))) : null;
    const R = {
      id: Races.list.length, key: 'folk' + Races.list.length, name: o.name, adj: o.adj || o.name, desc: o.desc || `A people grown apart from the ${parent.name}.`,
      life: w(parent.life), fert: w(parent.fert), war: w(parent.war), wit: w(parent.wit), stab: parent.stab + (rnd() - 0.5) * d, xeno: AG.clamp(parent.xeno + (rnd() - 0.3) * d, 0, 1),
      food: Object.assign({}, parent.food), temp: parent.temp, style: parent.style, parent: parent.id, origin: o.origin || 'folk', since: Math.floor(AG.Geo.year),
      look: Object.assign({}, pl, { skin, tall: AG.clamp((pl.tall || 1) * (1 + (rnd() - 0.5) * d), 0.7, 1.25) }, o.look || {}),
    };
    Races.list.push(R);
    return R;
  }
  Races.derive = derive;

  // Uplift: apes near (x, y) become a people of their own (their own genes, their own tongue).
  Races.uplift = function (x, y) {
    const Civ = AG.Civ, U = AG.U, Life = AG.Life, SP = AG.SP;
    if (AG.Geo.phase !== 'history') return null;
    let sp = null, bd = 1e18, n = 0;
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.sp[i] === SP.APE && U.sid[i] >= 0) { const d = AG.dist2(U.x[i], U.y[i], x, y); if (d < 30 * 30) { n++; if (d < bd) { bd = d; sp = Life.species[U.sid[i]]; } } }
    if (!sp) { // no apes in view: the nearest primate lineage on record
      const r = Life.regionOf(x, y);
      for (const s of Life.byArch(Life.ARCH.PRIMATE)) if (!s.sapient) for (const [q] of s.regions) { const d = AG.dist2(q % Life.RW, (q / Life.RW) | 0, r % Life.RW, (r / Life.RW) | 0); if (d < bd) { bd = d; sp = s; } }
    }
    if (!sp) return null;
    const R = sp.regions.get(Life.regionOf(x, y)) || [...sp.regions.values()][0];
    if (!R) return null;
    const fur = sp.color || [110, 84, 64];
    const T = derive(Races.byKey('simian'), { name: `Uplifted ${sp.common === 'great ape' ? 'Apes' : sp.common === 'monkey' ? 'Monkeys' : 'Simians'}`, adj: 'Simian', origin: 'uplift', drift: 0.08,
      desc: `The ${sp.name}, raised to minds.`, look: { skin: [fur.map((v) => Math.min(250, v + 40)), fur, fur.map((v) => v * 0.6)], hair: fur, featC: fur.map((v) => v * 0.8) } });
    const lang = AG.Lang.create(null, Math.floor(AG.Geo.year)).id;
    const k = Civ.newPolity(lang, 0); if (!k) return null;
    k.race = T.id;
    const site = Civ.findSite(x, y, 8, true) || { x: x + 0.5, y: y + 0.5 };
    const c = Civ.foundBand(k, site.x, site.y, lang, R, null, 28 + Math.min(12, n));
    stamp(c, k, T.id);
    for (const cid of k.cities) { const q = Civ.cities[cid]; for (const t of AG.Tech.LIST) if (t.era <= 1 && !AG.Tech.banned.has(t.key)) q.tech[t.id] = 1; q.era = AG.Tech.eraOf(q); q.food += 30; }
    Civ.namePolity(k, c.name);
    // the apes in view walk away as people
    let gone = 0;
    for (let i = 0; i < U.hi && gone < 12; i++) if (U.alive[i] && U.sp[i] === SP.APE && AG.dist2(U.x[i], U.y[i], x, y) < 15 * 15) { AG.Ent.remove(i); gone++; }
    AG.History.event('uplift', `The ${sp.name} of ${c.name} wake to minds: the ${T.name} found their first band`, { x: c.x, y: c.y, comm: c.id, cause: 'uplift' });
    Civ.recomputeBorders();
    return c;
  };

  // ------------------------------------------------------------ peoples drifting apart
  // A realm with no contact with others of its people for thousands of years becomes a new folk:
  // its traits and looks drift, and it takes a name of its own.
  Races.yearStep = function (dy) {
    const Civ = AG.Civ;
    if (Races.list.length >= Races.MAX) return;
    for (const k of Civ.kingdoms) {
      if (!k.alive || !k.cities.length) continue;
      let kin = false, pop = 0;
      for (const cid of k.cities) {
        const c = Civ.cities[cid]; if (!c || !c.alive) continue;
        pop += c.members.length;
        if (!kin) for (const [oid, st] of c.contacts) { const o = Civ.cities[oid]; if (o && o.alive && o.kd !== k.id && (o.race || 0) === (k.race || 0) && st > 0.15) { kin = true; break; } }
      }
      const rivals = Civ.kingdoms.some((q) => q !== k && q.alive && q.cities.length && (q.race || 0) === (k.race || 0));
      if (!rivals) { k.isoYears = 0; continue; } // the last of its people stays itself
      k.isoYears = kin ? Math.max(0, (k.isoYears || 0) - dy * 2) : (k.isoYears || 0) + dy;
      if (k.isoYears > 3500 && pop >= 40 && rnd() < dy / 400) {
        const parent = Races.get(k.race || 0), cap = Civ.capitalOf(k);
        const word = AG.Lang.peopleName(k.lang) || (cap ? cap.name : 'Far');
        const T = derive(parent, { name: word, adj: word, origin: 'folk', drift: 0.14 });
        if (T === parent) return;
        for (const cid of k.cities) { const c = Civ.cities[cid]; if (c && c.alive) stamp(c, k, T.id); }
        k.isoYears = 0;
        AG.History.event('folk', `Long apart from the other ${parent.name}, the people of the ${k.name} have become the ${T.name}, a folk of their own`, { x: cap ? cap.x : -1, y: cap ? cap.y : -1, polity: k.id, cause: 'isolation' });
      }
    }
  };
  // census: living people of each race
  Races.census = function () {
    const n = new Array(Races.list.length).fill(0);
    for (const c of AG.Civ.cities) if (c.alive) n[c.race || 0] = (n[c.race || 0] || 0) + c.members.length;
    return n;
  };
  // for snapshots: the peoples born in this timeline
  Races.state = () => Races.list.slice(BASE.length).map((r) => JSON.parse(JSON.stringify(r)));
  Races.restore = (custom) => { Races.list = BASE.slice().concat((custom || []).map((r) => Object.assign({}, r))); };
  Races.reset = () => { Races.list = BASE.slice(); };
})();
