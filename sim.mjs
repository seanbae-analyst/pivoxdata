// sim.mjs — large-scale simulation harness for the DataReady scorer.
//
// The scorer is a pure function, so we can run thousands of synthetic datasets
// through it in seconds — far more coverage than hand-written fixtures. Four suites:
//   A. Monte Carlo   — N random datasets with KNOWN planted defects → recall + precision
//   B. Edge cases    — pathological inputs (0 rows, all-empty, unicode…) → no crash, sane output
//   C. PII traps     — confusable numeric columns (ids, zips, coords…) → false-positive rate
//   D. Performance   — scoring throughput as rows scale
//
// Deterministic: a seeded PRNG makes every run reproducible (seed via `node sim.mjs <seed> <N>`).
import { scoreDataset } from "./scorer.mjs";
import fs from "fs";

// ---- seeded PRNG (mulberry32) — reproducible, no Math.random ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.argv[2] || 1234);
const N = Number(process.argv[3] || 5000);
let rng = mulberry32(SEED);
const rand = () => rng();
const randint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

// ---- value generators ----
const FIRST = ["Kim", "Lee", "Park", "Sarah", "Tom", "Wei", "Yuki", "Noah", "Mia", "Liam", "Sofia", "Ava"];
const LAST = ["Min", "Lee", "Brown", "Wei", "Tanaka", "Garcia", "Lopez", "Moore", "White", "Cho", "Han"];
const COUNTRIES = ["USA", "Korea", "China", "Japan", "UK", "France", "Spain", "Canada", "Mexico", "Germany"];
const CUISINES = ["Korean", "Italian", "Thai", "Cafe", "Bakery", "Pizza", "Sushi", "BBQ", "Vegan"];
const SENTINELS = ["N/A", "NULL", "-", "--", "unknown", "TBD", "#N/A", "na"];

const genName = () => `${pick(FIRST)} ${pick(LAST)}`;
const genEmail = (i) => `${pick(FIRST).toLowerCase()}.${i}@${pick(["gmail.com", "outlook.com", "naver.com", "163.com"])}`;
// realistic formatted phones, always ≥10 digits (NANP 10, or +country 11–13)
const genPhoneFormatted = () => pick([
  () => `(${randint(200, 989)}) ${randint(200, 999)}-${randint(1000, 9999)}`,   // (212) 555-1234 → 10
  () => `${randint(200, 989)}-${randint(200, 999)}-${randint(1000, 9999)}`,      // 917-555-1234   → 10
  () => `+1 ${randint(200, 989)} ${randint(200, 999)} ${randint(1000, 9999)}`,   // +1 …          → 11
  () => `+82 10 ${randint(1000, 9999)} ${randint(1000, 9999)}`,                  // +82 10 …      → 12
])();
const genPhone10 = () => `${randint(2, 9)}${String(randint(0, 999999999)).padStart(9, "0")}`; // bare 10-digit
const genISO = () => `20${randint(10, 23)}-${String(randint(1, 12)).padStart(2, "0")}-${String(randint(1, 28)).padStart(2, "0")}`;
const genUS = () => `${String(randint(1, 12)).padStart(2, "0")}/${String(randint(1, 28)).padStart(2, "0")}/20${randint(10, 23)}`;
const genLong = () => `${pick(["March", "July", "May", "September"])} ${randint(1, 28)}, 20${randint(10, 23)}`;

// A "clean column spec" the scorer should NOT flag. key->generator.
const CLEAN_COLS = {
  // non-numeric, non-PII text → never flagged
  name: { gen: genName, numeric: false },
  country: { gen: () => pick(COUNTRIES), numeric: false },
  cuisine: { gen: () => pick(CUISINES), numeric: false },
  // reference-style id (FK): pool of 3 values, so with n≥6 rows uniqueness is pigeonholed
  // to ≤50% — always far below the 90% gate; the dup_id detector must NEVER fire on it
  // (built-in negative test on every dataset that draws this column)
  account_id: { gen: () => `A${randint(1, 3)}`, numeric: false },
  // fully numeric (numFrac ~1.0 → no numeric_text_mix; widths chosen to avoid phone collision)
  amount: { gen: () => String(randint(1, 9999)), numeric: true },
  zip: { gen: () => String(randint(10000, 99999)), numeric: true },      // 5 digits, not phone
  year: { gen: () => String(randint(1990, 2025)), numeric: true },        // 4 digits
  count: { gen: () => String(randint(0, 500)), numeric: true },
};

