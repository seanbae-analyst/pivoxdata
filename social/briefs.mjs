// briefs.mjs — the site's research ("리서치", 2026-10-27: PivoxData is an IT-consulting research publication): every
// post's story explained at more length (story.json → article, written and checked by story.mjs) plus the monthly
// roundups (social/roundups/*.json, roundup.mjs), organized so they keep reading well as they pile up. One list of
// pieces (below: `briefs`, each with its format, topics and tags) makes every page, so a new piece shows up in all of
// them at once — the home page, the list, its format, its topics, its tags, related pieces, the RSS and the sitemap:
//  • /briefs                — the research list: newest first, a search box and two filters kept apart, 주제 (the
//                             IT domain) and 형식 (the series) — a16z's way of exploring — in the address (?q= &topic=
//                             &format=), so the back button and a shared link bring the same list back
//  • /briefs/<folder>       — one piece: format, topics, tags, sections with their sources, 근거, the indicators of
//                             its topics (Our World in Data's link from writing to data), previous/next in the format,
//                             related pieces (shared topics and tags)
//  • /briefs/topic/<id>     — one IT domain: its indicator (official announcements, 30 days), the pieces on it and the
//                             latest announcements in it — the page an indicator card links to
//  • /briefs/series/<id>    — one format (이번 주 AX 사건, 월간 AX 리포트, …)
//  • /briefs/tag/<kind>-<id> — one theme, industry or company across all formats
//  • /briefs/feed.xml       — RSS, for readers and (later) e-mail
//  • the home page's regions — this week's story, the latest pieces, the topics and the formats
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
import { DOMAINS, domainOf, methodOf } from "../trends/series.mjs";
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

// ---------- 주제 · 형식: what a piece is about, apart from the form it takes ----------
// The topic is the IT domain (trends/series.mjs → DOMAINS — the same seven the indicators count announcements by). A
// piece's topics come from its cases (story.mjs → case.domain), else from code reading the one announcement a section
// tells (domainOf / methodOf — the same reading as the site's list of announcements), most-told first; a monthly roundup
// takes the topics of the pieces it gathers. The format is the series (tags.mjs → SERIES).
const NEWSDATA = read(path.join(ROOT, "trends", "data", "news.json"), { items: [] }).items ?? [];
const readCase = (x) => {
  if (x.case) return { domain: x.case.domain, method: x.case.method };
  const s = x.sources?.length === 1 ? x.sources[0] : null; if (!s) return null;
  const n = NEWSDATA.find((y) => y.link === s.link), t = `${s.title ?? ""} ${n?.summary ?? ""}`, method = methodOf(t, s.kind);
  return { domain: domainOf(t, method)?.name ?? null, method };
};
const domainId = (name) => DOMAINS.find((d) => d.name === name)?.id ?? null;
const rankIds = (ids) => [...ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map())]
  .sort((a, b) => b[1] - a[1] || DOMAINS.findIndex((d) => d.id === a[0]) - DOMAINS.findIndex((d) => d.id === b[0])).map(([id]) => id);
for (const b of [...briefs, ...pending]) if (b.series !== "roundup") b.topics = rankIds(b.st.article.sections.map((x) => domainId(readCase(x)?.domain)).filter(Boolean));
for (const b of briefs) if (b.series === "roundup") b.topics = rankIds(b.st.article.sections.flatMap((x) => x.briefs ?? []).flatMap((s) => bySlot.get(s)?.topics ?? []));
const TOPIC = Object.fromEntries(DOMAINS.map((d) => [d.id, d]));
// the cover card of the piece's Instagram post (social/out/<slot>/01.png, on the site for Instagram already) as its
// picture in the lists, like a thumbnail; a roundup has none
for (const b of [...briefs, ...pending]) { const f = b.post?.images?.[0]; b.thumb = f && fs.existsSync(path.join(OUT, b.slot, f)) ? `/social/out/${b.slot}/${f}` : null; }

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
// (a theme that says what one of the piece's topics already says is left out of its chips — 보안·안전 next to 보안·규제,
// 인프라·클라우드 next to 클라우드·인프라; its tag page stays)
const SAME_AS_TOPIC = { infra: "cloud", security: "security", policy: "security", data: "data", work: "work" };
const chips = (b) => b.keys.filter((k) => TAGS.has(k) && !(k.startsWith("theme-") && (b.topics ?? []).includes(SAME_AS_TOPIC[k.slice(6)]))).map((k) => `<a class="chip ${TAGS.get(k).kind}" href="/briefs/tag/${k}">${esc(TAGS.get(k).name)}</a>`).join("");

