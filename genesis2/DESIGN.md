# AURA: Genesis 2 — Design Document

A browser god-sandbox that simulates a living planet across deep time: continents drift, species
evolve, individual people live and remember, and civilizations climb from the Stone Age through
real causes. Nothing in history is scripted. The map changes because of geology, life changes
because of selection, and every era a people reaches is earned from what they had, where they
lived and who they met.

Genesis 2 is built on the engine of AURA: Genesis 1 (`../genesis`):
- Kept: grid fluids, fire and weather, the 2D renderer, the 3D close-up and the god-tool
  framework.
- Replaced: the fantasy races and culture tree, with a geological, biological and historical
  simulation.

---

## 1. Pillars

1. **Causes, not scripts.** Every major event in the chronicle carries a cause link (an
   eruption, a famine, an invention, a grudge). The game never forces an era, a war or a
   speciation.
2. **People are records; bodies are a view.** A person exists whether or not anyone is looking.
   Near the camera they are embodied and act moment to moment. Far away or in fast time they live
   statistically on the same record. Switching between the two loses nothing that matters.
3. **Three clocks, one world.** Geology runs in millions of years, history in centuries,
   individual lives in days. One time control moves between them, and every system declares
   which clock it runs on.
4. **Determinism.** The same seed plus the same god actions produce the same history. That
   makes save/load, replay, tests and counterfactual branching possible.

---

## 2. Architecture

```
index.html  ── UI shell; three.js r128 (vendored) for the 3D close-up
js/core.js     namespace AG, RNG, noise, static tables (genome loci, buildings, eras)
js/world.js    fine grid fields (elevation, fluids, soil, vegetation, ice, resources…)
js/geo.js      NEW  plates, boundaries, strain, magma, erosion, climate, sea level, glaciers
js/sky.js      weather, seasons, day/night (kept)
js/fx.js       particles (kept)
js/physics.js  fluids, fire, gas, slow land pass (kept, sea level made dynamic)
js/life.js     NEW  diploid genomes, species registry, phylogeny, regional evolution
js/habitat.js  NEW  where an animal would be: species profiles, cell scores, coarse maps
js/entities.js bodies (structure of arrays) + spatial hash
js/people.js   NEW  person records: minds, memory, relationships, health, life story
js/lang.js     NEW  languages: phonology, lexicon, drift, splits, families, naming
js/tech.js     NEW  invention graph, discovery, diffusion, loss, eras
js/civ.js      communities, polities, government, institutions, economy, war, LOD
js/ai.js       brains for embodied people and creatures, movement, combat
js/history.js  NEW  cause-linked chronicle, timeline, era maps, save/load, branches
js/god.js      player powers
js/render.js   stylized 2D renderer + overlays
js/post3d.js   NEW  the 3D finish: ink outlines, tilt-shift focus, bloom, grading, FXAA; the looks
js/textures.js NEW  24 tileable surface textures painted in code (grass, rock, masonry, thatch...)
js/view3d.js   3D renderer (voxel terrain, cel-shaded models)
js/disaster3d.js  real-time meteor flights and impacts in the 3D close-up
js/models3d.js people (regional dress, genetic skin and hair), animals (per-species body plans,
               inherited markings) and regional architecture, instanced
js/icons.js    pixel icons: one per power, the power-bar tabs and the tool dock
js/ui.js       power bar, tool dock, panels, inspector, phylogeny, tech tree, menu, input
js/screens.js  loading screen (starfield, the world's own globe) and title screen (emblem)
js/main.js     clocks, modes, frame loop, performance governor, boot
tests/         headless Node test suite and scenario demos
```

The simulation modules (`core` through `history`, and `god`) never touch the DOM. The Node test
harness (`tests/harness.js`) loads them into a sandbox with a stub `window`. This is how the test
suite runs determinism, geology, genetics and technology tests without a browser.

---

## 3. Time

### 3.1 Clocks

| Clock | Unit | Systems | Runs during |
|---|---|---|---|
| **Tick** | 1/20 s of play at 1× (1 year = 960 ticks) | bodies, AI, fluids, fire, weather, combat | Watch speeds |
| **Year step** | Δ = 1–10 years | communities, persons, techs, languages, species regions, climate, sea level, quakes, eruptions | History speeds and, sliced, in the background of Watch speeds |
| **Age step** | 0.5 million years | plate drift, collision, rifting, orogeny, erosion, deep evolution | Deep time |

### 3.2 Time control

| Button | Rate | Mode |
|---|---|---|
| Pause | 0 | everything frozen; inspection and tools still work |
| 1×, 4×, 16× | 1/48, 1/12, 1/3 year per second | **Watch**: bodies near the camera act tick by tick |
| Centuries | 20 years per second | **History**: aggregate year steps, Δ = 1 |
| Millennia | up to 400 years per second | **History**: Δ = 8 |
| Ages | 6 million years per second | **Deep time** (before the Age of People); *Skip to the Dawn* races the rest |

The sim runs under a per-frame budget (9 ms at the High quality level, down to 5 ms at Minimum,
and doubled when the frame rate is capped at 30). A history step is split into phases and spread over as many frames as it needs:
- land and life
- each community
- inventions
- the year's end in parts: contacts between communities (a job that can stop between rows and
  resume), polities, war, languages and borders

The picture stays smooth while thousands of people live their years. The order of work is
identical however a step is sliced (a determinism test checks it). When a rate can't be met,
the HUD shows "at capacity" and the achieved years per second appear in World → Engine.

### 3.3 Calendar and world story

The world keeps one calendar that counts forward from its birth: Year 0, 1, 2 and so on. Deep
time advances it half a million years per step; the Age of People carries on the same count one
year at a time. The world is not heading toward any real present: it is its own planet.

1. **Deep time** starts at Year 0 with a new supercontinent, different in every world.
   - The plates first stretch it (a slow rifting phase), then rift it apart along its old seams,
     drift, collide and raise mountains.
   - Founder lineages (grazers, browsers, predators, small foragers, birds, primates) spread
     and radiate as the land splits.
   - The player watches at Ages speed or skips ahead.
2. **The Dawn** comes when evolution gets there, so its year differs between worlds (typically
   between Year 130 million and Year 270 million, with a cap at 340 million). Social primates face
   a slowly rising payoff for intelligence; once a lineage's mean cognition passes the threshold,
   people appear within some millions of years, by chance. The world is then finalised: fine
   terrain, rivers, soils, vegetation, ores. Animals are embodied from their regional gene pools.
   - The cleverest primate lineage becomes **sapient**. Its range is the **cradle**, and the first
     hunter-gatherer bands appear there.
   - The Dawn falls near a glacial maximum, so the sea is low and land bridges are open.
3. **The Age of People** runs from the Dawn onward, on the same calendar.
   - Bands spread out of the cradle, split, and carry diverging languages.
   - As the ice retreats (orbital cycles), the sea rises and drowns land bridges, climate
     warms, and wild cereals spread.
   - Where conditions allow, and only there, cultivation begins. History continues for as long
     as the player likes.

---

## 4. Data models

All hot data is in typed arrays. Records with variable shape (persons, communities, species,
languages) are plain objects held in id-indexed arrays or Maps, iterated in insertion order so
runs are deterministic.

### 4.1 Fine world grid (`World`, W×H = 1024×768 by default)

The size is a setting (`AG.WORLD_SIZES`): Large 768×512, Huge 1024×768 (default; Large on low-end
devices), Colossal 1536×1024, Titanic 2048×1536, or Screen, the old fit: the largest integer zoom
at which a world of 140k-280k cells exactly covers the viewport. `BASE_ZOOM` is always that
screen-fitting zoom (the close view a camera starts from); `minZoom` fills the screen with the
world. Deep time opens at `minZoom`, to watch the continents. Worlds over 400k cells ("big")
switch on the scaling in §6.4.

