// scorer.mjs — DataReady v1 deterministic scorer.
// Pure function, no AI, no I/O. Same module runs in the browser and in Node.
// Every issue carries a `type:'fact'` and its raw evidence — scores are judgments
// built on facts (see TRUST.md). Dimension weights are explicit and tunable.

import { L, piiName } from "./lang.mjs";
import { REPLACEMENT } from "./encoding.mjs";

export const EMPTY = (v) => v === null || v === undefined || String(v).trim() === "";

export const PII_PATTERNS = {
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  ssn: /^\d{3}-\d{2}-\d{4}$/,
};

// Phone is NOT a plain regex: a bare run of digits is ambiguous with numeric IDs
// (camis, bbl) and decimal coordinates (latitude/longitude all match a loose
// "lots of digits" pattern). We separate the cases by SHAPE, accepting only what
// a phone number actually looks like — this is what keeps the north-star metric
// (issue precision) honest. See README "PII precision".
//   • a decimal point  -> a coordinate/measure, never a phone   (kills lat/long)
//   • formatted (has +, (), -, space) -> 10–15 digits           (US + international)
//   • bare digit run   -> exactly 10 or 11 digits               (kills camis=8, bin=7)
// Residual: a bare 10-digit municipal id (e.g. NYC `bbl`) is indistinguishable
// from a bare 10-digit phone by shape alone — resolvable only with column-name
// semantics (deferred to the v1.5 Claude layer). Documented, not hidden.
//   • Korean numbers written with dots (010.4567.8901, 02.123.4567): a leading 0, then
//     2–3 / 3–4 / 4 digit groups. A coordinate never starts "0dd." with two more dot groups,
//     so this is the one dotted shape let through before the decimal rule.
//   • 6-7 (주민등록번호) and 3-2-5 (사업자등록번호) groupings are never phone layouts —
//     they used to be reported as "phone" purely on digit count.
export const DOTTED_PHONE = /^0\d{1,2}[.\- ]\d{3,4}[.\- ]\d{4}$/;
const NOT_PHONE_GROUPING = /^(\d{6}-\d{7}|\d{3}-\d{2}-\d{5})$/;
export function looksLikePhone(t) {
  if (DOTTED_PHONE.test(t)) return true;
  if (t.includes(".")) return false;
  if (NOT_PHONE_GROUPING.test(t)) return false;
  const digits = (t.match(/\d/g) || []).length;
  const hasSep = /[\s()+-]/.test(t);
  return hasSep ? digits >= 10 && digits <= 15 : digits === 10 || digits === 11;
}

// a real calendar date (y-m-d), leap years included
export function isValidYMD(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1)) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

// Korean resident registration number (주민등록번호) and foreigner registration number
// (외국인등록번호): YYMMDD + [-] + G + 6 digits. Recognized by SHAPE + VALIDITY, not checksum:
//   • G (7th digit) 1–8: 1/2 · 5/6 = born 1900s, 3/4 · 7/8 = born 2000s (5–8 = foreigners).
//     9/0 (born 1800s) are deliberately excluded — nobody alive, and it widens the bare-digit net.
//   • YYMMDD must be a real calendar date in that century and not in the future.
//   • NO checksum: since October 2020 the digits after G are assigned randomly, so the old
//     check digit would reject genuine new numbers — a silent miss on exactly the data we exist for.
// The bare 13-digit form is only accepted under the same date + G rule; that is what keeps a
// 13-digit order number like 2026102200001 out (YY=20, MM=26 is not a month).
const KR_RRN = /^(\d{2})(\d{2})(\d{2})-?([1-8])\d{6}$/;
export function looksLikeKrRRN(t, today) {
  const m = KR_RRN.exec(t);
  if (!m) return false;
  const g = Number(m[4]);
  const y = (g === 1 || g === 2 || g === 5 || g === 6 ? 1900 : 2000) + Number(m[1]);
  const mo = Number(m[2]), d = Number(m[3]);
  return isValidYMD(y, mo, d) && Date.UTC(y, mo - 1, d) <= (today ? today.getTime() : Date.now());
}