// ---------- pieces ----------
const srcItem = (x) => `<li><a href="${href(x.link)}" target="_blank" rel="noopener">${esc(x.source)} ${KIND[x.kind] ?? "발표"} — ${esc(plain(x.title))}</a> <span class="d">${md(x.date)}</span></li>`;
function basis(b) {
  const st = b.st;
  if (b.series === "roundup") return `<p>${esc(st.month?.slice(5).replace(/^0/, ""))}월에 올린 리서치 ${st.briefs?.length ?? 0}편만으로 썼어요. 각 섹션 아래 링크가 근거가 된 리서치예요.</p>`;
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
// a piece in a list (Toss Tech's article row): its format and topics, the title, the lede in two lines, the date and
// what it rests on, and the cover card as its picture; then its tags. data-* is what the research list's search and
// filters read (the words of the title, the lede, the cases and the tags — not the whole text).
const topicNames = (b) => (b.topics ?? []).map((id) => TOPIC[id].name);
const rests = (b) => {
  if (b.series === "roundup") return `리서치 ${b.st.briefs?.length ?? 0}편을 묶음`;
  const cases = b.st.article.sections.filter((x) => x.sources?.length === 1).length, srcs = (b.st.sources ?? []).length;
  return [cases ? `사례 ${cases}건` : "", srcs ? `공식 발표 ${srcs}건` : ""].filter(Boolean).join(" · ");
};
const searchText = (b) => plain([b.st.article.title, b.st.article.lede, SERIES[b.series]?.name, ...topicNames(b),
  ...b.tags.themes.map((id) => THEMES.find((t) => t.id === id)?.name), ...b.tags.industries.map((id) => INDUSTRIES.find((t) => t.id === id)?.name), ...b.tags.companies.map((c) => c.name),
  ...b.st.article.sections.flatMap((x) => [x.heading, ...(x.case ? CASE_ROWS.map(([k]) => x.case[k]) : []), ...(x.sources ?? []).map((s) => s.source)]), ...(b.st.article.takeaways ?? [])]
  .filter(Boolean).join(" ")).replace(/\s+/g, " ").trim().toLowerCase();
const item = (b) => `<li class="r-item" id="r-${b.slot}" data-format="${b.series}" data-topics="${(b.topics ?? []).join(" ")}" data-q="${esc(searchText(b))}">`
  + `<a class="r-card" href="/briefs/${b.slot}"><span class="r-k"><b>${esc(SERIES[b.series]?.name ?? "")}</b>${topicNames(b).map((n) => `<span>${esc(n)}</span>`).join("")}</span>`
  + `<span class="r-t">${esc(plain(b.st.article.title))}</span><span class="r-l">${esc(plain(b.st.article.lede))}</span>`
  + `<span class="r-m"><time datetime="${b.st.date}">${day(b.st.date)}</time>${rests(b) ? `<span>${rests(b)}</span>` : ""}</span>`
  + `${b.thumb ? `<img class="r-th" src="${b.thumb}" alt="" width="1080" height="1350" loading="lazy" decoding="async" />` : ""}</a>`
  + `${chips(b) ? `<div class="chips">${chips(b)}</div>` : ""}</li>`;
const present = Object.keys(SERIES).filter((id) => briefs.some((b) => b.series === id));
const inTopic = (id) => briefs.filter((b) => b.topics?.includes(id));

// ---------- indicators (Our World in Data: the writing and the data it rests on, a link apart) ----------
// The numbers the home page's cards show (trends/build.mjs → insights.json, computed there — read here, not again):
// a topic's indicator is its IT domain's card, official announcements in the last 30 days, with who made the most;
// a piece told from the Ramp AI Index has the adoption card. Each links to its card on the home page.
const INS = read(path.join(ROOT, "trends", "data", "insights.json"), { topics: [] });
const CARDS = new Map((INS.topics ?? []).flatMap((t) => t.insights ?? []).map((c) => [c.id, c]));
const asOf = INS.built_at ? `${day(INS.built_at)} 기준` : "";
function indicator(cardId, { name = null, about = null, topic = null } = {}) {
  const c = CARDS.get(cardId), rank = c?.viz?.find((v) => v.kind === "rank")?.items?.slice(0, 3) ?? [], top = Math.max(1, ...rank.map((x) => x.value));
  if (!c && !name) return "";
  const label = esc(c?.k ?? `IT 영역 · ${name}`);
  return `<div class="ind" id="ind-${cardId}"><p class="ind-k">${topic ? `<a href="/briefs/topic/${topic}">${label}</a>` : label}</p>`
    + `<p class="ind-n"><b>${esc(c?.big ?? "0건")}</b><span>${esc(c?.bl ?? `최근 30일 공식 발표 · ${about ?? ""} 이야기`)}</span></p>`
    + (c?.title ? `<p class="ind-t">${esc(c.title)}</p>` : "")
    + (rank.length ? `<ol class="ind-bars">${rank.map((x) => `<li${x.value === top ? ' class="top"' : ""}><span class="n">${esc(x.name)}</span><i aria-hidden="true"><span style="width:${Math.round((x.value / top) * 100)}%"></span></i><span class="v">${esc(x.label)}</span></li>`).join("")}</ol>` : "")
    + `<p class="ind-src">${esc(c?.src ?? "회사·정부 공식 발표(뉴스룸·보도자료) · 최근 30일")}${asOf ? ` · ${asOf}` : ""}${c ? ` · <a href="/#c-${cardId}">지표에서 보기</a>` : ""}${topic ? ` · <a href="/briefs/topic/${topic}">주제 페이지</a>` : ""}</p></div>`;
}
const topicIndicator = (id) => indicator(`dom-${id}`, { name: TOPIC[id].name, about: TOPIC[id].about });
// a piece's 관련 지표 is the same block, but its numbers come in when the page opens (/briefs/indicators.json, written here
// every day): a published piece's page stays as it was written — it changes only when the piece does — and its
// indicators are today's. Without the file (offline, no JavaScript) the block keeps its links.
const indicatorShell = (cardId, topic = null) => {
  const c = CARDS.get(cardId), label = esc(c?.k ?? `IT 영역 · ${TOPIC[topic]?.name ?? ""}`);
  return `<div class="ind" id="ind-${cardId}" data-ind="${cardId}"><p class="ind-k">${topic ? `<a href="/briefs/topic/${topic}">${label}</a>` : label}</p>`
    + `<p class="ind-src"><a class="to-card" href="/#c-${cardId}">지표에서 보기</a>${topic ? ` · <a href="/briefs/topic/${topic}">주제 페이지</a>` : ""}</p></div>`;
};
const INDICATORS = { as_of: INS.built_at ?? null, cards: Object.fromEntries([
  ...[...CARDS].filter(([id]) => /^dom-|^ax-all$/.test(id)).map(([id, c]) => [id, { k: c.k, big: c.big, bl: c.bl, title: c.title, src: c.src, rank: c.viz?.find((v) => v.kind === "rank")?.items?.slice(0, 3) ?? [] }]),
  // (a domain with no announcement in 30 days has no card on the home page that day: 0건, and no link to a card)
  ...DOMAINS.filter((d) => !CARDS.has(`dom-${d.id}`)).map((d) => [`dom-${d.id}`, { k: `IT 영역 · ${d.name}`, big: "0건", bl: `최근 30일 공식 발표 · ${d.about} 이야기`, title: null, src: "회사·정부 공식 발표(뉴스룸·보도자료) · 최근 30일", rank: [], home: false }]),
]) };
// (filled in by the piece's page script — text only, never markup)
const FILL_INDICATORS = `
const fillIndicators = async () => {
  const boxes = [...document.querySelectorAll(".ind[data-ind]")]; if (!boxes.length) return false;
  try {
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), 4000);
  const data = await (await fetch("/briefs/indicators.json", { signal: stop.signal })).json(); clearTimeout(t);
  const day = (d) => d ? +d.slice(0, 4) + "년 " + +d.slice(5, 7) + "월 " + +d.slice(8, 10) + "일 기준" : "";
  const mk = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
  for (const box of boxes) {
    const c = data.cards?.[box.dataset.ind], src = box.querySelector(".ind-src"); if (!c) continue;
    if (c.home === false) { const a = src.querySelector(".to-card"); if (a) { a.nextSibling?.textContent?.startsWith(" · ") && a.nextSibling.remove(); a.remove(); } }
    const n = mk("p", "ind-n"); n.append(mk("b", null, c.big), mk("span", null, c.bl));
    const top = Math.max(1, ...c.rank.map((x) => x.value)), bars = mk("ol", "ind-bars");
    for (const x of c.rank) { const li = mk("li", x.value === top ? "top" : ""), i = mk("i"), fill = mk("span"); fill.style.width = Math.round((x.value / top) * 100) + "%"; i.append(fill); i.setAttribute("aria-hidden", "true"); li.append(mk("span", "n", x.name), i, mk("span", "v", x.label)); bars.append(li); }
    box.insertBefore(n, src); if (c.title) box.insertBefore(mk("p", "ind-t", c.title), src); if (c.rank.length) box.insertBefore(bars, src);
    src.prepend(c.src + (data.as_of ? " · " + day(data.as_of) : "") + (src.childElementCount ? " · " : ""));
  }
  return true;
  } catch { return false; }
};
`;
// the phone install box (PWA) and the push alerts (OneSignal: the topics are tags, social/notify.mjs sends to them)
const INSTALL = `<aside class="install" id="install">
  <div class="row"><b>폰에 설치하기</b><span>홈 화면에 앱처럼 두고 새 리서치를 바로 확인하세요.</span><button type="button" id="install-btn" hidden>앱 설치</button></div>
  <small id="install-ios" hidden>아이폰: 사파리 공유 버튼 → "홈 화면에 추가" (알림도 홈 화면에 추가한 뒤 켤 수 있어요)</small>
  <div class="row alerts" id="alerts"><b>새 리서치 알림</b>
    <label><input type="checkbox" value="news" checked /> 이번 주 AX 사건</label>
    <label><input type="checkbox" value="monthly" checked /> 월간 AX 리포트 · 월간 정리</label>
    <label><input type="checkbox" value="other" /> 그 밖의 리서치</label>
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
    $("push-on").textContent = on ? "알림 저장" : "알림 받기"; $("push-off").hidden = !on;
    $("push-state").textContent = on ? "알림이 켜져 있어요. 받을 형식을 바꾸고 저장할 수 있어요." : "";
  };
  $("push-on").addEventListener("click", async () => {
    const picked = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!picked.length) { $("push-state").textContent = "받을 형식을 하나 이상 골라 주세요."; return; }
    if (!OneSignal.Notifications.isPushSupported()) { $("push-state").textContent = /iphone|ipad|ipod/i.test(navigator.userAgent) ? "아이폰은 먼저 홈 화면에 추가한 뒤, 그 앱에서 알림을 켤 수 있어요." : "이 브라우저는 알림을 지원하지 않아요."; return; }
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) { $("push-state").textContent = "브라우저에서 알림이 허용되지 않았어요."; return; }
    await OneSignal.User.PushSubscription.optIn();
    await OneSignal.User.addTags(Object.fromEntries(boxes.map((b) => [b.value, b.checked ? "1" : "0"])));
    await show(); $("push-state").textContent = "알림을 켰어요. 새 리서치가 올라오면 알려 드릴게요.";
  });
  $("push-off").addEventListener("click", async () => { await OneSignal.User.PushSubscription.optOut(); await show(); $("push-state").textContent = "알림을 껐어요."; });
  OneSignal.User.PushSubscription.addEventListener("change", show);
  await show();
});
</script>`;

// a piece's contents beside it on a wide screen (/toc.js — on a phone the piece reads top to bottom): a case's section by its
// heading under 사례, the thread and the view under 흐름과 관점; a piece that reads as one text lists its section headings.
// Then today's numbers in 관련 지표 (briefs/indicators.json), so a published page does not change every day.
const ARTICLE_TOC = `<script type="module">
import { toc } from "/toc.js";
${FILL_INDICATORS}
const art = document.querySelector("article.brief"), $ = (s) => art.querySelector(s), parts = [...art.querySelectorAll(".part")];
const text = parts.length && parts.every((s) => s.dataset.name)
  ? parts.map((s, i) => { const h = s.firstElementChild, name = s.dataset.name, heading = (h.querySelector("h2") ?? h).textContent.trim();
      return { id: h.id || \`s\${i + 1}\`, title: heading.startsWith(name) ? heading : \`\${name} · \${heading}\`, group: name.startsWith("사례") ? "사례" : "흐름과 관점", pages: [[h]] }; })
  : [{ id: "text", title: "본문", group: "본문", items: [...art.querySelectorAll(".part h2")], count: 0, sub: (n) => ({ label: n.textContent }) }];
toc([
  { id: "top", title: "처음", pages: [[$(".art-head")]] },
  ...text,
  { id: "sum", title: "정리", group: "마무리", pages: [[$(".sum")]] },
  { id: "basis", title: "근거 · 출처", group: "마무리", pages: [[$(".basis")]] },
  { id: "data", title: "관련 지표", group: "마무리", pages: [[$(".inds")]] },
  { id: "next", title: "더 읽기", group: "마무리", pages: [[$(".pn") ?? $(".rel")]] },
]);
fillIndicators();
</script>`;
// 링크 복사 (Toss Tech's 공유하기): a phone's share sheet where there is one, else the address on the clipboard, else
// the address to copy by hand
const SHARE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>`;
const SHARE = `<script>
(() => { for (const b of document.querySelectorAll("[data-share]")) b.addEventListener("click", async () => {
  const url = location.origin + location.pathname, label = b.querySelector("span"), was = (b.dataset.label ||= label.textContent);
  clearTimeout(+b.dataset.t || 0);
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: document.title, url }); return; }
    await navigator.clipboard.writeText(url); label.textContent = "링크를 복사했어요";
    const say = document.querySelector("[data-share-status]"); if (say) say.textContent = "이 글의 링크를 복사했어요";
    // (a phone without a share sheet — an app's own browser — has the icon only: a toast says it, like 저장's)
    if (getComputedStyle(label).display === "none") { let t = document.querySelector(".pd-toast"); if (!t) { t = Object.assign(document.createElement("div"), { className: "pd-toast" }); t.setAttribute("role", "status"); document.body.append(t); }
      t.textContent = "이 글의 링크를 복사했어요"; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2400); }
  } catch (e) { if (e && e.name === "AbortError") return; prompt("이 주소를 복사하세요", url); }
  b.dataset.t = setTimeout(() => { label.textContent = was; }, 2400);
}); })();
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
    main{gap:14px;padding-top:6px} .kicker{margin:14px 0 4px} .intro{margin-bottom:6px}
    h1.page{font-size:28px}
    .pn{grid-template-columns:1fr}.pn .next{text-align:left}
  }
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
  const sections = a.sections.map((x, i) => `<section class="part${x.case ? " case-part" : ""}"${names ? ` data-name="${names[i]}"` : ""}>${x.case ? caseHead(x, i) : `<h2 id="s${i + 1}">${esc(plain(x.heading))}</h2>`}${paras(x.body, used)}${x.sources?.length ? `<p class="src">출처 · ${x.sources.map((s) => `<a href="${href(s.link)}" target="_blank" rel="noopener">${esc(s.source)} ${KIND[s.kind] ?? "발표"} · ${md(s.date)}</a>`).join(" / ")}</p>` : ""}${x.briefs?.length ? `<p class="src">근거 리서치 · ${x.briefs.filter((s) => bySlot.has(s)).map((s) => `<a href="/briefs/${s}">${esc(plain(bySlot.get(s).st.article.title))}</a>`).join(" / ")}</p>` : ""}</section>`).join("");
  // a pending draft is in no list, so it has no previous or next (its related briefings are public ones)
  const same = briefs.filter((x) => x.series === b.series), i = same.indexOf(b), newer = i < 0 ? null : same[i - 1], older = i < 0 ? null : same[i + 1];
  // related: the pieces sharing its topics first (a shared topic counts twice a shared tag), then the newest
  const shared = (x) => 2 * (x.topics ?? []).filter((t) => (b.topics ?? []).includes(t)).length + x.keys.filter((k) => b.keys.includes(k)).length;
  const related = briefs.filter((x) => x !== b).map((x) => ({ x, n: shared(x) })).filter((r) => r.n).sort((p, q) => q.n - p.n || q.x.st.date.localeCompare(p.x.st.date)).slice(0, 3).map((r) => r.x);
  // the data it rests on (Our World in Data): its topics' indicators, or the adoption rate for a piece told from it
  // (every topic it is listed under: the topic pages, the filter and this page agree)
  const tops = b.topics ?? [];
  const inds = tops.length ? tops.map((id) => indicatorShell(`dom-${id}`, id)).join("") : fromAX(st) ? indicatorShell("ax-all") : "";
  // one article: on a wide screen the sections one after another; on a phone pages turned sideways (ARTICLE_PAGER)
  const body = `<article class="brief">
  <header class="art-head">
  <div class="kicker"><b>리서치</b><a href="${b.pending ? "/briefs" : `/briefs/series/${b.series}`}">${esc(SERIES[b.series]?.name ?? st.format_name ?? "")}</a></div>
  <h1 class="page">${esc(plain(a.title))}</h1>
  <p class="lede">${esc(plain(a.lede))}</p>
  <p class="meta">${day(st.date)}${rests(b) ? ` · ${rests(b)}` : ""} · ${NAME}</p>
  ${tops.length ? `<p class="topics"><span>주제</span>${tops.map((id) => `<a href="/briefs/topic/${id}">${esc(TOPIC[id].name)}</a>`).join("")}</p>` : ""}
  ${chips(b) ? `<div class="chips">${chips(b)}</div>` : ""}
  <div class="act-row"><button type="button" class="share-btn" data-share>${SHARE_ICON}<span>공유하기</span></button><span class="sr" role="status" data-share-status></span></div>
  </header>
  ${sections}
  ${a.takeaways?.length ? `<section class="sum"><h2>정리</h2><ul>${a.takeaways.map((t) => `<li>${esc(plain(t))}</li>`).join("")}</ul></section>` : ""}
  <section class="basis"><h2>근거</h2>${basis(b)}</section>
  ${inds ? `<section class="inds" id="data" aria-labelledby="h-data"><h2 id="h-data">관련 지표</h2><p class="inds-intro">이 글이 다룬 주제를 매일 같은 방식으로 다시 센 숫자예요. '지표에서 보기'는 홈의 그 카드로, 주제 이름과 '주제 페이지'는 그 주제의 리서치와 발표로 가요.</p>${inds}</section>` : ""}
  ${newer || older ? `<nav class="pn" aria-label="같은 형식">${older ? `<a href="/briefs/${older.slot}"><small>← 이전 ${esc(SERIES[b.series].name)}</small>${esc(plain(older.st.article.title))}</a>` : "<span></span>"}${newer ? `<a class="next" href="/briefs/${newer.slot}"><small>다음 ${esc(SERIES[b.series].name)} →</small>${esc(plain(newer.st.article.title))}</a>` : ""}</nav>` : ""}
  ${related.length ? `<section class="rel"><h2>같이 읽기</h2><ul class="list r-list">${related.map(item).join("")}</ul></section>` : ""}
  <div class="more-links"><a href="/briefs">← 리서치 전체</a>${post?.published?.permalink ? `<a href="${href(post.published.permalink)}" target="_blank" rel="noopener">인스타그램 카드로 보기</a>` : ""}<a href="/">오늘의 AX 지표</a></div>
</article>
${termsSource(used)}
<script src="/terms.js" defer></script>
${SHARE}
${ARTICLE_TOC}`;
  put(`${b.slot}.html`, shell({ path: `/briefs/${b.slot}`, title: `${esc(plain(a.title))} · ${NAME}`, desc: esc(plain(a.lede).slice(0, 150)), css: CSS, body, noindex: Boolean(b.pending) }));
}

