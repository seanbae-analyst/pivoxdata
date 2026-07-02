// analysis/run_kr.mjs — the same BA loop, on KOREAN data.
// 소상공인시장진흥공단 상가(상권)정보, 서울, 2026-03-31 quarterly snapshot (537,489 rows).
// Source: data.go.kr 15083033 (직접 첨부 zip; LOCALDATA-계열 인허가 데이터는 네트워크
// 차단으로 대체). Data not committed — download the quarterly zip and extract 서울 as
// kr_data/seoul_sanga_202603.csv, then: node --max-old-space-size=8192 analysis/run_kr.mjs
//
// This run doubles as the KR dogfood that produced scorer/insight guards:
// 법정동코드 phone-FP → code-name gate · 지번 642/64-2 false cluster → digit-aware
// variantKey · 번지 outlier trivia → label-name metric gate (validate §9).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "../parse.mjs";
import { scoreDataset } from "../scorer.mjs";
import { extractInsights } from "../insights.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "../kr_data/seoul_sanga_202603.csv");
const { rows, columns } = parseFile(src);
const stats = scoreDataset(rows, columns);
const val = (r, c) => String(r[c] ?? "").trim();
const count = (get) => { const m = new Map(); for (const r of rows) { const k = get(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

const f = {};
f.dataready = { score: stats.score, issues: stats.issues.map((i) => `[${i.severity}] ${i.code}@${i.column}`) };
f.insights = extractInsights(rows, columns, stats).map((i) => ({ shape: i.shape, fact: i.fact }));

// 1. entity integrity
f.entity = { rows: rows.length, unique_상가업소번호: new Set(rows.map((r) => val(r, "상가업소번호"))).size };

// 2. 업종 구조 (대분류)
const cat = sorted(count((r) => val(r, "상권업종대분류명")));
f.industry = { top: cat.slice(0, 5).map(([k, n]) => ({ k, n, pct: +(n / rows.length * 100).toFixed(1) })) };

// 3. 자치구 집중
const gu = sorted(count((r) => val(r, "시군구명")));
f.district = {
  top3: gu.slice(0, 3).map(([k, n]) => ({ k, n })), bottom3: gu.slice(-3).map(([k, n]) => ({ k, n })),
  gangnam_vs_dobong: +(gu[0][1] / gu[gu.length - 1][1]).toFixed(1),
};

// 4. 업종별 수직 분포 (층정보 평균) — 로드샵 vs 오피스 업종
const floors = new Map();
for (const r of rows) {
  const fl = Number(val(r, "층정보")); const k = val(r, "상권업종대분류명");
  if (!val(r, "층정보") || !Number.isFinite(fl)) continue;
  let g = floors.get(k); if (!g) floors.set(k, (g = { n: 0, s: 0 }));
  g.n++; g.s += fl;
}
f.floors = [...floors.entries()].filter(([, g]) => g.n >= 5000)
  .map(([k, g]) => ({ k, avg: +(g.s / g.n).toFixed(2), n: g.n })).sort((a, b) => b.avg - a.avg);

// 5. 건물명 결측의 구조 (업종별)
const bm = new Map();
for (const r of rows) {
  const k = val(r, "상권업종대분류명");
  let g = bm.get(k); if (!g) bm.set(k, (g = { n: 0, miss: 0 }));
  g.n++; if (!val(r, "건물명")) g.miss++;
}
f.building_name_missing = [...bm.entries()].filter(([, g]) => g.n >= 5000)
  .map(([k, g]) => ({ k, pct: +(g.miss / g.n * 100).toFixed(1) })).sort((a, b) => b.pct - a.pct);

// 6. 좌표 품질 (서울 bbox)
let bad = 0, miss = 0;
for (const r of rows) {
  const x = Number(val(r, "경도")), y = Number(val(r, "위도"));
  if (!val(r, "경도") || !val(r, "위도")) miss++;
  else if (x < 126.6 || x > 127.3 || y < 37.3 || y > 37.8) bad++;
}
f.coords = { missing: miss, out_of_bbox: bad };

fs.writeFileSync(path.join(here, "findings_kr.json"), JSON.stringify(f, null, 2));
console.log(JSON.stringify(f, null, 2));
