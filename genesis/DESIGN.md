# AURA: Genesis — Design Blueprint

A deep, top-down 2D pixel-art god sandbox. The player shapes land, elements, weather and
fate. Kingdoms, faiths, families and wars emerge on their own. This document is the feature
blueprint and the technical plan. The playable prototype in this folder implements every
system described here at prototype depth; each section ends with **In the prototype**
(what ships today) and **Next** (how the system deepens).

---

## 1. Pillars

1. **Everything is a cell, everything reacts.** Terrain, fluids, heat, gas, fire and
   vegetation live on one grid with simple local rules, so interactions compose: lava meets a
   river and makes basalt and steam; a heatwave dries a forest that lightning then ignites.
2. **People, not units.** Every citizen has a genome, traits, skills, a life goal, a family
   tree and a memory log. History is the sum of individual lives.
3. **Civilisations interpret the god.** Pantheons are built from what a people lived through.
   A realm you flood worships a drowned mother; a realm you bless reveres an unseen gardener.
4. **Indirect control, direct when you want it.** Brushes and miracles shape conditions. Possession
   lets you walk, fight and cast as any creature, wyrms included.
5. **Scale without stutter.** Tens of thousands of entities on a 98k-cell world at 60 fps,
   by doing as little work per tick as the world allows.

---

## 2. World model — three layers

| Layer | Contents | Who lives there |
|---|---|---|
| **Sky** (layer 2) | Wind, roaming storm cells, a 96×64 cloud-density field, lightning | Birds, wyrms, skyships |
| **Surface** (layer 1) | Height map, fluids, soil, vegetation, snow, fire, heat, gas, roads, borders, buildings | Citizens, animals, hollows, carts, ships, catapults |
| **Deep** (layer 0) | Rock, soft earth, caverns, mine tunnels, iron/gold veins, mana crystal, glowcap groves, magma pockets, aquifers | Miners, cave crawlers |

The world is 384×256 cells (98,304), stored as flat typed arrays indexed `i = y·W + x`
(structure of arrays). One cell is one pixel of the base image.

**Surface fields:** `elev` f32, `fl` f32 (fluid depth), `ft` u8 (water/lava/acid), `frozen`
u8, `veg` u8, `snow` u8, `soil` u8 (dirt, sand, rock, basalt, ash, blight, hallowed, road,
farmland), `fire` u8, `heat` f32 (local temperature anomaly), `moist`/`tbase` f32 (climate),
`gas` f32 + `gt` u8 (steam/smoke/miasma), `traffic` u8, `owner` i16 (city), `bgrid` i32
(building).
**Deep fields:** `ug` u8 (material), `ugF` u8 (fluid amount), `ugT` u8 (magma/water).

Effective temperature is `T = tbase + season + local storm + heat`. Latitude makes the north
cold and the south hot, and altitude cools.

**Linking the layers.** Mines open shafts from surface to deep. Volcanoes connect deep magma
to surface vents. Meteors seed mana crystal underground. Earthquakes collapse and open
caverns. Storms in the sky rain or snow onto the surface and cool or heat the chunks beneath.

**Generation:** domain-warped fractal noise over two or three continental blobs, plus ridged
mountain chains. The map is remapped so about 46% sits below sea level. Moisture and
temperature come from noise. Rivers are traced by steepest descent from wet highlands along
a strictly descending carved bed, with a spring at each source so they keep flowing. Caves are
noise smoothed by three cellular-automaton passes, then filled with ores, magma pockets (under
mountains), aquifers (under wet lowlands) and fungus groves.

**In the prototype:** all three layers; Tab cycles views; every deep tool edits the
underground; miners really dig tunnels, can breach magma or aquifers, and drown or burn.
**Next:** sky islands as a fourth stratum; deep-dwelling civilisations (Stoneborn holds built
entirely underground); vertical cave levels.

---

## 3. Dynamic physics

### 3.1 Fluids — height-field "virtual pipes"
Each fluid cell holds a depth on top of the ground. Every tick, every edge between two
neighbouring cells moves fluid from the higher surface `elev + fl` to the lower:

```
q = min(fl_source · 0.24, Δh · 0.5 · rate[type])     // ≤ 24% per side, so a cell never goes negative
```

Flows are accumulated into a delta buffer and applied in a second pass (Jacobi style), so the
result does not depend on scan order. Viscosity is the per-type `rate`: water 0.5, acid 0.42,
lava 0.1. Terraforming changes `elev`, so rivers re-route themselves around new hills and fill
new valleys.

**Ocean as a reservoir.** Cells deeper than `SEA − 0.03` are pinned to sea level. Inflow
drains away and the open ocean costs nothing once its chunks fall asleep. The map edge is also
pinned, so floods always have somewhere to go.

### 3.2 Reactions (resolved where fluids of different type meet)

| Meeting | Result |
|---|---|
| Lava + water | Lava solidifies into **basalt** (raises the ground, which builds new land into the sea); water flashes to **steam** |
| Acid + water | Acid is diluted and neutralised; a puff of **miasma** |
| Lava + acid | Violent **smoke** |
| Lava on anything | Ignites vegetation and buildings, melts snow and ice, cools to basalt (faster when thin) |
| Acid on anything | Dissolves terrain height and vegetation, corrodes buildings, evaporates slowly |

### 3.3 Heat, fire and freezing propagation
`heat` is a diffusing anomaly field: `h' = (0.76·h + 0.06·Σneighbours) · 0.993`.
- **Fire** pins local heat high, consumes vegetation and buildings and emits smoke. It spreads
  to a random neighbour with probability `fuel × wind-alignment × (1 − moisture)`, which is
  suppressed by rain, snow and standing water. Wind direction visibly bends fire fronts.
- **Frost** tools push heat negative. The cold front diffuses outward, and shallow water freezes
  with a probability that rises with each already-frozen neighbour, so ice visibly creeps
  across lakes. Frozen water is solid and walkable, and thaws when `T` recovers.
- **Spontaneous combustion** occurs in extreme heat (heatwave over dry forest).

### 3.4 Gas
Steam, smoke and miasma diffuse to neighbours with wind-weighted shares and decay at
type-specific rates. Miasma poisons creatures standing in it.

### 3.5 Slow processes (round-robin, each chunk every 16 ticks)
Vegetation grows toward a capacity set by moisture, temperature and soil. Snow accumulates and
melts with the season. Inland water evaporates, so closed basins settle into lakes. Basalt
weathers back to soil. Blight creeps into neighbouring land and is cancelled by hallowed
ground. Heavily trodden paths turn into **roads**, which then speed travel. The road network
is emergent, not placed.

### 3.6 Underground automaton
Magma and groundwater move as conserved amounts between open cells (half the difference to a
random neighbour). Magma meeting water turns to rock. Thin magma cools to rock. Magma burns
out fungus groves.

**In the prototype:** all of the above, at 20 ticks per second with chunk sleeping (section 8).
**Next:** sediment erosion and deposition (rivers carve canyons and build deltas); pressure for
deep magma (eruptions when mines breach); gas weight (heavy miasma pools in valleys); lightning
setting off gas pockets.

---

## 4. Factions and culture

### 4.1 Realms, cities, borders
A **kingdom** owns cities, a culture state, a religion, an opinion of every other realm, war
flags, experience counters and a banner. A **city** has members, stores (food, wood, stone,
ore, gold, mana crystal, faith), buildings, a construction site, a radius, loyalty and
religion.

**Dynamic borders.** This is a multi-source BFS from every city keep, re-run every 40 ticks.
A cell joins the first city to reach it within a Euclidean radius `6 + 2.2·√pop`, crossing
rivers but not deep water. Borders breathe as cities grow, starve or fall. The same pass
counts contact cells between realms, and that contact drives tension.

### 4.2 Economy and jobs
Every 20 ticks a city rebalances jobs toward need: soldiers (10%, or 40% at war), priests per
temple, builders while something is under construction, miners per mine, farmers per farm,
woodcutters when wood is short, and gatherers for the rest. Gatherers forage vegetation, fish
from shorelines and hunt deer. Farms grow by season (nothing in winter) and yield more with
Crop Rotation, Irrigation (near water) and nearby Windmills. Births need housing, a surplus
of food and a married, fertile mother.

