// build.mjs — writes the lab's numbers into the pages, so every figure a reader (or a search engine)
// sees is in the HTML itself and traces back to lab/data/*.json. No bundler: each page stays a static
// file and the build only replaces marked regions:  <!--@name-->…<!--/@name-->  and  /*@name*/…/*/@name*/.
// Sentences that interpret the data are guarded by `expect`: if a re-fetch changes the fact a sentence
// rests on, the build stops instead of publishing a sentence that is no longer true.
//
// Usage: node lab/build.mjs   (run lab/verify.mjs first; npm run lab does fetch → verify → build)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The public address, in one place: canonical/OG URLs, JSON-LD, sitemap.xml and robots.txt all come from it.
// Moving to a custom domain = edit lab/site.txt (or set SITE_URL) and run `npm run lab:build`.
const SITE = (process.env.SITE_URL || fs.readFileSync(path.join(ROOT, "lab", "site.txt"), "utf8")).trim().replace(/\/$/, "");
const load = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, "lab", "data", `${id}.json`), "utf8"));
const CHECKS = JSON.parse(fs.readFileSync(path.join(ROOT, "lab", "data", "checks.json"), "utf8"));
if (CHECKS.checks.some((c) => !c.ok)) throw new Error("lab/data/checks.json has failed checks — run node lab/verify.mjs and fix first");

const failures = [];
const expect = (ok, what) => { if (!ok) failures.push(what); };

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lbl = (t) => (t.length === 6 ? `${t.slice(0, 4)}.${t.slice(4)}` : t);
const kmon = (t) => `${t.slice(0, 4)}년 ${+t.slice(4)}월`;
const jo = (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)) + "조";
const sjo = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + jo(Math.abs(v));
const spct = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + "%";
const won2jo = (v) => v / 1e12;
const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 1e4) / 1e4;
const argmax = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
const argmin = (arr, f) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));
const stat = (v, l, n) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div><div class="n">${n}</div></div>`;

// ---------- regions ----------
function region(html, name, content, file) {
  const a = new RegExp(`(<!--@${name}-->)[\\s\\S]*?(<!--/@${name}-->)`), b = new RegExp(`(/\\*@${name}\\*/)[\\s\\S]*?(/\\*/@${name}\\*/)`);
  if (a.test(html)) return html.replace(a, (_, x, y) => x + content + y);
  if (b.test(html)) return html.replace(b, (_, x, y) => x + content + y);
  throw new Error(`${file}: region @${name} not found`);
}
const has = (html, name) => html.includes(`<!--@${name}-->`) || html.includes(`/*@${name}*/`);

// ---------- shared chrome ----------
const MARK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V13M12 19V8M19 19V4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const NAV = `
<header class="topbar">
  <a class="brand" href="/"><span class="mark">${MARK}</span><span class="full">개인투자자 데이터 연구소</span><span class="short">데이터 연구소</span></a>
  <nav class="nav" aria-label="사이트"><a href="/#research">연구</a><a href="/trends">트렌드</a><a href="/maps">데이터 지도</a><a href="/check">파일 점검</a></nav>
</header>
`;
const FOOTER = `
<footer class="site">
  <span>개인투자자 데이터 연구소 · 무료·비상업 · 투자 권유를 하지 않습니다</span>
  <span class="links"><a href="/#principles">원칙</a><a href="/#research">연구</a><a href="/trends">기술 트렌드</a><a href="/maps">데이터 지도</a><a href="/check">파일 점검</a><a href="https://github.com/seanbae-analyst/pivoxdata" target="_blank" rel="noopener">Source</a></span>
</footer>
`;
function head(page, html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const url = SITE + page.path, img = `${SITE}/og/${page.og || "home"}.png`;
  const locale = /<html lang="en"/.test(html) ? "en_US" : "ko_KR";
  if (page.noindex) return `
<meta name="theme-color" content="#050505" />
<meta name="robots" content="noindex" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link rel="stylesheet" href="/ui.css" />
`;
  return `