// Procedurally build one dataset + its ground-truth set of expected (family:column) flags.
function genDataset() {
  const n = randint(6, 120);
  const expected = new Set();
  const cols = [];

  // always a unique non-numeric row id → rows are unique unless we plant dups; never PII
  cols.push({ name: "row_id", gen: (i) => `R${String(i).padStart(5, "0")}`, numeric: false });

  // 2–4 clean columns
  const cleanKeys = Object.keys(CLEAN_COLS);
  const nClean = randint(2, 4);
  const used = new Set();
  for (let k = 0; k < nClean; k++) {
    let key = pick(cleanKeys);
    while (used.has(key)) key = pick(cleanKeys);
    used.add(key);
    cols.push({ name: key, ...CLEAN_COLS[key] });
  }

  // plant a random subset of defects, each on its own dedicated column
  const defects = [];
  if (chance(0.5)) defects.push("empty_column");
  if (chance(0.55)) defects.push("missing");
  if (chance(0.4)) defects.push("sentinel");
  if (chance(0.45)) defects.push("numeric_text_mix");
  if (chance(0.45)) defects.push("mixed_date");
  if (chance(0.4)) defects.push("placeholder_date");
  if (chance(0.55)) defects.push("pii_email");
  if (chance(0.5)) defects.push("pii_phone");
  // dup_id needs n≥20 so a planted duplicate can't drag uniqueness under the 90% gate
  const plantDupId = n >= 20 && chance(0.4);
  if (plantDupId) defects.push("dup_id");
  let plantDups = chance(0.4);

  const colDefs = {};
  for (const d of defects) {
    const cn = d === "dup_id" ? "order_id" : d + "_col";   // detector is name-gated: last token must be an id token
    cols.push({ name: cn });
    colDefs[cn] = d;
  }

  // materialize rows
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const c of cols) {
      if (c.gen) { r[c.name] = c.gen(i); continue; }
      const d = colDefs[c.name];
      r[c.name] = ""; // default; filled per-defect below
    }
    rows.push(r);
  }

  // apply each defect with the right shape + a count guaranteed to clear the scorer's
  // detection threshold (so "recall" measures detection, not random sub-threshold sparsity).
  // non-defect text uses only NON-sentinel words, so no column gets an unrecorded flag.
  const MIX_WORDS = ["thirty", "twenty", "forty", "many", "several", "dozens"]; // none are sentinel tokens
  for (const [cn, d] of Object.entries(colDefs)) {
    if (d === "empty_column") {
      for (const r of rows) r[cn] = "";
      expected.add(`completeness:${cn}`);
    } else if (d === "missing") {
      const k = Math.max(2, Math.ceil(0.3 * n));              // ≥30% blank → guaranteed ≥0.2 threshold
      for (let i = 0; i < n; i++) rows[i][cn] = i < k ? "" : pick(COUNTRIES);
      expected.add(`completeness:${cn}`);
    } else if (d === "sentinel") {
      const k = Math.max(3, Math.ceil(0.12 * n));             // sentinel tokens, missing stays 0
      for (let i = 0; i < n; i++) rows[i][cn] = i < k ? pick(SENTINELS) : pick(CUISINES);
      expected.add(`sentinel:${cn}`);
    } else if (d === "numeric_text_mix") {
      const k = Math.max(2, Math.floor(0.3 * n));             // 30% words → numFrac ~0.7 ∈ (0.1,0.9)
      for (let i = 0; i < n; i++) rows[i][cn] = i < k ? pick(MIX_WORDS) : String(randint(1, 99));
      expected.add(`numeric_text_mix:${cn}`);
    } else if (d === "mixed_date") {
      for (let i = 0; i < n; i++) rows[i][cn] = pick([genISO, genUS, genLong])();
      rows[0][cn] = genISO(); rows[1 % n][cn] = genUS(); rows[2 % n][cn] = genLong(); // ≥2 shapes guaranteed
      expected.add(`mixed_date:${cn}`);
    } else if (d === "placeholder_date") {
      const k = Math.max(2, Math.ceil(0.15 * n));             // ≥2 placeholder dates; rest single-shape ISO
      for (let i = 0; i < n; i++) rows[i][cn] = i < k ? "1900-01-01" : genISO();
      expected.add(`placeholder_date:${cn}`);
    } else if (d === "pii_email") {
      for (let i = 0; i < n; i++) rows[i][cn] = genEmail(i);
      expected.add(`pii:${cn}`);
    } else if (d === "pii_phone") {
      const fmt = chance(0.5) ? genPhoneFormatted : genPhone10;
      for (let i = 0; i < n; i++) rows[i][cn] = fmt();
      expected.add(`pii:${cn}`);
    } else if (d === "dup_id") {
      // near-unique key with k leaked duplicate values (k ≈ 3% of n, so ≥97% unique
      // before row-dup planting — comfortably above the documented 90% gate)
      const k = Math.max(1, Math.floor(n * 0.03));
      for (let i = 0; i < n; i++) rows[i][cn] = `O${String(i).padStart(6, "0")}`;
      for (let j = 0; j < k; j++) rows[n - 1 - j][cn] = rows[j][cn];
      // expected is finalized below — whole-row dup planting can move the ratio
    }
  }

  let rowDups = 0;
  if (plantDups) {
    // when a dup_id column is present, cap row dups at 4% so the planted key column
    // stays above the 90% uniqueness gate: (n−0.03n)/(n+0.04n) ≈ 0.93
    rowDups = randint(1, Math.max(1, Math.floor(n * (plantDupId ? 0.04 : 0.1))));
    for (let k = 0; k < rowDups; k++) rows.push({ ...rows[randint(0, n - 1)] });
    expected.add(`dup_rows:(rows)`);
  }

  // dup_id ground truth mirrors the detector's DOCUMENTED contract (≥90% unique),
  // computed from the known plant counts — duplicated rows also duplicate id values.
  if (plantDupId) {
    const kDup = Math.max(1, Math.floor(n * 0.03));
    if ((n - kDup) / (n + rowDups) >= 0.9) expected.add(`dup_id:order_id`);
  }
  // row-dup planting duplicates row_id too — a genuinely correct dup_id flag there
  // whenever row_id stays ≥90% unique (small datasets fall under the gate and stay silent)
  if (plantDups && n / (n + rowDups) >= 0.9) expected.add(`dup_id:row_id`);

  return { rows, columns: cols.map((c) => c.name), expected };
}

