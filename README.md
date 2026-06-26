# 🔺 Build the Pyramid

A **low-poly 3D city-builder** set in Ancient Egypt. Start from an empty desert:
tap tiles to place **worker camps** that produce your resources, **upgrade** each
building through tiers, and watch your pyramid rise — it is **never a progress
bar**, but physically built **brick by brick** by animated workers hauling stone
up the ramp. Finish it, raise the golden capstone, then found a new dynasty and
build a greater one.

Relaxing to play, on desktop, mobile (touch), or with a gamepad.

![Build the Pyramid](assets/thumbnail.png)

## ▶ Play

**https://raw.githack.com/PukkingDragon123/Pyr/claude/lucid-pascal-6yhhh1/index.html?v=15**

(Served straight from this branch via raw.githack.com — bump the `?v=` number to bust the cache after updates.)

A short on-screen hint shows the two things you do: **tap an empty tile to
build**, and **tap a building to upgrade** it.

## How to play

It's a relaxing **tile-grid city-builder** in the Clash-of-Clans spirit, with a
polished, colourful mobile-game UI:

- **Start from an empty plot** — nothing is prebuilt. You begin with a little
  stone and grain and raise *everything* yourself.
- **Tap an empty tile to build** — a picker shows every building with its
  **type**, **what it does/produces**, and cost. Buildings snap **tile-to-tile**
  and come in **different shapes and sizes** (a Temple covers 2×2 tiles, a Market
  or Granary 2×1). Some need a neighbour: a **Nile Farm next to a Water Well**, a
  **Granary next to a Farm**, **mines next to a Quarry**, a **Market next to a
  Village**.
- **Upgrade everything (Clash-of-Clans tiers)** — tap a placed building to open
  its upgrade panel: see what it produces now, the next tier's output, and the
  cost. Each level multiplies that building's output (and it grows + gets a gold
  ring). Five tiers per building.
- **Every resource is made by a building** — quarries, lumber, farms, wells and
  mines are little tented **camps** whose labourers do the work. Each resource
  chip shows a **storage bar** so you can see how full it is.
- **Watch the real supply line** — sled teams **drag rough stone** from the
  quarry to a **cutting yard**, where a stonecutter **chisels solid rock into a
  dressed brick** (chips fly, the block changes shape). Laborers then carry the
  finished bricks up and set them — every block makes the full journey, no
  teleporting. More laborers and faster machines = a faster build.
- **Click a worker on the pyramid to crack the whip** — they sprint and everyone
  builds faster for a few seconds.
- **The pyramid rises from labor, not materials** — building it never drains
  your resources; just hire laborers and it climbs. Resources are spent only on
  placing and upgrading buildings, so you can never get stuck.
- A calm **desert world**: the **Nile** with papyrus reeds, your **worker
  village & camps**, and the rising pyramid.
- Finish every layer to raise the **golden capstone**, then **found a New
  Dynasty** to keep your Legacy and build the next, greater wonder.

### Wonders (prestige ladder)
Step → Bent → Great → Golden → Black Obsidian → Floating Divine → and on,
forever, each bigger than the last.

### Controls
- **Tap an empty tile** — build there. **Tap a worker on the pyramid** — crack
  the whip. **Drag** to pan, **scroll / pinch** to zoom.
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
- **Flat blocky / pixel UI** — solid fills, square corners, crisp borders and
  hard (no-blur) shadows in a monospace face. No gradients, no rounding. Resource
  counters carry a **storage fill bar**; build-sheet and upgrade panel match. No
  tutorial clutter — just a one-line hint.
- **A real construction supply line:** sled teams drag rough stone from the
  quarry to a cutting yard; a stonecutter shapes **solid rock → dressed brick**
  (the mesh visibly changes, chips fly, a brick pile grows); masons carry the
  finished bricks up the ramp (smoothstep-eased climb) and set them in place.
- **Workers you can count** — the crew is rendered to your actual builder count
  (you start with none and *see* every laborer you hire). Each worker has little
  **black dot eyes**, hands, feet and a belt; animation is fluid — idle
  breathing, head bob, springy (damped) arm follow-through.
- **Detailed-but-blocky models** — mud-brick houses with parapets and roof-beams,
  four-silo granaries, columned temples, market stalls; a layered **Nile** with
  papyrus reeds and a shimmering shallows; sparse desert rocks. Dust, chips and
  ground rings are pooled. (No wandering animals — kept clean and calm.)
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