// Korean business registration number (사업자등록번호) ###-##-##### — it HAS a check digit
// (weights 1,3,7,1,3,7,1,3,5 + ⌊9th×5/10⌋), so a match is a fact, not a guess. It identifies a
// business, not a natural person, so it is labelled as an identifier and never scored as PII
// (rationale in README "Personal data"). The bare 10-digit form is only read as a business
// number when the column says so — a bare 10-digit run is otherwise a phone/bbl collision.
const KR_BRN = /^(\d{3})-?(\d{2})-?(\d{5})$/;
export function krBrnChecksumOK(t) {
  const d = (t.match(/\d/g) || []).map(Number);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += d[i] * w[i];
  s += Math.floor((d[8] * 5) / 10);
  return (10 - (s % 10)) % 10 === d[9];
}
export function looksLikeKrBRN(t, { allowBare = false } = {}) {
  if (!KR_BRN.test(t)) return false;
  if (!t.includes("-") && !allowBare) return false;
  if (t.includes("-") && !/^\d{3}-\d{2}-\d{5}$/.test(t)) return false;
  return krBrnChecksumOK(t);
}
export const looksLikeBrnColumn = (name) =>
  /사업자|business\s*_?reg|biz\s*_?reg|(^|[^a-z])brn([^a-z]|$)/i.test(String(name));

// Bank account numbers have no shape of their own (10–16 digits, any grouping), so they are
// only recognized when the COLUMN NAME says account: 계좌, or account/acct next to
// bank/no/num/number. Shape alone would flag every long numeric id.
export function looksLikeAccountColumn(name) {
  const raw = String(name).normalize("NFKC");
  if (/계좌/.test(raw)) return true;
  const tokens = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (["id", "uid", "uuid", "guid", "type", "name", "status", "holder", "owner"].includes(tokens[tokens.length - 1])) return false;
  if (tokens.some((t) => /^(bankaccount|(account|acct)(no|num|number|nbr))$/.test(t))) return true;
  return tokens.some((t) => t === "account" || t === "acct") &&
    tokens.some((t) => ["bank", "no", "num", "number", "nbr", "nr"].includes(t));
}
export function looksLikeAccountNumber(t) {
  if (!/^\d[\d-]*\d$/.test(t) || t.includes("--")) return false;
  const digits = t.replace(/-/g, "").length;
  return digits >= 10 && digits <= 16;
}

// One matcher per PII type, shared by the scorer, the fixer (masking) and the analyzer
// (exposure counts), so all three agree on what "a value of this type" is.
// (Column-name gates — code/법인/account/business — are applied by the scorer when it picks
// a column's type; this is the per-value test once the type is known.)
export function matchesPII(type, t) {
  switch (type) {
    case "email": return PII_PATTERNS.email.test(t);
    case "ssn": return PII_PATTERNS.ssn.test(t);
    case "kr_rrn": return looksLikeKrRRN(t);
    case "bank_account": return looksLikeAccountNumber(t);
    // a date like 2021-03-05 also matches loose phone shapes — dates are never phones
    case "phone": return looksLikePhone(t) && !dateShape(t);
    default: return false;
  }
}

