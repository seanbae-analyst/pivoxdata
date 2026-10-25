// feeds.mjs — reads RSS 2.0 and Atom feeds, and an article page's meta tags, into plain items:
// { title, link, date: "YYYY-MM-DD", summary } — text only (tags, entities, CDATA and embedded comments removed),
// the summary cut at a sentence end near 500 characters. No dependency: the feeds this reads are simple, and an item
// that can't be read (no title, link or date) is skipped rather than guessed.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
// a number past Unicode (&#99999999;) stays as written — String.fromCodePoint would throw and lose the whole feed
const cp = (n) => (n <= 0x10ffff ? String.fromCodePoint(n) : null);
export const decode = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? cp(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) ?? m : ENT[e.toLowerCase()] ?? m));
const strip = (s) => s.replace(/<!--[\s\S]*?(-->|$)/g, " ").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
const squash = (s) => s.replace(/\s+/g, " ").trim();
// a summary may itself be escaped HTML (decode once more), and some carry a word processor's metadata in a comment
export const clean = (s) => squash(strip(decode(decode(s))));
// a title is text: the feed's layer is decoded, markup dropped, and only then the title's own entities — so a tag
// written as text ("&amp;lt;b&amp;gt;") reads "<b>" instead of being decoded into a tag and deleted
const text = (s) => squash(decode(strip(decode(s))));
export function cut(s, n = 500) {
  if (s.length <= n) return s;
  const head = s.slice(0, n), end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("다. "), head.lastIndexOf("? "));
  return end > n * 0.4 ? head.slice(0, end + 1) : head.replace(/\s+\S*$/, "") + "…";
}
export function isoDate(s) {
  const t = String(s ?? "").trim().replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/, (m, y, mo, d) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
  const d = new Date(t);
  return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10);
}
// `back` puts the CDATA sections parseFeed set aside back into the field it found
const tag = (block, names, back) => {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m && clean(back(m[1]))) return back(m[1]);
  }
  return "";
};
const atomLink = (block) => {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const alt = links.find((a) => !/rel=["'](?!alternate)/i.test(a)) ?? links[0] ?? "";
  return decode((alt.match(/href=["']([^"']+)["']/i) ?? [])[1] ?? "");
};
export function parseFeed(xml) {
  // a CDATA section may hold anything, "</item>" too: the sections are set aside (as \0n\0 — NUL never occurs in XML)
  // while the items and their fields are cut, so one can't end an item early
  const cd = [], x = String(xml).replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => `\0${cd.push(m) - 1}\0`);
  const back = (s) => s.replace(/\0(\d+)\0/g, (_, i) => cd[i]);
  const blocks = [...x.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return blocks.map((b) => {
    const rssLink = clean(tag(b, ["link"], back));
    return {
      title: cut(text(tag(b, ["title"], back)), 200),
      link: /^https?:\/\//.test(rssLink) ? rssLink : atomLink(b) || clean(tag(b, ["guid", "id"], back)),
      date: isoDate(clean(tag(b, ["pubDate", "published", "dc:date", "updated"], back))),
      summary: cut(clean(tag(b, ["description", "summary", "content:encoded", "content"], back))),
    };
  }).filter((x) => x.title && /^https:\/\//.test(x.link) && x.date);
}
// an article page: Open Graph title/description and its published time
export function parseArticle(html, link) {
  const meta = (p) => decode((String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i")) ?? [])[1] ?? "");
  const date = isoDate(meta("article:published_time") || (String(html).match(/"datePublished":"([^"]+)"/) ?? [])[1]);
  const title = cut(squash(decode(meta("og:title"))), 200); // an attribute holds no markup: "<b>" in it is text
  return title && date ? { title, link, date, summary: cut(clean(meta("og:description"))) } : null;
}
export const onDomain = (link, domains) => { try { const h = new URL(link).hostname; return domains.some((d) => h === d || h.endsWith(`.${d}`)); } catch { return false; } };