// ---------- the research list, its formats, topics and tags ----------
// /briefs: a search box and two filters kept apart — 주제 (IT domain) and 형식 (series), a16z's way. What is chosen is
// in the address (?q= &topic= &format=, history.replaceState), so a shared link and the back button bring the same list
// back; each option says how many pieces it would show with the rest as chosen. Without JavaScript every piece is listed.
const FINDER = `<script>
(() => {
  const form = document.querySelector("form.finder"), list = document.querySelector("ul.r-list"); if (!form || !list) return;
  const q = form.querySelector("input[name=q]"), items = [...list.querySelectorAll(".r-item")], empty = list.querySelector(".r-empty");
  const count = document.querySelector(".f-count .c"), resets = [...document.querySelectorAll(".f-reset")], opts = [...form.querySelectorAll("button[data-f]")];
  const norm = (t) => String(t ?? "").toLowerCase().replace(/\\s+/g, " ").trim();
  const read = () => { const u = new URLSearchParams(location.search); return { q: u.get("q") ?? "", topic: u.get("topic") ?? "", format: u.get("format") ?? "" }; };
  // an option the page doesn't have (a typo in an address, a topic with no pieces yet) shows everything, not nothing
  const known = (f, v) => !v || opts.some((o) => o.dataset.f === f && o.dataset.v === v);
  const match = (li, s) => (!s.topic || li.dataset.topics.split(" ").includes(s.topic)) && (!s.format || li.dataset.format === s.format)
    && norm(s.q).split(" ").filter(Boolean).every((w) => li.dataset.q.includes(w));
  let st = read(), timer = 0;
  function apply(write) {
    if (!known("topic", st.topic)) st.topic = "";
    if (!known("format", st.format)) st.format = "";
    let n = 0;
    for (const li of items) { const on = match(li, st); li.hidden = !on; if (on) n++; }
    if (empty) empty.hidden = n > 0;
    for (const o of opts) {
      const f = o.dataset.f, v = o.dataset.v, on = st[f] === v, c = items.filter((li) => match(li, { ...st, [f]: v })).length;
      o.setAttribute("aria-pressed", String(on)); o.querySelector(".n").textContent = c;
    }
    const narrowed = Boolean(st.q || st.topic || st.format);
    count.textContent = narrowed ? "리서치 " + n + "편 찾음" : "리서치 " + items.length + "편";
    resets.forEach((b) => { if (!b.closest(".r-empty")) b.hidden = !narrowed; });
    if (document.activeElement !== q && q.value !== st.q) q.value = st.q;
    if (write) {
      const u = new URLSearchParams(location.search);
      for (const k of ["q", "topic", "format"]) { if (st[k]) u.set(k, st[k]); else u.delete(k); }
      history.replaceState(history.state, "", location.pathname + (u.toString() ? "?" + u : ""));
    }
  }
  // (what was typed counts even when a button is pressed before the pause that applies it)
  const typed = () => { clearTimeout(timer); st.q = q.value.trim(); };
  for (const o of opts) o.addEventListener("click", () => { typed(); const f = o.dataset.f; st[f] = st[f] === o.dataset.v ? "" : o.dataset.v; apply(true); });
  // a syllable still being composed (Korean keyboards) is not searched until it is done
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { st.q = q.value.trim(); apply(true); }, 160); };
  q.addEventListener("input", (e) => { if (!e.isComposing) later(); });
  q.addEventListener("compositionend", later);
  form.addEventListener("submit", (e) => { e.preventDefault(); typed(); apply(true); q.blur(); });
  // 조건 지우기 goes away once pressed: the focus goes to the first filter, not to the top of the page
  for (const b of resets) b.addEventListener("click", () => { clearTimeout(timer); st = { q: "", topic: "", format: "" }; q.value = ""; apply(true);
    opts[0]?.focus({ preventScroll: true }); });
  // back to this page from a piece: the address holds the search, and a page kept in memory shows it again as it was
  addEventListener("pageshow", (e) => { if (e.persisted) { st = read(); q.value = st.q; apply(false); } });
  apply(false);
})();
</script>`;
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM21 21l-5.2-5.2"/></svg>`;
const option = (f, v, label, n) => `<button type="button" class="f-o" data-f="${f}" data-v="${v}" aria-pressed="${v ? "false" : "true"}">${esc(label)} <span class="n">${n}</span></button>`;
const listed = (list) => `<ul class="list r-list">${list.map(item).join("")}</ul>`;
const listPage = ({ p, title, desc, kicker, h, intro, list, finder = false }) => shell({ path: p, title, desc, css: CSS, body: `<div class="kicker"><b>리서치</b>${kicker}</div>
  <h1 class="page">${h}</h1>
  <p class="intro">${intro}</p>
  ${finder && list.length ? `<form class="finder" role="search" action="/briefs" method="get" aria-label="리서치 찾기">
    <div class="f-q">${SEARCH_ICON}<input type="search" name="q" placeholder="회사 · 사례 · 주제로 찾기" aria-label="리서치 검색" autocomplete="off" enterkeyhint="search" /></div>
    <div class="facet" role="group" aria-labelledby="f-topic"><span class="f-l" id="f-topic">주제</span><div class="f-os">${option("topic", "", "전체", list.length)}${DOMAINS.filter((d) => inTopic(d.id).length).map((d) => option("topic", d.id, d.name, inTopic(d.id).length)).join("")}</div></div>
    <div class="facet" role="group" aria-labelledby="f-format"><span class="f-l" id="f-format">형식</span><div class="f-os">${option("format", "", "전체", list.length)}${present.map((id) => option("format", id, SERIES[id].name, briefs.filter((b) => b.series === id).length)).join("")}</div></div>
  </form>
  <p class="f-count"><span class="c" aria-live="polite">리서치 ${list.length}편</span><button type="button" class="f-reset" hidden>조건 지우기</button></p>` : ""}
  ${list.length ? `<ul class="list r-list">${list.map(item).join("")}${finder ? `<li class="r-empty" hidden><p>조건에 맞는 리서치가 없어요.</p><button type="button" class="f-reset">조건 지우기</button></li>` : ""}</ul>` : `<p class="intro">첫 리서치를 준비하고 있어요.</p>`}
  ${INSTALL}
  ${finder ? FINDER : ""}
` });
// every topic page, for readers without the filters and for search engines (also linked from the home page and each piece)
const topicLinks = (cur) => `<nav class="r-more" aria-label="주제 페이지"><h2>주제 페이지</h2><p>${DOMAINS.map((d) => `<a href="/briefs/topic/${d.id}"${d.id === cur ? ' aria-current="page"' : ""}>${esc(d.name)} <span>${inTopic(d.id).length}</span></a>`).join("")}</p></nav>`;

