// analyzer.mjs — DataReady's "so what" layer.
//
// The score says HOW dirty a file is; this module shows WHAT THAT DOES to analysis.
// It picks the analytical questions any analyst (or AI) would ask of this schema —
// totals, date ranges, group counts, exposure — and answers them with plain
// deterministic code on BOTH versions of the data. The diff between the two columns
// IS the consequence of the defects: no AI, no opinion, every number recomputable.
// (The generalized, every-file version of experiment/SO_WHAT.md.)
import { EMPTY, PII_PATTERNS, looksLikePhone, looksLikeIdColumn, dateShape } from "./scorer.mjs";
import { toISO } from "./fixer.mjs";

const normName = (s) => String(s).normalize("NFKC").trim().toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
const fmt = (x) => Number.isFinite(x) ? x.toLocaleString("en-US") : String(x);

// resolve the dirty column's counterpart in the cleaned dataset (headers may have been
// renamed to snake_case/lowercase; empty/PII columns may have been dropped entirely)
function counterpart(col, cleanCols) {
  if (cleanCols.includes(col)) return col;
  const want = normName(col);
  return cleanCols.find((c) => normName(c) === want) ?? null;
}

const vals = (rows, col) => rows.map((r) => r[col]).filter((v) => !EMPTY(v)).map((v) => String(v).trim());
const isNumeric = (t) => t !== "" && !isNaN(Number(t));

function sumOf(rows, col) {
  let sum = 0, excluded = 0;
  for (const t of vals(rows, col)) { if (isNumeric(t)) sum += Number(t); else excluded++; }
  return { sum, excluded };
}
function dateRange(rows, col) {
  const isos = vals(rows, col).map((t) => dateShape(t) ? toISO(t) : null).filter(Boolean).sort();
  return isos.length ? { min: isos[0], max: isos[isos.length - 1] } : null;
}
function groups(rows, col) {
  const m = new Map();
  for (const t of vals(rows, col)) m.set(t, (m.get(t) || 0) + 1); // EXACT strings on purpose —
  return m;                                                       // that's how group-bys see them
}
function piiExposed(rows, col, type) {
  const test = type === "phone" ? looksLikePhone : PII_PATTERNS[type];
  const match = test instanceof RegExp ? (t) => test.test(t) : test;
  // masked values (d***@x.com, ***-1234) are no longer raw PII — don't count them
  return vals(rows, col).filter((t) => !t.includes("***") && match(t) && !(type === "phone" && dateShape(t))).length;
}

// dirty: { rows, columns, stats }  — stats = scoreDataset(rows, columns) of the DIRTY data
// clean: { rows, columns }
// returns [{ label, dirty, clean, differs, note? }]
export function analyzeBeforeAfter(dirty, clean) {
  const out = [];
  const push = (label, d, c, note) =>
    out.push({ label, dirty: String(d), clean: String(c), differs: String(d) !== String(c), ...(note ? { note } : {}) });

  push("Rows the analysis runs on", fmt(dirty.rows.length), fmt(clean.rows.length));

  for (const col of dirty.columns) {
    const s = dirty.stats.columnStats?.[col];
    if (!s || s.present === 0) continue;
    const cc = counterpart(col, clean.columns);
    const gone = (v) => cc === null ? "— (column removed)" : v;

    if (s.piiType) {
      const d = piiExposed(dirty.rows, col, s.piiType);
      const c = cc ? piiExposed(clean.rows, cc, s.piiType) : 0;
      push(`Raw ${s.piiType} values in "${col}" an AI would receive`, fmt(d), cc ? fmt(c) : "0 (column removed)");
      continue; // a PII column is not also summed/grouped
    }
    const numFrac = s.numericCount / s.present;
    if (numFrac >= 0.5 && !looksLikeIdColumn(col)) {
      const d = sumOf(dirty.rows, col);
      const c = cc ? sumOf(clean.rows, cc) : null;
      push(`Total of "${col}"`, fmt(d.sum), gone(c ? fmt(c.sum) : ""),
        d.excluded ? `${d.excluded} non-numeric value${d.excluded > 1 ? "s" : ""} silently excluded from the dirty sum` : undefined);
      continue;
    }
    if (Object.keys(s.dateShapes).length > 0) {
      const d = dateRange(dirty.rows, col), c = cc ? dateRange(clean.rows, cc) : null;
      if (d) {
        push(`Earliest "${col}"`, d.min, gone(c?.min ?? "—"));
        push(`Latest "${col}"`, d.max, gone(c?.max ?? "—"));
      }
      continue;
    }
    // categorical: what a group-by sees
    const dg = groups(dirty.rows, col);
    if (dg.size >= 2 && dg.size <= 20 && !looksLikeIdColumn(col)) {
      const cg = cc ? groups(clean.rows, cc) : null;
      const top = (m) => { const e = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; return `${e[0]} (${fmt(e[1])})`; };
      push(`Distinct groups a group-by sees in "${col}"`, fmt(dg.size), gone(cg ? fmt(cg.size) : ""));
      if (cg && cg.size) push(`Most common "${col}"`, top(dg), top(cg));
    }
  }
  return out.slice(0, 14); // sanity cap for very wide files
}
