# 🔺 Build the Pyramid

A **low-poly 3D city-builder** set in Ancient Egypt. You are the Pharaoh: pitch
**worker camps** across a procedural desert, **tap the trees, stone, water and
fields** to send your crews out gathering, and watch your pyramid rise — it is
**never a progress bar**, but physically built **brick by brick** by animated
workers hauling stone up the ramp, with **oxen, elephants and crocodiles**
roaming the site. Finish it, raise the golden capstone, then found a new dynasty
and build a greater one.

Relaxing to play, on desktop, mobile (touch), or with a gamepad.

![Build the Pyramid](assets/thumbnail.png)

## ▶ Play

**https://raw.githack.com/PukkingDragon123/Pyr/claude/lucid-pascal-6yhhh1/index.html?v=9**

(Served straight from this branch via raw.githack.com — bump the `?v=` number to bust the cache after updates.)

A short **tutorial** walks new pharaohs through the first quarry, the first
crew, and the whip.

## How to play

It's a relaxing **tile-grid city-builder** in the Clash-of-Clans spirit, with a
chunky **pixel / Minecraft** UI:

- **Tap an empty tile to build** — there's no buy-list for camps any more. Tap a
  free tile in the desert and a picker shows what you can raise there. Buildings
  snap **tile-to-tile** on the grid. Some need a neighbour: a **Nile Farm must
  sit next to a Water Well**, a **Granary next to a Farm**, **mines next to a
  Quarry**, a **Market next to a Village**. Plan your village.
- **Build worker camps** — quarries, lumber, farms, wells and mines are little
  tented **camps**. Each sends gatherers out to the resource nodes nearby and
  steadily stockpiles its resource.
- **Tap the map to harvest** — the desert is dotted with **trees, stone, ore,
  crops and water**. Tap a node to send your crews and **collect a burst** of
  that resource (chips fly, a `+N` floats up). Tapped nodes regrow.
- **Watch the real supply line** — sled teams **drag rough stone** from the
  quarry to a **cutting yard**, where a stonecutter **chisels solid rock into a
  dressed brick** (chips fly, the block changes shape). Laborers then carry the
  finished bricks up and set them — every block makes the full journey, no
  teleporting. More laborers and faster machines = a faster build.
- **Click a worker on the pyramid to crack the whip** — they sprint and everyone
  builds faster for a few seconds.
- **Limestone** is the building material; if you run short, build more quarries
  (or tap the stone nodes).
- A real **desert world** grows around you: the **Nile**, a **worker village &
  camps**, fields by the river, oxen, elephants and crocodiles.
- Finish every layer to raise the **golden capstone**, then **found a New
  Dynasty** to keep your Legacy and build the next, greater wonder.

### Wonders (prestige ladder)
Step → Bent → Great → Golden → Black Obsidian → Floating Divine → and on,
forever, each bigger than the last.

### Controls
- **Tap an empty tile** — build there. **Tap a resource node** — harvest a
  burst. **Tap a worker on the pyramid** — crack the whip. **Drag** to pan,
  **scroll / pinch** to zoom.
- **Space / Enter** — whip. **M** — mute. **+ / −** — zoom. **Esc** — close dialogs.
- **Gamepad** — A button whips. Progress **auto-saves** and continues **while you're away**.

## Run locally

ES modules need a server (not `file://`):

```bash
python3 -m http.server 8099   # from the repo root
# open http://localhost:8099/   (append ?dev=1 for the FPS/entity overlay)
```

## Project structure

