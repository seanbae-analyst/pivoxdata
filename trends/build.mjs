// build.mjs — writes the radar's readings into trends.html (marked regions, like lab/build.mjs).
// Every sentence on the page is computed from trends/data, so a new week of data rewrites it; nothing here is a
// fixed claim that a re-fetch could falsify. The build stops (writes nothing) only when data is missing or the
// checks in verify.mjs failed — then the weekly job opens an issue instead of publishing.
//
// Usage: node trends/build.mjs   (after trends/verify.mjs; lab/build.mjs then adds the shared nav/footer/head)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV, SEC } from "./series.mjs";
import { weekly, lastSunday, breaks, trimEnd, readings, shares, median, MIN_LEVEL } from "./signals.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "trends", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const CHECKS = load("checks.json");
if (CHECKS.checks.some((c) => !c.ok)) { console.error("trends/data/checks.json has failed checks — run node trends/verify.mjs and fix first"); process.exit(1); }

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const man = (v) => (v >= 1e8 ? (v / 1e8).toFixed(1) + "억" : v >= 1e4 ? Math.round(v / 1e4).toLocaleString("ko-KR") + "만" : Math.round(v).toLocaleString("ko-KR"));
const pc = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%");
const pp = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%p");
const sh = (v, d = 1) => (v == null ? "—" : (v * 100).toFixed(d) + "%");
const usd = (v) => "$" + (v / 1e9).toFixed(1) + "B";
const wlbl = (w) => `${+w.slice(5, 7)}월 ${+w.slice(8)}일 주`;
const mlbl = (m) => `${m.slice(0, 4)}년 ${+m.slice(4)}월`;
const qlbl = (q) => `${q.slice(0, 4)}년 ${q.slice(5)}분기`;
const cls = (v) => (v == null ? "" : v < 0 ? "neg" : "pos");
const r4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);

// ---------- downloads (npm, PyPI) ----------
function downloads(src, list, control) {
  const d = load(`${src}.json`), P = d.packages, all = [...list, ...control];
  const until = lastSunday(all.map((p) => P[p.pkg].days));
  const W = trimEnd(Object.fromEntries(all.map((p) => [p.pkg, weekly(P[p.pkg].days, until)])));
  const br = breaks(Object.fromEntries(control.map((p) => [p.pkg, W[p.pkg]])));
  const from = br.length ? br.at(-1).i : 0, weeks = W[all[0].pkg].map((x) => x.week);
  const R = Object.fromEntries(all.map((p) => [p.pkg, readings(W[p.pkg], from)]));
  const base = median(control.map((p) => R[p.pkg].g4)); // what the whole source did in the same 4 weeks
  const rows = list.map((p) => ({ ...p, ...R[p.pkg], excess: R[p.pkg].g4 == null || base == null ? null : R[p.pkg].g4 - base }));
  if (rows.every((r) => r.g4 == null)) throw new Error(`${src}: no package has 8 comparable weeks`);
  return { d, W, weeks, from, br, base, rows, last: weeks.at(-1), fetched: d.fetched_at };
}
const npm = downloads("npm", NPM, NPM_CONTROL), pypi = downloads("pypi", PYPI, PYPI_CONTROL);

const ranked = (x) => x.rows.filter((r) => r.level >= MIN_LEVEL && r.excess != null).sort((a, b) => b.excess - a.excess);
const table = (x, yoy) => x.rows.filter((r) => r.level != null).sort((a, b) => (b.excess ?? -9) - (a.excess ?? -9)).map((r) =>
  `<tr><td><b>${esc(r.group === "provider" ? `AI SDK용 ${r.name}` : r.name)}</b><span class="pkg">${esc(r.pkg)}</span></td><td>${man(r.level)}</td><td class="${cls(r.g4)}">${pc(r.g4)}</td><td class="${cls(r.excess)}">${pp(r.excess)}</td><td class="${cls(r.accel)}">${pp(r.accel)}</td>${yoy ? `<td class="${cls(r.yoy)}">${r.yoy == null ? "—" : pc(r.yoy, 0)}</td>` : ""}</tr>`).join("");

