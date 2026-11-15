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
  const ERAS = ['Paleolithic', 'Mesolithic', 'Neolithic', 'Chalcolithic', 'Bronze Age', 'Iron Age', 'Classical', 'Medieval', 'Renaissance', 'Industrial', 'Modern', 'Atomic', 'Information', 'Space Age', 'Stellar'];
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
    // ---- Medieval: lords and castles, steel, mills, monasteries, the compass
    ['feudalism', 'Feudalism', 7, ['law', 'riding'], 1600, (c) => (c.gov >= GOV.state ? 1 : 0), 110, SK.LORE, null, 'Land for service: lords, vassals and serfs'],
    ['stirrup', 'Stirrup', 7, ['riding', 'iron'], 1200, null, 110, SK.CRAFT, null, 'Riders braced in the saddle'],
    ['chivalry', 'Chivalry', 7, ['stirrup', 'feudalism'], 1300, null, 110, SK.FIGHT, null, 'Armoured knights (+35% fighting)'],
    ['steel', 'Steel', 7, ['iron', 'engineering'], 1500, null, 110, SK.CRAFT, null, 'Hard steel blades and tools'],
    ['castles', 'Castles', 7, ['masonry', 'fortification', 'feudalism'], 1300, null, 110, SK.BUILD, null, 'Stone castles hold the land'],
    ['crossbow', 'Crossbow', 7, ['bow', 'engineering'], 1200, null, 110, SK.CRAFT, null, 'Bolts that pierce armour'],
    ['windmills', 'Mills', 7, ['engineering', 'granaries'], 1200, null, 110, SK.BUILD, null, 'Wind and water grind the grain (+15% farming)'],
    ['monasteries', 'Monasteries', 7, ['philosophy', 'writing'], 1200, (c) => (c.faith ? 1 : 0.4), 110, SK.LORE, null, 'Houses of prayer that copy and keep books'],
    ['alchemy', 'Alchemy', 7, ['medicine', 'philosophy'], 1500, null, 110, SK.LORE, null, 'The search for the elements (the way to gunpowder)'],
    ['compass', 'Compass', 7, ['navigation'], 1200, (c) => (c.coast ? 1 : 0.2), 110, SK.LORE, null, 'A needle that finds north'],
    ['guilds', 'Guilds', 7, ['coinage', 'feudalism'], 1100, null, 110, SK.CRAFT, null, 'Masters and apprentices: crafts grow'],
    // ---- Renaissance: printing, gunpowder, banks, universities, ocean ships
    ['printing', 'Printing press', 8, ['alphabet', 'guilds', 'monasteries'], 1300, (c) => (c.pop >= 150 ? 1 : 0.3), 140, SK.CRAFT, null, 'Books for many: learning speeds up'],
    ['gunpowder', 'Gunpowder', 8, ['alchemy', 'steel'], 1200, null, 140, SK.CRAFT, null, 'Black powder: cannons and handguns'],
    ['banking', 'Banking', 8, ['guilds', 'mathematics'], 1100, null, 140, SK.LORE, null, 'Credit and banks: trade and states grow'],
    ['universities', 'Universities', 8, ['printing', 'monasteries'], 1100, (c) => (c.pop >= 180 ? 1 : 0.3), 140, SK.LORE, null, 'Schools of learning (+30% invention)'],
    ['optics', 'Optics', 8, ['printing', 'astronomy'], 1100, null, 140, SK.CRAFT, null, 'Lenses and telescopes'],
    ['muskets', 'Muskets', 8, ['gunpowder'], 1000, null, 140, SK.CRAFT, null, 'Musketeers (+40% fighting)'],
    ['oceangoing', 'Ocean ships', 8, ['compass', 'sailing'], 1100, (c) => (c.coast ? 1 : 0), 140, SK.CRAFT, null, 'Great ships that cross oceans'],
    // ---- Industrial: science, steam, railways, factories, rifles, vaccines
    ['scientific', 'Scientific method', 9, ['universities', 'optics'], 1000, null, 160, SK.LORE, null, 'Experiment and proof (+50% invention)'],
    ['steam', 'Steam power', 9, ['scientific', 'steel'], 950, null, 160, SK.CRAFT, null, 'Engines of iron and fire'],
    ['railways', 'Railways', 9, ['steam', 'roads'], 900, null, 160, SK.BUILD, null, 'Iron roads bind distant cities'],
    ['factories', 'Factories', 9, ['steam', 'banking'], 900, null, 160, SK.CRAFT, null, 'Mass production in smoking mills'],
    ['rifling', 'Rifles', 9, ['muskets', 'steel'], 900, null, 160, SK.CRAFT, null, 'Rifled guns (+50% fighting)'],
    ['vaccines', 'Vaccines', 9, ['medicine', 'scientific'], 900, null, 160, SK.LORE, null, 'Pox no longer kill (far fewer die of disease)'],
    ['fertilizer', 'Fertilizer', 9, ['scientific', 'plough'], 900, null, 160, SK.FARM, null, 'Fields fed by chemistry (+40% farming)'],
    ['electricity', 'Electricity', 9, ['scientific'], 950, null, 160, SK.LORE, null, 'Power through wires'],
    // ---- Modern: engines, flight, radio, tanks, antibiotics, assembly lines
    ['combustion', 'Combustion engine', 10, ['steam', 'factories'], 850, null, 170, SK.CRAFT, null, 'Petrol engines: cars and trucks'],
    ['flight', 'Flight', 10, ['combustion'], 800, null, 170, SK.CRAFT, null, 'Aircraft rule the sky'],
    ['radio', 'Radio', 10, ['electricity'], 800, null, 170, SK.LORE, null, 'Voices through the air'],
    ['tanks', 'Tanks', 10, ['combustion', 'rifling'], 800, null, 170, SK.CRAFT, null, 'Armoured machines of war'],
    ['antibiotics', 'Antibiotics', 10, ['vaccines'], 800, null, 170, SK.LORE, null, 'Infections cured'],
    ['massprod', 'Assembly line', 10, ['factories', 'electricity'], 800, null, 170, SK.CRAFT, null, 'Goods for everyone'],
    // ---- Atomic: fission, rockets, computers, jets, the green revolution
    ['fission', 'Nuclear fission', 11, ['radio', 'scientific'], 800, (c) => (c.gov >= GOV.state ? 1 : 0), 180, SK.LORE, null, 'The power in the atom'],
    ['rocketry', 'Rocketry', 11, ['flight'], 750, null, 180, SK.CRAFT, null, 'Rockets to the edge of space'],
    ['computers', 'Computers', 11, ['radio', 'electricity'], 750, null, 180, SK.LORE, null, 'Thinking machines (+50% invention)'],
    ['jets', 'Jet aircraft', 11, ['flight', 'rocketry'], 700, null, 180, SK.CRAFT, null, 'Jets cross the world in hours'],
    ['greenrev', 'Green revolution', 11, ['fertilizer', 'antibiotics'], 700, null, 180, SK.FARM, null, 'New crops feed billions (+40% farming)'],
    // ---- Information: the net, satellites, genetics, robots, renewables
    ['internet', 'Internet', 12, ['computers', 'radio'], 700, null, 180, SK.LORE, null, 'The whole world talks at once (+50% invention)'],
    ['satellites', 'Satellites', 12, ['rocketry', 'computers'], 650, null, 180, SK.CRAFT, null, 'Eyes in orbit'],
    ['genetics', 'Genetics', 12, ['antibiotics', 'computers'], 650, null, 180, SK.LORE, null, 'Reading and writing life'],
    ['robotics', 'Robotics', 12, ['computers', 'massprod'], 650, null, 180, SK.CRAFT, null, 'Machines that work'],
    ['renewables', 'Renewable power', 12, ['electricity', 'computers'], 650, null, 180, SK.BUILD, null, 'Sun and wind power the cities'],
    // ---- Space Age: thinking machines, fusion, spaceflight, nanotech, colonies
    ['ai', 'Artificial minds', 13, ['internet', 'robotics'], 910, null, 190, SK.LORE, null, 'Minds of silicon (doubles invention)'],
    ['fusion', 'Fusion power', 13, ['fission', 'computers'], 910, null, 190, SK.CRAFT, null, 'Star-fire on earth'],
    ['spaceflight', 'Spaceflight', 13, ['satellites', 'fusion'], 910, null, 190, SK.CRAFT, null, 'Ships to the moon and planets'],
    ['nanotech', 'Nanotechnology', 13, ['genetics', 'robotics'], 910, null, 190, SK.CRAFT, null, 'Machines the size of molecules'],
    ['colonies', 'Space colonies', 13, ['spaceflight'], 910, null, 190, SK.BUILD, null, 'Cities beyond the sky'],
    // ---- Stellar: the stars themselves
    ['warp', 'Warp drive', 14, ['spaceflight', 'fusion', 'ai'], 1200, null, 200, SK.LORE, null, 'Faster than light: the stars are open'],
    ['terraforming', 'Terraforming', 14, ['nanotech', 'fusion'], 1120, null, 200, SK.BUILD, null, 'Whole worlds remade'],
    ['uploads', 'Mind uploading', 14, ['ai', 'genetics'], 1200, null, 200, SK.LORE, null, 'Minds that outlive their bodies'],
  ];
  const LIST = T.map(([key, name, era, pre, diff, cond, minPop, skill, accident, desc], id) => ({ id, key, name, era, pre, diff, cond, minPop, skill, accident, desc }));
  const IDX = {}; LIST.forEach((t) => (IDX[t.key] = t.id));
  for (const t of LIST) t.preIds = t.pre.map((k) => { if (IDX[k] === undefined) throw new Error('unknown prerequisite ' + k); return IDX[k]; });
  const MARK = { bow: 1, microliths: 1, cultivation: 2, herding: 2, copper: 3, bronze: 4, iron: 5, philosophy: 6, feudalism: 7, printing: 8, steam: 9, combustion: 10, fission: 11, internet: 12, spaceflight: 13, warp: 14 };
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
  Tech.eraName = (c) => ERAS[Tech.eraOf(c)] + (c.future ? ` (future ${c.future})` : '');
  // Past the Stellar age there is always more to learn: future technologies, one after another,
  // each a level higher (and harder) than the last. They speed invention, farming and war a little.
  Tech.futureStep = function (c, ctx, dy) {
    if (Tech.eraOf(c) < 14) return;
    const lvl = c.future || 0, p = (1 / ((800 + lvl * 120) * PACE)) * Math.sqrt(Math.max(1, ctx.pop) / 50) * ctx.innovation * (1 + 0.15 * Math.min(6, ctx.contacts));
    if (rnd() < 1 - Math.pow(1 - Math.min(0.5, p), dy)) {
      c.future = lvl + 1;
      if (c.future % 5 === 0 || !Tech.firsts['future' + c.future]) { if (!Tech.firsts['future' + c.future]) Tech.firsts['future' + c.future] = { year: Math.floor(AG.Geo.year), comm: c.id, name: c.name }; AG.History.event('invention', `${c.name} reaches future technology ${c.future}`, { x: c.x, y: c.y, comm: c.id }); }
    }
  };
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
    Tech.futureStep(c, ctx, dy);
    for (const t of LIST) {
      const p = Tech.chance(c, t, ctx);
      if (p > 0 && rnd() < 1 - Math.pow(1 - Math.min(0.5, p), dy)) { Tech.learn(c, t, 'discovered', ctx); out.push(t); }
    }
    // the Tasmanian effect: small, unskilled and isolated communities forget (neighbours who still
    // know a thing keep it alive)
    const keepEra = AG.Races ? AG.Races.of(c).startEra || -1 : -1; // (visitors keep what they arrived knowing)
    for (const t of LIST) {
      if (!c.tech[t.id] || KEEP_ALWAYS.has(t.key) || t.era <= 1 && ctx.pop >= 12 || t.era <= keepEra) continue;
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
      case 'printing': return 'a large city with scholars and guilds';
      case 'fission': return 'a state with the means to split the atom';
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
