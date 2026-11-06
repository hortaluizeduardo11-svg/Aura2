/* AURA: Genesis 2 — history.js
 * The historical record and time itself as data.
 *  - Events: every chronicle entry carries a kind, a place, the people and polities involved and
 *    a cause ("famine — the land around is spent"), so the timeline can explain itself.
 *  - Snapshots: the whole world state captured exactly (typed arrays, records, random streams).
 *    They power save/load files, counterfactual branches and the determinism tests.
 *  - Branches: "what if this invention never happened?" restores the last snapshot before it,
 *    bans the invention in that branch and lets history run again. The old timeline is kept.
 *  - Replay: the seed plus a log of god actions, time-mode changes and camera-driven LOD changes
 *    reproduces a session exactly. */
'use strict';
(function () {
  const AG = window.AG;
  const History = (AG.History = { events: [], log: [], snaps: [], branches: [], eraMaps: [], nextId: 1, replaying: false, lastSnapYear: -1e9 });
  const SNAP_EVERY = 500, SNAP_KEEP = 5;
  const year = () => (AG.Geo.phase === 'deep' ? AG.Geo.myr * 1e6 - 1e10 : AG.Geo.year); // deep-time events sort before the Dawn
  const CHRON = { invention: 'culture', era: 'culture', loss: 'fall', famine: 'plague', plague: 'plague', war: 'war', raid: 'war', battle: 'war', conquest: 'war', march: 'war', peace: 'peace', alliance: 'peace', faith: 'faith', trade: 'trade', government: 'crown', ruler: 'crown', death: 'death', hero: 'hero', fall: 'fall', collapse: 'fall', rebellion: 'war', settle: 'found', dawn: 'found', migration: 'found', flood: 'disaster', quake: 'disaster', eruption: 'disaster', tsunami: 'disaster', language: 'culture', speciation: 'info', extinction: 'fall', domestication: 'culture', institution: 'crown', reform: 'crown', law: 'crown', abandoned: 'fall', god: 'info', omen: 'faith' };

  History.reset = function () { deadCopies.clear(); History.pending = null; History.events.length = 0; History.log.length = 0; History.snaps.length = 0; History.eraMaps.length = 0; History.nextId = 1; History.lastSnapYear = -1e9; };

  // ------------------------------------------------------------ events
  const MAJOR = new Set(['genesis', 'dawn', 'era', 'government', 'war', 'conquest', 'fall', 'collapse', 'faith', 'language', 'flood', 'eruption', 'tsunami', 'law', 'domestication', 'settle']);
  History.event = function (kind, text, o) {
    o = o || {};
    text = text.replace(/\b([Tt]he) the\b/g, '$1'); // polity names that already begin with 'the'
    const e = { id: History.nextId++, year: year(), cal: AG.calYear ? AG.calYear(null) : 0, tick: AG.tick, kind, text, x: o.x === undefined ? -1 : o.x, y: o.y === undefined ? -1 : o.y, cause: o.cause || '', polity: o.polity === undefined ? -1 : o.polity, comm: o.comm === undefined ? -1 : o.comm, person: o.person || 0, tech: o.tech || '', first: !!o.first, era: o.era, lang: o.lang };
    History.events.push(e);
    if (History.events.length > 4000) { // forget the oldest minor events first; the turning points stay
      let drop = 500;
      History.events = History.events.filter((ev) => { if (drop > 0 && !(MAJOR.has(ev.kind) && (ev.kind !== 'era' || ev.first))) { drop--; return false; } return true; });
      if (History.events.length > 4000) History.events.splice(0, 500);
    }
    AG.Chronicle.add(text + (e.cause && kind !== 'invention' ? ` — ${e.cause}` : ''), CHRON[kind] || 'info', e.x, e.y);
    if (kind === 'era' && e.first && AG.onEraMap) AG.onEraMap(e);
    return e;
  };
  History.byKind = (k) => History.events.filter((e) => e.kind === k);
  // Era bands per polity for the timeline: [{polity, from, to, era}]
  History.eraBands = function () {
    const out = [];
    for (const e of History.events) if (e.kind === 'era') out.push({ year: e.year, era: e.era, comm: e.comm, text: e.text });
    return out;
  };

  // ------------------------------------------------------------ action log (replay)
  History.record = function (kind, data) { if (!History.replaying) History.log.push({ tick: AG.tick, year: year(), mode: AG.mode, kind, data }); };
  History.lod = function (kind, cid) { History.record('lod', { k: kind, c: cid }); };

  // ------------------------------------------------------------ snapshots
  // Deep copies for snapshots: the browser's structuredClone, or (headless, where it would copy
  // across V8 realms) a plain recursive copy of typed arrays, Maps, Sets, arrays and objects.
  function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map(deepClone);
    if (v instanceof Map) { const m = new Map(); for (const [k, x] of v) m.set(k, deepClone(x)); return m; }
    if (v instanceof Set) return new Set([...v].map(deepClone));
    const o = {}; for (const k in v) o[k] = deepClone(v[k]); return o;
  }
  const native = typeof structuredClone === 'function' && !(window.AG_CONFIG && window.AG_CONFIG.headless);
  const clone = (v) => (native ? structuredClone(v) : deepClone(v));
  const WORLD_FIELDS = () => Object.keys(AG.World).filter((k) => ArrayBuffer.isView(AG.World[k]));
  // Volatile caches are reset at every capture (in the live world too) so a restored copy and
  // the original continue identically.
  function normalize() {
    AG.Flow.cache.clear();
    if (AG.Physics.normalize) AG.Physics.normalize();
  }
  // People for a snapshot. The living are copied; the dead almost never change, so each dead
  // record is copied once and that copy is shared by every later snapshot (it is copied again
  // only if a posthumous child, rank or fame changes it). Restoring always copies afresh.
  const deadCopies = new Map();
  // The copying is planned, done (in slices if need be), then assembled: the browser spreads a
  // snapshot over several frames while the simulation waits; tests and saves do it at once.
  const sigOf = (P) => P.kids.length * 10000 + P.rank * 1000 + Math.round(P.fame);
  function peoplePlan() {
    const out = [], todo = [];
    for (const [id, P] of AG.People.map) {
      if (P.died !== null) { const c = deadCopies.get(id); if (c && c.sig === sigOf(P)) { out.push([id, c.rec]); continue; } }
      out.push([id, todo.length]); todo.push(P);
    }
    return { out, todo, copies: [], i: 0, n: 100 };
  }
  // Copied in batches whose size follows their cost (about 3 ms each), so no frame waits long.
  function peopleWork(plan, until) {
    while (plan.i < plan.todo.length) {
      const n = Math.min(plan.n, plan.todo.length - plan.i), a = AG.now(), part = clone(plan.todo.slice(plan.i, plan.i + n));
      for (let k = 0; k < part.length; k++) plan.copies.push(part[k]);
      plan.i += n;
      const t = AG.now() - a;
      if (t > 4 && plan.n > 25) plan.n >>= 1; else if (t < 1.5 && plan.n < 1600) plan.n <<= 1;
      if (AG.now() > until) break;
    }
    return plan.i >= plan.todo.length;
  }
  function peopleFinish(plan) {
    for (const e of plan.out) {
      if (typeof e[1] !== 'number') continue;
      const P = plan.todo[e[1]], copy = plan.copies[e[1]];
      e[1] = copy;
      if (P.died !== null) deadCopies.set(P.id, { sig: sigOf(P), rec: copy });
    }
    if (deadCopies.size > AG.People.map.size * 1.3 + 1000) for (const id of deadCopies.keys()) if (!AG.People.map.has(id)) deadCopies.delete(id);
    return plan.out;
  }
  function peopleEntries() { const plan = peoplePlan(); peopleWork(plan, Infinity); return peopleFinish(plan); }
  // A snapshot in progress (browser): History.snapWork(until) advances it; the sim waits meanwhile.
  History.pending = null;
  History.snapWork = function (until) {
    const p = History.pending; if (!p) return true;
    if (!p.stages) {
      if (!peopleWork(p.plan, until)) return false;
      p.snap = {}; p.stages = captureStages(p.snap, peopleFinish(p.plan)); p.si = 0;
      if (AG.now() > until) return false;
    }
    while (p.si < p.stages.length) { p.stages[p.si++](); if (AG.now() > until) break; }
    if (p.si < p.stages.length) return false;
    History.pending = null;
    pushSnap(p.year, p.tick, p.snap);
    return true;
  };
  History.flushSnap = function () { if (History.pending) History.snapWork(Infinity); };
  function pushSnap(year, tick, data) {
    History.snaps.push({ year, tick, data });
    if (History.snaps.length > SNAP_KEEP) History.snaps.splice(1, 1); // always keep the Dawn
  }
  // A snapshot is a list of small stages (each copies a piece of the world), so the browser can
  // spread one over several frames while the simulation waits; capture() runs them all at once.
  function captureStages(snap, entries) {
    const Wd = AG.World, Geo = AG.Geo, Life = AG.Life, U = AG.U, S = AG.Sky, Civ = AG.Civ;
    const st = [], chunks = (arr, n) => { const out = []; for (let k = 0; k < arr.length; k += n) out.push(arr.slice(k, k + n)); return out; };
    st.push(() => {
      normalize();
      for (const c of Civ.cities) if (c._ps) { c._ps = null; c._psT = -1; } // a per-tick cache of members: never worth copying
      Object.assign(snap, { v: 2, seed: AG.seed, tick: AG.tick, mode: AG.mode, year: year(), rng: { core: AG.rndState(), geo: Geo.rng ? Geo.rng.get() : 0, life: Life.rng ? Life.rng.get() : 0 } });
      snap.world = {}; snap.worldMisc = clone({ springs: Wd.springs, vents: Wd.vents, epoch: Wd.epoch });
    });
    for (const k of WORLD_FIELDS()) st.push(() => { snap.world[k] = Wd[k].slice(); });
    st.push(() => {
      const geo = {}; for (const k of ['plate', 'crust', 'age', 'rock', 'strain', 'magma', 'orog', 'bound', 'precip', 'temp', 'ice', 'acc', 'organic', 'evap', 'wetFloor', 'lith']) geo[k] = Geo[k].slice();
      const gs = {}; for (const k of ['phase', 'myr', 'dawnMyr', 'year', 'quakes', 'eruptions', 'splits', 'sutures', 'iceVol', 'seaLevel', 'applied', 'dawnSea', 'dawnAnomaly', 'shift', 'seed', 'stepN', 'scripted', 'lostCont', 'seaShifts']) gs[k] = Geo[k];
      snap.geo = geo; snap.geoScalars = gs;
      snap.geoObj = clone({ plates: Geo.plates, hotspots: Geo.hotspots, volcanoes: Geo.volcanoes.map((v) => Object.assign({}, v)), climate: Geo.climate, events: Geo.events.slice(-60) });
    });
    const spParts = [];
    for (const part of chunks(Life.species, 3)) st.push(() => { spParts.push(clone(part)); });
    st.push(() => { snap.life = Object.assign(clone({ extinctions: Life.extinctions, speciations: Life.speciations, massExtinctions: Life.massExtinctions, macro: Life.macro || 0, people: Life.people ? Life.people.id : -1, envYear: Life.envYear, env: Life.env }), { species: [].concat(...spParts) }); });
    st.push(() => {
      snap.people = Object.assign(clone({ alive: AG.People.alive, nextId: AG.People.nextId, births: AG.People.births, deaths: AG.People.deaths, dead: AG.People.dead, famous: AG.People.famous, pruneAt: AG.People.pruneAt }), { entries: entries || peopleEntries() });
      snap.sim = { stripe: AG.Sim ? AG.Sim.stripe : 0, geoSeen: AG.Sim ? Math.max(0, AG.Sim.geoSeen - Math.max(0, Geo.events.length - 60)) : 0 }; // geo events keep their last 60
      snap.lang = clone({ list: AG.Lang.list, splits: AG.Lang.splits, changes: AG.Lang.changes });
      snap.tech = clone({ banned: [...AG.Tech.banned], firsts: AG.Tech.firsts, discoveries: AG.Tech.discoveries, losses: AG.Tech.losses });
    });
    const cityParts = [];
    for (const part of chunks(Civ.cities, 40)) st.push(() => { for (const c of part) if (c._ps) { c._ps = null; c._psT = -1; } cityParts.push(clone(part)); }); // (the UI may refill the cache between frames)
    const civParts = {}; // records refer to each other by id, so lists can be copied in pieces
    for (const [k, n] of [['kingdoms', 15], ['buildings', 150], ['religions', 30], ['squads', 60], ['routes', 150], ['expeditions', 60]]) {
      civParts[k] = [];
      for (const part of chunks(Civ[k], n)) st.push(() => { civParts[k].push(clone(part)); });
    }
    st.push(() => {
      snap.civ = Object.assign(clone({ contact: Civ.contact, embodied: Civ.embodied }), { cities: [].concat(...cityParts) });
      for (const k in civParts) snap.civ[k] = [].concat(...civParts[k]);
      snap.war = clone({ campaigns: AG.War.campaigns, battles: AG.War.battles });
      snap.ent = {};
    });
    for (const k of Object.keys(U)) if (ArrayBuffer.isView(U[k])) st.push(() => { snap.ent[k] = U[k].slice(0, k === 'gen' || k === 'fgen' ? U.hi * Life.GL : k === 'genes' ? U.hi * AG.NG : U.hi); });
    st.push(() => {
      normalize(); // again: the interface may have touched the caches while a snapshot was spread over frames
      snap.entMeta = Object.assign({ hi: U.hi, count: U.count }, AG.Ent.state());
      snap.sky = clone({ storms: S.storms, strikes: S.strikes, wind: S.wind, windTarget: S.windTarget, offX: S.offX, offY: S.offY, flash: S.flash, seasonT: S.seasonT, cloud: S.cloud, dark: S.dark, chunkT: S.chunkT, chunkRain: S.chunkRain });
      snap.physics = AG.Physics.state ? AG.Physics.state() : null;
      snap.diseases = clone(AG.DISEASES);
      snap.events = History.events.slice(-1500).map((e) => Object.assign({}, e)); snap.nextId = History.nextId;
      snap.god = AG.God.state ? AG.God.state() : null;
    });
    return st;
  }
  History.capture = function (entries) {
    if (!entries && History.pending) History.flushSnap(); // never mix a half-copied snapshot with a new one
    if (AG.Sim && AG.Sim.h) AG.Sim.finish(); // never capture half a step
    const snap = {};
    for (const f of captureStages(snap, entries)) f();
    return snap;
  };
  History.restore = function (s) {
    if (AG.Sim) AG.Sim.h = null; // a step in progress belongs to the timeline being left
    deadCopies.clear(); History.pending = null; // another timeline's dead may share ids with this one's
    const Wd = AG.World, Geo = AG.Geo, Life = AG.Life, U = AG.U;
    if (AG.God.possessed >= 0) AG.God.release();
    AG.seed = s.seed; AG.tick = s.tick; AG.mode = s.mode;
    if (!Geo.tilesFor || Geo.tilesFor !== s.seed) Geo.rebuildTiles(s.seed);
    for (const k in s.world) Wd[k].set(s.world[k]);
    const wm = clone(s.worldMisc); Wd.springs = wm.springs; Wd.vents = wm.vents; Wd.epoch = wm.epoch;
    for (const k in s.geo) Geo[k].set(s.geo[k]);
    Object.assign(Geo, s.geoScalars);
    const go = clone(s.geoObj); Geo.plates = go.plates; Geo.hotspots = go.hotspots; Geo.volcanoes = go.volcanoes; Geo.climate = go.climate; Geo.events = go.events;
    Geo.setRng(s.rng.geo); Life.setRng(s.rng.life); AG.setRndState(s.rng.core);
    const li = clone(s.life);
    Life.species = li.species; Life.extinctions = li.extinctions; Life.speciations = li.speciations; Life.massExtinctions = li.massExtinctions; Life.macro = li.macro;
    Life.people = li.people >= 0 ? Life.species[li.people] : null; Life.envYear = li.envYear;
    for (const k in li.env) { const v = li.env[k]; if (ArrayBuffer.isView(v)) Life.env[k].set(v); else Life.env[k] = v; }
    const pe = clone(s.people);
    AG.People.map = new Map(pe.entries); AG.People.alive = pe.alive; AG.People.nextId = pe.nextId; AG.People.births = pe.births; AG.People.deaths = pe.deaths; AG.People.dead = pe.dead; AG.People.famous = pe.famous; AG.People.pruneAt = pe.pruneAt || 14000;
    if (s.sim && AG.Sim) { AG.Sim.stripe = s.sim.stripe; AG.Sim.geoSeen = s.sim.geoSeen; }
    const la = clone(s.lang); AG.Lang.list = la.list; AG.Lang.splits = la.splits; AG.Lang.changes = la.changes;
    const te = clone(s.tech); AG.Tech.banned = new Set(te.banned); AG.Tech.firsts = te.firsts; AG.Tech.discoveries = te.discoveries; AG.Tech.losses = te.losses;
    const cv = clone(s.civ);
    AG.Civ.kingdoms = cv.kingdoms; AG.Civ.cities = cv.cities; AG.Civ.buildings = cv.buildings; AG.Civ.resetFree(); AG.Civ.religions = cv.religions; AG.Civ.squads = cv.squads; AG.Civ.routes = cv.routes; AG.Civ.expeditions = cv.expeditions; AG.Civ.contact.set(cv.contact); AG.Civ.embodied = cv.embodied;
    const wa = clone(s.war); AG.War.campaigns = wa.campaigns; AG.War.battles = wa.battles;
    for (const k of Object.keys(U)) if (ArrayBuffer.isView(U[k])) { U[k].fill(0); if (s.ent[k]) U[k].set(s.ent[k]); }
    U.hi = s.entMeta.hi; U.count = s.entMeta.count; AG.Ent.setState(s.entMeta);
    const sk = clone(s.sky), S = AG.Sky;
    S.storms = sk.storms; S.strikes = sk.strikes; S.wind = sk.wind; S.windTarget = sk.windTarget; S.offX = sk.offX; S.offY = sk.offY; S.flash = sk.flash; S.seasonT = sk.seasonT;
    for (const k of ['cloud', 'dark', 'chunkT', 'chunkRain']) if (sk[k] && S[k]) S[k].set(sk[k]);
    if (s.physics && AG.Physics.setState) AG.Physics.setState(s.physics);
    AG.DISEASES.splice(0, AG.DISEASES.length, ...clone(s.diseases));
    History.events = s.events.map((e) => Object.assign({}, e)); History.nextId = s.nextId;
    if (s.god && AG.God.setState) AG.God.setState(s.god);
    AG.Flow.cache.clear(); AG.Proj.reset && AG.Proj.reset();
    Wd.dirty.fill(1); Wd.udirty.fill(1);
    AG.Civ.recomputeBorders();
    if (AG.Render && AG.Render.reset) AG.Render.reset();
    if (AG.View3D && AG.View3D.reset) AG.View3D.reset();
  };

  // ------------------------------------------------------------ periodic snapshots
  History.yearTick = function () {
    if (AG.Geo.phase !== 'history' || History.replaying) return;
    if (AG.Geo.year - History.lastSnapYear >= SNAP_EVERY) {
      History.lastSnapYear = AG.Geo.year;
      if (AG.asyncSnaps && AG.mode === 'history') History.pending = { year: AG.Geo.year, tick: AG.tick, plan: peoplePlan() }; // copied over the next frames
      else pushSnap(AG.Geo.year, AG.tick, History.capture());
    }
  };

  // ------------------------------------------------------------ branches
  // "What if this never happened": rewind to the last snapshot before the event, ban the
  // invention in this branch, and continue. The current timeline is kept as a branch.
  History.whatIf = function (eventId) {
    const e = History.events.find((x) => x.id === eventId);
    if (!e || !e.tech) return { ok: false, why: 'Only inventions can be undone.' };
    const snap = History.snaps.slice().reverse().find((s) => s.year < e.year - 0.5);
    if (!snap) return { ok: false, why: 'No saved moment from before that event.' };
    History.branches.push({ label: `Timeline at ${AG.calText(AG.Geo.year)}`, year: AG.Geo.year, data: History.capture() });
    if (History.branches.length > 4) History.branches.shift();
    History.restore(snap.data);
    AG.Tech.banned.add(e.tech);
    History.snaps = History.snaps.filter((s) => s.year <= snap.year);
    History.lastSnapYear = snap.year;
    const t = AG.Tech.LIST[AG.Tech.IDX[e.tech]];
    History.event('god', `History rewinds to ${AG.calText(snap.year)}. In this world, ${t.name.toLowerCase()} will never be discovered.`, { cause: 'counterfactual' });
    History.record('branch', { ban: e.tech, from: snap.year });
    return { ok: true, year: snap.year, tech: t.name };
  };
  History.switchBranch = function (k) {
    const b = History.branches[k]; if (!b) return false;
    const here = { label: `Timeline at ${AG.calText(AG.Geo.year)}${AG.Tech.banned.size ? ' (without ' + [...AG.Tech.banned].map((x) => AG.Tech.LIST[AG.Tech.IDX[x]].name.toLowerCase()).join(', ') + ')' : ''}`, year: AG.Geo.year, data: History.capture() };
    History.branches.splice(k, 1, here);
    History.restore(b.data);
    History.lastSnapYear = AG.Geo.year;
    return true;
  };

  // ------------------------------------------------------------ files
  // Typed arrays, Maps and Sets survive JSON as tagged base64 / entry lists.
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64enc(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 3) {
      const a = u8[i], b = u8[i + 1], c = u8[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? B64[n & 63] : '=');
    }
    return s;
  }
  const REV = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) REV[B64.charCodeAt(i)] = i;
  function b64dec(s) {
    const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0, n = (s.length / 4) * 3 - pad, out = new Uint8Array(n);
    for (let i = 0, j = 0; i < s.length; i += 4) {
      const v = (REV[s.charCodeAt(i)] << 18) | (REV[s.charCodeAt(i + 1)] << 12) | ((REV[s.charCodeAt(i + 2)] & 63) << 6) | (REV[s.charCodeAt(i + 3)] & 63);
      if (j < n) out[j++] = (v >> 16) & 255; if (j < n) out[j++] = (v >> 8) & 255; if (j < n) out[j++] = v & 255;
    }
    return out;
  }
  const TYPES = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray };
  function pack(v) {
    if (ArrayBuffer.isView(v)) return { $ta: v.constructor.name, d: b64enc(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, pack(x)]) };
    if (v instanceof Set) return { $set: [...v].map(pack) };
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = pack(v[k]); return o; }
    return v;
  }
  function unpack(v) {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      if (v.$ta) { const u = b64dec(v.d), T = TYPES[v.$ta]; return new T(u.buffer, 0, u.byteLength / T.BYTES_PER_ELEMENT); }
      if (v.$map) return new Map(v.$map.map(([k, x]) => [k, unpack(x)]));
      if (v.$set) return new Set(v.$set.map(unpack));
      const o = {}; for (const k in v) o[k] = unpack(v[k]); return o;
    }
    return v;
  }
  History.serialize = function () { return JSON.stringify({ aura: 'genesis2', saved: year(), snap: pack(History.capture()), log: History.log }); };
  History.deserialize = function (text) {
    const f = JSON.parse(text);
    if (f.aura !== 'genesis2') throw new Error('Not an AURA: Genesis 2 save');
    if (AG.W !== f.snap.world.elev.d.length * 3 / 4 / 4 / AG.H && false) throw new Error('World size differs');
    const s = unpack(f.snap);
    if (s.world.elev.length !== AG.N) throw new Error(`This save is for a ${Math.round(Math.sqrt(s.world.elev.length))}-wide world; open it in a window of the same shape.`);
    History.restore(s);
    History.log = f.log || [];
    History.snaps = [{ year: AG.Geo.year, tick: AG.tick, data: History.capture() }];
    History.lastSnapYear = AG.Geo.year;
    return true;
  };
  History.b64enc = b64enc; History.b64dec = b64dec; History.pack = pack; History.unpack = unpack;
})();