put("index.html", listPage({ p: "/briefs", title: `리서치 · ${NAME}`, desc: "IT 컨설팅 관점의 AX 리서치 — 회사·정부의 공식 발표를 사례로 읽고, 매일 재는 지표와 함께 봐요.", kicker: "IT 컨설팅 관점의 AX", h: "리서치",
  intro: `회사·정부가 직접 낸 발표를 IT 컨설팅 사례(누가 · 무엇을 · 어디에 · 어떻게)로 읽고, 매일 재는 지표와 이어서 봐요. 주제는 IT 영역, 형식은 글의 꼴이에요. <a href="/briefs/feed.xml">RSS</a>`, list: briefs, finder: true }));
for (const id of present) put(`series/${id}.html`, listPage({ p: `/briefs/series/${id}`, title: `${SERIES[id].name} · 리서치`, desc: SERIES[id].about, kicker: "형식", h: esc(SERIES[id].name),
  intro: `${esc(SERIES[id].about)}. <a href="/briefs?format=${id}">리서치 목록에서 주제와 함께 고르기</a>`, list: briefs.filter((b) => b.series === id) }));
const KINDNAME = { theme: "테마", industry: "업종", company: "회사·기관" };
for (const t of TAGS.values()) put(`tag/${t.key}.html`, listPage({ p: `/briefs/tag/${t.key}`, title: `${esc(t.name)} · 리서치`, desc: `${esc(t.name)} 관련 AX 리서치 모음`, kicker: KINDNAME[t.kind], h: esc(t.name),
  intro: `${KINDNAME[t.kind]} '${esc(t.name)}' 관련 리서치 ${t.briefs.length}편이에요. 형식을 가리지 않고 모았어요.`, list: t.briefs }));

