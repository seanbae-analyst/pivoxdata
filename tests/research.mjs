// tests/research.mjs — the research pages checked the way a reader uses them (2026-10-27): the search and the two
// filters, the back button, every old link, reading without signing in, the topic pages and the indicators they link to,
// on a desktop and a phone; that the sources of every piece are still on its page; and that one new piece shows up in
// every list at once (built in a copy of the repository, never here).
// Needs Playwright's Chromium (`npm ci && npx playwright install chromium`). Starts serve.mjs itself on a free port.
//
// Usage: node tests/research.mjs              all checks
//        node tests/research.mjs --shots DIR  also save screenshots of what it checked into DIR
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)("playwright");
const SHOTS = (() => { const i = process.argv.indexOf("--shots"); return i > 0 ? path.resolve(process.argv[i + 1]) : null; })();
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0, passed = 0;
const ok = (name, cond, more = "") => { if (cond) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}${more ? ` — ${more}` : ""}`); } };
const section = (t) => console.log(`\n— ${t}`);
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const port = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
async function serve(root) {
  const p = await port(), child = spawn(process.execPath, [path.join(root, "serve.mjs")], { cwd: root, env: { ...process.env, PORT: String(p) }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${p}/`); return { base: `http://127.0.0.1:${p}`, stop: () => child.kill() }; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error("serve.mjs did not start");
}
// the public pieces as the site lists them (post.json → published), newest first
const pieces = fs.readdirSync(path.join(ROOT, "social", "out")).filter((s) => fs.existsSync(path.join(ROOT, "social", "out", s, "story.json")))
  .map((slot) => ({ slot, st: read(`social/out/${slot}/story.json`), post: read(`social/out/${slot}/post.json`) })).filter((b) => b.post?.published && b.st.article?.sections?.length);
// the list also carries the monthly roundups (social/roundups/*.json), as social/briefs.mjs does
const RU = path.join(ROOT, "social", "roundups"), listed = pieces.length + (fs.existsSync(RU) ? fs.readdirSync(RU).filter((f) => f.endsWith(".json") && read(`social/roundups/${f}`)?.article).length : 0);