<meta name="theme-color" content="#050505" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="${page.path === "/" ? "website" : "article"}" />
<meta property="og:site_name" content="개인투자자 데이터 연구소" />
<meta property="og:locale" content="${locale}" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${title.replace(/ · 개인투자자 데이터 연구소$/, "")}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${img}" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link rel="stylesheet" href="/ui.css" />
${page.dataset ? `<script type="application/ld+json">${JSON.stringify(dataset(page, title, desc, url))}</script>\n` : ""}`;
}
// schema.org Dataset for pages that publish a series (read by dataset search engines)
function dataset(page, title, desc, url) {
  const d = page.dataset();
  return {
    "@context": "https://schema.org", "@type": "Dataset", name: title.replace(/ · 개인투자자 데이터 연구소$/, ""), description: desc, url,
    inLanguage: "ko", isAccessibleForFree: true, temporalCoverage: d.coverage, dateModified: d.modified ?? fetched,
    creator: { "@type": "Organization", name: "개인투자자 데이터 연구소", url: SITE },
    isBasedOn: d.sources.map((x) => ({ "@type": "Dataset", name: x.name, publisher: { "@type": "Organization", name: "한국은행 ECOS" }, creator: { "@type": "Organization", name: x.by } })),
    usageInfo: d.usage ?? "ECOS 통계정보이용지침: 타 기관 작성 통계는 출처를 명시하여 비상업적으로 이용, 상업적 이용은 통계작성기관의 승인 필요",
    variableMeasured: d.variables,
  };
}

// ---------- data ----------
const holes = new Set(CHECKS.holes.credit);
const S = Object.fromEntries(["credit", "deposits", "unpaid", "mcap_kospi", "mcap_kosdaq", "kospi_close", "netbuy_individual", "netbuy_institution", "netbuy_foreign", "netbuy_other_foreign", "netbuy_other_corp", "hh_foreign_bal", "hh_assets_bal", "hh_foreign_tx", "hh_domestic_tx"].map((id) => [id, load(id)]));
const M = Object.fromEntries(Object.entries(S).map(([k, d]) => [k, Object.fromEntries(d.rows)]));
const fetched = S.credit.fetched_at;
const checkLi = (ids) => CHECKS.checks.filter((c) => ids.some((p) => c.id.startsWith(p))).map((c) => `<li class="${c.ok ? "" : "fail"}">${esc(c.fact)}</li>`).join("");

// ============ research/credit ============
function credit() {
  const months = S.credit.rows.map((r) => r[0]).filter((t) => t >= "199901");
  const last = months.at(-1);
  const cr = months.map((t) => (holes.has(t) ? null : r4(won2jo(M.credit[t]))));
  const dep = months.map((t) => r4(won2jo(M.deposits[t])));
  const change = months.map((t, i) => (i === 0 || cr[i] == null || cr[i - 1] == null ? null : r4(cr[i] - cr[i - 1])));
  const changePct = months.map((t, i) => (change[i] == null ? null : r2((cr[i] / cr[i - 1] - 1) * 100)));
  const ratioMonths = months.filter((t) => M.mcap_kospi[t] && M.mcap_kosdaq[t]);
  const mcap = ratioMonths.map((t) => r2(((M.mcap_kospi[t] + M.mcap_kosdaq[t]) * 1000) / 1e12));
  const ratio = ratioMonths.map((t, i) => r4((M.credit[t] / ((M.mcap_kospi[t] + M.mcap_kosdaq[t]) * 1000)) * 100));
  const kospiChg = (t) => { const p = months[months.indexOf(t) - 1]; return M.kospi_close[t] && M.kospi_close[p] ? (M.kospi_close[t] / M.kospi_close[p] - 1) * 100 : null; };

  const rows = months.map((t, i) => ({ t, cr: cr[i], dep: dep[i], ch: change[i], chp: changePct[i] })).filter((r) => r.cr != null);
  const peak = argmax(rows, (r) => r.cr), lastR = rows.at(-1);
  const drops = rows.filter((r) => r.ch != null);
  const dropWon = argmin(drops, (r) => r.ch), dropPct = argmin(drops, (r) => r.chp);
  const dropPct2 = argmin(drops.filter((r) => r.t !== dropPct.t), (r) => r.chp);
  const rr = ratioMonths.map((t, i) => ({ t, v: ratio[i], m: mcap[i] }));
  const rPeak = argmax(rr, (r) => r.v), rLast = rr.at(-1);
  const crAt = (t) => rows.find((r) => r.t === t).cr;
  expect(crAt(rLast.t) > crAt(rPeak.t) && rLast.m > rPeak.m, "ratio sentence: credit or market cap no longer grew since the ratio peak");
  const p2021 = argmax(rows.filter((r) => r.t.startsWith("2021")), (r) => r.cr);
  const mid = rows.filter((r) => r.t >= "202201" && r.t <= "202412");
  const midLo = argmin(mid, (r) => r.cr), midHi = argmax(mid, (r) => r.cr);
  const cd = rows.map((r) => ({ t: r.t, v: (r.cr / r.dep) * 100 }));
  const cdPeak = argmax(cd, (r) => r.v), cdLast = cd.at(-1);
  const depPeak = argmax(rows, (r) => r.dep);
  const first7 = rows.find((r) => r.cr >= 1);

  // guards for the sentences below
  expect(peak.t === "202605", `credit peak moved to ${peak.t}`);
  expect(dropWon.t === "202607", `largest won drop moved to ${dropWon.t}`);
  expect(dropPct.t === "200810" && dropPct2.t === "202003", `largest % drops are now ${dropPct.t}, ${dropPct2.t}`);
  expect(rPeak.t.startsWith("2021"), `ratio peak moved to ${rPeak.t}`);
  expect(p2021.t === "202108", `2021 peak moved to ${p2021.t}`);
  expect(midHi.cr < p2021.cr, "2022–2024 exceeded the 2021 peak");
  expect(first7?.t === "200703", `credit first ≥ 1조 in ${first7?.t}`);
  expect(cdPeak.t === "200706", `credit/deposit peak moved to ${cdPeak.t}`);
  expect(depPeak.t === peak.t, `deposit peak (${depPeak.t}) is no longer the credit peak month (${peak.t})`);
  expect([dropWon, dropPct, dropPct2].every((r) => kospiChg(r.t) < 0), "a largest-drop month no longer has a falling KOSPI");
  expect(M.unpaid["200704"] > 5e11 && M.unpaid["200705"] < 1e11, "the May 2007 미수금 drop is no longer in the data");

  const shiftMonths = months.filter((t) => t >= "200501" && t <= "200812");
  const m56 = months.filter((t) => t >= "200501" && t <= "200612");
  const u56 = m56.map((t) => won2jo(M.unpaid[t])), unp56 = { lo: Math.min(...u56), hi: Math.max(...u56) }, cr56hi = Math.max(...m56.map((t) => won2jo(M.credit[t])));
  expect(cr56hi < unp56.lo, "2005–06: credit was no longer below every month of 미수금");
  const D = {
    months, credit: cr, deposits: dep, change, changePct, ratioMonths, ratio, mcap,
    shift: { months: shiftMonths, unpaid: shiftMonths.map((t) => r4(won2jo(M.unpaid[t]))), credit: shiftMonths.map((t) => r4(won2jo(M.credit[t]))) },
    bands: { level: [{ from: "199901", to: "200204", text: "코스피만" }] },
    marks: {
      level: [{ at: peak.t, text: `${lbl(peak.t)} ${jo(peak.cr)}` }, { at: p2021.t, text: `${lbl(p2021.t)} ${jo(p2021.cr)}` }],
      ratio: [{ at: rPeak.t, text: `${lbl(rPeak.t)} ${rPeak.v.toFixed(2)}%` }],
      change: [{ at: dropWon.t, text: `${lbl(dropWon.t)} ${sjo(dropWon.ch)}` }, { at: "202003", text: `2020.03 ${sjo(rows.find((r) => r.t === "202003").ch)}` }],
      shift: [{ at: "200706", series: 1, text: `2007.06 ${jo(won2jo(M.credit["200706"]))}` }, { at: "200511", series: 0, text: `2005.11 ${jo(won2jo(M.unpaid["200511"]))}` }],
    },
    note: `출처: ECOS(한국은행, ${S.credit.source.compiled_by}·${S.mcap_kospi.source.compiled_by} 원자료) 901Y056·901Y014, ${fetched} 조회. 월말 잔고. 신용융자 1998-06·1998-12는 ECOS에 0으로 적혀 있어 빈칸. 비상업적 이용, 값 변경 없음. ${SITE}/research/credit`,
    csv: S.credit.rows.filter((r) => r[0] >= "199806").map(([t]) => [t, holes.has(t) ? "" : M.credit[t], M.deposits[t], M.unpaid[t], M.mcap_kospi[t] && M.mcap_kosdaq[t] ? M.mcap_kospi[t] + M.mcap_kosdaq[t] : ""]),
  };

  const stats = [
    stat(jo(peak.cr), `가장 컸던 달 · ${lbl(peak.t)}`, `1999년 이후 월말 잔고 중`),
    stat(jo(lastR.cr), `가장 최근 · ${lbl(lastR.t)}`, `가장 컸던 달보다 ${spct((lastR.cr / peak.cr - 1) * 100)}`),
    stat(sjo(dropWon.ch), `한 달에 가장 크게 준 금액 · ${lbl(dropWon.t)}`, `${spct(dropWon.chp)} · 같은 달 코스피 ${spct(kospiChg(dropWon.t))}`),
    stat(`${rLast.v.toFixed(2)}%`, `시가총액 대비 · ${lbl(rLast.t)}`, `가장 높았던 달은 ${lbl(rPeak.t)} ${rPeak.v.toFixed(2)}%`),
  ].join("");

  const reads = {
    level: `잔고는 2007년 처음 1조 원을 넘었고, ${kmon(p2021.t)} ${jo(p2021.cr)}로 고점을 찍은 뒤 2022~2024년에는 ${jo(midLo.cr)}~${jo(midHi.cr)} 사이에 머물렀습니다. 이후 다시 늘어 <b>${kmon(peak.t)} 말 ${jo(peak.cr)}로 1999년 이후 가장 컸습니다.</b>`,
    ratio: `금액으로는 ${kmon(peak.t)}이 가장 컸지만, <b>시장 크기에 견준 비율은 ${kmon(rPeak.t)}(${rPeak.v.toFixed(2)}%)이 가장 높았습니다.</b> ${kmon(rLast.t)} 비율은 ${rLast.v.toFixed(2)}%입니다. 그사이 신용융자는 ${jo(crAt(rPeak.t))}에서 ${jo(crAt(rLast.t))}로 ${Math.round((crAt(rLast.t) / crAt(rPeak.t) - 1) * 100)}% 늘었고, 코스피·코스닥 시가총액 합은 ${Math.round(rPeak.m).toLocaleString("ko-KR")}조에서 ${Math.round(rLast.m).toLocaleString("ko-KR")}조로 ${Math.round((rLast.m / rPeak.m - 1) * 100)}% 늘었습니다. “사상 최대”라는 말은 금액 기준일 때만 맞습니다.`,
    change: `원으로는 <b>${kmon(dropWon.t)}(${sjo(dropWon.ch)}, ${spct(dropWon.chp)})</b>에 가장 많이 줄었습니다. 비율로는 ${kmon(dropPct.t)}(${spct(dropPct.chp)})과 ${kmon(dropPct2.t)}(${spct(dropPct2.chp)})이 가장 컸습니다. 세 달 모두 코스피 월말 종가가 전달보다 낮았습니다(${[dropWon, dropPct, dropPct2].map((r) => `${lbl(r.t)} ${spct(kospiChg(r.t))}`).join(", ")}). ${dropWon.t === "202607" ? `2026년 7월에는 28·29일 이틀 연속 서킷브레이커가 발동됐습니다(${`<a href="https://news.mtn.co.kr/news-detail/2026080416155599328" target="_blank" rel="noopener">머니투데이방송 2026-08-04</a>`}). ` : ""}같은 달에 일어났다는 사실까지만 이 표로 말할 수 있습니다.`,
    deposit: `예탁금은 ${kmon(depPeak.t)} ${jo(depPeak.dep)}로 가장 많았습니다. 예탁금에 견준 신용융자는 <b>${kmon(cdPeak.t)} ${cdPeak.v.toFixed(1)}%</b>가 가장 높았고, ${kmon(cdLast.t)}에는 ${cdLast.v.toFixed(1)}%입니다. 빚이 사상 최대일 때 넣어 둔 돈도 함께 많았습니다.`,
    shift: `2005~2006년에는 미수금이 월말 ${jo(unp56.lo)}~${jo(unp56.hi)}였고 신용융자는 가장 많을 때도 ${jo(cr56hi)}였습니다. <b>2007년 5월 한 달 새 미수금은 ${jo(won2jo(M.unpaid["200704"]))}에서 ${jo(won2jo(M.unpaid["200705"]))}로 줄고, 신용융자는 ${jo(won2jo(M.credit["200704"]))}에서 ${jo(won2jo(M.credit["200705"]))}로 늘었습니다.</b> 빚의 총량보다 형태가 바뀐 달입니다. 그해 2월 1일 신용거래 제도가 바뀐 뒤 잔고가 하루 약 290억 원씩 늘었고(${`<a href="https://www.fnnews.com/news/200704191735344830" target="_blank" rel="noopener">파이낸셜뉴스 2007-04-19</a>`}), 5월 1일부터는 결제일까지 돈을 채우지 않은 계좌를 30일 동안 현금으로만 사게 하는 미수동결계좌 제도가 시행됐습니다(${`<a href="https://www.kofia.or.kr/brd/m_95/view.do?seq=495" target="_blank" rel="noopener">금융투자협회 공지 2007-04-12</a>`}). 6월 하순에는 증권사들이 새 신용융자를 멈췄습니다(${`<a href="https://www.etoday.co.kr/news/view/131405" target="_blank" rel="noopener">이투데이 2007-06-26</a>`}).`,
  };

  const years = [...new Set(rows.map((r) => r.t.slice(0, 4)))];
  const yearly = years.map((y) => {
    const ys = rows.filter((r) => r.t.startsWith(y)), end = ys.at(-1), hi = argmax(ys, (r) => r.cr);
    const yd = ys.filter((r) => r.ch != null), lo = yd.length ? argmin(yd, (r) => r.ch) : null;
    const rat = rr.filter((r) => r.t.startsWith(y)).at(-1);
    const partial = end.t.slice(4) !== "12" ? ` (${+end.t.slice(4)}월)` : "";
    return `<tr><td>${y}${partial}</td><td>${jo(end.cr)}</td><td>${jo(hi.cr)} (${+hi.t.slice(4)}월)</td><td>${rat ? rat.v.toFixed(2) + "%" : "—"}</td><td>${jo(end.dep)}</td><td class="${lo && lo.ch < 0 ? "neg" : ""}">${lo && lo.ch < 0 ? `${sjo(lo.ch)} (${+lo.t.slice(4)}월)` : "—"}</td></tr>`;
  }).reverse().join("");

  const limits = [
    `<b>누가 빌렸는지는 나뉘어 있지 않습니다.</b> 이 표에는 투자자 구분이 없어, 개인이 빌린 몫만 따로 볼 수 없습니다.`,
    `<b>반대매매 금액은 이 표에 없습니다.</b> 그래서 잔고가 줄어든 것이 스스로 갚은 것인지 담보가 모자라 강제로 팔린 것인지 이 페이지는 가르지 않습니다. 금융투자협회가 내는 반대매매 금액은 미수거래분이라 신용융자의 강제 매도와도 다릅니다(${`<a href="https://www.segye.com/newsView/20260702503230" target="_blank" rel="noopener">세계일보 2026-07-02</a>`}).`,
    `<b>월말 하루의 값입니다.</b> ECOS 값은 결제일 기준 월말 잔고이고, 아래 검산처럼 보도된 금융투자협회 일별 수치와 같습니다. 그래서 달 중간의 고점은 보이지 않습니다. 예를 들어 일별 최고는 2026년 6월 24일 38조6328억 원으로 보도됐습니다(${`<a href="https://news.mtn.co.kr/news-detail/2026080416155599328" target="_blank" rel="noopener">머니투데이방송 2026-08-04</a>`}).`,
    `<b>집계 범위가 두 번 바뀌었습니다.</b> ECOS 주석: “결제일 기준. 2002.5.2 이후는 유가증권과 코스닥의 신용융자자료가 모두 집계되었으며, 2007.7.2 이후는 ETF 신용공여자료가 포함됨.” 그래서 2002년 4월까지는 코스피분만 들어 있습니다(차트에 표시). 비율의 분모는 두 시장 시가총액을 더했습니다.`,
    `<b>1998년 6월과 12월은 0으로 적혀 있습니다.</b> 앞뒤 달이 수천억 원이라 실제 0이 아니라 빠진 값으로 보고, 차트는 1999년 1월부터 그렸습니다. CSV에는 빈칸으로 남겼습니다.`,
    `<b>과거 수치일 뿐입니다.</b> 앞으로 잔고나 주가가 어떻게 될지 말하지 않으며, 투자 판단을 권하지 않습니다.`,
  ].map((x) => `<li>${x}</li>`).join("");

  const source = `
    <p><b>출처</b> 한국은행 ECOS 「${S.credit.source.table_name}」(${S.credit.source.table}) — 투자자 예탁금(S23A), 위탁매매 미수금(S23D), 신용융자 잔고(S23E), 단위 원. 「${S.mcap_kospi.source.table_name}」(${S.mcap_kospi.source.table}) — 코스피 시가총액(1040000)·코스닥 시가총액(2040000), 단위 천원, 코스피 종가(1070000). ECOS 공개 표본 키로 ${fetched}에 받았습니다.</p>
    <p><b>원작성 기관</b> ${S.credit.source.compiled_by}(증시주변자금), ${S.mcap_kospi.source.compiled_by}(시가총액·종가). ECOS 표에 적힌 작성기관을 그대로 옮겼습니다. ECOS는 “직접 작성한 통계가 아니더라도 이용자 편의차원에서 일부 제공”하며 “5일 내외의 수록 시차”가 있다고 적고 있습니다.</p>
    <p><b>이용 조건</b> ECOS 통계정보이용지침: “타 기관에서 작성한 통계정보는 출처를 명시하여 비상업적으로 이용할 수 있지만, 상업적으로 이용하고자 하는 경우에는 해당 통계작성기관(저작자)의 승인을 받은 후에 이용하여야 합니다.” 이 페이지는 무료·비상업 사이트에 출처를 밝혀 싣고, 값은 바꾸지 않았습니다. 인용할 때는 “출처: ECOS(한국은행, ${S.credit.source.compiled_by} 원자료), ${fetched} 조회”처럼 적어 주세요. 조건 해석은 지침 문구를 옮긴 것이며 법률 자문이 아닙니다.</p>
    <p><b>검산</b> 내려받은 값을 다른 방법으로 한 번 더 읽어 맞춰 봤습니다.</p>
    <ul class="checks">${checkLi(["months:credit", "months:deposits", "months:unpaid", "months:mcap", "months:kospi", "balance:", "credit:zero", "agency:901Y056", "agency:901Y014", "news:credit"])}</ul>
    <p><b>다시 받는 법</b> <code>node lab/fetch.mjs &amp;&amp; node lab/verify.mjs &amp;&amp; node lab/build.mjs</code> — 저장소의 <a href="https://github.com/seanbae-analyst/pivoxdata/tree/main/lab" target="_blank" rel="noopener">lab/</a> 폴더. ECOS 주소 형식: <code>https://ecos.bok.or.kr/api/StatisticSearch/{키}/json/kr/1/10/901Y056/M/{시작월}/{끝월}/S23E</code></p>`;

  const meta = `데이터 한국은행 ECOS 901Y056(원작성 ${S.credit.source.compiled_by}) · 901Y014(원작성 ${S.mcap_kospi.source.compiled_by}) · 월말 잔고 · ${lbl(months[0])}–${lbl(last)} · ${fetched} 받음 · 검산 ${CHECKS.checks.length}개 통과`;
  return { D, stats, reads, yearly, limits, source, meta, facts: { peak, lastR, dropWon, rPeak, rLast, cdPeak, rAtPeak: rr.find((r) => r.t === peak.t).v } };
}

