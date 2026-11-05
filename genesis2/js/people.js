/* AURA: Genesis 2 — people.js
 * Every person is a record that exists whether or not anyone is looking: identity, genome,
 * family, personality, likes and dislikes, beliefs, skills, memories, relationships and health.
 * A body (entity) is only a view of a person near the camera. The yearly life processes here
 * (ageing, illness, births, marriages, friendships, learning, forgetting) run the same way for
 * embodied and folded people, so watching never changes the expected course of a life. */
'use strict';
(function () {
  const AG = window.AG;
  const { TR, TRAITS, NS, SK, NT, J } = AG;
  const L = AG.Life.L, GL = AG.Life.GL;
  const People = (AG.People = { map: new Map(), alive: 0, nextId: 1, births: 0, deaths: 0, dead: [], famous: [] });
  const rnd = () => AG.rnd();
  const PARTS = ['head', 'chest', 'left arm', 'right arm', 'left leg', 'right leg'];
  People.PARTS = PARTS;
  const MK = {
    BORN: 0, CHILD: 1, MARRIED: 2, GRIEF: 3, HURT: 4, SAVED: 5, FAMINE: 6, DISASTER: 7, WAR: 8, VICTORY: 9, DEFEAT: 10,
    MIGRATED: 11, FOUNDED: 12, INVENTED: 13, LEARNED: 14, OMEN: 15, DREAM: 16, FRIEND: 17, BETRAYED: 18, GIFT: 19,
    HUNT: 20, INJURED: 21, ILL: 22, RECOVERED: 23, RULER: 24, EXILE: 25, ROMANCE: 26, KILLED: 27, GOAL: 28, PLAGUE: 29,
    QUARREL: 30, TAUGHT: 31, CAME_OF_AGE: 32, WIDOWED: 33, LOST_HOME: 34, FLOOD: 35, QUAKE: 36, ERUPTION: 37, MIRACLE: 38,
  };
  People.MK = MK;
  const year = () => AG.Geo.year;
  People.year = year;

  People.budget = Math.round(9000 * Math.min(1.6, Math.max(0.5, AG.SCALE / 2.4)));
  People.reset = function () { People.map.clear(); People.alive = 0; People.nextId = 1; People.births = 0; People.deaths = 0; People.dead.length = 0; People.famous.length = 0; };
  People.get = (id) => People.map.get(id);
  People.age = (P) => (P.died !== null ? P.died : year()) - P.born;
  People.ph = (P, k) => AG.Life.express(P.gen, 0, k); // phenotype of a locus
  People.adult = (P) => People.age(P) >= AG.SPECIES[0].adult;

  // ------------------------------------------------------------ creation
  // o: { sex, born, gen, comm, mom, dad, name, adult }
  People.create = function (o) {
    const id = People.nextId++;
    const gen = o.gen || new Uint8Array(GL);
    const P = {
      id, name: o.name || '', sex: o.sex === undefined ? (rnd() < 0.5 ? 0 : 1) : o.sex, born: o.born === undefined ? year() : o.born, died: null, cause: '',
      gen, comm: o.comm === undefined ? -1 : o.comm, body: -1, x: o.x || 0, y: o.y || 0, lastSeen: 0,
      mom: o.mom || 0, dad: o.dad || 0, spouse: 0, kids: [], spouses: [],
      pers: { open: 0.5, consc: 0.5, extra: 0.5, agree: 0.5, neuro: 0.5 },
      traits: 0, tastes: new Int8Array(NT), skills: new Uint8Array(NS),
      needs: { food: 1, rest: 1, social: 0.7, safety: 1, purpose: 0.6 },
      emo: { joy: 0.3, grief: 0, fear: 0, anger: 0, love: 0, stress: 0.1 },
      belief: { faith: -1, devotion: 0.3, tradition: 0.5, loyalty: 0.6, myths: [] },
      job: J.CHILD, goal: -1, plan: '', mem: [], ties: new Map(), story: [],
      hp: 1, parts: new Float32Array(6), chronic: [], frail: 0, mental: { trauma: 0, depressed: 0 }, addict: 0, disabled: 0,
      preg: null, lastBirth: -99, nutr: 1, dis: 0, dtm: 0, imm: 0,
      fame: 0, wealth: 0, rank: 0, kills: 0, invented: [], visited: 1, flags: 0, energy: 1,
    };
    const mom = o.mom ? People.get(o.mom) : null, dad = o.dad ? People.get(o.dad) : null;
    temperament(P, mom, dad);
    if (o.comm >= 0 && AG.Civ) {
      const c = AG.Civ.cities[o.comm];
      if (c) { if (!P.name) P.name = AG.Lang.personName(c.lang, P.sex); P.belief.faith = c.religion; P.belief.tradition = c.tradition !== undefined ? AG.clamp(c.tradition + (rnd() - 0.5) * 0.3, 0, 1) : 0.5; }
    }
    if (!P.name) P.name = AG.Lang ? AG.Lang.personName(-1, P.sex) : 'Nameless';
    if (mom) { mom.kids.push(id); mom.lastBirth = year(); }
    if (dad) dad.kids.push(id);
    if (o.adult) { // founders arrive grown, with a working life behind them
      P.job = J.GATHER;
      for (let k = 0; k < NS; k++) P.skills[k] = (10 + rnd() * 30) | 0;
      pickGoal(P);
    }
    People.map.set(id, P); People.alive++;
    return P;
  };

  // Personality: part genes (cognition -> openness, sociality -> extraversion and agreeableness,
  // boldness -> calm), part parents, part chance. Traits and tastes follow from it.
  function temperament(P, mom, dad) {
    const ph = (k) => People.ph(P, k) / 255, n = () => (rnd() - 0.5) * 0.35;
    const pa = (k) => (mom && dad ? (mom.pers[k] + dad.pers[k]) / 2 : mom ? mom.pers[k] : dad ? dad.pers[k] : 0.5);
    const p = P.pers;
    p.open = AG.clamp(0.15 + ph(L.COGN) * 0.45 + pa('open') * 0.2 + n(), 0, 1);
    p.extra = AG.clamp(ph(L.SOCIAL) * 0.55 + pa('extra') * 0.2 + 0.12 + n(), 0, 1);
    p.agree = AG.clamp(0.35 + (ph(L.SOCIAL) - ph(L.BOLD)) * 0.35 + pa('agree') * 0.2 + n(), 0, 1);
    p.neuro = AG.clamp(0.65 - ph(L.BOLD) * 0.45 + pa('neuro') * 0.15 + n(), 0, 1);
    p.consc = AG.clamp(0.4 + pa('consc') * 0.2 + n() * 1.3, 0, 1);
    let t = 0;
    const g = (k) => People.ph(P, k);
    if (g(L.BOLD) > 178 || p.neuro < 0.15) t |= TR.brave; else if (g(L.BOLD) < 70 || p.neuro > 0.85) t |= TR.coward;
    if (p.agree > 0.76) t |= TR.kind; else if (p.agree < 0.18 && rnd() < 0.7) t |= TR.cruel;
    if (p.agree < 0.35 && p.consc > 0.6 && rnd() < 0.4) t |= TR.greedy;
    if (p.open > 0.74) t |= TR.curious;
    if (p.extra > 0.7 && p.consc > 0.6 && rnd() < 0.6) t |= TR.ambitious;
    if (g(L.COGN) > 214) t |= TR.genius;
    if (g(L.SIZE) > 216) t |= TR.giant;
    if (g(L.SPEED) > 212) t |= TR.swift;
    if (g(L.IMMUNE) < 52) t |= TR.sickly;
    if (g(L.FERT) > 212) t |= TR.fertile;
    if (g(L.LIFE) > 214) t |= TR.longlived;
    if (AG.Life.isAlbino(P.gen, 0)) t |= TR.albino;
    if (p.extra > 0.62 && p.open > 0.6 && rnd() < 0.35) t |= TR.storyteller;
    if (p.extra < 0.18) t |= TR.loner;
    if (rnd() < 0.08 + (mom && mom.traits & TR.pious ? 0.25 : 0)) t |= TR.pious;
    P.traits = t;
    // tastes: temperament, family and chance
    const tz = P.tastes, par = mom || dad;
    for (let k = 0; k < NT; k++) tz[k] = AG.clamp(((rnd() - 0.5) * 90 + (par ? par.tastes[k] * 0.35 : 0)) | 0, -100, 100);
    const bump = (k, v) => (tz[k] = AG.clamp(tz[k] + v, -100, 100));
    bump(5, (g(L.BOLD) - 128) * 0.4); bump(11, (g(L.BOLD) - 140) * 0.45); bump(20, (p.extra - 0.5) * 90);
    bump(23, (p.open - 0.5) * 110); bump(15, (p.open - 0.45) * 80); bump(13, (p.extra - 0.4) * 60);
    if (t & TR.pious) bump(12, 60);
    if (t & TR.loner) bump(20, -60);
    P.belief.devotion = AG.clamp(0.2 + (t & TR.pious ? 0.5 : 0) + (rnd() - 0.5) * 0.3, 0, 1);
  }
  People.hasTrait = (P, k) => (P.traits & TR[k]) !== 0;
  People.addTrait = (P, k) => { if (P.traits & TR[k]) return false; P.traits |= TR[k]; return true; };
  function pickGoal(P) {
    const t = P.traits, w = [3, 1, 1, 1, 1, 0.4, 1, 0.5];
    if (t & TR.kind) w[0] += 2; if (t & TR.greedy) w[1] += 3; if (t & TR.brave) w[2] += 3; if (t & TR.curious) { w[3] += 2; w[7] += 2.5; }
    if (t & TR.pious) w[4] += 3; if (t & TR.ambitious) w[5] += 4; if (t & TR.genius) { w[6] += 2; w[7] += 2; }
    let s = 0; for (const v of w) s += v;
    let r = rnd() * s;
    for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) { P.goal = k; return; } }
    P.goal = 0;
  }
  People.likes = (P, n) => Array.from(P.tastes).map((v, k) => [k, v]).filter((e) => e[1] >= 40).sort((a, b) => b[1] - a[1]).slice(0, n || 4).map((e) => AG.TASTES[e[0]]);
  People.dislikes = (P, n) => Array.from(P.tastes).map((v, k) => [k, v]).filter((e) => e[1] <= -40).sort((a, b) => a[1] - b[1]).slice(0, n || 3).map((e) => AG.TASTES[e[0]]);
  People.taste = (P, k, d) => { if (k >= 0) P.tastes[k] = AG.clamp(P.tastes[k] + d, -100, 100); };
  People.similarity = function (A, B) { let s = 0; for (let k = 0; k < NT; k++) s += A.tastes[k] * B.tastes[k]; return s / (NT * 4000); };

  // ------------------------------------------------------------ relationships
  const TIE = { FAMILY: 1, FRIEND: 2, RIVAL: 4, LOVER: 8, SPOUSE: 16, MENTOR: 32, STUDENT: 64, ENEMY: 128 };
  People.TIE = TIE;
  People.tie = function (P, oid) {
    let t = P.ties.get(oid);
    if (!t) {
      if (P.ties.size >= 24) prune(P);
      t = { k: 0, trust: 0, aff: 0, debt: 0, since: year(), n: 0 };
      P.ties.set(oid, t);
    }
    return t;
  };
  function prune(P) {
    let worst = null, wv = 1e9;
    for (const [id, t] of P.ties) { const v = Math.abs(t.aff) + Math.abs(t.trust) + (t.k & (TIE.FAMILY | TIE.SPOUSE) ? 9 : 0); if (v < wv) { wv = v; worst = id; } }
    if (worst !== null) P.ties.delete(worst);
  }
  People.feel = function (P, Q, aff, trust) { // P's view of Q changes
    if (!P || !Q || P === Q) return null;
    // a full circle of acquaintance only admits someone who made a real impression
    if (P.ties.size >= 24 && !P.ties.has(Q.id) && Math.abs(aff) < 0.15 && Math.abs(trust || 0) < 0.15) return null;
    const t = People.tie(P, Q.id);
    t.aff = AG.clamp(t.aff + aff, -1, 1); t.trust = AG.clamp(t.trust + (trust || 0), -1, 1); t.n++;
    if (t.aff > 0.55 && !(t.k & TIE.FAMILY)) { if (!(t.k & TIE.FRIEND)) { t.k |= TIE.FRIEND; t.k &= ~TIE.RIVAL; People.remember(P, MK.FRIEND, { who: Q.id, v: 0.5, s: 0.4 }); } }
    else if (t.aff < -0.5) { if (!(t.k & TIE.RIVAL)) { t.k |= TIE.RIVAL; t.k &= ~TIE.FRIEND; People.remember(P, MK.QUARREL, { who: Q.id, v: -0.5, s: 0.4 }); } if (t.aff < -0.85) t.k |= TIE.ENEMY; }
    return t;
  };
  People.isKin = function (a, b) {
    if (!a || !b) return false;
    if (a.mom && (a.mom === b.mom || a.mom === b.id)) return true;
    if (a.dad && (a.dad === b.dad || a.dad === b.id)) return true;
    if (b.mom === a.id || b.dad === a.id) return true;
    return false; // cousins may marry (most early peoples allowed it; tiny bands depend on it)
  };
  People.marry = function (A, B) {
    if (!A || !B || A.spouse || B.spouse || A.died !== null || B.died !== null || A === B) return false;
    A.spouse = B.id; B.spouse = A.id; A.spouses.push(B.id); B.spouses.push(A.id);
    for (const [P, Q] of [[A, B], [B, A]]) { const t = People.tie(P, Q.id); t.k |= TIE.SPOUSE; t.aff = Math.max(t.aff, 0.5); t.trust = Math.max(t.trust, 0.4); P.emo.love = 1; P.emo.joy = Math.min(1, P.emo.joy + 0.5); }
    People.remember(A, MK.MARRIED, { who: B.id, v: 0.8, s: 1, core: true }); People.remember(B, MK.MARRIED, { who: A.id, v: 0.8, s: 1, core: true });
    return true;
  };

  // ------------------------------------------------------------ memory
  // m: { t, k, who, x, y, v (valence -1..1), s (salience), d (detail), sec (heard from), dist (distorted), core }
  People.remember = function (P, k, o) {
    if (!P || P.died !== null) return null;
    o = o || {};
    const m = { t: o.t === undefined ? year() : o.t, k, who: o.who || 0, x: o.x === undefined ? P.x : o.x, y: o.y === undefined ? P.y : o.y, v: o.v || 0, s: o.s === undefined ? 0.5 : o.s, d: o.d || '', sec: o.sec || 0, dist: 0, core: !!o.core };
    if (P.mem.length >= 24) { let wi = -1, wv = 9; for (let q = 0; q < P.mem.length; q++) { const x = P.mem[q]; const v = x.s + (x.core ? 2 : 0); if (v < wv) { wv = v; wi = q; } } if (wi >= 0 && wv < m.s + (m.core ? 2 : 0)) P.mem.splice(wi, 1); else return null; }
    P.mem.push(m);
    // feelings follow
    const e = P.emo, mag = Math.abs(m.v) * (0.6 + P.pers.neuro * 0.6);
    if (m.v > 0) e.joy = Math.min(1, e.joy + mag * 0.5); else { e.stress = Math.min(1, e.stress + mag * 0.3); }
    if (k === MK.GRIEF || k === MK.WIDOWED) e.grief = Math.min(1, e.grief + 0.8);
    if (k === MK.HURT || k === MK.BETRAYED || k === MK.KILLED) e.anger = Math.min(1, e.anger + 0.6);
    if (k === MK.DISASTER || k === MK.QUAKE || k === MK.ERUPTION || k === MK.FLOOD || k === MK.WAR || k === MK.INJURED) { e.fear = Math.min(1, e.fear + 0.5); if (m.v < -0.6) P.mental.trauma = Math.min(1, P.mental.trauma + 0.2); }
    if (m.who) {
      const Q = People.get(m.who);
      if (Q) {
        if (k === MK.HURT || k === MK.BETRAYED || k === MK.KILLED) People.feel(P, Q, -0.6, -0.6);  // a grudge
        else if (k === MK.SAVED || k === MK.GIFT || k === MK.TAUGHT) People.feel(P, Q, 0.4, 0.5); // gratitude
      }
    }
    if (o.story !== false && (m.core || Math.abs(m.v) >= 0.7)) P.story.push({ t: m.t, k, who: m.who, d: m.d });
    if (P.story.length > 40) P.story.splice(1, 1);
    return m;
  };
  const nm = (id) => { const Q = People.get(id); return Q ? Q.name : 'someone'; };
  People.nm = nm;
  const place = (m) => (AG.Civ ? AG.Civ.placeName(m.x, m.y) : '');
  People.memText = function (P, m) {
    const w = m.who ? nm(m.who) : '', d = m.d;
    let s;
    switch (m.k) {
      case MK.BORN: s = `Born${d ? ' in ' + d : ''}`; break;
      case MK.CHILD: s = `Became a parent: ${w}`; break;
      case MK.MARRIED: s = `Married ${w}`; break;
      case MK.GRIEF: s = `Mourned ${w}${d ? ', taken by ' + d : ''}`; break;
      case MK.WIDOWED: s = `Was widowed when ${w} died${d ? ' of ' + d : ''}`; break;
      case MK.HURT: s = `Was hurt by ${w}${d ? ' (' + d + ')' : ''}`; break;
      case MK.KILLED: s = `Saw ${w} kill ${d || 'one of their own'}`; break;
      case MK.SAVED: s = `Was saved by ${w}`; break;
      case MK.FAMINE: s = `Went hungry in the famine${d ? ' of ' + d : ''}`; break;
      case MK.DISASTER: s = `Survived ${d || 'a disaster'}`; break;
      case MK.QUAKE: s = `Felt the earth shake${d ? ': ' + d : ''}`; break;
      case MK.ERUPTION: s = `Saw the mountain burn${d ? ': ' + d : ''}`; break;
      case MK.FLOOD: s = `Lost land to the rising water${d ? ' at ' + d : ''}`; break;
      case MK.WAR: s = `Fought ${d || 'in a war'}`; break;
      case MK.VICTORY: s = `Rejoiced in victory${d ? ' at ' + d : ''}`; break;
      case MK.DEFEAT: s = `Suffered defeat${d ? ' at ' + d : ''}`; break;
      case MK.MIGRATED: s = `Moved with the band${d ? ' to ' + d : ''}`; break;
      case MK.FOUNDED: s = `Helped found ${d}`; break;
      case MK.INVENTED: s = `Discovered ${d}`; break;
      case MK.LEARNED: s = `Learned ${d}${w ? ' from ' + w : ''}`; break;
      case MK.TAUGHT: s = `Was taught by ${w}${d ? ': ' + d : ''}`; break;
      case MK.OMEN: s = `Witnessed an omen${d ? ': ' + d : ''}`; break;
      case MK.DREAM: s = `Dreamed ${d}`; break;
      case MK.MIRACLE: s = `Witnessed a miracle${d ? ': ' + d : ''}`; break;
      case MK.FRIEND: s = `Became friends with ${w}`; break;
      case MK.QUARREL: s = `Fell out with ${w}`; break;
      case MK.BETRAYED: s = `Was betrayed by ${w}`; break;
      case MK.GIFT: s = `Received a gift from ${w}`; break;
      case MK.HUNT: s = d || 'Had a great hunt'; break;
      case MK.INJURED: s = `Injured ${d}`; break;
      case MK.ILL: s = `Fell ill with ${d}`; break;
      case MK.RECOVERED: s = `Recovered from ${d}`; break;
      case MK.RULER: s = `Became ${d}`; break;
      case MK.EXILE: s = `Left home${d ? ' for ' + d : ''}`; break;
      case MK.ROMANCE: s = `Fell for ${w}`; break;
      case MK.GOAL: s = `Fulfilled a life's dream: ${d}`; break;
      case MK.PLAGUE: s = `Lived through the ${d}`; break;
      case MK.CAME_OF_AGE: s = 'Came of age'; break;
      case MK.LOST_HOME: s = `Lost their home${d ? ' to ' + d : ''}`; break;
      default: s = d || 'Something happened';
    }
    if (m.sec) s = `Heard from ${nm(m.sec)} that someone ${s.charAt(0).toLowerCase() + s.slice(1)}`;
    return s;
  };

  // ------------------------------------------------------------ health
  People.injure = function (P, part, sev, cause, by) {
    if (part < 0) part = (rnd() * 6) | 0;
    P.parts[part] = Math.min(1, P.parts[part] + sev);
    P.hp = Math.max(0, P.hp - sev * (part === 0 || part === 1 ? 0.5 : 0.25));
    People.remember(P, MK.INJURED, { who: by || 0, v: -0.6 * sev - 0.2, s: 0.5 + sev * 0.4, d: `${PARTS[part]}${cause ? ' (' + cause + ')' : ''}` });
    if (sev > 0.85 && part >= 2 && rnd() < 0.35 && !(P.disabled & (1 << part))) { P.disabled |= 1 << part; P.story.push({ t: year(), k: MK.INJURED, d: `lost the use of the ${PARTS[part]}` }); }
    if (by) { const Q = People.get(by); if (Q) People.feel(P, Q, -0.5, -0.5); }
  };
  People.health = function (P) { // 0..1 overall
    let inj = 0; for (let k = 0; k < 6; k++) inj += P.parts[k] * (k < 2 ? 1.5 : 0.7);
    return AG.clamp(P.hp * (1 - Math.min(0.8, inj * 0.25)) * (1 - P.frail * 0.5), 0, 1);
  };
  People.speedMul = (P) => (P.disabled & 48 ? 0.6 : 1) * (1 - Math.max(P.parts[4], P.parts[5]) * 0.5) * (1 - P.frail * 0.35);
  People.workMul = (P) => (P.disabled & 12 ? 0.6 : 1) * (1 - Math.max(P.parts[2], P.parts[3]) * 0.5) * (1 - P.frail * 0.4) * (0.6 + 0.4 * P.nutr);

  // ------------------------------------------------------------ death
  People.die = function (P, cause, killer) {
    if (!P || P.died !== null) return;
    P.died = year(); P.cause = cause || 'unknown causes';
    People.alive--; People.deaths++;
    const age = Math.floor(People.age(P));
    const by = killer ? People.get(killer) : null;
    // family and friends remember
    const mourners = new Set([P.spouse, P.mom, P.dad, ...P.kids]);
    for (const [id, t] of P.ties) if (t.aff > 0.4) mourners.add(id);
    for (const id of mourners) {
      const Q = People.get(id); if (!Q || Q.died !== null) continue;
      if (id === P.spouse) { Q.spouse = 0; People.remember(Q, MK.WIDOWED, { who: P.id, v: -0.9, s: 1, d: cause, core: true }); }
      else People.remember(Q, MK.GRIEF, { who: P.id, v: -0.7, s: 0.8, d: cause });
      if (by && by !== Q) { People.feel(Q, by, -0.8, -0.8); People.remember(Q, MK.KILLED, { who: by.id, v: -0.8, s: 0.9, d: P.name }); }
    }
    if (AG.Civ) AG.Civ.onPersonDeath(P, cause, by);
    if (P.body >= 0 && AG.Ent) { const b = P.body; P.body = -1; AG.Ent.remove(b, true); }
    if (P.fame > 6 || P.rank >= 2) People.famous.push(P.id);
    People.dead.push(P.id);
    if (People.dead.length > 14000) prune2();
    P.story.push({ t: year(), k: -1, d: `Died at ${age}${cause ? ', ' + cause : ''}` });
    // the dead keep their family and their defining memories; the rest is forgotten with them
    for (const [id, t] of P.ties) if (!(t.k & (TIE.FAMILY | TIE.SPOUSE))) P.ties.delete(id);
    if (P.mem.length > 6) P.mem = P.mem.filter((m) => m.core).slice(-6);
    if (P.story.length > 16) P.story = P.story.slice(0, 2).concat(P.story.slice(-14));
    P.needs = null; P.emo = null; P.preg = null;
  };
  // keep the family tree but forget distant, unremarkable dead
  function prune2() {
    const keep = new Set();
    for (const P of People.map.values()) if (P.died === null) { keep.add(P.mom); keep.add(P.dad); const m = People.get(P.mom), d = People.get(P.dad); for (const g of [m, d]) if (g) { keep.add(g.mom); keep.add(g.dad); } }
    const out = [];
    for (const id of People.dead) { const P = People.get(id); if (!P) continue; if (keep.has(id) || P.fame > 4 || P.rank >= 2) out.push(id); else People.map.delete(id); }
    People.dead = out;
  }

  // ------------------------------------------------------------ births
  People.conceive = function (M, F) {
    if (!M || !F || M.preg) return false;
    if (!AG.Life.canMate(M.gen, 0, F.gen, 0)) return false; // the mate-recognition locus decides
    const g = new Uint8Array(GL);
    AG.Life.breed(g, 0, M.gen, 0, F.gen, 0, AG.rnd, M.flags & 1 ? 1.6 : 1);
    M.preg = { t: 0, father: F.id, gen: g };
    return true;
  };
  People.birth = function (M) {
    const pr = M.preg; M.preg = null;
    if (!pr) return null;
    const c = AG.Civ.cities[M.comm];
    const med = c && AG.Tech.knows(c, 'medicine') ? 0.4 : c && AG.Tech.knows(c, 'herbal') ? 0.75 : 1;
    // childbirth was dangerous for mothers and infants alike
    if (rnd() < 0.012 * med * (1.4 - M.nutr * 0.5)) { People.die(M, 'childbirth'); if (rnd() < 0.5) return null; }
    const K = People.create({ gen: pr.gen, comm: M.comm, mom: M.id, dad: pr.father, x: M.x, y: M.y });
    People.births++;
    const F = People.get(pr.father);
    for (const Q of [M, F]) {
      if (!Q || Q.died !== null) continue;
      People.remember(Q, MK.CHILD, { who: K.id, v: 0.8, s: 0.9, core: true });
      const t = People.tie(Q, K.id); t.k |= TIE.FAMILY; t.aff = 0.8;
      const u = People.tie(K, Q.id); u.k |= TIE.FAMILY; u.aff = 0.7; u.trust = 0.7;
    }
    People.remember(K, MK.BORN, { v: 0.2, s: 0.6, d: c ? c.name : '', core: true, story: true });
    if (c) AG.Civ.addMember(c, K);
    if (F && F.died === null && M.died === null && F.spouse !== M.id && !M.spouse && !F.spouse) People.marry(M, F);
    return K;
  };

  // ------------------------------------------------------------ yearly life (both LOD modes)
  // dy years pass for everyone in community c. nutr = how well the community ate (0..1).
  People.yearStep = function (c, dy, nutr) {
    const y = year(), mem = c.members;
    const medicine = AG.Tech.knows(c, 'medicine') ? 0.6 : AG.Tech.knows(c, 'herbal') ? 0.8 : 1;
    // factors that depend only on dy, computed once per community
    const heal = Math.pow(0.25, dy * (AG.Tech.knows(c, 'herbal') ? 1.4 : 1)), f = Math.pow(0.45, dy), fl = Math.pow(0.8, dy), ft = Math.pow(0.9, dy);
    const dec = [], DEC = 11; for (let k = 0; k < DEC; k++) dec.push(Math.pow(0.9, dy * (1 - (k / (DEC - 1)) * 0.6)));
    const brewing = AG.Tech.knows(c, 'brewing'), nutrK = Math.min(1, dy * 2), adultAge = AG.SPECIES[0].adult;
    for (let q = mem.length - 1; q >= 0; q--) {
      const P = People.get(mem[q]);
      if (!P || P.died !== null) { mem.splice(q, 1); continue; }
      const age = y - P.born;
      P.nutr += (nutr - P.nutr) * nutrK;
      // pregnancy runs its course (nine months)
      if (P.preg) { P.preg.t += dy; if (P.preg.t >= 0.75) { People.birth(P); if (P.died !== null) continue; } }
      // mortality: infancy, accidents and senescence; hunger, frailty, injury and illness add to it
      const life = 0.85 + People.ph(P, L.LIFE) / 255 * 0.3 + (P.traits & TR.longlived ? 0.15 : 0);
      const infant = 0.11 * Math.exp(-age * 1.1) * medicine;
      const sen = 0.00022 * Math.exp((0.085 / life) * age);
      const hunger = Math.pow(Math.max(0, 0.6 - P.nutr) / 0.6, 2) * 0.4;
      let injury = 0; for (let k = 0; k < 2; k++) injury += P.parts[k] > 0.7 ? 0.15 * medicine : 0;
      const sick = P.dis ? diseaseHazard(P) * medicine : 0;
      const h = infant + 0.003 + sen * (1 + P.frail) + hunger + injury + sick + (P.traits & TR.sickly ? 0.006 : 0);
      // (hunger only kills when people are really starving; mild want lowers fertility instead)
      if (rnd() < 1 - Math.exp(-h * dy)) {
        const parts = [[infant, 'a fever in infancy'], [sen + 0.004, age > 55 ? 'old age' : 'an accident'], [hunger, 'hunger'], [injury, 'wounds'], [sick, P.dis ? AG.DISEASES[P.dis - 1].name : 'illness']];
        parts.sort((a, b) => b[0] - a[0]);
        People.die(P, parts[0][1]); continue;
      }
      if (P.dis) { P.dtm += dy * 40; const D = AG.DISEASES[P.dis - 1]; if (!D || P.dtm > (D.incubation + D.duration)) { if (D) { P.imm |= 1 << (P.dis - 1); People.remember(P, MK.RECOVERED, { v: 0.3, s: 0.4, d: D.name }); } P.dis = 0; } }
      // bodies heal, age and wear
      for (let k = 0; k < 6; k++) P.parts[k] *= heal;
      P.hp = Math.min(1, P.hp + dy * 0.8);
      if (age > 42) P.frail = Math.min(1, P.frail + dy * 0.012 / life);
      if (age > 50 && rnd() < dy * 0.01 && !P.chronic.includes('aching joints')) P.chronic.push('aching joints');
      if (c.sedentary && age > 30 && rnd() < dy * 0.004 && !P.chronic.includes('smoke cough')) P.chronic.push('smoke cough');
      if (brewing && P.tastes[4] > 30 && P.pers.neuro > 0.6 && rnd() < dy * 0.01) { P.addict = Math.min(1, P.addict + 0.3); if (P.addict > 0.5 && !P.chronic.includes('drink')) P.chronic.push('drink'); }
      // feelings return to baseline
      const e = P.emo;
      e.joy = 0.3 + (e.joy - 0.3) * f; e.grief *= f; e.fear *= f; e.anger *= f; e.love *= fl;
      e.stress = AG.clamp(e.stress * f + (1 - P.nutr) * 0.2 * Math.min(1, dy) + P.mental.trauma * 0.05, 0, 1);
      P.mental.trauma *= ft;
      if (e.stress > 0.65 && e.joy < 0.3) P.mental.depressed = Math.min(1, P.mental.depressed + dy * 0.3); else P.mental.depressed = Math.max(0, P.mental.depressed - dy * 0.4);
      // memories fade unless they were strong; old ones drift (a staggered pass every few years)
      P._acc = (P._acc || 0) + dy;
      const slow = P._acc >= 3 || dy >= 3;
      if (slow) {
        const k4 = Math.max(1, Math.round(P._acc / dy));
        for (let k = P.mem.length - 1; k >= 0; k--) {
          const m = P.mem[k];
          if (!m.core) m.s *= Math.pow(dec[Math.min(DEC - 1, (Math.abs(m.v) * (DEC - 1)) | 0)], k4);
          if (m.s < 0.05 && !m.core) { P.mem.splice(k, 1); continue; }
          if (y - m.t > 5 && rnd() < P._acc * 0.03) misremember(P, m);
        }
      }
      // growing up
      if (P.job === J.CHILD && age >= adultAge) {
        P.job = J.GATHER; pickGoal(P);
        People.remember(P, MK.CAME_OF_AGE, { v: 0.4, s: 0.5 });
      }
      if (slow) { if (age < adultAge) learnFromParents(P, P._acc); else learnByDoing(P, P._acc, c); P._acc = 0; }
    }
    social(c, dy);
    couples(c, dy);
  };
  function diseaseHazard(P) { const D = AG.DISEASES[P.dis - 1]; if (!D) return 0; return D.lethality * 1.2 * (1.3 - People.ph(P, L.IMMUNE) / 255); }
  function misremember(P, m) {
    if (m.dist > 2) return;
    const r = rnd();
    if (r < 0.4) { m.x += (rnd() - 0.5) * 24; m.y += (rnd() - 0.5) * 24; m.dist++; }
    else if (r < 0.7) { m.v = AG.clamp(m.v * 1.3, -1, 1); m.dist++; }
    else if (m.who) { const Q = People.get(m.who); const rel = Q ? [Q.mom, Q.dad, Q.spouse, ...Q.kids].filter(Boolean) : []; if (rel.length) { m.who = rel[(rnd() * rel.length) | 0]; m.dist++; } }
  }
  People.misremember = misremember;
  function learnFromParents(P, dy) {
    const mom = People.get(P.mom), dad = People.get(P.dad);
    const k = Math.min(1, dy * 0.12) * (0.5 + People.ph(P, L.COGN) / 255);
    for (let s = 0; s < NS; s++) {
      const t = Math.max(mom ? mom.skills[s] : 0, dad ? dad.skills[s] : 0) * 0.5;
      if (P.skills[s] < t) P.skills[s] += Math.ceil((t - P.skills[s]) * k);
    }
  }
  const JOB_SKILL = [-1, SK.GATHER, SK.FARM, SK.CRAFT, SK.CRAFT, SK.BUILD, SK.FIGHT, SK.LORE, SK.LORE, SK.HUNT, SK.GATHER, SK.HERD, SK.CRAFT, SK.CRAFT];
  People.JOB_SKILL = JOB_SKILL;
  function learnByDoing(P, dy, c) {
    const s = JOB_SKILL[P.job]; if (s < 0) return;
    const rate = dy * (2 + People.ph(P, L.COGN) / 255 * 4) * (P.traits & TR.genius ? 2 : 1) * (1 + P.tastes[AG.JOB_TASTE[P.job]] / 200 || 1);
    P.skills[s] = Math.min(100, P.skills[s] + Math.round(rate * (1 - P.skills[s] / 120)));
    if (P.skills[s] > 80 && P.goal === 6 && !P.goalDone) goalDone(P, `mastery of ${AG.SKILLS[s].toLowerCase()}`);
    if (People.age(P) > 55 && P.skills[SK.LORE] < 90) P.skills[SK.LORE] = Math.min(100, P.skills[SK.LORE] + Math.ceil(dy * 2));
  }
  function goalDone(P, what) { P.goalDone = true; P.fame += 1; People.remember(P, MK.GOAL, { v: 0.9, s: 1, d: what, core: true }); }
  People.goalDone = goalDone;

  // Friendships and quarrels from everyday contact; rumours ride along.
  function social(c, dy) {
    const mem = c.members, n = mem.length;
    if (n < 2) return;
    const rounds = Math.min(n * 3, Math.ceil(n * Math.min(2, dy * 0.7)));
    for (let r = 0; r < rounds; r++) {
      const A = People.get(mem[(rnd() * n) | 0]), B = People.get(mem[(rnd() * n) | 0]);
      if (!A || !B || A === B || A.died !== null || B.died !== null) continue;
      if (rnd() > 0.25 + A.pers.extra * 0.75) continue;
      People.interact(A, B, 0.6);
    }
  }
  // One meeting between two people: liking follows shared tastes and temperament.
  People.interact = function (A, B, w) {
    const sim = People.similarity(A, B);
    const warmth = (A.pers.agree + B.pers.agree - 1) * 0.25 + sim * 0.6 + (rnd() - 0.5) * 0.4;
    const envy = (A.traits & TR.greedy && B.wealth > A.wealth + 2) || (A.traits & TR.ambitious && B.rank > A.rank) ? -0.15 : 0;
    const cruel = A.traits & TR.cruel ? -0.1 : 0;
    People.feel(A, B, (warmth + envy + cruel) * 0.25 * w, warmth * 0.15 * w);
    People.feel(B, A, (warmth + (B.traits & TR.cruel ? -0.1 : 0)) * 0.25 * w, warmth * 0.15 * w);
    A.needs.social = Math.min(1, A.needs.social + 0.2); B.needs.social = Math.min(1, B.needs.social + 0.2);
    // rumour: a vivid memory passes on, sometimes changed in the telling
    if (rnd() < 0.15 + (A.traits & TR.storyteller ? 0.3 : 0)) {
      const m = A.mem.length ? A.mem[(rnd() * A.mem.length) | 0] : null;
      if (m && !m.sec && Math.abs(m.v) > 0.5 && !B.mem.some((x) => x.t === m.t && x.k === m.k && x.who === m.who)) {
        const h = People.remember(B, m.k, { t: m.t, who: m.who, x: m.x, y: m.y, v: m.v * 0.6, s: m.s * 0.5, d: m.d, sec: A.id, story: false });
        if (h && rnd() < 0.3) misremember(B, h);
        if (h && m.who && (m.k === MK.HURT || m.k === MK.KILLED || m.k === MK.BETRAYED)) { const Q = People.get(m.who); if (Q) People.feel(B, Q, -0.2, -0.2); } // grudges spread
      }
    }
    // a teacher and a learner
    if (People.age(A) > 35 && People.age(B) < 30 && rnd() < 0.2) {
      const s = (rnd() * NS) | 0;
      if (A.skills[s] > B.skills[s] + 20) { B.skills[s] += 3; const t = People.tie(B, A.id); t.k |= TIE.MENTOR; const u = People.tie(A, B.id); u.k |= TIE.STUDENT; }
    }
  };

  // Courtship and marriage: unmarried adults choose among compatible, unrelated people they like.
  function couples(c, dy) {
    const y = year();
    const single = [];
    for (const id of c.members) {
      const P = People.get(id);
      if (!P || P.spouse || P.died !== null) continue;
      const a = y - P.born; if (a < 16 || a > 55) continue;
      single.push(P);
    }
    if (single.length >= 2) {
      for (const P of single) {
        if (P.spouse || rnd() > Math.min(1, dy * 0.6)) continue;
        let best = null, bv = -1;
        for (let t = 0; t < 6; t++) {
          const Q = single[(rnd() * single.length) | 0];
          if (Q === P || Q.spouse || Q.sex === P.sex || People.isKin(P, Q)) continue;
          if (!AG.Life.canMate(P.gen, 0, Q.gen, 0)) continue;
          const tie = P.ties.get(Q.id);
          const v = (tie ? tie.aff : 0) + People.similarity(P, Q) + 0.4 - Math.abs((y - P.born) - (y - Q.born)) / 30 + rnd() * 0.3;
          if (v > bv) { bv = v; best = Q; }
        }
        if (best && bv > 0.2) People.marry(P, best);
      }
    }
    // conception: married women, spaced births (longer for nomads who carry their children).
    // Above the world's budget of simulated individuals, fertility eases off (a performance cap).
    const space = c.sedentary ? 1.8 : 3.0;
    const budget = People.budget || 14000, over = People.alive > budget * 0.8 ? AG.clamp(1 - (People.alive - budget * 0.8) / (budget * 0.4), 0.05, 1) : 1;
    for (const id of c.members) {
      const M = People.get(id);
      if (!M || M.sex !== 0 || !M.spouse || M.preg || M.died !== null) continue;
      const a = y - M.born; if (a < 16 || a > 44 || y - M.lastBirth < space) continue;
      const F = People.get(M.spouse); if (!F || F.died !== null || F.comm !== M.comm) continue;
      const fert = (People.ph(M, L.FERT) + People.ph(F, L.FERT)) / 510 + (M.traits & TR.fertile ? 0.25 : 0) - (M.traits & TR.cursed ? 0.5 : 0);
      const p = 0.85 * (0.5 + fert) * AG.clamp((M.nutr - 0.6) / 0.35, 0, 1) * (c.crowded ? 0.35 : 1) * over;
      if (dy < 1.5) { if (rnd() < Math.min(1, p * dy)) People.conceive(M, F); continue; }
      // a long stride: as many pregnancies as the years allow, each born before the next begins
      let t = Math.max(0, M.lastBirth + space - (y - dy)), born = 0;
      while (t < dy && M.died === null && born < 4) {
        const wait = -Math.log(1 - rnd()) / Math.max(1e-6, p);
        t += wait; if (t + 0.75 > dy) break;
        if (!People.conceive(M, F)) break;
        People.birth(M); born++;
        M.lastBirth = y - dy + t + 0.75; t += 0.75 + space;
      }
    }
  }

  // ------------------------------------------------------------ story
  People.title = function (P) {
    if (!P) return '';
    if (P.rank >= 3) return P.sex ? 'King' : 'Queen';
    if (P.rank === 2) return 'Chief';
    if (P.rank === 1) return 'Elder';
    if (P.traits & TR.hero) return 'Hero';
    return '';
  };
  // A short biography from the record: origins, family, character, defining memories, fate.
  People.biography = function (P) {
    const he = P.sex ? 'he' : 'she', his = P.sex ? 'his' : 'her', He = P.sex ? 'He' : 'She';
    const c = AG.Civ.cities[P.comm], age = Math.floor(People.age(P));
    const born = P.story.find((s) => s.k === MK.BORN);
    const parents = [P.mom, P.dad].map(People.get).filter(Boolean);
    const out = [];
    out.push(`${P.name} was born ${born && born.d ? 'in ' + born.d + ' ' : ''}in ${AG.Geo.label ? 'year ' + Math.floor(P.born + 1).toLocaleString('en-US') : ''}${parents.length ? ', the child of ' + parents.map((q) => q.name).join(' and ') : ''}.`);
    const tr = TRAITS.filter((t) => P.traits & t.bit).slice(0, 3).map((t) => t.name.toLowerCase());
    const likes = People.likes(P, 2), hates = People.dislikes(P, 1);
    out.push(`${He} grew up ${tr.length ? tr.join(', ') : 'quiet'}${likes.length ? `, fond of ${likes.join(' and ')}` : ''}${hates.length ? ` and wary of ${hates[0]}` : ''}.`);
    const notable = P.story.filter((s) => s.k !== MK.BORN && s.k !== -1).slice(-6);
    for (const s of notable) out.push(sentence(P, s, he, his, He));
    if (P.died !== null) out.push(`${He} died in year ${Math.floor(P.died + 1).toLocaleString('en-US')}, aged ${age}${P.cause ? ', of ' + P.cause : ''}.`);
    else out.push(`${He} is ${age}, ${AG.JOBS[P.job].toLowerCase()}${c ? ' of ' + c.name : ''}${P.goal >= 0 && !P.goalDone ? `, still hoping to ${AG.GOALS[P.goal].toLowerCase()}` : ''}.`);
    return out.join(' ');
  };
  function sentence(P, s, he, his, He) {
    const w = s.who ? nm(s.who) : '';
    switch (s.k) {
      case MK.MARRIED: return `${He} married ${w}.`;
      case MK.CHILD: return `${He} had a child, ${w}.`;
      case MK.WIDOWED: return `${He} lost ${his} spouse ${w}.`;
      case MK.INVENTED: return `${He} discovered ${s.d}.`;
      case MK.FOUNDED: return `${He} helped found ${s.d}.`;
      case MK.RULER: return `${He} became ${s.d}.`;
      case MK.GOAL: return `${He} achieved ${s.d}.`;
      case MK.INJURED: return `${He} was injured: ${s.d}.`;
      case MK.WAR: return `${He} fought ${s.d}.`;
      case MK.MIGRATED: return `${He} journeyed${s.d ? ' to ' + s.d : ''}.`;
      case MK.QUAKE: case MK.ERUPTION: case MK.FLOOD: case MK.DISASTER: return `${He} survived ${s.d || 'a disaster'}.`;
      default: { const t = People.memText(P, { k: s.k, who: s.who, d: s.d }); return `${t}.`; }
    }
  }

  // Embodied: needs drift tick by tick (the brain in ai.js acts on them).
  People.tickNeeds = function (P, dt) {
    const n = P.needs;
    n.food = Math.max(0, n.food - dt * 0.9);
    const night = AG.Sky.daylight() < 0.25;
    n.rest = AG.clamp(n.rest - dt * (night ? 1.4 : 0.5), 0, 1);
    n.social = Math.max(0, n.social - dt * (0.3 + P.pers.extra * 0.7));
    n.purpose = Math.max(0, n.purpose - dt * 0.4);
    n.safety = Math.min(1, n.safety + dt * 2);
  };
  People.mood = (P) => AG.clamp(0.5 + P.emo.joy * 0.5 - P.emo.grief * 0.5 - P.emo.stress * 0.4 - P.emo.fear * 0.3 - P.mental.depressed * 0.3 + (P.needs.food - 0.5) * 0.3, 0, 1);
})();