const srv = await serve(ROOT), B = srv.base;
const browser = await chromium.launch();
const errors = [];
const context = async (phone) => {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  ctx.on("page", (pg) => pg.on("pageerror", (e) => errors.push(`${pg.url()}: ${e.message}`)));
  return ctx;
};
const shot = async (pg, name, full = false) => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full }); };
const visible = (pg) => pg.$$eval("ul.r-list .r-item", (l) => l.filter((li) => !li.hidden && li.isConnected).map((li) => li.id));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------- 1. the old links and every link on every page ----------
  section("기존 링크 · 페이지 안의 모든 링크");
  const legacy = ["/", "/briefs", "/briefs/", "/briefs/feed.xml", "/map", "/login", "/saved", "/privacy", "/terms", "/auth/callback", "/sitemap.xml", "/robots.txt",
    "/manifest.webmanifest", "/index.html", "/briefs/index.html", "/trends", "/research", "/research/anything", "/maps", "/maps/old", "/check", "/analysis", "/analysis-kr",
    ...pieces.map((b) => `/briefs/${b.slot}`), ...pieces.map((b) => `/briefs/${b.slot}.html`), ...pieces.map((b) => `/social/out/${b.slot}/${b.post.images[0]}`)];
  // every address the sitemap lists (the briefings, their formats and tags, the pages around signing in)
  const sitemap = [...fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  const bad = [];
  for (const u of [...new Set([...legacy, ...sitemap])]) { const r = await fetch(B + u, { redirect: "follow" }); if (r.status !== 200) bad.push(`${u} → ${r.status}`); }
  ok(`기존 주소 ${new Set([...legacy, ...sitemap]).size}개가 (넘겨주기 뒤) 200`, !bad.length, bad.join(", "));
  const redirected = await fetch(B + "/research/old-page", { redirect: "manual" });
  ok("/research/* 는 리서치 목록(/briefs)으로 넘겨준다", redirected.status === 308 && redirected.headers.get("location") === "/briefs", `${redirected.status} ${redirected.headers.get("location")}`);
  // every internal link in every page the site serves
  const html = fs.readdirSync(ROOT, { recursive: true }).map(String).filter((f) => f.endsWith(".html") && !/^(node_modules|social|supabase|tests|\.)/.test(f));
  const hrefs = new Set();
  for (const f of html) for (const m of fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/href="(\/[^"#?]*)/g)) hrefs.add(m[1]);
  const dead = [];
  for (const u of hrefs) { const r = await fetch(B + u, { redirect: "follow" }); if (r.status !== 200) dead.push(`${u} → ${r.status}`); }
  ok(`페이지 ${html.length}개 안의 내부 링크 ${hrefs.size}개가 모두 열린다`, !dead.length, dead.join(", "));

  // ---------- 2. sources: every piece still carries the links it was written from ----------
  section("본문 출처 URL");
  for (const b of pieces) {
    const page = fs.readFileSync(path.join(ROOT, "briefs", `${b.slot}.html`), "utf8");
    const links = [...new Set([...(b.st.sources ?? []).map((s) => s.link), ...b.st.article.sections.flatMap((x) => (x.sources ?? []).map((s) => s.link))])];
    const missing = links.filter((l) => !page.includes(`href="${l.replace(/&/g, "&amp;")}"`));
    ok(`${b.slot}: 출처 링크 ${links.length}개가 그대로 있다`, links.length > 0 && !missing.length, missing.join(", "));
  }

  // ---------- 3. the research list on a desktop: search, filters, the address, the back button ----------
  section("리서치 목록 (데스크톱) — 검색 · 필터 · 뒤로가기");
  {
    const ctx = await context(false), pg = await ctx.newPage();
    await pg.goto(B + "/briefs", { waitUntil: "networkidle" });
    const all = await visible(pg);
    ok(`목록에 공개된 리서치 ${listed}편이 모두 있다`, all.length === listed, `${all.length}`);
    ok("처음엔 '전체'가 눌려 있다", (await pg.$$eval('.f-o[data-v=""][aria-pressed="true"]', (l) => l.length)) === 2);
    await shot(pg, "list-desktop", true);
    // search
    const word = pieces[0].st.article.sections.find((x) => x.case)?.case.who ?? pieces[0].st.sources?.[0]?.source ?? "AI";
    await pg.fill('input[name="q"]', word); await pause(400);
    const hit = await visible(pg), url1 = new URL(pg.url());
    const matched = await pg.$$eval("ul.r-list .r-item:not([hidden])", (l, w) => l.every((li) => li.dataset.q.includes(w.toLowerCase())), word);
    ok(`검색 '${word}' → ${hit.length}편, 모두 그 말을 담는다`, hit.length > 0 && matched);
    ok("검색어가 주소에 남는다 (?q=)", url1.searchParams.get("q") === word, pg.url());
    ok("찾은 수를 말한다", /찾음/.test(await pg.textContent(".f-count .c")));
    await shot(pg, "list-desktop-search");
    // a search that finds nothing, then 조건 지우기
    await pg.fill('input[name="q"]', "없는말zzz"); await pause(400);
    ok("없는 말 → 빈 목록 안내가 보인다", (await visible(pg)).length === 0 && await pg.isVisible(".r-empty"));
    await shot(pg, "list-desktop-empty");
    await pg.click(".r-empty .f-reset"); await pause(100);
    ok("조건 지우기 → 전체 목록, 주소도 깨끗", (await visible(pg)).length === listed && !new URL(pg.url()).search);
    // topic filter
    const topic = await pg.$eval('.f-o[data-f="topic"]:not([data-v=""])', (b) => ({ v: b.dataset.v, n: +b.querySelector(".n").textContent }));
    await pg.click(`.f-o[data-f="topic"][data-v="${topic.v}"]`); await pause(100);
    const t = await visible(pg), tOk = await pg.$$eval("ul.r-list .r-item:not([hidden])", (l, v) => l.every((li) => li.dataset.topics.split(" ").includes(v)), topic.v);
    ok(`주제 '${topic.v}' → ${t.length}편 (버튼이 말한 ${topic.n}편과 같다)`, t.length === topic.n && tOk);
    ok("주제가 주소에 남고 버튼이 눌린 상태", new URL(pg.url()).searchParams.get("topic") === topic.v && (await pg.getAttribute(`.f-o[data-v="${topic.v}"]`, "aria-pressed")) === "true");
    // format filter on top of it — two filters kept apart
    const format = await pg.$eval('.f-o[data-f="format"]:not([data-v=""])', (b) => b.dataset.v);
    await pg.click(`.f-o[data-f="format"][data-v="${format}"]`); await pause(100);
    const tf = await pg.$$eval("ul.r-list .r-item:not([hidden])", (l, [v, f]) => l.length > 0 && l.every((li) => li.dataset.topics.split(" ").includes(v) && li.dataset.format === f), [topic.v, format]);
    ok("주제와 형식을 함께 고르면 둘 다 맞는 것만", tf && new URL(pg.url()).searchParams.get("format") === format);
    await pg.click(`.f-o[data-f="topic"][data-v="${topic.v}"]`); await pause(100);
    ok("눌린 주제를 다시 누르면 풀린다 (형식은 그대로)", !new URL(pg.url()).searchParams.get("topic") && new URL(pg.url()).searchParams.get("format") === format);
    // back from a piece: the same list
    await pg.click(`.f-o[data-f="topic"][data-v="${topic.v}"]`); await pg.fill('input[name="q"]', word); await pause(400);
    const before = { url: pg.url(), items: await visible(pg) };
    await Promise.all([pg.waitForNavigation(), pg.click("ul.r-list .r-item:not([hidden]) .r-card")]);
    ok("목록에서 글로 들어간다", /\/briefs\/\d{4}-\d{2}-\d{2}/.test(new URL(pg.url()).pathname) && await pg.isVisible("article.brief h1"));
    await pg.goBack({ waitUntil: "networkidle" }); await pause(200);
    ok("뒤로가기 → 같은 주소(검색어 · 주제 · 형식)", pg.url() === before.url, `${pg.url()} vs ${before.url}`);
    ok("뒤로가기 → 같은 목록과 같은 검색어", JSON.stringify(await visible(pg)) === JSON.stringify(before.items) && (await pg.inputValue('input[name="q"]')) === word);
    // an address that names the filters opens filtered; one with a typo shows everything
    await pg.goto(`${B}/briefs?topic=${topic.v}`, { waitUntil: "networkidle" });
    ok("?topic= 로 연 주소는 걸러진 목록", (await visible(pg)).length === topic.n);
    await pg.goto(`${B}/briefs?topic=nope&format=nope`, { waitUntil: "networkidle" });
    ok("모르는 값(?topic=nope)은 전체를 보인다", (await visible(pg)).length === listed);
    // the pictures load once scrolled to
    await pg.goto(B + "/briefs", { waitUntil: "networkidle" });
    for (const img of await pg.$$("img.r-th")) await img.scrollIntoViewIfNeeded();
    await pause(500);
    const pics = await pg.$$eval("img.r-th", (l) => l.map((i) => i.naturalWidth));
    ok(`썸네일 ${pics.length}장이 모두 열린다`, pics.length > 0 && pics.every((w) => w > 0), pics.join(","));
    await ctx.close();
  }

  // ---------- 4. the research list on a phone (pages turned sideways) ----------
  section("리서치 목록 (폰) — 검색 · 필터 · 뒤로가기");
  {
    const ctx = await context(true), pg = await ctx.newPage();
    await pg.goto(B + "/briefs", { waitUntil: "networkidle" });
    await pg.waitForSelector("html.pgr-ready");
    const inTrack = () => pg.$$eval(".pgr-track .r-item", (l) => l.map((li) => li.id));
    ok("폰은 페이지로 넘기는 화면, 첫 장에 검색창", await pg.isVisible(".pgr-track .pg:first-child input[name=q]"));
    ok(`${listed}편이 모두 페이지에 놓인다`, (await inTrack()).length === listed);
    await shot(pg, "list-phone");
    const word = pieces[0].st.sources?.[0]?.source ?? "AI";
    await pg.tap('input[name="q"]'); await pg.keyboard.type(word, { delay: 30 }); await pause(500);
    const focused = await pg.evaluate(() => document.activeElement?.name === "q" && document.activeElement.value);
    ok("검색하는 동안 입력창이 포커스를 잃지 않는다 (페이지를 다시 놓아도)", focused === word, String(focused));
    const after = await inTrack();
    ok(`검색 '${word}' → 페이지에 맞는 것만 (${after.length}편)`, after.length > 0 && after.length <= listed);
    await shot(pg, "list-phone-search");
    await pg.fill('input[name="q"]', ""); await pause(400);
    const topic = await pg.$eval('.pgr-track .f-o[data-f="topic"]:not([data-v=""])', (b) => ({ v: b.dataset.v, n: +b.querySelector(".n").textContent }));
    await pg.tap(`.pgr-track .f-o[data-v="${topic.v}"]`); await pause(300);
    ok(`주제 '${topic.v}' → 페이지에 ${topic.n}편`, (await inTrack()).length === topic.n);
    const before = pg.url();
    // the list starts on the second page (the first is the search and the filters): turn to it, then open a piece
    await pg.evaluate(() => { const t = document.querySelector(".pgr-track"); t.scrollTo({ left: t.clientWidth, behavior: "instant" }); }); await pause(400);
    ok("폰: 옆으로 넘기면 목록", await pg.isVisible(".pgr-track .r-item .r-card"));
    await shot(pg, "list-phone-page2");
    await Promise.all([pg.waitForNavigation(), pg.tap(".pgr-track .r-item:not([hidden]) .r-card")]);
    ok("폰: 글로 들어간다", await pg.isVisible("article.brief h1, .pgr-track h1"));
    await shot(pg, "detail-phone");
    await pg.goBack({ waitUntil: "networkidle" }); await pg.waitForSelector("html.pgr-ready"); await pause(300);
    const back = new URL(pg.url());
    ok("폰: 뒤로가기 → 같은 주소(필터)와 같은 목록", back.pathname + back.search === new URL(before).pathname + new URL(before).search && (await inTrack()).length === topic.n, `${pg.url()} vs ${before}`);
    // Korean typed on a phone keyboard: each syllable is composed (IME) — the box keeps it whole, and keeps the focus
    await pg.goto(B + "/briefs", { waitUntil: "networkidle" }); await pg.waitForSelector("html.pgr-ready");
    const cdp = await ctx.newCDPSession(pg);
    await pg.tap('input[name="q"]');
    for (const [jamo, syl] of [["ㄱ", "거"], ["ㅂ", "버"]]) {
      await cdp.send("Input.imeSetComposition", { text: jamo, selectionStart: 1, selectionEnd: 1 }); await pause(400);
      await cdp.send("Input.imeSetComposition", { text: syl, selectionStart: 1, selectionEnd: 1 }); await pause(400);
      await cdp.send("Input.insertText", { text: syl }); await pause(400);
    }
    const ime = await pg.evaluate(() => ({ v: document.querySelector('input[name="q"]').value, focus: document.activeElement?.name }));
    ok("폰: 한글을 조합해 쳐도 글자가 깨지지 않고 포커스가 남는다 ('거버')", ime.v === "거버" && ime.focus === "q", JSON.stringify(ime));
    await pg.evaluate(() => document.activeElement.blur()); await pause(300);
    const kept = await inTrack(), expect = await pg.$$eval(".r-item", (l) => l.filter((li) => li.dataset.q.includes("거버")).map((li) => li.id));
    ok(`폰: 입력이 끝나면 '거버'를 담은 ${expect.length}편만 페이지에`, expect.length > 0 && JSON.stringify(kept.sort()) === JSON.stringify(expect.sort()));
    // a facet pressed from the keyboard keeps the focus when the pages are laid out again
    await pg.focus('.pgr-track .f-o[data-f="format"]:not([data-v=""])'); await pg.keyboard.press("Enter"); await pause(300);
    ok("폰: 키보드로 누른 필터 버튼이 포커스를 잃지 않는다", await pg.evaluate(() => document.activeElement?.matches?.(".f-o")));
    await ctx.close();
  }
  // nothing on a phone page is cut off under the tab bar: no page needs scrolling up and down (the owner's rule)
  section("폰 페이지가 화면 안에 들어간다 (위아래로 넘치지 않음)");
  for (const [w, h] of [[390, 844], [375, 667], [360, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }), pg = await ctx.newPage();
    await ctx.addInitScript(() => { try { localStorage.setItem("pd.entered", "1"); } catch {} });
    const over = [];
    // (a piece's case pages and title page were already taller than a 375×667 screen before 2026-10-27 — main measured
    // +60…+234px — so there the pieces are left out; the list, the topic and the format pages are new and must fit)
    for (const u of ["/briefs", "/briefs/topic/cloud", "/briefs/topic/erp", "/briefs/series/news", ...(h >= 800 ? pieces.map((b) => `/briefs/${b.slot}`) : [])]) {
      await pg.goto(B + u, { waitUntil: "networkidle" }); await pg.waitForSelector("html.pgr-ready"); await pause(300);
      over.push(...(await pg.$$eval(".pgr-track .pg", (l) => l.map((p) => ({ n: p.getAttribute("aria-label"), d: p.scrollHeight - p.clientHeight, s: p.scrollWidth - p.clientWidth })).filter((x) => x.d > 1 || x.s > 1))).map((x) => `${u} ${x.n} ${x.d > 1 ? `+${x.d}px` : ""}${x.s > 1 ? ` 옆으로 +${x.s}px` : ""}`));
    }
    ok(`${w}×${h}: 리서치 목록 · 주제 · 형식${h >= 800 ? " · 글" : ""} 페이지에 위아래 · 옆으로 넘치는 장이 없다`, !over.length, over.join(", "));
    await ctx.close();
  }

  section("옆으로 넘치지 않는다 (긴 페이지 · 폰과 데스크톱 사이)");
  {
    const wide = [];
    for (const [w, h, mobile] of [[360, 640, true], [390, 844, true], [641, 900, false], [667, 375, true], [700, 900, false], [1024, 800, false]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), pg = await ctx.newPage();
      await ctx.addInitScript(() => { try { localStorage.setItem("pd.entered", "1"); } catch {} });
      for (const u of ["/briefs?scroll=1", `/briefs/${pieces.at(-1).slot}?scroll=1`, "/briefs/topic/cloud?scroll=1", "/?scroll=1"]) {
        await pg.goto(B + u, { waitUntil: "networkidle" }); await pause(200);
        const d = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (d > 1) wide.push(`${w}×${h} ${u} +${d}px`);
      }
      await ctx.close();
    }
    ok("어느 폭에서도 페이지가 옆으로 넘치지 않는다", !wide.length, wide.join(", "));
  }

  // ---------- 5. reading without signing in ----------
  section("비로그인 읽기 동선");
  for (const phone of [false, true]) {
    const tag = phone ? "폰" : "데스크톱", ctx = await context(phone), pg = await ctx.newPage();
    await pg.goto(B + "/", { waitUntil: "networkidle" });
    ok(`${tag}: 처음 온 사람은 표지부터`, await pg.isVisible("#welcome"));
    await pg.click("[data-w-about]"); await pg.click("[data-w-enter]"); await pause(500);
    ok(`${tag}: '로그인 없이 둘러보기' → 앱, 로그인으로 넘어가지 않는다`, !(await pg.isVisible("#welcome")) && new URL(pg.url()).pathname === "/");
    await shot(pg, `home-${phone ? "phone" : "desktop"}`, !phone);
    // home → the research list → a piece
    if (phone) await Promise.all([pg.waitForNavigation(), pg.tap('.tabbar [data-tab="briefs"]')]);
    else await Promise.all([pg.waitForNavigation(), pg.click('.topbar .nav a[href="/briefs"]')]);
    ok(`${tag}: 홈 → 리서치 목록`, new URL(pg.url()).pathname === "/briefs");
    if (phone) { await pg.waitForSelector("html.pgr-ready"); await pg.evaluate(() => { const t = document.querySelector(".pgr-track"); t.scrollTo({ left: t.clientWidth, behavior: "instant" }); }); await pause(400); }
    await Promise.all([pg.waitForNavigation({ waitUntil: "networkidle" }), phone ? pg.tap(".pgr-track .r-item .r-card") : pg.click(".r-item .r-card")]);
    const text = await pg.evaluate(() => [...document.querySelectorAll("article.brief .part p, .pgr-track .part p, .pgr-track .flow p")].map((p) => p.textContent).join(" ").length);
    ok(`${tag}: 목록 → 글, 본문이 로그인 없이 다 보인다 (${text}자)`, text > 500 && !/\/login/.test(pg.url()));
    await ctx.close();
  }
  {
    const ctx = await context(false), pg = await ctx.newPage();
    await pg.goto(`${B}/briefs/${pieces[0].slot}`, { waitUntil: "networkidle" });
    ok("공유된 글 주소로 바로 와도 표지 없이 글이 열린다", await pg.isVisible("article.brief h1") && !(await pg.isVisible("#welcome")));
    await pg.goto(`${B}/saved`, { waitUntil: "networkidle" });
    ok("로그인 안 해도 /saved 가 열린다 (이 기기에 저장)", (await pg.title()).length > 0 && !/\/login/.test(pg.url()));
    await ctx.close();
  }

  // ---------- 6. home ↔ topics ↔ indicators (Our World in Data) ----------
  section("홈 · 주제 페이지 · 지표 연결");
  {
    const ctx = await context(false), pg = await ctx.newPage();
    await ctx.addInitScript(() => { try { localStorage.setItem("pd.entered", "1"); } catch {} });
    await pg.goto(B + "/", { waitUntil: "networkidle" });
    // the home tells this week's story once; the list, its topics and formats are /briefs's only (2026-10-27 "겹치는 거 다 없애줘")
    const featured = await pg.$eval("#story .st-t a", (a) => a.getAttribute("href"));
    const repeats = await pg.$$eval("main .r-item, main .ex-list, #briefs, #explore", (l) => l.length);
    ok(`홈: 이번 주 이야기(${featured}) 하나 + 리서치 전체로 가는 링크, 리서치 목록 · 찾아보기는 홈에 없다`, pieces.some((x) => featured === `/briefs/${x.slot}`) && repeats === 0 && Boolean(await pg.$('#story a[href="/briefs"]')));
    const list = await (await fetch(B + "/briefs")).text();
    ok("리서치 목록: 주제는 필터 한 곳에만 (주제 페이지 묶음을 따로 두지 않음)", !list.includes('class="r-more"') && list.includes('data-f="topic"'));
    await pg.goto(B + "/#explore", { waitUntil: "networkidle" });
    await pg.waitForURL(/\/briefs$/, { timeout: 5000 }).catch(() => {});
    ok("옛 홈 주소(/#explore)는 리서치 목록으로", new URL(pg.url()).pathname === "/briefs", pg.url());
    await pg.goto(B + "/", { waitUntil: "networkidle" });
    const cardLinks = await pg.$$eval(".ins .c-res", (l) => l.map((a) => a.getAttribute("href")));
    ok(`지표 카드 ${cardLinks.length}장이 주제 페이지로 이어진다`, cardLinks.length > 0 && cardLinks.every((h) => /^\/briefs\/topic\/[a-z]+$/.test(h)));
    await pg.goto(B + cardLinks[0], { waitUntil: "networkidle" });
    ok("주제 페이지: 지표 → 리서치 → 공식 발표", await pg.isVisible("#data .ind") && await pg.isVisible("#research") && await pg.isVisible("#news"));
    await shot(pg, "topic-desktop", true);
    const back = await pg.$eval("#data .ind-src a[href^='/#c-']", (a) => a.getAttribute("href")).catch(() => null);
    await pg.goto(B + back, { waitUntil: "networkidle" }); await pause(400);
    const card = await pg.$eval(back.slice(1), (c) => { const r = c.getBoundingClientRect(); return { shown: !c.closest("[hidden]"), top: r.top }; });
    ok(`'지표에서 보기'(${back}) → 그 카드가 열린 탭에서 보인다`, card.shown && card.top < 900 && card.top > -50, JSON.stringify(card));
    // a piece shows its topics' indicators
    await pg.goto(`${B}/briefs/${pieces[0].slot}`, { waitUntil: "networkidle" });
    ok("글: 주제 링크와 관련 지표", (await pg.$$eval(".topics a", (l) => l.length)) > 0 && (await pg.$$eval(".inds .ind", (l) => l.length)) > 0);
    // the numbers come in when the page opens (briefs/indicators.json), so a published page does not change every day
    const nums = await pg.$$eval(".inds .ind", (l) => l.map((x) => x.querySelector(".ind-n b")?.textContent ?? ""));
    const want = read("briefs/indicators.json").cards;
    ok(`글: 관련 지표 ${nums.length}개에 오늘 숫자가 채워진다 (${nums.join(", ")})`, nums.length > 0 && nums.every((n, i) => n && Object.values(want).some((c) => c.big === n)));
    const html = fs.readFileSync(path.join(ROOT, "briefs", `${pieces[0].slot}.html`), "utf8");
    ok("글 페이지 파일에는 그날의 숫자가 박혀 있지 않다 (매일 다시 쓰이지 않음)", !/class="ind-n"/.test(html));
    await shot(pg, "detail-desktop", true);
    await ctx.close();
  }

  // ---------- 7. one new piece, every list (in a copy of the repository) ----------
  section("새 글 하나 → 여러 목록에 자동 반영");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-new-")), files = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
    for (const f of files) { if (!fs.existsSync(path.join(ROOT, f))) continue; fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    // (the newest piece with tags, so the tag pages are checked too)
    const src = pieces.filter((b) => b.st.article.tags?.companies?.length).at(-1) ?? pieces[0], slot = "2099-01-02", dir = path.join(tmp, "social", "out", slot);
    fs.cpSync(path.join(ROOT, "social", "out", src.slot), dir, { recursive: true });
    const st = { ...src.st, date: "2099-01-02", article: { ...src.st.article, title: "자동 반영 시험용 리서치 제목" } };
    fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify(st));
    fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify({ ...src.post, date: "2099-01-02", published: { at: "2099-01-02T01:00:00Z", media_id: "0", permalink: null } }));
    const run = spawnSync(process.execPath, ["social/briefs.mjs"], { cwd: tmp, encoding: "utf8" });
    ok("새 글을 넣고 social/briefs.mjs 한 번", run.status === 0, run.stderr.slice(-400));
    const has = (f) => fs.existsSync(path.join(tmp, f)) && fs.readFileSync(path.join(tmp, f), "utf8").includes(`/briefs/${slot}`);
    const topics = [...new Set(st.article.sections.map((x) => x.case?.domain).filter(Boolean))];
    const topicIds = fs.readdirSync(path.join(tmp, "briefs", "topic")).filter((f) => fs.readFileSync(path.join(tmp, "briefs", "topic", f), "utf8").includes(`/briefs/${slot}"`));
    const tags = (st.article.tags?.companies ?? []).map((c) => `briefs/tag/company-${c.id}.html`);
    const where = { "글 페이지": fs.existsSync(path.join(tmp, "briefs", `${slot}.html`)), "리서치 목록": has("briefs/index.html"), "형식 목록": has(`briefs/series/${src.st.series ?? "news"}.html`),
      [`주제 페이지 ${topicIds.length}곳`]: topicIds.length >= Math.min(1, topics.length), [`태그 목록 ${tags.length}곳`]: tags.every(has), "홈(이번 주 이야기)": has("index.html"), RSS: has("briefs/feed.xml"),
      사이트맵: has("sitemap.xml"), "다른 글의 같이 읽기": has(`briefs/${src.slot}.html`) };
    for (const [k, v] of Object.entries(where)) ok(`새 글이 ${k}에 나온다`, v);
    // and the search finds it by its title
    const t2 = await serve(tmp), ctx = await context(false), pg = await ctx.newPage();
    await pg.goto(t2.base + "/briefs?q=" + encodeURIComponent("자동 반영 시험용"), { waitUntil: "networkidle" });
    ok("목록 검색이 새 글을 찾는다", JSON.stringify(await visible(pg)) === JSON.stringify([`r-${slot}`]));
    await ctx.close(); t2.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  section("스크립트 오류");
  ok("어느 페이지에서도 자바스크립트 오류가 없다", !errors.length, errors.join(" | "));
} finally {
  await browser.close(); srv.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
