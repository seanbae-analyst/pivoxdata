// briefs.mjs — the site's "AX 브리핑": every post's story explained at more length (story.json → article, written and
// checked by story.mjs), one page each at /briefs/<folder>, an archive at /briefs, and the latest three on the home page.
// Rebuilt from all of social/out/*/story.json each run, so a page also picks up its Instagram link once posted.
// The sources are printed from the data the post was written from (announcements with their links, the Ramp AI Index
// citation, the download counts), never from the model's text.
//
// Usage: node social/briefs.mjs   (after social/caption.mjs; harmless on a day without a post)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell, writePages, SITE } from "../trends/site.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "social", "out"), DIR = path.join(ROOT, "briefs");
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (t) => String(t ?? "").replace(/​/g, "").replace(/‑/g, "-").replace(/ /g, " ");
const day = (d) => `${+d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const KIND = { company: "공식 발표", government: "보도자료", research: "리서치" };
const AX_FORMATS = new Set(["monthly", "deepdive", "timeline", "explainer", "checklist"]);

const briefs = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).sort().reverse()
  .map((slot) => ({ slot, story: read(path.join(OUT, slot, "story.json")), post: read(path.join(OUT, slot, "post.json")) }))
  .filter((b) => b.story?.article?.sections?.length);

const srcItem = (x) => `<li><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.source)} ${KIND[x.kind] ?? "발표"} — ${esc(plain(x.title))}</a> <span class="d">${+x.date.slice(5, 7)}/${+x.date.slice(8)}</span></li>`;
function basis(st) {
  if (st.mode === "news") return `<p>회사·기관이 직접 낸 발표만 썼어요. 제목을 누르면 원문으로 가요.</p><ul class="srcs">${(st.sources ?? []).map(srcItem).join("")}</ul>`;
  if (st.topic === "ax" || AX_FORMATS.has(st.format)) return `<p><a href="https://fred.stlouisfed.org/series/RAMPAIALL" target="_blank" rel="noopener">Ramp AI Index</a> (Ramp Economics Lab) · FRED, 세인트루이스 연방준비은행 — 미국 기업 7만여 곳의 법인카드·송금 기록으로 AI 도구에 돈을 낸 회사 비율을 매달 잽니다. 무료 도구와 개인 결제는 잡히지 않아요. 지금 숫자는 <a href="/#ax">AX 탭</a>에.</p>`;
  return `<p>npm · PyPI 다운로드(설치 횟수이지 사용자 수가 아니에요), arXiv, Hugging Face, SEC 공시를 매일 같은 방식으로 계산했어요. 방법과 검산은 <a href="/#more">근거 데이터</a>에.</p>`;
}
const paras = (t) => plain(t).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br />")}</p>`).join("");

const CSS = `
  .kicker{display:inline-flex;gap:8px;align-items:center;padding:5px 12px;border:1px solid var(--line-2);border-radius:999px;font-size:13px;color:var(--ink-2);margin:28px 0 16px}
  .kicker b{color:var(--bronze-hi);font-weight:600}
  article{max-width:720px}
  article h1{font-size:clamp(28px,4.4vw,40px);line-height:1.25;letter-spacing:-.03em;margin:0 0 16px;word-break:keep-all}
  .lede{font-size:18px;line-height:1.75;color:var(--ink-2);margin:0 0 8px}
  .meta{font-size:13px;color:var(--dim);margin:0 0 36px}
  article h2{font-size:21px;line-height:1.4;letter-spacing:-.02em;margin:44px 0 12px}
  article p{font-size:16.5px;line-height:1.85;color:var(--ink-2);margin:0 0 14px}
  .src{font-size:13.5px;color:var(--mut);margin:6px 0 0;padding-left:12px;border-left:2px solid var(--bronze-line)}
  .src a{color:var(--mut)} .src a:hover{color:var(--ink)}
  .sum{margin:44px 0 0;padding:22px 24px;border:1px solid var(--line);border-radius:var(--radius-card);background:var(--surface)}
  .sum h2{margin:0 0 10px;font-size:17px} .sum ul{margin:0;padding-left:18px} .sum li{font-size:15.5px;line-height:1.75;color:var(--ink-2)}
  .basis{margin:36px 0 0;font-size:14px;color:var(--mut)} .basis h2{font-size:15px;margin:0 0 8px;color:var(--ink)} .basis p{font-size:14px;line-height:1.7;color:var(--mut)}
  .srcs{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:14px} .srcs .d{color:var(--dim);font-size:12.5px}
  .links{display:flex;flex-wrap:wrap;gap:10px 18px;margin:32px 0 0;font-size:14px}
  .list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:12px;max-width:760px}
  .list a{display:block;padding:20px 22px;border:1px solid var(--line);border-radius:var(--radius-card);background:var(--surface);color:var(--ink-2);text-decoration:none;transition:border-color .2s}
  .list a:hover{border-color:var(--line-2)} .list .t{display:block;font-size:18px;font-weight:650;color:var(--ink);margin:6px 0 6px;line-height:1.4;letter-spacing:-.02em}
  .list .k{font-size:12.5px;color:var(--bronze-hi)} .list .l{font-size:14.5px;line-height:1.65;color:var(--mut)}
  .intro{font-size:16px;color:var(--mut);max-width:640px;margin:0 0 28px}
`;

