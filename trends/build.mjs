// build.mjs — writes the radar's readings into index.html (the dashboard) and map.html (marked regions).
// Every sentence on the page is computed from trends/data, so a new week of data rewrites it; nothing here is a
// fixed claim that a re-fetch could falsify. The build stops (writes nothing) only when data is missing or the
// checks in verify.mjs failed — then the weekly job opens an issue instead of publishing.
//
// Usage: node trends/build.mjs   (after trends/verify.mjs; also fills the shared head/nav/footer via site.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, SEC, TOPICS, TOPIC_MIN_LEVEL } from "./series.mjs";
import { weekly, lastSunday, breaks, trimEnd, readings, shares, median, MIN_LEVEL } from "./signals.mjs";
import { writePages } from "./site.mjs";
import { draw, options, VIZ_CSS } from "./viz.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "trends", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const CHECKS = load("checks.json");
if (CHECKS.checks.some((c) => !c.ok)) { console.error("trends/data/checks.json has failed checks — run node trends/verify.mjs and fix first"); process.exit(1); }

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const man = (v) => (v >= 1e8 ? (v / 1e8).toFixed(1) + "억" : v >= 1e5 ? Math.round(v / 1e4).toLocaleString("ko-KR") + "만" : v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"));
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

// topic packages (group "topic") belong to their own tabs, never to the AI rankings or tables
const ranked = (x) => x.rows.filter((r) => r.group !== "topic" && r.level >= MIN_LEVEL && r.excess != null).sort((a, b) => b.excess - a.excess);
const table = (x, yoy) => x.rows.filter((r) => r.group !== "topic" && r.level != null).sort((a, b) => (b.excess ?? -9) - (a.excess ?? -9)).map((r) =>
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
const nRank = ranked(npm), pRank = ranked(pypi), nTop = nRank.slice(0, 3), pTop = pRank.slice(0, 3);
const acc = npm.rows.filter((r) => r.level >= MIN_LEVEL && r.accel != null).sort((a, b) => b.accel - a.accel)[0];
const lastN = (a, n) => a.slice(Math.max(0, a.length - n));
const lv = (x, pkg, n) => lastN(x.W[pkg].map((w) => w.level), n);
const span = (x, n) => `${wlbl(lastN(x.weeks, n)[0])}–${wlbl(x.weeks.at(-1))}`;
// data shapes for viz.mjs — each insight lists the ones it can be drawn from, best first
const series = (values, formats) => ({ kind: "series", values: values.map(r4), ...(formats ? { formats } : {}) });
const versus = (from, to, fmt, fromLabel, toLabel) => ({ kind: "versus", from: r4(from), to: r4(to), fromText: fmt(from), toText: fmt(to), fromLabel, toLabel });
const rank = (rows, name, value, label) => ({ kind: "rank", items: rows.slice(0, 5).map((r) => ({ name: name(r), value: r4(value(r)), label: label(r) })) });
const shareOf = (pairs, focus = 0) => ({ kind: "share", focus, parts: pairs.map(([name, value]) => ({ name, value: r4(value) })) });
const short = (r) => r.name.replace(/\s*\([^)]*\)$/, ""); // rank labels: the name alone ("변분 알고리즘", not "… (variational)")
const insights = [
  { id: "npm", k: "개발자 · JavaScript", big: pp(nTop[0].excess), bl: "대조군보다 더 큰 4주 성장",
    title: `npm에서 가장 빨리 크는 AI 패키지는 <b>${keep(nm(nTop[0]))}</b>`,
    body: `4주 다운로드 ${pc(nTop[0].g4)}, 같은 4주 react·lodash 같은 대조군은 ${pc(npm.base)}. 다음은 ${nTop.slice(1).map((r) => `${esc(nm(r))}(${pp(r.excess)})`).join(", ")}.`,
    viz: [rank(nRank, short, (r) => r.excess, (r) => pp(r.excess)), series(lv(npm, nTop[0].pkg, 26))], src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "accel", k: "가속", big: pp(acc.accel), bl: "4주 성장률이 오른 폭",
    title: `성장이 가장 빨라지는 쪽은 <b>${keep(nm(acc))}</b>`,
    body: `4주 성장률이 직전 4주 ${pc(acc.g4 - acc.accel)}에서 ${pc(acc.g4)}로 올라갔습니다.`,
    viz: [versus(acc.g4 - acc.accel, acc.g4, pc, "직전 4주", "최근 4주"), series(lv(npm, acc.pkg, 26))], src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "provider", k: "앱에 붙이는 모델", big: sh(provUp.now), bl: `Vercel AI SDK 공급자 중 ${provUp.name} 비중`,
    title: `1년 새 <b>${keep(provUp.name)}</b> ${sh(provUp.then)}&nbsp;→&nbsp;${sh(provUp.now)}`,
    body: `지금 1위는 ${esc(provLead.name)}(${sh(provLead.now)}), 가장 많이 내린 곳은 ${esc(provDown.name)}(${sh(provDown.then)} → ${sh(provDown.now)}). 앱 개발자가 어떤 모델을 연결하는지 보여 주는 대리 지표입니다.`,
    viz: [versus(provUp.then, provUp.now, sh, "1년 전", "지금"), shareOf(provPk.map((p) => [p.name, provNow[p.pkg]]), provPk.indexOf(provPk.find((p) => p.pkg === provUp.pkg))), series(lastN(provSeries.series[provUp.pkg], 52))], src: `@ai-sdk 공급자 패키지 다운로드 비중 · 최근 52주` },
  { id: "pypi", k: "개발자 · Python", big: pp(pTop[0].excess), bl: "대조군보다 더 큰 4주 성장",
    title: `파이썬에서 가장 빨리 크는 쪽은 <b>${keep(pTop[0].name)}</b>`,
    body: `4주 다운로드 ${pc(pTop[0].g4)}, 대조군(requests·numpy 등) ${pc(pypi.base)}. 다음은 ${pTop.slice(1).map((r) => `${esc(r.name)}(${pp(r.excess)})`).join(", ")}.`,
    viz: [rank(pRank, short, (r) => r.excess, (r) => pp(r.excess)), series(pypi.W[pTop[0].pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${wlbl(pypi.weeks[pypi.from])}–${wlbl(pypi.last)} 주` },
  ...(axTop ? [{ id: "arxiv", k: "연구", big: `${axTop.ratio.toFixed(1)}배`, bl: "AI 논문 속 비율, 1년 전 대비",
    title: `연구자들이 가장 빠르게 더 쓰는 말은 <b>${keep(axTop.name)}</b>`,
    body: `최근 3개월 AI 논문의 ${sh(axTop.now)}가 초록에 썼습니다(1년 전 ${sh(axTop.then)}). 가장 많이 쓰인 말은 ${esc(axBiggest.name)}(${sh(axBiggest.now)}).`,
    viz: [versus(axTop.then, axTop.now, sh, "1년 전", "최근 3개월"), series(am.map((m) => axShare(axTop.id, m))), rank(axRows.filter((r) => r.then >= 0.002 && r.papers3 >= 10), short, (r) => r.ratio, (r) => `${r.ratio.toFixed(1)}배`)], src: `arXiv cs.AI·cs.CL·cs.LG · ${mlbl(am[0])}–${mlbl(am.at(-1))}` }] : []),
  { id: "hf", k: "오픈 모델", big: sh(byAuthor[0][1] / genTotal), bl: `텍스트 생성 모델 다운로드 중 ${byAuthor[0][0]} 계열`,
    title: `오픈 텍스트 생성 모델 다운로드의 ${sh(byAuthor[0][1] / genTotal)}는 <b>${keep(byAuthor[0][0])}</b>&nbsp;계열`,
    body: `다음은 ${byAuthor.slice(1, 3).map(([a, v]) => `${esc(a)}(${sh(v / genTotal)})`).join(", ")}. 지금 가장 뜨는 모델은 ${keep(snap.trending[0].id)}(${keep(snap.trending[0].task ?? "")}${snap.trending[0].task ? ", " : ""}${snap.trending[0].created} 공개).${prevSnap ? ` 지난주보다 다운로드 상위 ${snap.top.length}에 새로 든 모델 ${newIn.length}개.` : ""}`,
    viz: [shareOf([...byAuthor.slice(0, 5).map(([a, v]) => [a, v / genTotal]), ["그 밖", byAuthor.slice(5).reduce((s, [, v]) => s + v, 0) / genTotal]]), rank(byAuthor.map(([a, v]) => ({ name: a, v: v / genTotal })), (r) => r.name, (r) => r.v, (r) => sh(r.v))], src: `Hugging Face 다운로드 상위 ${snap.top.length} · ${snap.date}` },
  { id: "capex", k: "자본", big: usd(capex.sum), bl: `빅테크 4사 설비투자 · ${qlbl(cq)}`,
    title: `AI 인프라에 들어가는 돈, 1년 전보다 <b>${pc(capex.yoy, 0)}</b>`,
    body: `Microsoft·Alphabet·Amazon·Meta 합계. 최근 4개 분기 ${usd(capex.ttm)}(1년 전 ${usd(capex.ttmPrev)}). 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).`,
    viz: [series(common.map(sum4), ["columns", "area", "line"]), versus(capex.ttmPrev, capex.ttm, usd, "1년 전 4개 분기", "최근 4개 분기"), rank(capexLead, (r) => r.name, (r) => r.yoy, (r) => pc(r.yoy, 0))], src: `SEC 공시 · ${qlbl(common[0])}–${qlbl(cq)}` },
];

// the card's drawing, made on the server so it reads without JavaScript: the first format of its first shape
const vizHtml = (x) => { const o = options(x.viz)[0]; return o ? draw(x.viz[o.i], o.format) : ""; };
// ---------- topic tabs: AI is the radar above; every other topic is one arXiv field + its packages (+ HF tasks) ----------
const pyRow = (pkg) => pypi.rows.find((r) => r.pkg === pkg);
const pySpan = `${wlbl(pypi.weeks[pypi.from])}–${wlbl(pypi.last)} 주`;
function topicCards(t) {
  const f = fields.find((x) => x.id === t.field), out = [];
  const fsrc = f ? `arXiv ${f.scope.replace(/cat:/g, "").replace(/[()]/g, "").replace(/ OR /g, "·")} · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}` : "";
  const ok = (r) => r.then >= 0.002 && r.papers3 >= 10; // same floor as the AI radar
  if (f && f.growth != null) out.push({ id: `${t.id}-papers`, k: "연구", big: pc(f.growth, 0), bl: "논문 수, 1년 전 같은 3개월 대비",
    title: `${esc(t.name)} 논문이 1년 새 <b>${pc(f.growth, 0)}</b>`, body: `최근 3개월 한 달 평균 ${Math.round(f.monthly).toLocaleString("ko-KR")}편.`,
    viz: [series(f.am.map((m) => f.X.total[m]), ["columns", "area", "line"]), versus(avg(f.prev3.map((m) => f.X.total[m])), f.monthly, (v) => `${Math.round(v).toLocaleString("ko-KR")}편`, "1년 전 같은 3개월", "최근 3개월")], src: fsrc });
  if (f?.top) out.push({ id: `${t.id}-rising`, k: "연구 · 빨리 늘어난 말", big: `${f.top.ratio.toFixed(1)}배`, bl: "논문 속 비율, 1년 전 대비",
    title: `가장 빨리 늘어난 말은 <b>${keep(f.top.name)}</b>`, body: `최근 3개월 ${esc(t.name)} 논문의 ${sh(f.top.now)}가 초록에 썼습니다(1년 전 ${sh(f.top.then)}).`,
    viz: [versus(f.top.then, f.top.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(f.top.id, m))), rank(f.rows.filter(ok), short, (r) => r.ratio, (r) => `${r.ratio.toFixed(1)}배`)], src: fsrc });
  if (f?.biggest) out.push({ id: `${t.id}-biggest`, k: "연구 · 가장 많이 쓰는 말", big: sh(f.biggest.now), bl: "논문 중 이 말을 쓴 비율",
    title: `가장 많이 쓰이는 말은 <b>${keep(f.biggest.name)}</b>`, body: f.biggest.then != null ? `1년 전 같은 3개월은 ${sh(f.biggest.then)}였습니다.` : "",
    viz: [rank([...f.rows].sort((a, b) => b.now - a.now), short, (r) => r.now, (r) => sh(r.now)), series(f.am.map((m) => f.share(f.biggest.id, m))), ...(f.biggest.then != null ? [versus(f.biggest.then, f.biggest.now, sh, "1년 전", "최근 3개월")] : [])], src: fsrc });
  const down = f ? f.rows.filter((r) => ok(r) && r.ratio < 0.9).sort((a, b) => a.ratio - b.ratio)[0] : null;
  if (down) out.push({ id: `${t.id}-falling`, k: "연구 · 줄어든 말", big: pc(down.ratio - 1, 0), bl: "논문 속 비율, 1년 전 대비",
    title: `가장 많이 줄어든 말은 <b>${keep(down.name)}</b>`, body: `최근 3개월 ${sh(down.now)}, 1년 전 ${sh(down.then)}.`,
    viz: [versus(down.then, down.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(down.id, m)))], src: fsrc });
  const pk = (t.pypi ?? []).map(pyRow).filter((r) => r && r.level >= TOPIC_MIN_LEVEL);
  const fast = pk.filter((r) => r.excess != null).sort((a, b) => b.excess - a.excess);
  if (fast.length) out.push({ id: `${t.id}-pkg-fast`, k: "개발자 · Python", big: pp(fast[0].excess), bl: "대조군보다 더 큰 4주 성장",
    title: `가장 빨리 더 내려받는 도구는 <b>${keep(fast[0].name)}</b>`,
    body: `4주 다운로드 ${pc(fast[0].g4)}, 대조군(requests·numpy 등) ${pc(pypi.base)}.${fast.length > 1 ? ` 다음은 ${fast.slice(1, 3).map((r) => `${keep(r.name)}(${pp(r.excess)})`).join(", ")}.` : ""}`,
    viz: [...(fast.length > 2 ? [rank(fast, short, (r) => r.excess, (r) => pp(r.excess))] : []), series(pypi.W[fast[0].pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${pySpan}` });
  const big = [...pk].sort((a, b) => b.level - a.level)[0];
  if (big && big.pkg !== fast[0]?.pkg) out.push({ id: `${t.id}-pkg-big`, k: "개발자 · 가장 많이", big: man(big.level), bl: "평일 하루 다운로드",
    title: `가장 많이 내려받는 도구는 <b>${keep(big.name)}</b>`, body: `4주 다운로드 ${pc(big.g4)}.`,
    viz: [...(pk.length > 2 ? [rank([...pk].sort((a, b) => b.level - a.level), short, (r) => r.level, (r) => man(r.level))] : []), series(pypi.W[big.pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${pySpan}` });
  const hfm = (t.hf ?? []).flatMap((task) => snap.tasks?.[task] ?? []);
  if (hfm.length) { const m = [...hfm].sort((a, b) => (b.trending ?? 0) - (a.trending ?? 0)), fresh = m[0].downloads < 100; out.push({ id: `${t.id}-hf`, k: "모델", big: fresh ? `♥ ${m[0].likes.toLocaleString("ko-KR")}` : man(m[0].downloads), bl: fresh ? "좋아요 (공개 직후라 다운로드가 아직 적음)" : "30일 다운로드",
    title: `지금 가장 뜨는 ${esc(t.name)} 모델은 <b>${keep(m[0].id)}</b>`, body: `${keep(m[0].task ?? "")} · ${m[0].created} 공개.${m.length > 1 ? ` 다음은 ${m.slice(1, 3).map((x) => keep(x.id)).join(", ")}.` : ""}`,
    viz: [...(m.length > 2 ? [rank(m, (x) => x.id.split("/").pop(), (x) => (fresh ? x.likes : x.downloads), (x) => (fresh ? `♥ ${x.likes.toLocaleString("ko-KR")}` : man(x.downloads)))] : [])], src: `Hugging Face 트렌딩 · ${(t.hf ?? []).join("·")} · ${snap.date}` }); }
  return out.slice(0, 7);
}
const topics = TOPICS.map((t) => ({ ...t, cards: t.id === "ai" ? insights : topicCards(t) })).filter((t) => t.cards.length);

// ---------- big cases: what changed enough to post about today (social/plan.mjs decides whether to) ----------
// Each detector looks only at finished periods — the last complete week of downloads, the last full month of papers,
// a filed quarter — so a lumpy day can't fire one. `key` names the case (it is posted at most once), `subject` what it
// is about (social/plan.mjs leaves a subject alone for a while after posting it), `score` which one leads.
const topicOfPkg = (pkg) => TOPICS.find((t) => t.pypi?.includes(pkg))?.id ?? "ai";
const events = [];
const SURGE = 1.4, ATH = 1.1, PAPER = 2.5;
for (const [x, src, list, control] of [[npm, "npm", NPM, NPM_CONTROL], [pypi, "PyPI", PYPI, PYPI_CONTROL]]) {
  const n = x.weeks.length, wk = x.weeks.at(-1), prior = Math.min(12, n - 1 - x.from);
  if (prior < 6 || x.W[list[0].pkg].at(-1).holiday) continue;
  const usual = (pkg) => median(x.W[pkg].slice(n - 1 - prior, n - 1).map((w) => w.level).filter((v) => v != null));
  const ctrl = median(control.map((p) => x.W[p.pkg].at(-1).level / usual(p.pkg)));
  for (const p of list) {
    const r = x.rows.find((q) => q.pkg === p.pkg), L = x.W[p.pkg].at(-1).level, u = usual(p.pkg), name = nm(p);
    if (L == null || !u || L < (p.group === "topic" ? TOPIC_MIN_LEVEL : MIN_LEVEL)) continue;
    const vs = L / u / ctrl, topic = topicOfPkg(p.pkg), levels = lastN(x.W[p.pkg].slice(x.from).map((w) => w.level), 26);
    if (vs >= SURGE) events.push({ key: `surge:${src}:${p.pkg}:${wk}`, subject: `pkg:${p.pkg}`, kind: "급증", score: 50 + (vs - 1) * 50, topic, card: {
      id: `ev-surge-${p.pkg}`, k: `빅 케이스 · ${src} 다운로드`, big: `${(L / u).toFixed(1)}배`, bl: "지난주 다운로드, 직전 평소 대비",
      title: `지난주 <b>${keep(name)}</b> 다운로드가 평소의 ${(L / u).toFixed(1)}배`,
      body: `평일 하루 ${man(L)}회, 직전 ${prior}주 평소는 ${man(u)}회. 같은 주 대조군은 평소의 ${ctrl.toFixed(2)}배였습니다.`,
      viz: [series(levels, ["columns", "area", "line"]), versus(u, L, man, `직전 ${prior}주 평소`, "지난주")], src: `${src} 평일 다운로드 · ${wlbl(x.weeks[n - levels.length])}–${wlbl(wk)}` } });
    const hist = x.W[p.pkg].slice(x.from, n - 1).filter((w) => w.level != null);
    if (hist.length >= 26) { const top = hist.reduce((a, b) => (b.level > a.level ? b : a));
      if (L > top.level * ATH) events.push({ key: `ath:${src}:${p.pkg}:${wk}`, subject: `pkg:${p.pkg}`, kind: "최고치", score: 40 + (L / top.level - 1) * 100, topic, card: {
        id: `ev-ath-${p.pkg}`, k: `빅 케이스 · ${src} 최고치`, big: man(L), bl: "평일 하루 다운로드, 지난주",
        title: `<b>${keep(name)}</b> 주간 다운로드가 역대 최고`,
        body: `이전 최고(${wlbl(top.week)})보다 ${pc(L / top.level - 1, 0)} 많습니다.${r?.g4 != null ? ` 4주 성장 ${pc(r.g4)}, 대조군 ${pc(x.base)}.` : ""}`,
        viz: [series(lastN(x.W[p.pkg].slice(x.from).map((w) => w.level), 104), ["line", "area", "columns"]), versus(top.level, L, man, "이전 최고", "지난주")], src: `${src} 평일 다운로드 · ${wlbl(x.weeks[Math.max(x.from, n - 104)])}–${wlbl(wk)}` } });
    }
  }
}
{ // the model app developers wire in most: has the leader changed in four weeks?
  const then = shares(provW, 4), oldLead = provPk.reduce((a, b) => ((then[b.pkg] ?? -1) > (then[a.pkg] ?? -1) ? b : a));
  if (oldLead.pkg !== provLead.pkg && then[oldLead.pkg] != null) events.push({ key: `flip:provider:${provLead.pkg}:${npm.last}`, subject: "flip:provider", kind: "1위 교체", score: 100, topic: "ai", card: {
    id: "ev-flip-provider", k: "빅 케이스 · 1위 교체", big: sh(provLead.now), bl: `Vercel AI SDK 공급자 중 ${provLead.name} 비중`,
    title: `앱에 붙이는 모델 1위, 이제 <b>${keep(provLead.name)}</b>`,
    body: `4주 전 1위는 ${esc(oldLead.name)}(${sh(then[oldLead.pkg])}), 지금은 ${sh(provNow[oldLead.pkg])}. 앱 개발자가 어떤 모델을 연결하는지 보여 주는 대리 지표입니다.`,
    viz: [shareOf(provPk.map((p) => [p.name, provNow[p.pkg]]), provPk.indexOf(provLead)), rank([...provPk].sort((a, b) => provNow[b.pkg] - provNow[a.pkg]), (p) => p.name, (p) => provNow[p.pkg], (p) => sh(provNow[p.pkg]))],
    src: `@ai-sdk 공급자 패키지 다운로드 비중 · ${wlbl(npm.last)}` } });
}
for (const f of fields) { // a phrase whose share of a field's papers has just crossed 2.5× its level a year earlier
  if (f.am.length < 16) continue;
  const win = (back) => { const l3 = f.am.slice(f.am.length - 3 - back, f.am.length - back), p3 = l3.map((m) => mAdd(m, -12)); return (id) => { const now = avg(l3.map((m) => f.share(id, m))), then = avg(p3.map((m) => f.share(id, m))); return { now, then, ratio: then ? now / then : null }; }; };
  const cur = win(0), prev = win(1), topic = TOPICS.find((t) => t.field === f.id)?.id ?? "ai", tname = TOPICS.find((t) => t.id === topic).name;
  for (const r of f.rows) {
    const c = cur(r.id), pv = prev(r.id);
    if (!(c.then >= 0.002 && r.papers3 >= 10 && c.ratio >= PAPER && (pv.ratio ?? 0) < PAPER)) continue;
    events.push({ key: `paper:${f.id}:${r.id}:${f.am.at(-1)}`, subject: `paper:${f.id}:${r.id}`, kind: "연구", score: 60 + c.ratio * 5, topic, card: {
      id: `ev-paper-${f.id}-${r.id}`, k: `빅 케이스 · ${tname} 연구`, big: `${c.ratio.toFixed(1)}배`, bl: "논문 속 비율, 1년 전 대비",
      title: `${esc(tname)} 논문 속 <b>${keep(r.name)}</b>, 1년 새 ${c.ratio.toFixed(1)}배`,
      body: `최근 3개월 논문의 ${sh(c.now)}가 초록에 썼습니다(1년 전 ${sh(c.then)}). 한 달 전 같은 계산으로는 ${(pv.ratio ?? 0).toFixed(1)}배였습니다.`,
      viz: [versus(c.then, c.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(r.id, m)))], src: `arXiv · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}` } });
  }
}
{ // a new #1 on Hugging Face trending that wasn't #1 on any day of the last two weeks
  const before = HFD.snapshots.filter((s) => s.date < snap.date && (new Date(snap.date) - new Date(s.date)) / 864e5 <= 14), m = snap.trending[0];
  if (before.length && m && !before.some((s) => s.trending[0]?.id === m.id) && (m.downloads >= 50000 || m.likes >= 1000)) {
    const topic = TOPICS.find((t) => t.hf?.includes(m.task))?.id ?? "ai";
    events.push({ key: `hf:${m.id}`, subject: `hf:${m.id}`, kind: "새 1위", score: 45, topic, card: {
      id: "ev-hf-trending", k: "빅 케이스 · 오픈 모델", big: m.downloads >= 50000 ? man(m.downloads) : `♥ ${m.likes.toLocaleString("ko-KR")}`, bl: m.downloads >= 50000 ? "30일 다운로드" : "좋아요",
      title: `Hugging Face 트렌딩 1위가 바뀌었습니다: <b>${keep(m.id)}</b>`,
      body: `${keep(m.task ?? "")}${m.task ? " · " : ""}${m.created} 공개. 직전 1위는 ${keep(before.at(-1).trending[0]?.id ?? "—")}.`,
      viz: [rank(snap.trending, (x) => x.id.split("/").pop(), (x) => x.trending ?? 0, (x) => man(x.downloads))], src: `Hugging Face 트렌딩 · ${snap.date}` } });
  }
}
{ // all four have filed a new quarter (within 75 days of its end, so an old quarter never fires on a first run)
  const end = new Date(`${cq.slice(0, 4)}-${String(+cq.slice(5) * 3).padStart(2, "0")}-28`);
  if ((new Date(SECD.fetched_at) - end) / 864e5 <= 75) events.push({ key: `capex:${cq}`, subject: "capex", kind: "공시", score: 90, topic: "ai", card: {
    id: "ev-capex", k: "빅 케이스 · 자본", big: usd(capex.sum), bl: `빅테크 4사 설비투자 · ${qlbl(cq)}`,
    title: `빅테크 4사 ${qlbl(cq)} 설비투자, 1년 전보다 <b>${pc(capex.yoy, 0)}</b>`,
    body: `Microsoft·Alphabet·Amazon·Meta 공시 합계. 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).`,
    viz: [series(common.map(sum4), ["columns", "area", "line"]), rank(capexLead, (r) => r.name, (r) => r.yoy, (r) => pc(r.yoy, 0))], src: `SEC 공시 · ${qlbl(common[0])}–${qlbl(cq)}` } });
}
events.sort((a, b) => b.score - a.score);

// plain text for the cards and the caption; non-breaking spaces stay as U+00A0 so the cards keep the same line breaks
const text = (s) => String(s).replace(/<wbr>/g, "\u200b").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "\u00a0").replace(/&#8209;/g, "\u2011").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const cardHtml = (list) => list.map((x, i) => `<article class="ins${i === 0 ? " lead" : ""}"><div class="k">${x.k}</div><div class="big">${x.big}</div><div class="bl">${esc(x.bl)}</div><h3>${glue(x.title)}</h3><p>${x.body}</p>${text(x.body).length > 60 ? `<button type="button" class="more-btn" aria-expanded="false">더 보기</button>` : ""}${vizHtml(x)}<div class="src">${esc(x.src)}</div></article>`).join("");
const tabsHtml = topics.map((t, i) => `<button type="button" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-topic="${t.id}">${esc(t.name)}<span class="n">${t.cards.length}</span></button>`).join("");
const panelsHtml = topics.map((t, i) => `<div class="insights" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}"${i === 0 ? "" : " hidden"}>${cardHtml(t.cards)}</div>`).join("");

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
const meta = `${updated} 갱신 · 매일 자동 · npm ${wlbl(npm.last)}까지 · PyPI ${wlbl(pypi.last)}까지 · arXiv ${mlbl(am.at(-1))}까지 · Hugging Face ${snap.date} · SEC ${qlbl(cq)}까지 · 검산 ${CHECKS.checks.length}개 통과`;
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
    "t-tabs": tabsHtml, "t-panels": panelsHtml,
    "t-events": events.slice(0, 3).map((e) => `<li><a href="#${e.topic}"><span class="ek">빅 케이스 · ${esc(e.kind)}</span><span>${glue(e.card.title).replace(/<\/?b>/g, "")}</span></a></li>`).join(""),
    "t-meta": meta, "t-meta-s": `${+updated.slice(5, 7)}월 ${+updated.slice(8)}일 갱신 · 매일 자동 · 검산 ${CHECKS.checks.length}개 통과`, "t-npm": table(npm, true),
    "t-npm-note": `평일 다운로드 중앙값의 4주 평균. 4주 성장은 ${wlbl(npm.weeks.at(-4))}부터 4주 대 그 전 4주, 초과 성장은 4주 성장에서 대조군 중앙값(${pc(npm.base)})을 뺀 값입니다. 하루 ${man(MIN_LEVEL)} 미만인 패키지는 위 신호 순위에서 뺍니다.`,
    "t-pypi": table(pypi, false),
    "t-pypi-note": `${pypi.br.length ? `PyPI 집계가 ${wlbl(pypi.br.at(-1).week)}에 바뀌어(대조군 ×${pypi.br.at(-1).ratio.toFixed(2)}) 그 뒤 ${pypi.weeks.length - pypi.from}주만 비교합니다. 그래서 가속과 1년 전 대비는 아직 없습니다.` : ""} 대조군 중앙값 ${pc(pypi.base)}. LLM SDK 점유: ${sdkLine}.`,
    "t-arxiv": axTable, "t-hf-trending": trendRows, "t-hf-authors": authorRows, "t-capex": capexRows, "t-checks": checkLi,
  },
  "map.html": Object.fromEntries(sourceStatus.map(([id, t]) => [`m-${id}`, esc(t)])),
};
writePages(fills, updated);
// the chart data and the drawing styles are comment regions (/*@name*/…/*/@name*/), written separately
{
  const file = path.join(ROOT, "index.html"), h = fs.readFileSync(file, "utf8");
  let next = h;
  for (const [name, body] of [["t-data", `const D=${JSON.stringify(D)};`], ["t-vizcss", VIZ_CSS]]) {
    if (!next.includes(`/*@${name}*/`)) throw new Error(`index.html: region @${name} not found`);
    next = next.replace(new RegExp(`(\\/\\*@${name}\\*\\/)[\\s\\S]*?(\\/\\*\\/@${name}\\*\\/)`), (_, a, b) => a + body + b);
  }
  if (next !== h) { fs.writeFileSync(file, next); console.log("wrote index.html (chart data, drawing styles)"); }
}

// the same insights as data, for the Instagram cards and caption (social/)
const plainCard = (x) => ({ id: x.id, k: x.k, big: x.big, bl: x.bl, title: text(x.title), body: text(x.body), src: x.src, viz: x.viz });
const out = { built_at: updated, page: "https://data.pivoxquant.com/", insights: insights.map(plainCard), topics: topics.map((t) => ({ id: t.id, name: t.name, insights: t.cards.map(plainCard) })),
  events: events.map((e) => ({ key: e.key, subject: e.subject, kind: e.kind, score: Math.round(e.score * 10) / 10, topic: e.topic, headline: text(e.card.title), card: plainCard(e.card) })) };
const ifile = path.join(DIR, "insights.json"), iprev = fs.existsSync(ifile) ? fs.readFileSync(ifile, "utf8") : "";
const inext = JSON.stringify(out, null, 1) + "\n";
if (inext !== iprev) { fs.writeFileSync(ifile, inext); console.log("wrote trends/data/insights.json"); }
