# Prompt: Living Nature: dense forests, real mountains, and animals that live where they belong

Copy-paste this prompt to an AI coding assistant working on **AURA: Genesis 2** (`genesis2/`).
It is written against the real code: plain JavaScript on `window.AG`, three.js r128, no build step.

---

## Context

AURA: Genesis 2 is a god sandbox. The world is a grid of cells (`AG.W × AG.H`, 60k–300k cells).
Every field is a flat typed array in `AG.World` (`Wd`): `elev` (0..1; sea `AG.SEA` 0.4, hills
`AG.HILL` 0.6, mountains `AG.MOUNTAIN` 0.7, peaks `AG.PEAK` 0.82), `veg` (0..255, ≥165 reads as
forest), `soil` (`AG.SO`: DIRT, SAND, ROCK, BASALT, ASH, BLIGHT, HOLY, ROAD, FARM), `snow`, `ice`,
`moist` (0..1), `tbase` (climate temperature 0..1), `fl`/`ft`/`frozen` (water), `fire`, `bgrid`
(buildings), `owner` (city territory), `traffic`, `cereal`. Temperature right now is `Wd.T(i)`
(climate + `Sky.seasonT` + weather + heat). `AG.Sky.season()` is 0 spring … 3 winter and
`AG.Sky.daylight()` is 0 at night, 1 by day.

The 3D view (`js/view3d.js`, `buildFlora()`) draws at most one plant per cell from a hash:
one pine shape, one broadleaf blob, one jungle blob, a cactus, a bush, a flower and a rock.
Forests read thin and samey, and mountains are bare columns.

Animals (`js/life.js`) live as regional populations (16×16-cell regions, `Life.regionOf`).
When time slows to Watch speed, `Life.embody()` gives each species-region its bodies at
**uniformly random cells of the region square**, only avoiding water and ice. Afterwards
(`js/ai.js`, `thinkAnimal`/`thinkBird`) they wander to random points. A herd of bison can stand
on a glacier edge in winter and a jungle monkey in a pine forest, next to a city.

Species have genes that already say a lot about where they should live (`Life.L` loci): SIZE,
SPEED, COLD and HEAT tolerance, SOCIAL, BOLD (shyness), SENSE, COGN. `Life.commonName(s)` reads
them as deer, elk, gazelle, ibex, aurochs, bison, mammoth, wild horse, bear, wolf, great cat,
hyena, great bird, crow, songbird, monkey, great ape, hominin.

## Goal

1. **Forests, mountains and plants that look rich, dense and right for their climate**, without
   making the 3D view slower than it is now on a laptop (target: an M2 Air at 60 fps), and
   scaling down on weak devices.
2. **Animals that appear and move according to place, habitat, time and conditions**: the
   right animal on the right ground, in groups that fit the species, changing by season and
   time of day, and reacting to water, snow, fire, drought and people.

## Part A: Flora and mountains (view3d.js)

### Biomes per cell
Classify every land cell from climate temperature `Wd.Tc(i)`, moisture, elevation, slope (from
neighbouring `elev`), soil, snow, and how near fresh water it is:

| Biome | Where | Plants |
|---|---|---|
| Ice / polar | snow or very cold | snow-capped boulders only |
| Tundra | cold, low | dwarf shrubs (heather, red-brown), grass tufts, lichen rocks, rare stunted pine |
| Boreal (taiga) | cool | dense spruce and pine, birch on wet ground, larch that turns gold in autumn |
| Temperate broadleaf | mild, moist | oak/beech crowns, birch, some conifers higher up; autumn colours vary tree by tree; bare branches in winter |
| Dry temperate | mild, dry | cypress columns, small round olive-like trees, scrub |
| Savanna | hot, half-dry | scattered flat-topped acacias, lots of grass tufts |
| Desert | hot, dry, sand | saguaro and barrel cacti, dry scrub, rocks |
| Rainforest | hot, wet | tall emergent trees above a layered canopy, palms, ferns, dense understorey |
| Waterside | 1–2 cells from rivers and lakes | reeds at the edge, willows (temperate), palms (warm coasts) |
| Mountain | high or steep | conifers thinning toward a treeline that depends on temperature; above it crags, scree and boulders; snow caps on peaks |