// ============ research/net-buy ============
function netbuy() {
  const months = S.netbuy_individual.rows.map((r) => r[0]);
  const ROWS = months.map((t) => [t, M.netbuy_individual[t], M.netbuy_institution[t], M.netbuy_foreign[t]]);
  const T = (v) => v / 1e6, fmt = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "조";
  const y = {}; ROWS.forEach((r) => { y[r[0].slice(0, 4)] = (y[r[0].slice(0, 4)] || 0) + r[1]; });
  const top = argmax(ROWS, (r) => r[1]), last = ROWS.at(-1), cum = ROWS.reduce((s, r) => s + r[1], 0);
  const lastY = last[0].slice(0, 4), lastM = +last[0].slice(4);
  const ytdPrev = Object.entries(y).filter(([k]) => k < lastY).reduce((a, b) => (b[1] > a[1] ? b : a));
  expect(y[lastY] > ytdPrev[1], `${lastY} YTD no longer exceeds every full year (best ${ytdPrev[0]})`);
  const pre = Object.entries(y).filter(([k]) => k < "2020"), post = Object.entries(y).filter(([k]) => k >= "2020");
  const preNeg = pre.filter(([, v]) => v < 0).length, postPos = post.filter(([, v]) => v > 0).map(([k]) => k);
  // consecutive years with the same sign, from 2020 on: "2020~2022년 순매수, 2023~2025년 순매도, …"
  const runs = []; post.forEach(([k, v]) => { const sg = v > 0 ? "순매수" : "순매도"; const r = runs.at(-1); if (r && r.sg === sg) r.to = k; else runs.push({ from: k, to: k, sg }); });
  const yr = (k) => (k === lastY && lastM < 12 ? `${k}년 1–${lastM}월` : `${k}년`);
  const runTxt = runs.map((r) => (r.from === r.to ? `${yr(r.from)}은 ${r.sg}` : `${r.from}~${yr(r.to)}은 ${r.sg}`)).join(", ");
  const other = months.filter((t) => t.startsWith(lastY)).reduce((s, t) => s + (M.netbuy_other_foreign[t] ?? 0) + (M.netbuy_other_corp[t] ?? 0), 0);
  expect(runs.length > 0, "no years after 2019");
  const readCum = `${pre[0][0]}~${pre.at(-1)[0]}년 ${pre.length}년 중 ${preNeg}년은 개인이 순매도한 해였고, 그 뒤로는 ${runTxt}였습니다. 세 선이 서로를 비추는 것은 누군가 사면 누군가 팔기 때문입니다. 다섯 투자자 구분을 모두 더하면 매달 0이 되고(반올림 ±2백만원 안), ${yr(lastY)}에는 그림에 없는 기타외국인·기타법인이 합쳐 ${fmt(T(other))}였습니다.`;
  const stats = [
    stat(fmt(T(y[lastY])), `${lastY}년 1–${lastM}월 개인 순매수`, `${lastM}개월 만에 이전 최대였던 ${ytdPrev[0]}년 한 해(${fmt(T(ytdPrev[1]))})를 넘었습니다`),
    stat(fmt(T(top[1])), `한 달 최대 · ${lbl(top[0])}`, `2021.01은 ${fmt(T(M.netbuy_individual["202101"]))}`),
    stat(fmt(T(last[1])), `가장 최근 달 · ${lbl(last[0])}`, `같은 달 외국인 ${fmt(T(last[3]))}`),
    stat(fmt(T(cum)), `2004년부터 개인 누적`, `외국인 누적 ${fmt(T(ROWS.reduce((s, r) => s + r[3], 0)))}`),
  ].join("");
  const by = {}; ROWS.forEach((r) => { const k = r[0].slice(0, 4); by[k] = by[k] || [0, 0, 0, 0, 0]; by[k][0] += r[1]; by[k][1] += r[2]; by[k][2] += r[3]; by[k][3] += r[1] > 0 ? 1 : 0; by[k][4]++; });
  const yearly = Object.entries(by).map(([k, v]) => `<tr><td>${k}${k === lastY && lastM < 12 ? ` (1–${lastM}월)` : ""}</td>${v.slice(0, 3).map((x) => `<td class="${x < 0 ? "neg" : ""}">${fmt(T(x))}</td>`).join("")}<td>${v[3]} / ${v[4]}</td></tr>`).join("");
  const checks = `<ul class="checks">${checkLi(["months:netbuy", "months:buy_total", "months:kospi_value", "netbuy:", "agency:901Y055"])}</ul>`;
  const meta = `데이터 한국은행 ECOS 901Y055 · ${S.netbuy_individual.fetched_at} 받음 · ${lbl(months[0])}–${lbl(last[0])} · 검산 통과`;
  return { ROWS, stats, yearly, checks, meta, readCum, facts: { ytd: y[lastY], lastY, lastM, ytdPrev, top, pre: [pre[0][0], pre.at(-1)[0], pre.length, preNeg], postPos } };
}

