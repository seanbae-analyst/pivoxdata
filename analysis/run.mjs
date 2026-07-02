// analysis/run.mjs — a real analysis on the real anchor dataset (NYC DOHMH
// Restaurant Inspections, 295,810 rows), with DataReady as step 1 of the pipeline.
//
// This is the BA loop the product exists to serve: clean → analyze → findings →
// recommendation. Every number in ANALYSIS.md is computed here; run this file to
// reproduce all of them. Findings are also the DISCOVERY input for insights.mjs —
// each one is an instance of a generalizable insight shape (granularity trap,
// structural missingness, weighted-average bias, placeholder backlog).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "../parse.mjs";
import { scoreDataset } from "../scorer.mjs";
import { fixDataset } from "../fixer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// ---- step 1: dogfood — clean with DataReady before analyzing ----
const { rows: raw, columns } = parseFile(path.join(root, "nyc_restaurant_full.csv"));
const res = fixDataset(raw, columns, {}); // recommended defaults; judgments reported, not guessed
const rows = res.rows;
const after = scoreDataset(rows, res.columns);
const f = {
  step1_dataready: {
    rows_raw: raw.length, rows_clean: rows.length,
    score_before: res.before.score, score_after: after.score,
    fixes: res.fixes.map((x) => x.message), skipped: res.skipped.map((x) => x.reason),
  },
};

const val = (r, c) => String(r[c] ?? "").trim();
const count = (it) => { const m = new Map(); for (const k of it) m.set(k, (m.get(k) || 0) + 1); return m; };

// ---- finding 1: the granularity trap (row ≠ inspection ≠ restaurant) ----
const restaurants = new Set(rows.map((r) => val(r, "CAMIS")));
const inspections = new Set(rows.map((r) => val(r, "CAMIS") + "" + val(r, "INSPECTION DATE")));
f.granularity = {
  rows: rows.length, unique_restaurants: restaurants.size, unique_inspections: inspections.size,
  rows_per_inspection: +(rows.length / inspections.size).toFixed(2),
};

// ---- finding 2: grade missingness is STRUCTURAL, not random ----
const byType = {};
for (const r of rows) {
  const t = val(r, "INSPECTION TYPE") || "(blank)";
  byType[t] ??= { rows: 0, gradeMissing: 0 };
  byType[t].rows++;
  if (!val(r, "GRADE")) byType[t].gradeMissing++;
}
f.grade_missing_by_type = Object.entries(byType)
  .filter(([, v]) => v.rows >= 3000)
  .map(([t, v]) => ({ type: t, rows: v.rows, missing_pct: +(v.gradeMissing / v.rows * 100).toFixed(1) }))
  .sort((a, b) => b.rows - a.rows);
const overallMissing = rows.filter((r) => !val(r, "GRADE")).length;
f.grade_missing_overall_pct = +(overallMissing / rows.length * 100).toFixed(1);

// ---- finding 3: row-weighted vs inspection-weighted averages diverge ----
// SCORE is an inspection-level number repeated on every violation row; averaging rows
// over-weights inspections with many violations (bad ones) — a silent bias.
const scoreRows = rows.filter((r) => /^\d+$/.test(val(r, "SCORE")));
const rowAvg = scoreRows.reduce((s, r) => s + Number(val(r, "SCORE")), 0) / scoreRows.length;
const perInsp = new Map();
for (const r of scoreRows) perInsp.set(val(r, "CAMIS") + "" + val(r, "INSPECTION DATE"), Number(val(r, "SCORE")));
const inspAvg = [...perInsp.values()].reduce((s, x) => s + x, 0) / perInsp.size;
f.weighting_bias = {
  row_weighted_avg_score: +rowAvg.toFixed(2), inspection_weighted_avg_score: +inspAvg.toFixed(2),
  bias_pct: +((rowAvg / inspAvg - 1) * 100).toFixed(1),
  note: "NYC scores: higher = worse. Row-averaging inflates the city's apparent risk.",
};

// ---- finding 4: worst segments, computed at the RIGHT granularity ----
const inspOf = new Map(); // key -> {score, boro, cuisine, critical}
for (const r of rows) {
  const k = val(r, "CAMIS") + "" + val(r, "INSPECTION DATE");
  let o = inspOf.get(k);
  if (!o) inspOf.set(k, (o = { boro: val(r, "BORO"), cuisine: val(r, "CUISINE DESCRIPTION"), score: null, critical: false }));
  if (/^\d+$/.test(val(r, "SCORE"))) o.score = Number(val(r, "SCORE"));
  if (val(r, "CRITICAL FLAG") === "Critical") o.critical = true;
}
const insp = [...inspOf.values()];
const seg = (key, minN) => {
  const m = new Map();
  for (const o of insp) {
    if (o.score === null) continue;
    const k = o[key]; if (!k || k === "0") continue;
    let g = m.get(k); if (!g) m.set(k, (g = { n: 0, sum: 0, crit: 0 }));
    g.n++; g.sum += o.score; if (o.critical) g.crit++;
  }
  return [...m.entries()].filter(([, g]) => g.n >= minN)
    .map(([k, g]) => ({ segment: k, inspections: g.n, avg_score: +(g.sum / g.n).toFixed(1), critical_pct: +(g.crit / g.n * 100).toFixed(1) }));
};
const cuisines = seg("cuisine", 500).sort((a, b) => b.avg_score - a.avg_score);
f.cuisine_risk = { worst: cuisines.slice(0, 5), best: cuisines.slice(-3).reverse(), min_inspections: 500 };
f.boro_risk = seg("boro", 1000).sort((a, b) => b.avg_score - a.avg_score);

// ---- finding 5: the placeholder dates were a hidden BACKLOG queue ----
// 01/01/1900 inspection dates (cleared to empty by DataReady) all sit on rows with a
// blank INSPECTION TYPE — establishments recorded but never yet inspected.
const backlogRows = rows.filter((r) => !val(r, "INSPECTION DATE") && !val(r, "INSPECTION TYPE"));
const backlogRestaurants = new Set(backlogRows.map((r) => val(r, "CAMIS")));
const backlogByBoro = count(backlogRows.map((r) => val(r, "BORO")));
f.backlog = {
  never_inspected_restaurants: backlogRestaurants.size,
  share_of_all_restaurants_pct: +(backlogRestaurants.size / restaurants.size * 100).toFixed(1),
  by_boro: Object.fromEntries([...backlogByBoro.entries()].sort((a, b) => b[1] - a[1])),
};

fs.writeFileSync(path.join(here, "findings.json"), JSON.stringify(f, null, 2));
console.log(JSON.stringify(f, null, 2));