**Buildings:** Keep, House, Farm, Windmill, Temple, Market, Mine, Tower, Wall, Dock, Siege
Workshop. Each has a footprint, hit points, a cost and an optional culture requirement.
Construction is incremental and builders walk to the site.

**Settlers.** A crowded city sends families to a reachable site scored by its race's biome
preference. When they arrive they found a new city.

### 4.3 Trade routes with visible cargo
A city with a Market sends **carts** along land flow fields, **ships** between Docks along sea
flow fields (Seafaring), or **skyships** in straight lines (Skyships). They carry the city's
largest surplus and come back with gold. Trade raises opinion between realms and lets
merchants carry religion to cities that have no temple. Routes are drawn on the map.

### 4.4 Culture tree
There are four branches of four tiers. Culture points come from population, intellect genes,
temples, markets, worship and mana crystal, and from divine inspiration. The next branch is
chosen by weights from race bias, wars, coastline, food shortage and the realm's experiences.

| Agrarian | Martial | Mercantile | Mystic |
|---|---|---|---|
| Crop Rotation | Drilled Ranks (flanking) | Markets (carts) | Shrines (temples, a faith is born) |
| Windmills | Fortification (walls, towers) | Seafaring (docks, ships) | Pantheon (missionaries) |
| Irrigation | Siegecraft (catapults) | Coinage (double gold) | Miracles (priests cure plague) |
| Granaries | Tempered Steel (+30% dmg, armour) | Skyships | Ascension (saints) |

