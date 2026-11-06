# AURA: Genesis 2

A god sandbox of deep time that runs in the browser. Every world is born in Year 0 as one
unified supercontinent of its own shape, and its calendar counts forward from there: Year 1, 2,
3, through hundreds of millions of years. Plates drift, rift and collide, and evolving species
spread and split as the land moves. When a primate lineage has evolved the minds for it (a
different year in every world), people appear, and from then on history runs on its own:
- hunter-gatherer bands spread, split and marry between camps
- languages drift apart
- wherever the land and climate allow, and only there, farming, metal, writing and states
  appear

Every person is a record with:
- a genome inherited from both parents
- a personality
- memories that fade and get misremembered
- relationships
- a body that can be hurt

There's no build step. The only third-party code is three.js r128 (MIT), vendored in `vendor/`
for the 3D close-up. To play, open `index.html` in a browser or serve the folder:

```bash
cd genesis2
python3 -m http.server 8000   # then visit http://localhost:8000  (add ?seed=42 for a given world)
```

The system design is in [DESIGN.md](DESIGN.md). It covers architecture, data models, the
geology and evolution models, the invention graph, LOD, update order and the performance plan.

## Playing

| Control | Clock | What happens |
|---|---|---|
| **Ages** | deep time, ~6 million years a second | Plates drift; species radiate and go extinct. Nothing is drawn on top of the map: the land itself shows the plates at work, morphing smoothly as continents part, collide and raise mountains. |
| **Skip to the Dawn** | deep time, fast | The rest of deep time runs at once, and the camera lands on the first band at its fire. |
| **1× · 4× · 16×** | watch | People and animals near the camera act moment to moment: work trips, meals, courtship, fights, hunting. You can possess one of them. |
| **Centuries · Millennia** | history | Everyone lives on their records in year steps. Bands become villages, chiefdoms rise and fall, the sea creeps up the coast. |

**Input:**
- Drag uses the selected tool (Inspect pans).
- Scroll or pinch to zoom. Past 8× the camera tilts into a 3D close-up.
- Right-drag turns and tilts in 3D; `[` and `]` turn, `N` faces north.
- `1`–`5` set the speeds and Space pauses.
- `Tab` cycles layers and `B` cycles overlays.

**Panels:**
- **Inspect:** a person's story, mind, memories, family, relationships, health and genome. Also
  works for an animal, a species, a community (with its invention tree) or a polity (with its
  institutions).
- **Peoples:** polities and the family tree of languages.
- **Life:** the tree of life.
- **History:** the chronicle, with a cause on every entry, plus era timelines, era maps and
  "what if this never happened?".
- **World:** save/load, time-lapse, scenarios, new world, engine stats and diseases.

**Powers** (9 families, 53 tools):
- **Land:** raise or lower ground, plant meadows, forests or wild grain.
- **Geology:** push a plate, trigger or calm a fault, force an eruption, start an ice age, warm
  the world.
- **Elements and weather:** pour water or lava, rain, drought, lightning.
- **Life:** spawn species, and raise, lower or mutate a chosen gene in the creatures under the
  brush.
- **Divine:** bless, curse, plague (with a disease designer), send a dream, omens, inspire,
  harmony, discord.
- **Ruin:** meteors, tornadoes, tsunamis.
- **Deep:** dig, ore, magma, aquifers.

## What's simulated

- **Geology** (`geo.js`). A coarse plate grid:
  - drift with collision by buoyancy, isostasy, rifting into new ocean, sutures, hotspots
  - Wilson-cycle splits
  - strain and earthquakes (Gutenberg–Richter-like magnitudes, tsunamis)
  - volcanoes and eruptions with volcanic winters
  - creep and stream-power erosion with deposition and deltas
  - westerly and trade-wind rain shadows; orbital ice-age cycles
  - ice volume setting sea level, with continental shelves that ice-age seas expose and
    deglaciation drowns
  - ores laid down by rock type

  The fine 2D map is painted from it. During history, sea level, glaciers, quakes and eruptions
  keep reshaping the land under the people.
- **Evolution** (`life.js`):
  - every creature carries a 16-locus diploid genome with Mendelian inheritance (including a
    recessive albino allele) and mutation
  - species live as regional gene pools that adapt toward their local optimum (Bergmann's rule,
    island dwarfing, heat and cold tolerance)
  - neutral drift is shared within a connected landmass, so a population cut off by sea drifts
    its mate signal until it can no longer interbreed: a new species, with a parent link in the
    tree of life
  - predators and prey, competition and mass extinctions
- **People** (`people.js`):
  - personality from genes and upbringing; 24 tastes; beliefs; skills learned from parents and
    by doing
  - goals and a mental state
  - memories with salience, fading and misremembering, plus rumour between friends
  - asymmetric relationships (affection and respect, at most 24 per person)
  - body-part injuries, frailty and chronic illness, pregnancy, and births from both parents'
    genomes
- **Civilization** (`civ.js`, `tech.js`, `war.js`, `lang.js`):
  - **Communities** (bands, villages, towns) survey their land. Jobs are allocated by marginal
    food yield. They eat, starve, move camp, split, merge, marry out (exogamy) and settle.
  - **Polities** (band → tribe → chiefdom → state) have rulers, succession, institutions that
    grow corrupt and get reformed, inequality, legitimacy, collapse and secession.
  - **A 50-invention graph** with prerequisites and real conditions. Cultivation needs wild
    cereals and a settled climate; bronze needs tin, or trade for it; writing needs a chiefdom.
    Inventions spread between contacts, and small isolated groups can lose them. Eras are only
    labels on what each community knows.
  - **Languages** have regular sound changes and split when contact breaks or a dialect chain
    stretches too far.
  - **Also:** diplomacy, raids and wars (embodied squads near the camera, Lanchester battles
    elsewhere), trade, gods born of what a people lived through, and epidemics with drifting
    strains.
