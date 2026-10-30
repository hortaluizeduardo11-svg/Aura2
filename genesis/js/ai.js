/* AURA: Genesis — ai.js
 * Per-unit behaviour. Movement runs every tick for every unit (cheap); the
 * expensive "think" (spatial queries, task choice) runs for 1/8 of units per
 * tick, staggered by index. Also: combat with facing-based flanking bonuses,
 * underground digging, animals, monsters, the wyrm, trade vehicles, siege
 * engines, possessed avatars and the projectile pool. */
'use strict';
(function () {
  const AG = window.AG, U = AG.U, Wd = AG.World, Ent = AG.Ent, Civ = AG.Civ, Flow = AG.Flow;
  const { W, H, NG, SP, SPECIES, TK, ST, FL, FT, GT, UG, UF, SO, J, G, BT, TR, SK } = AG;
  const rnd = AG.rnd, dist2 = AG.dist2;
  const AI = (AG.AI = {});
  const YEAR = 1 / AG.YEAR_TICKS;

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
    switch (da.kind) {
      case 'monster': return db.kind !== 'monster';
      case 'civ':
        if (db.kind === 'monster' || b === SP.WOLF) return true;
        if (db.kind === 'civ' || db.kind === 'vehicle') {
          if ((U.flags[i] & FL.MAD) || (U.flags[j] & FL.MAD)) return db.kind === 'civ';
          const ka = U.kd[i], kb = U.kd[j];
          return ka >= 0 && kb >= 0 && ka !== kb && Civ.kingdoms[ka].war[kb] === 1;
        }
        return false;
      case 'avatar': return db.kind === 'monster' || (U.flags[j] & FL.MAD) !== 0;
      case 'animal': return a === SP.WOLF && (b === SP.DEER || (db.kind === 'civ' && U.food[i] < 0.25));
      default: return false;
    }
  }
  AI.hostile = hostile;
  function findHostile(i, r) {
    const n = Ent.near(U.x[i], U.y[i], r, U.layer[i], 64);
    let best = -1, bd = 1e9;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if (!hostile(i, j)) continue;
      const d = dist2(U.x[i], U.y[i], U.x[j], U.y[j]);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }
  function findSpecies(i, sp, r) {
    const n = Ent.near(U.x[i], U.y[i], r, U.layer[i], 32);
    for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (j !== i && U.sp[j] === sp) return j; }
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
  function wander(i, r) {
    for (let t = 0; t < 6; t++) {
      const x = U.x[i] + (rnd() - 0.5) * 2 * r, y = U.y[i] + (rnd() - 0.5) * 2 * r;
      if (okCell(i, x, y)) { goTo(i, x, y, TK.WANDER); return; }
    }
  }
  function wanderNear(i, cx, cy, r) {
    for (let t = 0; t < 6; t++) {
      const x = cx + (rnd() - 0.5) * 2 * r, y = cy + (rnd() - 0.5) * 2 * r;
      if (okCell(i, x, y)) { goTo(i, x, y, TK.WANDER); return; }
    }
  }
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
    for (let t = 0; t < 10; t++) {
      const a = rnd() * Math.PI * 2, r = 2 + rnd() * 5;
      const x = U.x[i] + Math.cos(a) * r, y = U.y[i] + Math.sin(a) * r;
      if (okCell(i, x, y)) { goTo(i, x, y, TK.FLEE); U.flags[i] |= FL.FLEE; return; }
    }
  }
  AI.react = function (t, a) {
    const d = SPECIES[U.sp[t]];
    if (d.kind === 'vehicle' || d.kind === 'ambient' || U.st[t] === ST.WORK && U.task[t] === TK.ATTACKB) return;
    if (U.sp[t] === SP.DEER || U.layer[t] !== U.layer[a]) { fleeFrom(t, a); return; }
    if (d.kind === 'civ') {
      const tr = U.traits[t];
      if ((tr & TR.coward) || U.job[t] === J.CHILD || (U.hp[t] < U.mhp[t] * 0.3 && !(tr & TR.brave))) { fleeFrom(t, a); return; }
    }
    engage(t, a);
  };

  // ============================================================ think
  function think(i) {
    const sp = U.sp[i], d = SPECIES[sp];
    if (U.age[i] > U.life[i]) { Ent.kill(i, 'old age'); return; }
    if (U.layer[i] !== 2) { hazards(i, d); if (!U.alive[i]) return; }
    if (U.dis[i]) { disease(i); if (!U.alive[i]) return; }
    if (U.hp[i] < U.mhp[i] && U.food[i] > 0.2 && !U.dis[i]) U.hp[i] = Math.min(U.mhp[i], U.hp[i] + U.mhp[i] * 0.008);
    if (U.flags[i] & FL.POSSESSED) return;
    switch (d.kind) {
      case 'civ': thinkCiv(i, d); break;
      case 'animal': if (d.diet === 'graze') thinkGrazer(i); else thinkHunter(i); break;
      case 'monster': thinkMonster(i, sp); break;
      case 'vehicle': thinkVehicle(i, sp); break;
      case 'ambient': thinkBird(i); break;
      case 'avatar': thinkAvatar(i); break;
    }
  }

  function hurt(i, dmg, cause) { U.hp[i] -= dmg; if (U.hp[i] <= 0) Ent.kill(i, cause); }
  function hazards(i, d) {
    const c = (U.y[i] | 0) * W + (U.x[i] | 0), fr = d.fireRes || 0;
    if (U.layer[i] === 1) {
      const f = Wd.fl[c];
      if (f > 0.004 && !Wd.frozen[c]) {
        const ty = Wd.ft[c];
        if (ty === FT.LAVA) { hurt(i, 25 * (1 - fr), 'lava'); escape(i); }
        else if (ty === FT.ACID) { hurt(i, 10, 'acid'); escape(i); }
        else if (f > 0.06 && !d.naval) { hurt(i, 3, 'drowning'); escape(i); }
        if (!U.alive[i]) return;
      }
      if (Wd.fire[c]) {
        hurt(i, 7 * (1 - fr), 'fire'); if (!U.alive[i]) return;
        if (d.kind === 'civ' && rnd() < 0.04 && Ent.addTrait(i, 'fireborn')) Ent.memory(i, 'Walked out of the flames');
        escape(i);
      }
      if (Wd.gt[c] === GT.MIASMA && Wd.gas[c] > 0.12) { hurt(i, Wd.gas[c] * 8, 'poison'); if (!U.alive[i]) return; }
      if (d.kind === 'civ' || d.kind === 'animal') {
        const T = Wd.T(c);
        if (T < -0.15) hurt(i, (1 - (d.coldRes || 0)) * 1.2, 'cold');
        else if (T > 1.2) hurt(i, (1 - fr) * 1.2, 'heat');
      } else if (U.sp[i] === SP.HOLLOW && AG.Sky.daylight() > 0.75 && Wd.veg[c] < 165) hurt(i, 0.5, 'sunlight');
    } else if (Wd.ugF[c] > 20) {
      if (Wd.ugT[c] === UF.MAGMA) { hurt(i, 25 * (1 - fr), 'magma'); escape(i); }
      else if (Wd.ugF[c] > 60 && U.sp[i] !== SP.CRAWLER) { hurt(i, 3, 'drowning'); escape(i); }
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
    const t = U.dtm[i], res = U.genes[i * NG + G.RES] / 255;
    if (t > D.incubation) {
      let dmg = U.mhp[i] * D.lethality * (8 / AG.DAY_TICKS) * (1.25 - res * 0.9) * (U.traits[i] & TR.sickly ? 1.4 : 1);
      const k = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]] : null;
      if (k && k.religion >= 0 && Civ.religions[k.religion].tenet === 'ascetic') dmg *= 0.7;
      U.hp[i] -= dmg;
      if (U.hp[i] <= 0) { Ent.kill(i, D.name); return; }
      if (D.madness && !(U.flags[i] & FL.MAD) && rnd() < 0.1) { U.flags[i] |= FL.MAD; Ent.memory(i, `Driven mad by ${D.name}`); }
      if (rnd() < 0.15) AG.FX.spawn(U.x[i], U.y[i], 0, 0, 0.9, drgb(D), 0.45, 0, U.layer[i], 0.03);
    }
    if (t > D.incubation * 0.5) {
      const n = Ent.near(U.x[i], U.y[i], D.radius, U.layer[i], 16);
      for (let q = 0; q < n; q++) {
        const j = Ent.buf[q];
        if (j === i || U.dis[j]) continue;
        const rj = U.genes[j * NG + G.RES] / 255;
        if (rnd() < D.contagion * (1.2 - rj) * (U.traits[j] & TR.sickly ? 1.5 : 1) && Ent.infect(j, di)) Ent.memory(j, `Fell ill with ${D.name}`);
      }
    }
    if (t > D.incubation + D.duration) {
      U.imm[i] |= 1 << di; U.dis[i] = 0; U.flags[i] &= ~FL.MAD;
      Ent.memory(i, `Survived ${D.name}`);
    }
  }

  // ------------------------------------------------------------ civilised folk
  function thinkCiv(i, d) {
    const cid = U.city[i], c = cid >= 0 ? Civ.cities[cid] : null;
    U.food[i] -= U.job[i] === J.CHILD ? 0.005 : 0.008;
    if (U.food[i] < 0.4) {
      if (c && c.food >= 1) { c.food -= 1; U.food[i] = 1; }
      else if (U.food[i] <= 0) { U.food[i] = 0; hurt(i, U.mhp[i] * 0.03, 'starvation'); if (!U.alive[i]) return; }
    }
    const job = U.job[i];
    if (job === J.CHILD && U.age[i] >= d.adult) { U.job[i] = J.GATHER; Ent.memory(i, 'Came of age'); }
    else if (job !== J.ELDER && job !== J.CHILD && U.age[i] > U.life[i] * 0.86 && !(U.flags[i] & FL.KING) && U.sq[i] < 0) U.job[i] = J.ELDER;
    if (U.spouse[i] < 0 && U.job[i] !== J.CHILD && U.job[i] !== J.ELDER && rnd() < 0.06) seekSpouse(i);
    if (U.st[i] === ST.FIGHT) { validateFight(i); return; }
    if (U.st[i] === ST.WORK && U.task[i] === TK.ATTACKB) return;
    const foe = findHostile(i, U.sq[i] >= 0 ? 8 : 6);
    if (foe >= 0) {
      const t = U.traits[i];
      const fight = U.job[i] === J.SOLDIER || U.sq[i] >= 0 || (t & TR.brave) || (U.flags[i] & FL.MAD) ||
        (!(t & TR.coward) && U.job[i] !== J.CHILD && U.hp[i] > U.mhp[i] * 0.5 && rnd() < 0.5);
      if (fight) { engage(i, foe); return; }
      if (!(U.flags[i] & FL.FLEE)) { fleeFrom(i, foe); return; }
    }
    if (U.flags[i] & FL.FLEE) { if (U.st[i] === ST.MOVE) return; U.flags[i] &= ~FL.FLEE; }
    if (U.sq[i] >= 0) { squadThink(i); return; }
    if (U.flags[i] & FL.SETTLER) { settlerThink(i); return; }
    if (U.st[i] !== ST.IDLE) return;
    chooseTask(i, c);
  }
  function validateFight(i) {
    const t = U.tgt[i];
    if (t < 0 || !U.alive[t] || U.layer[t] !== U.layer[i]) { U.st[i] = ST.IDLE; U.tgt[i] = -1; return; }
    if (SPECIES[U.sp[i]].kind === 'civ' && U.hp[i] < U.mhp[i] * 0.25 && !(U.traits[i] & TR.brave) && !(U.flags[i] & FL.MAD) && rnd() < 0.4) fleeFrom(i, t);
  }
  function isKin(a, b) {
    const ra = AG.People.rec(a), rb = AG.People.rec(b);
    if (!ra || !rb) return false;
    if ((ra.mom && ra.mom === rb.mom) || (ra.dad && ra.dad === rb.dad)) return true;
    return ra.mom === rb.uid || ra.dad === rb.uid || rb.mom === ra.uid || rb.dad === ra.uid;
  }
  function seekSpouse(i) {
    const n = Ent.near(U.x[i], U.y[i], 8, U.layer[i], 48), sp = U.sp[i], adult = SPECIES[sp].adult;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if (j === i || U.sp[j] !== sp || U.sex[j] === U.sex[i] || U.spouse[j] >= 0 || U.age[j] < adult || U.job[j] === J.ELDER || U.kd[j] !== U.kd[i]) continue;
      if (isKin(i, j)) continue;
      Civ.marry(i, j);
      return;
    }
  }
  // A dry cell next to open water: somewhere to fish.
  function shore(i) {
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : i, x < W - 1 ? i + 1 : i, i - W, i + W]) {
      if (j >= 0 && j < W * H && Wd.fl[j] > 0.03 && Wd.ft[j] === FT.WATER && !Wd.frozen[j]) return true;
    }
    return false;
  }
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
  function chooseTask(i, c) {
    if (U.layer[i] === 0) { // stranded underground: climb out
      const m = c ? Civ.cityMine(c) : null;
      if (m) goTo(i, m.cx, m.cy, TK.ASCEND); else U.layer[i] = 1;
      return;
    }
    if (!c) {
      const nc = Civ.nearestCity(U.x[i], U.y[i], U.kd[i], 150) || (U.kd[i] < 0 ? Civ.nearestCity(U.x[i], U.y[i], -1, 60) : null);
      if (nc) Civ.joinCity(i, nc.id); else wander(i, 8);
      return;
    }
    if (U.carry[i]) { goTo(i, c.x + (rnd() - 0.5) * 3, c.y + 2 + rnd(), TK.DEPOSIT); return; }
    const t = U.traits[i];
    if ((U.goal[i] === 3 || (t & TR.curious)) && U.job[i] !== J.CHILD && rnd() < 0.06) { wander(i, 30); return; }
    if ((t & TR.pious) && rnd() < 0.08) { const tb = Civ.randomBuilding(c, BT.TEMPLE); if (tb) { goTo(i, tb.cx + (rnd() - 0.5) * 2, tb.y + tb.h + 0.4, TK.WORSHIP); return; } }
    switch (U.job[i]) {
      case J.CHILD: case J.ELDER: wanderNear(i, c.x, c.y, 6); return;
      case J.FARM: {
        const f = Civ.randomBuilding(c, BT.FARM);
        if (f) { goTo(i, f.x + 0.5 + rnd() * (f.w - 1), f.y + 0.5 + rnd() * (f.h - 1), TK.FARM); U.tref[i] = f.id; return; }
        break;
      }
      case J.WOOD: { const cell = findCell(c, 22, 1); if (cell >= 0) { goCell(i, cell, TK.WOOD); return; } break; }
      case J.MINE: {
        const m = Civ.cityMine(c);
        if (m) { goTo(i, m.cx, m.cy, TK.MINE); U.tref[i] = m.id; return; }
        const cell = findCell(c, 22, 2); if (cell >= 0) { goCell(i, cell, TK.QUARRY); return; }
        break;
      }
      case J.BUILD: {
        const b = c.site >= 0 ? Civ.buildings[c.site] : null;
        if (b && b.alive) { goTo(i, b.cx + (rnd() - 0.5) * b.w, b.y + b.h + 0.4, TK.BUILD); U.tref[i] = b.id; return; }
        break;
      }
      case J.SOLDIER: {
        for (let k = 0; k < 4; k++) {
          const a = rnd() * Math.PI * 2, r = c.radius * (0.4 + rnd() * 0.5), x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
          if (okCell(i, x, y)) { goTo(i, x, y, TK.PATROL); Ent.gainSkill(i, SK.COMBAT, 0.2); return; }
        }
        return;
      }
      case J.PRIEST: {
        const tb = Civ.randomBuilding(c, BT.TEMPLE);
        if (tb) { goTo(i, tb.cx + (rnd() - 0.5) * 2, tb.y + tb.h + 0.4, TK.WORSHIP); return; }
        break;
      }
    }
    if (rnd() < 0.2) { const deer = findSpecies(i, SP.DEER, 12); if (deer >= 0) { engage(i, deer); U.task[i] = TK.HUNT; return; } }
    let cell = findCell(c, 16, 0);
    if (cell < 0 || rnd() < 0.25) { const fish = findCell(c, 20, 3); if (fish >= 0) cell = fish; }
    if (cell >= 0) goCell(i, cell, TK.GATHER); else wanderNear(i, c.x, c.y, 8);
  }
  function settlerThink(i) {
    let ex = null;
    for (const e of Civ.expeditions) if (e.members.indexOf(i) >= 0) { ex = e; break; }
    if (!ex) { U.flags[i] &= ~FL.SETTLER; U.st[i] = ST.IDLE; return; }
    if (U.st[i] === ST.MOVE && rnd() < 0.5) return;
    const f = Civ.expeditionField(ex);
    if (f) { const nx = Flow.ahead(f, U.x[i], U.y[i], 4); if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.SETTLE); return; } }
    goTo(i, ex.x + (rnd() - 0.5) * 2, ex.y + (rnd() - 0.5) * 2, TK.SETTLE);
  }
  function enemyBuildingNear(i, tc, r) {
    let best = null, bd = r * r;
    for (const bid of tc.buildings) {
      const b = Civ.buildings[bid];
      if (!b.alive || b.kd === U.kd[i]) continue;
      const d = dist2(U.x[i], U.y[i], b.cx, b.cy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function squadThink(i) {
    const sq = Civ.squads[U.sq[i]];
    if (!sq || !sq.alive) { U.sq[i] = -1; U.task[i] = TK.NONE; U.st[i] = ST.IDLE; return; }
    const tc = Civ.cities[sq.target];
    if (sq.stage === 0) {
      if (U.st[i] === ST.IDLE || rnd() < 0.08) goTo(i, sq.rx + (rnd() - 0.5) * 8, sq.ry + (rnd() - 0.5) * 8, TK.MARCH);
      return;
    }
    if (U.flags[i] & (FL.FLANKL | FL.FLANKR)) {
      const wp = U.flags[i] & FL.FLANKL ? sq.wpL : sq.wpR;
      if (sq.stage === 1 && wp && dist2(U.x[i], U.y[i], wp.x, wp.y) > 12 && U.stuck[i] < 10) {
        if (U.st[i] !== ST.MOVE || rnd() < 0.15) goTo(i, wp.x + (rnd() - 0.5) * 3, wp.y + (rnd() - 0.5) * 3, TK.MARCH);
        return;
      }
      U.flags[i] &= ~(FL.FLANKL | FL.FLANKR); // in position: wheel in on the target
    }
    if (sq.stage === 2 && dist2(U.x[i], U.y[i], tc.x, tc.y) < 15 * 15) {
      const foe = findHostile(i, 10);
      if (foe >= 0) { engage(i, foe); return; }
      const b = enemyBuildingNear(i, tc, 9);
      if (b) { goTo(i, b.cx, b.cy, TK.ATTACKB); U.tref[i] = b.id; return; }
    }
    const f = Flow.get('L' + tc.id, tc.x, tc.y, 'L');
    if (f) { const nx = Flow.ahead(f, U.x[i], U.y[i], 4); if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.MARCH); return; } }
    goTo(i, tc.x + (rnd() - 0.5) * 4, tc.y + (rnd() - 0.5) * 4, TK.MARCH);
  }

  // ------------------------------------------------------------ animals & monsters
  function nearVeg(i, r, min) {
    for (let t = 0; t < 8; t++) {
      const x = (U.x[i] + (rnd() - 0.5) * 2 * r) | 0, y = (U.y[i] + (rnd() - 0.5) * 2 * r) | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const c = y * W + x;
      if (Wd.veg[c] >= min && Wd.passLand(c) && !Wd.bgrid[c]) return c;
    }
    return -1;
  }
  function thinkGrazer(i) {
    U.food[i] -= 0.008;
    if (U.food[i] <= 0) { U.food[i] = 0; hurt(i, 1, 'starvation'); if (!U.alive[i]) return; }
    const n = Ent.near(U.x[i], U.y[i], 5, 1, 32);
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q], s = U.sp[j];
      if (s === SP.WOLF || SPECIES[s].kind === 'monster' || (SPECIES[s].kind === 'civ' && U.task[j] === TK.HUNT)) { if (!(U.flags[i] & FL.FLEE)) fleeFrom(i, j); return; }
    }
    if (U.st[i] === ST.MOVE) return;
    U.flags[i] &= ~FL.FLEE;
    if (U.st[i] !== ST.IDLE) return;
    if (U.food[i] < 0.7) { const c = nearVeg(i, 6, 60); if (c >= 0) { goCell(i, c, TK.GRAZE); return; } }
    if (U.food[i] > 0.75 && U.age[i] > 1 && rnd() < 0.02) {
      const m = findSpecies(i, U.sp[i], 4);
      if (m >= 0 && Ent.spawn(U.sp[i], U.x[i], U.y[i], { mom: i, dad: m, age: 0 }) >= 0) U.food[i] -= 0.4;
    }
    if (rnd() < 0.5) wander(i, 6);
  }
  function thinkHunter(i) {
    U.food[i] -= 0.01;
    if (U.food[i] <= 0) { U.food[i] = 0; hurt(i, 1, 'starvation'); if (!U.alive[i]) return; }
    if (U.st[i] === ST.FIGHT) { validateFight(i); return; }
    if (U.food[i] < 0.75) { const prey = findHostile(i, 10); if (prey >= 0) { engage(i, prey); U.task[i] = TK.HUNT; return; } }
    if (U.st[i] !== ST.IDLE) return;
    if (U.food[i] > 0.8 && rnd() < 0.012) {
      const m = findSpecies(i, SP.WOLF, 5);
      if (m >= 0 && Ent.spawn(SP.WOLF, U.x[i], U.y[i], { mom: i, dad: m, age: 0 }) >= 0) U.food[i] -= 0.4;
    }
    const m = rnd() < 0.5 ? findSpecies(i, SP.WOLF, 12) : -1;
    if (m >= 0 && okCell(i, U.x[m], U.y[m])) goTo(i, U.x[m] + (rnd() - 0.5) * 4, U.y[m] + (rnd() - 0.5) * 4, TK.WANDER);
    else wander(i, 8);
  }
  function thinkMonster(i, sp) {
    if (sp === SP.WYRM) { thinkWyrm(i); return; }
    if (sp === SP.CRAWLER) {
      U.food[i] -= 0.004;
      if (Wd.ug[(U.y[i] | 0) * W + (U.x[i] | 0)] === UG.FUNGUS) U.food[i] = 1;
    }
    if (U.st[i] === ST.FIGHT) { validateFight(i); return; }
    const foe = findHostile(i, sp === SP.HOLLOW ? 12 : 8);
    if (foe >= 0) { engage(i, foe); return; }
    if (U.st[i] !== ST.IDLE) return;
    if (sp === SP.CRAWLER && U.food[i] > 0.6 && rnd() < 0.004) Ent.spawn(SP.CRAWLER, U.x[i], U.y[i], { layer: 0, mom: i, age: 0 });
    if (sp === SP.HOLLOW && rnd() < 0.3) {
      const c = Civ.nearestCity(U.x[i], U.y[i], -1, 60);
      if (c) { wanderNear(i, c.x, c.y, 8); return; }
    }
    wander(i, 6);
  }
  function thinkWyrm(i) {
    if (U.task[i] === TK.RAID) {
      const c = Civ.cities[U.tref[i]];
      U.aux[i] -= 8;
      if (!c || !c.alive || U.aux[i] <= 0) { U.task[i] = TK.WANDER; wander(i, 60); return; }
      const a = AG.tick * 0.02 + i;
      goTo(i, c.x + Math.cos(a) * 7, c.y + Math.sin(a) * 7, TK.RAID);
      if (U.cd[i] <= 0 && dist2(U.x[i], U.y[i], c.x, c.y) < 14 * 14) {
        U.cd[i] = 26;
        AG.Proj.fire(2, U.x[i], U.y[i], c.x + (rnd() - 0.5) * c.radius * 1.3, c.y + (rnd() - 0.5) * c.radius * 1.3, 18, -1, 1, i);
      }
      return;
    }
    if (U.st[i] !== ST.IDLE) return;
    if (rnd() < 0.08) {
      const c = Civ.nearestCity(U.x[i], U.y[i], -1, 140);
      if (c) {
        U.task[i] = TK.RAID; U.tref[i] = c.id; U.aux[i] = 420;
        if (rnd() < 0.5) AG.Chronicle.add(`A wyrm descends upon ${c.name}`, 'disaster', c.x, c.y);
        return;
      }
    }
    wander(i, 50);
  }
  function thinkAvatar(i) {
    if (U.st[i] === ST.FIGHT) { validateFight(i); return; }
    const foe = findHostile(i, 14);
    if (foe >= 0) { engage(i, foe); return; }
    if (rnd() < 0.08) holyNova(i, false);
    if (U.st[i] === ST.IDLE) wander(i, 12);
  }
  function holyNova(i, smite) {
    const n = Ent.near(U.x[i], U.y[i], 5, U.layer[i], 64);
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q], d = SPECIES[U.sp[j]];
      if (d.kind === 'civ') { U.hp[j] = U.mhp[j]; if (U.dis[j]) { U.imm[j] |= 1 << (U.dis[j] - 1); U.dis[j] = 0; } }
      else if (smite && d.kind === 'monster') Ent.damage(j, 60, i);
    }
    AG.FX.burst(U.x[i], U.y[i], 'holy', 18, U.layer[i]);
  }
  function thinkBird(i) {
    if (U.st[i] === ST.MOVE && rnd() < 0.6) return;
    const n = Ent.near(U.x[i], U.y[i], 7, 2, 24);
    let vx = 0, vy = 0, cx = 0, cy = 0, k = 0;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if (j === i || U.sp[j] !== SP.BIRD) continue;
      vx += U.tx[j] - U.x[j]; vy += U.ty[j] - U.y[j]; cx += U.x[j]; cy += U.y[j]; k++;
    }
    let tx, ty;
    if (k) { cx /= k; cy /= k; tx = U.x[i] + (vx / k) * 0.8 + (cx - U.x[i]) * 0.3 + (rnd() - 0.5) * 6; ty = U.y[i] + (vy / k) * 0.8 + (cy - U.y[i]) * 0.3 + (rnd() - 0.5) * 6; }
    else { tx = U.x[i] + (rnd() - 0.5) * 30; ty = U.y[i] + (rnd() - 0.5) * 30; }
    goTo(i, AG.clamp(tx, 4, W - 4), AG.clamp(ty, 4, H - 4), TK.WANDER);
  }

  // ------------------------------------------------------------ vehicles
  function thinkVehicle(i, sp) {
    U.tm[i] += 8;
    if (U.tm[i] > 9000) { Ent.kill(i, 'retired'); return; }
    if (sp === SP.CATAPULT) { thinkCatapult(i); return; }
    const dest = Civ.cities[U.tref[i]];
    if (!dest || !dest.alive) { Ent.kill(i, 'retired'); return; }
    let tx = dest.x, ty = dest.y + 2.5, field = null, arrive = 2.5;
    if (sp === SP.SHIP) {
      const dock = Civ.dockOf(dest);
      if (!dock) { Ent.kill(i, 'retired'); return; }
      tx = dock.cx; ty = dock.cy; field = Civ.seaField(dest); arrive = 4.5;
    } else if (sp === SP.CART) field = Flow.get('L' + dest.id, dest.x, dest.y, 'L');
    if (dist2(U.x[i], U.y[i], tx, ty) < arrive * arrive) { Civ.tradeArrive(i); return; }
    if (field) {
      const nx = Flow.ahead(field, U.x[i], U.y[i], 4);
      if (nx >= 0) { goTo(i, (nx % W) + 0.5, ((nx / W) | 0) + 0.5, TK.TRADE); return; }
    }
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
      goTo(i, tc.x, tc.y, TK.MARCH);
      return;
    }
    U.st[i] = ST.IDLE; U.task[i] = TK.SIEGE;
    if (U.cd[i] > 0) return;
    let best = null, bs = -1e9;
    for (const bid of tc.buildings) {
      const b = Civ.buildings[bid];
      if (!b.alive) continue;
      const d = dist2(U.x[i], U.y[i], b.cx, b.cy);
      if (d > 16 * 16) continue;
      const s = (b.type === BT.WALL || b.type === BT.TOWER ? 3 : b.type === BT.KEEP ? 2 : 1) - d / 300 + rnd() * 0.6;
      if (s > bs) { bs = s; best = b; }
    }
    if (best) {
      AG.Proj.fire(1, U.x[i], U.y[i], best.cx + (rnd() - 0.5), best.cy + (rnd() - 0.5), 45, U.kd[i], 1, i);
      U.cd[i] = 70; U.fx[i] = best.cx > U.x[i] ? 1 : -1;
    }
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
    else if (Wd.veg[c] > 165 && sp !== SP.SYLVAN && sp !== SP.DEER) m *= 0.8;
    if (Wd.snow[c] > 120) m *= 0.7;
    if (Wd.fl[c] > 0.006 && !Wd.frozen[c]) m *= 0.6;
    if (Wd.elev[c] > AG.MOUNTAIN && sp !== SP.STONE) m *= 0.7;
    if (U.flags[i] & FL.FLEE) m *= 1.15;
    if (U.task[i] === TK.MARCH && U.sq[i] >= 0 && !(U.flags[i] & (FL.FLANKL | FL.FLANKR))) {
      const sq = Civ.squads[U.sq[i]];
      if (sq && sq.flank && sq.stage === 1) m *= 0.72; // centre holds back while the wings swing wide
    }
    return m;
  }
  function canEnter(i, x, y) {
    if (x < 0.5 || y < 0.5 || x >= W - 0.5 || y >= H - 0.5) return false;
    const L = U.layer[i];
    if (L === 2) return true;
    const c = (y | 0) * W + (x | 0);
    if (L === 0) return Wd.ugOpen(c);
    if (SPECIES[U.sp[i]].naval) return Wd.passSea(c) || !Wd.passSea((U.y[i] | 0) * W + (U.x[i] | 0));
    if (!Wd.passLand(c)) {
      const cur = (U.y[i] | 0) * W + (U.x[i] | 0);
      return c !== cur && !Wd.passLand(cur) && Wd.ft[c] !== FT.LAVA && Wd.fl[c] <= Wd.fl[cur] + 0.002; // wade out of a flood
    }
    const b = Wd.bgrid[c];
    if (b) {
      const B = Civ.buildings[b - 1];
      if ((B.type === BT.WALL || B.type === BT.TOWER) && B.prog >= 1 && B.kd !== U.kd[i]) return false;
    }
    return true;
  }
  function step(i) {
    if (U.flags[i] & FL.POSSESSED) { avatarStep(i); return; }
    const st = U.st[i];
    if (st === ST.WORK) { if (--U.tm[i] <= 0) finishWork(i); return; }
    if (st === ST.IDLE) return;
    if (st === ST.FIGHT) { fightStep(i); return; }
    if (U.task[i] === TK.ATTACKB) {
      const b = Civ.buildings[U.tref[i]];
      if (!b || !b.alive) { U.st[i] = ST.IDLE; return; }
      const r = Math.max(b.w, b.h) / 2 + 0.9;
      if (dist2(U.x[i], U.y[i], b.cx, b.cy) <= r * r) { U.st[i] = ST.WORK; U.tm[i] = 15; return; }
    }
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
    if (U.layer[i] === 1 && (AG.tick & 3) === 0 && SPECIES[U.sp[i]].kind === 'civ') {
      const c = (U.y[i] | 0) * W + (U.x[i] | 0);
      if (Wd.traffic[c] < 250) Wd.traffic[c] += 2;
    }
  }
  function blocked(i, nx, ny) {
    U.stuck[i] = 0;
    const c = (ny | 0) * W + (nx | 0);
    if (U.layer[i] === 1 && Wd.bgrid[c] && SPECIES[U.sp[i]].kind === 'civ') {
      const b = Civ.buildings[Wd.bgrid[c] - 1];
      if ((b.type === BT.WALL || b.type === BT.TOWER) && Civ.atWar(U.kd[i], b.kd)) { U.task[i] = TK.ATTACKB; U.tref[i] = b.id; U.st[i] = ST.WORK; U.tm[i] = 15; return; }
    }
    if (U.task[i] === TK.MARCH || U.task[i] === TK.TRADE || U.task[i] === TK.SETTLE) { U.stuck[i] = 20; wander(i, 3); U.task[i] = TK.MARCH; return; }
    U.st[i] = ST.IDLE;
  }
  function arrive(i) {
    switch (U.task[i]) {
      case TK.GATHER: U.st[i] = ST.WORK; U.tm[i] = 50 - Ent.skill(i, SK.FARMING) / 10; return;
      case TK.WOOD: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.CRAFTING) / 10; return;
      case TK.QUARRY: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.MINING) / 10; return;
      case TK.FARM: U.st[i] = ST.WORK; U.tm[i] = 60 - Ent.skill(i, SK.FARMING) / 8; return;
      case TK.BUILD: U.st[i] = ST.WORK; U.tm[i] = 30; return;
      case TK.WORSHIP: U.st[i] = ST.WORK; U.tm[i] = 70; return;
      case TK.GRAZE: U.st[i] = ST.WORK; U.tm[i] = 30; return;
      case TK.ATTACKB: U.st[i] = ST.WORK; U.tm[i] = 15; return;
      case TK.DEPOSIT: deposit(i); U.st[i] = ST.IDLE; U.task[i] = TK.NONE; return;
      case TK.MINE: U.layer[i] = 0; U.task[i] = TK.DIG; digTarget(i); return;
      case TK.DIG: U.task[i] = TK.ASCEND; ascendTarget(i); return;
      case TK.ASCEND: {
        U.layer[i] = 1;
        const c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null;
        if (U.carry[i] && c) goTo(i, c.x, c.y + 2, TK.DEPOSIT); else { U.st[i] = ST.IDLE; U.task[i] = TK.NONE; }
        return;
      }
      case TK.PATROL: case TK.WANDER:
        if (rnd() < 0.5) { U.st[i] = ST.WORK; U.task[i] = TK.NONE; U.tm[i] = 20 + rnd() * 40; } else U.st[i] = ST.IDLE;
        return;
      case TK.FLEE: U.flags[i] &= ~FL.FLEE; U.st[i] = ST.IDLE; return;
      default: U.st[i] = ST.IDLE;
    }
  }
  function deposit(i) {
    const c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null;
    if (c && U.carry[i]) {
      Civ.addRes(c, U.carry[i], U.camt[i]);
      if (U.carry[i] === 6 && rnd() < 0.3) Ent.memory(i, 'Brought mana crystal up from the deep');
    }
    U.carry[i] = 0; U.camt[i] = 0;
  }
  function digTarget(i) {
    for (let t = 0; t < 6; t++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 14;
      const x = U.x[i] + Math.cos(a) * r, y = U.y[i] + Math.sin(a) * r;
      if (x > 3 && y > 3 && x < W - 3 && y < H - 3) { goTo(i, x, y, TK.DIG); return; }
    }
    U.task[i] = TK.ASCEND; ascendTarget(i);
  }
  function ascendTarget(i) {
    const c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null, m = c ? Civ.cityMine(c) : null;
    if (m) goTo(i, m.cx, m.cy, TK.ASCEND);
    else { U.layer[i] = 1; U.st[i] = ST.IDLE; U.task[i] = TK.NONE; }
  }
  function startDig(i, nx, ny) {
    const c = (ny | 0) * W + (nx | 0), u = Wd.ug[c];
    if (u === UG.BEDROCK) {
      if (U.task[i] === TK.DIG) { U.task[i] = TK.ASCEND; ascendTarget(i); } else { U.layer[i] = 1; U.st[i] = ST.IDLE; }
      return;
    }
    const hard = u === UG.DIRT ? 18 : u === UG.CRYSTAL ? 70 : u === UG.GOLD || u === UG.IRON ? 45 : 35;
    U.st[i] = ST.WORK; U.tref[i] = c;
    U.tm[i] = (hard / (SPECIES[U.sp[i]].mineBonus || 1)) * (1 - Ent.skill(i, SK.MINING) / 400);
  }
  function nearWater(b) {
    for (let y = b.y - 3; y <= b.y + b.h + 2; y += 2) for (let x = b.x - 3; x <= b.x + b.w + 2; x += 2) {
      if (x >= 0 && y >= 0 && x < W && y < H && Wd.fl[y * W + x] > 0.008 && Wd.ft[y * W + x] === FT.WATER) return true;
    }
    return false;
  }
  function windmillNear(c, b) {
    for (const bid of c.buildings) { const m = Civ.buildings[bid]; if (m.type === BT.WINDMILL && m.prog >= 1 && dist2(m.cx, m.cy, b.cx, b.cy) < 100) return true; }
    return false;
  }
  function finishWork(i) {
    const task = U.task[i], c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null;
    switch (task) {
      case TK.GATHER: {
        const t = U.tref[i];
        if (t >= 0 && Wd.veg[t] >= 30) { Wd.veg[t] -= 30; U.carry[i] = 1; U.camt[i] = 3 + (Ent.skill(i, SK.FARMING) > 120 ? 1 : 0); }
        else if (t >= 0 && shore(t)) { U.carry[i] = 1; U.camt[i] = 3; } // a catch of fish
        Ent.gainSkill(i, SK.FARMING, 0.6); break;
      }
      case TK.WOOD: {
        const t = U.tref[i];
        if (t >= 0 && Wd.veg[t] >= 100) { Wd.veg[t] -= 90; U.carry[i] = 2; U.camt[i] = 3; Wd.dirty[Wd.chunkOfIdx(t)] = 1; }
        Ent.gainSkill(i, SK.CRAFTING, 0.5); break;
      }
      case TK.QUARRY: U.carry[i] = rnd() < 0.15 ? 4 : 3; U.camt[i] = 2; Ent.gainSkill(i, SK.MINING, 0.6); break;
      case TK.FARM: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive && c) {
          const k = Civ.kingdoms[c.kd];
          let y = 3 + b.growth * 6;
          if (k.culture.agrarian >= 1) y *= 1.4;
          if (k.culture.agrarian >= 3 && nearWater(b)) y *= 1.6;
          if (windmillNear(c, b)) y *= 1.5;
          b.growth = Math.max(0, b.growth - 0.35);
          U.carry[i] = 1; U.camt[i] = Math.min(255, Math.round(y));
        }
        Ent.gainSkill(i, SK.FARMING, 1); break;
      }
      case TK.BUILD: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive && b.prog < 1) {
          b.prog += b.type === BT.WALL ? 0.6 : (0.45 + (Ent.skill(i, SK.CRAFTING) / 255) * 0.4) / Math.sqrt(b.w * b.h);
          if (b.prog >= 1) Civ.complete(b);
        }
        Ent.gainSkill(i, SK.CRAFTING, 1); break;
      }
      case TK.WORSHIP: {
        if (c) {
          const k = Civ.kingdoms[c.kd];
          c.faith += 1; k.cp += 0.4 + U.genes[i * NG + G.DEV] / 255; U.faith[i] += 0.5;
          Ent.gainSkill(i, SK.FAITH, 1);
          if (k.culture.mystic >= 3 && U.job[i] === J.PRIEST) {
            const n = Ent.near(U.x[i], U.y[i], 6, 1, 32);
            for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (U.dis[j] && U.kd[j] === c.kd && rnd() < 0.3) { U.imm[j] |= 1 << (U.dis[j] - 1); U.dis[j] = 0; AG.FX.burst(U.x[j], U.y[j], 'heal', 5); } }
          }
        }
        break;
      }
      case TK.GRAZE: {
        const t = (U.y[i] | 0) * W + (U.x[i] | 0);
        if (Wd.veg[t] > 20) { Wd.veg[t] -= 20; U.food[i] = Math.min(1, U.food[i] + 0.5); }
        break;
      }
      case TK.ATTACKB: {
        const b = Civ.buildings[U.tref[i]];
        if (b && b.alive) {
          Civ.damageBuilding(b.id, U.dmg[i] * 1.5, U.kd[i]);
          if (b.alive && b.type !== BT.WALL && rnd() < 0.04) Wd.fire[b.y * W + b.x] = 200;
          AG.FX.burst(b.cx, b.cy, 'dust', 2);
          if (b.alive && U.sq[i] >= 0) { U.tm[i] = 15; return; }
        }
        break;
      }
      case TK.DIG: case TK.ASCEND: {
        const t = U.tref[i];
        if (t >= 0) {
          const u = Wd.ug[t];
          Wd.ug[t] = UG.TUNNEL; Wd.wakeU(t % W, (t / W) | 0);
          if (!U.carry[i]) {
            if (u === UG.IRON) { U.carry[i] = 4; U.camt[i] = 3; }
            else if (u === UG.GOLD) { U.carry[i] = 5; U.camt[i] = 3; }
            else if (u === UG.CRYSTAL) { U.carry[i] = 6; U.camt[i] = 2; }
            else if (rnd() < 0.3) { U.carry[i] = 3; U.camt[i] = 2; }
          }
          Ent.gainSkill(i, SK.MINING, 0.8);
          if (U.carry[i] && task === TK.DIG) { U.task[i] = TK.ASCEND; ascendTarget(i); return; }
        }
        U.st[i] = ST.MOVE; return;
      }
    }
    U.st[i] = ST.IDLE; U.task[i] = TK.NONE;
  }
  function fightStep(i) {
    const t = U.tgt[i];
    if (t < 0 || !U.alive[t] || U.layer[t] !== U.layer[i]) { U.st[i] = ST.IDLE; U.tgt[i] = -1; if (U.task[i] === TK.HUNT) U.task[i] = TK.NONE; return; }
    const dx = U.x[t] - U.x[i], dy = U.y[t] - U.y[i], d2 = dx * dx + dy * dy;
    if (d2 > 196) { U.st[i] = ST.IDLE; U.tgt[i] = -1; return; }
    const reach = SPECIES[U.sp[t]].kind === 'vehicle' ? 1.5 : 1.05;
    if (d2 > reach * reach) { moveToward(i, U.x[t], U.y[t], false); return; }
    const d = Math.sqrt(d2) || 1;
    U.fx[i] = dx / d; U.fy[i] = dy / d;
    if (U.cd[i] <= 0) { attack(i, t); U.cd[i] = 22 - (U.genes[i * NG + G.AGI] / 255) * 10; }
  }
  function attack(i, t) {
    let dmg = U.dmg[i] * (0.8 + rnd() * 0.4) * (1 + (Ent.skill(i, SK.COMBAT) / 255) * 0.6);
    const ka = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]] : null, kt = U.kd[t] >= 0 ? Civ.kingdoms[U.kd[t]] : null;
    if (ka && ka.culture.martial >= 4) dmg *= 1.3;
    if (kt && kt.culture.martial >= 4) dmg /= 1.2;
    if (U.traits[i] & TR.brave) dmg *= 1.1;
    if (U.flags[i] & FL.BLESSED) dmg *= 1.2;
    // flanking: blows from the side or behind the defender's facing land harder
    const ax = U.x[i] - U.x[t], ay = U.y[i] - U.y[t], al = Math.hypot(ax, ay) || 1;
    const dot = (U.fx[t] * ax + U.fy[t] * ay) / al;
    let flank = false;
    if (dot < -0.3) { dmg *= 1.6; flank = true; } else if (dot < 0.3) dmg *= 1.25;
    if (SPECIES[U.sp[i]].kind === 'civ') Ent.gainSkill(i, SK.COMBAT, 0.4);
    AG.FX.burst(U.x[t], U.y[t], flank ? 'spark' : 'blood', flank ? 5 : 2, U.layer[t]);
    Ent.damage(t, dmg, i);
  }
  AI.attack = attack;

  // ------------------------------------------------------------ possession
  function avatarStep(i) {
    const inp = AG.God.input;
    let dx = inp.dx, dy = inp.dy;
    if (!dx && !dy && inp.moveTo) {
      const ex = inp.moveTo.x - U.x[i], ey = inp.moveTo.y - U.y[i], d = Math.hypot(ex, ey);
      if (d < 0.4) inp.moveTo = null; else { dx = ex / d; dy = ey / d; }
    }
    if (dx || dy) {
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      const s = U.spd[i] * 1.6 * speedMul(i);
      const nx = U.x[i] + dx * s, ny = U.y[i] + dy * s;
      if (canEnter(i, nx, ny)) { U.x[i] = nx; U.y[i] = ny; }
      else if (canEnter(i, nx, U.y[i])) U.x[i] = nx;
      else if (canEnter(i, U.x[i], ny)) U.y[i] = ny;
      U.fx[i] = dx; U.fy[i] = dy; U.anim[i] += s * 3;
    }
    if (inp.act && U.cd[i] <= 0) {
      let best = -1, bd = 2.2 * 2.2;
      const n = Ent.near(U.x[i], U.y[i], 2.2, U.layer[i], 32);
      for (let q = 0; q < n; q++) {
        const j = Ent.buf[q];
        if (j === i || SPECIES[U.sp[j]].kind === 'ambient') continue;
        if (U.kd[i] >= 0 && U.kd[j] === U.kd[i] && !hostile(i, j)) continue;
        const d = dist2(U.x[i], U.y[i], U.x[j], U.y[j]);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { attack(i, best); U.cd[i] = 12; }
    }
    if (inp.power && U.cd[i] <= 0) {
      inp.power = false;
      if (U.sp[i] === SP.HERALD) holyNova(i, true);
      AG.Proj.fire(U.sp[i] === SP.HERALD ? 3 : 2, U.x[i], U.y[i], inp.aimX, inp.aimY, U.sp[i] === SP.WYRM ? 30 : 20, U.kd[i], U.layer[i] === 2 ? 1 : U.layer[i], i);
      U.cd[i] = 25;
    }
  }

  // ============================================================ projectiles
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
      if (Proj.kind[p] === 2 && rnd() < 0.5) AG.FX.spawn(Proj.x[p], Proj.y[p], 0, 0, 0.4, [255, 150, 50], 0.6, 1, 1, 0);
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
    for (const j of hit) {
      if (!U.alive[j] || friendly(j, kd, owner)) continue;
      if (kind === 3 && SPECIES[U.sp[j]].kind !== 'monster') continue;
      Ent.damage(j, kind === 1 ? dmg * 0.4 : dmg, attacker, kind === 1 ? 'a catapult stone' : kind === 2 ? 'dragonfire' : 'holy light');
    }
    const seen = new Set();
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = (x + ox) | 0, cy = (y + oy) | 0;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const c = cy * W + cx, b = Wd.bgrid[c];
      if (kind === 2 && (Wd.veg[c] > 20 || b) && rnd() < 0.6) Wd.fire[c] = 220;
      if (b && !seen.has(b) && kind !== 3) {
        seen.add(b);
        const B = Civ.buildings[b - 1];
        if (B.kd !== kd) Civ.damageBuilding(b - 1, kind === 1 ? dmg * 1.2 : dmg * 0.6, kd);
      }
      if (kind === 2) Wd.wake(cx, cy);
    }
    AG.FX.burst(x, y, kind === 1 ? 'debris' : kind === 2 ? 'explosion' : 'holy', kind === 2 ? 18 : 10, layer);
  }
})();