### 4.5 Religions made by the citizens
Each realm keeps **experience counters**: fire, water, storm, earth, plague, harvest, war,
death, sun, and **watcher** (your interventions). Events add to them: lava deaths add fire,
drownings add water, lightning adds storm, quakes add earth, blessings add watcher and harvest,
and battles add war. When a realm builds its first temple it either adopts a friendly
neighbour's faith or **founds a pantheon**. Two to four deities are generated from its top
experiences, each with a generated name and an epithet ("Ulviiel, Who Hurls the Spear of
Light"). The first deity sets a **tenet**: zealous, pacifist, ascetic, devout or stoic. Tenets
change diplomacy (zealots start holy wars), disease resistance (ascetics) and blessing
strength (devout). Faith spreads through missionaries, merchants and conquest. A city whose
faith differs from its crown loses loyalty.

### 4.6 Diplomacy
Opinion between every pair of realms drifts toward a target:

```
target = race affinity + shared/different faith (± tenet) + trade volume
         − border contact − proximity − cruel/ambitious rulers + kind rulers
         + divine harmony/discord (decays) − active war
```

War is declared below −35 opinion when realms touch or sit close, with a stated cause: border
dispute, holy war, a cruel ruler or divine discord. Peace comes when opinion recovers, when
combined war exhaustion (soldiers lost) runs high, or by divine will.

### 4.7 Tactical warfare
- **Armies** muster 80% of a realm's healthy soldiers at the city nearest the enemy (rally), then
  march along a shared flow field.
- **Flanking** (Drilled Ranks): the army splits into a centre and two wings. The wings swing to
  waypoints on either side of the target while the centre slows down to let them arrive. Then
  all three converge. Combat rewards it: every blow compares the attacker's position with the
  defender's facing, scoring **×1.25 from the side and ×1.6 from behind**.
- **Siege:** Siege Workshops roll out **catapults** that stop at range and lob boulders at
  walls, towers and keeps, with area damage to units and buildings.
- **Fortifications:** walls form a ring with four gates (impassable to enemies, who must breach
  them), and arrow towers plus keeps shoot at hostiles, including wyrms in the sky.
- **Conquest:** a keep surrounded by attackers with no defenders for 100 ticks flips owner. Its
  citizens become subjects. A realm with no cities falls.
- **Rebellion:** distant, unhappy cities of a different faith may secede under an ambitious
  local, which starts a war of independence.
- **Morale:** wounded soldiers who are not brave can break and flee. Veterans (3 kills) and
  heroes (8 kills, recorded in the chronicle) hit harder.

**In the prototype:** all of the above. **Next:** formations as explicit blocks (shield wall,
skirmish line); naval invasions with troop ships; supply lines that armies must keep fed;
vassalage, alliances and coalition wars; culture-specific units (Sylvan rangers, Stoneborn
sappers who tunnel under walls).

---

## 5. Genetics, traits and personal lives

### 5.1 Genome
There are nine genes (0–255): **Strength, Agility, Intellect, Fertility, Longevity, Stature,
Hue, Resilience, Devotion**. Founders draw from species baselines with variance. A child takes
each gene as

```
gene = 0.7 · (one parent's allele, 50/50) + 0.15 · mum + 0.15 · dad + drift(±6)
       + rare large mutation (2%, more if a parent is blessed or cursed)
```

Genes drive stats: HP from stature and strength, damage from strength, speed from agility,
lifespan from longevity, disease resistance from resilience, birth rate from fertility, culture
output from intellect, and worship from devotion. Hue tints the sprite's skin, so lineages
visibly share a colouring.

### 5.2 Traits
- **Expressed** from extreme genes: Genius, Giant, Swift, Sickly, Fertile, Long-lived.
- **Heritable personality:** Brave, Coward, Kind, Cruel, Greedy, Pious, Curious, Ambitious, with
  a 25–35% chance to pass from each parent, plus a small chance of arising fresh. Opposites
  resolve.
- **Earned:** Veteran, Hero, Fire-touched, Blessed, Cursed (the divine marks are heritable).

Traits feed behaviour: cowards flee, the brave stand, the pious visit temples, the curious
wander far, and a ruler's cruelty or kindness tilts the whole realm's diplomacy.

### 5.3 Skills, goals, memories, family
- **Skills** (Combat, Farming, Crafting, Mining, Faith, Trade) grow with use, faster with
  intellect and twice as fast for geniuses, and they shorten work time and raise yields.
- **Life goals** are weighted by traits: raise a family, amass wealth, win glory, see the
  world, serve the gods, rule a realm, master a craft. They bias behaviour (wanderers explore,
  would-be rulers lead rebellions and claim thrones).
- **Memory log:** up to 14 dated entries per person (born, came of age, married, children,
  battles, plagues survived, blessings, crowned, mourning).
- **People ledger:** every citizen gets a record (uid, name, parents, children, birth, death,
  cause, realm, memories) that outlives the entity slot. The inspector walks it to show
  grandparents, parents, spouse, siblings and children, living or dead (†). Royal succession
  uses it: the eldest adult child inherits, otherwise the most ambitious adult in the capital.
  The ledger prunes the oldest dead records past 60k entries.

**In the prototype:** all of the above. **Next:** dominant/recessive allele pairs and
visible mutations (albinism, extra horns); learned culture memes passed parent-to-child;
grudges and friendships in the memory log that drive duels and feuds; dynasties with house
names and heraldry inheritance.

---

## 6. God controls

The tools come in eight families. Brushes apply continuously while held. Size and strength are
adjustable, and brush size also scales storms and disasters.

| Family | Tools |
|---|---|
| Watch | Inspect, **Possess** |
| Terrain | Raise, Lower, Smooth, Meadow, Forest, Desert, Snow |
| Elements | Water, Lava, Acid, Miasma, Fire, Frost (cold front), Drain |
| Weather | Rain, Thunder, Blizzard, Heatwave, Acid rain, Lightning bolt |
| Life | Found a realm (Kin, Sylvan, Stoneborn, Ashen), Deer, Wolves, Birds, **Herald avatar** |
| Divine | Bless, Curse, **Plague**, **Mutate**, Bounty, Inspire, **Harmony**, **Discord** |
| Disasters | Meteor (crater seeded with crystal), Earthquake (fault line, cave collapse, magma vents), Volcano, **Tornado (steerable)**, **Wyrm (possessable)** |
| Deep | Dig, Fill, Ore, Crystal, Magma, Aquifer, Crawlers |

- **Disease designer:** name, colour, contagion, spread distance, lethality, weakness,
  incubation, duration, sterility, madness (victims attack their own), the Hollowing (the dead
  rise), and the species it can infect. Resilience genes resist it, survivors gain immunity,
  ascetic faiths endure it and Miracles-tier priests cure it. Crowded cities also brew random
  outbreaks.
- **Avatars:** possess any creature (citizen, wolf, wyrm, your Herald). WASD or tap to move,
  Space to strike, and E for divine power (fireball, or the Herald's holy nova that heals
  people and smites monsters).
- **Controllable disasters:** a tornado follows the pointer while held; a wyrm can be flown by
  hand.

**Next:** custom creature creator (body plan + genome template + diet + behaviour); a miracle
economy where faith generated by worship powers the strongest tools; prophecy (whisper a goal
into a ruler's ear).

---

## 7. Weather, light and art direction

The visual target, translated from the concept prompt (*"16-bit HD pixel art, glowing rivers,
bubbling magma, spreading acid, day–night, god-rays through pixel clouds, rainstorms and
blizzards"*), and how the renderer meets it:

- **One cell = one pixel** in the world buffer, scaled with nearest-neighbour sampling. Sprites
  run at **4 sprite pixels per cell**, which gives HD pixel-art detail on top of the map.
- **Living fluids:** water shades by depth with animated shimmer and see-through fords; lava
  flickers and crusts as it thins; acid bubbles; ice is pale and opaque.
- **Moving sun:** hillshading follows the sun from east to west through the day, so mountain
  shadows sweep across the map.
- **Light map:** a half-resolution luminance field gathers lava, fire, lit windows, magma,
  crystal, fungus, miners' torches, fireballs and lightning. It is box-blurred and composited
  as night darkness plus an additive warm glow, so cities glow at night and lava rivers light
  the valleys.
- **Sky:** clouds come from scrolling noise plus roaming storm cells and cast offset shadows
  that follow the sun. They fade as you zoom in. God rays are additive light shafts, stronger
  where clouds break. Rain streaks and snowflakes fall with the wind. Lightning bolts are
  jagged polylines with a screen flash.
- **Sprites:** procedural pixel art for each race, role (worker, soldier with spear, priest in
  robes, crowned ruler, child), animal, monster, vehicle and building, tinted by kingdom colour
  and the hue gene, with two-frame walk cycles. Windmill blades turn, and construction rises
  from the ground up inside scaffolding.
- **Particles:** a pooled system for sparks, blood, steam, embers, holy light, curses, magic,
  explosions and debris.
- **Seasons:** autumn tints temperate grass, winter snow advances from the north, and lakes freeze.

---

## 8. Performance architecture (tens of thousands of entities)

Measured in headless Chromium (software rendering, so expect better on a desktop GPU):

| Scenario | Sim per tick | Render per frame |
|---|---|---|
| New world, ~900 entities | ~2.5–3 ms (physics-dominated) | ~4 ms |
| Stress test, ~20,000 entities | ~7.7 ms (AI 5.2, physics 2.8) | ~4 ms (LOD) |

What makes that possible:

1. **Structure of arrays.** Every entity field is a typed array sized for 32,768 slots. There
   are no per-entity objects, so there's no garbage-collection churn and loops stay cache-friendly. A free list
   recycles slots; records that must outlive a slot (people, buildings) live in side tables.
2. **Spatial hash rebuilt per tick by counting sort.** 8×8-cell buckets per layer, `head`/`next`
   int arrays, O(n) rebuild. Neighbour queries fill a shared scratch buffer, with no allocation.
3. **Staggered thinking.** Movement runs every tick for every entity (a few flops). The expensive
   decision step (spatial queries, job choice, disease spread) runs for 1/8 of entities per
   tick, by index modulo 8. The cost is linear and smooth, and there are no spikes.
4. **Flow fields instead of per-unit A\*.** One 8-neighbour BFS distance field per destination
   (a city keep, a dock, a settlement site) is shared by every soldier, cart or settler heading
   there. Units read the next downhill cell four steps ahead. Fields are cached (LRU of 40,
   about 8 MB), rebuilt when stale or after terraforming, and capped at **two rebuilds per
   tick** so pathfinding never spikes.
5. **Chunk sleeping for physics.** 16×16 chunks carry an awake timer. Only awake chunks (plus a
   one-chunk halo) run fluids, fire, heat and gas. Anything that changes the world wakes its
   chunk. Quiet land, ice and the open ocean (pinned as a reservoir) cost nothing. Heat
   diffusion is skipped entirely in chunks with no anomaly nearby. Slow processes run
   round-robin, 1/16 of the map per tick.
6. **Two-pass, delta-buffered fluids.** These are branch-light inner loops over contiguous
   memory, with flow conservation guaranteed by construction.
7. **Rendering LOD.** Close up, each creature is a cached, tinted sprite. When more than 2,500
   creatures are on screen, they are written as single pixels into a world-sized buffer and
   scaled up. Rendering 20,000 creatures dropped from 87 ms to 4 ms.
8. **Incremental terrain painting.** Only dirty chunks, awake chunks (alternating frames),
   visible chunks (every fourth frame) and a rolling 12 chunks per frame are repainted. Light,
   gas and clouds are low-resolution buffers scaled with smoothing.
9. **Fixed timestep with a budget.** The sim runs at 20 ticks/s × speed, but never more than
   14 ms per frame. If the requested speed can't be met, the HUD says "sim at capacity"
   rather than stuttering. Rendering interpolates unit positions between ticks.

**Scaling path beyond the prototype**
- Move the simulation into a **Web Worker** over `SharedArrayBuffer` (needs cross-origin
  isolation headers). The main thread renders from the shared arrays, giving roughly 2× headroom.
- Port fluids and heat to **WASM SIMD** or a **WebGL/WebGPU compute** pass. The rules are
  already written as data-parallel stencils.
- Render the world with **WebGL**: one textured quad for terrain and instanced quads for
  sprites, which takes sprite counts from ~2.5k to ~100k.
- **Simulation LOD for offscreen regions:** distant cities run their economy statistically
  (aggregated births, deaths, production) and re-materialise citizens when the camera
  returns.
- **Hierarchical flow fields** (portal graph between chunks) for very large maps.

---

## 9. Roadmap — the three deep-dives offered next

1. **Custom creature creation.** Body-plan pieces (legs, wings, fins, shells), a genome
   template with ranges, diet and temperament sliders, and generated sprites. Creatures enter
   the ecosystem and can be domesticated by realms (mounts, war beasts, livestock).
2. **Deep underworld expansion.** Several stacked deep layers, ancient ruins with relics,
   subterranean civilisations, magma seas with pressure-driven eruptions, and fungus
   ecosystems with their own food web.
3. **Dynamic weather and disasters.** Pressure systems that steer storms, droughts and floods
   with crop failure, seasonal monsoons, tsunamis from offshore quakes, ash winters after
   eruptions, and auroras and eclipses that faiths read as omens.

---

## 10. Code map

| File | Responsibility |
|---|---|
| `js/core.js` | Namespace, constants, RNG, value noise, species, genes, traits, buildings, culture tree, religion vocabulary, disease library, names, chronicle |
| `js/world.js` | Layer storage, chunk wake bookkeeping, world generation (continents, rivers, caves) |
| `js/sky.js` | Calendar, day/night, seasons, wind, storms, precipitation, lightning, clouds |
| `js/physics.js` | Fluids, reactions, fire, heat, freezing, gas, slow processes, underground automaton |
| `js/entities.js` | Entity arrays, spawn/kill/damage, genetics, traits, skills, people ledger, spatial hash |
| `js/civ.js` | Flow fields, kingdoms, cities, buildings, borders, economy, culture, religion, diplomacy, war, trade, ecology |
| `js/ai.js` | Per-unit behaviour, combat and flanking, digging, animals, monsters, vehicles, possession, projectiles |
| `js/god.js` | Tool catalogue, brushes, disasters, possession |
| `js/fx.js` | Particle pool |
| `js/render.js` | Terrain painting, lighting, sprites, overlays, weather, god rays, minimap |
| `js/ui.js` | HUD, tool palette, inspector, realms, chronicle, world stats, disease designer, input |
| `js/main.js` | Boot, world creation, stress test, fixed-timestep loop |