// /briefs/topic/<id> — one IT domain, the way Our World in Data lays out a topic: the indicator, the writing on it, and
// the latest announcements in it (their own pages, never copied). Every domain has one, with or without pieces yet.
const NEWS_TOPIC = (INS.news ?? []);
for (const d of DOMAINS) {
  // the announcements are the ranked ones the site lists (insights.json → news: the last 14 days, adoptions, deals and
  // rules first — trends/build.mjs), so the heading says 주요; the indicator above counts every one in 30 days
  const list = inTopic(d.id), news = NEWS_TOPIC.filter((n) => (n.domains ?? []).includes(d.name)).sort((a, b) => b.date.localeCompare(a.date));
  put(`topic/${d.id}.html`, shell({ path: `/briefs/topic/${d.id}`, title: `${d.name} · 리서치`, desc: `${d.name}(${d.about}) — 지표, 리서치, 최근 공식 발표`, css: CSS, body: `<div class="kicker"><b>주제</b>IT 영역</div>
  <h1 class="page">${esc(d.name)}</h1>
  <p class="intro">${esc(d.about)}. 이 영역의 AX를 지표 → 리서치 → 공식 발표 순으로 모았어요. 지표와 발표 목록은 매일 다시 계산돼요.</p>
  <section class="t-sec" id="data" aria-labelledby="h-t-data"><h2 id="h-t-data">지표</h2>${topicIndicator(d.id)}</section>
  <section class="t-sec" id="research" aria-labelledby="h-t-res"><h2 id="h-t-res">이 주제의 리서치 <span>${list.length}편</span></h2>${list.length ? listed(list) : `<p class="none">아직 이 주제를 주로 다룬 리서치가 없어요. 아래 공식 발표가 쌓이면 리서치로 이어져요. <a href="/briefs">리서치 전체 보기</a></p>`}</section>
  <section class="t-sec" id="news" aria-labelledby="h-t-news"><h2 id="h-t-news">최근 주요 공식 발표 <span>${news.length}건</span></h2>${news.length ? `<ul class="t-news">${news.map((n) => `<li><a href="${href(n.link)}" target="_blank" rel="noopener"><span class="d">${md(n.date)} · ${esc(n.source)}${n.method ? ` · ${esc(n.method)}` : ""}</span><span class="t">${esc(n.title)}</span></a></li>`).join("")}</ul><p class="src">회사·정부가 자기 도메인에 직접 낸 발표 가운데 도입 · 협력 · 정책 이야기만 고른 목록 · 최근 14일 · 제목을 누르면 원문으로 가요. 위 지표는 30일 동안의 발표를 모두 셌어요.</p>` : `<p class="none">최근 14일 동안 이 영역에서 주요 목록에 든 공식 발표는 없어요. 위 지표는 30일 동안의 발표를 모두 센 숫자예요.</p>`}</section>
  ${topicLinks(d.id)}
  ${INSTALL}` }));
}

