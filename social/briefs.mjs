// briefs.mjs — the site's "AX 브리핑": every post's story explained at more length (story.json → article, written and
// checked by story.mjs) plus the monthly roundups (social/roundups/*.json, roundup.mjs), organized so they keep
// reading well as they pile up:
//  • /briefs                — newest first, grouped by month, series tabs, the tags of each
//  • /briefs/<folder>       — one briefing: series, tags, sections with their sources, 근거, previous/next in the
//                             series, related briefings (shared tags)
//  • /briefs/series/<id>    — one series (이번 주 AX 사건, 월간 AX 리포트, …)
//  • /briefs/tag/<kind>-<id> — one theme, industry or company across all series
//  • /briefs/feed.xml       — RSS, for readers and (later) e-mail
//  • the home page's "AX 브리핑" region — the latest three
// A post's briefing is public once the post is on Instagram (post.json → published): listed, in its series and tags,
// the RSS, the sitemap and the home page. Before that (a draft waiting for /approve, a test draft) it has its page —
// the caption links to it, so it must be there the moment the post goes up — but marked noindex and listed nowhere,
// and no public page links to it. A rejected draft (post.json → rejected) has no page at all. Monthly roundups are
// public once written. Rebuilt from everything each run, so a page also picks up its Instagram link once posted —
// every publish path runs this again and commits the result with post.json. Sources are printed from the data the
// post was written from (announcements with their links, the Ramp AI Index citation, download counts).
//
// Usage: node social/briefs.mjs   (after social/caption.mjs and social/roundup.mjs, and after each publish)
import fs from "node:fs";
import path from "node:path";
import { shell, writePages, SITE, NAME } from "../trends/site.mjs";
import { SERIES, THEMES, INDUSTRIES, seriesOf, companyId } from "./tags.mjs";
import { APP_ID } from "./notify-config.mjs";
import { ROOT, OUT, read, AX_FORMATS } from "./util.mjs";
import { plain } from "./claude.mjs";
import { compareSlots } from "./slot.mjs";
import { domainOf, methodOf } from "../trends/series.mjs";
import { glossaryHtml, termify, termsSource } from "../trends/glossary.mjs";