// ============ research/abroad ============
// 자금순환 (flow of funds), 가계 및 비영리단체, quarterly. The quarter-end balance changes by what households
// bought (net acquisition, 금융거래표) plus everything else — prices, exchange rates, other volume changes.
const qlbl = (q) => `${q.slice(0, 4)}년 ${q.slice(5)}분기`;
const qmon = (q) => q.slice(0, 4) + ["01", "04", "07", "10"][+q.slice(5) - 1]; // the chart's period axis
function abroad() {
  const L = (id) => Object.fromEntries(S[id].rows);
  const B = L("hh_foreign_bal"), A = L("hh_assets_bal"), T = L("hh_foreign_tx"), Dm = L("hh_domestic_tx");
  const qs = S.hh_foreign_bal.rows.map((r) => r[0]);
  const J = (v) => v / 1e3; // 십억원 → 조원
  const rows = qs.map((q, i) => {
    const prev = i ? qs[i - 1] : null, tx = T[q] ?? null;
    const d = prev ? B[q] - B[prev] : null;
    return { q, bal: J(B[q]), share: (B[q] / A[q]) * 100, tx: tx == null ? null : J(tx), d: d == null ? null : J(d), other: d == null || tx == null ? null : J(d - tx), dom: Dm[q] == null ? null : J(Dm[q]) };
  });
  expect(qs[0] === "2008Q4" && S.hh_foreign_tx.rows[0][0] === "2009Q1", "자금순환 series no longer start at 2008Q4 (balance) / 2009Q1 (flow)");
  let cum = rows[0].bal; const cumLine = rows.map((r, i) => (i === 0 ? cum : (cum += r.tx)));
  const first = rows[0], last = rows.at(-1), flows = rows.slice(1);
  const inc = last.bal - first.bal, bought = flows.reduce((s, r) => s + r.tx, 0), rest = inc - bought;
  const peak = argmax(rows, (r) => r.bal), sPeak = argmax(rows, (r) => r.share);
  const pre = rows.filter((r) => r.q < "2020Q1"), preMax = argmax(pre, (r) => r.bal);
  const y19 = rows.find((r) => r.q === "2019Q4"), y21 = rows.find((r) => r.q === "2021Q4");
  const txMax = argmax(flows, (r) => r.tx), oMin = argmin(flows, (r) => r.other), domMax = argmax(flows, (r) => r.dom);
  const sells = flows.filter((r) => r.q >= "2020Q1" && r.tx < 0);

  // guards for the sentences below
  expect(peak.q === last.q, `the balance peak (${peak.q}) is no longer the latest quarter`);
  expect(sPeak.q === last.q, `the share peak (${sPeak.q}) is no longer the latest quarter`);
  expect(preMax.bal < 15 && y21.bal > 4 * y19.bal, "the 2020–2021 jump is no longer in the data");
  expect(last.tx < 0 && last.d > 0, "latest quarter: no longer 'net selling while the balance grew'");
  expect(domMax.q === last.q && last.dom > 0, `the largest domestic net acquisition moved to ${domMax.q}`);
  expect(oMin.tx > 0 && oMin.d < 0, `${oMin.q}: the largest non-transaction fall no longer has buying with a falling balance`);

  const D = {
    months: qs.map(qmon), quarters: qs,
    bal: rows.map((r) => r2(r.bal)), cum: cumLine.map(r2), share: rows.map((r) => r2(r.share)),
    tx: rows.map((r) => (r.tx == null ? null : r2(r.tx))), dom: rows.map((r) => (r.dom == null ? null : r2(r.dom))),
    marks: {
      level: [{ at: qmon(y21.q), text: `${y21.q.slice(0, 4)}년 말 ${jo(y21.bal)}` }],
      flow: [{ at: qmon(txMax.q), text: `${qlbl(txMax.q)} ${sjo(txMax.tx)}` }],
      share: [{ at: qmon(first.q), text: `${first.share.toFixed(2)}%`, dy: -10 }],
    },
    note: `출처: ECOS(한국은행) 281Y002 금융자산부채잔액표·281Y001 금융거래표, 가계 및 비영리단체, ${S.hh_foreign_bal.fetched_at} 조회. 단위 십억원. 값 변경 없음. ${SITE}/research/abroad`,
    csv: qs.map((q) => [q, B[q], T[q] ?? "", A[q], Dm[q] ?? ""]),
  };

  const stats = [
    stat(jo(last.bal), `가계 해외주식 잔액 · ${qlbl(last.q)}`, `${first.q.slice(0, 4)}년 말 ${jo(first.bal)}에서`),
    stat(`${last.share.toFixed(2)}%`, `가계 금융자산 중 비중 · ${qlbl(last.q)}`, `${first.q.slice(0, 4)}년 말 ${first.share.toFixed(2)}%`),
    stat(jo(bought), `${flows[0].q.slice(0, 4)}년부터 순취득 누적`, `잔액 증가분 ${jo(inc)}의 ${Math.round((bought / inc) * 100)}%`),
    stat(sjo(last.tx), `순취득 · ${qlbl(last.q)}`, `같은 분기 잔액은 ${sjo(last.d)}`),
  ].join("");

  const reads = {
    level: `${first.q.slice(0, 4)}년 말 ${jo(first.bal)}이던 잔액은 2019년 말까지 15조를 넘은 적이 없습니다. <b>2019년 말 ${jo(y19.bal)}에서 2021년 말 ${jo(y21.bal)}로 2년 새 ${(y21.bal / y19.bal).toFixed(1)}배가 됐고</b>, ${qlbl(last.q)} 말에는 ${jo(last.bal)}로 이 통계가 시작된 뒤 가장 컸습니다.`,
    split: `${first.q.slice(0, 4)}년 말부터 ${qlbl(last.q)}까지 잔액은 ${jo(inc)} 늘었습니다. <b>그중 가계가 실제로 사들인 금액(순취득 누적)은 ${jo(bought)}, 나머지 ${jo(rest)}는 거래가 아닌 변동</b> — 주가와 환율, 그 밖의 조정 — 입니다. 두 선 사이의 간격이 그 차이입니다.`,
    flow: `한 분기 순취득이 가장 컸던 때는 <b>${qlbl(txMax.q)}(${sjo(txMax.tx)})</b>입니다. 2020년 이후 순매도한 분기는 ${sells.length}개(${sells.map((r) => `${qlbl(r.q)} ${sjo(r.tx)}`).join(", ")})입니다. ${qlbl(oMin.q)}에는 ${jo(oMin.tx)}를 새로 샀는데도 잔액은 ${jo(-oMin.d)} 줄었습니다. 사고판 금액과 잔액이 다른 방향으로 움직일 수 있다는 뜻입니다.`,
    share: `가계 금융자산 전체에서 해외주식이 차지하는 비중은 ${first.q.slice(0, 4)}년 말 ${first.share.toFixed(2)}%에서 <b>${qlbl(last.q)} ${last.share.toFixed(2)}%</b>로 커졌습니다. 나머지 ${Math.round(100 - last.share)}%는 예금·보험·연금·국내 주식·채권 같은 다른 금융자산입니다.`,
    domestic: `${qlbl(last.q)}에 가계는 해외주식을 ${jo(-last.tx)} 순매도했고, 국내 주식·출자지분은 <b>${jo(last.dom)} 순취득해 ${flows[0].q.slice(0, 4)}년 이후 가장 많았습니다</b>. 국내 쪽 항목은 비상장 주식과 출자지분을 포함하므로 상장주식 순매수와 같지 않습니다 — 코스피 개인 순매수는 <a href="/research/net-buy">순매수 연구</a>에 있습니다.`,
  };

  const years = [...new Set(qs.map((q) => q.slice(0, 4)))];
  const yearly = years.map((y) => {
    const yr = rows.filter((r) => r.q.startsWith(y)), end = yr.at(-1), prevEnd = rows.filter((r) => r.q < `${y}Q1`).at(-1);
    const tx = yr.filter((r) => r.tx != null), sumTx = tx.reduce((s, r) => s + r.tx, 0), sumDom = tx.reduce((s, r) => s + r.dom, 0);
    const partial = end.q.slice(5) !== "4" ? ` (${end.q.slice(5)}분기)` : "";
    const other = prevEnd && tx.length ? end.bal - prevEnd.bal - sumTx : null;
    const td = (v) => (v == null ? "<td>—</td>" : `<td class="${v < 0 ? "neg" : ""}">${sjo(v)}</td>`);
    return `<tr><td>${y}${partial}</td><td>${jo(end.bal)}</td>${td(tx.length ? sumTx : null)}${td(other)}<td>${end.share.toFixed(2)}%</td>${td(tx.length ? sumDom : null)}</tr>`;
  }).reverse().join("");

  const source = `
    <p><b>출처</b> 한국은행 ECOS 「${S.hh_foreign_bal.source.table_name}」(281Y002) — 가계 및 비영리단체(S14) · 자산(A) · 비거주자 발행주식(F072ZZB)·금융자산 합계(F00B). 「${S.hh_foreign_tx.source.table_name}」(281Y001) — 가계 및 비영리단체(S14) · 운용(C) · 비거주자 발행주식(F072ZZB)·거주자 발행주식 및 출자지분(F071ZZB). 단위 십억원. ECOS 공개 표본 키로 ${S.hh_foreign_bal.fetched_at}에 받았습니다.</p>
    <p><b>작성 기관</b> 한국은행이 직접 작성하는 자금순환 통계입니다. ECOS 표에는 다른 작성기관이 적혀 있지 않습니다.</p>
    <p><b>이용 조건</b> ECOS 통계정보이용지침: “한국은행이 작성한 통계정보는 출처를 명시하는 한 상업적 용도를 포함하여 무료로 자유롭게 사용, 가공 및 재배포할 수 있습니다.” 인용할 때는 “출처: ECOS(한국은행), ${S.hh_foreign_bal.fetched_at} 조회”처럼 적어 주세요. 조건 해석은 지침 문구를 옮긴 것이며 법률 자문이 아닙니다.</p>
    <p><b>검산</b> 내려받은 값을 다른 방법으로 한 번 더 읽어 맞춰 봤습니다.</p>
    <ul class="checks">${checkLi(["quarters:hh_", "fresh:hh_", "balance:hh_", "flow:hh_", "agency:281Y"])}</ul>
    <p><b>다시 받는 법</b> <code>node lab/fetch.mjs &amp;&amp; node lab/verify.mjs &amp;&amp; node lab/build.mjs</code> — 저장소의 <a href="https://github.com/seanbae-analyst/pivoxdata/tree/main/lab" target="_blank" rel="noopener">lab/</a> 폴더. ECOS 주소 형식: <code>https://ecos.bok.or.kr/api/StatisticSearch/{키}/json/kr/1/10/281Y002/Q/{시작분기}/{끝분기}/S14/F072ZZB/A</code></p>`;

  const meta = `데이터 한국은행 ECOS 281Y002 · 281Y001 (한국은행 작성) · 가계 및 비영리단체 · 분기 · ${qlbl(first.q)}–${qlbl(last.q)} · ${S.hh_foreign_bal.fetched_at} 받음 · 검산 ${CHECKS.checks.length}개 통과`;
  return { D, stats, reads, yearly, source, meta, facts: { first, last, bought, inc, y19, y21 } };
}

