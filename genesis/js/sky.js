/* AURA: Genesis — sky.js
 * The air layer: calendar, day/night, seasons, wind, roaming storm cells that
 * rain/snow onto the surface, lightning, and a low-res cloud density field. */
'use strict';
(function () {
  const AG = window.AG;
  const { W, H, CW, CH, NC, FT, DAY_TICKS, YEAR_TICKS } = AG;
  const rnd = AG.rnd;
  const CLW = 96, CLH = 64; // one cloud cell = 4x4 world cells

  const Sky = (AG.Sky = {
    CLW, CLH, cloud: new Float32Array(CLW * CLH), dark: new Float32Array(CLW * CLH),
    chunkT: new Float32Array(NC), chunkRain: new Uint8Array(NC),
    wind: { x: 0.4, y: 0.12 }, windTarget: { x: 0.4, y: 0.12 },
    storms: [], strikes: [], flash: 0, seasonT: 0, offX: 0, offY: 0, noise: AG.makeNoise(99),
  });
  Sky.SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  Sky.STORMS = {
    rain: { name: 'Rainstorm', dens: 0.75, dark: 0.35, temp: -0.03 },
    thunder: { name: 'Thunderstorm', dens: 0.95, dark: 0.7, temp: -0.04 },
    blizzard: { name: 'Blizzard', dens: 0.9, dark: 0.25, temp: -0.38 },
    heat: { name: 'Heatwave', dens: 0, dark: 0, temp: 0.38 },
    acid: { name: 'Acid rain', dens: 0.85, dark: 0.55, temp: 0 },
  };

  Sky.reset = function (seed) {
    Sky.storms.length = 0; Sky.strikes.length = 0; Sky.flash = 0;
    Sky.noise = AG.makeNoise(seed * 13 + 5);
    Sky.offX = 0; Sky.offY = 0;
    Sky.updateClouds();
  };

  // ---- calendar
  Sky.dayFrac = () => (AG.tick % DAY_TICKS) / DAY_TICKS;            // 0 = midnight, 0.5 = noon
  Sky.yearFrac = () => (AG.tick % YEAR_TICKS) / YEAR_TICKS;
  Sky.year = () => Math.floor(AG.tick / YEAR_TICKS) + 1;
  Sky.season = () => Math.floor(Sky.yearFrac() * 4);
  Sky.sunHeight = () => Math.sin((Sky.dayFrac() - 0.25) * Math.PI * 2);   // -1..1
  Sky.daylight = () => AG.smooth(-0.28, 0.32, Sky.sunHeight());
  // Sun direction across the map for hillshading: rises in the east, sets in the west.
  Sky.sunDir = function () {
    const a = (Sky.dayFrac() - 0.25) * Math.PI * 2;
    return { x: Math.cos(a) * 0.9, y: -0.55, h: Math.max(0.12, Math.sin(a)) };
  };
  Sky.timeLabel = function () {
    const df = Sky.dayFrac(), hour = Math.floor(df * 24), min = Math.floor((df * 24 - hour) * 60);
    return { year: Sky.year(), season: Sky.SEASONS[Sky.season()], clock: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
  };

  Sky.spawnStorm = function (type, x, y, r, life, natural) {
    const s = { type, x, y, r: r || 22, life: life || 900, max: life || 900, vx: (rnd() - 0.5) * 0.04, vy: (rnd() - 0.5) * 0.04, natural: !!natural, k: 0 };
    Sky.storms.push(s);
    return s;
  };

  // ---- per-tick update
  Sky.tick = function () {
    const t = AG.tick;
    Sky.seasonT = 0.15 * Math.cos(Math.PI * 2 * (Sky.yearFrac() - 0.375));

    // wind drifts toward a slowly changing target
    if (t % 900 === 0) { const a = rnd() * Math.PI * 2, m = 0.2 + rnd() * 0.7; Sky.windTarget.x = Math.cos(a) * m; Sky.windTarget.y = Math.sin(a) * m; }
    Sky.wind.x += (Sky.windTarget.x - Sky.wind.x) * 0.002;
    Sky.wind.y += (Sky.windTarget.y - Sky.wind.y) * 0.002;
    Sky.offX += Sky.wind.x * 0.03; Sky.offY += Sky.wind.y * 0.03;

    // natural storms
    const natural = Sky.storms.reduce((n, s) => n + (s.natural ? 1 : 0), 0);
    if (natural < 4 && rnd() < 0.0018) {
      const x = 20 + rnd() * (W - 40), y = 20 + rnd() * (H - 40), i = (y | 0) * W + (x | 0);
      const T = AG.World.tbase[i] + Sky.seasonT;
      let type = 'rain';
      if (T < 0.24) type = rnd() < 0.6 ? 'blizzard' : 'rain';
      else if (T > 0.62) type = rnd() < 0.35 ? 'heat' : 'thunder';
      else if (rnd() < 0.35) type = 'thunder';
      Sky.spawnStorm(type, x, y, 16 + rnd() * 18, 600 + rnd() * 1200, true);
    }

    // chunk-level weather temperature / rain flags (cheap: chunks x storms)
    Sky.chunkT.fill(0); Sky.chunkRain.fill(0);
    for (let k = Sky.storms.length - 1; k >= 0; k--) {
      const s = Sky.storms[k];
      s.life--;
      if (s.life <= 0 || s.x < -40 || s.y < -40 || s.x > W + 40 || s.y > H + 40) { Sky.storms.splice(k, 1); continue; }
      s.x += Sky.wind.x * 0.045 + s.vx; s.y += Sky.wind.y * 0.045 + s.vy;
      const ramp = Math.min(1, (s.max - s.life) / 120, s.life / 120); s.k = ramp;
      const def = Sky.STORMS[s.type];
      const cx0 = Math.max(0, ((s.x - s.r) >> 4)), cx1 = Math.min(CW - 1, ((s.x + s.r) >> 4));
      const cy0 = Math.max(0, ((s.y - s.r) >> 4)), cy1 = Math.min(CH - 1, ((s.y + s.r) >> 4));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const d = Math.sqrt(AG.dist2(cx * 16 + 8, cy * 16 + 8, s.x, s.y)) / s.r;
        if (d > 1.15) continue;
        const f = (1 - Math.min(1, d)) * ramp;
        Sky.chunkT[cy * CW + cx] += def.temp * f;
        if (s.type !== 'heat' && f > 0.1) Sky.chunkRain[cy * CW + cx] = 1;
      }
      if (s.type !== 'heat') precipitate(s, ramp);
      if (s.type === 'thunder' && rnd() < 0.008 * ramp) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * s.r;
        AG.God.lightning(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, true);
      }
    }
    if (Sky.flash > 0) Sky.flash = Math.max(0, Sky.flash - 0.08);
    for (let k = Sky.strikes.length - 1; k >= 0; k--) if (--Sky.strikes[k].t <= 0) Sky.strikes.splice(k, 1);
    if (t % 5 === 0) Sky.updateClouds();
  };

  function precipitate(s, ramp) {
    const Wd = AG.World;
    const n = Math.ceil(s.r * s.r * 0.025 * ramp);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * s.r;
      const x = (s.x + Math.cos(a) * rr) | 0, y = (s.y + Math.sin(a) * rr) | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (Wd.fire[i]) Wd.fire[i] = Wd.fire[i] > 60 ? Wd.fire[i] - 60 : 0;
      if (s.type === 'acid') { AG.Physics.addFluid(i, FT.ACID, 0.0035); continue; }
      if (Wd.T(i) < 0.22) {
        if (Wd.ft[i] === FT.WATER && Wd.fl[i] > 0.004) { if (rnd() < 0.15) Wd.frozen[i] = 1; }
        else Wd.snow[i] = Math.min(255, Wd.snow[i] + 12);
        Wd.dirty[Wd.chunkOfIdx(i)] = 1;
      } else if (Wd.fl[i] > 0.002 || rnd() < 0.2) {
        AG.Physics.addFluid(i, FT.WATER, 0.0045);
      } else {
        Wd.moist[i] = Math.min(1, Wd.moist[i] + 0.0005); // most rain on dry ground soaks in
        if (Wd.veg[i] < 250) Wd.veg[i] += 1;
      }
    }
  }

  // Cloud density = scrolling fractal noise thresholded by season + storm cells.
  Sky.updateClouds = function () {
    const n = Sky.noise, cl = Sky.cloud, dk = Sky.dark;
    const humid = 0.56 - (Sky.season() === 1 ? -0.03 : Sky.season() === 3 ? 0.03 : 0);
    for (let y = 0; y < CLH; y++) for (let x = 0; x < CLW; x++) {
      const v = n.fbm((x + Sky.offX * 0.25) * 0.06, (y + Sky.offY * 0.25) * 0.06, 4);
      cl[y * CLW + x] = AG.smooth(humid, humid + 0.2, v) * 0.6;
      dk[y * CLW + x] = 0;
    }
    for (const s of Sky.storms) {
      const def = Sky.STORMS[s.type]; if (!def.dens) continue;
      const r = s.r / 4 * 1.25, cx = s.x / 4, cy = s.y / 4;
      const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(CLW - 1, (cx + r) | 0), y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(CLH - 1, (cy + r) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt(AG.dist2(x, y, cx, cy)) / r; if (d >= 1) continue;
        const f = (1 - d * d) * s.k, j = y * CLW + x;
        const wobble = n(x * 0.3 + AG.tick * 0.002, y * 0.3) * 0.35 + 0.75;
        cl[j] = Math.min(1, cl[j] + def.dens * f * wobble);
        dk[j] = Math.min(1, dk[j] + def.dark * f);
      }
    }
  };
  Sky.cloudAt = (x, y) => {
    const cx = AG.clamp((x / 4) | 0, 0, CLW - 1), cy = AG.clamp((y / 4) | 0, 0, CLH - 1);
    return Sky.cloud[cy * CLW + cx];
  };
})();
