/* AURA: Genesis 2 — war.js
 * Relations between polities: opinion, alliances, tribute, raids and wars, and the faiths and
 * trade that bind or divide them.
 *  - Opinion follows shared language and faith, trade, border friction, grievances that people
 *    remember (and pass on), and the character of rulers.
 *  - Bands and tribes raid; chiefdoms and states make war. A campaign is fought by embodied
 *    armies (v1's muster, flanking wings and sieges) when its target is in view, and resolved
 *    statistically (Lanchester-style) when it isn't.
 *  - Religion: gods take their domains from what a people lived through; temples and megaliths
 *    found faiths; missionaries and merchants spread them.
 *  - Trade routes with carts (the wheel) and ships (sailing). Plagues break out in crowded places. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Ent = AG.Ent, Civ = AG.Civ, People = AG.People, Tech = AG.Tech, Flow = AG.Flow;
  const { W, H, BT, SP, TK, ST, FL, J, TR, SK, FT } = AG;
  const MK = People.MK;
  const rnd = AG.rnd, ri = AG.ri, pick = AG.pick, dist2 = AG.dist2;
  const War = (AG.War = { campaigns: [], battles: 0 });
  const year = () => AG.Geo.year;
  const MAXK = Civ.MAXK;
  const capX = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].x : -1);
  const capY = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].y : -1);
  War.reset = function () { War.campaigns.length = 0; War.battles = 0; };

  // ============================================================ falls, secessions
  War.fall = function (k, by) {
    if (!k.alive) return;
    k.alive = false; k.fell = year();
    for (let o = 0; o < Civ.kingdoms.length; o++) { k.war[o] = 0; Civ.kingdoms[o].war[k.id] = 0; }
    for (const s of Civ.squads) if (s.alive && (s.kd === k.id || s.enemy === k.id)) endSquad(s, 'recalled');
    if (k.gov >= 1 || by) AG.History.event('fall', `The ${k.name} is no more${by ? ', swallowed by the ' + by.name : ''}`, { polity: k.id, cause: by ? 'conquest' : 'dwindling' });
  };
  function transferCity(c, nk) {
    const ok = Civ.kingdoms[c.kd];
    const p = ok.cities.indexOf(c.id); if (p >= 0) ok.cities.splice(p, 1);
    nk.cities.push(c.id); c.kd = nk.id;
    for (const P of Civ.persons(c)) { if (P.body >= 0) { U.kd[P.body] = nk.id; U.flags[P.body] &= ~FL.KING; U.sq[P.body] = -1; } if (ok.ruler === P.id) { ok.ruler = 0; P.rank = 1; } }
    for (const bid of c.buildings) Civ.buildings[bid].kd = nk.id;
    if (ok.capital === c.id) ok.capital = ok.cities.length ? ok.cities[0] : -1;
    c.loyalty = 0.4; c.wallPlan = null;
    if (nk.capital < 0) nk.capital = c.id;
    if (!ok.cities.length) War.fall(ok, nk);
    if (AG.Render) AG.Render.bordersDirty = true;
  }
  War.transferCity = transferCity;
  War.captureCity = function (c, kd) {
    const nk = Civ.kingdoms[kd], ok = Civ.kingdoms[c.kd];
    AG.History.event('conquest', `The ${nk.name} conquers ${c.name} from the ${ok.name}`, { x: c.x, y: c.y, polity: nk.id, comm: c.id, cause: 'war' });
    nk.exp.war += 2; nk.conquests = (nk.conquests || 0) + 1;
    for (const P of Civ.persons(c)) People.remember(P, MK.DEFEAT, { v: -0.7, s: 0.8, d: c.name });
    // the conquered keep their grudge
    const cap = Civ.capitalOf(nk); if (cap) c.grievance.set(cap.id, (c.grievance.get(cap.id) || 0) + 6);
    transferCity(c, nk);
    // knowledge flows to the conquerors too
    for (const t of Tech.LIST) if (c.tech[t.id] && cap && !cap.tech[t.id] && Tech.prereqsMet(cap, t) && rnd() < 0.4) Tech.learn(cap, t, 'conquest');
  };
  War.secede = function (c, why) {
    const ok = Civ.kingdoms[c.kd];
    const nk = Civ.newPolity(c.lang, Math.min(ok.gov, 2), { religion: c.religion });
    if (!nk) return null;
    let leader = null, bv = -1;
    for (const P of Civ.persons(c)) { if (P.job === J.CHILD) continue; const v = (P.traits & TR.ambitious ? 3 : 0) + (P.goal === 5 ? 3 : 0) + P.fame * 0.3 + rnd(); if (v > bv) { bv = v; leader = P; } }
    transferCity(c, nk);
    Civ.namePolity(nk, c.name);
    if (leader && nk.gov >= 1) { nk.ruler = leader.id; leader.rank = 2; People.remember(leader, MK.RULER, { v: 0.8, s: 1, d: 'leader of ' + nk.name, core: true }); }
    AG.History.event('rebellion', `${c.name} breaks away${leader ? ' under ' + leader.name : ''}, founding the ${nk.name}`, { x: c.x, y: c.y, comm: c.id, polity: nk.id, cause: why || 'disloyalty' });
    if (ok.alive) { nk.opinion[ok.id] = ok.opinion[nk.id] = -60; if (ok.gov >= 2 && why !== 'collapse') War.declare(ok, nk, 'to crush the rebellion'); }
    return nk;
  };
  War.loyaltyCheck = function (k, dy) {
    const cap = Civ.capitalOf(k); if (!cap) return;
    for (const cid of k.cities.slice()) {
      const c = Civ.cities[cid]; if (c === cap) continue;
      let l = 1 - Math.sqrt(dist2(cap.x, cap.y, c.x, c.y)) / 240 - (c.religion !== k.religion ? 0.2 : 0) - (c.lang !== cap.lang ? 0.2 : 0) - k.exhaustion * 0.004 - (c.famine ? 0.15 : 0) - k.inequality * 0.2 + k.legit * 0.3;
      if (Tech.knows(cap, 'roads')) l += 0.15;
      c.loyalty = AG.clamp(l, 0, 1);
      if (c.loyalty < 0.3 && c.members.length > 25 && rnd() < dy * 0.05) War.secede(c, 'disloyalty');
    }
  };

  // ============================================================ diplomacy
  Civ.atWar = (a, b) => a >= 0 && b >= 0 && a !== b && Civ.kingdoms[a].war[b] === 1;
  War.declare = function (A, B, reason) {
    if (!A.alive || !B.alive || A === B || A.war[B.id]) return;
    A.war[B.id] = B.war[A.id] = 1;
    A.warSince[B.id] = B.warSince[A.id] = year();
    A.opinion[B.id] = B.opinion[A.id] = Math.min(A.opinion[B.id], -50);
    A.exp.war += 2; B.exp.war += 2;
    A.ally[B.id] = B.ally[A.id] = 0;
    const kind = A.gov <= 1 && B.gov <= 1 ? 'raids' : 'war';
    AG.History.event('war', `${kind === 'raids' ? 'Raiding begins between' : 'War breaks out between'} the ${A.name} and the ${B.name}${reason ? ' ' + reason : ''}`, { x: capX(A), y: capY(A), polity: A.id, cause: reason || 'old grievances' });
    // allies join
    for (const C of Civ.kingdoms) if (C.alive && C !== A && C !== B && C.ally[B.id] && !C.war[A.id]) { C.war[A.id] = A.war[C.id] = 1; C.warSince[A.id] = A.warSince[C.id] = year(); }
  };
  Civ.declareWar = War.declare;
  War.peace = function (A, B, reason, tribute) {
    if (!A.war[B.id]) return;
    A.war[B.id] = B.war[A.id] = 0;
    A.opinion[B.id] = B.opinion[A.id] = Math.max(-10, A.opinion[B.id]);
    for (const s of Civ.squads) if (s.alive && ((s.kd === A.id && s.enemy === B.id) || (s.kd === B.id && s.enemy === A.id))) endSquad(s, 'recalled');
    War.campaigns = War.campaigns.filter((c) => !((c.a === A.id && c.b === B.id) || (c.a === B.id && c.b === A.id)));
    if (tribute) { tribute.payer.tribute[tribute.to.id] = tribute.to.id; }
    AG.History.event('peace', `The ${A.name} and the ${B.name} make peace${tribute ? `; the ${tribute.payer.name} will pay tribute` : ''}${reason ? ' ' + reason : ''}`, { x: capX(A), y: capY(A), polity: A.id });
  };
  Civ.makePeace = War.peace;
  function rulerHas(k, t) { const R = k.ruler ? People.get(k.ruler) : null; return R && R.died === null && R.traits & TR[t] ? 1 : 0; }
  function diplomacy(dy) {
    const ks = Civ.kingdoms;
    for (let a = 0; a < ks.length; a++) {
      const A = ks[a]; if (!A.alive) continue;
      for (let b = a + 1; b < ks.length; b++) {
        const B = ks[b]; if (!B.alive) continue;
        const ca = Civ.capitalOf(A), cb = Civ.capitalOf(B);
        if (!ca || !cb) continue;
        const dist = Math.sqrt(dist2(ca.x, ca.y, cb.x, cb.y));
        if (dist > 260) continue;
        let base = A.lang === B.lang ? 18 : AG.Lang.similarity(A.lang, B.lang) > 0.4 ? 8 : -4;
        const ra = A.religion >= 0 ? Civ.religions[A.religion] : null, rb = B.religion >= 0 ? Civ.religions[B.religion] : null;
        if (ra && rb) { if (ra === rb) base += 22; else base -= (ra.tenet === 'zealous' || rb.tenet === 'zealous') ? 28 : 10; if (ra.tenet === 'pacifist' || rb.tenet === 'pacifist') base += 8; }
        base += Math.min(30, (A.trade[b] + B.trade[a]) * 0.5);
        A.trade[b] *= Math.pow(0.8, dy); B.trade[a] *= Math.pow(0.8, dy);
        const cont = Civ.contact[a * MAXK + b];
        base -= Math.min(30, cont / 5);
        if (dist < 70) base -= 6;
        // remembered wrongs: communities' grievances against each other
        let grudge = 0;
        for (const cid of A.cities) { const c = Civ.cities[cid]; for (const did of B.cities) grudge += (c.grievance.get(did) || 0); }
        for (const cid of B.cities) { const c = Civ.cities[cid]; for (const did of A.cities) grudge += (c.grievance.get(did) || 0); }
        base -= Math.min(40, grudge * 3);
        base -= (rulerHas(A, 'cruel') + rulerHas(B, 'cruel')) * 12 + (rulerHas(A, 'ambitious') + rulerHas(B, 'ambitious')) * 6;
        base += (rulerHas(A, 'kind') + rulerHas(B, 'kind')) * 8;
        base += A.mods[b] + B.mods[a];
        A.mods[b] *= Math.pow(0.9, dy); B.mods[a] *= Math.pow(0.9, dy);
        if (A.war[b]) base -= 25;
        let op = A.opinion[b];
        op += (base - op) * Math.min(1, 0.25 * dy) + (rnd() - 0.5) * 5;
        op = AG.clamp(op, -100, 100);
        A.opinion[b] = B.opinion[a] = op;
        if (!A.war[b]) {
          const hungry = (ca.famine || cb.famine) ? 1.6 : 1;
          if (op < -35 && (cont > 0 || dist < 90) && A.pop > 15 && B.pop > 15 && rnd() < dy * 0.12 * hungry) {
            const holy = ra && rb && ra !== rb && (ra.tenet === 'zealous' || rb.tenet === 'zealous');
            const reason = A.mods[b] < -20 ? 'as divine discord takes hold' : grudge > 4 ? 'to avenge old wrongs' : holy ? 'in a holy war' : ca.famine || cb.famine ? 'over food in a hungry year' : cont > 30 ? 'over disputed land' : rulerHas(A, 'cruel') ? 'at the whim of a cruel ruler' : 'over old grievances';
            const [x, y] = rnd() < 0.5 ? [A, B] : [B, A];
            War.declare(x, y, reason);
          } else if (op > 55 && !A.ally[b] && rnd() < dy * 0.05) {
            A.ally[b] = B.ally[a] = 1;
            AG.History.event('alliance', `The ${A.name} and the ${B.name} swear an alliance`, { x: capX(A), y: capY(A), polity: A.id });
          }
        } else {
          const long = year() - A.warSince[b] > 4;
          if (long && (op > -5 || A.exhaustion + B.exhaustion > 70 || A.mods[b] > 30) && rnd() < dy * 0.3) {
            const loser = A.losses - A.kills > B.losses - B.kills ? A : B, winner = loser === A ? B : A;
            War.peace(A, B, A.mods[b] > 30 ? 'by divine will' : 'after a weary war', winner.gov >= 2 && Math.abs(A.kills - B.kills) > 10 ? { payer: loser, to: winner } : null);
          }
        }
      }
    }
    // tribute: goods flow to the overlord
    for (const k of ks) { if (!k.alive) continue; for (let o = 0; o < ks.length; o++) if (k.tribute[o] >= 0 && ks[o].alive) { const cap = Civ.capitalOf(k), oc = Civ.capitalOf(ks[o]); if (cap && oc) { const g = Math.min(cap.food * 0.05, 5) * dy; cap.food -= g; oc.food += g; } } }
  }

  // ============================================================ campaigns
  // One campaign per war front: the attacker's strongest community marches on the nearest enemy.
  function strength(c) {
    let n = 0, f = 0;
    for (const P of Civ.persons(c)) { if (P.job === J.SOLDIER) { n += 1; f += 1 + P.skills[SK.FIGHT] / 60; } else if (P.job !== J.CHILD && P.job !== J.ELDER && P.sex === 1 && c.nomadic) { n += 0.4; f += 0.4; } }
    const k = (t) => Tech.knows(c, t);
    const mul = (k('bow') ? 1.25 : 1) * (k('bronze') ? 1.3 : 1) * (k('iron') ? 1.2 : 1) * (k('chariots') ? 1.2 : 1) * (k('riding') ? 1.1 : 1);
    return { n, power: f * mul };
  }
  function warTick(dy) {
    for (const k of Civ.kingdoms) {
      if (!k.alive) continue;
      k.atWar = false;
      for (let o = 0; o < Civ.kingdoms.length; o++) if (k.war[o]) { k.atWar = true; if (!War.campaigns.some((c) => c.a === k.id && c.b === o) && rnd() < dy * 0.8) launch(k, Civ.kingdoms[o]); }
      k.exhaustion *= Math.pow(0.85, dy);
    }
    for (let q = War.campaigns.length - 1; q >= 0; q--) {
      const cp = War.campaigns[q];
      const A = Civ.kingdoms[cp.a], B = Civ.kingdoms[cp.b], src = Civ.cities[cp.src], tgt = Civ.cities[cp.tgt];
      if (!A.alive || !B.alive || !A.war[B.id] || !src.alive || !tgt.alive || tgt.kd !== B.id) { War.campaigns.splice(q, 1); continue; }
      if (cp.embodied) { if (!Civ.squads[cp.squad] || !Civ.squads[cp.squad].alive) War.campaigns.splice(q, 1); continue; }
      cp.t += dy;
      if (cp.t < cp.march) continue;
      battle(cp, A, B, src, tgt);
      War.campaigns.splice(q, 1);
    }
  }
  function launch(A, B) {
    let src = null, tgt = null, bd = 1e18;
    for (const a of A.cities) for (const b of B.cities) { const ca = Civ.cities[a], cb = Civ.cities[b]; const d = dist2(ca.x, ca.y, cb.x, cb.y); if (d < bd) { bd = d; src = ca; tgt = cb; } }
    if (!src || bd > 200 * 200) return;
    const s = strength(src);
    if (s.n < 3) return;
    const cp = { a: A.id, b: B.id, src: src.id, tgt: tgt.id, t: 0, march: Math.sqrt(bd) / 120, embodied: false, raid: A.gov <= 1 };
    // in view: an embodied army marches; otherwise the campaign is resolved on arrival
    if (tgt.materialized && AG.mode === 'watch') { const sq = createSquad(A, B, src, tgt); if (sq) { cp.embodied = true; cp.squad = sq.id; } }
    War.campaigns.push(cp);
  }
  // Lanchester's square law with fortifications, technology and morale.
  function battle(cp, A, B, src, tgt) {
    War.battles++;
    const sa = strength(src), sb = strength(tgt);
    let pa = sa.power * (0.8 + rnd() * 0.4) * (cp.raid ? 0.8 : 1), pb = Math.max(0.5, sb.power) * (0.8 + rnd() * 0.4);
    if (tgt.walled) pb *= 1.8; else if (Tech.knows(tgt, 'fortification')) pb *= 1.2;
    if (Tech.knows(src, 'engineering') && tgt.walled) pb /= 1.4;
    const aWins = pa * pa > pb * pb;
    const lossA = Math.round(sa.n * AG.clamp((pb * pb) / (pa * pa + 1) * 0.35, 0.05, 0.8));
    const lossB = Math.round(Math.max(1, sb.n) * AG.clamp((pa * pa) / (pb * pb + 1) * 0.35, 0.05, 0.9));
    kill(src, lossA, `fighting the ${B.name}`, tgt); kill(tgt, lossB, `defending ${tgt.name}`, src);
    A.losses += lossA; B.losses += lossB; A.kills += lossB; B.kills += lossA;
    A.exhaustion += lossA * 2; B.exhaustion += lossB * 2;
    for (const P of Civ.persons(src)) if (P.job === J.SOLDIER) People.remember(P, aWins ? MK.VICTORY : MK.DEFEAT, { v: aWins ? 0.5 : -0.6, s: 0.6, d: tgt.name });
    for (const P of Civ.persons(tgt)) People.remember(P, MK.WAR, { v: -0.6, s: 0.7, d: `against the ${A.name} at ${tgt.name}` });
    tgt.grievance.set(src.id, (tgt.grievance.get(src.id) || 0) + 1 + lossB * 0.3);
    if (aWins) {
      if (cp.raid) { const loot = Math.min(tgt.food * 0.4, 20); tgt.food -= loot; src.food += loot; if (rnd() < 0.3) captives(tgt, src); AG.History.event('raid', `Raiders of the ${A.name} strike ${tgt.name}`, { x: tgt.x, y: tgt.y, polity: A.id, comm: tgt.id, cause: 'war' }); }
      else if (A.gov >= 2 && lossB >= sb.n * 0.5 && rnd() < 0.6) War.captureCity(tgt, A.id);
      else AG.History.event('battle', `The ${A.name} defeat the ${B.name} at ${tgt.name}`, { x: tgt.x, y: tgt.y, polity: A.id, comm: tgt.id, cause: 'war' });
    } else if (lossA > 2) AG.History.event('battle', `The ${B.name} hold ${tgt.name} against the ${A.name}`, { x: tgt.x, y: tgt.y, polity: B.id, comm: tgt.id, cause: 'war' });
  }
  function kill(c, n, cause, foe) {
    const ps = Civ.persons(c).filter((P) => P.job === J.SOLDIER || (c.nomadic && P.sex === 1 && P.job !== J.CHILD));
    for (let k = 0; k < n && ps.length; k++) {
      const P = ps.splice(ri(ps.length), 1)[0];
      const killer = foe ? Civ.persons(foe).find((Q) => Q.job === J.SOLDIER) : null;
      if (rnd() < 0.35) People.injure(P, -1, 0.5 + rnd() * 0.5, cause, killer ? killer.id : 0);
      else People.die(P, cause, killer ? killer.id : 0);
    }
  }
  function captives(from, to) {
    const ps = Civ.persons(from).filter((P) => P.job !== J.SOLDIER && People.age(P) > 10 && People.age(P) < 35);
    for (let k = 0; k < Math.min(3, ps.length); k++) { const P = ps.splice(ri(ps.length), 1)[0]; Civ.moveMember(P, to); People.remember(P, MK.EXILE, { v: -0.9, s: 1, d: 'captivity in ' + to.name, core: true }); }
  }

  // ============================================================ embodied armies (v1)
  function createSquad(A, B, src, tgt) {
    const f = Flow.get('L' + tgt.id, tgt.x, tgt.y, 'L');
    if (!f) return null;
    // soldiers are embodied at the edge of view on the road from their home
    const soldiers = Civ.persons(src).filter((P) => P.job === J.SOLDIER || (src.nomadic && P.sex === 1 && People.age(P) > 16 && People.age(P) < 45));
    if (soldiers.length < 3) return null;
    let ex = src.x, ey = src.y;
    if (!src.materialized) {
      const dx = src.x - tgt.x, dy = src.y - tgt.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d, 45);
      ex = tgt.x + (dx / d) * r; ey = tgt.y + (dy / d) * r;
    }
    const sq = { id: Civ.squads.length, alive: true, kd: A.id, enemy: B.id, target: tgt.id, src: src.id, stage: 0, t: 0, members: [], start: 0, flank: A.gov >= 2 || Tech.knows(src, 'bow'), rx: ex, ry: ey, wpL: null, wpR: null, cx: ex, cy: ey, borrowed: !src.materialized };
    for (let j = 0; j < Math.min(soldiers.length, 50); j++) {
      const P = soldiers[j];
      let i = P.body;
      if (i < 0 || !U.alive[i]) { i = Ent.spawnPerson(P, ex + (rnd() - 0.5) * 4, ey + (rnd() - 0.5) * 4); if (i < 0) continue; }
      U.sq[i] = sq.id; U.task[i] = TK.MARCH; U.st[i] = ST.IDLE; U.carry[i] = 0;
      if (sq.flank) { const g = j % 3; if (g === 1) U.flags[i] |= FL.FLANKL; else if (g === 2) U.flags[i] |= FL.FLANKR; }
      sq.members.push(i);
      People.remember(P, MK.WAR, { v: -0.2, s: 0.5, d: `marched on ${tgt.name}` });
    }
    sq.start = sq.members.length;
    if (sq.start < 3) return null;
    Civ.squads.push(sq);
    AG.History.event('march', `${sq.start} warriors of the ${A.name} march on ${tgt.name}${sq.flank ? ' in a pincer' : ''}`, { x: ex, y: ey, polity: A.id });
    return sq;
  }
  function computeFlanks(sq) {
    if (!sq.flank) return;
    const tc = Civ.cities[sq.target];
    let dx = tc.x - sq.rx, dy = tc.y - sq.ry; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx;
    const place = (sx) => {
      const x = tc.x - dx * 12 + px * 13 * sx, y = tc.y - dy * 12 + py * 13 * sx;
      for (let t = 0; t < 12; t++) { const nx = (x + (rnd() - 0.5) * t) | 0, ny = (y + (rnd() - 0.5) * t) | 0; if (nx > 1 && ny > 1 && nx < W - 1 && ny < H - 1 && Wd.passLand(ny * W + nx)) return { x: nx + 0.5, y: ny + 0.5 }; }
      return null;
    };
    sq.wpL = place(1); sq.wpR = place(-1);
  }
  function endSquad(sq, why) {
    if (!sq.alive) return;
    sq.alive = false;
    for (const m of sq.members) {
      if (!U.alive[m] || U.sq[m] !== sq.id) continue;
      U.sq[m] = -1; U.flags[m] &= ~(FL.FLANKL | FL.FLANKR);
      if (U.sp[m] === SP.CATAPULT) { Ent.kill(m, 'retired'); continue; }
      U.task[m] = TK.NONE; if (U.st[m] !== ST.FIGHT) U.st[m] = ST.IDLE;
      const P = Ent.person(m);
      if (P && why === 'victory') People.remember(P, MK.VICTORY, { v: 0.6, s: 0.7, d: Civ.cities[sq.target].name });
      if (sq.borrowed && P) { const home = Civ.cities[P.comm]; if (home && !home.materialized) Ent.remove(m); } // they walk home out of view
    }
    if (why === 'routed') { const tc = Civ.cities[sq.target]; AG.History.event('battle', `The warriors of the ${Civ.kingdoms[sq.kd].name} are routed at ${tc.name}`, { x: tc.x, y: tc.y, polity: sq.enemy }); }
  }
  War.endSquad = endSquad;
  function squadTick(sq) {
    sq.t += 10;
    const k = Civ.kingdoms[sq.kd], tc = Civ.cities[sq.target];
    if (!k.alive || !tc.alive || tc.kd === sq.kd || !k.war[tc.kd]) { endSquad(sq, tc.kd === sq.kd ? 'victory' : 'recalled'); return; }
    const alive = [];
    let cx = 0, cy = 0, near = 0, gathered = 0;
    for (const m of sq.members) {
      if (!U.alive[m] || U.sq[m] !== sq.id) continue;
      alive.push(m); cx += U.x[m]; cy += U.y[m];
      if (dist2(U.x[m], U.y[m], tc.x, tc.y) < 16 * 16) near++;
      if (dist2(U.x[m], U.y[m], sq.rx, sq.ry) < 12 * 12) gathered++;
    }
    sq.members = alive;
    const n = alive.length;
    if (n < Math.max(2, sq.start * 0.3)) { endSquad(sq, 'routed'); return; }
    sq.cx = cx / n; sq.cy = cy / n;
    if (sq.stage === 0 && (gathered >= n * 0.7 || sq.t > 400)) { sq.stage = 1; computeFlanks(sq); }
    else if (sq.stage === 1 && near >= n * 0.4) sq.stage = 2;
    if (sq.t > 7000) endSquad(sq, 'exhausted');
  }
  function captureCheck(c) {
    if (!c.materialized) return;
    const k = Civ.kingdoms[c.kd];
    const n = Ent.near(c.x, c.y, 7, 1);
    let enemies = 0, defenders = 0, ek = -1;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q]; if (U.pid[j] < 0) continue;
      const kj = U.kd[j];
      if (kj === c.kd) { if (U.job[j] !== J.CHILD) defenders++; }
      else if (kj >= 0 && k.war[kj] && U.sq[j] >= 0) { enemies++; ek = kj; }
    }
    if (enemies >= 3 && defenders === 0) { c.captureT += 20; if (c.captureT >= 100) { c.captureT = 0; const A = Civ.kingdoms[ek]; if (A.gov >= 2) War.captureCity(c, ek); else { const loot = Math.min(c.food * 0.5, 30); c.food -= loot; AG.History.event('raid', `Raiders of the ${A.name} sack ${c.name}`, { x: c.x, y: c.y, polity: A.id, comm: c.id }); for (const s of Civ.squads) if (s.alive && s.target === c.id) endSquad(s, 'victory'); } } }
    else if (c.captureT > 0) c.captureT -= 10;
  }
  Civ.hostileToKingdom = function (j, kd) {
    if (U.sp[j] === SP.PREDATOR && !(U.flags[j] & FL.DOMESTIC)) return true;
    if (U.pid[j] >= 0 || AG.SPECIES[U.sp[j]].kind === 'vehicle') { if (U.kd[j] >= 0 && U.kd[j] !== kd) return Civ.kingdoms[kd].war[U.kd[j]] === 1; }
    return (U.flags[j] & FL.MAD) !== 0;
  };
  function defenses() {
    for (const c of Civ.cities) {
      if (!c.alive || !c.materialized) continue;
      for (const bid of c.buildings) {
        const b = Civ.buildings[bid];
        if (b.prog < 1 || (b.type !== BT.TOWER && b.type !== BT.KEEP)) continue;
        const range = b.type === BT.TOWER ? 10 : 7;
        let target = -1;
        const n = Ent.near(b.cx, b.cy, range, 1, 64);
        for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (Civ.hostileToKingdom(j, c.kd)) { target = j; break; } }
        if (target < 0) continue;
        AG.Proj.fire(0, b.cx, b.cy - 1, U.x[target] + U.fx[target] * 0.5, U.y[target] + U.fy[target] * 0.5, b.type === BT.TOWER ? 8 : 5, c.kd, 1, -1);
      }
    }
  }
  War.planWalls = function (c) {
    let R = 7;
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.type === BT.FARM || b.type === BT.DOCK || b.type === BT.PEN) continue; const d = Math.sqrt(dist2(b.cx, b.cy, c.x, c.y)) + Math.max(b.w, b.h) / 2 + 2; if (d > R) R = d; }
    R = Math.min(R, c.radius - 1);
    const pts = [], seen = new Set(), steps = Math.ceil(2 * Math.PI * R * 1.6);
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2, deg = (a * 180) / Math.PI;
      if (deg % 90 < 8 || deg % 90 > 82) continue;
      const x = Math.round(c.x + Math.cos(a) * R), y = Math.round(c.y + Math.sin(a) * R), i = y * W + x;
      if (seen.has(i)) continue; seen.add(i); pts.push(i);
    }
    c.wallPlan = pts.reverse();
    c.towerPlan = Tech.knows(c, 'masonry') ? [45, 135, 225, 315].map((deg) => ({ x: Math.round(c.x + Math.cos((deg * Math.PI) / 180) * (R - 2.5)) - 1, y: Math.round(c.y + Math.sin((deg * Math.PI) / 180) * (R - 2.5)) - 1 })) : [];
  };
  War.buildWall = function (c, instant) {
    let placed = 0;
    while (c.wallPlan.length && placed < (instant ? 40 : 1)) {
      const i = c.wallPlan.pop();
      const x = i % W, y = (i / W) | 0;
      if (!Civ.fits(c, BT.WALL, x, y)) continue;
      if (c.stone < 2 && c.wood < 3) { c.wallPlan.push(i); break; }
      if (c.stone >= 2) c.stone -= 2; else c.wood -= 3;
      const b = Civ.placeBuilding(c, BT.WALL, x, y, instant);
      if (!instant) { c.site = b.id; return; }
      placed++;
    }
    if (!c.wallPlan.length) {
      c.wallPlan = null; c.walled = true;
      for (const p of c.towerPlan || []) if (Civ.fits(c, BT.TOWER, p.x, p.y) && c.stone >= 20) { c.stone -= 20; Civ.placeBuilding(c, BT.TOWER, p.x, p.y, true); }
    }
  };

  // ============================================================ religion
  War.templeBuilt = function (c, k) {
    if (k.religion < 0) foundReligion(k, c);
    else if (c.religion !== k.religion) convert(c, k.religion, null);
  };
  function foundReligion(k, c) {
    if (k.religion >= 0) return;
    const cands = Civ.kingdoms.filter((o) => o.alive && o.id !== k.id && o.religion >= 0 && k.opinion[o.id] > 15);
    if (cands.length && rnd() < 0.4) { const o = pick(cands); setReligion(k, o.religion); AG.History.event('faith', `The ${k.name} embraces the ${Civ.religions[o.religion].name}`, { x: capX(k), y: capY(k), polity: k.id }); return; }
    // the gods are what the people lived through
    const doms = Object.entries(k.exp).sort((a, b) => b[1] - a[1]);
    const n = 2 + ri(3), deities = [], used = new Set();
    for (const [dom, v] of doms) { if (deities.length >= n || (v < 0.5 && deities.length >= 1)) break; used.add(dom); deities.push({ name: AG.Lang.deityName(k.lang, dom), domain: dom, epithet: pick(AG.EPITHETS[dom] || AG.EPITHETS.watcher), myth: mythFor(k, dom) }); }
    for (const dom of ['harvest', 'sun', 'water', 'earth', 'death'].sort(() => rnd() - 0.5)) { if (deities.length >= n) break; if (!used.has(dom)) { used.add(dom); deities.push({ name: AG.Lang.deityName(k.lang, dom), domain: dom, epithet: pick(AG.EPITHETS[dom]), myth: '' }); } }
    const top = deities[0];
    const rel = { id: Civ.religions.length, name: `${pick(['Way', 'Faith', 'Circle', 'Mysteries', 'Covenant'])} of ${top.name}`, founder: k.id, color: AG.hsl(rnd() * 360, 0.65, 0.62), deities, tenet: AG.TENETS[top.domain] || 'devout', founded: year() };
    Civ.religions.push(rel);
    setReligion(k, rel.id);
    AG.History.event('faith', `The ${k.name} found the ${rel.name}, revering ${deities.map((d) => `${d.name} ${d.epithet}`).join(', ')}${top.myth ? ' — ' + top.myth : ''}`, { x: capX(k), y: capY(k), polity: k.id, cause: `their people lived through ${top.domain === 'fire' ? 'fire and eruptions' : top.domain === 'water' ? 'floods and rising seas' : top.domain === 'harvest' ? 'hunger and harvests' : top.domain === 'storm' ? 'storms and lightning' : top.domain === 'earth' ? 'earthquakes' : top.domain === 'war' ? 'war' : top.domain === 'plague' ? 'plague' : 'the turning sky'}` });
  }
  // a myth names a real disaster the people remember
  function mythFor(k, dom) {
    const kinds = { fire: ['eruption'], earth: ['quake'], water: ['flood', 'tsunami'], harvest: ['famine'], storm: ['lightning'], war: ['war', 'conquest'], plague: ['plague'] }[dom] || [];
    const ev = AG.History.events.slice().reverse().find((e) => kinds.includes(e.kind) && (e.polity === k.id || k.cities.some((cid) => Civ.cities[cid] && dist2(Civ.cities[cid].x, Civ.cities[cid].y, e.x, e.y) < 80 * 80)));
    return ev ? `whose wrath was seen in ${ev.text.charAt(0).toLowerCase() + ev.text.slice(1)} (${AG.calText(ev.year).replace('Year', 'year')})` : '';
  }
  function setReligion(k, rid) { k.religion = rid; for (const cid of k.cities) { Civ.cities[cid].religion = rid; for (const P of Civ.persons(Civ.cities[cid])) P.belief.faith = rid; } }
  function convert(c, rid, how) {
    if (c.religion === rid) return;
    c.religion = rid;
    for (const P of Civ.persons(c)) if (rnd() < 0.8) P.belief.faith = rid;
    if (how) AG.History.event('faith', `${how} bring the ${Civ.religions[rid].name} to ${c.name}`, { x: c.x, y: c.y, comm: c.id });
    if (AG.Render) AG.Render.bordersDirty = true;
  }
  function missionaries(k, dy) {
    const cap = Civ.capitalOf(k); if (!cap || k.religion < 0 || rnd() > dy * 0.2) return;
    const c = pick(Civ.cities);
    if (!c || !c.alive || c.kd === k.id || c.religion === k.religion || dist2(c.x, c.y, cap.x, cap.y) > 110 * 110 || Civ.firstBuilding(c, BT.TEMPLE)) return;
    if (rnd() < 0.3) convert(c, k.religion, `Missionaries of the ${k.name}`);
  }
  // Organised faith needs a sacred place; before that, people keep the spirits and ancestors.
  function religionYear(dy) {
    for (const k of Civ.kingdoms) {
      if (!k.alive) continue;
      const cap = Civ.capitalOf(k); if (!cap) continue;
      if (k.religion < 0 && (Civ.firstBuilding(cap, BT.MEGALITH) || Civ.firstBuilding(cap, BT.TEMPLE) || (Tech.knows(cap, 'burial') && k.gov >= 2 && Civ.firstBuilding(cap, BT.SHRINE)))) foundReligion(k, cap);
      if (k.religion >= 0 && k.gov >= 2) missionaries(k, dy);
      for (const key in k.exp) k.exp[key] *= Math.pow(0.98, dy);
    }
  }

  // ============================================================ trade (embodied vehicles)
  function seaSeeds(b) { const out = []; for (let y = b.y - 2; y <= b.y + b.h + 1; y++) for (let x = b.x - 2; x <= b.x + b.w + 1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (Wd.passSea(i)) out.push(i); } return out; }
  Civ.seaField = function (c) { const d = Civ.dockOf(c); if (!d) return null; const s = seaSeeds(d); return s.length ? Flow.get('S' + c.id, d.cx, d.cy, 'S', s) : null; };
  function startTrade(c) {
    const k = Civ.kingdoms[c.kd];
    let best = null, bd = 1e18;
    for (const [id, s] of c.contacts) {
      const o = Civ.cities[id]; if (!o.alive || s < 0.3 || !o.materialized) continue;
      if (o.kd !== c.kd && (k.war[o.kd] || k.opinion[o.kd] < -10)) continue;
      const d = dist2(c.x, c.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    c.lastTrade = AG.tick;
    let mode = 'cart', sx = c.x, sy = c.y + 2.5;
    const da = Civ.dockOf(c);
    if (Tech.knows(c, 'sailing') && da && Civ.dockOf(best)) { const f = Civ.seaField(best), seeds = seaSeeds(da); if (f && seeds.length && f[seeds[0]] !== 65535) { mode = 'sea'; sx = seeds[0] % W + 0.5; sy = ((seeds[0] / W) | 0) + 0.5; } }
    if (mode === 'cart') { if (!Tech.knows(c, 'wheel')) return; const f = Flow.get('L' + best.id, best.x, best.y, 'L'); if (!f || !Flow.reachable(f, c.x, c.y)) return; }
    const v = Ent.spawnVehicle(mode === 'sea' ? SP.SHIP : SP.CART, sx, sy, { kd: c.kd, home: c.id });
    if (v < 0) return;
    const type = c.goods > 6 ? 6 : c.metal > 4 ? 4 : 1, amt = 8;
    U.tref[v] = best.id; U.aux[v] = 0; U.carry[v] = type; U.camt[v] = amt; U.task[v] = TK.TRADE;
    addRoute(c.id, best.id, mode);
  }
  function addRoute(a, b, mode) {
    for (const r of Civ.routes) if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) { r.n++; r.t = AG.tick; r.mode = mode; return; }
    Civ.routes.push({ a, b, mode, n: 1, t: AG.tick });
    const A = Civ.cities[a], B = Civ.cities[b];
    if (A.kd !== B.kd) AG.History.event('trade', `A trade route opens between ${A.name} and ${B.name}`, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, comm: a });
  }
  Civ.tradeArrive = function (i) {
    const dest = Civ.cities[U.tref[i]], home = Civ.cities[U.home[i]];
    if (U.aux[i] === 0) {
      dest.goods += 4; dest.gold += Tech.knows(home, 'coinage') ? 4 : 2;
      if (dest.kd !== U.kd[i]) { const k = Civ.kingdoms[U.kd[i]], o = Civ.kingdoms[dest.kd]; if (k && o) { k.trade[o.id] += 4; o.trade[k.id] += 4; } if (home && home.religion >= 0 && dest.religion !== home.religion && !Civ.firstBuilding(dest, BT.TEMPLE) && rnd() < 0.08) convert(dest, home.religion, `Merchants of ${home.name}`); }
      U.aux[i] = 1; U.tref[i] = U.home[i];
      return true;
    }
    if (home && home.alive) { home.gold += 2; home.goods += 2; }
    Ent.kill(i, 'retired');
    return false;
  };
  // Trade between folded communities happens on paper: goods and goodwill.
  function tradeYear(dy) {
    for (const c of Civ.cities) {
      if (!c.alive || c.nomadic) continue;
      for (const [id, s] of c.contacts) {
        const o = Civ.cities[id]; if (!o.alive || o.kd === c.kd || s < 0.4) continue;
        const k = Civ.kingdoms[c.kd], ko = Civ.kingdoms[o.kd]; if (!k || !ko || k.war[o.kd]) continue;
        const vol = s * dy * (Tech.knows(c, 'currency') ? 2 : 1) * (Tech.knows(c, 'coinage') ? 2 : 1) * (Tech.knows(c, 'wheel') || Tech.knows(c, 'sailing') ? 1.5 : 0.5);
        k.trade[o.kd] += vol; c.gold += vol * 0.2; c.goods += vol * 0.1;
      }
    }
  }

  // ============================================================ disease
  function outbreaks(dy) {
    for (const c of Civ.cities) {
      if (!c.alive || c.members.length < 40) continue;
      const dens = c.members.length / Math.max(30, c.area || 30);
      const p = dy * 0.004 * (c.sedentary ? 1.5 : 0.4) * (c.herd > 20 ? 1.4 : 1) * Math.min(3, dens * 6 + c.members.length / 200);
      if (rnd() > p) continue;
      let d;
      if (AG.DISEASES.length < AG.MAX_DISEASES && rnd() < 0.5) {
        d = AG.DISEASES.length;
        AG.DISEASES.push({ name: AG.Names.disease(), color: AG.css(AG.hsl(rnd() * 360, 0.6, 0.55)), contagion: 0.05 + rnd() * 0.12, radius: 1 + rnd() * 1.5, lethality: 0.08 + rnd() * 0.35, incubation: 0.4 + rnd(), duration: 1.5 + rnd() * 3, slow: rnd() * 0.3, sterile: rnd() < 0.1 ? 1 : 0, madness: rnd() < 0.05 ? 1 : 0, hollow: 0, targets: 1, origin: c.herd > 20 ? 'from the herds' : 'in the crowded houses' });
      } else d = ri(AG.DISEASES.length);
      const D = AG.DISEASES[d];
      let sick = 0;
      for (const P of Civ.persons(c)) {
        if (P.dis || (P.imm & (1 << d))) continue;
        if (rnd() < D.contagion * 3 * (1.3 - People.ph(P, AG.Life.L.IMMUNE) / 255)) { P.dis = d + 1; P.dtm = 0; sick++; if (P.body >= 0) { U.dis[P.body] = d + 1; U.dtm[P.body] = 0; } }
      }
      if (sick > 3) {
        AG.History.event('plague', `An outbreak of ${D.name} strikes ${c.name}`, { x: c.x, y: c.y, comm: c.id, cause: D.origin || 'crowding' });
        const k = Civ.kingdoms[c.kd]; if (k) k.exp.plague += 1;
        for (const P of Civ.persons(c)) if (rnd() < 0.5) People.remember(P, MK.PLAGUE, { v: -0.6, s: 0.6, d: D.name });
        // strains drift as they pass between people
        if (rnd() < 0.3) { D.lethality = AG.clamp(D.lethality * (0.85 + rnd() * 0.3), 0.03, 0.9); D.contagion = AG.clamp(D.contagion * (0.85 + rnd() * 0.35), 0.02, 0.4); }
      }
    }
  }

  // ============================================================ clocks
  War.yearStep = function (dy) {
    diplomacy(dy); warTick(dy); religionYear(dy); tradeYear(dy); outbreaks(dy);
  };
  War.tick = function () {
    const t = AG.tick, Y = AG.YEAR_TICKS;
    if (t % 120 === 30) { diplomacy(120 / Y); warTick(120 / Y); }
    if (t % 240 === 90) { religionYear(240 / Y); tradeYear(240 / Y); outbreaks(240 / Y); }
    if (t % 10 === 0) for (const sq of Civ.squads) if (sq.alive) squadTick(sq);
    if (t % 20 === 0) for (const c of Civ.cities) if (c.alive && c.materialized) captureCheck(c);
    if (t % 15 === 0) defenses();
    if (t % 300 === 0) for (const c of Civ.cities) if (c.alive && c.materialized && !c.nomadic && AG.tick - c.lastTrade > 600 && (Tech.knows(c, 'wheel') || Tech.knows(c, 'sailing')) && rnd() < 0.4) startTrade(c);
    if (t % 500 === 0) Civ.routes = Civ.routes.filter((r) => t - r.t < 6000 && Civ.cities[r.a].alive && Civ.cities[r.b].alive);
  };
})();
