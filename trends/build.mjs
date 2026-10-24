// build.mjs — writes the radar's readings into index.html (the dashboard) and map.html (marked regions).
// Every sentence on the page is computed from trends/data, so a new week of data rewrites it; nothing here is a
// fixed claim that a re-fetch could falsify. The build stops (writes nothing) only when data is missing or the
// checks in verify.mjs failed — then the weekly job opens an issue instead of publishing.
//
// Usage: node trends/build.mjs   (after trends/verify.mjs; also fills the shared head/nav/footer via site.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, SEC } from "./series.mjs";
import { weekly, lastSunday, breaks, trimEnd, readings, shares, median, MIN_LEVEL } from "./signals.mjs";
import { writePages } from "./site.mjs";

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
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const mAdd = (m, n) => { const t = +m.slice(0, 4) * 12 + +m.slice(4) - 1 + n; return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`; };
// one research field: its unbroken run of months ending at the latest (a cut-short backfill can leave older gaps),
// each phrase's share of the field's papers, and how the last 3 months compare with the same 3 a year earlier
function field(f) {
  const X = AX.domains[f.id], am = (() => { const set = new Set(X.months), out = [X.months.at(-1)]; while (set.has(mAdd(out[0], -1))) out.unshift(mAdd(out[0], -1)); return out; })();
  const share = (id, m) => X.terms[id][m] / X.total[m];
  const last3 = am.slice(-3), prev3 = am.length >= 15 ? last3.map((m) => mAdd(m, -12)) : [];
  const rows = f.terms.map((t) => {
    const now = avg(last3.map((m) => share(t.id, m))), then = prev3.length === 3 ? avg(prev3.map((m) => share(t.id, m))) : null;
    const papers3 = last3.reduce((s, m) => s + X.terms[t.id][m], 0);
    return { ...t, now, then, ratio: then ? now / then : null, papers: X.terms[t.id][am.at(-1)], papers3 };
  }).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  // a ratio means something only for a phrase in ≥ 0.2% of the field a year ago and ≥ 10 papers in the last 3 months
  const top = rows.filter((r) => r.then >= 0.002 && r.papers3 >= 10)[0] ?? null;
  const biggest = [...rows].sort((a, b) => b.now - a.now)[0];
  const growth = prev3.length === 3 ? avg(last3.map((m) => X.total[m])) / avg(prev3.map((m) => X.total[m])) - 1 : null;
  return { ...f, X, am, share, last3, prev3, rows, top, biggest, growth, monthly: avg(last3.map((m) => X.total[m])) };
}
const fields = ARXIV_DOMAINS.filter((f) => AX.domains?.[f.id]?.months?.length).map(field);
const ai = fields.find((f) => f.id === "ai");
const { am, last3, rows: axRows, top: axTop, biggest: axBiggest } = ai, axShare = ai.share;
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

// ---------- insights ----------
// One object per insight: a big number, a one-line headline, a short body and a small trend line. The page and the
// Instagram cards (social/) are both drawn from these, so they always say the same thing. `big`, `title` and `body`
// are computed here every week; nothing is written by hand.
const nm = (r) => (r.group === "provider" ? `AI SDK용 ${r.name}` : r.name); // "DeepSeek" alone would read as DeepSeek's own SDK
// line breaks: a short name stays on one line (OpenAI&nbsp;Agents), a model id breaks only after "/", and a number is
// glued to the word before it so "+87%" never starts a line on its own
const keep = (t) => {
  const e = esc(t);
  if (t.includes("/")) return e.replace(/\//g, "/<wbr>").replace(/-/g, "&#8209;"); // model id
  if (!t.includes(" ")) return e.replace(/-/g, "&#8209;");                        // image-text-to-text
  return t.length <= 28 ? e.replace(/ /g, "&nbsp;") : e;                          // OpenAI Agents
};
const glue = (html) => html.replace(/ (<b>[+−\-]?[\d$])/g, "&nbsp;$1");
const nTop = ranked(npm).slice(0, 3), pTop = ranked(pypi).slice(0, 3);
const acc = npm.rows.filter((r) => r.level >= MIN_LEVEL && r.accel != null).sort((a, b) => b.accel - a.accel)[0];
const lastN = (a, n) => a.slice(Math.max(0, a.length - n));
const lv = (x, pkg, n) => lastN(x.W[pkg].map((w) => w.level), n);
const span = (x, n) => `${wlbl(lastN(x.weeks, n)[0])}–${wlbl(x.weeks.at(-1))}`;
const insights = [
  { id: "npm", k: "개발자 · JavaScript", big: pp(nTop[0].excess), bl: "대조군보다 더 큰 4주 성장",
    title: `npm에서 가장 빨리 크는 AI 패키지는 <b>${keep(nm(nTop[0]))}</b>`,
    body: `4주 다운로드 ${pc(nTop[0].g4)}, 같은 4주 react·lodash 같은 대조군은 ${pc(npm.base)}. 다음은 ${nTop.slice(1).map((r) => `${esc(nm(r))}(${pp(r.excess)})`).join(", ")}.`,
    spark: { values: lv(npm, nTop[0].pkg, 26) }, src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "accel", k: "가속", big: pp(acc.accel), bl: "4주 성장률이 오른 폭",
    title: `성장이 가장 빨라지는 쪽은 <b>${keep(nm(acc))}</b>`,
    body: `4주 성장률이 직전 4주 ${pc(acc.g4 - acc.accel)}에서 ${pc(acc.g4)}로 올라갔습니다.`,
    spark: { values: lv(npm, acc.pkg, 26) }, src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "provider", k: "앱에 붙이는 모델", big: sh(provUp.now), bl: `Vercel AI SDK 공급자 중 ${provUp.name} 비중`,
    title: `1년 새 <b>${keep(provUp.name)}</b> ${sh(provUp.then)}&nbsp;→&nbsp;${sh(provUp.now)}`,
    body: `지금 1위는 ${esc(provLead.name)}(${sh(provLead.now)}), 가장 많이 내린 곳은 ${esc(provDown.name)}(${sh(provDown.then)} → ${sh(provDown.now)}). 앱 개발자가 어떤 모델을 연결하는지 보여 주는 대리 지표입니다.`,
    spark: { values: lastN(provSeries.series[provUp.pkg], 52) }, src: `@ai-sdk 공급자 패키지 다운로드 비중 · 최근 52주` },
  { id: "pypi", k: "개발자 · Python", big: pp(pTop[0].excess), bl: "대조군보다 더 큰 4주 성장",
    title: `파이썬에서 가장 빨리 크는 쪽은 <b>${keep(pTop[0].name)}</b>`,
    body: `4주 다운로드 ${pc(pTop[0].g4)}, 대조군(requests·numpy 등) ${pc(pypi.base)}. 다음은 ${pTop.slice(1).map((r) => `${esc(r.name)}(${pp(r.excess)})`).join(", ")}.`,
    spark: { values: pypi.W[pTop[0].pkg].slice(pypi.from).map((w) => w.level) }, src: `PyPI 평일 다운로드 · ${wlbl(pypi.weeks[pypi.from])}–${wlbl(pypi.last)} 주` },
  ...(axTop ? [{ id: "arxiv", k: "연구", big: `${axTop.ratio.toFixed(1)}배`, bl: "AI 논문 속 비율, 1년 전 대비",
    title: `연구자들이 가장 빠르게 더 쓰는 말은 <b>${keep(axTop.name)}</b>`,
    body: `최근 3개월 AI 논문의 ${sh(axTop.now)}가 초록에 썼습니다(1년 전 ${sh(axTop.then)}). 가장 많이 쓰인 말은 ${esc(axBiggest.name)}(${sh(axBiggest.now)}).`,
    spark: { values: am.map((m) => axShare(axTop.id, m)) }, src: `arXiv cs.AI·cs.CL·cs.LG · ${mlbl(am[0])}–${mlbl(am.at(-1))}` }] : []),
  { id: "hf", k: "오픈 모델", big: sh(byAuthor[0][1] / genTotal), bl: `텍스트 생성 모델 다운로드 중 ${byAuthor[0][0]} 계열`,
    title: `오픈 텍스트 생성 모델 다운로드의 ${sh(byAuthor[0][1] / genTotal)}는 <b>${keep(byAuthor[0][0])}</b>&nbsp;계열`,
    body: `다음은 ${byAuthor.slice(1, 3).map(([a, v]) => `${esc(a)}(${sh(v / genTotal)})`).join(", ")}. 지금 가장 뜨는 모델은 ${keep(snap.trending[0].id)}(${keep(snap.trending[0].task ?? "")}${snap.trending[0].task ? ", " : ""}${snap.trending[0].created} 공개).${prevSnap ? ` 지난주보다 다운로드 상위 ${snap.top.length}에 새로 든 모델 ${newIn.length}개.` : ""}`,
    spark: { values: byAuthor.slice(0, 6).map(([, v]) => v / genTotal), bars: true, labels: byAuthor.slice(0, 6).map(([a]) => a) }, src: `Hugging Face 다운로드 상위 ${snap.top.length} · ${snap.date}` },
  { id: "capex", k: "자본", big: usd(capex.sum), bl: `빅테크 4사 설비투자 · ${qlbl(cq)}`,
    title: `AI 인프라에 들어가는 돈, 1년 전보다 <b>${pc(capex.yoy, 0)}</b>`,
    body: `Microsoft·Alphabet·Amazon·Meta 합계. 최근 4개 분기 ${usd(capex.ttm)}(1년 전 ${usd(capex.ttmPrev)}). 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).`,
    spark: { values: common.map(sum4), bars: true }, src: `SEC 공시 · ${qlbl(common[0])}–${qlbl(cq)}` },
];

// a small trend line (or bars) drawn on the server, so the card reads without JavaScript and renders the same in the
// Instagram renderer
function spark(sp, w = 300, h = 64) {
  const v = sp.values.filter((x) => x != null); if (v.length < 2) return "";
  const lo = sp.bars ? Math.min(0, ...v) : Math.min(...v), hi = Math.max(...v), Y = (x) => h - 4 - ((x - lo) / (hi - lo || 1)) * (h - 10);
  if (sp.bars) {
    const bw = w / v.length;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${v.map((x, i) => `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${Math.min(Y(x), Y(0)).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(1, Math.abs(Y(0) - Y(x))).toFixed(1)}" class="${i === v.length - 1 || (sp.labels && i === 0) ? "hi" : ""}"/>`).join("")}</svg>`;
  }
  const X = (i) => (i * w) / (v.length - 1), d = v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d}L${w},${h}L0,${h}Z"/><path class="l" d="${d}"/></svg>`;
}
// ---------- research radar: one card per field ----------
const fieldsByGrowth = [...fields].filter((f) => f.growth != null).sort((a, b) => b.growth - a.growth);
const researchHtml = fields.map((f) => {
  const t = f.top;
  return `<article class="fld"><div class="top"><span class="k">${esc(f.name)}</span><span class="g ${cls(f.growth)}">${f.growth == null ? "" : `논문 ${pc(f.growth, 0)}`}</span></div>
  <div class="row"><div class="big">${t ? `${t.ratio.toFixed(1)}배` : "—"}</div>${spark({ values: f.am.map((m) => f.X.total[m]) }, 160, 40)}</div>
  <h3>${t ? `가장 빨리 늘어난 말 <b>${keep(t.name)}</b>` : "1년 전과 비교할 달이 아직 모자랍니다"}</h3>
  <p>${t ? `최근 3개월 ${esc(f.name)} 논문의 ${sh(t.now)}(1년 전 ${sh(t.then)}). 가장 많이 쓰인 말은 ${keep(f.biggest.name)}(${sh(f.biggest.now)}).` : ""} 한 달 평균 ${Math.round(f.monthly).toLocaleString("ko-KR")}편.</p>
  <div class="src">arXiv ${esc(f.scope.replace(/cat:/g, "").replace(/[()]/g, "").replace(/ OR /g, "·"))} · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}</div></article>`;
}).join("");
const researchNote = fieldsByGrowth.length ? `최근 3개월 논문 수가 1년 전 같은 3개월보다 가장 많이 는 분야는 ${esc(fieldsByGrowth[0].name)}(${pc(fieldsByGrowth[0].growth, 0)})입니다. “배”는 그 분야 논문 중 그 말을 쓴 비율이 1년 전의 몇 배인지입니다(1년 전 0.2% 이상 · 최근 3개월 10편 이상인 말만).` : "";

