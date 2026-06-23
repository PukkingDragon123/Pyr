# Build the Pyramid — Frozen numbers & budgets

These are the agency metrics and balance constants frozen before content.
All live in `game/src/data.js` (balance as data, §9.5). Tunable one change at a
time; never softened in the same iteration that failed against them.

## Performance budget (weakest platform = mid phone)
- Target **≥ 60 fps** at a 390×844 viewport; frame budget ≤ 16.6 ms.
- `devicePixelRatio` capped at **1.5**.
- Completed pyramid layers cached to an offscreen canvas (one blit/frame).
- Max live worker sprites rendered: **120** (rest abstracted into the count).
- Max weather particles: **220**, pooled; zero per-frame allocations in hot path.
- Pause simulation+render on blur/hidden tab.

## Simulation
- Fixed timestep **1/60 s**; economy expressed as per-second rates accumulated
  by dt. Seeded RNG (mulberry32) for weather/disaster determinism.
- Autosave every **10 s** and on visibility-hidden.
- Offline progress capped at **12 h**, credited at last known rates × 0.5.

## Economy core
- Resources: limestone, granite, wood, copper, food, water (+ derived `blocks`,
  + meta `legacy`).
- Building cost scaling: `cost = base × 1.15^owned` (classic incremental curve).
- Starting state: 60 limestone, 25 wood, 20 food, 20 water, 1 quarry, 1 well,
  1 farm, 3 laborers.
- **Click power:** base **1** block/tap (×2 per click upgrade; ×Legacy).
- **limestonePerBlock:** 5 (reduced by stone cutters / Legacy).

## Chain rates (blocks/second), effective = min(Supply, Transport, Placement)
- Supply = limestone income ÷ limestonePerBlock.
- Transport = Σ machine capacity (rollers .5, winch 1.2, sled 3, crane 9,
  lubrication 22, ramp 55, elevator 140, marvel 380) × engineer/Legacy bonus.
- Placement = laborers × 0.6 × overseer speed × Legacy, + clicking.
- Global multiplier = weatherFactor × eventFactor × morale.

## Pyramid geometry & completion
- Wonder `k`: base side `B = 14 + 4k`, layers = `B/2`, layer `j` footprint side
  `B − 2j` (cubes = side²), `blocksPerCube = round(1 × 6^k)`.
- `blocksForLayer(j) = cubes(j) × blocksPerCube`.
- Completing all layers → **capstone ceremony** → wonder complete → New Dynasty.

## Prestige (New Dynasty)
- Awarded Legacy ≈ `floor( 12 × (totalBlocksThisDynasty / firstWonderTotal)^0.6
  × (k+1) )`, minimum scales with wonder tier.
- Blessings (permanent, cost Legacy, ×1.6 per level): Strong Backs (+placement),
  Master Masons (−limestone/block), Divine Engineering (+transport),
  Fertile Nile (+food/water), Royal Treasury (+start resources & caps),
  Eternal Favor (−disaster chance), Sun Blessing (+click).

## Weather (multipliers, ~70–120 s each, forecast next shown)
- Clear ×1.0; Sandstorm placement ×0.6; Extreme Heat water-use ×2 (penalty if
  water=0); Nile Flood food/water ×1.8, transport ×0.7; Rain transport ×0.5,
  ramp-collapse chance ×3.

## Disasters (Poisson-ish per-minute base chance, reduced by mitigation)
- Strike (food/water low), Ramp Collapse (transport halt ~20 s), Tomb Robbers
  (steal 8–20% of a stored resource), Pharaoh's Death (global ×0.5 until crowned),
  Sacred Plague (−25% workers for ~60 s). Priests/temples/overseers cut chance
  & severity; Eternal Favor blessing reduces base chance.

## Input tolerances
- Tap registered on pointerdown; rapid-tap uncapped but each consumes supply.
- Buy buttons support hold-to-repeat and ×1/×10/×Max quantity modes.
