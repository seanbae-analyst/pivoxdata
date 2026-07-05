// scorer.mjs — DataReady v1 deterministic scorer.
// Pure function, no AI, no I/O. Same module runs in the browser and in Node.
// Every issue carries a `type:'fact'` and its raw evidence — scores are judgments
// built on facts (see TRUST.md). Dimension weights are explicit and tunable.

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
export function looksLikePhone(t) {
  if (t.includes(".")) return false;
  const digits = (t.match(/\d/g) || []).length;
  const hasSep = /[\s()+-]/.test(t);
  return hasSep ? digits >= 10 && digits <= 15 : digits === 10 || digits === 11;
}
export const PLACEHOLDER_DATE = /^(1900-01-01|01\/01\/1900|0000-00-00)/;
export const SENTINELS = new Set(["n/a", "na", "null", "none", "-", "--", "unknown", "tbd", "#n/a"]);

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
export function dateShape(v) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "ISO";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) return "US-slash";
  if (/^[A-Za-z]+ \d{1,2},? \d{4}/.test(v)) return "long";
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
    const placeholderDateCount = nonEmpty.filter((v) => PLACEHOLDER_DATE.test(String(v).trim())).length;
    const sentinelCount = nonEmpty.filter((v) => SENTINELS.has(String(v).trim().toLowerCase())).length;
    const numericCount = nonEmpty.filter((v) => isNumeric(String(v).trim())).length;
    const dateShapes = {};
    for (const v of nonEmpty) {
      const s = dateShape(String(v).trim());
      if (s) dateShapes[s] = (dateShapes[s] || 0) + 1;
    }
    let piiType = null, piiCount = 0;
    // a column that NAMES itself a code (법정동코드, zipcode, violation_code) is an
    // administrative code, not PII — Korean 10-digit 법정동코드 collides with the bare
    // phone shape exactly like NYC's bbl, but here the header says so; trust it.
    // (found dogfooding Seoul commercial data — same name-gate philosophy as
    // looksLikeIdColumn; '번호' is NOT excluded: 전화번호 really is a phone.)
    const codeNamed = /(코드|code)\s*$/i.test(String(col).trim());
    const detectors = codeNamed ? {} : { ...PII_PATTERNS, phone: looksLikePhone };
    for (const [type, test] of Object.entries(detectors)) {
      const match = test instanceof RegExp ? (t) => test.test(t) : test;
      // a date like 2021-03-05 also matches loose phone shapes — exclude date-shaped
      // values from phone PII (false-positive guard surfaced by validate.mjs).
      const c = nonEmpty.filter((v) => {
        const t = String(v).trim();
        return match(t) && !(type === "phone" && dateShape(t));
      }).length;
      if (c > piiCount && c >= Math.max(3, present * 0.3)) { piiCount = c; piiType = type; }
    }
    // value-variant clusters — same normalized key, ≥2 raw spellings ("USA"/"usa"/"U.S.A.").
    // Only for text-ish columns: PII, date, and mostly-numeric columns are excluded, and
    // sentinel tokens are excluded (they are already their own issue).
    let variantClusters = [];
    const textish = !piiType && Object.keys(dateShapes).length === 0 &&
      (present === 0 || numericCount / present <= 0.9);
    if (textish) {
      const groups = new Map();
      for (const v of nonEmpty) {
        const raw = String(v).trim();
        if (SENTINELS.has(raw.toLowerCase())) continue;   // sentinels are their own issue
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
        if (!/\p{L}/u.test(raw) || SENTINELS.has(raw.toLowerCase()) || isNumeric(raw)) continue;
        if (raw === raw.toUpperCase()) caseCounts.upper++;
        else if (raw === raw.toLowerCase()) caseCounts.lower++;
        else caseCounts.mixed++;
      }
    }

    columnStats[col] = { present, missing, missingRate: n ? missing / n : 0, uniqueCount,
      placeholderDateCount, sentinelCount, numericCount, dateShapes, piiType, piiCount,
      variantClusters, caseCounts, idDupes };
  }

  const add = (dimension, severity, column, code, message, evidence) =>
    issues.push({ dimension, severity, column, code, type: "fact", message, evidence });

  // ---- Completeness ----
  let completenessPenalty = 0;
  for (const col of cols) {
    const s = columnStats[col];
    if (s.missing === n) {
      add("completeness", "high", col, "empty_column", `Column "${col}" is entirely empty (${n}/${n} missing).`, `missing=${n}`);
      completenessPenalty += 12;
    } else if (s.missingRate >= 0.5) {
      add("completeness", "high", col, "high_missing", `"${col}" is ${(s.missingRate * 100).toFixed(1)}% missing.`, `missing=${s.missing}/${n}`);
      completenessPenalty += 8;
    } else if (s.missingRate >= 0.2) {
      add("completeness", "medium", col, "missing", `"${col}" is ${(s.missingRate * 100).toFixed(1)}% missing.`, `missing=${s.missing}/${n}`);
      completenessPenalty += 4;
    }
    // Sentinel tokens are orthogonal to the missing-rate buckets above: a
    // column can be both partly missing AND have "N/A"/"NULL"/"-" hiding as
    // data. Previously this sat in the same else-if chain, so any column past
    // the 20% missing threshold never reported sentinels — and the fixer,
    // which keys off the "sentinel" issue, then left them in the cleaned file.
    if (s.missing !== n && s.sentinelCount > 0) {
      add("completeness", "low", col, "sentinel", `"${col}" has ${s.sentinelCount} placeholder tokens (N/A, NULL, -, ...) hiding as data.`, `sentinel=${s.sentinelCount}`);
      completenessPenalty += 2;
    }
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
    add("consistency", "medium", "(rows)", "dup_rows", `${dupRows} exact duplicate rows.`, `duplicates=${dupRows}`);
    consistencyPenalty += Math.min(15, 3 + (dupRows / n) * 100);
  }
  for (const col of cols) {
    const s = columnStats[col];
    if (s.present === 0) continue;
    const numFrac = s.numericCount / s.present;
    if (numFrac > 0.1 && numFrac < 0.9) {
      add("consistency", "medium", col, "numeric_text_mix", `"${col}" mixes numbers and text (${(numFrac * 100).toFixed(0)}% numeric).`, `numeric=${s.numericCount}/${s.present}`);
      consistencyPenalty += 6;
    }
    const shapeKeys = Object.keys(s.dateShapes);
    if (shapeKeys.length > 1) {
      add("consistency", "high", col, "mixed_date_format", `"${col}" uses ${shapeKeys.length} different date formats (${shapeKeys.join(", ")}).`, JSON.stringify(s.dateShapes));
      consistencyPenalty += 8;
    }
    if (s.placeholderDateCount > 0) {
      add("consistency", "high", col, "placeholder_date", `"${col}" has ${s.placeholderDateCount} placeholder dates (1900-01-01 / 0000-00-00).`, `placeholder=${s.placeholderDateCount}`);
      consistencyPenalty += 6;
    }
    if (s.idDupes) {
      const extra = s.idDupes.dups.reduce((sum, [, c]) => sum + (c - 1), 0);
      const ex = s.idDupes.dups.slice(0, 3).map(([v, c]) => `"${v}"×${c}`).join(" · ");
      add("consistency", "high", col, "dup_id",
        `"${col}" looks like a unique identifier (${(s.idDupes.uniqueRatio * 100).toFixed(1)}% unique) but ${s.idDupes.dups.length} value${s.idDupes.dups.length > 1 ? "s appear" : " appears"} more than once (${ex}).`,
        `dup_values=${s.idDupes.dups.length} extra_rows=${extra}`);
      consistencyPenalty += 8;
    }
    if (s.variantClusters.length > 0) {
      const ex = s.variantClusters[0].forms.slice(0, 3).map((f) => `"${f.raw}"`).join(" / ");
      add("consistency", "medium", col, "value_variants",
        `"${col}" spells the same value multiple ways (${ex}${s.variantClusters.length > 1 ? ` — and ${s.variantClusters.length - 1} more cluster${s.variantClusters.length > 2 ? "s" : ""}` : ""}).`,
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
      add("pii", "high", col, "pii", `"${col}" looks like PII (${s.piiType}) — ${s.piiCount} values match.`, `${s.piiType}=${s.piiCount}`);
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
  return {
    rowCount: n, columnCount: cols.length, score,
    dimensions: {
      completeness: { score: Math.round(completenessScore), weight: weights.completeness },
      consistency: { score: Math.round(consistencyScore), weight: weights.consistency },
      pii: { score: Math.round(piiScore), weight: weights.pii },
    },
    weightsNote: "Dimension weights are a judgment, not a fact — tunable. See TRUST.md.",
    issues: issues.sort((a, b) => sev(b.severity) - sev(a.severity)),
    columnStats,
  };
}