export const PLACEHOLDER_DATE = /^(1900-01-01|01\/01\/1900|0000-00-00)/;
// Blanks dressed as data. Korean: 미상 · 없음 · 해당없음 · 모름 · 무응답 · 알수없음 · 미입력.
// NOT 기타 ("other") — that is a real category. 없음 ("none") is also a real ANSWER when the
// same column holds 있음 ("present"): 주차 있음/없음 is data, so makeSentinelTest() exempts it.
export const SENTINELS = new Set([
  "n/a", "na", "null", "none", "-", "--", "unknown", "tbd", "#n/a",
  "미상", "없음", "해당없음", "해당 없음", "모름", "무응답", "알수없음", "알 수 없음", "미입력",
]);
const sentinelKey = (v) => {
  const k = String(v).trim().toLowerCase();
  return /\s\s|[\t\n]/.test(k) ? k.replace(/\s+/g, " ") : k; // "해당  없음" ≡ "해당 없음"
};
export const isSentinelToken = (v) => SENTINELS.has(sentinelKey(v));
// column-aware sentinel test — the scorer and the fixer both use this, so what is counted is
// exactly what gets cleared
export function makeSentinelTest(values) {
  const answersPresence = values.some((v) => sentinelKey(v ?? "") === "있음");
  return (v) => {
    const k = sentinelKey(v ?? "");
    return SENTINELS.has(k) && !(answersPresence && k === "없음");
  };
}

// numbers written with Korean money/magnitude units ("1,234원", "1.2만원", "3억") —
// readable to a person, but a sum or an average cannot use them as they are
export const KR_UNIT_NUMBER = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:천원|만원|억원|조원|원|천|만|억|조)$/;
const UNIT_TAIL = new Set(["원", "천", "만", "억", "조"]);

const isNumeric = (v) => v !== "" && !isNaN(Number(v));

// normalization key for value-variant clustering: "USA" / " usa" / "U.S.A." → "usa".
// Deterministic surface normalization only — semantic merging ("sb" vs "Sanghyun")
// needs world knowledge and is deferred to the v1.5 Claude layer.
// Punctuation BETWEEN DIGITS is meaningful and survives: Korean 지번 addresses spell
// lot numbers as "642" vs "64-2" — different parcels that must never cluster (found
// dogfooding Seoul commercial data). "테크노-마트"/"테크노마트" still cluster: the
// hyphen there sits between letters, not digits.
export const variantKey = (raw) =>
  raw.toLowerCase().normalize("NFKC")
    .replace(/(?<=\d)[^\p{L}\p{N}\s]+(?=\d)/gu, "-") // digit-punct-digit → canonical "-"
    .replace(/(?<!\d)[^\p{L}\p{N}\s-]+|[^\p{L}\p{N}\s]+(?!\d)|(?<!\d)-/gu, "") // strip the rest
    .replace(/\s+/g, " ").trim();        // collapse whitespace: "ROOSEVELT  AVE" ≡ "Roosevelt Ave"
// Korean year-first forms. Each written form is its own shape — "2026.10.22" and
// "2026. 10. 22." are different strings a parser has to be told about. Month/day must be in
// range for these to count as dates at all (a code like 1234.56.78 is not a date).
// "26-10-22" (two-digit year) is a shape too, but its century — and whether it is y-m-d at
// all — is a judgment, so the fixer never rewrites it (see fixer.mjs toISO).
export const KR_DATE_SHAPES = [
  ["YMD-slash", /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/],           // 2026/10/22 (y/m/d, not US m/d/y)
  ["YMD-dot", /^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/],           // 2026.10.22
  ["YMD-dot-spaced", /^(\d{4})\.\s+(\d{1,2})\.\s+(\d{1,2})\.?$/], // 2026. 10. 22.  (ko-KR locale)
  ["YMD-korean", /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/],     // 2026년 10월 22일
];
const YY_MM_DD = /^\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export function dateShape(v) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "ISO";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) return "US-slash";
  if (/^[A-Za-z]+ \d{1,2},? \d{4}/.test(v)) return "long";
  if (/^\d{4}[./년]/.test(v)) {                      // cheap gate before the four regexes
    for (const [name, re] of KR_DATE_SHAPES) {
      const m = re.exec(v);
      if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? name : null;
    }
    return null;
  }
  if (v.length === 8 && YY_MM_DD.test(v)) return "YY-MM-DD";
  return null;
}

