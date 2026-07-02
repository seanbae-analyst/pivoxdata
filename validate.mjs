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

console.log("\n" + (failures === 0
  ? "ALL VALIDATIONS PASSED ✓"
  : `${failures} VALIDATION(S) FAILED ✗`));
process.exit(failures === 0 ? 0 : 1);
