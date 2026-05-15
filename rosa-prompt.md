# LLM Prompt — Cinematic Website for Rosa (Rosangela Dias de Souza)

A self-contained prompt to give to any capable LLM (Claude, GPT, Gemini) to generate Rosa's website. Drop the **PROMPT** block below into a fresh chat. The **BRIEF** above it is for the human operator.

---

## BRIEF (operator notes — not part of the prompt)

**Client:** Rosangela Dias de Souza ("Rosa"). Art educator based in Salvador, Bahia, Brazil.

**Source material (from Google Chat, 30 Apr):**
> 1. Textos: visão, trajetória, método de ensino;
> 2. Currículo; 3. Personalidade (cultura, música, dança, teatro); 4. Fotos dos trabalhos; 5. Arte-Educação; 6. Curso; 7. Foco do site eu quero voltado para curso de arte para professores de Arte. Ensinando a construir ideias de atividades, reconhecer estilos, aprender a criar slides, criar conteúdos fazendo o cruzamento dos conteúdos da BNCC e Historia da Arte.
> Eu vou querer na aparência [d]o site imagens dos trabalhos dos estudantes.
> **Gosto de cores terrosas e a estética Afro-Indígena com elementos da cidade de Salvador.**

**Aesthetic anchor:** Cinematic, slow, atmospheric — the reference video's pacing (long takes, soft grain, warm light, deep shadow). Translated into web language: full-bleed imagery of student artworks, slow ken-burns, scroll-driven reveals, a hush.

**Still needed from Rosa before final build:**
- CV (currículo) — Luiz asked for it on 2 May
- Bio / vision / trajectory texts
- 10–20 photos of student artworks (high-res)
- Course details: price, schedule, modules, target audience specifics
- Headshot (optional but recommended)
- Logo or wordmark preference

---

## PROMPT

```
You are a senior frontend designer-developer building a cinematic single-page
website for a Brazilian art educator. Output ONE self-contained `index.html`
file with inline `<style>` and `<script>`, no build step, no external JS
dependencies beyond Google Fonts. The site is in Brazilian Portuguese
(pt-BR).

## CLIENT

- Name: Rosangela Dias de Souza — known as **Rosa**.
- Location: Salvador, Bahia, Brasil.
- Profession: Arte-educadora. Professora de Arte com foco na formação de
  outros professores de Arte.
- Primary offer: an online course for Art teachers that teaches them to
  build classroom activities, recognize artistic styles, build slides, and
  cross-reference the BNCC (Base Nacional Comum Curricular) with História
  da Arte.

## AESTHETIC DIRECTION

Cinematic + editorial + Afro-Indígena + Soteropolitano (of Salvador).

Think: warm 35mm grain, late-afternoon Bahian light, baroque ochres of
Pelourinho, indigo of the Atlântico, terracotta of barro, the geometry of
Afro-Brazilian textiles and Indigenous body-painting. The site should feel
like a slow film, not a brochure. Restraint. Air. Hush.

NO clichés: avoid tropical-cliché coconut/parrot motifs, avoid samba-stock
imagery, avoid carnaval glitter. The reference is the quiet dignity of
Pierre Verger photography and Mestre Didi sculpture — not tourism.

### Tone of voice (pt-BR)

- First person ("Sou Rosa…").
- Warm, grounded, professorial but not academic.
- Short sentences. Brazilian Portuguese, not translated-feeling.
- Headlines can be lyrical fragments (e.g. "Ensinar arte é abrir janelas").

## DESIGN TOKENS

CSS custom properties on `:root`. Use these exact values.

```css
/* Background layers — warm near-black, never pure #000 */
--bg-deep:      #1A1410;   /* base canvas, charcoal-brown */
--bg-base:      #211A14;   /* primary surface */
--bg-elevated:  #2B2017;   /* cards, modals */
--surface:      rgba(242, 230, 204, 0.04);

/* Foreground */
--fg:           #F2E6CC;   /* areia / sand-cream, primary text */
--fg-muted:     #B8A88A;   /* warm taupe, secondary text */
--fg-subtle:    #7A6B54;   /* metadata, labels */

