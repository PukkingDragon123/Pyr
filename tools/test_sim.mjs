// Headless logic test for the simplified build-rate simulation (no DOM).
import { newGame, costFor, capsFor } from "../src/state.js";
import {
  step, computeStats, buyBuilding, buyWorker, buyBlessing,
  doPrestige, legacyGain, simulateOffline, isUnlocked, whip, harvestNode,
  placeBuilding, placeReason, upgradeBuilding, buildingTier, canUpgrade,
} from "../src/sim.js";
import { wonderGeom, blocksForLayer, wonderFor, FIRST_WONDER_TOTAL, BUILDINGS, WORKERS, genNodes } from "../src/data.js";
import { fmt, fmtTime } from "../src/format.js";
import { pyramidBounds } from "../src/iso.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fails++; } else console.log("  ✓ " + m); };
const finite = (o) => Object.values(o).every((v) => Number.isFinite(v));

console.log("format:", fmt(0), fmt(1234), fmt(3.2e9), fmt(1e21), "|", fmtTime(125), fmtTime(7300));

const s = newGame();
ok(finite(s.res), "fresh resources finite");
ok((s.buildings.quarry || 0) === 0 && (s.workers.laborer || 0) === 0, "starts from absolute zero (nothing prebuilt)");
ok(s.whip && s.quests, "whip + quests state present");

// simulate ~20 min, buying greedily
for (let t = 0; t < 1200; t++) {
  step(s, 1);
  if (t % 5 === 0) { for (let i = 0; i < 3; i++) buyWorker(s, "laborer"); for (const w of WORKERS) if (isUnlocked(s, w)) buyWorker(s, w.id); for (const b of BUILDINGS) if (isUnlocked(s, b)) buyBuilding(s, b.id); }
}
const st = computeStats(s);
console.log("after 20min: blocks=", fmt(s.stats.totalBlocksAllTime), "layer=", s.layer, "builders=", fmt(st.builders), "buildRate=", fmt(st.buildRate), "weather=", s.weather.id);
ok(finite(s.res), "resources finite after long run");
ok(st.builders > 3 && Number.isFinite(st.buildRate) && st.buildRate > 0, "builders & buildRate grow");
ok(s.stats.totalBlocksAllTime > 0, "blocks placed by build rate");
ok(finite(st.prod) && finite(st.caps), "prod & caps finite");

// whip boosts build rate
const base = computeStats(s).buildRate;
whip(s);
ok(computeStats(s).buildRate > base * 1.5, "whip boosts build rate: " + fmt(base) + " -> " + fmt(computeStats(s).buildRate));

// procedural resource map + tap-to-harvest
const nodes = genNodes(12345, wonderGeom(0).base);
ok(nodes.length > 10 && nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.z) && n.res), "genNodes returns a finite node map: " + nodes.length);
ok(JSON.stringify(genNodes(12345, wonderGeom(0).base)) === JSON.stringify(nodes), "genNodes deterministic for a seed");
const sh = newGame();
const woodBefore = sh.res.wood, got = harvestNode(sh, "wood", 1);
ok(got.amount > 0 && Math.abs(sh.res.wood - (woodBefore + got.amount)) < 1e-6, "harvestNode grants resource: +" + got.amount + " wood");
sh.res.granite = capsFor(sh).granite; // already at cap → harvest must not overfill
ok(harvestNode(sh, "granite", 1).amount === 0 && sh.res.granite <= capsFor(sh).granite + 1, "harvestNode respects cap (no overfill)");

// tile-grid placement + adjacency requirements
const sp = newGame();
ok(Array.isArray(sp.placements) && sp.placements.length === 0, "no tiles placed at zero start: " + sp.placements.length);
sp.res.limestone += 5000; sp.res.wood += 5000; sp.res.food += 5000;
ok(placeReason(sp, "farm", 8, 10) === "adjacency", "farm blocked with no water adjacent: " + placeReason(sp, "farm", 8, 10));
ok(placeBuilding(sp, "well", 8, 10), "well placed on an empty tile");
ok(placeBuilding(sp, "farm", 7, 10), "farm places next to the well");
ok(!placeBuilding(sp, "well", 8, 10), "cannot stack on an occupied tile");
ok(sp.buildings.farm >= 1 && sp.buildings.well >= 1, "placement increments building counts");

// upgrade tiers raise output
const su = newGame(); su.res.limestone = 1e6; su.res.wood = 1e6;
placeBuilding(su, "quarry", 8, 10);
const t1 = computeStats(su).prod.limestone;
ok(buildingTier(su, "quarry") === 1 && canUpgrade(su, "quarry"), "quarry starts at tier 1, upgradable");
ok(upgradeBuilding(su, "quarry"), "quarry upgrades to tier 2");
ok(buildingTier(su, "quarry") === 2, "tier advanced");
ok(computeStats(su).prod.limestone > t1 * 1.8, "tier 2 boosts output: " + fmt(t1) + " -> " + fmt(computeStats(su).prod.limestone));

// cost scaling
const c1 = costFor(BUILDINGS[0], 0, 1), c10 = costFor(BUILDINGS[0], 0, 10);
ok(c10.limestone > c1.limestone * 9, "bulk cost scaling works");
ok(capsFor(s).limestone >= 8000, "caps present");

// completion + prestige on a fresh state (drive by build rate)
const sc = newGame();
const g = wonderGeom(sc.wonderIndex);
sc.res.limestone = 1e9; sc.workers.laborer = 50; // lots of builders → fast
sc.layer = g.layers - 1; sc.blocksInLayer = blocksForLayer(sc.wonderIndex, sc.layer) - 1; sc._fx = [];
for (let t = 0; t < 30 && !sc.complete; t++) step(sc, 1);
ok(sc.complete === true, "wonder completes via build rate");
ok(sc._fx.some((f) => f.type === "complete"), "complete fx fired");
const gain = legacyGain(sc);
ok(gain >= 1, "legacy gain >= 1: " + gain);
const beforeDyn = sc.stats.dynasties;
ok(doPrestige(sc), "prestige succeeds");
ok(sc.wonderIndex === 1 && sc.stats.dynasties === beforeDyn + 1, "advanced to next wonder");
ok(sc.complete === false && sc.layer === 0, "new dynasty reset");
ok(wonderFor(7).name.length > 0, "procedural wonder beyond list");

// offline
const s2 = newGame();
for (const id of ["quarry", "quarry", "well", "farm"]) buyBuilding(s2, id);
for (let t = 0; t < 60; t++) step(s2, 1);
const off = simulateOffline(s2, 3600);
ok(off && off.blocks >= 0 && finite(off.gained), "offline credit: +" + fmt(off.blocks) + " blocks");

// iso bounds + late-wonder scale
const b = pyramidBounds(14, 7, 40);
ok(b.maxX > b.minX && b.maxY > b.minY, "pyramid bounds positive");
ok(blocksForLayer(5, 0) > 1e6, "late wonder needs millions/layer: " + fmt(blocksForLayer(5, 0)));

console.log(fails === 0 ? "\nALL TESTS PASSED" : `\n${fails} TEST(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