// Vercel AI SDK providers: which model app developers wire in, as a share of the provider packages
const provPk = NPM.filter((p) => p.group === "provider");
const provW = Object.fromEntries(provPk.map((p) => [p.pkg, npm.W[p.pkg]]));
const provNow = shares(provW, 0), prov52 = shares(provW, 52);
const provDelta = provPk.map((p) => ({ ...p, now: provNow[p.pkg], then: prov52[p.pkg], d: provNow[p.pkg] != null && prov52[p.pkg] != null ? provNow[p.pkg] - prov52[p.pkg] : null }));
const provLead = provDelta.reduce((a, b) => (b.now > a.now ? b : a));
const provUp = provDelta.filter((p) => p.d != null).reduce((a, b) => (b.d > a.d ? b : a)), provDown = provDelta.filter((p) => p.d != null).reduce((a, b) => (b.d < a.d ? b : a));
const SHOW = 104; // two years of weeks on the share chart
const provSeries = (() => {
  const n = npm.weeks.length, out = { weeks: npm.weeks.slice(Math.max(0, n - SHOW)), series: {} };
  for (const p of provPk) out.series[p.pkg] = [];
  for (let back = Math.min(SHOW, n - 4) - 1; back >= 0; back--) { const s = shares(provW, back); for (const p of provPk) out.series[p.pkg].push(r4(s[p.pkg])); }
  out.weeks = npm.weeks.slice(n - out.series[provPk[0].pkg].length);
  return out;
})();

// LLM SDK shares in Python, since the last break
const sdkPy = PYPI.filter((p) => p.group === "sdk"), sdkW = Object.fromEntries(sdkPy.map((p) => [p.pkg, pypi.W[p.pkg]]));
const pyBack = Math.max(0, Math.min(8, pypi.weeks.length - pypi.from - 4));
const sdkNow = shares(sdkW, 0), sdkThen = shares(sdkW, pyBack);