// Keys/uniqueness (PRD dimension 6) — first deterministic slice, folded into Consistency
// until the full 6-dimension expansion. A column is treated as *intending* uniqueness only
// when BOTH hold, which is what keeps precision honest (same shape-over-guess philosophy
// as the phone detector above):
//   • its header's LAST token names an identifier ("deal_id", "dealId", "Deal ID", "uuid")
//     — token-based so "paid"/"valid"/"grid" never match, and
//   • its values are ≥90% unique — so a reference column like customer_id on an orders
//     table (many legitimate repeats) stays silent; only a near-unique key with a few
//     leaked duplicates is flagged.
export function looksLikeIdColumn(name) {
  const tokens = String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  return last === "id" || last === "uid" || last === "uuid" || last === "guid";
}
export const ID_UNIQUENESS_GATE = 0.9;

export function scoreDataset(rows, columns) {
  const n = rows.length;
  const cols = columns && columns.length ? columns : Object.keys(rows[0] || {});
  const issues = [];
  const columnStats = {};

  for (const col of cols) {
    const vals = rows.map((r) => r[col]);
    const nonEmpty = vals.filter((v) => !EMPTY(v));
    const present = nonEmpty.length;
    const missing = n - present;
    const uniqueCount = new Set(nonEmpty.map((v) => String(v))).size;
    const trimmed = nonEmpty.map((v) => String(v).trim());
    const placeholderDateCount = trimmed.filter((t) => PLACEHOLDER_DATE.test(t)).length;
    const isSentinel = makeSentinelTest(trimmed);
    const sentinelHits = trimmed.filter(isSentinel);
    const sentinelCount = sentinelHits.length;
    const sentinelSamples = [...new Set(sentinelHits)].slice(0, 4);
    const numericCount = trimmed.filter(isNumeric).length;
    let unitCount = 0, replacementCount = 0;
    // a few of the column's actual non-numeric values — the evidence a person reads
    // ("thirty", "N/A", "010-1234-5678"), instead of a canned example
    const samples = new Set();
    for (const t of trimmed) {
      if (UNIT_TAIL.has(t[t.length - 1]) && KR_UNIT_NUMBER.test(t)) unitCount++;
      if (t.includes(REPLACEMENT)) replacementCount++;
      if (samples.size < 3 && !isNumeric(t)) samples.add(t);
    }
    const textSamples = [...samples];
    const dateShapes = {};
    for (const t of trimmed) {
      const s = dateShape(t);
      if (s) dateShapes[s] = (dateShapes[s] || 0) + 1;
    }
    const gate = Math.max(3, present * 0.3);
    let piiType = null, piiCount = 0;
    // a column that NAMES itself a code (법정동코드, zipcode, violation_code) is an
    // administrative code, not PII — Korean 10-digit 법정동코드 collides with the bare
    // phone shape exactly like NYC's bbl, but here the header says so; trust it.
    // (found dogfooding Seoul commercial data — same name-gate philosophy as
    // looksLikeIdColumn; '번호' is NOT excluded: 전화번호 really is a phone.)
    const name = String(col).trim();
    const codeNamed = /(코드|code)\s*$/i.test(name);
    // 법인등록번호 (corporate registration no.) shares the RRN's 6-7 layout and often passes
    // its date test (110111-…) — when the header says corporate, it is not a person's number
    const corpNamed = /법인|corp/i.test(name);
    const brnNamed = looksLikeBrnColumn(name);
    const acctNamed = looksLikeAccountColumn(name);
    const detectors = codeNamed ? [] : [
      "email", "ssn",
      ...(corpNamed ? [] : ["kr_rrn"]),
      ...(acctNamed ? ["bank_account"] : []),
      ...(acctNamed || brnNamed ? [] : ["phone"]), // the header names a different number
    ];
    for (const type of detectors) {
      const c = trimmed.filter((t) => matchesPII(type, t)).length;
      if (c > piiCount && c >= gate) { piiCount = c; piiType = type; }
    }
    // non-PII identifiers that used to be mislabelled — reported as what they are, no penalty
    let idKind = null;
    if (!piiType && !codeNamed) {
      const brnCount = trimmed.filter((t) => looksLikeKrBRN(t, { allowBare: brnNamed })).length;
      if (brnCount >= gate) idKind = "kr_brn";
    }
    // value-variant clusters — same normalized key, ≥2 raw spellings ("USA"/"usa"/"U.S.A.").
    // Only for text-ish columns: PII, identifier, date, and mostly-numeric columns are
    // excluded, and sentinel tokens are excluded (they are already their own issue).
    let variantClusters = [];
    const textish = !piiType && !idKind && Object.keys(dateShapes).length === 0 &&
      (present === 0 || numericCount / present <= 0.9);
    if (textish) {
      const groups = new Map();
      for (const v of nonEmpty) {
        const raw = String(v).trim();
        if (isSentinel(raw)) continue;                     // sentinels are their own issue
        if (isNumeric(raw)) continue;                      // "12.5" vs "125" must never merge
        const key = variantKey(raw);
        if (!key) continue;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = new Map()));
        g.set(raw, (g.get(raw) || 0) + 1);
      }
      for (const [key, forms] of groups) {
        if (forms.size >= 2) variantClusters.push({
          key,
          forms: [...forms.entries()].map(([raw, count]) => ({ raw, count }))
            .sort((a, b) => b.count - a.count),
          total: [...forms.values()].reduce((s, x) => s + x, 0),
        });
      }
      variantClusters.sort((a, b) => b.total - a.total);
      variantClusters = variantClusters.slice(0, 5); // cap for sanity on free-text columns
    }

    // duplicate values in a near-unique identifier column (see looksLikeIdColumn above)
    let idDupes = null;
    if (looksLikeIdColumn(col) && present > 0) {
      const counts = new Map();
      for (const v of nonEmpty) { const t = String(v).trim(); counts.set(t, (counts.get(t) || 0) + 1); }
      const dups = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
      if (dups.length && counts.size / present >= ID_UNIQUENESS_GATE) {
        idDupes = { dups, uniqueRatio: counts.size / present };
      }
    }

    // casing profile (stats only, no issue) — powers the "normalize casing?" option in the UI
    let caseCounts = null;
    if (textish) {
      caseCounts = { upper: 0, lower: 0, mixed: 0 };
      for (const v of nonEmpty) {
        const raw = String(v).trim();
        if (!/\p{L}/u.test(raw) || isSentinel(raw) || isNumeric(raw)) continue;
        if (raw === raw.toUpperCase()) caseCounts.upper++;
        else if (raw === raw.toLowerCase()) caseCounts.lower++;
        else caseCounts.mixed++;
      }
    }

    columnStats[col] = { present, missing, missingRate: n ? missing / n : 0, uniqueCount,
      placeholderDateCount, sentinelCount, sentinelSamples, numericCount, unitCount, replacementCount, textSamples,
      dateShapes, piiType, piiCount, idKind, variantClusters, caseCounts, idDupes };
  }

  const add = (dimension, severity, column, code, message, evidence) =>
    issues.push({ dimension, severity, column, code, type: "fact", message, evidence });

  // ---- Completeness ----
  let completenessPenalty = 0;
  for (const col of cols) {
    const s = columnStats[col];
    if (s.missing === n) {
      add("completeness", "high", col, "empty_column", L(`Column "${col}" is entirely empty (${n}/${n} missing).`, `"${col}" 열이 전부 비어 있습니다 (${n}/${n} 빈칸).`), `missing=${n}`);
      completenessPenalty += 12;
    } else if (s.missingRate >= 0.5) {
      add("completeness", "high", col, "high_missing", L(`"${col}" is ${(s.missingRate * 100).toFixed(1)}% missing.`, `"${col}" 열의 ${(s.missingRate * 100).toFixed(1)}%가 비어 있습니다.`), `missing=${s.missing}/${n}`);
      completenessPenalty += 8;
    } else if (s.missingRate >= 0.2) {
      add("completeness", "medium", col, "missing", L(`"${col}" is ${(s.missingRate * 100).toFixed(1)}% missing.`, `"${col}" 열의 ${(s.missingRate * 100).toFixed(1)}%가 비어 있습니다.`), `missing=${s.missing}/${n}`);
      completenessPenalty += 4;
    }
    // Sentinel tokens are orthogonal to the missing-rate buckets above: a
    // column can be both partly missing AND have "N/A"/"NULL"/"-" hiding as
    // data. Previously this sat in the same else-if chain, so any column past
    // the 20% missing threshold never reported sentinels — and the fixer,
    // which keys off the "sentinel" issue, then left them in the cleaned file.
    if (s.missing !== n && s.sentinelCount > 0) {
      const ex = s.sentinelSamples.map((t) => `"${t}"`).join(", ");
      add("completeness", "low", col, "sentinel", L(`"${col}" has ${s.sentinelCount} placeholder tokens (${ex}) hiding as data.`, `"${col}" 열에 값처럼 보이는 빈칸 표시(${ex})가 ${s.sentinelCount}개 있습니다.`), `sentinel=${s.sentinelCount}`);
      completenessPenalty += 2;
    }
  }
  // Unreadable characters (U+FFFD): the text was already lost before it reached us — a file
  // decoded with the wrong encoding somewhere upstream, or bytes that are neither UTF-8 nor
  // CP949 (encoding.mjs). Not a judgment: those characters are gone. File-level, one fact for
  // the header row and one for the cells, so a fully garbled file reads as one problem, not 40.
  const badHeaders = cols.filter((c) => String(c).includes(REPLACEMENT));
  if (badHeaders.length) {
    add("completeness", "high", "(headers)", "unreadable_header",
      L(`${badHeaders.length} column name${badHeaders.length > 1 ? "s contain" : " contains"} unreadable characters (�) — the text was lost to a wrong encoding before it reached this file (e.g. "${badHeaders[0]}").`,
        `열 이름 ${badHeaders.length}개에 읽을 수 없는 글자(�)가 있습니다 — 이 파일이 되기 전에 인코딩이 잘못되어 글자가 사라졌습니다 (예: "${badHeaders[0]}").`),
      `headers_with_U+FFFD=${badHeaders.length}/${cols.length}`);
    completenessPenalty += 8;
  }
  const badCols = cols.filter((c) => columnStats[c].replacementCount > 0);
  if (badCols.length) {
    const cells = badCols.reduce((sum, c) => sum + columnStats[c].replacementCount, 0);
    add("completeness", "high", badCols.length === 1 ? badCols[0] : "(cells)", "unreadable_value",
      L(`${cells} value${cells > 1 ? "s" : ""} in ${badCols.length} column${badCols.length > 1 ? "s" : ""} contain unreadable characters (�) — those characters are gone and cannot be recovered from this file.`,
        `${badCols.length}개 열의 값 ${cells}개에 읽을 수 없는 글자(�)가 있습니다 — 사라진 글자라 이 파일로는 되살릴 수 없습니다.`),
      badCols.slice(0, 5).map((c) => `${c}=${columnStats[c].replacementCount}`).join(" · "));
    completenessPenalty += 8;
  }
  const completenessScore = Math.max(0, 100 - completenessPenalty);

  // ---- Consistency ----
  let consistencyPenalty = 0;
  const seen = new Set();
  let dupRows = 0;
  for (const r of rows) {
    const key = cols.map((c) => r[c]).join("");
    if (seen.has(key)) dupRows++; else seen.add(key);
  }
  if (dupRows > 0) {
    add("consistency", "medium", "(rows)", "dup_rows", L(`${dupRows} exact duplicate rows.`, `완전히 같은 행이 ${dupRows}개 있습니다.`), `duplicates=${dupRows}`);
    consistencyPenalty += Math.min(15, 3 + (dupRows / n) * 100);
  }
  for (const col of cols) {
    const s = columnStats[col];
    if (s.present === 0) continue;
    const numFrac = s.numericCount / s.present;
    // Numbers carrying Korean units ("1,234원", "1.2만원", "3억") in an otherwise numeric column.
    // When units explain every non-numeric value, this is the one fact to report — it replaces
    // the generic numbers-vs-text mix below rather than double-counting the same cells.
    const unitsExplainAll = s.unitCount > 0 && s.numericCount + s.unitCount === s.present;
    if (s.unitCount > 0 && (s.numericCount + s.unitCount) / s.present >= 0.9) {
      const ex = s.textSamples.filter((t) => KR_UNIT_NUMBER.test(t)).map((t) => `"${t}"`).join(", ");
      add("consistency", "medium", col, "number_with_unit",
        L(`"${col}" has ${s.unitCount} number${s.unitCount > 1 ? "s" : ""} written with a unit (${ex}) — they cannot be summed or averaged as they are.`,
          `"${col}" 열의 숫자 ${s.unitCount}개에 단위가 붙어 있어(${ex}) 그대로는 합계나 평균을 낼 수 없습니다.`),
        `with_unit=${s.unitCount}/${s.present}`);
      consistencyPenalty += 6;
    }
    // digits in an identifier (phone, 주민등록번호, 사업자등록번호) are not quantities: a phone
    // column written both with and without dashes is not "numbers mixed with words"
    const identifier = s.piiType || s.idKind;
    if (numFrac > 0.1 && numFrac < 0.9 && !identifier && !unitsExplainAll) {
      const ex = s.textSamples.map((t) => `"${t}"`).join(", ");
      add("consistency", "medium", col, "numeric_text_mix", L(`"${col}" mixes numbers and text (${(numFrac * 100).toFixed(0)}% numeric; text such as ${ex}).`, `"${col}" 열에 숫자와 글자가 섞여 있습니다 (숫자 ${(numFrac * 100).toFixed(0)}%, 글자 예: ${ex}).`), `numeric=${s.numericCount}/${s.present}`);
      consistencyPenalty += 6;
    }
    const shapeKeys = Object.keys(s.dateShapes);
    if (shapeKeys.length > 1) {
      add("consistency", "high", col, "mixed_date_format", L(`"${col}" uses ${shapeKeys.length} different date formats (${shapeKeys.join(", ")}).`, `"${col}" 열의 날짜가 ${shapeKeys.length}가지 형식으로 적혀 있습니다 (${shapeKeys.join(", ")}).`), JSON.stringify(s.dateShapes));
      consistencyPenalty += 8;
    }
    if (s.placeholderDateCount > 0) {
      add("consistency", "high", col, "placeholder_date", L(`"${col}" has ${s.placeholderDateCount} placeholder dates (1900-01-01 / 0000-00-00).`, `"${col}" 열에 자리만 채운 날짜(1900-01-01 / 0000-00-00)가 ${s.placeholderDateCount}개 있습니다.`), `placeholder=${s.placeholderDateCount}`);
      consistencyPenalty += 6;
    }
    if (s.idDupes) {
      const extra = s.idDupes.dups.reduce((sum, [, c]) => sum + (c - 1), 0);
      const ex = s.idDupes.dups.slice(0, 3).map(([v, c]) => `"${v}"×${c}`).join(" · ");
      add("consistency", "high", col, "dup_id",
        L(`"${col}" looks like a unique identifier (${(s.idDupes.uniqueRatio * 100).toFixed(1)}% unique) but ${s.idDupes.dups.length} value${s.idDupes.dups.length > 1 ? "s appear" : " appears"} more than once (${ex}).`,
          `"${col}" 열은 고유 ID로 보이지만(${(s.idDupes.uniqueRatio * 100).toFixed(1)}% 고유) ${s.idDupes.dups.length}개 값이 두 번 이상 나옵니다 (${ex}).`),
        `dup_values=${s.idDupes.dups.length} extra_rows=${extra}`);
      consistencyPenalty += 8;
    }
    if (s.variantClusters.length > 0) {
      const ex = s.variantClusters[0].forms.slice(0, 3).map((f) => `"${f.raw}"`).join(" / ");
      add("consistency", "medium", col, "value_variants",
        L(`"${col}" spells the same value multiple ways (${ex}${s.variantClusters.length > 1 ? ` — and ${s.variantClusters.length - 1} more cluster${s.variantClusters.length > 2 ? "s" : ""}` : ""}).`,
          `"${col}" 열에서 같은 값이 여러 가지로 적혀 있습니다 (${ex}${s.variantClusters.length > 1 ? ` — 이런 묶음이 ${s.variantClusters.length - 1}개 더` : ""}).`),
        s.variantClusters.map((c) => c.forms.map((f) => `${f.raw}×${f.count}`).join("/")).join(" · "));
      consistencyPenalty += 4;
    }
  }
  const consistencyScore = Math.max(0, 100 - consistencyPenalty);

  // ---- PII ----
  let piiPenalty = 0;
  for (const col of cols) {
    const s = columnStats[col];
    if (s.piiType) {
      add("pii", "high", col, "pii", L(`"${col}" looks like PII (${piiName(s.piiType)}) — ${s.piiCount} values match.`, `"${col}" 열은 개인정보(${piiName(s.piiType)})로 보입니다 — ${s.piiCount}개 값이 해당합니다.`), `${s.piiType}=${s.piiCount}`);
      piiPenalty += 15;
    }
  }
  const piiScore = Math.max(0, 100 - piiPenalty);

  // ---- Overall (weights are a JUDGMENT, not a fact — tunable; see TRUST.md) ----
  const weights = { completeness: 0.4, consistency: 0.35, pii: 0.25 };
  const score = Math.round(
    completenessScore * weights.completeness +
    consistencyScore * weights.consistency +
    piiScore * weights.pii
  );

  const sev = (x) => (x === "high" ? 3 : x === "medium" ? 2 : 1);
  const result = {
    rowCount: n, columnCount: cols.length, score,
    dimensions: {
      completeness: { score: Math.round(completenessScore), weight: weights.completeness },
      consistency: { score: Math.round(consistencyScore), weight: weights.consistency },
      pii: { score: Math.round(piiScore), weight: weights.pii },
    },
    weightsNote: L("Dimension weights are a judgment, not a fact — tunable. See TRUST.md.", "영역별 가중치는 사실이 아니라 판단이며, 바꿀 수 있습니다. TRUST.md 참고."),
    issues: issues.sort((a, b) => sev(b.severity) - sev(a.severity)),
    columnStats,
  };
  result.verdict = verdictFor(result);
  return result;
}

