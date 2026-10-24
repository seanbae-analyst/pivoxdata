// verify.mjs — the radar's numbers are believed only after these checks. Results go to trends/data/checks.json so
// the page can quote exactly what was checked. Exit 1 on any failure: the weekly job then opens an issue instead of
// publishing. A check here is either a second reading of a number or a condition the page's sentences rely on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, SEC } from "./series.mjs";
import { weekly, lastSunday, breaks, trimEnd } from "./signals.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const checks = [];
const check = (id, ok, fact) => { checks.push({ id, ok, fact }); console.log(`${ok ? "✓" : "✗"}  ${id.padEnd(30)} ${fact}`); };
const ageDays = (d, ref) => Math.round((new Date(ref) - new Date(d)) / 864e5);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const notes = {};

for (const [src, list, control] of [["npm", NPM, NPM_CONTROL], ["pypi", PYPI, PYPI_CONTROL]]) {
  const d = load(`${src}.json`), P = d.packages, all = [...list, ...control];
  // 1. every watched package is there and current (both sources publish yesterday's counts)
  const missing = all.filter((p) => !P[p.pkg]?.days?.length).map((p) => p.pkg);
  check(`${src}:present`, missing.length === 0, `${all.length}개 패키지 중 ${all.length - missing.length}개 받음${missing.length ? ` — 없음: ${missing.join(", ")}` : ""}`);
  const stale = all.filter((p) => P[p.pkg] && ageDays(P[p.pkg].days.at(-1)[0], d.fetched_at) > 4).map((p) => p.pkg);
  check(`${src}:fresh`, stale.length === 0, `마지막 날 ${P[all[0].pkg]?.days.at(-1)[0]}, 받은 날 ${d.fetched_at}${stale.length ? ` — 오래됨: ${stale.join(", ")}` : ""}`);
  // 2. days are consecutive
  const gaps = all.filter((p) => P[p.pkg]).map((p) => [p.pkg, P[p.pkg].days.filter((r, i, a) => i && ageDays(a[i - 1][0], r[0]) !== 1).length]).filter(([, g]) => g);
  check(`${src}:days`, gaps.length === 0, gaps.length ? `빠진 날 있음: ${gaps.map(([k, g]) => `${k} ${g}`).join(", ")}` : `모든 패키지의 날짜가 하루도 빠짐없이 이어짐`);
  // 3. a second reading of the last week, from a different endpoint of the same source
  if (src === "npm") {
    const off = all.filter((p) => { const x = P[p.pkg]; if (!x?.last_week) return true; const sum = x.days.filter(([t]) => t >= x.last_week.start && t <= x.last_week.end).reduce((s, [, v]) => s + v, 0); return sum !== x.last_week.downloads; });
    check("npm:point=range", off.length === 0, `기간 API(일별 합)와 지난주 합계 API가 ${all.length - off.length}/${all.length}개 패키지에서 같은 숫자 (${P.openai.last_week.start}~${P.openai.last_week.end})`);
  } else {
    // pypistats "recent" counts the last 7 days it has; compare with the daily series (±2%: its window may differ by a day)
    const rel = all.map((p) => { const x = P[p.pkg]; const s = x.days.slice(-7).reduce((t, [, v]) => t + v, 0); return [p.pkg, Math.abs(s / x.recent.last_week - 1)]; });
    const worst = rel.reduce((a, b) => (b[1] > a[1] ? b : a));
    check("pypi:recent≈daily", worst[1] <= 0.02, `최근 7일 합계 API와 일별 합이 ${all.length}개 패키지 모두 2% 안 (가장 큰 차이 ${worst[0]} ${(worst[1] * 100).toFixed(2)}%)`);
  }
  // 4. what the method had to work around — reported, not hidden
  const until = lastSunday(all.map((p) => P[p.pkg].days));
  const W = trimEnd(Object.fromEntries(all.map((p) => [p.pkg, weekly(P[p.pkg].days, until)])));
  const wk = Object.values(W)[0], last = wk.at(-1).week;
  const zeros = list.map((p) => [p.pkg, P[p.pkg].days.filter(([t, v]) => v === 0 && t >= "2026-01-01").length]).filter(([, z]) => z);
  const br = breaks(Object.fromEntries(control.map((p) => [p.pkg, W[p.pkg]])));
  notes[src] = { until, lastWeek: last, trimmed: (Math.round((new Date(until) - new Date(last)) / 864e5) - 6) / 7, breaks: br.map((b) => ({ week: b.week, ratio: b.ratio })), weeks: wk.length };
  check(`${src}:weeks`, wk.length >= 12, `주간 수준을 낼 수 있는 마지막 주 ${last} 주 (그 뒤 ${notes[src].trimmed}주는 집계가 덜 끝나 뺌), 총 ${wk.length}주`);
  check(`${src}:zero-days`, true, zeros.length ? `2026년에 0으로 적힌 날: ${zeros.map(([k, z]) => `${k} ${z}일`).join(", ")} — 주간 수준은 0이 아닌 평일의 중앙값이라 이 날들에 흔들리지 않음` : `2026년에 0으로 적힌 날 없음`);
  check(`${src}:breaks`, true, br.length ? `대조군(${control.map((c) => c.pkg).join("·")})이 한꺼번에 움직인 주: ${br.map((b) => `${b.week} 주 ×${b.ratio.toFixed(2)}`).join(", ")} — 집계 방식 변화로 보고, 성장률은 마지막 끊김 이후만 비교` : `대조군(${control.map((c) => c.pkg).join("·")})이 한꺼번에 30% 넘게 움직인 주 없음 (연말연시 제외)`);
}

