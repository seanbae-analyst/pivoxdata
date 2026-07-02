// analysis/run_kr_survival.mjs — 음식점 생존분석 (성남시 인허가 이력, 1970–2026).
// 원래 목표였던 LOCALDATA 전국 인허가는 네트워크 차단 — 같은 스키마의 시 단위 직접
// 첨부(data.go.kr 15076265, 성남시 음식점 현황, 41,142행)로 수행.
// 검열(censoring) 처리: "N년 생존율"은 관측창이 N년 이상인 코호트(인허가일 ≤ 기준일-N년)
// 에서만 계산한다 — 어제 개업한 가게를 '1년 생존'의 분모에 넣지 않는 것.
// 재현: data.go.kr 15076265 CSV를 kr_data/seongnam_food.csv 로 받은 후
//   node analysis/run_kr_survival.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "../parse.mjs";
import { scoreDataset } from "../scorer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { rows, columns } = parseFile(path.join(here, "../kr_data/seongnam_food.csv"));
const val = (r, c) => String(r[c] ?? "").trim();
const day = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t / 86400000 : null; };

const BASE = day("2026-05-12"); // 데이터기준일자 (single value, verified)
const recs = [];
for (const r of rows) {
  const open = day(val(r, "인허가일자"));
  if (open === null || open > BASE) continue;
  const closedDate = day(val(r, "폐업일자"));
  const closed = /폐업/.test(val(r, "영업상태")) && closedDate !== null && closedDate >= open;
  recs.push({
    open, gu: val(r, "구"), kind: val(r, "업종명"),
    closed, life: closed ? (closedDate - open) / 365.25 : (BASE - open) / 365.25, // years; open = censored age
  });
}
const N = recs.length;
const closedN = recs.filter((x) => x.closed).length;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? +(s[Math.floor(s.length / 2)]).toFixed(1) : null; };
const closedLives = recs.filter((x) => x.closed).map((x) => x.life);

// survival ≥ Y years, censoring-correct: denominator = opened ≥ Y years before base
const survivalAt = (Y, subset = recs) => {
  const eligible = subset.filter((x) => (BASE - x.open) / 365.25 >= Y);
  if (eligible.length < 100) return null;
  const alive = eligible.filter((x) => !x.closed || x.life >= Y).length;
  return { years: Y, n: eligible.length, pct: +(alive / eligible.length * 100).toFixed(1) };
};

// decade cohorts: 5-year survival by opening decade
const cohorts = {};
for (const d of ["1980", "1990", "2000", "2010", "2020"]) {
  const lo = day(`${d}-01-01`), hi = day(`${+d + 10}-01-01`);
  const sub = recs.filter((x) => x.open >= lo && x.open < hi);
  const s5 = survivalAt(5, sub);
  if (s5) cohorts[`${d}s`] = { opened: sub.length, five_year_survival_pct: s5.pct, eligible: s5.n };
}

const byGu = {};
for (const gu of ["분당구", "수정구", "중원구"]) {
  const sub = recs.filter((x) => x.gu === gu);
  byGu[gu] = { n: sub.length, median_lifespan_closed: median(sub.filter((x) => x.closed).map((x) => x.life)),
    five_year_survival_pct: survivalAt(5, sub)?.pct ?? null };
}
const byKind = {};
for (const k of ["일반음식점", "휴게음식점"]) {
  const sub = recs.filter((x) => x.kind === k);
  byKind[k] = { n: sub.length, median_lifespan_closed: median(sub.filter((x) => x.closed).map((x) => x.life)),
    five_year_survival_pct: survivalAt(5, sub)?.pct ?? null };
}

const f = {
  source: "data.go.kr 15076265 성남시 음식점 현황 (기준일 2026-05-12), 41,142행 — LOCALDATA 스키마의 시 단위 직접 첨부",
  caveat: "성남시 1개 시 — 전국 일반화 불가. '폐업'+'폐업중' 모두 폐업 처리. 검열 처리: N년 생존율은 관측창 ≥N년 코호트만.",
  dataready_score: scoreDataset(rows, columns).score,
  n: N, closed: closedN, closed_pct: +(closedN / N * 100).toFixed(1),
  median_lifespan_closed_years: median(closedLives),
  closed_within_3y_pct: +(closedLives.filter((x) => x < 3).length / closedLives.length * 100).toFixed(1),
  survival: [1, 3, 5, 10, 20].map((y) => survivalAt(y)).filter(Boolean),
  cohorts_5y: cohorts, by_gu: byGu, by_kind: byKind,
};
fs.writeFileSync(path.join(here, "findings_kr_survival.json"), JSON.stringify(f, null, 2));
console.log(JSON.stringify(f, null, 2));
