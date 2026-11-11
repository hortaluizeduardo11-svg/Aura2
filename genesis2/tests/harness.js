/* AURA: Genesis 2 — headless harness.
 * Loads the simulation modules into a fresh V8 context with a stub window, so tests run in Node
 * with no browser. Each call to load() gives an independent world. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
const SIM = ['core', 'world', 'geo', 'sky', 'fx', 'physics', 'life', 'habitat', 'entities', 'people', 'lang', 'tech', 'history', 'civ', 'war', 'ai', 'god', 'sim'];
const cache = {};

function load(opts) {
  opts = opts || {};
  const W = opts.W || 256, H = opts.H || 160;
  const sandbox = { console, Math, Date, JSON, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, TextEncoder, TextDecoder,
    Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, ArrayBuffer, DataView,
    setTimeout, clearTimeout, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.innerWidth = W * 3; sandbox.innerHeight = H * 3;
  sandbox.AG_CONFIG = { W, H, headless: true };
  vm.createContext(sandbox);
  const mods = opts.modules || SIM;
  for (const m of mods) {
    const f = path.join(ROOT, m + '.js');
    if (!fs.existsSync(f)) continue; // modules land one by one
    const src = cache[f] || (cache[f] = fs.readFileSync(f, 'utf8'));
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox.AG;
}

// FNV-1a over typed arrays and JSON-able values: a cheap fingerprint of world state.
function hash(parts) {
  let h = 0x811c9dc5;
  const mix = (b) => { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; };
  for (const p of parts) {
    if (ArrayBuffer.isView(p)) { const u = new Uint8Array(p.buffer, p.byteOffset, p.byteLength); for (let i = 0; i < u.length; i++) mix(u[i]); }
    else { const s = JSON.stringify(p); for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i) & 255); }
  }
  return h.toString(16).padStart(8, '0');
}

module.exports = { load, hash, SIM };