// ============ pages ============
const PAGES = [
  { file: "index.html", path: "/", og: "home" },
  { file: "research/credit.html", path: "/research/credit", og: "credit", dataset: () => ({
    coverage: `${S.credit.rows.find((r) => r[0] >= "199901")[0].replace(/(\d{4})(\d{2})/, "$1-$2")}/${S.credit.last.replace(/(\d{4})(\d{2})/, "$1-$2")}`,
    sources: [{ name: `${S.credit.source.table_name} (${S.credit.source.table})`, by: S.credit.source.compiled_by }, { name: `${S.mcap_kospi.source.table_name} (${S.mcap_kospi.source.table})`, by: S.mcap_kospi.source.compiled_by }],
    variables: ["신용융자 잔고 (월말, 원)", "투자자 예탁금 (원)", "위탁매매 미수금 (원)", "코스피·코스닥 시가총액 (천원)"] }) },
  { file: "research/net-buy.html", path: "/research/net-buy", og: "net-buy", dataset: () => ({
    coverage: `${S.netbuy_individual.first.replace(/(\d{4})(\d{2})/, "$1-$2")}/${S.netbuy_individual.last.replace(/(\d{4})(\d{2})/, "$1-$2")}`,
    sources: [{ name: `${S.netbuy_individual.source.table_name} (${S.netbuy_individual.source.table})`, by: S.netbuy_individual.source.compiled_by }],
    variables: ["개인 순매수 거래대금 (백만원)", "기관투자자 순매수 거래대금 (백만원)", "외국인 순매수 거래대금 (백만원)"] }) },
  { file: "research/abroad.html", path: "/research/abroad", dataset: () => ({
    coverage: `${qmon(S.hh_foreign_bal.first).replace(/(\d{4})(\d{2})/, "$1-$2")}/${S.hh_foreign_bal.last.slice(0, 4)}-${String(+S.hh_foreign_bal.last.slice(5) * 3).padStart(2, "0")}`, modified: S.hh_foreign_bal.fetched_at,
    sources: [{ name: `${S.hh_foreign_bal.source.table_name} (281Y002)`, by: "한국은행" }, { name: `${S.hh_foreign_tx.source.table_name} (281Y001)`, by: "한국은행" }],
    usage: "ECOS 통계정보이용지침: 한국은행이 작성한 통계정보는 출처를 명시하는 한 상업적 용도를 포함하여 무료로 자유롭게 사용, 가공 및 재배포 가능",
    variables: ["가계 해외주식 잔액 (분기말, 십억원)", "가계 해외주식 순취득 (분기, 십억원)", "가계 금융자산 합계 (십억원)", "가계 국내 주식·출자지분 순취득 (십억원)"] }) },
  { file: "research/record-habit.html", path: "/research/record-habit", og: "record-habit" },
  { file: "trends.html", path: "/trends" },
  { file: "maps.html", path: "/maps" },
  { file: "maps/korea-investor.html", path: "/maps/korea-investor" },
  { file: "maps/seoul-closure.html", path: "/maps/seoul-closure" },
  { file: "check.html", path: "/check", og: "check" },
  { file: "analysis.html", path: "/analysis" },
  { file: "analysis-kr.html", path: "/analysis-kr" },
  { file: "404.html", path: "/404", noindex: true },
];

