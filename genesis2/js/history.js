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
  const SNAP_EVERY = 500, SNAP_KEEP = 6;
  const year = () => (AG.Geo.phase === 'deep' ? -AG.Geo.mya * 1e6 : AG.Geo.year);
  const CHRON = { invention: 'culture', era: 'culture', loss: 'fall', famine: 'plague', plague: 'plague', war: 'war', raid: 'war', battle: 'war', conquest: 'war', march: 'war', peace: 'peace', alliance: 'peace', faith: 'faith', trade: 'trade', government: 'crown', ruler: 'crown', death: 'death', hero: 'hero', fall: 'fall', collapse: 'fall', rebellion: 'war', settle: 'found', dawn: 'found', migration: 'found', flood: 'disaster', quake: 'disaster', eruption: 'disaster', tsunami: 'disaster', language: 'culture', speciation: 'info', extinction: 'fall', domestication: 'culture', institution: 'crown', reform: 'crown', law: 'crown', abandoned: 'fall', god: 'info', omen: 'faith' };

  History.reset = function () { History.events.length = 0; History.log.length = 0; History.snaps.length = 0; History.eraMaps.length = 0; History.nextId = 1; History.lastSnapYear = -1e9; };

  // ------------------------------------------------------------ events
  History.event = function (kind, text, o) {
    o = o || {};
    const e = { id: History.nextId++, year: year(), tick: AG.tick, kind, text, x: o.x === undefined ? -1 : o.x, y: o.y === undefined ? -1 : o.y, cause: o.cause || '', polity: o.polity === undefined ? -1 : o.polity, comm: o.comm === undefined ? -1 : o.comm, person: o.person || 0, tech: o.tech || '', first: !!o.first, era: o.era, lang: o.lang };
    History.events.push(e);
    if (History.events.length > 4000) History.events.splice(0, 500);
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
  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const WORLD_FIELDS = () => Object.keys(AG.World).filter((k) => ArrayBuffer.isView(AG.World[k]));
  // Volatile caches are reset at every capture (in the live world too) so a restored copy and
  // the original continue identically.
  function normalize() {
    AG.Flow.cache.clear();
    if (AG.Physics.normalize) AG.Physics.normalize();
  }
  History.capture = function () {
    normalize();
    const Wd = AG.World, Geo = AG.Geo, Life = AG.Life, U = AG.U;
    const world = {}; for (const k of WORLD_FIELDS()) world[k] = Wd[k].slice();
    const geo = {}; for (const k of ['plate', 'crust', 'age', 'rock', 'strain', 'magma', 'orog', 'bound', 'precip', 'temp', 'ice', 'acc', 'organic', 'evap', 'wetFloor', 'lith']) geo[k] = Geo[k].slice();
    const gs = {}; for (const k of ['phase', 'mya', 'year', 'quakes', 'eruptions', 'splits', 'sutures', 'iceVol', 'seaLevel', 'applied', 'dawnSea', 'dawnAnomaly', 'shift', 'seed', 'stepN', 'scripted', 'lostCont', 'seaShifts']) gs[k] = Geo[k];
    const ent = {}; for (const k of Object.keys(U)) if (ArrayBuffer.isView(U[k])) ent[k] = U[k].slice(0, k === 'gen' || k === 'fgen' ? U.hi * Life.GL : k === 'genes' ? U.hi * AG.NG : U.hi);
    const S = AG.Sky;
    return {
      v: 2, seed: AG.seed, tick: AG.tick, mode: AG.mode, year: year(),
      rng: { core: AG.rndState(), geo: Geo.rng ? Geo.rng.get() : 0, life: Life.rng ? Life.rng.get() : 0 },
      world, worldMisc: clone({ springs: Wd.springs, vents: Wd.vents, epoch: Wd.epoch }),
      geo, geoScalars: gs, geoObj: clone({ plates: Geo.plates, hotspots: Geo.hotspots, volcanoes: Geo.volcanoes.map((v) => Object.assign({}, v)), climate: Geo.climate, events: Geo.events.slice(-60) }),
      life: clone({ species: Life.species, extinctions: Life.extinctions, speciations: Life.speciations, massExtinctions: Life.massExtinctions, macro: Life.macro || 0, people: Life.people ? Life.people.id : -1, envYear: Life.envYear, env: Life.env }),
      people: clone({ entries: [...AG.People.map.entries()], alive: AG.People.alive, nextId: AG.People.nextId, births: AG.People.births, deaths: AG.People.deaths, dead: AG.People.dead, famous: AG.People.famous }),
      lang: clone({ list: AG.Lang.list, splits: AG.Lang.splits, changes: AG.Lang.changes }),
      tech: clone({ banned: [...AG.Tech.banned], firsts: AG.Tech.firsts, discoveries: AG.Tech.discoveries, losses: AG.Tech.losses }),
      civ: clone({ kingdoms: AG.Civ.kingdoms, cities: AG.Civ.cities, buildings: AG.Civ.buildings, religions: AG.Civ.religions, squads: AG.Civ.squads, routes: AG.Civ.routes, expeditions: AG.Civ.expeditions, contact: AG.Civ.contact, embodied: AG.Civ.embodied }),
      war: clone({ campaigns: AG.War.campaigns, battles: AG.War.battles }),
      ent, entMeta: Object.assign({ hi: U.hi, count: U.count }, AG.Ent.state()),
      sky: clone({ storms: S.storms, strikes: S.strikes, wind: S.wind, windTarget: S.windTarget, offX: S.offX, offY: S.offY, flash: S.flash, seasonT: S.seasonT, cloud: S.cloud, dark: S.dark, chunkT: S.chunkT, chunkRain: S.chunkRain }),
      physics: AG.Physics.state ? AG.Physics.state() : null,
      diseases: clone(AG.DISEASES),
      events: History.events.slice(-1500).map((e) => Object.assign({}, e)), nextId: History.nextId,
      god: AG.God.state ? AG.God.state() : null,
    };
  };
  History.restore = function (s) {
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
    AG.People.map = new Map(pe.entries); AG.People.alive = pe.alive; AG.People.nextId = pe.nextId; AG.People.births = pe.births; AG.People.deaths = pe.deaths; AG.People.dead = pe.dead; AG.People.famous = pe.famous;
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
      History.snaps.push({ year: AG.Geo.year, tick: AG.tick, data: History.capture() });
      if (History.snaps.length > SNAP_KEEP) History.snaps.splice(1, 1); // always keep the Dawn
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
    History.branches.push({ label: `Timeline at year ${Math.floor(AG.Geo.year + 1)}`, year: AG.Geo.year, data: History.capture() });
    if (History.branches.length > 4) History.branches.shift();
    History.restore(snap.data);
    AG.Tech.banned.add(e.tech);
    History.snaps = History.snaps.filter((s) => s.year <= snap.year);
    History.lastSnapYear = snap.year;
    const t = AG.Tech.LIST[AG.Tech.IDX[e.tech]];
    History.event('god', `History rewinds to year ${Math.floor(snap.year + 1)}. In this world, ${t.name.toLowerCase()} will never be discovered.`, { cause: 'counterfactual' });
    History.record('branch', { ban: e.tech, from: snap.year });
    return { ok: true, year: snap.year, tech: t.name };
  };
  History.switchBranch = function (k) {
    const b = History.branches[k]; if (!b) return false;
    const here = { label: `Timeline at year ${Math.floor(AG.Geo.year + 1)}${AG.Tech.banned.size ? ' (without ' + [...AG.Tech.banned].map((x) => AG.Tech.LIST[AG.Tech.IDX[x]].name.toLowerCase()).join(', ') + ')' : ''}`, year: AG.Geo.year, data: History.capture() };
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