### Shapes (instanced, low poly, vertex coloured)
- Conifers: 4–5 stacked tiers, slim spruce and wider pine variants, plus a snowy variant with
  white tier tops baked in.
- Broadleaf: a clustered crown of 4–6 lumps on a tapered trunk; birch with a pale trunk; columnar
  cypress; flat-topped acacia on a forked trunk; palm with a curved trunk and drooping fronds;
  willow with a hanging crown; emergent rainforest tree with a high wide crown.
- Ground cover: grass tufts (crossed blades), ferns, reeds, heather, scrub, flowers.
- Rock: rounded boulders, tall angular crags and spires on steep ground, flat scree, snow caps.

### Density and layout
- Several plants per cell in forests (clumped with gaps, never a regular grid), each at its own
  jittered spot, size and rotation from a stable hash, so nothing flickers when the scene rebuilds.
- Forest density follows `veg`, so god powers, logging and fire still show at once.
- Layers: canopy trees, a few young trees, understorey shrubs or ferns, ground grass and flowers.
- A **budget** per quality level (`V.quality.level` 0 best … 3 fastest) caps the instance count:
  count the candidate cells first, then set plants per cell so the total stays within budget.
  Zoomed in = more per cell, zoomed out = fewer.
- Colours: seasonal per tree (spring light green, summer deep green, autumn mix of gold/orange/red,
  winter bare for deciduous), conifers dusted white in snow.

## Part B: Animals by habitat (life.js, ai.js)

### Habitat score
Add `AG.Habitat` with `score(profile, cell)` (0..1) for a species profile built from its mean genes:
- **Temperature comfort** from the COLD/HEAT genes against the cell's temperature *now*, season
  included, so winter pushes animals to lower, warmer ground.
- **Food**: grazers want grass (open species) or forest edge (deer, elk); predators want prey
  (a coarse map of where grazers actually are) and cover (cats), open ground (wolves, hyenas),
  forest and water (bears); monkeys and apes want warm forest; hominins want forest edge near
  water; songbirds want trees, crows open ground and farms, great birds cliffs and high ground.
- **Water**: closeness to fresh water (a coarse distance map); the pull grows in summer heat.
- **Terrain**: slope and altitude. Ibex like steep high ground; mammoths, bison and aurochs
  avoid it; nothing but ibex and birds likes bare peaks.
- **Snow** makes grazing poor unless the species is built for cold.
- **People**: shy species (low BOLD) keep away from cities, buildings and busy roads; crows don't.
- **Danger**: fire and lava nearby make a cell worthless.

Coarse maps (4×4 blocks: water distance, settlement distance, fire, prey) are rebuilt when
animals are embodied and refreshed every few seconds of Watch time, so scoring is O(1).

### Placement (`Life.embody`)
- Grazers first, then the prey map, then predators, birds and primates.
- Per species-region: sample candidate cells, score them, pick **group centres** by weighted
  chance (better habitat, more likely), and place each group around its centre.
- Group size from SOCIAL and kind: herds of 4–12 (horses, bison, gazelles), small groups for
  deer, packs of 3–7 wolves, single bears and cats, flocks of songbirds, troops of monkeys.
- Bodies stay inside their own region square, so folding back to regional numbers stays exact.
- **Time and conditions at the moment of embodying**: in winter most songbirds of cold lands
  have migrated (fewer bodies; the regional count is kept), bears in cold lands are hibernating
  in dens on forested or rocky slopes, and everything prefers the warmer, lower parts.

### Behaviour over time (`ai.js`)
- Wandering picks the best of a few nearby spots by habitat score, so animals drift to good
  ground instead of random points; herds follow their members.
- **Night**: grazers and primates bed down and rest close together; predators hunt more; birds
  roost.
- **Dawn and dusk, and hot dry days**: animals walk to water and drink.
- **Seasons**: when a place becomes too cold, herds trek to better ground; bears hibernate through
  cold winters (barely burning energy) and wake in spring; songbirds fly toward warmth.
- New task labels for the inspector: Drinking, Hibernating, Roosting, Migrating.

## Constraints
- No new dependencies, no frame-time regressions; everything instanced; cap all counts.
- Deterministic world generation stays deterministic (`tests/run.js` must pass).
- Add a test: embodied animals stand on better habitat than random placement would give them.
- Update README.md and DESIGN.md.
