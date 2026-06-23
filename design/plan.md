# Build the Pyramid — Design Plan

## Experience formula
The player feels the awe of a god-king watching an impossible monument rise,
because the game constantly turns every tap and every worker into another
stone placed on a pyramid that visibly grows toward the heavens.

## Profile
- **Time:** real-time, idle (runs while away → offline progress).
- **Space:** isometric 3/4 view; the pyramid is a real spatial structure built
  block by block (not a progress bar).
- **Agency:** disembodied hand — you are the Pharaoh directing the megaproject.
- **Conflict:** vs system (scarcity, transport bottlenecks, weather, disasters).
- **Content:** emergent (production chains) + procedural (weather/disaster RNG).
- **Outcome:** endless ladder of ever-greater wonders via prestige.
- **Players:** solo (no multiplayer reference needed).
- **Session:** minutes to hours; rewards returning.
- **Engagement:** accumulation (primary) + execution (clicking).

## Core loop
Gather (quarries/mines/farms/wells → 6 resources) → Convert & Transport
(limestone → dressed blocks → sled/ramp/crane/elevator capacity) → Build
(place blocks on the pyramid, by tap or automation) → Expand (hire crew, build
machines, grow a support city) → Survive (weather + disasters) → Complete the
wonder (golden capstone ceremony) → **New Dynasty** (prestige: reset, keep
Legacy, advance to a greater wonder).

The three-stage chain — **Supply** (limestone/s), **Transport** (blocks/s),
**Placement** (blocks/s) — exposes its bottleneck: effective build rate is the
*minimum* of the three, so a lagging stage stalls construction (brief's
"if any step slows down, the entire construction stalls").

## Verbs
- **TAP** the pyramid → place blocks now (click phase) + juice.
- **HIRE** crew (laborer, stone cutter, engineer, architect, priest, overseer).
- **BUILD** machines (rollers→winches→sleds→cranes→lubrication→ramps→elevators→marvels)
  and city buildings (villages, farms, markets, temples, docks, storage yards).
- **MANAGE** events (feed strikers, repair ramps, crown a successor…).
- **PRESTIGE** — New Dynasty into the next wonder, spending Legacy Points on
  permanent blessings.

## Wonders (prestige ladder)
Step → Bent → Great → Golden → Black Obsidian → Floating Divine → (procedural
beyond). Each is larger (bigger base, more blocks/cube) so totals climb toward
the "billions of blocks" fantasy via Legacy multipliers + big-number formatting.

## Systems
- **Weather:** Clear, Sandstorm (−speed, haze), Extreme Heat (+water use),
  Nile Flood (+farms, −transport), Rain (−sleds, ramp-collapse risk). Forecast shown.
- **Disasters:** Worker Strike, Ramp Collapse, Tomb Robbers, Pharaoh's Death,
  Sacred Plague. RNG-timed; priests/overseers/temples reduce odds & severity.
- **Day/night:** continuous light tint + sky; atmosphere.
- **Prestige:** complete a wonder → Legacy Points → permanent blessings
  (faster workers, better machines, stronger economy, larger starting city).
- **Offline progress:** simulate last rates up to a cap; "while you were away".

## Walkthrough decisions
1. **Representation:** isometric scene (canvas) + DOM HUD panels; the limiting
   chain stage is always highlighted; rates and next goal always visible.
2. **Input:** click/tap pyramid to place; buttons for everything else; keyboard
   shortcuts via physical `event.code`; gamepad poll; touch-first, no hover-only.
3. **Agency metrics frozen** (see `thresholds.md`).
4. **Resistance×verb:** shortage→hire/build; bottleneck→machines; weather/
   disaster→crew & city mitigation.
5. **Peaks:** layer completions; the golden-capstone ceremony per wonder.
6. **Rewards:** new crew/machines (new automation = new verb); new wonder on prestige.
7. **Interface:** resource bar, build tabs, chain panel, event log, prestige screen.
8. **Economy:** every resource has sources (buildings/crew) and sinks (blocks,
   upkeep food+water, machine/building costs, robbers).
9. **Delivery:** one new system at a time via progress-gated unlocks.
10. **Entry:** launch → pyramid + "tap to lay a stone" → first block in seconds;
    on return, current goal + next step on screen; offline summary.

## Rendering & performance
Custom isometric Canvas2D. Completed pyramid layers are cached to an offscreen
canvas (drawn once); only the active top layers, workers, weather particles and
day/night tint redraw per frame. Workers and particles are pooled and capped
(>50 same-type → batched draw, not one call each). Fixed-timestep sim, seeded
RNG, logic separate from render. Target ≥60 fps at a phone viewport.

## Assets
No AI generation (workspace out of credits): all art is procedural Canvas2D in
the committed style; all audio is synthesized with the Web Audio API; deploy
thumbnail/favicon are rendered programmatically (Pillow) in the same style.
See `assets.csv`.
