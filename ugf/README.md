# UGF — Drop 01

One-page site for UGF ("Dream Bigger", est. 2026). Plain HTML/CSS/JS, no build step.

```
ugf/
├── index.html          page structure + SEO / Open Graph
├── css/main.css        all styles (mobile-first, 5-colour palette as CSS tokens)
├── js/drop.js          ← EDIT THIS for new drops: products, prices, sizes, WhatsApp, Instagram
├── js/main.js          interactions (GSAP + ScrollTrigger + Lenis, loaded from CDN)
└── assets/
    ├── img/            hero, craft, lookbook, sobre (WebP)
    ├── img/products/   <slug>-front|back-640|1000|1300.webp (4:5)
    └── brand/          favicon, touch icon, og-image.jpg, grain.png
```

## Before launch

1. **WhatsApp + Instagram**: set `site.whatsapp` (digits only, with country code, e.g. `5511999999999`) and `site.instagram` in `js/drop.js`.
2. **Size chart**: the measurements in `sizeChart` are placeholders typical of an oversized fit. Replace them with the real production measurements.
3. **Open Graph**: once the domain is live, change `og:image` in `index.html` to an absolute URL and add `og:url`. Instagram and WhatsApp previews need the absolute URL.
4. **Lifestyle photos**: the hero fabric close-up, the craft macro, the group photo and the hoodie trio came from the pitch-deck PDF (about 240–600 px wide). They were AI-upscaled and graded, and they hold up behind film grain, but the original high-res photos will look sharper. Drop them in with the same filenames.

## New drop

1. Add or replace entries in `products` in `js/drop.js`.
2. Export front/back shots at 4:5 as `assets/img/products/<slug>-front-640.webp` (also `-1000` and `-1300`), and the same for `-back-`.
3. Done. The horizontal showcase, the 01/03 counter, the product overlay, the WhatsApp message and the structured data are all generated from the array.

## Run locally

```
cd ugf && python3 -m http.server 8000
```

Open http://localhost:8000. Deep links such as `#peca/starburst-hoodie` open a product directly, which is handy for Instagram stories.

## Behaviour notes

- If the CDN scripts fail or the visitor prefers reduced motion, the page falls back to a fully static layout (no loader, native scrolling, swipeable product row). Nothing breaks.
- The custom cursor and hover flip are desktop-only. On phones, tapping a product flips it front/back, and the pinned showcase snaps to the nearest piece.
