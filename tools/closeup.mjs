import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
import { newGame } from "../src/state.js";
import { buyBuilding } from "../src/sim.js";
import { blocksForLayer } from "../src/data.js";

function showcase() {
  const s = newGame();
  s.stats.totalBlocksAllTime = 700; s.stats.totalBlocksThisDynasty = 700;
  s.res.limestone = 3000; s.res.wood = 5e4; s.res.granite = 8e3; s.res.copper = 8e3; s.res.food = 4e3; s.res.water = 4e3;
  for (let i = 0; i < 14; i++) buyBuilding(s, "quarry");
  for (const id of ["well", "farm", "lumber_camp", "granite_mine", "copper_mine"]) for (let i = 0; i < 4; i++) buyBuilding(s, id);
  for (let i = 0; i < 3; i++) buyBuilding(s, "wooden_rollers"); // low transport → slow build, no completion mid-shot
  for (const id of ["village", "granary", "storage_yard", "docks", "temple", "market"]) for (let i = 0; i < 4; i++) buyBuilding(s, id);
  s.workers.laborer = 14; s.workers.mason = 4; s.workers.engineer = 2; // a busy crew
  s.layer = 1; s.blocksInLayer = Math.floor(blocksForLayer(0, 1) * 0.3); // mid-layer, slow (limestone-limited) so it won't finish mid-shot
  s.weather = { id: "flood", timeLeft: 90, nextId: "clear" }; // show flood + crocs
  s.tutorial = { step: 0, done: true };                       // don't cover the scene
  s.lastSaved = Date.now();
  return JSON.stringify(s);
}
const SAVE = showcase();
const SP = "/tmp/claude-0/-home-user-Pyr/ccb84bd0-96dd-5e04-8d22-3015a984d891/scratchpad/";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1120, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.addInitScript((sv) => localStorage.setItem("btp_save_v1", sv), SAVE);
await page.goto(process.env.BASE || "http://localhost:8099/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
{ const pb = await page.$(".menu-btn.play"); if (pb) { await pb.click(); await page.waitForTimeout(200); } }
// moderate zoom so the whole build + workers + animals stay framed and large
const box = await (await page.$("#c")).boundingBox();
for (let i = 0; i < 4; i++) { await page.mouse.move(box.width * 0.42, box.height * 0.5); await page.mouse.wheel(0, -260); await page.waitForTimeout(60); }
await page.waitForTimeout(700);
await page.screenshot({ path: SP + "shot_closeup.png", clip: { x: 30, y: 120, width: 720, height: 540 } });
console.log("closeup saved", errs.length ? "ERRORS:" + errs.join(";") : "no errors");
await browser.close();
