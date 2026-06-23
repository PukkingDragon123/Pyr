// Headless logic test for the core simulation (no DOM).
import { newGame, costFor, capsFor } from "../game/src/state.js";
import {
  step, tapPlace, computeStats, buyBuilding, buyWorker, buyBlessing,
  doPrestige, legacyGain, simulateOffline, isUnlocked,
} from "../game/src/sim.js";
import { wonderGeom, blocksForLayer, wonderFor, FIRST_WONDER_TOTAL, BUILDINGS, WORKERS } from "../game/src/data.js";
import { fmt, fmtTime } from "../game/src/format.js";
import { pyramidBounds } from "../game/src/iso.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fails++; } else console.log("  ✓ " + m); };
const finite = (o) => Object.values(o).every((v) => Number.isFinite(v));

console.log("format:", fmt(0), fmt(9.4), fmt(1234), fmt(1.5e6), fmt(3.2e9), fmt(1e15), fmt(1e21), "|", fmtTime(5), fmtTime(125), fmtTime(7300));

const s = newGame();
ok(finite(s.res), "fresh resources finite");
ok(s.buildings.quarry === 1 && s.workers.laborer === 3, "starter buildings/workers present");

// simulate 25 minutes at 1s steps, buying greedily
for (let t = 0; t < 1500; t++) {
  step(s, 1);
  if (t % 6 === 0) {
    for (const b of BUILDINGS) if (isUnlocked(s, b)) buyBuilding(s, b.id);
    for (const w of WORKERS) if (isUnlocked(s, w)) buyWorker(s, w.id);
  }
  for (let k = 0; k < 5; k++) tapPlace(s);
}
console.log("after 25min: blocks=", fmt(s.stats.totalBlocksAllTime), "layer=", s.layer, "morale=", Math.round(s.morale),
  "lime=", fmt(s.res.limestone), "weather=", s.weather.id);
ok(finite(s.res) && Number.isFinite(s.morale), "all values finite after long run");
ok(s.stats.totalBlocksAllTime > 0, "blocks were placed");
ok(s.morale >= 0 && s.morale <= 130, "morale in range");
const st = computeStats(s);
ok(finite(st.prod) && Number.isFinite(st.transport) && Number.isFinite(st.placement), "computeStats finite");
ok(["supply", "transport", "placement", "balanced"].includes(st.bottleneck), "bottleneck label valid: " + st.bottleneck);

// cost growth sanity
const c1 = costFor(BUILDINGS[0], 0, 1), c10 = costFor(BUILDINGS[0], 0, 10);
ok(c10.limestone > c1.limestone * 9, "bulk cost > unit*qty (scaling works)");

// caps
const caps = capsFor(s);
ok(caps.limestone >= 6000, "caps present");

// completion + prestige on a fresh state
const sc = newGame();
const g = wonderGeom(sc.wonderIndex);
sc.layer = g.layers - 1; sc.blocksInLayer = blocksForLayer(sc.wonderIndex, sc.layer) - 1;
sc.res.limestone = 1e9; sc._fx = [];
tapPlace(sc);
ok(sc.complete === true, "wonder completes when last layer filled");
ok(sc._fx.some((f) => f.type === "complete"), "complete fx fired");
const gain = legacyGain(sc);
ok(gain >= 1, "legacy gain >= 1: " + gain);
const beforeDyn = sc.stats.dynasties;
ok(doPrestige(sc), "prestige succeeds when complete");
ok(sc.wonderIndex === 1 && sc.stats.dynasties === beforeDyn + 1, "advanced to next wonder");
ok(sc.legacy >= gain, "legacy credited");
ok(sc.complete === false && sc.layer === 0, "new dynasty reset");
ok(wonderFor(7).name.length > 0, "procedural wonder name beyond list");

// offline
const s2 = newGame();
for (const id of ["quarry", "quarry", "well", "farm"]) buyBuilding(s2, id);
for (let t = 0; t < 60; t++) step(s2, 1);
const off = simulateOffline(s2, 3600);
ok(off && off.blocks >= 0 && finite(off.gained), "offline credit computed: +" + fmt(off.blocks) + " blocks");

// iso bounds sane
const b = pyramidBounds(14, 7, 40);
ok(b.maxX > b.minX && b.maxY > b.minY, "pyramid bounds positive");

// big-dynasty number explosion (millions/billions fantasy)
const s3 = newGame(); s3.wonderIndex = 5;
ok(blocksForLayer(5, 0) > 1e6, "late wonder needs millions of blocks/layer: " + fmt(blocksForLayer(5, 0)));

console.log(fails === 0 ? "\nALL TESTS PASSED" : `\n${fails} TEST(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
