/* AURA: Genesis 2 — ai.js
 * Brains for bodies. Movement runs every tick for every body; thinking runs for 1/8 of them per
 * tick, staggered by index.
 *  - People: a small utility brain over needs (food, rest, company), work for the community,
 *    worship, courtship, curiosity and grief. Personality, tastes and feelings bias every choice;
 *    habit keeps people doing what they did; only a few options are weighed each time (people
 *    are not perfect planners). Work trips earn food at the rate the yearly model expects.
 *  - Animals: an energy budget spent on body size, speed and temperature stress (set by their
 *    cold and heat genes), grazing or hunting, fleeing by boldness and senses, mating only with
 *    compatible partners (the MATE locus), pregnancy and birth with inherited genomes.
 *  - Vehicles, siege engines, projectiles and possession carry over from Genesis 1. */
'use strict';
(function () {
  const AG = window.AG, U = AG.U, Wd = AG.World, Ent = AG.Ent, Civ = AG.Civ, Flow = AG.Flow, People = AG.People, Tech = AG.Tech, Life = AG.Life;
  const { W, H, NG, SP, SPECIES, TK, ST, FL, FT, GT, UG, UF, SO, J, G, BT, TR, SK } = AG;
  const MK = People.MK, GL = Life.GL, LL = Life.L;
  const rnd = AG.rnd, dist2 = AG.dist2;
  const AI = (AG.AI = { stats: { think: 0 } });
  const YEAR = 1 / AG.YEAR_TICKS;
  const GESTATION = [0.55, 0.22, 0.08, 0.7]; // years, by archetype
  const CAPS = { [SP.GRAZER]: 3600, [SP.PREDATOR]: 600, [SP.BIRD]: 700, [SP.APE]: 500 };

  AI.tick = function () {
    const t = AG.tick, hi = U.hi;
    U.px.set(U.x.subarray(0, hi)); U.py.set(U.y.subarray(0, hi));
    for (let i = 0; i < hi; i++) {
      if (!U.alive[i]) continue;
      U.age[i] += YEAR;
      if (U.cd[i] > 0) U.cd[i]--;
      if (((i + t) & 7) === 0) { think(i); if (!U.alive[i]) continue; }
      step(i);
    }
  };

  // ============================================================ hostility
  function hostile(i, j) {
    if (i === j || U.layer[i] !== U.layer[j]) return false;
    const a = U.sp[i], b = U.sp[j], da = SPECIES[a], db = SPECIES[b];
    if (da.kind === 'ambient' || db.kind === 'ambient') return false;
    if (a === SP.PERSON) {
      if (b === SP.PREDATOR && !(U.flags[j] & FL.DOMESTIC)) return U.energy[j] < 0.4 || U.st[j] === ST.FIGHT;
      if (b === SP.PERSON || db.kind === 'vehicle') {
        if ((U.flags[i] & FL.MAD) || (U.flags[j] & FL.MAD)) return b === SP.PERSON;
        const ka = U.kd[i], kb = U.kd[j];
        return ka >= 0 && kb >= 0 && ka !== kb && Civ.kingdoms[ka].war[kb] === 1;
      }
      return false;
    }
    if (a === SP.PREDATOR && !(U.flags[i] & FL.DOMESTIC)) {
      if (b === SP.GRAZER) return U.scale[j] < U.scale[i] * (1.3 + U.social[i] * 0.8); // packs take bigger prey
      if (b === SP.PERSON) return U.energy[i] < 0.2 && U.bold[i] > 0.6;
      if (b === SP.APE) return U.energy[i] < 0.4;
    }
    return false;
  }
  AI.hostile = hostile;
  function findHostile(i, r) {
    const n = Ent.near(U.x[i], U.y[i], r, U.layer[i], 64);
    let best = -1, bd = 1e9;
    for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (!hostile(i, j)) continue; const d = dist2(U.x[i], U.y[i], U.x[j], U.y[j]); if (d < bd) { bd = d; best = j; } }
    return best;
  }
  function threatNear(i, r) { // something that could hurt this body
    const n = Ent.near(U.x[i], U.y[i], r, U.layer[i], 64);
    for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (j !== i && hostile(j, i)) return j; }
    return -1;
  }

  // ============================================================ basic orders
  function goTo(i, x, y, task) { U.tx[i] = x; U.ty[i] = y; U.task[i] = task; U.st[i] = ST.MOVE; }
  function goCell(i, c, task) { goTo(i, (c % W) + 0.5, ((c / W) | 0) + 0.5, task); U.tref[i] = c; }
  function engage(i, t) { U.st[i] = ST.FIGHT; U.tgt[i] = t; }
  function okCell(i, x, y) {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
    const c = (y | 0) * W + (x | 0), L = U.layer[i];
    if (L === 2) return true;
    if (L === 0) return Wd.ugOpen(c) && Wd.ugF[c] < 20;
    return SPECIES[U.sp[i]].naval ? Wd.passSea(c) : Wd.passLand(c) && !Wd.fire[c];
  }
  function wander(i, r) { for (let t = 0; t < 6; t++) { const x = U.x[i] + (rnd() - 0.5) * 2 * r, y = U.y[i] + (rnd() - 0.5) * 2 * r; if (okCell(i, x, y)) { goTo(i, x, y, TK.WANDER); return; } } }
  function wanderNear(i, cx, cy, r, task) { for (let t = 0; t < 6; t++) { const x = cx + (rnd() - 0.5) * 2 * r, y = cy + (rnd() - 0.5) * 2 * r; if (okCell(i, x, y)) { goTo(i, x, y, task || TK.WANDER); return; } } }
  function fleeFrom(i, t) {
    let dx = U.x[i] - U.x[t], dy = U.y[i] - U.y[t];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    for (let k = 0; k < 6; k++) {
      const a = (rnd() - 0.5) * (1 + k * 0.4), c = Math.cos(a), s = Math.sin(a);
      const x = U.x[i] + (dx * c - dy * s) * 7, y = U.y[i] + (dx * s + dy * c) * 7;
      if (okCell(i, x, y)) { goTo(i, x, y, TK.FLEE); U.flags[i] |= FL.FLEE; return; }
    }
    wander(i, 6);
  }
  function escape(i) {
    if (!U.alive[i] || (U.flags[i] & FL.POSSESSED) || U.st[i] === ST.FIGHT) return;
    for (let t = 0; t < 10; t++) { const a = rnd() * Math.PI * 2, r = 2 + rnd() * 5, x = U.x[i] + Math.cos(a) * r, y = U.y[i] + Math.sin(a) * r; if (okCell(i, x, y)) { goTo(i, x, y, TK.FLEE); U.flags[i] |= FL.FLEE; return; } }
  }
  AI.react = function (t, a) {
    const d = SPECIES[U.sp[t]];
    if (d.kind === 'vehicle' || d.kind === 'ambient' || (U.st[t] === ST.WORK && U.task[t] === TK.ATTACKB)) return;
    if (U.sp[t] === SP.GRAZER || U.layer[t] !== U.layer[a]) { if (U.bold[t] > 0.75 && U.scale[t] > 1.2 && rnd() < 0.5) engage(t, a); else fleeFrom(t, a); return; }
    if (U.pid[t] >= 0) {
      const P = Ent.person(t);
      if (P && ((P.traits & TR.coward) || P.job === J.CHILD || (U.hp[t] < U.mhp[t] * 0.3 && !(P.traits & TR.brave)))) { fleeFrom(t, a); return; }
      if (P && U.pid[a] >= 0) People.remember(P, MK.HURT, { who: U.pid[a], v: -0.5, s: 0.6 });
    }
    engage(t, a);
  };

  // ============================================================ think
  function think(i) {
    const sp = U.sp[i], d = SPECIES[sp];
    if (U.pid[i] < 0 && U.age[i] > U.life[i] && d.kind !== 'vehicle') { Ent.kill(i, 'old age'); return; }
    if (U.layer[i] !== 2) { hazards(i, d); if (!U.alive[i]) return; }
    if (U.dis[i]) { disease(i); if (!U.alive[i]) return; }
    if (U.hp[i] < U.mhp[i] && U.energy[i] > 0.2 && !U.dis[i]) U.hp[i] = Math.min(U.mhp[i], U.hp[i] + U.mhp[i] * 0.006);
    if (U.flags[i] & FL.POSSESSED) return;
    switch (d.kind) {
      case 'civ': thinkPerson(i); break;
      case 'animal': thinkAnimal(i, sp); break;
      case 'vehicle': thinkVehicle(i, sp); break;
      case 'ambient': thinkBird(i); break;
    }
  }
  function hurt(i, dmg, cause) { U.hp[i] -= dmg; if (U.hp[i] <= 0) Ent.kill(i, cause); }
  function hazards(i, d) {
    const c = (U.y[i] | 0) * W + (U.x[i] | 0);
    if (U.layer[i] === 1) {
      const f = Wd.fl[c];
      if (f > 0.004 && !Wd.frozen[c]) {
        const ty = Wd.ft[c];
        if (ty === FT.LAVA) { hurt(i, 25, 'lava'); escape(i); }
        else if (ty === FT.ACID) { hurt(i, 10, 'acid'); escape(i); }
        else if (f > 0.06 && !d.naval) { hurt(i, 3, 'drowning'); escape(i); }
        if (!U.alive[i]) return;
      }
      if (Wd.fire[c]) { hurt(i, 7, 'fire'); if (!U.alive[i]) return; const P = Ent.person(i); if (P && rnd() < 0.04 && People.addTrait(P, 'fireborn')) People.remember(P, MK.DISASTER, { v: -0.5, s: 0.8, d: 'the flames' }); escape(i); }
      if (Wd.gt[c] === GT.MIASMA && Wd.gas[c] > 0.12) { hurt(i, Wd.gas[c] * 8, 'poison'); if (!U.alive[i]) return; }
      if (d.kind === 'civ' || d.kind === 'animal') {
        // tolerance from the genome; people add clothing and fire
        const T = Wd.T(c);
        let lo = 0.32 - U.cold[i] * 0.5, hi = 0.82 + U.heat[i] * 0.45;
        if (U.pid[i] >= 0) { const cc = Civ.cities[U.city[i]]; if (cc && Tech.knows(cc, 'hides')) lo -= 0.25; if (cc) lo -= 0.12; }
        if (T < lo) { U.energy[i] -= (lo - T) * 0.02; if (T < lo - 0.25) hurt(i, (lo - 0.25 - T) * 6, 'cold'); }
        else if (T > hi) { U.energy[i] -= (T - hi) * 0.02; if (T > hi + 0.25) hurt(i, (T - hi - 0.25) * 6, 'heat'); }
      }
    } else if (Wd.ugF[c] > 20) {
      if (Wd.ugT[c] === UF.MAGMA) { hurt(i, 25, 'magma'); escape(i); }
      else if (Wd.ugF[c] > 60) { hurt(i, 3, 'drowning'); escape(i); }
    }
  }
  function drgb(D) {
    if (!D._rgb) { const h = D.color.startsWith('#') ? D.color.slice(1) : '888888'; const m = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; D._rgb = [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]; }
    return D._rgb;
  }
  function disease(i) {
    const di = U.dis[i] - 1, D = AG.DISEASES[di];
    if (!D) { U.dis[i] = 0; return; }
    U.dtm[i] += 8 / AG.DAY_TICKS;
    const t = U.dtm[i], res = Ent.phen(i, LL.IMMUNE) / 255;
    if (t > D.incubation) {
      U.hp[i] -= U.mhp[i] * D.lethality * (8 / AG.DAY_TICKS) * (1.25 - res * 0.9) * (U.traits[i] & TR.sickly ? 1.4 : 1);
      if (U.hp[i] <= 0) { Ent.kill(i, D.name); return; }
      if (rnd() < 0.15) AG.FX.spawn(U.x[i], U.y[i], 0, 0, 0.9, drgb(D), 0.45, 0, U.layer[i], 0.03);
    }
    if (t > D.incubation * 0.5) {
      const n = Ent.near(U.x[i], U.y[i], D.radius, U.layer[i], 16);
      for (let q = 0; q < n; q++) {
        const j = Ent.buf[q];
        if (j === i || U.dis[j] || U.pid[j] < 0 && !(D.targets & 2)) continue;
        if (rnd() < D.contagion * (1.2 - Ent.phen(j, LL.IMMUNE) / 255)) Ent.infect(j, di);
      }
    }
    if (t > D.incubation + D.duration) {
      U.imm[i] |= 1 << di; U.dis[i] = 0;
      const P = Ent.person(i); if (P) { P.dis = 0; P.imm |= 1 << di; People.remember(P, MK.RECOVERED, { v: 0.3, s: 0.4, d: D.name }); }
    }
  }

  // ============================================================ people
  // Options are scored, a few at a time; the best is taken (with a little noise and habit).
  function thinkPerson(i) {
    const P = Ent.person(i);
    if (!P) { Ent.remove(i); return; }
    const c = Civ.cities[P.comm];
    if (!c || !c.alive) { Ent.remove(i); return; }
    People.tickNeeds(P, 8 / AG.YEAR_TICKS * 8);
    U.energy[i] = P.needs.food;
    if (P.needs.food <= 0.02) { hurt(i, U.mhp[i] * 0.01, 'hunger'); if (!U.alive[i]) return; }
    U.job[i] = P.job;
    if (U.st[i] === ST.FIGHT) { validateFight(i, P); return; }
    if (U.st[i] === ST.WORK && U.task[i] === TK.ATTACKB) return;
    // danger first: fight or flight, by temperament and feeling
    const foe = findHostile(i, U.sq[i] >= 0 ? 8 : 6), threat = foe < 0 ? threatNear(i, 6) : foe;
    if (threat >= 0) {
      P.needs.safety = 0;
      const brave = P.job === J.SOLDIER || U.sq[i] >= 0 || (P.traits & TR.brave) || (U.flags[i] & FL.MAD) || (P.emo.anger > 0.6 && !(P.traits & TR.coward));
      const fight = brave || (!(P.traits & TR.coward) && P.job !== J.CHILD && U.hp[i] > U.mhp[i] * 0.5 && P.emo.fear < 0.5 && rnd() < 0.45);
      if (fight && foe >= 0) { engage(i, foe); return; }
      P.emo.fear = Math.min(1, P.emo.fear + 0.2);
      if (!(U.flags[i] & FL.FLEE)) { fleeFrom(i, threat); return; }
    }
    if (U.flags[i] & FL.FLEE) { if (U.st[i] === ST.MOVE) return; U.flags[i] &= ~FL.FLEE; }
    if (U.sq[i] >= 0) { squadThink(i); return; }
    if (U.task[i] === TK.MIGRATE) { if (dist2(U.x[i], U.y[i], c.x, c.y) > 25) { goTo(i, c.x + (rnd() - 0.5) * 4, c.y + (rnd() - 0.5) * 4, TK.MIGRATE); return; } U.task[i] = TK.NONE; U.st[i] = ST.IDLE; }
    if (U.st[i] !== ST.IDLE) return;
    if (U.layer[i] === 0) { const m = Civ.cityMine(c); if (m) goTo(i, m.cx, m.cy, TK.ASCEND); else U.layer[i] = 1; return; }
    if (U.carry[i]) { goHome(i, c, TK.DEPOSIT); return; }
    choose(i, P, c);
  }
  function homeOf(c, P) {
    let n = 0, pick = null;
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && (b.type === BT.TENT || b.type === BT.HUT || b.type === BT.HOUSE) && (P.id + n++) % 5 === 0) { pick = b; break; } }
    if (!pick) pick = Civ.buildings[c.hearth] && Civ.buildings[c.hearth].alive ? Civ.buildings[c.hearth] : null;
    return pick;
  }
  function goHome(i, c, task) {
    const h = Civ.buildings[c.hearth];
    if (h && h.alive) goTo(i, h.cx + (rnd() - 0.5) * 3, h.cy + 1 + rnd() * 1.5, task);
    else goTo(i, c.x + (rnd() - 0.5) * 3, c.y + 1 + rnd(), task);
  }
  function choose(i, P, c) {
    const n = P.needs, e = P.emo, p = P.pers, night = AG.Sky.daylight() < 0.25, child = P.job === J.CHILD;
    const opts = [];
    const add = (k, v) => opts.push([k, v + rnd() * 0.25 + (U.aux[i] === k ? 0.2 : 0)]); // noise and habit
    if (c.food > 0.2 || c.materialized) add(1, Math.pow(1 - n.food, 2) * 3.2);          // eat
    add(2, (night ? 1.4 : 0.2) * (1 - n.rest) * 2 + e.grief * 0.6);                    // rest
    if (!child) add(3, (0.9 + P.tastes[AG.JOB_TASTE[P.job]] / 250) * (0.6 + p.consc * 0.7) * (c.nutr < 0.9 ? 1.4 : 1) * (1 - e.grief * 0.6) * (1 - P.mental.depressed * 0.4) * (night ? 0.35 : 1)); // work
    add(4, (1 - n.social) * (0.4 + p.extra) * (1 + e.joy * 0.3) * (P.traits & TR.loner ? 0.3 : 1));   // company
    if (P.belief.devotion > 0.4 || P.job === J.PRIEST || P.traits & TR.pious) add(5, P.belief.devotion * 0.9 + (P.job === J.PRIEST ? 0.6 : 0) + e.grief * 0.5 + e.fear * 0.4);
    if (!P.spouse && !child && People.age(P) < 45) add(6, 0.3 + e.love * 0.8);           // court
    if (P.traits & TR.curious || P.goal === 3) add(7, 0.25 + p.open * 0.5 - e.fear * 0.5); // explore
    if (child) add(8, 1.2);                                                              // play
    // bounded attention: weigh three options at random plus the strongest need
    opts.sort((a, b) => b[1] - a[1]);
    const consider = [opts[0]]; for (let k = 0; k < 2 && opts.length > 1; k++) consider.push(opts[1 + ((rnd() * (opts.length - 1)) | 0)]);
    consider.sort((a, b) => b[1] - a[1]);
    const choice = consider[0][0];
    U.aux[i] = choice;
    switch (choice) {
      case 1: goHome(i, c, TK.EAT); return;
      case 2: { const h = homeOf(c, P); if (h) goTo(i, h.cx + (rnd() - 0.5), h.cy + 0.6, TK.REST); else goHome(i, c, TK.REST); return; }
      case 3: work(i, P, c); return;
      case 4: { const f = friendNear(i, P, 14); if (f >= 0) goTo(i, U.x[f] + (rnd() - 0.5), U.y[f] + (rnd() - 0.5), TK.SOCIAL); else goHome(i, c, TK.SOCIAL); return; }
      case 5: { const s = Civ.randomBuilding(c, BT.TEMPLE) || Civ.randomBuilding(c, BT.MEGALITH) || Civ.randomBuilding(c, BT.SHRINE) || Civ.buildings[c.hearth]; if (s && s.alive) goTo(i, s.cx + (rnd() - 0.5) * 2, s.y + s.h + 0.4, TK.WORSHIP); else goHome(i, c, TK.WORSHIP); return; }
      case 6: { const f = friendNear(i, P, 16, true); if (f >= 0) goTo(i, U.x[f], U.y[f], TK.COURT); else goHome(i, c, TK.SOCIAL); return; }
      case 7: wander(i, 22); U.task[i] = TK.EXPLORE; return;
      default: wanderNear(i, c.x, c.y, 5, TK.PLAY);
    }
  }
  function friendNear(i, P, r, romance) {
    const n = Ent.near(U.x[i], U.y[i], r, 1, 48);
    let best = -1, bv = -1e9;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q]; if (j === i || U.pid[j] < 0) continue;
      const Q = Ent.person(j); if (!Q) continue;
      if (romance && (Q.spouse || Q.sex === P.sex || People.age(Q) < 16 || People.isKin(P, Q))) continue;
      const t = P.ties.get(Q.id);
      const v = (t ? t.aff : 0) + People.similarity(P, Q) + rnd() * 0.3;
      if (v > bv) { bv = v; best = j; }
    }
    return best;
  }
  function validateFight(i, P) {
    const t = U.tgt[i];
    if (t < 0 || !U.alive[t] || U.layer[t] !== U.layer[i]) { U.st[i] = ST.IDLE; U.tgt[i] = -1; return; }
    if (U.hp[i] < U.mhp[i] * 0.25 && !(P.traits & TR.brave) && !(U.flags[i] & FL.MAD) && rnd() < 0.4) fleeFrom(i, t);
  }
  // Work: the person's job, done where the land allows. The trip's start is remembered so the
  // food it earns matches the time it took.
  function work(i, P, c) {
    U.tm0[i] = AG.tick; // trip start (used in finishWork)
    switch (P.job) {
      case J.GATHER: { const cell = findCell(c, c.nomadic ? 16 : 14, 0); if (cell >= 0) { goCell(i, cell, TK.GATHER); return; } break; }
      case J.HUNT: {
        const prey = findPrey(i, 18);
        if (prey >= 0) { engage(i, prey); U.task[i] = TK.HUNT; return; }
        wander(i, 14); U.task[i] = TK.HUNT; U.tref[i] = -2; return; // tracking: snares and small game
      }
      case J.FISH: { const cell = findCell(c, 18, 3); if (cell >= 0) { goCell(i, cell, TK.FISH); return; } break; }
      case J.FARM: { const f = Civ.randomBuilding(c, BT.FARM); if (f) { goTo(i, f.x + 0.5 + rnd() * (f.w - 1), f.y + 0.5 + rnd() * (f.h - 1), TK.FARM); U.tref[i] = f.id; return; } break; }
      case J.HERD: { const p = Civ.randomBuilding(c, BT.PEN); if (p) { goTo(i, p.cx + (rnd() - 0.5) * 4, p.cy + (rnd() - 0.5) * 4, TK.HERD); U.tref[i] = p.id; return; } wanderNear(i, c.x, c.y, 10, TK.HERD); return; }
      case J.WOOD: { const cell = findCell(c, 22, 1); if (cell >= 0) { goCell(i, cell, TK.WOOD); return; } break; }
      case J.MINE: { const m = Civ.cityMine(c); if (m) { goTo(i, m.cx, m.cy, TK.MINE); U.tref[i] = m.id; return; } const cell = findCell(c, 22, 2); if (cell >= 0) { goCell(i, cell, TK.QUARRY); return; } break; }
      case J.BUILD: { const b = c.site >= 0 ? Civ.buildings[c.site] : null; if (b && b.alive) { goTo(i, b.cx + (rnd() - 0.5) * b.w, b.y + b.h + 0.4, TK.BUILD); U.tref[i] = b.id; return; } break; }
      case J.CRAFT: { const w = Civ.randomBuilding(c, BT.WORKSHOP) || Civ.buildings[c.hearth]; if (w && w.alive) { goTo(i, w.cx + (rnd() - 0.5) * 2, w.y + w.h + 0.4, TK.CRAFT); return; } break; }
      case J.TRADE: { const m = Civ.randomBuilding(c, BT.MARKET); if (m) { goTo(i, m.cx + (rnd() - 0.5) * 2, m.cy + (rnd() - 0.5) * 2, TK.TRADE); return; } break; }
      case J.SOLDIER: { for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2, r = c.radius * (0.4 + rnd() * 0.5), x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (okCell(i, x, y)) { goTo(i, x, y, TK.PATROL); Ent.gainSkill(i, SK.FIGHT, 0.3); return; } } return; }
      case J.PRIEST: { const s = Civ.randomBuilding(c, BT.TEMPLE) || Civ.randomBuilding(c, BT.MEGALITH) || Civ.randomBuilding(c, BT.SHRINE) || Civ.buildings[c.hearth]; if (s && s.alive) { goTo(i, s.cx + (rnd() - 0.5) * 2, s.y + s.h + 0.4, TK.WORSHIP); return; } break; }
      case J.ELDER: wanderNear(i, c.x, c.y, 4, TK.SOCIAL); return;
    }
    const cell = findCell(c, 16, 0);
    if (cell >= 0) { goCell(i, cell, TK.GATHER); P.job === J.GATHER || 0; } else wanderNear(i, c.x, c.y, 8);
  }
  function findPrey(i, r) {
    const n = Ent.near(U.x[i], U.y[i], r, 1, 64);
    let best = -1, bv = -1e9;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if ((U.sp[j] !== SP.GRAZER && U.sp[j] !== SP.APE) || (U.flags[j] & FL.DOMESTIC)) continue;
      const v = U.scale[j] * 2 - Math.sqrt(dist2(U.x[i], U.y[i], U.x[j], U.y[j])) / r;
      if (v > bv) { bv = v; best = j; }
    }
    return best;
  }
  function shore(i) { const x = i % W; for (const j of [x > 0 ? i - 1 : i, x < W - 1 ? i + 1 : i, i - W, i + W]) if (j >= 0 && j < W * H && Wd.fl[j] > 0.03 && Wd.ft[j] === FT.WATER && !Wd.frozen[j]) return true; return false; }
  function findCell(c, r, kind) {
    let best = -1, bd = 1e9;
    for (let t = 0; t < 14; t++) {
      const a = rnd() * Math.PI * 2, rr = 2 + rnd() * r;
      const x = (c.x + Math.cos(a) * rr) | 0, y = (c.y + Math.sin(a) * rr) | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (Wd.bgrid[i] || !Wd.passLand(i) || Wd.fire[i]) continue;
      const ok = kind === 0 ? Wd.veg[i] >= 45 && Wd.soil[i] !== SO.FARM : kind === 1 ? Wd.veg[i] >= 165 : kind === 3 ? shore(i) : Wd.soil[i] === SO.ROCK || Wd.elev[i] > 0.66;
      if (!ok) continue;
      const d = dist2(x, y, c.x, c.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function squadThink(i) {
    const sq = Civ.squads[U.sq[i]];
    if (!sq || !sq.alive) { U.sq[i] = -1; U.task[i] = TK.NONE; U.st[i] = ST.IDLE; return; }
    const tc = Civ.cities[sq.target];
    if (sq.stage === 0) { if (U.st[i] === ST.IDLE || rnd() < 0.08) goTo(i, sq.rx + (rnd() - 0.5) * 8, sq.ry + (rnd() - 0.5) * 8, TK.MARCH); return; }
    if (U.flags[i] & (FL.FLANKL | FL.FLANKR)) {
      const wp = U.flags[i] & FL.FLANKL ? sq.wpL : sq.wpR;
      if (sq.stage === 1 && wp && dist2(U.x[i], U.y[i], wp.x, wp.y) > 12 && U.stuck[i] < 10) { if (U.st[i] !== ST.MOVE || rnd() < 0.15) goTo(i, wp.x + (rnd() - 0.5) * 3, wp.y + (rnd() - 0.5) * 3, TK.MARCH); return; }
      U.flags[i] &= ~(FL.FLANKL | FL.FLANKR);
    }
    if (sq.stage === 2 && dist2(U.x[i], U.y[i], tc.x, tc.y) < 15 * 15) {
      const foe = findHostile(i, 10);
      if (foe >= 0) { engage(i, foe); return; }
      let best = null, bd = 81;
      for (const bid of tc.buildings) { const b = Civ.buildings[bid]; if (!b.alive || b.kd === U.kd[i]) continue; const d = dist2(U.x[i], U.y[i], b.cx, b.cy); if (d < bd) { bd = d; best = b; } }
      if (best) { goTo(i, best.cx, best.cy, TK.ATTACKB); U.tref[i] = best.id; return; }
    }
    const f = Flow.get('L' + tc.id, tc.x, tc.y, 'L');
    if (f) { const nx = Flow.ahead(f, U.x[i], U.y[i], 4); if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.MARCH); return; } }
    goTo(i, tc.x + (rnd() - 0.5) * 4, tc.y + (rnd() - 0.5) * 4, TK.MARCH);
  }

  // ============================================================ animals
  function nearVeg(i, r, min) {
    for (let t = 0; t < 8; t++) {
      const x = (U.x[i] + (rnd() - 0.5) * 2 * r) | 0, y = (U.y[i] + (rnd() - 0.5) * 2 * r) | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const c = y * W + x;
      if (Wd.veg[c] >= min && Wd.passLand(c) && !Wd.bgrid[c]) return c;
    }
    return -1;
  }
  function mateNear(i, r) {
    const n = Ent.near(U.x[i], U.y[i], r, U.layer[i], 32), s = U.sid[i];
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if (j === i || U.sid[j] !== s || U.sex[j] === U.sex[i] || U.age[j] < SPECIES[U.sp[j]].adult) continue;
      if (Life.canMate(U.gen, i * GL, U.gen, j * GL)) return j; // the mate-recognition signal must match
    }
    return -1;
  }
  function metabolism(i) {
    // bigger, faster, hungrier bodies burn more; good insulation in the cold is cheaper
    const m = 0.0042 * (0.55 + U.scale[i] * 0.5 + Ent.phen(i, LL.METAB) / 255 * 0.3) * (U.st[i] === ST.MOVE && (U.flags[i] & FL.FLEE) ? 1.6 : 1);
    U.energy[i] -= m * (U.preg[i] > 0 ? 1.35 : 1);
  }
  function thinkAnimal(i, sp) {
    metabolism(i);
    if (U.energy[i] <= 0) { U.energy[i] = 0; hurt(i, U.mhp[i] * 0.04, 'starvation'); if (!U.alive[i]) return; }
    const s = Life.species[U.sid[i]], arch = s ? s.arch : 0;
    if (U.preg[i] > 0) { U.preg[i] += 8 * YEAR; if (U.preg[i] >= GESTATION[arch]) giveBirth(i, s); if (!U.alive[i]) return; }
    if (U.age[i] < SPECIES[sp].adult && ((AG.tick + i) & 63) === 0) { Ent.deriveStats(i); }
    if (U.st[i] === ST.FIGHT) { const t = U.tgt[i]; if (t < 0 || !U.alive[t]) { U.st[i] = ST.IDLE; U.tgt[i] = -1; } return; }
    const domestic = (U.flags[i] & FL.DOMESTIC) !== 0;
    if (sp === SP.PREDATOR && !domestic) {
      if (U.energy[i] < 0.6) { const prey = findHostile(i, U.sense[i] + 2); if (prey >= 0) { engage(i, prey); U.task[i] = TK.HUNT; return; } }
    } else {
      // prey watch for danger: senses set the range, boldness how close they let it come
      const n = Ent.near(U.x[i], U.y[i], U.sense[i] * (1.1 - U.bold[i] * 0.5), 1, 32);
      for (let q = 0; q < n; q++) {
        const j = Ent.buf[q], s2 = U.sp[j];
        if ((s2 === SP.PREDATOR && !(U.flags[j] & FL.DOMESTIC)) || (s2 === SP.PERSON && (U.task[j] === TK.HUNT || !domestic))) { if (domestic && s2 === SP.PERSON) continue; if (!(U.flags[i] & FL.FLEE)) fleeFrom(i, j); return; }
      }
    }
    if (U.st[i] === ST.MOVE) return;
    U.flags[i] &= ~FL.FLEE;
    if (U.st[i] !== ST.IDLE) return;
    if (sp !== SP.PREDATOR && U.energy[i] < 0.75) { const c = nearVeg(i, 6, sp === SP.APE ? 140 : 50); if (c >= 0) { goCell(i, c, TK.GRAZE); return; } }
    // breeding: well-fed adult females find a compatible mate
    if (U.sex[i] === 0 && U.preg[i] === 0 && U.energy[i] > 0.72 && U.age[i] > SPECIES[sp].adult && AG.Sky.season() < 3 && Ent.count[sp] < CAPS[sp] && rnd() < 0.08) {
      const m = mateNear(i, U.sense[i] + 2);
      if (m >= 0) { U.preg[i] = 0.001; U.fgen.set(U.gen.subarray(m * GL, m * GL + GL), i * GL); }
    }
    if (domestic) { const c = Civ.cities[U.home[i]]; const p = c ? Civ.firstBuilding(c, BT.PEN) : null; if (p) { wanderNear(i, p.cx, p.cy, 4); return; } }
    // herds keep together; loners roam
    if (U.social[i] > 0.55 && rnd() < 0.5) {
      const n = Ent.near(U.x[i], U.y[i], 10, 1, 24); let cx = 0, cy = 0, k = 0;
      for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (U.sid[j] === U.sid[i] && j !== i) { cx += U.x[j]; cy += U.y[j]; k++; } }
      if (k) { wanderNear(i, cx / k, cy / k, 4); return; }
    }
    if (rnd() < 0.5) wander(i, sp === SP.PREDATOR ? 10 : 6);
  }
  function giveBirth(i, s) {
    U.preg[i] = 0;
    if (!s) return;
    const litter = 1 + (Ent.phen(i, LL.FERT) > 175 ? 1 : 0) + (s.arch === Life.ARCH.PREDATOR && rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < litter; k++) {
      if (Ent.count[U.sp[i]] >= CAPS[U.sp[i]]) break;
      const b = Ent.spawnCreature(s, U.x[i] + (rnd() - 0.5), U.y[i] + (rnd() - 0.5), null, { mom: i, age: 0 });
      if (b < 0) break;
      U.energy[b] = 0.6; U.home[b] = U.home[i];
      if (U.flags[i] & FL.DOMESTIC) U.flags[b] |= FL.DOMESTIC;
      Ent.births++;
    }
    U.energy[i] -= 0.25;
  }
  function thinkBird(i) {
    if (U.st[i] === ST.MOVE && rnd() < 0.6) return;
    const n = Ent.near(U.x[i], U.y[i], 7, 2, 24);
    let vx = 0, vy = 0, cx = 0, cy = 0, k = 0;
    for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (j === i || U.sp[j] !== SP.BIRD) continue; vx += U.tx[j] - U.x[j]; vy += U.ty[j] - U.y[j]; cx += U.x[j]; cy += U.y[j]; k++; }
    let tx, ty;
    if (k) { cx /= k; cy /= k; tx = U.x[i] + (vx / k) * 0.8 + (cx - U.x[i]) * 0.3 + (rnd() - 0.5) * 6; ty = U.y[i] + (vy / k) * 0.8 + (cy - U.y[i]) * 0.3 + (rnd() - 0.5) * 6; }
    else { tx = U.x[i] + (rnd() - 0.5) * 30; ty = U.y[i] + (rnd() - 0.5) * 30; }
    goTo(i, AG.clamp(tx, 4, W - 4), AG.clamp(ty, 4, H - 4), TK.WANDER);
  }

  // ============================================================ vehicles
  function thinkVehicle(i, sp) {
    U.tm[i] += 8;
    if (U.tm[i] > 9000) { Ent.kill(i, 'retired'); return; }
    if (sp === SP.CATAPULT) { thinkCatapult(i); return; }
    const dest = Civ.cities[U.tref[i]];
    if (!dest || !dest.alive) { Ent.kill(i, 'retired'); return; }
    let tx = dest.x, ty = dest.y + 2.5, field = null, arrive = 2.5;
    if (sp === SP.SHIP) { const dock = Civ.dockOf(dest); if (!dock) { Ent.kill(i, 'retired'); return; } tx = dock.cx; ty = dock.cy; field = Civ.seaField(dest); arrive = 4.5; }
    else if (sp === SP.CART) field = Flow.get('L' + dest.id, dest.x, dest.y, 'L');
    if (dist2(U.x[i], U.y[i], tx, ty) < arrive * arrive) { Civ.tradeArrive(i); return; }
    if (field) { const nx = Flow.ahead(field, U.x[i], U.y[i], 4); if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.TRADE); return; } }
    goTo(i, tx, ty, TK.TRADE);
  }
  function thinkCatapult(i) {
    const sq = U.sq[i] >= 0 ? Civ.squads[U.sq[i]] : null;
    if (!sq || !sq.alive) { Ent.kill(i, 'retired'); return; }
    const tc = Civ.cities[sq.target];
    if (sq.stage === 0) { goTo(i, sq.rx, sq.ry + 2, TK.MARCH); return; }
    if (dist2(U.x[i], U.y[i], tc.x, tc.y) > 13 * 13) {
      const f = Flow.get('L' + tc.id, tc.x, tc.y, 'L');
      if (f) { const nx = Flow.ahead(f, U.x[i], U.y[i], 3); if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.MARCH); return; } }
      goTo(i, tc.x, tc.y, TK.MARCH); return;
    }
    U.st[i] = ST.IDLE; U.task[i] = TK.SIEGE;
    if (U.cd[i] > 0) return;
    let best = null, bs = -1e9;
    for (const bid of tc.buildings) { const b = Civ.buildings[bid]; if (!b.alive) continue; const d = dist2(U.x[i], U.y[i], b.cx, b.cy); if (d > 256) continue; const s = (b.type === BT.WALL || b.type === BT.TOWER ? 3 : b.type === BT.KEEP ? 2 : 1) - d / 300 + rnd() * 0.6; if (s > bs) { bs = s; best = b; } }
    if (best) { AG.Proj.fire(1, U.x[i], U.y[i], best.cx + (rnd() - 0.5), best.cy + (rnd() - 0.5), 45, U.kd[i], 1, i); U.cd[i] = 70; U.fx[i] = best.cx > U.x[i] ? 1 : -1; }
  }

  // ============================================================ movement (every tick)
  function speedMul(i) {
    let m = 1;
    if (U.dis[i]) { const D = AG.DISEASES[U.dis[i] - 1]; if (D && U.dtm[i] > D.incubation) m *= 1 - D.slow; }
    if (U.layer[i] !== 1) return m;
    const sp = U.sp[i];
    if (SPECIES[sp].naval) return m;
    const c = (U.y[i] | 0) * W + (U.x[i] | 0);
    if (Wd.soil[c] === SO.ROAD) m *= 1.35;
    else if (Wd.veg[c] > 165 && sp !== SP.GRAZER && sp !== SP.APE) m *= 0.8;
    if (Wd.snow[c] > 120) m *= 0.7;
    if (Wd.ice[c]) m *= 0.6;
    if (Wd.fl[c] > 0.006 && !Wd.frozen[c]) m *= 0.6;
    if (Wd.elev[c] > AG.MOUNTAIN) m *= 0.7;
    if (U.flags[i] & FL.FLEE) m *= 1.15;
    if (U.task[i] === TK.MARCH && U.sq[i] >= 0 && !(U.flags[i] & (FL.FLANKL | FL.FLANKR))) { const sq = Civ.squads[U.sq[i]]; if (sq && sq.flank && sq.stage === 1) m *= 0.72; }
    return m;
  }
  function canEnter(i, x, y) {
    if (x < 0.5 || y < 0.5 || x >= W - 0.5 || y >= H - 0.5) return false;
    const L = U.layer[i];
    if (L === 2) return true;
    const c = (y | 0) * W + (x | 0);
    if (L === 0) return Wd.ugOpen(c);
    if (SPECIES[U.sp[i]].naval) return Wd.passSea(c) || !Wd.passSea((U.y[i] | 0) * W + (U.x[i] | 0));
    if (!Wd.passLand(c)) { const cur = (U.y[i] | 0) * W + (U.x[i] | 0); return c !== cur && !Wd.passLand(cur) && Wd.ft[c] !== FT.LAVA && Wd.fl[c] <= Wd.fl[cur] + 0.002; }
    const b = Wd.bgrid[c];
    if (b) { const B = Civ.buildings[b - 1]; if (B && (B.type === BT.WALL || B.type === BT.TOWER) && B.prog >= 1 && B.kd !== U.kd[i]) return false; }
    return true;
  }
  function step(i) {
    if (U.flags[i] & FL.POSSESSED) { avatarStep(i); return; }
    const st = U.st[i];
    if (st === ST.WORK) { if (--U.tm[i] <= 0) finishWork(i); return; }
    if (st === ST.IDLE) return;
    if (st === ST.FIGHT) { fightStep(i); return; }
    if (U.task[i] === TK.ATTACKB) { const b = Civ.buildings[U.tref[i]]; if (!b || !b.alive) { U.st[i] = ST.IDLE; return; } const r = Math.max(b.w, b.h) / 2 + 0.9; if (dist2(U.x[i], U.y[i], b.cx, b.cy) <= r * r) { U.st[i] = ST.WORK; U.tm[i] = 15; return; } }
    moveToward(i, U.tx[i], U.ty[i], true);
  }
  function moveToward(i, tx, ty, arriveCheck) {
    const x = U.x[i], y = U.y[i], dx = tx - x, dy = ty - y, d2 = dx * dx + dy * dy;
    if (d2 < 0.09) { if (arriveCheck) arrive(i); return; }
    const d = Math.sqrt(d2);
    let s = U.spd[i] * speedMul(i);
    if (s > d) s = d;
    const ux = dx / d, uy = dy / d, nx = x + ux * s, ny = y + uy * s;
    if (canEnter(i, nx, ny)) { U.x[i] = nx; U.y[i] = ny; U.stuck[i] = 0; }
    else if (Math.abs(ux) > 0.2 && canEnter(i, nx, y)) U.x[i] = nx;
    else if (Math.abs(uy) > 0.2 && canEnter(i, x, ny)) U.y[i] = ny;
    else if (U.layer[i] === 0 && (U.task[i] === TK.DIG || U.task[i] === TK.ASCEND)) { startDig(i, nx, ny); return; }
    else { if (++U.stuck[i] > 12) blocked(i, nx, ny); return; }
    U.fx[i] = ux; U.fy[i] = uy; U.anim[i] += s * 3;
    if (U.layer[i] === 1 && (AG.tick & 3) === 0 && U.pid[i] >= 0) { const c = (U.y[i] | 0) * W + (U.x[i] | 0); if (Wd.traffic[c] < 250) Wd.traffic[c] += 2; }
  }
  function blocked(i, nx, ny) {
    U.stuck[i] = 0;
    const c = (ny | 0) * W + (nx | 0);
    if (U.layer[i] === 1 && Wd.bgrid[c] && U.pid[i] >= 0) { const b = Civ.buildings[Wd.bgrid[c] - 1]; if (b && (b.type === BT.WALL || b.type === BT.TOWER) && Civ.atWar(U.kd[i], b.kd)) { U.task[i] = TK.ATTACKB; U.tref[i] = b.id; U.st[i] = ST.WORK; U.tm[i] = 15; return; } }
    if (U.task[i] === TK.MARCH || U.task[i] === TK.TRADE || U.task[i] === TK.SETTLE || U.task[i] === TK.MIGRATE) { U.stuck[i] = 20; wander(i, 3); return; }
    U.st[i] = ST.IDLE;
  }
  function arrive(i) {
    const P = U.pid[i] >= 0 ? Ent.person(i) : null;
    switch (U.task[i]) {
      case TK.GATHER: U.st[i] = ST.WORK; U.tm[i] = 50 - Ent.skill(i, SK.GATHER) / 6; return;
      case TK.FISH: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.GATHER) / 6; return;
      case TK.WOOD: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.CRAFT) / 6; return;
      case TK.QUARRY: U.st[i] = ST.WORK; U.tm[i] = 60; return;
      case TK.FARM: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.FARM) / 5; return;
      case TK.HERD: U.st[i] = ST.WORK; U.tm[i] = 70; return;
      case TK.CRAFT: U.st[i] = ST.WORK; U.tm[i] = 80; return;
      case TK.TRADE: U.st[i] = ST.WORK; U.tm[i] = 90; return;
      case TK.BUILD: U.st[i] = ST.WORK; U.tm[i] = 30; return;
      case TK.WORSHIP: U.st[i] = ST.WORK; U.tm[i] = 70; return;
      case TK.GRAZE: U.st[i] = ST.WORK; U.tm[i] = 30; return;
      case TK.ATTACKB: U.st[i] = ST.WORK; U.tm[i] = 15; return;
      case TK.EAT: U.st[i] = ST.WORK; U.tm[i] = 25; return;
      case TK.REST: U.st[i] = ST.WORK; U.tm[i] = 90 + rnd() * 60; return;
      case TK.SOCIAL: case TK.COURT: U.st[i] = ST.WORK; U.tm[i] = 40; return;
      case TK.PLAY: U.st[i] = ST.WORK; U.tm[i] = 30; return;
      case TK.HUNT: U.st[i] = ST.WORK; U.tm[i] = 40; return; // tracking small game
      case TK.DEPOSIT: deposit(i); U.st[i] = ST.IDLE; U.task[i] = TK.NONE; return;
      case TK.MINE: U.layer[i] = 0; U.task[i] = TK.DIG; digTarget(i); return;
      case TK.DIG: U.task[i] = TK.ASCEND; ascendTarget(i); return;
      case TK.ASCEND: { U.layer[i] = 1; const c = Civ.cities[U.city[i]]; if (U.carry[i] && c) goHome(i, c, TK.DEPOSIT); else { U.st[i] = ST.IDLE; U.task[i] = TK.NONE; } return; }
      case TK.EXPLORE: if (P) { P.visited++; P.needs.purpose = Math.min(1, P.needs.purpose + 0.3); People.taste(P, 15, 2); if (P.goal === 3 && P.visited > 25 && !P.goalDone) People.goalDone(P, 'seeing the wide world'); } U.st[i] = ST.IDLE; return;
      case TK.PATROL: case TK.WANDER: if (rnd() < 0.5) { U.st[i] = ST.WORK; U.task[i] = TK.NONE; U.tm[i] = 20 + rnd() * 40; } else U.st[i] = ST.IDLE; return;
      case TK.FLEE: U.flags[i] &= ~FL.FLEE; U.st[i] = ST.IDLE; return;
      default: U.st[i] = ST.IDLE;
    }
  }
  function deposit(i) {
    const c = Civ.cities[U.city[i]];
    if (c && U.carry[i]) {
      if (U.carry[i] === 1) Civ.creditFood(c, U.camt[i] / 100);
      else Civ.addRes(c, U.carry[i], U.camt[i]);
    }
    U.carry[i] = 0; U.camt[i] = 0;
  }
  // food earned by a trip: the model's yearly yield, scaled by how long the trip took
  function tripFood(i, P, c, job, bonus) {
    const dt = Math.max(30, AG.tick - U.tm0[i]) / AG.YEAR_TICKS;
    return Math.min(255, Math.round(Civ.yieldPerYear(c, job, P) * dt * Civ.AGENT_YIELD * (bonus || 1) * 100));
  }
  function digTarget(i) { for (let t = 0; t < 6; t++) { const a = rnd() * Math.PI * 2, r = 6 + rnd() * 14, x = U.x[i] + Math.cos(a) * r, y = U.y[i] + Math.sin(a) * r; if (x > 3 && y > 3 && x < W - 3 && y < H - 3) { goTo(i, x, y, TK.DIG); return; } } U.task[i] = TK.ASCEND; ascendTarget(i); }
  function ascendTarget(i) { const c = Civ.cities[U.city[i]], m = c ? Civ.cityMine(c) : null; if (m) goTo(i, m.cx, m.cy, TK.ASCEND); else { U.layer[i] = 1; U.st[i] = ST.IDLE; U.task[i] = TK.NONE; } }
  function startDig(i, nx, ny) {
    const c = (ny | 0) * W + (nx | 0), u = Wd.ug[c];
    if (u === UG.BEDROCK) { if (U.task[i] === TK.DIG) { U.task[i] = TK.ASCEND; ascendTarget(i); } else { U.layer[i] = 1; U.st[i] = ST.IDLE; } return; }
    const hard = u === UG.DIRT ? 18 : u === UG.CRYSTAL ? 70 : u === UG.GOLD || u === UG.IRON || u === UG.COPPER || u === UG.TIN ? 45 : 35;
    U.st[i] = ST.WORK; U.tref[i] = c; U.tm[i] = hard * (1 - Ent.skill(i, SK.CRAFT) / 300);
  }
  function finishWork(i) {
    const task = U.task[i], c = Civ.cities[U.city[i]], P = Ent.person(i);
    switch (task) {
      case TK.GATHER: {
        const t = U.tref[i];
        if (t >= 0 && Wd.veg[t] >= 30) Wd.veg[t] -= 18;
        if (P && c) { U.carry[i] = 1; U.camt[i] = tripFood(i, P, c, J.GATHER); People.taste(P, 6, 1); }
        Ent.gainSkill(i, SK.GATHER, 0.6); break;
      }
      case TK.FISH: if (P && c) { U.carry[i] = 1; U.camt[i] = tripFood(i, P, c, J.FISH); People.taste(P, 18, 1); } Ent.gainSkill(i, SK.GATHER, 0.6); break;
      case TK.HUNT: if (P && c) { U.carry[i] = 1; U.camt[i] = tripFood(i, P, c, J.HUNT, 0.55); } break; // no big kill: snares and small game
      case TK.WOOD: { const t = U.tref[i]; if (t >= 0 && Wd.veg[t] >= 100) { Wd.veg[t] -= 90; U.carry[i] = 2; U.camt[i] = 3; Wd.dirty[Wd.chunkOfIdx(t)] = 1; } Ent.gainSkill(i, SK.CRAFT, 0.5); break; }
      case TK.QUARRY: U.carry[i] = rnd() < 0.15 ? 4 : 3; U.camt[i] = 2; Ent.gainSkill(i, SK.CRAFT, 0.6); break;
      case TK.FARM: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive && c && P) { b.growth = Math.max(0, b.growth - 0.3); U.carry[i] = 1; U.camt[i] = tripFood(i, P, c, J.FARM); People.taste(P, 8, 1); }
        Ent.gainSkill(i, SK.FARM, 1); break;
      }
      case TK.HERD: if (P && c) { U.carry[i] = 1; U.camt[i] = tripFood(i, P, c, J.HERD); People.taste(P, 9, 1); } Ent.gainSkill(i, SK.HERD, 1); break;
      case TK.CRAFT: if (c) { c.goods += 1; if (Tech.knows(c, 'copper')) c.metal += 0.3; } if (P) People.taste(P, 7, 1); Ent.gainSkill(i, SK.CRAFT, 1); break;
      case TK.TRADE: if (c) { c.gold += 0.5; } Ent.gainSkill(i, SK.CRAFT, 0.5); break;
      case TK.BUILD: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive && b.prog < 1) { b.prog += b.type === BT.WALL ? 0.6 : (0.45 + (Ent.skill(i, SK.BUILD) / 100) * 0.4) / Math.sqrt(b.w * b.h); if (b.prog >= 1) Civ.complete(b); }
        Ent.gainSkill(i, SK.BUILD, 1); break;
      }
      case TK.WORSHIP: if (c && P) { c.faith += 1; P.belief.devotion = Math.min(1, P.belief.devotion + 0.01); P.emo.grief *= 0.8; P.emo.fear *= 0.8; Ent.gainSkill(i, SK.LORE, 0.5); } break;
      case TK.EAT: if (P && c) { if (c.food > 0) { P.needs.food = 1; U.energy[i] = 1; } else P.needs.food = Math.max(P.needs.food, Math.min(1, c.nutr + 0.1)); /* the day's gathering, as well as the band is fed */ P.emo.joy = Math.min(1, P.emo.joy + 0.03); } break;
      case TK.REST: if (P) { P.needs.rest = 1; } break;
      case TK.SOCIAL: case TK.COURT: case TK.PLAY: {
        if (P) {
          const n = Ent.near(U.x[i], U.y[i], 2.5, 1, 8);
          for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (j === i || U.pid[j] < 0) continue; const Q = Ent.person(j); if (!Q) continue; People.interact(P, Q, task === TK.COURT ? 1.4 : 1); if (task === TK.COURT) { const t = People.tie(P, Q.id); if (t.aff > 0.4) { P.emo.love = Math.min(1, P.emo.love + 0.3); if (t.aff > 0.6 && !P.spouse && !Q.spouse && Q.sex !== P.sex && !People.isKin(P, Q) && Life.canMate(P.gen, 0, Q.gen, 0) && rnd() < 0.3) People.marry(P, Q); } } break; }
          P.needs.social = Math.min(1, P.needs.social + 0.4);
        }
        break;
      }
      case TK.GRAZE: { const t = (U.y[i] | 0) * W + (U.x[i] | 0); if (Wd.veg[t] > 20) { Wd.veg[t] -= 20; U.energy[i] = Math.min(1, U.energy[i] + 0.35); } break; }
      case TK.ATTACKB: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive) { Civ.damageBuilding(b.id, U.dmg[i] * 1.5, U.kd[i]); if (b.alive && b.type !== BT.WALL && rnd() < 0.04) Wd.fire[b.y * W + b.x] = 200; AG.FX.burst(b.cx, b.cy, 'dust', 2); if (b.alive && U.sq[i] >= 0) { U.tm[i] = 15; return; } }
        break;
      }
      case TK.DIG: case TK.ASCEND: {
        const t = U.tref[i];
        if (t >= 0) {
          const u = Wd.ug[t];
          Wd.ug[t] = UG.TUNNEL; Wd.wakeU(t % W, (t / W) | 0);
          if (!U.carry[i]) {
            if (u === UG.IRON || u === UG.COPPER || u === UG.TIN) { U.carry[i] = 4; U.camt[i] = 3; }
            else if (u === UG.GOLD) { U.carry[i] = 5; U.camt[i] = 3; }
            else if (rnd() < 0.3) { U.carry[i] = 3; U.camt[i] = 2; }
          }
          Ent.gainSkill(i, SK.CRAFT, 0.8);
          if (U.carry[i] && task === TK.DIG) { U.task[i] = TK.ASCEND; ascendTarget(i); return; }
        }
        U.st[i] = ST.MOVE; return;
      }
    }
    if (P && task !== TK.REST && task !== TK.EAT) P.needs.purpose = Math.min(1, P.needs.purpose + 0.2);
    U.st[i] = ST.IDLE; U.task[i] = TK.NONE;
  }
  function fightStep(i) {
    const t = U.tgt[i];
    if (t < 0 || !U.alive[t] || U.layer[t] !== U.layer[i]) { U.st[i] = ST.IDLE; U.tgt[i] = -1; if (U.task[i] === TK.HUNT) U.task[i] = TK.NONE; return; }
    const dx = U.x[t] - U.x[i], dy = U.y[t] - U.y[i], d2 = dx * dx + dy * dy;
    if (d2 > 324) { U.st[i] = ST.IDLE; U.tgt[i] = -1; return; }
    const reach = SPECIES[U.sp[t]].kind === 'vehicle' ? 1.5 : U.pid[i] >= 0 && U.task[i] === TK.HUNT && Tech.knows(Civ.cities[U.city[i]], 'bow') ? 4 : 1.05;
    if (d2 > reach * reach) { moveToward(i, U.x[t], U.y[t], false); return; }
    const d = Math.sqrt(d2) || 1;
    U.fx[i] = dx / d; U.fy[i] = dy / d;
    if (U.cd[i] <= 0) {
      if (reach > 2) { AG.Proj.fire(0, U.x[i], U.y[i], U.x[t], U.y[t], U.dmg[i] * 1.4, U.kd[i], 1, i); U.cd[i] = 26; }
      else { attack(i, t); U.cd[i] = 22 - (Ent.phen(i, LL.SPEED) / 255) * 10; }
    }
  }
  function attack(i, t) {
    let dmg = U.dmg[i] * (0.8 + rnd() * 0.4) * (1 + (Ent.skill(i, SK.FIGHT) / 100) * 0.6);
    const ca = U.pid[i] >= 0 ? Civ.cities[U.city[i]] : null, ct = U.pid[t] >= 0 ? Civ.cities[U.city[t]] : null;
    if (ca) dmg *= (Tech.knows(ca, 'spear') ? 1.25 : 1) * (Tech.knows(ca, 'bronze') ? 1.3 : 1) * (Tech.knows(ca, 'iron') ? 1.2 : 1);
    if (ct && Tech.knows(ct, 'bronze')) dmg /= 1.2;
    if (U.traits[i] & TR.brave) dmg *= 1.1;
    if (U.flags[i] & FL.BLESSED) dmg *= 1.2;
    const ax = U.x[i] - U.x[t], ay = U.y[i] - U.y[t], al = Math.hypot(ax, ay) || 1;
    const dot = (U.fx[t] * ax + U.fy[t] * ay) / al;
    let flank = false;
    if (dot < -0.3) { dmg *= 1.6; flank = true; } else if (dot < 0.3) dmg *= 1.25;
    if (U.pid[i] >= 0) Ent.gainSkill(i, SK.FIGHT, 0.4);
    AG.FX.burst(U.x[t], U.y[t], flank ? 'spark' : 'blood', flank ? 5 : 2, U.layer[t]);
    Ent.damage(t, dmg, i);
  }
  AI.attack = attack;

  // ------------------------------------------------------------ possession
  function avatarStep(i) {
    const inp = AG.God.input;
    let dx = inp.dx, dy = inp.dy;
    if (!dx && !dy && inp.moveTo) { const ex = inp.moveTo.x - U.x[i], ey = inp.moveTo.y - U.y[i], d = Math.hypot(ex, ey); if (d < 0.4) inp.moveTo = null; else { dx = ex / d; dy = ey / d; } }
    if (dx || dy) {
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      const s = U.spd[i] * 1.6 * speedMul(i), nx = U.x[i] + dx * s, ny = U.y[i] + dy * s;
      if (canEnter(i, nx, ny)) { U.x[i] = nx; U.y[i] = ny; } else if (canEnter(i, nx, U.y[i])) U.x[i] = nx; else if (canEnter(i, U.x[i], ny)) U.y[i] = ny;
      U.fx[i] = dx; U.fy[i] = dy; U.anim[i] += s * 3;
    }
    if (inp.act && U.cd[i] <= 0) {
      let best = -1, bd = 2.2 * 2.2;
      const n = Ent.near(U.x[i], U.y[i], 2.2, U.layer[i], 32);
      for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (j === i || SPECIES[U.sp[j]].kind === 'ambient') continue; if (U.kd[i] >= 0 && U.kd[j] === U.kd[i] && !hostile(i, j)) continue; const d = dist2(U.x[i], U.y[i], U.x[j], U.y[j]); if (d < bd) { bd = d; best = j; } }
      if (best >= 0) { attack(i, best); U.cd[i] = 12; }
    }
    if (inp.power && U.cd[i] <= 0) { inp.power = false; AG.Proj.fire(U.pid[i] >= 0 ? 0 : 2, U.x[i], U.y[i], inp.aimX, inp.aimY, 20, U.kd[i], U.layer[i] === 2 ? 1 : U.layer[i], i); U.cd[i] = 25; }
  }

  // ============================================================ projectiles (v1)
  const PM = 2048;
  const Proj = (AG.Proj = {
    n: 0, x: new Float32Array(PM), y: new Float32Array(PM), z: new Float32Array(PM), vx: new Float32Array(PM), vy: new Float32Array(PM), vz: new Float32Array(PM),
    t: new Float32Array(PM), kind: new Uint8Array(PM), kd: new Int16Array(PM), dmg: new Float32Array(PM), owner: new Int32Array(PM), layer: new Uint8Array(PM),
  });
  const SPEED = [0.55, 0.26, 0.32, 0.6], GRAV = [0.01, 0.02, 0.006, 0];
  Proj.KINDS = ['arrow', 'boulder', 'fireball', 'holy'];
  Proj.fire = function (kind, x, y, tx, ty, dmg, kd, layer, owner) {
    if (Proj.n >= PM) return;
    const p = Proj.n++;
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 0.1;
    const T = Math.max(4, d / SPEED[kind]);
    const z0 = owner >= 0 && U.alive[owner] && U.layer[owner] === 2 ? 4 : 0.6;
    Proj.x[p] = x; Proj.y[p] = y; Proj.z[p] = z0; Proj.vx[p] = dx / T; Proj.vy[p] = dy / T;
    Proj.vz[p] = (GRAV[kind] * T) / 2 - z0 / T; Proj.t[p] = T;
    Proj.kind[p] = kind; Proj.kd[p] = kd; Proj.dmg[p] = dmg; Proj.owner[p] = owner; Proj.layer[p] = layer;
  };
  Proj.reset = () => { Proj.n = 0; };
  Proj.tick = function () {
    let n = Proj.n;
    for (let p = 0; p < n; p++) {
      Proj.x[p] += Proj.vx[p]; Proj.y[p] += Proj.vy[p];
      Proj.vz[p] -= GRAV[Proj.kind[p]]; Proj.z[p] += Proj.vz[p];
      if (--Proj.t[p] > 0) continue;
      impact(p);
      n--;
      if (p !== n) {
        Proj.x[p] = Proj.x[n]; Proj.y[p] = Proj.y[n]; Proj.z[p] = Proj.z[n]; Proj.vx[p] = Proj.vx[n]; Proj.vy[p] = Proj.vy[n]; Proj.vz[p] = Proj.vz[n];
        Proj.t[p] = Proj.t[n]; Proj.kind[p] = Proj.kind[n]; Proj.kd[p] = Proj.kd[n]; Proj.dmg[p] = Proj.dmg[n]; Proj.owner[p] = Proj.owner[n]; Proj.layer[p] = Proj.layer[n];
        p--;
      }
    }
    Proj.n = n;
  };
  function friendly(j, kd, owner) {
    if (j === owner) return true;
    if (owner >= 0 && U.alive[owner] && U.pid[owner] >= 0 && U.sid[j] >= 0 && U.pid[j] < 0) return false; // a hunter's arrow
    if (kd >= 0) return U.kd[j] === kd || !Civ.hostileToKingdom(j, kd);
    return owner >= 0 && U.alive[owner] && U.sp[j] === U.sp[owner];
  }
  function impact(p) {
    const x = Proj.x[p], y = Proj.y[p], kind = Proj.kind[p], kd = Proj.kd[p], dmg = Proj.dmg[p], owner = Proj.owner[p], layer = Proj.layer[p];
    const attacker = owner >= 0 && U.alive[owner] ? owner : -1;
    if (kind === 0) {
      const n = Ent.near(x, y, 0.9, layer, 8);
      for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (friendly(j, kd, owner)) continue; Ent.damage(j, dmg, attacker, 'an arrow'); break; }
      return;
    }
    const r = kind === 1 ? 1.8 : kind === 2 ? 1.6 : 2.5;
    const n = Ent.near(x, y, r, layer, 32), hit = [];
    for (let q = 0; q < n; q++) hit.push(Ent.buf[q]);
    for (const j of hit) { if (!U.alive[j] || friendly(j, kd, owner)) continue; Ent.damage(j, kind === 1 ? dmg * 0.4 : dmg, attacker, kind === 1 ? 'a siege stone' : kind === 2 ? 'fire' : 'holy light'); }
    const seen = new Set();
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = (x + ox) | 0, cy = (y + oy) | 0;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const c = cy * W + cx, b = Wd.bgrid[c];
      if (kind === 2 && (Wd.veg[c] > 20 || b) && rnd() < 0.6) Wd.fire[c] = 220;
      if (b && !seen.has(b) && kind !== 3) { seen.add(b); const B = Civ.buildings[b - 1]; if (B && B.kd !== kd) Civ.damageBuilding(b - 1, kind === 1 ? dmg * 1.2 : dmg * 0.6, kd); }
      if (kind === 2) Wd.wake(cx, cy);
    }
    AG.FX.burst(x, y, kind === 1 ? 'debris' : kind === 2 ? 'explosion' : 'holy', kind === 2 ? 18 : 10, layer);
  }
})();