| Field | Type | Meaning |
|---|---|---|
| `elev` | f32 | ground height relative to the fixed `SEA` line (sea-level change shifts land, see §5.6) |
| `fl`, `ft`, `frozen` | f32, u8, u8 | fluid depth and type (water, lava, acid), ice |
| `veg`, `soil`, `snow`, `fert` | u8 | vegetation, soil class, snow cover, soil fertility (exhaustion and recovery) |
| `ice` | u8 | glacier thickness (blocks farming, slows walking, scours) |
| `rock` | u8 | bedrock class from geology (granite, basalt, sedimentary, metamorphic, volcanic) |
| `res` | u8 | surface resource (flint, clay, copper, tin, iron, salt, obsidian, wild cereal) |
| `plate` | u8 | plate id (from the coarse grid) |
| `tbase`, `moist` | f32 | climate normals from latitude, altitude, rain shadow, sea distance |
| `owner`, `bgrid`, `traffic` | i16, i32, u8 | territory, buildings, footfall/roads |
| `ug`, `ugF`, `ugT` | u8 | underground layer (caves, ores including copper, tin, coal and salt; aquifers, magma) |

### 4.2 Coarse geology grid (`Geo`, cell = 4×4 fine cells; 8×8 on big worlds, 16×16 over 1.6M cells)

- **Per cell:**
  - `plate` (u8)
  - `crust` (f32 elevation-equivalent; continental crust is buoyant, oceanic crust is dense)
  - `age` (crust age in Myr)
  - `rock` (u8)
  - `strain` (f32)
  - `magma` (f32)
  - `orogeny` (f32 recent uplift)
  - `sed` (sediment in transit)
  - `flowAcc` (drainage area)
  - climate normals
- **Per plate:**
  - velocity (vx, vy cells/Myr) and a sub-cell accumulator
  - kind (continental or oceanic share)
  - a velocity target that wanders, steered by an edge-avoiding "mantle" field
- **Hotspots** are fixed points in mantle coordinates. Plates drift over them, building
  volcanic island chains.
- **Climate:** a global temperature anomaly made of three orbital cycles (100k, 41k and 23k
  years, random phases), plus volcanic aerosols and a slow carbon term. It drives the ice volume,
  and the ice volume drives sea level.
- **History:** a ring of downsampled elevation and plate frames, one per Myr in deep time and
  one per 250 years in the Age of People. It powers the time-lapse and replay scrubber.

### 4.3 Genome (all creatures, people included)

The genome is diploid: 16 loci × 2 alleles, each allele u8.

| # | Locus | Expression | Selected by |
|---|---|---|---|
| 0 | SIZE | additive | cold (larger), food scarcity (smaller), predation |
| 1 | STR | additive | combat, hunting large prey |
| 2 | SPEED | additive | escape and pursuit; costs energy |
| 3 | METAB | additive | high = fast but hungry |
| 4 | SENSE | additive | detection range for food and threats |
| 5 | FERT | additive | litter size and birth rate; costs energy |
| 6 | LIFE | additive | lifespan; trades against fertility |
| 7 | BOLD | additive | temperament: bold/aggressive vs. timid/docile (domestication needs low) |
| 8 | IMMUNE | additive | disease resistance |
| 9 | COGN | additive | cognition: learning, invention, problem solving |
| 10 | COLD | additive | fur/fat: cold tolerance, heat penalty |
| 11 | HEAT | additive | heat tolerance |
| 12 | HUE | **Mendelian** | pigment. An allele < 24 is a recessive *albino* allele (shows only when homozygous); > 232 is a dominant *melanic* allele |
| 13 | SOCIAL | additive | herding / band cohesion; for people, extraversion and agreeableness |
| 14 | MATE | additive | mate recognition. Two individuals can breed only if their phenotypes differ by < 40 |
| 15 | NEUTRAL | additive | neutral marker; measures drift and relatedness |

- **Phenotype:** the mean of the two alleles for additive loci; the Mendelian rule for HUE.
- **Inheritance:** one allele from each parent at each locus (independent assortment).
- **Mutation:** ±1–12 per allele with p = 0.03, plus a *macro-mutation* (±40–90) with
  p = 0.002.
- **Fitness is never computed.** It emerges from survival and reproduction under the energy,
  temperature, predation and disease rules.

### 4.4 Species and phylogeny (`Life`)

- **Species record:**
  - id, binomial name, parent id, birth and extinction times
  - archetype (grazer, browser, predator, small forager, bird, primate)
  - founding allele means, current mean phenotype
  - census, regional populations
  - `sapient` flag, `domestic` flag (plus wild ancestor id)
- **Regional model:** each species-region (coarse 8×8 world blocks of land, or sea basins for
  birds) holds:
  - population `n`
  - mean allele vector `μ` (16 values)
  - variance `σ²`
  - a **reservoir** of 12 sampled genomes (keeps real alleles for re-embodiment)
- **Speciation (allopatric):**
  - Each check partitions a species' occupied regions into connected components. Connectivity is
    adjacency over land, or over sea for birds; straits narrower than one region count as land
    when the sea is low.
  - A component whose MATE mean differs from the main component by more than 40 becomes a
    new child species.
  - Under domestication, the herded population is split off and its own selection (docility,
    size) drives divergence.
- **Extinction:** a species is extinct when its census reaches 0. Mass extinctions follow
  large-igneous-province eruptions (volcanic winter plus heat stress) and impacts.

### 4.4.1 Deep-time periods, the sea, legends and visitors

- **Archetypes:** grazer, predator, bird, primate on land; **fish** (shoaling and reef fish,
  sea grazers) and **shark** (sea hunters, marine reptiles, toothed whales) in the sea.
  `isSea(a) = a >= FISH`. Sea species occupy sea regions (crust under sea level) and connect
  across water, so a sea population is split by land bridges the way a land one is by straits.
- **Sea environment** per region: sea fraction, water temperature, shelf (shallow continental
  crust) and the connected sea basin. Sea optima come from water temperature and shelf: warm
  shelf fish grow small, social and bright (reef fish), open-ocean fish large and fast (tuna),
  shelf hunters medium, open-ocean hunters huge.
- **Niches:** each species carries `niche {size, social, speed}`, inherited with small shifts.
  The local optimum is offset by the niche, and carrying capacity `K` falls with crowding from
  species of the same kind weighted by niche overlap (`0.55 + 0.45·overlap`), so similar species
  divide a region instead of collapsing into one.
