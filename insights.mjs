// insights.mjs — DataReady's insight engine: what the file SAYS, not just what's wrong.
//
// Discovery source: analysis/ANALYSIS.md — a manual analysis of the 295k-row NYC
// dataset. Each shape below is the generalized form of a finding that mattered there:
//   granularity        — rows ≠ entities (NYC: 9.5 violation rows per restaurant)
//   weighting_bias     — row-averages over-weight heavy entities (NYC: +42.9% risk)
//   structural_missing — missingness follows a segment (NYC: 62% vs 4% by type)
//   concentration      — one segment carries the total far beyond its row share
//   segment_gap        — a segment sits far from the overall average
//   outliers           — a few extreme values dominate sums
//
// Discipline (why this beats "AI insights"): every number is deterministic and
// recomputable; an insight is only emitted as FACT + BASELINE + SO-WHAT, ranked by
// materiality; below-threshold observations stay silent — honest silence over trivia.
// The first draft of this engine produced exactly the trivia it now guards against
// ("93% of SCORE sits in the segment that has 93% of rows"; summed ZIP codes) — the
// guards below are those failures, encoded:
//   • code-like columns (fixed-width digit strings: ids, zips, phones) are never
//     metrics — but they ARE entity-key candidates for the granularity shapes
//   • near-constant columns (CV < 5%: latitudes, years) are never metrics
//   • concentration only counts when a segment's value-share ≥ 2× its row-share
// No LLM anywhere in this module.
import { EMPTY, looksLikeIdColumn } from "./scorer.mjs";

const val = (r, c) => { const v = r[c]; return EMPTY(v) ? "" : String(v).trim(); };
const isNum = (t) => t !== "" && !isNaN(Number(t));
const fmt = (x) => Number.isFinite(x) ? (Math.abs(x) >= 100 ? Math.round(x).toLocaleString("en-US") : (+x.toFixed(1)).toLocaleString("en-US")) : String(x);
const pct = (x) => `${(+x.toFixed(1))}%`;

