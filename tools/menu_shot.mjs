import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
const SP = "/tmp/claude-0/-home-user-Pyr/ccb84bd0-96dd-5e04-8d22-3015a984d891/scratchpad/";
const browser = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const errs=[];
// desktop menu
let page = await (await browser.newContext({ viewport:{width:1100,height:760} })).newPage();
page.on("pageerror",e=>errs.push(e.message));
await page.goto("http://localhost:8099/",{waitUntil:"networkidle"});
await page.waitForTimeout(1200);
await page.screenshot({ path: SP+"menu_desktop.png" });
// open credits
const cr = await page.$("button.menu-btn:nth-of-type(3)"); 
// click the Credits button by text
for (const b of await page.$$(".menu-btn")) { const t=await b.innerText(); if (/credit/i.test(t)) { await b.click(); break; } }
await page.waitForTimeout(300);
await page.screenshot({ path: SP+"menu_credits.png" });
// mobile menu
let m = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })).newPage();
m.on("pageerror",e=>errs.push(e.message));
await m.goto("http://localhost:8099/",{waitUntil:"networkidle"});
await m.waitForTimeout(1200);
await m.screenshot({ path: SP+"menu_mobile.png" });
console.log("menu shots saved", errs.length?("ERRORS:"+errs.join(";")):"no errors");
await browser.close();
