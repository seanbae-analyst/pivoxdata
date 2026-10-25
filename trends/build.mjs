// build.mjs — writes the radar's readings into index.html (the dashboard) and map.html (marked regions).
// Every sentence on the page is computed from trends/data, so a new week of data rewrites it; nothing here is a
// fixed claim that a re-fetch could falsify. The build stops (writes nothing) only when data is missing or the
// checks in verify.mjs failed — then the weekly job opens an issue instead of publishing.
//
// Usage: node trends/build.mjs   (after trends/verify.mjs; also fills the shared head/nav/footer via site.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, SEC, TOPICS, TOPIC_MIN_LEVEL, RACES, AX as AXSERIES, NEWS, DOMAINS } from "./series.mjs";
import { weekTable, breaks, readings, shares, median, MIN_LEVEL } from "./signals.mjs";
import { writePages } from "./site.mjs";
import { draw, options, VIZ_CSS } from "./viz.mjs";
import { termify, glossaryHtml } from "./glossary.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "trends", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const CHECKS = load("checks.json");
if (CHECKS.checks.some((c) => !c.ok)) { console.error("trends/data/checks.json has failed checks — run node trends/verify.mjs and fix first"); process.exit(1); }

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); // safe in attributes too
const man = (v) => (v >= 1e8 ? (v / 1e8).toFixed(1) + "억" : v >= 1e5 ? Math.round(v / 1e4).toLocaleString("ko-KR") + "만" : v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"));
const pc = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%");
const pp = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%p");
const sh = (v, d = 1) => (v == null ? "—" : (v * 100).toFixed(d) + "%");
const usd = (v) => "$" + (v / 1e9).toFixed(1) + "B";
const wlbl = (w) => `${+w.slice(5, 7)}월 ${+w.slice(8)}일 주`;
// a week with its year when that isn't `ref`'s, so a range that crosses a year says so ("2024년 10월 14일 주–2026년
// 10월 5일 주" — without the years it read backwards)
const wyr = (w, ref) => (w.slice(0, 4) === ref.slice(0, 4) ? wlbl(w) : `${w.slice(0, 4)}년 ${wlbl(w)}`);
const wspan = (a, b) => `${wyr(a, b)}–${wyr(b, a)}`;
const mlbl = (m) => `${m.slice(0, 4)}년 ${+m.slice(4)}월`;
const qlbl = (q) => `${q.slice(0, 4)}년 ${q.slice(5)}분기`;
const cls = (v) => (v == null ? "" : v < 0 ? "neg" : "pos");
const r4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);

// ---------- downloads (npm, PyPI) ----------
function downloads(src, list, control) {
  const d = load(`${src}.json`), P = d.packages, all = [...list, ...control];
  const { W } = weekTable(Object.fromEntries(all.map((p) => [p.pkg, P[p.pkg].days])));
  const br = breaks(Object.fromEntries(control.map((p) => [p.pkg, W[p.pkg]])));
  const from = br.length ? br.at(-1).i : 0, weeks = W[all[0].pkg].map((x) => x.week);
  const R = Object.fromEntries(all.map((p) => [p.pkg, readings(W[p.pkg], from)]));
  const base = median(control.map((p) => R[p.pkg].g4)); // what the whole source did in the same 4 weeks
  const rows = list.map((p) => ({ ...p, ...R[p.pkg], excess: R[p.pkg].g4 == null || base == null ? null : R[p.pkg].g4 - base }));
  if (rows.every((r) => r.g4 == null)) throw new Error(`${src}: no package has 8 comparable weeks`);
  return { d, W, weeks, from, br, base, rows, last: weeks.at(-1), fetched: d.fetched_at };
}
const npm = downloads("npm", NPM, NPM_CONTROL), pypi = downloads("pypi", PYPI, PYPI_CONTROL);