// RSS: the latest 30 public ones (their text through xml(): nothing XML forbids)
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>AX 리서치 · ${NAME}</title>
<link>${SITE}/briefs</link>
<atom:link href="${SITE}/briefs/feed.xml" rel="self" type="application/rss+xml" />
<description>기업의 AI 전환(AX)을 숫자와 공식 발표로 풀어 쓴 글</description>
<language>ko</language>
${briefs.slice(0, 30).map((b) => `<item><title>${xml(b.st.article.title)}</title><link>${SITE}/briefs/${b.slot}</link><guid>${SITE}/briefs/${b.slot}</guid><pubDate>${new Date(`${b.st.date}T01:00:00Z`).toUTCString()}</pubDate><category>${xml(SERIES[b.series]?.name ?? "")}</category><description>${xml(b.st.article.lede)}</description></item>`).join("\n")}
</channel>
</rss>
`;
put("feed.xml", rss);
put("indicators.json", JSON.stringify(INDICATORS) + "\n");

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
// title and summary (readCase above)
const caseTag = (x) => { const c = readCase(x); return c ? [c.domain, c.method].filter(Boolean).join(" · ") : ""; };
// public briefings only: a draft waiting for /approve is not the week's story yet
const featured = briefs.find((b) => b.series === "news") ?? briefs.find((b) => b.series !== "roundup") ?? null;
function storyHtml(b) {
  if (!b) return "";
  const a = b.st.article, secs = a.sections.map((x, i) => ({ ...x, i })), last = secs.at(-1);
  const view = secs.length > 1 && !last.sources?.length ? last : null, rest = secs.filter((x) => x !== view);
  const thread = rest.filter((x) => (x.sources?.length ?? 0) > 1), beats = rest.filter((x) => !thread.includes(x));
  const to = (x) => `/briefs/${b.slot}${x ? `#s${x.i + 1}` : ""}`;
  const src = (x) => (x.sources?.length === 1 ? `${esc(x.sources[0].source)} ${KIND[x.sources[0].kind] ?? "발표"} · ${md(x.sources[0].date)}` : "");
  // the next sentences after the first, for the phone's case card (a page of its own has room for them)
  const more = (x) => { const all = plain(x.body).replace(/\s+/g, " ").trim().match(/.+?[요다]\.(?=\s|$)|.+$/g) ?? []; return all.slice(1, 3).reduce((o, t) => (!o || (o + " " + t).length <= 200 ? (o ? `${o} ${t.trim()}` : t.trim()) : o), ""); };
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
    + `<ol class="beats">${beats.map((x, k) => `<li id="case-${k + 1}"><a href="${to(x)}"><span class="bn">${k + 1}</span>${caseTag(x) ? `<span class="bk">${esc(caseTag(x))}</span>` : ""}<b>${esc(plain(x.heading))}</b><span class="bs">${esc(sentences(x.body))}</span>${more(x) ? `<span class="bs2">${esc(more(x))}</span>` : ""}${where(x) ? `<span class="bw">${where(x)}</span>` : ""}${src(x) ? `<small>${src(x)}</small>` : ""}</a></li>`).join("")}</ol>`
    + `<div class="st-view">${thread.map((x) => `<p class="sv-k">공통 흐름</p><p class="sv-h">${esc(plain(x.heading).replace(/^공통 흐름\s*[:：]\s*/, ""))}</p><p>${esc(sentences(x.body, 3, 200))}</p>`).join("")}`
    + (view ? `<p class="sv-k">${esc(viewName(view))}</p>${viewLines(view.body).map((t) => `<p class="sv-q">${esc(t)}</p>`).join("")}` : "")
    + `<a class="st-more" href="${to()}">이야기 전체 읽기 →</a></div>`;
}
// the home page: this week's story only — the list of pieces, their topics and formats are /briefs's, not repeated
// there (2026-10-27 owner: "겹치는 거 다 없애줘"); and the shared frame (nav, sitemap with every page)
writePages({ "index.html": { "t-story": storyHtml(featured), "t-glossary": glossaryHtml() } }, briefs[0]?.st.date ?? new Date().toISOString().slice(0, 10));
console.log(`${briefs.length} piece(s), ${present.length} format(s), ${DOMAINS.length} topic pages, ${TAGS.size} tags at ${SITE}/briefs${pending.length ? ` — and ${pending.length} draft page(s), noindex and unlisted until posted: ${pending.map((b) => b.slot).join(", ")}` : ""}`);