// ---------- arXiv ----------
const AX = load("arxiv.json");
// the unbroken run of months that ends at the latest one (a cut-short backfill can leave older gaps)
const mAdd = (m, n) => { const t = +m.slice(0, 4) * 12 + +m.slice(4) - 1 + n; return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`; };
const am = (() => { const set = new Set(AX.months), out = [AX.months.at(-1)]; while (set.has(mAdd(out[0], -1))) out.unshift(mAdd(out[0], -1)); return out; })();
const axShare = (id, m) => AX.terms[id][m] / AX.total[m];
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const last3 = am.slice(-3), prev3 = am.length >= 15 ? last3.map((m) => mAdd(m, -12)) : [];
const axRows = ARXIV.map((t) => {
  const now = avg(last3.map((m) => axShare(t.id, m))), then = prev3.length === 3 ? avg(prev3.map((m) => axShare(t.id, m))) : null;
  return { ...t, now, then, ratio: then ? now / then : null, papers: AX.terms[t.id][am.at(-1)] };
}).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
const axTop = axRows.filter((r) => r.then >= 0.002)[0]; // a phrase in ≥ 0.2% of papers a year ago, so a ratio means something
const axBiggest = [...axRows].sort((a, b) => b.now - a.now)[0];
const axChart = [...axRows].filter((r) => r.then != null).slice(0, 5).map((r) => r.id);

// ---------- Hugging Face ----------
const HFD = load("hf.json"), snap = HFD.snapshots.at(-1);
const prevSnap = [...HFD.snapshots].reverse().find((s) => (new Date(snap.date) - new Date(s.date)) / 864e5 >= 6) ?? null;
const gen = snap.top.filter((m) => m.task === "text-generation" || m.task === "image-text-to-text");
const byAuthor = Object.entries(gen.reduce((o, m) => ((o[m.author] = (o[m.author] ?? 0) + m.downloads), o), {})).sort((a, b) => b[1] - a[1]);
const genTotal = byAuthor.reduce((s, [, v]) => s + v, 0);
const newIn = prevSnap ? snap.top.filter((m) => !prevSnap.top.some((p) => p.id === m.id)) : [];
const trendRows = snap.trending.slice(0, 12).map((m, i) => `<tr><td>${i + 1}</td><td><a href="https://huggingface.co/${esc(m.id)}" target="_blank" rel="noopener">${esc(m.id)}</a></td><td>${esc(m.task ?? "—")}</td><td>${man(m.downloads)}</td><td>${m.created}</td></tr>`).join("");
const authorRows = byAuthor.slice(0, 8).map(([a, v]) => `<li><span>${esc(a)}</span><span class="bar" style="--w:${(v / byAuthor[0][1] * 100).toFixed(1)}%"></span><span class="v">${sh(v / genTotal)}</span></li>`).join("");

// ---------- SEC capex ----------
const SECD = load("sec.json"), big4 = ["msft", "googl", "amzn", "meta"];
const qOf = (id) => Object.fromEntries(SECD.companies[id].quarters.map((r) => [r.q, r.val]));
const Qs = Object.fromEntries(SEC.companies.map((c) => [c.id, qOf(c.id)]));
const quarters = [...new Set(SEC.companies.flatMap((c) => Object.keys(Qs[c.id])))].filter((q) => q >= "2019Q1").sort();
const common = quarters.filter((q) => big4.every((id) => Qs[id][q] != null));
const sum4 = (q) => big4.reduce((s, id) => s + Qs[id][q], 0);
const cq = common.at(-1), cqYear = `${+cq.slice(0, 4) - 1}${cq.slice(4)}`;
const ttm = (q) => { const i = common.indexOf(q); return i >= 3 ? common.slice(i - 3, i + 1).reduce((s, x) => s + sum4(x), 0) : null; };
const capex = { q: cq, sum: sum4(cq), yoy: common.includes(cqYear) ? sum4(cq) / sum4(cqYear) - 1 : null, ttm: ttm(cq), ttmPrev: ttm(cqYear) };
const capexLead = big4.map((id) => ({ id, name: SEC.companies.find((c) => c.id === id).name, v: Qs[id][cq], yoy: Qs[id][cqYear] ? Qs[id][cq] / Qs[id][cqYear] - 1 : null })).sort((a, b) => b.yoy - a.yoy);
const ahead = SEC.companies.filter((c) => Object.keys(Qs[c.id]).some((q) => q > cq)).map((c) => { const q = Object.keys(Qs[c.id]).filter((x) => x > cq).sort().at(-1); return `${c.name} ${qlbl(q)} ${usd(Qs[c.id][q])}`; });

// ---------- sentences ----------
// a provider package is named with its SDK, so "DeepSeek" is not read as DeepSeek's own SDK
const nm = (r) => (r.group === "provider" ? `AI SDK용 ${r.name}` : r.name);
const nTop = ranked(npm).slice(0, 3), pTop = ranked(pypi).slice(0, 3);
const acc = npm.rows.filter((r) => r.level >= MIN_LEVEL && r.accel != null).sort((a, b) => b.accel - a.accel)[0];
const signals = [
  { k: "개발자 · JavaScript", t: `대조군보다 가장 빨리 크는 AI 패키지는 ${nTop.map((r) => `<b>${esc(nm(r))}</b>`).join(" · ")}`,
    d: `${wlbl(npm.weeks.at(-4))}부터 4주 동안 평일 다운로드가 그 전 4주보다 ${nTop.map((r) => `${esc(nm(r))} ${pc(r.g4)}`).join(", ")} 늘었습니다. 같은 4주 대조군(react·lodash 등)은 ${pc(npm.base)}였습니다. 순위는 이 차이(초과 성장)로 매깁니다.` },
  { k: "가속", t: `성장이 가장 빨라지는 쪽은 <b>${esc(nm(acc))}</b>`,
    d: `4주 성장률이 직전 4주의 ${pc(acc.g4 - acc.accel)}에서 ${pc(acc.g4)}로 ${pp(acc.accel)} 올라갔습니다 (npm, ${esc(acc.pkg)}).` },
  { k: "앱 개발자가 붙이는 모델", t: `Vercel AI SDK 모델 공급자 패키지 중 1위는 <b>${esc(provLead.name)} ${sh(provLead.now)}</b>`,
    d: `1년 전보다 가장 많이 오른 곳은 ${esc(provUp.name)}(${sh(provUp.then)} → ${sh(provUp.now)}), 가장 많이 내린 곳은 ${esc(provDown.name)}(${sh(provDown.then)} → ${sh(provDown.now)})입니다. 앱에 어떤 모델을 연결하는지 보여 주는 대리 지표입니다.` },
  { k: "개발자 · Python", t: `파이썬에서 대조군보다 가장 빨리 크는 쪽은 ${pTop.map((r) => `<b>${esc(r.name)}</b>`).join(" · ")}`,
    d: `4주 성장 ${pTop.map((r) => `${esc(r.name)} ${pc(r.g4)}`).join(", ")}, 대조군(requests·numpy 등) ${pc(pypi.base)}. ${pypi.br.length ? `PyPI 집계가 ${wlbl(pypi.br.at(-1).week)}에 한꺼번에 바뀌어(대조군 ×${pypi.br.at(-1).ratio.toFixed(2)}) 그 뒤 주만 비교합니다.` : ""}` },
  { k: "연구", t: axTop ? `AI 논문에서 가장 빠르게 늘어난 말은 <b>${esc(axTop.name)}</b>` : "연구 키워드 비교에 1년치가 아직 모자랍니다",
    d: axTop ? `최근 3개월(${mlbl(last3[0])}–${mlbl(last3.at(-1))}) AI 논문 중 ${sh(axTop.now)}가 초록에 이 말을 썼습니다. 1년 전 같은 3개월은 ${sh(axTop.then)}로, ${axTop.ratio.toFixed(1)}배입니다. 가장 많이 쓰인 말은 ${esc(axBiggest.name)}(${sh(axBiggest.now)})입니다.` : "" },
  { k: "오픈 모델", t: `Hugging Face에서 지금 가장 뜨는 모델은 <b>${esc(snap.trending[0].id)}</b>`,
    d: `${esc(snap.trending[0].task ?? "")}${snap.trending[0].task ? " · " : ""}${snap.trending[0].created} 공개. 다운로드 상위 ${snap.top.length}개 중 텍스트 생성 모델의 30일 다운로드는 ${esc(byAuthor[0][0])} 계열이 ${sh(byAuthor[0][1] / genTotal)}로 가장 많습니다.${prevSnap ? ` 지난주(${prevSnap.date})보다 상위 ${snap.top.length}에 새로 든 모델 ${newIn.length}개.` : " 새로 든 모델은 다음 주 스냅숏부터 셉니다."}` },
  { k: "자본", t: `빅테크 4사 설비투자 ${qlbl(cq)} <b>${usd(capex.sum)}</b>`,
    d: `Microsoft·Alphabet·Amazon·Meta 합계로, 1년 전 같은 분기보다 ${pc(capex.yoy, 0)}입니다. 최근 4개 분기 합은 ${usd(capex.ttm)}(1년 전 ${usd(capex.ttmPrev)}). 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).${ahead.length ? ` 이미 다음 분기를 공시한 곳: ${ahead.join(", ")}.` : ""}` },
].filter((s) => s.d);
const signalHtml = signals.map((s) => `<article class="sig"><div class="k">${s.k}</div><h3>${s.t}</h3><p>${s.d}</p></article>`).join("");

// ---------- chart data ----------
const D = {
  prov: { weeks: provSeries.weeks, series: provPk.map((p) => ({ name: p.name, values: provSeries.series[p.pkg] })) },
  arxiv: { months: am, series: axChart.map((id) => ({ name: ARXIV.find((t) => t.id === id).name, values: am.map((m) => r4(axShare(id, m) * 100)) })) },
  capex: { quarters, series: [...SEC.companies.map((c) => ({ name: c.name, values: quarters.map((q) => (Qs[c.id][q] == null ? null : Math.round(Qs[c.id][q] / 1e8) / 10)) }))], sum: quarters.map((q) => (common.includes(q) ? Math.round(sum4(q) / 1e8) / 10 : null)) },
  csv: {
    npm: npm.weeks.map((w, i) => [w, ...NPM.map((p) => npm.W[p.pkg][i].level ?? "")]), npmHead: ["주 시작(월)", ...NPM.map((p) => p.pkg)],
    capex: quarters.map((q) => [q, ...SEC.companies.map((c) => Qs[c.id][q] ?? "")]), capexHead: ["분기", ...SEC.companies.map((c) => c.name + " (USD)")],
  },
};

const updated = [npm.fetched, pypi.fetched, AX.fetched_at, HFD.fetched_at, SECD.fetched_at].sort().at(-1);
const meta = `${updated} 갱신 · 매주 자동 · npm ${wlbl(npm.last)}까지 · PyPI ${wlbl(pypi.last)}까지 · arXiv ${mlbl(am.at(-1))}까지 · Hugging Face ${snap.date} · SEC ${qlbl(cq)}까지 · 검산 ${CHECKS.checks.length}개 통과`;
const checkLi = CHECKS.checks.map((c) => `<li>${esc(c.fact)}</li>`).join("");
const axTable = axRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${sh(r.now)}</td><td>${sh(r.then)}</td><td class="${r.ratio > 1 ? "pos" : r.ratio < 1 ? "neg" : ""}">${r.ratio ? r.ratio.toFixed(2) + "배" : "—"}</td><td>${(r.papers ?? 0).toLocaleString("ko-KR")}</td></tr>`).join("");
const capexRows = [...common].reverse().slice(0, 8).map((q) => `<tr><td>${qlbl(q)}</td>${big4.map((id) => `<td>${usd(Qs[id][q])}</td>`).join("")}<td><b>${usd(sum4(q))}</b></td><td>${Qs.orcl[q] != null ? usd(Qs.orcl[q]) : "—"}</td></tr>`).join("");
const sdkLine = sdkPy.map((p) => `${esc(p.name)} ${sh(sdkNow[p.pkg])}${pyBack ? ` (${pyBack}주 전 ${sh(sdkThen[p.pkg])})` : ""}`).join(" · ");

