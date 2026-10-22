// fixer.mjs — DataReady v1.1: deterministic remediation layer.
// Philosophy (TRUST.md): fix ONLY what is mechanically unambiguous, log every change
// as a fact, and refuse to guess. Imputing missing values, coercing "thirty"→30, or
// deciding PII policy are JUDGMENTS — they are reported as `skipped`, never silently
// applied. The cleaned data is re-scorable by the same scorer: the before→after delta
// is itself a verifiable claim.
import {
  scoreDataset, PLACEHOLDER_DATE, dateShape, matchesPII, isValidYMD, KR_DATE_SHAPES,
  isSentinelToken, makeSentinelTest, variantKey,
} from "./scorer.mjs";
import { L, piiName } from "./lang.mjs";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// normalize a recognized date shape to ISO 8601; null = shape not recognized, or not safely
// convertible (leave alone). (exported: analyzer.mjs uses the same parse so both sides of the
// diff agree on dates)
//   • year-first Korean forms (2026.10.22 · 2026. 10. 22. · 2026년 10월 22일 · 2026/10/22) are
//     unambiguous → converted, but only when they are a real calendar date
//   • "26-10-22" (YY-MM-DD) → null: the century, and whether it is y-m-d at all, is a judgment
//   • a US-slash value that is not a real m/d date (13/05/2021 is d/m) → null, never "2021-13-05"
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export function toISO(t) {
  const s = dateShape(t);
  if (s === "ISO") return t.slice(0, 10);
  if (s === "US-slash") {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return isValidYMD(+m[3], +m[1], +m[2]) ? iso(m[3], m[1], m[2]) : null;
  }
  if (s === "long") {
    const m = t.match(/^([A-Za-z]+) (\d{1,2}),? (\d{4})/);
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? iso(m[3], mo, m[2]) : null;
  }
  const kr = KR_DATE_SHAPES.find(([name]) => name === s);
  if (kr) {
    const m = kr[1].exec(t);
    return isValidYMD(+m[1], +m[2], +m[3]) ? iso(m[1], m[2], m[3]) : null;
  }
  return null;
}

// ISO → MM/DD/YYYY (for users whose downstream tooling expects US format —
// the target format is the USER's judgment, passed in as opts.dateTarget)
const isoToUS = (iso) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };

