/* AURA: Genesis — entities.js
 * Structure-of-arrays entity store sized for 32k units, a free list for slot
 * reuse, a counting-sort spatial hash per layer, genetics (allele picking +
 * blending + mutation), traits, skills, personal goals, and the People ledger
 * (names, family tree links, memory logs) kept for every civilised citizen. */
'use strict';
(function () {
  const AG = window.AG;
  const { W, H, NG, NS, SP, SPECIES, TRAITS, TR, FL, J, ST, TK, G } = AG;
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
    kd: A(Int16Array), city: A(Int16Array), home: A(Int16Array), cidx: A(Int32Array),
    job: A(Uint8Array), food: A(Float32Array), carry: A(Uint8Array), camt: A(Uint8Array),
    genes: A(Uint8Array, MAXU * NG), traits: A(Uint32Array), skills: A(Uint8Array, MAXU * NS),
    uid: A(Uint32Array), spouse: A(Int32Array), goal: A(Uint8Array),
    dis: A(Uint8Array), dtm: A(Float32Array), imm: A(Uint16Array),
    tgt: A(Int32Array), sq: A(Int16Array), cd: A(Float32Array), flags: A(Uint16Array),
    kills: A(Uint16Array), anim: A(Float32Array), stuck: A(Uint8Array), faith: A(Float32Array),
  });
  const free = new Int32Array(MAXU);
  let freeTop = 0, nextUid = 1;
  const Ent = (AG.Ent = { count: new Int32Array(SPECIES.length), births: 0, deaths: 0 });

  // ------------------------------------------------------------ people ledger
  const People = (AG.People = { map: new Map() });
  People.get = (uid) => People.map.get(uid);
  People.rec = (i) => People.map.get(U.uid[i]);
  People.prune = function () {
    if (People.map.size < 60000) return;
    let n = People.map.size - 45000;
    for (const [k, r] of People.map) { if (n <= 0) break; if (r.died) { People.map.delete(k); n--; } }
  };

  Ent.reset = function () {
    U.alive.fill(0); U.hi = 0; U.count = 0; freeTop = 0; nextUid = 1;
    Ent.count.fill(0); Ent.births = 0; Ent.deaths = 0;
    People.map.clear();
  };

  // ------------------------------------------------------------ genetics
  function inheritGenes(i, d, mom, dad, mutate) {
    const g = i * NG, base = d.genes, mut = 12 + mutate * 40;
    for (let k = 0; k < NG; k++) {
      let v;
      if (mom >= 0 && dad >= 0) {
        const a = U.genes[mom * NG + k], b = U.genes[dad * NG + k];
        // dominant allele from one parent, blended with both, plus drift
        v = (rnd() < 0.5 ? a : b) * 0.7 + (a + b) * 0.15 + (rnd() - 0.5) * mut;
        if (rnd() < 0.02 + mutate * 0.1) v += (rnd() - 0.5) * 140;
      } else if (mom >= 0) v = U.genes[mom * NG + k] + (rnd() - 0.5) * mut;
      else v = (base ? base[k] : 128) + (rnd() - 0.5) * 90;
      U.genes[g + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  function makeTraits(i, mom, dad, civ) {
    let t = 0;
    for (const tr of TRAITS) {
      if (tr.gene) { const v = U.genes[i * NG + tr.gene[0]]; if (tr.low ? v < tr.gene[1] : v > tr.gene[1]) t |= tr.bit; continue; }
      if (!civ || !tr.heritable) continue;
      if (mom >= 0 && (U.traits[mom] & tr.bit) && rnd() < tr.heritable) t |= tr.bit;
      if (dad >= 0 && (U.traits[dad] & tr.bit) && rnd() < tr.heritable) t |= tr.bit;
    }
    if (civ) {
      for (const k of ['brave', 'coward', 'kind', 'cruel', 'greedy', 'pious', 'curious', 'ambitious']) if (rnd() < 0.07) t |= TR[k];
      if (U.genes[i * NG + G.DEV] > 190 && rnd() < 0.5) t |= TR.pious;
      if ((t & TR.brave) && (t & TR.coward)) t &= ~(rnd() < 0.5 ? TR.brave : TR.coward);
      if ((t & TR.kind) && (t & TR.cruel)) t &= ~(rnd() < 0.5 ? TR.kind : TR.cruel);
    }
    return t;
  }

  function pickGoal(i) {
    const t = U.traits[i], w = [3, 1, 1, 1, 1, 0.4, 1];
    if (t & TR.kind) w[0] += 2; if (t & TR.greedy) w[1] += 3; if (t & TR.brave) w[2] += 3; if (t & TR.curious) w[3] += 3;
    if (t & TR.pious) w[4] += 3; if (t & TR.ambitious) w[5] += 4; if (t & TR.genius) w[6] += 3;
    let s = 0; for (const v of w) s += v;
    let r = rnd() * s;
    for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
    return 0;
  }

  Ent.deriveStats = function (i) {
    const d = SPECIES[U.sp[i]], g = i * NG, t = U.traits[i];
    const str = U.genes[g + G.STR] / 255, agi = U.genes[g + G.AGI] / 255, sta = U.genes[g + G.STAT] / 255, lon = U.genes[g + G.LONG] / 255;
    let mhp = d.hp * (0.7 + sta * 0.45 + str * 0.25), dmg = d.dmg * (0.6 + str * 0.8), spd = d.spd * (0.8 + agi * 0.4);
    if (t & TR.giant) { mhp *= 1.35; dmg *= 1.2; spd *= 0.92; }
    if (t & TR.swift) spd *= 1.2;
    if (t & TR.blessed) { mhp *= 1.2; dmg *= 1.2; }
    if (t & TR.cursed) mhp *= 0.85;
    if (t & TR.veteran) dmg *= 1.15;
    if (t & TR.hero) { mhp *= 1.5; dmg *= 1.4; }
    const ratio = U.mhp[i] > 0 ? U.hp[i] / U.mhp[i] : 1;
    U.mhp[i] = mhp; U.hp[i] = Math.min(mhp, mhp * ratio); U.dmg[i] = dmg; U.spd[i] = spd;
    let life = d.life[0] + (d.life[1] - d.life[0]) * lon;
    if (t & TR.longlived) life *= 1.25; if (t & TR.sickly) life *= 0.8;
    U.life[i] = life;
  };

  // ------------------------------------------------------------ spawn / kill
  Ent.spawn = function (sp, x, y, o) {
    o = o || {};
    const d = SPECIES[sp];
    if (d.cap && Ent.count[sp] >= d.cap && !o.force) return -1;
    let i;
    if (freeTop > 0) i = free[--freeTop]; else if (U.hi < MAXU) i = U.hi++; else return -1;
    x = AG.clamp(x, 0.5, W - 0.5); y = AG.clamp(y, 0.5, H - 0.5);
    U.alive[i] = 1; U.sp[i] = sp;
    U.x[i] = U.px[i] = U.tx[i] = x; U.y[i] = U.py[i] = U.ty[i] = y;
    U.fx[i] = rnd() < 0.5 ? 1 : -1; U.fy[i] = 0;
    U.layer[i] = o.layer !== undefined ? o.layer : d.flying ? 2 : d.layer !== undefined ? d.layer : 1;
    U.st[i] = ST.IDLE; U.task[i] = TK.NONE; U.tref[i] = -1; U.tm[i] = 0; U.aux[i] = 0;
    U.age[i] = o.age !== undefined ? o.age : d.adult + rnd() * 6;
    U.sex[i] = o.sex !== undefined ? o.sex : rnd() < 0.5 ? 0 : 1;
    U.kd[i] = o.kd !== undefined ? o.kd : -1; U.city[i] = -1; U.home[i] = o.home !== undefined ? o.home : -1; U.cidx[i] = -1;
    U.job[i] = d.kind === 'civ' && U.age[i] < d.adult ? J.CHILD : J.GATHER;
    U.food[i] = 1; U.carry[i] = 0; U.camt[i] = 0;
    U.spouse[i] = -1; U.dis[i] = 0; U.dtm[i] = 0; U.imm[i] = 0; U.tgt[i] = -1; U.sq[i] = -1; U.cd[i] = 0; U.flags[i] = 0;
    U.kills[i] = 0; U.anim[i] = rnd() * 10; U.stuck[i] = 0; U.faith[i] = 0;
    const mom = o.mom !== undefined ? o.mom : -1, dad = o.dad !== undefined ? o.dad : -1;
    const civ = d.kind === 'civ';
    inheritGenes(i, d, mom, dad, o.mutate || 0);
    const gb = i * NS; for (let s = 0; s < NS; s++) U.skills[gb + s] = (rnd() * 20) | 0;
    U.traits[i] = makeTraits(i, mom, dad, civ);
    U.goal[i] = civ ? pickGoal(i) : 0;
    U.mhp[i] = 0; Ent.deriveStats(i); U.hp[i] = U.mhp[i];
    U.uid[i] = nextUid++;
    if (civ) {
      const mr = mom >= 0 ? People.rec(mom) : null, dr = dad >= 0 ? People.rec(dad) : null;
      const rec = { uid: U.uid[i], name: AG.Names.person(sp), sp, sex: U.sex[i], mom: mr ? mr.uid : 0, dad: dr ? dr.uid : 0, kids: [], born: AG.tick, died: 0, cause: '', idx: i, log: [], realm: '', lastBirth: 0, age: 0 };
      People.map.set(rec.uid, rec);
      if (mr) { mr.kids.push(rec.uid); mr.lastBirth = AG.tick; }
      if (dr) dr.kids.push(rec.uid);
      if (o.city !== undefined && o.city >= 0) AG.Civ.joinCity(i, o.city);
      if (U.kd[i] >= 0) rec.realm = AG.Civ.kingdoms[U.kd[i]].name;
      if (mom >= 0) Ent.births++;
    }
    Ent.count[sp]++; U.count++;
    return i;
  };

  Ent.kill = function (i, cause, killer) {
    if (!U.alive[i]) return;
    const sp = U.sp[i], d = SPECIES[sp];
    killer = killer === undefined ? -1 : killer;
    AG.Civ.onDeath(i, cause, killer);
    const s = U.spouse[i];
    const rec = d.kind === 'civ' ? People.rec(i) : null;
    if (s >= 0 && U.alive[s] && U.spouse[s] === i) { U.spouse[s] = -1; if (rec) Ent.memory(s, `Mourned ${rec.name}, taken by ${cause}`); }
    if (rec) { rec.died = AG.tick; rec.cause = cause; rec.idx = -1; rec.age = U.age[i]; }
    if (U.city[i] >= 0) AG.Civ.leaveCity(i);
    if (AG.God.possessed === i) AG.God.release();
    const x = U.x[i], y = U.y[i], layer = U.layer[i], dis = U.dis[i];
    U.alive[i] = 0; free[freeTop++] = i; U.count--; Ent.count[sp]--; Ent.deaths++;
    if (cause !== 'retired') AG.FX.burst(x, y, d.kind === 'vehicle' ? 'debris' : 'blood', d.kind === 'vehicle' ? 10 : 4, layer);
    // the Hollowing raises the dead
    if (d.kind === 'civ' && ((dis && AG.DISEASES[dis - 1] && AG.DISEASES[dis - 1].hollow) || cause === 'the Hollow')) {
      const h = Ent.spawn(SP.HOLLOW, x, y, { layer });
      if (h >= 0) AG.FX.burst(x, y, 'curse', 6, layer);
    }
  };

  // Damage with attribution, kill credit and retaliation.
  Ent.damage = function (t, dmg, attacker, cause) {
    if (!U.alive[t]) return;
    U.hp[t] -= dmg;
    if (U.hp[t] <= 0) {
      let c = cause || 'wounds';
      if (attacker >= 0 && U.alive[attacker]) {
        const asp = U.sp[attacker];
        if (asp === SP.HOLLOW) c = 'the Hollow';
        else if (SPECIES[asp].kind === 'civ') c = 'the blade of ' + Ent.name(attacker);
        else c = 'a ' + SPECIES[asp].name.toLowerCase();
        onKill(attacker, t);
      }
      Ent.kill(t, c, attacker);
      return;
    }
    if (attacker >= 0 && U.alive[attacker] && U.st[t] !== ST.FIGHT && !(U.flags[t] & FL.POSSESSED)) AG.AI.react(t, attacker);
  };

  function onKill(a, v) {
    U.kills[a]++;
    const asp = U.sp[a], vsp = U.sp[v];
    if (SPECIES[asp].kind === 'animal' || asp === SP.HOLLOW || asp === SP.CRAWLER) { U.food[a] = 1; return; }
    if (SPECIES[asp].kind !== 'civ') return;
    Ent.gainSkill(a, AG.SK.COMBAT, 3);
    if (vsp === SP.DEER) { U.carry[a] = 1; U.camt[a] = 4; return; }
    Ent.memory(a, `Slew ${SPECIES[vsp].kind === 'civ' ? Ent.name(v) + ' of ' + (U.kd[v] >= 0 ? AG.Civ.kingdoms[U.kd[v]].name : 'no realm') : 'a ' + SPECIES[vsp].name.toLowerCase()}`);
    if (U.kills[a] === 3 && Ent.addTrait(a, 'veteran')) Ent.memory(a, 'Became a veteran of many battles');
    if (U.kills[a] === 8 && Ent.addTrait(a, 'hero')) {
      U.flags[a] |= FL.HERO;
      Ent.memory(a, 'Hailed as a hero of the realm');
      const k = U.kd[a] >= 0 ? AG.Civ.kingdoms[U.kd[a]] : null;
      AG.Chronicle.add(`${Ent.name(a)} is hailed as a hero${k ? ' of the ' + k.name : ''}`, 'hero', U.x[a], U.y[a]);
    }
  }

  Ent.memory = function (i, text) {
    const r = People.rec(i); if (!r) return;
    r.log.push({ t: AG.tick, s: text });
    if (r.log.length > 14) r.log.shift();
  };
  Ent.name = (i) => { const r = People.rec(i); return r ? r.name : SPECIES[U.sp[i]].name; };
  Ent.title = function (i) {
    const f = U.flags[i], t = U.traits[i];
    if (f & FL.KING) return U.sex[i] ? 'King' : 'Queen';
    if (t & TR.hero) return 'Hero';
    if (f & FL.POSSESSED) return 'Vessel';
    if (U.job[i] === J.PRIEST && AG.Civ.kingdoms[U.kd[i]] && AG.Civ.kingdoms[U.kd[i]].culture.mystic >= 4 && U.faith[i] > 8) return 'Saint';
    return '';
  };
  Ent.hasTrait = (i, k) => (U.traits[i] & TR[k]) !== 0;
  Ent.addTrait = function (i, k) {
    if (U.traits[i] & TR[k]) return false;
    U.traits[i] |= TR[k]; Ent.deriveStats(i);
    return true;
  };
  Ent.gainSkill = function (i, s, amt) {
    const j = i * NS + s;
    const rate = amt * (U.traits[i] & TR.genius ? 2 : 1) * (0.5 + U.genes[i * NG + G.INT] / 255);
    let v = U.skills[j] + Math.floor(rate) + (rnd() < rate % 1 ? 1 : 0);
    U.skills[j] = v > 255 ? 255 : v;
  };
  Ent.skill = (i, s) => U.skills[i * NS + s];
  Ent.gene = (i, g) => U.genes[i * NG + g];

  Ent.infect = function (i, d) {
    if (!U.alive[i] || U.dis[i] || (U.imm[i] & (1 << d))) return false;
    const D = AG.DISEASES[d];
    if (!D || !(D.targets & (1 << U.sp[i]))) return false;
    U.dis[i] = d + 1; U.dtm[i] = 0;
    return true;
  };

  // ------------------------------------------------------------ spatial hash
  const SC = 8, SGW = W / SC, SGH = H / SC, SCELLS = SGW * SGH;
  const head = new Int32Array(SCELLS * 3), next = new Int32Array(MAXU);
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
  // Fills Ent.buf with alive units within r of (x, y) on a layer; returns count.
  Ent.near = function (x, y, r, layer, max) {
    max = max || 1024;
    const buf = Ent.buf, r2 = r * r, base = layer * SCELLS;
    const x0 = Math.max(0, ((x - r) / SC) | 0), x1 = Math.min(SGW - 1, ((x + r) / SC) | 0);
    const y0 = Math.max(0, ((y - r) / SC) | 0), y1 = Math.min(SGH - 1, ((y + r) / SC) | 0);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let j = head[base + cy * SGW + cx]; j >= 0; j = next[j]) {
        if (!U.alive[j]) continue;
        const dx = U.x[j] - x, dy = U.y[j] - y;
        if (dx * dx + dy * dy <= r2) { buf[n++] = j; if (n >= max) return n; }
      }
    }
    return n;
  };
})();
