/* ==========================================================================
   UGF — Drop 01 · interactions
   --------------------------------------------------------------------------
   Libraries (CDN, loaded before this file): GSAP 3 + ScrollTrigger, Lenis.
   Content comes from js/drop.js (window.UGF).

   Progressive enhancement: if the CDN scripts fail or the visitor prefers
   reduced motion, the page renders fully static (no loader, no pinning,
   native scrolling) and every feature still works.
   ========================================================================== */
(function () {
  'use strict';

  const DATA = window.UGF;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const MOTION = hasGSAP && !reduceMotion;

  if (MOTION) {
    root.classList.add('motion');
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power3.out' });
  }
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* sandboxed frame */ }

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const money = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
  const waLink = (text) =>
    `https://wa.me/${DATA.site.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const imgSet = (base, side) => [640, 1000, 1300].map((w) => `${base}-${side}-${w}.webp ${w}w`).join(', ');
  // Hash updates can be refused inside embedded/sandboxed frames: never let that break the UI.
  const setHash = (h) => { try { history.replaceState(null, '', h || location.pathname + location.search); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ======================================================================
     1. RENDER — products, specs, size table, links, structured data
     ====================================================================== */
  const track = $('[data-track]');
  const total = DATA.products.length;

  DATA.products.forEach((p, i) => {
    const el = document.createElement('article');
    el.className = 'product';
    el.dataset.index = i;
    const sizes = '(min-width: 900px) 54vh, 82vw';
    const mediaLabel = finePointer ? `Ver detalhes: ${p.name}` : `Virar peça (frente e costas): ${p.name}`;
    el.innerHTML = `
      <div class="product__media" role="button" tabindex="0" data-cursor aria-label="${esc(mediaLabel)}"${finePointer ? '' : ' aria-pressed="false"'}>
        <div class="product__frame reveal">
          <div class="reveal__inner">
            <img class="product__img product__img--front" src="${p.images}-front-1000.webp" srcset="${imgSet(p.images, 'front')}"
                 sizes="${sizes}" width="1000" height="1250" alt="${esc(p.alt.front)}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
            <img class="product__img product__img--back" src="${p.images}-back-1000.webp" srcset="${imgSet(p.images, 'back')}"
                 sizes="${sizes}" width="1000" height="1250" alt="${esc(p.alt.back)}" loading="lazy" decoding="async">
          </div>
        </div>
        <span class="tag tag--tl mono">${esc(p.colorway)} /<br>${esc(p.colorwayEn)}</span>
        <span class="tag tag--tr mono">Algodão pesado /<br>Heavyweight 400g</span>
        <span class="tag tag--vertical mono">UGF — Drop ${DATA.drop.number}</span>
        <span class="tag tag--br mono product__side"><span class="is-front-label">Frente</span><span class="is-back-label">Costas</span></span>
      </div>
      <div class="product__info">
        <p class="mono product__index">${pad(i + 1)} / ${pad(total)}</p>
        <h3 class="product__name">${esc(p.name).replace(/-/g, '\u2011')}</h3>
        <p class="product__price">${money(p.price)}</p>
        <p class="product__color">${esc(p.colorway)} — ${esc(p.colorwayEn)}</p>
        <p class="mono product__spec">${esc(p.spec)}</p>
        <div class="product__actions">
          <button class="btn magnetic" type="button" data-open><span>Ver peça</span></button>
        </div>
      </div>`;
    track.appendChild(el);
  });

  // Spec lists (craft section + product overlay)
  $$('[data-specs]').forEach((dl) => {
    dl.innerHTML = DATA.specs
      .map(([k, v], i) => `<div><dt><span class="n">${pad(i + 1)}</span>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join('');
  });

  // Size table
  const table = $('[data-size-table]');
  if (table) {
    const { columns, rows } = DATA.sizeChart;
    table.insertAdjacentHTML(
      'beforeend',
      `<thead><tr>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
       <tbody>${rows
         .map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((v) => `<td>${v} cm</td>`).join('')}</tr>`)
         .join('')}</tbody>`
    );
  }

  // Social links
  $$('[data-whatsapp]').forEach((a) => (a.href = waLink('Olá, UGF! Vim pelo site.')));
  $$('[data-instagram]').forEach((a) => (a.href = DATA.site.instagram));
  $$('[data-instagram-handle]').forEach((s) => (s.textContent = DATA.site.instagramHandle));

  // Structured data for search engines (built from the same product array)
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'UGF',
        slogan: 'Dream Bigger',
        foundingDate: String(DATA.drop.year),
        founder: [{ '@type': 'Person', name: 'Leti' }, { '@type': 'Person', name: 'Davi' }],
        sameAs: [DATA.site.instagram],
      },
      ...DATA.products.map((p) => ({
        '@type': 'Product',
        name: `UGF ${p.name}`,
        description: p.description,
        brand: { '@type': 'Brand', name: 'UGF' },
        color: `${p.colorway} / ${p.colorwayEn}`,
        image: new URL(`${p.images}-front-1300.webp`, location.href).href,
        offers: { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: 'BRL' },
      })),
    ],
  });
  document.head.appendChild(ld);

  /* ======================================================================
     2. SMOOTH SCROLL (Lenis) + anchor links
     ====================================================================== */
  let lenis = null;
  if (MOTION && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const stopScroll = () => (lenis ? lenis.stop() : root.classList.add('no-scroll'));
  const startScroll = () => (lenis ? lenis.start() : root.classList.remove('no-scroll'));

  function scrollToEl(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 && document.getElementById(id.slice(1));
    if (!target) return;
    e.preventDefault();
    const wasOverlay = closeMenu() | closePdp();
    // wait a beat if an overlay was closing so the scroll is visible
    setTimeout(() => scrollToEl(target), wasOverlay ? 380 : 0);
  });

  /* ======================================================================
     3. TEXT SPLITTING (hero chars, word masks, manifesto words)
     ====================================================================== */
  $$('.hero__title .line').forEach((line) => {
    const text = line.textContent.trim();
    line.textContent = '';
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'char';
      s.textContent = ch;
      line.appendChild(s);
    }
  });

  // Titles that rise word-by-word from a mask
  $$('[data-lines]').forEach((el) => {
    el.innerHTML = el.textContent
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="w"><span>${esc(w)}</span></span>`)
      .join(' ');
  });

  // Manifesto: each word highlights on scroll
  const manifesto = $('[data-words]');
  manifesto.innerHTML = manifesto.textContent
    .trim()
    .split(/\s+/)
    .map((w) => `<span class="word">${esc(w)}</span>`)
    .join(' ');

  /* ======================================================================
     4. PRELOADER → HERO INTRO
     ====================================================================== */
  const loader = $('.loader');
  const heroImg = $('.hero__media img');

  function imageReady(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return new Promise((r) => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
    });
  }

  function runPreloader() {
    return new Promise((resolve) => {
      if (!MOTION) {
        loader.classList.add('is-done');
        resolve();
        return;
      }
      stopScroll();
      window.scrollTo(0, 0);

      const count = $('[data-count]', loader);
      const burst = $('.loader__burst', loader);
      const rays = $('.loader__rays', loader);
      const metas = $$('.loader__meta', loader);
      const state = { v: 0 };
      const render = () => (count.textContent = String(Math.round(state.v)).padStart(3, '0'));

      gsap.set(burst, { rotate: -120, scale: 0.3, transformOrigin: '50% 50%' });
      gsap
        .timeline()
        .to(burst, { rotate: 45, scale: 1, duration: 2.2, ease: 'power3.inOut' }, 0)
        .fromTo(rays, { opacity: 0 }, { opacity: 0.55, duration: 1.4, ease: 'power2.out' }, 0.3)
        .fromTo(metas, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, stagger: 0.08, ease: 'expo.out' }, 0.1);

      gsap.to(state, { v: 86, duration: 1.7, ease: 'power2.inOut', onUpdate: render });

      const ready = Promise.race([
        Promise.all([imageReady(heroImg), document.fonts ? document.fonts.ready : null]),
        new Promise((r) => setTimeout(r, 4500)), // never hold an Instagram visitor longer than this
      ]);
      const minTime = new Promise((r) => setTimeout(r, 1800));

      Promise.all([ready, minTime]).then(() => {
        gsap.to(state, {
          v: 100,
          duration: 0.5,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: render,
          onComplete: () => {
            gsap
              .timeline({
                onComplete: () => {
                  loader.classList.add('is-done');
                  startScroll();
                },
              })
              .to([count.parentElement, ...metas], { yPercent: -110, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.03 }, 0)
              .to(burst, { rotate: 225, scale: 3.4, opacity: 0, duration: 1.05, ease: 'expo.in' }, 0)
              .to($$('.loader__panel', loader), { yPercent: -100, duration: 1.2, ease: 'expo.inOut', stagger: 0.1 }, 0.55)
              .add(resolve, 0.95);
          },
        });
      });
    });
  }

  if (MOTION) {
    gsap.set('.hero__title .char', { yPercent: 118 });
    gsap.set('[data-hero-fade]', { opacity: 0, y: 16 });
    gsap.set(heroImg, { scale: 1.24, transformOrigin: '50% 60%' });
    gsap.set('.nav', { yPercent: -100, opacity: 0 });
  }

  function heroIntro() {
    if (!MOTION) return;
    gsap
      .timeline()
      .to(heroImg, { scale: 1, duration: 3.4, ease: 'power3.out' }, 0) // Ken Burns, zooming out
      .to('.hero__title .char', { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.045 }, 0.1)
      .to('.nav', { yPercent: 0, opacity: 1, duration: 1.1, ease: 'expo.out' }, 0.55)
      .to('[data-hero-fade]', { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.07 }, 0.7);
  }

  /* ======================================================================
     5. SCROLL SCENES
     ====================================================================== */
  function setupScenes() {
    if (!MOTION) return;

    /* Hero exit parallax */
    const heroST = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero__media', { yPercent: 22, ease: 'none', scrollTrigger: heroST });
    gsap.to('.hero__content', { yPercent: -18, opacity: 0.15, ease: 'none', scrollTrigger: heroST });

    /* Nav: minimal after leaving the hero, full again when scrolling up */
    const nav = $('[data-nav]');
    ScrollTrigger.create({
      start: 120,
      end: 'max',
      onUpdate: (self) => nav.classList.toggle('is-min', self.direction === 1),
      onLeaveBack: () => nav.classList.remove('is-min'),
    });

    /* Cinematic light/dark rhythm: the page background follows the section in view */
    root.classList.add('theme-live');
    const THEMES = { dark: ['#0D0D0D', '#E8E4DE'], light: ['#E8E4DE', '#0D0D0D'] };
    gsap.set(root, { '--bg': THEMES.dark[0], '--fg': THEMES.dark[1] });
    const setTheme = (name) =>
      gsap.to(root, { '--bg': THEMES[name][0], '--fg': THEMES[name][1], duration: 0.9, ease: 'power2.inOut', overwrite: 'auto' });
    $$('main [data-tone], body > footer[data-tone]').forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => self.isActive && setTheme(sec.dataset.tone),
      });
    });

    /* Image reveals: clip-path wipe bottom → top + scale-down */
    $$('.reveal').forEach((el) => {
      if (el.closest('.drop__track')) return; // products are handled with the horizontal scene
      const inner = $('.reveal__inner', el);
      const st = { trigger: el, start: 'top 86%', once: true };
      gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.out', scrollTrigger: st });
      gsap.fromTo(inner, { scale: 1.3 }, { scale: 1, duration: 2, ease: 'expo.out', scrollTrigger: st });
    });

    /* Parallax on lifestyle photos */
    $$('[data-parallax]').forEach((img) =>
      gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: img.closest('figure') || img, start: 'top bottom', end: 'bottom top', scrub: true } })
    );
    $$('[data-parallax-strong]').forEach((img) =>
      gsap.fromTo(img, { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: img.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true } })
    );

    /* Manifesto: words light up one by one as you scroll */
    gsap.fromTo(
      '.manifesto__text .word',
      { opacity: 0.13 },
      { opacity: 1, ease: 'none', stagger: 0.5, scrollTrigger: { trigger: '.manifesto__text', start: 'top 78%', end: 'bottom 42%', scrub: 0.6 } }
    );
    gsap.from('.manifesto__foot > *', {
      y: 24, opacity: 0, duration: 1.1, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: '.manifesto__foot', start: 'top 90%', once: true },
    });

    /* Word-mask titles */
    $$('[data-lines]').forEach((el) =>
      gsap.from($$('.w > span', el), {
        yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.035,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      })
    );

    /* Spec rows draw in */
    $$('.craft .specs > div').forEach((row, i) =>
      gsap.from(row, { opacity: 0, x: -16, duration: 0.9, delay: i * 0.06, scrollTrigger: { trigger: row, start: 'top 92%', once: true } })
    );

    /* Lookbook statement */
    gsap.from('.lookbook__title .line > span', {
      yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.12,
      scrollTrigger: { trigger: '.lookbook__title', start: 'top 80%', once: true },
    });

    /* Size table rows */
    gsap.fromTo('.sizes-table tr', { opacity: 0, y: 14 }, {
      opacity: 1, y: 0, duration: 0.8, stagger: 0.05, clearProps: 'opacity,transform',
      scrollTrigger: { trigger: '.sizes-table', start: 'top 85%', once: true },
    });

    /* Footer wordmark rises */
    gsap.from('.footer__word span', {
      yPercent: 100, duration: 1.6, ease: 'expo.out',
      scrollTrigger: { trigger: '.footer__word', start: 'top 95%', once: true },
    });

    setupMarquee();
  }

  /* ---------- Infinite marquee, nudged by scroll velocity ---------- */
  function setupMarquee() {
    const mq = $('.marquee__track');
    const group = $('.marquee__group', mq);
    mq.appendChild(group.cloneNode(true));
    const loop = gsap.to(mq, { xPercent: -50, duration: 34, ease: 'none', repeat: -1 });
    loop.totalTime(loop.duration() * 100); // room to play backwards
    let dir = 1;
    ScrollTrigger.create({
      trigger: '.marquee',
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => loop.paused(!self.isActive),
      onUpdate: (self) => {
        dir = self.direction;
        const boost = Math.min(Math.abs(self.getVelocity()) / 400, 5);
        gsap.to(loop, { timeScale: dir * (1 + boost), duration: 0.25, overwrite: true });
        gsap.to(loop, { timeScale: dir, duration: 1.2, delay: 0.25, ease: 'power2.out' });
      },
    });
  }

  /* ======================================================================
     6. DROP 01 — pinned horizontal scroll, counter, progress line
     ====================================================================== */
  function setupDrop() {
    const section = $('.drop');
    const products = $$('.product', track);
    const bar = $('[data-bar]');
    const current = $('[data-count-current]');
    $('[data-count-total]').textContent = pad(products.length);
    let active = -1;

    const updateCounter = () => {
      const mid = window.innerWidth / 2;
      let best = 0;
      let bestD = Infinity;
      products.forEach((p, i) => {
        const r = p.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== active) {
        active = best;
        current.textContent = pad(best + 1);
        if (MOTION) gsap.fromTo(current, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      }
    };

    if (!MOTION) {
      // Native horizontal swipe fallback
      const vp = $('.drop__viewport');
      vp.addEventListener('scroll', () => {
        const max = vp.scrollWidth - vp.clientWidth;
        bar.style.transform = `scaleX(${max ? vp.scrollLeft / max : 0})`;
        updateCounter();
      }, { passive: true });
      updateCounter();
      return;
    }

    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    // counter + progress follow the (scrubbed) slide itself, so they never lag behind
    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      onUpdate() {
        gsap.set(bar, { scaleX: this.progress() });
        updateCounter();
      },
    });

    // Touch screens: settle on the nearest panel (intro or a product) when the finger lifts.
    const snapPoints = () => {
      const d = distance() || 1;
      const pts = [track.firstElementChild, ...products].map((el) =>
        Math.min(1, Math.max(0, (el.offsetLeft + el.offsetWidth / 2 - window.innerWidth / 2) / d))
      );
      return [...new Set([0, ...pts, 1])];
    };

    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: () => '+=' + distance(),
      pin: true,
      scrub: finePointer ? 0.9 : 0.5,
      animation: slide,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      snap: finePointer ? false : {
        snapTo: (v) => snapPoints().reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)),
        duration: { min: 0.25, max: 0.7 },
        delay: 0.05,
        inertia: false, // native momentum already carries the finger; just settle on the nearest panel
        ease: 'power3.inOut',
      },
    });

    // Reveals for each product as it slides into view
    products.forEach((p) => {
      const frame = $('.product__frame', p);
      const st = { trigger: p, containerAnimation: slide, start: 'left 92%', once: true };
      gsap.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out', scrollTrigger: st });
      gsap.fromTo($('.reveal__inner', frame), { scale: 1.28 }, { scale: 1, duration: 1.9, ease: 'expo.out', scrollTrigger: st });
      gsap.from($('.product__info', p).children, { y: 26, opacity: 0, duration: 1, stagger: 0.06, ease: 'power3.out', scrollTrigger: st });
    });

    gsap.from('.drop__intro > *', {
      y: 40, opacity: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out',
      scrollTrigger: { trigger: section, start: 'top 70%', once: true },
    });
    updateCounter();
  }

  /* ---------- Front/back flip + open detail ---------- */
  function toggleFlip(product, force) {
    const on = product.classList.toggle('is-back', force);
    $('.product__media', product).setAttribute('aria-pressed', String(on));
  }

  track.addEventListener('click', (e) => {
    const product = e.target.closest('.product');
    if (!product) return;
    const idx = Number(product.dataset.index);
    if (e.target.closest('[data-open]')) return openPdp(idx);
    if (e.target.closest('.product__media')) return finePointer ? openPdp(idx) : toggleFlip(product);
  });
  track.addEventListener('keydown', (e) => {
    const media = e.target.closest('.product__media');
    if (!media || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    const product = media.closest('.product');
    if (finePointer) openPdp(Number(product.dataset.index));
    else toggleFlip(product);
  });

  /* ======================================================================
     7. PRODUCT DETAIL OVERLAY + WhatsApp checkout
     ====================================================================== */
  const pdp = $('#pdp');
  const pdpScroll = $('.pdp__scroll', pdp);
  const buy = $('[data-pdp-buy]', pdp);
  const msg = $('[data-pdp-msg]', pdp);
  const sizeFs = $('.pdp__sizes', pdp);
  let pdpOpen = false;
  let pdpProduct = null;
  let pdpSize = null;
  let lastFocus = null;

  function waMessage(p, size) {
    return [
      'Olá, UGF! Quero comprar:',
      '',
      `• Peça: ${p.name}`,
      `• Cor: ${p.colorway} / ${p.colorwayEn}`,
      `• Tamanho: ${size}`,
      `• Valor: ${money(p.price)}`,
      '',
      `Drop ${DATA.drop.number}, vim pelo site.`,
    ].join('\n');
  }

  function openPdp(index) {
    const p = DATA.products[index];
    if (!p) return;
    pdpProduct = p;
    pdpSize = null;
    lastFocus = document.activeElement;

    $('[data-pdp-index]', pdp).textContent = `${pad(index + 1)} / ${pad(total)}`;
    $('[data-pdp-type]', pdp).textContent = `${p.type} — Drop ${DATA.drop.number}`;
    $('[data-pdp-name]', pdp).textContent = p.name;
    $('[data-pdp-price]', pdp).textContent = money(p.price);
    $('[data-pdp-color]', pdp).textContent = `${p.colorway} / ${p.colorwayEn} — ${p.spec}`;
    $('[data-pdp-desc]', pdp).textContent = p.description;
    $('[data-pdp-print]', pdp).innerHTML = `<li>Frente: ${esc(p.front)}</li><li>Costas: ${esc(p.back)}</li>`;
    $('[data-pdp-gallery]', pdp).innerHTML = ['front', 'back']
      .map(
        (side, i) => `
        <figure class="pdp__figure">
          <img src="${p.images}-${side}-1300.webp" srcset="${imgSet(p.images, side)}" sizes="(min-width: 900px) 58vw, 100vw"
               width="1300" height="1625" alt="${esc(p.alt[side])}" decoding="async">
          <figcaption>
            <span class="tag tag--tl mono">${esc(p.colorway)} /<br>${esc(p.colorwayEn)}</span>
            <span class="tag tag--tr mono">${pad(i + 1)} / 02</span>
            <span class="tag tag--bl mono">${side === 'front' ? 'Frente' : 'Costas'}</span>
            <span class="tag tag--br mono">UGF — Drop ${DATA.drop.number}</span>
          </figcaption>
        </figure>`
      )
      .join('');
    $('[data-pdp-sizes]', pdp).innerHTML = DATA.sizes
      .map((s) => `<label class="size-opt"><input type="radio" name="pdp-size" value="${esc(s)}"><span>${esc(s)}</span></label>`)
      .join('');
    buy.href = waLink(`Olá, UGF! Tenho interesse na peça ${p.name}.`);
    msg.textContent = '';
    sizeFs.classList.remove('is-error');

    pdp.hidden = false;
    pdpOpen = true;
    pdpScroll.scrollTop = 0;
    root.classList.add('pdp-open');
    stopScroll();
    setHash('#peca-' + p.slug);

    if (MOTION) {
      gsap.fromTo(pdp, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'expo.inOut' });
      gsap.fromTo($$('.pdp__figure img', pdp), { scale: 1.18 }, { scale: 1, duration: 1.6, ease: 'expo.out', delay: 0.25 });
      gsap.fromTo($$('.pdp__info > *', pdp), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.05, ease: 'power3.out', delay: 0.35 });
    }
    setTimeout(() => $('[data-pdp-close]', pdp).focus({ preventScroll: true }), MOTION ? 450 : 0);
  }

  function closePdp() {
    if (!pdpOpen) return false;
    pdpOpen = false;
    root.classList.remove('pdp-open');
    startScroll();
    setHash('');
    const done = () => {
      pdp.hidden = true;
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
    if (MOTION) gsap.to(pdp, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.8, ease: 'expo.inOut', onComplete: done });
    else done();
    return true;
  }

  pdp.addEventListener('change', (e) => {
    if (e.target.name !== 'pdp-size') return;
    pdpSize = e.target.value;
    buy.href = waLink(waMessage(pdpProduct, pdpSize));
    sizeFs.classList.remove('is-error');
    msg.textContent = `Tamanho ${pdpSize} selecionado.`;
  });

  buy.addEventListener('click', (e) => {
    if (pdpSize) return; // let the link open WhatsApp with the pre-filled message
    e.preventDefault();
    sizeFs.classList.add('is-error');
    msg.textContent = 'Escolha um tamanho para continuar.';
    const first = $('input', sizeFs);
    if (first) first.focus();
    if (MOTION) gsap.fromTo($$('.size-opt span', sizeFs), { opacity: 0.35 }, { opacity: 1, duration: 0.6, stagger: 0.05, ease: 'power2.out' });
  });

  $('[data-pdp-close]', pdp).addEventListener('click', closePdp);

  // Keyboard: Esc closes, Tab stays inside the dialog
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePdp(); closeMenu(); }
    if (e.key !== 'Tab' || !pdpOpen) return;
    const f = $$('a[href], button, input, [tabindex]:not([tabindex="-1"])', pdp).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ======================================================================
     8. MOBILE MENU
     ====================================================================== */
  const menu = $('#menu');
  const menuToggle = $('[data-menu-toggle]');

  function openMenu() {
    menu.hidden = false;
    root.classList.add('menu-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    stopScroll();
    if (MOTION) {
      gsap.fromTo(menu, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.inOut' });
      gsap.fromTo($$('.menu__links a', menu), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, stagger: 0.07, ease: 'expo.out', delay: 0.3 });
    }
  }
  function closeMenu() {
    if (menu.hidden) return false;
    root.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    startScroll();
    if (MOTION) gsap.to(menu, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.7, ease: 'expo.inOut', onComplete: () => (menu.hidden = true) });
    else menu.hidden = true;
    return true;
  }
  menuToggle.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));

  /* ======================================================================
     9. CURSOR (desktop) + MAGNETIC BUTTONS
     ====================================================================== */
  function setupCursor() {
    if (!MOTION || !finePointer) return;
    root.classList.add('has-cursor');
    const cursor = $('.cursor');
    const dot = $('.cursor__dot', cursor);
    const ring = $('.cursor__ring', cursor);
    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
    gsap.set(cursor, { opacity: 0 });
    gsap.to(dot, { rotate: 360, duration: 10, ease: 'none', repeat: -1 });

    let shown = false;
    window.addEventListener('pointermove', (e) => {
      if (!shown) { gsap.set(cursor, { x: e.clientX, y: e.clientY }); gsap.to(cursor, { opacity: 1, duration: 0.3 }); shown = true; }
      xTo(e.clientX);
      yTo(e.clientY);
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { gsap.to(cursor, { opacity: 0, duration: 0.3 }); shown = false; });

    let mode = '';
    const setMode = (m) => {
      if (m === mode) return;
      mode = m;
      gsap.to(ring, { scale: m === 'view' ? 1 : 0, opacity: m === 'view' ? 1 : 0, duration: 0.55, ease: 'expo.out' });
      gsap.to(dot, { scale: m === 'view' ? 0 : m === 'link' ? 2 : 1, duration: 0.45, ease: 'power3.out' });
    };
    document.addEventListener('pointerover', (e) => {
      const t = e.target;
      if (t.closest('[data-cursor]')) setMode('view');
      else if (t.closest('a, button, label, [role="button"]')) setMode('link');
      else setMode('');
    });
  }

  function setupMagnetic() {
    if (!MOTION || !finePointer) return;
    $$('.magnetic').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.38);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ======================================================================
     10. FOOTER WORDMARK — fit "UGF" to the full width
     ====================================================================== */
  function fitFooter() {
    const span = $('[data-fit]');
    const box = span.parentElement;
    box.style.fontSize = '100px';
    const w = span.getBoundingClientRect().width;
    if (w) box.style.fontSize = (100 * box.clientWidth) / w + 'px';
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  fitFooter();
  setupDrop();
  setupScenes();
  setupCursor();
  setupMagnetic();

  const refresh = () => { fitFooter(); if (MOTION) ScrollTrigger.refresh(); };
  if (document.fonts) document.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitFooter, 120); });

  runPreloader().then(() => {
    heroIntro();
    // Deep link: #peca-<slug> opens that product directly (handy for Instagram stories)
    const fromHash = () => {
      const m = location.hash.match(/^#peca-([a-z0-9-]+)$/);
      const i = m ? DATA.products.findIndex((p) => p.slug === m[1]) : -1;
      if (i > -1) openPdp(i);
      else if (!location.hash) closePdp();
    };
    if (/^#peca-/.test(location.hash)) setTimeout(fromHash, MOTION ? 900 : 0);
    window.addEventListener('hashchange', fromHash);
  });
})();
