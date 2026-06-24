# 🔺 Build the Pyramid

An **idle tycoon / incremental clicker** set in Ancient Egypt. You are the
Pharaoh, and your pyramid is **never a progress bar** — it is physically built,
**brick by brick**, in a warm low-poly isometric desert, with tiny **animated
workers** hauling stone up the ramp and **oxen, elephants and crocodiles**
roaming the construction site. Finish it, raise the golden capstone, then found
a new dynasty and build a greater one.

Relaxing to play, on desktop, mobile (touch), or with a gamepad.

![Build the Pyramid](assets/thumbnail.png)

## ▶ Play

**https://raw.githack.com/PukkingDragon123/Pyr/claude/lucid-pascal-6yhhh1/index.html?v=4**

(Served straight from this branch via raw.githack.com — bump the `?v=` number to bust the cache after updates.)

A short **tutorial** walks new pharaohs through the first quarry, the first
crew, and the whip.

## How to play

It's a simple, relaxing builder:

- **Build producers** — quarries, mines, farms and wells. Each one appears in
  the desert and produces its resource (Cookie-Clicker style).
- **Hire laborers** — every laborer is a worker who **actually walks a block up
  the ramp and sets it in place** (no teleporting bricks). More laborers and
  faster machines (sleds, cranes, ramps) = a faster build.
- **Click a worker to crack the whip** — they sprint and everyone builds faster
  for a few seconds. (No button — just tap the workers on the site.)
- **Limestone** is the building material; if you run short the game tells you to
  build more quarries.
- A real **desert world** grows around you: the **Nile** with docks and
  crocodiles, a **worker village & camps**, farms by the river, and every
  building you buy shown for real.
- Finish every layer to raise the **golden capstone**, then **found a New
  Dynasty** to keep your Legacy and build the next, greater wonder.

### Wonders (prestige ladder)
Step → Bent → Great → Golden → Black Obsidian → Floating Divine → and on,
forever, each bigger than the last.

### Controls
- **Tap / click a worker** — crack the whip. **Drag** to pan, **scroll / pinch** to zoom.
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
src/
  main.js           # bootstrap, fixed-timestep loop, input wiring
  data.js           # ALL balance numbers & content
  state.js          # game state model + cost/cap helpers
  sim.js            # simulation tick, the build chain, actions, prestige
  render.js         # isometric Canvas2D renderer (cached layers + live scene)
  sprites.js        # procedurally animated workers + animals (ox/elephant/croc)
  iso.js            # isometric projection & pyramid geometry
  audio.js          # procedural Web Audio SFX + generative ambient music
  ui.js             # DOM HUD / build menus / modals
  icons.js, rng.js, format.js
design/             # plan.md, thresholds.md, assets.csv
tools/              # make_card_art.py (deploy art), test_sim.mjs, smoke.mjs, closeup.mjs
```

## Tech notes

- **Pure vanilla** — no frameworks or runtime dependencies; renders on one
  `<canvas>` with a DOM HUD overlaid.
- **Animated crews & animals** are fully procedural (sine-driven walk cycles,
  leg gaits, carried blocks) — no sprite sheets.
- **Cinematic rendering:** directional lighting and ambient occlusion on every
  block, a cast shadow under the pyramid, layered sky with sun bloom + horizon
  glow + drifting clouds, atmospheric haze, a grain-textured ground, and a
  full-frame film-grain + vignette post pass. The cached pyramid renders at
  device resolution so it stays crisp.
- **Performance:** completed pyramid layers are cached to an offscreen canvas
  (one blit/frame); only the active layer, capstone, workers, animals, weather
  and tint redraw. Sprites/particles are pooled and capped; DPR capped at 1.5.
  Fixed-timestep sim with a seeded RNG; logic separate from rendering.
- **Responsive & accessible:** touch / mouse / keyboard (physical key codes) /
  gamepad are all first-class; the layout reflows for phones.
- **Art & audio:** the workspace was out of generation credits, so all art is
  hand-crafted procedural Canvas2D in one committed style and all sound is
  synthesized at runtime with the Web Audio API.

## Testing

```bash
node tools/test_sim.mjs          # headless core-simulation tests
# browser smoke test (needs a Chromium for Playwright):
python3 -m http.server 8099 &
PW_PATH="$(npm root -g)/playwright" node tools/smoke.mjs
```
