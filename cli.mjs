// cli.mjs — score (and optionally fix) any CSV/Excel file from the terminal.
//   node cli.mjs <file.csv|file.xlsx>            score only
//   node cli.mjs <file.csv> --fix [out.csv]      score, apply mechanical fixes,
//                                                write cleaned CSV, re-score
import fs from "fs";
import Papa from "papaparse";
import { parseFile } from "./parse.mjs";
import { scoreDataset } from "./scorer.mjs";
import { fixDataset } from "./fixer.mjs";

const path = process.argv[2];
if (!path) { console.error("usage: node cli.mjs <file.csv|file.xlsx> [--fix [out.csv]]"); process.exit(2); }

let rows, columns;
try {
  ({ rows, columns } = parseFile(path));
} catch (err) {
  const code = err && err.code;
  if (code === "ENOENT") console.error(`error: file not found — ${path}`);
  else if (code === "EACCES") console.error(`error: permission denied — ${path}`);
  else if (/zip|central directory|unsupported/i.test(err.message || "")) console.error(`error: could not read "${path}" — the file looks corrupt or is not a valid CSV/Excel file.`);
  else console.error(`error: could not read "${path}" — ${err.message}`);
  process.exit(1);
}
const r = scoreDataset(rows, columns);

const bar = (s) => "█".repeat(Math.round(s / 5)).padEnd(20, "·");
console.log(`\nDataReady score: ${r.score}/100   (${r.rowCount.toLocaleString()} rows × ${r.columnCount} cols)\n`);
for (const [k, d] of Object.entries(r.dimensions)) {
  console.log(`  ${k.padEnd(13)} ${bar(d.score)} ${d.score}/100  (weight ${d.weight})`);
}
console.log(`\n${r.issues.length} issues (each a verifiable FACT; the score is a judgment on top):\n`);
for (const i of r.issues) {
  console.log(`  [${i.severity.toUpperCase().padEnd(6)}] ${i.dimension}/${i.code}  ${i.message}`);
}
console.log();

// ---- optional mechanical fix pass ----
const fixIdx = process.argv.indexOf("--fix");
if (fixIdx > -1) {
  const argOut = process.argv[fixIdx + 1];
  const outPath = argOut && !argOut.startsWith("--")
    ? argOut
    : path.replace(/\.(csv|xlsx|xls)$/i, "") + ".cleaned.csv";

  const res = fixDataset(rows, columns);
  const after = scoreDataset(res.rows, res.columns);

  console.log(`FIX — mechanical only (nothing guessed):\n`);
  for (const f of res.fixes) console.log(`  ✓ ${f.message}`);
  for (const s of res.skipped) console.log(`  ○ ${s.reason}`);

  const csv = Papa.unparse({ fields: res.columns, data: res.rows.map((row) => res.columns.map((c) => row[c] ?? "")) });
  fs.writeFileSync(outPath, csv + "\n");

  console.log(`\n  score ${res.before.score} → ${after.score}   rows ${rows.length} → ${res.rows.length}   cols ${columns.length} → ${res.columns.length}`);
  console.log(`  wrote ${outPath}\n`);
}
