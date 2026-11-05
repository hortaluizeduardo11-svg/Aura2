/* AURA: Genesis 2 — lang.js
 * Languages: a phoneme inventory, syllable rules and a core lexicon per language. Over centuries
 * a language undergoes regular sound changes (applied to every word) and loses or coins words.
 * When communities sharing a language stay out of contact for long enough, the isolated ones
 * become a daughter language, so families of related tongues grow over time. People, places,
 * peoples and gods are all named from their own speakers' words. */
'use strict';
(function () {
  const AG = window.AG;
  const Lang = (AG.Lang = { list: [], splits: 0, changes: 0 });
  const rnd = () => AG.rnd();
  const pick = (a) => a[(rnd() * a.length) | 0];
  const CONS = ['p', 't', 'k', 'b', 'd', 'g', 'm', 'n', 's', 'h', 'l', 'r', 'v', 'z', 'f', 'th', 'sh', 'ch', 'w', 'y', 'q', 'x', 'ng', 'kh'];
  const VOWS = ['a', 'e', 'i', 'o', 'u', 'aa', 'ei', 'ou', 'y', 'ae', 'ia'];
  const MEANINGS = ['river', 'hill', 'stone', 'fire', 'water', 'sun', 'moon', 'star', 'sky', 'earth', 'tree', 'forest', 'sea', 'home', 'people', 'mother',
    'father', 'child', 'wolf', 'deer', 'bird', 'great', 'old', 'new', 'red', 'white', 'black', 'high', 'low', 'first', 'strong', 'wise', 'cold', 'warm',
    'grass', 'field', 'grain', 'ox', 'salt', 'iron', 'copper', 'gold', 'god', 'spirit', 'death', 'life', 'storm', 'rain', 'snow', 'ice', 'mountain',
    'valley', 'lake', 'island', 'shore', 'north', 'south', 'east', 'west', 'king', 'chief', 'war', 'peace', 'friend', 'blood', 'bone', 'eye', 'hand',
    'heart', 'song', 'dream', 'night', 'day', 'dawn', 'ash', 'smoke', 'hunt', 'spear', 'boat', 'road', 'gate', 'wall', 'hall', 'town', 'ford', 'bay',
    'marsh', 'oak', 'pine', 'horse', 'bear', 'eagle', 'serpent', 'thunder', 'flame', 'shadow', 'light', 'free', 'holy', 'bright', 'deep', 'long'];
  Lang.MEANINGS = MEANINGS;

  function makePhonology() {
    const nc = 9 + ((rnd() * 9) | 0), nv = 3 + ((rnd() * 4) | 0);
    const C = CONS.slice().sort(() => rnd() - 0.5).slice(0, nc);
    if (!C.includes('n')) C.push('n'); if (!C.includes('k') && !C.includes('t')) C.push('t');
    const V = ['a', 'i', 'u', ...VOWS.slice(3).sort(() => rnd() - 0.5)].slice(0, nv);
    if (!V.includes('e') && rnd() < 0.7) V.push('e');
    const codas = C.filter((c) => c.length === 1 && 'nmlrskt'.includes(c));
    return { C, V, codas, onset: 0.6 + rnd() * 0.35, coda: 0.15 + rnd() * 0.45, len: 1.4 + rnd() * 1.0 };
  }
  function syllable(ph) {
    let s = rnd() < ph.onset ? pick(ph.C) : '';
    s += pick(ph.V);
    if (rnd() < ph.coda && ph.codas.length) s += pick(ph.codas);
    return s;
  }
  function word(ph, min) {
    let n = Math.max(min || 1, Math.round(ph.len + (rnd() - 0.5) * 1.2));
    if (n < 1) n = 1; if (n > 3) n = 3;
    let w = '';
    for (let k = 0; k < n; k++) w += syllable(ph);
    return w.replace(/(.)\1\1+/g, '$1$1');
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  Lang.cap = cap;

  // A brand-new language (the speech of the first people) or a daughter of a parent language.
  Lang.create = function (parent, born) {
    const id = Lang.list.length;
    let L;
    if (parent) {
      L = { id, parent: parent.id, family: parent.family, born, ph: JSON.parse(JSON.stringify(parent.ph)), lex: Object.assign({}, parent.lex), names: { f: parent.names.f.slice(), m: parent.names.m.slice() }, log: [], kids: [], name: '' };
      parent.kids.push(id);
      for (let k = 0; k < 3; k++) soundChange(L, true); // the split itself is marked by a few changes
    } else {
      const ph = makePhonology();
      L = { id, parent: -1, family: id, born, ph, lex: {}, names: { f: [], m: [] }, log: [], kids: [], name: '' };
      for (const m of MEANINGS) L.lex[m] = word(ph, m.length > 5 ? 2 : 1);
      const fe = pick(['a', 'i', 'e', 'ia']), me = pick(L.ph.codas.length ? L.ph.codas : ['n']);
      for (let k = 0; k < 40; k++) { L.names.f.push(word(ph, 2).replace(/[^aeiouy]$/, '') + (rnd() < 0.6 ? fe : '')); L.names.m.push(word(ph, 1) + (rnd() < 0.5 ? me : '')); }
    }
    L.name = cap(L.lex.people);
    // a daughter whose word for "people" did not change is told apart by a new syllable
    for (let t = 0; t < 6 && Lang.list.some((o) => o.name === L.name); t++) { L.lex.people = L.lex.people + word(L.ph, 1).slice(0, 2); L.name = cap(L.lex.people); }
    Lang.list.push(L);
    return L;
  };
  Lang.get = (id) => Lang.list[id] || null;

  // ------------------------------------------------------------ change
  // A regular sound change hits every word at once (that is why related languages keep
  // systematic correspondences).
  const RULES = [
    ['p', 'f', 'lenition'], ['t', 'th', 'lenition'], ['k', 'h', 'lenition'], ['k', 'ch', 'palatalisation'], ['s', 'h', 'debuccalisation'],
    ['b', 'v', 'lenition'], ['d', 'z', 'lenition'], ['g', 'y', 'lenition'], ['a', 'e', 'vowel shift'], ['o', 'u', 'vowel raising'],
    ['e', 'i', 'vowel raising'], ['u', 'ou', 'diphthongisation'], ['i', 'ei', 'diphthongisation'], ['aa', 'o', 'vowel shift'], ['r', 'l', 'liquid merger'],
    ['m', 'n', 'nasal merger'], ['sh', 's', 'merger'], ['x', 'kh', 'shift'], ['q', 'k', 'merger'], ['w', 'v', 'fortition'],
  ];
  function soundChange(L, quiet) {
    const ph = L.ph;
    const usable = RULES.filter(([a]) => ph.C.includes(a) || ph.V.includes(a));
    if (rnd() < 0.25) { // final vowels or consonants wear away
      for (const m in L.lex) { const w = L.lex[m]; if (w.length > 3) L.lex[m] = w.replace(/[aeiouy]$/, ''); }
      if (!quiet) L.log.push({ year: AG.Geo.year, rule: 'final vowels lost' });
      return;
    }
    if (!usable.length) return;
    const [a, b, kind] = pick(usable);
    const re = new RegExp(a, 'g');
    for (const m in L.lex) L.lex[m] = L.lex[m].replace(re, b);
    for (const s of ['f', 'm']) L.names[s] = L.names[s].map((w) => w.replace(re, b));
    const swap = (arr) => { const i = arr.indexOf(a); if (i >= 0) arr[i] = b; };
    swap(ph.C); swap(ph.V); swap(ph.codas);
    if (!quiet) L.log.push({ year: AG.Geo.year, rule: `${a} → ${b} (${kind})` });
    if (L.log.length > 30) L.log.shift();
    L.name = cap(L.lex.people);
  }
  function wordLoss(L) { const m = pick(MEANINGS); L.lex[m] = word(L.ph, 1); }

  // dy years for every living language (speakers decide which are alive).
  Lang.yearStep = function (dy) {
    for (const L of Lang.list) {
      if (!L.speakers) continue;
      if (rnd() < dy * 0.005) { soundChange(L); Lang.changes++; }
      if (rnd() < dy * 0.012) wordLoss(L);
    }
  };

  // Communities that share a language but have been out of touch with the main body of its
  // speakers for 300+ years start a daughter language. contactOf(a, b) says if two communities
  // are in touch; called by civ.js every few decades.
  Lang.checkSplits = function (comms, contactOf, dy) {
    const by = new Map();
    for (const c of comms) { if (!c.alive || c.lang < 0) continue; let a = by.get(c.lang); if (!a) by.set(c.lang, (a = [])); a.push(c); }
    for (const L of Lang.list) L.speakers = 0;
    for (const c of comms) if (c.alive && c.lang >= 0) Lang.list[c.lang].speakers += c.members.length;
    for (const [lid, list] of by) {
      if (list.length < 2) { for (const c of list) c.langIso = 0; continue; }
      // clusters of mutually reachable communities
      const group = new Map(); let g = 0;
      for (const c of list) {
        if (group.has(c.id)) continue;
        const q = [c]; group.set(c.id, g);
        while (q.length) { const a = q.pop(); for (const b of list) if (!group.has(b.id) && contactOf(a, b)) { group.set(b.id, g); q.push(b); } }
        g++;
      }
      if (g < 2) { distant(lid, list, dy); continue; }
      const size = new Array(g).fill(0);
      for (const c of list) size[group.get(c.id)] += c.members.length;
      const main = size.indexOf(Math.max(...size));
      const split = new Map();
      for (const c of list) {
        const k = group.get(c.id);
        if (k === main) { c.langIso = 0; continue; }
        c.langIso = (c.langIso || 0) + dy;
        if (c.langIso > 300) { let a = split.get(k); if (!a) split.set(k, (a = [])); a.push(c); }
      }
      for (const cs of split.values()) {
        const D = Lang.create(Lang.list[lid], Math.floor(AG.Geo.year));
        for (const c of cs) { c.lang = D.id; c.langIso = 0; }
        Lang.splits++;
        if (AG.History) AG.History.event('language', `The speech of ${cs.map((c) => c.name).slice(0, 3).join(', ')} has drifted into a new tongue, ${D.name}, a daughter of ${Lang.list[lid].name}`, { x: cs[0].x, y: cs[0].y, cause: 'isolation', lang: D.id });
      }
    }
  };
  // A dialect continuum: even without a break in contact, the far ends of a widespread language
  // drift apart. Communities far from its speakers' centre for centuries become a daughter tongue.
  function distant(lid, list, dy) {
    let sx = 0, sy = 0, n = 0;
    for (const c of list) { sx += c.x * c.members.length; sy += c.y * c.members.length; n += c.members.length; }
    if (!n) return;
    const cx = sx / n, cy = sy / n, far = [];
    for (const c of list) {
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d > 150) { c.langIso = (c.langIso || 0) + dy; if (c.langIso > 400) far.push(c); } else c.langIso = 0;
    }
    if (far.length < 2) return;
    // the far speakers on one side (the side of the farthest) become one daughter language
    far.sort((a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy));
    const f0 = far[0], ax = f0.x - cx, ay = f0.y - cy;
    const side = far.filter((c) => (c.x - cx) * ax + (c.y - cy) * ay > 0);
    const D = Lang.create(Lang.list[lid], Math.floor(AG.Geo.year));
    for (const c of side) { c.lang = D.id; c.langIso = 0; }
    Lang.splits++;
    if (AG.History) AG.History.event('language', `At the far edge of the ${Lang.list[lid].name}-speaking lands, the speech of ${side.map((c) => c.name).slice(0, 3).join(', ')} has become a tongue of its own, ${D.name}`, { x: f0.x, y: f0.y, cause: 'distance (a dialect continuum)', lang: D.id });
  }

  // Shared meanings with similar words (first two letters) out of the core list.
  Lang.similarity = function (a, b) {
    const A = Lang.get(a), B = Lang.get(b); if (!A || !B) return 0;
    let s = 0; for (const m of MEANINGS) if (A.lex[m].slice(0, 2) === B.lex[m].slice(0, 2)) s++;
    return s / MEANINGS.length;
  };
  Lang.tree = function () { const rows = []; const visit = (L, d) => { rows.push({ L, d }); for (const k of L.kids) visit(Lang.list[k], d + 1); }; for (const L of Lang.list) if (L.parent < 0) visit(L, 0); return rows; };

  // ------------------------------------------------------------ naming
  const fallback = { id: -1, lex: {}, names: { f: ['Ana', 'Ila', 'Mira', 'Sela'], m: ['Tor', 'Kel', 'Dan', 'Ruk'] }, ph: makePhonology() };
  Lang.word = (lid, m) => { const L = Lang.get(lid); return L ? L.lex[m] || word(L.ph) : m; };
  Lang.personName = function (lid, sex) {
    const L = Lang.get(lid) || fallback, pool = sex ? L.names.m : L.names.f;
    let n = pool.length ? pick(pool) : word(L.ph, 2);
    if (rnd() < 0.3) n = n + (L.lex.child ? L.lex.child.slice(0, 2) : '');
    return cap(n);
  };
  const FEATURES = ['river', 'hill', 'stone', 'forest', 'lake', 'shore', 'valley', 'marsh', 'oak', 'pine', 'ford', 'bay', 'mountain', 'field', 'island', 'ash'];
  const MODS = ['great', 'old', 'new', 'red', 'white', 'black', 'high', 'low', 'first', 'bright', 'deep', 'long', 'holy', 'cold', 'warm'];
  // A place is named for what is there: water, stone, trees; a modifier sometimes joins.
  Lang.placeName = function (lid, x, y) {
    const L = Lang.get(lid) || fallback, Wd = AG.World;
    let f = pick(FEATURES);
    if (x !== undefined && Wd.elev) {
      const i = AG.clamp(y | 0, 0, AG.H - 1) * AG.W + AG.clamp(x | 0, 0, AG.W - 1);
      if (Wd.elev[i] > AG.MOUNTAIN) f = pick(['mountain', 'stone', 'hill']);
      else if (Wd.veg[i] > 170) f = pick(['forest', 'oak', 'pine']);
      else if (Wd.rock[i] === AG.ROCK.ALLUVIUM) f = pick(['river', 'ford', 'marsh']);
      else if (Wd.rock[i] === AG.ROCK.VOLCANIC) f = pick(['ash', 'fire', 'stone']);
    }
    const base = L.lex[f] || word(L.ph);
    const s = rnd() < 0.55 ? (L.lex[pick(MODS)] || '') + base : base + (L.lex[pick(['home', 'town', 'hall', 'ford', 'gate'])] || '').slice(0, 3);
    return cap(s.slice(0, 12));
  };
  Lang.peopleName = (lid) => cap((Lang.get(lid) || fallback).lex.people || 'Folk');
  Lang.polityName = function (lid, gov, base) {
    const L = Lang.get(lid) || fallback, p = cap(L.lex.people || base || 'Folk');
    const forms = { band: [`the ${p} band`], tribe: [`the ${p} tribe`, `the ${p} clans`, `the People of ${base}`], chiefdom: [`the Chiefdom of ${base}`, `the ${p} chiefdom`, `the Hall of ${base}`], state: [`the Kingdom of ${base}`, `${base}`, `the Realm of ${base}`, `the ${p} Kingdom`] };
    return pick(forms[gov] || forms.tribe);
  };
  Lang.deityName = function (lid, domain) {
    const L = Lang.get(lid) || fallback, map = { fire: 'flame', water: 'water', storm: 'thunder', earth: 'earth', plague: 'death', harvest: 'grain', war: 'war', watcher: 'sky', death: 'death', sun: 'sun', sea: 'sea', moon: 'moon' };
    const w = L.lex[map[domain] || 'god'] || 'god';
    return cap((L.lex.god || '').slice(0, 2) + w);
  };
})();
