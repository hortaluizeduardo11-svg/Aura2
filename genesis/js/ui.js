/* AURA: Genesis — ui.js
 * DOM side: tool palette, HUD, inspector (genome, traits, skills, family tree,
 * memories), realm cards (culture tree, pantheon, relations), the chronicle,
 * world statistics + performance, the disease designer, and all input
 * (mouse, touch pan/pinch, keyboard, possession controls). */
'use strict';
(function () {
  const AG = window.AG, U = AG.U, Ent = AG.Ent, Civ = AG.Civ, God = AG.God, R = AG.Render, Sky = AG.Sky, Wd = AG.World;
  const { W, H, SP, SPECIES, FL, TR, J, NG, NS, BT, BUILD, BRANCHES, CULTURE, GENES, SKILLS, GOALS, TRAITS, SO, FT, UG, UF } = AG;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const yearOf = (t) => Math.floor(t / AG.YEAR_TICKS) + 1;
  const UI = (AG.UI = { sel: null, tab: 'chronicle', cat: 'look' });
  let frameN = 0, panelHover = false, lastToast = 0, worldBuilt = false;
  const keys = new Set();

  // ============================================================ setup
  UI.init = function () {
    R.init($('#world'), $('#minimap'));
    buildCats(); showCat('look'); selectTool('inspect');
    $('#toolgrid').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) selectTool(b.dataset.tool); });
    $('#bsize').addEventListener('input', (e) => { God.brush.r = +e.target.value; $('#bsizev').textContent = e.target.value; });
    $('#bstr').addEventListener('input', (e) => { God.brush.str = +e.target.value; $('#bstrv').textContent = Math.round(e.target.value * 100); });
    $('#disease').addEventListener('change', (e) => { God.disease = +e.target.value; });
    $('#btn-editdisease').addEventListener('click', () => diseaseEditor(-1));
    $('#speed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) AG.setSpeed(+b.dataset.speed); });
    $('#layers').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { R.view = +b.dataset.view; syncLayers(); } });
    $('#overlay').addEventListener('change', (e) => { R.overlay = e.target.value; R.bordersDirty = true; });
    $('#btn-trade').addEventListener('click', (e) => { R.showTrade = !R.showTrade; e.currentTarget.classList.toggle('on', R.showTrade); e.currentTarget.setAttribute('aria-pressed', R.showTrade); });
    $('#btn-panel').addEventListener('click', () => setPanel($('#panel').hidden));
    $('#btn-help').addEventListener('click', help);
    document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    const pb = $('#pbody');
    pb.addEventListener('click', panelClick);
    $('#panel').addEventListener('pointerenter', () => { panelHover = true; });
    $('#panel').addEventListener('pointerleave', () => { panelHover = false; });
    $('#minimap').addEventListener('pointerdown', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      R.follow = -1; R.centerOn(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
    });
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
    if (window.innerWidth < 760) setPanel(false);
    setTab('chronicle');
  };
  UI.reset = function () {
    UI.sel = null; worldBuilt = false;
    fillDiseases();
    if (UI.tab === 'inspect' || UI.tab === 'world') setTab(UI.tab);
  };

  function buildCats() {
    $('#cats').innerHTML = God.CATS.map((c) => `<button type="button" class="cat" role="tab" data-cat="${c.id}">${c.name}</button>`).join('');
    $('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) showCat(b.dataset.cat); });
  }
  function showCat(id) {
    UI.cat = id;
    for (const b of document.querySelectorAll('.cat')) { b.classList.toggle('on', b.dataset.cat === id); b.setAttribute('aria-selected', b.dataset.cat === id); }
    $('#toolgrid').innerHTML = God.TOOLS.filter((t) => t.cat === id).map((t) =>
      `<button type="button" class="tool${t.id === God.tool ? ' on' : ''}" data-tool="${t.id}" title="${esc(t.desc)}"><span class="sw" style="background:${t.color}"></span><span>${esc(t.name)}</span></button>`).join('');
  }
  const SIZED = new Set(['meteor', 'quake', 'volcano', 'rain', 'thunder', 'blizzard', 'heat', 'acidrain']);
  function selectTool(id) {
    God.select(id);
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
    const t = God.cur;
    $('#toolname').textContent = t.name;
    $('#tooldesc').textContent = t.desc;
    $('#sizerow').hidden = t.mode !== 'brush' && !SIZED.has(id);
    $('#strrow').hidden = t.mode !== 'brush';
    $('#diseaserow').hidden = id !== 'plague';
    $('#world').style.cursor = id === 'inspect' ? 'grab' : 'crosshair';
    syncLayers();
  }
  UI.selectTool = selectTool;
  function syncLayers() { for (const b of document.querySelectorAll('#layers button')) b.classList.toggle('on', +b.dataset.view === R.view); }
  UI.syncSpeed = function () { for (const b of document.querySelectorAll('#speed button')) { const s = +b.dataset.speed; b.classList.toggle('on', AG.paused ? s === 0 : s === AG.speed); } };
  function fillDiseases() {
    $('#disease').innerHTML = AG.DISEASES.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join('');
    if (God.disease >= AG.DISEASES.length) God.disease = 0;
    $('#disease').value = God.disease;
  }
  function setPanel(open) {
    $('#panel').hidden = !open;
    $('#btn-panel').classList.toggle('on', open); $('#btn-panel').setAttribute('aria-pressed', open);
  }
  function setTab(t) {
    UI.tab = t; worldBuilt = false;
    for (const b of document.querySelectorAll('.tab')) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); }
    renderPanel(true);
  }
  UI.toast = function (msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => el.classList.remove('show'), 3400);
  };
  UI.onChronicle = function (e) {
    if (AG.tick < 5) return;
    const big = e.kind === 'war' || e.kind === 'fall' || e.kind === 'faith' || e.kind === 'peace';
    if (big && performance.now() - lastToast > 5000) { lastToast = performance.now(); UI.toast(e.text); }
  };

  // ============================================================ picking
  UI.unitAt = function (x, y) {
    const r = Math.max(1.2, 8 / R.cam.z);
    const layers = R.view === 0 ? [0] : [2, 1];
    for (const L of layers) {
      const off = R.cam.z >= 3 ? (L === 2 ? 4.6 : 0.8) : 0;
      const n = Ent.near(x, y + off, r, L, 64);
      let best = -1, bd = 1e9;
      for (let q = 0; q < n; q++) {
        const j = Ent.buf[q], d = AG.dist2(U.x[j], U.y[j], x, y + off);
        if (d < bd) { bd = d; best = j; }
      }
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
    UI.toast(cellInfo(xi, yi).replace(/<[^>]+>/g, ''));
  };
  UI.select = function (type, id) {
    UI.sel = type ? { type, id } : null;
    if (type === 'unit' && SPECIES[U.sp[id]].kind === 'civ') UI.sel = { type: 'person', id: U.uid[id] };
    setPanel(true); setTab('inspect');
  };

  // ============================================================ input
  function bindCanvas(cv) {
    const ptrs = new Map();
    let pan = null, pinch = null, moved = false, start = null;
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = local(e);
      ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) {
        God.down = false; pan = null;
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: R.cam.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      const w = R.screenToWorld(p.x, p.y);
      God.wx = w.x; God.wy = w.y;
      moved = false; start = p;
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
        const target = pinch.z * (d / pinch.d);
        let best = R.ZOOMS[0];
        for (const z of R.ZOOMS) if (Math.abs(Math.log(z / target)) < Math.abs(Math.log(best / target))) best = z;
        if (best !== R.cam.z) zoomTo(cx, cy, best);
        return;
      }
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
      if (pan) { R.pan(p.x - prev.x, p.y - prev.y); return; }
    });
    const end = (e) => {
      const p = local(e);
      if (ptrs.has(e.pointerId) && God.tool === 'inspect' && !moved && !pinch && God.possessed < 0 && e.button === 0 && !e.altKey) {
        const w = R.screenToWorld(p.x, p.y); God.press(w.x, w.y);
      }
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!ptrs.size) { God.down = false; pan = null; start = null; }
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
      case ' ': e.preventDefault(); AG.setSpeed(AG.paused ? AG.speed : 0); break;
      case '1': AG.setSpeed(1); break; case '2': AG.setSpeed(2); break; case '3': AG.setSpeed(4); break; case '4': AG.setSpeed(8); break;
      case 'tab': e.preventDefault(); R.view = (R.view + 2) % 3; syncLayers(); break;
      case '+': case '=': R.zoomAt(R.size().w / 2, R.size().h / 2, 1); break;
      case '-': case '_': R.zoomAt(R.size().w / 2, R.size().h / 2, -1); break;
      case 'b': { const o = ['realms', 'faith', 'heat', 'none']; R.overlay = o[(o.indexOf(R.overlay) + 1) % o.length]; $('#overlay').value = R.overlay; R.bordersDirty = true; break; }
      case 'i': showCat('look'); selectTool('inspect'); break;
      case 'escape': God.pendingKd = -1; R.follow = -1; break;
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
    const pad = $('#avatarpad'), poss = God.possessed >= 0;
    if (pad.hidden === poss) pad.hidden = !poss;
    if (poss && frameN % 30 === 0) $('#avatarwho').textContent = `${Ent.title(God.possessed)} ${Ent.name(God.possessed)}`.trim();
    if (!$('#panel').hidden) {
      if (UI.tab === 'chronicle' && AG.Chronicle.dirty) renderPanel(false);
      else if (UI.tab === 'inspect' && frameN % 20 === 0 && !panelHover) renderPanel(false);
      else if ((UI.tab === 'realms' || UI.tab === 'world') && frameN % 45 === 0 && !panelHover) renderPanel(false);
    }
  };
  function hud() {
    const t = Sky.timeLabel(), day = Sky.daylight();
    const sun = day > 0.6 ? '#ffd166' : day > 0.15 ? '#f08a4b' : '#8aa2d8';
    const storm = Sky.storms.find((s) => Math.abs(s.x - R.cam.x) < 80 && Math.abs(s.y - R.cam.y) < 60);
    $('#clock').innerHTML = `<span class="sun" style="background:${sun}"></span>Year ${t.year} · ${t.season} · ${t.clock}${storm ? ' · ' + Sky.STORMS[storm.type].name : ''}`;
    let civ = 0; for (let s = 0; s < 4; s++) civ += Ent.count[s];
    const realms = Civ.kingdoms.filter((k) => k.alive).length;
    $('#stats').innerHTML = `<b>${fmt(civ)}</b> people · <b>${realms}</b> realms · <b>${fmt(U.count)}</b> creatures${AG.throttled ? ' · <span style="color:var(--war)">sim at capacity</span>' : ''}`;
  }
  function biome(i) {
    const f = Wd.fl[i];
    if (f > 0.004) {
      if (Wd.frozen[i]) return 'Ice';
      if (Wd.ft[i] === FT.LAVA) return 'Lava';
      if (Wd.ft[i] === FT.ACID) return 'Acid pool';
      return f > 0.12 ? 'Deep water' : f > 0.04 ? 'Water' : 'Shallows';
    }
    const s = Wd.soil[i], v = Wd.veg[i], T = Wd.T(i);
    if (Wd.bgrid[i]) return BUILD[Civ.buildings[Wd.bgrid[i] - 1].type].name;
    if (Wd.snow[i] > 120) return Wd.elev[i] > AG.PEAK ? 'Snowy peak' : 'Snowfield';
    switch (s) {
      case SO.SAND: return Wd.elev[i] < AG.SEA + 0.02 ? 'Beach' : 'Desert';
      case SO.ROCK: return 'Mountain';
      case SO.BASALT: return 'Basalt flats';
      case SO.ASH: return 'Ashland';
      case SO.BLIGHT: return 'Blighted land';
      case SO.ROAD: return 'Road';
      case SO.FARM: return 'Farmland';
      case SO.HOLY: return 'Hallowed meadow';
    }
    if (v >= 165) return T < 0.3 ? 'Taiga' : T > 0.68 ? 'Jungle' : 'Forest';
    if (v >= 60) return T < 0.25 ? 'Tundra' : T > 0.66 ? 'Savanna' : 'Grassland';
    return 'Bare earth';
  }
  const UGNAME = ['Rock', 'Soft earth', 'Cavern', 'Mine tunnel', 'Iron vein', 'Gold vein', 'Mana crystal', 'Glowcap grove', 'Bedrock'];
  function cellInfo(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return '';
    const i = y * W + x;
    const c = Civ.cityAt(x, y);
    const owner = c ? `${esc(c.name)}, ${esc(Civ.kingdoms[c.kd].name)}` : 'Unclaimed';
    if (R.view === 0) {
      let m = UGNAME[Wd.ug[i]];
      if (Wd.ugF[i] > 10) m += Wd.ugT[i] === UF.MAGMA ? ' · magma' : ' · groundwater';
      return `<b>${m}</b> · deep below ${owner}<br>${x}, ${y}`;
    }
    const elev = Math.round((Wd.elev[i] - AG.SEA) * 4000), temp = Math.round(Wd.T(i) * 45 - 8);
    return `<b>${biome(i)}</b> · ${owner}<br>${elev >= 0 ? elev + ' m' : 'depth ' + -elev + ' m'} · ${temp} °C · ${x}, ${y}`;
  }

  // ============================================================ panel
  function renderPanel(force) {
    const pb = $('#pbody');
    switch (UI.tab) {
      case 'inspect': pb.innerHTML = inspectHTML(); break;
      case 'realms': pb.innerHTML = realmsHTML(); break;
      case 'chronicle': pb.innerHTML = chronicleHTML(); AG.Chronicle.dirty = false; break;
      case 'world':
        if (!worldBuilt || force) { pb.innerHTML = worldShell(); worldBuilt = true; }
        $('#wstats').innerHTML = worldStats();
        break;
    }
  }
  function panelClick(e) {
    const t = e.target.closest('[data-uid],[data-city],[data-kd],[data-x],[data-act],[data-dis]');
    if (!t) return;
    if (t.dataset.uid) { UI.sel = { type: 'person', id: +t.dataset.uid }; renderPanel(true); return; }
    if (t.dataset.city) { UI.sel = { type: 'city', id: +t.dataset.city }; setTab('inspect'); const c = Civ.cities[+t.dataset.city]; R.follow = -1; R.centerOn(c.x, c.y, Math.max(R.cam.z, 4)); return; }
    if (t.dataset.kd) { UI.sel = { type: 'kingdom', id: +t.dataset.kd }; setTab('inspect'); const c = Civ.capitalOf(Civ.kingdoms[+t.dataset.kd]); if (c) { R.follow = -1; R.centerOn(c.x, c.y); } return; }
    if (t.dataset.x !== undefined) { const x = +t.dataset.x, y = +t.dataset.y; if (x >= 0) { R.follow = -1; R.centerOn(x, y, Math.max(R.cam.z, 4)); } return; }
    if (t.dataset.dis !== undefined) { diseaseEditor(+t.dataset.dis); return; }
    const a = t.dataset.act, i = selectedUnit();
    switch (a) {
      case 'follow': if (i >= 0) { R.follow = i; R.view = U.layer[i] === 0 ? 0 : 1; syncLayers(); if (R.cam.z < 4) R.setZoom(6); } break;
      case 'possess': if (i >= 0) God.possess(i); break;
      case 'release': God.release(); break;
      case 'bless': if (i >= 0) { U.flags[i] = (U.flags[i] | FL.BLESSED) & ~FL.CURSED; U.hp[i] = U.mhp[i]; if (U.dis[i]) { U.imm[i] |= 1 << (U.dis[i] - 1); U.dis[i] = 0; } AG.FX.burst(U.x[i], U.y[i], 'holy', 20, U.layer[i]); Ent.memory(i, 'Was blessed by name'); } break;
      case 'smite': if (i >= 0) God.lightning(U.x[i], U.y[i], false); break;
      case 'newworld': AG.newWorld(parseInt($('#seed').value, 10) || 0); break;
      case 'stress': AG.stress(10000); break;
      case 'newdisease': diseaseEditor(-1); break;
    }
    renderPanel(true);
  }
  function selectedUnit() {
    const s = UI.sel;
    if (!s) return -1;
    if (s.type === 'unit') return U.alive[s.id] ? s.id : -1;
    if (s.type === 'person') { const r = AG.People.get(s.id); return r && !r.died && r.idx >= 0 && U.alive[r.idx] && U.uid[r.idx] === s.id ? r.idx : -1; }
    return -1;
  }
  const bar = (label, v, max, color, right) => `<div class="row"><span>${label}</span><div class="bar"><i style="width:${AG.clamp((v / max) * 100, 0, 100).toFixed(1)}%${color ? ';background:' + color : ''}"></i></div><span>${right === undefined ? Math.round(v) : right}</span></div>`;
  function inspectHTML() {
    const s = UI.sel;
    if (!s) return `<p class="empty">Choose <b>Inspect</b> and tap any creature, city or realm to read its story. Every citizen carries a genome, a family tree and their own memories.</p>`;
    if (s.type === 'person') { const i = selectedUnit(); return i >= 0 ? unitHTML(i) : recordHTML(s.id); }
    if (s.type === 'unit') return U.alive[s.id] ? unitHTML(s.id) : `<p class="empty">This creature is gone.</p>`;
    if (s.type === 'city') return cityHTML(Civ.cities[s.id]);
    if (s.type === 'kingdom') return kingdomHTML(Civ.kingdoms[s.id]);
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
  function personBtn(uid, self) {
    const r = AG.People.get(uid);
    if (!r) return '<span class="p dead">forgotten</span>';
    const alive = !r.died && r.idx >= 0 && U.alive[r.idx] && U.uid[r.idx] === uid;
    return `<button type="button" class="p link${self ? ' self' : ''}${alive ? '' : ' dead'}" data-uid="${uid}">${esc(r.name)}${alive ? '' : ' †'}</button>`;
  }
  function familyHTML(rec, spouseUid) {
    const P = AG.People;
    const mom = rec.mom ? P.get(rec.mom) : null, dad = rec.dad ? P.get(rec.dad) : null;
    const grand = [];
    for (const p of [mom, dad]) if (p) for (const g of [p.mom, p.dad]) if (g) grand.push(g);
    const sibs = new Set();
    for (const p of [mom, dad]) if (p) for (const k of p.kids) if (k !== rec.uid) sibs.add(k);
    const rows = [];
    if (grand.length) rows.push(`<div class="gen"><span class="lbl">Grandparents</span>${grand.map((g) => personBtn(g)).join('')}</div>`);
    rows.push(`<div class="gen"><span class="lbl">Parents</span>${mom || dad ? [rec.mom, rec.dad].filter(Boolean).map((g) => personBtn(g)).join('') : '<span class="muted">Founders of their people</span>'}</div>`);
    rows.push(`<div class="gen"><span class="lbl">Self</span>${personBtn(rec.uid, true)}${spouseUid ? '<span class="muted">wed to</span>' + personBtn(spouseUid) : ''}</div>`);
    if (sibs.size) rows.push(`<div class="gen"><span class="lbl">Siblings</span>${[...sibs].slice(0, 8).map((g) => personBtn(g)).join('')}${sibs.size > 8 ? `<span class="muted">+${sibs.size - 8}</span>` : ''}</div>`);
    if (rec.kids.length) rows.push(`<div class="gen"><span class="lbl">Children</span>${rec.kids.slice(0, 12).map((g) => personBtn(g)).join('')}${rec.kids.length > 12 ? `<span class="muted">+${rec.kids.length - 12}</span>` : ''}</div>`);
    return `<div class="tree">${rows.join('')}</div>`;
  }
  function logHTML(rec) {
    if (!rec.log.length) return '<p class="muted">Nothing memorable yet.</p>';
    return `<ul class="log">${rec.log.slice().reverse().map((l) => `<li><span>Y${yearOf(l.t)}</span>${esc(l.s)}</li>`).join('')}</ul>`;
  }
  function unitHTML(i) {
    const d = SPECIES[U.sp[i]], rec = AG.People.rec(i), k = U.kd[i] >= 0 ? Civ.kingdoms[U.kd[i]] : null, c = U.city[i] >= 0 ? Civ.cities[U.city[i]] : null;
    const civ = d.kind === 'civ', title = Ent.title(i), name = rec ? rec.name : d.name;
    const age = Math.floor(U.age[i]);
    let sub = civ ? `${d.name} · ${U.sex[i] ? 'male' : 'female'} · ${age} years · ${AG.JOBS[U.job[i]]}` : d.kind === 'vehicle' ? `${d.name}${k ? ' of the ' + k.name : ''}` : `${d.name}${d.life[1] < 1e6 ? ' · ' + age + ' years' : ''}`;
    let doing = U.st[i] === 3 ? 'Fighting' : AG.TASKS[U.task[i]] || 'Idle';
    if (U.st[i] === 0 && U.task[i] === 0) doing = 'Resting';
    if (U.flags[i] & FL.POSSESSED) doing = 'Moved by your hand';
    if (U.carry[i]) doing += ` · carrying ${U.camt[i]} ${AG.CARRY[U.carry[i]]}`;
    if (U.layer[i] === 0) doing += ' · underground'; else if (U.layer[i] === 2) doing += ' · aloft';
    const dot = k ? k.css : AG.css(d.fur || d.skin || [180, 180, 180]);
    let h = `<div class="ihead"><span class="chipdot" style="background:${dot}"></span><div><h2>${esc((title ? title + ' ' : '') + name)}</h2><p class="muted">${esc(sub)}</p></div></div>`;
    h += `<p>${esc(doing)}</p>${bar('Health', U.hp[i], U.mhp[i], 'var(--war)', `${Math.ceil(U.hp[i])}`)}`;
    if (civ || k) h += `<dl class="kv" style="margin-top:8px">${k ? `<dt>Realm</dt><dd><button type="button" class="link" data-kd="${k.id}">${esc(k.name)}</button></dd>` : ''}${c ? `<dt>Home</dt><dd><button type="button" class="link" data-city="${c.id}">${esc(c.name)}</button></dd>` : ''}${civ && U.sq[i] >= 0 && Civ.squads[U.sq[i]] ? `<dt>Army</dt><dd>Marching on ${esc(Civ.cities[Civ.squads[U.sq[i]].target].name)}</dd>` : ''}${U.kills[i] ? `<dt>Kills</dt><dd>${U.kills[i]}</dd>` : ''}</dl>`;
    const poss = U.flags[i] & FL.POSSESSED;
    h += `<div class="btnrow"><button type="button" class="btn" data-act="follow">Follow</button><button type="button" class="btn${poss ? '' : ' primary'}" data-act="${poss ? 'release' : 'possess'}">${poss ? 'Release' : 'Possess'}</button><button type="button" class="btn" data-act="bless">Bless</button><button type="button" class="btn" data-act="smite">Smite</button></div>`;
    if (d.kind !== 'vehicle') {
      h += `<h3>Genome</h3><div class="rows">`;
      for (let g = 0; g < NG; g++) {
        const v = U.genes[i * NG + g];
        h += g === AG.G.HUE ? bar(GENES[g], v, 255, `hsl(${(v / 255) * 50 + 15},45%,${40 + (v / 255) * 30}%)`) : bar(GENES[g], v, 255);
      }
      h += `</div><h3>Traits</h3>${traitChips(U.traits[i])}`;
    }
    if (civ) {
      h += `<h3>Skills</h3><div class="rows">${SKILLS.map((s, k2) => bar(s, U.skills[i * NS + k2], 255, '#8fb3e0')).join('')}</div>`;
      h += `<h3>Life goal</h3><p>${GOALS[U.goal[i]]}</p>`;
    }
    const D = U.dis[i] ? AG.DISEASES[U.dis[i] - 1] : null;
    const imm = AG.DISEASES.filter((_, k2) => U.imm[i] & (1 << k2)).map((x) => x.name);
    if (D || imm.length || (U.flags[i] & (FL.BLESSED | FL.CURSED | FL.MAD))) {
      h += `<h3>Condition</h3><div class="chips">`;
      if (D) h += `<span class="chip bad">${esc(D.name)} · ${U.dtm[i] < D.incubation ? 'incubating' : 'sick'}</span>`;
      if (U.flags[i] & FL.MAD) h += '<span class="chip bad">Mad</span>';
      if (U.flags[i] & FL.BLESSED) h += '<span class="chip holy">Blessed</span>';
      if (U.flags[i] & FL.CURSED) h += '<span class="chip bad">Cursed</span>';
      for (const n of imm) h += `<span class="chip good">Immune: ${esc(n)}</span>`;
      h += '</div>';
    }
    if (rec) {
      const sp = U.spouse[i] >= 0 && U.alive[U.spouse[i]] ? U.uid[U.spouse[i]] : 0;
      h += `<h3>Family</h3>${familyHTML(rec, sp)}<h3>Memories</h3>${logHTML(rec)}`;
    }
    return h;
  }
  function recordHTML(uid) {
    const r = AG.People.get(uid);
    if (!r) return '<p class="empty">This life has passed out of memory.</p>';
    const d = SPECIES[r.sp];
    let h = `<div class="ihead"><span class="chipdot" style="background:#5d5a52"></span><div><h2>${esc(r.name)} †</h2><p class="muted">${d.name} · ${r.sex ? 'male' : 'female'} · ${r.realm ? esc(r.realm) : 'no realm'}</p></div></div>`;
    h += `<dl class="kv" style="margin-top:8px"><dt>Born</dt><dd>Year ${yearOf(r.born)}</dd><dt>Died</dt><dd>Year ${yearOf(r.died)}, aged ${Math.floor(r.age)}</dd><dt>Cause</dt><dd>${esc(r.cause)}</dd></dl>`;
    h += `<h3>Family</h3>${familyHTML(r, 0)}<h3>Memories</h3>${logHTML(r)}`;
    return h;
  }
  function cityHTML(c) {
    if (!c) return '';
    const k = Civ.kingdoms[c.kd], bc = Civ.counts(c, true), site = c.site >= 0 ? Civ.buildings[c.site] : null;
    const rel = c.religion >= 0 ? Civ.religions[c.religion] : null;
    let h = `<div class="ihead"><img class="banner" src="${R.bannerURL(k)}" alt=""><div><h2>${esc(c.name)}${c.alive ? '' : ' (ruins)'}</h2><p class="muted">${k.capital === c.id ? 'Capital of ' : 'A city of '}<button type="button" class="link" data-kd="${k.id}">${esc(k.name)}</button></p></div></div>`;
    h += `<dl class="kv" style="margin-top:10px"><dt>People</dt><dd>${c.members.length} of ${Civ.housing(c)} housed</dd><dt>Founded</dt><dd>Year ${yearOf(c.founded)}</dd><dt>Faith</dt><dd>${rel ? esc(rel.name) : 'None yet'}</dd><dt>Territory</dt><dd>${fmt(c.area)} cells</dd>${site ? `<dt>Building</dt><dd>${BUILD[site.type].name} · ${Math.round(site.prog * 100)}%</dd>` : ''}${c.captureT > 0 ? '<dt>Status</dt><dd style="color:var(--war)">Under siege</dd>' : ''}</dl>`;
    h += `<h3>Loyalty</h3>${bar('To the crown', c.loyalty * 100, 100, c.loyalty < 0.35 ? 'var(--war)' : 'var(--peace)', Math.round(c.loyalty * 100) + '%')}`;
    h += `<h3>Stores</h3><dl class="kv">${[['Food', c.food], ['Wood', c.wood], ['Stone', c.stone], ['Ore', c.ore], ['Gold', c.gold], ['Mana crystal', c.crystal], ['Faith', c.faith]].map(([a, b]) => `<dt>${a}</dt><dd>${fmt(b)}</dd>`).join('')}</dl>`;
    const bl = BUILD.map((b, t) => (bc[t] ? `<span class="chip">${b.name}${bc[t] > 1 ? ' ×' + bc[t] : ''}</span>` : '')).join('');
    h += `<h3>Buildings</h3><div class="chips">${bl || '<span class="muted">None</span>'}</div>`;
    const routes = Civ.routes.filter((r) => r.a === c.id || r.b === c.id);
    if (routes.length) h += `<h3>Trade partners</h3><div class="chips">${routes.map((r) => { const o = Civ.cities[r.a === c.id ? r.b : r.a]; return `<button type="button" class="chip link" data-city="${o.id}">${esc(o.name)} · ${r.mode === 'sea' ? 'ships' : r.mode === 'air' ? 'skyships' : 'carts'}</button>`; }).join('')}</div>`;
    return h;
  }
  function kingdomHTML(k) {
    if (!k) return '';
    const ruler = k.king >= 0 && U.alive[k.king] ? k.king : -1, cap = Civ.capitalOf(k);
    let h = `<div class="ihead"><img class="banner" src="${R.bannerURL(k)}" alt=""><div><h2>${esc(k.name)}</h2><p class="muted">${SPECIES[k.race].name} · founded year ${yearOf(k.founded)}${k.alive ? '' : ' · fell in year ' + yearOf(k.fell)}</p></div></div>`;
    h += `<dl class="kv" style="margin-top:10px"><dt>Ruler</dt><dd>${ruler >= 0 ? `${U.sex[ruler] ? 'King' : 'Queen'} ${personBtn(U.uid[ruler])}` : 'None'}</dd><dt>Capital</dt><dd>${cap ? `<button type="button" class="link" data-city="${cap.id}">${esc(cap.name)}</button>` : '—'}</dd><dt>People</dt><dd>${fmt(k.pop)}</dd><dt>Cities</dt><dd>${k.cities.map((id) => `<button type="button" class="link" data-city="${id}">${esc(Civ.cities[id].name)}</button>`).join(', ') || '—'}</dd><dt>Battles</dt><dd>${k.kills} slain · ${k.losses} lost</dd></dl>`;
    const total = BRANCHES.reduce((s, b) => s + k.culture[b], 0);
    const cost = k.focus ? AG.CULTURE_COST[k.culture[k.focus]] * (1 + 0.08 * total) : 1;
    h += `<h3>Culture</h3>${k.focus ? bar('Toward ' + CULTURE[k.focus].nodes[k.culture[k.focus]].name, k.cp, cost, CULTURE[k.focus].color, Math.round((k.cp / cost) * 100) + '%') : ''}`;
    h += `<div class="ctree" style="margin-top:8px">${BRANCHES.map((b) => `<div class="col"><div class="head" style="color:${CULTURE[b].color}">${CULTURE[b].name}</div>${CULTURE[b].nodes.map((n, t) => `<div class="node${t < k.culture[b] ? ' got' : t === k.culture[b] && k.focus === b ? ' next' : ''}" title="${esc(n.desc)}">${esc(n.name)}</div>`).join('')}</div>`).join('')}</div>`;
    const rel = k.religion >= 0 ? Civ.religions[k.religion] : null;
    h += `<h3>Faith</h3>`;
    if (rel) {
      h += `<p><b>${esc(rel.name)}</b>${rel.founder === k.id ? ' (founded here)' : ` (from the ${esc(Civ.kingdoms[rel.founder].name)})`}</p><p class="muted">${esc(AG.TENET_DESC[rel.tenet] || '')}</p>`;
      h += rel.deities.map((d) => `<p class="deity"><b>${esc(d.name)}</b> ${esc(d.epithet)} <span class="muted">· ${d.domain === 'watcher' ? 'you' : d.domain}</span></p>`).join('');
    } else h += `<p class="muted">No faith yet. Their gods will take shape from what they live through.</p>`;
    const exp = Object.entries(k.exp).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (exp.length) { const mx = exp[0][1]; h += `<h3>What shaped them</h3><div class="rows">${exp.map(([dm, v]) => bar(dm === 'watcher' ? 'your hand' : dm, v, mx, '#c9a7ec', v.toFixed(1))).join('')}</div>`; }
    const others = Civ.kingdoms.filter((o) => o.alive && o !== k);
    if (others.length) {
      h += `<h3>Relations</h3><div class="rows">`;
      for (const o of others) {
        const op = k.opinion[o.id], war = k.war[o.id];
        const fill = op >= 0 ? `left:50%;width:${op / 2}%;background:var(--peace)` : `right:50%;width:${-op / 2}%;background:var(--war)`;
        h += `<div class="rel"><button type="button" class="link" data-kd="${o.id}" style="text-align:left">${esc(o.name)}</button><div class="opbar"><i style="${fill}"></i></div><span class="tag ${war ? 'war' : 'peace'}">${war ? 'War' : op > 30 ? 'Friends' : 'Peace'}</span></div>`;
      }
      h += '</div>';
    }
    return h;
  }
  function pips(k) {
    return `<div class="pips">${BRANCHES.map((b) => `<span class="pip" title="${CULTURE[b].name}">${[0, 1, 2, 3].map((t) => `<i style="${t < k.culture[b] ? 'background:' + CULTURE[b].color : ''}"></i>`).join('')}</span>`).join('')}</div>`;
  }
  function realmsHTML() {
    const alive = Civ.kingdoms.filter((k) => k.alive).sort((a, b) => b.pop - a.pop);
    const fallen = Civ.kingdoms.filter((k) => !k.alive);
    if (!alive.length && !fallen.length) return '<p class="empty">No realms yet. Use the Life tools to found one.</p>';
    let h = alive.map((k) => {
      const wars = Civ.kingdoms.filter((o) => k.war[o.id]).map((o) => o.name);
      const rel = k.religion >= 0 ? Civ.religions[k.religion].name : 'no faith';
      return `<div class="realm" data-kd="${k.id}"><img class="banner" src="${R.bannerURL(k)}" alt=""><div style="min-width:0"><div class="nm">${esc(k.name)}</div><div class="meta">${SPECIES[k.race].name} · ${fmt(k.pop)} people · ${k.cities.length} ${k.cities.length === 1 ? 'city' : 'cities'} · ${esc(rel)}</div>${wars.length ? `<div class="meta" style="color:var(--war)">At war with ${esc(wars.join(', '))}</div>` : ''}</div>${pips(k)}</div>`;
    }).join('');
    if (fallen.length) h += `<h3 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px">Fallen realms</h3><p class="muted" style="font-size:13px">${fallen.map((k) => `<button type="button" class="link dead" data-kd="${k.id}">${esc(k.name)}</button> (year ${yearOf(k.fell)})`).join(', ')}</p>`;
    return h;
  }
  function chronicleHTML() {
    const list = AG.Chronicle.list;
    if (!list.length) return '<p class="empty">History has not begun.</p>';
    let h = '<ul class="chron">';
    for (let k = list.length - 1, n = 0; k >= 0 && n < 220; k--, n++) {
      const e = list[k];
      h += `<li class="k-${e.kind}"${e.x >= 0 ? ` data-x="${e.x | 0}" data-y="${e.y | 0}"` : ''}><span class="yr">Y${yearOf(e.t)}</span><span>${esc(e.text)}</span></li>`;
    }
    return h + '</ul>';
  }
  function worldShell() {
    return `<h2>World</h2><p class="muted" style="font-size:13px">Seed <span class="num">${AG.seed}</span></p><div id="wstats"></div>
      <h3>Shape the next world</h3>
      <div class="btnrow" style="margin-top:0"><input id="seed" type="number" class="hudbtn" style="width:130px" placeholder="Random seed" aria-label="World seed"><button type="button" class="btn primary" data-act="newworld">New world</button></div>
      <h3>Stress test</h3>
      <p class="muted" style="font-size:13px">Adds 10,000 creatures and citizens to show the engine running tens of thousands of entities.</p>
      <div class="btnrow" style="margin-top:4px"><button type="button" class="btn" data-act="stress">Add 10,000 creatures</button></div>`;
  }
  function worldStats() {
    const S = AG.stats;
    const groups = [['People', [0, 1, 2, 3]], ['Wildlife', [4, 5, 13]], ['Monsters', [6, 7, 8]], ['Caravans & engines', [10, 11, 12, 14]]];
    let h = `<h3>Population</h3><dl class="kv">`;
    for (const [g, ids] of groups) h += `<dt>${g}</dt><dd>${ids.map((s) => `${SPECIES[s].name} ${fmt(AG.Ent.count[s])}`).join(' · ')}</dd>`;
    h += `<dt>All entities</dt><dd>${fmt(U.count)} / ${fmt(AG.MAXU)}</dd><dt>Births · deaths</dt><dd>${fmt(AG.Ent.births)} · ${fmt(AG.Ent.deaths)}</dd></dl>`;
    const liveB = Civ.buildings.filter((b) => b.alive).length;
    h += `<h3>Civilisation</h3><dl class="kv"><dt>Realms</dt><dd>${Civ.kingdoms.filter((k) => k.alive).length} living · ${Civ.kingdoms.filter((k) => !k.alive).length} fallen</dd><dt>Cities</dt><dd>${Civ.cities.filter((c) => c.alive).length}</dd><dt>Buildings</dt><dd>${fmt(liveB)}</dd><dt>Trade routes</dt><dd>${Civ.routes.length}</dd><dt>Armies afield</dt><dd>${Civ.squads.filter((s) => s.alive).length}</dd></dl>`;
    if (Civ.religions.length) {
      h += `<h3>Faiths</h3><dl class="kv">${Civ.religions.map((r) => `<dt style="color:${AG.css(r.color)}">${esc(r.name)}</dt><dd>${Civ.cities.filter((c) => c.alive && c.religion === r.id).length} cities</dd>`).join('')}</dl>`;
    }
    const cases = new Int32Array(AG.DISEASES.length);
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.dis[i]) cases[U.dis[i] - 1]++;
    h += `<h3>Diseases</h3><dl class="kv">${AG.DISEASES.map((d, k) => `<dt><button type="button" class="link" data-dis="${k}" style="color:${d.color}">${esc(d.name)}</button></dt><dd>${cases[k] ? cases[k] + ' sick' : 'dormant'}</dd>`).join('')}</dl>`;
    h += `<div class="btnrow" style="margin-top:6px"><button type="button" class="btn" data-act="newdisease">Design a disease…</button></div>`;
    h += `<h3>Engine</h3><dl class="kv"><dt>Frame rate</dt><dd>${S.fps.toFixed(0)} fps</dd><dt>Simulation</dt><dd>${S.simMs.toFixed(2)} ms per tick · ${S.tps.toFixed(0)} ticks/s</dd><dt>Rendering</dt><dd>${S.renderMs.toFixed(1)} ms per frame</dd><dt>Awake chunks</dt><dd>${AG.Physics.stats.active} surface · ${AG.Physics.stats.uactive} deep (of ${AG.NC})</dd><dt>Flow fields</dt><dd>${AG.Flow.cache.size} cached · ${AG.Flow.computed} built</dd><dt>Particles</dt><dd>${fmt(AG.FX.n)}</dd></dl>`;
    return h;
  }

  // ============================================================ modals
  function openModal(html) { $('#modalbox').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; }
  UI.closeModal = closeModal;
  function help() {
    openModal(`<h2>Playing god</h2><p class="muted">Pick a tool on the left, then drag or tap on the world. Realms grow, trade, pray and wage war on their own; the Chronicle records what they do.</p>
      <div class="keys">
        <kbd>Drag</kbd><span>Use the selected tool (Inspect pans the map)</span>
        <kbd>Right-drag · two fingers</kbd><span>Pan · pinch to zoom</span>
        <kbd>Scroll · + / −</kbd><span>Zoom in and out</span>
        <kbd>WASD · arrows</kbd><span>Pan the camera, or walk while possessing</span>
        <kbd>Space</kbd><span>Pause, or strike while possessing</span>
        <kbd>E</kbd><span>Divine power while possessing (fireball or holy nova)</span>
        <kbd>Esc</kbd><span>Release a possessed creature</span>
        <kbd>1 2 3 4</kbd><span>Speed 1×, 2×, 4×, 8×</span>
        <kbd>Tab</kbd><span>Cycle Surface, Sky and Deep layers</span>
        <kbd>B</kbd><span>Cycle overlays: realms, faiths, climate</span>
      </div>
      <p class="muted" style="font-size:13px">Try: pour lava next to a river; Discord two neighbours; carve a channel with Lower; bless a city and watch the pantheon that forms there; dig into a magma pocket under a mine.</p>
      <div class="btnrow"><button type="button" class="btn primary" onclick="AG.UI.closeModal()">Back to the world</button></div>`);
  }
  function diseaseEditor(idx) {
    const D = idx >= 0 && AG.DISEASES[idx] ? AG.DISEASES[idx] : { name: AG.Names.disease(), color: '#c0ca33', contagion: 0.12, radius: 1.5, lethality: 0.3, incubation: 1, duration: 3, slow: 0.2, sterile: 0, madness: 0, hollow: 0, targets: AG.CIV_MASK };
    const isNew = !(idx >= 0 && AG.DISEASES[idx]);
    if (isNew && AG.DISEASES.length >= AG.MAX_DISEASES) { UI.toast(`The world can hold ${AG.MAX_DISEASES} diseases; edit an existing one instead.`); return; }
    const sl = (id, label, v, min, max, step, unit) => `<label>${label}<input id="d-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}" oninput="this.nextElementSibling.textContent=this.value+'${unit}'"><output class="num">${v}${unit}</output></label>`;
    const hex = D.color.startsWith('#') && D.color.length === 7 ? D.color : '#c0ca33';
    openModal(`<h2>${isNew ? 'Design a disease' : 'Edit ' + esc(D.name)}</h2><p class="muted">Spread it with the Plague tool. Each creature's Resilience gene resists infection and damage; survivors become immune.</p>
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
      <div class="checks">${[0, 1, 2, 3, 4, 5].map((s) => `<label><input type="checkbox" data-target="${s}" ${D.targets & (1 << s) ? 'checked' : ''}> ${SPECIES[s].name}</label>`).join('')}</div>
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
