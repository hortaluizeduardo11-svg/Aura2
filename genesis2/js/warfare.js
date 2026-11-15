/* AURA: Genesis 2 — warfare.js
 * War through the ages, in the manner of the grand strategy games. Every army fights with the
 * arms of its age (warbands to plasma legions) and the multiplied weight of its inventions; it is
 * led by a general (the best fighter of the realm, who grows famous with victories and may fall
 * in battle); the land favours defenders (hills, mountains, forests, rivers), winter freezes
 * campaigns in cold country, and armies weaken at the end of long supply lines that roads,
 * railways, engines and aircraft lengthen. Each war keeps a score for both sides, and the peace
 * follows it: a white peace, tribute, vassalage, or the annexation of a city. The war room lists
 * every war with its fronts, generals and score. war.js calls in here; the god tools (declare,
 * peace, alliance, revolt, levy, fortify, blitz, the bomb) live in god.js. */
'use strict';
(function () {
  const AG = window.AG;
  const rnd = () => AG.rnd();
  const Wf = (AG.Warfare = {});
  const MAXK = 256;
  const year = () => AG.Geo.year;

  // ------------------------------------------------------------ arms of each age
  const DOCTRINE = ['hunting warbands', 'bowmen', 'clubmen and archers', 'copper-armed warriors', 'bronze spearmen and chariots', 'iron-armed legions', 'phalanxes and cavalry',
    'knights and crossbowmen', 'pike and musket regiments', 'riflemen and field guns', 'infantry and tank divisions', 'jet wings and mechanised armies', 'drones and special forces', 'robot legions and orbital strikes', 'plasma legions and warp fleets'];
  Wf.DOCTRINE = DOCTRINE;
  Wf.armsOf = (c) => DOCTRINE[Math.min(DOCTRINE.length - 1, c ? c.era || 0 : 0)];
  // the weight of a community's weapons (multiplies fighting power; battles follow Lanchester's
  // square law, so a gap of ages is decisive, as tanks against spearmen should be)
  const ARMS = [['bow', 1.25], ['bronze', 1.3], ['iron', 1.2], ['chariots', 1.2], ['riding', 1.1], ['steel', 1.15], ['crossbow', 1.1], ['chivalry', 1.35], ['gunpowder', 1.3], ['muskets', 1.4],
    ['rifling', 1.5], ['railways', 1.1], ['tanks', 1.6], ['flight', 1.3], ['radio', 1.1], ['jets', 1.2], ['rocketry', 1.15], ['computers', 1.1], ['satellites', 1.15], ['robotics', 1.3], ['ai', 1.3], ['nanotech', 1.2], ['fusion', 1.1], ['warp', 1.3]];
  Wf.arms = function (c) {
    let m = 1;
    for (const [t, f] of ARMS) if (AG.Tech.knows(c, t)) m *= f;
    return m * (1 + Math.min(2, (c.future || 0) * 0.04));
  };
  const ensure = (k) => { if (!k.score) k.score = new Float32Array(MAXK); if (k.general === undefined) k.general = 0; if (k.vassal === undefined) k.vassal = -1; return k; };
  Wf.ensure = ensure;

  // ------------------------------------------------------------ generals
  // The realm's best fighter among its soldiers leads its armies (a martial ruler leads in person).
  Wf.general = function (k) {
    ensure(k);
    const People = AG.People, Civ = AG.Civ;
    let G = k.general ? People.get(k.general) : null;
    if (G && G.died === null && G.comm >= 0 && Civ.cities[G.comm] && Civ.cities[G.comm].kd === k.id) return G;
    let best = null, bs = -1;
    for (const cid of k.cities) {
      const c = Civ.cities[cid];
      if (!c.alive) continue;
      for (const P of Civ.persons(c)) {
        if (P.job !== AG.J.SOLDIER && P.id !== k.ruler) continue;
        const s = P.skills[AG.SK.FIGHT] + (P.traits & AG.TR.brave ? 30 : 0) + (P.id === k.ruler ? 10 : 0);
        if (s > bs) { bs = s; best = P; }
      }
    }
    k.general = best ? best.id : 0;
    if (best) { best.genWins = best.genWins || 0; }
    return best;
  };
  Wf.generalMul = function (k) {
    const G = Wf.general(k);
    if (!G) return 1;
    return 1 + G.skills[AG.SK.FIGHT] / 400 + Math.min(0.3, (G.genWins || 0) * 0.03) + (G.traits & AG.TR.brave ? 0.05 : 0) - (G.traits & AG.TR.coward ? 0.1 : 0);
  };

  // ------------------------------------------------------------ the field
  // Defender's ground, the season and the supply line.
  Wf.field = function (src, tgt, A, B) {
    const Wd = AG.World, W = AG.W, i = AG.clamp(tgt.y | 0, 0, AG.H - 1) * W + AG.clamp(tgt.x | 0, 0, W - 1);
    const e = Wd.elev[i], modern = (src.era || 0) >= 10;
    let def = 1, att = 1;
    const notes = [];
    if (e >= AG.MOUNTAIN) { def *= 1.5; notes.push('in the mountains'); } else if (e >= AG.HILL) { def *= 1.25; notes.push('in the hills'); }
    if (Wd.veg[i] >= 165) { def *= 1.15; notes.push('in the forest'); }
    if (tgt.river && !AG.Tech.knows(src, 'engineering')) { def *= 1.1; notes.push('across the river'); }
    if (modern) def = 1 + (def - 1) * 0.5; // (air power flattens the ground)
    // supply: an army is strong only within reach of home
    const d = Math.hypot(src.x - tgt.x, src.y - tgt.y), K = (t) => AG.Tech.knows(src, t);
    const reach = 60 + (K('roads') ? 40 : 0) + (K('railways') ? 120 : 0) + (K('combustion') ? 200 : 0) + (K('flight') ? 400 : 0) + (K('spaceflight') ? 2000 : 0);
    if (d > reach) { att *= Math.max(0.45, reach / d); notes.push('at the end of a long supply line'); }
    // winter in cold country (the season's cold, the climate's chill)
    let winter = false;
    if (AG.Sky && AG.Sky.season && AG.Sky.season() === 3 && Wd.tbase[i] < 0.38 && !K('combustion')) { att *= 0.7; winter = true; notes.push('in the depth of winter'); }
    return { def, att, winter, notes, dist: d };
  };

  // ------------------------------------------------------------ war score
  Wf.scoreOf = (A, B) => ensure(A).score[B.id];
  Wf.addScore = function (A, B, v) { ensure(A); ensure(B); A.score[B.id] = AG.clamp(A.score[B.id] + v, 0, 100); };
  Wf.net = (A, B) => ensure(A).score[B.id] - ensure(B).score[A.id];
  Wf.onDeclare = function (A, B) { ensure(A); ensure(B); A.score[B.id] = B.score[A.id] = 0; };
  // After a battle: score, the generals' fame, winter losses.
  Wf.afterBattle = function (A, B, src, tgt, aWins, lossA, lossB, captured, field) {
    const People = AG.People;
    if (aWins) Wf.addScore(A, B, 4 + lossB * 0.6 + (captured ? 20 : 0)); else Wf.addScore(B, A, 4 + lossA * 0.6);
    const W = aWins ? A : B, L = aWins ? B : A, G = Wf.general(W), GL = Wf.general(L);
    if (G) {
      G.genWins = (G.genWins || 0) + 1;
      People.remember(G, People.MK.VICTORY, { v: 0.7, s: 0.8, d: `leading the ${W.name} at ${tgt.name}` });
      if (G.genWins === 3 || G.genWins === 8) AG.History.event('battle', `${G.name}, general of the ${W.name}, wins a ${G.genWins === 3 ? 'third' : 'eighth'} victory at ${tgt.name}`, { x: tgt.x, y: tgt.y, polity: W.id, person: G.id, cause: 'war' });
    }
    if (GL && rnd() < 0.08) { People.die(GL, `leading the ${L.name} at ${tgt.name}`); L.general = 0; AG.History.event('battle', `${GL.name}, general of the ${L.name}, falls at ${tgt.name}`, { x: tgt.x, y: tgt.y, polity: L.id, person: GL.id, cause: 'war' }); }
    if (field && field.winter) { // frost takes some of the attackers
      const ps = AG.Civ.persons(src).filter((P) => P.job === AG.J.SOLDIER);
      for (let k = 0; k < Math.ceil(ps.length * 0.06); k++) People.die(ps[(rnd() * ps.length) | 0], 'frozen on a winter campaign');
    }
    A.lastBattle = B.lastBattle = { year: Math.floor(year()), at: tgt.name, x: tgt.x, y: tgt.y, winner: W.id, lossA, lossB };
  };

  // ------------------------------------------------------------ peace terms
  // The side ahead in the war score sets the terms: annexation of a city, vassalage, tribute, or
  // a white peace when neither has the upper hand.
  Wf.makePeace = function (A, B, reason) {
    const net = Wf.net(A, B), Wn = net >= 0 ? A : B, L = net >= 0 ? B : A, gap = Math.abs(net), Civ = AG.Civ;
    let terms = 'white', tribute = null;
    if (gap >= 60 && L.cities.length >= 2) terms = 'annex';
    else if (gap >= 35 && Wn.gov >= 2) terms = 'vassal';
    else if (gap >= 15 && Wn.gov >= 2) terms = 'tribute';
    if (terms !== 'white') tribute = { payer: L, to: Wn };
    AG.War.peace(A, B, reason, tribute);
    if (terms === 'annex') { // the loser's city nearest the winner (never its capital) changes hands
      const wc = Civ.capitalOf(Wn);
      let best = null, bd = 1e18;
      for (const cid of L.cities) { const c = Civ.cities[cid]; if (!c.alive || cid === L.capital) continue; const d = wc ? AG.dist2(c.x, c.y, wc.x, wc.y) : 0; if (d < bd) { bd = d; best = c; } }
      if (best) { AG.War.transferCity(best, Wn); AG.History.event('peace', `By the treaty, ${best.name} passes from the ${L.name} to the ${Wn.name}`, { x: best.x, y: best.y, polity: Wn.id, comm: best.id, cause: 'war' }); }
    } else if (terms === 'vassal') { ensure(L).vassal = Wn.id; AG.History.event('peace', `The ${L.name} bow to the ${Wn.name} and become their vassals`, { x: AG.Civ.capitalOf(L) ? AG.Civ.capitalOf(L).x : -1, y: AG.Civ.capitalOf(L) ? AG.Civ.capitalOf(L).y : -1, polity: Wn.id, cause: 'war' }); }
    ensure(A).score[B.id] = 0; ensure(B).score[A.id] = 0;
    return terms;
  };
  // a beaten side sues for peace sooner
  Wf.peaceWish = (A, B) => Math.abs(Wf.net(A, B)) / 100;

  // ------------------------------------------------------------ vassals
  Wf.yearStep = function () {
    for (const k of AG.Civ.kingdoms) {
      if (!k.alive) continue;
      ensure(k);
      if (k.vassal >= 0) {
        const O = AG.Civ.kingdoms[k.vassal];
        if (!O || !O.alive || O.war[k.id]) { k.vassal = -1; continue; }
        k.tribute[O.id] = O.id;
        k.opinion[O.id] = O.opinion[k.id] = Math.max(k.opinion[O.id], 30); // (vassals keep the peace with their lords)
        if (k.pop > O.pop * 1.5 && rnd() < 0.02) { k.vassal = -1; k.tribute[O.id] = -1; AG.History.event('war', `The ${k.name} throw off the rule of the ${O.name}`, { polity: k.id, cause: 'independence' }); }
      }
    }
  };
  // vassals march with their lords
  Wf.joinWars = function (A, B) {
    for (const C of AG.Civ.kingdoms) {
      if (!C.alive || C === A || C === B) continue;
      ensure(C);
      const side = C.vassal === A.id ? A : C.vassal === B.id ? B : null;
      if (!side) continue;
      const foe = side === A ? B : A;
      if (!C.war[foe.id]) { C.war[foe.id] = foe.war[C.id] = 1; C.warSince[foe.id] = foe.warSince[C.id] = year(); }
    }
  };

  // ------------------------------------------------------------ the war room
  Wf.wars = function () {
    const out = [], ks = AG.Civ.kingdoms;
    for (const A of ks) {
      if (!A.alive) continue;
      for (let b = A.id + 1; b < ks.length; b++) {
        if (!A.war[b] || !ks[b].alive) continue;
        const B = ks[b], ca = AG.Civ.capitalOf(A), cb = AG.Civ.capitalOf(B), GA = Wf.general(A), GB = Wf.general(B);
        let fronts = 0; for (const cp of AG.War.campaigns) if ((cp.a === A.id && cp.b === B.id) || (cp.a === B.id && cp.b === A.id)) fronts++;
        out.push({ A, B, since: A.warSince[b], scoreA: Wf.scoreOf(A, B), scoreB: Wf.scoreOf(B, A), genA: GA, genB: GB, armsA: Wf.armsOf(ca), armsB: Wf.armsOf(cb), powA: ca ? Wf.arms(ca) : 1, powB: cb ? Wf.arms(cb) : 1, fronts, last: A.lastBattle && A.lastBattle === B.lastBattle ? A.lastBattle : null });
      }
    }
    return out.sort((p, q) => (q.scoreA + q.scoreB) - (p.scoreA + p.scoreB));
  };

  // ------------------------------------------------------------ the god of war's hand
  // levy: a community calls up its able adults
  Wf.levy = function (c) {
    const J = AG.J; let n = 0;
    for (const P of AG.Civ.persons(c)) { const a = AG.People.age(P); if (P.job !== J.SOLDIER && P.job !== J.CHILD && P.job !== J.ELDER && P.job !== J.PRIEST && a >= 16 && a < 50 && rnd() < 0.45) { P.job = J.SOLDIER; n++; } }
    if (n) AG.History.event('war', `${c.name} raises a levy of ${n}`, { x: c.x, y: c.y, comm: c.id, cause: 'divine will' });
    return n;
  };
  // blitz: every front of the realm attacks at once from this community, fast and hard
  Wf.blitz = function (c) {
    const A = AG.Civ.kingdoms[c.kd]; let n = 0;
    for (let b = 0; b < AG.Civ.kingdoms.length; b++) {
      if (!A.war[b]) continue;
      const B = AG.Civ.kingdoms[b]; let tgt = null, bd = 1e18;
      for (const cid of B.cities) { const q = AG.Civ.cities[cid]; if (!q.alive) continue; const d = AG.dist2(q.x, q.y, c.x, c.y); if (d < bd) { bd = d; tgt = q; } }
      if (!tgt) continue;
      AG.War.campaigns.push({ a: A.id, b, src: c.id, tgt: tgt.id, t: 0, march: Math.sqrt(bd) / 600, embodied: false, raid: false, blitz: true });
      n++;
    }
    if (n) AG.History.event('march', `The ${A.name} launch a lightning offensive from ${c.name}`, { x: c.x, y: c.y, polity: A.id, comm: c.id, cause: 'divine will' });
    return n;
  };
})();