const C = credit(), N = netbuy(), AB = abroad();
const fill = {
  "research/credit.html": (h, f) => {
    h = region(h, "data", `const D=${JSON.stringify(C.D)};`, f);
    h = region(h, "meta", C.meta, f); h = region(h, "stats", C.stats, f);
    for (const k in C.reads) h = region(h, `read-${k}`, C.reads[k], f);
    h = region(h, "yearly", C.yearly, f); h = region(h, "limits", C.limits, f); h = region(h, "source", C.source, f);
    return h;
  },
  "research/net-buy.html": (h, f) => {
    h = region(h, "data", `const ROWS=${JSON.stringify(N.ROWS)};`, f);
    h = region(h, "meta", N.meta, f); h = region(h, "stats", N.stats, f); h = region(h, "yearly", N.yearly, f); h = region(h, "checks", N.checks, f); h = region(h, "read-cum", N.readCum, f); h = region(h, "period", `${kmon(N.ROWS[0][0])}부터 ${kmon(N.ROWS.at(-1)[0])}까지`, f);
    return h;
  },
  "research/abroad.html": (h, f) => {
    h = region(h, "data", `const D=${JSON.stringify(AB.D)};`, f);
    h = region(h, "meta", AB.meta, f); h = region(h, "stats", AB.stats, f);
    for (const k in AB.reads) h = region(h, `read-${k}`, AB.reads[k], f);
    h = region(h, "yearly", AB.yearly, f); h = region(h, "source", AB.source, f);
    return h;
  },
  "research/record-habit.html": (h, f) => {
    const R = JSON.parse(fs.readFileSync(path.join(ROOT, "lab", "data", "record-habit.json"), "utf8"));
    expect(R.searched.filter((x) => !["그 밖에", "해외"].includes(x.who)).length === 6, "record-habit: the '6곳' stat no longer matches the searched list");
    h = region(h, "searched", R.searched.map((x) => `<li><span><b>${esc(x.who)}</b> · ${esc(x.what)}</span><span class="r">${esc(x.result)}</span></li>`).join(""), f);
    h = region(h, "cards", R.cards.map((c) => `<article class="card"><div><div class="big">${c.big}</div><div class="unit">${c.unit}</div></div><div><h3>${c.title}</h3><p>${c.fact}</p><p class="why">${c.why}</p><p class="cite"><a href="${c.url}" target="_blank" rel="noopener">${esc(c.cite)}</a></p></div></article>`).join(""), f);
    h = region(h, "sources", `<p>각 숫자는 ${R.checked_at}에 원문(보고서·보도자료 PDF)에서 다시 읽었습니다. 점수와 비율, 비율의 분모(누구 중 몇 %인지)는 원문 표현을 따랐습니다.</p><ul class="checks">${R.cards.map((c) => `<li><a href="${c.url}" target="_blank" rel="noopener">${esc(c.cite)}</a></li>`).join("")}</ul>`, f);
    return h;
  },
  "index.html": (h, f) => {
    const [p0, p1, pn, pneg] = N.facts.pre;
    const nb = `<b>${N.facts.lastY}년 1–${N.facts.lastM}월 개인 순매수 ${(N.facts.ytd / 1e6 > 0 ? "+" : "") + (N.facts.ytd / 1e6).toFixed(1)}조</b> — 2004년 이후 어느 한 해보다 많습니다. ${p0}~${p1}년 ${pn}년 중 ${pneg}년은 개인이 순매도한 해였고, 2020년 이후 순매수한 해는 ${N.facts.postPos.map((k) => (k === N.facts.lastY && N.facts.lastM < 12 ? `${k}년(1–${N.facts.lastM}월)` : `${k}년`)).join(" · ")}입니다.`;
    const cr = `<b>신용융자 잔고는 ${lbl(C.facts.peak.t)} 월말 ${jo(C.facts.peak.cr)}로 1999년 이후 금액으로 가장 컸습니다.</b> 그달 시가총액 대비 비율은 ${C.facts.rAtPeak.toFixed(2)}%로, 비율이 가장 높았던 ${lbl(C.facts.rPeak.t)}(${C.facts.rPeak.v.toFixed(2)}%)보다 낮습니다. 투자자 구분이 없는 시장 전체 값입니다.`;
    const { first: a0, last: a1, bought, inc } = AB.facts;
    const ab = `<b>가계 해외주식 잔액은 ${qlbl(a1.q)} 말 ${jo(a1.bal)}로, ${a0.q.slice(0, 4)}년 말 ${jo(a0.bal)}의 ${Math.round(a1.bal / a0.bal)}배입니다.</b> 그사이 늘어난 ${jo(inc)} 중 실제로 사들인 돈은 ${jo(bought)}이고 나머지는 주가·환율 같은 거래 밖의 변동입니다. 어느 나라로 갔는지는 이 통계에 없습니다.`;
    h = region(h, "q-netbuy", nb, f); h = region(h, "q-credit", cr, f); h = region(h, "q-abroad", ab, f);
    h = region(h, "updated", `${fetched} 기준`, f);
    return h;
  },
};