- **History** (`history.js`):
  - every chronicle entry carries its cause
  - snapshots every 500 years make counterfactuals possible ("what if writing was never
    invented?" rewinds and bans it)
  - saves round-trip exactly
  - a replay log
- **Level of detail:**
  - Person records are canonical. Near the camera (watch speeds) they get bodies; far away or
    in history they live on records alone. Folding back keeps every record, and the food model
    is the same either way.
  - Animals are embodied from their regional gene pool and folded back into it.

## Performance

The game keeps itself smooth on modest machines. A governor watches the real frame rate and
steps through four levels; World → Performance can fix one instead:
- **Full:** everything.
- **Light:** no cosmetic weather, god rays or far trees; a smaller simulation slice per frame.
- **Lean:** the canvas at 75% resolution (the pixel art is stretched up crisply); no water
  ripples; wild animals as dots until zoomed in close; off-screen fluids rest longer; fewer
  bodies near the camera; the 3D close-up at reduced quality.
- **Potato:** the canvas at 50%; the 3D close-up off (the map zooms in as 2D pixel art); the
  fewest bodies.

Low-end devices (by reported memory and cores), or a saved Potato choice, also start with a
world of about a third as many cells.

A loading screen covers the start, the Dawn and every new world. Behind it, these are prepared
before the first playable frame:
- the fonts and the world
- every map chunk image, the borders and the minimap
- the 3D shaders, compiled and drawn once off screen

Nothing heavy waits for a frame in play. A history step, the year's contacts between communities
and each 500-year snapshot are cut into small stages that run within the frame budget. They run
in the same order, so the results are identical. If something does fail, an error box shows the
message instead of a frozen screen. No panel uses backdrop blur, so the moving map is never
re-blurred under the interface.

## Tests and demos

```bash
node genesis2/tests/run.js            # 14 headless tests, ~50 s
node genesis2/tests/demo-emergence.js # bands -> villages, chiefdoms and new eras, with causes
node genesis2/tests/demo-sealevel.js  # the ice melts: coasts drown, camps flee, languages split
```

The tests cover:
- **Plate tectonics:** collision raises mountains at the suture; divergence opens a rift and
  new ocean floor; a transform fault builds strain and releases quakes.
- **Geology:** the Dawn finishes a living map; deglaciation drowns coastal land.
- **Determinism:** the whole world from one seed replays identically, including when steps are
  spread over frames.
- **Save/load:** a loaded world has the same future as the original.
- **Snapshots:** one copied over many frames restores the same world as one taken at once.
- **Genetics:** 1:2:1 recessive ratios and mutation rates.
- **Speciation:** across a newly flooded strait it happens; in a connected control it doesn't.
- **Selection:** cold tolerance tracks the climate.
- **Technology:** prerequisites, conditions and bans gate every invention.
- **LOD:** embodying and folding keep every record and feed people alike.

Both demos are also in-game under World → Scenarios.

## Limitations

This is a prototype, and these are the honest gaps:

- **Scale.**
  - The person budget scales with the map, at about 5,000 people for a 1080p screen. Above 80%
    of it, fertility eases off as a performance cap, not a natural limit, so there are no
    million-person empires.
  - At that size a simulated year costs about 16–20 ms, so Millennia reaches about 40 years a
    second in a software-rendered browser (more with a GPU), not the nominal 400. One step, and
    each history snapshot, is spread over several frames to keep the picture smooth.
  - Memory runs at 1–1.6 GB over very long games.
- **States are rare.**
  - Chiefdoms appear after farming. States need a large, long-lived chiefdom with writing,
    monuments or several towns, and at this population scale few reach it in 14,000 years.
  - Conquest-driven state formation is modelled, but wars are infrequent.
- **One big continent.**
  - Deep time usually ends with a single large landmass covering about 60% of the map, more
    than Earth.
  - The rising sea drowns about 9% of the land, not whole land bridges. Speciation by sea
    barriers happens mostly in deep time.
- **Watch mode is a window, not the whole world.**
  - Only communities near the camera are embodied, up to 6,000 people.
  - Embodied work trips nudge food production by at most ±20%, so the camera can't starve or
    enrich a camp.
  - Days are short: a year is 960 ticks, or two day–night cycles.
- **Simplified biology and culture.**
  - Genomes are 16 additive loci (plus a dominance rule for pigment). Species live as regional
    gene pools, not as individuals, unless embodied.
  - Languages change by regular sound laws on a small core vocabulary, and names come from
    their phonology.
  - Religions are built from a fixed vocabulary of domains.
- **A plausible world, not Earth.**
  - The aim is how life and humanity could plausibly evolve over time in a simulated world, not
    a replay of Earth's dates or geography. Rates (invention difficulty, mortality, sea-level
    timing, orbital cycles) are tuned for play and a believable order of events.
  - The "brain drive" that brings the Dawn is a simple rising payoff for primate intelligence,
    not a model of brain evolution.
  - The orbital cycle is a stylised 100k/41k/23k-year sum, and farming tends to arrive around
    4,000–7,000 years after the Dawn.
- **2D first.**
  - The 3D close-up renders a window around the camera. Deep-time maps and overlays are 2D only.
  - Headless Chromium (software WebGL) runs much slower than a real GPU browser.
