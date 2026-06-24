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

**https://raw.githack.com/PukkingDragon123/Pyr/claude/lucid-pascal-6yhhh1/index.html?v=3**

(Served straight from this branch via raw.githack.com — bump the `?v=` number to bust the cache after updates.)

A short **tutorial** walks new pharaohs through the first stones, the first
quarry, the first crew, and the whip.

## How to play

- **Tap the pyramid** to lay stone by hand (the click phase).
- **Crack the whip** (button, bottom-center) for a quick speed surge — your
  overseer drives the gangs and everyone races for a few seconds.
- Watch a **living crew**: workers walk up the ramp hauling blocks, **bend down
  to set them**, walk back, and rest between loads, kicking up sand as they go;
  oxen, elephants and crocodiles roam the site.
- Build **quarries, farms and wells** for the six resources, and hire **crews**
  to haul and set blocks automatically (the idle phase).
- Construction runs at the **slowest of Supply, Transport and Placement** — the
  panel shows the bottleneck, and fixing it speeds everything up.
- Crews eat food and drink water; weather (sandstorm, heat, the **Nile flood**,
  rain) and the occasional disaster ripple the work — **priests, temples and
  overseers** keep them mild. (Tuned gentle, so it stays relaxing.)
- Finish every layer to raise the **golden capstone**, then **found a New
  Dynasty** to keep your Legacy and build the next, greater wonder.

### Wonders (prestige ladder)
Step → Bent → Great → Golden → Black Obsidian → Floating Divine → and on,
forever, each bigger than the last.

### Controls
- **Tap / click** the pyramid — lay stone. **Drag** to pan, **scroll / pinch** to zoom.
- **Space / Enter** — lay stone. **M** — mute. **+ / −** — zoom. **Esc** — close dialogs.
- **Gamepad** — A button lays stone. Progress **auto-saves** and continues **while you're away**.

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
