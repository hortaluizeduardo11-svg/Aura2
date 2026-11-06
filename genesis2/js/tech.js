/* AURA: Genesis 2 — tech.js
 * The invention graph. Every invention has prerequisites (all must be known), conditions on the
 * inventing community (resources in its territory, sedentism, population, coast or river,
 * contacts, government, local species), a difficulty, sometimes an accident that can reveal it,
 * and effects that other systems read through Tech.knows(). Knowledge spreads by contact, can be
 * lost when a community shrinks or its last skilled member dies, and can be found again.
 * Eras are never set: a community's era is the highest era whose marker it knows. */
'use strict';
(function () {
  const AG = window.AG;
  const { RES, SK } = AG;
  const rnd = () => AG.rnd();
  const has = (ctx, r) => ctx.res[r] > 0;
  const ERAS = ['Paleolithic', 'Mesolithic', 'Neolithic', 'Chalcolithic', 'Bronze Age', 'Iron Age', 'Classical'];
  const GOV = { band: 0, tribe: 1, chiefdom: 2, state: 3 };
  // key, name, era, prerequisites, difficulty (≈ years for a 50-person community of average
  // minds once conditions are met), condition factor, minimum population to keep it, skill that
  // carries it, accident, description
  const T = [
    ['fire', 'Fire', 0, [], 0, null, 0, -1, null, 'Warmth, cooking, light; the hearth at the centre of every camp'],
    ['knapping', 'Stone knapping', 0, [], 0, null, 0, -1, null, 'Flaked stone blades and scrapers'],
    ['speech', 'Speech', 0, [], 0, null, 0, -1, null, 'Words, names and stories'],
    ['spear', 'Spear hunting', 0, ['knapping'], 500, null, 0, SK.HUNT, null, 'Hunters take large game (+40% hunting)'],
    ['hides', 'Hide clothing', 0, ['knapping'], 600, (c) => (c.cold ? 1.6 : 0.6), 0, SK.CRAFT, null, 'Sewn hides: people can live in the cold'],
    ['shelters', 'Shelters', 0, ['knapping'], 500, null, 0, SK.BUILD, null, 'Hide tents and huts'],
    ['foraging', 'Foraging lore', 0, ['speech'], 400, null, 0, SK.GATHER, null, 'Knowing which plants feed and which heal (+30% gathering)'],
    ['burial', 'Burial rites', 0, ['speech'], 900, (c) => (c.deaths > 0 ? 1 : 0.2), 0, SK.LORE, null, 'The dead are honoured: ancestor cults, shrines'],
    ['art', 'Cave art', 0, ['speech', 'burial'], 1500, (c) => (c.pop >= 20 ? 1 : 0.3), 25, SK.LORE, null, 'Painted animals and hand prints; a shared identity'],
    ['fishing', 'Fishing', 0, ['spear'], 700, (c) => (c.water ? 1 : 0), 0, SK.GATHER, null, 'Weirs, harpoons and hooks: food from rivers and the sea'],
    ['herbal', 'Herbal medicine', 0, ['foraging'], 1600, null, 25, SK.LORE, null, 'Wounds heal faster; fewer infants die'],
    ['boats', 'Boats', 0, ['knapping', 'fishing'], 1800, (c) => (c.coast ? 1 : c.water ? 0.4 : 0), 20, SK.CRAFT, null, 'Rafts and dugouts: narrow straits can be crossed'],
    ['dogs', 'Dog companions', 1, ['spear'], 3500, (c) => (c.wolves ? 1 : 0), 0, SK.HERD, (c) => (c.wolves && c.pop > 25 ? 0.00012 : 0), 'Wolves that follow the camp become hunting dogs'],
    ['bow', 'Bow and arrow', 1, ['spear'], 2600, null, 30, SK.HUNT, null, 'Hunting at range (+30% hunting), deadlier raids'],
    ['microliths', 'Microliths', 1, ['knapping', 'bow'], 1500, null, 20, SK.CRAFT, null, 'Tiny blades set in composite tools'],
    ['cultivation', 'Cultivation', 2, ['foraging'], 650, (c) => (c.cereal > 0.15 && c.stable ? Math.min(1.5, c.cereal) : 0), 0, SK.FARM, null, 'Wild grasses sown and harvested: fields, villages, surplus'],
    ['herding', 'Herding', 2, ['spear'], 3200, (c) => (c.domesticable ? (c.sedentary || c.farming ? 1 : 0.12) : 0), 0, SK.HERD, null, 'Docile herd animals kept in pens: meat, milk, wealth on the hoof'],
    ['pottery', 'Pottery', 2, ['fire'], 1800, (c) => (has(c, RES.CLAY) || c.river ? (c.sedentary ? 1.4 : 0.35) : 0), 30, SK.CRAFT, (c) => (has(c, RES.CLAY) && c.sedentary ? 0.0005 : 0), 'Fired clay pots: storage and cooking'],
    ['weaving', 'Weaving', 2, ['cultivation'], 1400, null, 40, SK.CRAFT, null, 'Cloth from flax and wool'],
    ['groundstone', 'Polished stone', 2, ['knapping', 'cultivation'], 1200, null, 30, SK.CRAFT, null, 'Ground stone axes fell forests (+woodcutting, more clearing)'],
    ['mudbrick', 'Mud brick', 2, ['cultivation'], 1500, (c) => (has(c, RES.CLAY) || c.river ? 1 : 0.4), 40, SK.BUILD, null, 'Lasting houses'],
    ['granaries', 'Granaries', 2, ['cultivation', 'pottery'], 1200, null, 40, SK.BUILD, null, 'Stored grain: famine resistance, more births'],
    ['megaliths', 'Megaliths', 2, ['burial', 'cultivation'], 2200, (c) => (c.pop >= 70 ? 1 : 0), 60, SK.BUILD, null, 'Stone circles and tombs: cohesion, authority'],
    ['irrigation', 'Irrigation', 2, ['cultivation'], 2200, (c) => (c.river && c.pop >= 90 ? 1 : 0), 80, SK.FARM, null, 'Channels from the river (+50% farming in dry land)'],
    ['plough', 'Plough', 2, ['cultivation', 'herding'], 2000, null, 60, SK.FARM, null, 'Oxen pull the plough (+40% farming); land becomes property'],
    ['kilns', 'Kilns', 2, ['pottery'], 1500, (c) => (c.sedentary && c.pop >= 50 ? 1 : 0), 50, SK.CRAFT, null, 'High-temperature firing (the way to metal)'],
    ['wheel', 'The wheel', 2, ['pottery', 'groundstone'], 2600, (c) => (c.pop >= 60 ? 1 : 0.3), 60, SK.CRAFT, null, 'Carts carry trade over land'],
    ['sailing', 'Sailing', 2, ['boats', 'weaving'], 2400, (c) => (c.coast ? 1 : 0), 60, SK.CRAFT, null, 'Sails: ships, harbours, sea trade'],
    ['tokens', 'Counting tokens', 2, ['pottery', 'cultivation'], 1800, (c) => (c.contacts >= 1 ? 1 : 0.3), 80, SK.LORE, null, 'Clay tokens keep accounts'],
    ['brewing', 'Brewing', 2, ['cultivation', 'pottery'], 1600, null, 40, SK.CRAFT, (c) => (c.sedentary ? 0.0004 : 0), 'Beer and feasts (and drunkenness)'],
    ['copper', 'Copper working', 3, ['kilns', 'cultivation'], 1800, (c) => (has(c, RES.COPPER) ? 1 : c.tradeRes[RES.COPPER] ? 0.4 : 0), 80, SK.CRAFT, (c) => (has(c, RES.COPPER) ? 0.0004 : 0), 'Smelted copper: tools, ornaments, prestige'],
    ['bronze', 'Bronze', 4, ['copper'], 1800, (c) => (has(c, RES.TIN) ? 1 : c.tradeRes[RES.TIN] ? 0.7 : 0), 120, SK.CRAFT, null, 'Copper and tin: weapons and armour (+30% fighting)'],
    ['writing', 'Writing', 4, ['tokens'], 2600, (c) => (c.gov >= GOV.chiefdom && c.pop >= 200 ? 1 : 0), 200, SK.LORE, null, 'Scribes keep records: law, history, faster learning'],
    ['mathematics', 'Mathematics', 4, ['writing'], 2000, null, 200, SK.LORE, null, 'Number, measure, geometry'],
    ['astronomy', 'Astronomy', 4, ['megaliths'], 2500, (c) => (c.pop >= 150 ? 1 : 0.3), 120, SK.LORE, null, 'A calendar of the sky (+10% farming)'],
    ['masonry', 'Masonry', 3, ['groundstone', 'mudbrick'], 1800, (c) => (c.stone ? 1 : 0.4), 100, SK.BUILD, null, 'Cut stone: walls, temples, citadels'],
    ['fortification', 'Fortification', 3, ['mudbrick'], 1600, (c) => (c.war ? 2 : 0.4), 120, SK.BUILD, null, 'Palisades, then walls and towers'],
    ['law', 'Law codes', 4, ['writing'], 2000, (c) => (c.gov >= GOV.state ? 1 : 0), 400, SK.LORE, null, 'Written law: less corruption, more stability'],
    ['currency', 'Currency', 4, ['tokens', 'copper'], 1800, (c) => (c.contacts >= 2 ? 1 : 0.3), 200, SK.CRAFT, null, 'Weighed metal: markets and trade'],
    ['monuments', 'Monumental architecture', 4, ['masonry'], 2200, (c) => (c.gov >= GOV.chiefdom && c.pop >= 200 ? 1 : 0), 250, SK.BUILD, null, 'Temples and palaces: legitimacy for rulers'],
    ['riding', 'Horse riding', 3, ['herding', 'cultivation'], 3600, (c) => (c.horses && c.pop >= 60 ? 1 : 0), 50, SK.HERD, null, 'Mounted herders and raiders'],
    ['chariots', 'Chariots', 4, ['wheel', 'bronze', 'riding'], 1800, null, 200, SK.CRAFT, null, 'War chariots (+20% fighting)'],
    ['iron', 'Iron smelting', 5, ['bronze', 'kilns'], 2400, (c) => (has(c, RES.IRON) ? (c.forest > 0.15 ? 1 : 0.4) : c.tradeRes[RES.IRON] ? 0.3 : 0), 200, SK.CRAFT, null, 'Cheap, hard iron (+20% fighting, +farming); forests burn for charcoal'],
    ['alphabet', 'Alphabet', 5, ['writing'], 2000, (c) => (c.contacts >= 2 ? 1 : 0.3), 300, SK.LORE, null, 'Few letters, many readers: ideas spread faster'],
    ['coinage', 'Coinage', 5, ['currency', 'iron'], 1600, null, 300, SK.CRAFT, null, 'Stamped coins: trade doubles'],
    ['roads', 'Roads', 5, ['masonry', 'wheel'], 1800, (c) => (c.gov >= GOV.state ? 1 : 0), 400, SK.BUILD, null, 'Paved roads bind a state together'],
    ['philosophy', 'Philosophy', 6, ['alphabet', 'mathematics'], 2400, (c) => (c.pop >= 600 ? 1 : 0.2), 500, SK.LORE, null, 'Reasoned argument about nature, gods and rule'],
    ['medicine', 'Medicine', 6, ['herbal', 'writing'], 2200, null, 300, SK.LORE, null, 'Physicians: far fewer die of illness and in childbirth'],
    ['engineering', 'Engineering', 6, ['mathematics', 'masonry'], 2200, null, 400, SK.BUILD, null, 'Aqueducts, cranes and siege engines'],
    ['navigation', 'Navigation', 6, ['sailing', 'astronomy'], 2200, (c) => (c.coast ? 1 : 0), 200, SK.LORE, null, 'Steering by the stars: open-sea voyages'],
  ];
  const LIST = T.map(([key, name, era, pre, diff, cond, minPop, skill, accident, desc], id) => ({ id, key, name, era, pre, diff, cond, minPop, skill, accident, desc }));
  const IDX = {}; LIST.forEach((t) => (IDX[t.key] = t.id));
  for (const t of LIST) t.preIds = t.pre.map((k) => { if (IDX[k] === undefined) throw new Error('unknown prerequisite ' + k); return IDX[k]; });
  const MARK = { bow: 1, microliths: 1, cultivation: 2, herding: 2, copper: 3, bronze: 4, iron: 5, philosophy: 6 };
  const STARTING = ['fire', 'knapping', 'speech'];
  const KEEP_ALWAYS = new Set(['fire', 'knapping', 'speech', 'spear', 'shelters', 'foraging', 'hides']);

  const PACE = 9;
  const Tech = (AG.Tech = { PACE, LIST, IDX, ERAS, GOV, NT: LIST.length, banned: new Set(), discoveries: 0, losses: 0, firsts: {} });
  Tech.reset = function () { Tech.banned = new Set(); Tech.discoveries = 0; Tech.losses = 0; Tech.firsts = {}; };
  Tech.STARTING = STARTING;
  Tech.newSet = function () { const k = new Uint8Array(LIST.length); for (const s of STARTING) k[IDX[s]] = 1; return k; };
  Tech.knows = (c, key) => !!(c && c.tech && c.tech[IDX[key]]);
  Tech.prereqsMet = (c, t) => t.preIds.every((p) => c.tech[p]);
  Tech.eraOf = function (c) {
    let e = 0;
    for (const k in MARK) if (c.tech[IDX[k]]) e = Math.max(e, MARK[k]);
    return e;
  };
  Tech.eraName = (c) => ERAS[Tech.eraOf(c)];
  Tech.count = (c) => { let n = 0; for (let k = 0; k < LIST.length; k++) n += c.tech[k]; return n; };

  // Probability of discovery per year for one community (0 if impossible).
  Tech.chance = function (c, t, ctx) {
    if (c.tech[t.id] || Tech.banned.has(t.key) || (c.banned && c.banned.has(t.key)) || !t.diff) return 0;
    if (!Tech.prereqsMet(c, t)) return 0;
    const cf = t.cond ? t.cond(ctx) : 1;
    if (cf <= 0) return 0;
    // difficulty is in years for a 50-person community of average minds; the whole game is paced
    // so that farming tends to come after the ice retreats and iron some ten thousand years on
    return (1 / (t.diff * PACE)) * Math.sqrt(Math.max(1, ctx.pop) / 50) * ctx.innovation * (1 + 0.15 * Math.min(6, ctx.contacts)) * cf * (ctx.stability || 1) * (ctx.inspired ? 3 : 1) + (t.accident ? t.accident(ctx) / PACE : 0);
  };

  // One community's year(s): discovery, then loss. ctx comes from civ.js (Civ.techContext).
  Tech.yearStep = function (c, ctx, dy) {
    const out = [];
    for (const t of LIST) {
      const p = Tech.chance(c, t, ctx);
      if (p > 0 && rnd() < 1 - Math.pow(1 - Math.min(0.5, p), dy)) { Tech.learn(c, t, 'discovered', ctx); out.push(t); }
    }
    // the Tasmanian effect: small, unskilled and isolated communities forget (neighbours who still
    // know a thing keep it alive)
    for (const t of LIST) {
      if (!c.tech[t.id] || KEEP_ALWAYS.has(t.key) || t.era <= 1 && ctx.pop >= 12) continue;
      let p = 0;
      if (ctx.pop < t.minPop * 0.5) p += 0.02;
      if (t.skill >= 0 && ctx.maxSkill && ctx.maxSkill[t.skill] < 8) p += 0.015;
      if (p > 0) for (const [id, st] of c.contacts) { if (st > 0.3 && AG.Civ.cities[id].tech[t.id]) { p = 0; break; } }
      if (p > 0 && LIST.some((u) => c.tech[u.id] && u.preIds.includes(t.id))) p *= 0.3; // still in use by what was built on it
      if (p > 0 && rnd() < 1 - Math.pow(1 - p, dy)) { forget(c, t); }
    }
    return out;
  };

  // how: 'discovered' (by a named inventor), 'learned' (from neighbours), 'conquest', 'god'
  Tech.learn = function (c, t, how, ctx, from) {
    if (typeof t === 'string') t = LIST[IDX[t]];
    if (!t || c.tech[t.id] || Tech.banned.has(t.key)) return false;
    c.tech[t.id] = 1;
    c.techYear = c.techYear || {}; c.techYear[t.key] = Math.floor(AG.Geo.year);
    const prevEra = c.era || 0;
    c.era = Tech.eraOf(c);
    if (how === 'discovered') {
      Tech.discoveries++;
      const P = AG.Civ.pickInventor(c);
      const first = !Tech.firsts[t.key];
      if (first) Tech.firsts[t.key] = { year: Math.floor(AG.Geo.year), comm: c.id, name: c.name, inventor: P ? P.id : 0 };
      if (P) {
        P.invented.push(t.key); P.fame += first ? 4 : 2;
        AG.People.remember(P, AG.People.MK.INVENTED, { v: 0.9, s: 1, d: t.name.toLowerCase(), core: true });
        if (P.goal === 7 && !P.goalDone) AG.People.goalDone(P, 'a discovery');
      }
      const why = t.cond && ctx ? conditionText(t, ctx) : '';
      if (first || ctx && ctx.visible) AG.History.event('invention', `${P ? P.name + ' of ' : 'The people of '}${c.name} ${first ? 'are the first to discover' : 'discover'} ${t.name.toLowerCase()}${why ? ' (' + why + ')' : ''}`, { x: c.x, y: c.y, tech: t.key, comm: c.id, person: P ? P.id : 0, first, cause: why || 'invention' });
    } // learning from neighbours is quiet in the chronicle
    if (c.era > prevEra) {
      const k = AG.Civ.kingdoms[c.kd];
      const worldFirst = !Tech.firsts['era' + c.era];
      if (worldFirst) Tech.firsts['era' + c.era] = { year: Math.floor(AG.Geo.year), comm: c.id, name: c.name };
      AG.History.event('era', `${c.name}${k ? ' (' + k.name + ')' : ''} enters the ${ERAS[c.era]}${worldFirst ? ', the first people in the world to do so' : ''}`, { x: c.x, y: c.y, comm: c.id, era: c.era, first: worldFirst, tech: t.key, cause: t.key });
    }
    AG.Civ.onTech && AG.Civ.onTech(c, t, how);
    return true;
  };
  function forget(c, t) {
    c.tech[t.id] = 0; Tech.losses++;
    c.era = Tech.eraOf(c);
    const still = AG.Civ.cities.some((o) => o.alive && o.tech[t.id]);
    if (!still || c.members.length >= 40) AG.History.event('loss', `The people of ${c.name} have lost the knowledge of ${t.name.toLowerCase()}`, { x: c.x, y: c.y, tech: t.key, comm: c.id, cause: 'too few to keep it' });
  }
  Tech.forget = forget;
  function conditionText(t, c) {
    switch (t.key) {
      case 'cultivation': return 'wild grain grows in their land and the climate has settled';
      case 'herding': return `docile ${c.domesticableName || 'herd animals'} live nearby`;
      case 'pottery': return 'clay by the river and a settled life';
      case 'copper': return 'green copper ore in their hills';
      case 'bronze': return c.res[RES.TIN] ? 'tin as well as copper' : 'tin from traders';
      case 'iron': return 'iron ore and forests for charcoal';
      case 'boats': case 'sailing': case 'navigation': return 'they live by the sea';
      case 'fishing': return 'fish in the water';
      case 'dogs': return 'wolves have followed the camp';
      case 'writing': return 'a chiefdom needs its accounts kept';
      case 'irrigation': return 'a river and many mouths to feed';
      default: return '';
    }
  }

  // Contact: each known tech whose prerequisites the receiver knows spreads with a chance set by
  // contact strength and the receiver's taste for new things.
  Tech.diffuse = function (a, b, strength, dy) { diffuseTo(a, b, strength, dy); diffuseTo(b, a, strength, dy); };
  function diffuseTo(g, r, strength, dy) {
    {
      const novelty = 0.4 + 0.6 * (1 - (r.tradition === undefined ? 0.5 : r.tradition));
      for (const t of LIST) {
        if (!g.tech[t.id] || r.tech[t.id] || !t.diff || Tech.banned.has(t.key) || (r.banned && r.banned.has(t.key))) continue;
        if (!Tech.prereqsMet(r, t)) continue;
        if ((t.key === 'fishing' || t.key === 'boats') && !r.water) continue;
        if ((t.key === 'sailing' || t.key === 'navigation') && !r.coastal) continue;
        const p = 0.012 * strength * novelty;
        if (rnd() < 1 - Math.pow(1 - p, dy)) Tech.learn(r, t, 'learned', null, g);
      }
    }
  }

  // Era transitions recorded for the timeline (first community per era).
  Tech.timeline = () => ERAS.map((e, k) => ({ era: e, first: Tech.firsts['era' + k] || null })).slice(1);
})();