// map a scorer issue → its ground-truth family key
function familyKey(issue) {
  const c = issue.code, col = issue.column;
  if (["empty_column", "high_missing", "missing"].includes(c)) return `completeness:${col}`;
  if (c === "sentinel") return `sentinel:${col}`;
  if (c === "numeric_text_mix") return `numeric_text_mix:${col}`;
  if (c === "mixed_date_format") return `mixed_date:${col}`;
  if (c === "placeholder_date") return `placeholder_date:${col}`;
  if (c === "dup_rows") return `dup_rows:(rows)`;
  if (c === "dup_id") return `dup_id:${col}`;
  if (c === "pii") return `pii:${col}`;
  return `other:${col}`;
}

// ============================ A. MONTE CARLO ============================
function suiteMonteCarlo() {
  let plantedTotal = 0, caught = 0, flaggedTotal = 0, falsePos = 0;
  let crashes = 0, perfectDatasets = 0;
  const fpByCode = {};
  const missed = [];
  for (let i = 0; i < N; i++) {
    const ds = genDataset();
    let r;
    try { r = scoreDataset(ds.rows, ds.columns); }
    catch (e) { crashes++; continue; }
    const flagged = new Set(r.issues.map(familyKey));
    plantedTotal += ds.expected.size;
    for (const k of ds.expected) {
      if (flagged.has(k)) caught++;
      else if (process.env.DEBUG_MISS && missed.length < 20) missed.push({ k, n: ds.rows.length });
    }
    flaggedTotal += r.issues.length;
    let dsFP = 0;
    for (const iss of r.issues) {
      const k = familyKey(iss);
      if (!ds.expected.has(k)) { falsePos++; dsFP++; fpByCode[iss.code] = (fpByCode[iss.code] || 0) + 1; }
    }
    if (caught && dsFP === 0) {/* noop */}
    if (dsFP === 0 && [...ds.expected].every((k) => flagged.has(k))) perfectDatasets++;
    if (typeof r.score !== "number" || r.score < 0 || r.score > 100) crashes++;
  }
  return {
    datasets: N, crashes,
    recall: caught / plantedTotal,
    precision: (flaggedTotal - falsePos) / flaggedTotal,
    plantedTotal, caught, flaggedTotal, falsePos, perfectDatasets, fpByCode, missed,
  };
}

