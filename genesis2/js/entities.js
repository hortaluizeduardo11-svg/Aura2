/* AURA: Genesis 2 — entities.js
 * Bodies: a structure-of-arrays store for 32k embodied creatures and vehicles, a free list and a
 * counting-sort spatial hash. A person's body points at their record (pid); an animal's body
 * carries its own diploid genome (gen) and species (sid). Size, speed, strength, senses,
 * temperature tolerance and colour are all read from the genome. */
'use strict';
(function () {
  const AG = window.AG;
  const { W, H, NG, NS, SP, SPECIES, TR, FL, J, ST, TK, G } = AG;
  const Life = AG.Life, L = Life.L, GL = Life.GL;
  const rnd = AG.rnd;
  const MAXU = (AG.MAXU = 32768);
  const A = (T, n) => new T(n || MAXU);
  const U = (AG.U = {
    hi: 0, count: 0,
    alive: A(Uint8Array), sp: A(Uint8Array), layer: A(Uint8Array),
    x: A(Float32Array), y: A(Float32Array), px: A(Float32Array), py: A(Float32Array),
    tx: A(Float32Array), ty: A(Float32Array), fx: A(Float32Array), fy: A(Float32Array),
    st: A(Uint8Array), task: A(Uint8Array), tref: A(Int32Array), tm: A(Float32Array), aux: A(Int32Array),
    hp: A(Float32Array), mhp: A(Float32Array), dmg: A(Float32Array), spd: A(Float32Array),
    age: A(Float32Array), life: A(Float32Array), sex: A(Uint8Array),
    kd: A(Int16Array), city: A(Int16Array), home: A(Int16Array),
    job: A(Uint8Array), food: A(Float32Array), carry: A(Uint8Array), camt: A(Uint8Array),
    genes: A(Uint8Array, MAXU * NG), traits: A(Uint32Array), uid: A(Uint32Array),
    dis: A(Uint8Array), dtm: A(Float32Array), imm: A(Uint16Array),
    tgt: A(Int32Array), sq: A(Int16Array), cd: A(Float32Array), flags: A(Uint16Array),
    kills: A(Uint16Array), anim: A(Float32Array), stuck: A(Uint8Array), faith: A(Float32Array),
    // Genesis 2
    pid: A(Int32Array), sid: A(Int16Array), tm0: A(Int32Array), gen: A(Uint8Array, MAXU * GL), fgen: A(Uint8Array, MAXU * GL),
    energy: A(Float32Array), preg: A(Float32Array), scale: A(Float32Array), sense: A(Float32Array),
    cold: A(Float32Array), heat: A(Float32Array), bold: A(Float32Array), social: A(Float32Array), hue: A(Uint8Array),
  });
  const free = new Int32Array(MAXU);
  let freeTop = 0, nextUid = 1;
  const Ent = (AG.Ent = { count: new Int32Array(SPECIES.length), births: 0, deaths: 0 });

  Ent.state = () => ({ free: Array.from(free.subarray(0, freeTop)), nextUid, counts: Array.from(Ent.count), births: Ent.births, deaths: Ent.deaths });
  Ent.setState = function (s) { freeTop = s.free.length; free.set(s.free); nextUid = s.nextUid; Ent.count.set(s.counts); Ent.births = s.births; Ent.deaths = s.deaths; };
  Ent.reset = function () {
    U.alive.fill(0); U.hi = 0; U.count = 0; freeTop = 0; nextUid = 1;
    Ent.count.fill(0); Ent.births = 0; Ent.deaths = 0;
    if (Ent.rebuildGrid) Ent.rebuildGrid(); // no stale lists from the world before
  };

  function slot() {
    if (freeTop > 0) return free[--freeTop];
    if (U.hi < MAXU) return U.hi++;
    return -1;
  }
  function base(i, sp, x, y, o) {
    const d = SPECIES[sp];
    x = AG.clamp(x, 0.5, W - 0.5); y = AG.clamp(y, 0.5, H - 0.5);
    U.alive[i] = 1; U.sp[i] = sp;
    U.x[i] = U.px[i] = U.tx[i] = x; U.y[i] = U.py[i] = U.ty[i] = y;
    U.fx[i] = rnd() < 0.5 ? 1 : -1; U.fy[i] = 0;
    U.layer[i] = o.layer !== undefined ? o.layer : d.flying ? 2 : 1;
    U.st[i] = ST.IDLE; U.task[i] = TK.NONE; U.tref[i] = -1; U.tm[i] = 0; U.aux[i] = 0;
    U.age[i] = o.age !== undefined ? o.age : d.adult + rnd() * 4;
    U.sex[i] = o.sex !== undefined ? o.sex : rnd() < 0.5 ? 0 : 1;
    U.kd[i] = o.kd !== undefined ? o.kd : -1; U.city[i] = o.city !== undefined ? o.city : -1; U.home[i] = o.home !== undefined ? o.home : -1;
    U.job[i] = J.GATHER; U.food[i] = 1; U.carry[i] = 0; U.camt[i] = 0;
    U.dis[i] = 0; U.dtm[i] = 0; U.imm[i] = 0; U.tgt[i] = -1; U.sq[i] = -1; U.cd[i] = 0; U.flags[i] = 0;
    U.kills[i] = 0; U.anim[i] = rnd() * 10; U.stuck[i] = 0; U.faith[i] = 0; U.traits[i] = 0;
    U.pid[i] = -1; U.sid[i] = -1; U.energy[i] = 0.8; U.preg[i] = 0; U.scale[i] = 1; U.sense[i] = 6;
    U.cold[i] = 0.5; U.heat[i] = 0.5; U.bold[i] = 0.5; U.social[i] = 0.5; U.hue[i] = 128;
    U.uid[i] = nextUid++;
    Ent.count[sp]++; U.count++;
  }

  // Read abilities from the genome at body slot i (persons add their health and traits).
  Ent.deriveStats = function (i) {
    const sp = U.sp[i], d = SPECIES[sp], g = U.gen, o = i * GL, ph = (k) => Life.express(g, o, k) / 255;
    const size = ph(L.SIZE), str = ph(L.STR), spd = ph(L.SPEED);
    const grow = U.age[i] < d.adult ? 0.55 + 0.45 * (U.age[i] / Math.max(0.1, d.adult)) : 1;
    U.scale[i] = (0.72 + size * 0.6) * grow;
    U.mhp[i] = d.hp * (0.55 + size * 0.6 + str * 0.35) * grow;
    U.dmg[i] = d.dmg * (0.5 + str * 0.7 + size * 0.3);
    U.spd[i] = d.spd * (0.75 + spd * 0.5 - size * 0.12);
    U.sense[i] = 3 + ph(L.SENSE) * 9;
    U.cold[i] = ph(L.COLD); U.heat[i] = ph(L.HEAT); U.bold[i] = ph(L.BOLD); U.social[i] = ph(L.SOCIAL);
    U.hue[i] = Life.express(g, o, L.HUE);
    U.life[i] = d.life[0] + (d.life[1] - d.life[0]) * ph(L.LIFE);
    const gb = i * NG; // renderer cache
    U.genes[gb + G.STR] = str * 255; U.genes[gb + G.AGI] = spd * 255; U.genes[gb + G.INT] = ph(L.COGN) * 255; U.genes[gb + G.FERT] = ph(L.FERT) * 255;
    U.genes[gb + G.LONG] = ph(L.LIFE) * 255; U.genes[gb + G.STAT] = size * 255; U.genes[gb + G.HUE] = U.hue[i]; U.genes[gb + G.RES] = ph(L.IMMUNE) * 255; U.genes[gb + G.DEV] = 128;
    const pid = U.pid[i];
    if (pid >= 0) {
      const P = AG.People.get(pid);
      if (P) {
        U.traits[i] = P.traits;
        if (P.traits & TR.giant) { U.mhp[i] *= 1.2; U.dmg[i] *= 1.15; }
        if (P.traits & TR.swift) U.spd[i] *= 1.15;
        if (P.traits & TR.hero) { U.mhp[i] *= 1.4; U.dmg[i] *= 1.3; }
        U.spd[i] *= AG.People.speedMul(P);
        U.dmg[i] *= AG.People.workMul(P);
        U.genes[gb + G.DEV] = P.belief.devotion * 255;
      }
    }
  };

  // ------------------------------------------------------------ spawning
  // An animal of species s near (x, y), its genome bred from the region's reservoir.
  Ent.spawnCreature = function (s, x, y, R, o) {
    o = o || {};
    const bodyKind = s.arch === Life.ARCH.GRAZER ? SP.GRAZER : s.arch === Life.ARCH.PREDATOR ? SP.PREDATOR : s.arch === Life.ARCH.BIRD ? SP.BIRD : SP.APE;
    const i = slot(); if (i < 0) return -1;
    base(i, bodyKind, x, y, o);
    U.sid[i] = s.id;
    const go = i * GL;
    if (o.mom >= 0 && o.mom !== undefined) Life.breed(U.gen, go, U.gen, o.mom * GL, U.fgen, o.mom * GL, rnd, 1);
    else if (R && R.nres >= 2) { const a = (rnd() * R.nres) | 0, b = (rnd() * R.nres) | 0; Life.breed(U.gen, go, R.res, a * GL, R.res, b * GL, rnd, 1); }
    else Life.founder(U.gen, go, R ? R.mu : s.mean, 14, rnd);
    if (o.age === undefined) U.age[i] = rnd() * SPECIES[bodyKind].life[0] * 0.8;
    Ent.deriveStats(i);
    U.hp[i] = U.mhp[i];
    if (s.domestic) U.flags[i] |= FL.DOMESTIC;
    return i;
  };
  // A body for a person record, at (x, y).
  Ent.spawnPerson = function (P, x, y) {
    if (P.body >= 0 && U.alive[P.body] && U.pid[P.body] === P.id) return P.body;
    const i = slot(); if (i < 0) return -1;
    const c = AG.Civ.cities[P.comm];
    base(i, SP.PERSON, x, y, { age: AG.People.age(P), sex: P.sex, kd: c ? c.kd : -1, city: P.comm, home: P.comm });
    U.pid[i] = P.id; U.sid[i] = Life.people ? Life.people.id : -1;
    U.gen.set(P.gen, i * GL);
    U.job[i] = P.job; U.dis[i] = P.dis; U.dtm[i] = P.dtm; U.imm[i] = P.imm; U.kills[i] = P.kills;
    U.energy[i] = P.needs.food; U.faith[i] = P.belief.devotion * 10;
    if (P.rank >= 2) U.flags[i] |= FL.KING;
    if (P.traits & TR.hero) U.flags[i] |= FL.HERO;
    Ent.deriveStats(i);
    U.hp[i] = U.mhp[i] * AG.People.health(P);
    P.body = i;
    return i;
  };
  Ent.spawnVehicle = function (sp, x, y, o) {
    const i = slot(); if (i < 0) return -1;
    base(i, sp, x, y, o || {});
    U.mhp[i] = SPECIES[sp].hp; U.hp[i] = U.mhp[i]; U.dmg[i] = SPECIES[sp].dmg; U.spd[i] = SPECIES[sp].spd; U.life[i] = 1e9; U.age[i] = 0;
    return i;
  };
  // Generic spawn used by god tools: a body kind near (x, y), drawn from the nearest living
  // species of that kind (a new founder lineage if there is none).
  Ent.spawn = function (sp, x, y, o) {
    o = o || {};
    if (SPECIES[sp].kind === 'vehicle') return Ent.spawnVehicle(sp, x, y, o);
    const arch = sp === SP.GRAZER ? Life.ARCH.GRAZER : sp === SP.PREDATOR ? Life.ARCH.PREDATOR : sp === SP.BIRD ? Life.ARCH.BIRD : sp === SP.APE ? Life.ARCH.PRIMATE : -1;
    if (arch < 0) return -1;
    const r = Life.regionOf(x, y), Hab = AG.Habitat, c = AG.clamp(y | 0, 0, AG.H - 1) * AG.W + AG.clamp(x | 0, 0, AG.W - 1);
    // the species of this kind living nearest, weighed by how well it would cope here right now
    // (a snow-country species in the snow, a desert one in the desert)
    let best = null, bd = 1e18;
    for (const s of Life.byArch(arch)) {
      if (s.sapient || s.domestic) continue;
      let d = 1e18;
      for (const [q] of s.regions) d = Math.min(d, AG.dist2(q % Life.RW, (q / Life.RW) | 0, r % Life.RW, (r / Life.RW) | 0));
      if (d >= 1e18) continue;
      const cost = Math.sqrt(d) + (Hab ? (1 - Hab.comfort(Hab.profile(s), c)) * 6 : 0);
      if (cost < bd) { bd = cost; best = s; }
    }
    if (!best) {
      const m = new Float32Array(Life.NL).fill(128); m[L.HUE] = 110;
      best = Life.newSpecies(arch, m, null, Life.when());
    }
    if (o.species) best = o.species;
    const R = best.regions.get(r) || [...best.regions.values()][0] || null;
    return Ent.spawnCreature(best, x, y, R, o);
  };

  // ------------------------------------------------------------ removal and death
  // Free the slot. `dead` is set when the record has already been told (People.die).
  Ent.remove = function (i, dead) {
    if (!U.alive[i]) return;
    const pid = U.pid[i];
    if (pid >= 0 && !dead) Ent.writeBack(i);
    if (pid >= 0) { const P = AG.People.get(pid); if (P && P.body === i) P.body = -1; }
    if (AG.God.possessed === i) AG.God.release();
    U.alive[i] = 0; free[freeTop++] = i; U.count--; Ent.count[U.sp[i]]--;
  };
  // Copy what the body lived through back into the person record.
  Ent.writeBack = function (i) {
    const P = AG.People.get(U.pid[i]); if (!P) return;
    P.x = U.x[i]; P.y = U.y[i]; P.lastSeen = AG.Geo.year;
    P.hp = AG.clamp(U.hp[i] / Math.max(1, U.mhp[i]), 0.05, 1);
    P.dis = U.dis[i]; P.dtm = U.dtm[i]; P.imm |= U.imm[i]; P.kills = U.kills[i]; P.needs.food = U.energy[i];
  };
  Ent.kill = function (i, cause, killer) {
    if (!U.alive[i]) return;
    const sp = U.sp[i], d = SPECIES[sp], x = U.x[i], y = U.y[i], layer = U.layer[i];
    killer = killer === undefined ? -1 : killer;
    Ent.deaths++;
    if (cause !== 'retired' && cause !== 'eaten') AG.FX.burst(x, y, d.kind === 'vehicle' ? 'debris' : 'blood', d.kind === 'vehicle' ? 10 : 4, layer);
    const pid = U.pid[i];
    if (pid >= 0) {
      const P = AG.People.get(pid);
      Ent.writeBack(i);
      const kp = killer >= 0 && U.alive[killer] && U.pid[killer] >= 0 ? U.pid[killer] : 0;
      if (P) AG.People.die(P, cause, kp); // People.die removes the body
      if (U.alive[i]) Ent.remove(i, true);
      return;
    }
    if (U.sid[i] >= 0 && AG.Civ.onAnimalDeath) AG.Civ.onAnimalDeath(i, cause, killer);
    Ent.remove(i, true);
  };

  // Damage with attribution. People take wounds to a body part; killers are remembered.
  Ent.damage = function (t, dmg, attacker, cause) {
    if (!U.alive[t]) return;
    U.hp[t] -= dmg;
    const pid = U.pid[t];
    if (pid >= 0) {
      const P = AG.People.get(pid), by = attacker >= 0 && U.alive[attacker] && U.pid[attacker] >= 0 ? U.pid[attacker] : 0;
      if (P && dmg > U.mhp[t] * 0.12 && rnd() < 0.6) AG.People.injure(P, -1, Math.min(1, dmg / Math.max(1, U.mhp[t]) * 1.5), cause || (attacker >= 0 ? Ent.name(attacker) : ''), by);
    }
    if (U.hp[t] <= 0) {
      let c = cause || 'wounds';
      if (attacker >= 0 && U.alive[attacker]) {
        if (U.pid[attacker] >= 0) c = 'the spear of ' + Ent.name(attacker);
        else if (U.sid[attacker] >= 0) c = 'a ' + Ent.common(attacker);
        onKill(attacker, t);
      }
      Ent.kill(t, c, attacker);
      return;
    }
    if (attacker >= 0 && U.alive[attacker] && U.st[t] !== ST.FIGHT && !(U.flags[t] & FL.POSSESSED)) AG.AI.react(t, attacker);
  };
  function onKill(a, v) {
    U.kills[a]++;
    if (U.pid[a] < 0) { U.energy[a] = Math.min(1, U.energy[a] + 0.8); U.food[a] = 1; return; }
    const P = AG.People.get(U.pid[a]); if (!P) return;
    if (U.pid[v] < 0 && U.sid[v] >= 0) { // a hunt
      U.carry[a] = 1; U.camt[a] = Math.max(3, Math.round(4 * U.scale[v] * U.scale[v]));
      Ent.gainSkill(a, AG.SK.HUNT, 2);
      if (U.scale[v] > 1.15 && rnd() < 0.5) AG.People.remember(P, AG.People.MK.HUNT, { v: 0.6, s: 0.5, d: `Brought down a great ${Ent.common(v)}` });
      return;
    }
    Ent.gainSkill(a, AG.SK.FIGHT, 3);
    P.kills++;
    if (P.kills === 3 && AG.People.addTrait(P, 'veteran')) AG.People.remember(P, AG.People.MK.WAR, { v: 0.2, s: 0.6, d: 'in many fights and lived' });
    if (P.kills === 7 && AG.People.addTrait(P, 'hero')) {
      U.flags[a] |= FL.HERO; P.fame += 5;
      AG.History.event('hero', `${P.name} is hailed as a hero`, { x: U.x[a], y: U.y[a], person: P.id });
    }
  }

  // ------------------------------------------------------------ helpers
  Ent.person = (i) => (U.pid[i] >= 0 ? AG.People.get(U.pid[i]) : null);
  Ent.common = (i) => { const s = U.sid[i] >= 0 ? Life.species[U.sid[i]] : null; return s ? s.common : SPECIES[U.sp[i]].name.toLowerCase(); };
  Ent.memory = function (i, text) { const P = Ent.person(i); if (P) AG.People.remember(P, -1, { d: text, v: 0, s: 0.4 }); };
  Ent.name = (i) => { const P = Ent.person(i); if (P) return P.name; const s = U.sid[i] >= 0 ? Life.species[U.sid[i]] : null; return s ? AG.Lang.cap(s.common) : SPECIES[U.sp[i]].name; };
  Ent.title = function (i) { const P = Ent.person(i); if (!P) return ''; if (U.flags[i] & FL.POSSESSED) return 'Vessel'; return AG.People.title(P); };
  Ent.hasTrait = (i, k) => (U.traits[i] & TR[k]) !== 0;
  Ent.addTrait = function (i, k) { const P = Ent.person(i); if (!P || !AG.People.addTrait(P, k)) return false; U.traits[i] = P.traits; Ent.deriveStats(i); return true; };
  Ent.gainSkill = function (i, s, amt) {
    const P = Ent.person(i); if (!P) return;
    const rate = amt * (P.traits & TR.genius ? 2 : 1) * (0.5 + AG.People.ph(P, L.COGN) / 255) * 0.25;
    const v = P.skills[s] + Math.floor(rate) + (rnd() < rate % 1 ? 1 : 0);
    P.skills[s] = v > 100 ? 100 : v;
  };
  Ent.skill = (i, s) => { const P = Ent.person(i); return P ? P.skills[s] : 0; };
  Ent.gene = (i, g) => U.genes[i * NG + g];
  Ent.phen = (i, k) => Life.express(U.gen, i * GL, k);
  Ent.infect = function (i, d) {
    if (!U.alive[i] || U.dis[i] || (U.imm[i] & (1 << d))) return false;
    const D = AG.DISEASES[d];
    if (!D || !(D.targets & (1 << (U.sp[i] === SP.PERSON ? 0 : 1)))) return false;
    U.dis[i] = d + 1; U.dtm[i] = 0;
    const P = Ent.person(i); if (P) { P.dis = d + 1; P.dtm = 0; AG.People.remember(P, AG.People.MK.ILL, { v: -0.4, s: 0.5, d: D.name }); }
    return true;
  };

  // ------------------------------------------------------------ spatial hash
  const SC = 8, SGW = Math.ceil(W / SC), SGH = Math.ceil(H / SC), SCELLS = SGW * SGH;
  const head = new Int32Array(SCELLS * 3).fill(-1), next = new Int32Array(MAXU).fill(-1); // -1 ends a list: an unbuilt grid is empty, never a loop
  Ent.buf = new Int32Array(1024);
  Ent.rebuildGrid = function () {
    head.fill(-1);
    const hi = U.hi;
    for (let i = 0; i < hi; i++) {
      if (!U.alive[i]) continue;
      let cx = (U.x[i] / SC) | 0, cy = (U.y[i] / SC) | 0;
      if (cx < 0) cx = 0; else if (cx >= SGW) cx = SGW - 1;
      if (cy < 0) cy = 0; else if (cy >= SGH) cy = SGH - 1;
      const c = U.layer[i] * SCELLS + cy * SGW + cx;
      next[i] = head[c]; head[c] = i;
    }
  };
  // The grid is rebuilt once per watch tick. Outside the ticks (deep time, history, a paused
  // world) a caller asks for a fresh one first with Ent.freshGrid().
  Ent.freshGrid = Ent.rebuildGrid;
  Ent.near = function (x, y, r, layer, max) {
    max = max || 1024;
    const buf = Ent.buf, r2 = r * r, base0 = layer * SCELLS;
    const x0 = Math.max(0, ((x - r) / SC) | 0), x1 = Math.min(SGW - 1, ((x + r) / SC) | 0);
    const y0 = Math.max(0, ((y - r) / SC) | 0), y1 = Math.min(SGH - 1, ((y + r) / SC) | 0);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let j = head[base0 + cy * SGW + cx], guard = MAXU; j >= 0 && guard-- > 0; j = next[j]) {
        if (!U.alive[j]) continue;
        const dx = U.x[j] - x, dy = U.y[j] - y;
        if (dx * dx + dy * dy <= r2) { buf[n++] = j; if (n >= max) return n; }
      }
    }
    return n;
  };
})();
