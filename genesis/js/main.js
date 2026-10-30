/* AURA: Genesis — main.js
 * Boot, world creation, the stress test and the fixed-timestep game loop.
 * The simulation runs at AG.TPS ticks per second (times the speed setting)
 * under a per-frame time budget; rendering interpolates unit positions
 * between ticks so movement stays smooth at any frame rate. */
'use strict';
(function () {
  const AG = window.AG;
  const STEP = 1000 / AG.TPS, BUDGET_MS = 14;
  AG.speed = 1; AG.paused = false; AG.throttled = false; AG.seed = 0;
  AG.stats = { fps: 60, simMs: 0, renderMs: 0, tps: 0 };

  AG.setSpeed = function (s) {
    if (s === 0) AG.paused = true; else { AG.paused = false; AG.speed = s; }
    AG.UI.syncSpeed();
  };

  AG.newWorld = function (seed) {
    seed = seed >>> 0 || ((Math.random() * 1e9) | 0) + 1;
    AG.seed = seed; AG.tick = 0;
    AG.seedRnd(Math.imul(seed, 2654435761) >>> 0);
    AG.DISEASES.splice(0, AG.DISEASES.length, ...AG.DISEASES.filter((d) => d.builtin));
    AG.Chronicle.reset(); AG.Ent.reset(); AG.Civ.reset(); AG.God.reset(); AG.FX.reset(); AG.Proj.reset();
    AG.World.generate(seed);
    AG.Sky.reset(seed);
    // let rivers find their beds and start the clock mid-morning
    for (let k = 0; k < 180; k++) { AG.tick++; AG.Sky.tick(); AG.Physics.tick(); }
    AG.Civ.seedWorld();
    AG.Render.reset(); AG.UI.reset();
    AG.Chronicle.add(`A new world stirs (seed ${seed})`, 'info');
  };

  // Spawn a large mixed population to exercise the engine at scale.
  AG.stress = function (n) {
    const { W, H, SP } = AG, Wd = AG.World;
    let made = 0, tries = 0;
    const cities = AG.Civ.cities.filter((c) => c.alive);
    while (made < n && tries < n * 30) {
      tries++;
      const r = AG.rnd();
      if (r < 0.2 && cities.length) {
        const c = AG.pick(cities), sp = AG.Civ.kingdoms[c.kd].race;
        if (AG.Ent.spawn(sp, c.x + (AG.rnd() - 0.5) * c.radius, c.y + (AG.rnd() - 0.5) * c.radius, { kd: c.kd, city: c.id, force: true }) >= 0) made++;
        continue;
      }
      const sp = r < 0.75 ? SP.DEER : r < 0.88 ? SP.WOLF : SP.BIRD;
      const x = 4 + AG.rnd() * (W - 8), y = 4 + AG.rnd() * (H - 8), i = (y | 0) * W + (x | 0);
      if (sp !== SP.BIRD && !Wd.passLand(i)) continue;
      if (AG.Ent.spawn(sp, x, y, { force: true }) >= 0) made++;
    }
    AG.UI.toast(`${made.toLocaleString('en-US')} creatures added. Watch the Engine stats in this tab.`);
  };

  function simTick() {
    AG.tick++;
    AG.Flow.budget = 2;
    AG.Sky.tick();
    AG.Physics.tick();
    AG.Ent.rebuildGrid();
    AG.AI.tick();
    AG.Proj.tick();
    AG.Civ.tick();
    AG.God.tick();
  }

  let last = performance.now(), acc = 0, frames = 0, ticks = 0, windowStart = last, errors = 0;
  function frame(now) {
    try {
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      if (!AG.paused) acc += dt * AG.speed;
      const t0 = performance.now();
      let steps = 0;
      AG.throttled = false;
      while (acc >= STEP) {
        simTick(); acc -= STEP; steps++;
        if (performance.now() - t0 > BUDGET_MS) { AG.throttled = acc >= STEP; if (acc > STEP) acc = STEP; break; }
      }
      const t1 = performance.now();
      if (steps) AG.stats.simMs = AG.stats.simMs * 0.9 + ((t1 - t0) / steps) * 0.1;
      ticks += steps;
      AG.FX.update(dt / 1000);
      AG.God.frame(dt / 1000);
      AG.Render.frame(dt / 1000, AG.paused ? 1 : Math.min(1, acc / STEP));
      AG.UI.frame(dt / 1000);
      AG.stats.renderMs = AG.stats.renderMs * 0.9 + (performance.now() - t1) * 0.1;
      frames++;
      if (now - windowStart >= 1000) {
        AG.stats.fps = (frames * 1000) / (now - windowStart);
        AG.stats.tps = (ticks * 1000) / (now - windowStart);
        frames = 0; ticks = 0; windowStart = now;
      }
    } catch (e) {
      AG.lastError = e;
      if (errors++ < 5) console.error(e);
    }
    requestAnimationFrame(frame);
  }

  AG.UI.init();
  AG.newWorld(0);
  AG.UI.syncSpeed();
  requestAnimationFrame(frame);
})();