- **Periods** (start, in compressed Myr, scaled to the world's span to its Dawn): Cambrian 0,
  Ordovician 12, Silurian 20, Devonian 26, Carboniferous 34, Permian 42, Triassic 50, Jurassic
  62, Cretaceous 76, Paleogene 92, Neogene 106, Quaternary 116 (after the Dawn: the present).
  `commonName(sp)` names a species by archetype, size, niche, climate and period: a sea hunter
  is an anomalocarid, a sea scorpion, a placoderm, an ichthyosaur, a plesiosaur, a mosasaur, a
  shark or an orca; a land grazer a dicynodont, a sauropod, a stegosaur, a horse.
- **Lifecycle:** the world starts with three fish and two shark founders. At 26 Myr eight land
  founders crawl out (`seedLand`), placed by niche. At 92 Myr an asteroid (`impact`) kills
  most large animals; `refill` lets survivors of a related archetype take over empty niches.
  Land vegetation is painted by `Geo.greening()`: bare to 18 Myr, mosses to 26, forests to 34.
- **Legends:** at a deep-time speciation a daughter rarely (1%) turns legendary (`myth`), and
  stays legendary: unicorn or behemoth, griffin or manticore, phoenix or roc, yeti, hippocampus,
  sea serpent or leviathan. A god can raise one with the Legend tool (`Life.seedMyth`).
- **Visitors:** once per world a comet may seed an alien lineage (`alien`): tripod striders,
  xeno stalkers, skyrays, greys, glow jellies, void squid. A god can drop one with Star seed
  (`Life.seedAlien`). Alien genomes start far from local optima, so they thrive or die out.
- **Rendering:** sea creatures are never bodies. `biota.js` draws them in the 3D close-up from
  the regions in view: each sea region gets a density budget (`0.22 × sea cells`) shared among
  its sea species by `√n`, every creature on a stable hashed anchor circling at the depth its
  kind keeps (`creatures.js`: length range, mode swim/bottom/drift/fixed/walk/fly, depth,
  shoal size). Reefs, kelp and seagrass are laid on shallow sea cells by water temperature and
  period. Deep-time and history-mode land animals are drawn the same way (Watch mode uses bodies).

### 4.5 Person (`People`), the canonical human record

```
id, name, sex, born, died, cause
genome[32], species, community, polity, body (entity index or -1)
x, y (last known position, kept when folded)
mom, dad, spouse, kids[]
personality {open, consc, extra, agree, neuro} (0..1; from genes + upbringing + experience)
traits (bit flags: brave, kind, cruel, greedy, pious, curious, ambitious, genius…)
needs {food, rest, social, safety, purpose} (0..1, 1 = satisfied; embodied only)
emotion {joy, grief, fear, anger, love, stress} (decay toward a personal baseline)
tastes[24] (-1..1 over foods, activities, places, weather, ideas) → likes/dislikes
beliefs {faith, devotion, tradition (vs. novelty), loyalty (to ruler), myths[]}
skills[8] (hunt, gather, craft, farm, herd, build, lore, fight; 0..100)
job, goal, plan, habits
memories[≤24] {t, kind, who, where, valence, salience, detail, secondhand, distorted}
ties Map<personId → {kind bits, trust, affection, debt, since, events}> (≤ 24, asymmetric)
health {hp, parts[6]: injury 0..1 + bleeding, chronic[], frailty, mental {stress, trauma, depressed},
        addiction, disability, pregnant {since, father}, nutrition, disease, immunity}
story[] (life events, rendered as prose by the inspector)
```

- **Memory:** salience decays by `0.92^years` scaled by |valence|, so emotional memories last.
  When the 24 slots are full, the weakest is forgotten.
  - **Misremembering:** each year a memory older than 5 years may swap its `where` to a nearby
    place, exaggerate its valence (p = 0.05), or blur `who` to a relative of the original person.
    This is marked `distorted` in the inspector.
  - **Rumour:** when two people interact, a salient memory may pass as a *secondhand* memory with
    half salience and a chance of distortion.
- **Memories drive behaviour:**
  - grudges raise anger toward the remembered person and their kin
  - gratitude raises trust
  - trauma creates dislikes (places, activities) and raises stress
  - loyalty and fear shape whom people follow, flee or fight

### 4.6 Community and polity (`Civ`)

- **Community record:**
  - id, name (from its language), x, y, territory radius, mode (*nomadic* or *sedentary*)
  - kind (band camp, village, town, city), members[] (person ids)
  - stores (food, wood, stone, metal, goods), buildings[]
  - knownTech (bitset), banned (bitset), techProgress
  - language id, faith id, art style
  - customs (burial, marriage, residence, diet taboo, festival)
  - polity id, contacts Map<community → strength>, grievances Map<community → weight>
  - fertility of fields, deforestation and hunting-pressure ledgers
- **Polity record:**
  - id, name, government (band, tribe, chiefdom, state), capital, communities[]
  - ruler (person id), heir rule, institutions[] (council, priesthood, warriors/army, scribes,
    market guild) with strength, legitimacy and corruption
  - inequality (Gini estimate), stability, treasury, laws
  - relations Map<polity → {opinion, treaty, war, tribute, alliance, since}>

### 4.7 Body (entity, structure of arrays, 32,768 slots)

This is the v1 store (position, task, hp, flow-field movement) plus:
- `pid` (person id) or `sid` (species id) and genome (32 bytes)
- `energy`, `pregnant`, `injury mask`, `body scale`

Animals are always bodies in Watch mode. People are bodies only when their community is
materialised (§6).

### 4.8 Language (`Lang`)

- **Language record:**
  - id, parent id, family id, birth year
  - phoneme inventory (consonants, vowels, onset and coda rules)
  - a 120-word core lexicon (meanings → forms)
  - a drift clock and a sound-change log
- **Drift:** each year a language may apply one regular sound change (lenition, vowel shift,
  coda loss, palatalisation) to its whole lexicon, or replace a single word.
- **Splits:** when two communities that share a language lose contact for 300+ years, the
  smaller branch becomes a daughter language. Families are trees, and similarity between
  lexicons gives the distance.
- **Naming:** people, places, polities and gods are named from their own language's lexicon.

---

## 5. Geology model (`geo.js`)

### 5.1 Plates and drift

- **Setup:** every world grows a new supercontinent from 5–8 ancient cores (cratons): ellipses
  of their own size, stretch and tilt, attached in a curving chain (a spine, a crescent, an S) with
  the odd one welded on the side. Their smooth union is warped by noise and bitten by one or two
  gulfs, then cut to this world's land share (22–30%), keeping only the largest connected piece.
  Old mountain belts run along the seams between cratons. Plates are seeded one per craton plus
  more at sea (a noise-warped Voronoi partition), so the continent later parts along its seams.
  Continental plates start slowly (rifting) and reach 2–10 cm/yr.
- **Movement:** each plate accumulates `v·dt`, and when it crosses a whole cell the plate shifts
  one cell. All plates shift together in one pass, writing into a new grid in a fixed order
  (stationary plates first, then by plate id), so results are deterministic. Then:
  - **Gap (divergent):** a cell left empty becomes new oceanic crust at ridge depth, age 0,
    basalt, owned by the adjacent plate that moved away. If both neighbours are continental
    and the opening is narrow, it's a **rift valley** (shallow, lakes, volcanism) before it
    widens into an ocean.
  - **Overlap (convergent):** when two cells meet:
    - Oceanic under continental: the oceanic cell is consumed; the continental edge gains
      **arc uplift** and magma (volcanic arc), and the ocean side deepens (**trench**).
    - Oceanic under oceanic: the older (denser) one subducts, building an **island arc**.
    - Continental and continental: crust **stacks** (thickness adds, capped), raising
      **mountains** (orogeny). The plates' relative velocity damps, and long collisions
      **suture** the two plates into one.
  - **Off-map:** crust pushed past the map edge is consumed (a margin trench).
- **Steering:** plate velocities wander, with an edge-avoiding term on continental plates so
  continents stay on the map.
- **Wilson cycle:** large plates may split along a weak line through their thickest crust (a
  continental rift), so supercontinents break up and reassemble.
- **Hotspots:** fixed in mantle coordinates. Each hotspot raises crust and adds magma in the
  cell above it, so a moving plate leaves a chain.

### 5.2 Boundary classification and strain

- **Classification:** for each pair of adjacent cells on different plates, project the relative
  velocity on the boundary normal.
  - Closing → convergent.
  - Opening → divergent.
  - Mostly tangential → transform.
- **Strain:** each boundary accumulates strain ∝ |relative velocity| · dt.
  - Transform and convergent boundaries release strain as **earthquakes**. Their magnitude
    grows with the strain stored, following the Gutenberg–Richter idea: many small, few large.
  - Divergent boundaries creep (small quakes, fissure volcanism).
- **Magma** builds at arcs, rifts and hotspots and releases as **eruptions**.
  - Effects: lava fields on the fine grid, an ash fall that raises soil fertility, and aerosols
    that cool the global climate for years to decades (volcanic winter).

### 5.3 Isostasy and fine elevation

- Coarse crust is mapped to elevation with a soft curve, so oceanic crust sits at 0.05–0.32,
  continental shelves near `SEA`, continents at 0.42–0.75, and stacked orogens up to 0.97.
- **Fine elevation** = bilinear(coarse) + detail noise sampled in **plate-local coordinates**
  (so the texture of the land moves with its plate) × ruggedness (higher in orogens) + river
  incision.
- In deep time the fine grid is regenerated from the coarse grid (throttled for rendering). In
  the Age of People it is authoritative, and geology applies local deltas: quake offsets,
  volcano growth, delta growth and glacial scour.

### 5.4 Erosion and deposition

- **Thermal:** slope-limited creep (talus angle).
- **Fluvial:** D8 flow accumulation on the coarse grid using climate precipitation.
  - Incision is ∝ √A · S (stream power).
  - Sediment travels downstream and is deposited where the slope falls. At the coast this
    builds **deltas** and continental shelves.
- **Glacial:** where ice persists, valleys deepen and smooth (U-valleys). Once the sea rises
  these can become fjords.
- In the Age of People, deltas advance seaward at river mouths and rivers occasionally
  **avulse**: the channel jumps to a lower neighbouring path after a flood.

### 5.5 Climate

- **Temperature:** latitude (north cold, south hot), lapse rate with altitude, and continentality.
- **Moisture:** westerly winds carry moisture from the ocean. It is replenished over water,
  depleted by rain, and depleted strongly on windward slopes, giving **rain shadows** and dry
  interiors.
- **Global anomaly:** orbital cycles + aerosols + carbon. It shifts biomes, the snow line and
  glaciers.

### 5.6 Sea level and glaciers

- **Sea level:** `seaLevel = −k · iceVolume`. A sea-level change of Δ is applied as a uniform
  shift of fine land elevation by −Δ (equivalent to moving the waterline, and invisible to code
  that compares against `SEA`).
  - In Watch mode, the ocean pin at the map edge floods or drains the coast through the normal
    fluid simulation, so you watch the water come in.
  - In History mode, the ocean is refilled by a flood fill from the edge.
- **Glaciers:** grow where the climate temperature stays below the snow line for decades. They
  advance downslope, block farming, slow travel and change the land when they retreat
  (moraines, lakes, fertile loess).

### 5.7 Rocks and resources

| Setting | Rock | Resources |
|---|---|---|
| Continental core (old) | granite | flint in chalky sedimentary patches, tin in old granite |
| Orogen / volcanic arc | metamorphic, volcanic | copper, gold, obsidian (arcs), fertile ash soil |
| Sedimentary basin (long-lived lowland) | sedimentary | clay, flint, **coal** (former warm wetland), iron (bog iron in wetlands) |
| Evaporite basin (dried sea, arid) | sedimentary | **salt** |
| Floodplain | alluvium | clay, fertile soil, wild cereals (if climate fits) |
| Oceanic / rift | basalt | obsidian (rift volcanism) |

**Wild cereals** grow on warm-temperate, seasonally dry grassland and floodplain cells with
fertile soil. They spread as the climate warms and vanish under ice. **Domesticable animals**
are the species that happen to be docile, social and mid-sized (low BOLD, high SOCIAL, moderate
SIZE). This is a fact of evolution, not a flag.

---

## 6. Level of detail

### 6.1 People

- **Focus zone:** the camera viewport inflated by 30%.
  - A community **materialises** when its centre enters the focus zone during Watch speeds.
  - It **folds** when its centre leaves the zone inflated by 60%, or when time switches to
    History or Deep.
  - A minimum dwell time of 4 seconds prevents thrashing.
  - The community of a possessed or followed person always stays materialised.
- **Budget:** at most 6,000 embodied people. Beyond that, the nearest communities win.
- **Materialise:** a body is created for each living member at their stored `x, y` if it was
  folded recently, otherwise at home, at work or around the camp hearth. Its needs start from
  the record, and its task is chosen fresh.
- **Fold:** the body's state (position, hp, injuries, needs, energy, carried goods) is written
  back to the person record, and the body is freed.
- **What is lossless:** identity, genome, family, memories, relationships, skills, health, beliefs
  and possessions. Only in-progress motion is re-sampled, which is invisible in practice since a
  folded community is off-screen.
- **Same rules in both modes:** births, deaths, ageing, marriages, learning and memory formation
  use the same person-level functions in both modes. Embodied play adds moment-level events
  (conversations that form ties, fights, accidents, discoveries by a specific person).
- **Calibrated economics:** the aggregate community economy uses the same productivity function
  per worker-year that embodied workers earn per trip, so a community grows at the same expected
  rate whether or not you watch it. A test checks this (§10).

### 6.2 Animals

- **Watch mode:** all animals are bodies, up to per-archetype caps. On a big world only the
  regions inside a 320×320-cell box around the camera are embodied (the caps then spread over
  about a screen-sized world's land, so density matches); `Life.streamTo` moves the box when the
  camera has gone a fifth of its width, removing bodies outside the new box (the regional record
  stands) and embodying the regions newly inside.
- **History or Deep:** bodies fold into species-region aggregates. Each region keeps its gene-pool
  reservoir, its census and its mean and variance.
- **Re-embodiment:** returning to Watch embodies each region's census (capped) with genomes drawn
  by recombining reservoir genomes. Individuals are not persistent across fast time; populations
  and gene pools are.
- **Habitat** (`habitat.js`): a species profile comes from its mean genes and common name: the
  temperature it is adapted to (the inverse of the regional optimum: COLD = (0.62 - t) * 520,
  HEAT = (t - 0.42) * 560), open-ground, forest and edge preference, slope and height
  preference, water need, snow tolerance, prey dependence and shyness (BOLD). `score(profile,
  cell)` multiplies thermal comfort at the temperature now (season and weather included), food
  (grass, forest or edge; cereals for grazers; the prey map for predators; snow and blight cut
  it), closeness to fresh water (pulled harder in summer heat), slope and height terms,
  settlements (repelling the shy, drawing crows) and fire. Coarse 4x4-block maps (fresh-water
  distance, settlement distance, fire distance, blurred grazer density) make it a handful of
  reads; they are rebuilt on embodying, prey every 120 ticks, the rest every 960.
- **Placement:** grazers are placed first, then the prey map is refreshed for the others. A
  species' animals are pooled over its regions: a region is drawn by how many animals it should
  still hold, a spot in it by squared habitat score over sampled candidates, and a whole group
  (size by kind and SOCIAL) settles around it inside the region square, so folding stays exact.
  Songbirds of lands colder than 0.38 in winter are mostly away (fewer bodies; the regional count
  is kept); bears in lands colder than 0.36 in winter start in dens.
- **Behaviour** (`ai.js`): wandering takes the best of five nearby spots by score (staying put if
  here is better); at night grazers and primates bed down by their group; well-fed predators lie
  up in the midday heat and hunt sooner at night; at dawn and dusk, or in heat, animals walk to a
  drinking spot beside fresh water; when comfort drops below 0.22 a herd treks 14-36 cells to
  better ground, following a mate already on the move; bears in cold winters hibernate (a tenth
  of the energy burn) until spring or a wound; birds roost in the tallest trees nearby (great
  birds on crags) and songbirds fly toward warmth in cold winters. The god tool releases the
  nearest species of the kind, weighed by how well it would cope at that spot.
- **Aggregated human communities** interact with animal bodies by sampling: a far-away band's
  yearly hunt removes real animals from its range, so hunting pressure stays consistent.

### 6.3 Space and rendering

- Fine terrain is repainted by dirty chunk (v1). The 3D window holds up to 240² cells around the
  camera.
- Deep time never shows the map being repainted. The geology redraws the fine map a band of rows
  per frame into a hidden picture. When that picture is whole, the map on screen dissolves into it
  everywhere at once, cell by cell, in an order set by a fixed noise field: drifting patches about
  24 and 7 cells across, plus a per-cell grain, evened out so the change is spread through the
  dissolve.
  - Each dissolve lasts as long as the next picture took to build, so the land changes all the
    time with no sweep line and no jump.
  - Only cells that differ are touched.
  - Trees follow per chunk at that chunk's moment in the order.
  - Nothing is rebuilt while time is paused, unless a power is used.
- Overlays are painted into a low-resolution buffer and scaled.

---

### 6.4 Big worlds

Over 400k cells the per-cell systems are bounded so a Huge world costs about what a screen-sized
one does:
- **Geology:** coarse cells of 8 (16 over 1.6M), so the plate, climate and erosion grids keep
  ~12k-25k cells. `paintRows` reads plate, rock and orogeny through a noise warp of ±2.4 coarse
  cells and samples orogeny bilinearly; `baseClimate` smooths rainfall over ±2 rows.
- **Life:** `Life.deepStep` runs every 2nd geology step (3rd over 1M cells) with the summed time;
  `Life.yearStep` gathers years into steps of `round(N / 280k)` (`Life.acc`, saved). Regions stay
  16 cells, so densities, hunting and herds read the same. `crowding` adds each pair's overlap to
  both members in the order of the plain double loop (bit-identical, half the work).
- **Physics:** chunks more than 8 beyond the focus never run; the focus is capped at 30×30 chunks
  around the camera when zoomed far out; the slow pass takes 48 chunks a tick; caves sleep too.
- **Sky:** clouds refresh `CLH / CLOUD_EVERY` rows a tick (storms add only to those rows).
- **Memory:** history snapshots copy ~47 bytes a cell: 2 kept on big worlds, 1 over 1M (plus the
  Dawn); travel fields cached: `40 × 280k / N`, at least 8.

## 7. Update order

### Per tick (Watch)
1. `Sky.tick` — season, wind, storms, clouds
2. `Physics.tick` — fluids, fire, gas, slow land pass (vegetation, snow, roads)
3. `Geo.tick` — strain and magma accumulate; quake and eruption events; sea-level target eased into the ocean pin; glacier creep (every 64 ticks)
4. `Ent.rebuildGrid` — spatial hash
5. `AI.tick` — embodied people and creatures: needs, brain, movement, combat, work
6. `Proj.tick` — projectiles
7. `People.tick` — embodied: per-tick needs/emotions decay; aggregate: sliced year steps for persons of folded communities (1/40 year every 24 ticks)
8. `Civ.tick` — communities (economy, building, band movement), LOD materialise/fold (every 30 ticks), polities (diplomacy, war, government, institutions)
9. `Tech.tick`, `Lang.tick` — sliced yearly passes, staggered by community id
10. `Life.tick` — census (every 120 ticks), speciation and extinction checks (yearly)
11. `God.tick`, `History.tick` — powers in progress; snapshots and era maps

### Per year step (History, Δ years)
`Geo.year` (climate, sea level, glaciers, deltas, quakes, eruptions) → `World.year`
(vegetation, fertility, snow, ocean refill) → `Life.year` (regions: growth, selection, drift,
migration, hunting pressure, speciation, extinction) → `Civ.year` (production, famine, persons'
births, deaths, ageing, marriages, ties, memories; band fission and migration; founding;
building; polity dynamics; statistical wars; trade) → `Tech.year` → `Lang.year` → `History.year`.

### Per age step (Deep, 0.5 Myr)
`Geo.deep` (drift, collisions, rifts, hotspots, erosion, climate, sea level) → `Life.deep`
(regional evolution with time-scaled selection, drift, migration, speciation, mass extinctions) →
every 1 Myr `History.frame` (time-lapse frame) → throttled fine-grid regeneration for rendering.

---

## 8. Evolution and biology in play

- **Energy budget (bodies):** an animal or person has `energy` 0..1.
  - It is spent at `metabolism(SIZE, METAB, SPEED use, COLD/HEAT stress, pregnancy)` per tick.
  - It is refilled by food (vegetation for grazers, prey for predators, a mixed diet for people).
  - Starvation damages health.
- **Temperature stress:** local temperature outside the band set by COLD and HEAT costs energy and
  health. This is what produces Bergmann's rule and cold-adapted lineages.
- **Predation:**
  - Predators choose prey by SENSE range and size ratio.
  - Prey flee when they sense predators, scaled by BOLD and SPEED.
  - Kills feed the predator; group hunts (SOCIAL) take larger prey.
- **Reproduction:** adults with energy above a threshold seek a compatible mate (MATE
  difference < 40). Gestation and litter size come from species and FERT. Offspring inherit
  one allele per locus from each parent, plus mutations.
- **Ecosystem coupling:** vegetation regrows by soil, moisture, temperature and season. Grazing
  depletes it. Predator–prey cycles, migrations toward pasture and crashes after overgrazing
  emerge from these rules.
- **Disease:** agents with transmission, incubation, duration and lethality (as in v1).
  - Survivors gain strain-specific immunity.
  - Strains **mutate** on transmission (p = 0.01), changing contagion and lethality slightly; a
    new name is given when drift is large.
  - Dense sedentary communities and domestic animals raise exposure (zoonoses).
- **Hominins:** people use the same genome. COGN drives learning and invention; COLD, HEAT and
  SIZE adapt populations to latitude over generations; HUE shows Mendelian pigment variation.

---

## 9. Civilization

### 9.1 Eras (emergent)

The era of a community is the highest era whose **marker invention** it knows:

| Era | Marker |
|---|---|
| Paleolithic | (start: fire, knapping, speech) |
| Mesolithic | bow or microliths |
| Neolithic | cultivation or herding |
| Chalcolithic | copper working |
| Bronze Age | bronze |
| Iron Age | iron smelting |
| Classical | philosophy |
| Medieval | feudalism |
| Renaissance | printing press |
| Industrial | steam power |
| Modern | combustion engine |
| Atomic | nuclear fission |
| Information | internet |
| Space Age | spaceflight |
| Stellar | warp drive |

Past warp drive a community keeps discovering **future technologies** (`c.future`, a level that
only grows), each a little harder than the last; each adds a little to invention, farming and
arms. The later inventions are paced so history accelerates: printing, universities, the
scientific method, computers, the net and artificial minds multiply a community's innovation
(`Civ.learning`, about 12x by the Space Age), so the stretch from steam to warp drive is a few
centuries where the stretch from farming to iron was thousands of years.

**The look of each age** comes from `c.era` alone: `Models3D.eraKit` builds the 3D buildings of
five bands (Medieval-Renaissance, Industrial, Modern-Atomic, Information, Space Age and beyond)
for every building type, regional styles keep flavour in the earliest band (whitewash and domes
in dry lands), and the peoples keep their own forms with lamps, masts and lit rings added. The
2D map has matching sprites (`render.js` `eraSprite`, drawn rows for the first two bands and
generated blocks and towers after). Models are cached per era. Soldiers' gear, vehicles,
aircraft over armies and clothing read the era of the unit's community.

### 9.2 Invention graph (`tech.js`)

Each invention has:
- **prerequisites:** all must be known
- **conditions:** a predicate on the community's context, covering population, sedentism,
  resources in territory, biome, coast or river, contacts, government, climate stability and
  local species
- **difficulty**
- **accident hooks**
- **effects:** physical (buildings, yields, movement, combat), social (inequality, sedentism,
  government pressure, literacy) and ecological (deforestation, soil exhaustion, hunting pressure,
  domestic species)

There are 50 inventions: knapping, fire, speech, spear hunting, hide clothing, shelters, foraging
lore, burial rites, cave art, fishing, herbal medicine, boats, bow, microliths, dog companions,
cultivation, herding, pottery, weaving, ground stone, mud brick, granaries, megaliths,
irrigation, plough, kilns, wheel, sailing, tokens, copper, bronze, writing, mathematics,
astronomy, masonry, fortification, law codes, currency, monumental architecture, horse riding,
chariots, brewing, iron, alphabet, coinage, roads, philosophy, medicine, engineering and
navigation.

Prerequisites are real dependencies. For example:
- fire → pottery → kilns → copper (+ copper ore) → bronze (+ tin, local or traded) → iron (+ iron ore + charcoal from forest)
- cultivation requires foraging lore **and** wild cereals in territory **and** a stable climate;
  herding requires a domesticable species in range

**Discovery** per community-year:
```
p = base(difficulty) · √(pop/50) · innovation · (1 + 0.15·contacts) · stability · conditionFactor
innovation = mean over 3 sampled adults of (COGN/255 · (0.5 + openness) · (curious ? 1.6 : 1))
```
The inventor is a specific person (sampled by COGN and curiosity). They get a memory, fame and a
place in the chronicle.

**Accidents:**
- pottery: fire + clay + sedentary
- copper: kiln + malachite
- brewing: granary + cultivation
- dogs: wolves scavenging around camps

**Diffusion:** for each contact pair, per year, each tech known by one and missing from the other
(prerequisites met) spreads with p = 0.04 · contact strength · the receiver's novelty attitude.
Trade, migration, conquest and marriage alliances all create contact.

**Loss (the Tasmanian effect):** if population falls below a tech's minimum, or no living member
has the related skill above 10, the tech is lost with p = 0.08 per year. It can be rediscovered
independently.

**Counterfactuals:** banned techs (per branch) are never discovered or received.

### 9.3 Society

- **Government** transitions emerge from conditions:

  | From | To | Conditions |
  |---|---|---|
  | band | tribe | ≥ 3 related communities sharing a language, contact strength above a threshold |
  | tribe | chiefdom | sedentary, surplus ≥ 15%, population ≥ 600, inequality ≥ 0.3, or the pressure of war |
  | chiefdom | state | population ≥ 2,500 with a town, and writing **or** monumental architecture, or the consolidation of conquest |

  Reversals happen on collapse.
- **Inequality** rises with surplus, the plough (land ownership), herding (heritable wealth),
  conquest and corruption, and falls with redistribution institutions, law codes and egalitarian
  customs.
- **Institutions:** council, priesthood, warriors/army, scribes, market guild. Each has strength,
  legitimacy and corruption.
  - Corruption grows with institutional age, inequality and unchecked rulers (cruel or greedy
    traits), and falls with law codes and reformers.
  - Legitimacy falls with famine, defeat, disaster blamed on rulers, and corruption.
  - When stability < 0 during a crisis, the polity **collapses**. Communities secede, rebellions
    succeed, a state may fall back to chiefdoms.
- **Kinship and customs:** marriage (monogamy or polygyny, bride price), residence (patrilocal or
  matrilocal), burial (inhumation, cremation, cairn), diet taboos and festivals. Customs drift
  slowly, spread by contact, and mark cultural identity.
- **Religion:**
  - **Animism** (default) → **ancestor cults** (burial rites) → **shamanism** → **organised
    pantheons** (temples, priesthood).
  - Gods take their domains from what a people lived through (as in v1): eruptions make fire
    gods, floods water gods, the player's lightning storm gods.
  - Myths remember specific disasters by name.

### 9.4 Economy and geography

- **Production:** foraging, hunting and fishing (biome and species dependent), farming
  (fertility, irrigation, plough, climate), herding, crafts and mining (geology).
- **Consumption, storage and famine:** granaries and pottery reduce spoilage. Famine raises
  mortality, migration, unrest and myths of hunger.
- **Trade:** trade routes between contacting communities exchange goods (salt, obsidian, metal,
  cloth, pottery). Carts need the wheel; ships need sailing. Currency and coinage raise
  volume.
- **Degradation:** farming exhausts fertility (fallow and rotation recover it); wood use and
  clearing deforest; hunting pressure drives large species to extinction (megafauna).
- **Settlement siting** scores: water, soil fertility, resources, defensibility, coast, and
  distance from hazards remembered in myths.

### 9.5 Conflict and diplomacy

- **Raids** (bands and tribes) and **wars** (chiefdoms and states) use v1's army system when
  embodied (muster, flanking wings, sieges, catapults after engineering) and a Lanchester-style
  resolution when aggregated.
- **Relations** carry opinion, grievance memory, treaties, alliances and tribute.
- **Multi-generation grievances:** a community's grievance ledger decays slowly, and is refreshed
  by persons who remember the wrong and pass it on as rumour.
- **Rivalry** (why wars happen): neighbouring states (-12), a strong state beside a weak realm
  (-10), a gap of two or more ages (-6 per age beyond the first), crowding (-8); a shared
  language counts for less than it did (+9).
- **Warfare** (`warfare.js`). Power = soldiers x skill x `Warfare.arms(c)` (the product of the
  community's weapons, about 1.25 for the bow up to several hundred in the Stellar age) x the
  people's fighting nature x `generalMul` (the realm's best fighter, with fame from victories).
  `Warfare.field` gives the defender's ground (mountains 1.5, hills 1.25, forest 1.15, an
  unbridged river 1.1, halved for armies of the Modern age), the attacker's supply (strength
  falls off beyond a reach of 60 cells plus roads, railways, engines, flight, spaceflight) and
  winter in cold country (0.7, and frost losses). Battles add to a per-war score (`k.score`);
  `Warfare.makePeace` turns the score gap into terms: >= 60 annexes the loser's city nearest
  the winner, >= 35 vassalage (vassals keep the peace with their lords, pay tribute, join their
  wars, and may break free when they outgrow them), >= 15 tribute, else a white peace. A beaten
  side sues for peace sooner.

