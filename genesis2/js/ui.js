/* AURA: Genesis 2 — ui.js
 * DOM side: tools, time controls across the three clocks, the HUD, the inspector (a person's
 * story, mind, memories, family, relationships, health and genome; animals and species;
 * communities and their knowledge; polities and their institutions), the Peoples, Life and
 * History panels, world tools (save/load, scenarios, time-lapse), and all input. */
'use strict';
(function () {
  const AG = window.AG, U = AG.U, Ent = AG.Ent, Civ = AG.Civ, God = AG.God, R = AG.Render, Sky = AG.Sky, Wd = AG.World;
  const People = AG.People, Life = AG.Life, Tech = AG.Tech, Lang = AG.Lang, Geo = AG.Geo, History = AG.History;
  const { W, H, SP, SPECIES, FL, TR, J, BT, BUILD, SKILLS, GOALS, TRAITS, SO, FT, UG, UF, TASTES } = AG;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const yr = (y) => `Y${fmt(Math.floor(y) + 1)}`;
  const UI = (AG.UI = { sel: null, tab: 'chronicle', cat: 'look', sub: 'story', hfilter: 'key' });
  let frameN = 0, panelHover = false, lastToast = 0, worldBuilt = false;
  const keys = new Set();

  // ============================================================ setup
  UI.init = function () {
    R.init($('#world'), $('#minimap'));
    if (AG.View3D.init($('#app'), $('#world'))) R.resize();
    $('#compass').addEventListener('click', () => AG.View3D.north());
    buildCats(); showCat('look'); selectTool('inspect');
    $('#toolgrid').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) selectTool(b.dataset.tool); });
    $('#bsize').addEventListener('input', (e) => { God.brush.r = +e.target.value; $('#bsizev').textContent = e.target.value; });
    $('#bstr').addEventListener('input', (e) => { God.brush.str = +e.target.value; $('#bstrv').textContent = Math.round(e.target.value * 100); });
    $('#disease').addEventListener('change', (e) => { God.disease = +e.target.value; });
    $('#locus').addEventListener('change', (e) => { God.locus = +e.target.value; });
    $('#locus').innerHTML = Life.LOCI.map((n, k) => `<option value="${k}">${n}</option>`).join(''); $('#locus').value = God.locus;
    $('#btn-editdisease').addEventListener('click', () => diseaseEditor(-1));
    $('#speed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) AG.setSpeed(b.dataset.speed); });
    $('#btn-dawn').addEventListener('click', () => AG.skipToDawn());
    $('#layers').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { R.view = +b.dataset.view; syncLayers(); } });
    $('#overlay').addEventListener('change', (e) => { R.overlay = e.target.value; R.bordersDirty = true; });
    $('#btn-trade').addEventListener('click', (e) => { R.showTrade = !R.showTrade; e.currentTarget.classList.toggle('on', R.showTrade); e.currentTarget.setAttribute('aria-pressed', R.showTrade); });
    $('#btn-panel').addEventListener('click', () => setPanel($('#panel').hidden));
    $('#btn-help').addEventListener('click', help);
    document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#pbody').addEventListener('click', panelClick);
    $('#panel').addEventListener('pointerenter', () => { panelHover = true; });
    $('#panel').addEventListener('pointerleave', () => { panelHover = false; });
    $('#minimap').addEventListener('pointerdown', (e) => { const r = e.currentTarget.getBoundingClientRect(); R.follow = -1; R.centerOn(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H); });
    $('#pad-strike').addEventListener('pointerdown', () => { God.input.act = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('#pad-strike').addEventListener(ev, () => { God.input.act = false; });
    $('#pad-power').addEventListener('click', () => { God.input.power = true; });
    $('#pad-release').addEventListener('click', () => { God.release(); R.follow = -1; });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    bindCanvas($('#world'));
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('resize', () => R.resize());
    setPanel(false);
    $('#ticker').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      setPanel(true); setTab('chronicle');
      if (li.dataset.x !== undefined) { R.follow = -1; R.centerOn(+li.dataset.x, +li.dataset.y, Math.max(R.cam.z, 4)); }
    });
    setTab('chronicle');
  };
  UI.reset = function () { UI.sel = null; worldBuilt = false; fillDiseases(); if (UI.tab !== 'chronicle') setTab(UI.tab); };

  // 9x9 pixel glyphs, one per tool family, tinted per tool and outlined like the world's sprites
  const GLYPHS = {
    look: ['.........', '...xxx...', '.xx...xx.', 'x..xxx..x', 'x..x.x..x', 'x..xxx..x', '.xx...xx.', '...xxx...', '.........'],
    land: ['.........', '....x....', '...xxx...', '..xx.xx..', '..x...x.x', '.x....xxx', 'xx.....xx', 'x.......x', 'xxxxxxxxx'],
    elem: ['....x....', '....x....', '...xxx...', '..xx.xx..', '.xx...xx.', '.x.....x.', '.x.....x.', '..xx.xx..', '...xxx...'],
    sky: ['...xxx...', '.xxx.xxx.', 'x.......x', 'xxxxxxxxx', '....x....', '...x.....', '..xxx....', '....x....', '...x.....'],
    life: ['.........', '.xx...xx.', 'x..x.x..x', 'x...x...x', '.xx.x.xx.', '....x....', '....x....', '..xxxxx..', '.........'],
    divine: ['....x....', '....x....', '...xxx...', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..', '..xx.xx..', '.xx...xx.', '.x.....x.'],
    ruin: ['....x....', '...xx....', '...xxx...', '..xx.xx..', '..x..xx..', '.xx...xx.', '.x..x..x.', '.x.xxx.x.', '..xxxxx..'],
    deep: ['..xxxxx..', '.x..x..x.', 'x...x...x', '....x....', '....x....', '....x....', '....x....', '....x....', '....x....'],
  };
  const glyphCache = new Map();
  function glyph(cat, color) {
    const key = cat + color;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const c = document.createElement('canvas'); c.width = 11; c.height = 11;
    const x = c.getContext('2d'), rows = GLYPHS[cat] || GLYPHS.look;
    x.fillStyle = 'rgba(10,12,20,0.9)';
    for (let y = 0; y < 9; y++) for (let k = 0; k < 9; k++) if (rows[y][k] === 'x') x.fillRect(k, y, 3, 3);
    x.fillStyle = color;
    for (let y = 0; y < 9; y++) for (let k = 0; k < 9; k++) if (rows[y][k] === 'x') x.fillRect(k + 1, y + 1, 1, 1);
    const url = c.toDataURL();
    glyphCache.set(key, url);
    return url;
  }

  const CAT_TINT = { look: '#f1ead8', land: '#c8a27a', geo: '#ff9d4d', elem: '#6fb6ff', sky: '#c9d7ff', life: '#8fd16b', divine: '#ffd56b', ruin: '#ff7a4d', deep: '#d9a066' };
  function buildCats() {
    $('#cats').innerHTML = God.CATS.map((c) => `<button type="button" class="cat" role="tab" data-cat="${c.id}"><img src="${glyph(c.id === 'geo' ? 'ruin' : c.id, CAT_TINT[c.id])}" alt=""><span>${c.name}</span></button>`).join('');
    $('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) showCat(b.dataset.cat); });
  }
  function showCat(id) {
    UI.cat = id;
    for (const b of document.querySelectorAll('.cat')) { b.classList.toggle('on', b.dataset.cat === id); b.setAttribute('aria-selected', b.dataset.cat === id); }
    $('#toolgrid').innerHTML = God.TOOLS.filter((t) => t.cat === id).map((t) =>
      `<button type="button" class="tool${t.id === God.tool ? ' on' : ''}" data-tool="${t.id}" title="${esc(t.desc)}"><img src="${glyph(t.cat === 'geo' ? 'ruin' : t.cat, t.color)}" alt=""><span>${esc(t.name)}</span></button>`).join('');
  }
  const SIZED = new Set(['meteor', 'volcano', 'rain', 'thunder', 'blizzard', 'heat', 'fault']);
  function selectTool(id) {
    God.select(id);
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
    const t = God.cur;
    $('#toolname').textContent = t.name;
    $('#tooldesc').textContent = t.desc;
    $('#sizerow').hidden = t.mode !== 'brush' && !SIZED.has(id);
    $('#strrow').hidden = t.mode !== 'brush' && id !== 'fault';
    $('#diseaserow').hidden = id !== 'plague';
    $('#locusrow').hidden = !t.locus;
    $('#world').style.cursor = id === 'inspect' ? 'grab' : 'crosshair';
    syncLayers();
  }
  UI.selectTool = selectTool;
  function syncLayers() { for (const b of document.querySelectorAll('#layers button')) b.classList.toggle('on', +b.dataset.view === R.view); }
  UI.syncSpeed = function () {
    const cur = AG.paused ? '0' : AG.mode === 'deep' ? 'a' : AG.mode === 'history' ? (AG.histRate > 100 ? 'm' : 'c') : String(AG.speed);
    for (const b of document.querySelectorAll('#speed button')) {
      b.classList.toggle('on', b.dataset.speed === cur);
      b.disabled = AG.mode === 'deep' ? !(b.dataset.speed === '0' || b.dataset.speed === 'a') : b.dataset.speed === 'a';
    }
    $('#btn-dawn').hidden = AG.mode !== 'deep';
  };
  function fillDiseases() {
    $('#disease').innerHTML = AG.DISEASES.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join('');
    if (God.disease >= AG.DISEASES.length) God.disease = 0;
    $('#disease').value = God.disease;
  }
  function setPanel(open) { $('#panel').hidden = !open; $('#btn-panel').classList.toggle('on', open); $('#btn-panel').setAttribute('aria-pressed', open); }
  UI.setPanel = setPanel;
  function setTab(t) {
    UI.tab = t; worldBuilt = false;
    for (const b of document.querySelectorAll('.tab')) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); }
    renderPanel(true);
  }
  UI.setTab = setTab;
  UI.toast = function (msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => el.classList.remove('show'), 3800);
  };
  UI.onChronicle = function (e) {
    if (AG.creating || e.kind === 'info') return;
    if (!$('#panel').hidden && UI.tab === 'chronicle') return;
    const now = performance.now();
    if ((e.kind === 'culture' || e.kind === 'found') && now - lastToast < 2500) return;
    if (AG.mode === 'history' && AG.histRate > 100 && now - lastToast < 900) return;
    lastToast = now;
    const list = $('#ticker');
    const li = document.createElement('li');
    li.className = 'glass k-' + e.kind;
    if (e.x >= 0) { li.dataset.x = e.x | 0; li.dataset.y = e.y | 0; }
    li.innerHTML = `<i></i><span>${esc(e.text)}</span>`;
    li.addEventListener('animationend', () => li.remove());
    list.appendChild(li);
    while (list.children.length > 3) list.firstChild.remove();
  };

  // ============================================================ picking
  UI.unitAt = function (x, y) {
    const r = Math.max(1.2, 8 / R.cam.z);
    const layers = R.view === 0 ? [0] : [2, 1];
    for (const L of layers) {
      const off = R.cam.z >= 3 ? (L === 2 ? 4.6 : 0.8) : 0;
      const n = Ent.near(x, y + off, r, L, 64);
      let best = -1, bd = 1e9;
      for (let q = 0; q < n; q++) { const j = Ent.buf[q], d = AG.dist2(U.x[j], U.y[j], x, y + off); if (d < bd) { bd = d; best = j; } }
      if (best >= 0) return best;
    }
    return -1;
  };
  UI.pick = function (x, y) {
    const u = UI.unitAt(x, y);
    if (u >= 0) { UI.select('unit', u); return; }
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const b = Wd.bgrid[yi * W + xi];
    if (b && R.view !== 0) { UI.select('city', Civ.buildings[b - 1].city); return; }
    const c = Civ.cityAt(xi, yi);
    if (c && R.view !== 0) { UI.select('city', c.id); return; }
    UI.toast(cellInfo(xi, yi).replace(/<br>/g, ' · ').replace(/<[^>]+>/g, ''));
  };
  UI.select = function (type, id) {
    UI.sel = type ? { type, id } : null;
    if (type === 'unit' && U.pid[id] >= 0) UI.sel = { type: 'person', id: U.pid[id] };
    setPanel(true); setTab('inspect');
  };

  function bindCanvas(cv) {
    const ptrs = new Map();
    let pan = null, pinch = null, orbit = null, moved = false, start = null;
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = local(e);
      ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) {
        God.down = false; pan = null; orbit = null;
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: R.cam.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, a: angle(a, b) };
        return;
      }
      const w = R.screenToWorld(p.x, p.y);
      God.wx = w.x; God.wy = w.y;
      moved = false; start = p;
      if (e.button === 2 && R.is3D()) { orbit = p; return; } // right-drag turns and tilts the 3D camera
      if (e.button === 1 || e.button === 2 || e.altKey) { pan = p; return; }
      if (God.possessed >= 0) { God.input.moveTo = { x: w.x, y: w.y }; God.input.aimX = w.x; God.input.aimY = w.y; return; }
      if (God.tool === 'inspect') { pan = p; return; }
      God.press(w.x, w.y);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = local(e);
      const w = R.screenToWorld(p.x, p.y);
      R.hover.x = w.x; R.hover.y = w.y; R.hover.on = e.pointerType === 'mouse';
      God.wx = w.x; God.wy = w.y; God.input.aimX = w.x; God.input.aimY = w.y;
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        R.pan(cx - pinch.cx, cy - pinch.cy); pinch.cx = cx; pinch.cy = cy;
        R.setZoom(pinch.z * (d / pinch.d)); // continuous while pinching; settles on a step on release
        if (R.is3D()) { const an = angle(a, b); AG.View3D.rotate(an - pinch.a, 0); pinch.a = an; }
        return;
      }
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
      if (orbit) { AG.View3D.rotate((p.x - prev.x) * 0.006, (p.y - prev.y) * 0.004); return; }
      if (pan) { R.pan(p.x - prev.x, p.y - prev.y); return; }
    });
    const end = (e) => {
      const p = local(e);
      if (ptrs.has(e.pointerId) && God.tool === 'inspect' && !moved && !pinch && God.possessed < 0 && e.button === 0 && !e.altKey) {
        const w = R.screenToWorld(p.x, p.y); God.press(w.x, w.y);
      }
      ptrs.delete(e.pointerId);
      if (pinch && ptrs.size < 2) {
        const list = R.zoomList();
        let best = list[0];
        for (const z of list) if (Math.abs(Math.log(z / R.cam.z)) < Math.abs(Math.log(best / R.cam.z))) best = z;
        R.zoomTarget(best);
        pinch = null;
      }
      if (!ptrs.size) { God.down = false; pan = null; orbit = null; start = null; }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') R.hover.on = false; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); R.zoomAt(p.x, p.y, e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }
  function zoomTo(sx, sy, z) {
    const b = R.screenToWorld(sx, sy);
    R.cam.z = z;
    const a = R.screenToWorld(sx, sy);
    R.cam.x += b.x - a.x; R.cam.y += b.y - a.y;
    R.pan(0, 0);
  }
  function keyDown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
    const k = e.key.toLowerCase();
    if (!$('#modal').hidden) { if (k === 'escape') closeModal(); return; }
    if (God.possessed >= 0) {
      if (k === ' ') { God.input.act = true; e.preventDefault(); setTimeout(() => { God.input.act = false; }, 120); return; }
      if (k === 'e') { God.input.power = true; return; }
      if (k === 'escape') { God.release(); R.follow = -1; return; }
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
    switch (k) {
      case ' ': e.preventDefault(); AG.togglePause(); break;
      case '1': AG.setSpeed('1'); break; case '2': AG.setSpeed('4'); break; case '3': AG.setSpeed('16'); break; case '4': AG.setSpeed('c'); break; case '5': AG.setSpeed('m'); break;
      case 'tab': e.preventDefault(); R.view = (R.view + 2) % 3; syncLayers(); break;
      case '+': case '=': R.zoomAt(R.size().w / 2, R.size().h / 2, 1); break;
      case '-': case '_': R.zoomAt(R.size().w / 2, R.size().h / 2, -1); break;
      case 'b': { const o = [...document.querySelectorAll('#overlay option')].map((x) => x.value); R.overlay = o[(o.indexOf(R.overlay) + 1) % o.length]; $('#overlay').value = R.overlay; R.bordersDirty = true; break; }
      case 'i': showCat('look'); selectTool('inspect'); break;
      case 'escape': God.pendingKd = -1; R.follow = -1; break;
      case '[': if (R.is3D()) AG.View3D.turn(-Math.PI / 8); break;
      case ']': if (R.is3D()) AG.View3D.turn(Math.PI / 8); break;
      case 'n': if (R.is3D()) AG.View3D.north(); break;
    }
  }


  // ============================================================ per frame
  UI.frame = function (dt) {
    frameN++;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (God.possessed >= 0) { God.input.dx = dx; God.input.dy = dy; if (dx || dy) God.input.moveTo = null; }
    else if (dx || dy) R.pan(-dx * dt * 700, -dy * dt * 700);
    if (frameN % 10 === 0) hud();
    if (frameN % 8 === 0 && R.hover.on) $('#hoverinfo').innerHTML = cellInfo(R.hover.x | 0, R.hover.y | 0);
    const comp = $('#compass'), in3d = R.is3D();
    if (comp.hidden === in3d) comp.hidden = !in3d;
    if (in3d) comp.firstElementChild.style.transform = `rotate(${(AG.View3D.yaw * 180) / Math.PI}deg)`;
    const pad = $('#avatarpad'), poss = God.possessed >= 0;
    if (pad.hidden === poss) pad.hidden = !poss;
    if (poss && frameN % 30 === 0) $('#avatarwho').textContent = `${Ent.title(God.possessed)} ${Ent.name(God.possessed)}`.trim();
    if (!$('#panel').hidden) {
      if (UI.tab === 'chronicle' && AG.Chronicle.dirty && frameN % 6 === 0) renderPanel(false);
      else if (UI.tab === 'inspect' && frameN % 30 === 0 && !panelHover) renderPanel(false);
      else if ((UI.tab === 'peoples' || UI.tab === 'life' || UI.tab === 'world') && frameN % 60 === 0 && !panelHover) renderPanel(false);
    }
  };
  function worldEra() { let e = 0; for (const c of Civ.cities) if (c.alive && c.era > e) e = c.era; return Tech.ERAS[e]; }
  function hud() {
    const day = Sky.daylight();
    const sun = AG.mode === 'deep' ? '#ff9d4d' : day > 0.6 ? '#ffd166' : day > 0.15 ? '#f08a4b' : '#8aa2d8';
    let label;
    if (AG.mode === 'deep') label = `${Geo.mya.toFixed(1)} million years ago · ${Geo.plates.filter((p) => p.alive).length} plates`;
    else {
      const season = AG.mode === 'watch' ? ' · ' + Sky.SEASONS[Sky.season()] : '';
      const storm = AG.mode === 'watch' && Sky.storms.find((s) => Math.abs(s.x - R.cam.x) < 80 && Math.abs(s.y - R.cam.y) < 60);
      label = `${Geo.label()} · ${worldEra()}${season}${storm ? ' · ' + Sky.STORMS[storm.type].name : ''}`;
    }
    $('#clock').innerHTML = `<span class="sun" style="background:${sun}"></span>${esc(label)}`;
    const sea = Math.round(Geo.seaLevel * 2500);
    if (AG.mode === 'deep') $('#stats').innerHTML = `<b>${Life.alive().length}</b> species · <b>${Life.speciations}</b> splits · <b>${Life.extinctions}</b> extinctions`;
    else $('#stats').innerHTML = `<b>${fmt(People.alive)}</b> people · <b>${Civ.cities.filter((c) => c.alive).length}</b> communities · <b>${Life.alive().length}</b> species · sea ${sea >= 0 ? '+' : ''}${sea} m${AG.throttled ? ' · <span style="color:var(--war)">at capacity</span>' : ''}`;
  }
  function biome(i) {
    const f = Wd.fl[i];
    if (f > 0.004) { if (Wd.frozen[i]) return 'Ice'; if (Wd.ft[i] === FT.LAVA) return 'Lava'; if (Wd.ft[i] === FT.ACID) return 'Acid pool'; return f > 0.12 ? 'Deep water' : f > 0.04 ? 'Water' : 'Shallows'; }
    if (Wd.ice[i]) return 'Glacier';
    const s = Wd.soil[i], v = Wd.veg[i], T = Wd.T(i);
    if (Wd.bgrid[i]) return BUILD[Civ.buildings[Wd.bgrid[i] - 1].type].name;
    if (Wd.snow[i] > 120) return Wd.elev[i] > AG.PEAK ? 'Snowy peak' : 'Snowfield';
    switch (s) { case SO.SAND: return Wd.elev[i] < AG.SEA + 0.02 ? 'Beach' : 'Desert'; case SO.ROCK: return 'Mountain'; case SO.BASALT: return 'Lava field'; case SO.ASH: return 'Ash soil'; case SO.BLIGHT: return 'Blighted land'; case SO.ROAD: return 'Path'; case SO.FARM: return 'Field'; }
    if (v >= 165) return T < 0.3 ? 'Taiga' : T > 0.68 ? 'Jungle' : 'Forest';
    if (v >= 60) return T < 0.25 ? 'Tundra' : T > 0.66 ? 'Savanna' : Wd.cereal[i] > 60 ? 'Wild grassland (grain)' : 'Grassland';
    return 'Bare earth';
  }
  const UGNAME = ['Rock', 'Soft earth', 'Cavern', 'Mine tunnel', 'Iron ore', 'Gold vein', 'Crystal', 'Fungus grove', 'Bedrock', 'Copper ore', 'Tin ore', 'Coal seam', 'Salt bed'];
  function cellInfo(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return '';
    const i = y * W + x;
    if (AG.mode === 'deep') { const d = Geo.describe(x, y); return `<b>Plate ${d.plate}</b> · ${d.boundary}<br>${esc(d.rock)} · ${x}, ${y}`; }
    const c = Civ.cityAt(x, y);
    const owner = c ? `${esc(c.name)}, ${esc(Civ.kingdoms[c.kd].name)}` : 'Unclaimed';
    if (R.view === 0) { let m = UGNAME[Wd.ug[i]] || 'Rock'; if (Wd.ugF[i] > 10) m += Wd.ugT[i] === UF.MAGMA ? ' · magma' : ' · groundwater'; return `<b>${m}</b> · deep below ${owner}<br>${x}, ${y}`; }
    const elev = Math.round((Wd.elev[i] - AG.SEA) * 4000), temp = Math.round(Wd.T(i) * 45 - 8), r = Wd.res[i];
    return `<b>${biome(i)}</b> · ${owner}<br>${AG.ROCKS[Wd.rock[i]]}${r ? ' · ' + AG.RESOURCES[r] : ''} · ${elev >= 0 ? elev + ' m' : 'depth ' + -elev + ' m'} · ${temp} °C`;
  }

  // ============================================================ panel
  function renderPanel(force) {
    const pb = $('#pbody');
    switch (UI.tab) {
      case 'inspect': pb.innerHTML = inspectHTML(); break;
      case 'peoples': pb.innerHTML = peoplesHTML(); break;
      case 'life': pb.innerHTML = lifeHTML(); break;
      case 'chronicle': pb.innerHTML = historyHTML(); AG.Chronicle.dirty = false; break;
      case 'world': if (!worldBuilt || force) { pb.innerHTML = worldShell(); worldBuilt = true; } $('#wstats').innerHTML = worldStats(); break;
    }
  }
  UI.render = renderPanel;
  function panelClick(e) {
    const t = e.target.closest('[data-pid],[data-city],[data-kd],[data-sp],[data-x],[data-act],[data-dis],[data-sub],[data-whatif],[data-branch],[data-hf],[data-lang]');
    if (!t) return;
    if (t.dataset.pid) { UI.sel = { type: 'person', id: +t.dataset.pid }; setTab('inspect'); const P = People.get(+t.dataset.pid); if (P && P.died === null) { const c = Civ.cities[P.comm]; if (c) R.centerOn(P.body >= 0 ? U.x[P.body] : c.x, P.body >= 0 ? U.y[P.body] : c.y); } return; }
    if (t.dataset.city) { UI.sel = { type: 'city', id: +t.dataset.city }; setTab('inspect'); const c = Civ.cities[+t.dataset.city]; R.follow = -1; R.centerOn(c.x, c.y, Math.max(R.cam.z, 5)); return; }
    if (t.dataset.kd) { UI.sel = { type: 'kingdom', id: +t.dataset.kd }; setTab('inspect'); const c = Civ.capitalOf(Civ.kingdoms[+t.dataset.kd]); if (c) { R.follow = -1; R.centerOn(c.x, c.y); } return; }
    if (t.dataset.sp) { UI.sel = { type: 'species', id: +t.dataset.sp }; setTab('inspect'); return; }
    if (t.dataset.lang) { UI.sel = { type: 'lang', id: +t.dataset.lang }; setTab('inspect'); return; }
    if (t.dataset.sub) { UI.sub = t.dataset.sub; renderPanel(true); return; }
    if (t.dataset.hf) { UI.hfilter = t.dataset.hf; renderPanel(true); return; }
    if (t.dataset.whatif) { const r = History.whatIf(+t.dataset.whatif); UI.toast(r.ok ? `Rewound to year ${Math.floor(r.year + 1)}: this world will never know ${r.tech.toLowerCase()}.` : r.why); renderPanel(true); return; }
    if (t.dataset.branch) { History.switchBranch(+t.dataset.branch); UI.toast('Switched timelines.'); renderPanel(true); return; }
    if (t.dataset.x !== undefined) { const x = +t.dataset.x, y = +t.dataset.y; if (x >= 0) { R.follow = -1; R.centerOn(x, y, Math.max(R.cam.z, 4)); } return; }
    if (t.dataset.dis !== undefined) { diseaseEditor(+t.dataset.dis); return; }
    const a = t.dataset.act, i = selectedUnit();
    switch (a) {
      case 'follow': if (i >= 0) { R.follow = i; R.view = U.layer[i] === 0 ? 0 : 1; syncLayers(); if (R.cam.z < 4) R.setZoom(6); if (AG.mode !== 'watch') AG.setSpeed('1'); } else { const P = UI.sel && People.get(UI.sel.id); if (P) { const c = Civ.cities[P.comm]; if (c) { AG.setSpeed('1'); R.centerOn(c.x, c.y, 8); UI.toast('Watching their community; tap Follow again once they appear.'); } } } break;
      case 'possess': if (i >= 0) God.possess(i); break;
      case 'release': God.release(); break;
      case 'bless': if (i >= 0) { God.apply('bless', U.x[i], U.y[i], 3, 1, 1); } break;
      case 'smite': if (i >= 0) God.lightning(U.x[i], U.y[i], false); break;
      case 'dream': if (i >= 0) God.apply('dream', U.x[i], U.y[i], 1); break;
      case 'newworld': AG.newWorld(parseInt($('#seed').value, 10) || 0); break;
      case 'save': UI.save(); break;
      case 'load': $('#loadfile').click(); break;
      case 'timelapse': UI.timelapse(); break;
      case 'demo-emergence': AG.Demos.emergence(); break;
      case 'demo-sea': AG.Demos.risingSea(); break;
      case 'stress': AG.stress(4000); break;
      case 'newdisease': diseaseEditor(-1); break;
    }
    renderPanel(true);
  }
  function selectedUnit() {
    const s = UI.sel; if (!s) return -1;
    if (s.type === 'unit') return U.alive[s.id] ? s.id : -1;
    if (s.type === 'person') { const P = People.get(s.id); return P && P.died === null && P.body >= 0 && U.alive[P.body] && U.pid[P.body] === P.id ? P.body : -1; }
    return -1;
  }
  const bar = (label, v, max, color, right) => `<div class="row"><span>${label}</span><div class="bar"><i style="width:${AG.clamp((v / max) * 100, 0, 100).toFixed(1)}%${color ? ';background:' + color : ''}"></i></div><span>${right === undefined ? Math.round(v) : right}</span></div>`;
  const pct = (v) => Math.round(v * 100) + '%';
  function inspectHTML() {
    const s = UI.sel;
    if (!s) return `<p class="empty">Choose <b>Inspect</b> and tap a person, animal, building or territory. Every person has a genome, a family, likes and dislikes, memories and friends, and lives on whether or not you watch.</p>`;
    if (s.type === 'person') return personHTML(People.get(s.id));
    if (s.type === 'unit') return U.alive[s.id] ? animalHTML(s.id) : `<p class="empty">This creature is gone.</p>`;
    if (s.type === 'city') return cityHTML(Civ.cities[s.id]);
    if (s.type === 'kingdom') return polityHTML(Civ.kingdoms[s.id]);
    if (s.type === 'species') return speciesHTML(Life.species[s.id]);
    if (s.type === 'lang') return langHTML(Lang.get(s.id));
    return '';
  }
  function traitChips(t) {
    const out = [];
    for (const tr of TRAITS) if (t & tr.bit) {
      const cls = ['blessed', 'hero', 'veteran'].includes(tr.key) ? 'holy' : ['cursed', 'sickly', 'coward', 'cruel'].includes(tr.key) ? 'bad' : ['brave', 'kind', 'genius', 'swift', 'giant', 'longlived', 'fertile'].includes(tr.key) ? 'good' : '';
      out.push(`<span class="chip ${cls}" title="${esc(tr.desc)}">${tr.name}</span>`);
    }
    return out.length ? `<div class="chips">${out.join('')}</div>` : '<p class="muted">No notable traits</p>';
  }
  function personBtn(id, self) {
    const P = People.get(id);
    if (!P) return '<span class="p dead">forgotten</span>';
    return `<button type="button" class="p link${self ? ' self' : ''}${P.died === null ? '' : ' dead'}" data-pid="${id}">${esc(P.name)}${P.died === null ? '' : ' †'}</button>`;
  }
  function familyHTML(P) {
    const mom = People.get(P.mom), dad = People.get(P.dad);
    const grand = []; for (const p of [mom, dad]) if (p) for (const g of [p.mom, p.dad]) if (g) grand.push(g);
    const sibs = new Set(); for (const p of [mom, dad]) if (p) for (const k of p.kids) if (k !== P.id) sibs.add(k);
    const rows = [];
    if (grand.length) rows.push(`<div class="gen"><span class="lbl">Grandparents</span>${grand.map((g) => personBtn(g)).join('')}</div>`);
    rows.push(`<div class="gen"><span class="lbl">Parents</span>${mom || dad ? [P.mom, P.dad].filter(Boolean).map((g) => personBtn(g)).join('') : '<span class="muted">Among the first of their people</span>'}</div>`);
    rows.push(`<div class="gen"><span class="lbl">Self</span>${personBtn(P.id, true)}${P.spouse ? '<span class="muted">wed to</span>' + personBtn(P.spouse) : P.spouses.length ? '<span class="muted">widowed</span>' : ''}</div>`);
    if (sibs.size) rows.push(`<div class="gen"><span class="lbl">Siblings</span>${[...sibs].slice(0, 8).map((g) => personBtn(g)).join('')}${sibs.size > 8 ? `<span class="muted">+${sibs.size - 8}</span>` : ''}</div>`);
    if (P.kids.length) rows.push(`<div class="gen"><span class="lbl">Children</span>${P.kids.slice(0, 12).map((g) => personBtn(g)).join('')}${P.kids.length > 12 ? `<span class="muted">+${P.kids.length - 12}</span>` : ''}</div>`);
    return `<div class="tree">${rows.join('')}</div>`;
  }
  const SUBS = [['story', 'Story'], ['mind', 'Mind'], ['memories', 'Memories'], ['family', 'Family'], ['ties', 'Relations'], ['health', 'Health'], ['genes', 'Genes']];
  function personHTML(P) {
    if (!P) return '<p class="empty">This life has passed out of memory.</p>';
    const c = Civ.cities[P.comm], k = c ? Civ.kingdoms[c.kd] : null, i = P.body >= 0 && U.alive[P.body] && U.pid[P.body] === P.id ? P.body : -1;
    const age = Math.floor(People.age(P)), title = People.title(P);
    const dead = P.died !== null;
    let sub = `${P.sex ? 'man' : 'woman'} · ${age} years · ${dead ? 'died ' + yr(P.died) : AG.JOBS[P.job]}`;
    let h = `<div class="ihead"><span class="chipdot" style="background:${k ? k.css : '#888'}"></span><div><h2>${esc((title ? title + ' ' : '') + P.name)}${dead ? ' †' : ''}</h2><p class="muted">${esc(sub)}${c ? ` · <button type="button" class="link" data-city="${c.id}">${esc(c.name)}</button>` : ''}</p></div></div>`;
    if (i >= 0) {
      let doing = U.st[i] === 3 ? 'Fighting' : AG.TASKS[U.task[i]] || 'Idle';
      if (U.flags[i] & FL.POSSESSED) doing = 'Moved by your hand';
      h += `<p>${esc(doing)} · mood ${pct(People.mood(P))}</p>`;
      const poss = U.flags[i] & FL.POSSESSED;
      h += `<div class="btnrow"><button type="button" class="btn" data-act="follow">Follow</button><button type="button" class="btn${poss ? '' : ' primary'}" data-act="${poss ? 'release' : 'possess'}">${poss ? 'Release' : 'Possess'}</button><button type="button" class="btn" data-act="dream">Send a dream</button><button type="button" class="btn" data-act="bless">Bless</button></div>`;
    } else if (!dead) h += `<p class="muted">Not in view: living on their record. <button type="button" class="link" data-act="follow">Go and watch</button></p>`;
    h += `<div class="subtabs">${SUBS.map(([id, n]) => `<button type="button" class="${UI.sub === id ? 'on' : ''}" data-sub="${id}">${n}</button>`).join('')}</div>`;
    switch (UI.sub) {
      case 'mind': {
        if (!dead && P.needs) h += `<h3>Needs</h3><div class="rows">${['food', 'rest', 'social', 'safety', 'purpose'].map((n) => bar(n === 'social' ? 'company' : n, P.needs[n], 1, '#8fd16b', pct(P.needs[n]))).join('')}</div>`;
        if (P.emo) h += `<h3>Feelings</h3><div class="rows">${[['joy', '#ffd56b'], ['grief', '#8aa2d8'], ['fear', '#c9a7ec'], ['anger', '#ef5350'], ['love', '#f48fb1'], ['stress', '#ff9d4d']].map(([n, col]) => bar(n, P.emo[n], 1, col, pct(P.emo[n]))).join('')}${P.mental.depressed > 0.3 ? '<p class="muted">Low in spirits for a long time (depressed)</p>' : ''}</div>`;
        h += `<h3>Personality</h3><div class="rows">${[['open', 'Openness'], ['consc', 'Diligence'], ['extra', 'Sociability'], ['agree', 'Warmth'], ['neuro', 'Anxiety']].map(([k2, n]) => bar(n, P.pers[k2], 1, '#8fb3e0', pct(P.pers[k2]))).join('')}</div>`;
        h += `<h3>Traits</h3>${traitChips(P.traits)}`;
        const likes = People.likes(P, 5), dis = People.dislikes(P, 4);
        h += `<h3>Likes and dislikes</h3><div class="chips">${likes.map((l) => `<span class="chip good">likes ${esc(l)}</span>`).join('')}${dis.map((l) => `<span class="chip bad">dislikes ${esc(l)}</span>`).join('')}${likes.length + dis.length ? '' : '<span class="muted">Easy to please, hard to delight</span>'}</div>`;
        const faith = P.belief.faith >= 0 && Civ.religions[P.belief.faith] ? Civ.religions[P.belief.faith].name : 'the spirits and the ancestors';
        h += `<h3>Beliefs</h3><dl class="kv"><dt>Faith</dt><dd>${esc(faith)}</dd><dt>Devotion</dt><dd>${pct(P.belief.devotion)}</dd><dt>Outlook</dt><dd>${P.belief.tradition > 0.6 ? 'Keeps to the old ways' : P.belief.tradition < 0.4 ? 'Open to new ways' : 'Weighs old and new'}</dd><dt>Life goal</dt><dd>${P.goal >= 0 ? GOALS[P.goal] + (P.goalDone ? ' (achieved)' : '') : 'Too young to say'}</dd>${P.invented.length ? `<dt>Discovered</dt><dd>${P.invented.map((t) => esc(Tech.LIST[Tech.IDX[t]].name)).join(', ')}</dd>` : ''}</dl>`;
        h += `<h3>Skills</h3><div class="rows">${SKILLS.map((s2, q) => bar(s2, P.skills[q], 100, '#8fb3e0')).join('')}</div>`;
        break;
      }
      case 'memories': {
        if (!P.mem.length) { h += '<p class="muted">Nothing memorable yet.</p>'; break; }
        h += `<ul class="log">${P.mem.slice().sort((a, b) => b.t - a.t).map((m) => `<li style="opacity:${(0.45 + Math.min(1, m.s) * 0.55).toFixed(2)}"><span>${yr(m.t)}</span>${esc(People.memText(P, m))}${m.dist ? ' <em class="muted">(remembered differently)</em>' : ''}${m.v <= -0.6 ? ' <em class="bad">·</em>' : ''}</li>`).join('')}</ul><p class="muted" style="font-size:12px">Fainter lines are fading from memory. Memories drift as years pass, and rumours arrive second-hand.</p>`;
        break;
      }
      case 'family': h += familyHTML(P); break;
      case 'ties': {
        const list = [...P.ties.entries()].sort((a, b) => Math.abs(b[1].aff) - Math.abs(a[1].aff)).slice(0, 18);
        if (!list.length) { h += '<p class="muted">No close ties yet.</p>'; break; }
        const kinds = (t) => [t.k & 16 ? 'spouse' : '', t.k & 1 ? 'family' : '', t.k & 2 ? 'friend' : '', t.k & 4 ? 'rival' : '', t.k & 128 ? 'enemy' : '', t.k & 32 ? 'mentor' : '', t.k & 64 ? 'student' : ''].filter(Boolean).join(', ');
        h += `<div class="rows">${list.map(([id, t]) => `<div class="tie">${personBtn(id)}<span class="muted">${kinds(t) || 'acquaintance'}</span><div class="opbar"><i style="${t.aff >= 0 ? `left:50%;width:${t.aff * 50}%;background:var(--peace)` : `right:50%;width:${-t.aff * 50}%;background:var(--war)`}"></i></div></div>`).join('')}</div><p class="muted" style="font-size:12px">Bars show how ${esc(P.name)} feels about each person (their view may not be returned).</p>`;
        break;
      }
      case 'health': {
        h += `<dl class="kv"><dt>Health</dt><dd>${pct(People.health(P))}</dd><dt>Frailty</dt><dd>${pct(P.frail)}</dd><dt>Nutrition</dt><dd>${pct(P.nutr)}</dd>${P.preg ? `<dt>Pregnant</dt><dd>${Math.round(P.preg.t / 0.75 * 9)} months</dd>` : ''}${P.dis ? `<dt>Ill</dt><dd>${esc(AG.DISEASES[P.dis - 1] ? AG.DISEASES[P.dis - 1].name : 'sick')}</dd>` : ''}</dl>`;
        h += `<h3>Body</h3><div class="rows">${People.PARTS.map((n, q) => bar(n, P.parts[q], 1, '#ef5350', P.disabled & (1 << q) ? 'lost use' : P.parts[q] > 0.05 ? pct(P.parts[q]) : 'well')).join('')}</div>`;
        const ch = P.chronic.slice(); if (P.mental.trauma > 0.2) ch.push('haunted by memories'); if (P.mental.depressed > 0.4) ch.push('melancholy');
        h += `<h3>Conditions</h3><div class="chips">${ch.map((x) => `<span class="chip bad">${esc(x)}</span>`).join('') || '<span class="muted">None</span>'}${AG.DISEASES.filter((_, q) => P.imm & (1 << q)).map((d) => `<span class="chip good">immune: ${esc(d.name)}</span>`).join('')}</div>`;
        break;
      }
      case 'genes': h += genomeHTML(P.gen, 0) + `<p class="muted" style="font-size:12px">Two alleles at each of 16 loci, one from each parent. Pigment follows Mendel: a pale albino allele is recessive and a dark melanic one is dominant.${Life.carrier(P.gen, 0) ? ` <b>${esc(P.name)} carries a hidden albino allele.</b>` : ''}</p>`; break;
      default: h += `<p class="bio">${esc(People.biography(P))}</p>`;
    }
    return h;
  }
  function genomeHTML(g, o) {
    let h = '<div class="rows genes">';
    for (let k = 0; k < Life.NL; k++) {
      const a = g[o + 2 * k], b = g[o + 2 * k + 1], v = Life.express(g, o, k);
      h += `<div class="row"><span>${Life.LOCI[k]}</span><div class="bar"><i style="width:${(v / 2.55).toFixed(1)}%${k === Life.L.HUE ? `;background:hsl(25,40%,${(85 - v / 4.2).toFixed(0)}%)` : ''}"></i></div><span class="num" title="alleles">${a}/${b}</span></div>`;
    }
    return h + '</div>';
  }
  function animalHTML(i) {
    const s = U.sid[i] >= 0 ? Life.species[U.sid[i]] : null, d = SPECIES[U.sp[i]];
    if (!s) {
      const k = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]] : null;
      return `<div class="ihead"><span class="chipdot" style="background:${k ? k.css : '#aaa'}"></span><div><h2>${esc(d.name)}</h2><p class="muted">${k ? 'of the ' + esc(k.name) : ''}</p></div></div><p>${esc(AG.TASKS[U.task[i]] || 'Idle')}</p>`;
    }
    let h = `<div class="ihead"><span class="chipdot" style="background:${AG.css(s.color)}"></span><div><h2>${esc(AG.Lang.cap(s.common))}</h2><p class="muted"><button type="button" class="link" data-sp="${s.id}"><i>${esc(s.name)}</i></button> · ${U.sex[i] ? 'male' : 'female'} · ${U.age[i].toFixed(1)} years${U.flags[i] & FL.DOMESTIC ? ' · domestic' : ''}</p></div></div>`;
    h += `<p>${esc(U.st[i] === 3 ? 'Fighting' : AG.TASKS[U.task[i]] || 'Idle')}${U.preg[i] > 0 ? ' · pregnant' : ''}</p>${bar('Health', U.hp[i], U.mhp[i], 'var(--war)', Math.ceil(U.hp[i]))}${bar('Energy', U.energy[i], 1, '#8fd16b', pct(U.energy[i]))}`;
    const poss = U.flags[i] & FL.POSSESSED;
    h += `<div class="btnrow"><button type="button" class="btn" data-act="follow">Follow</button><button type="button" class="btn${poss ? '' : ' primary'}" data-act="${poss ? 'release' : 'possess'}">${poss ? 'Release' : 'Possess'}</button><button type="button" class="btn" data-act="smite">Smite</button></div>`;
    h += `<h3>Genome</h3>${genomeHTML(U.gen, i * Life.GL)}`;
    return h;
  }
  function speciesHTML(s) {
    if (!s) return '';
    const par = s.parent >= 0 ? Life.species[s.parent] : null;
    let h = `<div class="ihead"><span class="chipdot" style="background:${AG.css(s.color)}"></span><div><h2><i>${esc(s.name)}</i></h2><p class="muted">${esc(AG.Lang.cap(s.common))} · ${Life.ARCHS[s.arch]}${s.sapient ? ' · sapient' : ''}${s.domestic ? ' · domesticated' : ''}</p></div></div>`;
    h += `<dl class="kv"><dt>Arose</dt><dd>${Life.whenLabel(s.born)}</dd>${s.died ? `<dt>Extinct</dt><dd>${Life.whenLabel(s.died)} · ${esc(s.cause)}</dd>` : `<dt>Living</dt><dd>${s.sapient ? fmt(People.alive) + ' people' : fmt(s.census) + ' (in ' + s.regions.size + ' regions)'}</dd>`}<dt>Descended from</dt><dd>${par ? `<button type="button" class="link" data-sp="${par.id}"><i>${esc(par.name)}</i></button>` : 'a founding lineage'}</dd>${s.kids.length ? `<dt>Gave rise to</dt><dd>${s.kids.map((k) => `<button type="button" class="link" data-sp="${k}"><i>${esc(Life.species[k].name)}</i></button>`).join(', ')}</dd>` : ''}</dl>`;
    h += `<h3>Typical traits</h3><div class="rows">${Life.LOCI.map((n, k) => k === Life.L.MATE || k === Life.L.NEUTRAL ? '' : bar(n, s.mean[k], 255)).join('')}</div>`;
    h += `<h3>Lineage</h3><p class="muted">${Life.lineage(s).reverse().map((x) => `<button type="button" class="link" data-sp="${x.id}"><i>${esc(x.name)}</i></button>`).join(' → ')}</p>`;
    return h;
  }
  function langHTML(L) {
    if (!L) return '';
    const sp = Civ.cities.filter((c) => c.alive && c.lang === L.id);
    const par = L.parent >= 0 ? Lang.get(L.parent) : null;
    let h = `<div class="ihead"><span class="chipdot" style="background:${AG.css(AG.hsl((L.family * 97 + 30) % 360, 0.6, 0.5))}"></span><div><h2>${esc(L.name)}</h2><p class="muted">${par ? 'daughter of <button type="button" class="link" data-lang="' + par.id + '">' + esc(par.name) + '</button>' : 'a mother tongue'} · ${fmt(L.speakers || 0)} speakers</p></div></div>`;
    h += `<h3>Sounds</h3><p class="muted">${esc(L.ph.C.join(' '))} · ${esc(L.ph.V.join(' '))}</p>`;
    h += `<h3>Words</h3><dl class="kv">${['people', 'water', 'fire', 'sun', 'mother', 'river', 'stone', 'god', 'king', 'friend'].map((m) => `<dt>${m}</dt><dd><i>${esc(L.lex[m])}</i></dd>`).join('')}</dl>`;
    if (L.log.length) h += `<h3>Sound changes</h3><ul class="log">${L.log.slice().reverse().slice(0, 10).map((e) => `<li><span>${yr(e.year)}</span>${esc(e.rule)}</li>`).join('')}</ul>`;
    if (L.kids.length) h += `<h3>Daughter languages</h3><p>${L.kids.map((k) => `<button type="button" class="link" data-lang="${k}">${esc(Lang.get(k).name)}</button>`).join(', ')}</p>`;
    if (sp.length) h += `<h3>Spoken in</h3><p>${sp.slice(0, 12).map((c) => `<button type="button" class="link" data-city="${c.id}">${esc(c.name)}</button>`).join(', ')}</p>`;
    return h;
  }
  function cityHTML(c) {
    if (!c) return '';
    const k = Civ.kingdoms[c.kd], bc = Civ.counts(c, true), site = c.site >= 0 ? Civ.buildings[c.site] : null;
    const rel = c.religion >= 0 ? Civ.religions[c.religion] : null, L = Lang.get(c.lang);
    let h = `<div class="ihead"><img class="banner" src="${R.bannerURL(k)}" alt=""><div><h2>${esc(c.name)}${c.alive ? '' : ' (abandoned)'}</h2><p class="muted">${AG.Lang.cap(c.kind)} of <button type="button" class="link" data-kd="${k.id}">${esc(k.name)}</button> · ${Tech.ERAS[c.era]}</p></div></div>`;
    h += `<dl class="kv"><dt>People</dt><dd>${c.members.length}${c.K ? ` · the land feeds ~${Math.round(c.K)}` : ''}</dd><dt>Way of life</dt><dd>${c.nomadic ? 'Nomadic foragers, moving camp with the seasons' : 'Settled'}</dd><dt>Founded</dt><dd>${yr(c.founded)}</dd><dt>Language</dt><dd>${L ? `<button type="button" class="link" data-lang="${L.id}">${esc(L.name)}</button>` : '—'}</dd><dt>Faith</dt><dd>${rel ? esc(rel.name) : 'the spirits and the ancestors'}</dd><dt>Fed</dt><dd>${pct(c.nutr)}${c.famine ? ' · <span style="color:var(--war)">famine</span>' : ''}</dd>${site ? `<dt>Building</dt><dd>${BUILD[site.type].name} · ${Math.round(site.prog * 100)}%</dd>` : ''}${c.materialized ? '<dt>In view</dt><dd>everyone here is embodied</dd>' : ''}</dl>`;
    const cu = c.customs; h += `<h3>Customs</h3><div class="chips"><span class="chip">${cu.marriage}</span><span class="chip">${cu.residence}</span><span class="chip">${cu.burial}</span><span class="chip">feast of ${cu.festival}</span>${cu.taboo !== 'none' ? `<span class="chip">taboo: ${cu.taboo}</span>` : ''}</div>`;
    if (c.jobs) h += `<h3>Work</h3><div class="chips">${AG.JOBS.map((j, q) => (c.jobs[q] ? `<span class="chip">${j} ×${c.jobs[q]}</span>` : '')).join('')}</div>`;
    h += `<h3>Stores</h3><dl class="kv"><dt>Food</dt><dd>${c.food.toFixed(1)} years' worth</dd><dt>Wood · stone · metal</dt><dd>${fmt(c.wood)} · ${fmt(c.stone)} · ${fmt(c.metal)}</dd><dt>Goods · gold</dt><dd>${fmt(c.goods)} · ${fmt(c.gold)}</dd>${c.herd ? `<dt>Herd</dt><dd>${fmt(c.herd)} ${esc(Life.species[c.herdSpecies] ? Life.species[c.herdSpecies].common : 'animals')}</dd>` : ''}</dl>`;
    h += `<h3>Knowledge</h3>${techTree(c)}`;
    const bl = BUILD.map((b, t) => (bc[t] ? `<span class="chip">${b.name}${bc[t] > 1 ? ' ×' + bc[t] : ''}</span>` : '')).join('');
    h += `<h3>Buildings</h3><div class="chips">${bl || '<span class="muted">None</span>'}</div>`;
    const ppl = c.members.map(People.get).filter(Boolean).sort((a, b) => b.fame + b.rank * 3 - (a.fame + a.rank * 3)).slice(0, 14);
    h += `<h3>People</h3><p>${ppl.map((P) => personBtn(P.id)).join(' ')}${c.members.length > 14 ? ` <span class="muted">and ${c.members.length - 14} more</span>` : ''}</p>`;
    const nbrs = [...c.contacts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (nbrs.length) h += `<h3>In touch with</h3><div class="chips">${nbrs.map(([id]) => `<button type="button" class="chip link" data-city="${id}">${esc(Civ.cities[id].name)}${c.grievance.get(id) > 2 ? ' · grudge' : ''}</button>`).join('')}</div>`;
    return h;
  }
  function techTree(c) {
    let h = '<div class="ttree">';
    for (let e = 0; e < Tech.ERAS.length; e++) {
      const list = Tech.LIST.filter((t) => t.era === e);
      h += `<div class="tcol"><div class="head">${Tech.ERAS[e]}</div>${list.map((t) => {
        const known = c.tech[t.id], ready = !known && Tech.prereqsMet(c, t), banned = Tech.banned.has(t.key);
        return `<div class="node${known ? ' got' : ready ? ' next' : ''}${banned ? ' banned' : ''}" title="${esc(t.desc + (t.pre.length ? ' — needs ' + t.pre.map((p) => Tech.LIST[Tech.IDX[p]].name).join(', ') : ''))}${known && c.techYear[t.key] !== undefined ? ' (learned ' + yr(c.techYear[t.key]) + ')' : ''}">${esc(t.name)}</div>`;
      }).join('')}</div>`;
    }
    return h + '</div><p class="muted" style="font-size:12px">Bright: known. Outlined: within reach (prerequisites known). Hover for what each needs.</p>';
  }
  function polityHTML(k) {
    if (!k) return '';
    const ruler = k.ruler ? People.get(k.ruler) : null, cap = Civ.capitalOf(k), L = Lang.get(k.lang);
    let h = `<div class="ihead"><img class="banner" src="${R.bannerURL(k)}" alt=""><div><h2>${esc(k.name)}</h2><p class="muted">${Civ.GOVS[k.gov]} · ${L ? esc(L.name) + ' speakers' : ''} · since ${yr(k.founded)}${k.alive ? '' : ' · gone ' + yr(k.fell)}</p></div></div>`;
    h += `<dl class="kv"><dt>${k.gov >= 3 ? 'Ruler' : k.gov === 2 ? 'Chief' : k.gov === 1 ? 'Headman' : 'Elders'}</dt><dd>${ruler && ruler.died === null ? personBtn(ruler.id) : k.gov === 0 ? 'Bands decide together' : 'None'}</dd><dt>Seat</dt><dd>${cap ? `<button type="button" class="link" data-city="${cap.id}">${esc(cap.name)}</button>` : '—'}</dd><dt>People</dt><dd>${fmt(k.pop)} in ${k.cities.length} ${k.cities.length === 1 ? 'community' : 'communities'}</dd><dt>Battles</dt><dd>${k.kills} slain · ${k.losses} lost</dd></dl>`;
    h += `<h3>State of the realm</h3><div class="rows">${bar('Stability', (k.stability + 1) / 2, 1, k.stability < 0 ? 'var(--war)' : 'var(--peace)', k.stability.toFixed(2))}${bar('Legitimacy', k.legit, 1, '#ffd56b', pct(k.legit))}${bar('Inequality', k.inequality, 1, '#ff9d4d', k.inequality.toFixed(2))}</div>`;
    if (k.inst.length) h += `<h3>Institutions</h3><div class="rows">${k.inst.map((I) => `<div class="row"><span>${Civ.INSTITUTIONS[I.kind]}</span><div class="bar"><i style="width:${(I.str * 100).toFixed(0)}%"></i></div><span title="corruption">${I.corrupt > 0.5 ? '<b style="color:var(--war)">corrupt</b>' : 'corruption ' + pct(I.corrupt)}</span></div>`).join('')}</div>`;
    const rel = k.religion >= 0 ? Civ.religions[k.religion] : null;
    h += `<h3>Faith</h3>`;
    if (rel) h += `<p><b>${esc(rel.name)}</b></p><p class="muted">${esc(AG.TENET_DESC[rel.tenet] || '')}</p>${rel.deities.map((d) => `<p class="deity"><b>${esc(d.name)}</b> ${esc(d.epithet)} <span class="muted">· ${d.domain === 'watcher' ? 'you' : d.domain}${d.myth ? ' — ' + esc(d.myth) : ''}</span></p>`).join('')}`;
    else h += `<p class="muted">They honour the spirits and their ancestors. An organised faith will take shape from what they live through once they raise a sacred place.</p>`;
    const exp = Object.entries(k.exp).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (exp.length) { const mx = exp[0][1]; h += `<h3>What shaped them</h3><div class="rows">${exp.map(([dm, v]) => bar(dm === 'watcher' ? 'your hand' : dm, v, mx, '#c9a7ec', v.toFixed(1))).join('')}</div>`; }
    const others = Civ.kingdoms.filter((o) => o.alive && o !== k && (k.war[o.id] || Math.abs(k.opinion[o.id]) > 8 || k.ally[o.id])).slice(0, 12);
    if (others.length) h += `<h3>Relations</h3><div class="rows">${others.map((o) => { const op = k.opinion[o.id], war = k.war[o.id]; const fill = op >= 0 ? `left:50%;width:${op / 2}%;background:var(--peace)` : `right:50%;width:${-op / 2}%;background:var(--war)`; return `<div class="rel"><button type="button" class="link" data-kd="${o.id}" style="text-align:left">${esc(o.name)}</button><div class="opbar"><i style="${fill}"></i></div><span class="tag ${war ? 'war' : 'peace'}">${war ? 'War' : k.ally[o.id] ? 'Allies' : k.tribute[o.id] >= 0 ? 'Tribute' : op > 30 ? 'Friends' : 'Peace'}</span></div>`; }).join('')}</div>`;
    const ev = History.events.filter((e) => e.polity === k.id).slice(-8).reverse();
    if (ev.length) h += `<h3>Their story</h3><ul class="chron">${ev.map((e) => `<li class="k-${e.kind}"${e.x >= 0 ? ` data-x="${e.x | 0}" data-y="${e.y | 0}"` : ''}><span class="yr">${yr(e.year)}</span><span>${esc(e.text)}${e.cause ? ` <em class="muted">— ${esc(e.cause)}</em>` : ''}</span></li>`).join('')}</ul>`;
    return h;
  }

  // ============================================================ Peoples, Life, History
  function peoplesHTML() {
    if (AG.mode === 'deep') return '<p class="empty">No people yet. Their ancestors are still small primates in the forests of the drifting continents.</p>';
    const alive = Civ.kingdoms.filter((k) => k.alive).sort((a, b) => b.pop - a.pop);
    let h = `<h2>Peoples</h2><p class="muted" style="font-size:13px">${fmt(People.alive)} people · ${alive.length} peoples · ${Lang.list.filter((L) => L.speakers).length} living languages</p>`;
    h += alive.slice(0, 40).map((k) => {
      const cap = Civ.capitalOf(k), era = Math.max(...k.cities.map((id) => Civ.cities[id].era));
      const wars = Civ.kingdoms.filter((o) => k.war[o.id]).map((o) => o.name);
      return `<div class="realm" data-kd="${k.id}"><img class="banner" src="${R.bannerURL(k)}" alt=""><div style="min-width:0"><div class="nm">${esc(k.name)}</div><div class="meta">${Civ.GOVS[k.gov]} · ${Tech.ERAS[era]} · ${fmt(k.pop)} people · ${k.cities.length} ${k.cities.length === 1 ? 'community' : 'communities'}</div>${wars.length ? `<div class="meta" style="color:var(--war)">At war with ${esc(wars.slice(0, 2).join(', '))}</div>` : ''}</div></div>`;
    }).join('');
    h += `<h3>Languages</h3><div class="phylo">${Lang.tree().map(({ L, d }) => `<button type="button" class="prow${L.speakers ? '' : ' dead'}" data-lang="${L.id}" style="padding-left:${6 + d * 14}px">${d ? '└ ' : ''}${esc(L.name)} <span class="muted">${L.speakers ? fmt(L.speakers) + ' speakers' : 'no longer spoken'}</span></button>`).join('')}</div>`;
    return h;
  }
  function lifeHTML() {
    const rows = Life.tree();
    let h = `<h2>The tree of life</h2><p class="muted" style="font-size:13px">${Life.alive().length} living species · ${Life.speciations} splits · ${Life.extinctions} extinctions · ${Life.massExtinctions} mass extinctions${Life.macro ? ` · ${fmt(Life.macro)} large mutations` : ''}</p>`;
    h += `<div class="phylo">${rows.map(({ s, depth }) => `<button type="button" class="prow${s.died ? ' dead' : ''}${s.sapient ? ' sapient' : ''}" data-sp="${s.id}" style="padding-left:${6 + Math.min(depth, 14) * 12}px"><i class="sw" style="background:${AG.css(s.color)}"></i>${depth ? '└ ' : ''}<i>${esc(s.name)}</i> <span class="muted">${esc(s.common)}${s.died ? ' · † ' + Life.whenLabel(s.died) : s.sapient ? ' · ' + fmt(People.alive) : ''}</span></button>`).join('')}</div>`;
    h += `<p class="muted" style="font-size:12px">Species split when seas and mountains part their ranges and their mating signals drift apart. Tap one to see its traits and lineage.</p>`;
    return h;
  }
  const HF = { key: ['dawn', 'genesis', 'era', 'invention', 'government', 'settle', 'language', 'collapse', 'conquest', 'faith', 'eruption', 'quake', 'flood', 'tsunami', 'famine', 'plague', 'speciation', 'extinction', 'domestication', 'migration', 'god', 'omen', 'loss', 'rebellion', 'law'], inventions: ['invention', 'era', 'loss'], people: ['ruler', 'death', 'hero', 'government', 'institution', 'reform', 'law', 'collapse', 'rebellion'], war: ['war', 'raid', 'battle', 'conquest', 'march', 'peace', 'alliance'], land: ['quake', 'eruption', 'flood', 'tsunami', 'migration', 'famine', 'plague'], all: null };
  function historyHTML() {
    let h = '<h2>History</h2>';
    const tl = Tech.timeline().filter((t) => t.first);
    if (tl.length) h += `<div class="eras">${tl.map((t) => `<div class="era"><b>${t.era}</b><span>${yr(t.first.year)} · ${esc(t.first.name)}</span></div>`).join('')}</div>`;
    if (History.eraMaps.length) h += `<div class="maps">${History.eraMaps.slice(-6).map((m) => `<figure><img src="${m.url}" alt=""><figcaption>${esc(m.label)}</figcaption></figure>`).join('')}</div>`;
    if (History.branches.length) h += `<h3>Other timelines</h3><div class="btnrow" style="margin-top:0">${History.branches.map((b, k) => `<button type="button" class="btn" data-branch="${k}">${esc(b.label)}</button>`).join('')}</div>`;
    h += `<div class="subtabs">${Object.keys(HF).map((k) => `<button type="button" class="${UI.hfilter === k ? 'on' : ''}" data-hf="${k}">${k === 'key' ? 'Turning points' : k === 'land' ? 'Land & sickness' : AG.Lang.cap(k)}</button>`).join('')}</div>`;
    const want = HF[UI.hfilter];
    const list = History.events.filter((e) => !want || want.includes(e.kind));
    if (!list.length) return h + '<p class="empty">Nothing yet.</p>';
    h += '<ul class="chron">';
    for (let k = list.length - 1, n = 0; k >= 0 && n < 200; k--, n++) {
      const e = list[k];
      const when = e.year < 0 ? `${(-e.year / 1e6).toFixed(0)} Mya` : yr(e.year);
      h += `<li class="k-${AG.Chronicle && e.kind}"${e.x >= 0 ? ` data-x="${e.x | 0}" data-y="${e.y | 0}"` : ''}><span class="yr">${when}</span><span>${esc(e.text)}${e.cause ? ` <em class="muted">— ${esc(e.cause)}</em>` : ''}${e.kind === 'invention' && e.first && e.tech ? ` <button type="button" class="link whatif" data-whatif="${e.id}" title="Rewind and run history without this invention">What if this never happened?</button>` : ''}</span></li>`;
    }
    return h + '</ul>';
  }
  function worldShell() {
    return `<h2>World</h2><p class="muted" style="font-size:13px">Seed <span class="num">${AG.seed}</span></p><div id="wstats"></div>
      <h3>Time</h3><div class="btnrow" style="margin-top:0"><button type="button" class="btn" data-act="timelapse">Time-lapse of the continents</button></div>
      <h3>Save and load</h3><div class="btnrow" style="margin-top:0"><button type="button" class="btn" data-act="save">Save world…</button><button type="button" class="btn" data-act="load">Load world…</button></div>
      <h3>Scenarios</h3><p class="muted" style="font-size:13px">Ready-made worlds that show the systems at work.</p>
      <div class="btnrow" style="margin-top:4px"><button type="button" class="btn" data-act="demo-emergence">Emergence: from bands to the first eras</button><button type="button" class="btn" data-act="demo-sea">Rising sea: a land bridge drowns</button></div>
      <h3>Shape the next world</h3>
      <div class="btnrow" style="margin-top:0"><input id="seed" type="number" class="hudbtn" style="width:130px" placeholder="Random seed" aria-label="World seed"><button type="button" class="btn primary" data-act="newworld">New world</button></div>
      <h3>Stress test</h3><div class="btnrow" style="margin-top:4px"><button type="button" class="btn" data-act="stress">Add 4,000 animals</button></div>`;
  }
  function worldStats() {
    const S = AG.stats, ms = AG.Sim.stats.ms;
    let h = `<h3>Life and people</h3><dl class="kv"><dt>People</dt><dd>${fmt(People.alive)} alive · ${fmt(People.births)} born · ${fmt(People.deaths)} died</dd><dt>Embodied now</dt><dd>${fmt(Civ.embodied)} people · ${Civ.cities.filter((c) => c.materialized).length} communities in view</dd><dt>Animals in view</dt><dd>${fmt(Ent.count[SP.GRAZER])} grazers · ${fmt(Ent.count[SP.PREDATOR])} predators · ${fmt(Ent.count[SP.BIRD])} birds · ${fmt(Ent.count[SP.APE])} apes</dd><dt>Species</dt><dd>${Life.alive().length} living of ${Life.species.length}</dd><dt>Languages</dt><dd>${Lang.list.filter((L) => L.speakers).length} spoken · ${Lang.splits} splits · ${Lang.changes} sound changes</dd><dt>Inventions</dt><dd>${Tech.discoveries} discoveries · ${Tech.losses} forgotten${Tech.banned.size ? ` · banned in this timeline: ${[...Tech.banned].join(', ')}` : ''}</dd></dl>`;
    h += `<h3>The land</h3><dl class="kv"><dt>Plates</dt><dd>${Geo.plates.filter((p) => p.alive).length} · ${Geo.splits} rifts · ${Geo.sutures} sutures</dd><dt>Sea level</dt><dd>${Math.round(Geo.seaLevel * 2500)} m · ice ${pct(Geo.iceVol)}</dd><dt>Quakes · eruptions</dt><dd>${fmt(Geo.quakes)} · ${fmt(Geo.eruptions)}</dd><dt>Climate</dt><dd>${Geo.climate.anomaly >= 0 ? '+' : ''}${(Geo.climate.anomaly * 45).toFixed(1)} °C${Geo.climate.aerosol > 0.01 ? ' · volcanic winter' : ''}</dd></dl>`;
    const cases = new Int32Array(AG.DISEASES.length);
    for (const P of People.map.values()) if (P.died === null && P.dis) cases[P.dis - 1]++;
    h += `<h3>Diseases</h3><dl class="kv">${AG.DISEASES.map((d, k) => `<dt><button type="button" class="link" data-dis="${k}" style="color:${d.color}">${esc(d.name)}</button></dt><dd>${cases[k] ? cases[k] + ' sick' : 'dormant'}</dd>`).join('')}</dl><div class="btnrow" style="margin-top:6px"><button type="button" class="btn" data-act="newdisease">Design a disease…</button></div>`;
    const T = (k) => (ms[k] || 0).toFixed(2);
    h += `<h3>Engine</h3><dl class="kv"><dt>Frame rate</dt><dd>${S.fps.toFixed(0)} fps</dd><dt>Clock</dt><dd>${AG.mode === 'watch' ? `${S.tps.toFixed(0)} ticks/s · ${S.simMs.toFixed(2)} ms/tick` : AG.mode === 'history' ? `${S.yps.toFixed(0)} years/s` : `${(S.myps || 0).toFixed(1)} Myr/s`}</dd><dt>Per system (ms)</dt><dd>geology ${T('geo')} · life ${T('life')} · civilisation ${T('civ')} · world ${T('world')} · physics ${T('physics')} · AI ${T('ai')} · weather ${T('sky')}</dd><dt>Rendering</dt><dd>${S.renderMs.toFixed(1)} ms per frame</dd><dt>Snapshots</dt><dd>${History.snaps.length} kept for counterfactuals</dd><dt>3D view</dt><dd>${!AG.View3D.ok ? 'unavailable (no WebGL)' : AG.View3D.active ? `on · ${AG.View3D.stats.window}² cells` : 'zoom past 8× to enter'}</dd></dl>`;
    return h;
  }

  // ============================================================ save, load, time-lapse
  UI.save = function () {
    try {
      const blob = new Blob([History.serialize()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aura-genesis2-${AG.seed}-y${Math.floor(Geo.year + 1)}.aura2.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      UI.toast('World saved to a file.');
    } catch (e) { UI.toast('Could not save: ' + e.message); }
  };
  UI.load = function (file) {
    const fr = new FileReader();
    fr.onload = () => { try { AG.Civ.foldAll(); History.deserialize(fr.result); AG.UI.reset(); AG.syncAfterLoad && AG.syncAfterLoad(); UI.toast('World loaded.'); } catch (e) { UI.toast('Could not load: ' + e.message); } };
    fr.readAsText(file);
  };
  UI.timelapse = function () {
    const F = Geo.frames; if (!F.length) { UI.toast('No frames recorded yet.'); return; }
    openModal(`<h2>Time-lapse</h2><p class="muted" id="tl-label"></p><canvas id="tl" width="${Geo.GW}" height="${Geo.GH}" style="width:100%;image-rendering:pixelated;border-radius:8px"></canvas><input id="tl-pos" type="range" min="0" max="${F.length - 1}" value="0" style="width:100%"><div class="btnrow"><button type="button" class="btn" onclick="AG.UI.closeModal()">Close</button></div>`);
    const cv = $('#tl'), x = cv.getContext('2d'), img = x.createImageData(Geo.GW, Geo.GH), px = new Uint32Array(img.data.buffer);
    let k = 0, playing = true;
    const draw = () => {
      const f = F[k]; if (!f) return;
      for (let c = 0; c < Geo.GN; c++) {
        const e = f.e[c] / 255, sea = 0.4;
        if (e < sea) px[c] = AG.pack(20 + e * 60, 60 + e * 150, 120 + e * 200);
        else { const t = Math.min(1, (e - sea) / 0.5); px[c] = AG.pack(80 + t * 120, 140 - t * 20, 60 + t * 80); }
      }
      x.putImageData(img, 0, 0);
      $('#tl-label').textContent = f.year ? `Year ${Math.floor(f.year + 1)}` : `${f.mya.toFixed(0)} million years ago`;
      $('#tl-pos').value = k;
    };
    $('#tl-pos').addEventListener('input', (e) => { k = +e.target.value; playing = false; draw(); });
    const tick = () => { if ($('#modal').hidden || !$('#tl')) return; if (playing) { k = (k + 1) % F.length; draw(); } setTimeout(tick, 90); };
    draw(); tick();
  };
  AG.onEraMap = function (e) {
    try { const m = $('#minimap'); History.eraMaps.push({ year: e.year, label: `${yr(e.year)}: ${Tech.ERAS[e.era]}`, url: m.toDataURL() }); if (History.eraMaps.length > 12) History.eraMaps.shift(); } catch (err) { /* headless */ }
  };

  // ============================================================ modals
  function openModal(html) { $('#modalbox').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; }
  UI.closeModal = closeModal;
  function help() {
    openModal(`<h2>A god of deep time</h2><p class="muted">The world begins 250 million years ago as one supercontinent. Watch the plates drift (Ages), or skip to the Dawn, when the cleverest primates become people. Then history runs on its own: bands spread, languages split, and wherever conditions allow, farming, metal and states appear.</p>
      <div class="keys">
        <kbd>Pause · 1× 4× 16×</kbd><span>Watch time: people and animals near the camera act moment to moment</span>
        <kbd>Centuries · Millennia</kbd><span>History time: 20 or 400 years a second, everyone living on their records</span>
        <kbd>Ages</kbd><span>Deep time: 4 million years a second, before the Dawn</span>
        <kbd>Drag</kbd><span>Use the selected tool (Inspect pans the map)</span>
        <kbd>Right-drag · two fingers</kbd><span>Pan · pinch to zoom</span>
        <kbd>Scroll · + / −</kbd><span>Zoom (past 8× the camera tilts into the 3D close-up)</span>
        <kbd>[ ] · N</kbd><span>In 3D: turn left or right, face north</span>
        <kbd>WASD · arrows</kbd><span>Pan the camera, or walk while possessing</span>
        <kbd>Space</kbd><span>Pause, or strike while possessing</span>
        <kbd>1 2 3 · C M</kbd><span>Watch at 1×, 4×, 16× · Centuries · Millennia</span>
        <kbd>Tab · B</kbd><span>Cycle layers · cycle overlays</span>
      </div>
      <p class="muted" style="font-size:13px">Try: open History and ask "what if this never happened?" of an invention; sow wild grain near a band; send a dream to a curious child; push a plate in deep time; start an ice age and watch the land bridges open.</p>
      <div class="btnrow"><button type="button" class="btn primary" onclick="AG.UI.closeModal()">Back to the world</button></div>`);
  }
  function diseaseEditor(idx) {
    const D = idx >= 0 && AG.DISEASES[idx] ? AG.DISEASES[idx] : { name: AG.Names.disease(), color: '#c0ca33', contagion: 0.12, radius: 1.5, lethality: 0.3, incubation: 1, duration: 3, slow: 0.2, sterile: 0, madness: 0, hollow: 0, targets: AG.CIV_MASK };
    const isNew = !(idx >= 0 && AG.DISEASES[idx]);
    if (isNew && AG.DISEASES.length >= AG.MAX_DISEASES) { UI.toast(`The world can hold ${AG.MAX_DISEASES} diseases; edit an existing one instead.`); return; }
    const sl = (id, label, v, min, max, step, unit) => `<label>${label}<input id="d-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}" oninput="this.nextElementSibling.textContent=this.value+'${unit}'"><output class="num">${v}${unit}</output></label>`;
    const hex = D.color.startsWith('#') && D.color.length === 7 ? D.color : '#c0ca33';
    openModal(`<h2>${isNew ? 'Design a disease' : 'Edit ' + esc(D.name)}</h2><p class="muted">Spread it with the Plague tool. Each body's immune genes resist infection and damage; survivors become immune, and strains drift as they spread.</p>
      <div class="grid2">
        <label>Name<input id="d-name" type="text" value="${esc(D.name)}" maxlength="28"></label>
        <label>Colour<input id="d-color" type="color" value="${hex}"></label>
        ${sl('contagion', 'Contagion (chance per contact)', D.contagion, 0.01, 0.5, 0.01, '')}
        ${sl('radius', 'Spread distance', D.radius, 0.5, 4, 0.1, ' cells')}
        ${sl('lethality', 'Lethality (health lost per day)', D.lethality, 0, 1.5, 0.05, '')}
        ${sl('slow', 'Weakness (speed lost)', D.slow, 0, 0.8, 0.05, '')}
        ${sl('incubation', 'Incubation', D.incubation, 0.1, 4, 0.1, ' days')}
        ${sl('duration', 'Sickness lasts', D.duration, 0.5, 8, 0.5, ' days')}
      </div>
      <h3 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:8px 0">Symptoms</h3>
      <div class="checks"><label><input id="d-sterile" type="checkbox" ${D.sterile ? 'checked' : ''}> Sterility</label><label><input id="d-madness" type="checkbox" ${D.madness ? 'checked' : ''}> Madness (attacks kin)</label><label><input id="d-hollow" type="checkbox" ${D.hollow ? 'checked' : ''}> Hollowing (dead rise)</label></div>
      <h3 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:14px 0 8px">Infects</h3>
      <div class="checks">${['People', 'Animals'].map((s, k) => `<label><input type="checkbox" data-target="${k}" ${D.targets & (1 << k) ? 'checked' : ''}> ${s}</label>`).join('')}</div>
      <div class="btnrow" style="margin-top:16px"><button type="button" class="btn primary" id="d-save">${isNew ? 'Create disease' : 'Save changes'}</button><button type="button" class="btn" onclick="AG.UI.closeModal()">Cancel</button></div>`);
    $('#d-save').addEventListener('click', () => {
      const g = (id) => $('#d-' + id);
      let targets = 0;
      for (const cb of document.querySelectorAll('[data-target]')) if (cb.checked) targets |= 1 << +cb.dataset.target;
      const nd = Object.assign(isNew ? {} : D, {
        name: g('name').value.trim() || D.name, color: g('color').value, contagion: +g('contagion').value, radius: +g('radius').value,
        lethality: +g('lethality').value, slow: +g('slow').value, incubation: +g('incubation').value, duration: +g('duration').value,
        sterile: g('sterile').checked ? 1 : 0, madness: g('madness').checked ? 1 : 0, hollow: g('hollow').checked ? 1 : 0, targets: targets || AG.CIV_MASK,
      });
      delete nd._rgb;
      if (isNew) AG.DISEASES.push(nd);
      God.disease = isNew ? AG.DISEASES.length - 1 : idx;
      fillDiseases(); closeModal();
      showCat('divine'); selectTool('plague');
      UI.toast(`${nd.name} is ready. Paint it onto the world with the Plague tool.`);
    });
  }

})();