const RU = path.join(ROOT, "social", "roundups"), DIR = path.join(ROOT, "briefs");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// a link from an announcement's feed goes into an href only when it is a web address (no javascript:, data: …)
const href = (u) => (/^https?:\/\//i.test(String(u ?? "").trim()) ? esc(String(u).trim()) : "#");
// RSS is XML: the control characters XML 1.0 forbids (and lone surrogates) would make the whole feed unreadable
const xml = (s) => esc(plain(s)).replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "");
const day = (d) => `${+d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const KIND = { company: "공식 발표", government: "보도자료", research: "리서치" };
// told from the AX numbers (Ramp AI Index): a monthly report (util.mjs → AX_FORMATS), an AX case, and — Instagram
// being AX only since 2026-10-25 — the weekly digest and the quiet-day post; the downloads note is for older posts
const fromAX = (st) => st.topic === "ax" || AX_FORMATS.has(st.format) || st.mode === "digest" || st.mode === "roundup";

// ---------- every briefing, newest first ----------
const drafts = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : [])
  .map((slot) => ({ slot, st: read(path.join(OUT, slot, "story.json")), post: read(path.join(OUT, slot, "post.json")) }))
  .filter((b) => b.st?.article?.sections?.length && !b.post?.rejected);
const roundups = (fs.existsSync(RU) ? fs.readdirSync(RU).filter((f) => f.endsWith(".json")) : [])
  .map((f) => ({ slot: `roundup-${f.slice(0, -5)}`, st: read(path.join(RU, f)), post: null })).filter((b) => b.st?.article);
// a briefing written before tags existed still gets its companies (from its sources — code, not the model)
const companiesOf = (st) => [...new Map((st.sources ?? []).map((x) => [companyId(x.source), { id: companyId(x.source), name: x.source }])).values()];
const newest = (a, b) => b.st.date.localeCompare(a.st.date) || compareSlots(b.slot, a.slot);
const withTags = (b) => ({ ...b, series: b.st.series ?? seriesOf(b.st), tags: b.st.article.tags ?? { themes: [], industries: [], companies: companiesOf(b.st) } });
// public: the posted ones and the roundups; pending: a draft's page, noindex, linked from nowhere
const briefs = [...drafts.filter((b) => b.post?.published), ...roundups].map(withTags).sort(newest);
const pending = drafts.filter((b) => !b.post?.published).map((b) => ({ ...withTags(b), pending: true })).sort(newest);
const bySlot = new Map(briefs.map((b) => [b.slot, b]));

// tags: key "theme-adoption" / "industry-finance" / "company-openai" → { name, kind, briefs } — from the public
// briefings only (a draft's chips link only to tag pages that exist)
const TAGS = new Map();
const tagName = (kind, id, b) => kind === "theme" ? THEMES.find((t) => t.id === id)?.name : kind === "industry" ? INDUSTRIES.find((t) => t.id === id)?.name : b.tags.companies.find((c) => c.id === id)?.name;
for (const b of [...briefs, ...pending]) b.keys = [...b.tags.themes.map((id) => `theme-${id}`), ...b.tags.industries.map((id) => `industry-${id}`), ...b.tags.companies.map((c) => `company-${c.id}`)];
for (const b of briefs) {
  for (const k of b.keys) {
    const [kind, ...rest] = k.split("-"), id = rest.join("-"), name = tagName(kind, id, b);
    if (!name) continue;
    if (!TAGS.has(k)) TAGS.set(k, { key: k, kind, name, briefs: [] });
    TAGS.get(k).briefs.push(b);
  }
}
const chips = (b) => b.keys.filter((k) => TAGS.has(k)).map((k) => `<a class="chip ${TAGS.get(k).kind}" href="/briefs/tag/${k}">${esc(TAGS.get(k).name)}</a>`).join("");

// ---------- pieces ----------
const srcItem = (x) => `<li><a href="${href(x.link)}" target="_blank" rel="noopener">${esc(x.source)} ${KIND[x.kind] ?? "발표"} — ${esc(plain(x.title))}</a> <span class="d">${md(x.date)}</span></li>`;
function basis(b) {
  const st = b.st;
  if (b.series === "roundup") return `<p>${esc(st.month?.slice(5).replace(/^0/, ""))}월에 올린 브리핑 ${st.briefs?.length ?? 0}편만으로 썼어요. 각 섹션 아래 링크가 근거가 된 브리핑이에요.</p>`;
  if (st.mode === "news") {
    // a briefing written since 2026-10-26 says which announcements were read on their own page (story.mjs → original)
    const read = (st.sources ?? []).filter((x) => x.original).length;
    return `<p>회사·기관이 직접 낸 발표만 썼어요.${st.originals != null ? ` ${read ? `발표 ${read}건은 공식 페이지의 원문까지 읽고, 나머지는 제목과 요약으로 썼어요.` : "발표의 제목과 요약으로 썼어요."}` : ""} 제목을 누르면 원문으로 가요.</p><ul class="srcs">${(st.sources ?? []).map(srcItem).join("")}</ul>`;
  }
  if (fromAX(st)) return `<p><a href="https://fred.stlouisfed.org/series/RAMPAIALL" target="_blank" rel="noopener">Ramp AI Index</a> (Ramp Economics Lab) · FRED, 세인트루이스 연방준비은행 — 미국 기업 7만여 곳의 법인카드·송금 기록으로 AI 도구에 돈을 낸 회사 비율을 매달 잽니다. 무료 도구와 개인 결제는 잡히지 않아요. 지금 숫자는 <a href="/#ax">AX 탭</a>에.</p>`;
  return `<p>npm · PyPI 다운로드(설치 횟수이지 사용자 수가 아니에요), arXiv, Hugging Face, SEC 공시를 매일 같은 방식으로 계산했어요. 방법과 검산은 <a href="/#more">근거 데이터</a>에.</p>`;
}
// a briefing's text: paragraphs, and a paragraph whose every line starts with "· " is a list (the checks of the
// IT-consulting view). `used`: the words already made tappable in this briefing (trends/glossary.mjs → termify — each
// explained once, at its first mention)
const paras = (t, used = null) => plain(t).split(/\n{2,}/).map((p) => {
  const tip = (h) => (used ? termify(h, used) : h), lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length && lines.every((l) => /^[·•\-]\s/.test(l)) ? `<ul class="asks">${lines.map((l) => `<li>${tip(esc(l.replace(/^[·•\-]\s+/, "")))}</li>`).join("")}</ul>`
    : `<p>${tip(esc(p).replace(/\n/g, "<br />"))}</p>`;
}).join("");
// a case's head (story.mjs → section.case, 2026-10-26): its IT domain and the way it went in, the heading, and the case
// as a small table — who, what, where, how, and the question to ask of one's own project
const CASE_ROWS = [["who", "누가"], ["what", "무엇을"], ["where", "어디에"], ["how", "어떻게"]];
const caseHead = (x, i) => `<header class="case-h" id="s${i + 1}"><p class="case-k">${esc(x.case.domain)} · ${esc(x.case.method)}</p><h2>${esc(plain(x.heading))}</h2>`
  + `<dl class="case">${CASE_ROWS.map(([k, l]) => `<div${x.case[k] === "발표에 없음" ? ' class="none"' : ""}><dt>${l}</dt><dd>${esc(x.case[k])}</dd></div>`).join("")}<div class="q"><dt>확인할 점</dt><dd>${esc(x.case.check)}</dd></div></dl></header>`;
const item = (b) => `<li><a class="card" href="/briefs/${b.slot}"><span class="k">${esc(SERIES[b.series]?.name ?? "")} · ${day(b.st.date)}</span><span class="t">${esc(plain(b.st.article.title))}</span><span class="l">${esc(plain(b.st.article.lede))}</span></a>${chips(b) ? `<div class="chips">${chips(b)}</div>` : ""}</li>`;
// newest first, a heading per month
const byMonth = (list) => {
  const groups = new Map();
  for (const b of list) { const m = b.st.date.slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(b); }
  return [...groups].map(([m, l]) => `<h2 class="month">${+m.slice(0, 4)}년 ${+m.slice(5)}월</h2><ul class="list">${l.map(item).join("")}</ul>`).join("");
};
const present = Object.keys(SERIES).filter((id) => briefs.some((b) => b.series === id));
const tabs = (cur) => present.length > 1 ? `<nav class="tabs" aria-label="시리즈"><a href="/briefs"${cur ? "" : ' aria-current="page"'}>전체 <span>${briefs.length}</span></a>${present.map((id) => `<a href="/briefs/series/${id}"${cur === id ? ' aria-current="page"' : ""}>${esc(SERIES[id].name)} <span>${briefs.filter((b) => b.series === id).length}</span></a>`).join("")}</nav>` : "";
// the phone install box (PWA) and the push alerts (OneSignal: the topics are tags, social/notify.mjs sends to them)
const INSTALL = `<aside class="install" id="install">
  <div class="row"><b>폰에 설치하기</b><span>홈 화면에 앱처럼 두고 새 브리핑을 바로 확인하세요.</span><button type="button" id="install-btn" hidden>앱 설치</button></div>
  <small id="install-ios" hidden>아이폰: 사파리 공유 버튼 → "홈 화면에 추가" (알림도 홈 화면에 추가한 뒤 켤 수 있어요)</small>
  <div class="row alerts"><b>새 브리핑 알림</b>
    <label><input type="checkbox" value="news" checked /> 이번 주 AX 사건</label>
    <label><input type="checkbox" value="monthly" checked /> 월간 리포트</label>
    <label><input type="checkbox" value="other" /> 그 밖의 브리핑</label>
    <button type="button" id="push-on">알림 받기</button><button type="button" id="push-off" class="ghost" hidden>알림 끄기</button>
  </div>
  <small id="push-state" aria-live="polite"></small>
