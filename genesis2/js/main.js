/* AURA: Genesis 2 — main.js
 * Boot and the frame loop for the three clocks:
 *   deep    — millions of years a second (Sim.deepStep), the fine map repainted a few times a second
 *   watch   — fixed-timestep ticks (AG.TPS × speed) for the bodies near the camera
 *   history — years a second in steps of Δ years, under a per-frame time budget
 * The camera's view sets Civ.focus, which decides which communities are embodied (LOD). */
'use strict';
(function () {
  const AG = window.AG, Sim = AG.Sim, R = AG.Render, Civ = AG.Civ, Geo = AG.Geo;
  const STEP = 1000 / AG.TPS, BUDGET_MS = 14;
  // speed buttons: watch speeds are tick multipliers; history speeds are years per second
  const HIST = { c: { rate: 20, dy: 1 }, m: { rate: 400, dy: 5 } };
  const DEEP_MYPS = 6; // million years per second in deep time
  AG.speed = 1; AG.paused = false; AG.throttled = false; AG.histRate = 20; AG.histDy = 1; AG.fastDawn = false;
  AG.stats = { fps: 60, simMs: 0, renderMs: 0, tps: 0, yps: 0, myps: 0 };
  let lastSpeed = '1';

  AG.setSpeed = function (s) {
    s = String(s);
    if (s === '0') { AG.paused = true; AG.UI.syncSpeed(); return; }
    AG.paused = false;
    if (AG.mode === 'deep') { AG.UI.syncSpeed(); return; } // deep time has one speed (and the Dawn button)
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
  AG.skipToDawn = function () { if (AG.mode === 'deep') { AG.fastDawn = true; AG.paused = false; AG.UI.toast('Racing through the ages to the Dawn of people…'); } };

  AG.newWorld = function (seed) {
    AG.creating = true;
    Sim.newWorld(seed);
    AG.fastDawn = false; AG.paused = false;
    R.reset(); AG.View3D.reset(); AG.UI.reset();
    R.overlay = 'plates'; const o = document.querySelector('#overlay'); if (o) o.value = 'plates';
    R.bordersDirty = true;
    AG.creating = false;
    AG.UI.syncSpeed();
  };

  // When the Dawn comes: watch the first band at its fire, speed 1.
  AG.onDawn = function (p) {
    AG.fastDawn = false;
    R.overlay = 'realms'; const o = document.querySelector('#overlay'); if (o) o.value = 'realms';
    const c = Civ.cities.find((q) => q.alive);
    if (c) R.centerOn(c.x, c.y, 8);
    setFocus();
    lastSpeed = '1'; AG.speed = 1;
    Sim.setMode('watch');
    R.bordersDirty = true; AG.World.dirty.fill(1);
    AG.UI.toast(`The Dawn: ${p.name} become people. Speed up to Centuries or Millennia to watch history unfold.`);
    AG.UI.syncSpeed();
  };

  // After loading a save or switching timelines: the bodies and the clock follow the records.
  AG.syncAfterLoad = function () {
    R.reset(); AG.View3D.reset();
    if (AG.mode === 'watch') { AG.Life.embody(); setFocus(); Civ.lod(); }
    R.overlay = AG.mode === 'deep' ? 'plates' : 'realms';
    const o = document.querySelector('#overlay'); if (o) o.value = R.overlay;
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
        R.overlay = 'none'; document.querySelector('#overlay').value = 'none'; R.bordersDirty = true;
        AG.setSpeed('m');
        AG.UI.toast(best ? `The sea is rising. ${best.name} sits lowest of all the camps; watch the coast.` : 'The sea is rising.');
      };
      if (AG.mode === 'deep') { AG.newWorld(3); AG.Demos._after = go; AG.skipToDawn(); } else go();
    },
    _after: null,
  };

  // ------------------------------------------------------------ the loop
  let last = performance.now(), acc = 0, frames = 0, ticks = 0, years = 0, myr = 0, windowStart = last, errors = 0, lastPaint = 0, lodT = 0;
  function frame(now) {
    try {
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      const t0 = performance.now();
      AG.throttled = false;
      if (AG.mode === 'deep') {
        if (!AG.paused || AG.fastDawn) {
          if (AG.fastDawn) { const y0 = Geo.mya; Sim.skipDeep(60); myr += y0 - Math.max(0, Geo.mya); }
          else {
            acc += (dt / 1000) * DEEP_MYPS;
            let n = 0;
            while (acc >= Sim.DEEP_DT && n < 8) { Sim.deepStep(); acc -= Sim.DEEP_DT; myr += Sim.DEEP_DT; n++; if (performance.now() - t0 > BUDGET_MS) break; }
            if (acc > Sim.DEEP_DT * 4) acc = Sim.DEEP_DT * 4;
          }
          if (AG.mode === 'deep' && now - lastPaint > 180) { Geo.paintFine(); AG.World.dirty.fill(1); R.bordersDirty = true; lastPaint = now; }
        }
        if (AG.mode !== 'deep') { acc = 0; if (AG.Demos._after) { const f = AG.Demos._after; AG.Demos._after = null; f(); } }
      } else if (AG.mode === 'watch') {
        if (!AG.paused) acc += dt * AG.speed;
        let steps = 0;
        while (acc >= STEP) {
          Sim.tick(); acc -= STEP; steps++;
          if (performance.now() - t0 > BUDGET_MS) { AG.throttled = acc >= STEP; if (acc > STEP) acc = STEP; break; }
        }
        if (steps) AG.stats.simMs = AG.stats.simMs * 0.9 + ((performance.now() - t0) / steps) * 0.1;
        ticks += steps;
        if (now - lodT > 400) { setFocus(); Civ.lod(); lodT = now; }
      } else {
        if (!AG.paused) acc += (dt / 1000) * AG.histRate;
        const dy = AG.histDy;
        while (acc >= dy) {
          Sim.yearStep(dy); acc -= dy; years += dy;
          if (performance.now() - t0 > BUDGET_MS) { AG.throttled = acc >= dy; if (acc > dy) acc = dy; break; }
        }
        if (AG.World.dirtyAll) { AG.World.dirty.fill(1); AG.World.dirtyAll = false; }
      }
      const t1 = performance.now();
      AG.FX.update(dt / 1000);
      AG.God.frame(dt / 1000);
      R.frame(dt / 1000, AG.paused || AG.mode !== 'watch' ? 1 : Math.min(1, acc / STEP));
      AG.UI.frame(dt / 1000);
      AG.stats.renderMs = AG.stats.renderMs * 0.9 + (performance.now() - t1) * 0.1;
      frames++;
      if (now - windowStart >= 1000) {
        const s = 1000 / (now - windowStart);
        AG.stats.fps = frames * s; AG.stats.tps = ticks * s; AG.stats.yps = years * s; AG.stats.myps = myr * s;
        frames = 0; ticks = 0; years = 0; myr = 0; windowStart = now;
      }
    } catch (e) {
      AG.lastError = e;
      if (errors++ < 5) console.error(e);
    }
    requestAnimationFrame(frame);
  }

  AG.UI.init();
  AG.newWorld(+(new URLSearchParams(location.search).get('seed')) || 0);
  requestAnimationFrame(frame);
})();