### 9.7 The plague lab (`plague.js`)

A pathogen is a record (`Plague.list`) mirrored into an `AG.DISEASES` slot (re-using a slot
nobody carries, with its immunity bits wiped), so the existing machinery runs it for bodies in
view and for records far away. Its contagion, radius, lethality, duration, madness and sterility
are recomputed from its type and bought traits. Each year step:
- **Inside a community**, generation by generation (as many as the illness's length fits in the
  step): each susceptible is infected with probability 1 - exp(-k I), k from contagion, the
  routes that suit the place (water by rivers and coasts, livestock with herds, rodents in big
  towns, insects in the heat; presses, radio and the net for a rumour) and the climate it can or
  cannot stand; then the sick recover (and are immune) at the rate the illness lasts. Prions, the
  undead blight and the mind worm never let go.
- **Between communities**: along contacts (by their strength, faster across a front), between
  neighbours within 32 cells, by sea for waterborne ones, and by spores.
- **DNA** from newly reached communities, new cases and deaths.
- **Noticed** after enough deaths, cases or severe symptoms (at once for a nano-virus); then every
  realm that has a sick community researches the cure at a rate from its medicine and science
  (herbal lore barely; vaccines, antibiotics, computers and genetics a great deal), slowed by
  severity, drug resistance and hardening; reshuffling sets it back. A cure heals and immunises
  everyone.