</aside>
<script>
(() => { let ev; const $ = (id) => document.getElementById(id), standalone = matchMedia("(display-mode: standalone)").matches, ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone) document.querySelector(".install .row").hidden = true;
  else if (ios) $("install-ios").hidden = false;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); ev = e; $("install-btn").hidden = false; });
  $("install-btn").addEventListener("click", async () => { if (!ev) return; ev.prompt(); await ev.userChoice; ev = null; $("install-btn").hidden = true; });
})();
</script>
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async (OneSignal) => {
  await OneSignal.init({ appId: "${APP_ID}", serviceWorkerPath: "sw.js", serviceWorkerParam: { scope: "/" } });
  const $ = (id) => document.getElementById(id), boxes = [...document.querySelectorAll(".alerts input")];
  const show = async () => {
    const on = OneSignal.Notifications.permission && OneSignal.User.PushSubscription.optedIn;
    const tags = on ? await OneSignal.User.getTags() : {};
    if (on) boxes.forEach((b) => (b.checked = tags[b.value] === "1"));
    $("push-on").textContent = on ? "주제 저장" : "알림 받기"; $("push-off").hidden = !on;
    $("push-state").textContent = on ? "알림이 켜져 있어요. 주제를 바꾸고 저장할 수 있어요." : "";
  };
  $("push-on").addEventListener("click", async () => {
    const picked = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!picked.length) { $("push-state").textContent = "받을 주제를 하나 이상 골라 주세요."; return; }
    if (!OneSignal.Notifications.isPushSupported()) { $("push-state").textContent = /iphone|ipad|ipod/i.test(navigator.userAgent) ? "아이폰은 먼저 홈 화면에 추가한 뒤, 그 앱에서 알림을 켤 수 있어요." : "이 브라우저는 알림을 지원하지 않아요."; return; }
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) { $("push-state").textContent = "브라우저에서 알림이 허용되지 않았어요."; return; }
    await OneSignal.User.PushSubscription.optIn();
    await OneSignal.User.addTags(Object.fromEntries(boxes.map((b) => [b.value, b.checked ? "1" : "0"])));
    await show(); $("push-state").textContent = "알림을 켰어요. 새 브리핑이 올라오면 알려 드릴게요.";
  });
  $("push-off").addEventListener("click", async () => { await OneSignal.User.PushSubscription.optOut(); await show(); $("push-state").textContent = "알림을 껐어요."; });
  OneSignal.User.PushSubscription.addEventListener("change", show);
  await show();
});
</script>`;

// phone: the briefing as pages turned sideways (/pager.js), like the cards it explains and like every page of the site —
// the title page, then the text a screenful at a time (a section's heading stays with its first paragraph, so no page
// starts with a heading alone and nothing is cut off under a button), the summary, the sources, what to read next.
// A briefing told as cases (its sections named, data-name) turns a chapter per section instead — 사례 1, 사례 2 …,
// 공통 흐름, 관점 — each starting on a page of its own with its table, like a case card, and continuing under its heading
const ARTICLE_PAGER = `<script type="module">
import { pager } from "/pager.js";
const art = document.querySelector("article.brief"), $ = (s) => art.querySelector(s), parts = [...art.querySelectorAll(".part")];
const div = () => Object.assign(document.createElement("div"), { className: "flow" });
const text = parts.length && parts.every((s) => s.dataset.name)
  // (the source line goes with the paragraph before it, so it never makes a page of its own)
  ? parts.map((s, i) => { const [h, ...rest] = [...s.children], items = rest.length > 1 && rest.at(-1).matches(".src") ? [...rest.slice(0, -2), rest.slice(-2)] : rest;
      return { id: h.id || \`s\${i + 1}\`, name: s.dataset.name, lead: [h], head: h.querySelector("h2") ?? h, items, list: div }; })
  : [{ id: "text", name: "본문", items: parts.flatMap((s) => { const k = [...s.children]; return k.length > 1 ? [[k[0], k[1]], ...k.slice(2)] : k; }), list: div }];
const hint = Object.assign(document.createElement("p"), { className: "pg-hint" }); hint.append("옆으로 넘기면 ", Object.assign(document.createElement("b"), { textContent: text[0].name }), " →");
pager([
  { id: "top", name: "브리핑", pages: [[$(".art-head"), hint]] },
  ...text,
  { id: "sum", name: "정리", pages: [[$(".sum")]] },
  { id: "basis", name: "근거", pages: [[$(".basis")]] },
  { id: "next", name: "더 읽기", pages: [[$(".pn"), $(".rel"), $(".more-links")]] },
], { tab: () => "briefs" });
</script>`;

const CSS = `
  /* the briefings read like the rest of the site (2026-10-25): plain labels, hairline rules, bronze only where it means
     something — no pills, no boxed cards. main's children sit on their own margins (no grid gap between every line). */
  main{gap:0}
  main>*,article{min-width:0}
  .kicker{width:fit-content;font-size:13px;color:var(--mut);margin:28px 0 12px}
  .kicker b{color:var(--bronze-hi);font-weight:600;margin-right:8px} .kicker a{color:var(--ink-2)}
  article{max-width:720px}
  h1.page{font-size:clamp(28px,4.4vw,40px);line-height:1.25;letter-spacing:-.03em;margin:0 0 12px;word-break:keep-all}
  .lede{font-size:18px;line-height:1.75;color:var(--ink-2);margin:0 0 8px}
  .meta{font-size:13px;color:var(--dim);margin:0 0 14px}
  article h2{font-size:21px;line-height:1.4;letter-spacing:-.02em;margin:44px 0 12px}
  article p{font-size:16.5px;line-height:1.85;color:var(--ink-2);margin:0 0 14px}
  .src{font-size:13.5px;color:var(--mut);margin:6px 0 0;padding-left:12px;border-left:2px solid var(--bronze-line)}
  .src a{color:var(--mut)} .src a:hover{color:var(--ink)}
  /* a case (2026-10-26): its IT domain and the way it went in, the heading, then a small table — no box, hairlines */
  .case-h{margin:44px 0 0} .case-h h2{margin:6px 0 14px}
  .case-k{font-size:13px;color:var(--mut);margin:0}
  .case{margin:0 0 20px;border-top:1px solid var(--line-2)}
  .case>div{display:grid;grid-template-columns:76px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
  .case dt{font-size:13px;color:var(--mut);padding-top:2px} .case dd{margin:0;font-size:15.5px;line-height:1.55;color:var(--ink)}
  .case .none dd{color:var(--dim)} .case .q dd{font-weight:600}
  ul.asks{margin:0 0 14px;padding-left:20px;list-style:disc} ul.asks li{font-size:16.5px;line-height:1.75;color:var(--ink-2);margin:2px 0} ul.asks li::marker{color:var(--dim)}
  .sum{margin:44px 0 0;padding:18px 0 0;border-top:2px solid var(--bronze-line)}
  .sum h2{margin:0 0 10px;font-size:17px} .sum ul{margin:0;padding-left:18px} .sum li{font-size:15.5px;line-height:1.75;color:var(--ink-2)}
  .basis{margin:36px 0 0} .basis h2{font-size:15px;margin:0 0 8px;color:var(--ink)} .basis p{font-size:14px;line-height:1.7;color:var(--mut)}
  .srcs{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:14px} .srcs .d{color:var(--dim);font-size:12.5px}
  .chips{display:flex;flex-wrap:wrap;gap:4px 14px;margin:10px 0 0}
  .chip{font-size:13px;color:var(--mut)} .chip::before{content:"#";color:var(--dim);margin-right:1px} .chip:hover{color:var(--ink);text-decoration:underline}
  .pn{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:40px 0 0}
  .pn a{display:block;padding:14px 0;border-top:1px solid var(--line-2);color:var(--ink-2);font-size:14.5px;line-height:1.5}
  .pn a:hover{text-decoration:none} .pn small{display:block;color:var(--dim);font-size:12px;margin-bottom:2px} .pn .next{text-align:right}
  .rel{margin:36px 0 0} .rel h2{font-size:15px;margin:0 0 10px}
  .more-links{display:flex;flex-wrap:wrap;gap:10px 18px;margin:28px 0 0;font-size:14px}
  .tabs{display:flex;flex-wrap:wrap;gap:2px;margin:4px 0 8px;border-bottom:1px solid var(--line)}
  .tabs a{font-size:14px;padding:8px 10px;border-bottom:2px solid transparent;margin-bottom:-1px;color:var(--mut)} .tabs a:hover{color:var(--ink);text-decoration:none}
  .tabs a[aria-current]{color:var(--ink);border-bottom-color:var(--bronze)} .tabs span{color:var(--dim);font-size:12.5px;margin-left:2px}
  h2.month{font-size:15px;color:var(--mut);font-weight:600;margin:32px 0 10px}
  .list{list-style:none;margin:0;padding:0;display:grid;max-width:760px;border-top:1px solid var(--line-2)}
  .list li{padding:0 0 12px;border-bottom:1px solid var(--line)}
  .list .card{display:block;padding:16px 0 4px;color:var(--ink-2);text-decoration:none}
  .list .card:hover .t{text-decoration:underline;text-underline-offset:3px}
  .list .t{display:block;font-size:18px;font-weight:650;color:var(--ink);margin:6px 0 6px;line-height:1.4;letter-spacing:-.02em}
  .list .k{font-size:12.5px;color:var(--bronze-hi)} .list .l{font-size:14.5px;line-height:1.65;color:var(--mut);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .list .chips{margin:6px 0 0}
  .intro{font-size:16px;color:var(--mut);max-width:640px;margin:0 0 20px}
  .install{display:grid;gap:10px;max-width:760px;margin:0 0 24px;padding:14px 0;border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);font-size:14px;color:var(--ink-2)}
  .install .row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px} .install b{color:var(--ink)}
  .install .alerts{padding-top:10px;border-top:1px solid var(--line)} .install label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
  .install input{accent-color:var(--bronze);width:16px;height:16px}
  .install button{font:inherit;font-weight:600;padding:7px 14px;border-radius:var(--radius-cta);border:0;background:var(--bronze);color:#120e09;cursor:pointer}
  .install .row button:first-of-type{margin-left:auto} .install button.ghost{background:none;border:1px solid var(--line-2);color:var(--mut)}
  .install small{color:var(--mut)} .install small:empty{display:none} .install [hidden]{display:none}
  /* a wide screen gets the alerts only: installing on the home screen is a phone thing */
  @media(min-width:641px){ .install>.row:first-child,#install-ios{display:none} .install .alerts{padding-top:0;border-top:0} }
  @media(max-width:640px){
    main{gap:14px;padding-top:6px} .kicker{margin:14px 0 4px} .intro{margin-bottom:6px} h2.month{margin:18px 0 8px}
    h1.page{font-size:28px}
    .pn{grid-template-columns:1fr}.pn .next{text-align:left}
  }
  /* phone pages (pager.js): the title page, the text a screenful at a time, the summary, the sources, what to read next */
  .pg .art-head{margin:auto 0}
  .pg .art-head .kicker{margin-top:0}
  .pg .flow h2{margin:0 0 12px;font-size:21px} .pg .flow h2:not(:first-child){margin-top:26px}
  .pg .flow p{font-size:16px;line-height:1.8}
  .pg .flow .case-h{margin:0} .pg .flow .case-h:not(:first-child){margin-top:26px} .pg .flow .case-h h2{margin:6px 0 12px}
  .pg .flow ul.asks li{font-size:15.5px}
  .pg>.sum,.pg>.basis,.pg>.pn,.pg>.rel{margin:0}
  .pg>.pn+.rel,.pg>.pn+.more-links,.pg>.rel+.more-links{margin-top:28px}
  .pg .pg-hint{margin:28px 0 0;font-size:13.5px;color:var(--mut)} .pg .pg-hint b{color:var(--ink-2);font-weight:600}
`;

// ---------- write ----------
fs.mkdirSync(DIR, { recursive: true });
const written = new Set();
const put = (rel, html) => {
  const f = path.join(DIR, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  written.add(rel);
  if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== html) { fs.writeFileSync(f, html); console.log(`wrote briefs/${rel}`); }
};

for (const b of [...briefs, ...pending]) {
  const { st, post } = b, a = st.article;
  const used = new Set();
  // a briefing of announcements names its sections for the phone's pages: a case (one source), the common thread
  // (several), the view (none); any other briefing reads as one text
  let n = 0;
  const names = a.sections.every((x) => x.sources) && a.sections.some((x) => x.sources?.length === 1)
    ? a.sections.map((x) => (x.sources.length === 1 ? `사례 ${++n}` : x.sources.length > 1 ? "공통 흐름" : "관점")) : null;
  const sections = a.sections.map((x, i) => `<section class="part${x.case ? " case-part" : ""}"${names ? ` data-name="${names[i]}"` : ""}>${x.case ? caseHead(x, i) : `<h2 id="s${i + 1}">${esc(plain(x.heading))}</h2>`}${paras(x.body, used)}${x.sources?.length ? `<p class="src">출처 · ${x.sources.map((s) => `<a href="${href(s.link)}" target="_blank" rel="noopener">${esc(s.source)} ${KIND[s.kind] ?? "발표"} · ${md(s.date)}</a>`).join(" / ")}</p>` : ""}${x.briefs?.length ? `<p class="src">근거 브리핑 · ${x.briefs.filter((s) => bySlot.has(s)).map((s) => `<a href="/briefs/${s}">${esc(plain(bySlot.get(s).st.article.title))}</a>`).join(" / ")}</p>` : ""}</section>`).join("");
  // a pending draft is in no list, so it has no previous or next (its related briefings are public ones)
  const same = briefs.filter((x) => x.series === b.series), i = same.indexOf(b), newer = i < 0 ? null : same[i - 1], older = i < 0 ? null : same[i + 1];
  const related = briefs.filter((x) => x !== b).map((x) => ({ x, n: x.keys.filter((k) => b.keys.includes(k)).length })).filter((r) => r.n).sort((p, q) => q.n - p.n || q.x.st.date.localeCompare(p.x.st.date)).slice(0, 3).map((r) => r.x);
  // one article: on a wide screen the sections one after another; on a phone pages turned sideways (ARTICLE_PAGER)
  const body = `<article class="brief">
  <header class="art-head">
  <div class="kicker"><b>AX 브리핑</b><a href="/briefs/series/${b.series}">${esc(SERIES[b.series]?.name ?? st.format_name ?? "")}</a></div>
  <h1 class="page">${esc(plain(a.title))}</h1>
  <p class="lede">${esc(plain(a.lede))}</p>
  <p class="meta">${day(st.date)} · ${NAME}</p>
  ${chips(b) ? `<div class="chips">${chips(b)}</div>` : ""}
  </header>
  ${sections}
  ${a.takeaways?.length ? `<section class="sum"><h2>정리</h2><ul>${a.takeaways.map((t) => `<li>${esc(plain(t))}</li>`).join("")}</ul></section>` : ""}
  <section class="basis"><h2>근거</h2>${basis(b)}</section>
  ${newer || older ? `<nav class="pn" aria-label="같은 시리즈">${older ? `<a href="/briefs/${older.slot}"><small>← 이전 ${esc(SERIES[b.series].name)}</small>${esc(plain(older.st.article.title))}</a>` : "<span></span>"}${newer ? `<a class="next" href="/briefs/${newer.slot}"><small>다음 ${esc(SERIES[b.series].name)} →</small>${esc(plain(newer.st.article.title))}</a>` : ""}</nav>` : ""}
  ${related.length ? `<section class="rel"><h2>같이 읽기</h2><ul class="list">${related.map(item).join("")}</ul></section>` : ""}
  <div class="more-links"><a href="/briefs">← 브리핑 전체</a>${post?.published?.permalink ? `<a href="${href(post.published.permalink)}" target="_blank" rel="noopener">인스타그램 카드로 보기</a>` : ""}<a href="/">오늘의 AX 지표</a></div>
</article>
${termsSource(used)}
<script src="/terms.js" defer></script>
${ARTICLE_PAGER}`;
  put(`${b.slot}.html`, shell({ path: `/briefs/${b.slot}`, title: `${esc(plain(a.title))} · ${NAME}`, desc: esc(plain(a.lede).slice(0, 150)), css: CSS, body, paged: true, noindex: Boolean(b.pending) }));
}

// phone: a list page as pages turned sideways (/pager.js) — the heading and as many briefings as fit, then a screenful at a
// time, and a last page for installing and alerts (so the floating install bar goes)
const LIST_PAGER = `<script type="module">
import { pager } from "/pager.js";
const m = document.querySelector("main"), items = [...m.querySelectorAll(".list>li")], install = document.getElementById("install");
const lead = [...m.children].filter((x) => !x.matches("h2.month, ul.list, #install, script"));
if (document.documentElement.classList.contains("paged")) document.getElementById("appbar")?.remove();
pager([
  items.length ? { id: "list", name: "브리핑", lead, items, list: () => Object.assign(document.createElement("ul"), { className: "list" }) } : { id: "list", name: "브리핑", pages: [lead] },
  { id: "alerts", name: "알림 받기", pages: [[install]] },
], { tab: () => "briefs" });
</script>`;
const listPage = ({ p, title, desc, kicker, h, intro, list, cur }) => shell({ path: p, title, desc, css: CSS, paged: true, body: `<div class="kicker"><b>AX 브리핑</b>${kicker}</div>
  <h1 class="page">${h}</h1>
  <p class="intro">${intro}</p>
  ${INSTALL}
  ${tabs(cur)}
  ${list.length ? byMonth(list) : `<p class="intro">첫 브리핑을 준비하고 있어요.</p>`}
  ${LIST_PAGER}` });

put("index.html", listPage({ p: "/briefs", title: `AX 브리핑 · ${NAME}`, desc: "기업의 AI 전환(AX)을 숫자와 공식 발표로 풀어 쓴 글. 인스타그램 카드의 긴 버전이에요.", kicker: "카드의 긴 버전", h: "AX 브리핑",
  intro: `인스타그램에 올린 이야기를 더 자세히 풀어 쓴 글이에요. 숫자는 매일 재는 데이터에서, 사건은 회사·정부가 직접 낸 발표에서만 가져와요. <a href="/briefs/feed.xml">RSS</a>`, list: briefs, cur: null }));
for (const id of present) put(`series/${id}.html`, listPage({ p: `/briefs/series/${id}`, title: `${SERIES[id].name} · AX 브리핑`, desc: SERIES[id].about, kicker: "시리즈", h: esc(SERIES[id].name), intro: esc(SERIES[id].about), list: briefs.filter((b) => b.series === id), cur: id }));
const KINDNAME = { theme: "주제", industry: "업종", company: "회사·기관" };
for (const t of TAGS.values()) put(`tag/${t.key}.html`, listPage({ p: `/briefs/tag/${t.key}`, title: `${t.name} · AX 브리핑`, desc: `${t.name}을 다룬 AX 브리핑 모음`, kicker: KINDNAME[t.kind], h: esc(t.name),
  intro: `${KINDNAME[t.kind]} '${esc(t.name)}'을 다룬 브리핑 ${t.briefs.length}편이에요. 시리즈를 가리지 않고 모았어요.`, list: t.briefs, cur: undefined }));

// RSS: the latest 30 public ones (their text through xml(): nothing XML forbids)
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>AX 브리핑 · ${NAME}</title>
<link>${SITE}/briefs</link>
<atom:link href="${SITE}/briefs/feed.xml" rel="self" type="application/rss+xml" />
<description>기업의 AI 전환(AX)을 숫자와 공식 발표로 풀어 쓴 글</description>
<language>ko</language>
${briefs.slice(0, 30).map((b) => `<item><title>${xml(b.st.article.title)}</title><link>${SITE}/briefs/${b.slot}</link><guid>${SITE}/briefs/${b.slot}</guid><pubDate>${new Date(`${b.st.date}T01:00:00Z`).toUTCString()}</pubDate><category>${xml(SERIES[b.series]?.name ?? "")}</category><description>${xml(b.st.article.lede)}</description></item>`).join("\n")}
</channel>
</rss>
`;
put("feed.xml", rss);

// a page whose briefing, series or tag went away goes too
for (const f of fs.readdirSync(DIR, { recursive: true }).map(String)) {
  const full = path.join(DIR, f);
  if (fs.statSync(full).isFile() && !written.has(f.replace(/\\/g, "/"))) { fs.rmSync(full); console.log(`removed briefs/${f}`); }
}

// the home page leads with a story, not numbers (2026-10-26): the newest weekly briefing (이번 주 AX 사건; else the newest
// that isn't a monthly roundup) in its beats — each case's IT domain and the way it went in, its heading, its first
// sentence, where and how, and its source — then the common thread and the IT-consulting view, and a link to the whole
// piece. Every sentence is the briefing's own (checked when it was written). Which section is which comes from its
// sources: one source is an announcement, several are the common thread, none (the last) is the view.
// the first n sentences of a paragraph (as many as fit in max characters, at least one)
const sentences = (t, n = 1, max = 180) => {
  const all = plain(t).replace(/\s+/g, " ").trim().match(/.+?[요다]\.(?=\s|$)|.+$/g) ?? [];
  return all.slice(0, n).reduce((out, x) => (!out || (out + " " + x).length <= max ? (out ? `${out} ${x.trim()}` : x.trim()) : out), "");
};
// a beat's IT domain and way in: the case's own (a briefing since 2026-10-26), else read by code from the announcement's
// title and summary (trends/series.mjs → DOMAINS, methodOf — the same reading as the site's list of announcements)
const NEWSDATA = read(path.join(ROOT, "trends", "data", "news.json"), { items: [] }).items ?? [];
const caseTag = (x) => {
  if (x.case) return `${x.case.domain} · ${x.case.method}`;
  const s = x.sources?.[0], n = s && NEWSDATA.find((y) => y.link === s.link), t = `${s?.title ?? ""} ${n?.summary ?? ""}`;
  const method = s && methodOf(t, s.kind);
  return s ? [domainOf(t, method)?.name, method].filter(Boolean).join(" · ") : "";
};
// public briefings only: a draft waiting for /approve is not the week's story yet
const featured = briefs.find((b) => b.series === "news") ?? briefs.find((b) => b.series !== "roundup") ?? null;
function storyHtml(b) {
  if (!b) return "";
  const a = b.st.article, secs = a.sections.map((x, i) => ({ ...x, i })), last = secs.at(-1);
  const view = secs.length > 1 && !last.sources?.length ? last : null, rest = secs.filter((x) => x !== view);
  const thread = rest.filter((x) => (x.sources?.length ?? 0) > 1), beats = rest.filter((x) => !thread.includes(x));
  const to = (x) => `/briefs/${b.slot}${x ? `#s${x.i + 1}` : ""}`;
  const src = (x) => (x.sources?.length === 1 ? `${esc(x.sources[0].source)} ${KIND[x.sources[0].kind] ?? "발표"} · ${md(x.sources[0].date)}` : "");
  const where = (x) => (x.case ? [["어디에", x.case.where], ["어떻게", x.case.how]].filter(([, v]) => v && v !== "발표에 없음").map(([l, v]) => `${l} ${esc(v)}`).join(" · ") : "");
  // the view: its checks when it lists them (the first three), else its paragraphs' first sentences
  const viewParts = (t) => plain(t).split(/\n{2,}/).map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean));
  const isList = (ls) => ls.length && ls.every((l) => /^[·•\-]\s/.test(l));
  const viewLines = (t) => { const ps = viewParts(t), list = ps.filter(isList).flat().map((l) => l.replace(/^[·•\-]\s+/, ""));
    return (list.length ? list : ps.map((ls) => sentences(ls.join(" "), 2, 170))).slice(0, 3); };
  const viewName = (x) => { const h = plain(x.heading).trim(), asks = viewParts(x.body).some(isList);
    return h === "IT 컨설팅 관점" ? `IT 컨설팅 관점${asks ? " · 확인할 점" : ""}` : `IT 컨설팅 관점 · ${h}`; };
  return `<div class="st-head"><p class="st-k">이번 주 AX 이야기 · <time datetime="${b.st.date}">${+b.st.date.slice(5, 7)}월 ${+b.st.date.slice(8, 10)}일</time> · ${esc(SERIES[b.series]?.name ?? "")}</p>`
    + `<h2 class="st-t" id="h-story"><a href="${to()}">${esc(plain(a.title))}</a></h2><p class="st-lede">${esc(plain(a.lede))}</p></div>`
    + `<ol class="beats">${beats.map((x, k) => `<li><a href="${to(x)}"><span class="bn">${k + 1}</span>${caseTag(x) ? `<span class="bk">${esc(caseTag(x))}</span>` : ""}<b>${esc(plain(x.heading))}</b><span class="bs">${esc(sentences(x.body))}</span>${where(x) ? `<span class="bw">${where(x)}</span>` : ""}${src(x) ? `<small>${src(x)}</small>` : ""}</a></li>`).join("")}</ol>`
    + `<div class="st-view">${thread.map((x) => `<p class="sv-k">공통 흐름</p><p class="sv-h">${esc(plain(x.heading).replace(/^공통 흐름\s*[:：]\s*/, ""))}</p><p>${esc(sentences(x.body, 3, 200))}</p>`).join("")}`
    + (view ? `<p class="sv-k">${esc(viewName(view))}</p>${viewLines(view.body).map((t) => `<p class="sv-q">${esc(t)}</p>`).join("")}` : "")
    + `<a class="st-more" href="${to()}">이야기 전체 읽기 →</a></div>`;
}
// the home page: the story above, then the earlier briefings (not the monthly roundups), and the shared frame (nav,
// sitemap with the briefings)
const home = briefs.filter((b) => b.series !== "roundup" && b !== featured).slice(0, 3).map((b) => `<li><a href="/briefs/${b.slot}"><time datetime="${b.st.date}">${md(b.st.date)}</time><span class="badge">${esc(SERIES[b.series]?.name ?? "브리핑")}</span><span class="et">${esc(plain(b.st.article.title))}</span><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a></li>`).join("");
// the glossary too: a posted briefing's new words join it (trends/glossary.mjs) as soon as the post is up
writePages({ "index.html": { "t-story": storyHtml(featured), "t-briefs": home, "t-glossary": glossaryHtml() } }, briefs[0]?.st.date ?? new Date().toISOString().slice(0, 10));
console.log(`${briefs.length} briefing(s), ${present.length} series, ${TAGS.size} tags at ${SITE}/briefs${pending.length ? ` — and ${pending.length} draft page(s), noindex and unlisted until posted: ${pending.map((b) => b.slot).join(", ")}` : ""}`);