const maskEmail = (t) => t[0] + "***@" + t.split("@")[1];
const maskDigits = (t) => "***-" + (t.match(/\d/g) || []).slice(-4).join("");
// 주민등록번호: nothing kept — the front half is a birth date, the 7th digit sex/nationality
const maskAll = () => "******-*******";
const MASKERS = { email: maskEmail, ssn: maskDigits, phone: maskDigits, bank_account: maskDigits, kr_rrn: maskAll };

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
      message: L(`Trimmed stray whitespace on ${trimmed} value${trimmed > 1 ? "s" : ""}.`, `값 ${trimmed}개의 앞뒤 공백을 지웠습니다.`) });
  }

  // 1. issue-driven fixes — keyed off the exact same detection the score came from
  for (const iss of before.issues) {
    const col = iss.column;
    if (iss.code === "sentinel") {
      if (!clearSentinels) { skipped.push({ code: "sentinel", column: col, reason: L(`Sentinel tokens in "${col}" kept — per your choice.`, `"${col}" 열의 빈칸 표시(N/A 등)는 고른 대로 그대로 두었습니다.`) }); continue; }
      let n = 0;
      // the scorer's own column-aware test (없음 stays when the column also answers 있음)
      const isSentinel = makeSentinelTest(out.map((r) => r[col]));
      for (const r of out) {
        const t = String(r[col] ?? "").trim();
        if (t && isSentinel(t)) { r[col] = ""; n++; }
      }
      fixes.push({ code: "sentinel", column: col, count: n,
        message: L(`Converted ${n} sentinel token${n > 1 ? "s" : ""} (N/A, NULL, 미상, …) in "${col}" to real empty cells.`, `"${col}" 열의 빈칸 표시(N/A, NULL, 미상 등) ${n}개를 진짜 빈칸으로 바꿨습니다.`) });
    } else if (iss.code === "placeholder_date") {
      if (!clearPlaceholders) { skipped.push({ code: "placeholder_date", column: col, reason: L(`Placeholder dates in "${col}" kept — per your choice.`, `"${col}" 열의 자리만 채운 날짜는 고른 대로 그대로 두었습니다.`) }); continue; }
      let n = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim();
        if (PLACEHOLDER_DATE.test(t)) { r[col] = ""; n++; }
      }
      fixes.push({ code: "placeholder_date", column: col, count: n,
        message: L(`Cleared ${n} placeholder date${n > 1 ? "s" : ""} (1900-01-01 / 0000-00-00) in "${col}" — they are missing data, not dates.`, `"${col}" 열의 자리만 채운 날짜(1900-01-01 / 0000-00-00) ${n}개를 비웠습니다 — 날짜가 아니라 빠진 값입니다.`) });
    } else if (iss.code === "mixed_date_format") {
      let n = 0, left = 0;
      for (const r of out) {
        const t = String(r[col] ?? "").trim();
        if (!t) continue;
        const isoDate = toISO(t);
        if (!isoDate) { if (dateShape(t)) left++; continue; }
        const target = dateTarget === "US" ? isoToUS(isoDate) : isoDate;
        if (target !== t) { r[col] = target; n++; }
      }
      if (left) skipped.push({ code: "date_ambiguous", column: col,
        reason: L(`${left} date${left > 1 ? "s" : ""} in "${col}" left as written — a two-digit year (26-10-22) or a date that is not on the calendar can't be converted without guessing.`,
          `"${col}" 열의 날짜 ${left}개는 적힌 그대로 두었습니다 — 두 자리 연도(26-10-22)나 달력에 없는 날짜는 추측 없이 바꿀 수 없습니다.`) });
      fixes.push({ code: "date_normalize", column: col, count: n,
        message: dateTarget === "US"
          ? L(`Normalized ${n} date${n > 1 ? "s" : ""} in "${col}" to US format (MM/DD/YYYY) — your choice.`, `"${col}" 열의 날짜 ${n}개를 고른 대로 미국식(MM/DD/YYYY)으로 맞췄습니다.`)
          : L(`Normalized ${n} date${n > 1 ? "s" : ""} in "${col}" to ISO 8601 (YYYY-MM-DD).`, `"${col}" 열의 날짜 ${n}개를 ISO 8601(YYYY-MM-DD)로 맞췄습니다.`) });
    } else if (iss.code === "empty_column") {
      if (!dropEmptyCols) { skipped.push({ code: "empty_column", column: col, reason: L(`Empty column "${col}" kept — per your choice.`, `"${col}" 열은 비어 있지만 고른 대로 그대로 두었습니다.`) }); continue; }
      cols = cols.filter((c) => c !== col);
      fixes.push({ code: "drop_empty_column", column: col, count: 1,
        message: L(`Dropped "${col}" — 100% empty, carries no information.`, `"${col}" 열을 지웠습니다 — 전부 비어 있어 담긴 정보가 없습니다.`) });
    } else if (iss.code === "pii") {
      if (piiMode === "drop") {
        cols = cols.filter((c) => c !== col);
        fixes.push({ code: "pii_drop", column: col, count: 1,
          message: L(`Dropped PII column "${col}" entirely — your choice.`, `개인정보가 든 "${col}" 열을 고른 대로 통째로 지웠습니다.`) });
      } else if (piiMode === "mask") {
        const type = (iss.evidence || "").split("=")[0];
        let n = 0;
        for (const r of out) {
          const t = String(r[col] ?? "").trim();
          if (!t || !MASKERS[type] || !matchesPII(type, t)) continue;
          r[col] = MASKERS[type](t); n++;
        }
        fixes.push({ code: "pii_mask", column: col, count: n,
          message: L(`Masked ${n} ${type} value${n > 1 ? "s" : ""} in "${col}".`, `"${col}" 열의 ${piiName(type)} ${n}개를 가렸습니다.`) });
      } else {
        skipped.push({ code: "pii", column: col,
          reason: L(`PII in "${col}" left as-is — masking or dropping is a governance decision, not a mechanical fix.`, `"${col}" 열의 개인정보는 그대로 두었습니다 — 가릴지 지울지는 기계적인 수정이 아니라 관리 방침의 문제입니다.`) });
      }
    } else if (iss.code === "value_variants") {
      const choices = unify[col];
      if (!choices || Object.keys(choices).length === 0) {
        skipped.push({ code: "value_variants", column: col,
          reason: L(`Multiple spellings in "${col}" left as-is — pick a canonical form to unify them.`, `"${col}" 열의 여러 표기는 그대로 두었습니다 — 하나로 맞추려면 기준 표기를 고르세요.`) });
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
        message: L(`Unified ${n} value${n === 1 ? "" : "s"} in "${col}" to your chosen spelling${picked.length > 1 ? "s" : ""} (${picked.slice(0, 3).map((p) => `"${p}"`).join(", ")}${picked.length > 3 ? ", …" : ""}).`,
          `"${col}" 열의 값 ${n}개를 고른 표기로 맞췄습니다 (${picked.slice(0, 3).map((p) => `"${p}"`).join(", ")}${picked.length > 3 ? ", …" : ""}).`) });
    } else if (iss.code === "missing" || iss.code === "high_missing") {
      skipped.push({ code: iss.code, column: col,
        reason: L(`Missing values in "${col}" left blank — imputation is a judgment, not a fact.`, `"${col}" 열의 빈 값은 비워 두었습니다 — 값을 채워 넣는 것은 사실이 아니라 판단입니다.`) });
    } else if (iss.code === "numeric_text_mix") {
      // quote the column's OWN text values — a canned "thirty" under a column of "N/A" or
      // "약 30" explains nothing
      const ex = (before.columnStats[col]?.textSamples || []).slice(0, 2).map((t) => `"${t}"`).join(", ");
      skipped.push({ code: iss.code, column: col,
        reason: L(`"${col}" mixes numbers and text (${ex}) — turning those into numbers needs interpretation, left as-is.`, `"${col}" 열에 숫자와 글자(${ex})가 섞여 있습니다 — 숫자로 바꾸려면 해석이 필요해 그대로 두었습니다.`) });
    } else if (iss.code === "number_with_unit") {
      skipped.push({ code: iss.code, column: col,
        reason: L(`Numbers with units in "${col}" left as-is — what unit the plain numbers are in (원? 만원?) is your call, not a mechanical fix.`, `"${col}" 열의 단위 붙은 숫자는 그대로 두었습니다 — 단위 없는 숫자가 원인지 만원인지는 기계적으로 정할 수 없습니다.`) });
    } else if (iss.code === "unreadable_header" || iss.code === "unreadable_value") {
      skipped.push({ code: iss.code, column: col,
        reason: L(`Unreadable characters (�) can't be repaired here — the original letters are not in the file. Re-export it from the source as UTF-8.`, `읽을 수 없는 글자(�)는 여기서 고칠 수 없습니다 — 원래 글자가 파일에 없습니다. 원본에서 UTF-8로 다시 내려받으세요.`) });
    } else if (iss.code === "dup_id") {
      skipped.push({ code: "dup_id", column: col,
        reason: L(`Duplicate IDs in "${col}": exact duplicate copies are removed by dedupe — if duplicates remain, the rows differ and deciding which record is the truth is your call.`, `"${col}" 열의 중복 ID: 완전히 같은 행은 중복 제거로 지워집니다 — 그래도 남으면 행 내용이 달라서, 어느 기록이 맞는지는 직접 정해야 합니다.`) });
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
      message: L(`Removed ${removed} exact duplicate row${removed > 1 ? "s" : ""}.`, `완전히 같은 행 ${removed}개를 지웠습니다.`) });
    out = deduped;
  } else if (before.issues.some((i) => i.code === "dup_rows")) {
    skipped.push({ code: "dup_rows", column: "(rows)", reason: L("Duplicate rows kept — per your choice.", "중복 행은 고른 대로 그대로 두었습니다.") });
  }

  // 3. user-chosen casing normalization per column (never applied unasked)
  for (const [col, style] of Object.entries(caseNormalize)) {
    if (!cols.includes(col) || !style || style === "keep") continue;
    let n = 0;
    for (const r of out) {
      const raw = String(r[col] ?? "").trim();
      if (!raw || numish(raw) || isSentinelToken(raw)) continue;
      const t = style === "upper" ? raw.toUpperCase() : style === "lower" ? raw.toLowerCase() : toTitle(raw);
      if (t !== raw) { r[col] = t; n++; }
    }
    if (n) fixes.push({ code: "casing", column: col, count: n,
      message: L(`Normalized casing of ${n} value${n > 1 ? "s" : ""} in "${col}" to ${style === "upper" ? "UPPERCASE" : style === "lower" ? "lowercase" : "Title Case"} — your choice.`,
        `"${col}" 열의 값 ${n}개를 고른 대로 ${style === "upper" ? "대문자(UPPERCASE)" : style === "lower" ? "소문자(lowercase)" : "첫 글자만 대문자(Title Case)"}로 맞췄습니다.`) });
  }

  // 4. drop rows where every remaining field is empty
  if (dropEmptyRows) {
    const beforeN = out.length;
    out = out.filter((r) => cols.some((c) => String(r[c] ?? "").trim() !== ""));
    const removedE = beforeN - out.length;
    if (removedE > 0) fixes.push({ code: "empty_rows", column: "(rows)", count: removedE,
      message: L(`Removed ${removedE} completely empty row${removedE > 1 ? "s" : ""}.`, `모든 칸이 빈 행 ${removedE}개를 지웠습니다.`) });
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
        message: L(`Renamed ${renamed.length} header${renamed.length > 1 ? "s" : ""} to ${headerStyle === "snake" ? "snake_case" : "lowercase"} (e.g. "${renamed[0]}" → "${map[renamed[0]]}") — your choice.`,
          `열 이름 ${renamed.length}개를 고른 대로 ${headerStyle === "snake" ? "snake_case" : "소문자"}로 바꿨습니다 (예: "${renamed[0]}" → "${map[renamed[0]]}").`) });
    }
  }

  return { rows: out, columns: cols, fixes, skipped, before };
}
