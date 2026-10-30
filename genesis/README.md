# AURA: Genesis

A 2D pixel-art god sandbox that runs in the browser. Shape a layered world of land, water,
lava and weather, and watch kingdoms of individually simulated people grow, trade, found
religions, breed new generations and go to war.

There's no build step and no dependencies. Open `index.html` in a browser, or serve the
folder:

```bash
cd genesis
python3 -m http.server 8000   # then visit http://localhost:8000
```

The full system design and performance plan is in [DESIGN.md](DESIGN.md).

## What's in it

- **Three layers:** Surface, Deep (caverns, ore, magma, aquifers, mines) and Sky (storms,
  clouds, birds, wyrms, skyships). Press `Tab` to switch between them.
- **Living physics:** water, lava and acid flow downhill and react with each other (lava plus
  water makes basalt and steam). Fire spreads with the wind, cold fronts freeze lakes, and
  smoke, steam and miasma drift. Roads form where people walk.
- **Four civilised races:** Kin, Sylvans, Stoneborn and Ashen. They have jobs, farms, mines,
  temples, markets, docks, walls and towers, settlers, and trade carts, ships and skyships.
- **Culture trees and religions:** each realm climbs Agrarian, Martial, Mercantile and Mystic
  branches. Pantheons form from what a people lived through, including what you did to them.
- **Warfare:** armies muster, split into pincer wings, besiege with catapults, breach walls and
  capture cities. Distant unhappy cities rebel.
- **People:** nine-gene genomes with inheritance and mutation, traits, skills, life goals,
  memories and family trees, all browsable in the inspector.
- **God tools:** terraforming, elements, weather, blessings and curses, a disease designer,
  gene mutation, harmony and discord between realms, meteors, earthquakes, volcanoes, steerable
  tornadoes and wyrms, and possession of any creature.

## Controls

| Input | Action |
|---|---|
| Drag / tap | Use the selected tool (Inspect drags to pan) |
| Right-drag, two fingers | Pan; pinch to zoom |
| Scroll, `+` / `-` | Zoom |
| `WASD` / arrows | Pan, or walk while possessing |
| `Space` | Pause, or strike while possessing |
| `E` | Divine power while possessing |
| `Esc` | Release a possessed creature |
| `1`–`4` | Speed 1×, 2×, 4×, 8× |
| `Tab` | Cycle Surface, Sky, Deep |
| `B` | Cycle overlays (realms, faiths, climate) |

The **World** tab shows live engine stats and has a stress-test button that adds 10,000
creatures at a time.
