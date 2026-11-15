/* AURA: Genesis 2 — realms.js
 * What a god can make happen to peoples and their realms, and the great works they raise:
 * - rulers: crown a new ruler (a coup in the capital, a breakaway kingdom elsewhere), strike one
 *   down, raise a hero, call a prophet who founds a new faith
 * - realms: a golden age, a revolution that makes a republic, two realms united, an exodus that
 *   carries half a community to found a new one where the god points
 * - towns: a village of its neighbours' age, or a metropolis of the most advanced age alive
 * - great wonders: one of each in the world, of the builder's age (a great mound to a space
 *   elevator), raised by the god or by rich states on their own; each strengthens its realm
 * - the space program: realms of the Space Age launch rockets and found colonies off the world
 * Effects run through the ordinary systems (persons, polities, buildings, inventions). */
'use strict';
(function () {
  const AG = window.AG;
  const rnd = () => AG.rnd();
  const year = () => AG.Geo.year;
  const Rm = (AG.Realms = { launches: 0, colonies: 0 });
  const ev = (kind, text, o) => AG.History.event(kind, text, o || {});
  const cityAt = (x, y, r) => AG.Civ.cityAt(x, y) || AG.Civ.nearestCity(x, y, -1, r || 30);
  const able = (c) => AG.Civ.persons(c).filter((P) => P.died === null && P.job !== AG.J.CHILD);

  // ------------------------------------------------------------ rulers
  // the most able adult of a community: ambition, fame, skill and age
  function champion(c) {
    let best = null, bv = -1e9;
    for (const P of able(c)) {
      const a = AG.People.age(P);
      const v = (P.traits & AG.TR.ambitious ? 3 : 0) + (P.traits & AG.TR.brave ? 1 : 0) + P.fame * 0.4 + (P.skills[AG.SK.LORE] + P.skills[AG.SK.FIGHT]) / 60 + (a > 22 && a < 55 ? 2 : 0) + rnd();
      if (v > bv) { bv = v; best = P; }
    }
    return best;
  }
  Rm.crown = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a community' };
    const k = Civ.kingdoms[c.kd], P = champion(c);
    if (!P) return { ok: false, why: 'Nobody there can rule' };
    if (k.cities.length > 1 && c.id !== k.capital) { // a breakaway kingdom
      const nk = AG.War.secede(c, 'raised up by the heavens');
      if (!nk) return { ok: false, why: 'The realm holds together' };
      if (nk.gov < 2) Civ.setGov(nk, 2, 'divine will');
      nk.ruler = 0; Civ.succession(nk, null);
      const R = AG.People.get(nk.ruler); if (R !== P && P.died === null) { nk.ruler = P.id; P.rank = nk.gov >= 3 ? 3 : 2; }
      P.fame += 6;
      ev('ruler', `The heavens raise ${P.name} to rule ${c.name}, which breaks away as the ${nk.name}`, { x: c.x, y: c.y, comm: c.id, polity: nk.id, person: P.id, cause: 'divine will' });
      return { ok: true, text: `${P.name} rules the new ${nk.name}` };
    }
    const old = k.ruler ? AG.People.get(k.ruler) : null;
    if (old && old.died === null) { old.rank = 1; AG.People.remember(old, AG.People.MK.EXILE, { v: -0.8, s: 1, d: 'cast down by ' + P.name, core: true }); }
    if (k.gov < 1) Civ.setGov(k, 1, 'divine will');
    k.ruler = P.id; P.rank = k.gov >= 3 ? 3 : 2; P.fame += 6;
    AG.People.remember(P, AG.People.MK.RULER, { v: 0.9, s: 1, d: 'raised up by the heavens to rule the ' + k.name, core: true });
    k.legit = Math.min(1, k.legit + 0.2); k.stability = Math.max(0, k.stability - 0.1);
    ev('ruler', `${old && old.died === null ? `${P.name} casts down ${old.name}` : `${P.name} takes the throne`} of the ${k.name}, a ruler chosen by the heavens`, { x: c.x, y: c.y, polity: k.id, person: P.id, cause: 'divine will' });
    return { ok: true, text: `${P.name} rules the ${k.name}` };
  };
  Rm.assassinate = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a realm' };
    const k = Civ.kingdoms[c.kd], R = k.ruler ? AG.People.get(k.ruler) : null;
    if (!R || R.died !== null) return { ok: false, why: `The ${k.name} have no ruler to strike` };
    AG.People.die(R, 'a mysterious death');
    k.stability = Math.max(0, k.stability - 0.25); k.legit = Math.max(0, k.legit - 0.15);
    ev('ruler', `${R.name}, ruler of the ${k.name}, dies a sudden and mysterious death`, { x: c.x, y: c.y, polity: k.id, person: R.id, cause: 'divine will' });
    Civ.succession(k, R);
    // a disputed succession: an outlying town may go its own way
    if (k.cities.length > 2 && rnd() < 0.5) { const far = k.cities.map((id) => Civ.cities[id]).filter((q) => q.alive && q.id !== k.capital).sort((a, b) => AG.dist2(b.x, b.y, c.x, c.y) - AG.dist2(a.x, a.y, c.x, c.y))[0]; if (far) AG.War.secede(far, 'in the disputed succession'); }
    return { ok: true, text: `${R.name} is dead` };
  };
  Rm.hero = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a community' };
    const young = able(c).filter((P) => { const a = AG.People.age(P); return a >= 16 && a < 40; });
    const P = young.length ? young[(rnd() * young.length) | 0] : champion(c);
    if (!P) return { ok: false, why: 'Nobody there can be a hero' };
    P.traits |= AG.TR.hero | AG.TR.brave; P.traits &= ~AG.TR.coward;
    P.skills[AG.SK.FIGHT] = 255; P.fame += 15; P.job = AG.J.SOLDIER; P.frail = 0;
    const k = Civ.kingdoms[c.kd]; if (AG.Warfare) { AG.Warfare.ensure(k); k.general = P.id; P.genWins = Math.max(P.genWins || 0, 2); }
    AG.People.remember(P, AG.People.MK.MIRACLE, { v: 0.9, s: 1, d: 'chosen by the heavens as a hero', core: true });
    if (P.body >= 0 && AG.U.alive[P.body]) { AG.U.mhp[P.body] *= 2; AG.U.hp[P.body] = AG.U.mhp[P.body]; AG.U.dmg[P.body] *= 2; }
    AG.FX.burst(c.x, c.y, 'holy', 30);
    ev('god', `${P.name} of ${c.name} rises as a hero of legend, and leads the armies of the ${k.name}`, { x: c.x, y: c.y, comm: c.id, person: P.id, cause: 'divine will' });
    return { ok: true, text: `${P.name} is a hero` };
  };
  Rm.prophet = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a community' };
    const k = Civ.kingdoms[c.kd], ps = able(c).filter((P) => P.traits & AG.TR.pious), P = ps.length ? ps[0] : champion(c);
    if (!P) return { ok: false, why: 'Nobody there hears the call' };
    P.traits |= AG.TR.pious; P.job = AG.J.PRIEST; P.fame += 10;
    k.exp.watcher += 4;
    const before = Civ.religions.length;
    AG.War.foundReligion(k, c, true);
    const rel = Civ.religions[Civ.religions.length - 1];
    if (Civ.religions.length > before && rel) { rel.prophet = P.name; rel.name = rel.name.replace(/^(Way|Faith|Circle|Mysteries|Covenant) of/, `$1 of ${P.name} and`); }
    AG.People.remember(P, AG.People.MK.DREAM, { v: 0.9, s: 1, d: 'a vision from the heavens', core: true });
    AG.FX.burst(c.x, c.y, 'holy', 40);
    ev('faith', `${P.name} of ${c.name} has a vision and preaches a new faith${rel ? ': the ' + rel.name : ''}`, { x: c.x, y: c.y, comm: c.id, person: P.id, polity: k.id, cause: 'divine will' });
    return { ok: true, text: `${P.name} preaches the ${rel ? rel.name : 'new faith'}` };
  };

  // ------------------------------------------------------------ realms
  Rm.golden = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a realm' };
    const k = Civ.kingdoms[c.kd];
    k.golden = Math.floor(year()) + 60;
    k.stability = Math.min(1, k.stability + 0.3); k.legit = Math.min(1, k.legit + 0.3); k.unrest = 0; k.exhaustion = 0;
    for (const cid of k.cities) { const q = Civ.cities[cid]; if (!q.alive) continue; q.food += 80 + q.members.length; q.inspired = Math.max(q.inspired || 0, year() + 40); q.loyalty = 1; q.famine = false; }
    for (const I of k.inst) I.corrupt *= 0.3;
    AG.FX.burst(c.x, c.y, 'holy', 40);
    ev('god', `A golden age dawns for the ${k.name}: full granaries, wise councils, a flowering of arts and learning`, { x: c.x, y: c.y, polity: k.id, cause: 'divine will' });
    return { ok: true, text: `A golden age for the ${k.name}` };
  };
  Rm.revolution = function (x, y) {
    const Civ = AG.Civ, c = cityAt(x, y);
    if (!c) return { ok: false, why: 'Tap a realm' };
    const k = Civ.kingdoms[c.kd], cap = Civ.capitalOf(k) || c;
    if (k.gov < 2) Civ.setGov(k, 2, 'revolution');
    const old = k.ruler ? AG.People.get(k.ruler) : null;
    if (old && old.died === null) { old.rank = 0; if (rnd() < 0.5) AG.People.die(old, 'the revolution'); }
    k.republic = true; k.hereditary = false; k.inequality *= 0.5;
    for (const I of k.inst) { I.corrupt = 0; I.since = year(); }
    if (!k.inst.some((I) => I.kind === 'council')) k.inst.push({ kind: 'council', str: 0.6, legit: 0.8, corrupt: 0, since: year() });
    const P = champion(cap); if (P) { k.ruler = P.id; P.rank = 2; P.fame += 5; AG.People.remember(P, AG.People.MK.RULER, { v: 0.8, s: 1, d: 'chosen by the people of the ' + k.name, core: true }); }
    Civ.namePolity(k);
    k.stability = Math.max(0.2, k.stability - 0.15); k.legit = Math.min(1, k.legit + 0.25);
    AG.FX.burst(cap.x, cap.y, 'spark', 40);
    ev('government', `Revolution! The people rise${old ? ` against ${old.name}` : ''} and proclaim the ${k.name}${P ? `, with ${P.name} as its first leader` : ''}`, { x: cap.x, y: cap.y, polity: k.id, cause: 'revolution' });
    if (AG.Deeds) AG.Deeds.note('republic');
    return { ok: true, text: `The ${k.name} is proclaimed` };
  };
  Rm.unite = function (A, B) { // B joins A
    const Civ = AG.Civ;
    if (A === B || !A.alive || !B.alive) return { ok: false, why: 'Two different realms' };
    if (A.war[B.id]) AG.War.peace(A, B, 'to become one');
    const n = B.cities.length, name = B.name;
    for (const cid of B.cities.slice()) AG.War.transferCity(Civ.cities[cid], A);
    for (const cid of A.cities) { const q = Civ.cities[cid]; q.loyalty = Math.max(q.loyalty, 0.8); }
    const cap = Civ.capitalOf(A);
    ev('alliance', `The ${name} and the ${A.name} become one realm (${n} communities join)`, { x: cap ? cap.x : -1, y: cap ? cap.y : -1, polity: A.id, cause: 'divine will' });
    return { ok: true, text: `${name} joins the ${A.name}` };
  };
  // half a community walks to a new home the god points to, and founds a village there
  Rm.exodus = function (c, x, y) {
    const Civ = AG.Civ, Wd = AG.World, i = AG.clamp(y | 0, 0, AG.H - 1) * AG.W + AG.clamp(x | 0, 0, AG.W - 1);
    if (!c || !c.alive) return { ok: false, why: 'Tap a community first' };
    if (!Wd.passLand(i) || Wd.ice[i] || Wd.owner[i] >= 0) return { ok: false, why: 'Point to open, unclaimed land' };
    const ps = able(c).concat(AG.Civ.persons(c).filter((P) => P.job === AG.J.CHILD)), go = ps.filter(() => rnd() < 0.5);
    if (go.length < 6) return { ok: false, why: `Too few in ${c.name} to set out` };
    const k = Civ.kingdoms[c.kd];
    const site = Civ.findSite(x, y, 6, !!c.nomadic) || { x: x + 0.5, y: y + 0.5 };
    const n = Civ.newCommunity(k, site.x, site.y, { nomadic: true, lang: c.lang, tech: c.tech, religion: c.religion, race: c.race, customs: c.customs, art: c.art, tradition: c.tradition });
    for (const P of go) { if (P.body >= 0 && AG.U.alive[P.body]) AG.Ent.remove(P.body); Civ.moveMember(P, n); AG.People.remember(P, AG.People.MK.FOUNDED, { v: 0.6, s: 0.8, d: n.name + ' (the new home)', core: true }); }
    n.food += 60;
    if (c.nomadic) Civ.campBuild(n); else { Civ.settle(n); n.wood += 120; n.stone += 80; n.food += 100; for (let q = 0; q < 12; q++) Civ.planBuild(n, true); }
    Civ.recomputeBorders();
    ev('settle', `${go.length} people of ${c.name} set out on an exodus and found ${n.name}`, { x: n.x, y: n.y, comm: n.id, polity: k.id, cause: 'divine will' });
    return { ok: true, text: `${go.length} set out to found ${n.name}` };
  };

  // ------------------------------------------------------------ towns
  // A new realm with a built town: a village of its neighbours' age, or a metropolis of the most
  // advanced age in the world.
  Rm.found = function (x, y, big) {
    const Civ = AG.Civ, Wd = AG.World, T = AG.Tech, i = AG.clamp(y | 0, 0, AG.H - 1) * AG.W + AG.clamp(x | 0, 0, AG.W - 1);
    if (AG.Geo.phase !== 'history' || !AG.Life.people) return { ok: false, why: 'Towns can be founded after the Dawn' };
    if (!Wd.passLand(i) || Wd.ice[i] || Wd.owner[i] >= 0) return { ok: false, why: 'Point to open, unclaimed land' };
    const R = AG.Life.people.regions.values().next().value; if (!R) return { ok: false, why: 'No people yet' };
    const near = Civ.nearestCity(x, y, -1, 1e9);
    let era = 2; for (const q of Civ.cities) if (q.alive && big) era = Math.max(era, q.era || 0);
    if (!big) era = Math.max(2, near ? near.era || 0 : 2); else era = Math.max(4, era);
    const L = near ? AG.Lang.create(AG.Lang.get(near.lang), Math.floor(year())) : AG.Lang.create(null, Math.floor(year()));
    const k = Civ.newPolity(L.id, big ? 3 : era >= 4 ? 2 : 1, { religion: near ? near.religion : -1 }); if (!k) return { ok: false, why: 'The world holds too many realms' };
    const site = Civ.findSite(x, y, 6, false) || { x: x + 0.5, y: y + 0.5 };
    const c = Civ.foundBand(k, site.x, site.y, L.id, R, near, big ? 34 : 22, true);
    for (const t of T.LIST) if (t.era <= era && !T.banned.has(t.key)) c.tech[t.id] = 1;
    c.era = T.eraOf(c);
    Civ.settle(c);
    // more people for a metropolis (a whole generation of townsfolk)
    if (big) for (let q = 0; q < 90; q++) {
      const g = new Uint8Array(AG.Life.GL), a = (rnd() * R.nres) | 0, b = (rnd() * R.nres) | 0;
      AG.Life.breed(g, 0, R.res, a * AG.Life.GL, R.res, b * AG.Life.GL, AG.rnd, 1);
      const age = q < 62 ? 16 + rnd() * 34 : rnd() * 15, P = AG.People.create({ gen: g, comm: c.id, born: year() - age, x: c.x + (rnd() - 0.5) * 8, y: c.y + (rnd() - 0.5) * 8, adult: age >= 15 });
      if (age < 15) P.job = AG.J.CHILD;
      c.members.push(P.id);
    }
    c.radius = big ? 13 : 8; c.kind = big ? 'city' : 'village';
    c.food += big ? 900 : 200; c.wood += big ? 1500 : 300; c.stone += big ? 1500 : 200; c.metal += big ? 200 : 0; c.gold += big ? 300 : 0;
    Civ.recomputeBorders();
    if (big) { // the institutions of a great city, and homes for all its people
      const BT = AG.BT, want = [[BT.KEEP, 1], [BT.TEMPLE, 2], [BT.MARKET, 2], [BT.WORKSHOP, 2], [BT.GRANARY, 2], [BT.TOWER, 2], [BT.DOCK, c.coastal ? 1 : 0], [BT.HOUSE, 4]];
      for (const [type, n] of want) { let have = Civ.counts(c, true)[type]; for (let q = 0; q < 40 && have < n; q++) { const s = Civ.findSpot(c, type) || ringSpot(c, type, q); if (!s) break; const b = Civ.placeBuilding(c, type, s.bx, s.by, true); if (type === BT.KEEP) c.keep = b.id; have++; } }
    }
    for (let q = 0; q < (big ? 120 : 30); q++) Civ.planBuild(c, true);
    if (big) { let have = Civ.counts(c, true)[AG.BT.HOUSE]; for (let q = 0; q < 40 && have < Math.ceil(c.members.length / 7); q++) { const s = Civ.findSpot(c, AG.BT.HOUSE) || ringSpot(c, AG.BT.HOUSE, q); if (!s) break; Civ.placeBuilding(c, AG.BT.HOUSE, s.bx, s.by, true); have++; } }

    Civ.namePolity(k); Civ.succession(k, null);
    Civ.recomputeBorders();
    AG.FX.burst(c.x, c.y, 'holy', 40);
    ev('god', big ? `A god raises the city of ${c.name}, seat of the ${k.name}, in the ${T.ERAS[c.era]}` : `A god founds the village of ${c.name}, the ${k.name}`, { x: c.x, y: c.y, comm: c.id, polity: k.id, cause: 'divine will' });
    if (AG.Deeds) AG.Deeds.note('town');
    return { ok: true, text: `${c.name} is founded (${T.ERAS[c.era]})`, c };
  };

  // the nearest free spot for a building, scanning outward in rings from the centre
  function ringSpot(c, type, skip) {
    const d = AG.BUILD[type];
    for (let r = 1; r < c.radius + 6; r++) for (let t = 0; t < 8 + r * 4; t++) {
      const a = (t / (8 + r * 4)) * Math.PI * 2 + (skip || 0) * 0.37, bx = Math.round(c.x + Math.cos(a) * r - d.w / 2), by = Math.round(c.y + Math.sin(a) * r - d.h / 2);
      if (AG.Civ.fits(c, type, bx, by)) return { bx, by };
    }
    return null;
  }
  Rm.ringSpot = ringSpot;

  // ------------------------------------------------------------ great wonders
  // One of each in the world. learn: invention; stab and legit: the realm's order; trade: gold.
  const WONDERS = [
    { key: 'mound', name: 'the Great Mound', era: 2, fx: { stab: 0.06, legit: 0.06 } },
    { key: 'pyramid', name: 'the Great Pyramid', era: 4, fx: { stab: 0.1, legit: 0.15 } },
    { key: 'colossus', name: 'the Colossus', era: 5, coastal: true, fx: { trade: 0.6, stab: 0.05 } },
    { key: 'library', name: 'the Great Library', era: 6, fx: { learn: 0.4 } },
    { key: 'cathedral', name: 'the Grand Cathedral', era: 7, fx: { stab: 0.12, legit: 0.1 } },
    { key: 'observatory', name: 'the Great Observatory', era: 8, fx: { learn: 0.3 } },
    { key: 'irontower', name: 'the Iron Tower', era: 9, fx: { trade: 0.4, stab: 0.08 } },
    { key: 'stadium', name: 'the Grand Stadium', era: 10, fx: { stab: 0.15, legit: 0.05 } },
    { key: 'worldtower', name: 'the World Tower', era: 12, fx: { learn: 0.2, trade: 0.4 } },
    { key: 'elevator', name: 'the Space Elevator', era: 13, fx: { learn: 0.3, trade: 0.3 } },
  ];
  Rm.WONDERS = WONDERS;
  Rm.wonderOf = (key) => WONDERS.find((w) => w.key === key) || null;
  Rm.standing = function () { const out = []; for (const b of AG.Civ.buildings) if (b && b.alive && b.type === AG.BT.WONDER) out.push(b); return out; };
  Rm.built = function () { const s = new Set(); for (const b of Rm.standing()) s.add(b.wonder); for (const k of Rm.everBuilt || []) s.add(k); return s; };
  Rm.everBuilt = [];
  // the newest wonder of its age a community could raise (that nobody has raised yet)
  Rm.nextWonder = function (c) {
    const got = Rm.built();
    for (let q = WONDERS.length - 1; q >= 0; q--) { const w = WONDERS[q]; if (w.era <= (c.era || 0) && !got.has(w.key) && (!w.coastal || c.coastal)) return w; }
    return null;
  };
  function wonderSpot(c) {
    const Civ = AG.Civ;
    for (let r = 2; r < c.radius + 8; r += 1) for (let t = 0; t < 16; t++) {
      const a = (t / 16) * Math.PI * 2 + r, bx = Math.round(c.x + Math.cos(a) * r - 2), by = Math.round(c.y + Math.sin(a) * r - 2);
      if (Civ.fits(c, AG.BT.WONDER, bx, by)) return { bx, by };
    }
    return null;
  }
  Rm.raise = function (c, byGod) {
    const Civ = AG.Civ;
    if (!c || !c.alive) return { ok: false, why: 'Tap a community' };
    if (c.nomadic) return { ok: false, why: `${c.name} is a camp; wonders need a settled town` };
    const w = Rm.nextWonder(c);
    if (!w) return { ok: false, why: `Every wonder of ${c.name}'s age already stands somewhere` };
    let s = wonderSpot(c);
    if (!s && byGod) { // the god clears the ground
      for (const bid of c.buildings.slice()) { const b = Civ.buildings[bid]; if (b.type === AG.BT.HOUSE || b.type === AG.BT.HUT || b.type === AG.BT.FARM) { Civ.destroyBuilding(bid, -1, true); s = wonderSpot(c); if (s) break; } }
    }
    if (!s) return { ok: false, why: `There is no room for a wonder at ${c.name}` };
    const b = Civ.placeBuilding(c, AG.BT.WONDER, s.bx, s.by, true);
    b.wonder = w.key; b.wname = w.name; b.raised = Math.floor(year());
    Rm.everBuilt.push(w.key);
    const k = Civ.kingdoms[c.kd];
    AG.FX.burst(b.cx, b.cy, 'holy', 50);
    ev('god', `The ${k.name} raise ${w.name} at ${c.name}${byGod ? ', by the grace of the heavens' : ''}`, { x: b.cx, y: b.cy, comm: c.id, polity: k.id, cause: byGod ? 'divine will' : 'the wealth of a great realm' });
    if (AG.Deeds) AG.Deeds.note('wonder');
    if (AG.Render) AG.Render.invalidate && AG.Render.invalidate();
    return { ok: true, text: `${w.name} rises at ${c.name}`, b };
  };

  // ------------------------------------------------------------ the space program
  Rm.launch = function (c, byGod) {
    const Civ = AG.Civ, T = AG.Tech;
    if (!c || !c.alive) return { ok: false, why: 'Tap a community' };
    if (!T.knows(c, 'rocketry')) return { ok: false, why: `${c.name} has no rockets yet (rocketry comes in the Atomic age)` };
    const k = Civ.kingdoms[c.kd];
    Rm.launches++;
    if (AG.God && AG.God.summon && (byGod || c.materialized)) AG.God.summon('rocket', c.x + 1, c.y - 1);
    let text = `A rocket climbs into the sky from ${c.name}`, worth = byGod || !k.launched;
    if (!k.launched) { k.launched = true; text = `The ${k.name} launch their first rocket into the sky from ${c.name}`; }
    if (T.knows(c, 'spaceflight') && rnd() < (byGod ? 0.6 : 0.3)) {
      k.colonies = (k.colonies || 0) + 1; Rm.colonies++;
      const far = T.knows(c, 'warp'), place = AG.Lang.personName(k.lang, rnd() < 0.5 ? 0 : 1);
      text = far ? `A starship of the ${k.name} reaches a distant star and founds the colony of New ${place}` : `The ${k.name} found a colony on ${k.colonies === 1 ? 'the moon' : 'the world they call ' + place}`;
      if (AG.Deeds) AG.Deeds.note(far ? 'starcolony' : 'colony');
      worth = true;
    }
    if (worth) ev('invention', text, { x: c.x, y: c.y, comm: c.id, polity: k.id, cause: 'spaceflight' });
    return { ok: true, text };
  };

  // ------------------------------------------------------------ the year
  Rm.yearStep = function (dy) {
    const Civ = AG.Civ;
    // wonders' effects, by the realm that holds each one now
    for (const k of Civ.kingdoms) if (k.alive) k.wonderFx = null;
    for (const b of Rm.standing()) {
      const k = Civ.kingdoms[b.kd], w = Rm.wonderOf(b.wonder); if (!k || !w) continue;
      const fx = k.wonderFx || (k.wonderFx = { learn: 0, stab: 0, legit: 0, trade: 0 });
      for (const key in w.fx) fx[key] += w.fx[key];
    }
    for (const k of Civ.kingdoms) {
      if (!k.alive) continue;
      const fx = k.wonderFx, cap = Civ.capitalOf(k);
      if (fx) { k.stability = Math.min(1, k.stability + fx.stab * dy * 0.1); k.legit = Math.min(1, k.legit + fx.legit * dy * 0.1); if (cap && fx.trade) { cap.gold += fx.trade * dy * 10; cap.goods += fx.trade * dy * 5; } }
      if (k.golden && year() < k.golden) { k.stability = Math.min(1, k.stability + dy * 0.03); for (const cid of k.cities) { const q = Civ.cities[cid]; if (q.alive && q.famine) q.food += 20 * dy; } }
      // rich states raise wonders of their own
      if (cap && k.gov >= 3 && !cap.nomadic && cap.members.length >= 150 && cap.surplus > 0 && rnd() < dy * 0.003) Rm.raise(cap, false);
      // the space program
      if (cap && AG.Tech.knows(cap, 'rocketry') && rnd() < dy * (AG.Tech.knows(cap, 'spaceflight') ? 0.06 : 0.02)) Rm.launch(cap, false);
    }
  };

  // ------------------------------------------------------------ state
  Rm.state = () => ({ launches: Rm.launches, colonies: Rm.colonies, everBuilt: Rm.everBuilt.slice() });
  Rm.restore = function (s) { s = s || {}; Rm.launches = s.launches || 0; Rm.colonies = s.colonies || 0; Rm.everBuilt = (s.everBuilt || []).slice(); };
  Rm.reset = function () { Rm.launches = 0; Rm.colonies = 0; Rm.everBuilt = []; };
})();