- **Special types:** the undead blight's dead rise in hordes (`Plague.hordes`) that march on the
  nearest town, fight its soldiers and grow with those they kill; the night plague's lord
  (`Plague.lords`) moves between towns, feeds and spreads the plague until hunters or the cure
  end it; the ape fever calls `Races.uplift` near its hosts; the mind worm secedes a town into a
  hive realm and adds others to it; the rumour (lethality x0.12) drains stability and loyalty,
  sparks revolts and turns realms against their neighbours.

### 9.8 Wonders and terrors (`god.js`)

`God.wonders` holds the UFO, grey goo, black hole, dragon, kraken, kaiju, locust swarm and
rockets, advanced in real time like the meteors. The kraken rises in the nearest sea, keeps to
the water, sinks ships and smashes buildings near the shore of the nearest coastal town; the
kaiju walks on the biggest town in reach, flattening buildings in its path, and only the arms of
a late age wear its 3,200 strength down; the locusts fly with the wind toward farmland, strip
crops and cut stores by 15% every half second over each town they cross. The UFO takes up to three people and may teach its community an invention of its next
age; grey goo widens to a set radius turning land to grey rock and unmaking everything in it;
the black hole lowers the land into a pit, pulls creatures in and swallows towns; the dragon
flies to the nearest town, breathes fire (burning cells, buildings and people) and is worn down
by the town's soldiers in proportion to the arms of their age.