fs.mkdirSync(DIR, { recursive: true });
const keep = new Set(["index.html"]);
for (const b of briefs) {
  const { story: st, post } = b, a = st.article, file = `${b.slot}.html`;
  keep.add(file);
  const sections = a.sections.map((x) => `<h2>${esc(plain(x.heading))}</h2>${paras(x.body)}${x.sources?.length ? `<p class="src">출처 · ${x.sources.map((s) => `<a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.source)} ${KIND[s.kind] ?? "발표"} · ${+s.date.slice(5, 7)}/${+s.date.slice(8)}</a>`).join(" / ")}</p>` : ""}`).join("");
  const body = `<article>
  <div class="kicker"><b>AX 브리핑</b>${esc(st.format_name ?? "")}</div>
  <h1>${esc(plain(a.title))}</h1>
  <p class="lede">${esc(plain(a.lede))}</p>
  <p class="meta">${day(st.date)} · AX 트렌드 레이더</p>
  ${sections}
  ${a.takeaways?.length ? `<section class="sum"><h2>정리</h2><ul>${a.takeaways.map((t) => `<li>${esc(plain(t))}</li>`).join("")}</ul></section>` : ""}
  <section class="basis"><h2>근거</h2>${basis(st)}</section>
  <div class="links"><a href="/briefs">← 브리핑 전체</a>${post?.published?.permalink ? `<a href="${esc(post.published.permalink)}" target="_blank" rel="noopener">인스타그램 카드로 보기</a>` : ""}<a href="/">오늘의 신호</a></div>
</article>`;
  const html = shell({ path: `/briefs/${b.slot}`, title: `${esc(plain(a.title))} · AX 트렌드 레이더`, desc: esc(plain(a.lede).slice(0, 150)), css: CSS, body });
  const f = path.join(DIR, file);
  if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== html) { fs.writeFileSync(f, html); console.log(`wrote briefs/${file}`); }
}
// a folder whose story went away takes its page with it
for (const f of fs.readdirSync(DIR)) if (!keep.has(f)) { fs.rmSync(path.join(DIR, f)); console.log(`removed briefs/${f}`); }

const item = (b) => `<li><a href="/briefs/${b.slot}"><span class="k">${esc(b.story.format_name ?? "")} · ${day(b.story.date)}</span><span class="t">${esc(plain(b.story.article.title))}</span><span class="l">${esc(plain(b.story.article.lede))}</span></a></li>`;
const index = shell({ path: "/briefs", title: "AX 브리핑 · AX 트렌드 레이더", desc: "기업의 AI 전환(AX)을 숫자와 공식 발표로 풀어 쓴 글. 인스타그램 카드의 긴 버전이에요.", css: CSS,
  body: `<div class="kicker"><b>AX 브리핑</b>카드의 긴 버전</div>
  <h1 style="font-size:clamp(28px,4.4vw,40px);letter-spacing:-.03em;margin:0 0 12px">AX 브리핑</h1>
  <p class="intro">인스타그램에 올린 이야기를 더 자세히 풀어 쓴 글이에요. 숫자는 매일 재는 데이터에서, 사건은 회사·정부가 직접 낸 발표에서만 가져와요.</p>
  ${briefs.length ? `<ul class="list">${briefs.map(item).join("")}</ul>` : `<p class="intro">첫 브리핑을 준비하고 있어요.</p>`}` });
const fi = path.join(DIR, "index.html");
if (!fs.existsSync(fi) || fs.readFileSync(fi, "utf8") !== index) { fs.writeFileSync(fi, index); console.log("wrote briefs/index.html"); }

// the home page: the latest three, and the shared frame (nav, sitemap with the briefings)
const home = briefs.slice(0, 3).map((b) => `<li><a href="/briefs/${b.slot}"><time datetime="${b.story.date}">${+b.story.date.slice(5, 7)}/${+b.story.date.slice(8)}</time><span class="badge">${esc(b.story.format_name ?? "브리핑")}</span><span class="et">${esc(plain(b.story.article.title))}</span><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a></li>`).join("");
writePages({ "index.html": { "t-briefs": home } }, briefs[0]?.story.date ?? new Date().toISOString().slice(0, 10));
console.log(`${briefs.length} briefing(s) at ${SITE}/briefs`);
