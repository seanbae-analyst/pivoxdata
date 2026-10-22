// verify.mjs — the lab's numbers are believed only after they pass these checks (see TRUST.md).
// Each check reads the downloaded series a second way and must agree. Results go to
// lab/data/checks.json so the pages can quote exactly what was checked. Exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES, ANNUAL } from "./series.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const load = (id) => JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), "utf8"));
const checks = [];
const check = (id, ok, fact) => { checks.push({ id, ok, fact }); console.log(`${ok ? "✓" : "✗"}  ${id.padEnd(26)} ${fact}`); };

const nextMonth = (p) => { let y = +p.slice(0, 4), m = +p.slice(4); m++; if (m > 12) { m = 1; y++; } return `${y}${String(m).padStart(2, "0")}`; };

// 1. every monthly series is gap-free from its first month to its last, and every value is a number
for (const s of SERIES) {
  const d = load(s.id); let gaps = 0, nulls = 0;
  // a leading run of empty months means "not reported separately yet", not a hole
  const lead = d.rows.findIndex((r) => r[1] !== null);
  d.rows.forEach((r, i) => { if (i && r[0] !== nextMonth(d.rows[i - 1][0])) gaps++; if (i >= lead && (typeof r[1] !== "number" || !Number.isFinite(r[1]))) nulls++; });
  const from = lead > 0 ? ` (앞 ${lead}개월은 따로 집계되지 않아 비어 있음, ${d.rows[lead][0]}부터 값)` : "";
  check(`months:${s.id}`, gaps === 0 && nulls === 0, `${d.label}: ${d.n}개월 ${d.first}–${d.last}, 빠진 달 ${gaps}, 숫자 아닌 값 ${nulls}${from}`);
}

// 2. net buying: the five investor groups must net to zero each month (ECOS rounds each to 백만원)
const NB = ["individual", "institution", "foreign", "other_foreign", "other_corp"].map((k) => Object.fromEntries(load(`netbuy_${k}`).rows));
const months = Object.keys(NB[0]);
// before 기타법인 is reported separately (null), the other four groups must net to zero on their own
const resid = months.map((t) => NB.reduce((a, o) => a + (o[t] ?? 0), 0));
const exact = resid.filter((r) => r === 0).length, maxAbs = Math.max(...resid.map(Math.abs));
check("netbuy:sums-to-zero", maxAbs <= 2, `${months.length}개월 중 ${exact}개월은 정확히 0, 나머지도 ±${maxAbs}백만원 안 (반올림)`);

// 3. a year of net buying (annual table) = the sum of its months (monthly table), within rounding
{
  const A = load("netbuy_individual_A").rows, I = NB[0];
  const worst = Math.max(...A.map(([y, v]) => Math.abs(months.filter((t) => t.startsWith(y)).reduce((s, t) => s + I[t], 0) - v)));
  check("netbuy:annual=sum", worst <= 6, `${A.length}개 연도, 연간표와 월별 합의 차이 최대 ${worst}백만원 (월별 반올림 12번)`);
}

// 4. balances: the annual figure is the December figure (so monthly values are month-end balances)
for (const a of ANNUAL.filter((x) => x.id !== "netbuy_individual_A")) {
  const M = Object.fromEntries(load(a.of).rows), A = load(a.id).rows;
  const hit = A.filter(([y, v]) => M[`${y}12`] === v).length;
  check(`balance:${a.of}:A=Dec`, hit === A.length, `${A.length}개 연도 중 ${hit}개 연도에서 연간 값 = 12월 값`);
}

// 5. known holes: a balance of exactly 0 between non-zero months is a missing value, not a real zero
const holes = {};
for (const id of ["credit", "short_credit"]) {
  const r = load(id).rows;
  holes[id] = r.filter(([, v], i) => v === 0 && r.slice(i + 1).some(([, w]) => w > 0)).map(([t]) => t);
}
check("credit:zero-holes", JSON.stringify(holes.credit) === JSON.stringify(["199806", "199812"]),
  `신용융자 잔고가 0으로 적힌 달 ${holes.credit.join(", ")} — 앞뒤 달은 수천억원이라 빠진 값으로 처리`);
check("short_credit:zero-holes", holes.short_credit.length > 0, `신용대주 잔고 0인 달 ${holes.short_credit.length}개 — 이 계열은 차트에 쓰지 않음`);

// 5b. which market 901Y055 covers: its total buy value equals KOSPI traded value (901Y014, 천원 → 백만원)
{
  const B = Object.fromEntries(load("buy_total").rows), K = load("kospi_value").rows;
  const diff = K.map(([t, v]) => [t, Math.round(v / 1000) - B[t], B[t]]);
  const exact = diff.filter(([, d]) => Math.abs(d) <= 1).length, off = diff.filter(([, d]) => Math.abs(d) > 1);
  const worst = off.length ? off.reduce((a, b) => (Math.abs(b[1] / b[2]) > Math.abs(a[1] / a[2]) ? b : a)) : null;
  check("netbuy:market=KOSPI", off.every(([, d, b]) => Math.abs(d / b) < 1e-5),
    `투자자별 매수 합계와 코스피 거래대금이 ${K.length}개월(${K[0][0]}–${K.at(-1)[0]}) 중 ${exact}개월 일치(±1백만원)` +
    (worst ? `, 나머지 ${off.length}개월도 0.001% 안 (${worst[0]} ${worst[1]}백만원) — 이 표는 코스피입니다` : ` — 이 표는 코스피입니다`));
}

// 6. who compiled each table: what series.mjs says (and the pages print) = what ECOS reports
for (const t of [...new Set(SERIES.map((s) => s.table))]) {
  const d = load(SERIES.find((s) => s.table === t).id);
  const org = d.source.ecos_org_name || "";
  check(`agency:${t}`, org.startsWith(d.source.compiled_by), `${t} 작성기관 — ECOS 표기 “${org.replace(/\(.*\)$/, "")}”, 페이지 표기 “${d.source.compiled_by}”`);
}

// 7. a third reading: month-end balances reported in the news from KOFIA's daily figures (crosscheck.json)
{
  const X = JSON.parse(fs.readFileSync(path.join(DIR, "crosscheck.json"), "utf8"));
  for (const c of X.credit) {
    const v = Object.fromEntries(load("credit").rows)[c.month];
    const diff = Math.abs(v - c.won);
    check(`news:credit:${c.month}`, diff <= c.tolerance_won, `신용융자 ${c.month.slice(0, 4)}.${c.month.slice(4)} — ECOS ${(v / 1e8).toFixed(0)}억, 보도 ${(c.won / 1e8).toFixed(0)}억 (${c.outlet} ${c.date})`);
  }
}

fs.writeFileSync(path.join(DIR, "checks.json"), JSON.stringify({ checked_at: new Date().toISOString().slice(0, 10), holes, checks }, null, 1) + "\n");
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED ✗` : `\nALL ${checks.length} CHECKS PASSED ✓`);
process.exit(failed.length ? 1 : 0);
