// validate.mjs — proves the scorer works, two independent ways:
//   (1) GENERALIZATION: run on a never-before-seen schema (customers) with a known
//       ground truth, and measure precision / recall.
//   (2) ORACLE AGREEMENT: run on the full NYC dataset and check the scorer's own
//       computed facts match verify.py's independent oracle (verified_facts.json).
//   (3) FIXER: mechanical remediation must raise the score, kill exactly the
//       mechanical issue codes, and NEVER silently touch judgment-level issues
//       (missing / numeric_text_mix / PII stays flagged).
import fs from "fs";
import { parseFile, norm } from "./parse.mjs";
import { scoreDataset } from "./scorer.mjs";
import { fixDataset } from "./fixer.mjs";

let failures = 0;

// ---------- (1) Generalization on a new schema ----------
console.log("=".repeat(64));
console.log("(1) GENERALIZATION — new schema (customers_messy.csv) vs ground truth");
console.log("=".repeat(64));
{
  const { rows, columns } = parseFile("test-data/customers_messy.csv");
  const r = scoreDataset(rows, columns);

  // ground truth = the 10 planted defects (code, column) — dup_id joined when the
  // Keys/uniqueness slice shipped: the duplicate row also duplicates customer_id 1005.
  const expected = [
    ["empty_column", "notes"], ["missing", "country"], ["missing", "age"],
    ["mixed_date_format", "signup_date"], ["placeholder_date", "signup_date"],
    ["numeric_text_mix", "age"], ["dup_rows", "(rows)"], ["dup_id", "customer_id"],
    ["pii", "email"], ["pii", "phone"],
  ];
  const flagged = r.issues.map((i) => [i.code, i.column]);
  const has = (code, col) => flagged.some(([c, k]) => c === code && k === col);

  const caught = expected.filter(([c, k]) => has(c, k));
  const extras = flagged.filter(([c, k]) => !expected.some(([ec, ek]) => ec === c && ek === k));
  const recall = caught.length / expected.length;
  const precision = flagged.length ? (flagged.length - extras.length) / flagged.length : 0;

  console.log(`\nscore ${r.score}/100, flagged ${r.issues.length} issues\n`);
  for (const [c, k] of expected) console.log(`  ${has(c, k) ? "✓ caught " : "✗ MISSED "} ${c} @ ${k}`);
  if (extras.length) { console.log("\n  false positives (review):"); for (const [c, k] of extras) console.log(`    ! ${c} @ ${k}`); }
  console.log(`\n  recall    = ${caught.length}/${expected.length} = ${(recall * 100).toFixed(0)}%`);
  console.log(`  precision = ${(precision * 100).toFixed(0)}%`);
  if (recall < 1) { console.log("  -> RECALL below 100%: scorer missed a known defect"); failures++; }
}

// ---------- (2) Oracle agreement on full NYC data ----------
console.log("\n" + "=".repeat(64));
console.log("(2) ORACLE AGREEMENT — scorer vs verify.py on full NYC dataset");
console.log("=".repeat(64));
try {
  const oracle = JSON.parse(fs.readFileSync("verified_facts.json", "utf8")).facts;
  const { rows, columns } = parseFile("nyc_restaurant_full.csv");
  const r = scoreDataset(rows, columns);

  const colBy = {};
  for (const c of columns) colBy[norm(c)] = c;
  const st = (n) => r.columnStats[colBy[n]] || {};

  const checks = [
    ["total_rows", r.rowCount, oracle.total_rows],
    ["grade_missing", st("grade").missing, oracle.grade_missing],
    ["score_missing", st("score").missing, oracle.score_missing],
    ["fake_1900_date", st("inspection_date").placeholderDateCount, oracle.fake_1900_date],
    ["camis_unique", st("camis").uniqueCount, oracle.camis_unique],
  ];
  console.log(`\n${"fact".padEnd(18)}${"scorer(JS)".padStart(12)}${"oracle(py)".padStart(12)}   status`);
  console.log("-".repeat(56));
  for (const [name, js, py] of checks) {
    const ok = js === py;
    if (!ok) failures++;
    console.log(`${name.padEnd(18)}${String(js).padStart(12)}${String(py).padStart(12)}   ${ok ? "MATCH" : "MISMATCH !!!"}`);
  }
} catch (e) {
  console.log("\nskipped: " + e.message + "\n(run verify.py first to produce verified_facts.json)");
}