/* Accents — Bahian palette */
--terra:        #B5532A;   /* terracotta, primary warm accent */
--ocre:         #C9962B;   /* Bahian gold / dourado */
--anil:         #2E4057;   /* indigo of céu baiano */
--pau-brasil:   #7A2E1F;   /* deep red wood */
--mata:         #4A5D3A;   /* Atlantic forest green, sparingly */

/* Glow / atmospheric */
--accent:       var(--ocre);
--accent-glow:  rgba(201, 150, 43, 0.22);
--border:       rgba(242, 230, 204, 0.10);

/* Type */
--serif:        "Fraunces", "Cormorant Garamond", Georgia, serif;
--sans:         "Inter", -apple-system, "Segoe UI", sans-serif;
--mono:         "DM Mono", ui-monospace, monospace;

/* Motion */
--ease:         cubic-bezier(0.16, 1, 0.3, 1);
--ease-in:      cubic-bezier(0.7, 0, 0.84, 0);
--radius:       2px;             /* almost-zero, editorial */
--max:          1440px;
```

Fonts via Google Fonts:
- Fraunces (display) — use `opsz=144`, `SOFT=50`, weights 300/400/500/700,
  italic for emphasis. The soft axis is critical for warmth.
- Inter — 300/400/500.
- DM Mono — 400, used uppercased and letter-spaced for labels.

## STRUCTURE (single page, scroll-driven)

In this order, top to bottom:

1. **Header / nav** — fixed, low-opacity, becomes solid on scroll.
   Logo wordmark "ROSA DIAS" (Fraunces 500, tracking-tight).
   Nav: Visão · Trajetória · Método · Trabalhos · Curso · Contato.

2. **Hero** — full-viewport, dark.
   Slow ken-burns sequence cycling 3–4 student-artwork photos at 12s each,
   crossfading. Overlay gradient bottom-up from --bg-deep to transparent
   so type reads.
   Eyebrow (mono, uppercase, ocre): "ARTE-EDUCAÇÃO · SALVADOR · BAHIA".
   H1 (Fraunces, 8–12vw, light weight, italic for one word): "Ensinar arte
   é abrir janelas." (or similar — make 2 candidate lines, pick the
   stronger).
   Subhead (Inter 300, max-width 56ch): one sentence on what Rosa does.
   Quiet CTA: text-link "Conheça o curso ↓".
   Scroll cue at bottom: thin vertical line that animates.

3. **Visão** (Vision) — section with a single large pull-quote, serif,
   italic, 5–6 lines max. Earthy texture or thin ocre rule above.

4. **Trajetória** (Trajectory) — vertical timeline.
   Years on the left in DM Mono, milestones on the right in serif.
   Subtle indigo (--anil) marker dots. 6–10 entries.
   PLACEHOLDER until Rosa sends her CV.

5. **Método de Ensino** (Teaching Method) — three or four pillars.
   Each pillar: a one-word title (Fraunces large), 2–3 sentence body,
   a thin terra-colored rule. Grid on desktop, stacked on mobile.
   Pillars to draft: "Observar", "Cruzar" (BNCC × História da Arte),
   "Construir" (atividades, slides), "Reconhecer" (estilos).

6. **Currículo** (CV) — clean two-column at desktop.
   Left: formação. Right: experiência. Mono labels, serif content.
   PLACEHOLDER until Rosa sends it.

7. **Personalidade** — a four-card row: Cultura, Música, Dança, Teatro.
   Each card: a small symbol or initial in ocre, a one-line poetic note in
   serif italic. Hover: slight lift, ocre glow underneath.
   This humanizes Rosa beyond the educator role.

8. **Trabalhos dos Estudantes** (Student Works Gallery).
   Masonry / staggered grid, 8–16 images.
   Captions: student first name + grade level + technique, in mono,
   uppercase. Click → lightbox with credit line.
   This is the visual centerpiece — give it room. Full-bleed section, the
   gallery breaks the max-width container.

9. **Arte-Educação** — short manifesto-style block.
   Three short paragraphs on why arte-educação matters in basic ed,
   how it connects to BNCC, what it does for students who are not "going
   to be artists". Serif body, generous line-height (1.7).

10. **Curso para Professores de Arte** — the main offer.
    Anchor: #curso.
    Headline (serif, large). One-paragraph description.
    Four modules listed as a numbered series (mono numerals 01–04):
      01. Reconhecer estilos
      02. Cruzar BNCC × História da Arte
      03. Construir atividades
      04. Criar slides e conteúdos
    Below: "O que você leva" (3 outcomes, bullets).
    CTA button: "Quero me inscrever" — solid terra background, sand-cream
    text, no border-radius greater than --radius. On hover: ocre glow.
    Below CTA: course meta (duração, formato, próxima turma) in mono.
    PLACEHOLDER for price and dates.

11. **Contato** — quiet, minimal.
    Email + WhatsApp (placeholder), Instagram (placeholder),
    cidade: Salvador, Bahia.
    Optional contact form: nome, email, mensagem. Submit via mailto:
    until a backend exists.

12. **Footer** — single line: © {ano} Rosangela Dias de Souza. Salvador, BA.
    Tiny ocre dot · pt-BR.

## MOTION

- All easing uses --ease.
- Sections fade-up on enter (IntersectionObserver, threshold 0.15,
  translateY 24px → 0, opacity 0 → 1, duration 900ms).
- Hero ken-burns: each image scale 1.0 → 1.08 over 12s, crossfade 1.6s.
- Respect `prefers-reduced-motion: reduce` — disable ken-burns and
  fade-ups, replace with instant reveal.
- No scroll-jacking. No locked horizontal-scroll sections on mobile.

## TEXTURE

Add a subtle film-grain overlay at body level:
- Tiny SVG noise (turbulence baseFrequency=0.9, 200x200), opacity 0.05,
  mix-blend-mode: overlay, fixed, pointer-events: none.

Add one or two very-low-opacity "ambient" warm radial gradients fixed in
the viewport background, drifting slowly (CSS @keyframes, 60s+).

DO NOT add azulejo tile patterns, Bahian flag colors, or any literal
"Salvador" graphic. The aesthetic is suggested through palette and pacing,
not iconography.

## ACCESSIBILITY

- Body text contrast ≥ 7:1 (sand-cream on charcoal-brown easily passes).
- All interactive elements have visible :focus-visible outlines in ocre,
  2px offset.
- Images have descriptive alt text in pt-BR.
- Lightbox is keyboard-navigable (Esc to close, ← → to navigate).
- `lang="pt-BR"` on the html element.

## RESPONSIVE

- Mobile-first. Breakpoints at 640, 960, 1280.
- Hero H1 scales with clamp(2.5rem, 8vw, 7rem).
- Gallery: 1 column < 640, 2 cols < 960, 3 cols < 1280, 4 cols above.
- Nav collapses to a hamburger < 768; menu slides down with the same
  easing.

## TECHNICAL CONSTRAINTS

- Single file. No frameworks, no bundlers, no React.
- Vanilla JS only, < 200 lines.
- Inline critical CSS. Defer Google Fonts with rel="preconnect".
- Lazy-load all gallery images with `loading="lazy"` and width/height attrs
  to prevent CLS.
- Use semantic HTML5 (header, main, section, article, footer, figure,
  figcaption).
- Place all student-image placeholders as comments
  `<!-- IMG: replace with /images/work-01.jpg, alt="Trabalho de [Nome],
  [técnica]" -->` so Rosa can swap them in.

## COPY PLACEHOLDERS

Where Rosa's real copy is missing, write tasteful PT-BR placeholder copy
that reads as final-quality, not lorem ipsum, and wrap it in a comment
like `<!-- TODO Rosa: confirmar ou substituir -->`. Examples of acceptable
placeholder bio fragments: "Sou Rosa, arte-educadora há mais de vinte anos
em Salvador.", "Minha sala de aula começou no chão batido do recôncavo."

## DELIVERABLE

A single `index.html` file, production-quality, that Rosa could host on
Netlify/Vercel today by dropping images into `/images/` and editing two
sections. Comment the structure clearly. No build step.
```

---

## Notes for whoever runs this prompt

- If the LLM you use supports images, paste in 2–3 frames from the YouTube
  reference (full-bleed warm-light, deep-shadow stills) before sending the
  prompt — it visibly improves the output.
- After the first generation, ask the LLM for a second pass focused on
  one section at a time. The gallery and the course CTA usually need a
  second iteration.
- Replace placeholders the moment Rosa sends her CV, vision text, and the
  student artwork photos.
