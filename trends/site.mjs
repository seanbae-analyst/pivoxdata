// site.mjs — the parts every page shares: head tags, top bar, footer, sitemap.xml and robots.txt.
// Pages keep marked regions (<!--@head-->…<!--/@head--> etc.) and build.mjs fills them, so each page stays a plain
// static file. The public address lives here once (SITE_URL overrides it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = (process.env.SITE_URL || "https://data.pivoxquant.com").replace(/\/$/, "");
export const NAME = "AX 트렌드 레이더";

export const PAGES = [
  { file: "index.html", path: "/" },
  { file: "map.html", path: "/map" },
  { file: "404.html", path: "/404", noindex: true },
];

const NAV = `
<header class="topbar">
  <a class="brand" href="/" aria-label="PivoxData — ${NAME} 처음으로">Pivox<span class="b">Data</span></a>
  <nav class="nav" aria-label="사이트"><a href="/">신호</a><a href="/briefs">브리핑</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a></nav>
</header>
`;
// on a phone, a tab bar at the bottom (like an app): 홈 · 브리핑 · 사건 · 용어 — the top bar keeps only the name.
const TABBAR = `
<nav class="tabbar" aria-label="바로가기">
  <a href="/" data-tab="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/></svg><span>홈</span></a>
  <a href="/briefs" data-tab="briefs"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6zM9 10h6M9 14h6M9 18h4"/></svg><span>브리핑</span></a>
  <a href="/#news" data-tab="news"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM16 9h3v9a2 2 0 0 1-2 2M7 9h6M7 13h6M7 17h4"/></svg><span>사건</span></a>
  <a href="/#glossary" data-tab="glossary"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H5zM19 5h-3a3 3 0 0 0-2 1M19 5v13h-5"/></svg><span>용어</span></a>
</nav>
<script>
(() => { const t = document.querySelector(".tabbar"); if (!t) return;
  const mark = () => { const p = location.pathname, h = location.hash, on = p.startsWith("/briefs") ? "briefs" : p === "/" || p === "/index.html" ? (h === "#news" ? "news" : h === "#glossary" ? "glossary" : "home") : "";
    t.querySelectorAll("a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.tab === on)); };
  mark(); addEventListener("hashchange", mark); document.body.classList.add("has-tabbar"); })();
</script>`;

// on a phone, a bar at the bottom offers the app: one tap on Android (the browser's install prompt), the steps on an
// iPhone (Safari's share sheet → 홈 화면에 추가). Hidden once installed, or for a week after 닫기.
const APPBAR = `
<div class="appbar" id="appbar" hidden><span class="t"><b>AX 레이더 앱</b>홈 화면에 두고 새 브리핑 알림 받기</span><button type="button" id="appbar-go">설치</button><button type="button" class="x" id="appbar-x" aria-label="닫기">×</button></div>
<div class="appsheet" id="appsheet" hidden><div class="in"><b>홈 화면에 추가하기</b><ol id="appsheet-steps"></ol><button type="button" id="appsheet-ok">확인</button></div></div>
<script>
(() => {
  const $ = (id) => document.getElementById(id), bar = $("appbar");
  if (!bar || matchMedia("(display-mode: standalone)").matches || navigator.standalone || !matchMedia("(max-width: 640px)").matches) return;
  try { if (+localStorage.getItem("appbar-x") > Date.now() - 7 * 864e5) return; } catch {}
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let ev = null;
  const steps = ios
    ? ["화면 아래(또는 위) <b>공유 버튼</b>(네모에 위쪽 화살표)을 눌러요", "목록에서 <b>홈 화면에 추가</b>를 눌러요", "홈 화면의 <b>AX 레이더</b>를 열고, 브리핑에서 <b>알림 받기</b>를 켜요"]
    : ["브라우저 오른쪽 위 <b>메뉴(⋮)</b>를 눌러요", "<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요", "홈 화면의 <b>AX 레이더</b>를 열고, 브리핑에서 <b>알림 받기</b>를 켜요"];
  $("appsheet-steps").innerHTML = steps.map((t) => "<li>" + t + "</li>").join("");
  const show = (on) => { bar.hidden = !on; document.body.classList.toggle("has-appbar", on); };
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); ev = e; show(true); });
  addEventListener("appinstalled", () => show(false));
  setTimeout(() => show(true), 1200);
  $("appbar-go").addEventListener("click", async () => { if (ev) { ev.prompt(); await ev.userChoice; ev = null; show(false); } else $("appsheet").hidden = false; });
  $("appsheet-ok").addEventListener("click", () => { $("appsheet").hidden = true; });
  $("appbar-x").addEventListener("click", () => { show(false); try { localStorage.setItem("appbar-x", String(Date.now())); } catch {} });
})();
</script>`;
const FOOTER = `
<footer class="site">
  <span>${NAME} · 매일 갱신 · 무료</span>
  <span class="links"><a href="/">신호</a><a href="/briefs">브리핑</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a><a href="/#more">방법·검산</a><a href="https://github.com/seanbae-analyst/pivoxdata" target="_blank" rel="noopener">Source</a></span>
</footer>
${TABBAR}${APPBAR}`;