```
index.html          # canvas + UI overlay (game lives at the repo root)
logic.js            # solo rules stub (for optional platform deploy)
strings.js          # all UI chrome text (localization-ready)
styles.css          # polished, responsive mobile-game UI
assets/             # thumbnail.png, favicon.png (procedurally rendered)
vendor/
  three.module.js   # vendored Three.js r160 (no CDN / build step)
src/
  main.js           # bootstrap, fixed-timestep loop, input wiring
  data.js           # ALL balance numbers & content
  state.js          # game state model + cost/cap helpers
  sim.js            # simulation tick, the build chain, actions, prestige
  render3d.js       # real 3D low-poly renderer (Three.js): lit/shadowed scene,
                    #   instanced pyramid, animated crews & animals, day/night
  render.js         # legacy isometric Canvas2D renderer (kept for reference)
  iso.js            # pyramid geometry (layer cells) shared by the renderer
  audio.js          # procedural Web Audio SFX + generative ambient music
  ui.js             # DOM HUD / build menus / modals
  icons.js, rng.js, format.js
design/             # plan.md, thresholds.md, assets.csv
tools/              # make_card_art.py (deploy art), test_sim.mjs, smoke.mjs, closeup.mjs
```

## Tech notes

- **Real 3D, low-poly** — rendered with **Three.js** (r160, *vendored* — no CDN
  and no build step) on a single WebGL `<canvas>` with a DOM HUD overlaid. The
  only runtime dependency, committed straight into `vendor/`.
- **Lit, shadowed scene:** an isometric orthographic camera, a hemisphere +
  directional sun with soft (PCF) shadow maps, ACES filmic tone-mapping, a
  gradient sky dome and distance fog. A **day/night cycle** drifts the sky,
  sun colour and light through morning, noon, dusk and night.
- **The pyramid** is one `InstancedMesh` of stone cubes (per-block tint
  variation so it reads as hand-laid stone, not a slab); cubes are only revealed
  as workers actually deliver and set them — no teleporting bricks. The golden
  capstone drops in on completion.
- **Tile-grid village building** — a buildable lattice rings the pyramid;
  pointer rays hit-test to a cell, valid empty tiles highlight, and resource +
  city buildings are placed (and validated for adjacency) on the grid. The
  economy keeps building *counts* authoritative, so placement is a layer over
  the same tested simulation.
- **Pixel / Minecraft UI** — the HUD is reskinned into carved-sandstone blocks:
  zero-radius panels with a stone outline and hard (blur-free) shadows, beveled
  Minecraft-style buttons, monospace caps. Pure CSS over the same DOM.
- **Procedural resource map** — trees, stone, ore, crops and water nodes are
  placed deterministically from the dynasty seed (its own RNG stream, so saves
  stay stable). Resource buildings render as **worker camps** whose gatherers
  walk camp↔node, harvest and carry resources back; tapping a node screen-picks
  it and pops a burst with flying chips.
- **A real construction supply line:** sled teams drag rough stone from the
  quarry to a cutting yard; a stonecutter shapes **solid rock → dressed brick**
  (the mesh visibly changes, chips fly, a brick pile grows); masons carry the
  finished bricks up the ramp (smoothstep-eased climb) and set them in place.
- **Animated crews & animals** are procedural low-poly models with gait bounce;
  oxen, elephants and crocodiles roam smooth looped paths (no path-finding, so
  nothing ever gets stuck). Buildings are detailed but blocky — mud-brick houses
  with parapets and roof-beams, four-silo granaries, columned temples, market
  stalls. Dust, chips and ground rings are pooled.
- **Performance:** instanced pyramid (one draw call), pooled FX, pixel-ratio
  capped at 1.5. Fixed-timestep sim with a seeded RNG; logic fully separate from
  rendering, so the simulation is deterministic and testable headless.
- **Responsive & accessible:** touch / mouse / keyboard (physical key codes) /
  gamepad are all first-class; the layout reflows for phones.
- **Art & audio:** the workspace was out of generation credits, so every model
  is built procedurally from primitives (flat-shaded low-poly) at runtime, and
  all sound is synthesized at runtime with the Web Audio API — no asset files.

## Testing

```bash
node tools/test_sim.mjs          # headless core-simulation tests
# browser smoke test (needs a Chromium for Playwright):
python3 -m http.server 8099 &
PW_PATH="$(npm root -g)/playwright" node tools/smoke.mjs
```
