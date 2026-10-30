/* AURA: Genesis — civ.js
 * Kingdoms, cities, buildings, dynamic borders, economy and jobs, the culture
 * tree, citizen-made pantheons, diplomacy, armies (rally -> flank -> assault),
 * siege, conquest, rebellion, settlers, trade routes (carts / ships / skyships)
 * and the flow-field cache that moves armies and caravans without per-unit A*. */
'use strict';
(function () {
  const AG = window.AG, Wd = AG.World, U = AG.U, Ent = AG.Ent;
  const { W, H, N, SEA, BT, BUILD, SO, FT, SP, SPECIES, TK, ST, FL, J, G, BRANCHES, CULTURE, TR, UG } = AG;
  const rnd = AG.rnd, ri = AG.ri, pick = AG.pick, dist2 = AG.dist2;
  const MAXK = 64;
  const Civ = (AG.Civ = {
    kingdoms: [], cities: [], buildings: [], religions: [], squads: [], routes: [], expeditions: [],
    contact: new Uint16Array(MAXK * MAXK), MAXK,
  });

  Civ.reset = function () {
    Civ.kingdoms.length = 0; Civ.cities.length = 0; Civ.buildings.length = 0; Civ.religions.length = 0;
    Civ.squads.length = 0; Civ.routes.length = 0; Civ.expeditions.length = 0; Civ.contact.fill(0);
    Flow.cache.clear();
  };

  // ============================================================ flow fields
  // One BFS distance field per destination, shared by every unit heading there.
  const Flow = (AG.Flow = { cache: new Map(), budget: 2, q: new Int32Array(N), computed: 0 });
  Flow.get = function (key, tx, ty, mode, seeds) {
    let f = Flow.cache.get(key);
    const stale = !f || AG.tick - f.t > 1500 || (f.epoch !== Wd.epoch && AG.tick - f.t > 200);
    if (!stale) { Flow.cache.delete(key); Flow.cache.set(key, f); return f.d; }
    if (Flow.budget <= 0) return f ? f.d : null;
    Flow.budget--;
    const d = f ? f.d : new Uint16Array(N);
    computeField(d, seeds || [AG.clamp(ty | 0, 0, H - 1) * W + AG.clamp(tx | 0, 0, W - 1)], mode);
    if (f) { f.t = AG.tick; f.epoch = Wd.epoch; Flow.cache.delete(key); Flow.cache.set(key, f); }
    else {
      f = { d, t: AG.tick, epoch: Wd.epoch };
      Flow.cache.set(key, f);
      if (Flow.cache.size > 40) Flow.cache.delete(Flow.cache.keys().next().value);
    }
    Flow.computed++;
    return d;
  };
  function computeField(d, seeds, mode) {
    d.fill(65535);
    const q = Flow.q, sea = mode === 'S';
    let qh = 0, qt = 0;
    for (const s of seeds) { if (d[s] !== 0) { d[s] = 0; q[qt++] = s; } }
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, nd = d[i] + 1;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy; if (ny < 0 || ny >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox; if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (d[j] !== 65535) continue;
          if (sea ? !Wd.passSea(j) : !Wd.passLand(j)) continue;
          d[j] = nd; q[qt++] = j;
        }
      }
    }
  }
  // Walk `steps` cells downhill in the field; returns a cell index or -1.
  Flow.ahead = function (d, x, y, steps) {
    let i = AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1), moved = -1;
    for (let s = 0; s < steps; s++) {
      const cx = i % W, cy = (i / W) | 0;
      let best = -1, bv = d[i];
      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy; if (ny < 0 || ny >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox; if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (d[j] < bv) { bv = d[j]; best = j; }
        }
      }
      if (best < 0) break;
      i = best; moved = best;
    }
    return moved;
  };
  Flow.reachable = (d, x, y) => d[AG.clamp(y | 0, 0, H - 1) * W + AG.clamp(x | 0, 0, W - 1)] !== 65535;

  // ============================================================ helpers
  Civ.has = (k, branch, tier) => k.culture[branch] >= tier;
  function realmBase(race) {
    const d = SPECIES[race];
    return AG.Names.cap(pick(d.syl) + pick(d.syl).slice(0, 3) + pick(d.end));
  }
  function bannerSpec(id) {
    return { pattern: ri(6), accent: AG.hsl(rnd() * 360, 0.6, rnd() < 0.5 ? 0.82 : 0.25), sym: ri(4) };
  }
  Civ.cityAt = function (x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const o = Wd.owner[(y | 0) * W + (x | 0)];
    return o >= 0 ? Civ.cities[o] : null;
  };
  Civ.nearestCity = function (x, y, kd, maxD) {
    let best = null, bd = (maxD || 1e9) ** 2;
    for (const c of Civ.cities) {
      if (!c.alive || (kd >= 0 && c.kd !== kd)) continue;
      const d = dist2(c.x, c.y, x, y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  function counts(c, builtOnly) {
    const n = new Int32Array(BUILD.length);
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && (!builtOnly || b.prog >= 1)) n[b.type]++; }
    return n;
  }
  Civ.counts = counts;
  function firstBuilding(c, type) {
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && b.type === type && b.prog >= 1) return b; }
    return null;
  }
  function randomBuilding(c, type) {
    let found = null, n = 0;
    for (const bid of c.buildings) { const b = Civ.buildings[bid]; if (b.alive && b.type === type && b.prog >= 1 && rnd() < 1 / ++n) found = b; }
    return found;
  }
  Civ.cityMine = (c) => firstBuilding(c, BT.MINE);
  Civ.randomBuilding = randomBuilding;
  Civ.firstBuilding = firstBuilding;
  function kingdomHas(k, type) { for (const cid of k.cities) if (firstBuilding(Civ.cities[cid], type)) return true; return false; }
  function housing(c) { return 10 + counts(c, true)[BT.HOUSE] * 5; }
  function starterHouses(c, n) {
    for (let k = 0; k < n; k++) { const s = findSpot(c, BT.HOUSE); if (s) Civ.placeBuilding(c, BT.HOUSE, s.bx, s.by, true); }
  }
  Civ.housing = housing;
  function addRes(c, type, amt) {
    switch (type) {
      case 1: c.food += amt; break; case 2: c.wood += amt; break; case 3: c.stone += amt; break;
      case 4: c.ore += amt; break; case 5: c.gold += amt; break; case 6: c.crystal += amt; break;
    }
  }
  Civ.addRes = addRes;
  function isCoastal(x, y, r) {
    let n = 0;
    for (let oy = -r; oy <= r; oy += 2) for (let ox = -r; ox <= r; ox += 2) {
      const nx = x + ox, ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && Wd.fl[ny * W + nx] > 0.08 && Wd.ft[ny * W + nx] === FT.WATER) n++;
    }
    return n > 5;
  }
  // Biome desirability per race (0..~3).
  function siteScore(race, x, y) {
    const i = y * W + x, t = Wd.tbase[i], e = Wd.elev[i];
    let s = 0, veg = 0, rock = 0, water = 0;
    for (let oy = -6; oy <= 6; oy += 3) for (let ox = -6; ox <= 6; ox += 3) {
      const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; veg += Wd.veg[j]; if (Wd.soil[j] === SO.ROCK || Wd.elev[j] > 0.66) rock++; if (Wd.fl[j] > 0.01) water++;
    }
    veg /= 25 * 255;
    s += water > 0 && water < 10 ? 0.6 : 0;
    switch (SPECIES[race].home) {
      case 'temperate': s += 1.2 - Math.abs(t - 0.45) * 3 + veg * 0.8; break;
      case 'forest': s += veg * 2.2 - Math.abs(t - 0.45) * 1.5; break;
      case 'mountain': s += rock * 0.15 + (e > 0.55 ? 0.6 : 0) - Math.abs(t - 0.35); break;
      case 'hot': s += (t - 0.5) * 3 - veg * 0.5; break;
    }
    return s;
  }
  function keepFits(x, y) {
    if (x < 8 || y < 8 || x >= W - 8 || y >= H - 8) return false;
    for (let oy = -3; oy <= 2; oy++) for (let ox = -3; ox <= 2; ox++) {
      const i = (y + oy) * W + x + ox;
      if (Wd.fl[i] > 0.008 || Wd.bgrid[i] || Wd.elev[i] > AG.MOUNTAIN + 0.05) return false;
      const o = Wd.owner[i]; if (o >= 0 && Civ.cities[o] && Civ.cities[o].alive) return false;
    }
    for (const c of Civ.cities) if (c.alive && dist2(c.x, c.y, x, y) < 14 * 14) return false;
    return true;
  }
  function findCitySite(x, y, r) {
    x = x | 0; y = y | 0;
    if (keepFits(x, y)) return { x, y };
    for (let t = 0; t < 120; t++) {
      const a = rnd() * Math.PI * 2, rr = 1 + rnd() * r;
      const nx = (x + Math.cos(a) * rr) | 0, ny = (y + Math.sin(a) * rr) | 0;
      if (keepFits(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }
  Civ.findCitySite = findCitySite;

  // ============================================================ kingdoms & cities
  function newKingdom(race) {
    if (Civ.kingdoms.length >= MAXK) return null;
    const id = Civ.kingdoms.length;
    const color = AG.hsl(id * 137.508 + 14, 0.7, 0.56);
    const k = {
      id, race, name: AG.Names.kingdom(race, realmBase(race)), color, dark: color.map((v) => (v * 0.55) | 0), css: AG.css(color),
      alive: true, cities: [], capital: -1, culture: { agrarian: 0, martial: 0, mercantile: 0, mystic: 0 }, cp: 0, focus: null,
      religion: -1, opinion: new Float32Array(MAXK), war: new Uint8Array(MAXK), warSince: new Int32Array(MAXK), mods: new Float32Array(MAXK), trade: new Float32Array(MAXK),
      exp: { fire: 0, water: 0, storm: 0, earth: 0, plague: 0, harvest: 0, war: 0, watcher: 0, death: 0, sun: 1 },
      king: -1, kingUid: 0, pop: 0, founded: AG.tick, fell: 0, exhaustion: 0, inspire: 0, banner: bannerSpec(id), kills: 0, losses: 0, atWar: false,
    };
    Civ.kingdoms.push(k);
    for (const o of Civ.kingdoms) if (o !== k) k.opinion[o.id] = o.opinion[id] = o.race === race ? 15 : 0;
    return k;
  }

  Civ.createKingdom = function (race, x, y, n) {
    const site = findCitySite(x, y, 16);
    if (!site) return null;
    const k = newKingdom(race);
    if (!k) return null;
    const c = Civ.foundCity(k, site.x, site.y);
    const d = SPECIES[race], founders = [];
    for (let j = 0; j < (n || 10); j++) {
      const u = Ent.spawn(race, site.x + (rnd() - 0.5) * 6, site.y + 2 + (rnd() - 0.5) * 6, { kd: k.id, city: c.id, age: d.adult + 1 + rnd() * 14, sex: j % 2 });
      if (u >= 0) founders.push(u);
    }
    for (let j = 0; j + 1 < founders.length; j += 2) marry(founders[j], founders[j + 1]);
    c.food = 60; c.wood = 30; c.stone = 12;
    starterHouses(c, 2);
    if (founders.length) crown(k, founders[0], true);
    AG.Chronicle.add(`The ${d.name} founded the ${k.name} at ${c.name}`, 'found', c.x, c.y);
    return k;
  };

  Civ.foundCity = function (k, x, y) {
    const id = Civ.cities.length;
    const c = {
      id, kd: k.id, name: AG.Names.place(k.race), x, y, alive: true, members: [],
      food: 20, wood: 15, stone: 5, ore: 0, gold: 0, crystal: 0, faith: 0,
      buildings: [], site: -1, radius: 6, religion: k.religion, loyalty: 1, founded: AG.tick, coastal: false,
      wallPlan: null, towerPlan: null, walled: false, captureT: 0, area: 0, lastTrade: AG.tick, lastSettle: AG.tick, keep: -1, empty: 0, race: k.race,
    };
    Civ.cities.push(c); k.cities.push(id);
    if (k.capital < 0 || !Civ.cities[k.capital].alive || Civ.cities[k.capital].kd !== k.id) k.capital = id;
    const b = Civ.placeBuilding(c, BT.KEEP, x - 2, y - 2, true);
    c.keep = b.id;
    c.coastal = isCoastal(x, y, 12);
    return c;
  };

  Civ.placeBuilding = function (c, type, bx, by, built) {
    const d = BUILD[type], id = Civ.buildings.length;
    const b = { id, type, x: bx, y: by, w: d.w, h: d.h, city: c.id, kd: c.kd, hp: d.hp, mhp: d.hp, prog: built ? 1 : type === BT.WALL ? 0.4 : 0.02, alive: true, growth: rnd() * 0.3, cd: 0, cx: bx + d.w / 2, cy: by + d.h / 2 };
    Civ.buildings.push(b); c.buildings.push(id);
    for (let y = by; y < by + d.h; y++) for (let x = bx; x < bx + d.w; x++) {
      const i = y * W + x;
      Wd.bgrid[i] = id + 1; Wd.veg[i] = 0; Wd.fire[i] = 0; Wd.snow[i] = 0;
      if (type === BT.FARM) Wd.soil[i] = SO.FARM;
      else if (Wd.soil[i] === SO.FARM || Wd.soil[i] === SO.ASH) Wd.soil[i] = SO.DIRT;
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    if (built) Civ.complete(b);
    return b;
  };

  Civ.complete = function (b) {
    b.prog = 1; b.hp = b.mhp;
    const c = Civ.cities[b.city], k = Civ.kingdoms[b.kd];
    if (b.type === BT.MINE) {
      for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
        const i = y * W + x;
        if (Wd.ug[i] !== UG.BEDROCK) { Wd.ug[i] = UG.TUNNEL; }
        Wd.wakeU(x, y);
      }
    } else if (b.type === BT.TEMPLE && k) {
      if (k.religion < 0) foundOrAdoptReligion(k);
      else if (c && c.religion !== k.religion) convertCity(c, k.religion, null);
    }
    if (c && c.site === b.id) c.site = -1;
    Wd.dirty[Wd.chunkOfIdx(b.y * W + b.x)] = 1;
  };

  Civ.damageBuilding = function (id, amt, kd) {
    const b = Civ.buildings[id];
    if (!b || !b.alive) return;
    b.hp -= amt;
    if (b.hp <= 0) Civ.destroyBuilding(id, kd);
  };
  Civ.destroyBuilding = function (id, kd) {
    const b = Civ.buildings[id];
    if (!b || !b.alive) return;
    b.alive = false;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const i = y * W + x;
      if (Wd.bgrid[i] !== id + 1) continue;
      Wd.bgrid[i] = 0;
      if (Wd.fl[i] < 0.01) Wd.soil[i] = SO.ASH;
      if (kd >= 0 && rnd() < 0.25) Wd.fire[i] = 120;
      Wd.dirty[Wd.chunkOfIdx(i)] = 1;
    }
    AG.FX.burst(b.cx, b.cy, 'debris', 10 + b.w * b.h);
    const c = Civ.cities[b.city];
    if (c) {
      const p = c.buildings.indexOf(id); if (p >= 0) c.buildings.splice(p, 1);
      if (c.site === id) c.site = -1;
      if (c.keep === id) c.keep = -1;
      if (b.type === BT.WALL) c.walled = false;
    }
  };

  // ------------------------------------------------------------ membership
  Civ.joinCity = function (i, cid) {
    const c = Civ.cities[cid];
    if (U.city[i] >= 0) Civ.leaveCity(i);
    U.city[i] = cid; U.cidx[i] = c.members.length; c.members.push(i); U.kd[i] = c.kd; U.home[i] = cid;
  };
  Civ.leaveCity = function (i) {
    const c = Civ.cities[U.city[i]];
    if (!c) { U.city[i] = -1; return; }
    const p = U.cidx[i], last = c.members.pop();
    if (last !== i && p >= 0 && p < c.members.length + 1) { c.members[p] = last; U.cidx[last] = p; }
    U.city[i] = -1; U.cidx[i] = -1;
  };

  function marry(a, b) {
    if (a < 0 || b < 0 || U.spouse[a] >= 0 || U.spouse[b] >= 0) return;
    U.spouse[a] = b; U.spouse[b] = a;
    Ent.memory(a, `Married ${Ent.name(b)}`); Ent.memory(b, `Married ${Ent.name(a)}`);
  }
  Civ.marry = marry;

  function crown(k, i, founding) {
    if (k.king >= 0 && U.alive[k.king]) U.flags[k.king] &= ~FL.KING;
    k.king = i;
    if (i < 0) return;
    U.flags[i] |= FL.KING; k.kingUid = U.uid[i];
    Ent.memory(i, `Crowned ruler of the ${k.name}`);
    if (!founding) AG.Chronicle.add(`${Ent.name(i)} is crowned ${U.sex[i] ? 'King' : 'Queen'} of the ${k.name}`, 'crown', U.x[i], U.y[i]);
  }
  function crownSuccessor(k) {
    let heir = -1;
    const last = k.kingUid ? AG.People.get(k.kingUid) : null;
    if (last) for (const kid of last.kids) {
      const r = AG.People.get(kid);
      if (!r || r.died || r.idx < 0 || !U.alive[r.idx] || U.kd[r.idx] !== k.id) continue;
      if (U.age[r.idx] < SPECIES[U.sp[r.idx]].adult) continue;
      if (heir < 0 || U.age[r.idx] > U.age[heir]) heir = r.idx;
    }
    if (heir < 0) {
      const cap = Civ.cities[k.capital];
      const pool = cap ? cap.members : [];
      let best = -1, bs = -1;
      for (const m of pool) {
        if (U.job[m] === J.CHILD) continue;
        const s = (U.traits[m] & TR.ambitious ? 3 : 0) + (U.goal[m] === 5 ? 2 : 0) + (U.traits[m] & TR.hero ? 2 : 0) + rnd();
        if (s > bs) { bs = s; best = m; }
      }
      heir = best;
    }
    if (heir >= 0) crown(k, heir, false);
  }

  // ------------------------------------------------------------ deaths
  Civ.onDeath = function (i, cause, killer) {
    const kd = U.kd[i];
    if (SPECIES[U.sp[i]].kind !== 'civ' || kd < 0) return;
    const k = Civ.kingdoms[kd];
    if (U.flags[i] & FL.KING) {
      k.king = -1;
      AG.Chronicle.add(`${U.sex[i] ? 'King' : 'Queen'} ${Ent.name(i)} of the ${k.name} has died (${cause})`, 'death', U.x[i], U.y[i]);
    } else if (U.flags[i] & FL.HERO) AG.Chronicle.add(`The hero ${Ent.name(i)} has fallen (${cause})`, 'death', U.x[i], U.y[i]);
    if (U.sq[i] >= 0 || U.job[i] === J.SOLDIER) { k.exhaustion += 1; k.losses++; }
    if (killer >= 0 && U.kd[killer] >= 0 && U.kd[killer] !== kd) Civ.kingdoms[U.kd[killer]].kills++;
    if (U.dis[i]) k.exp.plague += 0.3;
    if (cause === 'lava' || cause === 'fire' || cause === 'magma') k.exp.fire += 0.3;
    else if (cause === 'drowning') k.exp.water += 0.3;
    else if (cause === 'lightning') k.exp.storm += 0.5;
    k.exp.death += 0.05;
  };

  // ------------------------------------------------------------ experience (fuel for pantheons)
  Civ.experience = function (x, y, dom, amt) {
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const d = Math.sqrt(dist2(c.x, c.y, x, y));
      if (d > 50) continue;
      Civ.kingdoms[c.kd].exp[dom] += amt * (1 - d / 50);
    }
  };

  // ============================================================ religion
  function foundOrAdoptReligion(k) {
    if (k.religion >= 0) return;
    const cands = Civ.kingdoms.filter((o) => o.alive && o.id !== k.id && o.religion >= 0 && k.opinion[o.id] > 15);
    if (cands.length && rnd() < 0.4) {
      const o = pick(cands);
      setReligion(k, o.religion);
      AG.Chronicle.add(`The ${k.name} embraces the ${Civ.religions[o.religion].name}`, 'faith', capX(k), capY(k));
      return;
    }
    const doms = Object.entries(k.exp).sort((a, b) => b[1] - a[1]);
    const n = 2 + ri(3), deities = [], used = new Set();
    for (const [dom, v] of doms) {
      if (deities.length >= n || (v < 0.5 && deities.length >= 1)) break;
      used.add(dom); deities.push({ name: AG.Names.deity(), domain: dom, epithet: pick(AG.EPITHETS[dom]) });
    }
    for (const dom of ['harvest', 'sun', 'water', 'earth', 'war', 'death'].sort(() => rnd() - 0.5)) {
      if (deities.length >= n) break;
      if (!used.has(dom)) { used.add(dom); deities.push({ name: AG.Names.deity(), domain: dom, epithet: pick(AG.EPITHETS[dom]) }); }
    }
    const top = deities[0];
    const rel = {
      id: Civ.religions.length, name: `${pick(['Faith', 'Church', 'Covenant', 'Way', 'Circle', 'Mysteries', 'Communion'])} of ${top.name}`,
      founder: k.id, color: AG.hsl(rnd() * 360, 0.65, 0.62), deities, tenet: AG.TENETS[top.domain], founded: AG.tick,
    };
    Civ.religions.push(rel);
    setReligion(k, rel.id);
    AG.Chronicle.add(`The ${k.name} found the ${rel.name}, revering ${deities.map((d) => `${d.name} ${d.epithet}`).join(', ')}`, 'faith', capX(k), capY(k));
  }
  function setReligion(k, rid) { k.religion = rid; for (const cid of k.cities) Civ.cities[cid].religion = rid; }
  function convertCity(c, rid, how) {
    if (c.religion === rid) return;
    c.religion = rid;
    if (how) AG.Chronicle.add(`${how} bring the ${Civ.religions[rid].name} to ${c.name}`, 'faith', c.x, c.y);
    AG.Render && (AG.Render.bordersDirty = true);
  }
  function missionaries(k) {
    const cap = Civ.cities[k.capital]; if (!cap) return;
    for (let t = 0; t < 4; t++) {
      const c = pick(Civ.cities);
      if (!c || !c.alive || c.kd === k.id || c.religion === k.religion) continue;
      if (dist2(c.x, c.y, cap.x, cap.y) > 90 * 90 || firstBuilding(c, BT.TEMPLE)) continue;
      if (rnd() < 0.3) convertCity(c, k.religion, `Missionaries of the ${k.name}`);
      return;
    }
  }
  const capX = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].x : -1);
  const capY = (k) => (Civ.cities[k.capital] ? Civ.cities[k.capital].y : -1);
  Civ.capitalOf = (k) => Civ.cities[k.capital] || null;

  // ============================================================ conquest & rebellion
  function transferCity(c, nk) {
    const ok = Civ.kingdoms[c.kd];
    const p = ok.cities.indexOf(c.id); if (p >= 0) ok.cities.splice(p, 1);
    nk.cities.push(c.id); c.kd = nk.id;
    for (const m of c.members) { U.kd[m] = nk.id; if (U.flags[m] & FL.KING) U.flags[m] &= ~FL.KING; if (U.sq[m] >= 0) U.sq[m] = -1; }
    for (const bid of c.buildings) Civ.buildings[bid].kd = nk.id;
    if (ok.capital === c.id) ok.capital = ok.cities.length ? ok.cities[0] : -1;
    if (ok.king >= 0 && U.alive[ok.king] && U.city[ok.king] === c.id) { U.flags[ok.king] &= ~FL.KING; ok.king = -1; }
    c.loyalty = 0.4; c.wallPlan = null;
    if (nk.capital < 0) nk.capital = c.id;
    if (!ok.cities.length) fall(ok, nk);
    AG.Render && (AG.Render.bordersDirty = true);
  }
  Civ.captureCity = function (c, kd) {
    const nk = Civ.kingdoms[kd], ok = Civ.kingdoms[c.kd];
    AG.Chronicle.add(`The ${nk.name} captures ${c.name} from the ${ok.name}`, 'war', c.x, c.y);
    nk.exp.war += 2;
    transferCity(c, nk);
  };
  function fall(k, by) {
    if (!k.alive) return;
    k.alive = false; k.fell = AG.tick;
    for (let o = 0; o < Civ.kingdoms.length; o++) { k.war[o] = 0; Civ.kingdoms[o].war[k.id] = 0; }
    for (const s of Civ.squads) if (s.alive && (s.kd === k.id || s.enemy === k.id)) endSquad(s, 'recalled');
    AG.Chronicle.add(`The ${k.name} has fallen${by ? ' to the ' + by.name : ''}`, 'fall', -1, -1);
  }
  function rebel(c) {
    const ok = Civ.kingdoms[c.kd];
    const nk = newKingdom(c.race);
    if (!nk) return;
    nk.religion = c.religion;
    let leader = -1, bs = -1;
    for (const m of c.members) {
      if (U.job[m] === J.CHILD) continue;
      const s = (U.traits[m] & TR.ambitious ? 3 : 0) + (U.goal[m] === 5 ? 3 : 0) + rnd();
      if (s > bs) { bs = s; leader = m; }
    }
    transferCity(c, nk);
    if (leader >= 0) crown(nk, leader, true);
    AG.Chronicle.add(`${c.name} rises in rebellion${leader >= 0 ? ' under ' + Ent.name(leader) : ''}, proclaiming the ${nk.name}`, 'war', c.x, c.y);
    if (ok.alive) { nk.opinion[ok.id] = ok.opinion[nk.id] = -70; Civ.declareWar(ok, nk, 'to crush the rebellion'); }
  }

  // ============================================================ diplomacy
  Civ.atWar = (a, b) => a >= 0 && b >= 0 && a !== b && Civ.kingdoms[a].war[b] === 1;
  Civ.declareWar = function (A, B, reason) {
    if (!A.alive || !B.alive || A === B || A.war[B.id]) return;
    A.war[B.id] = B.war[A.id] = 1;
    A.warSince[B.id] = B.warSince[A.id] = AG.tick;
    A.opinion[B.id] = B.opinion[A.id] = Math.min(A.opinion[B.id], -50);
    A.exp.war += 2; B.exp.war += 2;
    AG.Chronicle.add(`The ${A.name} declares war on the ${B.name}${reason ? ' ' + reason : ''}`, 'war', capX(A), capY(A));
  };
  Civ.makePeace = function (A, B, reason) {
    if (!A.war[B.id]) return;
    A.war[B.id] = B.war[A.id] = 0;
    A.opinion[B.id] = B.opinion[A.id] = Math.max(-10, A.opinion[B.id]);
    for (const s of Civ.squads) if (s.alive && ((s.kd === A.id && s.enemy === B.id) || (s.kd === B.id && s.enemy === A.id))) endSquad(s, 'recalled');
    AG.Chronicle.add(`The ${A.name} and the ${B.name} make peace${reason ? ' ' + reason : ''}`, 'peace', capX(A), capY(A));
  };
  function kingHas(k, t) { return k.king >= 0 && U.alive[k.king] && (U.traits[k.king] & TR[t]) ? 1 : 0; }
  function diplomacy() {
    const ks = Civ.kingdoms;
    for (let a = 0; a < ks.length; a++) {
      const A = ks[a]; if (!A.alive) continue;
      for (let b = a + 1; b < ks.length; b++) {
        const B = ks[b]; if (!B.alive) continue;
        const ca = Civ.capitalOf(A), cb = Civ.capitalOf(B);
        if (!ca || !cb) continue;
        const dist = Math.sqrt(dist2(ca.x, ca.y, cb.x, cb.y));
        let base = A.race === B.race ? 12 : -4;
        const ra = A.religion >= 0 ? Civ.religions[A.religion] : null, rb = B.religion >= 0 ? Civ.religions[B.religion] : null;
        if (ra && rb) {
          if (ra === rb) base += 25;
          else base -= (ra.tenet === 'zealous' || rb.tenet === 'zealous') ? 30 : 12;
          if (ra.tenet === 'pacifist' || rb.tenet === 'pacifist') base += 8;
        }
        base += Math.min(30, (A.trade[b] + B.trade[a]) * 0.5);
        A.trade[b] *= 0.92; B.trade[a] *= 0.92;
        const cont = Civ.contact[a * MAXK + b];
        base -= Math.min(35, cont / 5);
        if (dist < 70) base -= 8;
        base -= (kingHas(A, 'cruel') + kingHas(B, 'cruel')) * 12 + (kingHas(A, 'ambitious') + kingHas(B, 'ambitious')) * 6;
        base += (kingHas(A, 'kind') + kingHas(B, 'kind')) * 8;
        base += A.mods[b] + B.mods[a];
        A.mods[b] *= 0.97; B.mods[a] *= 0.97;
        if (A.war[b]) base -= 25;
        let op = A.opinion[b];
        op += (base - op) * 0.08 + (rnd() - 0.5) * 5;
        op = AG.clamp(op, -100, 100);
        A.opinion[b] = B.opinion[a] = op;
        if (!A.war[b]) {
          if (op < -35 && (cont > 0 || dist < 90) && A.pop > 10 && B.pop > 10 && rnd() < 0.14) {
            const holy = ra && rb && ra !== rb && (ra.tenet === 'zealous' || rb.tenet === 'zealous');
            const reason = A.mods[b] < -20 ? 'as divine discord takes hold' : holy ? 'in a holy war' : cont > 30 ? 'over disputed borders' : kingHas(A, 'cruel') ? 'at the whim of a cruel ruler' : 'over old grievances';
            const [x, y] = rnd() < 0.5 ? [A, B] : [B, A];
            Civ.declareWar(x, y, reason);
          }
        } else {
          const long = AG.tick - A.warSince[b] > 1500;
          if (long && (op > -5 || A.exhaustion + B.exhaustion > 70 || A.mods[b] > 30) && rnd() < 0.2) Civ.makePeace(A, B, A.mods[b] > 30 ? 'by divine will' : 'after a weary war');
        }
      }
    }
  }

  // ============================================================ borders
  const bdist = new Float32Array(N), bq = new Int32Array(N);
  Civ.recomputeBorders = function () {
    const owner = Wd.owner;
    owner.fill(-1);
    let qh = 0, qt = 0;
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      const i = (c.y | 0) * W + (c.x | 0);
      owner[i] = c.id; bq[qt++] = i; c.area = 0;
    }
    while (qh < qt) {
      const i = bq[qh++], c = Civ.cities[owner[i]];
      c.area++;
      const r2 = c.radius * c.radius, x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x, ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (owner[j] !== -1) continue;
        if (Wd.fl[j] > 0.12 && !Wd.frozen[j]) continue;
        if (dist2(nx, ny, c.x, c.y) > r2) continue;
        owner[j] = c.id; bq[qt++] = j;
      }
    }
    // border contact between kingdoms
    Civ.contact.fill(0);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, o = owner[i]; if (o < 0) continue;
      const ka = Civ.cities[o].kd;
      const r = owner[i + 1], d = owner[i + W];
      if (r >= 0 && r !== o) { const kb = Civ.cities[r].kd; if (kb !== ka) { Civ.contact[ka * MAXK + kb]++; Civ.contact[kb * MAXK + ka]++; } }
      if (d >= 0 && d !== o) { const kb = Civ.cities[d].kd; if (kb !== ka) { Civ.contact[ka * MAXK + kb]++; Civ.contact[kb * MAXK + ka]++; } }
    }
    if (AG.Render) AG.Render.bordersDirty = true;
  };

  // ============================================================ city simulation
  function cityTick(c) {
    const k = Civ.kingdoms[c.kd];
    const pop = c.members.length;
    if (pop === 0) { c.empty += 20; if (c.empty > 800) abandon(c); return; }
    c.empty = 0;
    c.radius = Math.min(26, 6 + Math.sqrt(pop) * 2.2 + (c.walled ? 1 : 0));
    const season = AG.Sky.season();
    for (const bid of c.buildings) {
      const b = Civ.buildings[bid];
      if (b.type === BT.FARM && b.prog >= 1) b.growth = Math.min(1, b.growth + (season === 3 ? 0.005 : season === 1 ? 0.045 : 0.03));
    }
    assignJobs(c, k);
    births(c, k);
    planBuild(c, k);
    if (pop >= Math.max(22, housing(c) * 0.85) && k.cities.length < 14 && AG.tick - c.lastSettle > 1200 && rnd() < 0.25) sendSettlers(c, k);
    if (k.culture.mercantile >= 1 && AG.tick - c.lastTrade > 450 && firstBuilding(c, BT.MARKET) && rnd() < 0.4) startTrade(c, k);
    if (k.atWar && k.culture.martial >= 3 && firstBuilding(c, BT.WORKSHOP) && c.wood >= 30 && rnd() < 0.08) buildCatapult(c, k);
    captureCheck(c, k);
    if ((AG.tick + c.id * 37) % 400 < 20) loyalty(c, k);
    if (c.religion !== k.religion && k.religion >= 0 && firstBuilding(c, BT.TEMPLE) && rnd() < 0.1) convertCity(c, k.religion, null);
    if (pop > 40 && rnd() < 0.0006 * (pop / 40)) outbreak(c);
    if (c.gold > 40 && rnd() < 0.2) { c.gold -= 10; c.food += 6; c.wood += 4; } // markets turn coin into goods
  }

  function abandon(c) {
    c.alive = false;
    const k = Civ.kingdoms[c.kd];
    const p = k.cities.indexOf(c.id); if (p >= 0) k.cities.splice(p, 1);
    if (k.capital === c.id) k.capital = k.cities.length ? k.cities[0] : -1;
    for (const bid of c.buildings.slice()) Civ.destroyBuilding(bid, -1);
    AG.Chronicle.add(`${c.name} lies abandoned`, 'fall', c.x, c.y);
    if (!k.cities.length) fall(k, null);
  }

  function assignJobs(c, k) {
    const m = c.members, n = m.length;
    const cnt = new Int32Array(9);
    let adults = 0;
    for (let j = 0; j < n; j++) { const i = m[j]; cnt[U.job[i]]++; if (U.job[i] !== J.CHILD && U.job[i] !== J.ELDER) adults++; }
    if (!adults) return;
    const bc = counts(c, true);
    const want = new Int32Array(9);
    want[J.SOLDIER] = Math.max(adults >= 6 ? 1 : 0, Math.round(adults * (k.atWar ? 0.4 : 0.1)));
    want[J.PRIEST] = bc[BT.TEMPLE] ? Math.min(bc[BT.TEMPLE] * 2, Math.ceil(adults * 0.08)) : 0;
    want[J.BUILD] = c.site >= 0 || (c.wallPlan && c.wallPlan.length) ? Math.max(2, Math.round(adults * 0.15)) : 0;
    want[J.MINE] = bc[BT.MINE] ? Math.max(1, Math.round(adults * (k.race === SP.STONE ? 0.22 : 0.1))) : c.stone < 30 ? Math.round(adults * 0.06) : 0;
    want[J.FARM] = Math.min(bc[BT.FARM] * 2, Math.round(adults * 0.4));
    want[J.WOOD] = Math.max(1, Math.round(adults * (c.wood < 40 ? 0.18 : 0.08)));
    let used = 0; for (let q = 2; q <= 7; q++) used += want[q];
    want[J.GATHER] = Math.max(0, adults - used);
    let changes = 0;
    const off = (AG.tick >> 4) % n;
    for (let s = 0; s < n && changes < 4; s++) {
      const i = m[(s + off) % n], jb = U.job[i];
      if (jb === J.CHILD || jb === J.ELDER || U.sq[i] >= 0) continue;
      if (cnt[jb] <= want[jb]) continue;
      let best = -1, bd = 0;
      for (let q = 1; q <= 7; q++) { const def = want[q] - cnt[q]; if (def > bd) { bd = def; best = q; } }
      if (best < 0) break;
      if (best === J.SOLDIER && (U.traits[i] & TR.coward)) continue;
      cnt[jb]--; cnt[best]++; U.job[i] = best; changes++;
      if (U.st[i] !== ST.FIGHT && U.layer[i] === 1) { U.st[i] = ST.IDLE; U.task[i] = TK.NONE; }
    }
  }

  function births(c, k) {
    const pop = c.members.length;
    if (pop >= housing(c) || c.food < pop * 0.9 + 6) return;
    if (rnd() > 0.3 * (k.culture.agrarian >= 4 ? 1.35 : 1)) return;
    for (let t = 0; t < 6; t++) {
      const m = c.members[ri(pop)];
      if (U.sex[m] !== 0 || U.job[m] === J.CHILD) continue;
      const s = U.spouse[m];
      if (s < 0 || !U.alive[s]) continue;
      const d = SPECIES[U.sp[m]];
      if (U.age[m] > d.adult + (U.life[m] - d.adult) * 0.55) continue;
      const rec = AG.People.rec(m);
      if (rec && AG.tick - rec.lastBirth < 320) continue;
      let fert = (U.genes[m * AG.NG + G.FERT] + U.genes[s * AG.NG + G.FERT]) / 510;
      if (U.traits[m] & TR.fertile) fert += 0.3;
      if (U.traits[m] & TR.cursed) fert *= 0.3;
      if (U.traits[m] & TR.blessed) fert += 0.2;
      if (U.dis[m] && AG.DISEASES[U.dis[m] - 1].sterile) continue;
      if (rnd() > 0.3 + fert * 0.6) continue;
      const mutate = (U.flags[m] & FL.BLESSED ? 0.3 : 0) + (U.flags[m] & FL.CURSED ? 0.5 : 0);
      const ch = Ent.spawn(U.sp[m], U.x[m], U.y[m], { kd: c.kd, city: c.id, mom: m, dad: s, age: 0, mutate });
      if (ch < 0) return;
      c.food -= 2;
      const nm = Ent.name(ch);
      Ent.memory(m, `Gave birth to ${nm}`); Ent.memory(s, `Fathered ${nm}`); Ent.memory(ch, `Born in ${c.name}`);
      return;
    }
  }

  function canAfford(c, type) { const d = BUILD[type]; return c.wood >= d.wood && c.stone >= d.stone; }
  function pay(c, type) { const d = BUILD[type]; c.wood -= d.wood; c.stone -= d.stone; }
  function reqOk(k, type) { const r = BUILD[type].req; return !r || k.culture[r[0]] >= r[1]; }

  function planBuild(c, k) {
    if (c.site >= 0) {
      const b = Civ.buildings[c.site];
      if (!b || !b.alive) c.site = -1;
      else { b.prog += 0.025; if (b.prog >= 1) Civ.complete(b); return; }
    }
    if (c.keep < 0) {
      if (canAfford(c, BT.KEEP) && fits(c, BT.KEEP, (c.x | 0) - 2, (c.y | 0) - 2)) { pay(c, BT.KEEP); const b = Civ.placeBuilding(c, BT.KEEP, (c.x | 0) - 2, (c.y | 0) - 2, false); c.keep = b.id; c.site = b.id; }
      return;
    }
    if (c.wallPlan && c.wallPlan.length) {
      while (c.wallPlan.length) {
        const i = c.wallPlan.pop();
        const x = i % W, y = (i / W) | 0;
        if (!fits(c, BT.WALL, x, y)) continue;
        if (c.stone < 2) { c.wallPlan.push(i); break; }
        pay(c, BT.WALL); c.site = Civ.placeBuilding(c, BT.WALL, x, y, false).id;
        return;
      }
      if (!c.wallPlan.length) { c.wallPlan = null; c.walled = true; }
      return;
    }
    const bc = counts(c, false), pop = c.members.length, cap = housing(c);
    let want = -1;
    if (pop >= cap - 3) want = BT.HOUSE;
    else if (bc[BT.FARM] < Math.ceil(pop / 9) && bc[BT.FARM] < 8) want = BT.FARM;
    else if (reqOk(k, BT.TEMPLE) && bc[BT.TEMPLE] < 1 + (pop > 70 ? 1 : 0)) want = BT.TEMPLE;
    else if (reqOk(k, BT.MARKET) && !bc[BT.MARKET] && pop > 12) want = BT.MARKET;
    else if (!bc[BT.MINE] && pop > 10) want = BT.MINE;
    else if (reqOk(k, BT.WINDMILL) && bc[BT.WINDMILL] < Math.floor(bc[BT.FARM] / 3)) want = BT.WINDMILL;
    else if (reqOk(k, BT.DOCK) && c.coastal && !bc[BT.DOCK]) want = BT.DOCK;
    else if (reqOk(k, BT.WALL) && pop > 22 && !c.walled && !c.wallPlan) { planWalls(c); return; }
    else if (reqOk(k, BT.TOWER) && bc[BT.TOWER] < 2 && pop > 26 && c.towerPlan && c.towerPlan.length) want = BT.TOWER;
    else if (reqOk(k, BT.WORKSHOP) && !bc[BT.WORKSHOP] && pop > 28) want = BT.WORKSHOP;
    else if (pop >= cap * 0.75) want = BT.HOUSE;
    if (want < 0 || !canAfford(c, want)) return;
    let spot = null;
    if (want === BT.TOWER) {
      while (c.towerPlan.length && !spot) { const p = c.towerPlan.pop(); if (fits(c, BT.TOWER, p.x, p.y)) spot = { bx: p.x, by: p.y }; }
    } else spot = findSpot(c, want);
    if (!spot) return;
    pay(c, want);
    c.site = Civ.placeBuilding(c, want, spot.bx, spot.by, false).id;
  }

  function findSpot(c, type) {
    const d = BUILD[type];
    for (let t = 0; t < 70; t++) {
      const a = rnd() * Math.PI * 2;
      const rr = type === BT.FARM ? 5 + rnd() * c.radius * 0.95 : type === BT.HOUSE ? 3 + rnd() * c.radius * 0.6 : type === BT.DOCK ? 3 + rnd() * (c.radius + 4) : 3 + rnd() * c.radius * 0.8;
      const bx = Math.round(c.x + Math.cos(a) * rr - d.w / 2), by = Math.round(c.y + Math.sin(a) * rr - d.h / 2);
      if (fits(c, type, bx, by)) return { bx, by };
    }
    return null;
  }
  function fits(c, type, bx, by) {
    const d = BUILD[type];
    if (bx < 3 || by < 3 || bx + d.w >= W - 3 || by + d.h >= H - 3) return false;
    let water = 0;
    for (let y = by - 1; y <= by + d.h; y++) for (let x = bx - 1; x <= bx + d.w; x++) {
      const i = y * W + x;
      const inside = x >= bx && x < bx + d.w && y >= by && y < by + d.h;
      if (inside) {
        if (Wd.bgrid[i] || Wd.fire[i]) return false;
        if (Wd.fl[i] > 0.008) {
          if (type === BT.DOCK && Wd.ft[i] === FT.WATER && Wd.fl[i] < 0.09) { water++; continue; }
          return false;
        }
        if (Wd.elev[i] > AG.MOUNTAIN + 0.05 && type !== BT.MINE) return false;
        const o = Wd.owner[i]; if (o !== -1 && o !== c.id) return false;
      } else {
        if (Wd.bgrid[i] && type !== BT.WALL) { const nb = Civ.buildings[Wd.bgrid[i] - 1]; if (nb.type !== BT.WALL) return false; }
        if (type === BT.DOCK && Wd.passSea(i)) water++;
      }
    }
    return type !== BT.DOCK || water >= 3;
  }
  function planWalls(c) {
    let R = 7;
    for (const bid of c.buildings) {
      const b = Civ.buildings[bid];
      if (b.type === BT.FARM || b.type === BT.DOCK) continue;
      const d = Math.sqrt(dist2(b.cx, b.cy, c.x, c.y)) + Math.max(b.w, b.h) / 2 + 2;
      if (d > R) R = d;
    }
    R = Math.min(R, c.radius - 1);
    const pts = [], seen = new Set(), steps = Math.ceil(2 * Math.PI * R * 1.6);
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2, deg = (a * 180) / Math.PI;
      if (deg % 90 < 8 || deg % 90 > 82) continue; // four gates
      const x = Math.round(c.x + Math.cos(a) * R), y = Math.round(c.y + Math.sin(a) * R), i = y * W + x;
      if (seen.has(i)) continue;
      seen.add(i); pts.push(i);
    }
    c.wallPlan = pts.reverse();
    c.towerPlan = [45, 135, 225, 315].map((deg) => ({ x: Math.round(c.x + Math.cos((deg * Math.PI) / 180) * (R - 2.5)) - 1, y: Math.round(c.y + Math.sin((deg * Math.PI) / 180) * (R - 2.5)) - 1 }));
  }

  function sendSettlers(c, k) {
    const site = findNewCitySite(c, k);
    if (!site) return;
    let adults = 0;
    for (const m of c.members) if (U.job[m] !== J.CHILD && U.job[m] !== J.ELDER) adults++;
    const quota = Math.min(8, adults - 10); // the mother city keeps a working core
    if (quota < 4) return;
    const group = [];
    for (let t = 0; t < 50 && group.length < quota; t++) {
      const m = c.members[ri(c.members.length)];
      if (group.includes(m) || U.job[m] === J.CHILD || U.job[m] === J.ELDER || (U.flags[m] & FL.KING) || U.sq[m] >= 0 || U.layer[m] !== 1) continue;
      group.push(m);
      const s = U.spouse[m];
      if (s >= 0 && U.alive[s] && U.city[s] === c.id && !group.includes(s) && U.layer[s] === 1 && !(U.flags[s] & FL.KING) && U.sq[s] < 0) group.push(s);
    }
    if (group.length < 4) return;
    const ex = { id: AG.tick, kd: k.id, x: site.x, y: site.y, members: group, from: c.id, t: AG.tick };
    Civ.expeditions.push(ex);
    for (const m of group) {
      Civ.leaveCity(m); U.home[m] = c.id;
      U.flags[m] |= FL.SETTLER; U.task[m] = TK.SETTLE; U.st[m] = ST.IDLE;
      if (U.job[m] === J.SOLDIER) U.job[m] = J.GATHER;
      U.carry[m] = 0;
      Ent.memory(m, `Set out from ${c.name} to settle new land`);
    }
    c.lastSettle = AG.tick;
    c.food = Math.max(0, c.food - 10);
  }
  function findNewCitySite(c, k) {
    const field = Flow.get('L' + c.id, c.x, c.y, 'L');
    if (!field) return null;
    let best = null, bs = -1e9;
    for (let t = 0; t < 60; t++) {
      const a = rnd() * Math.PI * 2, r = 28 + rnd() * 55;
      const x = (c.x + Math.cos(a) * r) | 0, y = (c.y + Math.sin(a) * r) | 0;
      if (x < 10 || y < 10 || x >= W - 10 || y >= H - 10) continue;
      const i = y * W + x;
      if (field[i] === 65535 || Wd.owner[i] !== -1 || !keepFits(x, y)) continue;
      if (Civ.cities.some((o) => o.alive && dist2(o.x, o.y, x, y) < 24 * 24)) continue;
      const s = siteScore(k.race, x, y) - field[i] * 0.01;
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best;
  }
  Civ.expeditionField = function (ex) { return Flow.get('X' + ex.id, ex.x, ex.y, 'L'); };
  function expeditionTick() {
    for (let e = Civ.expeditions.length - 1; e >= 0; e--) {
      const ex = Civ.expeditions[e], k = Civ.kingdoms[ex.kd];
      ex.members = ex.members.filter((m) => U.alive[m] && (U.flags[m] & FL.SETTLER));
      const done = () => { Civ.expeditions.splice(e, 1); };
      if (!ex.members.length) { done(); continue; }
      if (!k.alive || AG.tick - ex.t > 3500) { disperse(ex); done(); continue; }
      if (ex.members.some((m) => dist2(U.x[m], U.y[m], ex.x, ex.y) < 25)) {
        const site = findCitySite(ex.x, ex.y, 8);
        if (!site) { disperse(ex); done(); continue; }
        const nc = Civ.foundCity(k, site.x, site.y);
        nc.food = 25; nc.wood = 20; nc.stone = 6;
        starterHouses(nc, 1);
        for (const m of ex.members) {
          U.flags[m] &= ~FL.SETTLER; U.task[m] = TK.NONE; U.st[m] = ST.IDLE;
          Civ.joinCity(m, nc.id);
          Ent.memory(m, `Helped found ${nc.name}`);
        }
        AG.Chronicle.add(`Settlers of the ${k.name} found ${nc.name}`, 'found', nc.x, nc.y);
        done();
      }
    }
  }
  function disperse(ex) {
    for (const m of ex.members) {
      U.flags[m] &= ~FL.SETTLER; U.task[m] = TK.NONE; U.st[m] = ST.IDLE;
      const c = Civ.nearestCity(U.x[m], U.y[m], ex.kd) || Civ.nearestCity(U.x[m], U.y[m], -1);
      if (c) Civ.joinCity(m, c.id);
    }
  }

  // ------------------------------------------------------------ trade
  Civ.dockOf = (c) => firstBuilding(c, BT.DOCK);
  function seaSeeds(b) {
    const out = [];
    for (let y = b.y - 2; y <= b.y + b.h + 1; y++) for (let x = b.x - 2; x <= b.x + b.w + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x; if (Wd.passSea(i)) out.push(i);
    }
    return out;
  }
  Civ.seaField = function (c) { const d = Civ.dockOf(c); if (!d) return null; const s = seaSeeds(d); return s.length ? Flow.get('S' + c.id, d.cx, d.cy, 'S', s) : null; };
  function startTrade(c, k) {
    let best = null, bd = 1e18;
    for (const o of Civ.cities) {
      if (!o.alive || o.id === c.id) continue;
      if (o.kd !== c.kd) {
        if (!firstBuilding(o, BT.MARKET) || k.war[o.kd] || k.opinion[o.kd] < -10) continue;
      }
      const d = dist2(c.x, c.y, o.x, o.y);
      if (d > 150 * 150) continue;
      const s = d * (o.kd === c.kd ? 1.4 : 1) * (0.5 + rnd());
      if (s < bd) { bd = s; best = o; }
    }
    if (!best) return;
    c.lastTrade = AG.tick;
    let mode = 'cart', sx = c.x, sy = c.y + 2.5;
    if (k.culture.mercantile >= 4) mode = 'air';
    else {
      const da = Civ.dockOf(c);
      if (k.culture.mercantile >= 2 && da && Civ.dockOf(best)) {
        const f = Civ.seaField(best);
        const seeds = seaSeeds(da);
        if (f && seeds.length && f[seeds[0]] !== 65535) { mode = 'sea'; sx = seeds[0] % W + 0.5; sy = ((seeds[0] / W) | 0) + 0.5; }
      }
      if (mode === 'cart') {
        const f = Flow.get('L' + best.id, best.x, best.y, 'L');
        if (!f || !Flow.reachable(f, c.x, c.y)) return;
      }
    }
    const opts = [[1, c.food - c.members.length * 1.5], [2, c.wood - 30], [3, c.stone - 20], [4, c.ore]];
    opts.sort((a, b) => b[1] - a[1]);
    const [type, surplus] = opts[0];
    const amt = Math.max(0, Math.min(10, Math.floor(surplus)));
    if (amt > 0) addRes(c, type, -amt);
    const sp = mode === 'air' ? SP.AIRSHIP : mode === 'sea' ? SP.SHIP : SP.CART;
    const v = Ent.spawn(sp, sx, sy, { kd: c.kd, home: c.id });
    if (v < 0) return;
    U.tref[v] = best.id; U.aux[v] = 0; U.carry[v] = type; U.camt[v] = amt; U.task[v] = TK.TRADE;
    addRoute(c.id, best.id, mode);
  }
  function addRoute(a, b, mode) {
    for (const r of Civ.routes) if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) { r.n++; r.t = AG.tick; r.mode = mode; return; }
    Civ.routes.push({ a, b, mode, n: 1, t: AG.tick });
    const A = Civ.cities[a], B = Civ.cities[b];
    if (A.kd !== B.kd) AG.Chronicle.add(`A trade route opens between ${A.name} and ${B.name}`, 'trade', (A.x + B.x) / 2, (A.y + B.y) / 2);
  }
  Civ.tradeArrive = function (i) {
    const dest = Civ.cities[U.tref[i]], home = Civ.cities[U.home[i]];
    if (U.aux[i] === 0) {
      addRes(dest, U.carry[i], U.camt[i]);
      const k = Civ.kingdoms[U.kd[i]];
      const coin = (k && k.culture.mercantile >= 3 ? 2 : 1) * 5;
      dest.gold += coin;
      if (dest.kd !== U.kd[i] && k) {
        const o = Civ.kingdoms[dest.kd];
        k.trade[o.id] += 4; o.trade[k.id] += 4;
        if (home && home.religion >= 0 && dest.religion !== home.religion && !firstBuilding(dest, BT.TEMPLE) && rnd() < 0.1 * (k.culture.mystic >= 2 ? 2 : 1)) convertCity(dest, home.religion, `Merchants of ${home.name}`);
      }
      U.aux[i] = 1; U.tref[i] = U.home[i]; U.carry[i] = 5; U.camt[i] = coin;
      return true;
    }
    if (home && home.alive) home.gold += U.camt[i];
    Ent.kill(i, 'retired');
    return false;
  };

  // ------------------------------------------------------------ war
  function manageWars(k) {
    if (!k.atWar) return;
    for (let e = 0; e < Civ.kingdoms.length; e++) {
      if (!k.war[e]) continue;
      const E = Civ.kingdoms[e];
      if (!E.alive) { k.war[e] = 0; continue; }
      if (Civ.squads.some((s) => s.alive && s.kd === k.id && s.enemy === e)) continue;
      const avail = [];
      for (const cid of k.cities) for (const m of Civ.cities[cid].members) {
        if (U.job[m] === J.SOLDIER && U.sq[m] < 0 && U.hp[m] > U.mhp[m] * 0.6 && U.layer[m] === 1) avail.push(m);
      }
      if (avail.length >= 4 && rnd() < 0.5) createSquad(k, E, avail);
    }
  }
  function createSquad(k, E, avail) {
    let best = null, src = null, bd = 1e18;
    for (const cid of k.cities) for (const eid of E.cities) {
      const a = Civ.cities[cid], b = Civ.cities[eid];
      const d = dist2(a.x, a.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; src = a; }
    }
    if (!best || bd > 170 * 170) return;
    const f = Flow.get('L' + best.id, best.x, best.y, 'L');
    if (!f || !Flow.reachable(f, src.x, src.y)) return;
    const sq = { id: Civ.squads.length, alive: true, kd: k.id, enemy: E.id, target: best.id, src: src.id, stage: 0, t: 0, members: [], start: 0,
      flank: k.culture.martial >= 1, rx: src.x, ry: src.y, wpL: null, wpR: null, cx: src.x, cy: src.y };
    avail.sort((a, b) => dist2(U.x[a], U.y[a], src.x, src.y) - dist2(U.x[b], U.y[b], src.x, src.y));
    const take = Math.min(60, Math.ceil(avail.length * 0.8));
    for (let j = 0; j < take; j++) {
      const m = avail[j];
      U.sq[m] = sq.id; U.task[m] = TK.MARCH; U.st[m] = ST.IDLE; U.carry[m] = 0;
      if (sq.flank) { const g = j % 3; if (g === 1) U.flags[m] |= FL.FLANKL; else if (g === 2) U.flags[m] |= FL.FLANKR; }
      sq.members.push(m);
      Ent.memory(m, `Marched to war against the ${E.name}`);
    }
    sq.start = sq.members.length;
    Civ.squads.push(sq);
    AG.Chronicle.add(`${sq.start} soldiers of the ${k.name} march on ${best.name}${sq.flank ? ' in a pincer formation' : ''}`, 'war', src.x, src.y);
  }
  function buildCatapult(c, k) {
    const sq = Civ.squads.find((s) => s.alive && s.kd === k.id && s.stage < 2);
    if (!sq) return;
    const ws = firstBuilding(c, BT.WORKSHOP);
    const v = Ent.spawn(SP.CATAPULT, ws.cx, ws.cy + 2, { kd: k.id, home: c.id });
    if (v < 0) return;
    c.wood -= 30; U.sq[v] = sq.id; sq.members.push(v); sq.start++;
  }
  function computeFlanks(sq) {
    if (!sq.flank) return;
    const tc = Civ.cities[sq.target];
    let dx = tc.x - sq.rx, dy = tc.y - sq.ry; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx;
    const place = (sx) => {
      const x = tc.x - dx * 12 + px * 13 * sx, y = tc.y - dy * 12 + py * 13 * sx;
      for (let t = 0; t < 12; t++) {
        const nx = (x + (rnd() - 0.5) * t) | 0, ny = (y + (rnd() - 0.5) * t) | 0;
        if (nx > 1 && ny > 1 && nx < W - 1 && ny < H - 1 && Wd.passLand(ny * W + nx)) return { x: nx + 0.5, y: ny + 0.5 };
      }
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
      if (why === 'victory') Ent.memory(m, `Victorious at ${Civ.cities[sq.target].name}`);
    }
    if (why === 'routed') {
      const tc = Civ.cities[sq.target];
      AG.Chronicle.add(`The army of the ${Civ.kingdoms[sq.kd].name} is routed at ${tc.name}`, 'war', tc.x, tc.y);
    }
  }
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
  function captureCheck(c, k) {
    const n = Ent.near(c.x, c.y, 7, 1);
    let enemies = 0, defenders = 0, ek = -1;
    for (let q = 0; q < n; q++) {
      const j = Ent.buf[q];
      if (SPECIES[U.sp[j]].kind !== 'civ') continue;
      const kj = U.kd[j];
      if (kj === c.kd) { if (U.job[j] !== J.CHILD) defenders++; }
      else if (kj >= 0 && k.war[kj] && U.sq[j] >= 0) { enemies++; ek = kj; }
    }
    if (enemies >= 3 && defenders === 0) { c.captureT += 20; if (c.captureT >= 100) { c.captureT = 0; Civ.captureCity(c, ek); } }
    else if (c.captureT > 0) c.captureT -= 10;
  }
  function loyalty(c, k) {
    const cap = Civ.capitalOf(k);
    let l = 1;
    if (cap && cap !== c) l -= Math.sqrt(dist2(cap.x, cap.y, c.x, c.y)) / 220;
    if (c.religion !== k.religion) l -= 0.25;
    l -= k.exhaustion * 0.004;
    if (c.food < c.members.length * 0.2) l -= 0.15;
    if (k.king >= 0 && U.alive[k.king] && (U.traits[k.king] & TR.cruel)) l -= 0.1;
    if (k.king >= 0 && U.alive[k.king] && (U.traits[k.king] & TR.kind)) l += 0.1;
    c.loyalty = AG.clamp(l, 0, 1);
    if (k.cities.length >= 3 && cap !== c && c.loyalty < 0.35 && c.members.length > 12 && rnd() < 0.15) rebel(c);
  }
  function outbreak(c) {
    let d;
    if (AG.DISEASES.length < AG.MAX_DISEASES && rnd() < 0.5) {
      d = AG.DISEASES.length;
      AG.DISEASES.push({ name: AG.Names.disease(), color: AG.css(AG.hsl(rnd() * 360, 0.6, 0.55)), contagion: 0.06 + rnd() * 0.12, radius: 1 + rnd() * 1.5,
        lethality: 0.1 + rnd() * 0.45, incubation: 0.4 + rnd(), duration: 1.5 + rnd() * 3, slow: rnd() * 0.3, sterile: rnd() < 0.15 ? 1 : 0, madness: rnd() < 0.08 ? 1 : 0, hollow: 0, targets: AG.CIV_MASK });
    } else d = ri(AG.DISEASES.length);
    let n = 0;
    for (let t = 0; t < 3; t++) if (Ent.infect(c.members[ri(c.members.length)], d)) n++;
    if (n) AG.Chronicle.add(`An outbreak of ${AG.DISEASES[d].name} strikes ${c.name}`, 'plague', c.x, c.y);
  }

  // ------------------------------------------------------------ kingdoms
  function chooseFocus(k) {
    const sq = (b) => (k.culture[b] >= 4 ? 0 : 1);
    const race = SPECIES[k.race].bias;
    let coastal = 0, food = 0, pop = 0;
    for (const cid of k.cities) { const c = Civ.cities[cid]; if (c.coastal) coastal++; food += c.food; pop += c.members.length; }
    let wars = 0; for (let o = 0; o < Civ.kingdoms.length; o++) wars += k.war[o];
    const e = k.exp;
    const w = {
      agrarian: race.agrarian * (1 + (food < pop ? 0.8 : 0)) * sq('agrarian'),
      martial: race.martial * (1 + wars * 0.8 + kingHas(k, 'cruel') * 0.5 + kingHas(k, 'brave') * 0.3) * sq('martial'),
      mercantile: race.mercantile * (1 + coastal * 0.3) * sq('mercantile'),
      mystic: race.mystic * (1 + (e.watcher + e.fire + e.storm + e.plague) / 40) * sq('mystic'),
    };
    let s = 0; for (const b of BRANCHES) s += w[b];
    if (s <= 0) return null;
    let r = rnd() * s;
    for (const b of BRANCHES) { r -= w[b]; if (r <= 0) return b; }
    return BRANCHES[0];
  }
  function kingdomTick(k) {
    let pop = 0;
    for (const cid of k.cities) pop += Civ.cities[cid].members.length;
    k.pop = pop;
    if (!k.cities.length) { fall(k, null); return; }
    if (k.capital < 0 || !Civ.cities[k.capital] || !Civ.cities[k.capital].alive || Civ.cities[k.capital].kd !== k.id) k.capital = k.cities[0];
    if (k.king < 0 || !U.alive[k.king] || U.kd[k.king] !== k.id) crownSuccessor(k);
    k.atWar = false;
    for (let o = 0; o < Civ.kingdoms.length; o++) if (k.war[o]) { k.atWar = true; break; }
    // culture points
    if (pop > 0) {
      let ints = 0, n = 0, temples = 0, markets = 0, crystal = 0;
      for (const cid of k.cities) {
        const c = Civ.cities[cid];
        for (let s = 0; s < 6 && c.members.length; s++) { ints += U.genes[c.members[ri(c.members.length)] * AG.NG + G.INT]; n++; }
        const bc = counts(c, true); temples += bc[BT.TEMPLE]; markets += bc[BT.MARKET]; crystal += c.crystal;
      }
      const avgInt = n ? ints / n / 255 : 0.5;
      k.cp += Math.pow(pop, 0.7) * (0.6 + avgInt) * (1 + temples * 0.25 + markets * 0.1) * 0.14 + k.inspire * 0.3 + Math.min(4, crystal * 0.05);
      k.inspire *= 0.9;
      if (!k.focus) k.focus = chooseFocus(k);
      if (k.focus) {
        const tier = k.culture[k.focus];
        const total = k.culture.agrarian + k.culture.martial + k.culture.mercantile + k.culture.mystic;
        const cost = AG.CULTURE_COST[tier] * (1 + 0.08 * total);
        if (k.cp >= cost) {
          k.cp -= cost; k.culture[k.focus]++;
          AG.Chronicle.add(`The ${k.name} embraces ${CULTURE[k.focus].nodes[tier].name} (${CULTURE[k.focus].name} ${tier + 1})`, 'culture', capX(k), capY(k));
          k.focus = null;
        }
      }
    }
    if (k.culture.mystic >= 1 && k.religion < 0 && kingdomHas(k, BT.TEMPLE)) foundOrAdoptReligion(k);
    if (k.culture.mystic >= 2 && k.religion >= 0 && rnd() < 0.08) missionaries(k);
    manageWars(k);
    k.exhaustion *= 0.985;
    for (const key in k.exp) k.exp[key] *= 0.999;
  }

  // ------------------------------------------------------------ defences
  Civ.hostileToKingdom = function (j, kd) {
    const d = SPECIES[U.sp[j]];
    if (d.kind === 'monster') return true;
    if (U.sp[j] === SP.WOLF) return true;
    if ((d.kind === 'civ' || d.kind === 'vehicle') && U.kd[j] >= 0 && U.kd[j] !== kd) return Civ.kingdoms[kd].war[U.kd[j]] === 1;
    return (U.flags[j] & FL.MAD) !== 0;
  };
  function defenses() {
    for (const c of Civ.cities) {
      if (!c.alive) continue;
      for (const bid of c.buildings) {
        const b = Civ.buildings[bid];
        if (b.prog < 1 || (b.type !== BT.TOWER && b.type !== BT.KEEP)) continue;
        const range = b.type === BT.TOWER ? 10 : 7;
        let target = -1;
        for (const layer of [1, 2]) {
          const n = Ent.near(b.cx, b.cy, range, layer, 64);
          for (let q = 0; q < n; q++) { const j = Ent.buf[q]; if (Civ.hostileToKingdom(j, c.kd)) { target = j; break; } }
          if (target >= 0) break;
        }
        if (target < 0) continue;
        AG.Proj.fire(0, b.cx, b.cy - 1, U.x[target] + U.fx[target] * 0.5, U.y[target] + U.fy[target] * 0.5, b.type === BT.TOWER ? 8 : 5, c.kd, U.layer[target], -1);
      }
    }
  }

  // ------------------------------------------------------------ ecology & seeding
  function ecology() {
    const cnt = Ent.count;
    if (cnt[SP.BIRD] < 220) {
      const x = 20 + rnd() * (W - 40), y = 20 + rnd() * (H - 40);
      for (let j = 0; j < 10; j++) Ent.spawn(SP.BIRD, x + rnd() * 4, y + rnd() * 4);
    }
    const land = () => { for (let t = 0; t < 30; t++) { const x = 8 + ri(W - 16), y = 8 + ri(H - 16), i = y * W + x; if (Wd.isLand(i) && Wd.veg[i] > 100 && Wd.owner[i] < 0) return [x + 0.5, y + 0.5]; } return null; };
    if (cnt[SP.DEER] < 60) { const p = land(); if (p) for (let j = 0; j < 6; j++) Ent.spawn(SP.DEER, p[0] + rnd() * 3, p[1] + rnd() * 3); }
    if (cnt[SP.WOLF] < 12) { const p = land(); if (p) for (let j = 0; j < 3; j++) Ent.spawn(SP.WOLF, p[0] + rnd() * 3, p[1] + rnd() * 3); }
    if (cnt[SP.CRAWLER] < 40) {
      for (let t = 0; t < 30; t++) { const x = 4 + ri(W - 8), y = 4 + ri(H - 8), i = y * W + x; if (Wd.ug[i] === UG.CAVE && !Wd.ugF[i]) { Ent.spawn(SP.CRAWLER, x + 0.5, y + 0.5, { layer: 0 }); break; } }
    }
  }
  Civ.seedWorld = function () {
    for (const race of [SP.KIN, SP.SYLVAN, SP.STONE, SP.ASHEN]) {
      let best = null, bs = -1e9;
      for (let t = 0; t < 500; t++) {
        const x = 14 + ri(W - 28), y = 14 + ri(H - 28);
        if (!keepFits(x, y)) continue;
        if (Civ.cities.some((c) => dist2(c.x, c.y, x, y) < 70 * 70)) continue;
        const s = siteScore(race, x, y);
        if (s > bs) { bs = s; best = { x, y }; }
      }
      if (best) Civ.createKingdom(race, best.x, best.y, 12);
    }
    const spawnOn = (sp, n, pred, layer) => {
      let made = 0;
      for (let t = 0; t < n * 20 && made < n; t++) {
        const x = 4 + ri(W - 8), y = 4 + ri(H - 8), i = y * W + x;
        if (!pred(i)) continue;
        const g = 1 + ri(4);
        for (let k = 0; k < g && made < n; k++) if (Ent.spawn(sp, x + rnd() * 3, y + rnd() * 3, layer === undefined ? undefined : { layer }) >= 0) made++;
      }
    };
    spawnOn(SP.DEER, 380, (i) => Wd.isLand(i) && Wd.veg[i] > 90);
    spawnOn(SP.WOLF, 50, (i) => Wd.isLand(i) && Wd.veg[i] > 150);
    spawnOn(SP.BIRD, 260, () => true);
    spawnOn(SP.CRAWLER, 70, (i) => Wd.ug[i] === UG.CAVE && !Wd.ugF[i], 0);
    Civ.recomputeBorders();
  };

  // ============================================================ main tick
  Civ.tick = function () {
    const t = AG.tick;
    for (const c of Civ.cities) if (c.alive && (c.id + t) % 20 === 0) cityTick(c);
    for (const k of Civ.kingdoms) if (k.alive && (k.id * 7 + t) % 50 === 0) kingdomTick(k);
    if (t % 100 === 0) diplomacy();
    if (t % 40 === 0) Civ.recomputeBorders();
    if (t % 10 === 0) {
      for (const sq of Civ.squads) if (sq.alive) squadTick(sq);
      expeditionTick();
    }
    if (t % 15 === 0) defenses();
    if (t % 30 === 0) ecology();
    if (t % 600 === 0) AG.People.prune();
    if (t % 500 === 0) Civ.routes = Civ.routes.filter((r) => t - r.t < 6000 && Civ.cities[r.a].alive && Civ.cities[r.b].alive);
  };
})();