function profileNumeric(rows, c) {
  const raw = rows.map((r) => val(r, c)).filter((t) => t !== "");
  const nums = raw.filter(isNum);
  if (!raw.length || nums.length / raw.length < 0.9) return null;
  const xs = nums.map(Number);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  const intStrings = nums.filter((t) => /^\d+$/.test(t));
  const lenCounts = new Map();
  for (const t of intStrings) lenCounts.set(t.length, (lenCounts.get(t.length) || 0) + 1);
  const domLen = [...lenCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const codeLike = intStrings.length / nums.length >= 0.95 &&
    domLen && domLen[0] >= 3 && domLen[1] / intStrings.length >= 0.95;
  const intOnly = intStrings.length / nums.length >= 0.99;
  const cv = mean === 0 ? (sd > 0 ? 1 : 0) : Math.abs(sd / mean);
  return { count: nums.length, mean, sd, cv, codeLike, intOnly };
}

export function extractInsights(rows, columns, stats) {
  const n = rows.length;
  if (n < 10) return [];
  const found = [];
  const add = (shape, materiality, fact, baseline, sowhat, evidence) =>
    found.push({ shape, materiality, fact, baseline, sowhat, evidence });

  const cs = stats.columnStats || {};
  const prof = {};
  for (const c of columns) if (cs[c]?.present >= n * 0.5) prof[c] = profileNumeric(rows, c);

  // metrics: numeric, not an id by name, not code-like, not near-constant, not PII/date,
  // and not a discrete integer LABEL (≤100 distinct values each reused ≥50× — district
  // numbers, board codes: averaging those is meaningless)
  const metricCols = columns.filter((c) => prof[c] && !prof[c].codeLike && prof[c].cv >= 0.05 &&
    !(prof[c].intOnly && cs[c].uniqueCount <= 100 && cs[c].present / cs[c].uniqueCount >= 50) &&
    !looksLikeIdColumn(c) && !cs[c].piiType && Object.keys(cs[c].dateShapes || {}).length === 0).slice(0, 6);
  // categories: low-cardinality text
  const categoryCols = columns.filter((c) => cs[c] && !cs[c].piiType &&
    Object.keys(cs[c].dateShapes || {}).length === 0 && !looksLikeIdColumn(c) &&
    cs[c].present >= n * 0.5 && cs[c].numericCount / cs[c].present < 0.5 &&
    cs[c].uniqueCount >= 2 && cs[c].uniqueCount <= 40).slice(0, 8);
  // entity keys: id-named OR code-like numeric (ids stored as numbers: camis, emp codes)
  const entityKeyCols = columns.filter((c) => cs[c]?.present > 0 &&
    (looksLikeIdColumn(c) || (prof[c] && prof[c].codeLike)));

  // ---- 1. granularity: rows are not entities ----
  let dupIdCol = null, dupFactor = 1, dupUnique = 0;
  for (const c of entityKeyCols) {
    const uniq = new Set(rows.map((r) => val(r, c)).filter(Boolean)).size;
    if (!uniq) continue;
    // an entity key identifies FEW rows each and has MANY distinct values; a
    // low-cardinality code (zip, district) reused across rows is a category, not an entity
    if (uniq < 10 || uniq / cs[c].present < 0.02) continue;
    const f = cs[c].present / uniq;
    // prefer the FINEST entity grain (smallest factor ≥1.5): rows-per-restaurant is the
    // honest claim even when a coarser key (building lot) also repeats
    if (f >= 1.5 && (dupIdCol === null || f < dupFactor)) { dupIdCol = c; dupFactor = f; dupUnique = uniq; }
  }
  if (dupIdCol) {
    add("granularity", 1 - 1 / dupFactor,
      `Your ${fmt(n)} rows describe only ${fmt(dupUnique)} distinct "${dupIdCol}" entities — ${fmt(dupFactor)} rows per entity.`,
      `a count assumes 1 row = 1 entity`,
      `Every COUNT(*) and total is duplication-weighted. Dedupe to "${dupIdCol}" before any per-entity claim.`,
      `rows=${n} unique=${dupUnique}`);

    // ---- 2. weighting bias: row-average vs entity-average ----
    for (const m of metricCols) {
      const perEntity = new Map();
      for (const r of rows) {
        const k = val(r, dupIdCol), t = val(r, m);
        if (!k || !isNum(t)) continue;
        const x = Number(t);
        if (!perEntity.has(k)) perEntity.set(k, x);
        else if (perEntity.get(k) !== x) perEntity.set(k, NaN); // varies within entity → ambiguous
      }
      const entityVals = [...perEntity.values()].filter(Number.isFinite);
      if (perEntity.size < 10 || entityVals.length / perEntity.size < 0.95) continue;
      const rowVals = rows.map((r) => val(r, m)).filter(isNum).map(Number);
      const rowAvg = rowVals.reduce((s, x) => s + x, 0) / rowVals.length;
      const entAvg = entityVals.reduce((s, x) => s + x, 0) / entityVals.length;
      if (entAvg === 0) continue;
      const bias = (rowAvg / entAvg - 1) * 100;
      if (Math.abs(bias) >= 5) {
        add("weighting_bias", Math.min(1, Math.abs(bias) / 50),
          `Averaging "${m}" across rows gives ${fmt(rowAvg)}; per-"${dupIdCol}" it is ${fmt(entAvg)} — a ${bias > 0 ? "+" : ""}${pct(bias)} bias.`,
          `the two would match if 1 row = 1 entity`,
          `"${m}" repeats on every row of an entity, so heavy entities get over-counted. Average per "${dupIdCol}".`,
          `row_avg=${rowAvg.toFixed(2)} entity_avg=${entAvg.toFixed(2)}`);
        break; // the pattern once, not a listing
      }
    }
  }

  // ---- 3. structural missingness: blanks follow a segment (best gap wins) ----
  for (const m of columns) {
    if (!cs[m] || cs[m].missingRate < 0.15) continue;
    let best = null;
    for (const c of categoryCols) {
      if (c === m) continue;
      const seg = new Map();
      for (const r of rows) {
        const k = val(r, c) || "(blank)";
        let g = seg.get(k); if (!g) seg.set(k, (g = { n: 0, miss: 0 }));
        g.n++; if (!val(r, m)) g.miss++;
      }
      const big = [...seg.entries()].filter(([, g]) => g.n >= Math.max(10, n * 0.05));
      if (big.length < 2) continue;
      const rates = big.map(([k, g]) => ({ k, rate: g.miss / g.n })).sort((a, b) => b.rate - a.rate);
      const gap = rates[0].rate - rates[rates.length - 1].rate;
      if (gap >= 0.25 && (!best || gap > best.gap)) best = { c, hi: rates[0], lo: rates[rates.length - 1], gap };
    }
    if (best) add("structural_missing", cs[m].missingRate,
      `"${m}" is ${pct(cs[m].missingRate * 100)} blank overall — but ${pct(best.hi.rate * 100)} blank when ${best.c}="${best.hi.k}" vs ${pct(best.lo.rate * 100)} when ${best.c}="${best.lo.k}".`,
      `random missingness would be flat across segments`,
      `The blanks follow "${best.c}" — that's structure, not noise. Segment before reporting, and don't impute blindly.`,
      `gap=${pct(best.gap * 100)}`);
  }

  // ---- 4 & 5. concentration + segment gap on metric × category ----
  for (const m of metricCols) {
    const rowVals = rows.map((r) => val(r, m)).filter(isNum).map(Number);
    const total = rowVals.reduce((s, x) => s + x, 0);
    if (total <= 0) continue;
    const overall = total / rowVals.length;
    for (const c of categoryCols) {
      const seg = new Map();
      let counted = 0;
      for (const r of rows) {
        const k = val(r, c); const t = val(r, m);
        if (!k || !isNum(t)) continue;
        let g = seg.get(k); if (!g) seg.set(k, (g = { n: 0, sum: 0 }));
        g.n++; g.sum += Number(t); counted++;
      }
      if (seg.size < 3 || !counted) continue;
      const entries = [...seg.entries()].sort((a, b) => b[1].sum - a[1].sum);
      const top = entries[0][1];
      const topShare = top.sum / total, topRowShare = top.n / counted;
      // guard: "93% of the total in the segment with 93% of the rows" is not an insight
      if (topShare >= 0.4 && topRowShare > 0 && topShare >= 2 * topRowShare) {
        add("concentration", topShare,
          `${pct(topShare * 100)} of all "${m}" sits in ${c}="${entries[0][0]}" — from only ${pct(topRowShare * 100)} of the rows.`,
          `its fair share by row count would be ${pct(topRowShare * 100)}`,
          `One segment moves your whole total — report "${entries[0][0]}" separately or every aggregate is really about it.`,
          `value_share=${pct(topShare * 100)} row_share=${pct(topRowShare * 100)}`);
      }
      const bigSeg = entries.map(([k, g]) => ({ k, mean: g.sum / g.n, n: g.n }))
        .filter((s) => s.n >= Math.max(5, n * 0.05));
      if (bigSeg.length >= 2 && overall !== 0) {
        const far = bigSeg.map((s) => ({ ...s, dev: (s.mean / overall - 1) * 100 }))
          .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))[0];
        if (Math.abs(far.dev) >= 30) {
          add("segment_gap", Math.min(1, Math.abs(far.dev) / 100) * (far.n / n),
            `Average "${m}" for ${c}="${far.k}" is ${fmt(far.mean)} — ${far.dev > 0 ? "+" : ""}${pct(far.dev)} vs the overall ${fmt(overall)} (${far.n} rows).`,
            `overall average ${fmt(overall)}`,
            `The overall average hides this segment. Any decision based on the mean treats "${far.k}" wrongly.`,
            `dev=${pct(far.dev)} n=${far.n}`);
        }
      }
    }
  }

  // ---- 6. outliers: a few values dominate ----
  for (const m of metricCols) {
    const xs = rows.map((r) => val(r, m)).filter(isNum).map(Number).sort((a, b) => a - b);
    if (xs.length < 10) continue;
    const med = xs[Math.floor(xs.length / 2)];
    const max = xs[xs.length - 1];
    if (med > 0 && max >= 6 * med) {
      const k = xs.filter((x) => x >= 3 * med).length;
      const share = xs.slice(-k).reduce((s, x) => s + x, 0) / xs.reduce((s, x) => s + x, 0);
      add("outliers", share,
        `The largest "${m}" is ${fmt(max)} — ${fmt(max / med)}× the median ${fmt(med)}; ${k} value${k > 1 ? "s" : ""} ≥3× median carry ${pct(share * 100)} of the column's total.`,
        `median ${fmt(med)}`,
        `Sums and averages of "${m}" are driven by a handful of rows — check they're real before trusting any total.`,
        `max=${fmt(max)} median=${fmt(med)}`);
    }
  }

  // per-shape cap 2, then global cap 6, ranked by materiality
  const byShape = new Map();
  const pruned = [];
  for (const i of found.sort((a, b) => b.materiality - a.materiality)) {
    const k = byShape.get(i.shape) || 0;
    if (k >= 2) continue;
    byShape.set(i.shape, k + 1);
    pruned.push(i);
  }
  return pruned.slice(0, 6);
}
