// site.mjs — the parts every page shares: head tags, top bar, footer, sitemap.xml and robots.txt.
// Pages keep marked regions (<!--@head-->…<!--/@head--> etc.) and build.mjs fills them, so each page stays a plain
// static file. The public address lives here once (SITE_URL overrides it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POLICY_VERSION } from "./legal.mjs";
import { accountPages } from "./pages.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = (process.env.SITE_URL || "https://data.pivoxquant.com").replace(/\/$/, "");
export const NAME = "AX 트렌드 레이더";
// signing in (2026-10-26, "랜딩 먼저 나오고 로그인 넘어가게 — pivoxmap처럼"): the Supabase project that keeps accounts
// and saved briefings — PivoxQuant's project, shared (owner, 2026-10-26; ours lives in the schema pivoxdata, and
// PivoxQuant's tables answer this key with 401 — supabase/README.md). Its address and publishable key are public by
// design: the browser calls it, and what a browser may do there is fixed by supabase/schema.sql. Empty = no signing in
// anywhere: no menu, no login step after the landing, no login part in the privacy policy (trends/legal.mjs). `region`:
// where the company and its servers are, for the policy; `mail`: "brevo" once the sign-in e-mails go out through Brevo
// (supabase/README.md). PD_AUTH_URL / PD_AUTH_KEY override it for a local try against a stand-in.
export const AUTH = { url: process.env.PD_AUTH_URL ?? "https://yjiztgummaxecriiuumt.supabase.co", key: process.env.PD_AUTH_KEY ?? "sb_publishable_mgqgsgdtNLUE3sqAiuKk1w_gfqalamB", region: "미국 · 저장은 서울 리전", mail: "brevo" };
AUTH.on = Boolean(AUTH.url && AUTH.key);
// text into HTML — attributes too, so it escapes " as well; the one escaper of build.mjs, viz.mjs and glossary.mjs
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAGES = [
  { file: "index.html", path: "/" },
  { file: "map.html", path: "/map" },
  { file: "404.html", path: "/404", noindex: true },
];

const NAV = `
<header class="topbar">
  <a class="brand" href="/" aria-label="PivoxData — ${NAME} 처음으로">Pivox<span class="b">Data</span></a>
  <nav class="nav" aria-label="사이트"><a href="/briefs">리서치</a><a href="/#news">공식 발표</a><a href="/#ax">지표</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a><a href="/saved" data-acct="saved" class="nav-acct">저장<span class="x">한 리서치</span><span class="n"></span></a>${AUTH.on ? `<a href="/login" data-acct="login">로그인</a>` : ""}</nav>
</header>
`;
// the top bar's links say where you are (/briefs, /map); a news site's menu, the same on every screen (2026-10-27,
// "뉴스처럼 다 바꿔줘": no tab bar at the bottom, no install bar)
const MARK = `
<script>
(() => { const p = location.pathname;
  document.querySelectorAll(".topbar .nav a").forEach((a) => { const u = new URL(a.href); a.toggleAttribute("aria-current", u.pathname !== "/" && p.startsWith(u.pathname)); }); })();
</script>`;
// the saved briefings and the account on every page (account.js): the 저장 buttons, the counts and the sign-in links
const ACCOUNT = `\n<script type="module" src="/account.js"></script>`;
const FOOTER = `
<footer class="site">
  <span>${NAME} · 매일 갱신 · 무료</span>
  <span class="links"><a href="/briefs">리서치</a><a href="/#news">공식 발표</a><a href="/#ax">지표</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a><a href="/#more">방법·검산</a><a href="https://github.com/seanbae-analyst/pivoxdata" target="_blank" rel="noopener">GitHub</a><a href="/terms">이용약관</a><a href="/privacy">개인정보 처리방침</a></span>
</footer>
${MARK}${ACCOUNT}`;

const BARE_FOOTER = `
<footer class="site bare"><span>${NAME}</span><span class="links"><a href="/terms">이용약관</a><a href="/privacy">개인정보 처리방침</a></span></footer>`;

const NOINDEX = `<meta name="robots" content="noindex" />`;
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
<link rel="stylesheet" href="/ui.css?v=12" />
<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));</script>
${AUTH.on ? `<meta name="pd-auth" content="${esc(AUTH.url)} ${esc(AUTH.key)}" />\n<meta name="pd-policy" content="${POLICY_VERSION}" />\n` : ""}`;
  if (page.noindex) return `\n${NOINDEX}${common}`;
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
  // the pages around signing in, written whole (trends/pages.mjs); the policy and the terms are public, the rest not found
  const extra = accountPages(AUTH);
  for (const pg of extra) {
    const file = path.join(ROOT, pg.file), html = shell({ path: pg.path, title: `${pg.title} · ${NAME}`, desc: pg.desc, body: pg.body, noindex: pg.noindex, bare: pg.bare });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) { fs.writeFileSync(file, html); console.log(`wrote ${pg.file}`); } else console.log(`same  ${pg.file}`);
  }
  // the briefings (social/briefs.mjs writes briefs/*.html) are listed too — not a draft's page (noindex until its post
  // is on Instagram), whichever of the two scripts writes the sitemap last
  const BR = path.join(ROOT, "briefs");
  const briefs = fs.existsSync(BR) ? fs.readdirSync(BR, { recursive: true }).map(String).filter((f) => f.endsWith(".html"))
    .filter((f) => !fs.readFileSync(path.join(BR, f), "utf8").includes(NOINDEX))
    .map((f) => `/briefs/${f.slice(0, -5).replace(/\\/g, "/")}`.replace(/\/index$/, "")) : [];
  // both the trends build (the data's day) and social/briefs.mjs (the newest briefing's day) write the sitemap, one
  // after the other: a page keeps the later of its lastmod already there and this one, so it never goes back
  const SM = path.join(ROOT, "sitemap.xml"), had = fs.existsSync(SM) ? Object.fromEntries([...fs.readFileSync(SM, "utf8").matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]])) : {};
  const urls = [...PAGES.filter((p) => !p.noindex).map((p) => p.path), ...extra.filter((p) => !p.noindex).map((p) => p.path), ...briefs.sort()].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${[had[SITE + u], lastmod].filter(Boolean).sort().at(-1)}</lastmod></url>`).join("\n");
  fs.writeFileSync(SM, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
}

// a whole page in the site's frame (head tags, top bar, footer) — for pages generated in full, like the briefings
// `noindex`: a page that must exist but not be found yet (a draft's briefing) — no canonical or share tags, not in the sitemap
// `bare`: a page about signing in — the top bar and the policy links only
export function shell({ path: p, title, desc, css = "", body, noindex = false, bare = false }) {
  const page = { path: p, noindex }, top = `<title>${title}</title>\n<meta name="description" content="${desc}" />`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${top}
${head(page, top)}
<link rel="stylesheet" href="/research.css" />
<style>${css}</style>
</head>
<body>
<div class="wrap">
${NAV}
<main>
${body}
</main>
${bare ? BARE_FOOTER : FOOTER}
</div>
</body>
</html>
`;
}