### 9.10 Realms, wonders and deeds (`realms.js`, `deeds.js`)

The realm powers act through the ordinary records: Crown picks a community's ablest adult
(ambition, fame, lore and fighting, age) and makes them ruler (a coup in the capital; elsewhere
`War.secede` then crowns them); Assassinate kills the ruler, costs stability and legitimacy and
may make an outlying town secede; Hero gives the hero trait, full fighting skill and fame, and
makes them the realm's general; Prophet forces `War.foundReligion` and names the faith after the
prophet; Golden age sets `k.golden` (stability each year, food for hungry towns) and inspires
every town; Revolution sets `k.republic` (named "Republic of ..."), removes the old ruler,
clears corruption and halves inequality; Unite transfers every city of one realm to the other;
Exodus moves half a community into a new one where the god points (settled if the old one was).
Found builds a realm: a band from the people's gene pool, the inventions of the chosen age,
settling, extra townsfolk, and instant buildings (the citadel, temples and markets first, at the
centre, then the usual plan, then homes for everyone).

Great wonders are a building type (`BT.WONDER`, 4 x 4) with `b.wonder` naming the design; one of
each per world (`Realms.everBuilt` remembers ones destroyed). Their effects are summed per realm
each year into `k.wonderFx` (learning multiplies `Civ.learning`; stability, legitimacy and gold
accrue). States of 150+ people with a surplus build them at 0.3% a year. The space program
launches at 2% a year with rocketry and 6% with spaceflight; a launch with spaceflight founds a
colony 30% of the time (`k.colonies`, +5% learning each, up to +50%).