// ============================ B. EDGE CASES ============================
function suiteEdgeCases() {
  const cases = [
    ["0 rows", [], []],
    ["1 row, 1 col", [{ a: "x" }], ["a"]],
    ["all-empty single col", [{ a: "" }, { a: "" }, { a: "" }], ["a"]],
    ["all rows identical (dups)", Array.from({ length: 10 }, () => ({ a: "1", b: "x" })), ["a", "b"]],
    ["unicode + Korean headers", [{ "이름": "배상현", "값": "100" }, { "이름": "김민준", "값": "200" }], ["이름", "값"]],
    ["emoji values", [{ a: "🎉", b: "🚀" }, { a: "🔥", b: "💯" }], ["a", "b"]],
    ["very long strings", [{ a: "z".repeat(5000) }, { a: "y".repeat(5000) }], ["a"]],
    ["null/undefined values", [{ a: null, b: undefined }, { a: null, b: "x" }], ["a", "b"]],
    ["numbers as numbers (not strings)", [{ a: 1, b: 2.5 }, { a: 3, b: 4.1 }], ["a", "b"]],
    ["negative + scientific", [{ a: "-3.2e5" }, { a: "1.1e-9" }, { a: "-42" }], ["a"]],
    ["whitespace-only values", [{ a: "   " }, { a: "\t" }, { a: "x" }], ["a"]],
    ["columns param empty (infer)", [{ a: "1", b: "2" }], []],
    ["single PII phone col only", Array.from({ length: 8 }, (_, i) => ({ p: `212-555-${1000 + i}` })), ["p"]],
    ["mixed null + sentinel", [{ a: "N/A" }, { a: null }, { a: "x" }, { a: "y" }], ["a"]],
    ["wide: 60 columns", [Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`c${i}`, String(i)]))], null],
    ["1 col all 1900 dates", Array.from({ length: 10 }, () => ({ d: "1900-01-01" })), ["d"]],
  ];
  const results = [];
  for (const [name, rows, cols] of cases) {
    let ok = true, note = "";
    try {
      const c = cols === null ? Object.keys(rows[0] || {}) : cols;
      const r = scoreDataset(rows, c);
      if (typeof r.score !== "number" || r.score < 0 || r.score > 100 || Number.isNaN(r.score)) { ok = false; note = `bad score=${r.score}`; }
      if (!Array.isArray(r.issues)) { ok = false; note = "issues not array"; }
      note = note || `score=${r.score}, issues=${r.issues.length}`;
    } catch (e) { ok = false; note = `THREW: ${e.message}`; }
    results.push({ name, ok, note });
  }
  return results;
}

