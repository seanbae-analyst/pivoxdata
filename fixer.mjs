// fixer.mjs — DataReady v1.1: deterministic remediation layer.
// Philosophy (TRUST.md): fix ONLY what is mechanically unambiguous, log every change
// as a fact, and refuse to guess. Imputing missing values, coercing "thirty"→30, or
// deciding PII policy are JUDGMENTS — they are reported as `skipped`, never silently
// applied. The cleaned data is re-scorable by the same scorer: the before→after delta
// is itself a verifiable claim.
import {
  scoreDataset, SENTINELS, PLACEHOLDER_DATE, PII_PATTERNS, dateShape, looksLikePhone,
  variantKey,
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

// ISO → MM/DD/YYYY (for users whose downstream tooling expects US format —
// the target format is the USER's judgment, passed in as opts.dateTarget)
const isoToUS = (iso) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };

const maskEmail = (t) => t[0] + "***@" + t.split("@")[1];
const maskDigits = (t) => "***-" + (t.match(/\d/g) || []).slice(-4).join("");

// opts — every knob is a JUDGMENT the caller (the user, via the UI) supplies;
// defaults are the recommended conservative set. The tool never guesses policy.
//   dedupe            remove exact duplicate rows            (default true)
//   dateTarget        "ISO" | "US" — which format to unify mixed dates to (default "ISO")
//   clearPlaceholders 1900-01-01 / 0000-00-00 → empty        (default true)
//   clearSentinels    N/A, NULL, -, … → empty                (default true)
//   dropEmptyCols     drop 100%-empty columns                (default true)
//   maskPII           mask email/phone/ssn values            (default false — governance)
//   unify             { [column]: { [variantKey]: "canonical spelling" } } — the user's
//                     chosen winner per spelling cluster; clusters without a choice are
//                     left untouched (default {} — never unify without being told)
//   trim              trim stray whitespace around values    (default true)
//   dropEmptyRows     remove rows where every field is empty (default true)
//   headerStyle       "keep" | "snake" | "lower" — rename column headers
//   caseNormalize     { [column]: "upper"|"lower"|"title" } — user-chosen casing per column
//   piiMode           "keep" | "mask" | "drop" — supersedes legacy maskPII boolean
export function fixDataset(rows, columns, opts = {}) {
  const {
    maskPII = false,
    dedupe = true,
    dateTarget = "ISO",
    clearPlaceholders = true,
    clearSentinels = true,
    dropEmptyCols = true,
    unify = {},
    trim = true,
    dropEmptyRows = true,
    headerStyle = "keep",
    caseNormalize = {},
  } = opts;
  const piiMode = opts.piiMode ?? (maskPII ? "mask" : "keep");
  const numish = (t) => t !== "" && !isNaN(Number(t));
  const toTitle = (s) => s.split(/\s+/).map((w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
  let cols = (columns && columns.length ? columns : Object.keys(rows[0] || {})).slice();
  let out = rows.map((r) => ({ ...r }));
  const fixes = [];
  const skipped = [];
  const before = scoreDataset(rows, cols);

  // 0. trim stray whitespace (pure normalization, user-toggleable)
  if (trim) {
    let trimmed = 0;
    for (const r of out) for (const c of cols) {
      const v = r[c];
      if (typeof v === "string") { const t = v.trim(); if (t !== v) { r[c] = t; trimmed++; } }
    }
    if (trimmed) fixes.push({ code: "trim", column: "(all)", count: trimmed,
      message: `Trimmed stray whitespace on ${trimmed} value${trimmed > 1 ? "s" : ""}.` });
  }

  // 1. issue-driven fixes — keyed off the exact same detection the score came from
  for (const iss of before.issues) {
    const col = iss.column;
    if (iss.code === "sentinel") {
      if (!clearSentinels) { skipped.push({ code: "sentinel", column: col, reason: `Sentinel tokens in "${col}" kept — per your choice.` }); continue; }
      let n = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim().toLowerCase();
        if (t && SENTINELS.has(t)) { r[col] = ""; n++; }
      }
      fixes.push({ code: "sentinel", column: col, count: n,
        message: `Converted ${n} sentinel token${n > 1 ? "s" : ""} (N/A, NULL, …) in "${col}" to real empty cells.` });
    } else if (iss.code === "placeholder_date") {
      if (!clearPlaceholders) { skipped.push({ code: "placeholder_date", column: col, reason: `Placeholder dates in "${col}" kept — per your choice.` }); continue; }
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
        if (!iso) continue;
        const target = dateTarget === "US" ? isoToUS(iso) : iso;
        if (target !== t) { r[col] = target; n++; }
      }
      fixes.push({ code: "date_normalize", column: col, count: n,
        message: dateTarget === "US"
          ? `Normalized ${n} date${n > 1 ? "s" : ""} in "${col}" to US format (MM/DD/YYYY) — your choice.`
          : `Normalized ${n} date${n > 1 ? "s" : ""} in "${col}" to ISO 8601 (YYYY-MM-DD).` });
    } else if (iss.code === "empty_column") {
      if (!dropEmptyCols) { skipped.push({ code: "empty_column", column: col, reason: `Empty column "${col}" kept — per your choice.` }); continue; }
      cols = cols.filter((c) => c !== col);
      fixes.push({ code: "drop_empty_column", column: col, count: 1,
        message: `Dropped "${col}" — 100% empty, carries no information.` });
    } else if (iss.code === "pii") {
      if (piiMode === "drop") {
        cols = cols.filter((c) => c !== col);
        fixes.push({ code: "pii_drop", column: col, count: 1,
          message: `Dropped PII column "${col}" entirely — your choice.` });
      } else if (piiMode === "mask") {
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
    } else if (iss.code === "value_variants") {
      const choices = unify[col];
      if (!choices || Object.keys(choices).length === 0) {
        skipped.push({ code: "value_variants", column: col,
          reason: `Multiple spellings in "${col}" left as-is — pick a canonical form to unify them.` });
        continue;
      }
      let n = 0;
      for (const r of out) {
        const raw = String(r[col] ?? "").trim();
        if (!raw) continue;
        const canon = choices[variantKey(raw)];
        if (canon != null && canon !== "" && raw !== canon) { r[col] = canon; n++; }
      }
      const picked = [...new Set(Object.values(choices).filter(Boolean))];
      fixes.push({ code: "unify", column: col, count: n,
        message: `Unified ${n} value${n === 1 ? "" : "s"} in "${col}" to your chosen spelling${picked.length > 1 ? "s" : ""} (${picked.slice(0, 3).map((p) => `"${p}"`).join(", ")}${picked.length > 3 ? ", …" : ""}).` });
    } else if (iss.code === "missing" || iss.code === "high_missing") {
      skipped.push({ code: iss.code, column: col,
        reason: `Missing values in "${col}" left blank — imputation is a judgment, not a fact.` });
    } else if (iss.code === "numeric_text_mix") {
      skipped.push({ code: iss.code, column: col,
        reason: `"${col}" mixes numbers and words — coercing "thirty" → 30 needs interpretation, left as-is.` });
    } else if (iss.code === "dup_id") {
      skipped.push({ code: "dup_id", column: col,
        reason: `Duplicate IDs in "${col}": exact duplicate copies are removed by dedupe — if duplicates remain, the rows differ and deciding which record is the truth is your call.` });
    }
    // dup_rows handled below, AFTER normalization (normalizing can reveal more exact dups)
  }

  // 2. dedupe exact duplicate rows on the surviving columns
  if (dedupe) {
    const seen = new Set();
    const deduped = [];
    for (const r of out) {
      const k = cols.map((c) => r[c]).join("\u0001"); // unit-separator: no collision like join("")
      if (!seen.has(k)) { seen.add(k); deduped.push(r); }
    }
    const removed = out.length - deduped.length;
    if (removed > 0) fixes.push({ code: "dedupe", column: "(rows)", count: removed,
      message: `Removed ${removed} exact duplicate row${removed > 1 ? "s" : ""}.` });
    out = deduped;
  } else if (before.issues.some((i) => i.code === "dup_rows")) {
    skipped.push({ code: "dup_rows", column: "(rows)", reason: "Duplicate rows kept — per your choice." });
  }

  // 3. user-chosen casing normalization per column (never applied unasked)
  for (const [col, style] of Object.entries(caseNormalize)) {
    if (!cols.includes(col) || !style || style === "keep") continue;
    let n = 0;
    for (const r of out) {
      const raw = String(r[col] ?? "").trim();
      if (!raw || numish(raw) || SENTINELS.has(raw.toLowerCase())) continue;
      const t = style === "upper" ? raw.toUpperCase() : style === "lower" ? raw.toLowerCase() : toTitle(raw);
      if (t !== raw) { r[col] = t; n++; }
    }
    if (n) fixes.push({ code: "casing", column: col, count: n,
      message: `Normalized casing of ${n} value${n > 1 ? "s" : ""} in "${col}" to ${style === "upper" ? "UPPERCASE" : style === "lower" ? "lowercase" : "Title Case"} — your choice.` });
  }

  // 4. drop rows where every remaining field is empty
  if (dropEmptyRows) {
    const beforeN = out.length;
    out = out.filter((r) => cols.some((c) => String(r[c] ?? "").trim() !== ""));
    const removedE = beforeN - out.length;
    if (removedE > 0) fixes.push({ code: "empty_rows", column: "(rows)", count: removedE,
      message: `Removed ${removedE} completely empty row${removedE > 1 ? "s" : ""}.` });
  }

  // 5. header rename — the naming convention is the user's judgment
  if (headerStyle !== "keep") {
    const used = new Set(); const map = {};
    for (const c of cols) {
      let name = headerStyle === "snake"
        ? String(c).normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "")
        : String(c).trim().toLowerCase();
      if (!name) name = "column";
      let base = name, i = 2;
      while (used.has(name)) name = `${base}_${i++}`;
      used.add(name); map[c] = name;
    }
    const renamed = cols.filter((c) => map[c] !== c);
    if (renamed.length) {
      out = out.map((r) => { const nr = {}; for (const c of cols) nr[map[c]] = r[c]; return nr; });
      cols = cols.map((c) => map[c]);
      fixes.push({ code: "headers", column: "(headers)", count: renamed.length,
        message: `Renamed ${renamed.length} header${renamed.length > 1 ? "s" : ""} to ${headerStyle === "snake" ? "snake_case" : "lowercase"} (e.g. "${renamed[0]}" → "${map[renamed[0]]}") — your choice.` });
    }
  }

  return { rows: out, columns: cols, fixes, skipped, before };
}