`Deeds` holds 34 deeds, each marked once with its year: read from the world every year (ages,
peoples, population, empires, wonders standing, a pandemic's reach, a century of peace, a world
that lost three quarters of its people) or noted by the systems when they happen (a colony, an
annexation, a vassal, the bomb, a cure, a horde cut down, the night lord slain, a dragon, kaiju
or kraken defeated, a town founded, a republic). Both modules are saved with the world.

### 9.9 Peoples (`races.js`)

`AG.Races` holds eight base peoples (humans, the sylvan, stonekin, ashborn, saurians, hivekin,
tidefolk, lithari and voidborn, all original) plus an uplift template and up to 32 derived
peoples. Each has multipliers for lifespan, fertility, fighting, wits (innovation), stability,
xenophobia (diplomacy), food by job, a climate preference, a look (skin, hair, a feature such as
ears, beards, tusks, crests, antennae, fins or crystal shards) and a town style (`raceKit`).
Communities, polities and persons carry `race`; people marry only their own; seceding realms
keep their people. `Races.seed` founds a band with the arts of its neighbours (the voidborn
arrive with Industrial knowledge they never forget); `Races.uplift` turns the nearest apes into
a new people; a realm cut off from its kin for 3,500 years becomes a new folk with its language's
name (ethnogenesis). Custom peoples are saved with the world.

### 9.6 Reacting to a changing land

These follow from the same rules rather than special cases:
- rising seas flood coastal farmland and villages, and people migrate
- eruptions destroy settlements but enrich soils; the survivors' myths gain a fire god
- quakes topple buildings; people blame the ruler or the gods (a legitimacy hit)
- droughts shift the wild-cereal belt
- a land bridge drowning cuts contact, so languages split and techs stop diffusing

---

## 10. Testing

`node genesis2/tests/run.js` runs headless:

| Test | Checks |
|---|---|
| determinism | two runs of the same seed for N ticks and M year steps give identical state hashes; a different seed differs |
| tectonics | a scripted two-plate world: convergent continental collision raises max elevation in the suture zone; divergent motion opens a below-sea rift and new oceanic crust (age 0, basalt); transform boundaries accumulate strain and release quakes |
| genetics | Mendelian ratios (albino 1:4 from two carriers, within tolerance); additive inheritance; mutation rates |
| speciation | a population split by a sea barrier diverges and is reclassified as two species with a parent link; gene flow prevents it when connected |
| selection | a cold region raises the mean COLD allele over generations versus a control |
| tech | no community ever knows a tech without its prerequisites, over long random runs; conditions are honoured (no cultivation without wild cereals); banned techs never appear |
| LOD | a community simulated aggregated vs. embodied grows at the same expected rate (within tolerance); fold → materialise preserves person records exactly |
| textures | each of the 24 surfaces averages 118-138 of 255 in brightness, its wrap step (on 4x4 block means) is under 2.5 times its average step, and two builds are identical |
| sizes | horse, ibex, mammoth, wolf and bear at real shoulder heights; a newborn much smaller; the drawn size follows the SIZE gene |
| habitat | embodied animals score clearly higher than random spots of their regions (and still do two days later); most social animals have one of their kind within 3 cells; predators stand on more prey than the average place; grazers rest at night; fewer songbirds in a cold winter; a bear in cold country hibernates and burns almost nothing |
| save/load | serialise → deserialise → state hash equal; continuing both gives identical futures |

**Scenario demos** (`tests/demo-*.js`, also in-game under World → Scenarios):
1. **Emergence:** a hunter-gatherer start with no scripted events. The demo reports when and
   where each era marker appears, and why (the conditions met, the inventor).
2. **Rising sea:** the world warms after two thousand years of people on the ice-age
   lowlands. The demo prints maps before and after, the land lost, the settlements swallowed and
   bands driven inland, and the languages that form as water and distance part peoples.

---

## 11. Performance plan

- Typed arrays for grids and bodies; person and community records are plain objects but are
  updated in bulk year steps, not per tick.
- The coarse geology grid is 1/16 of the fine cells. A deep step is O(coarse cells), and the
  D8 sort runs every 4 steps.
- Year steps cost O(persons + communities + species-regions), with Δ = 8 at top speed.
- Embodied people are capped by LOD; v1's spatial hash, staggered AI and flow fields are kept.
- History snapshots for counterfactuals are taken every 500 years, in a ring of 5 plus the Dawn.
  A snapshot is a list of about a hundred small stages (people in batches sized to take ~3 ms,
  each world field, species, communities and polities in chunks), run over several frames while
  the simulation waits, so the picture keeps moving. Each dead person is copied once and shared
  by later snapshots, and per-tick caches are dropped first. A test checks that a snapshot
  spread over many slices restores the same world as one taken at once.
- Settings (`AG.Settings` in `core.js`) are short strings saved in the browser. `auto` leaves an
  item to the governor's level; a chosen value overrides it. `applyPerf` in `main.js` is the one
  place that turns level plus settings into engine switches.
- Frame pacing: the screen's own rate is measured from the callbacks, and a picture is drawn on
  every n-th one (120 Hz → 60, 144 Hz → 72; 60 and 90 Hz screens are left alone). The governor
  compares the frame rate with the chosen target, so a 30 fps cap is not mistaken for a slow
  machine.
- Work that cannot be seen is not done:
  - Every world-sized layer is drawn through `blit`, which copies only the on-screen part.
  - Night light and gas are computed for the view plus a margin (`viewWin`), and brought up to
    date at once if the camera jumps past it.
  - A paused world is drawn only when a signature of everything visible changes (camera,
    pointer, selection, tool use, settings, dirty chunks, particles), with one safety frame every
    30. Animation time stops with the world, so nothing jumps when it is redrawn.