// ============================ C. PII TRAP BATTERY ============================
// confusable numeric columns that must NOT be flagged as PII (except the documented residual).
function suitePIITraps() {
  const NN = 200;
  const traps = {
    "sequential_id (8-digit)": () => String(50000000 + randint(0, 9999999)),
    "zip5": () => String(randint(10000, 99999)),
    "year": () => String(randint(1990, 2025)),
    "price_usd": () => (randint(1, 99999) / 100).toFixed(2),
    "latitude": () => (40 + rand()).toFixed(12),
    "longitude": () => (-(73 + rand())).toFixed(12),
    "percentage": () => (rand() * 100).toFixed(1),
    "small_int": () => String(randint(0, 999)),
    "bin (7-digit)": () => String(1000000 + randint(0, 8999999)),
    "REAL_phone (10-digit)": genPhone10,            // SHOULD be flagged (true positive)
    "REAL_email": (i) => genEmail(i),               // SHOULD be flagged (true positive)
    "bare_10digit_id (bbl-like)": () => String(1000000000 + randint(0, 8999999999)), // KNOWN residual
  };
  const out = [];
  for (const [name, gen] of Object.entries(traps)) {
    const rows = Array.from({ length: NN }, (_, i) => ({ row_id: `R${i}`, [name]: gen(i) }));
    const r = scoreDataset(rows, ["row_id", name]);
    const piiHit = r.issues.find((x) => x.code === "pii" && x.column === name);
    const shouldFlag = name.startsWith("REAL_");
    const residual = name.startsWith("bare_10digit");
    out.push({ name, flagged: !!piiHit, shouldFlag, residual, as: piiHit ? piiHit.message.match(/\((\w+)\)/)?.[1] : null });
  }
  return out;
}

// ============================ D. PERFORMANCE ============================
function suitePerf() {
  const sizes = [1000, 10000, 50000, 100000];
  const out = [];
  for (const sz of sizes) {
    const rows = Array.from({ length: sz }, (_, i) => ({
      id: `R${i}`, name: genName(), email: genEmail(i), phone: genPhone10(),
      country: pick(COUNTRIES), date: chance(0.3) ? genUS() : genISO(),
      score: chance(0.1) ? "" : String(randint(0, 100)),
    }));
    const cols = Object.keys(rows[0]);
    const t0 = process.hrtime.bigint();
    const r = scoreDataset(rows, cols);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    out.push({ rows: sz, ms: Math.round(ms), rowsPerSec: Math.round(sz / (ms / 1000)), score: r.score, issues: r.issues.length });
  }
  return out;
}

// ============================ RUN ============================
const pct = (x) => (x * 100).toFixed(2) + "%";
console.log(`\nDataReady — simulation harness   (seed=${SEED}, N=${N})\n${"=".repeat(64)}`);

const mc = suiteMonteCarlo();
console.log(`\nA. MONTE CARLO — ${mc.datasets.toLocaleString()} random datasets`);
console.log(`   planted defects : ${mc.plantedTotal.toLocaleString()}   caught: ${mc.caught.toLocaleString()}`);
console.log(`   RECALL          : ${pct(mc.recall)}   (planted defects the scorer caught)`);
console.log(`   PRECISION       : ${pct(mc.precision)}   (flags that were real, ${mc.falsePos} false / ${mc.flaggedTotal.toLocaleString()})`);
console.log(`   clean datasets  : ${mc.perfectDatasets.toLocaleString()}/${mc.datasets.toLocaleString()} perfect (all caught, 0 false)`);
console.log(`   crashes / bad scores : ${mc.crashes}`);
if (Object.keys(mc.fpByCode).length) console.log(`   false-positive codes : ${JSON.stringify(mc.fpByCode)}`);
if (process.env.DEBUG_MISS && mc.missed.length) console.log(`   missed (sample): ${JSON.stringify(mc.missed)}`);

const edge = suiteEdgeCases();
const edgePass = edge.filter((e) => e.ok).length;
console.log(`\nB. EDGE CASES — ${edgePass}/${edge.length} survived (no crash, sane output)`);
for (const e of edge) console.log(`   ${e.ok ? "✓" : "✗ FAIL"}  ${e.name.padEnd(34)} ${e.note}`);

