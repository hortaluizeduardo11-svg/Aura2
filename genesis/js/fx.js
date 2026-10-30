/* AURA: Genesis — fx.js
 * Pooled particle system (structure-of-arrays, no per-particle objects).
 * Positions are in world cells; z lifts a particle toward the camera. */
'use strict';
(function () {
  const AG = window.AG;
  const MAX = 6000;
  const F = (T) => new T(MAX);
  const FX = (AG.FX = {
    MAX, n: 0,
    x: F(Float32Array), y: F(Float32Array), z: F(Float32Array), vx: F(Float32Array), vy: F(Float32Array), vz: F(Float32Array),
    life: F(Float32Array), max: F(Float32Array), r: F(Uint8Array), g: F(Uint8Array), b: F(Uint8Array),
    size: F(Float32Array), add: F(Uint8Array), layer: F(Uint8Array), grav: F(Float32Array),
  });
  const rnd = AG.rnd;

  FX.spawn = function (x, y, vx, vy, life, c, size, add, layer, vz, grav) {
    let i = FX.n;
    if (i >= MAX) i = (rnd() * MAX) | 0; else FX.n++;
    FX.x[i] = x; FX.y[i] = y; FX.z[i] = 0; FX.vx[i] = vx; FX.vy[i] = vy; FX.vz[i] = vz || 0;
    FX.life[i] = life; FX.max[i] = life; FX.r[i] = c[0]; FX.g[i] = c[1]; FX.b[i] = c[2];
    FX.size[i] = size || 1; FX.add[i] = add ? 1 : 0; FX.layer[i] = layer === undefined ? 1 : layer; FX.grav[i] = grav || 0;
  };

  const KINDS = {
    spark: { c: [[255, 230, 160], [255, 160, 60]], n: 8, sp: 0.12, life: 0.5, size: 0.5, add: 1, vz: 0.05, grav: 0.004 },
    blood: { c: [[200, 40, 40], [140, 20, 20]], n: 5, sp: 0.06, life: 0.6, size: 0.45, add: 0, vz: 0.05, grav: 0.006 },
    dust: { c: [[170, 150, 120], [120, 110, 100]], n: 10, sp: 0.06, life: 1.2, size: 0.8, add: 0, vz: 0.02 },
    steam: { c: [[230, 235, 240], [200, 210, 220]], n: 8, sp: 0.03, life: 1.5, size: 1.2, add: 0, vz: 0.04 },
    ember: { c: [[255, 200, 80], [255, 100, 30]], n: 10, sp: 0.08, life: 1.4, size: 0.5, add: 1, vz: 0.06, grav: -0.0005 },
    holy: { c: [[255, 236, 150], [255, 255, 220]], n: 14, sp: 0.05, life: 1.6, size: 0.6, add: 1, vz: 0.05, grav: -0.002 },
    curse: { c: [[170, 80, 220], [90, 30, 140]], n: 12, sp: 0.05, life: 1.6, size: 0.6, add: 1, vz: 0.03, grav: -0.001 },
    magic: { c: [[120, 220, 255], [200, 140, 255]], n: 16, sp: 0.1, life: 1.2, size: 0.6, add: 1, vz: 0.05 },
    explosion: { c: [[255, 220, 120], [255, 110, 40], [120, 100, 90]], n: 60, sp: 0.35, life: 1.6, size: 1.3, add: 1, vz: 0.12, grav: 0.006 },
    debris: { c: [[110, 96, 80], [80, 70, 60], [150, 130, 100]], n: 14, sp: 0.15, life: 1.4, size: 0.7, add: 0, vz: 0.12, grav: 0.01 },
    splash: { c: [[160, 210, 240], [220, 240, 255]], n: 6, sp: 0.06, life: 0.5, size: 0.4, add: 0, vz: 0.06, grav: 0.01 },
    heal: { c: [[140, 255, 160], [220, 255, 220]], n: 8, sp: 0.03, life: 1.2, size: 0.5, add: 1, vz: 0.05, grav: -0.002 },
    acid: { c: [[150, 255, 90], [90, 200, 60]], n: 6, sp: 0.03, life: 0.8, size: 0.5, add: 1, vz: 0.04 },
  };

  FX.burst = function (x, y, kind, n, layer) {
    const k = KINDS[kind]; if (!k) return;
    n = n || k.n;
    for (let j = 0; j < n; j++) {
      const a = rnd() * Math.PI * 2, s = k.sp * (0.3 + rnd());
      FX.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, k.life * (0.6 + rnd() * 0.8), AG.pick(k.c), k.size * (0.7 + rnd() * 0.6), k.add, layer, k.vz * (0.5 + rnd()), k.grav || 0);
    }
  };

  // Frame-rate based update (dt in seconds); particles keep animating while paused.
  FX.update = function (dt) {
    const f = dt * 60;
    let n = FX.n;
    for (let i = 0; i < n; i++) {
      FX.life[i] -= dt;
      if (FX.life[i] <= 0) {
        n--;
        if (i !== n) {
          FX.x[i] = FX.x[n]; FX.y[i] = FX.y[n]; FX.z[i] = FX.z[n]; FX.vx[i] = FX.vx[n]; FX.vy[i] = FX.vy[n]; FX.vz[i] = FX.vz[n];
          FX.life[i] = FX.life[n]; FX.max[i] = FX.max[n]; FX.r[i] = FX.r[n]; FX.g[i] = FX.g[n]; FX.b[i] = FX.b[n];
          FX.size[i] = FX.size[n]; FX.add[i] = FX.add[n]; FX.layer[i] = FX.layer[n]; FX.grav[i] = FX.grav[n];
          i--;
        }
        continue;
      }
      FX.x[i] += FX.vx[i] * f; FX.y[i] += FX.vy[i] * f;
      FX.vz[i] -= FX.grav[i] * f; FX.z[i] += FX.vz[i] * f;
      if (FX.z[i] < 0) { FX.z[i] = 0; FX.vz[i] *= -0.3; FX.vx[i] *= 0.7; FX.vy[i] *= 0.7; }
      FX.vx[i] *= 0.985; FX.vy[i] *= 0.985;
    }
    FX.n = n;
  };
  FX.reset = () => { FX.n = 0; };
})();