- 3D models (`models3d.js`): each person is three or four instances (clothes, skin, hair, hat)
  of models built once per style; colours per instance come from their genome (skin, hair), their
  realm and era (cloth). Each species gets one merged, vertex-coloured model (and one per sex
  where antlers or horns differ, per colour morph for domestic herds); an animal's own pigment
  only scales its brightness. Models are built when first seen and dropped with the world.
  Building models are cached by type, realm, variant, style and era band.
- Scale in 3D: one metre is `M2U` world units, set by an average adult (1.7 m) as drawn. An
  animal's model is scaled so its withers (leg + body height of the built geometry) reach its real
  shoulder height: a table per archetype against the body's own SIZE phenotype (grazers 0.6 m at
  gene 40 to 3.4 m at 240; hunters 0.4 to 1.6 m; primates 0.3 to 1.6 m), x1.05 / x0.95 for the
  sexes of dimorphic kinds, smaller for tamed sheep, goats and cattle, and 0.4 + 0.6 * age/adult
  for the young. Birds' body length comes from the same gene (15 cm to 1.1 m). A species' model is
  keyed by a version: every 2 seconds its shape signature (kind, speed, strength, cold, heat,
  pigment, bucketed) is checked against its current mean, and a change drops its old models.
- Animals and birds are drawn only in the 3D close-up (or, where it is off, in the 2D map past
  the same zoom, sprites scaled to real height); the 2D map skips them in sprites, dots and
  picking.
- A lost WebGL context switches the close-up off until the browser restores it; the 2D map
  carries on.
- The finish (`post3d.js`): the scene renders into an off-screen target with a 24-bit depth
  texture; one full-screen pass then applies FXAA, ink (the second difference of inverse depth
  over a one-to-1.5-pixel cross, relative to the centre, so flat faces give nothing and creases and
  silhouettes give lines; the line is the colour beneath at 34% and fades between 1.7 and 4 times
  the focus depth), tilt-shift (the focus is the depth at the screen centre; the blur weight
  grows with |z - focus| / 0.6 focus and mixes in a quarter-resolution Gaussian of the scene),
  grading (saturation, contrast, split toning, a moonlight tint by night), bloom added after the
  grading (a quarter-resolution bright pass: threshold 0.93 by day, 0.6 by night), a highlight
  shoulder above 0.8 and a vignette. The Pixel look renders the target at 1/3 resolution with
  nearest filtering, a one-texel outline and 22 levels per channel. Detail 2 drops bloom and
  focus; detail 3 drops the finish (Pixel keeps it, being cheaper than full resolution). Models
  get rim light (a Fresnel term, brighter by day), and each look sets the texture strength.
  Trees and grass sway in the vertex shader by their instance position and the sky's wind.
  Night set-pieces: additive light pools under lit buildings (opacity follows the darkness),
  glow materials dim by day, and 260 fireflies that find homes over vegetated ground near the
  view on warm nights.
- Textures in 3D (`textures.js`, `view3d.js`): 24 layers of 256x256, generated at load (~0.7 s)
  from periodic value noise, cellular noise and stamped strokes (blades, straw, needles, leaves),
  each normalised to a mean brightness of 50%. They live in one `DataTexture2DArray` (WebGL 2) with
  mipmaps and anisotropic filtering. Shaders are patched with `onBeforeCompile`: the land samples
  by world position (one projection per face: tops by the column's top layer, sides by its side
  layer under a grass fringe of 0.09 units, with the side colour pulled toward earth or rock),
  models by object position with a three-axis blend by normal, the layer coming from a per-vertex
  attribute (`merge()` writes `aMat`; building parts get it from their colour and shape, people
  and animals from their part list) or from the material. Colour is multiplied by twice the
  texel; relief bends the normal by the screen-space gradient of a two-mip-coarser sample, so the
  cel-shaded bands roll over stones instead of flickering. Repeats are set to real sizes (a stone
  course ~0.45 m, thatch ~0.35 m, a roof tile ~0.3 m). Relief goes at detail 2, textures at 3
  (unless the setting says on); WebGL 1 keeps the plain colours.
- Flora in 3D: twenty instanced shapes (conifers, snowy conifers, broadleaf crowns, birches,
  cypresses, acacias, palms, rainforest crowns, willows, bare trees, bushes, grass, reeds, ferns,
  boulders, crags, snow caps and tips, flowers, cacti). A planning pass gives each cell of the
  window its biome and full-density plant count; one thinning factor (quantised, with
  hysteresis so plants do not pop) keeps the total within the budget for the detail level
  (56k, 40k, 26k, 14k). Every part is as few triangles as will do (open 3-6-sided cones and
  stems, octahedra), so a forest plant averages about 40 triangles. Instance matrices are
  written directly, and each cell's plants come from its own hash stream, so a rebuild puts
  every plant back where it was. The periodic rebuild (every 6 s: growth, logging, fire, the
  season) is spread over about twelve frames; the GPU keeps the old set until it is done.
  Trees keep off cells beside buildings and are thinner inside a settlement, so villages stand
  in clearings.
- Interface (pixel art, `index.html`, `ui.js`, `icons.js`, `screens.js`):
  - One pixel font (Pixelify Sans) and one frame style: a two-pixel dark outline with a light
    upper-left edge and a dark lower-right edge, on olive-slate stone colours.
  - Powers live in a bar docked along the bottom: six tabs, each a set of labelled groups of 46 px
    icon buttons in two rows with recessed dividers. `BAR` in `ui.js` is the single map from tabs
    and groups to the 53 powers (each appears once) and the world switches.
  - Icons are 12x12 drawings in a shared palette, outlined automatically and drawn once as data
    URLs; they are shown at 3x, pixelated.
  - The loading screen's globe is a 112 px sphere sampled from a 256x128 texture taken from the
    world's own elevation, ice and vegetation as it is being made (noise continents before there
    is a world). Light is quantized into four steps; clouds turn at a different speed. Only drawn
    while the loading screen is visible.
  - The title emblem is drawn once at 220x184: a landscape in a gold ring, with the wordmark cut
    from the pixel font into on/off pixels, extruded and outlined.
  - Behind the title screen deep time runs at 30% speed, so the land drifts but the Dawn waits.
- A loading screen covers every heavy first-time job:
  - at start: fonts, the first world, every map chunk image, the borders, the minimap and the 3D
    shaders (compiled and drawn once off screen)
  - again at the Dawn and for a new world
  So the first playable frame has nothing left to build.
- The year's contacts between communities read positions, polities, landmasses and the relevant
  skills from flat typed arrays packed at the start of the pass, not from the large community
  records.
- Rendering skips what holds nothing: the darkness and glow layers in daylight, empty gas and
  cloud layers, the creature-dot layer with no creatures, weather and god rays outside watch
  time, water animation and lighting refreshes while time races. The vignette is CSS. Name
  plates are cached as small images with their numbers stamped from pre-drawn digits.
- Fluids keep full detail within two chunks of the screen (six in 3D); chunks farther away rest
  and run together every 4th tick, with their springs, rain and snowmelt at the same pace. Flow
  is computed per shared edge between chunks active on the same tick, so no water is created or
  lost. Diplomacy pairs only living polities with cached language similarity and ruler traits.
- Person records are capped by a budget that scales with the map (about 5,000 for a 1080p
  screen); above 80% of it fertility eases off. Dead records keep only family links and core
  memories, and are forgotten once no living person needs them for a family tree (the famous
  are remembered for longer).
- Measured (headless Chromium, software rendering, 1600×900, 544×304 map, ~5,500 people in
  ~200 communities): deep time 36 fps; Millennia 24 fps at ~39 years a second (22 fps zoomed
  out); watch at 16× ~3.2 ms per tick. A simulated year costs ~16–18 ms in Node. Memory stays at
  1–1.6 GB
  over 14,000 years.

---

## 12. Known limitations (prototype)

See the README's *Limitations* section for the current list. It's kept honest as systems land.
