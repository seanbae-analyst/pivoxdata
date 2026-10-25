// verify.mjs — the radar's numbers are believed only after these checks. Results go to trends/data/checks.json so
// the page can quote exactly what was checked. Exit 1 on any failure: the weekly job then opens an issue instead of
// publishing. A check here is either a second reading of a number or a condition the page's sentences rely on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, SEC, AX, NEWS } from "./series.mjs";
import { onDomain } from "./feeds.mjs";
import { weekTable, breaks } from "./signals.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const checks = [];
const check = (id, ok, fact) => { checks.push({ id, ok, fact }); console.log(`${ok ? "✓" : "✗"}  ${id.padEnd(30)} ${fact}`); };
const ageDays = (d, ref) => Math.round((new Date(ref) - new Date(d)) / 864e5);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const notes = {};
// freshness is measured from the day of the check, not from a file's own fetched_at: a file that was not fetched again
// is as old as it is, whatever date it carries
const runDay = new Date().toISOString().slice(0, 10);

for (const [src, list, control] of [["npm", NPM, NPM_CONTROL], ["pypi", PYPI, PYPI_CONTROL]]) {
  const d = load(`${src}.json`), P = d.packages, all = [...list, ...control];
  // 1. every watched package is there and current (both sources publish yesterday's counts)
  const missing = all.filter((p) => !P[p.pkg]?.days?.length).map((p) => p.pkg);
  check(`${src}:present`, missing.length === 0, `${all.length}개 패키지 중 ${all.length - missing.length}개 받음${missing.length ? ` — 없음: ${missing.join(", ")}` : ""}`);
  const stale = all.filter((p) => P[p.pkg] && ageDays(P[p.pkg].days.at(-1)[0], runDay) > 4).map((p) => p.pkg);
  check(`${src}:fresh`, stale.length === 0, `마지막 날 ${P[all[0].pkg]?.days.at(-1)[0]}, 받은 날 ${d.fetched_at} — 검산한 날(${runDay})에서 4일 안${stale.length ? ` — 오래됨: ${stale.join(", ")}` : ""}`);
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
  const { until, W } = weekTable(Object.fromEntries(all.map((p) => [p.pkg, P[p.pkg].days])));
  const wk = Object.values(W)[0], last = wk.at(-1).week;
  const zeros = list.map((p) => [p.pkg, P[p.pkg].days.filter(([t, v]) => v === 0 && t >= "2026-01-01").length]).filter(([, z]) => z);
  const br = breaks(Object.fromEntries(control.map((p) => [p.pkg, W[p.pkg]])));
  notes[src] = { until, lastWeek: last, trimmed: (Math.round((new Date(until) - new Date(last)) / 864e5) - 6) / 7, breaks: br.map((b) => ({ week: b.week, ratio: b.ratio })), weeks: wk.length };
  check(`${src}:weeks`, wk.length >= 12, `주간 수준을 낼 수 있는 마지막 주 ${last} 주 (그 뒤 ${notes[src].trimmed}주는 집계가 덜 끝나 뺌), 총 ${wk.length}주`);
  // every ranking reads 4-week growth, i.e. the last 8 weeks. A day reported as 0 is absorbed while its week keeps 3
  // non-zero weekdays; a week inside those 8 where most packages lost their level (trailing ones were dropped above)
  // leaves no growth to rank — the build would stop on it, so the check says which week
  const holes = wk.map((w, i) => (i >= wk.length - 8 && Object.values(W).filter((x) => x[i].level == null).length > Object.keys(W).length / 2 ? w.week : null)).filter(Boolean);
  check(`${src}:zero-days`, holes.length === 0, `${zeros.length ? `2026년에 0으로 적힌 날: ${zeros.map(([k, z]) => `${k} ${z}일`).join(", ")} — 주간 수준은 0이 아닌 평일의 중앙값이라 이 날들에 흔들리지 않음` : `2026년에 0으로 적힌 날 없음`}${holes.length ? ` — 0이 아닌 평일이 3일이 안 돼 대부분의 패키지가 주간 수준을 잃은 주(최근 8주 안, 4주 성장을 못 잼): ${holes.join(", ")}` : ", 최근 8주 모두 주간 수준 있음"}`);
  // growth is compared only after the last break, and 4-week growth needs 8 weeks of it
  const after = wk.length - (br.length ? br.at(-1).i : 0);
  check(`${src}:breaks`, after >= 8, `${br.length ? `대조군(${control.map((c) => c.pkg).join("·")})이 한꺼번에 움직인 주: ${br.map((b) => `${b.week} 주 ×${b.ratio.toFixed(2)}`).join(", ")} — 집계 방식 변화로 보고, 성장률은 마지막 끊김 이후 ${after}주만 비교` : `대조군(${control.map((c) => c.pkg).join("·")})이 한꺼번에 30% 넘게 움직인 주 없음 (연말연시 제외)`}${after < 8 ? " — 4주 성장에 필요한 8주가 안 됨" : ""}`);
}