function head(page, html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || NAME;
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const url = SITE + page.path, img = `${SITE}/og/home.png`;
  const common = `
<meta name="theme-color" content="#050505" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="AX 레이더" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link rel="stylesheet" href="/ui.css?v=4" />
<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));</script>
`;
  if (page.noindex) return `\n<meta name="robots" content="noindex" />${common}`;
  return `
<link rel="canonical" href="${url}" />
<meta property="og:type" content="${page.path === "/" ? "website" : "article"}" />
<meta property="og:site_name" content="${NAME}" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${title.replace(` · ${NAME}`, "")}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${img}" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />${common}`;
}

function region(html, name, content, file) {
  const re = new RegExp(`(<!--@${name}-->)[\\s\\S]*?(<!--/@${name}-->)`);
  if (!re.test(html)) throw new Error(`${file}: region @${name} not found`);
  return html.replace(re, (_, a, b) => a + content + b);
}

// fill head/nav/footer on every page; `fills` maps a file to extra region content for that page
export function writePages(fills = {}, lastmod) {
  for (const page of PAGES) {
    const file = path.join(ROOT, page.file), before = fs.readFileSync(file, "utf8");
    let h = before;
    h = region(h, "head", head(page, h), page.file);
    h = region(h, "nav", NAV, page.file);
    h = region(h, "footer", FOOTER, page.file);
    for (const [name, content] of Object.entries(fills[page.file] ?? {})) h = region(h, name, content, page.file);
    if (h !== before) { fs.writeFileSync(file, h); console.log(`wrote ${page.file}`); } else console.log(`same  ${page.file}`);
  }
  // the briefings (social/briefs.mjs writes briefs/*.html) are listed too
  const BR = path.join(ROOT, "briefs");
  const briefs = fs.existsSync(BR) ? fs.readdirSync(BR, { recursive: true }).map(String).filter((f) => f.endsWith(".html"))
    .map((f) => `/briefs/${f.slice(0, -5).replace(/\\/g, "/")}`.replace(/\/index$/, "")) : [];
  const urls = [...PAGES.filter((p) => !p.noindex).map((p) => p.path), ...briefs.sort()].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
}

// a whole page in the site's frame (head tags, top bar, footer) — for pages generated in full, like the briefings
// phones: pages turned sideways instead of one long scroll (/pager.js) — set before the first paint so the long page never
// flashes; "?scroll=1" keeps the long page, and a pager that has not started in 4 s gives it back. index.html has a copy.
export const PAGED_HEAD = `<script>if (matchMedia("(max-width: 640px)").matches && !/[?&]scroll=/.test(location.search)) { const r = document.documentElement; r.classList.add("paged"); setTimeout(() => { if (!r.classList.contains("pgr-ready")) r.classList.remove("paged"); }, 4000); }</script>`;

export function shell({ path: p, title, desc, css = "", body, paged = false }) {
  const page = { path: p }, top = `<title>${title}</title>\n<meta name="description" content="${desc}" />`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${top}
${head(page, top)}${paged ? `\n${PAGED_HEAD}` : ""}
<link rel="stylesheet" href="/research.css" />
<style>${css}</style>
</head>
<body>
<div class="wrap">
${NAV}
<main>
${body}
</main>
${FOOTER}
</div>
</body>
</html>
`;
}
