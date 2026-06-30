// cli.mjs — score any CSV/Excel file from the terminal (same scorer the app uses).
//   node cli.mjs <file.csv|file.xlsx>
import { parseFile } from "./parse.mjs";
import { scoreDataset } from "./scorer.mjs";

const path = process.argv[2];
if (!path) { console.error("usage: node cli.mjs <file.csv|file.xlsx>"); process.exit(2); }

const { rows, columns } = parseFile(path);
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