// ---------- (3) Fixer: mechanical remediation ----------
console.log("\n" + "=".repeat(64));
console.log("(3) FIXER — mechanical remediation on customers_messy.csv");
console.log("=".repeat(64));
{
  const { rows, columns } = parseFile("test-data/customers_messy.csv");
  const res = fixDataset(rows, columns);
  const after = scoreDataset(res.rows, res.columns);
  const afterCodes = new Set(after.issues.map((i) => i.code));

  const assert = (name, ok) => {
    console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`);
    if (!ok) failures++;
  };

  console.log(`\n  score ${res.before.score} → ${after.score}   rows ${rows.length} → ${res.rows.length}   cols ${columns.length} → ${res.columns.length}`);
  for (const f of res.fixes) console.log(`    · ${f.message}`);
  for (const s of res.skipped) console.log(`    ○ skipped: ${s.reason}`);
  console.log();

  assert("score improved", after.score > res.before.score);
  assert("mechanical codes gone (dup/mixed_date/placeholder/sentinel/empty_col)",
    ["dup_rows", "mixed_date_format", "placeholder_date", "sentinel", "empty_column"]
      .every((c) => !afterCodes.has(c)));
  assert("PII still flagged (fixer must not silently mask)", afterCodes.has("pii"));
  assert("judgment issues untouched (missing / numeric_text_mix survive)",
    afterCodes.has("missing") && afterCodes.has("numeric_text_mix"));
  assert("dup row removed (16 → 15)", res.rows.length === 15);
  assert("empty column dropped (8 → 7)", res.columns.length === 7);
}

// ---------- (4) Value-variant unification (user-chosen canonical) ----------
console.log("\n" + "=".repeat(64));
console.log("(4) UNIFY — spelling clusters, canonical chosen by the USER");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  // fixture: one column spelling the same country 3 ways + a consistent column
  const rows = [
    { id: "1", country: "USA" }, { id: "2", country: "usa" }, { id: "3", country: "U.S.A." },
    { id: "4", country: "USA" }, { id: "5", country: "Korea" }, { id: "6", country: "Korea" },
  ];
  const cols = ["id", "country"];
  const before = scoreDataset(rows, cols);
  const flagged = before.issues.find((i) => i.code === "value_variants" && i.column === "country");
  assert("cluster detected (USA/usa/U.S.A.)", !!flagged);

  // without a user choice → untouched (never unify without being told)
  const noChoice = fixDataset(rows, cols);
  assert("no choice → left as-is (skipped, values unchanged)",
    noChoice.skipped.some((s) => s.code === "value_variants") &&
    noChoice.rows.some((r) => r.country === "usa"));

  // user chooses "USA" as canonical
  const res = fixDataset(rows, cols, { unify: { country: { usa: "USA" } } });
  const after = scoreDataset(res.rows, res.columns);
  assert("chosen canonical applied (usa/U.S.A. → USA)",
    res.rows.filter((r) => r.country === "USA").length === 4 &&
    !res.rows.some((r) => r.country === "usa" || r.country === "U.S.A."));
  assert("Korea untouched (no cross-cluster damage)",
    res.rows.filter((r) => r.country === "Korea").length === 2);
  assert("issue gone + score improved after unify",
    !after.issues.some((i) => i.code === "value_variants") && after.score > before.score);
}

// ---------- (5) Extended user-choice fixes: headers / casing / PII-drop / empty rows ----------
console.log("\n" + "=".repeat(64));
console.log("(5) EXTENDED OPTIONS — headers, casing, PII drop, empty rows");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const rows = [
    { "Full Name": "kim minjun", "AGE": "29", "Email Addr": "a@x.com" },
    { "Full Name": "SARAH LEE",  "AGE": "34", "Email Addr": "b@x.com" },
    { "Full Name": "Tom Brown",  "AGE": "41", "Email Addr": "c@x.com" },
    { "Full Name": "wang wei",   "AGE": "38", "Email Addr": "d@x.com" },
    { "Full Name": "", "AGE": "", "Email Addr": "" },                    // fully empty row
  ];
  const cols = ["Full Name", "AGE", "Email Addr"];
  const res = fixDataset(rows, cols, {
    headerStyle: "snake",
    caseNormalize: { "Full Name": "title" },
    piiMode: "drop",
    dropEmptyRows: true,
  });
  assert("headers → snake_case (Full Name → full_name, AGE → age)",
    res.columns.includes("full_name") && res.columns.includes("age"));
  assert("PII column dropped (Email Addr gone)",
    !res.columns.some((c) => /email/i.test(c)));
  assert("casing → Title Case (kim minjun → Kim Minjun, SARAH LEE → Sarah Lee)",
    res.rows.some((r) => r.full_name === "Kim Minjun") &&
    res.rows.some((r) => r.full_name === "Sarah Lee"));
  assert("fully-empty row removed (5 → 4)", res.rows.length === 4);
  assert("defaults untouched: headerStyle keep / piiMode keep leaves data alone",
    (() => { const d = fixDataset(rows, cols);
      return d.columns.includes("Full Name") && d.columns.some((c) => /Email/i.test(c)) &&
        d.rows.some((r) => r["Full Name"] === "SARAH LEE"); })());
}

// ---------- (6) DUP-ID — Keys/uniqueness slice: near-unique identifier columns ----------
console.log("\n" + "=".repeat(64));
console.log("(6) DUP-ID — duplicate values in near-unique identifier columns");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const mk = (n, idGen, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ order_id: idGen(i), item: `item-${i % 4}`, ...extra }));

  // a) near-unique PK with 2 leaked duplicate values → flagged, high severity
  const pk = mk(20, (i) => `O${String(i).padStart(3, "0")}`);
  pk[18].order_id = "O000"; pk[19].order_id = "O001";           // 18/20 unique = 90%
  const rA = scoreDataset(pk, ["order_id", "item"]);
  const hitA = rA.issues.find((i) => i.code === "dup_id" && i.column === "order_id");
  assert("near-unique PK with leaked dups flagged (18/20 unique)", !!hitA && hitA.severity === "high");
  assert("evidence names the duplicated values", !!hitA && /O000/.test(hitA.message));

  // b) reference-style column (heavy legitimate repeats) → NOT flagged
  const fk = Array.from({ length: 40 }, (_, i) => ({ row_no: `R${i}`, customer_id: `C${i % 5}` }));
  const rB = scoreDataset(fk, ["row_no", "customer_id"]);
  assert("FK-style column with heavy repeats stays silent (12.5% unique)",
    !rB.issues.some((i) => i.code === "dup_id"));

  // c) name guard: "paid"/"valid" end in -id but are NOT identifier tokens
  const named = Array.from({ length: 12 }, (_, i) => ({ paid: i < 6 ? "yes" : "no", valid: "true", uid: `U${i}` }));
  const rC = scoreDataset(named, ["paid", "valid", "uid"]);
  assert("\"paid\"/\"valid\" columns never flagged (token guard)",
    !rC.issues.some((i) => i.code === "dup_id"));

  // d) fully unique id → NOT flagged
  const uniq = mk(20, (i) => `O${String(i).padStart(3, "0")}`);
  assert("fully unique id column stays silent",
    !scoreDataset(uniq, ["order_id", "item"]).issues.some((i) => i.code === "dup_id"));

  // e) fixer behavior: exact-copy dups vanish via dedupe; differing rows survive + reported skipped
  const exact = mk(20, (i) => `O${String(i).padStart(3, "0")}`);
  exact.push({ ...exact[0] });                                   // exact duplicate row
  const resE1 = fixDataset(exact, ["order_id", "item"]);
  assert("dup_id from an exact duplicate row disappears after dedupe",
    !scoreDataset(resE1.rows, resE1.columns).issues.some((i) => i.code === "dup_id"));
  const differ = mk(20, (i) => `O${String(i).padStart(3, "0")}`);
  differ.push({ order_id: "O000", item: "item-DIFFERENT" });     // same id, different row
  const resE2 = fixDataset(differ, ["order_id", "item"]);
  assert("dup_id on differing rows survives the fixer (judgment) + reported as skipped",
    scoreDataset(resE2.rows, resE2.columns).issues.some((i) => i.code === "dup_id") &&
    resE2.skipped.some((s) => s.code === "dup_id"));
}

// ---------- (7) ANALYZER — the "so what" layer: same questions, both versions ----------
console.log("\n" + "=".repeat(64));
console.log("(7) ANALYZER — before/after answers diff on the defects, and only on them");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  // fixture: dup row inflates a sum; placeholder poisons a min-date; variants split a
  // group-by; PII email exposure; one stable column that must NOT diff.
  const rows = [
    { amount: "100", when: "1900-01-01", country: "USA",  email: "a@x.com", stage: "Won" },
    { amount: "200", when: "2024-03-05", country: "usa",  email: "b@x.com", stage: "Won" },
    { amount: "300", when: "2024-06-10", country: "Korea", email: "c@x.com", stage: "Lost" },
    { amount: "400", when: "2024-09-20", country: "USA",  email: "d@x.com", stage: "Won" },
  ];
  rows.push({ ...rows[3] });                                     // exact dup: +400 to the dirty sum
  const cols = ["amount", "when", "country", "email", "stage"];
  const stats = scoreDataset(rows, cols);
  const res = fixDataset(rows, cols, { piiMode: "mask", unify: { country: { usa: "USA" } } });
  const { analyzeBeforeAfter } = await import("./analyzer.mjs");
  const m = analyzeBeforeAfter({ rows, columns: cols, stats }, { rows: res.rows, columns: res.columns });
  const by = (label) => m.find((x) => x.label.includes(label));

  assert("dup row inflates the dirty sum (1,400 → 1,000)",
    by("Total of \"amount\"")?.dirty === "1,400" && by("Total of \"amount\"")?.clean === "1,000" && by("Total of \"amount\"")?.differs);
  assert("placeholder poisons the dirty earliest date (1900-01-01 → 2024-03-05)",
    by("Earliest \"when\"")?.dirty === "1900-01-01" && by("Earliest \"when\"")?.clean === "2024-03-05");
  assert("variant split visible to a group-by (3 groups → 2)",
    by("Distinct groups a group-by sees in \"country\"")?.dirty === "3" &&
    by("Distinct groups a group-by sees in \"country\"")?.clean === "2");
  assert("raw email exposure drops to 0 after masking",
    by("Raw email")?.dirty === "5" && by("Raw email")?.clean === "0");
  assert("stable column does NOT diff (stage groups unchanged)",
    by("Distinct groups a group-by sees in \"stage\"")?.differs === false);
  assert("row count reflects dedupe (5 → 4)",
    by("Rows the analysis")?.dirty === "5" && by("Rows the analysis")?.clean === "4");
}

// ---------- (8) INSIGHTS — real patterns fire, trivia stays silent ----------
console.log("\n" + "=".repeat(64));
console.log("(8) INSIGHTS — fact+baseline+so-what shapes; honest silence on clean data");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { extractInsights } = await import("./insights.mjs");
  const run = (rows, cols) => extractInsights(rows, cols, scoreDataset(rows, cols));

  // a) granularity + weighting bias: entity O0 heavy (10 rows, total 1000),
  //    O1..O9 light (2 rows each, total 100) — 28 rows, 10 entities
  const gb2 = [];
  for (let j = 0; j < 10; j++) gb2.push({ order_id: "O0", order_total: "1000", item: `a${j}` });
  for (let e = 1; e < 10; e++) for (let j = 0; j < 2; j++) gb2.push({ order_id: `O${e}`, order_total: "100", item: `b${e}${j}` });
  const insGB = run(gb2, ["order_id", "order_total", "item"]);
  assert("granularity fires (28 rows, 10 entities, 2.8×)",
    insGB.some((i) => i.shape === "granularity" && /2\.8/.test(i.fact)));
  assert("weighting bias fires (row-avg ≫ entity-avg)",
    insGB.some((i) => i.shape === "weighting_bias" && /\+/.test(i.fact)));

  // b) structural missingness: grade blank 90% in phase A vs 0% in phase B
  const sm = [];
  for (let i = 0; i < 20; i++) sm.push({ phase: "A", grade: i < 18 ? "" : "ok", who: `p${i}` });
  for (let i = 0; i < 20; i++) sm.push({ phase: "B", grade: "ok", who: `q${i}` });
  assert("structural missingness fires (90% vs 0% by phase)",
    run(sm, ["phase", "grade", "who"]).some((i) => i.shape === "structural_missing" && i.fact.includes('phase="A"')));

  // c) concentration + outliers: 90% of revenue from 10% of rows
  const cc = [];
  for (let e = 0; e < 9; e++) for (let j = 0; j < 2; j++) cc.push({ region: `R${e}`, revenue: "10" });
  cc.push({ region: "KING", revenue: "800" }); cc.push({ region: "KING", revenue: "800" });
  const insCC = run(cc, ["region", "revenue"]);
  assert("concentration fires only with value-share ≫ row-share",
    insCC.some((i) => i.shape === "concentration" && i.fact.includes("KING")));
  assert("outliers fire (800 ≫ median 10)", insCC.some((i) => i.shape === "outliers"));

  // d) trivia guards: clean/uniform data (+ a concentrated ZIP code column) → SILENCE
  const clean = [];
  for (let i = 0; i < 20; i++) clean.push({ user_id: `U${i}`, name: `n${i}`, zip: i < 15 ? "10001" : "94103", flag: "yes" });
  assert("honest silence on clean data (zip codes are not metrics)",
    run(clean, ["user_id", "name", "zip", "flag"]).length === 0);

  // e) format contract: every insight carries fact + baseline + so-what + materiality
  assert("every insight has fact/baseline/sowhat/materiality",
    [...insGB, ...insCC].every((i) => i.fact && i.baseline && i.sowhat && i.materiality > 0));
}

// ---------- (9) KOREAN DATA — gaps found dogfooding Seoul commercial data (537k rows) ----------
console.log("\n" + "=".repeat(64));
console.log("(9) KOREAN DATA — code-named columns are not PII; 지번 lots never merge");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { variantKey } = await import("./scorer.mjs");

  // a) 법정동코드: 10-digit administrative codes must NOT flag as phone PII
  const rows = Array.from({ length: 20 }, (_, i) => ({
    "법정동코드": `11680101${String(i).padStart(2, "0")}`,   // 10-digit, phone-shaped
    "전화번호": `010-2${String(1000 + i)}-${String(1000 + i)}`, // a REAL phone column
    "상호명": `가게${i}`,
  }));
  const r = scoreDataset(rows, ["법정동코드", "전화번호", "상호명"]);
  assert("법정동코드 (code-named) not flagged as PII",
    !r.issues.some((i) => i.code === "pii" && i.column === "법정동코드"));
  assert("전화번호 still flagged as PII (번호 is not excluded)",
    r.issues.some((i) => i.code === "pii" && i.column === "전화번호"));

  // b) 지번 lot numbers: "642" and "64-2" are different parcels — never cluster
  assert("지번 642 ≠ 64-2 (digit-punctuation preserved)",
    variantKey("서울특별시 송파구 문정동 642") !== variantKey("서울특별시 송파구 문정동 64-2"));
  assert("64.2 ≡ 64-2 (punct between digits canonicalized)",
    variantKey("문정동 64.2") === variantKey("문정동 64-2"));
  assert("테크노-마트 ≡ 테크노마트 (letter-side punct still strips)",
    variantKey("테크노-마트") === variantKey("테크노마트"));
  assert("U.S.A. ≡ usa (existing behavior intact)",
    variantKey("U.S.A.") === variantKey("usa"));

  // c) …번지/…번호 columns are address labels, not metrics — insights must not sum them
  const { extractInsights } = await import("./insights.mjs");
  const lot = Array.from({ length: 30 }, (_, i) => ({
    "상호명": `가게${i % 6}`, "구명": i < 15 ? "강남구" : "도봉구",
    "건물본번지": String(i < 3 ? 3000 + i : 10 + i),   // outlier-shaped, but a LABEL
  }));
  const insKR = extractInsights(lot, ["상호명", "구명", "건물본번지"], scoreDataset(lot, ["상호명", "구명", "건물본번지"]));
  assert("번지 column never becomes a metric (no outlier/sum trivia)",
    !insKR.some((i) => i.fact.includes("건물본번지")));
}

// ---------- (10) KOREAN IDENTIFIERS — 주민등록번호, 사업자등록번호, 계좌, dotted mobiles ----------
console.log("\n" + "=".repeat(64));
console.log("(10) KOREAN IDS — RRN by shape+validity, business no. is not a phone, dotted mobiles");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { looksLikeKrRRN, looksLikeKrBRN, looksLikePhone } = await import("./scorer.mjs");
  const pii = (r, col) => r.issues.find((i) => i.code === "pii" && i.column === col);

  // a) the measured failure: RRNs in a column labelled "phone" scored 96 → "AI-ready"
  const { rows: rr, columns: rc } = parseFile("test-data/kr_rrn.csv");
  const r1 = scoreDataset(rr, rc);
  assert("RRN with hyphen detected as kr_rrn (not phone) — kr_rrn.csv",
    r1.columnStats.phone.piiType === "kr_rrn" && pii(r1, "phone")?.evidence === "kr_rrn=12");
  const { rows: rb, columns: cb } = parseFile("test-data/kr_rrn_bare.csv");
  assert("RRN without hyphen detected — kr_rrn_bare.csv (was 100/100, nothing flagged)",
    scoreDataset(rb, cb).columnStats["주민번호"].piiType === "kr_rrn");

  // b) validity rules, value by value
  assert("valid shapes accepted (900101-1234567, 0503014123456, 2000s + foreigner digit 5–8)",
    ["900101-1234567", "9001011234567", "0503014123456", "851231-5234567", "040229-3123456"].every((t) => looksLikeKrRRN(t)));
  assert("post-2020 random back digits accepted (no checksum required)",
    looksLikeKrRRN("010101-3999999") && looksLikeKrRRN("010101-4000001"));
  assert("invalid date / gender digit / future birth rejected",
    !looksLikeKrRRN("901301-1234567") && !looksLikeKrRRN("900230-1234567") &&   // month 13, Feb 30
    !looksLikeKrRRN("010229-3123456") &&                                        // 2001 is not a leap year
    !looksLikeKrRRN("900101-9234567") && !looksLikeKrRRN("900101-0234567") &&   // 1800s digits excluded
    !looksLikeKrRRN("500101-3234567"));                                         // born 2050 → future

  // c) precision: 13-digit order numbers and random 13-digit ids are NOT residents
  const orders = Array.from({ length: 40 }, (_, i) => ({ order_no: `2026${String(1 + (i % 12)).padStart(2, "0")}${String(1 + (i % 28)).padStart(2, "0")}${String(i + 1).padStart(5, "0")}` }));
  assert("YYYYMMDD+serial order numbers (2026102200001…) not flagged",
    !scoreDataset(orders, ["order_no"]).issues.some((i) => i.code === "pii"));
  let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const rand13 = Array.from({ length: 300 }, () => ({ txn: String(1e12 + Math.floor(rnd() * 9e12)) }));
  const hits = rand13.filter((x) => looksLikeKrRRN(x.txn)).length;
  assert(`random 13-digit ids not flagged (only ${hits}/300 pass date+digit by chance, far under the 30% gate)`,
    hits < 30 && !scoreDataset(rand13, ["txn"]).issues.some((i) => i.code === "pii"));
  const corp = Array.from({ length: 10 }, (_, i) => ({ "법인등록번호": `110111-${1234560 + i}` }));
  assert("법인등록번호 column (passes the RRN date test) not flagged — header says corporate",
    !scoreDataset(corp, ["법인등록번호"]).issues.some((i) => i.code === "pii"));

  // d) business registration numbers: identifier, not phone, not PII
  const { rows: ir, columns: ic } = parseFile("test-data/kr_ids.csv");
  const r2 = scoreDataset(ir, ic);
  assert("사업자등록번호 (###-##-#####, valid check digit) is idKind kr_brn, not PII",
    r2.columnStats["사업자등록번호"].idKind === "kr_brn" && !pii(r2, "사업자등록번호"));
  assert("check digit is enforced (220-81-62517 ok, 220-81-62518 not)",
    looksLikeKrBRN("220-81-62517") && !looksLikeKrBRN("220-81-62518"));
  const badBrn = Array.from({ length: 10 }, (_, i) => ({ ref: `123-45-${String(67000 + i * 7).padStart(5, "0")}` }))
    .filter((x) => !looksLikeKrBRN(x.ref));
  assert("3-2-5 grouping is never a phone, even with a wrong check digit",
    badBrn.length >= 3 && !scoreDataset(badBrn, ["ref"]).issues.some((i) => i.code === "pii") &&
    !looksLikePhone("123-45-67890"));
  const bareBrn = Array.from({ length: 6 }, (_, i) => ({ "사업자번호": ir[i]["사업자등록번호"].replace(/-/g, "") }));
  assert("bare 10-digit business numbers under a 사업자 header → kr_brn, not phone",
    scoreDataset(bareBrn, ["사업자번호"]).columnStats["사업자번호"].idKind === "kr_brn" &&
    !scoreDataset(bareBrn, ["사업자번호"]).issues.some((i) => i.code === "pii"));

  // e) other columns of the same file
  assert("13-digit 주문번호 not PII", !pii(r2, "주문번호"));
  assert("dotted mobile 010.4567.8901 detected as phone (연락처)", pii(r2, "연락처")?.evidence === "phone=12");
  assert("Seoul landline 02.123.4567 / 02-123-4567 read as phone", looksLikePhone("02.123.4567") && looksLikePhone("02-123-4567"));
  assert("coordinates 위도/경도 still not phone", !pii(r2, "위도") && !pii(r2, "경도") &&
    !looksLikePhone("37.5665000") && !looksLikePhone("127.978000"));
  assert("계좌번호 labelled bank_account (not phone)", pii(r2, "계좌번호")?.evidence === "bank_account=12");
  const sameShape = ir.map((x) => ({ memo_ref: x["계좌번호"] }));
  assert("account-shaped values under a non-account header are NOT called bank accounts",
    scoreDataset(sameShape, ["memo_ref"]).columnStats.memo_ref.piiType !== "bank_account");
  assert("'account_id' is not an account-number header (user ids)",
    scoreDataset(Array.from({ length: 6 }, (_, i) => ({ account_id: `${1234567890 + i}` })), ["account_id"]).columnStats.account_id.piiType !== "bank_account");

  // f) masking: RRN fully masked, exposure → 0
  const masked = fixDataset(rr, rc, { piiMode: "mask" });
  assert("fixer masks every RRN completely (******-*******)",
    masked.rows.every((x) => x.phone === "******-*******"));
  const { analyzeBeforeAfter } = await import("./analyzer.mjs");
  const ba = analyzeBeforeAfter({ rows: rr, columns: rc, stats: r1 }, { rows: masked.rows, columns: masked.columns });
  assert("analyzer: raw RRN exposure 12 → 0 after masking",
    ba.some((m) => /Raw Korean resident/.test(m.label) && m.dirty === "12" && m.clean === "0"));
}

// ---------- (11) VERDICT — personal data caps the verdict; CLI and UI share verdictFor ----------
console.log("\n" + "=".repeat(64));
console.log("(11) VERDICT — any PII caps the verdict below \"AI-ready\"");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { verdictFor } = await import("./scorer.mjs");
  const { rows, columns } = parseFile("test-data/kr_rrn.csv");
  const r = scoreDataset(rows, columns);
  assert(`score unchanged by the cap (${r.score} ≥ 80) — the formula is untouched`, r.score >= 80);
  assert("verdict is pii_first, never AI-ready", r.verdict.code === "pii_first" && r.verdict.capped === true &&
    r.verdict.label !== "AI-ready");
  assert("after masking, the same file can be AI-ready",
    (() => { const f = fixDataset(rows, columns, { piiMode: "mask" }); return scoreDataset(f.rows, f.columns).verdict.code === "ready"; })());
  assert("bands without PII: 80 ready · 55 needs cleanup · 54 not ready",
    verdictFor({ score: 80, issues: [] }).code === "ready" && verdictFor({ score: 79, issues: [] }).code === "needs_cleanup" &&
    verdictFor({ score: 55, issues: [] }).code === "needs_cleanup" && verdictFor({ score: 54, issues: [] }).code === "not_ready");
  assert("below 55 with PII stays not_ready (the cap never raises a verdict)",
    verdictFor({ score: 40, issues: [{ code: "pii", column: "x" }] }).code === "not_ready");
}

// ---------- (12) ENCODING — CP949 / EUC-KR files decode, and lost text is a fact ----------
console.log("\n" + "=".repeat(64));
console.log("(12) ENCODING — CP949 decodes (incl. UHC extension), BOM stripped, U+FFFD reported");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { decodeBytes } = await import("./encoding.mjs");
  // fixture bytes written by Python's cp949 codec — an engine independent of encoding.mjs
  const p = parseFile("test-data/kr_cp949.csv");
  assert("kr_cp949.csv read as cp949", p.encoding === "cp949");
  assert("Korean headers intact (상호명, 업종, 시군구, 매출)", JSON.stringify(p.columns) === JSON.stringify(["상호명", "업종", "시군구", "매출"]));
  assert("UHC-extension syllables decode (똠양꿍, 햏햏, 뷁 — missing from Node's ICU euc-kr)",
    p.rows[0]["상호명"] === "똠양꿍 하우스" && p.rows[1]["상호명"] === "햏햏 문구" && p.rows[3]["상호명"] === "뷁 커피");
  assert("no unreadable-text issue on a correctly decoded file",
    !scoreDataset(p.rows, p.columns).issues.some((i) => /^unreadable/.test(i.code)));
  // the same bytes read the old way (as UTF-8) are what the scorer used to grade
  const asUtf8 = new TextDecoder("utf-8").decode(fs.readFileSync("test-data/kr_cp949.csv"));
  assert("…read as UTF-8 they are mojibake (the old silent failure)", asUtf8.includes("�"));

  const bom = decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("이름,값\n가,1\n")]));
  assert("UTF-8 BOM stripped (first header is 이름, not \\uFEFF이름)", bom.encoding === "utf-8" && bom.text.startsWith("이름"));
  const latin1 = decodeBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x31, 0x0a]));   // "café,1" in Latin-1
  assert("bytes that are neither UTF-8 nor CP949 → 'unknown', lossy (never a silent guess)",
    latin1.encoding === "unknown" && latin1.lossy && latin1.text.includes("�"));

  const badHdr = [{ "��명": "a", "값": "1" }, { "��명": "b", "값": "2" }];
  const rh = scoreDataset(badHdr, ["��명", "값"]);
  assert("U+FFFD in a header → unreadable_header fact (high)", rh.issues.some((i) => i.code === "unreadable_header" && i.severity === "high"));
  const badVal = Array.from({ length: 5 }, (_, i) => ({ "상호": i < 2 ? "�� 식당" : `가게${i}` }));
  const rv = scoreDataset(badVal, ["상호"]);
  assert("U+FFFD in values → unreadable_value fact naming the column + count",
    rv.issues.some((i) => i.code === "unreadable_value" && i.column === "상호" && i.evidence === "상호=2"));
  assert("fixer refuses to 'repair' lost characters (skipped, not guessed)",
    fixDataset(badVal, ["상호"]).skipped.some((s) => s.code === "unreadable_value"));
}

// ---------- (13) KOREAN BLANKS — 미상 / 없음 / 모름 … are sentinels; 기타 and 있음/없음 answers are not ----------
console.log("\n" + "=".repeat(64));
console.log("(13) KOREAN SENTINELS — blanks dressed as data, without eating real categories");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { rows, columns } = parseFile("test-data/kr_dates.csv");
  const r = scoreDataset(rows, columns);
  const sent = (col) => r.issues.find((i) => i.code === "sentinel" && i.column === col);
  assert("담당자: all 9 Korean blank tokens counted (미상 없음 해당 없음 모름 무응답 알 수 없음 미입력 해당없음 알수없음)",
    sent("담당자")?.evidence === "sentinel=9");
  assert("분류: 기타 is a real category — not a sentinel", !sent("분류"));
  assert("주차: 없음 next to 있음 is an answer — not a sentinel", !sent("주차"));
  const res = fixDataset(rows, columns);
  assert("fixer clears exactly the 9 tokens; 주차 없음 and 기타 survive",
    res.rows.filter((x) => x["담당자"] === "").length === 9 &&
    res.rows.filter((x) => x["주차"] === "없음").length === 6 && res.rows.some((x) => x["분류"] === "기타"));
  const lone = Array.from({ length: 6 }, (_, i) => ({ "비고": i < 3 ? "없음" : `메모${i}` }));
  assert("없음 without 있음 in the column is a sentinel",
    scoreDataset(lone, ["비고"]).issues.some((i) => i.code === "sentinel"));
}

// ---------- (14) KOREAN DATES — each written form is its own shape; only year-first forms are rewritten ----------
console.log("\n" + "=".repeat(64));
console.log("(14) KOREAN DATES — 2026.10.22 / 2026. 10. 22. / 2026년 10월 22일 / 2026/10/22 / 26-10-22");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { dateShape } = await import("./scorer.mjs");
  const { toISO } = await import("./fixer.mjs");
  const shapes = { "2026.10.22": "YMD-dot", "2026. 10. 22.": "YMD-dot-spaced", "2026년 10월 22일": "YMD-korean",
    "2026/10/22": "YMD-slash", "26-10-22": "YY-MM-DD", "10/22/2026": "US-slash", "2026-10-22": "ISO" };
  assert("each form is recognized as its own shape", Object.entries(shapes).every(([v, s]) => dateShape(v) === s));
  assert("non-dates stay non-dates (1234.56.78, 37.5665, 1.2.3, 12-34-56)",
    ["1234.56.78", "37.5665", "1.2.3", "12-34-56", "2026.10"].every((v) => dateShape(v) === null));
  const { rows, columns } = parseFile("test-data/kr_dates.csv");
  const r = scoreDataset(rows, columns);
  const mixed = r.issues.find((i) => i.code === "mixed_date_format" && i.column === "계약일");
  assert("계약일: mixed formats detected — 6 distinct shapes", !!mixed && Object.keys(JSON.parse(mixed.evidence)).length === 6);
  assert("year-first forms → ISO (2026.10.22, 2026. 10. 22., 2026년 10월 22일, 2026/10/22)",
    toISO("2026.10.22") === "2026-10-22" && toISO("2026. 10. 22.") === "2026-10-22" &&
    toISO("2026년 10월 22일") === "2026-10-22" && toISO("2026/10/22") === "2026-10-22");
  assert("two-digit year 26-10-22 is NOT rewritten (century is a judgment)", toISO("26-10-22") === null);
  assert("not-on-the-calendar dates are not rewritten (2026.02.30, US 13/05/2021)",
    toISO("2026.02.30") === null && toISO("13/05/2021") === null);
  const res = fixDataset(rows, columns);
  const col = res.rows.map((x) => x["계약일"]);
  assert("fixer: 10 of 12 now ISO, the two 26-xx-xx left as written",
    col.filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)).length === 10 && col.filter((v) => /^\d{2}-\d{2}-\d{2}$/.test(v)).length === 2);
  assert("fixer reports the left-alone dates as skipped (date_ambiguous)",
    res.skipped.some((s) => s.code === "date_ambiguous" && s.column === "계약일"));

  // Excel: date cells in the locale short-date format come out ISO, not "10/22/26"
  const XLSX = (await import("xlsx")).default;
  const os = await import("os"), path = await import("path");
  const ws = XLSX.utils.aoa_to_sheet([["가입일", "표시형식"], [new Date(Date.UTC(2026, 9, 22)), new Date(Date.UTC(2026, 9, 22))],
    [new Date(Date.UTC(2024, 1, 29)), new Date(Date.UTC(2024, 1, 29))]], { cellDates: true });
  ws.B2.z = ws.B3.z = 'yyyy"년" m"월" d"일"';
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "s");
  const tmp = path.join(os.tmpdir(), `dataready-dates-${process.pid}.xlsx`);
  fs.writeFileSync(tmp, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const xp = parseFile(tmp); fs.unlinkSync(tmp);
  assert(`Excel short-date cells → ISO (${xp.rows.map((x) => x["가입일"]).join(", ")})`,
    xp.rows[0]["가입일"] === "2026-10-22" && xp.rows[1]["가입일"] === "2024-02-29");
  assert(`Excel cells with their own format keep it (${xp.rows[0]["표시형식"]})`, xp.rows[0]["표시형식"] === "2026년 10월 22일");
}

// ---------- (15) UNITS + HINTS — "1.2만원" is a number with a unit; hints quote the column's own text ----------
console.log("\n" + "=".repeat(64));
console.log("(15) UNITS & HINTS — numbers with units; no canned \"thirty\" under the wrong column");
console.log("=".repeat(64));
{
  const assert = (name, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}`); if (!ok) failures++; };
  const { rows, columns } = parseFile("test-data/kr_dates.csv");
  const r = scoreDataset(rows, columns);
  assert("금액: number_with_unit fact (1,234원 / 1.2만원 / 3억)",
    r.issues.some((i) => i.code === "number_with_unit" && i.column === "금액" && i.evidence === "with_unit=3/12"));
  assert("…and not double-reported as numeric_text_mix", !r.issues.some((i) => i.code === "numeric_text_mix" && i.column === "금액"));
  assert("fixer leaves units alone (which unit plain numbers are in is a judgment)",
    fixDataset(rows, columns).skipped.some((s) => s.code === "number_with_unit"));
  const prose = Array.from({ length: 10 }, (_, i) => ({ "인원": i < 3 ? "약 30명 내외" : String(20 + i) }));
  assert("prose like '약 30명 내외' is not a unit-number (still numeric_text_mix)",
    scoreDataset(prose, ["인원"]).issues.some((i) => i.code === "numeric_text_mix"));

  // a phone column written with and without dashes is not "numbers mixed with words"
  const ph = Array.from({ length: 10 }, (_, i) => ({ "전화번호": i % 2 ? `0101234${String(5000 + i)}` : `010-1234-${5000 + i}` }));
  const rp = scoreDataset(ph, ["전화번호"]);
  assert("no numeric_text_mix on a PII (phone) column", rp.columnStats["전화번호"].piiType === "phone" &&
    !rp.issues.some((i) => i.code === "numeric_text_mix"));
  const mix = Array.from({ length: 10 }, (_, i) => ({ qty: i < 3 ? "N/A-ish" : String(i) }));
  const fm = fixDataset(mix, ["qty"]);
  const why = fm.skipped.find((s) => s.code === "numeric_text_mix")?.reason || "";
  assert("skip reason quotes the column's own text, not a canned \"thirty\"", why.includes("N/A-ish") && !why.includes("thirty"));
}

console.log("\n" + (failures === 0
  ? "ALL VALIDATIONS PASSED ✓"
  : `${failures} VALIDATION(S) FAILED ✗`));
process.exit(failures === 0 ? 0 : 1);
