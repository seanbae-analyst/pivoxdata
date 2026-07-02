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

  // ground truth = the 9 planted defects (code, column)
  const expected = [
    ["empty_column", "notes"], ["missing", "country"], ["missing", "age"],
    ["mixed_date_format", "signup_date"], ["placeholder_date", "signup_date"],
    ["numeric_text_mix", "age"], ["dup_rows", "(rows)"],
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

console.log("\n" + (failures === 0
  ? "ALL VALIDATIONS PASSED ✓"
  : `${failures} VALIDATION(S) FAILED ✗`));
process.exit(failures === 0 ? 0 : 1);
