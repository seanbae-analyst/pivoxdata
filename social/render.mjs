// render.mjs — screenshots each 1080×1350 slide of social/cards.html into social/out/<slot>/NN.png.
// Those files are committed and served by the site, because the Instagram API takes images by public URL.
//
// Usage: node social/render.mjs   (after social/build.mjs)
// Chromium: GitHub Actions installs it with `npx playwright install --with-deps chromium`; elsewhere set
// CHROMIUM_PATH to an existing binary.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { ROOT, OUT, read } from "./util.mjs";
import { isSlot } from "./slot.mjs";

if (read(path.join(ROOT, "social", "plan.json"))?.post === false) { console.log("social/plan.json says no draft today — nothing to render"); process.exit(0); }
const page = path.join(ROOT, "social", "cards.html");
// the post's folder, as build.mjs wrote it into the page (slot.mjs: <date> or <date>-<n>)
const date = fs.readFileSync(page, "utf8").match(/data-date="([^"]*)"/)?.[1];
if (!isSlot(date)) throw new Error(`social/cards.html: data-date "${date}" is not a post folder (YYYY-MM-DD or YYYY-MM-DD-N)`);
const dir = path.join(OUT, date);
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const p = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(page).href, { waitUntil: "networkidle" });
  await p.evaluate(async () => { await document.fonts.ready; window.fit?.(); });
  const slides = await p.locator(".slide").all();
  const files = [];
  for (const [i, s] of slides.entries()) {
    const f = `${String(i + 1).padStart(2, "0")}.png`;
    await s.screenshot({ path: path.join(dir, f) });
    files.push(f);
  }
  // a stale slide from an earlier render of the same week must not ride along
  for (const f of fs.readdirSync(dir)) if (/^\d+\.png$/.test(f) && !files.includes(f)) fs.rmSync(path.join(dir, f));
  console.log(`rendered ${files.length} slides → social/out/${date}/`);
} finally {
  await browser.close();
}
