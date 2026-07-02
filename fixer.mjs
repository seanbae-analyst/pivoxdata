// fixer.mjs — DataReady v1.1: deterministic remediation layer.
// Philosophy (TRUST.md): fix ONLY what is mechanically unambiguous, log every change
// as a fact, and refuse to guess. Imputing missing values, coercing "thirty"→30, or
// deciding PII policy are JUDGMENTS — they are reported as `skipped`, never silently
// applied. The cleaned data is re-scorable by the same scorer: the before→after delta
// is itself a verifiable claim.
import {
  scoreDataset, SENTINELS, PLACEHOLDER_DATE, PII_PATTERNS, dateShape, looksLikePhone,
} from "./scorer.mjs";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// normalize a recognized date shape to ISO 8601; null = shape not recognized (leave alone)
function toISO(t) {
  const s = dateShape(t);
  if (s === "ISO") return t.slice(0, 10);
  if (s === "US-slash") {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (s === "long") {
    const m = t.match(/^([A-Za-z]+) (\d{1,2}),? (\d{4})/);
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
  }
  return null;
}

const maskEmail = (t) => t[0] + "***@" + t.split("@")[1];
const maskDigits = (t) => "***-" + (t.match(/\d/g) || []).slice(-4).join("");

export function fixDataset(rows, columns, opts = {}) {
  const { maskPII = false } = opts;
  let cols = (columns && columns.length ? columns : Object.keys(rows[0] || {})).slice();
  let out = rows.map((r) => ({ ...r }));
  const fixes = [];
  const skipped = [];
  const before = scoreDataset(rows, cols);

  // 0. trim stray whitespace (pure normalization, not tied to an issue)
  let trimmed = 0;
  for (const r of out) for (const c of cols) {
    const v = r[c];
    if (typeof v === "string") { const t = v.trim(); if (t !== v) { r[c] = t; trimmed++; } }
  }
  if (trimmed) fixes.push({ code: "trim", column: "(all)", count: trimmed,
    message: `Trimmed stray whitespace on ${trimmed} value${trimmed > 1 ? "s" : ""}.` });

  // 1. issue-driven fixes — keyed off the exact same detection the score came from
  for (const iss of before.issues) {
    const col = iss.column;
    if (iss.code === "sentinel") {
      let n = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim().toLowerCase();
        if (t && SENTINELS.has(t)) { r[col] = ""; n++; }
      }
      fixes.push({ code: "sentinel", column: col, count: n,
        message: `Converted ${n} sentinel token${n > 1 ? "s" : ""} (N/A, NULL, …) in "${col}" to real empty cells.` });
    } else if (iss.code === "placeholder_date") {
      let n = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim();
        if (PLACEHOLDER_DATE.test(t)) { r[col] = ""; n++; }
      }
      fixes.push({ code: "placeholder_date", column: col, count: n,
        message: `Cleared ${n} placeholder date${n > 1 ? "s" : ""} (1900-01-01 / 0000-00-00) in "${col}" — they are missing data, not dates.` });
    } else if (iss.code === "mixed_date_format") {
      let n = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim();
        if (!t) continue;
        const iso = toISO(t);
        if (iso && iso !== t) { r[col] = iso; n++; }
      }
      fixes.push({ code: "date_normalize", column: col, count: n,
        message: `Normalized ${n} date${n > 1 ? "s" : ""} in "${col}" to ISO 8601 (YYYY-MM-DD).` });
    } else if (iss.code === "empty_column") {
      cols = cols.filter((c) => c !== col);
      fixes.push({ code: "drop_empty_column", column: col, count: 1,
        message: `Dropped "${col}" — 100% empty, carries no information.` });
    } else if (iss.code === "pii") {
      if (maskPII) {
        const type = (iss.evidence || "").split("=")[0];
        let n = 0;
        for (const r of out) {
          const t = String(r[col] ?? "").trim();
          if (!t) continue;
          if (type === "email" && PII_PATTERNS.email.test(t)) { r[col] = maskEmail(t); n++; }
          else if (type === "ssn" && PII_PATTERNS.ssn.test(t)) { r[col] = maskDigits(t); n++; }
          else if (type === "phone" && looksLikePhone(t) && !dateShape(t)) { r[col] = maskDigits(t); n++; }
        }
        fixes.push({ code: "pii_mask", column: col, count: n,
          message: `Masked ${n} ${type} value${n > 1 ? "s" : ""} in "${col}".` });
      } else {
        skipped.push({ code: "pii", column: col,
          reason: `PII in "${col}" left as-is — masking or dropping is a governance decision, not a mechanical fix.` });
      }
    } else if (iss.code === "missing" || iss.code === "high_missing") {
      skipped.push({ code: iss.code, column: col,
        reason: `Missing values in "${col}" left blank — imputation is a judgment, not a fact.` });
    } else if (iss.code === "numeric_text_mix") {
      skipped.push({ code: iss.code, column: col,
        reason: `"${col}" mixes numbers and words — coercing "thirty" → 30 needs interpretation, left as-is.` });
    }
    // dup_rows handled below, AFTER normalization (normalizing can reveal more exact dups)
  }

  // 2. dedupe exact duplicate rows on the surviving columns
  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const k = cols.map((c) => r[c]).join("");
    if (!seen.has(k)) { seen.add(k); deduped.push(r); }
  }
  const removed = out.length - deduped.length;
  if (removed > 0) fixes.push({ code: "dedupe", column: "(rows)", count: removed,
    message: `Removed ${removed} exact duplicate row${removed > 1 ? "s" : ""}.` });
  out = deduped;

  return { rows: out, columns: cols, fixes, skipped, before };
}