// ---------- write ----------
function region(html, name, content) {
  const a = new RegExp(`(<!--@${name}-->)[\\s\\S]*?(<!--/@${name}-->)`), b = new RegExp(`(/\\*@${name}\\*/)[\\s\\S]*?(/\\*/@${name}\\*/)`);
  if (a.test(html)) return html.replace(a, (_, x, y) => x + content + y);
  if (b.test(html)) return html.replace(b, (_, x, y) => x + content + y);
  throw new Error(`trends.html: region @${name} not found`);
}
const file = path.join(ROOT, "trends.html"), before = fs.readFileSync(file, "utf8");
let h = before;
h = region(h, "t-meta", meta);
h = region(h, "t-signals", signalHtml);
h = region(h, "t-npm", table(npm, true));
h = region(h, "t-npm-note", `평일 다운로드 중앙값의 4주 평균. 4주 성장은 ${wlbl(npm.weeks.at(-4))}부터 4주 대 그 전 4주, 초과 성장은 4주 성장에서 대조군 중앙값(${pc(npm.base)})을 뺀 값입니다. 하루 ${man(MIN_LEVEL)} 미만인 패키지는 위 신호 순위에서 뺍니다.`);
h = region(h, "t-pypi", table(pypi, false));
h = region(h, "t-pypi-note", `${pypi.br.length ? `PyPI 집계가 ${wlbl(pypi.br.at(-1).week)}에 바뀌어(대조군 ×${pypi.br.at(-1).ratio.toFixed(2)}) 그 뒤 ${pypi.weeks.length - pypi.from}주만 비교합니다. 그래서 가속과 1년 전 대비는 아직 없습니다.` : ""} 대조군 중앙값 ${pc(pypi.base)}. LLM SDK 점유: ${sdkLine}.`);
h = region(h, "t-arxiv", axTable);
h = region(h, "t-hf-trending", trendRows);
h = region(h, "t-hf-authors", authorRows);
h = region(h, "t-capex", capexRows);
h = region(h, "t-checks", checkLi);
h = region(h, "t-data", `const D=${JSON.stringify(D)};`);
if (h !== before) { fs.writeFileSync(file, h); console.log("wrote trends.html"); } else console.log("same  trends.html");