// Render everything first; write nothing unless every guard held (a half-written site is worse than a stale one).
const out = [];
for (const p of PAGES) {
  const file = path.join(ROOT, p.file);
  if (!fs.existsSync(file)) { console.log(`skip  ${p.file} (missing)`); continue; }
  const before = fs.readFileSync(file, "utf8");
  let h = before;
  if (has(h, "head")) h = region(h, "head", head(p, h), p.file);
  if (has(h, "nav")) h = region(h, "nav", NAV, p.file);
  if (has(h, "footer")) h = region(h, "footer", FOOTER, p.file);
  if (fill[p.file]) h = fill[p.file](h, p.file);
  out.push({ p, file, before, h });
}

// sitemap: every indexable page, dated by the data it was built from (so a rebuild on another day changes nothing)
const sm = PAGES.filter((p) => !p.noindex && fs.existsSync(path.join(ROOT, p.file)))
  .map((p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${fetched}</lastmod></url>`).join("\n");

if (failures.length) { console.error(`BUILD STOPPED — nothing written. A sentence on a page no longer matches the data:\n- ${failures.join("\n- ")}`); process.exit(1); }
let changed = 0;
for (const { p, file, before, h } of out) {
  if (h !== before) { fs.writeFileSync(file, h); changed++; console.log(`wrote ${p.file}`); } else console.log(`same  ${p.file}`);
}
fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sm}\n</urlset>\n`);
console.log(`\nbuilt ${changed} page(s) from data fetched ${fetched}`);