// arXiv — every field: an unbroken run of months ending last month, long enough to compare with a year earlier
{
  const d = load("arxiv.json");
  const prev = (x) => { const t = +x.slice(0, 4) * 12 + +x.slice(4) - 2; return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`; };
  const lastFull = (() => { const t = new Date(runDay + "T00:00:00Z"); t.setUTCDate(0); return t.toISOString().slice(0, 7).replace("-", ""); })();
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
  // one snapshot a day; two days old at most (a missed day still passes, the page prints the snapshot's date)
  check("hf:snapshot", ageDays(s.date, runDay) <= 2 && s.top.length >= 200 && s.trending.length >= 30, `${s.date} 스냅숏(검산한 날에서 2일 안): 다운로드 상위 ${s.top.length}개, 트렌딩 ${s.trending.length}개 (쌓인 스냅숏 ${d.snapshots.length}개)`);
  const sorted = s.top.every((x, i, a) => !i || a[i - 1].downloads >= x.downloads);
  check("hf:sorted", sorted, `다운로드 순 목록이 실제로 다운로드 내림차순`);
}

// SEC
{
  const d = load("sec.json");
  for (const c of SEC.companies) {
    const x = d.companies[c.id], q = x.quarters, last = q.at(-1);
    check(`sec:${c.id}:fresh`, ageDays(last.end, runDay) <= 200, `${c.name}: 마지막 분기 ${last.q} (분기말 ${last.end})`);
    // two second readings: the 3-month figure where one was filed against the year-to-date difference, and each fiscal
    // year shown (ending 2019 on) as the sum of its four quarters against the 10-K's annual figure — the only one for
    // a company that files no 3-month figure (Meta, Oracle). At least one must exist: no comparison is no check.
    const both = q.filter((r) => r.filed3m != null && r.ytdDiff != null);
    const worst = both.length ? Math.max(...both.map((r) => Math.abs(r.filed3m / r.ytdDiff - 1))) : 0;
    const years = x.annual.filter((a) => a.end >= "2019").map((a) => { const four = q.filter((r) => r.end > a.start && r.end <= a.end);
      return { fy: a.end.slice(0, 7), n: four.length, off: four.length === 4 ? Math.abs(four.reduce((s, r) => s + r.val, 0) / a.val - 1) : null }; });
    const offYears = years.filter((y) => y.off == null || y.off > 0.01);
    // 1%: old filings were rounded to $1M on small quarters, and a few were restated later (Alphabet 2015Q3)
    check(`sec:${c.id}:two-readings`, (both.length > 0 || years.length > 0) && worst <= 0.01 && offYears.length === 0, `${c.name}: `
      + (both.length ? `3개월 공시값과 누적에서 뺀 값이 ${both.length}개 분기에서 1% 안 (가장 큰 차이 ${(worst * 100).toFixed(2)}%${worst ? ", 백만 달러 반올림·정정 공시" : ""}) · ` : "3개월 값을 따로 공시하지 않아 연간값으로 맞춤 · ")
      + `2019년 이후 회계연도 ${years.length}개의 분기 4개 합이 10-K 연간값과 1% 안`
      + (offYears.length ? ` — 어긋남: ${offYears.map((y) => `${y.fy}에 끝난 해(${y.n === 4 ? `${(y.off * 100).toFixed(2)}%` : `분기 ${y.n}개`})`).join(", ")}` : ""));
    const recent = q.filter((r) => r.q >= "2019Q1"), seq = recent.every((r, i, a) => !i || r.q !== a[i - 1].q);
    check(`sec:${c.id}:quarters`, seq && recent.length > 0, `${c.name}: 2019년 이후 ${recent.length}개 분기, 같은 분기 두 번 없음`);
  }
}

// AX (Ramp AI Index)
{
  const d = load("ax.json"), S = Object.values(d.series);
  const lasts = S.map((x) => Object.keys(x.months).at(-1)).filter(Boolean), last = lasts.sort()[0];
  check("ax:present", S.length === AX.series.length && S.every((x) => Object.keys(x.months).length >= 24), `Ramp AI Index ${S.length}개 시리즈, 모두 24개월 이상`);
  check("ax:fresh", last && ageDays(`${last}-01`, runDay) <= 100, `가장 늦은 시리즈도 ${last}까지 (월 단위, 한두 달 늦게 나옴)`);
  check("ax:same-month", new Set(lasts).size === 1, `모든 시리즈의 마지막 달이 같음 (${[...new Set(lasts)].join(", ")})`);
  // each series an unbroken run of months from the same first month: the page reads every series at this month, last
  // month, a year ago and the first month, so a gap (FRED writes "." for a month it lacks) would stop the build
  const mi = (m) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
  const run = S.map((x) => { const k = Object.keys(x.months).sort(); return { id: x.id, first: k[0], gaps: k.length ? mi(k.at(-1)) - mi(k[0]) + 1 - k.length : null }; });
  const broken = run.filter((r) => r.gaps !== 0 || r.first !== run[0].first);
  check("ax:months", broken.length === 0, `모든 시리즈가 ${run[0]?.first}부터 빠진 달 없이 이어짐${broken.length ? ` — 어긋남: ${broken.map((r) => `${r.id}(${r.gaps == null ? "달 없음" : r.gaps ? `빠진 달 ${r.gaps}개` : `${r.first}부터`})`).join(", ")}` : ""}`);
  const bad = S.flatMap((x) => Object.entries(x.months).filter(([, v]) => !(v >= 0 && v <= 100)).map(([m]) => `${x.id} ${m}`));
  check("ax:range", bad.length === 0, `모든 값이 0~100% 안${bad.length ? ` — 어긋남: ${bad.join(", ")}` : ""}`);
  const all = d.series.RAMPAIALL.months, vendors = ["RAMPAIANTHROPIC", "RAMPAIOPENAI", "RAMPAIXAI"].map((id) => d.series[id].months);
  const over = Object.keys(all).filter((m) => vendors.some((v) => v[m] > all[m] + 0.01));
  check("ax:vendor-under-all", over.length === 0, `AI 회사별 도입률이 전체 도입률을 넘는 달 없음${over.length ? ` — 어긋남: ${over.join(", ")}` : ""}`);
}

// AX news (official announcements). A dead feed or two is reported, not fatal; the posts quote only what is here.
if (fs.existsSync(path.join(DIR, "news.json"))) {
  const d = load("news.json"), srcs = Object.fromEntries(NEWS.sources.map((x) => [x.id, x]));
  // a source counts only when it answered with something to read — feed items, or article links on its news page — as
  // fetch recorded it. Named when it didn't; under 60% answering is the run or the parser failing, not a feed or two
  const live = (x) => { const f = d.feeds[x.id]; return !!f?.ok && (x.html ? f.links > 0 : f.items > 0); };
  const why = (f) => (!f ? "기록 없음" : f.ok ? "항목 0" : /HTTP \d+/.exec(f.error)?.[0] ?? (/no feed items/.test(f.error) ? "피드 항목 없음" : /no article links/.test(f.error) ? "기사 링크 없음" : "연결 실패"));
  const up = NEWS.sources.filter(live), down = NEWS.sources.filter((x) => !live(x));
  check("news:sources", up.length >= NEWS.sources.length * 0.6, `공식 출처 ${NEWS.sources.length}곳 중 ${up.length}곳이 피드·기사 목록으로 응답${down.length ? ` — 못 읽음: ${down.map((x) => `${x.id}(${why(d.feeds[x.id])})`).join(", ")}` : ""}`);
  const off = d.items.filter((x) => !srcs[x.src] || !onDomain(x.link, srcs[x.src].domains));
  check("news:official", off.length === 0, `기사 ${d.items.length}건 모두 그 회사·기관 자기 도메인의 원문 링크${off.length ? ` — 어긋남: ${off.map((x) => x.link).join(", ")}` : ""}`);
  const badDate = d.items.filter((x) => !(ageDays(x.date, d.fetched_at) >= -1 && ageDays(x.date, d.fetched_at) <= NEWS.days));
  check("news:dated", badDate.length === 0, `모든 기사의 발표일이 최근 ${NEWS.days}일 안${badDate.length ? ` — 어긋남: ${badDate.map((x) => `${x.src} ${x.date}`).join(", ")}` : ""}`);
}

fs.writeFileSync(path.join(DIR, "checks.json"), JSON.stringify({ checked_at: runDay, notes, checks }, null, 1) + "\n");
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED ✗` : `\nALL ${checks.length} CHECKS PASSED ✓`);
process.exit(failed.length ? 1 : 0);