const traps = suitePIITraps();
const trapFP = traps.filter((t) => t.flagged && !t.shouldFlag && !t.residual);
const trapResidual = traps.filter((t) => t.flagged && t.residual);
const trapMissedTP = traps.filter((t) => !t.flagged && t.shouldFlag);
console.log(`\nC. PII TRAP BATTERY — ${traps.length} confusable columns`);
for (const t of traps) {
  const verdict = t.shouldFlag ? (t.flagged ? "✓ flagged (true positive)" : "✗ MISSED true positive")
    : t.residual ? (t.flagged ? "△ residual (documented bbl-shape collision)" : "✓ not flagged")
    : (t.flagged ? `✗ FALSE POSITIVE (as ${t.as})` : "✓ not flagged");
  console.log(`   ${t.name.padEnd(30)} ${verdict}`);
}
console.log(`   → unsolved false positives: ${trapFP.length}   missed true positives: ${trapMissedTP.length}   documented residuals: ${trapResidual.length}`);

const perf = suitePerf();
console.log(`\nD. PERFORMANCE`);
for (const p of perf) console.log(`   ${String(p.rows).padStart(7)} rows → ${String(p.ms).padStart(5)} ms   (${p.rowsPerSec.toLocaleString()} rows/s)  score=${p.score} issues=${p.issues}`);

// ---- verdict ----
const okAll = mc.crashes === 0 && mc.recall >= 0.999 && trapFP.length === 0 && trapMissedTP.length === 0 && edgePass === edge.length;
console.log(`\n${"=".repeat(64)}`);
console.log(okAll ? "ALL SIMULATIONS PASSED ✓" : "SOME SIMULATIONS FLAGGED ISSUES ✗ (see above)");
console.log("");

// write a portfolio artifact
if (process.argv.includes("--report")) {
  const md = `# Simulation report — DataReady scorer

> Generated by \`node sim.mjs ${SEED} ${N} --report\` (deterministic, seed=${SEED}).

## A. Monte Carlo — ${mc.datasets.toLocaleString()} random datasets
- **Recall: ${pct(mc.recall)}** — ${mc.caught.toLocaleString()} of ${mc.plantedTotal.toLocaleString()} planted defects caught.
- **Precision: ${pct(mc.precision)}** — ${mc.falsePos} false positives across ${mc.flaggedTotal.toLocaleString()} flags.
- ${mc.perfectDatasets.toLocaleString()}/${mc.datasets.toLocaleString()} datasets scored perfectly (every planted defect caught, zero false). Crashes: ${mc.crashes}.

## B. Edge cases — ${edgePass}/${edge.length} survived
${edge.map((e) => `- ${e.ok ? "✓" : "✗"} ${e.name} — ${e.note}`).join("\n")}

## C. PII trap battery — ${traps.length} confusable columns
${traps.map((t) => `- ${t.name}: ${t.shouldFlag ? (t.flagged ? "✓ flagged (true positive)" : "✗ missed") : t.residual ? (t.flagged ? "△ documented residual" : "not flagged") : (t.flagged ? `✗ false positive (${t.as})` : "✓ not flagged")}`).join("\n")}

Unsolved false positives: **${trapFP.length}**. Missed true positives: **${trapMissedTP.length}**. Documented residuals (bbl 10-digit shape collision): **${trapResidual.length}**.

## D. Performance
| rows | time | throughput | score |
|---|---|---|---|
${perf.map((p) => `| ${p.rows.toLocaleString()} | ${p.ms} ms | ${p.rowsPerSec.toLocaleString()} rows/s | ${p.score} |`).join("\n")}

**Verdict: ${okAll ? "ALL SIMULATIONS PASSED ✓" : "issues flagged — see above"}**
`;
  fs.writeFileSync("SIMULATION.md", md);
  console.log("wrote SIMULATION.md");
}

process.exit(okAll ? 0 : 1);
