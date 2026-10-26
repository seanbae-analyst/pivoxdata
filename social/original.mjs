// original.mjs — an official announcement's own page, read at the moment a post is written (2026-10-26).
//
// A feed gives a title and a line or two; the case a post tells — what was brought in, where it went, how — is in
// the announcement itself. So story.mjs reads each announcement it may use from its own page, and Claude writes from
// that text too. The text is never written to the repository or the site (it is the publisher's, and the repository
// is public): it lives in memory for one run, and the checks that guard every published word use it as a source —
// a number may come from it, and 24 characters in a row taken from it are refused like ones from the title.
//
// Only a page on the source's own domain (trends/series.mjs → NEWS.sources[].domains) is read, the address after
// redirects included, so a link in a feed can't send the run somewhere else. A page that doesn't answer in time,
// isn't HTML, blocks robots (openai.com answers 403) or has too little text gives { ok: false, why } — the post is
// then written from the title and summary as before.
import { NEWS } from "../trends/series.mjs";

export const MAX = 6000; // characters of a page's text given to Claude (a press release is ~3–5k)
const UA = "Mozilla/5.0 (compatible; AXTrendRadar/1.0; +https://data.pivoxquant.com)";
const domainsOf = (src) => NEWS.sources.find((s) => s.id === src)?.domains ?? [];
const onDomain = (url, domains) => { try { const h = new URL(url).hostname.toLowerCase(); return new URL(url).protocol === "https:" && domains.some((d) => h === d || h.endsWith(`.${d}`)); } catch { return false; } };

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", times: "×" };
const decode = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
  return ENT[e.toLowerCase()] ?? m;
});
// lines that are the site, not the announcement: a board's links to the posts before and after it (another
// announcement's title — its facts must not mix with this one's), a government banner, an attachment's file name
const BOILER = /^(?:이전글|다음글|목록|첨부파일|https?:\/\/\S+$)|website belongs to an official government organization|Secure \.gov websites use HTTPS|safely connected to the \.gov website|\.(?:hwpx?|pdf|docx?|xlsx?|zip)\s*$/i;
// each <tag>…</tag> in html with what is inside it, nested ones counted (a regex alone stops at the first </article>)
function elements(html, tag) {
  const out = [], re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi"), open = [];
  for (const m of html.matchAll(re)) {
    if (!m[1]) open.push(m.index + m[0].length);
    else if (open.length) { const start = open.pop(); if (!open.length) out.push(html.slice(start, m.index)); }
  }
  return out;
}
// the text of a piece of a page: the parts that are never the text (menus, headers, footers, buttons, scripts) go,
// block ends become line breaks, every other tag is dropped, and only lines a sentence long stay (not a menu entry,
// a button label or a share link)
function linesOf(h) {
  h = h.replace(/<(nav|header|footer|aside|button|dialog|menu)\b[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote|figcaption|dd|dt|td|th)>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n· ");
  return decode(h.replace(/<[^>]+>/g, " ")).split("\n").map((l) => l.replace(/[\s\u00a0]+/g, " ").trim())
    .filter((l) => (l.length >= 30 || (/[.!?。다요]\s*$/.test(l) && l.length >= 12)) && !BOILER.test(l));
}
// the announcement's text: the <article> or <main> with the most text when it holds a fair part of the page's,
// else the whole <body> (a government board page has neither), each line once
export function textOf(html) {
  const h = String(html).replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe|canvas|select)\b[\s\S]*?<\/\1>/gi, " ");
  const len = (ls) => ls.reduce((n, l) => n + l.length, 0);
  const body = linesOf(elements(h, "body")[0] ?? h);
  const best = [...elements(h, "article"), ...elements(h, "main")].map(linesOf).sort((a, b) => len(b) - len(a))[0];
  const seen = new Set();
  return (best && len(best) >= Math.min(800, len(body) * 0.3) ? best : body).filter((l) => (seen.has(l) ? false : seen.add(l))).join("\n");
}

// { ok: true, text, chars } or { ok: false, why } — never throws
export async function readOriginal(n, { timeout = 15000, max = MAX } = {}) {
  const domains = domainsOf(n.src);
  if (!onDomain(n.link, domains)) return { ok: false, why: `not on ${domains.join(", ") || "a known domain"}` };
  try {
    const res = await fetch(n.link, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "ko,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (!onDomain(res.url || n.link, domains)) return { ok: false, why: `redirected off the source's domain (${new URL(res.url).hostname})` };
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    if (!/html/i.test(res.headers.get("content-type") ?? "")) return { ok: false, why: `not a web page (${res.headers.get("content-type")})` };
    const html = (await res.text()).slice(0, 3_000_000);
    const text = textOf(html);
    if (text.length < 500) return { ok: false, why: `too little text on the page (${text.length} characters)` };
    return { ok: true, text: text.slice(0, max), chars: text.length };
  } catch (e) {
    return { ok: false, why: e.name === "TimeoutError" ? `no answer in ${timeout / 1000}s` : e.message };
  }
}

// every announcement's page at once (a few at a time), in the announcements' order
export async function readOriginals(list, opts) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const i = next++; out[i] = await readOriginal(list[i], opts); } };
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
  return out;
}