// ---- Verdict (a JUDGMENT on top of the score; one function so the CLI and the UI agree) ----
// Bands: 80–100 AI-ready · 55–79 needs cleanup · 0–54 not ready.
// Cap: personal data in the file means it must not go into an AI as it is, so ANY pii issue
// caps the verdict at "Remove personal data first" — a 96 with resident registration numbers
// in it is not "AI-ready". The numeric score is left untouched (it is the weighted formula
// above); only the sentence changes. Below 55 the file is "Not ready" either way.
export const VERDICT_BANDS = { ready: 80, cleanup: 55 };
export function verdictFor(r) {
  const piiColumns = r.issues.filter((i) => i.code === "pii").map((i) => i.column);
  if (r.score < VERDICT_BANDS.cleanup)
    return { code: "not_ready", tone: "bad", label: L("Not ready", "아직 안 됨"), piiColumns };
  if (piiColumns.length)
    return { code: "pii_first", tone: "warn", label: L("Remove personal data first", "개인정보부터 처리"),
      capped: r.score >= VERDICT_BANDS.ready, piiColumns };
  if (r.score >= VERDICT_BANDS.ready)
    return { code: "ready", tone: "good", label: L("AI-ready", "AI에 넣어도 됨"), piiColumns };
  return { code: "needs_cleanup", tone: "warn", label: L("Needs cleanup", "정리 필요"), piiColumns };
}