// arXiv — every field: an unbroken run of months ending last month, long enough to compare with a year earlier
{
  const d = load("arxiv.json");
  const prev = (x) => { const t = +x.slice(0, 4) * 12 + +x.slice(4) - 2; return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`; };
  const lastFull = (() => { const t = new Date(d.fetched_at + "T00:00:00Z"); t.setUTCDate(0); return t.toISOString().slice(0, 7).replace("-", ""); })();
  for (const f of ARXIV_DOMAINS) {
    const x = d.domains?.[f.id];
    if (!x || !x.months.length) { check(`arxiv:${f.id}:months`, false, `${f.name}: 받은 달 없음`); continue; }
    const set = new Set(x.months), m = [x.months.at(-1)]; while (set.has(prev(m[0]))) m.unshift(prev(m[0]));
    check(`arxiv:${f.id}:months`, m.length >= 15 && m.at(-1) === lastFull, `${f.name}(${f.scope}): 이어진 ${m.length}개월 ${m[0]}–${m.at(-1)} (지난달까지)`);
    const missing = f.terms.filter((t) => m.some((y) => x.terms[t.id]?.[y] == null)).map((t) => t.id);
    const over = f.terms.flatMap((t) => m.filter((y) => x.terms[t.id]?.[y] > x.total[y]).map((y) => `${t.id} ${y}`));
    check(`arxiv:${f.id}:terms`, missing.length === 0 && over.length === 0, `${f.name}: 키워드 ${f.terms.length}개 매달 셈, 분야 전체보다 많은 달 없음${missing.length ? ` — 빈 칸: ${missing.join(", ")}` : ""}${over.length ? ` — 어긋남: ${over.join(", ")}` : ""}`);
  }
}

// Hugging Face
{
  const d = load("hf.json"), s = d.snapshots.at(-1);
  check("hf:snapshot", ageDays(s.date, d.fetched_at) <= 1 && s.top.length >= 200 && s.trending.length >= 30, `${s.date} 스냅숏: 다운로드 상위 ${s.top.length}개, 트렌딩 ${s.trending.length}개 (쌓인 스냅숏 ${d.snapshots.length}개)`);
  const sorted = s.top.every((x, i, a) => !i || a[i - 1].downloads >= x.downloads);
  check("hf:sorted", sorted, `다운로드 순 목록이 실제로 다운로드 내림차순`);
}

// SEC
{
  const d = load("sec.json");
  for (const c of SEC.companies) {
    const x = d.companies[c.id], q = x.quarters, last = q.at(-1);
    check(`sec:${c.id}:fresh`, ageDays(last.end, d.fetched_at) <= 200, `${c.name}: 마지막 분기 ${last.q} (분기말 ${last.end})`);
    const both = q.filter((r) => r.filed3m != null && r.ytdDiff != null);
    const worst = both.length ? Math.max(...both.map((r) => Math.abs(r.filed3m / r.ytdDiff - 1))) : 0;
    // 1%: old filings were rounded to $1M on small quarters, and a few were restated later (Alphabet 2015Q3)
    check(`sec:${c.id}:two-readings`, worst <= 0.01, both.length
      ? `${c.name}: 3개월 공시값과 누적에서 뺀 값이 ${both.length}개 분기에서 1% 안 (가장 큰 차이 ${(worst * 100).toFixed(2)}%${worst ? ", 백만 달러 반올림·정정 공시" : ""})`
      : `${c.name}: 3개월 값을 따로 공시하지 않아 누적에서 뺀 값 하나뿐 — 두 번째 읽기 없음`);
    const recent = q.filter((r) => r.q >= "2019Q1"), seq = recent.every((r, i, a) => !i || r.q !== a[i - 1].q);
    check(`sec:${c.id}:quarters`, seq && recent.length > 0, `${c.name}: 2019년 이후 ${recent.length}개 분기, 같은 분기 두 번 없음`);
  }
}

fs.writeFileSync(path.join(DIR, "checks.json"), JSON.stringify({ checked_at: new Date().toISOString().slice(0, 10), notes, checks }, null, 1) + "\n");
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED ✗` : `\nALL ${checks.length} CHECKS PASSED ✓`);
process.exit(failed.length ? 1 : 0);
