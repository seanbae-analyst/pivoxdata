// site.mjs — the parts every page shares: head tags, top bar, footer, sitemap.xml and robots.txt.
// Pages keep marked regions (<!--@head-->…<!--/@head--> etc.) and build.mjs fills them, so each page stays a plain
// static file. The public address lives here once (SITE_URL overrides it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = (process.env.SITE_URL || "https://data.pivoxquant.com").replace(/\/$/, "");
export const NAME = "AI 기술 신호 레이더";

export const PAGES = [
  { file: "index.html", path: "/" },
  { file: "map.html", path: "/map" },
  { file: "404.html", path: "/404", noindex: true },
];

const MARK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V13M12 19V8M19 19V4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const NAV = `
<header class="topbar">
  <a class="brand" href="/"><span class="mark">${MARK}</span><span class="full">${NAME}</span><span class="short">신호 레이더</span></a>
  <nav class="nav" aria-label="사이트"><a href="/">신호</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a></nav>
</header>
`;
const FOOTER = `
<footer class="site">
  <span>${NAME} · 매일 갱신 · 무료 · 예측이나 투자 권유를 하지 않습니다</span>
  <span class="links"><a href="/">신호</a><a href="/#glossary">용어 풀이</a><a href="/map">데이터 지도</a><a href="/#more">방법·검산</a><a href="https://github.com/seanbae-analyst/pivoxdata" target="_blank" rel="noopener">Source</a></span>
</footer>
`;

function head(page, html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || NAME;
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const url = SITE + page.path, img = `${SITE}/og/home.png`;
  const common = `
<meta name="theme-color" content="#050505" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link rel="stylesheet" href="/ui.css" />
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
  const urls = PAGES.filter((p) => !p.noindex).map((p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
}