// topic packages (group "topic") belong to their own tabs and race-only packages (group "race", e.g. playwright) to
// the races — neither joins the AI rankings or tables
const isAI = (r) => r.group !== "topic" && r.group !== "race";
const ranked = (x) => x.rows.filter((r) => isAI(r) && r.level >= MIN_LEVEL && r.excess != null).sort((a, b) => b.excess - a.excess);
const table = (x, yoy) => x.rows.filter((r) => isAI(r) && r.level != null).sort((a, b) => (b.excess ?? -9) - (a.excess ?? -9)).map((r) =>
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

// the day this build describes: the latest fetch of any source
const updated = [npm.fetched, pypi.fetched, AX.fetched_at, HFD.fetched_at, SECD.fetched_at].sort().at(-1);
// a finished week named from that day: 지난주 only when it is last week (npm's newest weeks are often still being
// counted and are left out, so its latest finished week can be two or three weeks back) — otherwise its date
const wname = (w) => { const d = (new Date(updated) - new Date(w)) / 864e5; return d >= 7 && d < 14 ? "지난주" : wlbl(w); };

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
const acc = npm.rows.filter((r) => isAI(r) && r.level >= MIN_LEVEL && r.accel != null).sort((a, b) => b.accel - a.accel)[0];
const lastN = (a, n) => a.slice(Math.max(0, a.length - n));
const lv = (x, pkg, n) => lastN(x.W[pkg].map((w) => w.level), n);
const span = (x, n) => wspan(lastN(x.weeks, n)[0], x.weeks.at(-1));
// data shapes for viz.mjs — each insight lists the ones it can be drawn from, best first
const series = (values, formats) => ({ kind: "series", values: values.map(r4), ...(formats ? { formats } : {}) });
const versus = (from, to, fmt, fromLabel, toLabel) => ({ kind: "versus", from: r4(from), to: r4(to), fromText: fmt(from), toText: fmt(to), fromLabel, toLabel });
const rank = (rows, name, value, label) => ({ kind: "rank", items: rows.slice(0, 5).map((r) => ({ name: name(r), value: r4(value(r)), label: label(r) })) });
const shareOf = (pairs, focus = 0) => ({ kind: "share", focus, parts: pairs.map(([name, value]) => ({ name, value: r4(value) })) });
const short = (r) => r.name.replace(/\s*\([^)]*\)$/, ""); // rank labels: the name alone ("변분 알고리즘", not "… (variational)")
const insights = [
  { id: "npm", k: "개발자 · JavaScript", big: pp(nTop[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
    title: `npm에서 가장 빨리 크는 AI 패키지는 <b>${keep(nm(nTop[0]))}</b>`,
    body: `4주 다운로드 ${pc(nTop[0].g4)}, 같은 4주 react·lodash 같은 대조군은 ${pc(npm.base)}. 다음은 ${nTop.slice(1).map((r) => `${esc(nm(r))}(${pp(r.excess)})`).join(", ")}.`,
    easy: `한 달 사이 다운로드가 ${pc(nTop[0].g4)} 늘었어요. 같은 기간 react 같은 인기 패키지는 ${pc(npm.base)} — 그보다 ${pp(nTop[0].excess)} 더 빨라요.`, viz: [rank(nRank, short, (r) => r.excess, (r) => pp(r.excess)), series(lv(npm, nTop[0].pkg, 26))], src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "accel", k: "가속", big: pp(acc.accel), bl: "늘어나는 속도가 빨라진 폭",
    title: `성장이 가장 빨라지는 쪽은 <b>${keep(nm(acc))}</b>`,
    body: `4주 성장률이 직전 4주 ${pc(acc.g4 - acc.accel)}에서 ${pc(acc.g4)}로 올라갔습니다.`,
    easy: `늘어나는 속도 자체가 빨라지고 있어요. 직전 4주엔 ${pc(acc.g4 - acc.accel)}, 최근 4주엔 ${pc(acc.g4)} 늘었어요.`, viz: [versus(acc.g4 - acc.accel, acc.g4, pc, "직전 4주", "최근 4주"), series(lv(npm, acc.pkg, 26))], src: `npm 평일 다운로드 · ${span(npm, 26)}` },
  { id: "provider", k: "앱에 붙이는 모델", big: sh(provUp.now), bl: `Vercel AI SDK 공급자 중 ${provUp.name} 비중`,
    title: `1년 새 <b>${keep(provUp.name)}</b> ${sh(provUp.then)}&nbsp;→&nbsp;${sh(provUp.now)}`,
    body: `지금 1위는 ${esc(provLead.name)}(${sh(provLead.now)}), 가장 많이 내린 곳은 ${esc(provDown.name)}(${sh(provDown.then)} → ${sh(provDown.now)}). 앱 개발자가 어떤 모델을 연결하는지 보여 주는 대리 지표입니다.`,
    easy: `AI 앱을 만들 때 연결하는 모델 회사를 100번 세면 ${Math.round(provUp.now * 100)}번이 ${esc(provUp.name)}. 1년 전엔 ${Math.round(provUp.then * 100)}번이었어요.`, viz: [versus(provUp.then, provUp.now, sh, "1년 전", "지금"), shareOf(provPk.map((p) => [p.name, provNow[p.pkg]]), provPk.indexOf(provPk.find((p) => p.pkg === provUp.pkg))), series(lastN(provSeries.series[provUp.pkg], 52))], src: `@ai-sdk 공급자 패키지 다운로드 비중 · 최근 52주` },
  { id: "pypi", k: "개발자 · Python", big: pp(pTop[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
    title: `파이썬에서 가장 빨리 크는 쪽은 <b>${keep(pTop[0].name)}</b>`,
    body: `4주 다운로드 ${pc(pTop[0].g4)}, 대조군(requests·numpy 등) ${pc(pypi.base)}. 다음은 ${pTop.slice(1).map((r) => `${esc(r.name)}(${pp(r.excess)})`).join(", ")}.`,
    easy: `파이썬 개발자들의 다운로드가 한 달 새 ${pc(pTop[0].g4)} 늘었어요. 인기 패키지(${pc(pypi.base)})보다 ${pp(pTop[0].excess)} 더 빨라요.`, viz: [rank(pRank, short, (r) => r.excess, (r) => pp(r.excess)), series(pypi.W[pTop[0].pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${wspan(pypi.weeks[pypi.from], pypi.last)}` },
  ...(axTop ? [{ id: "arxiv", k: "연구", big: `${axTop.ratio.toFixed(1)}배`, bl: "이 말을 쓰는 AI 논문 비율 · 1년 전과 비교",
    title: `연구자들이 가장 빠르게 더 쓰는 말은 <b>${keep(axTop.name)}</b>`,
    body: `최근 3개월 AI 논문의 ${sh(axTop.now)}가 초록에 썼습니다(1년 전 ${sh(axTop.then)}). 가장 많이 쓰인 말은 ${esc(axBiggest.name)}(${sh(axBiggest.now)}).`,
    easy: `AI 논문 1,000편 중 ${Math.round(axTop.now * 1000)}편이 이 말을 써요. 1년 전엔 ${Math.round(axTop.then * 1000)}편이었어요.`, viz: [versus(axTop.then, axTop.now, sh, "1년 전", "최근 3개월"), series(am.map((m) => axShare(axTop.id, m))), rank(axRows.filter((r) => r.then >= 0.002 && r.papers3 >= 10), short, (r) => r.ratio, (r) => `${r.ratio.toFixed(1)}배`)], src: `arXiv cs.AI·cs.CL·cs.LG · ${mlbl(am[0])}–${mlbl(am.at(-1))}` }] : []),
  { id: "hf", k: "오픈 모델", big: sh(byAuthor[0][1] / genTotal), bl: `텍스트 생성 모델 다운로드 중 ${byAuthor[0][0]} 계열`,
    title: `오픈 텍스트 생성 모델 다운로드의 ${sh(byAuthor[0][1] / genTotal)}는 <b>${keep(byAuthor[0][0])}</b>&nbsp;계열`,
    body: `다음은 ${byAuthor.slice(1, 3).map(([a, v]) => `${esc(a)}(${sh(v / genTotal)})`).join(", ")}. 지금 가장 뜨는 모델은 ${keep(snap.trending[0].id)}(${keep(snap.trending[0].task ?? "")}${snap.trending[0].task ? ", " : ""}${snap.trending[0].created} 공개).${prevSnap ? ` 지난주보다 다운로드 상위 ${snap.top.length}에 새로 든 모델 ${newIn.length}개.` : ""}`,
    easy: `오픈 AI 모델을 10번 내려받으면 약 ${Math.round(byAuthor[0][1] / genTotal * 10)}번이 ${esc(byAuthor[0][0])} 모델이에요.`, viz: [shareOf([...byAuthor.slice(0, 5).map(([a, v]) => [a, v / genTotal]), ["그 밖", byAuthor.slice(5).reduce((s, [, v]) => s + v, 0) / genTotal]]), rank(byAuthor.map(([a, v]) => ({ name: a, v: v / genTotal })), (r) => r.name, (r) => r.v, (r) => sh(r.v))], src: `Hugging Face 다운로드 상위 ${snap.top.length} · ${snap.date}` },
  { id: "capex", k: "자본", big: usd(capex.sum), bl: `빅테크 4사 설비투자 · ${qlbl(cq)}`,
    title: `AI 인프라에 들어가는 돈, 1년 전보다 <b>${pc(capex.yoy, 0)}</b>`,
    body: `Microsoft·Alphabet·Amazon·Meta 합계. 최근 4개 분기 ${usd(capex.ttm)}(1년 전 ${usd(capex.ttmPrev)}). 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).`,
    easy: `마이크로소프트·구글·아마존·메타가 서버·칩·데이터센터 같은 설비에 석 달 동안 쓴 돈이에요. 1년 전보다 ${pc(capex.yoy, 0)} 많아요.`, viz: [series(common.map(sum4), ["columns", "area", "line"]), versus(capex.ttmPrev, capex.ttm, usd, "1년 전 4개 분기", "최근 4개 분기"), rank(capexLead, (r) => r.name, (r) => r.yoy, (r) => pc(r.yoy, 0))], src: `SEC 공시 · ${qlbl(common[0])}–${qlbl(cq)}` },
];

// the card's drawing, made on the server so it reads without JavaScript: the first format of its first shape
const vizHtml = (x) => { const o = options(x.viz)[0]; return o ? draw(x.viz[o.i], o.format) : ""; };
// ---------- topic tabs: AI is the radar above; every other topic is one arXiv field + its packages (+ HF tasks) ----------
const pyRow = (pkg) => pypi.rows.find((r) => r.pkg === pkg);
const pySpan = wspan(pypi.weeks[pypi.from], pypi.last);
const topicPk = (t) => (t.pypi ?? []).map(pyRow).filter((r) => r && r.level >= TOPIC_MIN_LEVEL);
const topicFast = (t) => topicPk(t).filter((r) => r.excess != null).sort((a, b) => b.excess - a.excess);
function topicCards(t) {
  const f = fields.find((x) => x.id === t.field), out = [];
  const fsrc = f ? `arXiv ${f.scope.replace(/cat:/g, "").replace(/[()]/g, "").replace(/ OR /g, "·")} · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}` : "";
  const ok = (r) => r.then >= 0.002 && r.papers3 >= 10; // same floor as the AI radar
  if (f && f.growth != null) out.push({ id: `${t.id}-papers`, k: "연구", big: pc(f.growth, 0), bl: "논문 수 · 1년 전과 비교",
    title: `${esc(t.name)} 논문이 1년 새 <b>${pc(f.growth, 0)}</b>`, body: `최근 3개월 한 달 평균 ${Math.round(f.monthly).toLocaleString("ko-KR")}편.`,
    easy: `${esc(t.name)} 분야 논문이 1년 전보다 ${pc(f.growth, 0)} 많이 나오고 있어요. 한 달에 ${Math.round(f.monthly).toLocaleString("ko-KR")}편꼴이에요.`, viz: [series(f.am.map((m) => f.X.total[m]), ["columns", "area", "line"]), versus(avg(f.prev3.map((m) => f.X.total[m])), f.monthly, (v) => `${Math.round(v).toLocaleString("ko-KR")}편`, "1년 전 같은 3개월", "최근 3개월")], src: fsrc });
  if (f?.top) out.push({ id: `${t.id}-rising`, k: "연구 · 빨리 늘어난 말", big: `${f.top.ratio.toFixed(1)}배`, bl: "이 말을 쓰는 논문 비율 · 1년 전과 비교",
    title: `가장 빨리 늘어난 말은 <b>${keep(f.top.name)}</b>`, body: `최근 3개월 ${esc(t.name)} 논문의 ${sh(f.top.now)}가 초록에 썼습니다(1년 전 ${sh(f.top.then)}).`,
    easy: `${esc(t.name)} 논문 1,000편 중 ${Math.round(f.top.now * 1000)}편이 이 말을 써요. 1년 전엔 ${Math.round(f.top.then * 1000)}편이었어요.`, viz: [versus(f.top.then, f.top.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(f.top.id, m))), rank(f.rows.filter(ok), short, (r) => r.ratio, (r) => `${r.ratio.toFixed(1)}배`)], src: fsrc });
  if (f?.biggest) out.push({ id: `${t.id}-biggest`, k: "연구 · 가장 많이 쓰는 말", big: sh(f.biggest.now), bl: "논문 중 이 말을 쓴 비율",
    title: `가장 많이 쓰이는 말은 <b>${keep(f.biggest.name)}</b>`, body: f.biggest.then != null ? `1년 전 같은 3개월은 ${sh(f.biggest.then)}였습니다.` : "",
    easy: `${esc(t.name)} 논문에서 가장 흔한 주제어예요. 1,000편 중 ${Math.round(f.biggest.now * 1000)}편이 써요.`, viz: [rank([...f.rows].sort((a, b) => b.now - a.now), short, (r) => r.now, (r) => sh(r.now)), series(f.am.map((m) => f.share(f.biggest.id, m))), ...(f.biggest.then != null ? [versus(f.biggest.then, f.biggest.now, sh, "1년 전", "최근 3개월")] : [])], src: fsrc });
  const down = f ? f.rows.filter((r) => ok(r) && r.ratio < 0.9).sort((a, b) => a.ratio - b.ratio)[0] : null;
  if (down) out.push({ id: `${t.id}-falling`, k: "연구 · 줄어든 말", big: pc(down.ratio - 1, 0), bl: "이 말을 쓰는 논문 비율 · 1년 전과 비교",
    title: `가장 많이 줄어든 말은 <b>${keep(down.name)}</b>`, body: `최근 3개월 ${sh(down.now)}, 1년 전 ${sh(down.then)}.`,
    easy: `1년 전보다 덜 쓰이는 말이에요. 1,000편 중 ${Math.round(down.then * 1000)}편에서 ${Math.round(down.now * 1000)}편으로 줄었어요.`, viz: [versus(down.then, down.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(down.id, m)))], src: fsrc });
  const pk = topicPk(t), fast = topicFast(t);
  if (fast.length) out.push({ id: `${t.id}-pkg-fast`, k: "개발자 · Python", big: pp(fast[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
    title: `가장 빨리 더 내려받는 도구는 <b>${keep(fast[0].name)}</b>`,
    body: `4주 다운로드 ${pc(fast[0].g4)}, 대조군(requests·numpy 등) ${pc(pypi.base)}.${fast.length > 1 ? ` 다음은 ${fast.slice(1, 3).map((r) => `${keep(r.name)}(${pp(r.excess)})`).join(", ")}.` : ""}`,
    easy: `${esc(t.name)} 개발 도구 중 최근 한 달 다운로드가 가장 가파르게 늘었어요(${pc(fast[0].g4)}).`, viz: [...(fast.length > 2 ? [rank(fast, short, (r) => r.excess, (r) => pp(r.excess))] : []), series(pypi.W[fast[0].pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${pySpan}` });
  const big = [...pk].sort((a, b) => b.level - a.level)[0];
  if (big && big.pkg !== fast[0]?.pkg) out.push({ id: `${t.id}-pkg-big`, k: "개발자 · 가장 많이", big: man(big.level), bl: "평일 하루 다운로드",
    title: `가장 많이 내려받는 도구는 <b>${keep(big.name)}</b>`, body: `4주 다운로드 ${pc(big.g4)}.`,
    easy: `${esc(t.name)} 분야에서 가장 많이 쓰이는 개발 도구예요. 평일에 하루 ${man(big.level)}번 내려받아요.`, viz: [...(pk.length > 2 ? [rank([...pk].sort((a, b) => b.level - a.level), short, (r) => r.level, (r) => man(r.level))] : []), series(pypi.W[big.pkg].slice(pypi.from).map((w) => w.level))], src: `PyPI 평일 다운로드 · ${pySpan}` });
  const hfm = (t.hf ?? []).flatMap((task) => snap.tasks?.[task] ?? []);
  if (hfm.length) { const m = [...hfm].sort((a, b) => (b.trending ?? 0) - (a.trending ?? 0)), fresh = m[0].downloads < 100; out.push({ id: `${t.id}-hf`, k: "모델", big: fresh ? `♥ ${m[0].likes.toLocaleString("ko-KR")}` : man(m[0].downloads), bl: fresh ? "좋아요 (공개 직후라 다운로드가 아직 적음)" : "30일 다운로드",
    title: `지금 가장 뜨는 ${esc(t.name)} 모델은 <b>${keep(m[0].id)}</b>`, body: `${keep(m[0].task ?? "")} · ${m[0].created} 공개.${m.length > 1 ? ` 다음은 ${m.slice(1, 3).map((x) => keep(x.id)).join(", ")}.` : ""}`,
    easy: `지금 Hugging Face(오픈 AI 모델 저장소)에서 가장 주목받는 ${esc(t.name)} 모델이에요.`, viz: [...(m.length > 2 ? [rank(m, (x) => x.id.split("/").pop(), (x) => (fresh ? x.likes : x.downloads), (x) => (fresh ? `♥ ${x.likes.toLocaleString("ko-KR")}` : man(x.downloads)))] : [])], src: `Hugging Face 트렌딩 · ${(t.hf ?? []).join("·")} · ${snap.date}` }); }
  return out.slice(0, 7);
}

// ---------- races: who leads each corner of AI (series.mjs RACES), as shares of the race's downloads ----------
const refLbl = (b) => (b === 52 ? "1년 전" : b === 13 ? "3개월 전" : "4주 전");
const races = RACES.map((r) => {
  const x = r.src === "npm" ? npm : pypi, src = r.src === "npm" ? "npm" : "PyPI";
  const W = Object.fromEntries(r.members.map((m) => [m.pkg, x.W[m.pkg]]));
  const maxBack = x.weeks.length - x.from - 4; // shares need 4 comparable weeks at the far end
  const at = (b) => (b <= maxBack ? shares(W, b) : null);
  const S = { 0: at(0), 4: at(4), 13: at(13), 52: at(52) };
  const ref = [52, 13, 4].find((b) => S[b] && r.members.some((m) => S[b][m.pkg] != null)) ?? null;
  const rows = r.members.map((m) => { const q = x.rows.find((y) => y.pkg === m.pkg) ?? {};
    return { ...m, now: S[0][m.pkg], w4: S[4]?.[m.pkg] ?? null, then: ref ? S[ref][m.pkg] ?? null : null, level: q.level, g4: q.g4, excess: q.excess }; })
    .filter((y) => y.now != null).sort((a, b) => b.now - a.now);
  if (rows.length < 2) return null;
  const lead = rows[0], lead4 = S[4] ? [...rows].filter((y) => y.w4 != null).sort((a, b) => b.w4 - a.w4)[0] : null;
  // the member whose share moved most since the reference point (a newcomer counts from 0)
  const mover = ref ? [...rows].sort((a, b) => Math.abs(b.now - (b.then ?? 0)) - Math.abs(a.now - (a.then ?? 0)))[0] : null;
  const fastest = [...rows].filter((y) => y.excess != null && y.level >= TOPIC_MIN_LEVEL).sort((a, b) => b.excess - a.excess)[0] ?? null;
  return { ...r, x, src, rows, lead, lead4, ref, mover, fastest, week: x.last, move: mover ? Math.abs(mover.now - (mover.then ?? 0)) : 0 };
}).filter(Boolean);
const raceCard = (R, over = {}) => {
  const { lead, mover, ref, fastest, rows } = R, n10 = Math.round(lead.now * 10);
  const moved = mover && ref ? (mover.then == null ? `${keep(mover.name)}는 ${refLbl(ref)}엔 없다가 ${sh(mover.now)}` : `${keep(mover.name)} ${sh(mover.then)}&nbsp;→&nbsp;${sh(mover.now)}`) : "";
  return { id: `race-${R.id}`, k: `레이스 · ${esc(R.name)}`, big: sh(lead.now), bl: `${R.name} 중 ${lead.name}의 몫`,
    title: `${esc(R.name)} 1위는 <b>${keep(lead.name)}</b>`,
    easy: `${esc(R.what)}. 이 중에서 10번 내려받으면 약 ${n10}번은 ${esc(lead.name)} 몫이에요.${moved ? ` ${refLbl(ref)}보다 가장 크게 움직인 곳은 ${moved}.` : ""}`,
    body: `${rows.map((y) => `${esc(y.name)} ${sh(y.now)}`).join(" · ")}.${fastest ? ` 최근 4주 가장 빨리 큰 곳은 ${keep(fastest.name)}(인기 패키지보다 ${pp(fastest.excess)}).` : ""} 다운로드는 사용자 수가 아니라 설치 횟수예요.`,
    viz: [shareOf(rows.map((y) => [y.name, y.now]), 0), ...(mover && ref ? [versus(mover.then ?? 0, mover.now, sh, refLbl(ref), "지금")] : []), ...(rows.filter((y) => y.excess != null).length > 2 ? [rank([...rows].filter((y) => y.excess != null).sort((a, b) => b.excess - a.excess), (y) => y.name, (y) => y.excess, (y) => pp(y.excess))] : [])],
    src: `${R.src} 평일 다운로드 4주 평균 · 비중은 이 ${rows.length}개 안에서 · ${wlbl(R.week)}까지`, ...over };
};
// open models, by who made them: Hugging Face downloads of text-generation models (no history before the snapshots)
const openRace = { id: "race-openmodels", k: "레이스 · 오픈 모델 제작사", big: sh(byAuthor[0][1] / genTotal), bl: `오픈 텍스트 생성 모델 다운로드 중 ${byAuthor[0][0]} 몫`,
  title: `오픈 AI 모델 1위 제작사는 <b>${keep(byAuthor[0][0])}</b>`,
  easy: `누구나 받아 쓰는 AI 모델(오픈 모델)을 10번 내려받으면 약 ${Math.round(byAuthor[0][1] / genTotal * 10)}번은 ${esc(byAuthor[0][0])}가 만든 모델이에요.`,
  body: `${byAuthor.slice(0, 5).map(([a, v]) => `${esc(a)} ${sh(v / genTotal)}`).join(" · ")}. Hugging Face 다운로드 상위 ${snap.top.length}개 모델 기준.`,
  viz: [shareOf([...byAuthor.slice(0, 5).map(([a, v]) => [a, v / genTotal]), ["그 밖", byAuthor.slice(5).reduce((t, [, v]) => t + v, 0) / genTotal]]), rank(byAuthor.map(([a, v]) => ({ name: a, v: v / genTotal })), (y) => y.name, (y) => y.v, (y) => sh(y.v))],
  src: `Hugging Face 30일 다운로드 · ${snap.date}` };
// the most-moved races first, the AI labs always near the top
const raceCards = [...races].sort((a, b) => (b.id.startsWith("labs") - a.id.startsWith("labs")) || b.move - a.move).map((R) => raceCard(R));
raceCards.splice(3, 0, openRace);

// ---------- AX: how US businesses take up AI (Ramp AI Index via FRED, monthly) ----------
// values are percent of businesses (55.86 = 55.86%), so they get their own formatters
const AXD = load("ax.json"), axS = (id) => AXD.series[id].months;
const axMonths = Object.keys(axS("RAMPAIALL")).sort(), axL = axMonths.at(-1);
const mBack = (m, n) => { const t = +m.slice(0, 4) * 12 + +m.slice(5) - 1 - n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const axY = mBack(axL, 12), axP = mBack(axL, 1), axLbl = (m) => `${m.slice(0, 4)}년 ${+m.slice(5)}월`;
const pv = (v) => `${v.toFixed(1)}%`, ppv = (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%p`, of100 = (v) => Math.round(v);
const axRow = (x) => { const m = axS(x.id); return { ...x, now: m[axL], prev: m[axP] ?? null, then: m[axY] ?? null }; };
const axG = (g) => AXSERIES.series.filter((x) => x.group === g).map(axRow).sort((a, b) => b.now - a.now);
const axAll = axRow(AXSERIES.series[0]), axVendors = axG("vendor"), axSizes = axG("size"), axInds = axG("industry");
const axSrc = `Ramp AI Index (FRED) · 미국 기업 7만여 곳의 결제 기록 · ${axLbl(axMonths[0])}–${axLbl(axL)}`;
const axCaveat = "Ramp 고객사의 법인카드·송금 기록이라 무료 도구나 개인 결제는 빠져 있어요.";
const pctSeries = (id, n) => series(axMonths.slice(-n).map((m) => axS(id)[m] / 100));
const axVs = (r, f = "1년 전", t = "지금") => ({ kind: "versus", from: r.then / 100, to: r.now / 100, fromText: pv(r.then), toText: pv(r.now), fromLabel: f, toLabel: t });
const axRank = (rows, val = (r) => r.now, lab = (r) => pv(r.now)) => ({ kind: "rank", items: rows.slice(0, 7).map((r) => ({ name: r.name, value: r4(val(r)), label: lab(r) })) });
const indUp = [...axInds].sort((a, b) => (b.now - b.then) - (a.now - a.then)), sizeUp = [...axSizes].sort((a, b) => (b.now - b.then) - (a.now - a.then));
const devLead = races.find((r) => r.id === "labs-js")?.lead;
// the figure each card shows on the site, as data: cardfig.js draws it in the browser at the size it gets, with its axis,
// units and labels; `caption` says what it shows, `alt` reads the same values to a screen reader
const r1v = (v) => Math.round(v * 10) / 10, axSpan = `${axLbl(axY)} → ${axLbl(axL)}`;
const figLine = (id) => ({ type: "line", unit: "%", caption: `월별 도입률 · ${axLbl(axMonths[0])}–${axLbl(axL)}`,
  points: axMonths.map((m) => [axLbl(m), r1v(axS(id)[m])]), ticks: axMonths.map((m, i) => (m.endsWith("-01") ? [i, m.slice(0, 4)] : null)).filter(Boolean),
  mark: axMonths.includes(axY) ? { i: axMonths.indexOf(axY), text: "1년 전" } : null,
  alt: `${axLbl(axMonths[0])} ${pv(axS(id)[axMonths[0]])}, 1년 전 ${pv(axS(id)[axY])}, ${axLbl(axL)} ${pv(axS(id)[axL])}` });
const figBars = (rows, { caption, val = (r) => r.now, lab = (r) => pv(r.now), ref } = {}) => ({ type: "bars", caption, focus: 0, ...(ref ? { ref } : {}),
  items: rows.map((r) => ({ name: r.name, v: r1v(val(r)), label: lab(r) })), alt: rows.map((r) => `${r.name} ${lab(r)}`).join(", ") });
const figDumb = (rows, caption) => ({ type: "dumbbell", unit: "%", caption, from: "1년 전", to: "지금", focus: 0,
  items: rows.map((r) => ({ name: r.name, a: r1v(r.then), b: r1v(r.now), aText: pv(r.then), bText: pv(r.now) })),
  alt: rows.map((r) => `${r.name} 1년 전 ${pv(r.then)}, 지금 ${pv(r.now)}`).join(" · ") });
// the sizes in their own order (대기업 → 중소기업); "the bigger, the more" only when the numbers say so
const bySize = AXSERIES.series.filter((x) => x.group === "size").map((x) => x.name), sizeOrdered = axSizes.every((r, i) => r.name === bySize[i]);
const axCards = [
  { id: "ax-all", k: "AX · 기업 도입률", big: pv(axAll.now), bl: `AI 도구에 돈을 내는 미국 기업 · ${axLbl(axL)}`,
    title: `AI 도구에 돈을 내는 미국&nbsp;기업, 1년 새 <b>${ppv(axAll.now - axAll.then)}</b>`,
    easy: `미국 기업 100곳 중 ${of100(axAll.now)}곳이 AI 도구를 유료로 쓰고 있어요. 1년 전엔 ${of100(axAll.then)}곳이었어요.`,
    body: `지난달보다 ${ppv(axAll.now - axAll.prev)}, 1년 전보다 ${ppv(axAll.now - axAll.then)}. ${axCaveat}`,
    note: `지난달보다 ${ppv(axAll.now - axAll.prev)}. ${axCaveat}`,
    viz: [pctSeries("RAMPAIALL", 36), axVs(axAll)], fig: figLine("RAMPAIALL"), src: axSrc },
  { id: "ax-vendor", k: "AX · 기업이 고르는 AI", big: pv(axVendors[0].now), bl: `${axVendors[0].name}에 돈을 내는 미국 기업`,
    title: `기업이 가장 많이 돈을 내는 AI는 <b>${keep(axVendors[0].name)}</b>`,
    easy: `미국 기업 100곳 중 ${of100(axVendors[0].now)}곳이 ${esc(axVendors[0].name)}, ${of100(axVendors[1].now)}곳이 ${esc(axVendors[1].name)}에 돈을 내요(둘 다 쓰는 회사도 있어요). 1년 전엔 ${esc(axVendors[0].name)} ${of100(axVendors[0].then)}곳이었어요.`,
    body: `${axVendors.map((r) => `${esc(r.name)} ${pv(r.now)}(1년 전 ${pv(r.then)})`).join(" · ")}.${devLead ? ` 개발자들이 내려받는 AI 회사 SDK(자바스크립트)에서도 1위는 ${esc(devLead.name)}예요.` : ""}`,
    ...(devLead ? { note: `개발자들이 내려받는 AI 회사 SDK(자바스크립트)에서도 1위는 ${esc(devLead.name)}예요.` } : {}),
    viz: [axRank(axVendors), axVs(axVendors[0], `1년 전 ${axVendors[0].name}`, `지금 ${axVendors[0].name}`)], fig: figDumb(axVendors, `AI 회사별 도입률 · ${axSpan}`), src: axSrc },
  { id: "ax-industry", k: "AX · 업종별", big: pv(axInds[0].now), bl: `${axInds[0].name} 기업의 AI 도입률`,
    title: `업종별 AI 도입 1위는 <b>${keep(axInds[0].name)}</b>`,
    easy: `${esc(axInds[0].name)} 기업은 100곳 중 ${of100(axInds[0].now)}곳이 AI에 돈을 내요. 가장 낮은 곳(${esc(axInds.at(-1).name)})은 100곳 중 ${of100(axInds.at(-1).now)}곳이에요.`,
    body: `${axInds.map((r) => `${esc(r.name)} ${pv(r.now)}`).join(" · ")}.`,
    viz: [axRank(axInds), series(axMonths.slice(-36).map((m) => axS(axInds[0].id)[m] / 100))],
    fig: figBars(axInds, { caption: `업종별 도입률 · ${axLbl(axL)}`, ref: { v: r1v(axAll.now), label: `전체 ${pv(axAll.now)}` } }), src: axSrc },
  { id: "ax-industry-up", k: "AX · 가장 빨리 바뀌는 업종", big: ppv(indUp[0].now - indUp[0].then), bl: `${indUp[0].name} 기업의 AI 도입률, 1년 새`,
    title: `1년 새 AI 도입이 가장 많이 늘어난 업종은 <b>${keep(indUp[0].name)}</b>`,
    easy: `${esc(indUp[0].name)} 기업 중 AI에 돈을 내는 곳이 1년 전 100곳 중 ${of100(indUp[0].then)}곳에서 지금 ${of100(indUp[0].now)}곳으로 늘었어요.`,
    body: `1년 새 늘어난 폭: ${indUp.map((r) => `${esc(r.name)} ${ppv(r.now - r.then)}`).join(" · ")}.`,
    viz: [axVs(indUp[0]), axRank(indUp, (r) => r.now - r.then, (r) => ppv(r.now - r.then))],
    fig: figBars(indUp, { caption: `1년 새 늘어난 폭 · ${axSpan}`, val: (r) => r.now - r.then, lab: (r) => ppv(r.now - r.then), ref: { v: r1v(axAll.now - axAll.then), label: `전체 ${ppv(axAll.now - axAll.then)}` } }), src: axSrc },
  { id: "ax-size", k: "AX · 회사 규모별", big: pv(axSizes[0].now), bl: `${axSizes[0].name}의 AI 도입률`,
    title: sizeOrdered ? "회사가 <b>클수록</b> AI를 더 많이 써요" : `${keep(axSizes[0].name)} <b>${pv(axSizes[0].now)}</b>, ${keep(axSizes.at(-1).name)} ${pv(axSizes.at(-1).now)}`,
    easy: `${sizeOrdered ? "회사가 클수록 AI를 더 많이 써요. " : ""}1년 새 가장 많이 늘어난 쪽은 ${esc(sizeUp[0].name)}, ${ppv(sizeUp[0].now - sizeUp[0].then)}.`,
    body: `${axSizes.map((r) => `${esc(r.name)} ${pv(r.now)}(1년 전 ${pv(r.then)})`).join(" · ")}. ${axCaveat}`,
    viz: [axRank(axSizes), axVs(sizeUp[0], `1년 전 ${sizeUp[0].name}`, `지금 ${sizeUp[0].name}`)], fig: figDumb(axSizes, `회사 규모별 도입률 · ${axSpan}`), src: axSrc },
];
// ---------- IT domains: the official AX announcements counted per domain (ERP, CRM, cloud …), last 30 days ----------
// An announcement can count in several domains. The comparison with the 30 days before is shown only once collection
// has run for 60 days (news.json → since).
const NEWSD = fs.existsSync(path.join(DIR, "news.json")) ? load("news.json") : { items: [] };
const newsSrc = Object.fromEntries(NEWS.sources.map((x) => [x.id, x]));
const dAgo = (d) => (new Date(updated) - new Date(d)) / 864e5;
const newsAll = NEWSD.items.filter((x) => newsSrc[x.src]).filter((x, i, a) => a.findIndex((y) => y.src === x.src && y.title === x.title) === i)
  .map((x) => { const t = `${x.title} ${x.summary}`; return { ...x, source: newsSrc[x.src].name, kind: newsSrc[x.src].kind, domains: DOMAINS.filter((d) => d.re.test(t)).map((d) => d.id),
    // NEWS.rank: adoptions, deals and rules up; consumer launches and events down — those (below 0) are not counted
    score: NEWS.rank.reduce((n, [w, re]) => n + (re.test(t) ? w : 0), newsSrc[x.src].kind === "government" ? 1 : 0) }; })
  .filter((x) => x.score >= 0);
// feeds list only their latest items, so "the 30 days before" is fully counted only 60 days after collection began
const covered = NEWSD.since != null && dAgo(NEWSD.since) >= 60;
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const domainRows = DOMAINS.map((d) => {
  const inD = newsAll.filter((x) => x.domains.includes(d.id)), now = inD.filter((x) => dAgo(x.date) < 30), before = inD.filter((x) => dAgo(x.date) >= 30 && dAgo(x.date) < 60);
  const by = Object.entries(now.reduce((m, x) => ((m[x.source] = (m[x.source] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  return { ...d, now, prev: covered ? before.length : null, by };
}).filter((r) => r.now.length).sort((a, b) => b.now.length - a.now.length);
const domTotal = newsAll.filter((x) => dAgo(x.date) < 30 && x.domains.length).length;
const domainOverview = domainRows.length > 1 ? [{ id: "dom-all", k: "IT 영역 · 한눈에", big: `${domTotal}건`,
  bl: "최근 30일 회사·정부 공식 AX 발표 · 한 발표가 여러 영역에 들 수 있어요",
  title: `발표가 가장 많은 IT 영역은 <b>${keep(domainRows[0].name)}</b>`,
  body: domainRows.map((r) => `${esc(r.name)} ${r.now.length}건`).join(" · "),
  viz: [rank(domainRows, (r) => r.name, (r) => r.now.length, (r) => `${r.now.length}건`)],
  fig: { type: "bars", caption: "IT 영역별 공식 발표 · 최근 30일", focus: 0, items: domainRows.map((r) => ({ name: r.name, v: r.now.length, label: `${r.now.length}건` })), alt: domainRows.map((r) => `${r.name} ${r.now.length}건`).join(", ") },
  src: "회사·정부 공식 발표(뉴스룸·보도자료) · 최근 30일" }] : [];
const domainCards = [...domainOverview, ...domainRows.map((r) => ({ id: `dom-${r.id}`, k: `IT 영역 · ${r.name}`, big: `${r.now.length}건`,
  bl: `${r.prev != null ? `최근 30일 공식 발표(그 전 30일 ${r.prev}건)` : "최근 30일 공식 발표"} · ${r.about} 이야기`,
  title: r.by[0][1] >= 2 ? `${esc(r.name)}, <b>${keep(r.by[0][0])}</b> 발표가 가장 많아요` : `${esc(r.name)} 공식 발표 <b>${r.now.length}건</b>`,
  body: `최근: ${r.now.slice(0, 3).map((x) => `${esc(x.source)} ${md(x.date)} — ${esc(x.title)}`).join(" · ")}`,
  viz: [rank(r.by.map(([name, n]) => ({ name, n })), (x) => x.name, (x) => x.n, (x) => `${x.n}건`)],
  fig: { type: "bars", caption: "발표한 곳 · 최근 30일", focus: 0, items: r.by.slice(0, 5).map(([name, n]) => ({ name, v: n, label: `${n}건` })), alt: r.by.slice(0, 5).map(([name, n]) => `${name} ${n}건`).join(", ") },
  recent: [...r.now].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((x) => ({ date: md(x.date), source: x.source, title: x.title, link: x.link })),
  src: "회사·정부 공식 발표(뉴스룸·보도자료) · 최근 30일" }))];

// the main view reads like an IT-consulting report: how businesses take up AI, and what the announcements say per IT
// domain. Developer-side readings (SDK downloads, papers, open models, tool shares) stay in "근거 데이터" below.
const topics = [{ id: "ax", name: "기업 도입률", cards: axCards }, ...(domainCards.length ? [{ id: "domains", name: "IT 영역별 발표", cards: domainCards }] : [])];
// the four numbers at the top, like a report's first page
const kpis = [
  { v: pv(axAll.now), l: "AI 도구에 돈을 내는 미국 기업", s: `${axLbl(axL)} · 1년 새 ${ppv(axAll.now - axAll.then)}`, href: "#c-ax-all" },
  { v: pv(axVendors[0].now), l: `기업 결제 1위 AI · ${axVendors[0].name}`, s: `2위 ${axVendors[1].name} ${pv(axVendors[1].now)}`, href: "#c-ax-vendor" },
  { v: pv(axInds[0].now), l: `도입률 1위 업종 · ${axInds[0].name}`, s: `가장 많이 늘어난 업종 · ${indUp[0].name} ${ppv(indUp[0].now - indUp[0].then)}`, href: "#c-ax-industry" },
  ...(domainRows.length ? [{ v: `${domainRows[0].now.length}건`, l: `공식 발표 최다 IT 영역 · ${domainRows[0].name}`, s: "최근 30일 · 회사·정부 발표", href: "#domains" }] : []),
];
const kpiHtml = kpis.map((k) => `<li><a href="${k.href}"><b>${esc(k.v)}</b><span>${esc(k.l)}</span><small>${esc(k.s)}</small></a></li>`).join("");

// ---------- changes: big cases and small ones (social/plan.mjs decides what to post) ----------
// Each detector looks only at finished periods — the last complete week of downloads, the last full month of papers,
// a filed quarter — so a lumpy day can't fire one. `key` names the change (logged and posted at most once), `subject`
// what it is about (social/plan.mjs leaves a subject alone for a while after posting it), `score` which one leads,
// `tier` whether it is a big case (drafted the day it appears) or a small change (collected into a weekly digest).
const topicOfPkg = (pkg) => TOPICS.find((t) => t.pypi?.includes(pkg))?.id ?? "ai";
const events = [];
const SURGE = 1.4, ATH = 1.1, PAPER = 2.5;      // big
const SURGE_SMALL = 1.2, ATH_SMALL_WEEKS = 13;  // small: a smaller jump, or any new high over a shorter record
const tag = (tier, what) => what; // plain label (the tier stays in the data; "빅 케이스" read as a gimmick)
for (const [x, src, list, control] of [[npm, "npm", NPM, NPM_CONTROL], [pypi, "PyPI", PYPI, PYPI_CONTROL]]) {
  const n = x.weeks.length, wk = x.weeks.at(-1), prior = Math.min(12, n - 1 - x.from);
  if (prior < 6 || x.W[list[0].pkg].at(-1).holiday) continue;
  const usual = (pkg) => median(x.W[pkg].slice(n - 1 - prior, n - 1).map((w) => w.level).filter((v) => v != null));
  // the controls' last week against their usual one; a control with no reading that week is left out (null / usual read
  // as 0 and dragged the median down, so an ordinary week looked like a surge), and under 3 readings nothing is compared
  const cr = control.filter((p) => x.W[p.pkg].at(-1).level != null && usual(p.pkg)).map((p) => x.W[p.pkg].at(-1).level / usual(p.pkg));
  const ctrl = cr.length >= 3 ? median(cr) : null;
  // when the AI packages rise together that is one change ("AI 패키지 전반"), and a single package stands out only
  // against both the controls and its AI peers
  const peers = list.filter((p) => isAI(p) && x.W[p.pkg].at(-1).level >= MIN_LEVEL && usual(p.pkg)).map((p) => ({ ...p, r: x.W[p.pkg].at(-1).level / usual(p.pkg) })).sort((a, b) => b.r - a.r);
  const pm = median(peers.map((p) => p.r));
  if (ctrl != null && pm != null && pm / ctrl >= SURGE_SMALL) events.push({ key: `group:${src}:${wk}`, subject: `group:${src}`, kind: "증가", tier: "small", score: 30 + (pm / ctrl - 1) * 30, topic: "ai", card: {
    id: `ev-group-${src}`, k: tag("small", `${src} 다운로드`), big: `${pm.toFixed(1)}배`, bl: `${wname(wk)} AI 패키지 다운로드 · 평소와 비교`,
    title: `${wname(wk)} ${src} AI 패키지가 전반적으로 평소의 ${pm.toFixed(1)}배`, body: `패키지 ${peers.length}개의 중앙값. 같은 주 대조군은 평소의 ${ctrl.toFixed(2)}배였습니다.`,
    easy: `${src} AI 패키지들이 한꺼번에 평소보다 많이 내려받아졌어요. 시장 전체(대조군 ${ctrl.toFixed(2)}배)보다도 높아요.`, viz: [rank(peers, (p) => p.name, (p) => p.r, (p) => `${p.r.toFixed(1)}배`)], src: `${src} 평일 다운로드 · ${wlbl(wk)} 주` } });
  for (const p of list) {
    const r = x.rows.find((q) => q.pkg === p.pkg), L = x.W[p.pkg].at(-1).level, u = usual(p.pkg), name = nm(p);
    if (L == null || !u || L < (p.group === "topic" ? TOPIC_MIN_LEVEL : MIN_LEVEL)) continue;
    const vs = L / u / (!isAI(p) || pm == null ? ctrl : Math.max(ctrl, pm)), topic = topicOfPkg(p.pkg), levels = lastN(x.W[p.pkg].slice(x.from).map((w) => w.level), 26);
    if (ctrl != null && vs >= SURGE_SMALL) { const tier = vs >= SURGE ? "big" : "small"; events.push({ key: `surge:${src}:${p.pkg}:${wk}`, subject: `pkg:${p.pkg}`, kind: tier === "big" ? "급증" : "증가", tier, score: 50 + (vs - 1) * 50, topic, card: {
      id: `ev-surge-${p.pkg}`, k: tag(tier, `${src} 다운로드`), big: `${(L / u).toFixed(1)}배`, bl: `${wname(wk)} 다운로드 · 평소와 비교`,
      title: `${wname(wk)} <b>${keep(name)}</b> 다운로드가 평소의 ${(L / u).toFixed(1)}배`,
      body: `평일 하루 ${man(L)}회, 직전 ${prior}주 평소는 ${man(u)}회. 같은 주 대조군은 평소의 ${ctrl.toFixed(2)}배${isAI(p) && pm != null ? `, AI 패키지 전반은 ${pm.toFixed(2)}배` : ""}였습니다.`,
      easy: `평소 한 주보다 ${(L / u).toFixed(1)}배 많이 내려받았어요. 다른 패키지들이 함께 오른 몫을 빼도 두드러져요.`, viz: [series(levels, ["columns", "area", "line"]), versus(u, L, man, `직전 ${prior}주 평소`, wname(wk))], src: `${src} 평일 다운로드 · ${wspan(x.weeks[n - levels.length], wk)}` } }); }
    const hist = x.W[p.pkg].slice(x.from, n - 1).filter((w) => w.level != null);
    if (hist.length >= ATH_SMALL_WEEKS) { const ti = hist.reduce((a, b, i) => (b.level > hist[a].level ? i : a), 0), top = hist[ti], tier = hist.length >= 26 && L > top.level * ATH ? "big" : "small";
      // a steady grower sets a high every week; a small one counts only when the old high is 8+ weeks old
      if (L > top.level && (tier === "big" || ti <= hist.length - 8)) events.push({ key: `ath:${src}:${p.pkg}:${wk}`, subject: `pkg:${p.pkg}`, kind: "최고치", tier, score: 40 + (L / top.level - 1) * 100, topic, card: {
        id: `ev-ath-${p.pkg}`, k: tag(tier, `${src} 최고치`), big: man(L), bl: `평일 하루 다운로드, ${wname(wk)}`,
        title: `<b>${keep(name)}</b> 주간 다운로드가 역대 최고`,
        body: `이전 최고(${wyr(top.week, wk)})보다 ${pc(L / top.level - 1, 0)} 많습니다.${r?.g4 != null ? ` 4주 성장 ${pc(r.g4)}, 대조군 ${pc(x.base)}.` : ""}`,
        easy: `기록이 시작된 뒤 가장 많이 내려받은 주예요. 이전 최고보다 ${pc(L / top.level - 1, 0)} 많아요.`, viz: [series(lastN(x.W[p.pkg].slice(x.from).map((w) => w.level), 104), ["line", "area", "columns"]), versus(top.level, L, man, "이전 최고", wname(wk))], src: `${src} 평일 다운로드 · ${wspan(x.weeks[Math.max(x.from, n - 104)], wk)}` } });
    }
  }
}
for (const R of races) { // a race whose leader changed in four weeks (the app-model race included)
  if (!R.lead4 || R.lead4.pkg === R.lead.pkg) continue;
  events.push({ key: `flip:race:${R.id}:${R.lead.pkg}:${R.week}`, subject: `race:${R.id}`, kind: "1위 교체", tier: "big", score: 100, topic: "race",
    card: raceCard(R, { k: `빅 케이스 · ${esc(R.name)} 1위 교체`, title: `${esc(R.name)} 1위, 이제 <b>${keep(R.lead.name)}</b>`,
      easy: `${esc(R.what)}. 4주 전 1위는 ${esc(R.lead4.name)}(${sh(R.lead4.w4)})였는데, 지금은 ${esc(R.lead.name)}가 ${sh(R.lead.now)}로 앞섰어요.`,
      viz: [rank(R.rows, (y) => y.name, (y) => y.now, (y) => sh(y.now)), versus(R.lead.w4 ?? 0, R.lead.now, sh, `4주 전 ${R.lead.name}`, `지금 ${R.lead.name}`), shareOf(R.rows.map((y) => [y.name, y.now]), 0)] }) });
}
for (const f of fields) { // a phrase whose share of a field's papers has just crossed 2.5× its level a year earlier
  if (f.am.length < 16) continue;
  const win = (back) => { const l3 = f.am.slice(f.am.length - 3 - back, f.am.length - back), p3 = l3.map((m) => mAdd(m, -12)); return (id) => { const now = avg(l3.map((m) => f.share(id, m))), then = avg(p3.map((m) => f.share(id, m))); return { now, then, ratio: then ? now / then : null }; }; };
  const cur = win(0), prev = win(1), topic = TOPICS.find((t) => t.field === f.id)?.id ?? "ai", tname = TOPICS.find((t) => t.id === topic).name;
  for (const r of f.rows) {
    const c = cur(r.id), pv = prev(r.id);
    if (!(c.then >= 0.002 && r.papers3 >= 10 && c.ratio >= PAPER && (pv.ratio ?? 0) < PAPER)) continue;
    events.push({ key: `paper:${f.id}:${r.id}:${f.am.at(-1)}`, subject: `paper:${f.id}:${r.id}`, kind: "연구", tier: "big", score: 60 + c.ratio * 5, topic, card: {
      id: `ev-paper-${f.id}-${r.id}`, k: `빅 케이스 · ${tname} 연구`, big: `${c.ratio.toFixed(1)}배`, bl: "이 말을 쓰는 논문 비율 · 1년 전과 비교",
      title: `${esc(tname)} 논문 속 <b>${keep(r.name)}</b>, 1년 새 ${c.ratio.toFixed(1)}배`,
      body: `최근 3개월 논문의 ${sh(c.now)}가 초록에 썼습니다(1년 전 ${sh(c.then)}). 한 달 전 같은 계산으로는 ${(pv.ratio ?? 0).toFixed(1)}배였습니다.`,
      easy: `이 말을 쓰는 ${esc(tname)} 논문 비율이 1년 새 ${c.ratio.toFixed(1)}배가 됐어요.`, viz: [versus(c.then, c.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(r.id, m)))], src: `arXiv · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}` } });
  }
}
{ // a new #1 on Hugging Face trending that wasn't #1 on any day of the last two weeks
  const before = HFD.snapshots.filter((s) => s.date < snap.date && (new Date(snap.date) - new Date(s.date)) / 864e5 <= 14), m = snap.trending[0];
  if (before.length && m && !before.some((s) => s.trending[0]?.id === m.id) && (m.downloads >= 50000 || m.likes >= 1000)) {
    const topic = TOPICS.find((t) => t.hf?.includes(m.task))?.id ?? "ai";
    events.push({ key: `hf:${m.id}`, subject: `hf:${m.id}`, kind: "새 1위", tier: "big", score: 45, topic, card: {
      id: "ev-hf-trending", k: "빅 케이스 · 오픈 모델", big: m.downloads >= 50000 ? man(m.downloads) : `♥ ${m.likes.toLocaleString("ko-KR")}`, bl: m.downloads >= 50000 ? "30일 다운로드" : "좋아요",
      title: `Hugging Face 트렌딩 1위가 바뀌었습니다: <b>${keep(m.id)}</b>`,
      body: `${keep(m.task ?? "")}${m.task ? " · " : ""}${m.created} 공개. 직전 1위는 ${keep(before.at(-1).trending[0]?.id ?? "—")}.`,
      easy: "지금 가장 주목받는 오픈 AI 모델이 바뀌었어요.", viz: [rank(snap.trending, (x) => x.id.split("/").pop(), (x) => x.trending ?? 0, (x) => man(x.downloads))], src: `Hugging Face 트렌딩 · ${snap.date}` } });
  }
}
{ // all four have filed a new quarter (within 75 days of its end, so an old quarter never fires on a first run)
  const end = new Date(`${cq.slice(0, 4)}-${String(+cq.slice(5) * 3).padStart(2, "0")}-28`);
  if ((new Date(SECD.fetched_at) - end) / 864e5 <= 75) events.push({ key: `capex:${cq}`, subject: "capex", kind: "공시", tier: "big", score: 90, topic: "ai", card: {
    id: "ev-capex", k: "빅 케이스 · 자본", big: usd(capex.sum), bl: `빅테크 4사 설비투자 · ${qlbl(cq)}`,
    title: `빅테크 4사 ${qlbl(cq)} 설비투자, 1년 전보다 <b>${pc(capex.yoy, 0)}</b>`,
    body: `Microsoft·Alphabet·Amazon·Meta 공시 합계. 가장 빨리 늘린 곳은 ${capexLead[0].name}(${pc(capexLead[0].yoy, 0)}).`,
    easy: `빅테크 4곳이 새 분기에 서버·데이터센터 같은 설비에 쓴 돈을 모두 공시했어요. 1년 전보다 ${pc(capex.yoy, 0)} 많아요.`, viz: [series(common.map(sum4), ["columns", "area", "line"]), rank(capexLead, (r) => r.name, (r) => r.yoy, (r) => pc(r.yoy, 0))], src: `SEC 공시 · ${qlbl(common[0])}–${qlbl(cq)}` } });
}

// small changes: today's readings against the last day's (trends/data/state.json keeps one snapshot a day). Nothing
// fires on the first build, and a source that hasn't moved on since (same week, same month) can't fire either.
const STATE = path.join(DIR, "state.json");
const states = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")).days : [];
const top5 = (rows, name) => rows.slice(0, 5).map((r) => ({ pkg: r.pkg, name: name(r), excess: r4(r.excess) }));
const state = {
  date: updated,
  npm: { week: npm.last, top: top5(nRank, nm) }, pypi: { week: pypi.last, top: top5(pRank, (r) => r.name) },
  provider: { week: npm.last, shares: Object.fromEntries(provPk.map((p) => [p.pkg, r4(provNow[p.pkg])])) },
  topics: Object.fromEntries(TOPICS.filter((t) => t.pypi).map((t) => [t.id, { week: pypi.last, top: top5(topicFast(t), (r) => r.name) }])),
  hf: { date: snap.date, top: snap.top.slice(0, 20).map((m) => m.id), trending: snap.trending.slice(0, 5).map((m) => m.id) },
  arxiv: Object.fromEntries(fields.map((f) => [f.id, { last: f.am.at(-1), rising: f.top?.id ?? null }])),
  sec: Object.fromEntries(SEC.companies.map((c) => [c.id, Object.keys(Qs[c.id]).sort().at(-1)])),
  ax: { last: axL, vendorLead: axVendors[0].id },
};
const prev = states.filter((d) => d.date < updated).at(-1);
const small = (o) => events.push({ tier: "small", ...o });
if (prev?.ax && prev.ax.last !== axL) { // a new month of the Ramp AI Index: the monthly AX report (a snapshot from before
  // ax was tracked has no ax.last to compare with, so the first day with ax fires nothing — like every other first reading)
  events.push({ key: `ax:month:${axL}`, subject: `ax:month:${axL}`, kind: "AX 월간", tier: "big", score: 110, topic: "ax", // the lead story: ahead of any other big case that day
    // same id as the tab's card, so the post doesn't show it twice (pick.mjs drops the topic card with the case's id)
    card: { ...axCards[0], k: `빅 케이스 · AX 월간 · ${axLbl(axL)}` } });
  const pl = prev.ax?.vendorLead && AXSERIES.series.find((x) => x.id === prev.ax.vendorLead);
  if (pl && pl.id !== axVendors[0].id) events.push({ key: `ax:flip:${axVendors[0].id}:${axL}`, subject: "ax:vendor", kind: "1위 교체", tier: "big", score: 100, topic: "ax",
    card: { ...axCards[1], k: "빅 케이스 · 기업이 고르는 AI 1위 교체", title: `기업이 가장 많이 돈을 내는 AI, 이제 <b>${keep(axVendors[0].name)}</b>`,
      easy: `지난달 1위는 ${esc(pl.name)}였는데, ${axLbl(axL)}엔 ${esc(axVendors[0].name)}가 ${pv(axVendors[0].now)}로 앞섰어요.` } });
}
if (prev) {
  for (const [x, src, id] of [[npm, "npm", "npm"], [pypi, "PyPI", "pypi"]]) { // the ranking by growth over the controls
    const c = state[id], p = prev[id], rk = id === "npm" ? nRank : pRank;
    if (c.week === p.week || !c.top.length || !p.top.length) continue;
    const viz = [rank(rk, (r) => short(r), (r) => r.excess, (r) => pp(r.excess))], src2 = `${src} 평일 다운로드 · ${wlbl(c.week)}까지 4주`;
    if (c.top[0].pkg !== p.top[0].pkg) small({ key: `rank1:${id}:${c.top[0].pkg}:${c.week}`, subject: `pkg:${c.top[0].pkg}`, kind: "순위", score: 35, topic: "ai", card: {
      id: `ch-rank1-${id}`, k: tag("small", `${src} 순위`), big: pp(c.top[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
      title: `${src}에서 가장 빨리 크는 AI 패키지가 바뀌었습니다: <b>${keep(c.top[0].name)}</b>`, body: `지난번 1위는 ${esc(p.top[0].name)}.`, easy: `${src}에서 다른 패키지들보다 가장 빨리 크는 AI 도구가 바뀌었어요.`, viz, src: src2 } });
    else { const inn = c.top.slice(0, 3).filter((r) => !p.top.slice(0, 3).some((q) => q.pkg === r.pkg));
      if (inn.length) small({ key: `top3:${id}:${inn.map((r) => r.pkg).join("+")}:${c.week}`, subject: `pkg:${inn[0].pkg}`, kind: "순위", score: 25, topic: "ai", card: {
        id: `ch-top3-${id}`, k: tag("small", `${src} 순위`), big: pp(inn[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
        title: `<b>${keep(inn[0].name)}</b>, ${src} 성장 상위 3에 새로`, body: `상위 3: ${c.top.slice(0, 3).map((r) => `${esc(r.name)}(${pp(r.excess)})`).join(", ")}.`, easy: "빨리 크는 AI 도구 상위 3위 안에 새로 들어왔어요.", viz, src: src2 } }); }
  }
  if (state.provider.week !== prev.provider.week) { // the provider whose share moved most in a week
    const mv = provPk.map((p) => ({ ...p, now: state.provider.shares[p.pkg], then: prev.provider.shares[p.pkg] })).filter((p) => p.now != null && p.then != null).sort((a, b) => Math.abs(b.now - b.then) - Math.abs(a.now - a.then))[0];
    if (mv && Math.abs(mv.now - mv.then) >= 0.01) small({ key: `share:${mv.pkg}:${state.provider.week}`, subject: `share:${mv.pkg}`, kind: "비중", score: 20 + Math.abs(mv.now - mv.then) * 1000, topic: "ai", card: {
      id: "ch-share", k: tag("small", "앱에 붙이는 모델"), big: pp(mv.now - mv.then), bl: `Vercel AI SDK 공급자 중 ${mv.name} 비중, 한 주 사이`,
      title: `<b>${keep(mv.name)}</b> 비중 ${sh(mv.then)}&nbsp;→&nbsp;${sh(mv.now)}`, body: `1위는 ${esc(provLead.name)}(${sh(provLead.now)}).`,
      easy: `AI 앱에 연결되는 모델 중 ${esc(mv.name)} 몫이 한 주 사이 ${pp(mv.now - mv.then)} 움직였어요.`, viz: [versus(mv.then, mv.now, sh, "지난번", "지금"), shareOf(provPk.map((p) => [p.name, provNow[p.pkg]]), provPk.indexOf(provPk.find((p) => p.pkg === mv.pkg)))], src: `@ai-sdk 공급자 패키지 다운로드 비중 · ${wlbl(npm.last)}` } });
  }
  for (const t of TOPICS.filter((t) => t.pypi)) { // the fastest-growing tool inside each topic
    const c = state.topics[t.id], p = prev.topics?.[t.id];
    if (!p || c.week === p.week || !c.top.length || !p.top.length || c.top[0].pkg === p.top[0].pkg) continue;
    small({ key: `topic1:${t.id}:${c.top[0].pkg}:${c.week}`, subject: `pkg:${c.top[0].pkg}`, kind: "순위", score: 25, topic: t.id, card: {
      id: `ch-topic1-${t.id}`, k: tag("small", `${t.name} 도구`), big: pp(c.top[0].excess), bl: "인기 패키지보다 더 늘어난 폭 · 4주",
      title: `${esc(t.name)} 도구 중 가장 빨리 크는 것이 바뀌었습니다: <b>${keep(c.top[0].name)}</b>`, body: `지난번 1위는 ${esc(p.top[0].name)}.`,
      easy: `${esc(t.name)} 개발 도구 중 가장 빨리 크는 것이 바뀌었어요.`, viz: [rank(topicFast(t), short, (r) => r.excess, (r) => pp(r.excess))], src: `PyPI 평일 다운로드 · ${pySpan}` } });
  }
  if (state.hf.date !== prev.hf.date) { // models entering the download top 20, and the trending top 5
    const inTop = snap.top.slice(0, 20).filter((m) => !prev.hf.top.includes(m.id));
    if (inTop.length) small({ key: `hftop:${inTop.map((m) => m.id).join("+")}:${snap.date}`, subject: `hf:${inTop[0].id}`, kind: "새로 진입", score: 15 + inTop.length * 3, topic: "ai", card: {
      id: "ch-hftop", k: tag("small", "오픈 모델"), big: `${inTop.length}개`, bl: "다운로드 상위 20에 새로 든 모델",
      title: `다운로드 상위 20에 새로: <b>${keep(inTop[0].id)}</b>${inTop.length > 1 ? ` 외 ${inTop.length - 1}개` : ""}`, body: `${inTop.slice(0, 3).map((m) => `${keep(m.id)}(${man(m.downloads)})`).join(", ")}.`,
      easy: "많이 내려받는 오픈 AI 모델 상위 20위 안에 새 얼굴이 들어왔어요.", viz: inTop.length > 1 ? [rank(inTop, (m) => m.id.split("/").pop(), (m) => m.downloads, (m) => man(m.downloads))] : [], src: `Hugging Face 다운로드 상위 · ${snap.date}` } });
    const inTr = snap.trending.slice(1, 5).filter((m) => !prev.hf.trending.includes(m.id));
    if (inTr.length) small({ key: `hftr:${inTr.map((m) => m.id).join("+")}:${snap.date}`, subject: `hf:${inTr[0].id}`, kind: "새로 진입", score: 10 + inTr.length * 2, topic: TOPICS.find((t) => t.hf?.includes(inTr[0].task))?.id ?? "ai", card: {
      id: "ch-hftr", k: tag("small", "오픈 모델"), big: `${snap.trending.findIndex((m) => m.id === inTr[0].id) + 1}위`, bl: "Hugging Face 트렌딩",
      title: `트렌딩 상위 5에 새로: <b>${keep(inTr[0].id)}</b>`, body: `${keep(inTr[0].task ?? "")}${inTr[0].task ? " · " : ""}${inTr[0].created} 공개.${inTr.length > 1 ? ` 함께 들어온 모델: ${inTr.slice(1).map((m) => keep(m.id)).join(", ")}.` : ""}`,
      easy: "요즘 빠르게 주목받는 오픈 AI 모델 상위 5위 안에 새로 들어왔어요.", viz: [rank(snap.trending, (m) => m.id.split("/").pop(), (m) => m.trending ?? 0, (m) => man(m.downloads))], src: `Hugging Face 트렌딩 · ${snap.date}` } });
  }
  const newMonth = fields.filter((f) => prev.arxiv?.[f.id] && f.am.at(-1) > prev.arxiv[f.id].last); // a month of papers finished counting
  if (newMonth.length) { const m = newMonth[0].am.at(-1), yoy = (f) => (f.X.total[mAdd(m, -12)] ? f.X.total[m] / f.X.total[mAdd(m, -12)] - 1 : null), byN = [...newMonth].sort((a, b) => b.X.total[m] - a.X.total[m]);
    small({ key: `month:${m}`, subject: `month:${m}`, kind: "집계", score: 20, topic: "ai", card: {
      id: "ch-month", k: tag("small", "연구"), big: `${byN[0].X.total[m].toLocaleString("ko-KR")}편`, bl: `${mlbl(m)} ${byN[0].name} 논문`,
      title: `${mlbl(m)} 논문 집계가 끝났습니다`, body: `${byN.map((f) => `${esc(f.name)} ${f.X.total[m].toLocaleString("ko-KR")}편${yoy(f) != null ? `(1년 전 대비 ${pc(yoy(f), 0)})` : ""}`).join(", ")}.`,
      easy: "지난달 나온 논문 수 집계가 끝났어요. 분야마다 1년 전 같은 달과 비교했어요.", viz: [rank(byN, (f) => f.name, (f) => f.X.total[m], (f) => `${f.X.total[m].toLocaleString("ko-KR")}편`)], src: `arXiv · ${mlbl(m)}` } }); }
  for (const f of fields) { // the fastest-rising phrase of a field changed
    const p = prev.arxiv?.[f.id];
    if (!p || !f.top || p.rising === f.top.id || p.last === f.am.at(-1)) continue;
    const topic = TOPICS.find((t) => t.field === f.id)?.id ?? "ai", tname = TOPICS.find((t) => t.id === topic).name;
    small({ key: `rising:${f.id}:${f.top.id}:${f.am.at(-1)}`, subject: `paper:${f.id}:${f.top.id}`, kind: "연구", score: 25, topic, card: {
      id: `ch-rising-${f.id}`, k: tag("small", `${tname} 연구`), big: `${f.top.ratio.toFixed(1)}배`, bl: "이 말을 쓰는 논문 비율 · 1년 전과 비교",
      title: `${esc(tname)} 논문에서 가장 빨리 늘어난 말이 바뀌었습니다: <b>${keep(f.top.name)}</b>`, body: `최근 3개월 ${sh(f.top.now)}(1년 전 ${sh(f.top.then)}).`,
      easy: `${esc(tname)} 논문에서 가장 빠르게 많이 쓰이기 시작한 말이 바뀌었어요.`, viz: [versus(f.top.then, f.top.now, sh, "1년 전", "최근 3개월"), series(f.am.map((m) => f.share(f.top.id, m)))], src: `arXiv · ${mlbl(f.am[0])}–${mlbl(f.am.at(-1))}` } });
  }
  for (const c of SEC.companies) { // one company filed a new quarter (the big case waits for all four)
    const q = state.sec[c.id], pq = prev.sec?.[c.id];
    if (!pq || q <= pq) continue;
    const v = Qs[c.id][q], vy = Qs[c.id][`${+q.slice(0, 4) - 1}${q.slice(4)}`], qs = Object.keys(Qs[c.id]).filter((x) => x >= "2019Q1").sort();
    small({ key: `filing:${c.id}:${q}`, subject: `filing:${c.id}`, kind: "공시", score: 30, topic: "ai", card: {
      id: `ch-filing-${c.id}`, k: tag("small", "자본"), big: usd(v), bl: `${c.name} 설비투자 · ${qlbl(q)}`,
      title: `${esc(c.name)}, ${qlbl(q)} 설비투자 공시${vy ? ` — 1년 전보다 <b>${pc(v / vy - 1, 0)}</b>` : ""}`, body: vy ? `1년 전 같은 분기 ${usd(vy)}.` : "",
      easy: `${esc(c.name)} 공시가 나왔어요 — 서버·칩·데이터센터 같은 설비에 석 달 동안 쓴 돈이에요.`, viz: [series(qs.map((x) => Qs[c.id][x]), ["columns", "area", "line"]), ...(vy ? [versus(vy, v, usd, qlbl(`${+q.slice(0, 4) - 1}${q.slice(4)}`), qlbl(q))] : [])], src: `SEC 공시 · ${c.name}` } });
  }
}
events.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "big" ? -1 : 1) || b.score - a.score);
// one change per subject a day: Mastra's new high and its jump are one story, told by the bigger of the two
for (let i = events.length - 1; i >= 0; i--) if (events.findIndex((e) => e.subject === events[i].subject) < i) events.splice(i, 1);

// plain text for the cards and the caption; non-breaking spaces stay as U+00A0 so the cards keep the same line breaks
const text = (s) => String(s).replace(/<wbr>/g, "\u200b").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "\u00a0").replace(/&#8209;/g, "\u2011").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"); // &amp; last, or "&amp;lt;" would come out as "<"
const plainCard = (x) => ({ id: x.id, k: x.k, big: x.big, bl: x.bl, title: text(x.title), easy: text(x.easy ?? ""), body: text(x.body), src: x.src, viz: x.viz });

// every change ever found, kept 60 days (trends/data/changes.json): the page lists the last week's, and
// social/plan.mjs drafts from it — a big case the day it appears, small ones collected into a weekly digest
const CHANGES = path.join(DIR, "changes.json"), KEEP_DAYS = 60, ago = (d) => (new Date(updated) - new Date(d)) / 864e5;
const changeLog = (fs.existsSync(CHANGES) ? JSON.parse(fs.readFileSync(CHANGES, "utf8")).log : []).filter((c) => ago(c.date) <= KEEP_DAYS);
// a change found again keeps the day it was first found but takes today's wording
for (const e of events) {
  const entry = { key: e.key, subject: e.subject, kind: e.kind, tier: e.tier, score: Math.round(e.score * 10) / 10, topic: e.topic, headline: text(e.card.title), card: plainCard(e.card) };
  const i = changeLog.findIndex((c) => c.key === e.key);
  if (i < 0) changeLog.push({ date: updated, ...entry }); else changeLog[i] = { date: changeLog[i].date, ...entry };
}
const recentChanges = changeLog.filter((c) => ago(c.date) <= 7).sort((a, b) => b.date.localeCompare(a.date) || (a.tier === b.tier ? 0 : a.tier === "big" ? -1 : 1) || b.score - a.score);
const tone = (x) => (/^[−-]/.test(text(x.big)) ? " down" : "");
// a card reads top to bottom: what it is about, the finding, the number, the figure (what it shows in its caption),
// the plain-words line, a note, the latest announcements (IT domains), the source. The figure's data rides along for
// cardfig.js, which draws it at the size it gets; the server-drawn picture stays for readers without JavaScript.
const attr = esc;
const recentHtml = (list) => `<p class="rl">최근 발표</p><ol class="recent">${list.map((r) => `<li><a href="${attr(r.link)}" target="_blank" rel="noopener"><span class="rd">${r.date} · ${esc(r.source)}</span><span class="rt">${esc(r.title)}</span></a></li>`).join("")}</ol>`;
const cardHtml = (list) => list.map((x, i) => { const used = new Set();
  return `<article class="ins${i === 0 ? " lead" : ""}${tone(x)}" id="c-${x.id}"><p class="k">${x.k}</p><h3>${glue(x.title)}</h3>`
    + `<div class="num"><span class="big">${x.big}</span><span class="bl">${termify(esc(x.bl), used)}</span></div>`
    + `<figure class="fig"${x.fig ? ` data-fig="${attr(JSON.stringify(x.fig))}"` : ""}>${x.fig?.caption ? `<figcaption>${esc(x.fig.caption)}</figcaption>` : ""}<div class="plot">${vizHtml(x)}</div></figure>`
    + (x.easy ? `<p class="easy"><span class="el">쉽게 말하면</span>${termify(x.easy, used)}</p>` : "")
    + (x.note ? `<p class="fine">${termify(x.note, used)}</p>` : "")
    + (x.recent?.length ? recentHtml(x.recent) : "")
    + `<p class="src">${esc(x.src)}</p></article>`; }).join("");
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

const meta = `${updated} 갱신 · 매일 자동 · npm ${wlbl(npm.last)}까지 · PyPI ${wlbl(pypi.last)}까지 · arXiv ${mlbl(am.at(-1))}까지 · Hugging Face ${snap.date} · SEC ${qlbl(cq)}까지 · 검산 ${CHECKS.checks.length}개 통과`;
const checkLi = CHECKS.checks.map((c) => `<li>${esc(c.fact)}</li>`).join("");
const axTable = axRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${sh(r.now)}</td><td>${sh(r.then)}</td><td class="${r.ratio > 1 ? "pos" : r.ratio < 1 ? "neg" : ""}">${r.ratio ? r.ratio.toFixed(2) + "배" : "—"}</td><td>${(r.papers ?? 0).toLocaleString("ko-KR")}</td></tr>`).join("");
const capexRows = [...common].reverse().slice(0, 8).map((q) => `<tr><td>${qlbl(q)}</td>${big4.map((id) => `<td>${usd(Qs[id][q])}</td>`).join("")}<td><b>${usd(sum4(q))}</b></td><td>${Qs.orcl[q] != null ? usd(Qs.orcl[q]) : "—"}</td></tr>`).join("");
const sdkLine = sdkPy.map((p) => `${esc(p.name)} ${sh(sdkNow[p.pkg])}${pyBack ? ` (${pyBack}주 전 ${sh(sdkThen[p.pkg])})` : ""}`).join(" · ");

// ---------- AX news: what companies and governments announced (trends/data/news.json, official sources only) ----------
// The last NEWS_DAYS days, the same announcement once (a feed can list it twice), ranked by NEWS.rank: adoptions,
// deals and rules first. The site lists them with their links; social/story.mjs writes the weekly post from them.
const NEWS_DAYS = 14;
const newsItems = newsAll.filter((x) => ago(x.date) <= NEWS_DAYS && x.score > 0) // the list and the posts: the ones that rank
  .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
const KIND = { company: "기업 발표", government: "정부 발표", research: "리서치" };
const newsHtml = newsItems.length ? [...newsItems].slice(0, 10).sort((a, b) => b.date.localeCompare(a.date)).map((x) => `<li class="news"><a href="${esc(x.link)}" target="_blank" rel="noopener"><time datetime="${x.date}">${+x.date.slice(5, 7)}/${+x.date.slice(8)}</time><span class="badge">${esc(x.source)}</span><span class="et">${esc(x.title)}<small>${KIND[x.kind]} · 원문 보기</small></span><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a></li>`).join("")
  : `<li class="news empty">최근 ${NEWS_DAYS}일 동안 모은 공식 발표가 없어요.</li>`;

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
    "t-tabs": tabsHtml, "t-panels": panelsHtml, "t-glossary": glossaryHtml(), "t-news": newsHtml,
    "t-kpi": kpiHtml,
    "t-events": recentChanges.filter((c) => c.topic === "ax" || c.topic === "domains").slice(0, 6).map((c) => `<li class="${c.tier}"><a href="#${c.topic}"><time datetime="${c.date}">${+c.date.slice(5, 7)}/${+c.date.slice(8)}</time><span class="badge">${c.tier === "big" ? "주요 변화" : "변화"}</span><span class="et">${esc(c.headline)}</span><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a></li>`).join(""),
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
// today's snapshot (one a day, 60 kept) and the change log
const writeIf = (file, body) => { const prevBody = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; if (body !== prevBody) { fs.writeFileSync(file, body); console.log(`wrote trends/data/${path.basename(file)}`); } };
writeIf(STATE, JSON.stringify({ note: "one snapshot of the readings per day; build.mjs compares today's with the last one to find small changes", days: [...states.filter((d) => d.date !== updated), state].slice(-60) }) + "\n");
writeIf(CHANGES, JSON.stringify({ note: "every change build.mjs found, 60 days; social/plan.mjs drafts from it", log: changeLog }, null, 1) + "\n");
// facts for the storyline writer (social/story.mjs): plain sentences, each with its numbers already written out,
// so a story can only say what is here. Grouped: ax (Ramp AI Index), race (who leads each corner), radar (the rest).
const factList = [
  ...AXSERIES.series.map((x) => { const r = axRow(x), first = axS(x.id)[axMonths[0]];
    const who = x.group === "vendor" ? `미국 기업 중 ${x.name}에 돈을 내는 비율` : x.group === "all" ? "AI 도구에 돈을 내는 미국 기업 비율(전체)" : `${x.name} 기업 중 AI 도구에 돈을 내는 비율`;
    return { group: "ax", id: `ax-${x.id}`, text: `${who}: ${axLbl(axL)} ${pv(r.now)} · 지난달 ${pv(r.prev)} · 1년 전(${axLbl(axY)}) ${pv(r.then)} · 1년 새 ${ppv(r.now - r.then)} · 처음 잰 ${axLbl(axMonths[0])} ${pv(first)}` }; }),
  { group: "ax", id: "ax-note", text: `Ramp AI Index: 미국 기업 7만여 곳의 법인카드·송금 기록으로 AI 도구에 돈을 낸 회사 비율을 매달 잼. 무료 도구·개인 결제는 안 잡힘. 미국 기준.` },
  ...domainRows.map((r) => ({ group: "domain", id: `dom-${r.id}`, text: `IT 영역 ${r.name}(${r.about}): 최근 30일 회사·정부 공식 AX 발표 ${r.now.length}건${r.prev != null ? `, 그 전 30일 ${r.prev}건` : ""} · 발표가 많은 곳: ${r.by.slice(0, 3).map(([n, k]) => `${n} ${k}건`).join(", ")}` })),
];
const out = { built_at: updated, page: "https://data.pivoxquant.com/", insights: insights.map(plainCard), topics: topics.map((t) => ({ id: t.id, name: t.name, insights: t.cards.map(plainCard) })),
  events: events.map((e) => ({ key: e.key, subject: e.subject, kind: e.kind, tier: e.tier, score: Math.round(e.score * 10) / 10, topic: e.topic, headline: text(e.card.title), card: plainCard(e.card) })),
  facts: factList,
  // the official announcements the weekly AX news post may use — as published, with the source and its link
  news: newsItems.slice(0, 30).map(({ id, src, source, kind, date, title, summary, link, score, domains }) => ({ id, src, source, kind, date, title, summary, link, score, domains: domains.map((d) => DOMAINS.find((x) => x.id === d).name) })) };
const ifile = path.join(DIR, "insights.json"), iprev = fs.existsSync(ifile) ? fs.readFileSync(ifile, "utf8") : "";
const inext = JSON.stringify(out, null, 1) + "\n";
if (inext !== iprev) { fs.writeFileSync(ifile, inext); console.log("wrote trends/data/insights.json"); }
