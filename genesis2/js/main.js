/* AURA: Genesis 2 — main.js
 * Boot and the frame loop for the three clocks:
 *   deep    — millions of years a second (Sim.deepStep), the fine map repainted a few times a second
 *   watch   — fixed-timestep ticks (AG.TPS × speed) for the bodies near the camera
 *   history — years a second in steps of Δ years, under a per-frame time budget
 * The camera's view sets Civ.focus, which decides which communities are embodied (LOD). */
'use strict';
(function () {
  const AG = window.AG, Sim = AG.Sim, R = AG.Render, Civ = AG.Civ, Geo = AG.Geo;
  const STEP = 1000 / AG.TPS;
  let BUDGET_MS = 14; // simulation time allowed per frame (AG.Perf lowers it so slow machines stay smooth)
  // speed buttons: watch speeds are tick multipliers; history speeds are years per second
  const HIST = { c: { rate: 20, dy: 1 }, m: { rate: 400, dy: 8 } };
  const DEEP_MYPS = 6; // million years per second in deep time
  AG.asyncSnaps = true; // snapshots are copied over several frames instead of freezing one
  AG.speed = 1; AG.paused = false; AG.throttled = false; AG.histRate = 20; AG.histDy = 1; AG.fastDawn = false;
  AG.stats = { fps: 60, simMs: 0, renderMs: 0, tps: 0, yps: 0, myps: 0 };
  let lastSpeed = '1';

  // ------------------------------------------------------------ loading screen and errors
  const $ = (q) => document.querySelector(q);
  const Loader = AG.Loader; // (screens.js: the starfield loading screen with the turning globe)
  const shown = new Set();
  function showError(e) {
    const msg = String((e && (e.stack || e.message)) || e).split('\n').slice(0, 6).join('\n');
    if (shown.has(msg)) return; shown.add(msg);
    const box = $('#errbox'); if (!box) return;
    $('#err-msg').textContent = msg + `\n(${navigator.userAgent})`;
    box.hidden = false;
  }
  AG.showError = showError;
  window.addEventListener('error', (ev) => showError(ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => showError(ev.reason));

  // ------------------------------------------------------------ performance
  // A governor keeps the picture smooth on any machine. It watches the real frame rate and steps
  // through four levels; each gives up things the eye misses least: first cosmetic weather and
  // far trees, then canvas resolution and simulation time per frame, finally the 3D close-up.
  // 'auto' adapts (starting from what the device reports); a fixed level can be chosen in World.
  const LEVELS = [
    { name: 'High', scale: 1, budget: 9, cosmetics: true, farEvery: 4, bodyK: 1, lod: 6000, allow3D: true, minQ: 0, minimap: 12, repaint: 250 },
    { name: 'Medium', scale: 1, budget: 7, cosmetics: false, farEvery: 4, bodyK: 0.8, lod: 4000, allow3D: true, minQ: 1, minimap: 24, repaint: 300 },
    { name: 'Low', scale: 0.75, budget: 6, cosmetics: false, farEvery: 8, bodyK: 0.55, lod: 2500, allow3D: true, minQ: 2, minimap: 40, repaint: 400 },
    { name: 'Minimum', scale: 0.5, budget: 5, cosmetics: false, farEvery: 8, bodyK: 0.35, lod: 1200, allow3D: false, minQ: 3, minimap: 60, repaint: 500 },
  ];
  const Perf = (AG.Perf = { mode: 'auto', level: 0, LEVELS, slow: 0, fast: 0, lastChange: 0, ceiling: 3, target: 60, frameMs: 1000 / 60 });
  const S = AG.Settings;
  // A level sets everything; a setting left on Auto follows it, a chosen one overrides it.
  function applyPerf() {
    const L = LEVELS[Perf.level], v = S.v;
    const pick = (k, auto) => (v[k] === 'on' ? true : v[k] === 'off' ? false : auto);
    // frame rate: Auto and 60 draw at most 60 pictures a second (a 120 Hz screen would double the
    // work for nothing); 30 saves battery; Display follows the screen
    Perf.target = v.fps === '30' ? 30 : 60;
    Perf.frameMs = v.fps === 'display' ? 0 : 1000 / Perf.target;
    BUDGET_MS = L.budget * (60 / Perf.target); // fewer, longer frames: the same share of each for the simulation
    R.perf.cosmetics = pick('weather', L.cosmetics); R.perf.animate = pick('water', Perf.level < 2);
    R.perf.minimapEvery = L.minimap; R.perf.shake = v.shake !== 'off';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    R.setScale(v.resolution === 'auto' ? L.scale : v.resolution === 'native' ? dpr : AG.clamp(+v.resolution || 1, 0.5, 1));
    AG.Physics.farEvery = L.farEvery; AG.Life.bodyK = L.bodyK; Civ.lodBudget = L.lod;
    if (AG.View3D) { AG.View3D.allowed = pick('view3d', L.allow3D); AG.View3D.minQuality = L.minQ; AG.View3D.fixQuality(v.detail3d === 'auto' ? null : +v.detail3d); AG.View3D.texturesWanted = pick('textures', true); if (AG.View3D.applyTextures) AG.View3D.applyTextures(); if (AG.View3D.setLook) AG.View3D.setLook(v.look || 'stylized'); }
    const root = document.documentElement.classList;
    root.toggle('perf-lean', Perf.level >= 2); root.toggle('no-vignette', v.vignette === 'off');
    root.toggle('no-ticker', v.ticker === 'off'); root.toggle('no-minimap', v.minimap === 'off'); root.toggle('show-fps', v.showFps === 'on');
    if (AG.UI && AG.UI.onPerf) AG.UI.onPerf();
  }
  Perf.set = function (mode) { S.set('quality', mode); };
  function qualityChanged() {
    const mode = S.v.quality;
    Perf.mode = mode === 'auto' ? 'auto' : String(AG.clamp(+mode || 0, 0, 3));
    if (Perf.mode !== 'auto') Perf.level = +Perf.mode;
    Perf.slow = Perf.fast = 0; Perf.lastChange = performance.now();
  }
  S.onChange((k) => { if (k === 'quality' || k === null) qualityChanged(); applyPerf(); });
  // per second: two slow seconds in a row step down; ten smooth ones step back up
  function governPerf(fps, now) {
    if (Perf.mode !== 'auto' || AG.fastDawn || AG.creating || document.hidden) return; // racing to the Dawn is slow on purpose
    const T = Perf.target;
    if (fps < T * 0.75) { Perf.slow++; Perf.fast = 0; } else if (fps > T * 0.95) { Perf.fast++; Perf.slow = 0; } else { Perf.slow = 0; Perf.fast = 0; }
    if (Perf.slow >= 2 && Perf.level < 3) { Perf.level++; Perf.slow = 0; Perf.lastChange = now; applyPerf(); }
    else if (Perf.fast >= 10 && Perf.level > 0 && now - Perf.lastChange > 15000) { Perf.level--; Perf.fast = 0; Perf.lastChange = now; applyPerf(); }
  }
  {
    const saved = S.v.quality;
    if (saved && saved !== 'auto') { Perf.mode = String(AG.clamp(+saved || 0, 0, 3)); Perf.level = +Perf.mode; }
    else Perf.level = AG.LOW_END ? 2 : (navigator.hardwareConcurrency || 8) <= 4 ? 1 : 0; // a head start from what the device reports
  }

  AG.setSpeed = function (s) {
    s = String(s);
    if (s === '0') { AG.paused = true; AG.UI.syncSpeed(); return; }
    AG.paused = false;
    if (Geo.phase === 'deep') { // before people: Ages, or the moment watched up close (no history yet)
      if (s === 'a') { if (AG.mode === 'watch') { Sim.resumeDeep(); R.bordersDirty = true; } }
      else if (!HIST[s]) {
        AG.speed = +s || 1; lastSpeed = s;
        if (AG.mode === 'deep') { setFocus(); Sim.watchDeep(); R.bordersDirty = true; if (!AG.creating && !AG.dinoBusy) AG.UI.toast(`Watching the ${AG.Life.periodName()} up close: zoom in to see its life. Ages carries on through time.`); }
      }
      AG.UI.syncSpeed(); return;
    }
    lastSpeed = s;
    if (HIST[s]) {
      AG.histRate = HIST[s].rate; AG.histDy = HIST[s].dy;
      if (AG.mode !== 'history') { Sim.setMode('history'); R.bordersDirty = true; }
    } else {
      AG.speed = +s || 1;
      if (AG.mode !== 'watch') { setFocus(); Sim.setMode('watch'); R.bordersDirty = true; }
    }
    AG.UI.syncSpeed();
  };
  AG.togglePause = function () { if (AG.paused) AG.setSpeed(AG.mode === 'deep' ? 'a' : lastSpeed); else AG.setSpeed('0'); };

  // Run the rest of deep time quickly but without freezing the page: a big slice each frame.
  AG.skipToDawn = function () { if (Geo.phase === 'deep' && AG.mode === 'watch') Sim.resumeDeep(); if (AG.mode === 'deep') { AG.fastDawn = true; AG.paused = false; Loader.show('Racing through the ages', 'Plates drift and species evolve until a lineage of primates becomes people.'); } };

  // ------------------------------------------------------------ moments of deep time
  // Once on its way deep time stops in the age of dinosaurs (the Jurassic, when the great ones have
  // evolved): the camera flies down to the biggest herd and the world runs at 1x, the dinosaurs
  // alive as bodies. Ages goes on toward the great asteroid, which is seen to fall.
  const DINOS = new Set(['early sauropod', 'sauropod', 'stegosaur', 'small ornithopod', 'duckbill', 'horned dinosaur', 'armoured dinosaur', 'early theropod', 'small raptor', 'raptor', 'great theropod', 'tyrant lizard']);
  AG.isDino = (name) => DINOS.has(name);
  function dinoSpot() {
    const Life = AG.Life, score = new Float32Array(Life.RN);
    let best = -1, bv = 0, kinds = new Set();
    for (const s of Life.alive()) {
      if (!DINOS.has(s.common)) continue;
      kinds.add(s.common);
      const w = (s.mean[Life.L.SIZE] > 170 ? 3 : 1) * (s.arch === Life.ARCH.PREDATOR ? 1.5 : 1);
      for (const [r, R] of s.regions) score[r] += Math.sqrt(R.n) * w;
    }
    for (let r = 0; r < Life.RN; r++) if (score[r] > bv && Life.env.land[r] > 0.6) { bv = score[r]; best = r; }
    return best < 0 || kinds.size < 2 ? null : { x: (best % Life.RW + 0.5) * Life.RS, y: (((best / Life.RW) | 0) + 0.5) * Life.RS, kinds: [...kinds] };
  }
  AG.dinoStop = function (force) {
    const Life = AG.Life, p = dinoSpot();
    if (!p) return false;
    AG.dinoSeen = true; AG.dinoBusy = true;
    R.jumpTo(p.x, p.y, 14); // (down into the 3D close-up: the animals are embodied around here)
    AG.setSpeed('1');
    AG.dinoBusy = false;
    // then to the thickest gathering of the big ones out in the open, where the canopy hides nothing
    { const U = AG.U, Wd = AG.World, SZ = Life.L.SIZE, cells = new Map(); let best = null, bw = 0;
      for (let i = 0; i < U.hi; i++) {
        if (!U.alive[i] || U.sid[i] < 0) continue;
        const s = Life.species[U.sid[i]]; if (!s || !DINOS.has(s.common)) continue;
        const j = (U.y[i] | 0) * AG.W + (U.x[i] | 0), k = ((U.y[i] / 10) | 0) * 4096 + ((U.x[i] / 10) | 0);
        const w = (s.mean[SZ] > 150 ? 3 : 1) * (s.arch === Life.ARCH.PREDATOR ? 2 : 1) * (Wd.veg[j] < 150 ? 1.6 : 0.5);
        const c = cells.get(k) || { w: 0, x: 0, y: 0 }; c.w += w; c.x += U.x[i] * w; c.y += U.y[i] * w; cells.set(k, c);
        if (c.w > bw) { bw = c.w; best = c; }
      }
      if (best) R.jumpTo(best.x / best.w, best.y / best.w, 18); }
    const names = p.kinds.slice(0, 5).map((k) => Life.plural(k));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    AG.History.event('genesis', `The Age of Dinosaurs: ${list} walk the land`, { x: p.x, y: p.y, cause: `${Math.round(Geo.myr)} million years of evolution` });
    if (AG.Deeds) AG.Deeds.note('dinos');
    if (!force) {
      Loader.show('The Age of Dinosaurs', `${Geo.label()}, the ${Life.periodName()}: ${list} walk the land. Watch them up close and use your powers; press Ages to go on toward the great asteroid.`);
      Loader.set(0.6);
      setTimeout(() => { try { R.prewarm(); } catch (e) { showError(e); } setTimeout(() => { try { AG.View3D.prewarm(); } catch (e) { /* 3D is optional */ } Loader.set(1, 'Ready'); Loader.hide(); setTimeout(() => AG.UI.toast('Creatures → Release sets down more dinosaurs; Destruction → Asteroid ends their age. Ages goes on.'), 1800); }, 30); }, 30);
    }
    return true;
  };
  function deepMoments() {
    const Life = AG.Life;
    if (AG.mode !== 'deep' || AG.fastDawn) return;
    if (!AG.dinoSeen && AG.Settings.v.dinoStop !== 'off' && !(AG.Title && AG.Title.on) && !AG.Demos._after && Geo.myr >= 66 && Geo.myr < Life.KPG_MYR && !Life.kpg) AG.dinoStop();
    if (Life.kpg && !AG.kpgSeen) { // the great asteroid: seen to fall on the land in view
      AG.kpgSeen = true;
      let x = R.cam.x, y = R.cam.y;
      for (let t = 0; t < 40; t++) { const qx = R.cam.x + (AG.rnd() - 0.5) * 120, qy = R.cam.y + (AG.rnd() - 0.5) * 80; if (qx > 20 && qy > 20 && qx < AG.W - 20 && qy < AG.H - 20) { x = qx; y = qy; break; } }
      AG.God.meteors.push({ x, y, t: 0, T: 70, r: 16, realTime: true, quiet: true });
      AG.UI.toast('A great asteroid strikes: the age of the dinosaurs ends in fire and a long winter.');
    }
  }

  AG.newWorld = function (seed) {
    AG.creating = true; AG.dinoSeen = false; AG.kpgSeen = false;
    Sim.newWorld(seed);
    AG.fastDawn = false; AG.paused = false;
    R.reset(); AG.View3D.reset(); AG.UI.reset();
    AG.UI.setOverlay('none');
    R.bordersDirty = true;
    AG.creating = false;
    AG.deepHold = 3; // a moment to see the newborn continent before the plates start to move
    AG.UI.syncSpeed();
    AG.UI.toast('Year 0: a new world is born, one great continent in a world ocean.');
  };

  // When the Dawn comes: watch the first band at its fire, speed 1.
  AG.onDawn = function (p) {
    AG.fastDawn = false;
    AG.UI.setOverlay('realms');
    const c = Civ.cities.find((q) => q.alive);
    if (c) R.centerOn(c.x, c.y, 8);
    setFocus();
    lastSpeed = '1'; AG.speed = 1;
    Sim.setMode('watch');
    R.bordersDirty = true; AG.World.dirty.fill(1);
    Loader.show('The first people appear', `${p.name}: speed up to Centuries or Millennia to watch history unfold.`);
    Loader.set(0.6);
    setTimeout(() => { try { R.prewarm(); Loader.set(0.85, 'Preparing the close-up'); } catch (e) { showError(e); } setTimeout(() => { try { AG.View3D.prewarm(); } catch (e) { /* 3D is optional */ } Loader.set(1, 'Ready'); Loader.hide(); }, 30); }, 30);
    AG.UI.syncSpeed();
  };

  // After loading a save or switching timelines: the bodies and the clock follow the records.
  AG.syncAfterLoad = function () {
    R.reset(); AG.View3D.reset();
    if (AG.mode === 'watch') { AG.Life.embody(); setFocus(); Civ.lod(); }
    AG.UI.setOverlay(AG.mode === 'deep' ? 'none' : 'realms');
    R.bordersDirty = true;
    AG.UI.syncSpeed();
  };

  // Spawn a large population of animals near the camera to exercise the watch-time engine.
  AG.stress = function (n) {
    if (AG.mode !== 'watch') AG.setSpeed('1');
    const { W, H, SP } = AG, Wd = AG.World;
    let made = 0, tries = 0;
    while (made < n && tries < n * 30) {
      tries++;
      const r = AG.rnd(), sp = r < 0.7 ? SP.GRAZER : r < 0.85 ? SP.PREDATOR : SP.BIRD;
      const x = AG.clamp(R.cam.x + (AG.rnd() - 0.5) * 200, 4, W - 5), y = AG.clamp(R.cam.y + (AG.rnd() - 0.5) * 130, 4, H - 5), i = (y | 0) * W + (x | 0);
      if (sp !== SP.BIRD && !Wd.passLand(i)) continue;
      if (AG.Ent.spawn(sp, x, y, { force: true }) >= 0) made++;
    }
    AG.UI.toast(`${made.toLocaleString('en-US')} creatures added near the camera. The World tab shows the engine's timings.`);
  };

  // The camera's visible rectangle (in cells) decides which communities are embodied.
  function setFocus() {
    const s = R.size(), a = R.screenToWorld(0, 0), b = R.screenToWorld(s.w, s.h);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    // zoomed far out, nothing is close enough to be worth embodying
    Civ.focus = R.cam.z < 1.6 ? null : { x0, y0, x1, y1 };
    AG.Life.bodyFocus = { x: R.cam.x, y: R.cam.y }; // (a big world embodies its animals around here)
  }

  // ------------------------------------------------------------ scenarios
  AG.Demos = {
    // From a few bands of hunter-gatherers to the first eras, at millennia a second.
    emergence() {
      AG.newWorld(1);
      AG.UI.toast('Emergence: deep time runs to the Dawn, then history at millennia a second. Watch the Chronicle.');
      AG.Demos._after = () => { AG.setSpeed('m'); AG.UI.setPanel(true); AG.UI.setTab('chronicle'); };
      AG.skipToDawn();
    },
    // The ice melts: the sea rises over the low coast where people live.
    risingSea() {
      const go = () => {
        let best = null, be = 1;
        for (const c of Civ.cities) {
          if (!c.alive) continue;
          const e = AG.World.elev[(c.y | 0) * AG.W + (c.x | 0)];
          if (e < be) { be = e; best = c; }
        }
        Geo.climate.carbon += 0.12; // a strong warming: the ice sheets collapse within a few thousand years
        AG.History.event('god', 'The world warms: the great ice sheets begin to fail', { cause: 'the Rising Sea scenario' });
        if (best) { R.centerOn(best.x, best.y, 4); AG.UI.select('city', best.id); }
        AG.UI.setOverlay('none');
        AG.setSpeed('m');
        AG.UI.toast(best ? `The sea is rising. ${best.name} sits lowest of all the camps; watch the coast.` : 'The sea is rising.');
      };
      if (AG.mode === 'deep') { AG.newWorld(3); AG.Demos._after = go; AG.skipToDawn(); } else go();
    },
    _after: null,
  };

  // ------------------------------------------------------------ the loop
  let errStreak = 0, rafLast = 0, rafEma = 1000 / 60, rafN = 0;
  let last = performance.now(), acc = 0, frames = 0, ticks = 0, years = 0, myr = 0, windowStart = last, errors = 0, lastPaint = 0, lodT = 0;
  function frame(now) {
    // frame-rate cap: draw on every n-th callback of the screen, n from the screen's own rate
    // (measured), so 120 Hz gives 60, 144 Hz gives 72 and a 60 or 90 Hz screen is left alone
    const rd = now - rafLast; rafLast = now;
    if (rd > 2 && rd < 60) rafEma += (rd - rafEma) * 0.05;
    if (Perf.frameMs) { const n = Math.max(1, Math.floor(Perf.frameMs / rafEma + 0.25)); if (++rafN % n) { requestAnimationFrame(frame); return; } }
    try {
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      const t0 = performance.now();
      AG.throttled = false;
      let stepped = false;
      if (AG.mode === 'deep') {
        if (!AG.paused || AG.fastDawn) {
          if (AG.fastDawn) { const y0 = Geo.myr; Sim.skipDeep(45); myr += Geo.myr - y0; if (AG.mode === 'deep') Loader.set(Math.min(0.95, Geo.myr / 260), `Racing through the ages · ${Geo.label()}`); }
          else if (AG.deepHold > 0) AG.deepHold -= dt / 1000;
          else {
            acc += (dt / 1000) * DEEP_MYPS * (AG.Title && AG.Title.on ? 0.3 : 1); // (slowly behind the title screen: the land drifts, the Dawn waits)
            // one geology step at most per frame (a step is the heaviest thing deep time does)
            if (acc >= Sim.DEEP_DT) { Sim.deepStep(); acc -= Sim.DEEP_DT; myr += Sim.DEEP_DT; stepped = true; deepMoments(); }
            if (acc > Sim.DEEP_DT * 2) acc = Sim.DEEP_DT * 2;
          }
        }
        // the next picture of the land is built off screen a few rows per frame (skipped on frames
        // that already ran a step); the map then morphs into it everywhere at once
        if (AG.mode === 'deep' && !stepped) R.deepFrame(Math.max(4, Math.ceil(AG.H * (dt / 1000) / (LEVELS[Perf.level].repaint / 500))));
        if (AG.mode !== 'deep') { acc = 0; if (AG.Demos._after && Geo.phase !== 'deep') { const f = AG.Demos._after; AG.Demos._after = null; f(); } }
      } else if (AG.mode === 'watch') {
        if (!AG.paused) acc += dt * AG.speed;
        let steps = 0;
        while (acc >= STEP) {
          Sim.tick(); acc -= STEP; steps++;
          if (performance.now() - t0 > BUDGET_MS) { AG.throttled = acc >= STEP; if (acc > STEP) acc = STEP; break; }
        }
        if (steps) AG.stats.simMs = AG.stats.simMs * 0.9 + ((performance.now() - t0) / steps) * 0.1;
        ticks += steps;
        if (now - lodT > 400) { setFocus(); Civ.lod(); if (R.cam.z >= 3) AG.Life.streamTo(R.cam.x, R.cam.y); lodT = now; }
        // the fluid simulation keeps full detail around what is on screen (two chunks of margin)
        { const sz = R.size(), a = R.screenToWorld(0, 0), b = R.screenToWorld(sz.w, sz.h), m = R.is3D() ? 6 : 2; const f = { cx0: Math.floor(Math.min(a.x, b.x) / 16) - m, cx1: Math.floor(Math.max(a.x, b.x) / 16) + m, cy0: Math.floor(Math.min(a.y, b.y) / 16) - m, cy1: Math.floor(Math.max(a.y, b.y) / 16) + m };
          // (zoomed far out over a big world the view holds thousands of chunks: full detail stays with
          // the middle of the screen, the rest runs at the far pace or sleeps)
          if (AG.N > 400000) { const MAXC = 30, ccx = Math.floor(R.cam.x / 16), ccy = Math.floor(R.cam.y / 16); if (f.cx1 - f.cx0 > MAXC) { f.cx0 = ccx - MAXC / 2; f.cx1 = ccx + MAXC / 2; } if (f.cy1 - f.cy0 > MAXC) { f.cy0 = ccy - MAXC / 2; f.cy1 = ccy + MAXC / 2; } }
          AG.Physics.focus = f; }
      } else {
        // history: whole steps of Δ years, each spread over as many frames as it needs
        if (!AG.paused) acc += (dt / 1000) * AG.histRate;
        const dy = AG.histDy, until = t0 + BUDGET_MS;
        for (;;) {
          if (AG.History.pending && !AG.History.snapWork(until)) break; // a snapshot is being copied: the world waits
          if (Sim.h && !Sim.stepRun(until)) { AG.throttled = true; break; }
          if (AG.paused || acc < dy || performance.now() > until) break;
          Sim.stepBegin(dy); acc -= dy; years += dy;
        }
        if (acc > dy * 2) { acc = dy * 2; AG.throttled = true; }
      }
      const t1 = performance.now();
      AG.FX.update(dt / 1000);
      AG.God.frame(dt / 1000);
      // a paused world is a still picture: it is drawn again only when the view or the world changes
      R.frame(dt / 1000, AG.paused || AG.mode !== 'watch' ? 1 : Math.min(1, acc / STEP), AG.paused && !AG.fastDawn && !Loader.on);
      AG.UI.frame(dt / 1000);
      AG.stats.renderMs = AG.stats.renderMs * 0.9 + (performance.now() - t1) * 0.1;
      frames++;
      if (now - windowStart >= 1000) {
        const s = 1000 / (now - windowStart);
        AG.stats.fps = frames * s; AG.stats.tps = ticks * s; AG.stats.yps = years * s; AG.stats.myps = myr * s;
        frames = 0; ticks = 0; years = 0; myr = 0; windowStart = now;
        governPerf(AG.stats.fps, now);
      }
      errStreak = 0;
    } catch (e) {
      AG.lastError = e;
      if (errors++ < 5) console.error(e);
      if (++errStreak >= 3) showError(e); // something breaks every frame: say what
    }
    requestAnimationFrame(frame);
  }

  // Boot behind the loading screen: every heavy first-time job is done here, with progress, so the
  // first playable frame has nothing left to build.
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  async function fontsReady() {
    if (!document.fonts) return;
    const link = document.querySelector('link[href*="fonts.googleapis"]');
    if (link && !link.sheet) await Promise.race([new Promise((res) => { link.addEventListener('load', res, { once: true }); link.addEventListener('error', res, { once: true }); }), wait(3500)]);
    await Promise.race([Promise.all(['700 40px "Pixelify Sans"', '600 16px "Pixelify Sans"', '500 14px "Pixelify Sans"', '400 14px "Pixelify Sans"'].map((f) => document.fonts.load(f).catch(() => null))), wait(3500)]);
  }
  async function boot() {
    try {
      Loader.start(); Loader.set(0.05, 'Loading fonts');
      await fontsReady();
      Loader.set(0.18, 'Starting the renderer'); await nextFrame();
      AG.UI.init(); applyPerf();
      Loader.set(0.32, 'Shaping a new world'); await nextFrame();
      AG.newWorld(+(new URLSearchParams(location.search).get('seed')) || 0);
      Loader.set(0.6, 'Painting the land'); await nextFrame();
      R.prewarm();
      Loader.set(0.78, 'Preparing the 3D close-up'); await nextFrame();
      AG.View3D.prewarm();
      Loader.set(0.95, 'Warming up'); await nextFrame();
      R.frame(0.016, 1); // one full frame behind the curtain: layers, labels, everything cached
      Loader.set(1, 'Ready'); await wait(160);
      AG.Title.show(); // the title screen, over the newborn world
      Loader.hide();
      last = performance.now(); AG.deepHold = 3;
      requestAnimationFrame(frame);
    } catch (e) { showError(e); Loader.set(1, 'Could not start: see the message above'); }
  }
  // Coming back to a hidden tab: carry on from now, with no burst of catching up.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); windowStart = last; frames = 0; ticks = 0; years = 0; myr = 0; } });
  document.getElementById('err-copy').addEventListener('click', () => { const t = document.getElementById('err-msg').textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}); });
  document.getElementById('err-close').addEventListener('click', () => { document.getElementById('errbox').hidden = true; });
  boot();
})();