const insightHtml = insights.map((x, i) => `<article class="ins${i === 0 ? " lead" : ""}"><div class="k">${x.k}</div><div class="big">${x.big}</div><div class="bl">${esc(x.bl)}</div><h3>${glue(x.title)}</h3><p>${x.body}</p><button type="button" class="more-btn" aria-expanded="false">더 보기</button>${spark(x.spark)}<div class="src">${esc(x.src)}</div></article>`).join("");

// ---------- chart data ----------
const D = {
  prov: { weeks: provSeries.weeks, series: provPk.map((p) => ({ name: p.name, values: provSeries.series[p.pkg] })) },
  arxiv: { months: am, series: axChart.map((id) => ({ name: ai.terms.find((t) => t.id === id).name, values: am.map((m) => r4(axShare(id, m) * 100)) })) },
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
// index.html (the dashboard) and map.html get their regions here; site.mjs adds the shared head/nav/footer to every
// page and rewrites sitemap.xml / robots.txt.
const sourceStatus = [
  ["npm", `${npm.fetched} 받음 · ${wlbl(npm.last)}까지 · 패키지 ${NPM.length + NPM_CONTROL.length}개`],
  ["pypi", `${pypi.fetched} 받음 · ${wlbl(pypi.last)}까지 · 패키지 ${PYPI.length + PYPI_CONTROL.length}개`],
  ["arxiv", `${AX.fetched_at} 받음 · ${mlbl(am.at(-1))}까지 · 분야 ${fields.length}개 · 말 ${fields.reduce((n, f) => n + f.terms.length, 0)}개`],
  ["hf", `${HFD.fetched_at} 스냅숏 · 상위 ${snap.top.length} + 트렌딩 ${snap.trending.length}`],
  ["sec", `${SECD.fetched_at} 받음 · ${qlbl(cq)}까지 · 회사 ${SEC.companies.length}곳`],
];
const fills = {
  "index.html": {
    "t-meta": meta, "t-meta-s": `${+updated.slice(5, 7)}월 ${+updated.slice(8)}일 갱신 · 매주 월요일 · 검산 ${CHECKS.checks.length}개 통과`, "t-signals": insightHtml, "t-npm": table(npm, true),
    "t-npm-note": `평일 다운로드 중앙값의 4주 평균. 4주 성장은 ${wlbl(npm.weeks.at(-4))}부터 4주 대 그 전 4주, 초과 성장은 4주 성장에서 대조군 중앙값(${pc(npm.base)})을 뺀 값입니다. 하루 ${man(MIN_LEVEL)} 미만인 패키지는 위 신호 순위에서 뺍니다.`,
    "t-pypi": table(pypi, false),
    "t-pypi-note": `${pypi.br.length ? `PyPI 집계가 ${wlbl(pypi.br.at(-1).week)}에 바뀌어(대조군 ×${pypi.br.at(-1).ratio.toFixed(2)}) 그 뒤 ${pypi.weeks.length - pypi.from}주만 비교합니다. 그래서 가속과 1년 전 대비는 아직 없습니다.` : ""} 대조군 중앙값 ${pc(pypi.base)}. LLM SDK 점유: ${sdkLine}.`,
    "t-arxiv": axTable, "t-research": researchHtml, "t-research-note": researchNote, "t-hf-trending": trendRows, "t-hf-authors": authorRows, "t-capex": capexRows, "t-checks": checkLi,
  },
  "map.html": Object.fromEntries(sourceStatus.map(([id, t]) => [`m-${id}`, esc(t)])),
};
writePages(fills, updated);
// the chart data is a JS comment region (/*@t-data*/…), written separately
{
  const file = path.join(ROOT, "index.html"), h = fs.readFileSync(file, "utf8");
  const next = h.replace(/(\/\*@t-data\*\/)[\s\S]*?(\/\*\/@t-data\*\/)/, (_, a, b) => a + `const D=${JSON.stringify(D)};` + b);
  if (next === h && !h.includes("/*@t-data*/")) throw new Error("index.html: region @t-data not found");
  if (next !== h) { fs.writeFileSync(file, next); console.log("wrote index.html (chart data)"); }
}

// the same insights as data, for the Instagram cards and caption (social/)
// plain text for the cards and the caption; non-breaking spaces stay as U+00A0 so the cards keep the same line breaks
const text = (s) => String(s).replace(/<wbr>/g, "\u200b").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "\u00a0").replace(/&#8209;/g, "\u2011").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const out = { built_at: updated, page: "https://data.pivoxquant.com/", insights: insights.map((x) => ({ id: x.id, k: x.k, big: x.big, bl: x.bl, title: text(x.title), body: text(x.body), src: x.src, spark: x.spark, svg: spark(x.spark, 900, 220) })) };
const ifile = path.join(DIR, "insights.json"), iprev = fs.existsSync(ifile) ? fs.readFileSync(ifile, "utf8") : "";
const inext = JSON.stringify(out, null, 1) + "\n";
if (inext !== iprev) { fs.writeFileSync(ifile, inext); console.log("wrote trends/data/insights.json"); }
